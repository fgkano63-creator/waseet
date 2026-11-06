-- ==============================================================================
-- WASEET Platform - Migration 30: Fix Avatars Storage & Public Permissions (RLS)
-- ==============================================================================
-- يعالج أخطاء 403 Forbidden عبر:
-- 1) ضبط صلاحيات القراءة العامة (SELECT) لحاوية التخزين avatars في storage.objects.
-- 2) منح أذونات القراءة العامة (SELECT) على جداول وعروض الوسطاء والملفات الشخصية (profiles, regional_brokers, public_profiles, public_regional_brokers).
-- 3) إتاحة القراءة الآمنة لزوار الموقع غير المسجلين (anon) والمستخدمين المسجلين (authenticated).
-- آمن لإعادة التشغيل (Idempotent).
-- ==============================================================================

BEGIN;

-- 1. منح أذونات المخطط العام Schema Usage
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. منح أذونات القراءة على الجداول والعروض العامة لغير المسجلين والمسجلين
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT SELECT ON TABLE public.regional_brokers TO anon, authenticated;
GRANT SELECT ON TABLE public.public_profiles TO anon, authenticated;
GRANT SELECT ON TABLE public.public_regional_brokers TO anon, authenticated;

-- 3. التأكد من وجود سلة تخزين الصور الرمزية avatars وجعلها عامة (Public Bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    true,
    5242880, -- 5MB كحد أقصى لكل صورة
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

-- 4. سياسات RLS لسلة التخزين storage.objects
GRANT ALL ON TABLE storage.buckets TO anon, authenticated, service_role;
GRANT ALL ON TABLE storage.objects TO anon, authenticated, service_role;

-- أ) سياسة القراءة العامة بدون أي قيود على سلة avatars
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_select_all" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

CREATE POLICY "avatars_public_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- ب) سياسة الرفع للمستخدمين المسجلين فقط
DROP POLICY IF EXISTS "avatars_authenticated_insert" ON storage.objects;
CREATE POLICY "avatars_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- ج) سياسة التعديل للمستخدمين المسجلين فقط
DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;
CREATE POLICY "avatars_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

-- د) سياسة الحذف
DROP POLICY IF EXISTS "avatars_authenticated_delete" ON storage.objects;
CREATE POLICY "avatars_authenticated_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');

COMMIT;
NOTIFY pgrst, 'reload schema';
