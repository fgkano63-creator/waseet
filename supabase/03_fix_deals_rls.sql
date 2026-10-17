-- ==============================================================================
-- WASEET Platform - إصلاح سياسات الأمان (RLS) لجدول الصفقات (deals) والحركات المالية
-- ==============================================================================
-- انسخ هذا الكود بالكامل وشغّله في Supabase SQL Editor ثم اضغط Run:

-- 1. التأكد من دالة فحص صلاحية المدير (SECURITY DEFINER)
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

-- 2. تحديث قيود جدول الصفقات (deals) لدعم كافة الحالات (بما فيها pending_middleman و active و created)
alter table public.deals alter column seller_id drop not null;
alter table public.deals drop constraint if exists deals_status_check;
alter table public.deals add constraint deals_status_check
  check (status in (
    'waiting_credentials',
    'mediator_inspecting',
    'buyer_inspecting',
    'pending_middleman',
    'active',
    'pending',
    'created',
    'completed',
    'cancelled',
    'disputed'
  ));

-- 3. منح الصلاحيات الأساسية للمستخدمين المسجلين على جدول deals
grant select, insert, update on table public.deals to authenticated;
grant all on table public.deals to service_role;

-- 4. تفعيل RLS وإضافة سياسات القراءة الشاملة للمدير والإضافة والتحديث
alter table public.deals enable row level security;

-- سياسة SELECT للمدير: قراءة جميع الصفقات بجميع حالاتها دون استثناء
drop policy if exists "deals_admin_select_all" on public.deals;
create policy "deals_admin_select_all"
on public.deals for select to authenticated
using ( public.is_admin() );

-- سياسة SELECT للمشتري أو البائع المشارك في الصفقة
drop policy if exists "deals_select_participants_or_admin" on public.deals;
create policy "deals_select_participants_or_admin"
on public.deals for select to authenticated
using (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
);

-- سياسة INSERT لإنشاء صفقة وساطة جديدة (مثل DEAL-2) وحفظها في قاعدة البيانات
drop policy if exists "deals_insert_policy" on public.deals;
create policy "deals_insert_policy"
on public.deals for insert to authenticated
with check (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
);

-- سياسة UPDATE لتحديث خطوات الصفقة وحالتها
drop policy if exists "deals_admin_update" on public.deals;
drop policy if exists "deals_update_policy" on public.deals;
create policy "deals_update_policy"
on public.deals for update to authenticated
using (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
)
with check (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
);

-- 5. سياسات جدول الحركات المالية (wallet_transactions) لضمان قراءة المدير لكافة المعاملات
grant select, insert, update on table public.wallet_transactions to authenticated;
alter table public.wallet_transactions enable row level security;

drop policy if exists "transactions_select_policy" on public.wallet_transactions;
create policy "transactions_select_policy"
on public.wallet_transactions for select to authenticated
using (
  user_id = auth.uid() or public.is_admin()
);

-- 6. التأكد من سياسة جدول profiles ليتمكن المدير من قراءة بيانات أطراف الصفقة (المشتري والبائع)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select to authenticated
using (
  auth.uid() = id or public.is_admin()
);

-- 7. تفعيل Realtime لجدول الصفقات (إن لم يكن مفعلاً مسبقاً)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deals'
  ) then
    alter publication supabase_realtime add table public.deals;
  end if;
end $$;
