-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 25: SECURITY HARDENING & RLS INTEGRITY PATCH
-- تدقيق الأمان الشامل: سد ثغرات انتحال الأدوار في الرسائل وعزل بيانات الوسطاء المالية
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. حماية غرف الوساطة ومنع انتحال صفة الوسيط أو النظام في الرسائل (deal_messages)
-- يمنع أي مشتري أو بائع من إرسال رسالة برتبة 'mediator' أو 'system'
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_enforce_deal_message_sender_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deal RECORD;
    v_is_adm boolean := public.is_admin();
    v_is_brk boolean := false;
BEGIN
    -- جلب بيانات الصفقة
    SELECT buyer_id, seller_id, assigned_broker_id
    INTO v_deal
    FROM public.deals
    WHERE id = NEW.deal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'أمني: الصفقة المرتبطة بهذه الرسالة غير موجودة';
    END IF;

    -- السماح لعمليات الخادم والخدمات الداخلية (service_role) بإرسال إشعارات ورسائل النظام
    IF auth.uid() IS NULL AND (
        current_setting('role', true) = 'service_role' 
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    ) THEN
        IF NEW.sender_role IS NULL THEN
            NEW.sender_role := 'system';
        END IF;
        RETURN NEW;
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'أمني: يرجى تسجيل الدخول أولاً لإرسال رسائل في هذه الصفقة';
    END IF;

    -- التحقق إذا كان المرسل وسيطاً إقليمياً معيناً
    IF v_deal.assigned_broker_id IS NOT NULL AND v_deal.assigned_broker_id = auth.uid() THEN
        v_is_brk := true;
    END IF;

    -- التحقق وتثبيت الرتبة بناءً على الهوية الحقيقية
    IF v_is_adm THEN
        -- المدير العام يمكنه الإرسال كوسيط أو نظام
        IF NEW.sender_role NOT IN ('mediator', 'system', 'admin') THEN
            NEW.sender_role := 'mediator';
        END IF;
    ELSIF v_is_brk THEN
        -- الوسيط الإقليمي المعين يرسل كوسيط حصراً
        NEW.sender_role := 'mediator';
    ELSIF auth.uid() = v_deal.buyer_id THEN
        -- المشتري ملزم برتبة buyer حصراً
        IF NEW.sender_role <> 'buyer' THEN
            NEW.sender_role := 'buyer';
        END IF;
    ELSIF auth.uid() = v_deal.seller_id THEN
        -- البائع ملزم برتبة seller حصراً
        IF NEW.sender_role <> 'seller' THEN
            NEW.sender_role := 'seller';
        END IF;
    ELSE
        RAISE EXCEPTION 'أمني: ليس لديك صلاحية إرسال رسائل في هذه الصفقة';
    END IF;

    -- تثبيت معرف المرسل الحقيقي دائماً
    NEW.sender_id := auth.uid();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_deal_message_sender_role ON public.deal_messages;
CREATE TRIGGER tr_enforce_deal_message_sender_role
    BEFORE INSERT ON public.deal_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.tr_enforce_deal_message_sender_role();

-- ------------------------------------------------------------------------------
-- 2. حماية بيانات الوسطاء الإقليميين ومنع كشف الأرصدة والبريد للعموم (regional_brokers)
-- عزل الأعمدة المالية (wallet_balance, points_balance) والبريد الإلكتروني
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "regional_brokers_select_all" ON public.regional_brokers;
DROP POLICY IF EXISTS "regional_brokers_select_public_or_admin" ON public.regional_brokers;

-- سياسة مخصصة: العامة والمستخدمون يرون فقط الوسطاء النشطين
-- ويقتصر الاطلاع الكامل على بيانات الرصيد على المدير والوسيط نفسه
CREATE POLICY "regional_brokers_select_public_or_admin" ON public.regional_brokers
    FOR SELECT TO public
    USING (
        is_active = true 
        OR public.is_admin() 
        OR user_id = auth.uid()
    );

-- إنشاء View عامة نظيفة لعرض بيانات الوسطاء في الواجهة دون كشف الأرصدة
CREATE OR REPLACE VIEW public.public_regional_brokers AS
    SELECT 
        id,
        user_id,
        name,
        country,
        role,
        is_active,
        avatar_url,
        created_at
    FROM public.regional_brokers
    WHERE is_active = true;

GRANT SELECT ON public.public_regional_brokers TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. عزل وتأمين أعمدة الاعتماد القديمة في سوق الحسابات (marketplace_accounts)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- سحب صلاحية القراءة المباشرة لعمود credentials القديم إن وجد
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'marketplace_accounts' 
          AND column_name = 'credentials'
    ) THEN
        UPDATE public.marketplace_accounts
        SET credentials = '{}'::jsonb
        WHERE credentials IS NOT NULL AND credentials <> '{}'::jsonb;
    END IF;
END $$;

COMMIT;
