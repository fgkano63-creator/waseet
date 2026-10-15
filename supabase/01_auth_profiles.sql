-- ==============================================================================
-- WASEET Platform - المرحلة الأولى: نظام المصادقة وملفات المستخدمين (Auth & Profiles)
-- ==============================================================================
-- هذا الملف يحتوي على هيكل جدول profiles ودوال الأمان وسياسات RLS الصارمة.
-- لا توجد هنا أي سياسة "using (true)" أو "with check (true)" على الإطلاق.
-- الملف آمن لإعادة التشغيل (idempotent): كل سياسة تُحذف أولاً إن وُجدت ثم تُنشأ.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. جدول ملفات المستخدمين (Profiles Table)
-- ------------------------------------------------------------------------------
-- مرتبط بحسابات Supabase Auth الرسمية (auth.users) بحذف متسلسل عند حذف الحساب.
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    name text,
    avatar_url text,
    role text not null default 'user' check (role in ('user', 'admin')),
    wallet_balance numeric not null default 0 check (wallet_balance >= 0),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 2. ضبط أذونات الأدوار (Privileges & Grants)
-- ------------------------------------------------------------------------------
-- سحب كافة الصلاحيات من الدور غير المسجل (anon) لمنع أي قراءة أو كتابة دون تسجيل دخول.
revoke all on table public.profiles from anon;

-- المستخدم المسجّل: قراءة فقط (مقيدة بـ RLS)، وتعديل عمودين فقط: الاسم والصورة.
-- أي محاولة لتعديل role أو wallet_balance أو email من المتصفح تُرفض من Postgres
-- مباشرةً بخطأ "permission denied" قبل الوصول إلى RLS أو الـ Trigger.
grant select on table public.profiles to authenticated;
grant update (name, avatar_url) on table public.profiles to authenticated;

-- دور الخادم (service_role) يُستخدم فقط من SQL Editor ومن Netlify Functions (مفتاحه لا يصل للمتصفح أبداً).
-- يحتاج صلاحيات كاملة لتعديل الرصيد والرتب من الخادم لاحقاً.
grant all on table public.profiles to service_role;

-- ------------------------------------------------------------------------------
-- 3. دالة فحص رتبة المدير (is_admin Helper Function)
-- ------------------------------------------------------------------------------
-- تعمل بصلاحيات SECURITY DEFINER وبمسار بحث مغلق لتفادي التكرار اللانهائي في RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ------------------------------------------------------------------------------
-- 4. تفعيل أمان مستوى الصفوف (Row Level Security - RLS)
-- ------------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- [سياسة القراءة SELECT]:
-- المستخدم العادي لا يقرأ إلا صف ملفه الشخصي فقط (auth.uid() = id).
-- المدير يملك صلاحية قراءة جميع السجلات لإدارة الصفقات والمستخدمين (public.is_admin()).
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id or public.is_admin()
);

-- [سياسة التعديل للمستخدم العادي UPDATE Self]:
-- المستخدم العادي يعدل فقط صفه الخاص (auth.uid() = id).
-- الأعمدة المسموح بتعديلها محددة مسبقاً في GRANT أعلاه (name, avatar_url فقط).
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (
  auth.uid() = id and not public.is_admin()
)
with check (
  auth.uid() = id
);

-- [سياسة التعديل للمدير UPDATE Admin]:
-- المدير يعدل صفوف المستخدمين، لكن من المتصفح يبقى محصوراً بالأعمدة الممنوحة
-- في GRANT (name, avatar_url). تغيير role أو الرصيد يتم فقط من الخادم (service_role).
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- لا توجد سياسة INSERT ولا DELETE للمستخدمين، فالإضافة محصورة بالـ Trigger أدناه،
-- والحذف يتم تلقائياً فقط عند حذف الحساب من auth.users (on delete cascade).

-- ------------------------------------------------------------------------------
-- 5. صمام أمان إضافي: منع تزوير الحقول الحساسة (Tampering Defense Trigger)
-- ------------------------------------------------------------------------------
-- طبقة دفاع ثانية خلف GRANT. يُنفذ قبل أي تعديل (BEFORE UPDATE).
-- الشرط auth.uid() is not null يعني: الحظر يطبق فقط على طلبات مستخدم مسجّل دخوله
-- من المتصفح. أما التنفيذ من SQL Editor أو من Netlify Function بمفتاح service_role
-- فيكون auth.uid() فارغاً، فيُسمح به (لترقية المدير وتعديل الرصيد من الخادم).
create or replace function public.prevent_profile_field_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role <> old.role then
      raise exception 'أمني: غير مصرح لك بتعديل رتبتك (role)';
    end if;
    if new.wallet_balance <> old.wallet_balance then
      raise exception 'أمني: غير مصرح لك بتعديل الرصيد (wallet_balance) من المتصفح';
    end if;
    if new.id <> old.id then
      raise exception 'أمني: غير مصرح لك بتغيير معرف الحساب';
    end if;
    if new.email <> old.email then
      raise exception 'أمني: غير مصرح لك بتغيير البريد الإلكتروني الأساسي';
    end if;
  end if;

  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists tr_prevent_profile_field_tampering on public.profiles;
create trigger tr_prevent_profile_field_tampering
  before update on public.profiles
  for each row execute function public.prevent_profile_field_tampering();

-- ------------------------------------------------------------------------------
-- 6. مشغّل التسجيل التلقائي (Automatic User Sync Trigger)
-- ------------------------------------------------------------------------------
-- يُستدعى تلقائياً من خادم قاعدة البيانات عند اكتمال مصادقة المستخدم عبر Google OAuth.
-- يُنشئ صف البروفايل تلقائياً بالرتبة الافتراضية 'user' والرصيد '0' حصراً.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url, role, wallet_balance)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    'user',
    0
  )
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(excluded.name, profiles.name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==============================================================================
-- ترقية حساب المدير (تُنفّذ يدوياً لمرة واحدة من SQL Editor بعد أول تسجيل دخول بـ Google)
-- البريد أدناه هو بريد Google الذي أكّده صاحب المشروع.
-- السطر معلّق عمداً (--) حتى لا يُنفذ تلقائياً مع باقي الملف.
-- update public.profiles set role = 'admin' where email = 'fgkano63@gmail.com';
-- ==============================================================================
