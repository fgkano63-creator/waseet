-- ==============================================================================
-- WASEET Platform - Database Hard Reset Script (تنظيف وإعادة ضبط شاملة)
-- ==============================================================================
-- ⚠️ تحذير: هذا السكربت يقوم بتنظيف شامل لقاعدة البيانات وتصفير الأرصدة
-- مع حماية صارمة ومطلقة لحسابات الوسطاء والإدارة المعتمدين.
-- ==============================================================================

BEGIN;

-- 0. تجاوز قيد حماية تعديل الأرصدة المؤقت لضمان تصفير النقاط بسلاسة
SET LOCAL app.internal_wallet_op = 'true';

-- ------------------------------------------------------------------------------
-- الخطوة 1: تفريغ الجداول التابعة للصفقات أولاً (لتفادي تعارض المفاتيح الأجنبية Foreign Keys)
-- ------------------------------------------------------------------------------
-- حذف رسائل شات الصفقات
DELETE FROM public.deal_messages;

-- حذف تقييمات الصفقات والوسطاء
DELETE FROM public.broker_reviews;

-- حذف سجل المعاملات المالية وحركات النقاط
DELETE FROM public.wallet_transactions;

-- حذف طلبات السحب
DELETE FROM public.withdrawals;

-- حذف طلبات شحن وإيداع النقاط
DELETE FROM public.deposit_requests;

-- حذف الإشعارات
DELETE FROM public.notifications;

-- ------------------------------------------------------------------------------
-- الخطوة 2: تفريغ جدول الصفقات بالكامل (Escrow Deals)
-- ------------------------------------------------------------------------------
DELETE FROM public.deals;

-- ------------------------------------------------------------------------------
-- الخطوة 3: مسح كافة الحسابات المعروضة للبيع بالكامل (المتاحة، المباعة، وقيد الفحص)
-- ------------------------------------------------------------------------------
-- حذف بيانات الاعتماد السرية للحسابات
DELETE FROM public.marketplace_account_secrets;

-- حذف جميع الحسابات المعروضة في المتجر
DELETE FROM public.marketplace_accounts;

-- ------------------------------------------------------------------------------
-- الخطوة 4: تصفير جميع أرصدة النقاط (المتاحة والمحجوزة = 0) لجميع الحسابات
-- ------------------------------------------------------------------------------
UPDATE public.profiles
SET 
    wallet_balance = 0,
    points_balance = 0,
    locked_points = 0,
    updated_at = timezone('utc'::text, now());

-- ------------------------------------------------------------------------------
-- الخطوة 5: حذف كافة المستخدمين العاديين مع حماية صارمة للوسطاء والإدارة
-- ------------------------------------------------------------------------------

-- إنشاء جدول مؤقت للمعرفات المحمية (الوسطاء المعتمدون + الإدارة)
CREATE TEMP TABLE IF NOT EXISTS protected_users_temp (
    id uuid PRIMARY KEY
) ON COMMIT DROP;

-- أ) حماية الحسابات من جدول profiles برتب الإدارة والوسطاء
INSERT INTO protected_users_temp (id)
SELECT DISTINCT id 
FROM public.profiles
WHERE 
    role IN ('admin', 'mediator', 'broker', 'regional_broker')
    OR id IN (SELECT user_id FROM public.regional_brokers WHERE user_id IS NOT NULL)
    OR lower(email) IN (SELECT lower(email) FROM public.regional_brokers WHERE email IS NOT NULL)
    OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
ON CONFLICT (id) DO NOTHING;

-- ب) حماية الحسابات من جدول التوثيق auth.users أيضاً
INSERT INTO protected_users_temp (id)
SELECT DISTINCT id 
FROM auth.users
WHERE 
    lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
    OR lower(email) IN (SELECT lower(email) FROM public.regional_brokers WHERE email IS NOT NULL)
ON CONFLICT (id) DO NOTHING;

-- ج) حذف المستخدمين العاديين من جدول profiles (باستثناء المحميين)
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM protected_users_temp);

-- د) حذف المستخدمين العاديين من جدول التوثيق auth.users (باستثناء المحميين)
DELETE FROM auth.users
WHERE id NOT IN (SELECT id FROM protected_users_temp);

COMMIT;

-- إعادة تحديث كاش الـ Schema لـ PostgREST
NOTIFY pgrst, 'reload schema';
