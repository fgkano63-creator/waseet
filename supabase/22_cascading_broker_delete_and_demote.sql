-- =================================================================================
-- WASEET Platform - الهجرة رقم 22: الحذف المتسلسل الشامل للوسطاء وإعادتهم لرتبة مستخدم
-- 22_cascading_broker_delete_and_demote.sql
--
-- 1. التأكد من وجود جدول regional_brokers مع ربط مفتاح أجنبي متسلسل الحذف ON DELETE CASCADE
-- 2. تحديث دالة demote_regional_broker لتنفيذ Cascading Delete كامل:
--    أ) الحذف الجذري من جدول regional_brokers (بالـ ID أو user_id أو email)
--    ب) تحويل رتبة المستخدم في profiles إلى 'user' فوراً
--    ج) إزالة وسم الوسيط (#waseet_broker=) من avatar_url لمنع إعادة التعرف عليه
--    د) تحديث جدول users إن وُجد
-- 3. تفعيل مشغل الحذف المتسلسل التلقائي عند تحويل أي وسيط إلى مستخدم عادي
-- =================================================================================

BEGIN;

-- 1. التأكد من وجود جدول regional_brokers وهيكليته
CREATE TABLE IF NOT EXISTS public.regional_brokers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    name text DEFAULT '',
    email text NOT NULL,
    country text NOT NULL DEFAULT 'DZ',
    role text NOT NULL DEFAULT 'regional_broker',
    is_active boolean DEFAULT true,
    wallet_balance numeric DEFAULT 0,
    points_balance numeric DEFAULT 0,
    avatar_url text DEFAULT '',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- فهرس لتسريع الاستعلام والحذف
CREATE INDEX IF NOT EXISTS idx_regional_brokers_user_id ON public.regional_brokers(user_id);
CREATE INDEX IF NOT EXISTS idx_regional_brokers_email ON public.regional_brokers(lower(email));

-- تفعيل RLS على جدول regional_brokers
ALTER TABLE public.regional_brokers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regional_brokers_select_all" ON public.regional_brokers;
CREATE POLICY "regional_brokers_select_all" ON public.regional_brokers
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "regional_brokers_admin_all" ON public.regional_brokers;
CREATE POLICY "regional_brokers_admin_all" ON public.regional_brokers
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 2. دالة الحذف والإلغاء الشاملة بصيغة نصية (تدعم UUID والبريد الإلكتروني)
CREATE OR REPLACE FUNCTION public.demote_regional_broker(
    p_target_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_uuid uuid;
    v_deleted_count integer := 0;
    v_updated_profiles integer := 0;
BEGIN
    -- التحقق من صلاحية المدير العام
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: فقط المدير العام يمكنه إلغاء ترقية وحذف الوسطاء الإقليميين';
    END IF;

    -- محاولة تحويل المعرف إلى UUID إن أمكن
    BEGIN
        v_user_uuid := p_target_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_user_uuid := NULL;
    END;

    -- 1. حذف السجل نهائياً من جدول regional_brokers (حذف جذري غير قابل للاسترجاع)
    DELETE FROM public.regional_brokers
    WHERE (v_user_uuid IS NOT NULL AND (id = v_user_uuid OR user_id = v_user_uuid))
       OR lower(email) = lower(trim(p_target_id));
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- 2. إرجاع رتبة الحساب في جدول profiles إلى 'user' وتطهير وسم الوسيط من رابط الصورة
    -- استخدام علامة الجلسة الداخلية للسماح بتعديل رتبة المستخدم وتجاوز مشغل منع التلاعب
    PERFORM set_config('app.internal_wallet_op', 'true', true);

    UPDATE public.profiles
    SET role = 'user',
        avatar_url = regexp_replace(coalesce(avatar_url, ''), '#waseet_broker=[^&]*', '', 'g'),
        updated_at = timezone('utc'::text, now())
    WHERE (v_user_uuid IS NOT NULL AND id = v_user_uuid)
       OR lower(email) = lower(trim(p_target_id));
    GET DIAGNOSTICS v_updated_profiles = ROW_COUNT;

    -- 3. تحديث جدول users إن كان موجوداً
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
    ) THEN
        UPDATE public.users
        SET role = 'user',
            updated_at = timezone('utc'::text, now())
        WHERE (v_user_uuid IS NOT NULL AND id = v_user_uuid)
           OR lower(email) = lower(trim(p_target_id));
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'target_id', p_target_id,
        'deleted_from_brokers', v_deleted_count,
        'profiles_demoted', v_updated_profiles,
        'role', 'user',
        'message', 'تم تنفيذ الحذف المتسلسل الشامل للوسيط بنجاح وإعادته لمستخدم عادي'
    );
END;
$$;

-- دعم استدعاء الدالة بـ UUID مباشرة للتوافق الخلفي مع أي استدعاءات قديمة
CREATE OR REPLACE FUNCTION public.demote_regional_broker(
    p_target_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.demote_regional_broker(p_target_id::text);
$$;

GRANT EXECUTE ON FUNCTION public.demote_regional_broker(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demote_regional_broker(uuid) TO anon, authenticated, service_role;

-- 3. مشغل تلقائي للحذف المتسلسل عند تعديل رتبة الحساب في profiles إلى 'user'
CREATE OR REPLACE FUNCTION public.tr_sync_demote_broker_to_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (OLD.role IN ('regional_broker', 'broker') AND NEW.role = 'user') THEN
        DELETE FROM public.regional_brokers
        WHERE user_id = OLD.id 
           OR id = OLD.id 
           OR lower(email) = lower(OLD.email);
        NEW.avatar_url := regexp_replace(coalesce(NEW.avatar_url, ''), '#waseet_broker=[^&]*', '', 'g');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profiles_broker_demote_sync ON public.profiles;
CREATE TRIGGER tr_profiles_broker_demote_sync
    BEFORE UPDATE OF role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.tr_sync_demote_broker_to_user();

COMMIT;
