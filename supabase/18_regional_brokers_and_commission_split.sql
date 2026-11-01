-- =================================================================================
-- WASEET Platform - الهجرة رقم 18: نظام الوسطاء الإقليميين وتقسيم العمولات الذكي
-- 18_regional_brokers_and_commission_split.sql
-- 
-- 1. هيكلة الوسطاء والدول في جدول profiles (country + role: user, regional_broker, admin)
-- 2. توجيه الصفقات الذكي (Smart Routing) وحقل assigned_broker_id في جدول deals
-- 3. صلاحيات غرف الوساطة (4 أطراف فقط: مشتري، بائع، وسيط إقليمي معين، مدير عام)
-- 4. التوزيع المالي الذكي للعمولة في release_escrow_deal_points (66% للوسيط، 34% للمنصة)
-- 5. دوال لوحة الإدارة لترقية وتعيين الوسطاء الإقليميين وتحديد دولهم
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- 1. تحديث جدول profiles لدعم الدول ورتبة الوسيط الإقليمي (regional_broker)
-- ---------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'DZ';

CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- تحديث قيد الرتب (roles) لدعم regional_broker
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'regional_broker', 'admin', 'mediator'));

-- ---------------------------------------------------------------------------------
-- 2. تحديث جدول سجل الحركات المالية (wallet_transactions)
-- لإتاحة تسجيل broker_commission و admin_commission
-- ---------------------------------------------------------------------------------
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('deposit', 'withdraw', 'escrow_lock', 'escrow_refund', 'payout', 'fee', 'broker_commission', 'admin_commission'));

-- ---------------------------------------------------------------------------------
-- 3. تحديث جدول الصفقات (deals) لإضافة حقل الوسيط الإقليمي المعين (assigned_broker_id)
-- ---------------------------------------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS assigned_broker_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_assigned_broker_id ON public.deals(assigned_broker_id);

-- ---------------------------------------------------------------------------------
-- 4. دوال الأمان المساعدة (Helper Functions)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_regional_broker()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'regional_broker'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_regional_broker() TO authenticated, service_role, anon;

-- تحديث دالة public.is_admin لتشمل المدراء المعتمدين
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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

-- ---------------------------------------------------------------------------------
-- 5. تحديث سياسات الأمان (RLS) لجدول deals
-- قصر الوصول على 4 أطراف كحد أقصى: (المشتري، البائع، الوسيط الإقليمي المعين، والمدير العام)
-- ---------------------------------------------------------------------------------
DROP POLICY IF EXISTS "deals_select_participants_or_admin" ON public.deals;
CREATE POLICY "deals_select_participants_or_admin"
ON public.deals
FOR SELECT
TO authenticated
USING (
  buyer_id = auth.uid()
  OR seller_id = auth.uid()
  OR assigned_broker_id = auth.uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "deals_update_participants_or_admin" ON public.deals;
CREATE POLICY "deals_update_participants_or_admin"
ON public.deals
FOR UPDATE
TO authenticated
USING (
  buyer_id = auth.uid()
  OR seller_id = auth.uid()
  OR assigned_broker_id = auth.uid()
  OR public.is_admin()
)
WITH CHECK (
  buyer_id = auth.uid()
  OR seller_id = auth.uid()
  OR assigned_broker_id = auth.uid()
  OR public.is_admin()
);

-- ---------------------------------------------------------------------------------
-- 6. تحديث سياسات الأمان (RLS) لجدول deal_messages
-- ---------------------------------------------------------------------------------
DROP POLICY IF EXISTS "deal_messages_participants_select" ON public.deal_messages;
CREATE POLICY "deal_messages_participants_select"
ON public.deal_messages
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_messages.deal_id
      AND (
        (d.assigned_broker_id = auth.uid())
        OR (d.buyer_id = auth.uid() AND deal_messages.channel_type IN ('buyer_mediator', 'all', 'system'))
        OR (d.seller_id = auth.uid() AND deal_messages.channel_type IN ('seller_mediator', 'all', 'system'))
      )
  )
);

DROP POLICY IF EXISTS "deal_messages_participants_insert" ON public.deal_messages;
CREATE POLICY "deal_messages_participants_insert"
ON public.deal_messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_messages.deal_id
        AND (
          d.buyer_id = auth.uid()
          OR d.seller_id = auth.uid()
          OR d.assigned_broker_id = auth.uid()
        )
    )
  )
);

-- ---------------------------------------------------------------------------------
-- 7. دالة جلب الوسيط الإقليمي لدولة معينة (Smart Routing Helper)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_regional_broker_for_country(p_country text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_country text := UPPER(TRIM(COALESCE(p_country, 'DZ')));
    v_broker record;
BEGIN
    -- البحث أولاً عن وسيط إقليمي لنفس دولة المستخدم (الأقل حملاً بالصفقات النشطة)
    SELECT id, name, email, avatar_url, role, country INTO v_broker
    FROM public.profiles
    WHERE role = 'regional_broker'
      AND UPPER(country) = v_target_country
    ORDER BY (
      SELECT COUNT(*) FROM public.deals d
      WHERE d.assigned_broker_id = profiles.id
        AND d.status NOT IN ('completed', 'cancelled')
    ) ASC, created_at ASC
    LIMIT 1;

    -- إذا لم يوجد وسيط إقليمي مسجل لتلك الدولة، يتم البحث عن أي وسيط إقليمي نشط كبديل
    IF v_broker.id IS NULL THEN
        SELECT id, name, email, avatar_url, role, country INTO v_broker
        FROM public.profiles
        WHERE role = 'regional_broker'
        ORDER BY (
          SELECT COUNT(*) FROM public.deals d
          WHERE d.assigned_broker_id = profiles.id
            AND d.status NOT IN ('completed', 'cancelled')
        ) ASC, created_at ASC
        LIMIT 1;
    END IF;

    IF v_broker.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'found', true,
            'id', v_broker.id,
            'name', v_broker.name,
            'email', v_broker.email,
            'avatar_url', v_broker.avatar_url,
            'country', v_broker.country
        );
    ELSE
        RETURN jsonb_build_object('found', false);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_regional_broker_for_country(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------------
-- 8. تحديث lock_escrow_points_for_deal لتضمين التوجيه الذكي للوسيط الإقليمي
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_escrow_points_for_deal(
    p_deal_id text,
    p_account_id uuid,
    p_seller_id uuid,
    p_seller_price numeric,
    p_fee numeric,
    p_total_points numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_buyer_id uuid := auth.uid();
    v_profile public.profiles%rowtype;
    v_acc public.marketplace_accounts%rowtype;
    v_new_balance numeric;
    v_new_locked numeric;
    v_buyer_country text;
    v_assigned_broker_id uuid;
    v_broker_info jsonb;
    v_now timestamp with time zone := timezone('utc'::text, now());
BEGIN
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لإتمام عملية الشراء';
    END IF;

    IF p_total_points <= 0 OR p_seller_price <= 0 OR p_fee < 0 THEN
        RAISE EXCEPTION 'قيم الصفقة غير صالحة';
    END IF;

    -- 1. التحقق من الحساب
    IF p_account_id IS NOT NULL THEN
        SELECT * INTO v_acc
        FROM public.marketplace_accounts
        WHERE id = p_account_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'الحساب المطلوب للشراء غير موجود بالمتجر';
        END IF;

        IF v_acc.status NOT IN ('available', 'approved') THEN
            RAISE EXCEPTION 'هذا الحساب محجوز حالياً في صفقة أخرى أو تم بيعه مسبقاً';
        END IF;

        IF v_acc.seller_price <> p_seller_price THEN
            RAISE EXCEPTION 'أمني: سعر الحساب غير مطابق للسعر المسجل في المتجر (المطلوب: % نقطة)', v_acc.seller_price;
        END IF;

        IF v_acc.seller_id = v_buyer_id THEN
            RAISE EXCEPTION 'أمني: لا يمكنك شراء حسابك الخاص المعروض للبيع';
        END IF;
    END IF;

    IF p_total_points < (p_seller_price + p_fee) THEN
        RAISE EXCEPTION 'أمني: إجمالي النقاط المحجوزة غير كافٍ لتغطية سعر الحساب وعمولة المنصة';
    END IF;

    -- 2. التحقق من رصيد المشتري ودولته
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_buyer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الملف الشخصي للمشتري غير موجود';
    END IF;

    IF v_profile.points_balance < p_total_points THEN
        RAISE EXCEPTION 'رصيد النقاط المتاح (% نقطة) غير كافٍ لشراء الحساب (% نقطة)', v_profile.points_balance, p_total_points;
    END IF;

    v_buyer_country := UPPER(TRIM(COALESCE(v_profile.country, 'DZ')));

    -- 3. التوجيه الذكي للوسيط الإقليمي (Smart Routing)
    v_broker_info := public.get_regional_broker_for_country(v_buyer_country);
    IF (v_broker_info->>'found')::boolean = true THEN
        v_assigned_broker_id := (v_broker_info->>'id')::uuid;
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- 4. خصم النقاط من الرصيد المتاح وإضافتها للمحجوز
    UPDATE public.profiles
    SET points_balance = points_balance - p_total_points,
        wallet_balance = points_balance - p_total_points,
        locked_points = locked_points + p_total_points,
        updated_at = v_now
    WHERE id = v_buyer_id
    RETURNING points_balance, locked_points INTO v_new_balance, v_new_locked;

    -- 5. إنشاء أو تحديث سجل الصفقة مع تعيين الوسيط الإقليمي
    INSERT INTO public.deals (
        id,
        account_id,
        buyer_id,
        seller_id,
        assigned_broker_id,
        seller_price,
        fee,
        total_points,
        status,
        current_step,
        locked_at,
        created_at,
        updated_at
    ) VALUES (
        p_deal_id,
        p_account_id,
        v_buyer_id,
        COALESCE(p_seller_id, v_acc.seller_id),
        v_assigned_broker_id,
        p_seller_price,
        p_fee,
        p_total_points,
        'mediator_inspecting',
        2,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (id) DO UPDATE SET
        assigned_broker_id = COALESCE(public.deals.assigned_broker_id, EXCLUDED.assigned_broker_id),
        status = 'mediator_inspecting',
        locked_at = COALESCE(public.deals.locked_at, v_now),
        updated_at = v_now;

    -- 6. إخفاء الحساب من المتجر
    IF p_account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'in_deal',
            locked_at = v_now,
            locked_by = v_buyer_id,
            updated_at = v_now
        WHERE id = p_account_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', p_deal_id,
        'total_locked', p_total_points,
        'buyer_points_balance', v_new_balance,
        'buyer_locked_points', v_new_locked,
        'assigned_broker_id', v_assigned_broker_id,
        'broker_info', v_broker_info,
        'buyer_country', v_buyer_country
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_escrow_points_for_deal(text, uuid, uuid, numeric, numeric, numeric) TO authenticated;

-- ---------------------------------------------------------------------------------
-- 9. تحديث دالة تحرير الرصيد وإتمام الصفقة release_escrow_deal_points
-- تنفيذ التوزيع المالي الذكي:
-- 66% للوسيط الإقليمي المعين (broker_commission)
-- 34% للمدير العام / أرباح المنصة (admin_commission)
-- أمثلة: 3 نقاط -> 2 للوسيط، 1 للإدارة | 10 نقاط -> 6 للوسيط، 4 للإدارة
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_escrow_deal_points(
    p_deal_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deal public.deals%rowtype;
    v_seller_balance numeric;
    v_admin_id uuid;
    v_admin_balance numeric;
    v_broker_id uuid;
    v_broker_balance numeric;
    v_total_fee numeric;
    v_broker_fee numeric := 0;
    v_admin_fee numeric := 0;
    v_caller_is_admin boolean;
    v_caller_is_broker boolean;
    v_now timestamp with time zone := timezone('utc'::text, now());
BEGIN
    -- قفل سجل الصفقة لمنع تكرار التحويل (Race Condition Protection)
    SELECT * INTO v_deal
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الصفقة المطلوبة غير موجودة';
    END IF;

    v_caller_is_admin := public.is_admin();
    v_caller_is_broker := (v_deal.assigned_broker_id IS NOT NULL AND v_deal.assigned_broker_id = auth.uid());

    -- التحقق الأمني: مسموح للمدير، الوسيط الإقليمي المعين، أو المشتري
    IF NOT (v_caller_is_admin OR v_caller_is_broker OR v_deal.buyer_id = auth.uid()) THEN
        RAISE EXCEPTION 'أمني: فقط الوسيط الإقليمي المعين، المدير العام، أو المشتري يمكنه تأكيد استلام الحساب وإتمام الصفقة';
    END IF;

    IF v_deal.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'deal_id', v_deal.id,
            'message', 'الصفقة مكتملة وموثقة مسبقاً'
        );
    END IF;

    IF v_deal.status = 'cancelled' THEN
        RAISE EXCEPTION 'لا يمكن إتمام صفقة ملغاة';
    END IF;

    PERFORM set_config('app.internal_wallet_op', 'true', true);

    -- أ) خصم النقاط المحجوزة لدى المشتري (فك الحجز التام)
    IF v_deal.buyer_id IS NOT NULL THEN
        UPDATE public.profiles
        SET locked_points = GREATEST(0, COALESCE(locked_points, 0) - v_deal.total_points),
            updated_at = v_now
        WHERE id = v_deal.buyer_id;
    END IF;

    -- ب) إضافة صافي النقاط المستحقة للبائع في محفظته وتسجيل العملية المالية في السجل
    IF v_deal.seller_id IS NOT NULL AND v_deal.seller_price > 0 THEN
        UPDATE public.profiles
        SET points_balance = COALESCE(points_balance, 0) + v_deal.seller_price,
            wallet_balance = COALESCE(wallet_balance, points_balance, 0) + v_deal.seller_price,
            updated_at = v_now
        WHERE id = v_deal.seller_id
        RETURNING COALESCE(points_balance, 0) INTO v_seller_balance;

        INSERT INTO public.wallet_transactions (
            user_id,
            deal_id,
            amount,
            balance_after,
            type,
            status,
            description
        ) VALUES (
            v_deal.seller_id,
            v_deal.id,
            v_deal.seller_price,
            v_seller_balance,
            'payout',
            'completed',
            'استلام أرباح بيع حساب (صفقة #' || v_deal.id || ') بعد خصم عمولة المنصة (' || v_deal.fee || ' نقطة)'
        );
    END IF;

    -- ج) التوزيع المالي الذكي للعمولة (Commission Splitting)
    v_total_fee := COALESCE(v_deal.fee, 0);

    -- العثور على حساب المدير العام / محفظة المنصة
    SELECT id INTO v_admin_id
    FROM public.profiles
    WHERE role IN ('admin', 'mediator')
       OR lower(email) IN ('fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com')
    ORDER BY CASE WHEN id = auth.uid() AND role = 'admin' THEN 0 WHEN role = 'admin' THEN 1 ELSE 2 END, created_at ASC
    LIMIT 1;

    v_broker_id := v_deal.assigned_broker_id;

    IF v_total_fee > 0 THEN
        -- إذا وجد وسيط إقليمي معين للصفقة وليس هو المدير نفسه
        IF v_broker_id IS NOT NULL AND (v_admin_id IS NULL OR v_broker_id <> v_admin_id) THEN
            -- التقسيم الرياضي: 66.6% للوسيط، والباقي للمنصة (33.4%)
            -- أمثلة: 3 * 2 / 3 = 2 للوسيط، 1 للإدارة | 10 * 2 / 3 = 6 للوسيط، 4 للإدارة
            v_broker_fee := floor(v_total_fee * 2.0 / 3.0);
            v_admin_fee := v_total_fee - v_broker_fee;

            -- 1. إيداع حصة الوسيط الإقليمي (broker_commission)
            IF v_broker_fee > 0 THEN
                UPDATE public.profiles
                SET points_balance = COALESCE(points_balance, 0) + v_broker_fee,
                    wallet_balance = COALESCE(wallet_balance, points_balance, 0) + v_broker_fee,
                    updated_at = v_now
                WHERE id = v_broker_id
                RETURNING COALESCE(points_balance, 0) INTO v_broker_balance;

                INSERT INTO public.wallet_transactions (
                    user_id,
                    deal_id,
                    amount,
                    balance_after,
                    type,
                    status,
                    description
                ) VALUES (
                    v_broker_id,
                    v_deal.id,
                    v_broker_fee,
                    v_broker_balance,
                    'broker_commission',
                    'completed',
                    'عمولة وساطة إقليمية من الصفقة #' || v_deal.id || ' (نسبة 66%)'
                );
            END IF;

            -- 2. إيداع حصة المدير العام / أرباح المنصة (admin_commission)
            IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
                UPDATE public.profiles
                SET points_balance = COALESCE(points_balance, 0) + v_admin_fee,
                    wallet_balance = COALESCE(wallet_balance, points_balance, 0) + v_admin_fee,
                    updated_at = v_now
                WHERE id = v_admin_id
                RETURNING COALESCE(points_balance, 0) INTO v_admin_balance;

                INSERT INTO public.wallet_transactions (
                    user_id,
                    deal_id,
                    amount,
                    balance_after,
                    type,
                    status,
                    description
                ) VALUES (
                    v_admin_id,
                    v_deal.id,
                    v_admin_fee,
                    v_admin_balance,
                    'admin_commission',
                    'completed',
                    'أرباح المنصة / عمولة الإدارة من الصفقة #' || v_deal.id || ' (نسبة 34%)'
                );
            END IF;
        ELSE
            -- لا يوجد وسيط إقليمي منفصل، العمولة تذهب كاملة 100% لحساب المدير / المنصة
            v_admin_fee := v_total_fee;

            IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
                UPDATE public.profiles
                SET points_balance = COALESCE(points_balance, 0) + v_admin_fee,
                    wallet_balance = COALESCE(wallet_balance, points_balance, 0) + v_admin_fee,
                    updated_at = v_now
                WHERE id = v_admin_id
                RETURNING COALESCE(points_balance, 0) INTO v_admin_balance;

                INSERT INTO public.wallet_transactions (
                    user_id,
                    deal_id,
                    amount,
                    balance_after,
                    type,
                    status,
                    description
                ) VALUES (
                    v_admin_id,
                    v_deal.id,
                    v_admin_fee,
                    v_admin_balance,
                    'admin_commission',
                    'completed',
                    'تحصيل كامل عمولة الوساطة من الصفقة #' || v_deal.id
                );
            END IF;
        END IF;
    END IF;

    -- د) تحديث حالة الصفقة إلى مكتملة (المرحلة 4)
    UPDATE public.deals
    SET status = 'completed',
        current_step = 4,
        updated_at = v_now
    WHERE id = p_deal_id;

    -- هـ) تغيير مالك الحساب (owner_id & buyer_id) إلى معرّف المشتري وحالته إلى مباع (sold)
    IF v_deal.account_id IS NOT NULL THEN
        UPDATE public.marketplace_accounts
        SET status = 'sold',
            buyer_id = v_deal.buyer_id,
            owner_id = v_deal.buyer_id,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = v_now
        WHERE id = v_deal.account_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deal_id', v_deal.id,
        'seller_payout', v_deal.seller_price,
        'platform_fee', v_deal.fee,
        'assigned_broker_id', v_broker_id,
        'broker_commission', v_broker_fee,
        'admin_commission', v_admin_fee,
        'buyer_id', v_deal.buyer_id,
        'owner_id', v_deal.buyer_id,
        'status', 'completed'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_escrow_deal_points(text) TO authenticated;

-- ---------------------------------------------------------------------------------
-- 10. دوال لوحة الإدارة لترقية وتعيين الوسطاء الإقليميين
-- ---------------------------------------------------------------------------------
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
    v_admin_id uuid := auth.uid();
    v_target_id uuid;
    v_country text := UPPER(TRIM(COALESCE(p_country, 'DZ')));
    v_target_name text;
    v_target_email text;
BEGIN
    -- التحقق الأمني: مسموح للمدير العام فقط
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: فقط المدير العام يمكنه تعيين وترقية الوسطاء الإقليميين';
    END IF;

    -- البحث عن المستخدم بالمعرف أو البريد
    SELECT id, name, email INTO v_target_id, v_target_name, v_target_email
    FROM public.profiles
    WHERE id::text = p_target_user OR LOWER(email) = LOWER(TRIM(p_target_user))
    LIMIT 1;

    IF v_target_id IS NULL THEN
        RAISE EXCEPTION 'المستخدم المطلوب غير مسجل في قاعدة البيانات';
    END IF;

    -- ترقية المستخدم وتعيين دولته
    UPDATE public.profiles
    SET role = 'regional_broker',
        country = v_country,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_target_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_target_id,
        'name', v_target_name,
        'email', v_target_email,
        'role', 'regional_broker',
        'country', v_country,
        'message', 'تمت ترقية المستخدم إلى وسيط إقليمي بنجاح'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_to_regional_broker(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.demote_regional_broker(
    p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'أمني: فقط المدير العام يمكنه إلغاء ترقية الوسطاء الإقليميين';
    END IF;

    UPDATE public.profiles
    SET role = 'user',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_target_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_target_id,
        'role', 'user',
        'message', 'تم إلغاء رتبة الوسيط الإقليمي بنجاح'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.demote_regional_broker(uuid) TO authenticated;

-- تحديث عرض public_profiles ليشمل حقل country
DROP VIEW IF EXISTS public.public_profiles;
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    id, 
    name, 
    avatar_url, 
    role, 
    country,
    created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMIT;
