-- ==============================================================================
-- WASEET Platform - MIGRATION 44: Super Admin & Broker Privilege Escalation Shield
-- File: supabase/44_security_audit_super_admin_tamper_shield.sql
-- ==============================================================================
-- التحصين الأمني الشامل ضد التلاعب بصلاحيات المدير الأعلى (is_super_admin)
-- وصفة الوسيط (is_broker) ورصيد الضمان (escrow_balance) في جدول profiles
-- متوافق مع معايير Cloudflare Security Audit Skill
-- ==============================================================================

BEGIN;

-- 1. تحديث دالة منع التلاعب ببيانات البروفايل للإصدار الثالث (v3)
CREATE OR REPLACE FUNCTION public.prevent_profile_field_tampering_v3()
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

        -- أ) منع تزوير الرتبة وصلاحيات الإدارة العليا والوساطة قطعياً
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل رتبة الحساب (role)';
        END IF;

        IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل صلاحية المدير الأعلى (is_super_admin)';
        END IF;

        IF NEW.is_broker IS DISTINCT FROM OLD.is_broker THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل صفة الوسيط (is_broker)';
        END IF;

        -- ب) منع تزوير الأرصدة المالية والضمانات قطعياً
        IF NEW.points_balance IS DISTINCT FROM OLD.points_balance
           OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل الرصيد المالي أو رصيد النقاط';
        END IF;

        IF NEW.locked_points IS DISTINCT FROM OLD.locked_points THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل الرصيد المحجوز مباشرة';
        END IF;

        IF NEW.escrow_balance IS DISTINCT FROM OLD.escrow_balance THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل رصيد الضمان المحجوز مباشرة';
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

    IF NEW.locked_points IS DISTINCT FROM OLD.locked_points THEN
        NEW.escrow_balance := NEW.locked_points;
    ELSIF NEW.escrow_balance IS DISTINCT FROM OLD.escrow_balance THEN
        NEW.locked_points := NEW.escrow_balance;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- 2. ربط المشغل tr_prevent_profile_field_tampering_v3 بجدول profiles
DROP TRIGGER IF EXISTS tr_prevent_profile_field_tampering ON public.profiles;
DROP TRIGGER IF EXISTS tr_prevent_profile_field_tampering_v2 ON public.profiles;
DROP TRIGGER IF EXISTS tr_prevent_profile_field_tampering_v3 ON public.profiles;

CREATE TRIGGER tr_prevent_profile_field_tampering_v3
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_field_tampering_v3();

-- 3. عزل وتحديد الصلاحيات على مستوى الأعمدة (Column-Level Grants Hardening)
-- سحب صلاحية التعديل الشاملة وقصرها فقط على الأعمدة المسموحة للمستخدم العادي
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (name, avatar_url, country, phone, last_seen_at) ON TABLE public.profiles TO authenticated;

COMMIT;

-- إعادة تحميل كاش PostgREST
NOTIFY pgrst, 'reload schema';
