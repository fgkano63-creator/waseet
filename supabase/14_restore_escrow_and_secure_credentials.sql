-- ==============================================================================
-- WASEET Platform - Migration 14
-- 1. هندسة سرية للبيانات الحساسة وكلمات المرور (marketplace_account_secrets)
-- 2. توفير Secure RPCs لجلب وحفظ بيانات الدخول للمصرح لهم حصراً
-- 3. تنظيف جدول marketplace_accounts من كلمات المرور المباشرة
-- 4. استعادة نظام تحويل أموال الوساطة كاملاً وبشكل آمن في release_escrow_deal_points
-- 5. استعادة نظام استرجاع الأموال عند الإلغاء في refund_escrow_deal_points
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. التأكد من دالة التحقق من المدير (public.is_admin)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role IN ('admin', 'mediator')
        OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
      )
  )
  OR lower(coalesce(auth.jwt() ->> 'email', '')) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role, anon;

-- ------------------------------------------------------------------------------
-- 2. إنشاء الجدول المنعزل للبيانات السرية (marketplace_account_secrets)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_account_secrets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
    seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    login_identifier text NOT NULL DEFAULT '',
    password text NOT NULL DEFAULT '',
    recovery_email text DEFAULT '',
    recovery_password text DEFAULT '',
    notes text DEFAULT '',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_marketplace_account_secrets_account UNIQUE (account_id)
);

ALTER TABLE public.marketplace_account_secrets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_account_secrets TO authenticated;
GRANT ALL ON TABLE public.marketplace_account_secrets TO service_role;

-- سياسات RLS لجدول الأسرار:
DROP POLICY IF EXISTS "account_secrets_admin_all" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_admin_all"
ON public.marketplace_account_secrets
FOR ALL
TO authenticated
USING ( public.is_admin() )
WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS "account_secrets_seller_select" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_seller_select"
ON public.marketplace_account_secrets
FOR SELECT
TO authenticated
USING ( seller_id = auth.uid() );

DROP POLICY IF EXISTS "account_secrets_seller_insert" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_seller_insert"
ON public.marketplace_account_secrets
FOR INSERT
TO authenticated
WITH CHECK ( seller_id = auth.uid() OR public.is_admin() );

DROP POLICY IF EXISTS "account_secrets_seller_update" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_seller_update"
ON public.marketplace_account_secrets
FOR UPDATE
TO authenticated
USING ( seller_id = auth.uid() OR public.is_admin() )
WITH CHECK ( seller_id = auth.uid() OR public.is_admin() );

-- ------------------------------------------------------------------------------
-- 3. نقل وترحيل البيانات الحساسة القديمة من marketplace_accounts إلى الجدول السري
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO public.marketplace_account_secrets (
        account_id,
        seller_id,
        login_identifier,
        password,
        recovery_email,
        recovery_password,
        notes
    )
    SELECT 
        m.id,
        m.seller_id,
        COALESCE(
            NULLIF(m.credentials->>'email_or_phone', ''),
            NULLIF(m.details->'credentials'->>'email_or_phone', ''),
            'غير مدخل'
        ),
        COALESCE(
            NULLIF(m.credentials->>'password', ''),
            NULLIF(m.details->'credentials'->>'password', ''),
            '••••••••'
        ),
        COALESCE(
            NULLIF(m.credentials->>'recovery_email', ''),
            NULLIF(m.details->'credentials'->>'recovery_email', ''),
            ''
        ),
        COALESCE(
            NULLIF(m.credentials->>'recovery_password', ''),
            NULLIF(m.details->'credentials'->>'recovery_password', ''),
            ''
        ),
        COALESCE(NULLIF(m.details->>'accountNotes', ''), '')
    FROM public.marketplace_accounts m
    WHERE (
        (m.credentials IS NOT NULL AND m.credentials <> '{}'::jsonb)
        OR (m.details->'credentials' IS NOT NULL AND m.details->'credentials' <> '{}'::jsonb)
    )
    ON CONFLICT (account_id) DO UPDATE SET
        login_identifier = EXCLUDED.login_identifier,
        password = EXCLUDED.password,
        recovery_email = EXCLUDED.recovery_email,
        recovery_password = EXCLUDED.recovery_password,
        updated_at = timezone('utc'::text, now());

    -- تنظيف وتطهير جدول marketplace_accounts من أي كلمات مرور أو بيانات اعتماد مكشوفة
    UPDATE public.marketplace_accounts
    SET credentials = '{}'::jsonb,
        details = details - 'credentials'
    WHERE credentials <> '{}'::jsonb OR details ? 'credentials';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Migration of credentials notice: %', SQLERRM;
END $$;

-- ------------------------------------------------------------------------------
-- 4. دالة الحفظ الآمن لبيانات الدخول (save_account_credentials_secure)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_account_credentials_secure(
    p_account_id uuid,
    p_email_or_phone text,
    p_password text,
    p_recovery_email text DEFAULT '',
    p_recovery_password text DEFAULT '',
    p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_acc public.marketplace_accounts%rowtype;
    v_caller_id uuid := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'أمني: يجب تسجيل الدخول لحفظ بيانات الدخول';
    END IF;

    SELECT * INTO v_acc FROM public.marketplace_accounts WHERE id = p_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الحساب المطلوب غير موجود';
    END IF;

    IF NOT (v_acc.seller_id = v_caller_id OR public.is_admin()) THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بتسجيل بيانات دخول هذا الحساب';
    END IF;

    INSERT INTO public.marketplace_account_secrets (
        account_id,
        seller_id,
        login_identifier,
        password,
        recovery_email,
        recovery_password,
        notes,
        updated_at
    ) VALUES (
        p_account_id,
        v_acc.seller_id,
        COALESCE(p_email_or_phone, ''),
        COALESCE(p_password, ''),
        COALESCE(p_recovery_email, ''),
        COALESCE(p_recovery_password, ''),
        COALESCE(p_notes, ''),
        timezone('utc'::text, now())
    )
    ON CONFLICT (account_id) DO UPDATE SET
        login_identifier = EXCLUDED.login_identifier,
        password = EXCLUDED.password,
        recovery_email = EXCLUDED.recovery_email,
        recovery_password = EXCLUDED.recovery_password,
        notes = EXCLUDED.notes,
        updated_at = timezone('utc'::text, now());

    -- التأكيد الصارم على خلو جدول السوق العام من بيانات الدخول
    UPDATE public.marketplace_accounts
    SET credentials = '{}'::jsonb,
        details = details - 'credentials'
    WHERE id = p_account_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_account_credentials_secure(uuid, text, text, text, text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. دالة الجلب الآمن لبيانات الدخول (get_account_credentials_secure)
-- لا تمنح البيانات إلا لـ: 1) المدير/الوسيط 2) البائع المالك 3) المشتري المعتمد للصفقة
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_account_credentials_secure(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_acc public.marketplace_accounts%rowtype;
    v_sec public.marketplace_account_secrets%rowtype;
    v_caller_id uuid := auth.uid();
    v_is_authorized boolean := false;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'أمني: يجب تسجيل الدخول للوصول لبيانات الحساب الحساسة';
    END IF;

    SELECT * INTO v_acc FROM public.marketplace_accounts WHERE id = p_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الحساب المطلوب غير موجود';
    END IF;

    -- 1. المدير والوسيط المعتمد
    IF public.is_admin() THEN
        v_is_authorized := true;
    -- 2. البائع صاحب الحساب الأصلي
    ELSIF v_acc.seller_id = v_caller_id THEN
        v_is_authorized := true;
    -- 3. المشتري المسجل رسمياً كمالك للحساب بعد الشراء
    ELSIF v_acc.buyer_id = v_caller_id THEN
        v_is_authorized := true;
    -- 4. المشتري الذي لديه صفقة جارية أو مكتملة لنفس الحساب
    ELSIF EXISTS (
        SELECT 1 FROM public.deals d
        WHERE d.account_id = p_account_id
          AND d.buyer_id = v_caller_id
          AND d.status IN ('completed', 'buyer_inspecting', 'mediator_inspecting', 'active')
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بالاطلاع على بيانات الدخول الخاصة بهذا الحساب';
    END IF;

    SELECT * INTO v_sec FROM public.marketplace_account_secrets WHERE account_id = p_account_id;
    IF NOT FOUND THEN
        -- التوافق في حال لم يتم العثور على سجل في جدول الأسرار
        RETURN jsonb_build_object(
            'success', true,
            'email_or_phone', COALESCE(v_acc.credentials->>'email_or_phone', 'غير مدخل'),
            'password', COALESCE(v_acc.credentials->>'password', '••••••••'),
            'recovery_email', COALESCE(v_acc.credentials->>'recovery_email', ''),
            'recovery_password', COALESCE(v_acc.credentials->>'recovery_password', ''),
            'notes', ''
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'email_or_phone', v_sec.login_identifier,
        'password', v_sec.password,
        'recovery_email', v_sec.recovery_email,
        'recovery_password', v_sec.recovery_password,
        'notes', v_sec.notes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_credentials_secure(uuid) TO authenticated;

-- التوافق مع أي استدعاءات قديمة لـ get_account_credentials
CREATE OR REPLACE FUNCTION public.get_account_credentials(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.get_account_credentials_secure(p_account_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_credentials(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. استعادة دالة تحرير أموال الوساطة المتكاملة (release_escrow_deal_points)
-- ------------------------------------------------------------------------------
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

    -- 1. خصم النقاط المحجوزة لدى المشتري (فك الحجز)
    UPDATE public.profiles
    SET locked_points = GREATEST(0, locked_points - v_deal.total_points),
        updated_at = v_now
    WHERE id = v_deal.buyer_id;

    -- 2. إرسال صافي النقاط المستحقة للبائع وتسجيل العملية المالية في السجل
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

    -- 3. إيداع عمولة المنصة في حساب المدير وتسجيلها
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

    -- 4. تحديث حالة الصفقة إلى مكتملة
    UPDATE public.deals
    SET status = 'completed',
        current_step = 4,
        updated_at = v_now
    WHERE id = p_deal_id;

    -- 5. تحديث الحساب إلى مباع (sold) وتوثيق معرف المشتري لتمكينه من رؤية بيانات الدخول
    IF v_deal.account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'sold',
            buyer_id = v_deal.buyer_id,
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
        'status', 'completed'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_escrow_deal_points(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. استعادة دالة إلغاء الصفقة واسترجاع النقاط بالكامل للمشتري (refund_escrow_deal_points)
-- ------------------------------------------------------------------------------
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
        RAISE EXCEPTION 'الصفقة المطلوبة غير موجودة';
    END IF;

    IF v_deal.status = 'completed' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء صفقة مكتملة تم تحرير نقاطها للبائع';
    END IF;

    IF v_deal.status = 'cancelled' THEN
        RAISE EXCEPTION 'تم إلغاء هذه الصفقة مسبقاً';
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- 1. إعادة كامل النقاط المحجوزة إلى الرصيد المتاح للمشتري
    UPDATE public.profiles
    SET locked_points = GREATEST(0, locked_points - v_deal.total_points),
        points_balance = points_balance + v_deal.total_points,
        wallet_balance = points_balance + v_deal.total_points,
        updated_at = v_now
    WHERE id = v_deal.buyer_id
    RETURNING points_balance INTO v_buyer_balance;

    -- 2. تسجيل قيد استرداد النقاط في السجل المالي للمشتري
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
        'استرداد كامل نقاط الصفقة الملغاة #' || v_deal.id
    );

    -- 3. تحديث حالة الصفقة إلى ملغاة
    UPDATE public.deals
    SET status = 'cancelled',
        current_step = 0,
        updated_at = v_now
    WHERE id = p_deal_id;

    -- 4. إعادة الحساب المعروض إلى السوق العام متاحاً للشراء من جديد
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
