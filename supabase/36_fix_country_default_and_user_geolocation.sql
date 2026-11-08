-- ==============================================================================
-- WASEET Platform - Migration 36: Fix Country Default & Enable Geolocation
-- ==============================================================================
-- الإصلاح الجذري لمشكلة تعيين دولة الجزائر (DZ) كقيمة صلبة وافتراضية لجميع المستخدمين:
-- 1. إزالة القيمة الافتراضية 'DZ' من عمود country في جدول public.profiles وجعلها NULL
-- 2. تحديث المشغل التلقائي handle_new_user() لاستخراج الدولة من بيانات التسجيل أو إبقائها فارغة
-- 3. السماح بتحديث الدولة تلقائياً عبر Geolocation أو يدوياً عبر الملف الشخصي
-- ==============================================================================

BEGIN;

-- 1. إزالة القيمة الافتراضية 'DZ' من جدول profiles
ALTER TABLE public.profiles ALTER COLUMN country DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN country SET DEFAULT NULL;

-- 2. تحديث عمود country في جدول profiles ليقبل القيم الفارغة بصورة صريحة
COMMENT ON COLUMN public.profiles.country IS 'رمز الدولة المعتمد بصيغة ISO-2 (مثل DZ, EG, SA, SY, LY). يكون فارغاً حتى يتم تحديده تلقائياً عبر GeoIP أو يدوياً من المستخدم.';

-- 3. تحديث مشغل إنشاء المستخدمين الجدد handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := 'user';
  v_country text := nullif(upper(trim(coalesce(new.raw_user_meta_data->>'country', ''))), '');
BEGIN
  -- التحقق من بريد المدير العام
  IF lower(coalesce(new.email, '')) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com') THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (
    id, 
    email, 
    name, 
    avatar_url, 
    role, 
    country, 
    wallet_balance, 
    points_balance, 
    locked_points
  )
  VALUES (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    v_role,
    v_country,
    0,
    0,
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    name = coalesce(nullif(excluded.name, ''), public.profiles.name),
    avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
    country = coalesce(public.profiles.country, excluded.country),
    role = CASE
      WHEN lower(excluded.email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com') THEN 'admin'
      ELSE public.profiles.role
    END,
    updated_at = timezone('utc'::text, now());

  RETURN new;
END;
$$;

-- 4. التأكد من منح المستخدم المصادق عليه صلاحية تحديث دولته بنفسه
GRANT UPDATE (country) ON TABLE public.profiles TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
