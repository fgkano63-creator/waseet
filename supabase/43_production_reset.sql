-- ==============================================================================
-- WASEET Platform - Go-Live Production Hard Reset Script
-- File: 43_production_reset.sql
-- ==============================================================================
-- الغرض: تصفير قاعدة البيانات للإنتاج (مسح بيانات الاختبار والرسائل والصفقات
-- والأرصدة الوهمية) مع الاحتفاظ بالوسطاء والمدراء وتصفير كافة الأرصدة للبدء الحقيقي.
-- ==============================================================================

BEGIN;

-- 1. إضافة أعمدة التوافق المباشر إلى جدول profiles لضمان تنفيذ استعلامات المدير المعيارية
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_broker boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS escrow_balance numeric DEFAULT 0;

-- 2. تحديث وتعيين حالة الوسطاء والمدراء بدقة وفق بيانات المنصة
UPDATE public.profiles
SET 
    is_super_admin = (
        role IN ('admin', 'mediator') 
        OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
    ),
    is_broker = (
        role IN ('broker', 'regional_broker') 
        OR id IN (SELECT user_id FROM public.regional_brokers WHERE user_id IS NOT NULL) 
        OR lower(email) IN (SELECT lower(email) FROM public.regional_brokers WHERE email IS NOT NULL)
    ),
    escrow_balance = COALESCE(locked_points, 0);

-- 3. تجاوز حماية الأرصدة مؤقتاً لتصفير النقاط والضمانات المالية
SET LOCAL app.internal_wallet_op = 'true';

-- 4. مسح الجداول التابعة وسجلات الشات ورسائل الاختبار
DELETE FROM public.deal_messages;

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_messages') THEN
        DELETE FROM public.support_messages;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
        EXECUTE 'TRUNCATE TABLE public.messages RESTART IDENTITY CASCADE';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_rooms') THEN
        EXECUTE 'TRUNCATE TABLE public.chat_rooms RESTART IDENTITY CASCADE';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'escrow_transactions') THEN
        EXECUTE 'TRUNCATE TABLE public.escrow_transactions RESTART IDENTITY CASCADE';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'listings') THEN
        EXECUTE 'TRUNCATE TABLE public.listings RESTART IDENTITY CASCADE';
    END IF;
END $$;

-- 5. مسح المعاملات والتقييمات وطلبات الإيداع والسحب التجريبية
DELETE FROM public.broker_reviews;
DELETE FROM public.withdrawals;
DELETE FROM public.deposit_requests;
DELETE FROM public.wallet_transactions;
DELETE FROM public.notifications;

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'button_error_alerts') THEN
        DELETE FROM public.button_error_alerts;
    END IF;
END $$;

-- 6. تفريغ صفقات الوساطة بالكامل
DELETE FROM public.deals;

-- 7. مسح بيانات الدخول السرية وحسابات الاختبار من المتجر
DELETE FROM public.marketplace_account_secrets;
DELETE FROM public.marketplace_accounts;

-- 8. كود المدير المعياري لحذف المستخدمين العاديين والاحتفاظ بالوسطاء والمدراء
DELETE FROM public.profiles 
WHERE is_broker = false 
  AND is_super_admin = false
  AND role NOT IN ('admin', 'mediator', 'broker', 'regional_broker')
  AND lower(email) NOT IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');

-- 9. حذف الحسابات العادية المعزولة من جدول التوثيق auth.users للحفاظ على التزامن الكامل
DELETE FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);

-- 10. تصفير كافة الأرصدة (المتاحة والمحجوزة) للبدء برصيد 0 نقي في الإنتاج
UPDATE public.profiles 
SET 
    wallet_balance = 0, 
    escrow_balance = 0,
    points_balance = 0,
    locked_points = 0,
    updated_at = timezone('utc'::text, now());

COMMIT;

-- إعادة تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';
