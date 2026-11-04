-- ==============================================================================
-- WASEET Platform - Migration 23: دالة الإلغاء الشاملة والذرية لصفقات الوساطة (Atomic Deal Cancellation)
-- File: supabase/23_atomic_cancel_escrow_deal.sql
-- ==============================================================================
-- تقوم هذه الدالة بتنفيذ دورة الإلغاء كاملة في عملية قاعدة بيانات واحدة متزامنة (Atomic Transaction):
-- 1. التحقق من حالة الصفقة (أنها جارية وليست منتهية مسبقاً).
-- 2. استرجاع النقاط بالكامل إلى محفظة المشتري المتاحة وتصفير النقاط المجمدة.
-- 3. إعادة الحساب المعروض فوراً إلى السوق العام بحالة 'available' ليعود للظهور أمام الجميع.
-- 4. تحديث حالة الصفقة إلى 'cancelled' وتسجيل وقت الإلغاء ومرحلة 0.
-- 5. إنشاء إشعارات فورية في جدول notifications لكل من المشتري والبائع.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_escrow_deal(
    p_deal_id text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deal public.deals%ROWTYPE;
    v_buyer public.profiles%ROWTYPE;
    v_buyer_balance numeric := 0;
    v_now timestamp with time zone := timezone('utc'::text, now());
    v_caller_id uuid := auth.uid();
    v_caller_is_admin boolean := false;
    v_caller_is_broker boolean := false;
    v_caller_is_buyer boolean := false;
    v_caller_is_seller boolean := false;
    v_reason text := COALESCE(NULLIF(TRIM(p_reason), ''), 'تم إلغاء الصفقة بواسطة الوسيط المعتمد');
    v_account_title text := 'الحساب المعروض';
    v_account_number integer;
    v_buyer_notif_msg text;
    v_seller_notif_msg text;
    v_total_points numeric := 0;
BEGIN
    -- 1. جلب بيانات الصفقة مع قفل السجل (FOR UPDATE) لمنع تضارب العمليات
    SELECT * INTO v_deal
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الصفقة المطلوبة غير موجودة';
    END IF;

    -- التحقق من حالة الصفقة: يجب أن تكون نشطة ولم تنتهِ مسبقاً
    IF v_deal.status = 'completed' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء صفقة مكتملة تم تسليمها وتحرير أرباحها للبائع';
    END IF;

    IF v_deal.status IN ('cancelled', 'rejected') THEN
        RAISE EXCEPTION 'تم إلغاء هذه الصفقة مسبقاً';
    END IF;

    v_total_points := COALESCE(v_deal.total_points, 0);

    -- 2. التحقق من صلاحيات المتصل (المدير العام، الوسيط الإقليمي المعين، أو أحد أطراف الصفقة)
    IF v_caller_id IS NOT NULL THEN
        v_caller_is_admin := public.is_admin();
        v_caller_is_broker := (
            (v_deal.assigned_broker_id IS NOT NULL AND v_deal.assigned_broker_id = v_caller_id) OR
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = v_caller_id AND role IN ('admin', 'mediator', 'regional_broker', 'broker')
            )
        );
        v_caller_is_buyer := (v_deal.buyer_id = v_caller_id);
        v_caller_is_seller := (v_deal.seller_id = v_caller_id);
    ELSE
        -- عند الاستدعاء المباشر من أدوات الإدارة
        v_caller_is_admin := true;
    END IF;

    IF NOT (v_caller_is_admin OR v_caller_is_broker OR v_caller_is_buyer OR v_caller_is_seller) THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بإلغاء هذه الصفقة';
    END IF;

    -- السماح بتعديل رصيد المحفظة داخلياً بتجاوز التريجر الوقائي
    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- 3. استرجاع النقاط للمشتري فوراً (إضافة إلى points_balance و wallet_balance وتصفير/خصم locked_points)
    IF v_deal.buyer_id IS NOT NULL THEN
        SELECT * INTO v_buyer FROM public.profiles WHERE id = v_deal.buyer_id FOR UPDATE;

        IF FOUND THEN
            UPDATE public.profiles
            SET points_balance = COALESCE(points_balance, 0) + v_total_points,
                wallet_balance = COALESCE(wallet_balance, points_balance, 0) + v_total_points,
                locked_points = GREATEST(0, COALESCE(locked_points, 0) - v_total_points),
                updated_at = v_now
            WHERE id = v_deal.buyer_id
            RETURNING COALESCE(points_balance, 0) INTO v_buyer_balance;

            -- تسجيل قيد الاسترجاع المالي في سجل المعاملات
            BEGIN
                INSERT INTO public.wallet_transactions (
                    user_id,
                    deal_id,
                    amount,
                    balance_after,
                    type,
                    status,
                    description
                ) VALUES (
                    v_deal.buyer_id,
                    v_deal.id,
                    v_total_points,
                    v_buyer_balance,
                    'refund',
                    'completed',
                    'استرداد كامل النقاط (' || v_total_points || ' نقطة) بعد إلغاء الصفقة #' || v_deal.id
                );
            EXCEPTION WHEN OTHERS THEN
                -- تجاوز إذا كان الجدول غير متوفر
            END;
        END IF;
    END IF;

    -- 4. إعادة الحساب إلى السوق العام (status = 'available') فوراً
    IF v_deal.account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'available',
            buyer_id = NULL,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = v_now
        WHERE id = v_deal.account_id;

        SELECT title, account_number INTO v_account_title, v_account_number
        FROM public.marketplace_accounts
        WHERE id = v_deal.account_id;
    END IF;

    -- 5. تحديث حالة الصفقة إلى cancelled وتسجيل وقت الإلغاء
    UPDATE public.deals
    SET status = 'cancelled',
        current_step = 0,
        updated_at = v_now
    WHERE id = p_deal_id;

    -- 6. إنشاء إشعارات فورية لكل من المشتري والبائع
    v_buyer_notif_msg := 'تم إلغاء الصفقة #' || v_deal.id || ' واسترجاع كامل الرصيد المحجوز (' || v_total_points || ' نقطة) إلى محفظتك المتاحة، وعاد الحساب للسوق العام.';
    v_seller_notif_msg := 'تم إلغاء الصفقة #' || v_deal.id || ' وعاد حسابك ' || COALESCE(('#' || v_account_number), v_account_title) || ' إلى المتجر متاحاً للبيع من جديد.';

    BEGIN
        -- إشعار المشتري
        IF v_deal.buyer_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, link, is_read, created_at)
            VALUES (
                v_deal.buyer_id,
                'تم إلغاء الصفقة واسترجاع الرصيد 💰',
                v_buyer_notif_msg,
                'wallet.html',
                false,
                v_now
            );
        END IF;

        -- إشعار البائع
        IF v_deal.seller_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, link, is_read, created_at)
            VALUES (
                v_deal.seller_id,
                'إلغاء الصفقة وعودة الحساب للمتجر 🏷️',
                v_seller_notif_msg,
                'deals.html',
                false,
                v_now
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- تجاوز أخطاء قيود الإشعارات الخارجية إن وجدت
    END;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'refunded_points', v_total_points,
        'buyer_balance', v_buyer_balance,
        'status', 'cancelled',
        'account_status', 'available',
        'message', 'تم إلغاء الصفقة بنجاح واسترجاع النقاط للمشتري وإعادة الحساب للمتجر'
    );
END;
$$;

-- منح أذونات التنفيذ لجميع المستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.cancel_escrow_deal(text, text) TO authenticated, anon;

-- توافق كامل مع الدالة القديمة refund_escrow_deal_points
CREATE OR REPLACE FUNCTION public.refund_escrow_deal_points(
    p_deal_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.cancel_escrow_deal(p_deal_id, 'استرجاع عبر الوساطة المعتمدة');
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_escrow_deal_points(text) TO authenticated, anon;

-- ==============================================================================
-- دوال إدارة الوسطاء الإقليميين المعززة (Promote & Demote Cascade)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.promote_to_regional_broker(
    p_target_user text,
    p_country text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_id uuid;
    v_country text := UPPER(TRIM(COALESCE(p_country, 'DZ')));
    v_target_name text;
    v_target_email text;
    v_clean_avatar text;
    v_tagged_avatar text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: فقط المدير العام يمكنه تعيين وترقية الوسطاء الإقليميين';
    END IF;

    -- البحث بالمعرف أو البريد
    SELECT id, name, email, REGEXP_REPLACE(COALESCE(avatar_url, ''), '#waseet_broker=[A-Za-z0-9_-]+', '', 'g')
    INTO v_target_id, v_target_name, v_target_email, v_clean_avatar
    FROM public.profiles
    WHERE id::text = TRIM(p_target_user) OR LOWER(email) = LOWER(TRIM(p_target_user))
    LIMIT 1;

    IF v_target_id IS NULL THEN
        RAISE EXCEPTION 'المستخدم المطلوب غير مسجل في قاعدة البيانات';
    END IF;

    v_tagged_avatar := COALESCE(NULLIF(v_clean_avatar, ''), 'assets/logo.png') || '#waseet_broker=' || v_country;

    -- ترقية المستخدم وتعيين دولته الفعلية ووسم الصورة
    UPDATE public.profiles
    SET role = 'regional_broker',
        country = v_country,
        avatar_url = v_tagged_avatar,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_target_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_target_id,
        'name', v_target_name,
        'email', v_target_email,
        'role', 'regional_broker',
        'country', v_country,
        'avatar_url', v_clean_avatar,
        'message', 'تمت ترقية المستخدم إلى وسيط إقليمي بنجاح'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_to_regional_broker(text, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.demote_regional_broker(
    p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.demote_regional_broker(p_target_id::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.demote_regional_broker(uuid) TO authenticated, anon;

COMMIT;
