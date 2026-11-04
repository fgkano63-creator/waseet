-- =================================================================================
-- WASEET Platform - الهجرة رقم 20: التحصين الأمني الشامل للصفقات والسحوبات وأسرار الحسابات
-- 20_rls_financial_and_secrets_hardening.sql
--
-- يعالج هذا الملف الثغرات الحرجة المكتشفة في التدقيق الأمني الشامل مع ضمان توافق الأعمدة والجداول:
-- 0. التحقق من وجود عمود assigned_broker_id والدوال والجداول المعتمدة وإضافتها إن كانت مفقودة
-- 1. منع التلاعب المالي وتجاوز المراحل في جدول الصفقات (public.deals) عبر Trigger صارم
-- 2. حظر الإدراج المباشر لطلبات السحب الوهمية في جدول (public.withdrawals) خارج دالة request_withdrawal
-- 3. التحقق الصارم من الرصيد الفعلي والمحجوز عند اعتماد السحب في approve_withdrawal_request
-- 4. منع البائع من تعديل أو تغيير كلمات المرور في (public.marketplace_account_secrets) أثناء الصفقات أو بعد البيع
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- 0. تهيئة الأعمدة، الجداول، والدوال الأساسية المفقودة لضمان عدم حدوث خطأ 42703
-- ---------------------------------------------------------------------------------

-- أ) التأكد من وجود كافة الأعمدة المطلوبة في جدول profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email text DEFAULT '',
    ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS country text DEFAULT 'DZ',
    ADD COLUMN IF NOT EXISTS points_balance numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_points numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- ب) التأكد من وجود عمود assigned_broker_id وكافة الأعمدة المالية والمرحلية في جدول public.deals
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.marketplace_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS assigned_broker_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS seller_price numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fee numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_points numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'waiting_credentials',
    ADD COLUMN IF NOT EXISTS current_step integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_deals_assigned_broker_id ON public.deals(assigned_broker_id);

-- ب-2) التأكد من وجود الأعمدة المطلوبة في جدول public.marketplace_accounts
ALTER TABLE public.marketplace_accounts
    ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending_verification',
    ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- ج) التأكد من وجود دالة التحقق من المدير العام public.is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
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
              role IN ('admin', 'mediator')
              OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
          )
    )
    OR lower(coalesce(auth.jwt() ->> 'email', '')) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com');
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- د) التأكد من وجود دالة التحقق من الوسيط الإقليمي public.is_regional_broker()
CREATE OR REPLACE FUNCTION public.is_regional_broker()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'regional_broker'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_regional_broker() TO anon, authenticated, service_role;

-- هـ) التأكد من وجود جدول طلبات السحب (public.withdrawals) وكافة أعمدته
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

ALTER TABLE public.withdrawals
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS method text DEFAULT 'تحويل بنكي',
    ADD COLUMN IF NOT EXISTS details text DEFAULT '',
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS admin_note text DEFAULT '',
    ADD COLUMN IF NOT EXISTS reviewed_by uuid,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.withdrawals FROM anon;
GRANT SELECT, INSERT ON TABLE public.withdrawals TO authenticated;
GRANT ALL ON TABLE public.withdrawals TO service_role;

-- و) التأكد من وجود الجدول السري لبيانات الحسابات (public.marketplace_account_secrets) وكافة أعمدته
CREATE TABLE IF NOT EXISTS public.marketplace_account_secrets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
    seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    login_identifier text DEFAULT '',
    password text DEFAULT '',
    recovery_email text DEFAULT '',
    recovery_password text DEFAULT '',
    notes text DEFAULT '',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_marketplace_account_secrets_account UNIQUE (account_id)
);

ALTER TABLE public.marketplace_account_secrets
    ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS login_identifier text DEFAULT '',
    ADD COLUMN IF NOT EXISTS password text DEFAULT '',
    ADD COLUMN IF NOT EXISTS recovery_email text DEFAULT '',
    ADD COLUMN IF NOT EXISTS recovery_password text DEFAULT '',
    ADD COLUMN IF NOT EXISTS notes text DEFAULT '',
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

ALTER TABLE public.marketplace_account_secrets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_account_secrets TO authenticated;
GRANT ALL ON TABLE public.marketplace_account_secrets TO service_role;

-- ز) التأكد من وجود جدول سجل الحركات المالية (public.wallet_transactions) وكافة أعمدته (بما فيها balance_after و deal_id)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    deal_id text REFERENCES public.deals(id) ON DELETE SET NULL,
    amount numeric NOT NULL,
    balance_after numeric,
    type text NOT NULL DEFAULT 'deposit',
    status text NOT NULL DEFAULT 'completed',
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.wallet_transactions
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS deal_id text REFERENCES public.deals(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deposit_request_id uuid,
    ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS balance_after numeric,
    ADD COLUMN IF NOT EXISTS type text DEFAULT 'deposit',
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- ح) التأكد من وجود جدول الإشعارات (public.notifications) وكافة أعمدته (بما فيها link و is_read)
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS title text DEFAULT '',
    ADD COLUMN IF NOT EXISTS message text DEFAULT '',
    ADD COLUMN IF NOT EXISTS link text,
    ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now());


-- ---------------------------------------------------------------------------------
-- 1. تحصين جدول الصفقات (public.deals) ضد التلاعب بالأسعار أو الحالات أو الأطراف
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_deal_financial_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_is_admin boolean := public.is_admin();
    v_is_internal boolean := (coalesce(current_setting('app.internal_wallet_op', true), '') = 'true');
    v_is_assigned_broker boolean := false;
BEGIN
    -- السماح الكامل للعمليات المالية الذرية الداخلية (RPCs) وللمدير العام
    IF v_is_internal OR v_is_admin THEN
        NEW.updated_at := timezone('utc'::text, now());
        RETURN NEW;
    END IF;

    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'أمني: يجب تسجيل الدخول لتحديث بيانات الصفقة';
    END IF;

    -- أ) حظر قاطع لتعديل أي قيمة مالية (السعر، العمولة، الإجمالي)
    IF NEW.seller_price IS DISTINCT FROM OLD.seller_price
       OR NEW.fee IS DISTINCT FROM OLD.fee
       OR NEW.total_points IS DISTINCT FROM OLD.total_points THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بالتلاعب بأسعار أو عمولات أو نقاط الصفقة';
    END IF;

    -- ب) حظر قاطع لتغيير أطراف الصفقة أو معرف الحساب أو الوسيط المعين
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
       OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
       OR NEW.account_id IS DISTINCT FROM OLD.account_id
       OR NEW.assigned_broker_id IS DISTINCT FROM OLD.assigned_broker_id THEN
        RAISE EXCEPTION 'أمني: غير مصرح لك بتغيير أطراف الصفقة أو الحساب المرتبط بها';
    END IF;

    -- ج) التحقق من صلاحيات تغيير حالة الصفقة (status) وخطوة التنفيذ (current_step)
    v_is_assigned_broker := (
        OLD.assigned_broker_id IS NOT NULL
        AND OLD.assigned_broker_id = v_uid
        AND public.is_regional_broker()
    );

    IF v_is_assigned_broker THEN
        -- الوسيط الإقليمي المعين يمكنه إدارة خطوات الفحص والتسليم والنزاع،
        -- لكن الإتمام النهائي (completed) أو الإلغاء (cancelled) يتم عبر دوال التسوية الذرية (RPC)
        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('completed', 'cancelled') THEN
            RAISE EXCEPTION 'أمني: يجب إتمام أو إلغاء الصفقة حصراً عبر دوال التسوية المالية الذرية المعتمدة';
        END IF;
    ELSE
        -- المشتري أو البائع العادي لا يحق له تخطي فحص الوسيط أو تحويل الحالة إلى buyer_inspecting أو completed مباشرة
        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'disputed' THEN
            RAISE EXCEPTION 'أمني: غير مصرح للمشتري أو البائع بتغيير مرحلة الصفقة مباشرة بدون اعتماد الوسيط';
        END IF;

        IF NEW.current_step IS DISTINCT FROM OLD.current_step AND NEW.status <> 'disputed' THEN
            RAISE EXCEPTION 'أمني: غير مصرح للمشتري أو البائع بتجاوز خطوات الفحص والوساطة';
        END IF;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_deal_financial_tampering ON public.deals;
CREATE TRIGGER tr_prevent_deal_financial_tampering
    BEFORE UPDATE ON public.deals
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_deal_financial_tampering();

-- تعزيز سياسات القراءة والتحديث على جدول الصفقات
DROP POLICY IF EXISTS "deals_select_participants_or_admin" ON public.deals;
CREATE POLICY "deals_select_participants_or_admin"
ON public.deals
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR buyer_id = auth.uid()
    OR seller_id = auth.uid()
    OR assigned_broker_id = auth.uid()
);

DROP POLICY IF EXISTS "deals_update_participants_or_admin" ON public.deals;
CREATE POLICY "deals_update_participants_or_admin"
ON public.deals
FOR UPDATE
TO authenticated
USING (
    public.is_admin()
    OR buyer_id = auth.uid()
    OR seller_id = auth.uid()
    OR assigned_broker_id = auth.uid()
)
WITH CHECK (
    public.is_admin()
    OR coalesce(current_setting('app.internal_wallet_op', true), '') = 'true'
    OR buyer_id = auth.uid()
    OR seller_id = auth.uid()
    OR assigned_broker_id = auth.uid()
);


-- ---------------------------------------------------------------------------------
-- 2. تحصين جدول طلبات السحب (public.withdrawals) ضد الإدراج المباشر بدون تجميد الرصيد
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_unfrozen_withdrawal_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF coalesce(current_setting('app.internal_wallet_op', true), '') <> 'true'
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: لا يمكن إدراج طلب سحب مباشرة؛ يجب استخدام دالة request_withdrawal لتجميد الرصيد والتحقق منه';
    END IF;

    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
        RAISE EXCEPTION 'أمني: مبلغ السحب يجب أن يكون أكبر من الصفر';
    END IF;

    NEW.status := 'pending';
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_unfrozen_withdrawal_insert ON public.withdrawals;
CREATE TRIGGER tr_prevent_unfrozen_withdrawal_insert
    BEFORE INSERT ON public.withdrawals
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_unfrozen_withdrawal_insert();

-- سياسة القراءة والاعتماد لجدول السحوبات
DROP POLICY IF EXISTS "withdrawals_select_policy" ON public.withdrawals;
CREATE POLICY "withdrawals_select_policy"
ON public.withdrawals
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR public.is_admin()
);

-- تقييد سياسة الإضافة في جدول السحوبات لتشترط المرور عبر النظام المالي الداخلي (RPC)
DROP POLICY IF EXISTS "withdrawals_insert_policy" ON public.withdrawals;
CREATE POLICY "withdrawals_insert_policy"
ON public.withdrawals
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND amount > 0
    AND (
        coalesce(current_setting('app.internal_wallet_op', true), '') = 'true'
        OR public.is_admin()
    )
);

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

-- دالة تقديم طلب سحب رصيد وتجميد النقاط ذرياً (Atomic Request & Freeze)
CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_amount numeric,
    p_method text,
    p_details text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    SELECT id, points_balance, locked_points
    INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لم يتم العثور على الملف الشخصي للمستخدم';
    END IF;

    v_available := coalesce(v_profile.points_balance, 0) - coalesce(v_profile.locked_points, 0);

    IF v_available < p_amount THEN
        RAISE EXCEPTION 'الرصيد المتاح القابل للسحب (% نقطة) غير كافٍ لتغطية مبلغ السحب المطلوب (% نقطة)', v_available, p_amount;
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    UPDATE public.profiles
    SET locked_points = coalesce(locked_points, 0) + p_amount,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_user_id;

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

-- ترقية دالة اعتماد طلب السحب للتحقق الصارم من كفاية الرصيد الفعلي والمحجوز قبل الخصم
CREATE OR REPLACE FUNCTION public.approve_withdrawal_request(
    p_request_id uuid,
    p_admin_note text DEFAULT 'تم تحويل المبلغ المالي واعتماد السحب بنجاح'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    -- التحقق الأمني الحاسم: التأكد من أن رصيد المستخدم الفعلي والمحجوز يغطي قيمة السحب
    IF coalesce(v_user.points_balance, 0) < v_req.amount THEN
        RAISE EXCEPTION 'أمني: رصيد المستخدم الفعلي (% نقطة) أقل من قيمة السحب المطلوبة (% نقطة)', coalesce(v_user.points_balance, 0), v_req.amount;
    END IF;

    IF coalesce(v_user.locked_points, 0) < v_req.amount THEN
        RAISE EXCEPTION 'أمني: الرصيد المجمد للمستخدم (% نقطة) غير كافٍ لتغطية طلب السحب (% نقطة)', coalesce(v_user.locked_points, 0), v_req.amount;
    END IF;

    v_new_balance := coalesce(v_user.points_balance, 0) - v_req.amount;
    v_new_locked := coalesce(v_user.locked_points, 0) - v_req.amount;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    UPDATE public.profiles
    SET points_balance = v_new_balance,
        wallet_balance = v_new_balance,
        locked_points = v_new_locked,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_req.user_id;

    UPDATE public.withdrawals
    SET status = 'approved',
        admin_note = v_clean_note,
        reviewed_by = auth.uid(),
        reviewed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_request_id;

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


-- ---------------------------------------------------------------------------------
-- 3. تحصين جدول أسرار الحسابات (public.marketplace_account_secrets) أثناء وبعد الصفقات
-- ---------------------------------------------------------------------------------
DROP POLICY IF EXISTS "account_secrets_admin_all" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_admin_all"
ON public.marketplace_account_secrets
FOR ALL
TO authenticated
USING ( public.is_admin() )
WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS "account_secrets_seller_select" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_seller_select"
ON public.marketplace_account_secrets
FOR SELECT
TO authenticated
USING ( seller_id = auth.uid() );

DROP POLICY IF EXISTS "account_secrets_seller_insert" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_seller_insert"
ON public.marketplace_account_secrets
FOR INSERT
TO authenticated
WITH CHECK ( seller_id = auth.uid() OR public.is_admin() );

DROP POLICY IF EXISTS "account_secrets_seller_update" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_seller_update"
ON public.marketplace_account_secrets
FOR UPDATE
TO authenticated
USING (
    public.is_admin()
    OR (
        seller_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.marketplace_accounts a
            WHERE a.id = marketplace_account_secrets.account_id
              AND a.status NOT IN ('in_deal', 'sold', 'completed')
        )
    )
)
WITH CHECK (
    public.is_admin()
    OR (
        seller_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.marketplace_accounts a
            WHERE a.id = marketplace_account_secrets.account_id
              AND a.status NOT IN ('in_deal', 'sold', 'completed')
        )
    )
);

-- منع البائع من حذف أسرار الحساب أثناء وجوده في صفقة جارية أو بعد بيعه
DROP POLICY IF EXISTS "account_secrets_seller_delete" ON public.marketplace_account_secrets;
CREATE POLICY "account_secrets_seller_delete"
ON public.marketplace_account_secrets
FOR DELETE
TO authenticated
USING (
    public.is_admin()
    OR (
        seller_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.marketplace_accounts a
            WHERE a.id = marketplace_account_secrets.account_id
              AND a.status NOT IN ('in_deal', 'sold', 'completed')
        )
    )
);

COMMIT;
NOTIFY pgrst, 'reload schema';
