-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 33: SECURITY AUDIT HARDENING & CRON AUTOMATION
-- التحصين الأمني الشامل ضد ثغرات الحقن (XSS/SQLi) وجدولة فحص الـ 48 ساعة
-- ==============================================================================

BEGIN;

-- 1. قيود التحقق الصارمة على عناوين الحسابات (منع وسوم HTML وحقن النصوص في السوق)
ALTER TABLE public.marketplace_accounts
    DROP CONSTRAINT IF EXISTS marketplace_accounts_title_length_check,
    ADD CONSTRAINT marketplace_accounts_title_length_check
    CHECK (length(trim(title)) >= 2 AND length(title) <= 200);

ALTER TABLE public.marketplace_accounts
    DROP CONSTRAINT IF EXISTS marketplace_accounts_no_script_tags_check,
    ADD CONSTRAINT marketplace_accounts_no_script_tags_check
    CHECK (title !~* '<script|javascript:|onload=|onerror=|<img|<svg');

-- 2. قيود التحقق الصارمة على بيانات الاسترداد السرية (marketplace_account_secrets)
ALTER TABLE public.marketplace_account_secrets
    DROP CONSTRAINT IF EXISTS secrets_recovery_email_length_check,
    ADD CONSTRAINT secrets_recovery_email_length_check
    CHECK (recovery_email IS NULL OR length(recovery_email) <= 150);

ALTER TABLE public.marketplace_account_secrets
    DROP CONSTRAINT IF EXISTS secrets_recovery_email_no_script_check,
    ADD CONSTRAINT secrets_recovery_email_no_script_check
    CHECK (recovery_email IS NULL OR recovery_email !~* '<script|<img|<svg|onerror=|javascript:');

ALTER TABLE public.marketplace_account_secrets
    DROP CONSTRAINT IF EXISTS secrets_recovery_password_length_check,
    ADD CONSTRAINT secrets_recovery_password_length_check
    CHECK (recovery_password IS NULL OR length(recovery_password) <= 200);

-- 3. إضافة عمود سبب الرفض إن لم يكن موجوداً مسبقاً وتقييد طوله لمنع حشو البيانات
ALTER TABLE public.marketplace_accounts
    ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.marketplace_accounts
    DROP CONSTRAINT IF EXISTS marketplace_accounts_rejection_reason_check,
    ADD CONSTRAINT marketplace_accounts_rejection_reason_check
    CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 500);

ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 4. صمام أمان لدالة expire_stale_escrow_deals لضمان أمان search_path
ALTER FUNCTION public.expire_stale_escrow_deals() SET search_path = public, pg_temp;

COMMIT;

-- 5. تفعيل مجدول مهام PostgreSQL (pg_cron) لضمان تنفيذ فحص الـ 48 ساعة تلقائياً
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'waseet_auto_expire_stale_deals_48h') THEN
        PERFORM cron.unschedule('waseet_auto_expire_stale_deals_48h');
    END IF;

    PERFORM cron.schedule(
        'waseet_auto_expire_stale_deals_48h',
        '*/10 * * * *',
        'SELECT public.expire_stale_escrow_deals();'
    );
    RAISE NOTICE 'تم تفعيل وجدولة دالة فحص الـ 48 ساعة بنجاح عبر pg_cron.';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'تنبيه: تعذر تفعيل pg_cron تلقائياً (% - %). يتم الاعتماد على الاستدعاء الدوري السحابي.', SQLSTATE, SQLERRM;
END;
$$;
