-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 32: SECURITY AUDIT, INJECTION & XSS PROTECTION
-- التحصين الأمني الشامل ضد ثغرات الحقن (SQLi) وتزوير الصلاحيات واختراق الـ RLS
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. قيود التحقق الصارمة على طول ومحتوى نصوص جدول profiles لمنع هجمات الحقن
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_name_length_check,
    ADD CONSTRAINT profiles_name_length_check
    CHECK (length(trim(name)) >= 2 AND length(name) <= 100);

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_country_length_check,
    ADD CONSTRAINT profiles_country_length_check
    CHECK (country IS NULL OR length(country) <= 10);

-- ------------------------------------------------------------------------------
-- 2. صمام أمان شامل ضد التلاعب بالحقول الحساسة (Comprehensive Profile Tampering Guard)
-- يمنع قطعياً أي مستخدم من تعديل رصيده، رتبته، حالة توثيقه، أو معرفه
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_field_tampering_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- إذا كان الاستدعاء من مستخدم عادي عبر المتصفح (ليس عملية RPC داخلية موثوقة ولا مديراً)
    IF auth.uid() IS NOT NULL
       AND NOT public.is_admin()
       AND coalesce(current_setting('app.internal_wallet_op', true), '') <> 'true' THEN

        -- أ) منع تزوير الرتبة
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل رتبة الحساب (role)';
        END IF;

        -- ب) منع تزوير الأرصدة المالية قطعياً
        IF NEW.points_balance IS DISTINCT FROM OLD.points_balance
           OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل الرصيد المالي أو رصيد النقاط';
        END IF;

        IF NEW.locked_points IS DISTINCT FROM OLD.locked_points THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل الرصيد المحجوز مباشرة';
        END IF;

        -- ج) منع تزوير المعرف والبريد
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتغيير معرف الحساب';
        END IF;

        IF NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتغيير البريد الإلكتروني الأساسي';
        END IF;

        -- د) منع تزوير التوثيق وحالة الـ KYC
        IF NEW.is_fully_verified IS DISTINCT FROM OLD.is_fully_verified
           OR NEW.kyc_type IS DISTINCT FROM OLD.kyc_type
           OR NEW.kyc_document_url IS DISTINCT FROM OLD.kyc_document_url
           OR NEW.kyc_verified_at IS DISTINCT FROM OLD.kyc_verified_at
           OR NEW.kyc_verified_by IS DISTINCT FROM OLD.kyc_verified_by THEN
            RAISE EXCEPTION 'أمني: حقول التوثيق (KYC) لا يعدلها إلا مدير المنصة المعتمد';
        END IF;
    END IF;

    -- مواءمة الرصيدين للتوافق القديم
    IF NEW.points_balance IS DISTINCT FROM OLD.points_balance THEN
        NEW.wallet_balance := NEW.points_balance;
    ELSIF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
        NEW.points_balance := NEW.wallet_balance;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_profile_field_tampering ON public.profiles;
DROP TRIGGER IF EXISTS tr_prevent_profile_field_tampering_v2 ON public.profiles;
CREATE TRIGGER tr_prevent_profile_field_tampering_v2
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_field_tampering_v2();

-- ------------------------------------------------------------------------------
-- 3. عزل سياسات RLS لجدول الصفقات (public.deals)
-- ضمان عدم إمكانية أي مستخدم قراءة صفقات لا تخصه
-- ------------------------------------------------------------------------------
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deals_select_participants_or_admin" ON public.deals;
CREATE POLICY "deals_select_participants_or_admin"
ON public.deals
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR buyer_id = auth.uid()
    OR seller_id = auth.uid()
    OR assigned_broker_id = auth.uid()
);

-- ------------------------------------------------------------------------------
-- 4. إحكام الحماية على جدول سجل المعاملات المالية (public.wallet_transactions)
-- حظر أي إدخال أو تعديل مباشر من المتصفح وحصره بالدوال الآمنة (RPC)
-- ------------------------------------------------------------------------------
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wallet_transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.wallet_transactions FROM authenticated;
GRANT SELECT ON TABLE public.wallet_transactions TO authenticated;
GRANT ALL ON TABLE public.wallet_transactions TO service_role;

DROP POLICY IF EXISTS "transactions_select_policy" ON public.wallet_transactions;
CREATE POLICY "transactions_select_policy"
ON public.wallet_transactions
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR public.is_admin()
);

-- ------------------------------------------------------------------------------
-- 5. إحكام الحماية على جدول الوسطاء الإقليميين (public.regional_brokers)
-- ------------------------------------------------------------------------------
ALTER TABLE public.regional_brokers ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.regional_brokers FROM authenticated;
GRANT SELECT ON TABLE public.regional_brokers TO authenticated, anon;
GRANT ALL ON TABLE public.regional_brokers TO service_role;

DROP POLICY IF EXISTS "regional_brokers_admin_all" ON public.regional_brokers;
CREATE POLICY "regional_brokers_admin_all"
ON public.regional_brokers
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

COMMIT;
