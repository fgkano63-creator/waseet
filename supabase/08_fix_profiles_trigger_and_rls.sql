-- ==============================================================================
-- WASEET Platform - إصلاح مشغّل إنشاء الملف الشخصي التلقائي وسياسات RLS لجدول profiles
-- ==============================================================================

BEGIN;

-- 1. تحديث دالة التحقق من المدير (is_admin)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role = 'admin'
        OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com')
      )
  )
  OR lower(coalesce(auth.jwt() ->> 'email', '')) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com');
$$;

-- 2. منح الصلاحيات اللازمة على جدول profiles للأدوار المسجلة والزوار
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

-- 3. تفعيل RLS وتحديث سياسات الأمان لجدول profiles لمنع أخطاء 403 Forbidden
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

-- أ) سياسة القراءة: السماح بقراءة بيانات الملفات الشخصية (لعرض أسماء البائعين والمشترين والمدير)
CREATE POLICY "profiles_select_all"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);

-- ب) سياسة الإدراج: السماح للمستخدم المسجل بإدراج ملفه الشخصي المطابق لمعرفه فقط أو للمدير
CREATE POLICY "profiles_insert_self"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id OR public.is_admin()
);

-- ج) سياسة التحديث: السماح للمستخدم بتحديث ملفه الشخصي أو للمدير بتحديث السجلات
CREATE POLICY "profiles_update_self"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = id OR public.is_admin()
)
WITH CHECK (
  auth.uid() = id OR public.is_admin()
);

-- 4. تحديث الـ Trigger التلقائي لإنشاء الـ Profile فور التسجيل في auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := 'user';
BEGIN
  IF lower(coalesce(new.email, '')) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com') THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, email, name, avatar_url, role, wallet_balance, points_balance, locked_points)
  VALUES (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    v_role,
    0,
    0,
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    name = coalesce(nullif(excluded.name, ''), public.profiles.name),
    avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
    role = CASE
      WHEN lower(excluded.email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com') THEN 'admin'
      ELSE public.profiles.role
    END,
    updated_at = timezone('utc'::text, now());

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. مزامنة جميع المستخدمين الحاليين في auth.users داخل جدول public.profiles فوراً
INSERT INTO public.profiles (id, email, name, avatar_url, role, wallet_balance, points_balance, locked_points)
SELECT
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(coalesce(u.email, 'user'), '@', 1)),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', ''),
  CASE
    WHEN lower(coalesce(u.email, '')) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com') THEN 'admin'
    ELSE 'user'
  END,
  0,
  0,
  0
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = excluded.email,
  name = coalesce(nullif(excluded.name, ''), public.profiles.name),
  avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
  role = CASE
    WHEN lower(excluded.email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com') THEN 'admin'
    ELSE public.profiles.role
  END,
  updated_at = timezone('utc'::text, now());

COMMIT;
NOTIFY pgrst, 'reload schema';
