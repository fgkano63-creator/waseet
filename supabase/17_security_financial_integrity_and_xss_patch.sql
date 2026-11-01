-- =================================================================================
-- WASEET Platform - الهجرة رقم 17: ترقيع الأمان المالي والنزاهة وحظر تجاوز صلاحيات البائع
-- 17_security_financial_integrity_and_xss_patch.sql
-- Addresses:
-- 1. منع التلاعب بسعر الصفقات في lock_escrow_points_for_deal بمطابقة v_acc.seller_price
-- 2. حظر الترقية الذاتية لحالة الحساب ومنع تعديل الحسابات أثناء الصفقات في accounts_seller_update_own
-- 3. منع كشف بيانات الدخول للمشتري قبل انتهاء فحص الوسيط في get_account_credentials_secure
-- 4. تطهير دوال SECURITY DEFINER وضبط search_path
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- 1. ترقيع دالة قفل نقاط الوساطة lock_escrow_points_for_deal
-- التحقق الصارم من أن السعر المطلوب يطابق السعر المسجل للحساب في المتجر ومنع شراء البائع لحسابه
-- ---------------------------------------------------------------------------------
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
SET search_path = public, pg_temp
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

    -- 1. قفل صف الحساب في المتجر والتحقق من حالته وسعره المسجل رسمياً
    IF p_account_id IS NOT NULL THEN
        SELECT * INTO v_acc
        FROM public.marketplace_accounts
        WHERE id = p_account_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'الحساب المطلوب للشراء غير موجود بالمتجر';
        END IF;

        IF v_acc.status NOT IN ('available', 'approved') THEN
            RAISE EXCEPTION 'هذا الحساب محجوز حالياً في صفقة أخرى أو تم بيعه مسبقاً';
        END IF;

        -- التحقق الحاسم ضد تلاعب الأسعار: مطابقة السعر مع السعر المسجل في قاعدة البيانات
        IF v_acc.seller_price <> p_seller_price THEN
            RAISE EXCEPTION 'أمني: سعر الحساب غير مطابق للسعر المسجل في المتجر (المطلوب: % نقطة)', v_acc.seller_price;
        END IF;

        -- منع البائع من شراء حسابه بنفسه
        IF v_acc.seller_id = v_buyer_id THEN
            RAISE EXCEPTION 'أمني: لا يمكنك شراء حسابك الخاص المعروض للبيع';
        END IF;

        -- التحقق من معرف البائع
        IF p_seller_id IS NOT NULL AND v_acc.seller_id <> p_seller_id THEN
            RAISE EXCEPTION 'أمني: معرف البائع غير مطابق لسجل الحساب';
        END IF;
    END IF;

    -- التحقق من أن إجمالي النقاط يغطي السعر والعمولة
    IF p_total_points < (p_seller_price + p_fee) THEN
        RAISE EXCEPTION 'أمني: إجمالي النقاط المحجوزة غير كافٍ لتغطية سعر الحساب وعمولة المنصة';
    END IF;

    -- 2. قفل والتحقق من رصيد المشتري
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

    -- 3. خصم النقاط من الرصيد المتاح وإضافتها للرصيد المحجوز
    UPDATE public.profiles
    SET points_balance = points_balance - p_total_points,
        wallet_balance = points_balance - p_total_points,
        locked_points = locked_points + p_total_points,
        updated_at = v_now
    WHERE id = v_buyer_id
    RETURNING points_balance, locked_points INTO v_new_balance, v_new_locked;

    -- 4. إنشاء أو تحديث سجل الصفقة
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

    -- 5. إخفاء الحساب من المتجر وتحديث حالته إلى in_deal
    IF p_account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'in_deal',
            locked_at = v_now,
            locked_by = v_buyer_id,
            updated_at = v_now
        WHERE id = p_account_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', p_deal_id,
        'buyer_points_remaining', v_new_balance,
        'points_locked', v_new_locked,
        'status', 'mediator_inspecting'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_escrow_points_for_deal(text, uuid, uuid, numeric, numeric, numeric) TO authenticated;

-- ---------------------------------------------------------------------------------
-- 2. تحصين سياسة تعديل البائع لحساباته accounts_seller_update_own
-- حظر الترقية الذاتية إلى available أو approved وحظر تعديل الحسابات قيد الصفقات أو المباعة
-- ---------------------------------------------------------------------------------
DROP POLICY IF EXISTS "accounts_seller_update_own" ON public.marketplace_accounts;

CREATE POLICY "accounts_seller_update_own"
ON public.marketplace_accounts
FOR UPDATE
TO authenticated
USING (
  seller_id = auth.uid()
  AND status NOT IN ('in_deal', 'sold', 'completed')
)
WITH CHECK (
  seller_id = auth.uid()
  AND (
    public.is_admin()
    OR (
      status NOT IN ('available', 'approved', 'in_deal', 'sold', 'completed')
    )
  )
);

-- ---------------------------------------------------------------------------------
-- 3. تأمين كشف بيانات الدخول get_account_credentials_secure
-- المشتري لا يستلم البيانات إلا في مرحلة الاستلام buyer_inspecting أو بعد الإتمام completed
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_account_credentials_secure(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    -- 3. المشتري المسجل رسمياً كمالك للحساب بعد إتمام الشراء
    ELSIF (v_acc.buyer_id = v_caller_id OR v_acc.owner_id = v_caller_id) THEN
        v_is_authorized := true;
    -- 4. المشتري في صفقة جارية فقط إذا وصلت لمرحلة استلام المشتري أو مكتملة
    ELSIF EXISTS (
        SELECT 1 FROM public.deals d
        WHERE d.account_id = p_account_id
          AND d.buyer_id = v_caller_id
          AND d.status IN ('completed', 'buyer_inspecting')
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بالاطلاع على بيانات الدخول الخاصة بهذا الحساب';
    END IF;

    SELECT * INTO v_sec FROM public.marketplace_account_secrets WHERE account_id = p_account_id;
    IF NOT FOUND THEN
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

COMMIT;
