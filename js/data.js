/**
 * WASEET (وسيط) - State & Mock Data
 * Stores regional payment gateways config, sample accounts, user profiles,
 * multi-deal escrow records, and role-based permissions.
 */

// ============================================================================
// 🌍 إعدادات بوابة الدفع الإقليمية (WASEET_PAYMENT_GATEWAYS)
// ملاحظة للمدير: يمكنك تعديل (accountNumber) و (beneficiaryName) و (instructions)
// لكل دولة أو وسيلة دفع بالأسفل إلى أرقامك الحقيقية في أي وقت، وستنعكس فوراً في صفحة المحفظة.
// ============================================================================
const WASEET_PAYMENT_GATEWAYS = [
    // ─── أولاً: العملات الرقمية (Crypto / Global) ───
    {
        id: 'crypto_binance',
        category: 'crypto',
        countryName: 'عالمي (العملات الرقمية)',
        countryFlag: '🌐',
        iconSvg: 'assets/payments/binance.svg',
        iconClass: 'fas fa-coins',
        methodName: 'Binance Pay (بينانس باي)',
        shortLabel: 'Binance Pay',
        beneficiaryLabel: 'اسم حساب بينانس (Nickname)',
        beneficiaryName: 'WASEET_OFFICIAL_PAY',
        accountLabel: 'معرّف الدفع (Binance Pay ID)',
        accountNumber: '849201948',
        secondaryLabel: 'البريد المربوط (اختياري للتحويل)',
        secondaryValue: 'pay@waseet-gaming.com',
        currencyHint: '1 نقطة = 1 USDT (تحويل فوري بدون عمولة شبكة)',
        instructions: 'افتح تطبيق Binance > اختر Binance Pay > إرسال (Send) > الصق معرّف الـ Pay ID أعلاه وتأكد من اسم المستفيد ثم التقط صورة شاشة للإيصال.'
    },
    {
        id: 'crypto_usdt_trc20',
        category: 'crypto',
        countryName: 'عالمي (شبكة العملات الرقمية)',
        countryFlag: '💎',
        iconSvg: 'assets/payments/binance.svg',
        iconClass: 'fas fa-wallet',
        methodName: 'USDT (شبكة TRC20 / BEP20)',
        shortLabel: 'USDT (TRC20)',
        beneficiaryLabel: 'الشبكة المعتمدة (Network)',
        beneficiaryName: 'Tron (TRC20) — أو BNB Smart Chain (BEP20)',
        accountLabel: 'عنوان محفظة الإيداع (USDT Address)',
        accountNumber: 'TX8k9P2mN7qR4vL6wZ1yC3bV5nM8jK2hG4',
        secondaryLabel: 'عنوان شبكة BEP20 البديل',
        secondaryValue: '0x71C95911E9a5D330f4D621842EC243EE1343292e',
        currencyHint: '1 نقطة = 1 USDT صافي بعد عمولة الشبكة',
        instructions: 'يرجى التأكد من اختيار شبكة TRC20 المطابقة للعنوان عند السحب من أي منصة، ثم إرفاق رقم الـ TXID أو لقطة شاشة لتفاصيل التحويل.'
    },

    // ─── ثانياً: المحافظ والبنوك المحلية في الدول العربية ───
    {
        id: 'syria_shamcash',
        category: 'local',
        countryCode: 'SY',
        countryName: 'سوريا',
        countryFlag: '🇸🇾',
        iconSvg: 'assets/payments/syria.svg',
        iconClass: 'fas fa-mobile-alt',
        methodName: 'شام كاش (Sham Cash) / سيريتل كاش',
        shortLabel: 'سوريا • شام كاش',
        beneficiaryLabel: 'اسم المستفيد',
        beneficiaryName: 'محمد الأحمد - خزينة وسيط سوريا',
        accountLabel: 'رقم حساب شام كاش / رمز سيريتل كاش',
        accountNumber: 'SC-90482910',
        secondaryLabel: 'رقم سيريتل كاش (تحويل يدوي)',
        secondaryValue: '0933123456',
        currencyHint: 'يتم احتساب الصرف حسب السعر اليومي المعتمد في السوق السوري',
        instructions: 'قم بالتحويل إلى رقم حساب شام كاش أو رمز سيريتل كاش الموضح أعلاه، ثم أدخل رقم العملية أو اسم المرسل وأرفق صورة الإشعار.'
    },
    {
        id: 'egypt_vodafone',
        category: 'local',
        countryCode: 'EG',
        countryName: 'مصر',
        countryFlag: '🇪🇬',
        iconSvg: 'assets/payments/egypt.svg',
        iconClass: 'fas fa-mobile-alt',
        methodName: 'فودافون كاش (Vodafone Cash) / إنستا باي',
        shortLabel: 'مصر • فودافون كاش',
        beneficiaryLabel: 'اسم المستفيد',
        beneficiaryName: 'أحمد محمود حسن (وكيل وسيط مصر)',
        accountLabel: 'رقم محفظة فودافون كاش',
        accountNumber: '01012345678',
        secondaryLabel: 'عنوان الدفع الفوري (InstaPay IPA)',
        secondaryValue: 'waseet.egypt@instapay',
        currencyHint: 'يدعم التحويل الفوري من جميع المحافظ المصرية وتطبيق InstaPay',
        instructions: 'حوّل المبلغ بالجنيه المصري إلى رقم محفظة فودافون كاش أو عنوان إنستا باي أعلاه، ثم اكتب الرقم المحوّل منه وأرفق سكرين شوت رسالة التأكيد.'
    },
    {
        id: 'iraq_zaincash',
        category: 'local',
        countryCode: 'IQ',
        countryName: 'العراق',
        countryFlag: '🇮🇶',
        iconSvg: 'assets/payments/iraq.svg',
        iconClass: 'fas fa-wallet',
        methodName: 'زين كاش العراق (Zain Cash) / كي كارد',
        shortLabel: 'العراق • زين كاش',
        beneficiaryLabel: 'اسم المستفيد',
        beneficiaryName: 'علي حسين العراقي - وسيط العراق',
        accountLabel: 'رقم محفظة زين كاش (Zain Cash)',
        accountNumber: '07801234567',
        secondaryLabel: 'رقم بطاقة ماستر الرافدين (Qi Card)',
        secondaryValue: '7102938475',
        currencyHint: 'يدعم التحويل المباشر عبر تطبيق زين كاش أو ماستر كارد الرافدين',
        instructions: 'قم بتحويل الرصيد عبر تطبيق Zain Cash إلى الرقم أعلاه، ثم أدخل رقم العملية الموجود في الإشعار وأرفق لقطة الشاشة.'
    },
    {
        id: 'morocco_cih',
        category: 'local',
        countryCode: 'MA',
        countryName: 'المغرب',
        countryFlag: '🇲🇦',
        iconSvg: 'assets/payments/morocco.svg',
        iconClass: 'fas fa-university',
        methodName: 'سياش بنك (CIH Bank) / البريد بنك',
        shortLabel: 'المغرب • سياش CIH',
        beneficiaryLabel: 'اسم المستفيد (Nom du bénéficiaire)',
        beneficiaryName: 'YOUSSEF EL AMRANI - WASEET MA',
        accountLabel: 'رقم حساب سياش (RIB / Numéro de compte)',
        accountNumber: '230780123456789012345678',
        secondaryLabel: 'حساب البريد بنك (Barid Bank)',
        secondaryValue: '00987654321000',
        currencyHint: 'تحويل فوري مجاني من تطبيق CIH Mobile أو Barid Bank Mobile',
        instructions: 'قم بإجراء تحويل بنكي من تطبيق CIH Mobile إلى رقم الحساب أعلاه، ثم اكتب اسم صاحب الحساب المرسل وأرفق وصل التحويل (Reçu).'
    },
    {
        id: 'algeria_baridimob',
        category: 'local',
        countryCode: 'DZ',
        countryName: 'الجزائر',
        countryFlag: '🇩🇿',
        iconSvg: 'assets/payments/algeria.svg',
        iconClass: 'fas fa-money-check-alt',
        methodName: 'بريد الجزائر (BaridiMob / CCP)',
        shortLabel: 'الجزائر • بريدي موب',
        beneficiaryLabel: 'اسم المستفيد (Nom & Prénom)',
        beneficiaryName: 'KARIM BENALI - WASEET DZ',
        accountLabel: 'رقم الـ RIP (لتطبيق BaridiMob)',
        accountNumber: '00799999001234567890',
        secondaryLabel: 'رقم حساب CCP (للتحويل البريدي)',
        secondaryValue: '0012345678 Clé 90',
        currencyHint: 'يدعم التحويل الفوري عبر تطبيق BaridiMob أو مكاتب بريد الجزائر',
        instructions: 'انسخ رقم الـ RIP أعلاه وقم بالتحويل عبر تطبيق بريدي موب، ثم أدخل رقم العملية أو اسم المرسل وأرفق صورة وصل التحويل.'
    },
    {
        id: 'saudi_stcpay',
        category: 'local',
        countryCode: 'SA',
        countryName: 'السعودية',
        countryFlag: '🇸🇦',
        iconSvg: 'assets/payments/saudi.svg',
        iconClass: 'fas fa-university',
        methodName: 'STC Pay / مصرف الراجحي / برق',
        shortLabel: 'السعودية • STC / الراجحي',
        beneficiaryLabel: 'اسم المستفيد',
        beneficiaryName: 'مؤسسة وسيط للخدمات الرقمية',
        accountLabel: 'رقم الآيبان (IBAN الراجحي) أو جوال STC Pay',
        accountNumber: 'SA0380000000608010167519',
        secondaryLabel: 'رقم محفظة STC Pay / برق (Barq)',
        secondaryValue: '0501234567',
        currencyHint: 'يدعم التحويل السريع (سريع) من جميع البنوك السعودية ومحفظة STC Pay',
        instructions: 'قم بالتحويل إلى رقم الآيبان أو رقم جوال STC Pay أعلاه، ثم أدخل اسم المحوّل وأرفق إيصال التحويل البنكي.'
    },
    {
        id: 'libya_madar',
        category: 'local',
        countryCode: 'LY',
        countryName: 'ليبيا',
        countryFlag: '🇱🇾',
        iconSvg: 'assets/payments/libya.svg',
        iconClass: 'fas fa-mobile-alt',
        methodName: 'تداول / سداد / رصيد المدار وليبيانا',
        shortLabel: 'ليبيا • المدار / تداول',
        beneficiaryLabel: 'اسم المستفيد',
        beneficiaryName: 'عمر السنوسي - وكيل وسيط ليبيا',
        accountLabel: 'رقم المحفظة / رقم استقبال الرصيد (المدار)',
        accountNumber: '0911234567',
        secondaryLabel: 'رقم ليبيانا / خدمة سداد',
        secondaryValue: '0921234567',
        currencyHint: 'متاح الشحن عبر محافظ تداول وسداد أو تحويل رصيد المدار وليبيانا',
        instructions: 'قم بتحويل القيمة إلى الرقم الموضح أعلاه، ثم اكتب الرقم المحوّل منه أو رقم الإيصال وأرفق لقطة شاشة لإتمام العملية.'
    },
    {
        id: 'tunisia_d17',
        category: 'local',
        countryCode: 'TN',
        countryName: 'تونس',
        countryFlag: '🇹🇳',
        iconSvg: '',
        iconClass: 'fas fa-credit-card',
        methodName: 'تطبيق D17 / البريد التونسي (e-Dinar)',
        shortLabel: 'تونس • تطبيق D17',
        beneficiaryLabel: 'اسم المستفيد',
        beneficiaryName: 'أمين التونسي - WASEET TN',
        accountLabel: 'رقم الهاتف المربوط بتطبيق D17',
        accountNumber: '20123456',
        secondaryLabel: 'رقم بطاقة e-Dinar Smart (البريد التونسي)',
        secondaryValue: '5359820012345678',
        currencyHint: 'تحويل فوري عبر تطبيق D17 التابع للبريد التونسي',
        instructions: 'افتح تطبيق D17 واختر إرسال أموال (Transfert d\'argent) إلى الرقم أعلاه، ثم أدخل رقم التفويض/العملية وأرفق صورة الإيصال.'
    },
    {
        id: 'jordan_cliq',
        category: 'local',
        countryCode: 'JO',
        countryName: 'الأردن',
        countryFlag: '🇯🇴',
        iconSvg: '',
        iconClass: 'fas fa-bolt',
        methodName: 'نظام كليك (CliQ) / زين كاش الأردن',
        shortLabel: 'الأردن • كليك / زين كاش',
        beneficiaryLabel: 'اسم المستفيد',
        beneficiaryName: 'زيد عبدالله الأردني - وسيط الأردن',
        accountLabel: 'الاسم المستعار في كليك (CliQ Alias)',
        accountNumber: 'WASEETJO',
        secondaryLabel: 'رقم محفظة زين كاش الأردن / UWallet',
        secondaryValue: '0791234567',
        currencyHint: 'يدعم الدفع الفوري من جميع البنوك والمحافظ الأردنية عبر CliQ',
        instructions: 'أرسل المبلغ بالدينار الأردني عبر نظام CliQ إلى الاسم المستعار (WASEETJO) أو رقم زين كاش، ثم أدخل اسم المرسل وأرفق صورة الإشعار.'
    }
];

if (typeof window !== 'undefined') {
    window.WASEET_PAYMENT_GATEWAYS = WASEET_PAYMENT_GATEWAYS;
}

const SAMPLE_IMAGES = [
    'assets/logo.png'
];

function generateAccountsList() {
    // تم تنظيف كافة الحسابات الوهمية والتجريبية بالكامل ليعرض المتجر فقط الحسابات الفعلية من قاعدة البيانات
    return [];
}

const WASEET_STATE = {
    // Current logged-in user profile & wallet (null for new visitors, restored permanently from localStorage)
    user: null,

    // Active Escrow Deals managed by the platform (cleared by default, populated dynamically from Supabase)
    deals: [],

    // Completed/Cancelled deals archive
    completedDeals: [],

    // Active deal pointer
    activeDeal: null,

    // Accounts in marketplace (populated strictly from Supabase database)
    accounts: []
};

function isMediatorUser(user = WASEET_STATE.user) {
    if (!user) return false;
    if (user.role === 'mediator' || user.role === 'admin' || user.isAdmin === true) return true;
    if (user.email) {
        const em = String(user.email).toLowerCase().trim();
        if (em === 'fgkano63@gmail.com' || em === 'saadani2009@gmail.com' || em === 'mediator@waseet.com') return true;
    }
    return false;
}

// Local storage persistent helper (Permanent login & deals persistence)
function saveWaseetData() {
    try {
        if (WASEET_STATE.user) {
            localStorage.setItem('WASEET_SAVED_USER_PERMANENT', JSON.stringify(WASEET_STATE.user));
        } else {
            localStorage.removeItem('WASEET_SAVED_USER_PERMANENT');
        }

        localStorage.setItem('WASEET_DEALS_ACTIVE', JSON.stringify(WASEET_STATE.deals || []));
        localStorage.setItem('WASEET_DEALS_COMPLETED', JSON.stringify(WASEET_STATE.completedDeals || []));
    } catch (e) {
        console.warn('Storage unavailable', e);
    }
}

function loadWaseetData() {
    try {
        // One-time purge of all legacy dummy accounts, test deals, notifications & stale cached balances
        if (!localStorage.getItem('WASEET_DB_RESET_20261025_V4')) {
            localStorage.removeItem('WASEET_USER_ACCOUNTS');
            localStorage.removeItem('WASEET_DEALS_ACTIVE');
            localStorage.removeItem('WASEET_DEALS_COMPLETED');
            localStorage.removeItem('WASEET_DEAL_COUNTER');
            sessionStorage.removeItem('WASEET_UNREAD_CHATS_COUNT');
            try {
                const rawUser = localStorage.getItem('WASEET_SAVED_USER_PERMANENT');
                if (rawUser) {
                    const parsedUser = JSON.parse(rawUser);
                    if (parsedUser && parsedUser.wallet) {
                        parsedUser.wallet = { available: 0, locked: 0, total: 0 };
                        localStorage.setItem('WASEET_SAVED_USER_PERMANENT', JSON.stringify(parsedUser));
                    }
                }
            } catch (err) {}
            localStorage.setItem('WASEET_DB_RESET_20261025_V4', 'true');
        }

        // 1. Permanent User Login Recovery
        const savedUser = localStorage.getItem('WASEET_SAVED_USER_PERMANENT');
        if (savedUser) {
            const parsed = JSON.parse(savedUser);
            WASEET_STATE.user = parsed;
        } else {
            WASEET_STATE.user = null; // New visitor / Guest
        }

        // 2. Active Deals & Accounts start empty until synced from Supabase
        WASEET_STATE.deals = [];
        WASEET_STATE.completedDeals = [];
        WASEET_STATE.activeDeal = null;
        WASEET_STATE.accounts = [];
    } catch (e) {
        console.warn('Failed to parse storage', e);
    }
}

loadWaseetData();
