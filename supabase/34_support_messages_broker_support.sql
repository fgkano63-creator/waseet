-- ==============================================================================
-- WASEET Platform - Migration 34: Multi-Contact Support Messages & Broker Chat
-- ==============================================================================
-- يتيح للمستخدمين التواصل المنفصل والمباشر بنمط واتساب مع كل من:
-- 1) إدارة المنصة (المدير العام: broker_id = 'admin')
-- 2) الوسطاء الإقليميين المعتمدين في مختلف الدول (broker_id = 'broker_...' أو معرف الوسيط)
-- ==============================================================================

BEGIN;

-- 1. إضافة عمود broker_id لربط الرسالة بالجهة المستهدفة (افتراضياً 'admin')
ALTER TABLE public.support_messages 
ADD COLUMN IF NOT EXISTS broker_id text DEFAULT 'admin';

-- 2. فهرس مركب لتسريع جلب وتصفية محادثة المستخدم مع وسيط أو مدير محدد
CREATE INDEX IF NOT EXISTS idx_support_messages_user_broker 
ON public.support_messages(user_id, broker_id, created_at asc);

-- 3. صلاحيات الجداول للمصادق عليهم والضيوف
GRANT SELECT, INSERT ON TABLE public.support_messages TO authenticated, anon;

-- 4. تمكين الوسطاء الإقليميين والمستخدمين من قراءة والرد على الرسائل الموجهة إليهم
-- (ملاحظة: user_id نوعه uuid لذلك نقارنه مع auth.uid() مباشرة بدون تحويل لنص)
DROP POLICY IF EXISTS "support_messages_broker_select" ON public.support_messages;
CREATE POLICY "support_messages_broker_select"
ON public.support_messages
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR broker_id = auth.uid()::text 
    OR broker_id = ('broker_' || auth.uid()::text)
    OR public.is_admin()
);

DROP POLICY IF EXISTS "support_messages_broker_insert" ON public.support_messages;
CREATE POLICY "support_messages_broker_insert"
ON public.support_messages
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    OR broker_id = auth.uid()::text 
    OR broker_id = ('broker_' || auth.uid()::text)
    OR public.is_admin()
);

-- 5. التأكد من انضمام الجدول إلى البث المباشر (Realtime)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
