-- WASEET Platform - الهجرة رقم 38: إضافة أعمدة حساب الاسترداد وتأمين وصول الوسطاء المعتمدين
-- 38_recovery_account_columns_and_access.sql
-- =================================================================================

BEGIN;

-- 1. إضافة أعمدة حساب الاسترداد إلى جدول marketplace_accounts في حال لم تكن موجودة
ALTER TABLE public.marketplace_accounts ADD COLUMN IF NOT EXISTS recovery_email text DEFAULT '';
ALTER TABLE public.marketplace_accounts ADD COLUMN IF NOT EXISTS recovery_password text DEFAULT '';

-- 2. تحديث دالة save_account_credentials_secure لتخزين بيانات الاسترداد في الأسرار وجدول الحسابات
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
SET search_path = public, pg_temp
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

    IF NOT (v_acc.seller_id = v_caller_id OR public.is_admin() OR public.is_regional_broker()) THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بتسجيل بيانات دخول هذا الحساب';
    END IF;

    -- حفظ في جدول الأسرار الحساسة
    INSERT INTO public.marketplace_account_secrets (
        account_id,
        login_identifier,
        password,
        recovery_email,
        recovery_password,
        notes,
        created_at,
        updated_at
    ) VALUES (
        p_account_id,
        COALESCE(p_email_or_phone, ''),
        COALESCE(p_password, ''),
        COALESCE(p_recovery_email, ''),
        COALESCE(p_recovery_password, ''),
        COALESCE(p_notes, ''),
        now(),
        now()
    )
    ON CONFLICT (account_id) DO UPDATE SET
        login_identifier = EXCLUDED.login_identifier,
        password = EXCLUDED.password,
        recovery_email = EXCLUDED.recovery_email,
        recovery_password = EXCLUDED.recovery_password,
        notes = EXCLUDED.notes,
        updated_at = now();

    -- تحديث أعمدة الاسترداد في جدول marketplace_accounts لتسهيل القراءة المصرحة
    UPDATE public.marketplace_accounts
    SET recovery_email = COALESCE(p_recovery_email, recovery_email, ''),
        recovery_password = COALESCE(p_recovery_password, recovery_password, '')
    WHERE id = p_account_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_account_credentials_secure(uuid, text, text, text, text, text) TO authenticated;

-- 3. تحديث دالة get_account_credentials_secure للسماح للوسيط الإقليمي والمدير والبائع
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

    -- 1. المدير العام والوسطاء الإقليميون المعتمدون
    IF public.is_admin() OR public.is_regional_broker() THEN
        v_is_authorized := true;
    -- 2. البائع صاحب الحساب الأصلي
    ELSIF v_acc.seller_id = v_caller_id THEN
        v_is_authorized := true;
    -- 3. المشتري المسجل كمالك للحساب بعد إتمام الشراء
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
            'email_or_phone', COALESCE(v_acc.credentials->>'email_or_phone', v_acc.details->'credentials'->>'email_or_phone', 'غير مدخل'),
            'password', COALESCE(v_acc.credentials->>'password', '••••••••'),
            'recovery_email', COALESCE(v_acc.recovery_email, v_acc.credentials->>'recovery_email', v_acc.details->'credentials'->>'recovery_email', v_acc.details->>'recovery_email', ''),
            'recovery_password', COALESCE(v_acc.recovery_password, v_acc.credentials->>'recovery_password', v_acc.details->'credentials'->>'recovery_password', v_acc.details->>'recovery_password', ''),
            'notes', COALESCE(v_acc.details->>'accountNotes', '')
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'email_or_phone', v_sec.login_identifier,
        'password', v_sec.password,
        'recovery_email', COALESCE(NULLIF(v_sec.recovery_email, ''), v_acc.recovery_email, v_acc.details->>'recovery_email', ''),
        'recovery_password', COALESCE(NULLIF(v_sec.recovery_password, ''), v_acc.recovery_password, v_acc.details->>'recovery_password', ''),
        'notes', v_sec.notes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_credentials_secure(uuid) TO authenticated;

COMMIT;
