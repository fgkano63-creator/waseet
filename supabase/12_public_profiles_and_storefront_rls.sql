-- ==============================================================================
-- WASEET Platform - تفعيل أذونات المتاجر والملفات الشخصية العامة وسياسات RLS
-- Migration 12: Public Profiles, Storefronts & Seller Tiers
-- انسخ هذا الكود بالكامل والصقه في Supabase SQL Editor ثم اضغط Run
-- ==============================================================================

BEGIN;

-- 1. التأكد من منح القراءة العامة للجميع (anon و authenticated) على جدول profiles
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;

-- التأكد من وجود سياسة SELECT لجدول profiles تسمح بقراءة اسم وصورة ودور المستخدم
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'profiles_select_all'
  ) THEN
    CREATE POLICY "profiles_select_all"
    ON public.profiles
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END $$;

-- 2. تحديث سياسات RLS على جدول marketplace_accounts للسماح بتصفح معروضات المتاجر وإحصائيات البيع
GRANT SELECT ON TABLE public.marketplace_accounts TO anon, authenticated;

DROP POLICY IF EXISTS "accounts_public_select_available" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_public_select_storefront" ON public.marketplace_accounts;

CREATE POLICY "accounts_public_select_storefront"
ON public.marketplace_accounts
FOR SELECT
TO anon, authenticated
USING (
  -- الحسابات المعروضة للبيع أو المحجوزة أو المباعة (لحساب إحصائيات المبيعات ومتجر البائع)
  status IN ('available', 'approved', 'sold', 'completed', 'in_deal')
);

-- 3. دالة RPC آمنة لجلب إحصائيات الملف الشخصي ومستوى البائع بدقة من قاعدة البيانات
CREATE OR REPLACE FUNCTION public.get_seller_profile_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_sold integer := 0;
  v_bought integer := 0;
  v_active integer := 0;
  v_tier_name text := 'بائع جديد';
  v_tier_icon text := '🌱';
  v_tier_badge text := 'new';
  v_tier_color text := '#94a3b8';
BEGIN
  -- جلب بيانات الملف الشخصي
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

  -- 1. عدد الحسابات المباعة (seller_id = p_user_id والحالة sold أو completed)
  SELECT count(*) INTO v_sold
  FROM public.marketplace_accounts
  WHERE seller_id = p_user_id
    AND status IN ('sold', 'completed');

  -- 2. عدد الحسابات المشتراة (buyer_id = p_user_id)
  SELECT count(*) INTO v_bought
  FROM public.marketplace_accounts
  WHERE buyer_id = p_user_id
    AND status IN ('sold', 'completed');

  -- إذا لم تسجل في marketplace_accounts، نفحص جدول deals كاحتياط
  IF v_bought = 0 THEN
    SELECT count(*) INTO v_bought
    FROM public.deals
    WHERE buyer_id = p_user_id
      AND status = 'completed';
  END IF;

  -- 3. الحسابات المعروضة حالياً بالمتجر (status IN ('available', 'approved'))
  SELECT count(*) INTO v_active
  FROM public.marketplace_accounts
  WHERE seller_id = p_user_id
    AND status IN ('available', 'approved');

  -- 4. برمجة نظام المستويات (Seller Tiers / Badges):
  -- >= 100  -> المستوى الذهبي 🥇 (Gold)
  -- >= 50   -> المستوى البلاتيني 💎 (Platinum)
  -- >= 10   -> المستوى الفضي 🥈 (Silver)
  -- 1 .. 9  -> المستوى النحاسي 🥉 (Copper)
  -- 0       -> بائع جديد (New Seller)
  IF v_sold >= 100 THEN
    v_tier_name := 'المستوى الذهبي';
    v_tier_icon := '🥇';
    v_tier_badge := 'gold';
    v_tier_color := '#f59e0b';
  ELSIF v_sold >= 50 THEN
    v_tier_name := 'المستوى البلاتيني';
    v_tier_icon := '💎';
    v_tier_badge := 'platinum';
    v_tier_color := '#06b6d4';
  ELSIF v_sold >= 10 THEN
    v_tier_name := 'المستوى الفضي';
    v_tier_icon := '🥈';
    v_tier_badge := 'silver';
    v_tier_color := '#94a3b8';
  ELSIF v_sold >= 1 THEN
    v_tier_name := 'المستوى النحاسي';
    v_tier_icon := '🥉';
    v_tier_badge := 'copper';
    v_tier_color := '#b45309';
  ELSE
    v_tier_name := 'بائع جديد';
    v_tier_icon := '🌱';
    v_tier_badge := 'new';
    v_tier_color := '#64748b';
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'user_found', (v_profile.id IS NOT NULL),
    'name', coalesce(v_profile.name, 'مستخدم وسيط'),
    'avatar_url', v_profile.avatar_url,
    'created_at', v_profile.created_at,
    'role', coalesce(v_profile.role, 'user'),
    'sold_count', v_sold,
    'bought_count', v_bought,
    'active_count', v_active,
    'tier_name', v_tier_name,
    'tier_icon', v_tier_icon,
    'tier_badge', v_tier_badge,
    'tier_color', v_tier_color
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_profile_stats(uuid) TO anon, authenticated;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
