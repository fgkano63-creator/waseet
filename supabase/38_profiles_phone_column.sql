-- WASEET Platform - الهجرة رقم 38: إضافة عمود phone لجدول profiles وصلاحيات التحديث
-- 38_profiles_phone_column.sql
-- =================================================================================

BEGIN;

-- 1. إضافة عمود phone في جدول profiles إذا لم يكن موجوداً
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text DEFAULT NULL;

-- 2. منح صلاحية التحديث للمستخدم المسجل (authenticated) على عمود phone
GRANT UPDATE (phone) ON TABLE public.profiles TO authenticated;

-- 3. توثيق العمود للتدقيق
COMMENT ON COLUMN public.profiles.phone IS 'User WhatsApp / phone number for direct broker coordination';

COMMIT;
