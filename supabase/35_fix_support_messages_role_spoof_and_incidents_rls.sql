-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 35: SECURITY HARDENING FOR SUPPORT MESSAGES & INCIDENTS
-- Location: D:\waseet-app\supabase\35_fix_support_messages_role_spoof_and_incidents_rls.sql
-- Desktop Backup: D:\H P\سطح المكتب 2\35_FIX_SUPPORT_MESSAGES_ROLE_SPOOF_AND_INCIDENTS_RLS.sql
--
-- Partners: AntiGravity (Lead AI) & OpenCode (First Assistant)
-- Purpose:
-- 1. Fix WST-RLS-SUPPORT-ROLE-SPOOF-01: Prevent normal users from spoofing sender_role='admin'
-- 2. Restrict button_error_incidents SELECT/UPDATE to admins/mediators only
-- ==============================================================================

BEGIN;

-- 1. تحصين سياسة إدراج رسائل الدعم لمنع تزوير رتبة المرسل (sender_role spoofing)
DROP POLICY IF EXISTS "support_messages_broker_insert" ON public.support_messages;
CREATE POLICY "support_messages_broker_insert"
ON public.support_messages
FOR INSERT
TO authenticated
WITH CHECK (
    -- المستخدم العادي لا يمكنه إرسال الرسائل إلا في محادثته الخاصة وبرتبة 'user' فقط
    (user_id = auth.uid() AND sender_role = 'user')
    -- الوسيط الإقليمي المعتمد يمكنه الرد بصفة 'admin' على الرسائل الموجهة إليه فقط
    OR ((broker_id = auth.uid()::text OR broker_id = ('broker_' || auth.uid()::text)) AND sender_role = 'admin')
    -- المدير العام يمكنه الرد والتدخل في أي محادثة بصفة 'admin'
    OR (public.is_admin() AND sender_role = 'admin')
);

-- 2. تحصين جدول بلاغات أخطاء الأزرار (button_error_incidents)
-- السماح فقط للمدراء بقراءة كافة البلاغات لمنع تسريب بيانات الصفحات والأخطاء
DROP POLICY IF EXISTS "Allow authenticated read of button incidents" ON public.button_error_incidents;
CREATE POLICY "Allow authenticated read of button incidents"
ON public.button_error_incidents
FOR SELECT
TO authenticated
USING (public.is_admin());

-- السماح فقط للمدراء بتحديث حالة البلاغات
DROP POLICY IF EXISTS "Allow authenticated update of button incidents" ON public.button_error_incidents;
CREATE POLICY "Allow authenticated update of button incidents"
ON public.button_error_incidents
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

COMMIT;

NOTIFY pgrst, 'reload schema';
