-- ==============================================================================
-- WASEET Platform - توحيد دورة حياة الحساب وسياسات RLS للبائع والمتجر
-- Migration 13: Unify Account Lifecycle (pending -> available -> sold -> completed)
-- انسخ هذا الكود بالكامل والصقه في Supabase SQL Editor ثم اضغط Run
-- ==============================================================================

BEGIN;

-- 1. التأكد من دالة التحقق من المدير public.is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role IN ('admin', 'mediator')
        OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
      )
  )
  OR lower(coalesce(auth.jwt() ->> 'email', '')) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');
$$;

-- 2. تحديث قيد الحالات المسموحة لجدول marketplace_accounts
DO $$
BEGIN
  ALTER TABLE public.marketplace_accounts DROP CONSTRAINT IF EXISTS marketplace_accounts_status_check;
  ALTER TABLE public.marketplace_accounts
    ADD CONSTRAINT marketplace_accounts_status_check
    CHECK (status IN (
      'pending',
      'available',
      'in_deal',
      'sold',
      'completed',
      'hidden',
      'rejected',
      'pending_verification',
      'pending_review',
      'approved'
    ));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. توحيد وتطبيع الحالات القديمة الموجودة في قاعدة البيانات
UPDATE public.marketplace_accounts
SET status = 'pending'
WHERE status IN ('pending_verification', 'pending_review');

UPDATE public.marketplace_accounts
SET status = 'available'
WHERE status = 'approved';

-- 4. ضبط وتفعيل أمان الصفوف (Row Level Security)
ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.marketplace_accounts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.marketplace_accounts TO authenticated;
GRANT ALL ON TABLE public.marketplace_accounts TO service_role;

-- حذف السياسات القديمة منعاً للتكرار أو التعارض
DROP POLICY IF EXISTS "accounts_public_select_storefront" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_public_select_available" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_seller_select_own" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_seller_update_own" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_seller_delete_own" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_buyer_select_own" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_admin_select_all" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_admin_update_all" ON public.marketplace_accounts;
DROP POLICY IF EXISTS "accounts_admin_delete_all" ON public.marketplace_accounts;

-- أ) سياسة المتجر العام للزوار والباحثين:
-- الزائر العام يرى فقط الحسابات المعتمدة (available) أو المعروضة والمتداولة،
-- بينما صاحب الحساب أو المدير يمكنه رؤية حسابه فوراً حتى لو كان pending.
CREATE POLICY "accounts_public_select_storefront"
ON public.marketplace_accounts
FOR SELECT
TO anon, authenticated
USING (
  status IN ('available', 'approved', 'sold', 'completed', 'in_deal')
  OR (auth.uid() IS NOT NULL AND seller_id = auth.uid())
  OR public.is_admin()
);

-- ب) سياسة البائع لعرض كافة حساباته (بما فيها الحسابات قيد الفحص pending والمرفوضة):
CREATE POLICY "accounts_seller_select_own"
ON public.marketplace_accounts
FOR SELECT
TO authenticated
USING (
  seller_id = auth.uid()
);

-- ج) سياسة البائع لتعديل حساباته الخاصة:
CREATE POLICY "accounts_seller_update_own"
ON public.marketplace_accounts
FOR UPDATE
TO authenticated
USING (
  seller_id = auth.uid()
)
WITH CHECK (
  seller_id = auth.uid()
);

-- د) سياسة البائع لحذف حسابه من المتجر:
CREATE POLICY "accounts_seller_delete_own"
ON public.marketplace_accounts
FOR DELETE
TO authenticated
USING (
  seller_id = auth.uid()
);

-- هـ) سياسة المشتري لرؤية الحسابات التي اشتراها:
CREATE POLICY "accounts_buyer_select_own"
ON public.marketplace_accounts
FOR SELECT
TO authenticated
USING (
  buyer_id = auth.uid()
);

-- و) سياسات المدير والوسيط الكاملة (قراءة، تعديل، حذف):
CREATE POLICY "accounts_admin_select_all"
ON public.marketplace_accounts
FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

CREATE POLICY "accounts_admin_update_all"
ON public.marketplace_accounts
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

CREATE POLICY "accounts_admin_delete_all"
ON public.marketplace_accounts
FOR DELETE
TO authenticated
USING (
  public.is_admin()
);

-- 5. تحديث دالة إحصائيات بائع المتجر لدعم الحالات الموحدة
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

  -- 4. برمجة نظام المستويات (Seller Tiers):
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
    v_tier_color := '#d97706';
  ELSE
    v_tier_name := 'بائع جديد';
    v_tier_icon := '🌱';
    v_tier_badge := 'new';
    v_tier_color := '#10b981';
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'name', coalesce(v_profile.name, v_profile.username, v_profile.full_name, 'مستخدم وسيط'),
    'avatar_url', coalesce(v_profile.avatar_url, 'assets/logo.png'),
    'email', coalesce(v_profile.email, ''),
    'role', coalesce(v_profile.role, 'user'),
    'is_verified', coalesce(v_profile.is_verified, true),
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

-- 6. تحديث كاش المخطط لدى PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
