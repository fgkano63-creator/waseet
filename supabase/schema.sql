-- ==============================================================================
-- WASEET Platform - مخطط قاعدة البيانات المتكامل (schema.sql)
-- ==============================================================================
-- هذا الملف يحتوي على المخطط الشامل لكافة جداول وصلاحيات وسياسات منصة وسيط (WASEET):
-- 1. profiles: ملفات المستخدمين المرتبطة بـ Supabase Auth
-- 2. marketplace_accounts: حسابات الألعاب المعروضة للبيع في المتجر
-- 3. deals: صفقات الوساطة المالية ثلاثية الأطراف (مشتري + بائع + وسيط)
-- 4. deal_messages: رسائل المحادثات الفورية المشفرة والمقيدة بالقنوات
-- 5. wallet_transactions: سجل الحركات المالية والشحن وسحب الرصيد
-- 
-- معايير الأمان المطبقة:
-- - تفعيل RLS على كل جدول دون استثناء.
-- - منع كامل لسياسات using (true) أو with check (true) على البيانات الحساسة.
-- - عزل قنوات المحادثة (المشتري لا يرى محادثة البائع مع الوسيط والعكس).
-- - سحب أذونات anon من الجداول الحساسة، وقصر التعديلات المالية على service_role.
-- - المشغلات الآمنة (Security Definer) لمنع التلاعب بالرتب والأرصدة.
-- ==============================================================================

-- تفعيل ملحق التشفير وتوليد المعرفات إن لم يكن مفعلاً
create extension if not exists "uuid-ossp";

-- ==============================================================================
-- 1. دوال الأمان المساعدة (Helper Functions)
-- ==============================================================================

-- دالة فحص رتبة المدير (SECURITY DEFINER لتفادي التكرار اللانهائي في RLS)
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

-- ==============================================================================
-- 2. جدول ملفات المستخدمين (profiles)
-- ==============================================================================
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

-- ضبط أذونات profiles
revoke all on table public.profiles from anon;
grant select on table public.profiles to authenticated;
grant update (name, avatar_url) on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- تفعيل RLS
alter table public.profiles enable row level security;

-- سياسات RLS لجدول profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select to authenticated
using (
  auth.uid() = id or public.is_admin()
);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update to authenticated
using (
  auth.uid() = id and not public.is_admin()
)
with check (
  auth.uid() = id
);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

-- مشغل منع تزوير الحقول الحساسة (Role & Wallet Tampering Defense)
create or replace function public.prevent_profile_field_tampering()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- مشغل إنشاء البروفايل التلقائي عند أول تسجيل دخول بـ Google
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_initial_role text := 'user';
begin
  if lower(coalesce(new.email, '')) = 'fgkano63@gmail.com' then
    v_initial_role := 'admin';
  end if;

  insert into public.profiles (id, email, name, avatar_url, role, wallet_balance)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    v_initial_role,
    0
  )
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(excluded.name, profiles.name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    role = case when lower(excluded.email) = 'fgkano63@gmail.com' then 'admin' else profiles.role end,
    updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ==============================================================================
-- 3. جدول حسابات المتجر (marketplace_accounts)
-- ==============================================================================
create table if not exists public.marketplace_accounts (
    id uuid primary key default gen_random_uuid(),
    account_number serial unique,
    seller_id uuid not null references public.profiles(id) on delete cascade,
    game text not null check (game in ('free_fire', 'pubg', 'other')),
    title text not null,
    level integer default 1 check (level >= 1),
    prime_level integer default 0 check (prime_level >= 0),
    login_type text not null,
    bind_status text default 'single',
    server text default 'mena',
    seller_price numeric not null check (seller_price > 0),
    images jsonb default '[]'::jsonb,
    details jsonb default '{}'::jsonb,
    status text not null default 'available' check (status in ('available', 'in_deal', 'sold', 'hidden')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ضبط أذونات marketplace_accounts
grant select on table public.marketplace_accounts to anon, authenticated;
grant insert, update, delete on table public.marketplace_accounts to authenticated;
grant all on table public.marketplace_accounts to service_role;

-- تفعيل RLS
alter table public.marketplace_accounts enable row level security;

-- سياسات RLS لحسابات المتجر:
-- القراءة: الحسابات المتاحة يراها الجميع (حتى الزوار لتصفح المتجر)، أو يرى البائع حساباته الخاصة، أو يرى المدير الكل.
drop policy if exists "accounts_select_policy" on public.marketplace_accounts;
create policy "accounts_select_policy"
on public.marketplace_accounts for select
using (
  status = 'available'
  or (auth.uid() is not null and (seller_id = auth.uid() or public.is_admin()))
);

-- الإضافة: المستخدم المسجل يضيف حساباً باسمه كبائع فقط
drop policy if exists "accounts_insert_policy" on public.marketplace_accounts;
create policy "accounts_insert_policy"
on public.marketplace_accounts for insert to authenticated
with check (
  seller_id = auth.uid()
);

-- التعديل: البائع يعدل حسابه الخاص فقط ما دام لم يدخل في صفقة نشطة، أو المدير
drop policy if exists "accounts_update_policy" on public.marketplace_accounts;
create policy "accounts_update_policy"
on public.marketplace_accounts for update to authenticated
using (
  (seller_id = auth.uid() and status in ('available', 'hidden')) or public.is_admin()
)
with check (
  (seller_id = auth.uid() and status in ('available', 'hidden')) or public.is_admin()
);

-- الحذف: البائع يحذف حسابه الخاص إذا كان متاحاً، أو المدير
drop policy if exists "accounts_delete_policy" on public.marketplace_accounts;
create policy "accounts_delete_policy"
on public.marketplace_accounts for delete to authenticated
using (
  (seller_id = auth.uid() and status in ('available', 'hidden')) or public.is_admin()
);


-- ==============================================================================
-- 4. جدول صفقات الوساطة (deals)
-- ==============================================================================
create table if not exists public.deals (
    id text primary key, -- مثل DEAL-1001 أو UUID
    account_id uuid references public.marketplace_accounts(id) on delete set null,
    account_number integer,
    buyer_id uuid not null references public.profiles(id),
    seller_id uuid not null references public.profiles(id),
    seller_price numeric not null check (seller_price >= 0),
    fee numeric not null check (fee >= 0),
    total_points numeric not null check (total_points >= 0),
    status text not null default 'waiting_credentials' 
        check (status in ('waiting_credentials', 'mediator_inspecting', 'buyer_inspecting', 'completed', 'cancelled', 'disputed')),
    current_step integer not null default 1 check (current_step between 1 and 4),
    -- بيانات الدخول المشفرة (لا تُخزن بنص عادي ولا تُعرض مباشرة في الواجهة)
    encrypted_credentials text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ضبط أذونات deals
revoke all on table public.deals from anon;
grant select on table public.deals to authenticated;
grant all on table public.deals to service_role;

-- تفعيل RLS
alter table public.deals enable row level security;

-- سياسات RLS لجدول الصفقات:
-- القراءة: المشتري والبائع الخاصان بالصفقة فقط أو المدير العام
drop policy if exists "deals_select_participants_or_admin" on public.deals;
create policy "deals_select_participants_or_admin"
on public.deals for select to authenticated
using (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
);

-- التعديل والإضافة للصفقات: محصورة بالخادم (service_role عبر Netlify Function) أو المدير لحماية الحسابات المالية والأسعار والعمولة من التلاعب
drop policy if exists "deals_admin_update" on public.deals;
create policy "deals_admin_update"
on public.deals for update to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );


-- ==============================================================================
-- 5. جدول رسائل الشات لصفقات الوساطة (deal_messages)
-- ==============================================================================
create table if not exists public.deal_messages (
    id uuid primary key default gen_random_uuid(),
    deal_id text not null references public.deals(id) on delete cascade,
    sender_id uuid not null references public.profiles(id) on delete cascade,
    -- تحديد قناة الرسالة: محادثة الوسيط مع المشتري، أو الوسيط مع البائع، أو رسائل نظام عامة
    channel_type text not null default 'all' check (channel_type in ('buyer_mediator', 'seller_mediator', 'system', 'all')),
    sender_role text not null check (sender_role in ('buyer', 'seller', 'mediator', 'system')),
    message text not null,
    attachments jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ضبط أذونات deal_messages
revoke all on table public.deal_messages from anon;
grant select, insert on table public.deal_messages to authenticated;
grant all on table public.deal_messages to service_role;

-- تفعيل RLS
alter table public.deal_messages enable row level security;

-- سياسات RLS لرسائل الصفقات (عزل تام للقنوات):
-- القراءة:
-- 1. المشتري يقرأ رسائل صفقته الخاصة في قناة المشتري (buyer_mediator) أو العامة (all / system).
-- 2. البائع يقرأ رسائل صفقته الخاصة في قناة البائع (seller_mediator) أو العامة (all / system).
-- 3. المدير (الوسيط) يقرأ كافة الرسائل في كل القنوات.
drop policy if exists "messages_select_policy" on public.deal_messages;
create policy "messages_select_policy"
on public.deal_messages for select to authenticated
using (
  public.is_admin()
  or (
    exists (
      select 1 from public.deals d
      where d.id = deal_messages.deal_id
        and d.buyer_id = auth.uid()
        and deal_messages.channel_type in ('buyer_mediator', 'all', 'system')
    )
  )
  or (
    exists (
      select 1 from public.deals d
      where d.id = deal_messages.deal_id
        and d.seller_id = auth.uid()
        and deal_messages.channel_type in ('seller_mediator', 'all', 'system')
    )
  )
);

-- الإرسال (INSERT):
-- 1. المشتري يرسل في قناته فقط (buyer_mediator) ولصفقته فقط.
-- 2. البائع يرسل في قناته فقط (seller_mediator) ولصفقته فقط.
-- 3. المدير يرسل في أي قناة للصفقة.
drop policy if exists "messages_insert_policy" on public.deal_messages;
create policy "messages_insert_policy"
on public.deal_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and (
    public.is_admin()
    or (
      exists (
        select 1 from public.deals d
        where d.id = deal_messages.deal_id
          and d.buyer_id = auth.uid()
          and deal_messages.channel_type = 'buyer_mediator'
          and deal_messages.sender_role = 'buyer'
      )
    )
    or (
      exists (
        select 1 from public.deals d
        where d.id = deal_messages.deal_id
          and d.seller_id = auth.uid()
          and deal_messages.channel_type = 'seller_mediator'
          and deal_messages.sender_role = 'seller'
      )
    )
  )
);


-- ==============================================================================
-- 6. جدول سجل الحركات المالية (wallet_transactions)
-- ==============================================================================
create table if not exists public.wallet_transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    deal_id text references public.deals(id) on delete set null,
    amount numeric not null,
    type text not null check (type in ('deposit', 'withdraw', 'escrow_lock', 'escrow_refund', 'payout', 'fee')),
    status text not null default 'completed' check (status in ('pending', 'completed', 'cancelled')),
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ضبط أذونات wallet_transactions
revoke all on table public.wallet_transactions from anon;
grant select on table public.wallet_transactions to authenticated;
grant all on table public.wallet_transactions to service_role;

-- تفعيل RLS
alter table public.wallet_transactions enable row level security;

-- سياسات RLS للحركات المالية:
-- المستخدم يرى حركاته المالية فقط، والمدير يرى سجل الحركات العام
drop policy if exists "transactions_select_policy" on public.wallet_transactions;
create policy "transactions_select_policy"
on public.wallet_transactions for select to authenticated
using (
  user_id = auth.uid() or public.is_admin()
);

-- الإضافة والتعديل للحركات المالية محصورة بالخادم فقط (service_role) عبر دوال التحقق المالي


-- ==============================================================================
-- 7. تفعيل البث اللحظي الفوري (Supabase Realtime)
-- ==============================================================================
-- تفعيل المزامنة اللحظية للرسائل والصفقات لتحديث الشاشات فوراً عند إرسال رسالة
alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.deal_messages;
alter publication supabase_realtime add table public.marketplace_accounts;


-- ==============================================================================
-- 8. ترقية حساب المدير (تُنفّذ لمرة واحدة في Supabase SQL Editor لترقية الحساب بعد التسجيل)
-- ==============================================================================
update public.profiles set role = 'admin' where email = 'fgkano63@gmail.com';
