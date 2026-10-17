-- =================================================================================
-- WASEET Platform - إصلاح سياسات الأمان (RLS) لجدول الحسابات المعروضة للبيع
-- انسخ هذا الكود بالكامل والصقه في Supabase SQL Editor ثم اضغط Run
-- =================================================================================

-- 1. التأكد من دالة التحقق من المدير public.is_admin() (SECURITY DEFINER)
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
        or lower(email) in ('saadani2009@gmail.com', 'mediator@waseet.com')
      )
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) in ('saadani2009@gmail.com', 'mediator@waseet.com');
$$;

-- 2. السماح بكافة حالات الحسابات (بما فيها pending و pending_verification و pending_review)
do $$
begin
  alter table public.marketplace_accounts alter column seller_id drop not null;
  alter table public.marketplace_accounts drop constraint if exists marketplace_accounts_status_check;
  alter table public.marketplace_accounts
    add constraint marketplace_accounts_status_check
    check (status in ('pending', 'pending_verification', 'pending_review', 'available', 'in_deal', 'sold', 'hidden', 'rejected'));
exception
  when others then null;
end $$;

-- 3. منح الصلاحيات الأساسية وتفعيل RLS على جدول marketplace_accounts
grant select on table public.marketplace_accounts to anon, authenticated;
grant insert, update, delete on table public.marketplace_accounts to authenticated;
grant all on table public.marketplace_accounts to service_role;

alter table public.marketplace_accounts enable row level security;

-- حذف أي سياسات قديمة قد تتعارض أو تحجب حسابات المستخدمين عن المدير
drop policy if exists "accounts_select_policy" on public.marketplace_accounts;
drop policy if exists "accounts_admin_all" on public.marketplace_accounts;
drop policy if exists "accounts_admin_select_all" on public.marketplace_accounts;
drop policy if exists "accounts_admin_update_all" on public.marketplace_accounts;
drop policy if exists "accounts_admin_delete_all" on public.marketplace_accounts;
drop policy if exists "accounts_seller_select_own" on public.marketplace_accounts;
drop policy if exists "accounts_public_select_available" on public.marketplace_accounts;
drop policy if exists "accounts_insert_policy" on public.marketplace_accounts;
drop policy if exists "accounts_update_policy" on public.marketplace_accounts;
drop policy if exists "accounts_delete_policy" on public.marketplace_accounts;

-- أ) سياسة شاملة للمدير (SELECT / INSERT / UPDATE / DELETE) لكافة الصفوف بلا استثناء
create policy "accounts_admin_select_all"
on public.marketplace_accounts
for select
to authenticated
using ( public.is_admin() );

create policy "accounts_admin_update_all"
on public.marketplace_accounts
for update
to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

create policy "accounts_admin_delete_all"
on public.marketplace_accounts
for delete
to authenticated
using ( public.is_admin() );

-- ب) سياسة SELECT للبائع (يرى حساباته الخاصة بجميع حالاتها) وللعامة (يرون المتاح فقط)
create policy "accounts_seller_select_own"
on public.marketplace_accounts
for select
to authenticated
using ( seller_id = auth.uid() );

create policy "accounts_public_select_available"
on public.marketplace_accounts
for select
to anon, authenticated
using ( status = 'available' );

-- ج) سياسة INSERT و UPDATE و DELETE للبائع صاحب الحساب
create policy "accounts_insert_policy"
on public.marketplace_accounts
for insert
to authenticated
with check ( seller_id = auth.uid() or public.is_admin() );

create policy "accounts_update_policy"
on public.marketplace_accounts
for update
to authenticated
using ( seller_id = auth.uid() or public.is_admin() )
with check ( seller_id = auth.uid() or public.is_admin() );

create policy "accounts_delete_policy"
on public.marketplace_accounts
for delete
to authenticated
using ( seller_id = auth.uid() or public.is_admin() );

-- 4. احتياطياً: إذا كان هناك جدول باسم public.accounts في قاعدة البيانات، نطبق عليه نفس سياسات المدير
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'accounts') then
    execute 'grant select on table public.accounts to anon, authenticated';
    execute 'grant insert, update, delete on table public.accounts to authenticated';
    execute 'alter table public.accounts enable row level security';
    execute 'drop policy if exists "admin_all_accounts_select" on public.accounts';
    execute 'drop policy if exists "admin_all_accounts_update" on public.accounts';
    execute 'drop policy if exists "admin_all_accounts_delete" on public.accounts';
    execute 'create policy "admin_all_accounts_select" on public.accounts for select to authenticated using (public.is_admin() or true)';
    execute 'create policy "admin_all_accounts_update" on public.accounts for update to authenticated using (public.is_admin()) with check (public.is_admin())';
    execute 'create policy "admin_all_accounts_delete" on public.accounts for delete to authenticated using (public.is_admin())';
  end if;
end $$;

-- 5. التأكد من سياسة SELECT على جدول profiles ليتمكن المدير من قراءة بيانات جميع البائعين والمشترين
alter table public.profiles enable row level security;
grant select on table public.profiles to anon, authenticated;

drop policy if exists "profiles_select_policy" on public.profiles;
drop policy if exists "profiles_admin_select_all" on public.profiles;

create policy "profiles_select_policy"
on public.profiles
for select
to anon, authenticated
using ( true );

-- 6. تفعيل Realtime لجدول الحسابات (marketplace_accounts)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_accounts'
  ) then
    alter publication supabase_realtime add table public.marketplace_accounts;
  end if;
end $$;
