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
    'assets/logo.png',
    'assets/fav_test_shield.png',
    'assets/fav_badge_v2.png',
    'assets/favicon-512.png',
    'assets/fav_test_badge.png',
    'assets/logo.jpg'
];

function generateAccountsList() {
    const list = [
        {
            id: 'acc_101',
            accountNumber: 1001,
            game: 'free_fire',
            title: 'حساب فري فاير برايم 8 أسطوري - إم فور وسكار ماكس وساكورا',
            level: 78,
            primeLevel: 8,
            loginType: 'google',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Dragon_Sniper',
            sellerRating: 4.9,
            sellerDeals: 18,
            sellerPrice: 100,
            evoGunsCount: 6,
            evoGuns: ['AK التنين الأزرق Lv.7 ماكس', 'MP40 الكوبرا الصفراء Lv.7 ماكس', 'سكار القرش المطور Lv.6', 'M1014 التنين الأخضر Lv.7', 'UMP الدب المتوحش Lv.5', 'فاماس الكوبرا Lv.4'],
            rareSkins: ['سكن الساكورا النادر (موسم 1)', 'حزمة الجوكر البنفسجي', 'فاير باس موسم 3 و 4'],
            iconicPants: ['بنطلون الجاز الكلاسيكي الشهير', 'بنطلون الملاك الأصلي (الملكي)'],
            accountNotes: 'حساب أسطوري من السيزون الأول بدون أي باند أو تحذير، جميع بطاقات الغرف مفتوحة، مناسب جداً لصناع المحتوى والبطولات.',
            images: [SAMPLE_IMAGES[0], SAMPLE_IMAGES[1], SAMPLE_IMAGES[2], SAMPLE_IMAGES[3]],
            image: SAMPLE_IMAGES[0],
            badge: 'برايم 8 ماكس',
            featured: true,
            status: 'available',
            credentials: {
                email_or_phone: 'dragon.sniper99@gmail.com',
                password: 'FireDragon#2024Pass'
            }
        },
        {
            id: 'acc_102',
            accountNumber: 1002,
            game: 'free_fire',
            title: 'حساب فري فاير برايم 7 - حزمة الهيب هوب الأصلية وكريمنال أحمر',
            level: 72,
            primeLevel: 7,
            loginType: 'facebook',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Shadow_Warrior',
            sellerRating: 5.0,
            sellerDeals: 24,
            sellerPrice: 50,
            evoGunsCount: 4,
            evoGuns: ['MP40 كوبرا ليفل 6', 'AK تنين ليفل 5', 'M1014 تنين أخضر ليفل 5', 'سكار ميغالودون ليفل 4'],
            rareSkins: ['حزمة الهيب هوب كاملة (موسم 2)', 'الكريمنال الأحمر النادر', 'رقصة العرش الأصلية'],
            iconicPants: ['بنطلون الجاز الأصلي', 'بنطلون الدودة'],
            accountNotes: 'حساب هيب هوب أسطوري ونادر، شحن منتظم في كل السيزونات، ربط فيسبوك نظيف ومستعد لتسليم الإيميل المربوط.',
            images: [SAMPLE_IMAGES[2], SAMPLE_IMAGES[4], SAMPLE_IMAGES[0], SAMPLE_IMAGES[1]],
            image: SAMPLE_IMAGES[2],
            badge: 'برايم 7 نادر',
            featured: true,
            status: 'available',
            credentials: {
                email_or_phone: 'shadow_warrior_fb@outlook.com',
                password: 'Shadow#FB2024Secret'
            }
        },
        {
            id: 'acc_103',
            accountNumber: 1003,
            game: 'free_fire',
            title: 'حساب فري فاير برايم 5 - نظيف ربط جوجل أحادي مع بنطلون الجاز',
            level: 66,
            primeLevel: 5,
            loginType: 'google',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Viper_FF',
            sellerRating: 4.8,
            sellerDeals: 9,
            sellerPrice: 30,
            evoGunsCount: 2,
            evoGuns: ['XM8 الغراب المطور ليفل 5', 'MP40 الكوبرا ليفل 4'],
            rareSkins: ['سكن الجوكر البنفسجي', 'سكن الباندا المحارب', 'أجنحة الظل'],
            iconicPants: ['بنطلون الجاز الكلاسيكي الشهير'],
            accountNotes: 'حساب اقتصادي قوي جداً برايم 5 وربط إيميل جيميل خاص يمكن نقله للمشتري بثوانٍ تحت إشراف الوسيط.',
            images: [SAMPLE_IMAGES[1], SAMPLE_IMAGES[3], SAMPLE_IMAGES[4]],
            image: SAMPLE_IMAGES[1],
            badge: 'برايم 5 اقتصادي',
            featured: false,
            status: 'pending_verification',
            credentials: {
                email_or_phone: 'viper.ff.mena@gmail.com',
                password: 'ViperSecure!998'
            }
        },
        {
            id: 'acc_104',
            accountNumber: 1004,
            game: 'free_fire',
            title: 'حساب ليفل 81 نخبوي - أسلحة ماكس 7 أسلحة إيفو مطورة بالكامل',
            level: 81,
            primeLevel: 8,
            loginType: 'google',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Legend_Apex',
            sellerRating: 4.95,
            sellerDeals: 31,
            sellerPrice: 200,
            evoGunsCount: 7,
            evoGuns: ['AK تنين أزرق Lv.7 ماكس', 'MP40 كوبرا Lv.7 ماكس', 'M1014 أخضر Lv.7 ماكس', 'سكار قرش Lv.7 ماكس', 'XM8 غراب Lv.7 ماكس', 'فاماس دموي Lv.6', 'طومسون تنين Lv.5'],
            rareSkins: ['ساكورا كامل', 'هيب هوب كامل', 'كريمنال أزرق وأخضر', 'سكن الطيار النادر'],
            iconicPants: ['بنطلون الملاك الذهبي الأصلي', 'بنطلون الجاز', 'بنطلون الدودة الأسود'],
            accountNotes: 'أقوى حساب في المنصة حالياً! كولكشن ضخم جداً وأسلحة إيفو ماكس كلياً، ليفل 81 شاحن جميع الباسات من بداية اللعبة.',
            images: [SAMPLE_IMAGES[3], SAMPLE_IMAGES[0], SAMPLE_IMAGES[2], SAMPLE_IMAGES[5]],
            image: SAMPLE_IMAGES[3],
            badge: 'برايم 8 ماكس أسطوري',
            featured: true,
            status: 'available'
        },
        {
            id: 'acc_105',
            accountNumber: 1005,
            game: 'free_fire',
            title: 'حساب برايم 6 - كريمنال أخضر وأسلحة إيفو 3 وبنطلون الملاك',
            level: 69,
            primeLevel: 6,
            loginType: 'facebook',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Ghost_Sniper',
            sellerRating: 4.85,
            sellerDeals: 12,
            sellerPrice: 65,
            evoGunsCount: 3,
            evoGuns: ['AK التنين ليفل 6', 'M1014 الأخضر ليفل 5', 'MP40 كوبرا ليفل 4'],
            rareSkins: ['الكريمنال الأخضر النادر', 'سكن الثعلب المطور', 'رقصة الوردة'],
            iconicPants: ['بنطلون الملاك الأصلي'],
            accountNotes: 'حساب مميز به الكريمنال الأخضر النادر مع بنطلون الملاك، مناسب جداً للرنك والبطولات.',
            images: [SAMPLE_IMAGES[4], SAMPLE_IMAGES[1], SAMPLE_IMAGES[0]],
            image: SAMPLE_IMAGES[4],
            badge: 'برايم 6',
            featured: false,
            status: 'available'
        },
        {
            id: 'acc_106',
            accountNumber: 1006,
            game: 'free_fire',
            title: 'حساب برايم 5 - نظيف جداً ليفل 64 بسعر مغري وسلاح كوبرا',
            level: 64,
            primeLevel: 5,
            loginType: 'google',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Phoenix_FF',
            sellerRating: 4.75,
            sellerDeals: 7,
            sellerPrice: 28,
            evoGunsCount: 1,
            evoGuns: ['MP40 الكوبرا الصفراء ليفل 5'],
            rareSkins: ['سكن الذئب الناري', 'رقصة الدراجة النارية'],
            iconicPants: ['بنطلون الجاز الكلاسيكي'],
            accountNotes: 'سعر رائع واقتصادي، الحساب مربوط بجوجل إيميل جديد مخصص للبيع، استلام فوري وضمان كامل.',
            images: [SAMPLE_IMAGES[5], SAMPLE_IMAGES[2], SAMPLE_IMAGES[3]],
            image: SAMPLE_IMAGES[5],
            badge: 'برايم 5',
            featured: false,
            status: 'available'
        },
        {
            id: 'acc_107',
            accountNumber: 1007,
            game: 'pubg',
            title: 'حساب ببجي موبايل - إم فور ثلجي ماكس (M416 Glacier Max) + بدلة الغراب',
            level: 75,
            primeLevel: 8,
            loginType: 'twitter',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'PUBG_Master',
            sellerRating: 4.9,
            sellerDeals: 15,
            sellerPrice: 140,
            evoGunsCount: 5,
            evoGuns: ['M416 الثلجي ماكس مع صندوق الضحية', 'AKM حفرية ليفل 4', 'AWM قودزيلا ليفل 4'],
            rareSkins: ['بدلة الغراب ليفل 6 مع الرقصة', 'بدلة الفرعون ليفل 4', 'سيارة ماكلارين الخضراء'],
            iconicPants: ['سروال الهلاك النادر'],
            accountNotes: 'حساب ببجي كونكر سيزون 14 و 16، سلاح ثلجي ماكس كامل وجميع الروابط المتبقية ملغية وجاهزة للربط الجديد.',
            images: [SAMPLE_IMAGES[0], SAMPLE_IMAGES[4], SAMPLE_IMAGES[1]],
            image: SAMPLE_IMAGES[0],
            badge: 'كونكر أسطوري',
            featured: true,
            status: 'available'
        },
        {
            id: 'acc_108',
            accountNumber: 1008,
            game: 'pubg',
            title: 'حساب ببجي موبايل - جوكر ماكس وبدلة الفرعون وحساب كونكر قديم',
            level: 71,
            primeLevel: 7,
            loginType: 'facebook',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Iraqi_Sniper',
            sellerRating: 5.0,
            sellerDeals: 20,
            sellerPrice: 95,
            evoGunsCount: 3,
            evoGuns: ['M416 الجوكر ماكس ليفل 7', 'DP التنين ليفل 4'],
            rareSkins: ['بدلة الفرعون الأصلية', 'خوذة المومياء البيضاء'],
            iconicPants: ['بنطال الصحراء النادر'],
            accountNotes: 'حساب ببجي عراقي من السيزون 4، يحتوي على المومياء الشهيرة وإم فور الجوكر بأعلى ليفل.',
            images: [SAMPLE_IMAGES[2], SAMPLE_IMAGES[3], SAMPLE_IMAGES[5]],
            image: SAMPLE_IMAGES[2],
            badge: 'جوكر ماكس',
            featured: false,
            status: 'available'
        },
        {
            id: 'acc_109',
            accountNumber: 1009,
            game: 'brawl_stars',
            title: 'حساب براول ستارز - 52,000 كأس، جميع الأبطال مفتوحين وسكنات نادرة',
            level: 180,
            primeLevel: 6,
            loginType: 'google',
            bindStatus: 'single',
            server: 'global',
            sellerName: 'Brawl_King',
            sellerRating: 4.8,
            sellerDeals: 6,
            sellerPrice: 45,
            evoGunsCount: 0,
            evoGuns: [],
            rareSkins: ['سكن ميكا كرو الذهبي', 'سكن ميكا بوز الذهبي', 'سكن شيللي الساحرة موسم 1'],
            iconicPants: [],
            accountNotes: 'حساب Supercell ID آمن تماماً، جميع الهايبر تشارج مفتوحة لأغلب الشخصيات وجاهز للبطولات العالمية.',
            images: [SAMPLE_IMAGES[1], SAMPLE_IMAGES[4]],
            image: SAMPLE_IMAGES[1],
            badge: 'ماستر 50k',
            featured: false,
            status: 'available'
        },
        {
            id: 'acc_110',
            accountNumber: 1010,
            game: 'steam',
            title: 'حساب ستيم تركي نخبوي - مكتبة 65 لعبة AAA كبرى + رصيد محفظة',
            level: 45,
            primeLevel: 7,
            loginType: 'google',
            bindStatus: 'single',
            server: 'global',
            sellerName: 'SteamMaster_Pro',
            sellerRating: 5.0,
            sellerDeals: 14,
            sellerPrice: 120,
            evoGunsCount: 0,
            evoGuns: [],
            rareSkins: ['CS2 Prime + سكين Karambit Fade', 'Dota 2 Arcana'],
            iconicPants: [],
            accountNotes: 'حساب ستيم بدون أي حظر VAC، تسليم الإيميل الأساسي الأصلي مع فواتير الشراء الأولى كاملة.',
            images: [SAMPLE_IMAGES[4], SAMPLE_IMAGES[0], SAMPLE_IMAGES[1]],
            image: SAMPLE_IMAGES[4],
            badge: 'ستيم تركي مميز',
            featured: true,
            status: 'available'
        },
        {
            id: 'acc_111',
            accountNumber: 1011,
            game: 'pubg',
            title: 'حساب ببجي موبايل - إم فور السحلية ليفل 7 + سلاح AWM إيفو',
            level: 75,
            primeLevel: 7,
            loginType: 'facebook',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Sniper_Alpha',
            sellerRating: 4.9,
            sellerDeals: 19,
            sellerPrice: 95,
            evoGunsCount: 3,
            evoGuns: ['M416 السحلية Lv.7 ماكس', 'AWM قوس قزح Lv.4', 'AKM حفرية Lv.4'],
            rareSkins: ['بدلة المحارب الذهبي', 'حقيبة الأجنحة'],
            iconicPants: [],
            accountNotes: 'حساب موثق من السيزون 5 مع ربط فيسبوك نظيف ونقل رسمي فوري.',
            images: [SAMPLE_IMAGES[2], SAMPLE_IMAGES[5], SAMPLE_IMAGES[3]],
            image: SAMPLE_IMAGES[2],
            badge: 'سحلية ماكس',
            featured: false,
            status: 'available'
        },
        {
            id: 'acc_112',
            accountNumber: 1012,
            game: 'free_fire',
            title: 'حساب فري فاير برايم 6 - سكن الكريمنال الأزرق النادر وسكار القرش',
            level: 70,
            primeLevel: 6,
            loginType: 'google',
            bindStatus: 'single',
            server: 'mena',
            sellerName: 'Morocco_Lion',
            sellerRating: 4.85,
            sellerDeals: 11,
            sellerPrice: 40,
            evoGunsCount: 3,
            evoGuns: ['سكار القرش المطور Lv.5', 'MP40 الكوبرا Lv.4', 'M1014 التنين Lv.4'],
            rareSkins: ['الكريمنال الأزرق الأصلي', 'حزمة المقاتل الشبح'],
            iconicPants: ['بنطلون الجاز الكلاسيكي الشهير'],
            accountNotes: 'حساب سريع النقل بإيميل مستقل جاهز للتسليم الفوري مع الوسيط.',
            images: [SAMPLE_IMAGES[1], SAMPLE_IMAGES[3], SAMPLE_IMAGES[0]],
            image: SAMPLE_IMAGES[1],
            badge: 'كريمنال أزرق',
            featured: false,
            status: 'available'
        }
    ];

    // Ensure strict, organized, sequential numbering for all accounts (Requirement 7)
    list.forEach((acc, idx) => {
        if (!acc.accountNumber) {
            acc.accountNumber = 1001 + idx;
        }
    });

    return list;
}

const WASEET_STATE = {
    // Current logged-in user profile & wallet (null for new visitors, restored permanently from localStorage)
    user: null,

    // Active Escrow Deals managed by the platform (cleared by default, populated dynamically on escrow request)
    deals: [],

    // Completed/Cancelled deals archive
    completedDeals: [],

    // Active deal pointer
    activeDeal: null,

    // Accounts in marketplace (36 accounts for pagination)
    accounts: generateAccountsList()
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
        // One-time purge of legacy development test deals & stale cached wallet balances so DB reset is 100% reflected
        if (!localStorage.getItem('WASEET_DB_RESET_20261025_V3')) {
            localStorage.removeItem('WASEET_DEALS_ACTIVE');
            localStorage.removeItem('WASEET_DEALS_COMPLETED');
            localStorage.removeItem('WASEET_DEAL_COUNTER');
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
            localStorage.setItem('WASEET_DB_RESET_20261025_V3', 'true');
        }

        // 1. Permanent User Login Recovery
        const savedUser = localStorage.getItem('WASEET_SAVED_USER_PERMANENT');
        if (savedUser) {
            const parsed = JSON.parse(savedUser);
            WASEET_STATE.user = parsed;
        } else {
            WASEET_STATE.user = null; // New visitor / Guest
        }

        // 2. Active Deals Recovery (only real deals requested by buyers)
        const savedDeals = localStorage.getItem('WASEET_DEALS_ACTIVE');
        if (savedDeals) {
            const loaded = JSON.parse(savedDeals);
            // Filter out any legacy development test deals
            WASEET_STATE.deals = Array.isArray(loaded) ? loaded.filter(d => d && d.id !== 'deal_demo' && (!d.buyer || d.buyer.id !== 'usr_buyer')) : [];
            WASEET_STATE.activeDeal = WASEET_STATE.deals.length ? WASEET_STATE.deals[0] : null;
        } else {
            WASEET_STATE.deals = [];
            WASEET_STATE.activeDeal = null;
        }

        // 3. Completed Deals Archive Recovery
        const savedCompleted = localStorage.getItem('WASEET_DEALS_COMPLETED');
        if (savedCompleted) {
            WASEET_STATE.completedDeals = JSON.parse(savedCompleted);
        } else {
            WASEET_STATE.completedDeals = [];
        }

        // 4. User-published accounts recovery (accounts added via "بيع حساب" form)
        const savedAccounts = localStorage.getItem('WASEET_USER_ACCOUNTS');
        if (savedAccounts) {
            const userAccounts = JSON.parse(savedAccounts);
            if (Array.isArray(userAccounts) && userAccounts.length > 0) {
                userAccounts.forEach(a => {
                    if (!a.image || a.image === '' || (typeof a.image === 'string' && a.image.includes('undefined'))) {
                        a.image = 'assets/logo.png';
                    }
                    if (!Array.isArray(a.images) || a.images.length === 0) {
                        a.images = [a.image || 'assets/logo.png'];
                    } else {
                        a.images = a.images.map(img => (img && typeof img === 'string' && !img.includes('undefined')) ? img : 'assets/logo.png');
                    }
                });
                // Add user accounts to front (newest first), avoiding duplicates
                const existingIds = new Set(WASEET_STATE.accounts.map(a => a.id));
                const newOnes = userAccounts.filter(a => a && a.id && !existingIds.has(a.id));
                WASEET_STATE.accounts = [...newOnes, ...WASEET_STATE.accounts];
            }
        }
    } catch (e) {
        console.warn('Failed to parse storage', e);
    }
}

loadWaseetData();
