-- =================================================================================
-- WASEET (وسيط) - إصلاح شامل لجدول الحسابات (marketplace_accounts) وسياسات الأمان (RLS)
-- يضمن:
-- 1. توحيد وقبول كافة حالات الفحص ('pending', 'pending_verification', 'pending_review').
-- 2. السماح للمدير (is_admin()) بقراءة (SELECT) وتعديل كافة الحسابات في جدول marketplace_accounts بدون أي قيود.
-- 3. السماح للبائع برؤية وإضافة حساباته الخاصة، وللزوار برؤية الحسابات المتاحة ('available').
-- 4. السماح بقراءة جدول profiles لضمان نجاح الـ Left Join وعدم اختفاء أي حساب إذا كان ملف البائع غير مكتمل.
-- =================================================================================

-- أولاً: التأكد من دالة التحقق من المدير public.is_admin()
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

-- ثانياً: تحديث قيد الحالة (Check Constraint) في جدول marketplace_accounts ليشمل كافة صيغ الفحص المعلق
do $$
begin
  alter table public.marketplace_accounts drop constraint if exists marketplace_accounts_status_check;
  alter table public.marketplace_accounts
    add constraint marketplace_accounts_status_check
    check (status in ('pending', 'pending_verification', 'pending_review', 'available', 'in_deal', 'sold', 'hidden', 'rejected'));
exception
  when others then null;
end $$;

-- ثالثاً: ضبط الأذونات وتفعيل RLS على جدول marketplace_accounts
grant select on table public.marketplace_accounts to anon, authenticated;
grant insert, update, delete on table public.marketplace_accounts to authenticated;
grant all on table public.marketplace_accounts to service_role;

alter table public.marketplace_accounts enable row level security;

-- حذف السياسات القديمة لمنع أي تعارض
drop policy if exists "accounts_select_policy" on public.marketplace_accounts;
drop policy if exists "accounts_admin_select_all" on public.marketplace_accounts;
drop policy if exists "accounts_seller_select_own" on public.marketplace_accounts;
drop policy if exists "accounts_public_select_available" on public.marketplace_accounts;
drop policy if exists "accounts_insert_policy" on public.marketplace_accounts;
drop policy if exists "accounts_update_policy" on public.marketplace_accounts;
drop policy if exists "accounts_delete_policy" on public.marketplace_accounts;

-- 1. سياسة SELECT للمدير (is_admin()): قراءة جميع الحسابات (بما فيها قيد الفحص والمرفوضة) دون أي قيد على seller_id
create policy "accounts_admin_select_all"
on public.marketplace_accounts
for select
to authenticated
using (
  public.is_admin()
);

-- 2. سياسة SELECT للبائع: قراءة جميع حساباته الخاصة (سواء كانت قيد الفحص أو متاحة أو مرفوضة)
create policy "accounts_seller_select_own"
on public.marketplace_accounts
for select
to authenticated
using (
  seller_id = auth.uid()
);

-- 3. سياسة SELECT للعامة والزوار: قراءة الحسابات المعتمدة والمتاحة في المتجر فقط
create policy "accounts_public_select_available"
on public.marketplace_accounts
for select
to anon, authenticated
using (
  status = 'available'
);

-- 4. سياسة INSERT: السماح للمستخدم المسجل بإضافة حساب جديد (أو للمدير)
create policy "accounts_insert_policy"
on public.marketplace_accounts
for insert
to authenticated
with check (
  seller_id = auth.uid() or public.is_admin()
);

-- 5. سياسة UPDATE: السماح للمدير باعتماد/رفض/تعديل أي حساب، وللبائع بتعديل حسابه
create policy "accounts_update_policy"
on public.marketplace_accounts
for update
to authenticated
using (
  public.is_admin() or (seller_id = auth.uid() and status in ('pending', 'pending_verification', 'pending_review', 'available', 'hidden'))
)
with check (
  public.is_admin() or (seller_id = auth.uid() and status in ('pending', 'pending_verification', 'pending_review', 'available', 'hidden'))
);

-- 6. سياسة DELETE: السماح للمدير أو البائع بحذف الحساب
create policy "accounts_delete_policy"
on public.marketplace_accounts
for delete
to authenticated
using (
  public.is_admin() or seller_id = auth.uid()
);

-- رابعاً: التأكد من سياسة SELECT على جدول profiles لضمان عمل الـ Left Join وجلب أسماء البائع والمشتري في غرفة الوساطة
alter table public.profiles enable row level security;
grant select on table public.profiles to anon, authenticated;

drop policy if exists "profiles_select_policy" on public.profiles;
drop policy if exists "profiles_admin_select_all" on public.profiles;

create policy "profiles_select_policy"
on public.profiles
for select
to anon, authenticated
using (true);
