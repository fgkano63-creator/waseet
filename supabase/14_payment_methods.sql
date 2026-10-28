-- ==============================================================================
-- WASEET Platform - جدول حسابات وطرق الدفع للمدير والمستخدمين
-- Migration 14: Payment Methods Management Table & RLS
-- انسخ هذا الكود بالكامل والصقه في Supabase SQL Editor ثم اضغط Run
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_methods (
    id text PRIMARY KEY,
    category text NOT NULL DEFAULT 'local', -- 'local' or 'crypto'
    country_name text DEFAULT '',
    country_code text DEFAULT '',
    country_flag text DEFAULT '💳',
    icon_svg text DEFAULT '',
    icon_class text DEFAULT 'fas fa-credit-card',
    method_name text NOT NULL,
    short_label text DEFAULT '',
    beneficiary_label text DEFAULT 'اسم المستفيد',
    beneficiary_name text NOT NULL,
    account_label text DEFAULT 'رقم الحساب / المحفظة',
    account_number text NOT NULL,
    secondary_label text DEFAULT '',
    secondary_value text DEFAULT '',
    currency_hint text DEFAULT '',
    instructions text DEFAULT '',
    is_active boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for ordering and fast retrieval
CREATE INDEX IF NOT EXISTS idx_payment_methods_active_order ON public.payment_methods(is_active, display_order, created_at);

-- Enable Row Level Security
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view active payment methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Anyone can select payment methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Admins can insert payment methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Admins can update payment methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Admins can delete payment methods" ON public.payment_methods;

-- 1. SELECT Policy: Anyone (anon or authenticated) can view active payment methods, admins can view all
CREATE POLICY "Anyone can select payment methods"
ON public.payment_methods
FOR SELECT
USING (
    is_active = true OR public.is_admin()
);

-- 2. INSERT Policy: Only Admins can insert payment methods
CREATE POLICY "Admins can insert payment methods"
ON public.payment_methods
FOR INSERT
WITH CHECK (
    public.is_admin()
);

-- 3. UPDATE Policy: Only Admins can update payment methods
CREATE POLICY "Admins can update payment methods"
ON public.payment_methods
FOR UPDATE
USING (
    public.is_admin()
)
WITH CHECK (
    public.is_admin()
);

-- 4. DELETE Policy: Only Admins can delete payment methods
CREATE POLICY "Admins can delete payment methods"
ON public.payment_methods
FOR DELETE
USING (
    public.is_admin()
);

-- Seed initial payment methods
INSERT INTO public.payment_methods (
    id, category, country_name, country_code, country_flag, icon_svg, icon_class,
    method_name, short_label, beneficiary_label, beneficiary_name,
    account_label, account_number, secondary_label, secondary_value,
    currency_hint, instructions, is_active, display_order
) VALUES
(
    'crypto_binance', 'crypto', 'عالمي (العملات الرقمية)', '', '🌐', 'assets/payments/binance.svg', 'fas fa-coins',
    'Binance Pay (بينانس باي)', 'Binance Pay', 'اسم حساب بينانس (Nickname)', 'WASEET_OFFICIAL_PAY',
    'معرّف الدفع (Binance Pay ID)', '849201948', 'البريد المربوط (اختياري للتحويل)', 'pay@waseet-gaming.com',
    '1 نقطة = 1 USDT (تحويل فوري بدون عمولة شبكة)', 'افتح تطبيق Binance > اختر Binance Pay > إرسال (Send) > الصق معرّف الـ Pay ID أعلاه وتأكد من اسم المستفيد ثم التقط صورة شاشة للإيصال.', true, 1
),
(
    'crypto_usdt_trc20', 'crypto', 'عالمي (شبكة العملات الرقمية)', '', '💎', 'assets/payments/binance.svg', 'fas fa-wallet',
    'USDT (شبكة TRC20 / BEP20)', 'USDT (TRC20)', 'الشبكة المعتمدة (Network)', 'Tron (TRC20) — أو BNB Smart Chain (BEP20)',
    'عنوان محفظة الإيداع (USDT Address)', 'TX8k9P2mN7qR4vL6wZ1yC3bV5nM8jK2hG4', 'عنوان شبكة BEP20 البديل', '0x71C95911E9a5D330f4D621842EC243EE1343292e',
    '1 نقطة = 1 USDT صافي بعد عمولة الشبكة', 'يرجى التأكد من اختيار شبكة TRC20 المطابقة للعنوان عند السحب من أي منصة، ثم إرفاق رقم الـ TXID أو لقطة شاشة لتفاصيل التحويل.', true, 2
),
(
    'syria_shamcash', 'local', 'سوريا', 'SY', '🇸🇾', 'assets/payments/syria.svg', 'fas fa-mobile-alt',
    'شام كاش (Sham Cash) / سيريتل كاش', 'سوريا • شام كاش', 'اسم المستفيد', 'محمد الأحمد - خزينة وسيط سوريا',
    'رقم حساب شام كاش / رمز سيريتل كاش', 'SC-90482910', 'رقم سيريتل كاش (تحويل يدوي)', '0933123456',
    'يتم احتساب الصرف حسب السعر اليومي المعتمد في السوق السوري', 'قم بالتحويل إلى رقم حساب شام كاش أو رمز سيريتل كاش الموضح أعلاه، ثم أدخل رقم العملية أو اسم المرسل وأرفق صورة الإشعار.', true, 3
),
(
    'egypt_vodafone', 'local', 'مصر', 'EG', '🇪🇬', 'assets/payments/egypt.svg', 'fas fa-mobile-alt',
    'فودافون كاش (Vodafone Cash) / إنستا باي', 'مصر • فودافون كاش', 'اسم المستفيد', 'أحمد محمود حسن (وكيل وسيط مصر)',
    'رقم محفظة فودافون كاش', '01012345678', 'عنوان الدفع الفوري (InstaPay IPA)', 'waseet.egypt@instapay',
    'يدعم التحويل الفوري من جميع المحافظ المصرية وتطبيق InstaPay', 'حوّل المبلغ بالجنيه المصري إلى رقم محفظة فودافون كاش أو عنوان إنستا باي أعلاه، ثم اكتب الرقم المحوّل منه وأرفق سكرين شوت رسالة التأكيد.', true, 4
),
(
    'iraq_zaincash', 'local', 'العراق', 'IQ', '🇮🇶', 'assets/payments/iraq.svg', 'fas fa-wallet',
    'زين كاش العراق (Zain Cash) / كي كارد', 'العراق • زين كاش', 'اسم المستفيد', 'علي حسين العراقي - وسيط العراق',
    'رقم محفظة زين كاش (Zain Cash)', '07801234567', 'رقم بطاقة ماستر الرافدين (Qi Card)', '7102938475',
    'يدعم التحويل المباشر عبر تطبيق زين كاش أو ماستر كارد الرافدين', 'قم بتحويل الرصيد عبر تطبيق Zain Cash إلى الرقم أعلاه، ثم أدخل رقم العملية الموجود في الإشعار وأرفق لقطة الشاشة.', true, 5
),
(
    'morocco_cih', 'local', 'المغرب', 'MA', '🇲🇦', 'assets/payments/morocco.svg', 'fas fa-university',
    'سياش بنك (CIH Bank) / البريد بنك', 'المغرب • سياش CIH', 'اسم المستفيد (Nom du bénéficiaire)', 'YOUSSEF EL AMRANI - WASEET MA',
    'رقم حساب سياش (RIB / Numéro de compte)', '230780123456789012345678', 'حساب البريد بنك (Barid Bank)', '00987654321000',
    'تحويل فوري مجاني من تطبيق CIH Mobile أو Barid Bank Mobile', 'قم بإجراء تحويل بنكي من تطبيق CIH Mobile إلى رقم الحساب أعلاه، ثم اكتب اسم صاحب الحساب المرسل وأرفق وصل التحويل (Reçu).', true, 6
),
(
    'algeria_baridimob', 'local', 'الجزائر', 'DZ', '🇩🇿', 'assets/payments/algeria.svg', 'fas fa-money-check-alt',
    'بريد الجزائر (BaridiMob / CCP)', 'الجزائر • بريدي موب', 'اسم المستفيد (Nom & Prénom)', 'KARIM BENALI - WASEET DZ',
    'رقم الـ RIP (لتطبيق BaridiMob)', '00799999001234567890', 'رقم حساب CCP (للتحويل البريدي)', '0012345678 Clé 90',
    'يدعم التحويل الفوري عبر تطبيق BaridiMob أو مكاتب بريد الجزائر', 'انسخ رقم الـ RIP أعلاه وقم بالتحويل عبر تطبيق بريدي موب، ثم أدخل رقم العملية أو اسم المرسل وأرفق صورة وصل التحويل.', true, 7
),
(
    'saudi_stcpay', 'local', 'السعودية', 'SA', '🇸🇦', 'assets/payments/saudi.svg', 'fas fa-university',
    'STC Pay / مصرف الراجحي / برق', 'السعودية • STC / الراجحي', 'اسم المستفيد', 'مؤسسة وسيط للخدمات الرقمية',
    'رقم الآيبان (IBAN الراجحي) أو جوال STC Pay', 'SA0380000000608010167519', 'رقم محفظة STC Pay / برق (Barq)', '0501234567',
    'يدعم التحويل السريع (سريع) من جميع البنوك السعودية ومحفظة STC Pay', 'قم بالتحويل إلى رقم الآيبان أو رقم جوال STC Pay أعلاه، ثم أدخل اسم المحوّل وأرفق إيصال التحويل البنكي.', true, 8
),
(
    'libya_madar', 'local', 'ليبيا', 'LY', '🇱🇾', 'assets/payments/libya.svg', 'fas fa-mobile-alt',
    'تداول / سداد / رصيد المدار وليبيانا', 'ليبيا • المدار / تداول', 'اسم المستفيد', 'عمر السنوسي - وكيل وسيط ليبيا',
    'رقم المحفظة / رقم استقبال الرصيد (المدار)', '0911234567', 'رقم ليبيانا / خدمة سداد', '0921234567',
    'متاح الشحن عبر محافظ تداول وسداد أو تحويل رصيد المدار وليبيانا', 'قم بتحويل القيمة إلى الرقم الموضح أعلاه، ثم اكتب الرقم المحوّل منه أو رقم الإيصال وأرفق لقطة شاشة لإتمام العملية.', true, 9
),
(
    'tunisia_d17', 'local', 'تونس', 'TN', '🇹🇳', '', 'fas fa-credit-card',
    'تطبيق D17 / البريد التونسي (e-Dinar)', 'تونس • تطبيق D17', 'اسم المستفيد', 'أمين التونسي - WASEET TN',
    'رقم الهاتف المربوط بتطبيق D17', '20123456', 'رقم بطاقة e-Dinar Smart (البريد التونسي)', '5359820012345678',
    'تحويل فوري عبر تطبيق D17 التابع للبريد التونسي', 'افتح تطبيق D17 واختر إرسال أموال (Transfert d\'argent) إلى الرقم أعلاه، ثم أدخل رقم التفويض/العملية وأرفق صورة الإيصال.', true, 10
),
(
    'jordan_cliq', 'local', 'الأردن', 'JO', '🇯🇴', '', 'fas fa-bolt',
    'نظام كليك (CliQ) / زين كاش الأردن', 'الأردن • كليك / زين كاش', 'اسم المستفيد', 'زيد عبدالله الأردني - وسيط الأردن',
    'الاسم المستعار في كليك (CliQ Alias)', 'WASEETJO', 'رقم محفظة زين كاش الأردن / UWallet', '0791234567',
    'يدعم الدفع الفوري من جميع البنوك والمحافظ الأردنية عبر CliQ', 'أرسل المبلغ بالدينار الأردني عبر نظام CliQ إلى الاسم المستعار (WASEETJO) أو رقم زين كاش، ثم أدخل اسم المرسل وأرفق صورة الإشعار.', true, 11
)
ON CONFLICT (id) DO UPDATE SET
    method_name = EXCLUDED.method_name,
    beneficiary_name = EXCLUDED.beneficiary_name,
    account_number = EXCLUDED.account_number,
    instructions = EXCLUDED.instructions,
    updated_at = now();

COMMIT;
