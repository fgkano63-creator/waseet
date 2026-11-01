-- =================================================================================
-- WASEET Platform - الهجرة رقم 16: إصلاح دورة حياة إتمام الصفقات ونقل الملكية والنقاط
-- 16_fix_deal_completion_and_ownership.sql
-- =================================================================================

-- 1. التأكد من وجود عمودي buyer_id و owner_id في جدول marketplace_accounts لتوثيق ملكية المشتري
ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- إنشاء فهارس سريعة لأداء استعلامات "حساباتي المشتراة"
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_owner_id ON public.marketplace_accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_buyer_id ON public.marketplace_accounts(buyer_id);

-- 2. التأكد من أن قيد الحالات يدعم 'sold' و 'completed' و 'in_deal'
DO $$
BEGIN
  ALTER TABLE public.marketplace_accounts DROP CONSTRAINT IF EXISTS marketplace_accounts_status_check;
  ALTER TABLE public.marketplace_accounts
    ADD CONSTRAINT marketplace_accounts_status_check
    CHECK (status IN ('pending', 'pending_verification', 'pending_review', 'under_review', 'available', 'approved', 'in_deal', 'in_escrow', 'sold', 'completed', 'hidden', 'rejected'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. تحديث دالة تحرير الرصيد الذرية release_escrow_deal_points لتنفيذ المعاملة المالية الكاملة
-- تخصم من "النقاط المحجوزة" للمشتري، وتضيف حصة البائع لمحفظته، وتضيف عمولة المنصة لحساب الوسيط/المدير
CREATE OR REPLACE FUNCTION public.release_escrow_deal_points(
    p_deal_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deal public.deals%rowtype;
    v_seller_balance numeric;
    v_admin_id uuid;
    v_admin_balance numeric;
    v_now timestamp with time zone := timezone('utc'::text, now());
BEGIN
    -- قفل سجل الصفقة لمنع تكرار التحويل (Race Condition Protection)
    SELECT * INTO v_deal
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الصفقة المطلوبة غير موجودة';
    END IF;

    -- التحقق الأمني: مسموح للمدير، الوسيط، أو المشتري
    IF NOT (public.is_admin() OR v_deal.buyer_id = auth.uid()) THEN
        RAISE EXCEPTION 'أمني: فقط الوسيط المعتمد أو المشتري يمكنه تأكيد استلام الحساب وتحرير النقاط';
    END IF;

    -- إذا كانت الصفقة مكتملة بالفعل، يتم إرجاع نتيجة النجاح بشكل آمن دون تكرار العمليات
    IF v_deal.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'deal_id', v_deal.id,
            'message', 'الصفقة مكتملة وموثقة مسبقاً'
        );
    END IF;

    IF v_deal.status = 'cancelled' THEN
        RAISE EXCEPTION 'لا يمكن إتمام صفقة ملغاة';
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- أ) خصم النقاط المحجوزة لدى المشتري (فك الحجز التام)
    IF v_deal.buyer_id IS NOT NULL THEN
        UPDATE public.profiles
        SET locked_points = GREATEST(0, COALESCE(locked_points, 0) - v_deal.total_points),
            updated_at = v_now
        WHERE id = v_deal.buyer_id;
    END IF;

    -- ب) إضافة صافي النقاط المستحقة للبائع في محفظته وتسجيل العملية المالية في السجل
    IF v_deal.seller_id IS NOT NULL AND v_deal.seller_price > 0 THEN
        UPDATE public.profiles
        SET points_balance = COALESCE(points_balance, 0) + v_deal.seller_price,
            wallet_balance = COALESCE(wallet_balance, points_balance, 0) + v_deal.seller_price,
            updated_at = v_now
        WHERE id = v_deal.seller_id
        RETURNING COALESCE(points_balance, 0) INTO v_seller_balance;

        INSERT INTO public.wallet_transactions (
            user_id,
            deal_id,
            amount,
            balance_after,
            type,
            status,
            description
        ) VALUES (
            v_deal.seller_id,
            v_deal.id,
            v_deal.seller_price,
            v_seller_balance,
            'payout',
            'completed',
            'استلام أرباح بيع حساب (صفقة #' || v_deal.id || ') بعد خصم عمولة المنصة (' || v_deal.fee || ' نقطة)'
        );
    END IF;

    -- ج) إيداع عمولة المنصة في حساب الوسيط / المدير المعتمد
    SELECT id INTO v_admin_id
    FROM public.profiles
    WHERE role IN ('admin', 'mediator')
       OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
    ORDER BY CASE WHEN id = auth.uid() THEN 0 WHEN role = 'admin' THEN 1 ELSE 2 END, created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL AND COALESCE(v_deal.fee, 0) > 0 THEN
        UPDATE public.profiles
        SET points_balance = COALESCE(points_balance, 0) + v_deal.fee,
            wallet_balance = COALESCE(wallet_balance, points_balance, 0) + v_deal.fee,
            updated_at = v_now
        WHERE id = v_admin_id
        RETURNING COALESCE(points_balance, 0) INTO v_admin_balance;

        INSERT INTO public.wallet_transactions (
            user_id,
            deal_id,
            amount,
            balance_after,
            type,
            status,
            description
        ) VALUES (
            v_admin_id,
            v_deal.id,
            v_deal.fee,
            v_admin_balance,
            'fee',
            'completed',
            'تحصيل عمولة الوساطة من الصفقة #' || v_deal.id
        );
    END IF;

    -- د) تحديث حالة الصفقة إلى مكتملة (المرحلة 4)
    UPDATE public.deals
    SET status = 'completed',
        current_step = 4,
        updated_at = v_now
    WHERE id = p_deal_id;

    -- هـ) تغيير مالك الحساب (owner_id & buyer_id) إلى معرّف المشتري وحالته إلى مباع (sold)
    IF v_deal.account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'sold',
            buyer_id = v_deal.buyer_id,
            owner_id = v_deal.buyer_id,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = v_now
        WHERE id = v_deal.account_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'seller_payout', v_deal.seller_price,
        'platform_fee', v_deal.fee,
        'buyer_id', v_deal.buyer_id,
        'owner_id', v_deal.buyer_id,
        'status', 'completed'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_escrow_deal_points(text) TO authenticated;

-- 4. سياسات RLS لضمان ظهور الحسابات في قسم "حساباتي المشتراة"
ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_buyer_select_purchased" ON public.marketplace_accounts;
CREATE POLICY "accounts_buyer_select_purchased"
ON public.marketplace_accounts
FOR SELECT
TO authenticated
USING (
  buyer_id = auth.uid()
  OR owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.deals
    WHERE deals.account_id = marketplace_accounts.id
      AND deals.buyer_id = auth.uid()
      AND deals.status IN ('completed', 'buyer_inspecting', 'mediator_inspecting', 'active')
  )
);
