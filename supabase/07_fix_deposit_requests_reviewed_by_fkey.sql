-- ==============================================================================
-- WASEET (وسيط) - حل مشكلة قيد المفتاح الأجنبي للمدير في طلبات الشحن
-- Fix: violates foreign key constraint "deposit_requests_reviewed_by_fkey"
-- ==============================================================================

-- 1. إزالة قيد المفتاح الأجنبي الصارم على reviewed_by لتجنب توقف لوحة المدير
alter table public.deposit_requests
    drop constraint if exists deposit_requests_reviewed_by_fkey;

-- 2. التأكد من أن عمود reviewed_by يقبل القيم الفارغة (NULL)
alter table public.deposit_requests
    alter column reviewed_by drop not null;

-- 3. تحديث دالة الموافقة على طلبات الشحن (approve_deposit_request)
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
    v_reviewer_id uuid;
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

    -- تحديد معرف المراجع بأمان لتجنب أي تعارض في قيد المفتاح الأجنبي
    if exists (select 1 from public.profiles where id = auth.uid()) then
        v_reviewer_id := auth.uid();
    else
        if exists (
            select 1 from pg_constraint 
            where conname = 'deposit_requests_reviewed_by_fkey'
        ) then
            v_reviewer_id := null;
        else
            v_reviewer_id := auth.uid();
        end if;
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
        reviewed_by = v_reviewer_id,
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


-- 4. تحديث دالة رفض طلب الشحن (reject_deposit_request)
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
    v_reviewer_id uuid;
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

    -- تحديد معرف المراجع بأمان لتجنب أي تعارض في قيد المفتاح الأجنبي
    if exists (select 1 from public.profiles where id = auth.uid()) then
        v_reviewer_id := auth.uid();
    else
        if exists (
            select 1 from pg_constraint 
            where conname = 'deposit_requests_reviewed_by_fkey'
        ) then
            v_reviewer_id := null;
        else
            v_reviewer_id := auth.uid();
        end if;
    end if;

    update public.deposit_requests
    set status = 'rejected',
        admin_note = coalesce(nullif(trim(p_admin_note), ''), 'لم يتم قبول الإيصال المرفق'),
        reviewed_by = v_reviewer_id,
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
