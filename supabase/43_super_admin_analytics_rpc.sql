-- =================================================================================
-- WASEET (وسيط) - MIGRATION 43: Super Admin Analytics Dashboard & Aggregation RPC (FIXED)
-- يوفر دالة تجميعية فائقة الأمان (SECURITY DEFINER) للإدارة العليا لكشف السيولة المالية
-- وأموال الضمان المحجوزة وأرباح المنصة وأداء الوسطاء المعتمدين وحركة السوق.
-- تعليمات التشغيل: افتح Supabase SQL Editor والصق هذا الكود واضغط Run
-- =================================================================================

-- ---------------------------------------------------------------------------------
-- الخطوة 0: إصلاح مشكلة المشغل السابق (v3) وإضافة الأعمدة الناقصة لتجنب خطأ escrow_balance
-- ---------------------------------------------------------------------------------
-- تعطيل المشغلات السابقة مؤقتاً قبل تنفيذ أي UPDATE على profiles
DROP TRIGGER IF EXISTS tr_prevent_profile_field_tampering_v3 ON public.profiles;
DROP TRIGGER IF EXISTS tr_prevent_profile_field_tampering_v2 ON public.profiles;
DROP TRIGGER IF EXISTS tr_prevent_profile_field_tampering ON public.profiles;

-- 1. إضافة الأعمدة الناقصة في جدول profiles مع تعيين المدراء الحاليين
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS escrow_balance numeric DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_broker boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- تحديث دالة الحماية لمنع أي تعارض مستقبلي مع الأعمدة
CREATE OR REPLACE FUNCTION public.prevent_profile_field_tampering_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT public.is_admin()
       AND coalesce(current_setting('app.internal_wallet_op', true), '') <> 'true' THEN

        -- أ) منع تزوير الرتبة وصلاحيات الإدارة والوساطة
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل رتبة الحساب (role)';
        END IF;

        IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل صلاحية المدير الأعلى (is_super_admin)';
        END IF;

        IF NEW.is_broker IS DISTINCT FROM OLD.is_broker THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل صفة الوسيط (is_broker)';
        END IF;

        -- ب) منع تزوير الأرصدة المالية والضمانات
        IF NEW.points_balance IS DISTINCT FROM OLD.points_balance
           OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل الرصيد المالي أو رصيد النقاط';
        END IF;

        IF NEW.locked_points IS DISTINCT FROM OLD.locked_points THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل الرصيد المحجوز مباشرة';
        END IF;

        IF NEW.escrow_balance IS DISTINCT FROM OLD.escrow_balance THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتعديل رصيد الضمان المحجوز مباشرة';
        END IF;

        -- ج) منع تزوير المعرف والبريد
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتغيير معرف الحساب';
        END IF;

        IF NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'أمني: غير مصرح لك بتغيير البريد الإلكتروني الأساسي';
        END IF;

        -- د) منع تزوير التوثيق وحالة الـ KYC
        IF NEW.is_fully_verified IS DISTINCT FROM OLD.is_fully_verified
           OR NEW.kyc_type IS DISTINCT FROM OLD.kyc_type
           OR NEW.kyc_document_url IS DISTINCT FROM OLD.kyc_document_url
           OR NEW.kyc_verified_at IS DISTINCT FROM OLD.kyc_verified_at
           OR NEW.kyc_verified_by IS DISTINCT FROM OLD.kyc_verified_by THEN
            RAISE EXCEPTION 'أمني: حقول التوثيق (KYC) لا يعدلها إلا مدير المنصة المعتمد';
        END IF;
    END IF;

    -- مواءمة الرصيدين للتوافق
    IF NEW.points_balance IS DISTINCT FROM OLD.points_balance THEN
        NEW.wallet_balance := NEW.points_balance;
    ELSIF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
        NEW.points_balance := NEW.wallet_balance;
    END IF;

    IF NEW.locked_points IS DISTINCT FROM OLD.locked_points THEN
        NEW.escrow_balance := NEW.locked_points;
    ELSIF NEW.escrow_balance IS DISTINCT FROM OLD.escrow_balance THEN
        NEW.locked_points := NEW.escrow_balance;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- إعادة تفعيل المشغل المحمي على جدول profiles
CREATE TRIGGER tr_prevent_profile_field_tampering_v3
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_field_tampering_v3();

-- تعيين المدراء العامين كمدراء أعلى تلقائياً (الآن يعمل بسلاسة دون أي خطأ)
UPDATE public.profiles 
SET is_super_admin = true 
WHERE role IN ('admin', 'super_admin') 
   OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');

-- ---------------------------------------------------------------------------------
-- 2. دالة التحقق من صلاحيات المدير الأعلى public.is_super_admin()
-- ---------------------------------------------------------------------------------
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

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------------------
-- 3. دالة التحليل المالي والتشغيلي الشامل للإدارة العليا get_super_admin_analytics()
-- ---------------------------------------------------------------------------------
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

    -- 4. إجمالي الصفقات بحالاتها المختلفة
    SELECT 
        COUNT(*),
        COALESCE(SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0)
    INTO 
        v_total_deals_count,
        v_total_disputed_deals_count,
        v_total_cancelled_deals_count
    FROM public.deals;

    -- 5. إحصائيات سوق الحسابات
    SELECT 
        COUNT(*),
        COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END), 0)
    INTO 
        v_total_accounts_count,
        v_total_available_accounts,
        v_total_sold_accounts,
        v_total_pending_accounts
    FROM public.accounts;

    -- 6. إحصائيات السحوبات المالية
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawals') THEN
        SELECT 
            COALESCE(SUM(amount), 0),
            COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)
        INTO 
            v_total_withdrawals_volume,
            v_pending_withdrawals_volume
        FROM public.withdrawals;
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawal_requests') THEN
        SELECT 
            COALESCE(SUM(amount), 0),
            COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)
        INTO 
            v_total_withdrawals_volume,
            v_pending_withdrawals_volume
        FROM public.withdrawal_requests;
    END IF;

    -- 7. عدد الوسطاء المعتمدين وقائمة المتصدرين (Brokers Leaderboard)
    SELECT COUNT(*)
    INTO v_total_brokers_count
    FROM public.profiles
    WHERE is_broker = true OR role = 'mediator';

    SELECT COALESCE(jsonb_agg(b_data), '[]'::jsonb)
    INTO v_brokers_leaderboard
    FROM (
        SELECT 
            p.id,
            p.name,
            p.email,
            COALESCE(p.country, 'عام') as country,
            COALESCE(p.phone, 'غير مسجل') as phone,
            p.is_verified,
            p.role,
            COUNT(d.id) as completed_deals,
            COALESCE(SUM(d.total_amount), 0) as total_volume,
            COALESCE(SUM(d.fee), 0) as generated_fees
        FROM public.profiles p
        LEFT JOIN public.deals d ON (d.mediator_id = p.id AND d.status = 'completed')
        WHERE p.is_broker = true OR p.role = 'mediator'
        GROUP BY p.id, p.name, p.email, p.country, p.phone, p.is_verified, p.role
        ORDER BY completed_deals DESC, total_volume DESC
        LIMIT 10
    ) b_data;

    -- 8. آخر الصفقات المكتملة حديثاً (Recent Completed Deals)
    SELECT COALESCE(jsonb_agg(d_data), '[]'::jsonb)
    INTO v_recent_completed_deals
    FROM (
        SELECT 
            d.id,
            d.deal_uuid,
            d.seller_price,
            d.fee,
            d.total_amount,
            d.status,
            d.completed_at,
            d.created_at,
            COALESCE(buyer.name, 'مشتري') as buyer_name,
            COALESCE(seller.name, 'بائع') as seller_name,
            COALESCE(acc.title, 'حساب ألعاب') as account_title
        FROM public.deals d
        LEFT JOIN public.profiles buyer ON d.buyer_id = buyer.id
        LEFT JOIN public.profiles seller ON d.seller_id = seller.id
        LEFT JOIN public.accounts acc ON d.account_id = acc.id
        WHERE d.status = 'completed'
        ORDER BY d.completed_at DESC NULLS LAST, d.created_at DESC
        LIMIT 10
    ) d_data;

    -- 9. بناء كائن النتيجة الشامل بصيغة JSONB
    v_result := jsonb_build_object(
        'timestamp', timezone('utc'::text, now()),
        'liquidity', jsonb_build_object(
            'total_circulation', v_total_points_circulation,
            'available_points', v_total_points_available,
            'locked_points', v_total_points_locked,
            'escrowed_funds', v_total_escrowed_funds,
            'active_escrow_deals', v_active_escrow_deals_count
        ),
        'revenue', jsonb_build_object(
            'total_commissions', v_total_platform_commissions,
            'completed_deals_count', v_completed_deals_count
        ),
        'deals', jsonb_build_object(
            'total', v_total_deals_count,
            'completed', v_completed_deals_count,
            'disputed', v_total_disputed_deals_count,
            'cancelled', v_total_cancelled_deals_count
        ),
        'accounts', jsonb_build_object(
            'total', v_total_accounts_count,
            'available', v_total_available_accounts,
            'sold', v_total_sold_accounts,
            'pending_review', v_total_pending_accounts
        ),
        'withdrawals', jsonb_build_object(
            'total_volume', v_total_withdrawals_volume,
            'pending_volume', v_pending_withdrawals_volume
        ),
        'users', jsonb_build_object(
            'total_users', v_total_users_count,
            'total_brokers', v_total_brokers_count
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

-- تعيين الصلاحيات الأمنية
REVOKE EXECUTE ON FUNCTION public.get_super_admin_analytics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_super_admin_analytics() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_super_admin_analytics() TO authenticated, service_role;

-- إشعار PostgREST بتحديث المخطط
NOTIFY pgrst, 'reload schema';
