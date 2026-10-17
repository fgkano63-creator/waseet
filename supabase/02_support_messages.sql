-- ==============================================================================
-- WASEET Platform - إصلاح سياسات الأمان (RLS) الشامل لجدول رسائل الدعم (support_messages)
-- انسخ هذا الكود بالكامل والصقه في Supabase SQL Editor ثم اضغط Run
-- ==============================================================================

-- 1. تحديث دالة التحقق من المدير public.is_admin() لتشمل البريد الإلكتروني والرتبة
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        role in ('admin', 'mediator')
        or lower(email) in ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
      )
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) in ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');
$$;

grant execute on function public.is_admin() to authenticated, service_role, anon;

-- 2. التأكد من ترقية حساب المدير في جدول profiles إلى 'admin'
update public.profiles
set role = 'admin'
where lower(email) in ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');

-- 3. ضبط الأذونات وتفعيل RLS على جدول support_messages
grant select, insert, update, delete on table public.support_messages to authenticated;
grant all on table public.support_messages to service_role;

alter table public.support_messages enable row level security;

-- حذف السياسات القديمة لمنع أي تعارض
drop policy if exists "support_messages_select_policy" on public.support_messages;
drop policy if exists "support_messages_insert_policy" on public.support_messages;
drop policy if exists "support_messages_admin_manage_policy" on public.support_messages;
drop policy if exists "support_messages_admin_select_all" on public.support_messages;
drop policy if exists "support_messages_admin_insert_all" on public.support_messages;
drop policy if exists "support_messages_admin_update_all" on public.support_messages;
drop policy if exists "support_messages_admin_delete_all" on public.support_messages;
drop policy if exists "support_messages_user_select_own" on public.support_messages;
drop policy if exists "support_messages_user_insert_own" on public.support_messages;

-- ==============================================================================
-- أولاً: سياسات المدير (public.is_admin()) - صلاحيات كاملة لكافة الصفوف بلا استثناء
-- ==============================================================================

-- 1. صلاحية SELECT للمدير (قراءة كافة المحادثات والرسائل)
create policy "support_messages_admin_select_all"
on public.support_messages
for select
to authenticated
using ( public.is_admin() );

-- 2. صلاحية INSERT للمدير (إرسال الردود لأي مستخدم في أي محادثة بلا قيد)
create policy "support_messages_admin_insert_all"
on public.support_messages
for insert
to authenticated
with check ( public.is_admin() );

-- 3. صلاحية UPDATE للمدير (تعديل أي رسالة)
create policy "support_messages_admin_update_all"
on public.support_messages
for update
to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

-- 4. صلاحية DELETE للمدير (حذف أي رسالة)
create policy "support_messages_admin_delete_all"
on public.support_messages
for delete
to authenticated
using ( public.is_admin() );

-- ==============================================================================
-- ثانياً: سياسات المستخدمين العاديين - قراءة وإرسال رسائل محادثاتهم الخاصة فقط
-- ==============================================================================

-- 1. صلاحية SELECT للمستخدم العادي (يرى رسائل محادثته فقط)
create policy "support_messages_user_select_own"
on public.support_messages
for select
to authenticated
using ( auth.uid() = user_id );

-- 2. صلاحية INSERT للمستخدم العادي (يرسل رسائل داخل محادثته الخاصة فقط)
create policy "support_messages_user_insert_own"
on public.support_messages
for insert
to authenticated
with check ( auth.uid() = user_id );

-- ==============================================================================
-- ثالثاً: التأكد من سياسة القراءة لجدول profiles وتفعيل Realtime
-- ==============================================================================
alter table public.profiles enable row level security;
grant select on table public.profiles to anon, authenticated;

drop policy if exists "profiles_select_policy" on public.profiles;
create policy "profiles_select_policy"
on public.profiles
for select
to anon, authenticated
using ( true );

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
end $$;
