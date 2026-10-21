/**
 * WASEET (وسيط) - State & Mock Data
 * Stores sample accounts (36+ accounts across Free Fire, PUBG, etc.), user profiles,
 * multi-deal escrow records, and role-based permissions.
 */

const SAMPLE_IMAGES = [
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1563089145-599997674d42?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=80'
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
        // One-time purge of legacy development test deals so launch starts 100% clean
        if (!localStorage.getItem('WASEET_DEALS_PURGED_LAUNCH')) {
            localStorage.removeItem('WASEET_DEALS_ACTIVE');
            localStorage.removeItem('WASEET_DEALS_COMPLETED');
            localStorage.setItem('WASEET_DEALS_PURGED_LAUNCH', 'true');
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
