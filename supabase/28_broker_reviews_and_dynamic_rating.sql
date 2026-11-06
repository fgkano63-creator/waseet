-- =================================================================================
-- 28. نظام تقييم الوسطاء الديناميكي وتجريد الوسطاء الوهميين وتأمين حذف الحسابات
-- (Broker Reviews, Dynamic Rating & Completed Deals, Demote Fake Brokers, Delete Account RPC)
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- 1. طرد وتجريد الوسطاء الوهميين: zaki 0000 و إبراهيم جلالي (الجزائر DZ)
-- وإعادتهم فوراً إلى رتبة مستخدم عادي 'user'
-- ---------------------------------------------------------------------------------
UPDATE public.profiles
SET role = 'user',
    avatar_url = regexp_replace(avatar_url, '#waseet_broker=[^&]*', '', 'g'),
    updated_at = now()
WHERE (
    name ILIKE '%zaki%0000%' 
    OR email ILIKE '%z1a2k4i5%'
    OR (name ILIKE '%إبراهيم جلالي%' AND (country = 'DZ' OR country IS NULL))
)
AND role IN ('regional_broker', 'broker');

DELETE FROM public.regional_brokers
WHERE name ILIKE '%zaki%0000%'
   OR email ILIKE '%z1a2k4i5%'
   OR (name ILIKE '%إبراهيم جلالي%' AND (country = 'DZ' OR country IS NULL));

-- ---------------------------------------------------------------------------------
-- 2. دالة الحذف النهائي والفعلي للحساب من قاعدة البيانات (DELETE RPC)
-- تحذف الحساب والأسرار التابعة له بشكل جذري وتمنع بقاءه كـ Ghost Listing
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_marketplace_account(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_acc public.marketplace_accounts%rowtype;
    v_caller_id uuid := auth.uid();
    v_is_authorized boolean := false;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'أمني: يجب تسجيل الدخول لحذف الحساب';
    END IF;

    SELECT * INTO v_acc FROM public.marketplace_accounts WHERE id = p_account_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'deleted', false, 'message', 'الحساب غير موجود أو تم حذفه مسبقاً');
    END IF;

    -- التحقق من الصلاحية: المدير العام أو البائع صاحب الحساب
    IF public.is_admin() OR v_acc.seller_id = v_caller_id THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بحذف هذا الحساب';
    END IF;

    -- حظر حذف الحساب إذا كان قيد صفقة نشطة أو مباعاً
    IF v_acc.status IN ('in_deal', 'sold', 'completed') THEN
        RAISE EXCEPTION 'لا يمكن حذف الحساب أثناء سريان صفقة وساطة نشطة أو بعد اكتمال البيع';
    END IF;

    -- حذف الأسرار التابعة أولاً لضمان عدم وجود قيود أجنبية
    DELETE FROM public.marketplace_account_secrets WHERE account_id = p_account_id;

    -- حذف الحساب من جدول marketplace_accounts نهائياً
    DELETE FROM public.marketplace_accounts WHERE id = p_account_id;

    RETURN jsonb_build_object('ok', true, 'deleted', true, 'account_id', p_account_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_marketplace_account(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------
-- 3. جدول تقييمات الوسطاء (broker_reviews)
-- لحفظ تقييمات البائع والمشتري لكل وسيط بعد اكتمال الصفقات
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
    broker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewer_role text NOT NULL CHECK (reviewer_role IN ('buyer', 'seller')),
    rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment text DEFAULT '',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_broker_review_deal_reviewer UNIQUE (deal_id, reviewer_id)
);

ALTER TABLE public.broker_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.broker_reviews TO authenticated;
GRANT SELECT ON TABLE public.broker_reviews TO anon;
GRANT ALL ON TABLE public.broker_reviews TO service_role;

DROP POLICY IF EXISTS "broker_reviews_select_all" ON public.broker_reviews;
CREATE POLICY "broker_reviews_select_all"
ON public.broker_reviews
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "broker_reviews_insert_authenticated" ON public.broker_reviews;
CREATE POLICY "broker_reviews_insert_authenticated"
ON public.broker_reviews
FOR INSERT
TO authenticated
WITH CHECK (
    reviewer_id = auth.uid()
    OR public.is_admin()
);

-- ---------------------------------------------------------------------------------
-- 4. دالة إرسال تقييم الوسيط بعد اكتمال الصفقة (submit_broker_review)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_broker_review(
    p_deal_id uuid,
    p_broker_id uuid,
    p_rating integer,
    p_comment text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid := auth.uid();
    v_deal public.deals%rowtype;
    v_role text := 'buyer';
    v_stats record;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول لتقييم الوسيط';
    END IF;

    IF p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'يجب أن يكون التقييم بين 1 و 5 نجوم';
    END IF;

    SELECT * INTO v_deal FROM public.deals WHERE id = p_deal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الصفقة غير موجودة';
    END IF;

    IF v_deal.status != 'completed' THEN
        RAISE EXCEPTION 'لا يمكن تقييم الوسيط إلا بعد اكتمال الصفقة بنجاح';
    END IF;

    IF v_deal.buyer_id = v_caller_id THEN
        v_role := 'buyer';
    ELSIF v_deal.seller_id = v_caller_id THEN
        v_role := 'seller';
    ELSIF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح لك بتقييم هذا الوسيط في هذه الصفقة';
    END IF;

    -- إدراج التقييم أو تحديثه إذا كان موجوداً
    INSERT INTO public.broker_reviews (deal_id, broker_id, reviewer_id, reviewer_role, rating, comment)
    VALUES (p_deal_id, p_broker_id, v_caller_id, v_role, p_rating, COALESCE(p_comment, ''))
    ON CONFLICT (deal_id, reviewer_id)
    DO UPDATE SET
        rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        created_at = now();

    -- حساب المتوسط الحسابي والإحصائيات
    SELECT
        COUNT(*)::int AS total_reviews,
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0) AS avg_rating,
        COALESCE(SUM(rating), 0)::int AS sum_stars
    INTO v_stats
    FROM public.broker_reviews
    WHERE broker_id = p_broker_id;

    RETURN jsonb_build_object(
        'ok', true,
        'deal_id', p_deal_id,
        'broker_id', p_broker_id,
        'rating', p_rating,
        'total_reviews', v_stats.total_reviews,
        'avg_rating', v_stats.avg_rating
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_broker_review(uuid, uuid, integer, text) TO authenticated;

-- ---------------------------------------------------------------------------------
-- 5. دالة جلب إحصائيات تقييم الوسيط الحقيقية وعدد الصفقات الفعلية المكتملة
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_broker_rating_stats(p_broker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_reviews int := 0;
    v_avg_rating numeric := 0.0;
    v_sum_stars int := 0;
    v_completed_deals int := 0;
    v_broker_country text := '';
BEGIN
    SELECT country INTO v_broker_country FROM public.profiles WHERE id = p_broker_id;

    -- 1. حساب التقييمات من جدول broker_reviews
    SELECT
        COUNT(*)::int,
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0),
        COALESCE(SUM(rating), 0)::int
    INTO v_total_reviews, v_avg_rating, v_sum_stars
    FROM public.broker_reviews
    WHERE broker_id = p_broker_id;

    -- 2. حساب عدد الصفقات المكتملة الحقيقية حصراً (يبدأ من 0)
    -- مطابقة الصفقات المكتملة التي أشرف عليها هذا الوسيط (mediator_id أو بلد الصفقة)
    SELECT COUNT(*)::int INTO v_completed_deals
    FROM public.deals d
    WHERE d.status = 'completed'
      AND (
          d.mediator_id = p_broker_id
          OR (d.mediator_id IS NULL AND v_broker_country IS NOT NULL AND v_broker_country != '' AND EXISTS (
              SELECT 1 FROM public.profiles buyer WHERE buyer.id = d.buyer_id AND buyer.country = v_broker_country
          ))
      );

    RETURN jsonb_build_object(
        'ok', true,
        'broker_id', p_broker_id,
        'total_reviews', v_total_reviews,
        'avg_rating', v_avg_rating,
        'sum_stars', v_sum_stars,
        'completed_deals_count', v_completed_deals
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_broker_rating_stats(uuid) TO public;

-- تحديث دالة get_broker_public_profile لتشمل التقييم الحقيقي ومؤشر الاتصال والصفقات الحقيقية
CREATE OR REPLACE FUNCTION public.get_broker_public_profile(p_broker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    p public.profiles%rowtype;
    v_stats jsonb;
    v_completed_count int := 0;
    v_avg_rating numeric := 0.0;
    v_reviews_count int := 0;
BEGIN
    SELECT * INTO p
    FROM public.profiles
    WHERE id = p_broker_id
      AND role IN ('regional_broker', 'broker');

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    -- جلب الإحصائيات الحقيقية
    v_stats := public.get_broker_rating_stats(p_broker_id);
    v_completed_count := COALESCE((v_stats->>'completed_deals_count')::int, 0);
    v_avg_rating := COALESCE((v_stats->>'avg_rating')::numeric, 0.0);
    v_reviews_count := COALESCE((v_stats->>'total_reviews')::int, 0);

    RETURN jsonb_build_object(
        'found', true,
        'id', p.id,
        'name', COALESCE(p.name, 'وسيط إقليمي معتمد'),
        'avatar_url', regexp_replace(p.avatar_url, '#waseet_broker=[^&]*', '', 'g'),
        'country', COALESCE(p.country, 'DZ'),
        'kyc_type', COALESCE(p.kyc_type, 'national_id'),
        'is_fully_verified', COALESCE(p.is_fully_verified, true),
        'completed_deals', v_completed_count,
        'rating', v_avg_rating,
        'reviews_count', v_reviews_count,
        'is_online', (p.last_seen_at IS NOT NULL AND p.last_seen_at >= (now() - interval '10 minutes')),
        'joined_at', p.created_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_broker_public_profile(uuid) TO public;

COMMIT;
NOTIFY pgrst, 'reload schema';
