-- =================================================================================
-- WASEET Platform - إصلاح أذونات RLS لتسليم الحسابات للمشترين وقسم "حساباتي المشتراة"
-- انسخ هذا الكود بالكامل والصقه في Supabase SQL Editor ثم اضغط Run
-- =================================================================================

-- 1. التأكد من وجود عمود buyer_id في جدول marketplace_accounts لتوثيق ملكية المشتري
ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. تحديث قيد حالات الحساب ليشمل 'sold' و 'completed' و 'in_deal'
DO $$
BEGIN
  ALTER TABLE public.marketplace_accounts DROP CONSTRAINT IF EXISTS marketplace_accounts_status_check;
  ALTER TABLE public.marketplace_accounts
    ADD CONSTRAINT marketplace_accounts_status_check
    CHECK (status IN ('pending', 'pending_verification', 'pending_review', 'available', 'in_deal', 'sold', 'completed', 'hidden', 'rejected'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. تفعيل RLS على جدول marketplace_accounts ومنح الصلاحيات
GRANT SELECT ON TABLE public.marketplace_accounts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.marketplace_accounts TO authenticated;
GRANT ALL ON TABLE public.marketplace_accounts TO service_role;

ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;

-- 4. سياسة SELECT للمشتري لقراءة بيانات الحسابات المشتراة وبيانات الدخول الحساسة
DROP POLICY IF EXISTS "accounts_buyer_select_purchased" ON public.marketplace_accounts;
CREATE POLICY "accounts_buyer_select_purchased"
ON public.marketplace_accounts
FOR SELECT
TO authenticated
USING (
  buyer_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.deals
    WHERE deals.account_id = marketplace_accounts.id
      AND deals.buyer_id = auth.uid()
      AND deals.status IN ('completed', 'buyer_inspecting', 'mediator_inspecting', 'active')
  )
);

-- 5. تحديث دالة تحرير رصيد الصفقة release_escrow_deal_points لتوثيق المشتري رسمياً في جدول marketplace_accounts
CREATE OR REPLACE FUNCTION public.release_escrow_deal_points(p_deal_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal record;
BEGIN
  -- جلب بيانات الصفقة
  SELECT * INTO v_deal FROM public.deals WHERE id = p_deal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الصفقة غير موجودة');
  END IF;

  -- تحديث حالة الصفقة إلى مكتملة
  UPDATE public.deals
  SET status = 'completed',
      current_step = 4,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_deal_id;

  -- تحويل حالة الحساب إلى sold وتعيين buyer_id لتمكين المشتري من قراءة بيانات الدخول
  IF v_deal.account_id IS NOT NULL THEN
    UPDATE public.marketplace_accounts
    SET status = 'sold',
        buyer_id = v_deal.buyer_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_deal.account_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deal_id', p_deal_id,
    'status', 'completed',
    'buyer_id', v_deal.buyer_id
  );
END;
$$;

-- 6. تحديث دالة إشعارات الصفقات لتوجيه المشتري لصفحة حساباتي المشتراة
CREATE OR REPLACE FUNCTION public.handle_deal_status_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- عند إنشاء صفقة جديدة
    IF TG_OP = 'INSERT' THEN
        IF NEW.seller_id IS NOT NULL THEN
            PERFORM public.send_waseet_notification(
                NEW.seller_id,
                'تم حجز حسابك للوساطة! 🔒',
                'قام مشترٍ بحجز حسابك وتم تجميد النقاط في خزينة الوسيط. يرجى متابعة غرفة الصفقة.',
                'chat.html?dealId=' || NEW.id
            );
        END IF;

        IF NEW.buyer_id IS NOT NULL THEN
            PERFORM public.send_waseet_notification(
                NEW.buyer_id,
                'تم حجز الحساب بنجاح! 🎉',
                'تم تجميد نقاط الصفقة في خزينة وسيط الآمنة. بإمكانك فحص ومتابعة الحساب الآن.',
                'chat.html?dealId=' || NEW.id
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
                    'تم تسليم الحساب إليك بنجاح! انقر هنا لعرض واستلام بيانات الدخول كاملة.',
                    'my-accounts.html?tab=purchases'
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
                    'قام الوسيط بتدقيق بيانات الدخول، يمكنك الآن مراجعة الحساب وتأكيد النقل.',
                    'chat.html?dealId=' || NEW.id
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 7. تحديث Schema Cache
NOTIFY pgrst, 'reload schema';
