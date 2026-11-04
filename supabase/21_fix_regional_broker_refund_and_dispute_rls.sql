-- ==============================================================================
-- Migration 21: تمكين الوسيط الإقليمي المعين من إلغاء الصفقات المتنازع عليها ورد النقاط (Refund & Dispute Parity)
-- File: supabase/21_fix_regional_broker_refund_and_dispute_rls.sql
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.refund_escrow_deal_points(
    p_deal_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deal public.deals%rowtype;
    v_buyer_balance numeric;
    v_now timestamp with time zone := timezone('utc'::text, now());
    v_caller_is_admin boolean;
    v_caller_is_broker boolean;
BEGIN
    -- 1. جلب بيانات الصفقة مع قفل السجل (FOR UPDATE)
    SELECT * INTO v_deal
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الصفقة المطلوبة غير موجودة';
    END IF;

    -- 2. التحقق من صلاحيات المتصل: مدير عام أو وسيط إقليمي معين للصفقة
    v_caller_is_admin := public.is_admin();
    v_caller_is_broker := (v_deal.assigned_broker_id IS NOT NULL AND v_deal.assigned_broker_id = auth.uid());

    IF NOT (v_caller_is_admin OR v_caller_is_broker) THEN
        RAISE EXCEPTION 'أمني: إلغاء الصفقة واسترجاع النقاط من صلاحيات المدير العام أو الوسيط الإقليمي المعين للصفقة فقط';
    END IF;

    IF v_deal.status = 'completed' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء صفقة مكتملة تم تحرير نقاطها للبائع';
    END IF;

    IF v_deal.status = 'cancelled' THEN
        RAISE EXCEPTION 'تم إلغاء هذه الصفقة مسبقاً';
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- 3. إعادة كامل النقاط المحجوزة إلى الرصيد المتاح للمشتري
    UPDATE public.profiles
    SET locked_points = GREATEST(0, COALESCE(locked_points, 0) - v_deal.total_points),
        points_balance = COALESCE(points_balance, 0) + v_deal.total_points,
        wallet_balance = COALESCE(wallet_balance, points_balance, 0) + v_deal.total_points,
        updated_at = v_now
    WHERE id = v_deal.buyer_id
    RETURNING COALESCE(points_balance, 0) INTO v_buyer_balance;

    -- 4. تسجيل قيد استرداد النقاط في السجل المالي للمشتري
    INSERT INTO public.wallet_transactions (
        user_id,
        deal_id,
        amount,
        balance_after,
        type,
        status,
        description
    ) VALUES (
        v_deal.buyer_id,
        v_deal.id,
        v_deal.total_points,
        v_buyer_balance,
        'refund',
        'completed',
        'استرداد كامل نقاط الصفقة الملغاة #' || v_deal.id || ' بواسطة الوسيط المعين'
    );

    -- 5. تحديث حالة الصفقة إلى ملغاة
    UPDATE public.deals
    SET status = 'cancelled',
        current_step = 0,
        updated_at = v_now
    WHERE id = p_deal_id;

    -- 6. إعادة الحساب المعروض إلى السوق العام متاحاً للشراء من جديد
    IF v_deal.account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'available',
            buyer_id = NULL,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = v_now
        WHERE id = v_deal.account_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'refunded_points', v_deal.total_points,
        'buyer_balance', v_buyer_balance,
        'status', 'cancelled'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_escrow_deal_points(text) TO authenticated;

COMMIT;
