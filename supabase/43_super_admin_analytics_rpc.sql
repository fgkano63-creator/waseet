-- =================================================================================
-- WASEET (وسيط) - MIGRATION 43: Super Admin Analytics Dashboard & Aggregation RPC
-- يوفر دالة تجميعية فائقة الأمان (SECURITY DEFINER) للإدارة العليا لكشف السيولة المالية
-- وأموال الضمان المحجوزة وأرباح المنصة وأداء الوسطاء المعتمدين وحركة السوق.
-- =================================================================================

-- 1. إضافة عمود is_super_admin في جدول profiles مع تعيين المدراء الحاليين
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- تعيين المدراء العامين كمدراء أعلى تلقائياً
UPDATE public.profiles 
SET is_super_admin = true 
WHERE role IN ('admin', 'super_admin') 
   OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');

-- 2. دالة التحقق من صلاحيات المدير الأعلى public.is_super_admin()
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND (
              is_super_admin = true
              OR role IN ('super_admin', 'admin')
              OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
          )
    )
    OR lower(coalesce(auth.jwt() ->> 'email', '')) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- 3. دالة التحليل المالي والتشغيلي الشامل للإدارة العليا get_super_admin_analytics()
CREATE OR REPLACE FUNCTION public.get_super_admin_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_points_circulation numeric := 0;
    v_total_points_available numeric := 0;
    v_total_points_locked numeric := 0;
    v_total_escrowed_funds numeric := 0;
    v_active_escrow_deals_count bigint := 0;
    v_total_platform_commissions numeric := 0;
    v_completed_deals_count bigint := 0;
    v_total_deals_count bigint := 0;
    v_total_disputed_deals_count bigint := 0;
    v_total_cancelled_deals_count bigint := 0;
    v_total_available_accounts bigint := 0;
    v_total_sold_accounts bigint := 0;
    v_total_pending_accounts bigint := 0;
    v_total_accounts_count bigint := 0;
    v_total_users_count bigint := 0;
    v_total_brokers_count bigint := 0;
    v_total_withdrawals_volume numeric := 0;
    v_pending_withdrawals_volume numeric := 0;
    v_brokers_leaderboard jsonb := '[]'::jsonb;
    v_recent_completed_deals jsonb := '[]'::jsonb;
    v_result jsonb;
BEGIN
    -- فحص أمني صارم: رفض التنفيذ إذا لم يكن المستدعي مديراً أعلى للمنصة
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access Denied: Super Admin privileges required (WST-AUTHZ-ANALYTICS-403)';
    END IF;

    -- 1. السيولة الإجمالية في محافظ المستخدمين (Total Points in Circulation)
    SELECT 
        COALESCE(SUM(points_balance + locked_points), 0),
        COALESCE(SUM(points_balance), 0),
        COALESCE(SUM(locked_points), 0),
        COUNT(*)
    INTO 
        v_total_points_circulation,
        v_total_points_available,
        v_total_points_locked,
        v_total_users_count
    FROM public.profiles;

    -- 2. أموال الضمان المحجوزة حالياً في صفقات نشطة (Total Escrowed Funds)
    SELECT 
        COALESCE(SUM(seller_price), 0),
        COUNT(*)
    INTO 
        v_total_escrowed_funds,
        v_active_escrow_deals_count
    FROM public.deals
    WHERE status NOT IN ('completed', 'cancelled');

    -- 3. أرباح وعمولات المنصة والصفقات المكتملة (Total Platform Commissions)
    SELECT 
        COALESCE(SUM(fee), 0),
        COUNT(*)
    INTO 
        v_total_platform_commissions,
        v_completed_deals_count
    FROM public.deals
    WHERE status = 'completed';

    -- إحصائيات عامة لصفقات الوساطة
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'disputed'),
        COUNT(*) FILTER (WHERE status = 'cancelled')
    INTO 
        v_total_deals_count,
        v_total_disputed_deals_count,
        v_total_cancelled_deals_count
    FROM public.deals;

    -- 4. نشاط سوق الحسابات المعروضة (Marketplace Accounts Activity)
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'available'),
        COUNT(*) FILTER (WHERE status = 'sold'),
        COUNT(*) FILTER (WHERE status IN ('pending', 'pending_verification', 'pending_review'))
    INTO 
        v_total_accounts_count,
        v_total_available_accounts,
        v_total_sold_accounts,
        v_total_pending_accounts
    FROM public.marketplace_accounts;

    -- 5. إجمالي السحوبات المالية (إن وُجد جدول withdrawals)
    BEGIN
        SELECT 
            COALESCE(SUM(points) FILTER (WHERE status = 'approved'), 0),
            COALESCE(SUM(points) FILTER (WHERE status = 'pending'), 0)
        INTO 
            v_total_withdrawals_volume,
            v_pending_withdrawals_volume
        FROM public.withdrawals;
    EXCEPTION WHEN undefined_table THEN
        v_total_withdrawals_volume := 0;
        v_pending_withdrawals_volume := 0;
    END;

    -- 6. إحصائيات وتقييم أداء الوسطاء المعتمدين (Brokers Leaderboard)
    WITH broker_source AS (
        SELECT 
            p.id,
            COALESCE(NULLIF(p.name, ''), 'وسيط معتمد') AS name,
            p.email,
            COALESCE(p.country, 'DZ') AS country,
            COALESCE(p.avatar_url, '') AS avatar_url,
            p.created_at,
            COALESCE(p.points_balance, 0) AS current_balance,
            COALESCE(
                (SELECT count(*) FROM public.broker_reviews br WHERE br.broker_id = p.id),
                0
            ) AS reviews_count,
            COALESCE(
                (SELECT round(avg(br.rating)::numeric, 1) FROM public.broker_reviews br WHERE br.broker_id = p.id),
                5.0
            ) AS rating
        FROM public.profiles p
        WHERE p.role IN ('broker', 'regional_broker')
           OR p.id IN (SELECT DISTINCT assigned_broker_id FROM public.deals WHERE assigned_broker_id IS NOT NULL)
           OR p.id IN (SELECT user_id FROM public.regional_brokers WHERE user_id IS NOT NULL)
    ),
    broker_stats AS (
        SELECT 
            bs.id,
            bs.name,
            bs.email,
            bs.country,
            bs.avatar_url,
            bs.current_balance,
            bs.reviews_count,
            bs.rating,
            COUNT(d.id) FILTER (WHERE d.status = 'completed') AS completed_deals,
            COUNT(d.id) FILTER (WHERE d.status NOT IN ('completed', 'cancelled')) AS active_deals,
            COALESCE(SUM(d.seller_price) FILTER (WHERE d.status = 'completed'), 0) AS total_volume,
            COALESCE(SUM(d.fee) FILTER (WHERE d.status = 'completed'), 0) AS commissions_generated
        FROM broker_source bs
        LEFT JOIN public.deals d ON d.assigned_broker_id = bs.id
        GROUP BY bs.id, bs.name, bs.email, bs.country, bs.avatar_url, bs.current_balance, bs.reviews_count, bs.rating
    )
    SELECT 
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', bs.id,
                    'name', bs.name,
                    'email', bs.email,
                    'country', bs.country,
                    'avatar_url', bs.avatar_url,
                    'current_balance', bs.current_balance,
                    'completed_deals', bs.completed_deals,
                    'active_deals', bs.active_deals,
                    'total_volume', bs.total_volume,
                    'commissions_generated', bs.commissions_generated,
                    'reviews_count', bs.reviews_count,
                    'rating', bs.rating,
                    'performance_tier', CASE 
                        WHEN bs.completed_deals >= 20 THEN 'Diamond'
                        WHEN bs.completed_deals >= 10 THEN 'Platinum'
                        WHEN bs.completed_deals >= 5 THEN 'Gold'
                        ELSE 'Standard'
                    END
                ) ORDER BY bs.total_volume DESC, bs.completed_deals DESC
            ),
            '[]'::jsonb
        ),
        COUNT(*)
    INTO 
        v_brokers_leaderboard,
        v_total_brokers_count
    FROM broker_stats bs;

    -- 7. أحدث الصفقات المكتملة حديثاً للتدقيق المالي
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', d.id,
                'seller_price', d.seller_price,
                'fee', d.fee,
                'total_points', d.total_points,
                'buyer_name', COALESCE(b.name, 'مشتري'),
                'seller_name', COALESCE(s.name, 'بائع'),
                'broker_name', COALESCE(br.name, 'الإدارة العامة'),
                'completed_at', d.updated_at
            ) ORDER BY d.updated_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_recent_completed_deals
    FROM (
        SELECT id, seller_price, fee, total_points, buyer_id, seller_id, assigned_broker_id, updated_at
        FROM public.deals
        WHERE status = 'completed'
        ORDER BY updated_at DESC
        LIMIT 8
    ) d
    LEFT JOIN public.profiles b ON b.id = d.buyer_id
    LEFT JOIN public.profiles s ON s.id = d.seller_id
    LEFT JOIN public.profiles br ON br.id = d.assigned_broker_id;

    -- حزم النتائج في كائن JSON متكامل
    v_result := jsonb_build_object(
        'success', true,
        'timestamp', timezone('utc'::text, now()),
        'liquidity', jsonb_build_object(
            'total_circulation', v_total_points_circulation,
            'available_points', v_total_points_available,
            'locked_points', v_total_points_locked,
            'total_users', v_total_users_count
        ),
        'escrow', jsonb_build_object(
            'total_escrowed', v_total_escrowed_funds,
            'active_deals_count', v_active_escrow_deals_count,
            'total_deals_count', v_total_deals_count,
            'completed_deals_count', v_completed_deals_count,
            'disputed_deals_count', v_total_disputed_deals_count,
            'cancelled_deals_count', v_total_cancelled_deals_count
        ),
        'commissions', jsonb_build_object(
            'total_platform_commissions', v_total_platform_commissions,
            'average_commission_per_deal', CASE WHEN v_completed_deals_count > 0 
                THEN round(v_total_platform_commissions / v_completed_deals_count, 1) 
                ELSE 0 END
        ),
        'marketplace', jsonb_build_object(
            'total_accounts', v_total_accounts_count,
            'available_accounts', v_total_available_accounts,
            'sold_accounts', v_total_sold_accounts,
            'pending_accounts', v_total_pending_accounts
        ),
        'withdrawals', jsonb_build_object(
            'completed_volume', v_total_withdrawals_volume,
            'pending_volume', v_pending_withdrawals_volume
        ),
        'brokers', jsonb_build_object(
            'total_brokers', v_total_brokers_count,
            'leaderboard', v_brokers_leaderboard
        ),
        'recent_deals', v_recent_completed_deals
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_analytics() TO authenticated, service_role;
