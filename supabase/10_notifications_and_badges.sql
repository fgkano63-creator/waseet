-- ==============================================================================
-- WASEET Platform - نظام الإشعارات الفورية وسياسات الأمان ودعم شارات PWA
-- Migration: 10_notifications_and_badges.sql
-- ==============================================================================

BEGIN;

-- 1. إنشاء جدول الإشعارات (notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- فهارس لتحسين سرعة الاستعلامات والفرز والبحث عن غير المقروء
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- تفعيل Realtime لجدول الإشعارات
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. تأمين البيانات وسياسات الأمان (Row Level Security - RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
ON public.notifications
FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
    auth.uid() = user_id
)
WITH CHECK (
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own"
ON public.notifications
FOR DELETE
TO authenticated
USING (
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;
CREATE POLICY "notifications_insert_authenticated"
ON public.notifications
FOR INSERT
TO authenticated, anon
WITH CHECK (
    true
);

-- 3. دالة إرسال الإشعار السحابية (send_waseet_notification)
CREATE OR REPLACE FUNCTION public.send_waseet_notification(
    p_user_id uuid,
    p_title text,
    p_message text,
    p_link text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_notif_id uuid;
BEGIN
    IF p_user_id IS NULL OR trim(p_title) = '' THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, link, is_read, created_at)
    VALUES (
        p_user_id,
        trim(p_title),
        trim(p_message),
        p_link,
        false,
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_notif_id;

    RETURN v_notif_id;
END;
$$;

-- 4. مشغل تلقائي لإرسال الإشعارات عند تحديث الصفقات (Deals Notifications)
CREATE OR REPLACE FUNCTION public.trg_fn_notify_deal_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- عند إنشاء صفقة جديدة (حجز حساب)
    IF TG_OP = 'INSERT' THEN
        -- إشعار البائع بحجز الحساب
        IF NEW.seller_id IS NOT NULL THEN
            PERFORM public.send_waseet_notification(
                NEW.seller_id,
                'تم حجز حسابك للوساطة! 🔒',
                'قام مشترٍ بحجز حسابك وتم تجميد النقاط في خزينة الوسيط. يرجى متابعة غرفة الصفقة.',
                'deals.html'
            );
        END IF;

        -- إشعار المشتري بنجاح الحجز
        IF NEW.buyer_id IS NOT NULL THEN
            PERFORM public.send_waseet_notification(
                NEW.buyer_id,
                'تم حجز الحساب بنجاح! 🎉',
                'تم تجميد نقاط الصفقة في خزينة وسيط الآمنة. بإمكانك فحص الحساب الآن.',
                'deals.html'
            );
        END IF;
        RETURN NEW;
    END IF;

    -- عند تحديث حالة الصفقة
    IF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        -- اكتمال الصفقة
        IF NEW.status = 'completed' THEN
            IF NEW.seller_id IS NOT NULL THEN
                PERFORM public.send_waseet_notification(
                    NEW.seller_id,
                    'اكتملت الصفقة بنجاح! 💰',
                    'تم تسليم الحساب بنجاح وإيداع كامل النقاط في محفظتك.',
                    'wallet.html'
                );
            END IF;
            IF NEW.buyer_id IS NOT NULL THEN
                PERFORM public.send_waseet_notification(
                    NEW.buyer_id,
                    'تهانينا! اكتملت صفقة الوساطة 🛡️',
                    'تم نقل الحساب إليك بنجاح ويسري ضمان المنصة الذهبي.',
                    'deals.html'
                );
            END IF;
        -- إلغاء الصفقة
        ELSIF NEW.status = 'cancelled' THEN
            IF NEW.seller_id IS NOT NULL THEN
                PERFORM public.send_waseet_notification(
                    NEW.seller_id,
                    'تم إلغاء حجز الحساب ↩️',
                    'تم إلغاء الصفقة وعاد حسابك للظهور في السوق العام.',
                    'my-accounts.html'
                );
            END IF;
            IF NEW.buyer_id IS NOT NULL THEN
                PERFORM public.send_waseet_notification(
                    NEW.buyer_id,
                    'تم إلغاء الصفقة واسترجاع النقاط ↩️',
                    'تم استرجاع كافة النقاط المحجوزة بالكامل إلى رصيد محفظتك.',
                    'wallet.html'
                );
            END IF;
        -- بدء الفحص والتسليم
        ELSIF NEW.status IN ('mediator_inspecting', 'buyer_inspecting') THEN
            IF NEW.buyer_id IS NOT NULL THEN
                PERFORM public.send_waseet_notification(
                    NEW.buyer_id,
                    'بيانات الحساب جاهزة للفحص 🔑',
                    'قام الوسيط بتدقيق بيانات الدخول، يمكنك الآن تجربة الحساب وتأكيد النقل.',
                    'deals.html'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_notifications ON public.deals;
CREATE TRIGGER trg_deals_notifications
AFTER INSERT OR UPDATE OF status ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_notify_deal_events();

-- 5. مشغل إشعارات حسابات المتجر (فحص واعتماد الحسابات)
CREATE OR REPLACE FUNCTION public.trg_fn_notify_account_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.seller_id IS NOT NULL AND NEW.status IN ('pending', 'pending_verification', 'pending_review') THEN
            PERFORM public.send_waseet_notification(
                NEW.seller_id,
                'حسابك قيد الفحص والمراجعة 📋',
                'تم استلام بيانات حسابك وسيقوم الوسيط بمطابقته وفحصه قبل النشر.',
                'my-accounts.html'
            );
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.seller_id IS NOT NULL THEN
            IF NEW.status IN ('available', 'approved') AND OLD.status NOT IN ('available', 'approved') THEN
                PERFORM public.send_waseet_notification(
                    NEW.seller_id,
                    'تم اعتماد حسابك في المتجر! 🚀',
                    'تم الانتهاء من فحص الحساب بنجاح وهو الآن متاح للبيع أمام آلاف المشترين.',
                    'my-accounts.html'
                );
            ELSIF NEW.status = 'rejected' THEN
                PERFORM public.send_waseet_notification(
                    NEW.seller_id,
                    'تنبيه: تم رفض الحساب بعد الفحص ⚠️',
                    'لم يجتز الحساب معايير الفحص والتحقق. يرجى مراجعة التفاصيل.',
                    'my-accounts.html'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_accounts_notifications ON public.marketplace_accounts;
CREATE TRIGGER trg_marketplace_accounts_notifications
AFTER INSERT OR UPDATE OF status ON public.marketplace_accounts
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_notify_account_events();

-- 6. مشغل إشعارات طلبات شحن النقاط (Deposit Requests)
CREATE OR REPLACE FUNCTION public.trg_fn_notify_deposit_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.user_id IS NOT NULL THEN
            IF NEW.status = 'approved' THEN
                PERFORM public.send_waseet_notification(
                    NEW.user_id,
                    'تم اعتماد شحن النقاط بنجاح! 💎',
                    'تمت الموافقة على طلب الشحن وإيداع النقاط في محفظتك.',
                    'wallet.html'
                );
            ELSIF NEW.status = 'rejected' THEN
                PERFORM public.send_waseet_notification(
                    NEW.user_id,
                    'تم رفض طلب شحن النقاط ❌',
                    'يرجى التأكد من صحة إيصال التحويل أو التواصل مع الوسيط المعتمد.',
                    'wallet.html'
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deposit_requests') THEN
        DROP TRIGGER IF EXISTS trg_deposit_requests_notifications ON public.deposit_requests;
        CREATE TRIGGER trg_deposit_requests_notifications
        AFTER UPDATE OF status ON public.deposit_requests
        FOR EACH ROW
        EXECUTE FUNCTION public.trg_fn_notify_deposit_events();
    END IF;
END $$;

-- 7. مشغل إشعارات رسائل الدعم الفني / الوسيط (Support Messages)
CREATE OR REPLACE FUNCTION public.trg_fn_notify_support_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- إذا كانت الرسالة مرسلة من الوسيط أو الإدارة، نرسل إشعاراً فورياً للمستخدم
    IF TG_OP = 'INSERT' AND NEW.sender_role IN ('admin', 'mediator') THEN
        IF NEW.user_id IS NOT NULL THEN
            PERFORM public.send_waseet_notification(
                NEW.user_id,
                'رسالة جديدة من الوسيط المعتمد 💬',
                substring(COALESCE(NEW.message, 'لديك رد جديد من فريق الوساطة والدعم') from 1 for 100),
                'contact-support.html'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_messages') THEN
        DROP TRIGGER IF EXISTS trg_support_messages_notifications ON public.support_messages;
        CREATE TRIGGER trg_support_messages_notifications
        AFTER INSERT ON public.support_messages
        FOR EACH ROW
        EXECUTE FUNCTION public.trg_fn_notify_support_messages();
    END IF;
END $$;

COMMIT;
