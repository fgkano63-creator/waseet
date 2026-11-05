-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 26: TOP SELLING SELLERS LEADERBOARD (FIXED)
-- دالة استعلام لوحة شرف المتاجر الأكثر مبيعاً في منصة وسيط (مصححة بدون p.username)
-- ==============================================================================
-- تعليمات التشغيل السريعة:
-- 1. افتح محرر Supabase SQL Editor.
-- 2. احذف الكود السابق ذو الخطأ، ثم الصق هذا الكود واضغط Run.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_top_selling_sellers(p_limit int DEFAULT 10)
RETURNS TABLE (
    seller_id uuid,
    seller_name text,
    seller_avatar text,
    sold_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT 
        ma.seller_id,
        COALESCE(NULLIF(p.name, ''), split_part(p.email, '@', 1), 'بائع معتمد') AS seller_name,
        COALESCE(p.avatar_url, '') AS seller_avatar,
        COUNT(ma.id) AS sold_count
    FROM public.marketplace_accounts ma
    LEFT JOIN public.profiles p ON p.id = ma.seller_id
    WHERE ma.status IN ('sold', 'completed')
      AND ma.seller_id IS NOT NULL
    GROUP BY ma.seller_id, p.name, p.email, p.avatar_url
    ORDER BY sold_count DESC
    LIMIT COALESCE(p_limit, 10);
$$;

GRANT EXECUTE ON FUNCTION public.get_top_selling_sellers(int) TO anon, authenticated, service_role;

COMMIT;
