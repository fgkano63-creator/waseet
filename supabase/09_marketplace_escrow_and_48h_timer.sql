-- ==============================================================================
-- WASEET Platform - منطق حجز الحسابات، إخفائها من السوق، والمؤقت الزمني التلقائي (48 ساعة)
-- ==============================================================================

BEGIN;

-- 1. إضافة حقول وقت الحجز (locked_at) ومعرف الحاجز (locked_by) في جدولي الحسابات والصفقات
ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS locked_by uuid;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- تحديث قيود حالة الحسابات والصفقات لضمان التوافق التام
DO $$
BEGIN
  ALTER TABLE public.marketplace_accounts DROP CONSTRAINT IF EXISTS marketplace_accounts_status_check;
  ALTER TABLE public.marketplace_accounts
    ADD CONSTRAINT marketplace_accounts_status_check
    CHECK (status IN ('pending', 'pending_verification', 'pending_review', 'available', 'approved', 'in_deal', 'sold', 'hidden', 'rejected'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_status_check;
  ALTER TABLE public.deals
    ADD CONSTRAINT deals_status_check
    CHECK (status IN ('waiting_credentials', 'mediator_inspecting', 'buyer_inspecting', 'pending_middleman', 'active', 'pending', 'created', 'completed', 'cancelled', 'disputed'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. تحديث سياسة القراءة العامة للسوق: إظهار الحسابات المتاحة فقط (status = 'available') وإخفاء المحجوزة (in_deal) والمباعة (sold)
DROP POLICY IF EXISTS "accounts_public_select_available" ON public.marketplace_accounts;
CREATE POLICY "accounts_public_select_available"
ON public.marketplace_accounts
FOR SELECT
TO anon, authenticated
USING (
  status IN ('available', 'approved')
);

-- 3. دالة حجز الحساب والنقاط عند الشراء المبدئي (تخفي الحساب فوراً من السوق العام)
CREATE OR REPLACE FUNCTION public.lock_escrow_points_for_deal(
    p_deal_id text,
    p_account_id uuid,
    p_seller_id uuid,
    p_seller_price numeric,
    p_fee numeric,
    p_total_points numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id uuid := auth.uid();
    v_profile public.profiles%rowtype;
    v_acc public.marketplace_accounts%rowtype;
    v_new_balance numeric;
    v_new_locked numeric;
    v_now timestamp with time zone := timezone('utc'::text, now());
BEGIN
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لإتمام عملية الشراء';
    END IF;

    IF p_total_points <= 0 OR p_seller_price <= 0 OR p_fee < 0 THEN
        RAISE EXCEPTION 'قيم الصفقة غير صالحة';
    END IF;

    -- التحقق من أن الحساب متاح في السوق ولم يُحجز من مستخدم آخر
    IF p_account_id IS NOT NULL THEN
        SELECT * INTO v_acc
        FROM public.marketplace_accounts
        WHERE id = p_account_id
        FOR UPDATE;

        IF FOUND AND v_acc.status NOT IN ('available', 'approved') THEN
            RAISE EXCEPTION 'هذا الحساب محجوز حالياً في صفقة أخرى أو تم بيعه';
        END IF;
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_buyer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الملف الشخصي للمشتري غير موجود';
    END IF;

    IF v_profile.points_balance < p_total_points THEN
        RAISE EXCEPTION 'رصيد النقاط المتاح (% نقطة) غير كافٍ لشراء الحساب (% نقطة)', v_profile.points_balance, p_total_points;
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- خصم النقاط من الرصيد المتاح وتحويلها إلى الرصيد المحجوز
    UPDATE public.profiles
    SET points_balance = points_balance - p_total_points,
        wallet_balance = points_balance - p_total_points,
        locked_points = locked_points + p_total_points,
        updated_at = v_now
    WHERE id = v_buyer_id
    RETURNING points_balance, locked_points INTO v_new_balance, v_new_locked;

    -- إنشاء أو تحديث سجل الصفقة مع تسجيل وقت الحجز locked_at
    INSERT INTO public.deals (
        id,
        account_id,
        buyer_id,
        seller_id,
        seller_price,
        fee,
        total_points,
        status,
        current_step,
        locked_at,
        created_at,
        updated_at
    ) VALUES (
        p_deal_id,
        p_account_id,
        v_buyer_id,
        COALESCE(p_seller_id, v_acc.seller_id),
        p_seller_price,
        p_fee,
        p_total_points,
        'mediator_inspecting',
        2,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (id) DO UPDATE SET
        status = 'mediator_inspecting',
        locked_at = COALESCE(public.deals.locked_at, v_now),
        updated_at = v_now;

    -- تغيير حالة الحساب إلى محجوز (in_deal) ليختفي فوراً من السوق العام
    IF p_account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'in_deal',
            locked_at = v_now,
            locked_by = v_buyer_id,
            updated_at = v_now
        WHERE id = p_account_id;
    END IF;

    -- تسجيل حركة الحجز في سجل المحفظة
    INSERT INTO public.wallet_transactions (
        user_id,
        deal_id,
        amount,
        balance_after,
        type,
        status,
        description
    ) VALUES (
        v_buyer_id,
        p_deal_id,
        -p_total_points,
        v_new_balance,
        'escrow_lock',
        'completed',
        'حجز ' || p_total_points || ' نقطة في خزينة الوساطة لشراء حساب (صفقة #' || p_deal_id || ')'
    );

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', p_deal_id,
        'points_balance', v_new_balance,
        'locked_points', v_new_locked,
        'locked_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_escrow_points_for_deal(text, uuid, uuid, numeric, numeric, numeric) TO authenticated;

-- 4. دالة إتمام البيع بنجاح (يتحول الحساب إلى مباع sold ويختفي نهائياً من السوق)
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
    SELECT * INTO v_deal
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الصفقة المطلوبة غير موجودة';
    END IF;

    IF NOT (public.is_admin() OR v_deal.buyer_id = auth.uid()) THEN
        RAISE EXCEPTION 'أمني: فقط الوسيط المعتمد أو المشتري يمكنه تأكيد استلام الحساب وتحرير النقاط';
    END IF;

    IF v_deal.status = 'completed' THEN
        RAISE EXCEPTION 'تم إتمام هذه الصفقة وتحويل نقاطها مسبقاً';
    END IF;

    IF v_deal.status = 'cancelled' THEN
        RAISE EXCEPTION 'لا يمكن إتمام صفقة ملغاة';
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- 1. تخفيض النقاط المحجوزة لدى المشتري
    UPDATE public.profiles
    SET locked_points = GREATEST(0, locked_points - v_deal.total_points),
        updated_at = v_now
    WHERE id = v_deal.buyer_id;

    -- 2. إرسال صافي النقاط للبائع
    IF v_deal.seller_id IS NOT NULL THEN
        UPDATE public.profiles
        SET points_balance = points_balance + v_deal.seller_price,
            wallet_balance = points_balance + v_deal.seller_price,
            updated_at = v_now
        WHERE id = v_deal.seller_id
        RETURNING points_balance INTO v_seller_balance;

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

    -- 3. إيداع عمولة المنصة في حساب المدير
    SELECT id INTO v_admin_id
    FROM public.profiles
    WHERE role = 'admin'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL AND v_deal.fee > 0 THEN
        UPDATE public.profiles
        SET points_balance = points_balance + v_deal.fee,
            wallet_balance = points_balance + v_deal.fee,
            updated_at = v_now
        WHERE id = v_admin_id
        RETURNING points_balance INTO v_admin_balance;

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

    -- 4. تحديث حالة الصفقة إلى مكتملة والحساب إلى مباع (sold) ليختفي نهائياً من السوق
    UPDATE public.deals
    SET status = 'completed',
        current_step = 4,
        updated_at = v_now
    WHERE id = p_deal_id;

    IF v_deal.account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'sold',
            locked_at = NULL,
            locked_by = NULL,
            updated_at = v_now
        WHERE id = v_deal.account_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'seller_payout', v_deal.seller_price,
        'platform_fee', v_deal.fee
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_escrow_deal_points(text) TO authenticated;

-- 5. دالة رفض العملية من الوسيط (تُرجع النقاط للمشتري وتُعيد الحساب للسوق العام تلقائياً)
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
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: إلغاء الصفقة واسترجاع النقاط من صلاحيات الوسيط المعتمد فقط';
    END IF;

    SELECT * INTO v_deal
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الصفقة غير موجودة';
    END IF;

    IF v_deal.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'تم إنهاء هذه الصفقة مسبقاً';
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- إعادة النقاط المحجوزة إلى الرصيد المتاح للمشتري
    UPDATE public.profiles
    SET points_balance = points_balance + v_deal.total_points,
        wallet_balance = points_balance + v_deal.total_points,
        locked_points = GREATEST(0, locked_points - v_deal.total_points),
        updated_at = v_now
    WHERE id = v_deal.buyer_id
    RETURNING points_balance INTO v_buyer_balance;

    -- تسجيل حركة الاسترداد
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
        'escrow_refund',
        'completed',
        'استرداد كامل النقاط المحجوزة (' || v_deal.total_points || ' نقطة) بعد إلغاء الصفقة #' || v_deal.id
    );

    -- تحديث حالة الصفقة إلى ملغاة وإعادة الحساب كمتاح (available) في السوق العام تلقائياً
    UPDATE public.deals
    SET status = 'cancelled',
        updated_at = v_now
    WHERE id = p_deal_id;

    IF v_deal.account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'available',
            locked_at = NULL,
            locked_by = NULL,
            updated_at = v_now
        WHERE id = v_deal.account_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'refunded_points', v_deal.total_points,
        'buyer_new_balance', v_buyer_balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_escrow_deal_points(text) TO authenticated;

-- 6. المؤقت الزمني التلقائي (48 ساعة): إلغاء الحجوزات التي مر عليها يومان دون اكتمال،
--    واسترجاع النقاط لمحفظة المشتري، وإعادة الحساب إلى قسم "الحسابات المفحوصة" في السوق
CREATE OR REPLACE FUNCTION public.expire_stale_escrow_deals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deal record;
    v_buyer_balance numeric;
    v_expired_count integer := 0;
    v_now timestamp with time zone := timezone('utc'::text, now());
    v_cutoff timestamp with time zone := v_now - interval '48 hours';
BEGIN
    PERFORM set_config('app.internal_wallet_op', 'true', true);

    FOR v_deal IN
        SELECT *
        FROM public.deals
        WHERE status NOT IN ('completed', 'cancelled')
          AND COALESCE(locked_at, created_at) <= v_cutoff
        FOR UPDATE SKIP LOCKED
    LOOP
        -- 1. استرداد النقاط المحجوزة إلى محفظة المشتري
        IF v_deal.buyer_id IS NOT NULL AND COALESCE(v_deal.total_points, 0) > 0 THEN
            UPDATE public.profiles
            SET points_balance = points_balance + v_deal.total_points,
                wallet_balance = points_balance + v_deal.total_points,
                locked_points = GREATEST(0, locked_points - v_deal.total_points),
                updated_at = v_now
            WHERE id = v_deal.buyer_id
            RETURNING points_balance INTO v_buyer_balance;

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
                'escrow_refund',
                'completed',
                'إلغاء حجز تلقائي بعد مرور 48 ساعة دون اكتمال الصفقة #' || v_deal.id || ' واسترجاع (' || v_deal.total_points || ' نقطة)'
            );
        END IF;

        -- 2. إلغاء الصفقة
        UPDATE public.deals
        SET status = 'cancelled',
            updated_at = v_now
        WHERE id = v_deal.id;

        -- 3. إعادة الحساب إلى قسم "الحسابات المفحوصة" (available) في السوق العام
        IF v_deal.account_id IS NOT NULL THEN
            UPDATE public.marketplace_accounts
            SET status = 'available',
                locked_at = NULL,
                locked_by = NULL,
                updated_at = v_now
            WHERE id = v_deal.account_id
              AND status = 'in_deal';
        END IF;

        v_expired_count := v_expired_count + 1;
    END LOOP;

    -- 4. فك الحجز عن أي حساب معلق بوضع in_deal لأكثر من 48 ساعة دون صفقة نشطة
    UPDATE public.marketplace_accounts ma
    SET status = 'available',
        locked_at = NULL,
        locked_by = NULL,
        updated_at = v_now
    WHERE ma.status = 'in_deal'
      AND COALESCE(ma.locked_at, ma.updated_at, ma.created_at) <= v_cutoff
      AND NOT EXISTS (
          SELECT 1 FROM public.deals d
          WHERE d.account_id = ma.id
            AND d.status NOT IN ('completed', 'cancelled')
      );

    RETURN jsonb_build_object(
        'success', true,
        'expired_count', v_expired_count,
        'checked_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_escrow_deals() TO anon, authenticated, service_role;

-- 7. جدولة فحص تلقائي كل 15 دقيقة عبر pg_cron (إذا كانت الإضافة مفعلة في Supabase)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'waseet-expire-48h-deals',
            '*/15 * * * *',
            'SELECT public.expire_stale_escrow_deals();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
