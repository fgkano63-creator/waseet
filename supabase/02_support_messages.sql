-- ==============================================================================
-- WASEET Platform - حل وإصلاح سياسات الأمان RLS الشامل لنظام المحادثة المباشرة
-- ==============================================================================
-- هذا الاسكربت يعالج كافة أسباب عدم ظهور الرسائل في لوحة تحكم المدير (admin-chats):
-- 1. ترقية وتحديث دالة public.is_admin() لتتعرف على المدير فوراً (بالرتبة والبريد الإلكتروني).
-- 2. ترقية حساب المدير في جدول profiles تلقائياً إلى 'admin'.
-- 3. ضبط سياسات SELECT و INSERT لجدول support_messages لتمكين المدير من رؤية والرد على كافة الرسائل.
-- 4. ضبط سياسة SELECT لجدول profiles لتمكين المدير والمتعاملين من جلب الأسماء والصور الشخصية.
-- 5. تفعيل Supabase Realtime للبث اللحظي للرسائل والملفات الشخصية.
-- ==============================================================================

-- 1. تحديث وترقية دالة فحص صلاحية المدير (SECURITY DEFINER)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'mediator')
  ) or (
    -- التحقق المباشر من البريد الإلكتروني للمدير من جلسة المصادقة Auth
    lower(coalesce(auth.jwt() ->> 'email', '')) in ('fgkano63@gmail.com')
  );
$$;

-- منح إذن تنفيذ دالة is_admin لكافة المستخدمين الموثقين
grant execute on function public.is_admin() to authenticated, service_role, anon;

-- 2. ترقية حساب المدير في جدول profiles فوراً
update public.profiles
set role = 'admin'
where lower(email) in ('fgkano63@gmail.com')
   or id = auth.uid();

-- 3. التأكد من وجود جدول support_messages مع الفهارس المناسبة
create table if not exists public.support_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    sender_role text not null check (sender_role in ('user', 'admin')),
    message text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_support_messages_user_created 
on public.support_messages(user_id, created_at asc);

-- ضبط أذونات الجدول
grant select, insert, update, delete on table public.support_messages to authenticated;
grant all on table public.support_messages to service_role;

-- تفعيل RLS على support_messages
alter table public.support_messages enable row level security;

-- أ. سياسة SELECT لجدول support_messages:
-- المدير (is_admin()) يرى كافة الرسائل لجميع المستخدمين.
-- المستخدم العادي يرى رسائله فقط (auth.uid() = user_id).
drop policy if exists "support_messages_select_policy" on public.support_messages;
create policy "support_messages_select_policy"
on public.support_messages for select to authenticated
using (
    public.is_admin() or auth.uid() = user_id
);

-- ب. سياسة INSERT لجدول support_messages:
-- المدير يُرسل لأي مستخدم وبصفة 'admin'.
-- المستخدم العادي يُرسل لنفسه فقط وبصفة 'user'.
drop policy if exists "support_messages_insert_policy" on public.support_messages;
create policy "support_messages_insert_policy"
on public.support_messages for insert to authenticated
with check (
    (public.is_admin() and sender_role = 'admin')
    or
    (auth.uid() = user_id and sender_role = 'user')
);

-- ج. سياسة إدارة الرسائل الكاملة للمدير (تعديل أو حذف)
drop policy if exists "support_messages_admin_manage_policy" on public.support_messages;
create policy "support_messages_admin_manage_policy"
on public.support_messages for all to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

-- 4. سياسة SELECT لجدول profiles (مهمة جداً لظهور الأسماء والصور في لوحة المدير):
-- السماح لكافة المستخدمين الموثقين بقراءة أسماء وصور المتعاملين في المتجر والمحادثات
grant select on table public.profiles to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_policy" on public.profiles;
create policy "profiles_select_policy"
on public.profiles for select to authenticated
using (
    true
);

-- 5. تفعيل البث اللحظي الفوري (Supabase Realtime)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
      and schemaname = 'public' 
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
      and schemaname = 'public' 
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
