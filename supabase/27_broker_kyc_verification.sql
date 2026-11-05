-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 27: BROKER PUBLIC PROFILE & SECURE KYC VERIFICATION
-- الملف التعريفي للوسيط + نظام التوثيق الآمن (KYC)
-- ==============================================================================
-- المحتوى:
-- 1. أعمدة التوثيق الجديدة في profiles: kyc_type, kyc_document_url, is_fully_verified
-- 2. حارس قاعدة بيانات يمنع أي مستخدم غير المدير من تعديل حقول التوثيق
-- 3. حاوية تخزين خاصة kyc_documents (غير عامة) لا يقرأها ولا يكتب فيها إلا المدير
-- 4. توسيع public_profiles بنوع التوثيق وحالته فقط (بدون رابط الوثيقة إطلاقاً)
-- 5. دوال RPC: الملف العام للوسيط، تحديث التوثيق من المدير، ونبض حالة الاتصال
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. أعمدة التوثيق وحالة الاتصال
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS kyc_type text,
    ADD COLUMN IF NOT EXISTS kyc_document_url text,
    ADD COLUMN IF NOT EXISTS is_fully_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS kyc_verified_by uuid,
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_kyc_type_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_kyc_type_check
    CHECK (kyc_type IS NULL OR kyc_type IN ('passport', 'national_id', 'live_video'));

CREATE INDEX IF NOT EXISTS idx_profiles_is_fully_verified ON public.profiles(is_fully_verified);

-- ------------------------------------------------------------------------------
-- 2. حارس حقول التوثيق: لا يعدلها إلا المدير (أو service_role من الخادم)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_guard_profile_kyc_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- طلبات الخادم (service_role) لا تحمل auth.uid() ويُسمح لها
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.kyc_type := NULL;
        NEW.kyc_document_url := NULL;
        NEW.is_fully_verified := false;
        NEW.kyc_verified_at := NULL;
        NEW.kyc_verified_by := NULL;
        RETURN NEW;
    END IF;

    IF NEW.kyc_type IS DISTINCT FROM OLD.kyc_type
       OR NEW.kyc_document_url IS DISTINCT FROM OLD.kyc_document_url
       OR NEW.is_fully_verified IS DISTINCT FROM OLD.is_fully_verified
       OR NEW.kyc_verified_at IS DISTINCT FROM OLD.kyc_verified_at
       OR NEW.kyc_verified_by IS DISTINCT FROM OLD.kyc_verified_by THEN
        RAISE EXCEPTION 'أمني: حقول التوثيق (KYC) لا يعدلها إلا مدير المنصة';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_profile_kyc_fields ON public.profiles;
CREATE TRIGGER tr_guard_profile_kyc_fields
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.tr_guard_profile_kyc_fields();

-- ------------------------------------------------------------------------------
-- 3. حاوية التخزين الخاصة kyc_documents (Private Bucket - Admin Only)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'kyc_documents',
    'kyc_documents',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "kyc_documents_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "kyc_documents_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "kyc_documents_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "kyc_documents_admin_delete" ON storage.objects;

CREATE POLICY "kyc_documents_admin_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'kyc_documents' AND public.is_admin());

CREATE POLICY "kyc_documents_admin_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'kyc_documents' AND public.is_admin());

CREATE POLICY "kyc_documents_admin_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'kyc_documents' AND public.is_admin())
    WITH CHECK (bucket_id = 'kyc_documents' AND public.is_admin());

CREATE POLICY "kyc_documents_admin_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'kyc_documents' AND public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. توسيع العرض العام public_profiles (بدون kyc_document_url نهائياً)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
    id,
    name,
    avatar_url,
    role,
    country,
    created_at,
    kyc_type,
    is_fully_verified,
    last_seen_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. دوال مساعدة و RPC
-- ------------------------------------------------------------------------------

-- أ) تحويل أي معرف وسيط (معرف profiles أو معرف سجل regional_brokers) إلى معرف profiles
CREATE OR REPLACE FUNCTION public.resolve_broker_profile_id(p_broker_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT COALESCE(
        (SELECT p.id FROM public.profiles p WHERE p.id = p_broker_id),
        (SELECT rb.user_id FROM public.regional_brokers rb
          WHERE (rb.id = p_broker_id OR rb.user_id = p_broker_id) AND rb.user_id IS NOT NULL
          LIMIT 1),
        (SELECT p.id FROM public.regional_brokers rb
           JOIN public.profiles p ON lower(p.email) = lower(rb.email)
          WHERE rb.id = p_broker_id
          LIMIT 1)
    );
$$;

GRANT EXECUTE ON FUNCTION public.resolve_broker_profile_id(uuid) TO anon, authenticated, service_role;

-- ب) الملف التعريفي العام للوسيط (آمن للجمهور - لا يعيد رابط الوثيقة أبداً)
CREATE OR REPLACE FUNCTION public.get_broker_public_profile(p_broker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_pid uuid := public.resolve_broker_profile_id(p_broker_id);
    v_prof RECORD;
    v_country text;
    v_completed int := 0;
    v_failed int := 0;
    v_rating numeric := 5.0;
BEGIN
    IF v_pid IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT id, name, avatar_url, role, country, created_at, kyc_type, is_fully_verified, kyc_verified_at, last_seen_at
      INTO v_prof
      FROM public.profiles
     WHERE id = v_pid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT COALESCE(
        (SELECT rb.country FROM public.regional_brokers rb WHERE rb.user_id = v_pid AND rb.is_active = true LIMIT 1),
        v_prof.country,
        'DZ'
    ) INTO v_country;

    SELECT COUNT(*) FILTER (WHERE status = 'completed'),
           COUNT(*) FILTER (WHERE status IN ('cancelled', 'disputed'))
      INTO v_completed, v_failed
      FROM public.deals
     WHERE assigned_broker_id = v_pid;

    -- تقييم محسوب من نتائج الصفقات الفعلية (نسبة النجاح على مقياس 5 نجوم)
    IF (v_completed + v_failed) > 0 THEN
        v_rating := round((5.0 * v_completed::numeric / (v_completed + v_failed))::numeric, 1);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'id', v_prof.id,
        'name', COALESCE(NULLIF(v_prof.name, ''), 'وسيط معتمد'),
        'avatar_url', COALESCE(v_prof.avatar_url, ''),
        'role', v_prof.role,
        'country', upper(v_country),
        'member_since', v_prof.created_at,
        'kyc_type', v_prof.kyc_type,
        'is_fully_verified', COALESCE(v_prof.is_fully_verified, false),
        'kyc_verified_at', v_prof.kyc_verified_at,
        'completed_deals', v_completed,
        'rated_deals', v_completed + v_failed,
        'rating', v_rating,
        'last_seen_at', v_prof.last_seen_at,
        'is_online', (v_prof.last_seen_at IS NOT NULL AND v_prof.last_seen_at > now() - interval '5 minutes')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_broker_public_profile(uuid) TO anon, authenticated, service_role;

-- ج) تحديث بيانات التوثيق من المدير فقط
CREATE OR REPLACE FUNCTION public.admin_set_broker_kyc(
    p_broker_id uuid,
    p_kyc_type text,
    p_document_path text,
    p_is_verified boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pid uuid;
    v_doc text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: إدارة التوثيق متاحة لمدير المنصة فقط';
    END IF;

    v_pid := public.resolve_broker_profile_id(p_broker_id);
    IF v_pid IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على ملف الوسيط المطلوب';
    END IF;

    IF p_kyc_type IS NOT NULL AND p_kyc_type NOT IN ('passport', 'national_id', 'live_video') THEN
        RAISE EXCEPTION 'نوع توثيق غير صالح: %', p_kyc_type;
    END IF;

    SELECT COALESCE(NULLIF(p_document_path, ''), kyc_document_url) INTO v_doc
      FROM public.profiles WHERE id = v_pid;

    IF COALESCE(p_is_verified, false) AND p_kyc_type IS NULL THEN
        RAISE EXCEPTION 'يجب تحديد نوع التوثيق قبل تفعيل حالة موثق بالكامل';
    END IF;

    IF COALESCE(p_is_verified, false) AND p_kyc_type <> 'live_video' AND v_doc IS NULL THEN
        RAISE EXCEPTION 'يجب رفع صورة الوثيقة الرسمية قبل تفعيل حالة موثق بالكامل';
    END IF;

    UPDATE public.profiles
       SET kyc_type = p_kyc_type,
           kyc_document_url = v_doc,
           is_fully_verified = COALESCE(p_is_verified, false),
           kyc_verified_at = CASE WHEN COALESCE(p_is_verified, false) THEN timezone('utc'::text, now()) ELSE NULL END,
           kyc_verified_by = CASE WHEN COALESCE(p_is_verified, false) THEN auth.uid() ELSE NULL END
     WHERE id = v_pid;

    RETURN jsonb_build_object(
        'ok', true,
        'profile_id', v_pid,
        'kyc_type', p_kyc_type,
        'is_fully_verified', COALESCE(p_is_verified, false),
        'has_document', v_doc IS NOT NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_broker_kyc(uuid, text, text, boolean) TO authenticated;

-- د) قراءة بيانات التوثيق الكاملة للمدير (تتضمن مسار الوثيقة الخاص)
CREATE OR REPLACE FUNCTION public.admin_get_broker_kyc(p_broker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_pid uuid;
    v_row RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: بيانات التوثيق متاحة لمدير المنصة فقط';
    END IF;

    v_pid := public.resolve_broker_profile_id(p_broker_id);
    IF v_pid IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT kyc_type, kyc_document_url, is_fully_verified, kyc_verified_at
      INTO v_row FROM public.profiles WHERE id = v_pid;

    RETURN jsonb_build_object(
        'found', true,
        'profile_id', v_pid,
        'kyc_type', v_row.kyc_type,
        'kyc_document_url', v_row.kyc_document_url,
        'is_fully_verified', COALESCE(v_row.is_fully_verified, false),
        'kyc_verified_at', v_row.kyc_verified_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_broker_kyc(uuid) TO authenticated;

-- هـ) نبض حالة الاتصال (Online Presence Heartbeat)
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE public.profiles
       SET last_seen_at = timezone('utc'::text, now())
     WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

COMMIT;
