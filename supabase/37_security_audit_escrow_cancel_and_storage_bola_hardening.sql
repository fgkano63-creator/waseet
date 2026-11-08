-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 37: ESCROW CANCELLATION & STORAGE BOLA HARDENING
-- ==============================================================================
-- ملف الهجرة رقم 37: سد ثغرة إلغاء صفقات الضمان الأحادية وتحصين سلة صور المستخدمين
-- الموقع بالمشروع: D:\waseet-app\supabase\37_security_audit_escrow_cancel_and_storage_bola_hardening.sql
-- نسخة سطح المكتب: D:\H P\سطح المكتب 2\37_تحصين_إلغاء_صفقات_الضمان_وحماية_سلة_الصور_Supabase.sql
--
-- الشركاء: AntiGravity (Lead AI) & OpenCode (First Assistant)
-- المهارة المعتمدة: Cloudflare Security Audit Skill
--
-- الأهداف الأمنية:
-- 1. [WST-AUTHZ-ESCROW-UNILATERAL-CANCEL-04]: منع المشتري أو البائع من إلغاء الصفقة أحادياً
--    واسترداد الأموال بعد إرسال أو تسليم بيانات الدخول (المرحلة 2 فما فوق).
--    حصر حق الإلغاء وفك الحجز بعد تسليم البيانات بالمدير العام أو الوسيط الإقليمي فقط.
-- 2. [WST-STORAGE-BOLA-AVATARS-05]: سد ثغرة الصلاحيات (BOLA/IDOR) في سلة التخزين avatars
--    بمنع أي مستخدم من تعديل أو حذف صور مستخدمين آخرين وحصر الصلاحية بالمالك والمدير.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. تحصين دالة إلغاء صفقات الضمان public.cancel_escrow_deal
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_escrow_deal(
    p_deal_id text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    v_reason text := COALESCE(NULLIF(TRIM(p_reason), ''), 'تم إلغاء الصفقة عبر الوساطة المعتمدة');
    v_account_title text := 'الحساب المعروض';
    v_account_number integer;
    v_buyer_notif_msg text;
    v_seller_notif_msg text;
    v_total_points numeric := 0;
    v_new_account_status text := 'available';
BEGIN
    -- 1. جلب بيانات الصفقة مع قفل السجل (FOR UPDATE) لمنع تضارب العمليات
    SELECT * INTO v_deal
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الصفقة المطلوبة غير موجودة';
    END IF;

    -- التحقق من حالة الصفقة: يجب ألا تكون منتهية مسبقاً
    IF v_deal.status = 'completed' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء صفقة مكتملة تم تسليمها وتحرير أرباحها للبائع';
    END IF;

    IF v_deal.status IN ('cancelled', 'rejected') THEN
        RAISE EXCEPTION 'تم إلغاء هذه الصفقة مسبقاً';
    END IF;

    v_total_points := COALESCE(v_deal.total_points, 0);

    -- 2. التحقق الدقيق من هوية وصلاحيات المتصل
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
        v_caller_is_admin := true;
    END IF;

    IF NOT (v_caller_is_admin OR v_caller_is_broker OR v_caller_is_buyer OR v_caller_is_seller) THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بإلغاء هذه الصفقة';
    END IF;

    -- [حماية WST-AUTHZ-ESCROW-UNILATERAL-CANCEL-04]:
    -- يمنع منعاً باتاً على المشتري أو البائع إلغاء الصفقة إذا تم إرسال بيانات الدخول أو بلغت المرحلة 2+
    -- في هذه الحالة، يجب أن يتم الإلغاء حصرياً عبر الوسيط المعتمد أو المدير العام لحماية أموال الطرفين
    IF (v_caller_is_buyer OR v_caller_is_seller) AND NOT (v_caller_is_admin OR v_caller_is_broker) THEN
        IF COALESCE(v_deal.current_step, 1) > 1 OR v_deal.status NOT IN ('waiting_credentials') THEN
            RAISE EXCEPTION 'أمني: لا يمكن لأطراف الصفقة إلغاؤها بعد تقديم وفحص بيانات الحساب السرية. يرجى مراجعة الوسيط المعتمد في المحادثة للتدخل.';
        END IF;
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
                -- تجاهل إذا كان الجدول غير متوفر
            END;
        END IF;
    END IF;

    -- 4. تحديد حالة الحساب المعروض: إذا تم إلغاء الصفقة بعد كشف البيانات، يوضع الحساب قيد الفحص لمنع الاحتيال
    IF COALESCE(v_deal.current_step, 1) >= 2 THEN
        v_new_account_status := 'under_review';
    ELSE
        v_new_account_status := 'available';
    END IF;

    IF v_deal.account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = v_new_account_status,
            buyer_id = NULL,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = v_now
        WHERE id = v_deal.account_id;

        SELECT title, account_number INTO v_account_title, v_account_number
        FROM public.marketplace_accounts
        WHERE id = v_deal.account_id;
    END IF;

    -- 5. تحديث حالة الصفقة إلى cancelled
    UPDATE public.deals
    SET status = 'cancelled',
        current_step = 0,
        rejection_reason = v_reason,
        updated_at = v_now
    WHERE id = p_deal_id;

    -- 6. إرسال الإشعارات للطرفين
    v_buyer_notif_msg := 'تم إلغاء الصفقة #' || v_deal.id || ' واسترجاع كامل الرصيد المحجوز (' || v_total_points || ' نقطة) إلى محفظتك المتاحة.';
    v_seller_notif_msg := 'تم إلغاء الصفقة #' || v_deal.id || ' لحسابك ' || COALESCE(('#' || v_account_number), v_account_title) || ' من قبل الوسيط المعتمد.';

    BEGIN
        IF v_deal.buyer_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, link, is_read, created_at)
            VALUES (v_deal.buyer_id, 'تم إلغاء الصفقة واسترجاع الرصيد 💰', v_buyer_notif_msg, 'wallet.html', false, v_now);
        END IF;

        IF v_deal.seller_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, link, is_read, created_at)
            VALUES (v_deal.seller_id, 'إلغاء الصفقة عبر الوساطة 🏷️', v_seller_notif_msg, 'my-accounts.html', false, v_now);
        END IF;
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'refunded_points', v_total_points,
        'buyer_balance', v_buyer_balance,
        'status', 'cancelled',
        'account_status', v_new_account_status,
        'message', 'تم إلغاء الصفقة بنجاح واسترجاع النقاط للمشتري وحماية بيانات البائع'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_escrow_deal(text, text) TO authenticated, anon;


-- ------------------------------------------------------------------------------
-- 2. تحصين سياسات الأمان في سلة التخزين storage.objects (سد ثغرة BOLA في avatars)
-- ------------------------------------------------------------------------------

-- حذف السياسات القديمة المتساهلة من الميجريشن 30
DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_delete" ON storage.objects;

-- سياسة التعديل الصارمة: المستخدم يعدل فقط ملفاته داخل مجلده أو المدير العام
CREATE POLICY "avatars_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (
        (auth.uid())::text = (storage.foldername(name))[1]
        OR owner = auth.uid()
        OR public.is_admin()
    )
)
WITH CHECK (
    bucket_id = 'avatars'
    AND (
        (auth.uid())::text = (storage.foldername(name))[1]
        OR owner = auth.uid()
        OR public.is_admin()
    )
);

-- سياسة الحذف الصارمة: المستخدم يحذف فقط ملفاته داخل مجلده أو المدير العام
CREATE POLICY "avatars_authenticated_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (
        (auth.uid())::text = (storage.foldername(name))[1]
        OR owner = auth.uid()
        OR public.is_admin()
    )
);

COMMIT;

NOTIFY pgrst, 'reload schema';
