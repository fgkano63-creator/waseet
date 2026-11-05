-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 24: SYNC & AUDIT WALLET LOCKED POINTS (ESCROW & WITHDRAWALS)
-- ==============================================================================
-- الوظيفة:
-- 1. حساب الرصيد المحجوز الفعلي بدقة بناءً على صفقات الوساطة الجارية (deals) وطلبات السحب المعلقة (withdrawals).
-- 2. تصحيح أي رصيد محجوز معلق دون صفقات أو طلبات حقيقية (Orphan Locked Points) وإعادته إلى الرصيد المتاح فوراً.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_wallet_locked_points()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_deals_locked numeric := 0;
    v_withdrawals_locked numeric := 0;
    v_real_locked numeric := 0;
    v_old_locked numeric := 0;
    v_old_balance numeric := 0;
    v_orphan numeric := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'يرجى تسجيل الدخول أولاً لتنفيذ عملية المزامنة المالية';
    END IF;

    -- 1. حساب إجمالي النقاط المحجوزة في صفقات الوساطة النشطة (كمشتري)
    SELECT COALESCE(SUM(total_points), 0)
    INTO v_deals_locked
    FROM public.deals
    WHERE buyer_id = v_uid
      AND status NOT IN ('completed', 'cancelled');

    -- 2. حساب إجمالي النقاط المحجوزة في طلبات سحب الرصيد قيد المراجعة
    SELECT COALESCE(SUM(amount), 0)
    INTO v_withdrawals_locked
    FROM public.withdrawals
    WHERE user_id = v_uid
      AND status = 'pending';

    v_real_locked := v_deals_locked + v_withdrawals_locked;

    -- 3. جلب الرصيد الحالي للمستخدم
    SELECT COALESCE(locked_points, 0), COALESCE(points_balance, 0)
    INTO v_old_locked, v_old_balance
    FROM public.profiles
    WHERE id = v_uid;

    -- 4. حساب الفائض المعلق (Orphan points)
    v_orphan := GREATEST(0, v_old_locked - v_real_locked);

    -- 5. تفعيل متغير النظام وتحديث ملف المستخدم
    PERFORM set_config('app.internal_wallet_op', 'true', true);

    IF v_orphan > 0 THEN
        UPDATE public.profiles
        SET points_balance = points_balance + v_orphan,
            wallet_balance = points_balance + v_orphan,
            locked_points = v_real_locked,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_uid;
    ELSE
        UPDATE public.profiles
        SET locked_points = v_real_locked,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_uid;
    END IF;

    -- 6. تسجيل العملية في سجل الحركات المالية إن وُجد فارق
    IF v_orphan > 0 THEN
        INSERT INTO public.wallet_transactions (
            user_id,
            type,
            amount,
            description,
            balance_after,
            created_at
        ) VALUES (
            v_uid,
            'escrow_refund',
            v_orphan,
            'مزامنة وتصحيح الرصيد المحجوز: إعادة ' || v_orphan || ' نقطة إلى الرصيد المتاح لعدم وجود صفقات أو سحوبات نشطة تحجزها',
            v_old_balance + v_orphan,
            timezone('utc'::text, now())
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'old_locked', v_old_locked,
        'new_locked', v_real_locked,
        'deals_locked', v_deals_locked,
        'withdrawals_locked', v_withdrawals_locked,
        'orphan_released', v_orphan,
        'new_available', v_old_balance + v_orphan
    );
END;
$$;

-- منح صلاحية الاستدعاء لكافة المستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.sync_wallet_locked_points() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_wallet_locked_points() TO service_role;
