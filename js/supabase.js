/**
 * WASEET (وسيط) - المرحلة الأولى: تكامل المصادقة مع Supabase Auth & Google OAuth
 * يتعامل حصرياً مع تسجيل الدخول وجلب الملف الشخصي (Profile) المطبق عليه سياسات RLS الصارمة.
 */

const WASEET_SUPABASE_CONFIG = {
    // المفتاح العام المعتمد والآمن للمتصفح
    publishableKey: 'sb_publishable_UEvEqB66XyoQscufdRq06A_3CR2SEqn',
    // رابط مشروع Supabase المعتمد
    projectUrl: localStorage.getItem('WASEET_SUPABASE_URL') || 'https://vjhcvvewbqeiigrjtydu.supabase.co'
};

let waseetSupabaseClient = null;

/**
 * تهيئة عميل Supabase باستخدام المكتبة المحلية
 */
function initWaseetSupabase() {
    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        return null;
    }

    const url = WASEET_SUPABASE_CONFIG.projectUrl;
    const key = WASEET_SUPABASE_CONFIG.publishableKey;

    if (!url || !url.startsWith('https://')) {
        return null;
    }

    try {
        if (!waseetSupabaseClient) {
            waseetSupabaseClient = window.supabase.createClient(url, key, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
        }
        return waseetSupabaseClient;
    } catch (err) {
        console.error('[Supabase Auth] فشل في تهيئة العميل:', err);
        return null;
    }
}

/**
 * تحديث رابط المشروع برمجياً أو عبر واجهة الإعدادات
 */
function setWaseetSupabaseUrl(url) {
    if (!url) return false;
    url = url.trim().replace(/\/+$/, '');
    WASEET_SUPABASE_CONFIG.projectUrl = url;
    localStorage.setItem('WASEET_SUPABASE_URL', url);
    waseetSupabaseClient = null;
    const client = initWaseetSupabase();
    if (client) {
        waseetSyncAuthState();
    }
    return !!client;
}

/**
 * تسجيل الدخول الحقيقي عبر Google OAuth باستخدام دالة Supabase الرسمية
 */
async function waseetSignInWithGoogle() {
    const client = initWaseetSupabase();
    if (!client) {
        if (typeof waseetAlert === 'function') {
            waseetAlert('خطأ في الاتصال', 'تعذر تهيئة اتصال Supabase.', 'warning');
        } else {
            alert('تعذر تهيئة اتصال Supabase.');
        }
        return false;
    }

    try {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) {
            console.error('[Supabase Auth] خطأ تسجيل الدخول عبر Google:', error.message);
            if (typeof waseetAlert === 'function') {
                waseetAlert('خطأ في تسجيل الدخول', error.message, 'danger');
            }
            return false;
        }
        return true;
    } catch (err) {
        console.error('[Supabase Auth] استثناء تسجيل الدخول:', err);
        return false;
    }
}

/**
 * تسجيل الخروج وإنهاء الجلسة الرسمية
 */
async function waseetSignOut() {
    const client = initWaseetSupabase();
    if (client) {
        try {
            await client.auth.signOut();
        } catch (e) {
            console.warn('[Supabase Auth] خطأ تسجيل الخروج:', e);
        }
    }

    if (typeof WASEET_STATE !== 'undefined') {
        WASEET_STATE.user = null;
        if (typeof saveWaseetData === 'function') saveWaseetData();
    }

    localStorage.removeItem('WASEET_SAVED_USER_PERMANENT');

    // إعادة تحميل خفيفة لتحديث الواجهة بالحالة الجديدة
    window.location.reload();
}

/**
 * جلب بيانات ملف المستخدم من جدول profiles المحمي بـ RLS
 */
async function waseetFetchUserProfile(userId) {
    const client = initWaseetSupabase();
    if (!client || !userId) return null;

    try {
        const { data, error } = await client
            .from('profiles')
            .select('id, email, name, avatar_url, role, wallet_balance')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.warn('[Supabase Profiles] تعذر جلب الملف الشخصي (قد يكون الـ Trigger قيد التنفيذ):', error.message);
            return null;
        }
        return data;
    } catch (err) {
        console.warn('[Supabase Profiles] استثناء جلب الملف:', err);
        return null;
    }
}

/**
 * مزامنة حالة الجلسة الحالية وتحديث المتغير العام WASEET_STATE
 */
async function waseetSyncAuthState() {
    const client = initWaseetSupabase();
    if (!client) return;

    try {
        const { data: { session }, error } = await client.auth.getSession();
        if (error || !session || !session.user) return;

        const authUser = session.user;
        const profile = await waseetFetchUserProfile(authUser.id);

        // جلب رابط الصورة مباشرة من user.user_metadata.avatar_url كما هو مطلوب
        const avatarUrl = authUser.user_metadata?.avatar_url
            || authUser.user_metadata?.picture
            || (profile && profile.avatar_url)
            || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

        const userName = authUser.user_metadata?.full_name
            || authUser.user_metadata?.name
            || (profile && profile.name)
            || authUser.email?.split('@')[0]
            || 'مستخدم';

        const isAdmin = (profile && profile.role === 'admin')
            || (authUser.email && authUser.email.toLowerCase() === 'fgkano63@gmail.com');

        const userRole = isAdmin ? 'admin' : ((profile && profile.role) || 'user');

        const mappedUser = {
            id: authUser.id,
            email: authUser.email || (profile ? profile.email : ''),
            name: userName,
            avatar: avatarUrl,
            user_metadata: authUser.user_metadata || {},
            role: userRole,
            isAdmin: isAdmin,
            provider: 'supabase_google',
            wallet: {
                available: profile ? Number(profile.wallet_balance || 0) : 0,
                locked: 0,
                total: profile ? Number(profile.wallet_balance || 0) : 0
            }
        };

        if (typeof WASEET_STATE !== 'undefined') {
            WASEET_STATE.user = mappedUser;
            if (typeof saveWaseetData === 'function') saveWaseetData();
        }

        // جلب ومزامنة جميع الصفقات والحسابات من قاعدة بيانات Supabase
        await waseetFetchAccountsFromSupabase();
        await waseetFetchDealsFromSupabase();

        // تحديث عناصر الواجهة فوراً وظهور الصورة والتاج في الشريط العلوي
        if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
        if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
        if (window.waseetApp) {
            if (typeof window.waseetApp.renderUserProfile === 'function') {
                window.waseetApp.renderUserProfile();
            }
            if (typeof window.waseetApp.renderMarketplace === 'function') {
                window.waseetApp.renderMarketplace();
            }
            if (typeof window.waseetApp.updateWalletDisplay === 'function') {
                window.waseetApp.updateWalletDisplay();
            }
        }

        // إذا كان في صفحة الحسابات قيد الفحص، تحديث القائمة فوراً
        if (typeof loadPendingAccounts === 'function') {
            loadPendingAccounts();
        }

        // إذا كان في صفحة الصفقات، تحديث جدول الصفقات فوراً لظهور لوحة الوسيط المعتمد
        if (typeof renderDealsView === 'function') {
            renderDealsView();
        }

        // إذا كان في غرفة الشات وهو وسيط معتمد، تحويل الشاشة فوراً لوضع الوسيط (3 شاشات)
        if (isAdmin && window.escrowRoom) {
            window.escrowRoom.setViewerRole('mediator');
        }
    } catch (err) {
        console.warn('[Supabase Auth] استثناء مزامنة الجلسة:', err);
    }
}

/**
 * التحقق مما إذا كان المعرف بصيغة UUID صحيحة
 */
function waseetIsValidUuid(val) {
    if (!val || typeof val !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim());
}

/**
 * حفظ أو تحديث حساب معروض للبيع في جدول marketplace_accounts على Supabase
 */
async function waseetSaveAccountToSupabase(account, options = {}) {
    const client = initWaseetSupabase();
    if (!client || !account || !account.title) {
        const errObj = { message: 'تعذر الاتصال بقاعدة البيانات أو بيانات الحساب غير مكتملة.' };
        if (options.showAlert) {
            console.error('Insert Error:', errObj);
            alert('فشل النشر: ' + errObj.message);
        }
        return options.returnFullResult ? { data: null, error: errObj } : null;
    }

    try {
        const { data: { session } } = await client.auth.getSession();
        const sessionUser = session?.user || null;
        const sessionUserId = sessionUser?.id || null;
        const candidateId = account.seller_id || account.sellerId || (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user ? WASEET_STATE.user.id : null);
        const sellerUuid = sessionUserId || (waseetIsValidUuid(candidateId) ? candidateId : null);

        if (!sellerUuid) {
            const authErr = { message: 'يرجى تسجيل الدخول بحسابك أولاً لتتمكن من نشر الحساب.' };
            if (options.showAlert) {
                console.error('Insert Error:', authErr);
                alert('فشل النشر: ' + authErr.message);
            }
            return options.returnFullResult ? { data: null, error: authErr } : null;
        }

        // التأكد من وجود صف البائع في جدول profiles لمنع فشل المفتاح الأجنبي (Foreign Key seller_id)
        try {
            const sellerName = account.sellerName
                || sessionUser?.user_metadata?.full_name
                || sessionUser?.user_metadata?.name
                || (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user ? WASEET_STATE.user.name : null)
                || (sessionUser?.email ? sessionUser.email.split('@')[0] : 'بائع معتمد');
            await client.from('profiles').upsert({
                id: sellerUuid,
                email: sessionUser?.email || account.sellerEmail || '',
                name: sellerName,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id', ignoreDuplicates: true });
        } catch (profErr) {
            console.warn('[Supabase Accounts] ملاحظة مزامنة ملف البائع:', profErr);
        }

        // توحيد حالة الفحص للحسابات المعلقة
        let dbStatus = 'pending_verification';
        if (account.status === 'available') dbStatus = 'available';
        else if (account.status === 'rejected') dbStatus = 'rejected';
        else if (account.status === 'sold') dbStatus = 'sold';
        else if (account.status === 'in_deal') dbStatus = 'in_deal';
        else if (account.status === 'hidden') dbStatus = 'hidden';

        // توافق اسم اللعبة مع قيود قاعدة البيانات مع حفظ اللعبة الأصلية داخل details
        const allowedGames = ['free_fire', 'pubg', 'other'];
        const dbGame = allowedGames.includes(account.game) ? account.game : 'other';

        const imagesArr = Array.isArray(account.images) && account.images.length > 0
            ? account.images
            : (account.image ? [account.image] : ['https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800']);

        const credsObj = account.credentials || {
            email_or_phone: '',
            password: ''
        };

        const detailsObj = {
            ...(account.details || {}),
            localId: String(account.id || ''),
            originalGame: account.game || 'free_fire',
            sellerName: account.sellerName || (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user ? WASEET_STATE.user.name : 'بائع موثق'),
            sellerEmail: account.sellerEmail || sessionUser?.email || '',
            evoGunsCount: Number(account.evoGunsCount || 0),
            evoGuns: account.evoGuns || [],
            rareSkins: account.rareSkins || [],
            iconicPants: account.iconicPants || [],
            accountNotes: account.accountNotes || '',
            notes: account.accountNotes || '',
            badge: account.badge || '',
            reviewStatus: account.reviewStatus || (dbStatus === 'available' ? 'approved' : 'pending'),
            rejectionReason: account.rejectionReason || '',
            credentials: credsObj
        };

        // 1. إرفاق معرف البائع إجبارياً في الـ Payload ليطابق سياسة الإدخال (RLS)
        // وتخزين credentials داخل عمود details المعتمد في الجدول لتفادي خطأ عدم وجود عمود credentials مستقل
        const payload = {
            seller_id: sellerUuid,
            game: dbGame,
            title: String(account.title).trim(),
            level: Math.max(1, parseInt(account.level) || 50),
            prime_level: Math.max(0, parseInt(account.primeLevel) || 1),
            login_type: account.loginType || 'google',
            bind_status: account.bindStatus || 'single',
            server: account.server || 'mena',
            seller_price: Math.max(1, parseFloat(account.sellerPrice) || 10),
            images: imagesArr,
            details: detailsObj,
            status: dbStatus
        };

        let resultRow = null;
        let finalError = null;

        // دالة مساعدة للإدراج/التحديث مع المعالجة الذكية لأي عمود غير موجود في Schema Cache
        const executeAccountWrite = async (isUpsert) => {
            const workingPayload = { ...payload };
            for (let attempt = 0; attempt < 5; attempt++) {
                const query = isUpsert
                    ? client.from('marketplace_accounts').upsert(workingPayload, { onConflict: 'id' }).select('*').maybeSingle()
                    : client.from('marketplace_accounts').insert(workingPayload).select('*').maybeSingle();

                const { data, error } = await query;
                if (!error) return { data, error: null };

                // إذا كان الخطأ بسبب عمود غير موجود في schema cache، نقوم بحذفه من workingPayload وإعادة المحاولة تلقائياً
                const colMatch = error.message && error.message.match(/Could not find the '([^']+)' column/i);
                if (colMatch && colMatch[1] && colMatch[1] in workingPayload && colMatch[1] !== 'seller_id') {
                    delete workingPayload[colMatch[1]];
                    continue;
                }
                return { data: null, error };
            }
            return { data: null, error: { message: 'تعذر حفظ الحساب بعد عدة محاولات.' } };
        };

        if (waseetIsValidUuid(account.id)) {
            payload.id = account.id;
            const { data, error } = await executeAccountWrite(true);
            if (error) {
                console.error('Insert Error:', error);
                if (options.showAlert) {
                    alert('فشل النشر: ' + error.message);
                }
                return options.returnFullResult ? { data: null, error } : null;
            }
            resultRow = data;
        } else {
            const { data, error } = await executeAccountWrite(false);
            if (error) {
                console.error('Insert Error:', error);
                finalError = error;
                if (options.showAlert) {
                    alert('فشل النشر: ' + error.message);
                }
                return options.returnFullResult ? { data: null, error } : null;
            }
            resultRow = data;
        }

        if (resultRow) {
            const oldId = account.id;
            account.id = resultRow.id;
            account.seller_id = sellerUuid;
            account.sellerId = sellerUuid;
            account.accountNumber = resultRow.account_number || account.accountNumber;
            account.syncedToSupabase = true;

            // تحديث المعرف في localStorage حتى لا يتكرر الرفع
            try {
                const saved = JSON.parse(localStorage.getItem('WASEET_USER_ACCOUNTS') || '[]');
                const idx = saved.findIndex(a => String(a.id) === String(oldId) || String(a.id) === String(resultRow.id) || a.title === account.title);
                if (idx !== -1) {
                    saved[idx].id = resultRow.id;
                    saved[idx].seller_id = sellerUuid;
                    saved[idx].sellerId = sellerUuid;
                    saved[idx].accountNumber = account.accountNumber;
                    saved[idx].syncedToSupabase = true;
                    localStorage.setItem('WASEET_USER_ACCOUNTS', JSON.stringify(saved));
                }
            } catch (e) {}
        }

        return options.returnFullResult ? { data: resultRow, error: finalError } : resultRow;
    } catch (err) {
        console.error('Insert Error:', err);
        if (options.showAlert) {
            alert('فشل النشر: ' + (err.message || String(err)));
        }
        return options.returnFullResult ? { data: null, error: err } : null;
    }
}

/**
 * تحويل صف قادم من جدول marketplace_accounts إلى كائن حساب متوافق مع واجهة الموقع
 */
function waseetMapRemoteAccountRow(acc, profilesMap = {}) {
    const details = (acc.details && typeof acc.details === 'object') ? acc.details : {};
    const profileObj = (acc.profiles && typeof acc.profiles === 'object' && !Array.isArray(acc.profiles))
        ? acc.profiles
        : (Array.isArray(acc.profiles) && acc.profiles[0] ? acc.profiles[0] : (profilesMap[acc.seller_id] || null));

    const sellerName = (profileObj && (profileObj.name || profileObj.username || profileObj.full_name))
        || details.sellerName
        || acc.seller_name
        || (profileObj && profileObj.email ? profileObj.email.split('@')[0] : 'بائع موثق');

    let parsedCreds = (acc.credentials && Object.keys(acc.credentials).length > 0)
        ? acc.credentials
        : (details.credentials && Object.keys(details.credentials).length > 0 ? details.credentials : null);
    if ((!parsedCreds || Object.keys(parsedCreds).length === 0) && acc.encrypted_credentials) {
        if (typeof acc.encrypted_credentials === 'string' && acc.encrypted_credentials.trim().startsWith('{')) {
            try { parsedCreds = JSON.parse(acc.encrypted_credentials); } catch (e) {}
        }
    }
    if (!parsedCreds || typeof parsedCreds !== 'object') {
        parsedCreds = {
            email_or_phone: acc.login_identifier || details.email_or_phone || 'غير متوفر',
            password: acc.raw_password || details.password || '••••••••'
        };
    }

    const imgs = (Array.isArray(acc.images) && acc.images.length > 0)
        ? acc.images
        : (Array.isArray(acc.gallery_images) && acc.gallery_images.length > 0
            ? acc.gallery_images
            : (acc.image_url ? [acc.image_url] : ['https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800']));

    const rareSkinsVal = details.rareSkins || acc.rare_skins || ['سكنات نادرة'];
    const iconicPantsVal = details.iconicPants || acc.iconic_pants || ['بنطلون مميز'];

    return {
        id: acc.id,
        localId: details.localId || null,
        accountNumber: acc.account_number || 1001,
        game: details.originalGame || acc.game || 'free_fire',
        title: acc.title || 'حساب ألعاب مميز',
        level: Number(acc.level) || 50,
        primeLevel: Number(acc.prime_level) || 1,
        loginType: acc.login_type || 'google',
        bindStatus: acc.bind_status || 'single',
        server: acc.server || 'mena',
        sellerName: sellerName,
        sellerAvatar: (profileObj && profileObj.avatar_url) || null,
        sellerId: acc.seller_id,
        sellerRating: 5.0,
        sellerDeals: 1,
        sellerPrice: parseFloat(acc.seller_price) || 0,
        evoGunsCount: Number(details.evoGunsCount ?? acc.evo_guns_count ?? 0),
        evoGuns: Array.isArray(details.evoGuns) ? details.evoGuns : (Number(details.evoGunsCount || acc.evo_guns_count) > 0 ? [`${details.evoGunsCount || acc.evo_guns_count} أسلحة إيفو مطورة`] : []),
        rareSkins: Array.isArray(rareSkinsVal) ? rareSkinsVal : String(rareSkinsVal).split('،').map(s => s.trim()),
        iconicPants: Array.isArray(iconicPantsVal) ? iconicPantsVal : String(iconicPantsVal).split('،').map(s => s.trim()),
        accountNotes: details.accountNotes || details.notes || acc.account_notes || acc.notes || '',
        image: imgs[0],
        images: imgs,
        badge: details.badge || ((details.originalGame || acc.game) === 'free_fire' ? `برايم ${acc.prime_level || 1}` : 'مميز'),
        featured: false,
        status: acc.status || 'pending_verification',
        credentials: parsedCreds,
        createdAt: acc.created_at,
        submittedAt: acc.created_at,
        reviewStatus: details.reviewStatus || acc.review_status || (acc.status === 'available' ? 'approved' : 'pending'),
        rejectionReason: details.rejectionReason || acc.rejection_reason || '',
        details: details,
        syncedToSupabase: true
    };
}

/**
 * جلب كافة الحسابات من جدول marketplace_accounts مع ربط آمن (Left Join) لجدول profiles
 * بحيث لا يختفي أي حساب حتى لو كان ملف البائع الشخصي غير مكتمل
 */
async function waseetFetchAccountsFromSupabase() {
    const client = initWaseetSupabase();
    if (!client || typeof WASEET_STATE === 'undefined') return [];

    try {
        // أولاً: رفع أي حسابات محلية في WASEET_USER_ACCOUNTS لم يتم رفعها بعد إلى السحابة (مثل حساب 'تجربة')
        try {
            const localSaved = JSON.parse(localStorage.getItem('WASEET_USER_ACCOUNTS') || '[]');
            for (const localAcc of localSaved) {
                if (localAcc && !waseetIsValidUuid(localAcc.id) && !localAcc.syncedToSupabase) {
                    await waseetSaveAccountToSupabase(localAcc);
                }
            }
        } catch (e) {}

        // ثانياً: جلب الحسابات من Supabase مع Left Join غير مقيد على profiles، مع fallback فوري إلى select('*')
        let rows = null;
        const { data: joinData, error: joinError } = await client
            .from('marketplace_accounts')
            .select('*, profiles(id, name, email, avatar_url)')
            .order('created_at', { ascending: false });

        if (!joinError && Array.isArray(joinData)) {
            rows = joinData;
        } else {
            const { data: plainData, error: plainError } = await client
                .from('marketplace_accounts')
                .select('*')
                .order('created_at', { ascending: false });
            if (!plainError && Array.isArray(plainData)) {
                rows = plainData;
            }
        }

        if (!Array.isArray(rows)) return WASEET_STATE.accounts || [];

        // جلب أسماء البائعين من profiles بشكل منفصل وآمن في حال لم يرجع الـ Join بياناتهم
        const sellerIds = [...new Set(rows.map(r => r.seller_id).filter(id => waseetIsValidUuid(id)))];
        const profilesMap = {};
        if (sellerIds.length > 0) {
            try {
                const { data: profs } = await client
                    .from('profiles')
                    .select('id, name, email, avatar_url')
                    .in('id', sellerIds);
                if (Array.isArray(profs)) {
                    profs.forEach(p => { if (p && p.id) profilesMap[p.id] = p; });
                }
            } catch (e) {}
        }

        const remoteAccounts = rows.map(r => waseetMapRemoteAccountRow(r, profilesMap));

        // دمج الحسابات السحابية مع الحسابات المحلية دون تكرار
        const existingAccounts = WASEET_STATE.accounts || [];
        const mergedMap = new Map();

        remoteAccounts.forEach(acc => {
            mergedMap.set(String(acc.id), acc);
        });

        existingAccounts.forEach(localAcc => {
            if (!localAcc) return;
            const alreadyInRemote = remoteAccounts.some(r =>
                String(r.id) === String(localAcc.id) ||
                (r.localId && String(r.localId) === String(localAcc.id)) ||
                (r.title === localAcc.title && Number(r.sellerPrice) === Number(localAcc.sellerPrice))
            );
            if (!alreadyInRemote) {
                mergedMap.set(String(localAcc.id), localAcc);
            }
        });

        WASEET_STATE.accounts = Array.from(mergedMap.values());
        if (window.waseetApp) {
            window.waseetApp.updatePendingAccountsCounter();
            window.waseetApp.updateSellerListingsCounter();
        }
        return WASEET_STATE.accounts;
    } catch (err) {
        console.warn('[Supabase Accounts] استثناء جلب الحسابات:', err);
        return WASEET_STATE.accounts || [];
    }
}

/**
 * دمج مصفوفتين من رسائل الصفقة دون تكرار أو فقدان أي رسالة
 */
function waseetMergeDealMessagesList(remoteList = [], localList = []) {
    const r = Array.isArray(remoteList) ? remoteList : [];
    const l = Array.isArray(localList) ? localList : [];
    if (l.length === 0) return [...r];
    if (r.length === 0) return [...l];

    const combined = [...r];
    const seenKeys = new Set(
        r.map(m => m && (m.id ? `id:${m.id}` : `${m.sender}|${(m.text || '').trim()}|${m.time || ''}`))
    );

    l.forEach(m => {
        if (!m || !m.text) return;
        const keyById = m.id ? `id:${m.id}` : null;
        const keyByContent = `${m.sender}|${(m.text || '').trim()}|${m.time || ''}`;
        if ((keyById && seenKeys.has(keyById)) || seenKeys.has(keyByContent)) return;
        if (keyById) seenKeys.add(keyById);
        seenKeys.add(keyByContent);
        combined.push(m);
    });

    return combined;
}

/**
 * حفظ أو تحديث صفقة وساطة في جدول deals على Supabase
 */
async function waseetSaveDealToSupabase(deal, options = {}) {
    const client = initWaseetSupabase();
    if (!client || !deal || !deal.id) return false;

    try {
        const { data: { session } } = await client.auth.getSession();
        const sessionUserId = session?.user?.id || null;

        const rawBuyerId = deal.buyer?.id || deal.buyer_id || deal.buyerId || null;
        const rawSellerId = deal.seller?.id || deal.seller_id || deal.sellerId || null;
        const buyerUuid = waseetIsValidUuid(rawBuyerId) ? rawBuyerId : sessionUserId;
        const sellerUuid = waseetIsValidUuid(rawSellerId) ? rawSellerId : buyerUuid;
        if (!buyerUuid) return false;

        // مطابقة حقل الحالة مع قيود جدول deals مع حفظ الحالة الدقيقة الكاملة في notes JSON
        let dbStatus = 'mediator_inspecting';
        if (deal.status === 'completed') dbStatus = 'completed';
        else if (deal.status === 'cancelled') dbStatus = 'cancelled';
        else if (deal.status === 'disputed') dbStatus = 'disputed';
        else if (deal.status === 'waiting_credentials') dbStatus = 'waiting_credentials';
        else if (deal.status === 'buyer_inspecting') dbStatus = 'buyer_inspecting';

        const accNum = Number(deal.accountNumber || (deal.accountId ? String(deal.accountId).replace(/\D/g, '') : 0)) || null;
        const stepVal = Math.min(4, Math.max(1, Number(deal.currentStep) || 2));

        const payload = {
            id: String(deal.id),
            account_id: waseetIsValidUuid(deal.accountId) ? deal.accountId : null,
            account_number: accNum,
            buyer_id: buyerUuid,
            seller_id: sellerUuid,
            seller_price: Number(deal.sellerPrice || 0),
            fee: Number(deal.fee || 0),
            total_points: Number(deal.totalPoints || 0),
            status: dbStatus,
            current_step: stepVal,
            notes: JSON.stringify(deal),
            updated_at: new Date().toISOString()
        };

        const { error } = await client
            .from('deals')
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            console.error('[Supabase Deals] تعذر حفظ الصفقة في السحابة:', error);
            if (options.showAlert) {
                alert('فشل حفظ بيانات الصفقة: ' + error.message);
            }
            return options.returnError ? { ok: false, error } : false;
        }
        return options.returnError ? { ok: true, error: null } : true;
    } catch (err) {
        console.error('[Supabase Deals] استثناء أثناء حفظ الصفقة:', err);
        if (options.showAlert) {
            alert('فشل حفظ بيانات الصفقة: ' + (err.message || String(err)));
        }
        return options.returnError ? { ok: false, error: err } : false;
    }
}

/**
 * إرسال رسالة داخل غرفة الوساطة وحفظها في جدول deal_messages وجدول deals مع إظهار أي خطأ RLS أو أعمدة
 */
async function waseetSendEscrowMessageToSupabase(deal, msgObj, channelType, senderRole) {
    const client = initWaseetSupabase();
    if (!client || !deal || !deal.id || !msgObj || !msgObj.text) {
        const err = { message: 'تعذر الاتصال بقاعدة البيانات أو بيانات الصفقة غير مكتملة.' };
        console.error('Escrow Message Insert Error:', err);
        alert('فشل إرسال الرسالة: ' + err.message);
        return { data: null, error: err };
    }

    try {
        const { data: { session } } = await client.auth.getSession();
        const sessionUser = session?.user || null;
        const candidateId = sessionUser?.id || (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user ? WASEET_STATE.user.id : null);
        const senderUuid = waseetIsValidUuid(candidateId) ? candidateId : null;

        if (!senderUuid) {
            const authErr = { message: 'يرجى تسجيل الدخول أولاً لإرسال الرسائل في غرفة الوساطة.' };
            console.error('Escrow Message Auth Error:', authErr);
            alert('فشل إرسال الرسالة: ' + authErr.message);
            return { data: null, error: authErr };
        }

        // 1. حفظ الصفقة وتحديث notes JSONB أولاً لضمان وجود الصفقة في جدول deals قبل إدراج الرسالة
        const dealSaveRes = await waseetSaveDealToSupabase(deal, { returnError: true });

        // 2. إدراج الرسالة في جدول deal_messages لتفعيل Realtime وعزل القنوات
        const insertPayload = {
            deal_id: String(deal.id),
            sender_id: senderUuid,
            channel_type: channelType || 'all',
            sender_role: senderRole || 'buyer',
            message: msgObj.text
        };

        const { data, error } = await client
            .from('deal_messages')
            .insert([insertPayload])
            .select()
            .single();

        if (error) {
            console.error('Escrow Message Insert Error (deal_messages):', error);
            // إذا فشل الإدراج في deal_messages (مثلاً بسبب RLS أو عدم وجود الجدول/العمود)، نظهر التنبيه الصريح للمستخدم
            alert('فشل إرسال الرسالة في جدول رسائل الصفقة: ' + error.message);
            return { data: null, error };
        }

        if (dealSaveRes && dealSaveRes.error) {
            console.warn('[Supabase Deals] تم حفظ الرسالة في deal_messages ولكن تعذر تحديث notes في deals:', dealSaveRes.error.message);
        }

        return { data, error: null };
    } catch (err) {
        console.error('Escrow Message Unexpected Error:', err);
        alert('خطأ غير متوقع أثناء إرسال الرسالة: ' + (err.message || String(err)));
        return { data: null, error: err };
    }
}

/**
 * جلب رسائل صفقة معينة من جدول deal_messages في Supabase
 */
async function waseetFetchDealMessagesFromSupabase(dealId) {
    const client = initWaseetSupabase();
    if (!client || !dealId) return { data: [], error: null };

    try {
        const { data, error } = await client
            .from('deal_messages')
            .select('*')
            .eq('deal_id', String(dealId))
            .order('created_at', { ascending: true });

        if (error) {
            console.warn('[Supabase Deal Messages] تعذر جلب رسائل الصفقة:', error.message);
            return { data: [], error };
        }

        return { data: Array.isArray(data) ? data : [], error: null };
    } catch (err) {
        console.warn('[Supabase Deal Messages] استثناء جلب رسائل الصفقة:', err);
        return { data: [], error: err };
    }
}

/**
 * جلب جميع الصفقات من جدول deals في Supabase (دون تصفية أو استثناء لأي حالة)
 * مع جلب الأسماء الحقيقية لأطراف الصفقة (البائع والمشتري) من جدول profiles
 */
async function waseetFetchDealsFromSupabase() {
    const client = initWaseetSupabase();
    if (!client || typeof WASEET_STATE === 'undefined') return [];

    try {
        const { data, error } = await client
            .from('deals')
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !Array.isArray(data)) {
            if (error) console.warn('[Supabase Deals] تعذر جلب الصفقات:', error.message);
            return WASEET_STATE.deals || [];
        }

        // جلب الأسماء الحقيقية للمشترين والبائعين من جدول profiles بناءً على buyer_id و seller_id
        const participantIds = [...new Set(
            data.flatMap(r => [r.buyer_id, r.seller_id]).filter(id => waseetIsValidUuid(id))
        )];
        const profilesMap = {};
        if (participantIds.length > 0) {
            try {
                const { data: profs } = await client
                    .from('profiles')
                    .select('id, name, email, avatar_url')
                    .in('id', participantIds);
                if (Array.isArray(profs)) {
                    profs.forEach(p => { if (p && p.id) profilesMap[p.id] = p; });
                }
            } catch (e) {}
        }

        // بناء خريطة الصفقات المحلية الحالية للحفاظ على أي رسائل أُرسلت محلياً ولم تكتمل مزامنتها بعد
        const localDealsById = new Map();
        (WASEET_STATE.deals || []).forEach(d => { if (d && d.id) localDealsById.set(String(d.id), d); });
        (WASEET_STATE.completedDeals || []).forEach(d => { if (d && d.id) localDealsById.set(String(d.id), d); });
        if (typeof window !== 'undefined' && window.escrowRoom && window.escrowRoom.deal && window.escrowRoom.deal.id) {
            localDealsById.set(String(window.escrowRoom.deal.id), window.escrowRoom.deal);
        }

        const remoteDeals = data.map((row, index) => {
            let parsed = null;
            if (row.notes && typeof row.notes === 'string' && row.notes.trim().startsWith('{')) {
                try {
                    parsed = JSON.parse(row.notes);
                } catch (e) {
                    parsed = null;
                }
            }

            const dealIdStr = String(row.id || (parsed && parsed.id));
            const existingLocal = localDealsById.get(dealIdStr) || null;

            const buyerProfile = profilesMap[row.buyer_id] || null;
            const sellerProfile = profilesMap[row.seller_id] || null;

            const realBuyerName = (buyerProfile && (buyerProfile.name || buyerProfile.username || buyerProfile.full_name))
                || (parsed && parsed.buyer && parsed.buyer.name)
                || (buyerProfile && buyerProfile.email ? buyerProfile.email.split('@')[0] : 'المشتري');

            // إذا كان seller_id مساوياً لـ buyer_id بسبب حساب تجريبي، نستخدم اسم البائع المحفوظ في الصفقة إن وجد
            const sameDummyId = row.seller_id && row.buyer_id && row.seller_id === row.buyer_id && parsed && parsed.seller && parsed.seller.name && parsed.seller.name !== realBuyerName;
            const realSellerName = (!sameDummyId && sellerProfile && (sellerProfile.name || sellerProfile.username || sellerProfile.full_name))
                || (parsed && parsed.seller && parsed.seller.name)
                || (sellerProfile && sellerProfile.email ? sellerProfile.email.split('@')[0] : 'البائع');

            const dealNumber = (parsed && parsed.dealNumber) || (data.length - index);
            const rawStatus = (parsed && parsed.status) || row.status || 'active';
            const normalizedStatus = (row.status === 'completed' || rawStatus === 'completed')
                ? 'completed'
                : ((row.status === 'cancelled' || rawStatus === 'cancelled') ? 'cancelled' : rawStatus);

            const remoteSellerMsgs = (parsed && Array.isArray(parsed.sellerMessages)) ? parsed.sellerMessages : [];
            const remoteBuyerMsgs = (parsed && Array.isArray(parsed.buyerMessages)) ? parsed.buyerMessages : [];
            const localSellerMsgs = (existingLocal && Array.isArray(existingLocal.sellerMessages)) ? existingLocal.sellerMessages : [];
            const localBuyerMsgs = (existingLocal && Array.isArray(existingLocal.buyerMessages)) ? existingLocal.buyerMessages : [];

            return {
                ...(parsed || {}),
                id: dealIdStr,
                dealNumber: dealNumber,
                title: (parsed && parsed.title) || `صفقة رقم ${dealNumber} • حساب #${row.account_number || ''}`,
                accountId: (parsed && parsed.accountId) || row.account_id || `acc_${row.account_number || 1001}`,
                accountNumber: row.account_number || (parsed && parsed.accountNumber) || null,
                accountTitle: (parsed && parsed.accountTitle) || `حساب وساطة #${row.account_number || dealNumber}`,
                buyer: {
                    ...((parsed && parsed.buyer) || {}),
                    id: row.buyer_id || (parsed && parsed.buyer && parsed.buyer.id),
                    name: realBuyerName
                },
                seller: {
                    ...((parsed && parsed.seller) || {}),
                    id: row.seller_id || (parsed && parsed.seller && parsed.seller.id),
                    name: realSellerName
                },
                mediator: (parsed && parsed.mediator) || { id: 'admin_waseet', name: 'الوسيط المعتمد' },
                sellerPrice: Number(row.seller_price ?? (parsed && parsed.sellerPrice) ?? 0),
                fee: Number(row.fee ?? (parsed && parsed.fee) ?? 0),
                totalPoints: Number(row.total_points ?? (parsed && parsed.totalPoints) ?? 0),
                currentStep: Number(row.current_step ?? (parsed && parsed.currentStep) ?? 2),
                status: normalizedStatus,
                stageText: (parsed && parsed.stageText) || 'المرحلة 2: نقل الملكية للمشتري وتأمين الحساب',
                credentials: (parsed && parsed.credentials) || {
                    email: 'محفوظ لدى الوسيط',
                    password: '••••••••••••',
                    rawPassword: '••••••••••••',
                    loginType: 'Google / Facebook',
                    backupCodes: '—'
                },
                sellerMessages: waseetMergeDealMessagesList(remoteSellerMsgs, localSellerMsgs),
                buyerMessages: waseetMergeDealMessagesList(remoteBuyerMsgs, localBuyerMsgs),
                createdAt: row.created_at || (parsed && parsed.createdAt) || new Date().toISOString()
            };
        });

        // دمج الصفقات السحابية مع الصفقات المحلية دون فقدان أي صفقة
        const mergedMap = new Map();
        remoteDeals.forEach(d => {
            if (d && d.id) mergedMap.set(String(d.id), d);
        });
        (WASEET_STATE.deals || []).forEach(d => {
            if (d && d.id && !mergedMap.has(String(d.id))) {
                mergedMap.set(String(d.id), d);
                waseetSaveDealToSupabase(d);
            }
        });
        (WASEET_STATE.completedDeals || []).forEach(d => {
            if (d && d.id && !mergedMap.has(String(d.id))) {
                mergedMap.set(String(d.id), d);
            }
        });

        const allMerged = Array.from(mergedMap.values());
        allMerged.sort((a, b) => (Number(b.dealNumber) || 0) - (Number(a.dealNumber) || 0));

        let maxDealNum = 0;
        allMerged.forEach(d => {
            if (Number(d.dealNumber) > maxDealNum) maxDealNum = Number(d.dealNumber);
        });
        const currentCounter = parseInt(localStorage.getItem('WASEET_DEAL_COUNTER') || '0');
        if (maxDealNum > currentCounter) {
            localStorage.setItem('WASEET_DEAL_COUNTER', String(maxDealNum));
        }

        WASEET_STATE.deals = allMerged.filter(d => d.status !== 'completed' && d.status !== 'cancelled');
        WASEET_STATE.completedDeals = allMerged.filter(d => d.status === 'completed' || d.status === 'cancelled');
        if (!WASEET_STATE.activeDeal && WASEET_STATE.deals.length > 0) {
            WASEET_STATE.activeDeal = WASEET_STATE.deals[0];
        }

        // إذا كانت غرفة الوساطة مفتوحة، نحدّث مرجع الصفقة فيها دون فقدان أي رسالة
        if (typeof window !== 'undefined' && window.escrowRoom && window.escrowRoom.deal) {
            const matched = mergedMap.get(String(window.escrowRoom.deal.id));
            if (matched) {
                window.escrowRoom.deal = matched;
                WASEET_STATE.activeDeal = matched;
                if (typeof window.escrowRoom.updateChatMessagesOnly === 'function') {
                    window.escrowRoom.updateChatMessagesOnly();
                }
            }
        }

        if (typeof saveWaseetData === 'function') saveWaseetData();
        return allMerged;
    } catch (err) {
        console.warn('[Supabase Deals] استثناء جلب الصفقات:', err);
        return WASEET_STATE.deals || [];
    }
}

window.waseetMergeDealMessagesList = waseetMergeDealMessagesList;
window.waseetSaveAccountToSupabase = waseetSaveAccountToSupabase;
window.waseetFetchAccountsFromSupabase = waseetFetchAccountsFromSupabase;
window.waseetMapRemoteAccountRow = waseetMapRemoteAccountRow;
window.waseetSaveDealToSupabase = waseetSaveDealToSupabase;
window.waseetSendEscrowMessageToSupabase = waseetSendEscrowMessageToSupabase;
window.waseetFetchDealMessagesFromSupabase = waseetFetchDealMessagesFromSupabase;
window.waseetFetchDealsFromSupabase = waseetFetchDealsFromSupabase;

/**
 * الاستماع لتغيرات الجلسة وتحديث الواجهة تلقائياً
 */
function initWaseetAuthListener() {
    const client = initWaseetSupabase();
    if (!client) return;

    client.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            await waseetSyncAuthState();
        } else if (event === 'SIGNED_OUT') {
            if (typeof WASEET_STATE !== 'undefined') {
                WASEET_STATE.user = null;
                if (typeof saveWaseetData === 'function') saveWaseetData();
            }
            if (window.waseetApp && typeof window.waseetApp.renderUserProfile === 'function') {
                window.waseetApp.renderUserProfile();
            }
            if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
            if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
        }
    });
}

// تشغيل المستمع بمجرد اكتمال تحميل DOM
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        initWaseetSupabase();
        initWaseetAuthListener();
        waseetSyncAuthState();
        waseetFetchAccountsFromSupabase();
        waseetFetchDealsFromSupabase();
    });
}
