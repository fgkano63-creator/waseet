-- =================================================================================
-- WASEET Platform - الهجرة رقم 19: نظام سحب النقاط والأرباح للوسطاء والبائعين
-- 19_withdrawals_system.sql
-- 
-- 1. إنشاء جدول withdrawals لطلبات سحب الرصيد مع سياسات RLS الصارمة
-- 2. إتاحة Realtime على جدول withdrawals
-- 3. الدوال الذرية المؤمّنة (SECURITY DEFINER RPCs):
--    (أ) request_withdrawal: تقديم طلب سحب، التحقق من الرصيد المتاح، وتجميد النقاط
--    (ب) approve_withdrawal_request: اعتماد المدير لطلب السحب وخصم النقاط نهائياً
--    (ج) reject_withdrawal_request: رفض المدير لطلب السحب وإلغاء تجميد النقاط
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- 1. إنشاء جدول طلبات السحب (public.withdrawals)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount numeric NOT NULL CHECK (amount > 0),
    method text NOT NULL DEFAULT 'تحويل بنكي',
    details text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note text DEFAULT '',
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- فهارس تحسين الأداء
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON public.withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON public.withdrawals(created_at DESC);

-- تفعيل Realtime على جدول withdrawals
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawals;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------------------------------------------------------------------------------
-- 2. ضبط الصلاحيات وسياسات الأمان (Row Level Security - RLS)
-- ---------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.withdrawals FROM anon;
GRANT SELECT, INSERT ON TABLE public.withdrawals TO authenticated;
GRANT ALL ON TABLE public.withdrawals TO service_role;

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- المستخدم العادي يرى طلباته الخاصة فقط، والمدير يرى كل الطلبات
DROP POLICY IF EXISTS "withdrawals_select_policy" ON public.withdrawals;
CREATE POLICY "withdrawals_select_policy"
ON public.withdrawals
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR public.is_admin()
);

-- المستخدم العادي يمكنه إنشاء طلب سحب لنفسه فقط
DROP POLICY IF EXISTS "withdrawals_insert_policy" ON public.withdrawals;
CREATE POLICY "withdrawals_insert_policy"
ON public.withdrawals
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
);

-- التحديث محصور فقط بالمدير (Admin)
DROP POLICY IF EXISTS "withdrawals_admin_update_policy" ON public.withdrawals;
CREATE POLICY "withdrawals_admin_update_policy"
ON public.withdrawals
FOR UPDATE
TO authenticated
USING (
    public.is_admin()
)
WITH CHECK (
    public.is_admin()
);

-- ---------------------------------------------------------------------------------
-- 3. الدوال الذرية المؤمّنة (SECURITY DEFINER RPCs)
-- ---------------------------------------------------------------------------------

-- (أ) دالة تقديم طلب سحب رصيد وتجميد النقاط ذرياً (Atomic Request & Freeze)
CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_amount numeric,
    p_method text,
    p_details text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_profile record;
    v_available numeric;
    v_req_id uuid;
    v_clean_method text;
    v_clean_details text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول لتقديم طلب سحب الرصيد';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'يرجى إدخال مبلغ صحيح أكبر من الصفر';
    END IF;

    v_clean_method := coalesce(nullif(trim(p_method), ''), 'تحويل بنكي');
    v_clean_details := nullif(trim(p_details), '');
    IF v_clean_details IS NULL THEN
        RAISE EXCEPTION 'يرجى إدخال بيانات الحساب المالي أو رقم المحفظة للاستلام';
    END IF;

    -- قفل سجل المستخدم للفحص والتجميد الذري (Prevent Race Conditions)
    SELECT id, points_balance, locked_points
    INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لم يتم العثور على الملف الشخصي للمستخدم';
    END IF;

    -- حساب الرصيد القابل للسحب (الرصيد الإجمالي - الرصيد المحجوز)
    v_available := coalesce(v_profile.points_balance, 0) - coalesce(v_profile.locked_points, 0);

    IF v_available < p_amount THEN
        RAISE EXCEPTION 'الرصيد المتاح القابل للسحب (% نقطة) غير كافٍ لتغطية مبلغ السحب المطلوب (% نقطة)', v_available, p_amount;
    END IF;

    -- تفعيل إذن النظام الداخلي لتخطي تريجر الحماية
    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- تجميد المبلغ بحجزه في locked_points
    UPDATE public.profiles
    SET locked_points = locked_points + p_amount,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_user_id;

    -- إنشاء سجل طلب السحب في جدول withdrawals
    INSERT INTO public.withdrawals (
        user_id,
        amount,
        method,
        details,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        p_amount,
        v_clean_method,
        v_clean_details,
        'pending',
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    ) RETURNING id INTO v_req_id;

    RETURN jsonb_build_object(
        'success', true,
        'withdrawal_id', v_req_id,
        'amount', p_amount,
        'method', v_clean_method,
        'frozen_points', p_amount,
        'available_after', v_available - p_amount,
        'message', 'تم تقديم طلب السحب وتجميد المبلغ بنجاح لحين المراجعة'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) TO authenticated;


-- (ب) دالة اعتماد طلب السحب من قبل المدير وخصم النقاط نهائياً
CREATE OR REPLACE FUNCTION public.approve_withdrawal_request(
    p_request_id uuid,
    p_admin_note text DEFAULT 'تم تحويل المبلغ المالي واعتماد السحب بنجاح'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req record;
    v_user record;
    v_new_balance numeric;
    v_new_locked numeric;
    v_clean_note text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: غير مصرح لغير المدير باعتماد طلبات سحب الرصيد';
    END IF;

    v_clean_note := coalesce(nullif(trim(p_admin_note), ''), 'تم تحويل المبلغ المالي واعتماد السحب بنجاح');

    -- قفل سجل طلب السحب
    SELECT * INTO v_req
    FROM public.withdrawals
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب السحب غير موجود';
    END IF;

    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'هذا الطلب تمت معالجته مسبقاً (الحالة الحالية: %)', v_req.status;
    END IF;

    -- قفل سجل المستخدم
    SELECT id, points_balance, locked_points
    INTO v_user
    FROM public.profiles
    WHERE id = v_req.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الملف الشخصي لصاحب الطلب غير موجود';
    END IF;

    -- خصم النقاط من الرصيد الكلي وإلغاء حجزها من locked_points
    v_new_balance := greatest(0, coalesce(v_user.points_balance, 0) - v_req.amount);
    v_new_locked := greatest(0, coalesce(v_user.locked_points, 0) - v_req.amount);

    -- تفعيل إذن النظام الداخلي لتخطي تريجر الحماية
    PERFORM set_config('app.internal_wallet_op', 'true', true);

    UPDATE public.profiles
    SET points_balance = v_new_balance,
        wallet_balance = v_new_balance,
        locked_points = v_new_locked,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_req.user_id;

    -- تحديث حالة الطلب إلى approved
    UPDATE public.withdrawals
    SET status = 'approved',
        admin_note = v_clean_note,
        reviewed_by = auth.uid(),
        reviewed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_request_id;

    -- تسجيل الحركة المالية في wallet_transactions
    INSERT INTO public.wallet_transactions (
        user_id,
        amount,
        balance_after,
        type,
        status,
        description
    ) VALUES (
        v_req.user_id,
        -v_req.amount,
        v_new_balance,
        'withdraw',
        'completed',
        'سحب رصيد معتمد بمقدار ' || v_req.amount || ' نقطة عبر ' || v_req.method || ' (' || v_clean_note || ')'
    );

    -- إرسال إشعار فوري للمستخدم
    BEGIN
        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            link
        ) VALUES (
            v_req.user_id,
            'تمت الموافقة على طلب سحب الرصيد',
            'تم اعتماد طلب السحب بمبلغ ' || v_req.amount || ' نقطة وتحويله بنجاح عبر ' || v_req.method || '.',
            'wallet.html'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'status', 'approved',
        'amount', v_req.amount,
        'new_balance', v_new_balance,
        'new_locked', v_new_locked
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_withdrawal_request(uuid, text) TO authenticated;


-- (ج) دالة رفض طلب السحب وإعادة فك التجميد عن النقاط (Unfreeze Points)
CREATE OR REPLACE FUNCTION public.reject_withdrawal_request(
    p_request_id uuid,
    p_admin_note text DEFAULT 'تم رفض طلب السحب وإعادة النقاط إلى محفظتك'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req record;
    v_user record;
    v_new_locked numeric;
    v_clean_note text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: غير مصرح لغير المدير برفض طلبات سحب الرصيد';
    END IF;

    v_clean_note := coalesce(nullif(trim(p_admin_note), ''), 'تم رفض طلب السحب وإعادة النقاط إلى محفظتك');

    -- قفل سجل طلب السحب
    SELECT * INTO v_req
    FROM public.withdrawals
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب السحب غير موجود';
    END IF;

    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'هذا الطلب تمت معالجته مسبقاً (الحالة الحالية: %)', v_req.status;
    END IF;

    -- قفل سجل المستخدم
    SELECT id, points_balance, locked_points
    INTO v_user
    FROM public.profiles
    WHERE id = v_req.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الملف الشخصي لصاحب الطلب غير موجود';
    END IF;

    -- فك تجميد المبلغ بإعادته من locked_points
    v_new_locked := greatest(0, coalesce(v_user.locked_points, 0) - v_req.amount);

    -- تفعيل إذن النظام الداخلي لتخطي تريجر الحماية
    PERFORM set_config('app.internal_wallet_op', 'true', true);

    UPDATE public.profiles
    SET locked_points = v_new_locked,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_req.user_id;

    -- تحديث حالة الطلب إلى rejected
    UPDATE public.withdrawals
    SET status = 'rejected',
        admin_note = v_clean_note,
        reviewed_by = auth.uid(),
        reviewed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_request_id;

    -- إرسال إشعار فوري للمستخدم بسبب الرفض
    BEGIN
        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            link
        ) VALUES (
            v_req.user_id,
            'تم رفض طلب سحب الرصيد',
            'تم رفض طلب السحب بمبلغ ' || v_req.amount || ' نقطة وإلغاء تجميد النقاط لتعود متاحة في محفظتك. السبب: ' || v_clean_note,
            'wallet.html'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'status', 'rejected',
        'amount', v_req.amount,
        'unfrozen_points', v_req.amount,
        'new_locked', v_new_locked
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_withdrawal_request(uuid, text) TO authenticated;

COMMIT;
