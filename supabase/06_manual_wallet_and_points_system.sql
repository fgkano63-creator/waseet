-- ==============================================================================
-- WASEET Platform - نظام المحفظة الداخلية والشحن اليدوي بالنقاط (06_manual_wallet_and_points_system.sql)
-- ==============================================================================
-- يشمل هذا الملف:
-- 1. إضافة عمودي points_balance و locked_points في جدول profiles مع مشغل الحماية.
-- 2. إنشاء جدول deposit_requests لطلبات الشحن اليدوي مع سياسات RLS الصارمة.
-- 3. تحديث جدول wallet_transactions لسجل العمليات المالية الشفاف مع سياسات RLS.
-- 4. الدوال الذرية المؤمنة (SECURITY DEFINER RPCs) لاعتماد الشحن، حجز النقاط، تحرير الأرباح، والاسترداد.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. تحديث جدول الملفات الشخصية (public.profiles)
-- ------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists points_balance numeric not null default 0 check (points_balance >= 0),
  add column if not exists locked_points numeric not null default 0 check (locked_points >= 0);

-- مزامنة الأرصدة السابقة إن وجدت
update public.profiles
set points_balance = wallet_balance
where points_balance = 0 and wallet_balance > 0;

-- تحديث مشغل الحماية لمنع المستخدمين من التلاعب بـ points_balance أو locked_points من المتصفح
create or replace function public.prevent_profile_field_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- السماح بالتعديل فقط إذا كان المستدعي مديراً أو داخل عملية نظام مالية موثقة (RPC)
  if auth.uid() is not null
     and not public.is_admin()
     and coalesce(current_setting('app.internal_wallet_op', true), '') <> 'true' then

    if new.role is distinct from old.role then
      raise exception 'أمني: غير مصرح لك بتعديل رتبة الحساب (role)';
    end if;

    if new.points_balance is distinct from old.points_balance
       or new.wallet_balance is distinct from old.wallet_balance then
      raise exception 'أمني: غير مصرح لك بتعديل رصيد النقاط مباشرة من المتصفح';
    end if;

    if new.locked_points is distinct from old.locked_points then
      raise exception 'أمني: غير مصرح لك بتعديل الرصيد المحجوز مباشرة من المتصفح';
    end if;

    if new.id is distinct from old.id then
      raise exception 'أمني: غير مصرح لك بتغيير معرف الحساب';
    end if;

    if new.email is distinct from old.email then
      raise exception 'أمني: غير مصرح لك بتغيير البريد الإلكتروني الأساسي';
    end if;
  end if;

  -- إبقاء wallet_balance و points_balance متطابقين دائماً للتوافق الكامل
  if new.points_balance is distinct from old.points_balance then
    new.wallet_balance := new.points_balance;
  elsif new.wallet_balance is distinct from old.wallet_balance then
    new.points_balance := new.wallet_balance;
  end if;

  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists tr_prevent_profile_field_tampering on public.profiles;
create trigger tr_prevent_profile_field_tampering
  before update on public.profiles
  for each row execute function public.prevent_profile_field_tampering();


-- ------------------------------------------------------------------------------
-- 2. إنشاء جدول طلبات الشحن اليدوي (public.deposit_requests)
-- ------------------------------------------------------------------------------
create table if not exists public.deposit_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    amount_requested numeric not null check (amount_requested > 0),
    payment_method text not null default 'تحويل محلي',
    receipt_image_url text not null,
    notes text default '',
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_note text default '',
    reviewed_by uuid references public.profiles(id) on delete set null,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_deposit_requests_user_id on public.deposit_requests(user_id, created_at desc);
create index if not exists idx_deposit_requests_status on public.deposit_requests(status, created_at desc);

-- ضبط الصلاحيات وتفعيل RLS على جدول deposit_requests
revoke all on table public.deposit_requests from anon;
grant select, insert on table public.deposit_requests to authenticated;
grant update, delete on table public.deposit_requests to authenticated;
grant all on table public.deposit_requests to service_role;

alter table public.deposit_requests enable row level security;

-- سياسة القراءة: المستخدم يرى طلباته فقط، والمدير يرى كافة الطلبات
drop policy if exists "deposit_requests_select_policy" on public.deposit_requests;
create policy "deposit_requests_select_policy"
on public.deposit_requests for select to authenticated
using (
  user_id = auth.uid() or public.is_admin()
);

-- سياسة الإضافة: المستخدم ينشئ طلب شحن لنفسه فقط وبحالة pending حصراً
drop policy if exists "deposit_requests_insert_policy" on public.deposit_requests;
create policy "deposit_requests_insert_policy"
on public.deposit_requests for insert to authenticated
with check (
  user_id = auth.uid() and status = 'pending'
);

-- سياسة التعديل: محصورة بالمدير فقط
drop policy if exists "deposit_requests_update_admin_only" on public.deposit_requests;
create policy "deposit_requests_update_admin_only"
on public.deposit_requests for update to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

-- سياسة الحذف: محصورة بالمدير فقط
drop policy if exists "deposit_requests_delete_admin_only" on public.deposit_requests;
create policy "deposit_requests_delete_admin_only"
on public.deposit_requests for delete to authenticated
using ( public.is_admin() );


-- ------------------------------------------------------------------------------
-- 3. تحديث وضبط جدول سجل الحركات المالية (public.wallet_transactions)
-- ------------------------------------------------------------------------------
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

alter table public.wallet_transactions
  add column if not exists deposit_request_id uuid references public.deposit_requests(id) on delete set null,
  add column if not exists balance_after numeric;

create index if not exists idx_wallet_transactions_user_created on public.wallet_transactions(user_id, created_at desc);

-- ضبط الصلاحيات الصارمة: القراءة فقط للمستخدم، ومنع الإدراج أو التعديل المباشر من المتصفح
revoke all on table public.wallet_transactions from anon;
revoke insert, update, delete on table public.wallet_transactions from authenticated;
grant select on table public.wallet_transactions to authenticated;
grant all on table public.wallet_transactions to service_role;

alter table public.wallet_transactions enable row level security;

drop policy if exists "transactions_select_policy" on public.wallet_transactions;
create policy "transactions_select_policy"
on public.wallet_transactions for select to authenticated
using (
  user_id = auth.uid() or public.is_admin()
);

drop policy if exists "transactions_admin_insert_policy" on public.wallet_transactions;


-- ------------------------------------------------------------------------------
-- 4. الدوال الذرية الآمنة (SECURITY DEFINER RPC Functions)
-- ------------------------------------------------------------------------------

-- (أ) دالة موافقة المدير على طلب الشحن وإضافة النقاط آلياً
create or replace function public.approve_deposit_request(
    p_request_id uuid,
    p_admin_note text default 'تم التحقق من الإيصال وشحن النقاط بنجاح'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_req public.deposit_requests%rowtype;
    v_new_balance numeric;
begin
    if not public.is_admin() then
        raise exception 'أمني: هذه الصلاحية مخصصة لمدير المنصة فقط';
    end if;

    select * into v_req
    from public.deposit_requests
    where id = p_request_id
    for update;

    if not found then
        raise exception 'طلب الشحن غير موجود';
    end if;

    if v_req.status <> 'pending' then
        raise exception 'تمت معالجة طلب الشحن هذا مسبقاً (الحالة الحالية: %)', v_req.status;
    end if;

    -- تفعيل راية العملية الداخلية الآمنة
    perform set_config('app.internal_wallet_op', 'true', true);

    -- زيادة رصيد النقاط للمستخدم
    update public.profiles
    set points_balance = points_balance + v_req.amount_requested,
        wallet_balance = points_balance + v_req.amount_requested,
        updated_at = timezone('utc'::text, now())
    where id = v_req.user_id
    returning points_balance into v_new_balance;

    -- تحديث حالة طلب الشحن
    update public.deposit_requests
    set status = 'approved',
        admin_note = coalesce(nullif(trim(p_admin_note), ''), 'تم التحقق من الإيصال وشحن النقاط بنجاح'),
        reviewed_by = auth.uid(),
        reviewed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    where id = p_request_id;

    -- تسجيل العملية في سجل المحفظة
    insert into public.wallet_transactions (
        user_id,
        deposit_request_id,
        amount,
        balance_after,
        type,
        status,
        description
    ) values (
        v_req.user_id,
        v_req.id,
        v_req.amount_requested,
        v_new_balance,
        'deposit',
        'completed',
        'شحن رصيد المحفظة بمقدار ' || v_req.amount_requested || ' نقطة عبر (' || coalesce(v_req.payment_method, 'تحويل محلي') || ')'
    );

    return jsonb_build_object(
        'success', true,
        'request_id', v_req.id,
        'user_id', v_req.user_id,
        'amount_added', v_req.amount_requested,
        'new_balance', v_new_balance
    );
end;
$$;

grant execute on function public.approve_deposit_request(uuid, text) to authenticated;


-- (ب) دالة رفض طلب الشحن من قبل المدير
create or replace function public.reject_deposit_request(
    p_request_id uuid,
    p_admin_note text default 'لم يتم قبول الإيصال المرفق، يرجى التأكد من البيانات'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_req public.deposit_requests%rowtype;
begin
    if not public.is_admin() then
        raise exception 'أمني: هذه الصلاحية مخصصة لمدير المنصة فقط';
    end if;

    select * into v_req
    from public.deposit_requests
    where id = p_request_id
    for update;

    if not found then
        raise exception 'طلب الشحن غير موجود';
    end if;

    if v_req.status <> 'pending' then
        raise exception 'تمت معالجة طلب الشحن هذا مسبقاً';
    end if;

    update public.deposit_requests
    set status = 'rejected',
        admin_note = coalesce(nullif(trim(p_admin_note), ''), 'لم يتم قبول الإيصال المرفق'),
        reviewed_by = auth.uid(),
        reviewed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    where id = p_request_id;

    return jsonb_build_object(
        'success', true,
        'request_id', v_req.id,
        'status', 'rejected'
    );
end;
$$;

grant execute on function public.reject_deposit_request(uuid, text) to authenticated;


-- (ج) دالة فحص الرصيد وحجز النقاط عند طلب شراء حساب (Escrow Lock)
create or replace function public.lock_escrow_points_for_deal(
    p_deal_id text,
    p_account_id uuid,
    p_seller_id uuid,
    p_seller_price numeric,
    p_fee numeric,
    p_total_points numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_buyer_id uuid := auth.uid();
    v_profile public.profiles%rowtype;
    v_new_balance numeric;
    v_new_locked numeric;
begin
    if v_buyer_id is null then
        raise exception 'يجب تسجيل الدخول أولاً لإتمام عملية الشراء';
    end if;

    if p_total_points <= 0 or p_seller_price <= 0 or p_fee < 0 then
        raise exception 'قيم الصفقة غير صالحة';
    end if;

    select * into v_profile
    from public.profiles
    where id = v_buyer_id
    for update;

    if not found then
        raise exception 'الملف الشخصي للمشتري غير موجود';
    end if;

    if v_profile.points_balance < p_total_points then
        raise exception 'رصيد النقاط المتاح (% نقطة) غير كافٍ لشراء الحساب (% نقطة)', v_profile.points_balance, p_total_points;
    end if;

    perform set_config('app.internal_wallet_op', 'true', true);

    -- خصم النقاط من الرصيد المتاح وتحويلها إلى الرصيد المحجوز
    update public.profiles
    set points_balance = points_balance - p_total_points,
        wallet_balance = points_balance - p_total_points,
        locked_points = locked_points + p_total_points,
        updated_at = timezone('utc'::text, now())
    where id = v_buyer_id
    returning points_balance, locked_points into v_new_balance, v_new_locked;

    -- إنشاء أو تحديث سجل الصفقة في جدول deals
    insert into public.deals (
        id,
        account_id,
        buyer_id,
        seller_id,
        seller_price,
        fee,
        total_points,
        status,
        current_step
    ) values (
        p_deal_id,
        p_account_id,
        v_buyer_id,
        p_seller_id,
        p_seller_price,
        p_fee,
        p_total_points,
        'active',
        2
    )
    on conflict (id) do update set
        status = 'active',
        updated_at = timezone('utc'::text, now());

    -- تحديث حالة الحساب في المتجر إلى قيد الصفقة
    if p_account_id is not null then
        update public.marketplace_accounts
        set status = 'in_deal',
            updated_at = timezone('utc'::text, now())
        where id = p_account_id;
    end if;

    -- تسجيل حركة الحجز في سجل المحفظة
    insert into public.wallet_transactions (
        user_id,
        deal_id,
        amount,
        balance_after,
        type,
        status,
        description
    ) values (
        v_buyer_id,
        p_deal_id,
        -p_total_points,
        v_new_balance,
        'escrow_lock',
        'completed',
        'حجز ' || p_total_points || ' نقطة في خزينة الوساطة لشراء حساب (صفقة #' || p_deal_id || ')'
    );

    return jsonb_build_object(
        'success', true,
        'deal_id', p_deal_id,
        'points_balance', v_new_balance,
        'locked_points', v_new_locked
    );
end;
$$;

grant execute on function public.lock_escrow_points_for_deal(text, uuid, uuid, numeric, numeric, numeric) to authenticated;


-- (د) دالة إتمام الصفقة وتحويل الصافي للبائع وخصم عمولة المنصة تلقائياً
create or replace function public.release_escrow_deal_points(
    p_deal_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deal public.deals%rowtype;
    v_seller_balance numeric;
    v_admin_id uuid;
    v_admin_balance numeric;
begin
    select * into v_deal
    from public.deals
    where id = p_deal_id
    for update;

    if not found then
        raise exception 'الصفقة المطلوبة غير موجودة';
    end if;

    if not (public.is_admin() or v_deal.buyer_id = auth.uid()) then
        raise exception 'أمني: فقط الوسيط المعتمد أو المشتري يمكنه تأكيد استلام الحساب وتحرير النقاط';
    end if;

    if v_deal.status = 'completed' then
        raise exception 'تم إتمام هذه الصفقة وتحويل نقاطها مسبقاً';
    end if;

    if v_deal.status = 'cancelled' then
        raise exception 'لا يمكن إتمام صفقة ملغاة';
    end if;

    perform set_config('app.internal_wallet_op', 'true', true);

    -- 1. تخفيض النقاط المحجوزة لدى المشتري
    update public.profiles
    set locked_points = greatest(0, locked_points - v_deal.total_points),
        updated_at = timezone('utc'::text, now())
    where id = v_deal.buyer_id;

    -- 2. إرسال صافي النقاط للبائع (بعد خصم عمولة المنصة)
    if v_deal.seller_id is not null then
        update public.profiles
        set points_balance = points_balance + v_deal.seller_price,
            wallet_balance = points_balance + v_deal.seller_price,
            updated_at = timezone('utc'::text, now())
        where id = v_deal.seller_id
        returning points_balance into v_seller_balance;

        insert into public.wallet_transactions (
            user_id,
            deal_id,
            amount,
            balance_after,
            type,
            status,
            description
        ) values (
            v_deal.seller_id,
            v_deal.id,
            v_deal.seller_price,
            v_seller_balance,
            'payout',
            'completed',
            'استلام أرباح بيع حساب (صفقة #' || v_deal.id || ') بعد خصم عمولة المنصة (' || v_deal.fee || ' نقطة)'
        );
    end if;

    -- 3. إيداع عمولة المنصة في حساب المدير
    select id into v_admin_id
    from public.profiles
    where role = 'admin'
    order by created_at asc
    limit 1;

    if v_admin_id is not null and v_deal.fee > 0 then
        update public.profiles
        set points_balance = points_balance + v_deal.fee,
            wallet_balance = points_balance + v_deal.fee,
            updated_at = timezone('utc'::text, now())
        where id = v_admin_id
        returning points_balance into v_admin_balance;

        insert into public.wallet_transactions (
            user_id,
            deal_id,
            amount,
            balance_after,
            type,
            status,
            description
        ) values (
            v_admin_id,
            v_deal.id,
            v_deal.fee,
            v_admin_balance,
            'fee',
            'completed',
            'تحصيل عمولة الوساطة من الصفقة #' || v_deal.id
        );
    end if;

    -- 4. تحديث حالة الصفقة والحساب
    update public.deals
    set status = 'completed',
        current_step = 4,
        updated_at = timezone('utc'::text, now())
    where id = p_deal_id;

    if v_deal.account_id is not null then
        update public.marketplace_accounts
        set status = 'sold',
            updated_at = timezone('utc'::text, now())
        where id = v_deal.account_id;
    end if;

    return jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'seller_payout', v_deal.seller_price,
        'platform_fee', v_deal.fee
    );
end;
$$;

grant execute on function public.release_escrow_deal_points(text) to authenticated;


-- (هـ) دالة إلغاء الصفقة واسترداد كامل النقاط المحجوزة للمشتري
create or replace function public.refund_escrow_deal_points(
    p_deal_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deal public.deals%rowtype;
    v_buyer_balance numeric;
begin
    if not public.is_admin() then
        raise exception 'أمني: إلغاء الصفقة واسترجاع النقاط من صلاحيات الوسيط المعتمد فقط';
    end if;

    select * into v_deal
    from public.deals
    where id = p_deal_id
    for update;

    if not found then
        raise exception 'الصفقة غير موجودة';
    end if;

    if v_deal.status in ('completed', 'cancelled') then
        raise exception 'تم إنهاء هذه الصفقة مسبقاً';
    end if;

    perform set_config('app.internal_wallet_op', 'true', true);

    -- إعادة النقاط المحجوزة إلى الرصيد المتاح للمشتري
    update public.profiles
    set points_balance = points_balance + v_deal.total_points,
        wallet_balance = points_balance + v_deal.total_points,
        locked_points = greatest(0, locked_points - v_deal.total_points),
        updated_at = timezone('utc'::text, now())
    where id = v_deal.buyer_id
    returning points_balance into v_buyer_balance;

    -- تسجيل حركة الاسترداد
    insert into public.wallet_transactions (
        user_id,
        deal_id,
        amount,
        balance_after,
        type,
        status,
        description
    ) values (
        v_deal.buyer_id,
        v_deal.id,
        v_deal.total_points,
        v_buyer_balance,
        'escrow_refund',
        'completed',
        'استرداد كامل النقاط المحجوزة (' || v_deal.total_points || ' نقطة) بعد إلغاء الصفقة #' || v_deal.id
    );

    -- تحديث حالة الصفقة وإعادة الحساب كمتاح في المتجر
    update public.deals
    set status = 'cancelled',
        updated_at = timezone('utc'::text, now())
    where id = p_deal_id;

    if v_deal.account_id is not null then
        update public.marketplace_accounts
        set status = 'available',
            updated_at = timezone('utc'::text, now())
        where id = v_deal.account_id;
    end if;

    return jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'refunded_points', v_deal.total_points,
        'buyer_new_balance', v_buyer_balance
    );
end;
$$;

grant execute on function public.refund_escrow_deal_points(text) to authenticated;


-- ------------------------------------------------------------------------------
-- 5. تفعيل البث اللحظي (Supabase Realtime) لطلبات الشحن والحركات المالية
-- ------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deposit_requests'
  ) then
    alter publication supabase_realtime add table public.deposit_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallet_transactions'
  ) then
    alter publication supabase_realtime add table public.wallet_transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when others then
  null;
end;
$$;
