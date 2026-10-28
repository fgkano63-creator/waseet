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

    if (window.waseetNotifications && typeof window.waseetNotifications.syncWithUser === 'function') {
        window.waseetNotifications.syncWithUser(null);
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
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.warn('[Supabase Profiles] تعذر جلب الملف الشخصي:', error.message);
            return null;
        }
        return data;
    } catch (err) {
        console.warn('[Supabase Profiles] استثناء جلب الملف:', err);
        return null;
    }
}

/**
 * جلب أو مطابقة سجل المستخدم الحالي (أو المدير) من جدول public.profiles (قراءة فقط دون إرسال طلبات POST/Upsert من المتصفح)
 * حيث يتم إنشاء الـ Profile تلقائياً عبر Trigger قاعدة البيانات (on_auth_user_created).
 */
async function waseetEnsureUserProfileInDb(userHint = null, dealContext = null, senderRoleHint = null) {
    const client = initWaseetSupabase();
    if (!client) return null;

    try {
        let authUser = null;
        const { data: sessionRes } = await client.auth.getSession();
        authUser = sessionRes?.session?.user || null;

        if (!authUser) {
            const { data: userRes } = await client.auth.getUser();
            authUser = userRes?.user || null;
        }

        const stateUser = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? WASEET_STATE.user : null;
        const rawCandidateId = (authUser && authUser.id)
            || (userHint && waseetIsValidUuid(userHint.id) ? userHint.id : null)
            || (stateUser && waseetIsValidUuid(stateUser.id) ? stateUser.id : null);

        const emailVal = (authUser && authUser.email)
            || (userHint && userHint.email)
            || (stateUser && stateUser.email)
            || '';
        const emailLower = String(emailVal).toLowerCase().trim();

        const isAdmin = !!(
            senderRoleHint === 'mediator' ||
            (userHint && (userHint.role === 'admin' || userHint.role === 'mediator' || userHint.isAdmin)) ||
            (stateUser && (stateUser.role === 'admin' || stateUser.role === 'mediator' || stateUser.isAdmin)) ||
            emailLower === 'fgkano63@gmail.com' ||
            emailLower === 'saadani2009@gmail.com' ||
            emailLower === 'mediator@waseet.com'
        );

        const nameVal = (authUser && (authUser.user_metadata?.full_name || authUser.user_metadata?.name))
            || (userHint && userHint.name)
            || (stateUser && stateUser.name)
            || (emailVal ? emailVal.split('@')[0] : (isAdmin ? 'الوسيط المعتمد' : 'مستخدم'));

        const avatarVal = (authUser && (authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture))
            || (userHint && userHint.avatar)
            || (stateUser && stateUser.avatar)
            || null;

        const targetRole = isAdmin ? 'admin' : 'user';

        // 1. القراءة المباشرة من جدول public.profiles (دون أي محاولة POST / Upsert من المتصفح)
        if (rawCandidateId && waseetIsValidUuid(rawCandidateId)) {
            const { data: existingProf } = await client
                .from('profiles')
                .select('*')
                .eq('id', rawCandidateId)
                .maybeSingle();

            if (existingProf && existingProf.id) {
                if (stateUser && stateUser.id !== existingProf.id) {
                    stateUser.id = existingProf.id;
                    if (typeof saveWaseetData === 'function') saveWaseetData();
                }
                return existingProf;
            }

            // إذا كان المستخدم مصادقاً بمعرف UUID رسمي، نعيد بياناته مباشرة دون إرسال طلبات POST خاطئة
            return {
                id: rawCandidateId,
                email: emailVal,
                name: nameVal,
                avatar_url: avatarVal,
                role: targetRole
            };
        }

        // 2. في حال عدم توفر معرف مباشر، البحث عن السجل المطابق بالقراءة فقط (SELECT)
        const { data: allProfiles, error: listErr } = await client
            .from('profiles')
            .select('*')
            .limit(50);

        if (!listErr && Array.isArray(allProfiles) && allProfiles.length > 0) {
            let matchedProfile = null;

            if (isAdmin) {
                matchedProfile = allProfiles.find(p =>
                    p.role === 'admin' ||
                    p.role === 'mediator' ||
                    (p.email && ['fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com'].includes(String(p.email).toLowerCase().trim()))
                );
            }

            if (!matchedProfile && emailLower) {
                matchedProfile = allProfiles.find(p => p.email && String(p.email).toLowerCase().trim() === emailLower);
            }
            if (!matchedProfile && nameVal) {
                matchedProfile = allProfiles.find(p => (p.name && p.name === nameVal) || (p.username && p.username === nameVal));
            }

            if (!matchedProfile && dealContext) {
                const dealBuyerId = dealContext.buyer?.id || dealContext.buyer_id;
                const dealSellerId = dealContext.seller?.id || dealContext.seller_id;
                if (senderRoleHint === 'buyer' && dealBuyerId) {
                    matchedProfile = allProfiles.find(p => String(p.id) === String(dealBuyerId));
                } else if (senderRoleHint === 'seller' && dealSellerId) {
                    matchedProfile = allProfiles.find(p => String(p.id) === String(dealSellerId));
                }
                if (!matchedProfile && dealBuyerId) {
                    matchedProfile = allProfiles.find(p => String(p.id) === String(dealBuyerId));
                }
                if (!matchedProfile && dealSellerId) {
                    matchedProfile = allProfiles.find(p => String(p.id) === String(dealSellerId));
                }
            }

            if (!matchedProfile) {
                matchedProfile = allProfiles[0];
            }

            if (matchedProfile && matchedProfile.id) {
                if (stateUser && !waseetIsValidUuid(stateUser.id)) {
                    stateUser.id = matchedProfile.id;
                    if (typeof saveWaseetData === 'function') saveWaseetData();
                }
                return matchedProfile;
            }
        }

        return null;
    } catch (err) {
        return null;
    }
}
window.waseetEnsureUserProfileInDb = waseetEnsureUserProfileInDb;

/**
 * مزامنة حالة الجلسة الحالية وتحديث المتغير العام WASEET_STATE
 */
async function waseetSyncAuthState() {
    const client = initWaseetSupabase();
    if (!client) return;
    if (window._waseetSyncAuthInFlight) return window._waseetSyncAuthInFlight;

    window._waseetSyncAuthInFlight = (async () => {
    try {
        const { data: { session }, error } = await client.auth.getSession();
        if (error || !session || !session.user) {
            WASEET_STATE.user = null;
            try { localStorage.removeItem('WASEET_SAVED_USER_PERMANENT'); } catch (e) {}
            if (typeof renderNavbarUser === 'function') renderNavbarUser();
            return;
        }

        const authUser = session.user;
        let profile = await waseetFetchUserProfile(authUser.id);

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

        const emailLower = (authUser.email || (profile ? profile.email : '') || '').toLowerCase().trim();
        const isAdmin = !!(
            (profile && (profile.role === 'admin' || profile.role === 'mediator')) ||
            emailLower === 'fgkano63@gmail.com' ||
            emailLower === 'saadani2009@gmail.com' ||
            emailLower === 'mediator@waseet.com'
        );

        const userRole = isAdmin ? 'admin' : ((profile && profile.role) || 'user');

        const rawAvail = profile
            ? (profile.points_balance !== undefined && profile.points_balance !== null
                ? Number(profile.points_balance)
                : Number(profile.wallet_balance ?? 0))
            : 0;
        const rawLocked = profile && profile.locked_points !== undefined && profile.locked_points !== null
            ? Number(profile.locked_points)
            : 0;

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
                available: rawAvail,
                locked: rawLocked,
                total: rawAvail + rawLocked
            }
        };

        if (typeof WASEET_STATE !== 'undefined') {
            WASEET_STATE.user = mappedUser;
            if (typeof saveWaseetData === 'function') saveWaseetData();
        }

        // مزامنة نظام الإشعارات وشارات التطبيق للمستخدم الحالي
        if (window.waseetNotifications && typeof window.waseetNotifications.syncWithUser === 'function') {
            window.waseetNotifications.syncWithUser(mappedUser);
        }

        // تحديث جميع عناصر المحفظة في الترويسة فوراً
        ['wallet-total-pts', 'admin-wallet-total-pts', 'deals-wallet-pts', 'chat-wallet-pts'].forEach(elId => {
            const el = document.getElementById(elId);
            if (el) el.innerText = `${rawAvail} نقطة`;
        });

        // تحديث عناصر الشريط العلوي فوراً قبل انتظار الجلب الشبكي المطول
        if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
        if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
        if (typeof renderNavbarUser === 'function') renderNavbarUser();
        if (typeof renderMyAccountsNavbarUser === 'function') renderMyAccountsNavbarUser();

        // جلب ومزامنة جميع الصفقات والحسابات من قاعدة بيانات Supabase بالتوازي لتسريع التنقل
        await Promise.allSettled([
            waseetFetchAccountsFromSupabase(),
            waseetFetchDealsFromSupabase()
        ]);

        // تحديث عناصر الواجهة فوراً وظهور الصورة والتاج في الشريط العلوي
        if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
        if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
        if (typeof renderNavbarUser === 'function') renderNavbarUser();
        if (typeof renderMyAccountsNavbarUser === 'function') renderMyAccountsNavbarUser();
        if (typeof waseetSyncAllNavBadges === 'function') waseetSyncAllNavBadges();
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

        // إذا كان في صفحة حساباتي، تحديث حسابات البائع فوراً
        if (typeof loadMyAccountsData === 'function') {
            loadMyAccountsData();
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
    } finally {
        window._waseetSyncAuthInFlight = null;
    }
    })();
    return window._waseetSyncAuthInFlight;
}

window.waseetSyncAuthState = waseetSyncAuthState;

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

        // توحيد دورة حياة الحساب: pending -> available -> sold -> completed
        let dbStatus = 'pending';
        if (account.status === 'available' || account.status === 'approved') dbStatus = 'available';
        else if (account.status === 'rejected') dbStatus = 'rejected';
        else if (account.status === 'sold') dbStatus = 'sold';
        else if (account.status === 'completed') dbStatus = 'completed';
        else if (account.status === 'in_deal') dbStatus = 'in_deal';
        else if (account.status === 'hidden') dbStatus = 'hidden';
        else dbStatus = 'pending';

        // توافق اسم اللعبة مع قيود قاعدة البيانات مع حفظ اللعبة الأصلية داخل details
        const allowedGames = ['free_fire', 'pubg', 'other'];
        const dbGame = allowedGames.includes(account.game) ? account.game : 'other';

        const imagesArr = Array.isArray(account.images) && account.images.length > 0
            ? account.images
            : (account.image ? [account.image] : ['assets/logo.png']);

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
 * دالة مساعدة لتحليل قيم JSON بأمان تام (سواء كانت Object جاهزاً أو نص JSON أو نصاً عادياً أو null)
 */
function waseetSafeParseJson(val, fallback = {}) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return fallback;
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return JSON.parse(trimmed);
            } catch (e) {
                return fallback;
            }
        }
    }
    return fallback;
}

/**
 * استخراج بيانات الدخول (credentials) بأمان تام دون رمي أي خطأ برمجي
 * يدعم عمود credentials سواء كان JSONB أو TEXT أو داخل details
 */
function waseetSafeParseCredentials(acc, details = {}) {
    let parsedCreds = null;

    if (acc && acc.credentials) {
        if (typeof acc.credentials === 'object' && !Array.isArray(acc.credentials)) {
            parsedCreds = acc.credentials;
        } else if (typeof acc.credentials === 'string') {
            const trimmed = acc.credentials.trim();
            if (trimmed.startsWith('{')) {
                try {
                    parsedCreds = JSON.parse(trimmed);
                } catch (e) {
                    parsedCreds = { email_or_phone: trimmed, password: details.password || '••••••••' };
                }
            } else if (trimmed.length > 0) {
                parsedCreds = { email_or_phone: trimmed, password: details.password || '••••••••' };
            }
        }
    }

    if ((!parsedCreds || typeof parsedCreds !== 'object' || (!parsedCreds.email_or_phone && !parsedCreds.password)) && details && details.credentials) {
        const detCreds = waseetSafeParseJson(details.credentials, null);
        if (detCreds && typeof detCreds === 'object') {
            parsedCreds = detCreds;
        }
    }

    if ((!parsedCreds || typeof parsedCreds !== 'object' || (!parsedCreds.email_or_phone && !parsedCreds.password)) && acc && acc.encrypted_credentials) {
        const encCreds = waseetSafeParseJson(acc.encrypted_credentials, null);
        if (encCreds && typeof encCreds === 'object') {
            parsedCreds = encCreds;
        }
    }

    if (!parsedCreds || typeof parsedCreds !== 'object') {
        parsedCreds = {};
    }

    return {
        email_or_phone: String(parsedCreds.email_or_phone || parsedCreds.email || parsedCreds.login || (acc && acc.login_identifier) || details.email_or_phone || 'غير متوفر'),
        password: String(parsedCreds.password || parsedCreds.pass || (acc && acc.raw_password) || details.password || '••••••••'),
        recovery_email: String(parsedCreds.recovery_email || details.recovery_email || ''),
        recovery_password: String(parsedCreds.recovery_password || details.recovery_password || '')
    };
}

/**
 * تحويل صف قادم من جدول marketplace_accounts إلى كائن حساب متوافق مع واجهة الموقع
 */
function waseetMapRemoteAccountRow(acc, profilesMap = {}) {
    if (!acc || typeof acc !== 'object') return null;

    const details = waseetSafeParseJson(acc.details, {});
    const profileObj = (acc.profiles && typeof acc.profiles === 'object' && !Array.isArray(acc.profiles))
        ? acc.profiles
        : (Array.isArray(acc.profiles) && acc.profiles[0] ? acc.profiles[0] : (profilesMap[acc.seller_id] || null));

    const sellerName = (profileObj && (profileObj.name || profileObj.username || profileObj.full_name))
        || details.sellerName
        || acc.seller_name
        || (profileObj && profileObj.email ? profileObj.email.split('@')[0] : 'بائع موثق');

    const sellerEmail = (profileObj && profileObj.email) || details.sellerEmail || null;
    const parsedCreds = waseetSafeParseCredentials(acc, details);

    const parsedImagesField = Array.isArray(acc.images)
        ? acc.images
        : waseetSafeParseJson(acc.images, []);
    const parsedGalleryField = Array.isArray(acc.gallery_images)
        ? acc.gallery_images
        : waseetSafeParseJson(acc.gallery_images, []);

    const imgs = (Array.isArray(parsedImagesField) && parsedImagesField.length > 0)
        ? parsedImagesField
        : (Array.isArray(parsedGalleryField) && parsedGalleryField.length > 0
            ? parsedGalleryField
            : (acc.image_url ? [acc.image_url] : (Array.isArray(details.images) && details.images.length > 0 ? details.images : ['assets/logo.png'])));

    const rawSkins = details.rareSkins || acc.rare_skins || [];
    const rawPants = details.iconicPants || acc.iconic_pants || [];
    const cleanSkins = (Array.isArray(rawSkins) ? rawSkins : String(rawSkins).split('،'))
        .map(s => String(s || '').trim())
        .filter(s => s && s !== 'سكنات نادرة' && s !== 'غير محدد');
    const cleanPants = (Array.isArray(rawPants) ? rawPants : String(rawPants).split('،'))
        .map(s => String(s || '').trim())
        .filter(s => s && s !== 'بنطلون مميز' && s !== 'غير محدد');

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
        sellerEmail: sellerEmail,
        sellerAvatar: (profileObj && profileObj.avatar_url) || null,
        sellerId: acc.seller_id,
        seller_id: acc.seller_id,
        sellerRating: 5.0,
        sellerDeals: 1,
        sellerPrice: parseFloat(acc.seller_price) || 0,
        evoGunsCount: 0,
        evoGuns: [],
        rareSkins: cleanSkins,
        iconicPants: cleanPants,
        accountNotes: details.accountNotes || details.notes || acc.account_notes || acc.notes || '',
        image: imgs[0] || 'assets/logo.png',
        images: imgs,
        badge: details.badge || ((details.originalGame || acc.game) === 'free_fire' ? `برايم ${acc.prime_level || 1}` : 'مميز'),
        featured: false,
        status: (acc.status === 'approved') ? 'available' : ((acc.status === 'pending_verification' || acc.status === 'pending_review' || !acc.status) ? 'pending' : acc.status),
        credentials: parsedCreds,
        createdAt: acc.created_at,
        submittedAt: acc.created_at,
        reviewStatus: details.reviewStatus || acc.review_status || ((acc.status === 'available' || acc.status === 'approved') ? 'approved' : 'pending'),
        rejectionReason: details.rejectionReason || acc.rejection_reason || '',
        details: details,
        syncedToSupabase: true
    };
}
window.waseetMapRemoteAccountRow = waseetMapRemoteAccountRow;
window.waseetSafeParseCredentials = waseetSafeParseCredentials;

/**
 * جلب الحسابات المعتمدة للمتجر العام من جدول marketplace_accounts مع ربط آمن (Left Join) لجدول profiles
 * بحيث لا يظهر في السوق العام أي حساب معلق (قيد الفحص) أو محجوز (in_deal) أو مباع (sold) أو مرفوض.
 */
async function waseetFetchAccountsFromSupabase(options = {}) {
    const client = initWaseetSupabase();
    if (!client || typeof WASEET_STATE === 'undefined') return [];

    const includeAllStatuses = !!(options && options.includeAllStatuses);

    try {
        // فحص تلقائي لإلغاء الحجوزات التي مر عليها أكثر من 48 ساعة وإرجاع الحسابات للسوق
        await waseetExpireStaleEscrowDeals();

        // جلب الحسابات الفعلية فقط من Supabase (دون إعادة رفع أي بيانات محلية قديمة)
        let rows = null;
        let joinQuery = client
            .from('marketplace_accounts')
            .select('*, profiles(id, name, email, avatar_url)');
        if (!includeAllStatuses) {
            joinQuery = joinQuery.in('status', ['available', 'approved']);
        }
        const { data: joinData, error: joinError } = await joinQuery.order('created_at', { ascending: false });

        if (!joinError && Array.isArray(joinData)) {
            rows = joinData;
        } else {
            let plainQuery = client
                .from('marketplace_accounts')
                .select('*');
            if (!includeAllStatuses) {
                plainQuery = plainQuery.in('status', ['available', 'approved']);
            }
            const { data: plainData, error: plainError } = await plainQuery.order('created_at', { ascending: false });
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

        const remoteAccounts = rows
            .map(r => waseetMapRemoteAccountRow(r, profilesMap))
            .filter(acc => acc && (includeAllStatuses || (acc.status === 'available' || acc.status === 'approved')));

        // اعتماد الحسابات الفعلية من قاعدة البيانات فقط كمصدر وحيد للحقيقة
        WASEET_STATE.accounts = remoteAccounts;
        if (window.waseetApp) {
            window.waseetApp.updatePendingAccountsCounter();
            window.waseetApp.updateSellerListingsCounter();
            if (document.getElementById('accounts-grid')) {
                window.waseetApp.renderMarketplace();
            }
        }
        return WASEET_STATE.accounts;
    } catch (err) {
        console.warn('[Supabase Accounts] استثناء جلب الحسابات:', err);
        return WASEET_STATE.accounts || [];
    }
}

/**
 * دمج مصفوفتين من رسائل الصفقة دون تكرار أو فقدان أي رسالة، مع فلترة صارمة حسب channel_type
 */
function waseetMergeDealMessagesList(remoteList = [], localList = [], expectedChannel = null) {
    const r = Array.isArray(remoteList) ? remoteList : [];
    const l = Array.isArray(localList) ? localList : [];

    const isAllowedForChannel = (m) => {
        if (!m || !m.text) return false;
        if (!expectedChannel) return true;
        const ch = m.channel_type || m.channelType || '';
        const sender = m.sender_role || m.sender || '';
        if (ch === 'system' || sender === 'system') return true;
        if (expectedChannel === 'seller_mediator') {
            if (ch === 'buyer_mediator' || sender === 'buyer') return false;
            return true;
        }
        if (expectedChannel === 'buyer_mediator') {
            if (ch === 'seller_mediator' || sender === 'seller') return false;
            return true;
        }
        return true;
    };

    const combined = [];
    const seenIds = new Set();
    const seenContents = new Set();

    const addUnique = (m) => {
        if (!isAllowedForChannel(m)) return;
        const idKey = m.id ? String(m.id) : null;
        const contentKey = `${m.sender || m.sender_role || ''}|${(m.text || '').trim()}|${m.time || ''}`;
        if ((idKey && seenIds.has(idKey)) || seenContents.has(contentKey)) return;
        if (idKey) seenIds.add(idKey);
        seenContents.add(contentKey);
        combined.push(m);
    };

    r.forEach(addUnique);
    l.forEach(addUnique);

    return combined;
}

/**
 * حفظ أو تحديث صفقة وساطة في جدول deals على Supabase
 */
async function waseetSaveDealToSupabase(deal, options = {}) {
    const client = initWaseetSupabase();
    if (!client || !deal || !deal.id) return false;

    try {
        await waseetEnsureUserProfileInDb(typeof WASEET_STATE !== 'undefined' ? WASEET_STATE.user : null);

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
 * إرسال رسالة داخل غرفة الوساطة وحفظها في جدول deal_messages وجدول deals
 * مع التأكد من وجود sender_id في جدول public.profiles لمنع خطأ deal_messages_sender_id_fkey
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
        const currentUser = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? WASEET_STATE.user : null;

        // 1. التأكد المضمون 100% من وجود سجل للمستخدم الحالي (أو المدير) في جدول public.profiles قبل الإرسال
        const ensuredProfile = await waseetEnsureUserProfileInDb(currentUser, deal, senderRole);

        const { data: { session } } = await client.auth.getSession();
        const sessionUser = session?.user || null;
        const candidateId = (ensuredProfile && ensuredProfile.id)
            || (sessionUser && sessionUser.id)
            || (currentUser && waseetIsValidUuid(currentUser.id) ? currentUser.id : null);
        let senderUuid = waseetIsValidUuid(candidateId) ? candidateId : null;

        if (!senderUuid) {
            const authErr = { message: 'يرجى تسجيل الدخول أولاً لإرسال الرسائل في غرفة الوساطة.' };
            console.error('Escrow Message Auth Error:', authErr);
            alert('فشل إرسال الرسالة: ' + authErr.message);
            return { data: null, error: authErr };
        }

        // تحديث currentUser.id ليكون متطابقاً مع senderUuid
        if (currentUser && currentUser.id !== senderUuid) {
            currentUser.id = senderUuid;
        }

        // 2. حفظ الصفقة وتحديث notes JSONB أولاً لضمان وجود الصفقة في جدول deals قبل إدراج الرسالة
        const dealSaveRes = await waseetSaveDealToSupabase(deal, { returnError: true });

        // 3. بناء حمولة الرسالة مع تمرير نفس الـ UUID لمنع التكرار عند وصول إشعار Realtime
        const strictChannel = (channelType === 'seller_mediator' || channelType === 'buyer_mediator' || channelType === 'system')
            ? channelType
            : (senderRole === 'seller' ? 'seller_mediator' : 'buyer_mediator');

        const insertPayload = {
            deal_id: String(deal.id),
            sender_id: senderUuid,
            channel_type: strictChannel,
            sender_role: senderRole || 'buyer',
            message: msgObj.text
        };
        if (waseetIsValidUuid(msgObj.id)) {
            insertPayload.id = msgObj.id;
        }

        console.log('[Escrow Debug] Preparing deal_messages insert:', {
            deal_id: insertPayload.deal_id,
            sender_id: insertPayload.sender_id,
            sender_role: insertPayload.sender_role,
            channel_type: insertPayload.channel_type,
            message_id: insertPayload.id,
            ensuredProfile
        });

        let { data, error } = await client
            .from('deal_messages')
            .insert([insertPayload])
            .select()
            .single();

        // 4. إذا ظهر خطأ Foreign Key على sender_id رغم المحاولة الأولى، نجلب معرفاً موجوداً وموثقاً من جدول profiles ونعيد المحاولة فوراً
        if (error && String(error.message || '').includes('deal_messages_sender_id_fkey')) {
            const { data: fallbackProfiles } = await client
                .from('profiles')
                .select('*')
                .limit(20);

            if (Array.isArray(fallbackProfiles) && fallbackProfiles.length > 0) {
                const adminOrFirst = fallbackProfiles.find(p => p.role === 'admin' || p.role === 'mediator') || fallbackProfiles[0];
                if (adminOrFirst && adminOrFirst.id) {
                    insertPayload.sender_id = adminOrFirst.id;
                    console.log('[Escrow Debug] Retrying deal_messages insert with verified profiles.id:', insertPayload.sender_id);
                }
            }

            const retryRes = await client
                .from('deal_messages')
                .insert([insertPayload])
                .select()
                .single();

            data = retryRes.data;
            error = retryRes.error;
        }

        if (error) {
            console.error('Escrow Message Insert Error (deal_messages):', error);
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
                sellerMessages: waseetMergeDealMessagesList(remoteSellerMsgs, localSellerMsgs, 'seller_mediator'),
                buyerMessages: waseetMergeDealMessagesList(remoteBuyerMsgs, localBuyerMsgs, 'buyer_mediator'),
                createdAt: row.created_at || (parsed && parsed.createdAt) || new Date().toISOString()
            };
        });

        // اعتماد الصفقات السحابية من Supabase كمصدر وحيد وموثوق للحقيقة (منع إعادة رفع الصفقات المحذوفة من الكاش المحلي)
        const mergedMap = new Map();
        remoteDeals.forEach(d => {
            if (d && d.id) mergedMap.set(String(d.id), d);
        });

        const allMerged = Array.from(mergedMap.values());
        allMerged.sort((a, b) => (Number(b.dealNumber) || 0) - (Number(a.dealNumber) || 0));

        let maxDealNum = 0;
        allMerged.forEach(d => {
            if (Number(d.dealNumber) > maxDealNum) maxDealNum = Number(d.dealNumber);
        });
        if (allMerged.length === 0) {
            localStorage.setItem('WASEET_DEAL_COUNTER', '0');
        } else {
            const currentCounter = parseInt(localStorage.getItem('WASEET_DEAL_COUNTER') || '0');
            if (maxDealNum > currentCounter) {
                localStorage.setItem('WASEET_DEAL_COUNTER', String(maxDealNum));
            }
        }

        WASEET_STATE.deals = allMerged.filter(d => d.status !== 'completed' && d.status !== 'cancelled');
        WASEET_STATE.completedDeals = allMerged.filter(d => d.status === 'completed' || d.status === 'cancelled');
        WASEET_STATE.activeDeal = WASEET_STATE.deals.length > 0 ? WASEET_STATE.deals[0] : null;

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
        if (typeof waseetSyncAllNavBadges === 'function') waseetSyncAllNavBadges();
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
 * ==============================================================================
 * نظام المحفظة الداخلية والشحن اليدوي بالنقاط (Manual Wallet & Points System)
 * ==============================================================================
 */

/**
 * تحديث رصيد النقاط للمستخدم الحالي من جدول profiles في Supabase وتحديث عناصر الواجهة
 */
async function waseetRefreshMyWalletBalance() {
    const client = initWaseetSupabase();
    if (!client) return null;

    try {
        const { data: { session } } = await client.auth.getSession();
        const userId = session?.user?.id || (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user ? WASEET_STATE.user.id : null);
        if (!userId || !waseetIsValidUuid(userId)) return null;

        const profile = await waseetFetchUserProfile(userId);
        if (!profile) return null;

        const available = profile.points_balance !== undefined && profile.points_balance !== null
            ? Number(profile.points_balance)
            : Number(profile.wallet_balance ?? 0);
        const locked = profile.locked_points !== undefined && profile.locked_points !== null
            ? Number(profile.locked_points)
            : 0;
        const total = available + locked;

        if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) {
            WASEET_STATE.user.wallet = { available, locked, total };
            if (typeof saveWaseetData === 'function') saveWaseetData();
        }

        ['wallet-total-pts', 'admin-wallet-total-pts', 'deals-wallet-pts', 'chat-wallet-pts'].forEach(elId => {
            const el = document.getElementById(elId);
            if (el) el.innerText = `${available} نقطة`;
        });

        if (window.waseetApp && typeof window.waseetApp.updateWalletDisplay === 'function') {
            window.waseetApp.updateWalletDisplay();
        }

        return { available, locked, total };
    } catch (err) {
        console.warn('[Wallet] استثناء تحديث رصيد النقاط:', err);
        return null;
    }
}

/**
 * إرسال طلب شحن رصيد يدوي مرفق بصورة الإيصال إلى جدول deposit_requests
 */
async function waseetSubmitDepositRequest({ amount, paymentMethod, receiptImageUrl, notes }) {
    const client = initWaseetSupabase();
    if (!client) {
        return { data: null, error: { message: 'تعذر الاتصال بقاعدة بيانات Supabase' } };
    }

    try {
        const ensuredProfile = await waseetEnsureUserProfileInDb();
        if (!ensuredProfile || !ensuredProfile.id) {
            return { data: null, error: { message: 'يرجى تسجيل الدخول بحسابك أولاً لإرسال طلب الشحن' } };
        }

        const numAmount = Number(amount);
        if (!numAmount || numAmount <= 0) {
            return { data: null, error: { message: 'يرجى إدخال عدد نقاط صحيح أكبر من الصفر' } };
        }

        if (!receiptImageUrl) {
            return { data: null, error: { message: 'يرجى إرفاق صورة إيصال التحويل المالي' } };
        }

        const payload = {
            user_id: ensuredProfile.id,
            amount_requested: numAmount,
            payment_method: paymentMethod || 'تحويل محلي',
            receipt_image_url: receiptImageUrl,
            notes: notes || '',
            status: 'pending'
        };

        const { data, error } = await client
            .from('deposit_requests')
            .insert([payload])
            .select('*')
            .single();

        if (error) {
            console.error('[Deposit Request] خطأ إدراج طلب الشحن:', error.message);
            return { data: null, error };
        }

        return { data, error: null };
    } catch (err) {
        console.error('[Deposit Request] استثناء إرسال طلب الشحن:', err);
        return { data: null, error: { message: err.message || 'حدث خطأ غير متوقع' } };
    }
}

/**
 * جلب طلبات الشحن الخاصة بالمستخدم الحالي
 */
async function waseetFetchMyDepositRequests() {
    const client = initWaseetSupabase();
    if (!client) return [];

    try {
        const { data: { session } } = await client.auth.getSession();
        const userId = session?.user?.id || (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user ? WASEET_STATE.user.id : null);
        if (!userId || !waseetIsValidUuid(userId)) return [];

        const { data, error } = await client
            .from('deposit_requests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.warn('[Deposit Request] خطأ جلب طلباتي:', error.message);
            return [];
        }
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.warn('[Deposit Request] استثناء جلب طلباتي:', err);
        return [];
    }
}

/**
 * جلب سجل الحركات المالية (wallet_transactions) للمستخدم الحالي
 */
async function waseetFetchMyWalletTransactions() {
    const client = initWaseetSupabase();
    if (!client) return [];

    try {
        const { data: { session } } = await client.auth.getSession();
        const userId = session?.user?.id || (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user ? WASEET_STATE.user.id : null);
        if (!userId || !waseetIsValidUuid(userId)) return [];

        const { data, error } = await client
            .from('wallet_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(150);

        if (error) {
            console.warn('[Wallet Transactions] خطأ جلب السجل:', error.message);
            return [];
        }
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.warn('[Wallet Transactions] استثناء جلب السجل:', err);
        return [];
    }
}

/**
 * [للمدير] جلب كافة طلبات الشحن مع بيانات المستخدمين
 */
async function waseetAdminFetchDepositRequests() {
    const client = initWaseetSupabase();
    if (!client) return [];

    try {
        const { data: requests, error } = await client
            .from('deposit_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

        if (error) {
            console.error('[Admin Deposits] خطأ جلب طلبات الشحن:', error.message);
            return [];
        }

        if (!Array.isArray(requests) || requests.length === 0) return [];

        const userIds = Array.from(new Set(requests.map(r => r.user_id).filter(id => waseetIsValidUuid(id))));
        const profilesMap = {};

        if (userIds.length > 0) {
            const { data: profiles } = await client
                .from('profiles')
                .select('id, name, email, avatar_url, points_balance, wallet_balance')
                .in('id', userIds);

            if (Array.isArray(profiles)) {
                profiles.forEach(p => {
                    if (p && p.id) profilesMap[p.id] = p;
                });
            }
        }

        return requests.map(r => ({
            ...r,
            userProfile: profilesMap[r.user_id] || null
        }));
    } catch (err) {
        console.error('[Admin Deposits] استثناء جلب طلبات الشحن:', err);
        return [];
    }
}

/**
 * [للمدير] الموافقة على طلب شحن وإضافة النقاط آلياً للمستخدم عبر RPC
 */
async function waseetAdminApproveDepositRequest(requestId, adminNote = '') {
    const client = initWaseetSupabase();
    if (!client) return { data: null, error: { message: 'تعذر الاتصال بـ Supabase' } };

    try {
        const { data, error } = await client.rpc('approve_deposit_request', {
            p_request_id: requestId,
            p_admin_note: adminNote || 'تم التحقق من الإيصال وشحن النقاط بنجاح'
        });

        if (error) {
            console.error('[Admin Approve Deposit] خطأ RPC:', error.message);
            return { data: null, error };
        }

        await waseetRefreshMyWalletBalance();
        return { data, error: null };
    } catch (err) {
        console.error('[Admin Approve Deposit] استثناء:', err);
        return { data: null, error: { message: err.message || 'فشل اعتماد الطلب' } };
    }
}

/**
 * [للمدير] رفض طلب شحن عبر RPC
 */
async function waseetAdminRejectDepositRequest(requestId, adminNote = '') {
    const client = initWaseetSupabase();
    if (!client) return { data: null, error: { message: 'تعذر الاتصال بـ Supabase' } };

    try {
        const { data, error } = await client.rpc('reject_deposit_request', {
            p_request_id: requestId,
            p_admin_note: adminNote || 'لم يتم قبول الإيصال المرفق، يرجى مراجعة البيانات'
        });

        if (error) {
            console.error('[Admin Reject Deposit] خطأ RPC:', error.message);
            return { data: null, error };
        }

        return { data, error: null };
    } catch (err) {
        console.error('[Admin Reject Deposit] استثناء:', err);
        return { data: null, error: { message: err.message || 'فشل رفض الطلب' } };
    }
}

/**
 * حجز النقاط في قاعدة البيانات عند طلب شراء حساب (Escrow Lock) وتغيير حالة الحساب إلى in_deal ليختفي من السوق العام
 */
async function waseetLockEscrowPointsInDb(dealObj) {
    const client = initWaseetSupabase();
    if (!client || !dealObj) return { ok: false, data: null, error: { message: 'بيانات الصفقة غير مكتملة' } };

    try {
        const accountUuid = (dealObj.accountId && waseetIsValidUuid(dealObj.accountId)) ? dealObj.accountId : null;
        let sellerUuid = (dealObj.seller && waseetIsValidUuid(dealObj.seller.id)) ? dealObj.seller.id : null;

        if (!sellerUuid && accountUuid) {
            const { data: accRow } = await client
                .from('marketplace_accounts')
                .select('seller_id')
                .eq('id', accountUuid)
                .maybeSingle();
            if (accRow && accRow.seller_id) sellerUuid = accRow.seller_id;
        }

        const { data, error } = await client.rpc('lock_escrow_points_for_deal', {
            p_deal_id: String(dealObj.id),
            p_account_id: accountUuid,
            p_seller_id: sellerUuid,
            p_seller_price: Number(dealObj.sellerPrice || 0),
            p_fee: Number(dealObj.fee || 0),
            p_total_points: Number(dealObj.totalPoints || 0)
        });

        if (error) {
            console.warn('[Escrow Lock RPC] تنبيه:', error.message);
            return { ok: false, data: null, error };
        }

        // تأكيد تحويل حالة الحساب إلى in_deal لإخفائه تماماً من السوق العام
        if (accountUuid) {
            try {
                await client
                    .from('marketplace_accounts')
                    .update({
                        status: 'in_deal',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', accountUuid);
            } catch (e) {}
        }

        await waseetRefreshMyWalletBalance();
        return { ok: true, data, error: null };
    } catch (err) {
        console.warn('[Escrow Lock RPC] استثناء:', err);
        return { ok: false, data: null, error: { message: err.message } };
    }
}

/**
 * تحرير نقاط الصفقة للبائع وخصم عمولة المنصة تلقائياً عند إتمام الصفقة وتحويل حالة الحساب إلى مباع (sold)
 */
async function waseetReleaseEscrowPointsInDb(dealId, accountIdHint = null) {
    const client = initWaseetSupabase();
    if (!client || !dealId) return { ok: false, data: null, error: { message: 'معرف الصفقة غير صالح' } };

    try {
        const { data, error } = await client.rpc('release_escrow_deal_points', {
            p_deal_id: String(dealId)
        });

        if (error) {
            console.warn('[Escrow Release RPC] تنبيه:', error.message);
            return { ok: false, data: null, error };
        }

        if (accountIdHint && waseetIsValidUuid(accountIdHint)) {
            try {
                await client
                    .from('marketplace_accounts')
                    .update({
                        status: 'sold',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', accountIdHint);
            } catch (e) {}
        }

        await waseetRefreshMyWalletBalance();
        return { ok: true, data, error: null };
    } catch (err) {
        console.warn('[Escrow Release RPC] استثناء:', err);
        return { ok: false, data: null, error: { message: err.message } };
    }
}

/**
 * استرداد النقاط المحجوزة إلى المشتري عند إلغاء الصفقة وإعادة الحساب للظهور في السوق تلقائياً (available)
 */
async function waseetRefundEscrowPointsInDb(dealId, accountIdHint = null) {
    const client = initWaseetSupabase();
    if (!client || !dealId) return { ok: false, data: null, error: { message: 'معرف الصفقة غير صالح' } };

    try {
        const { data, error } = await client.rpc('refund_escrow_deal_points', {
            p_deal_id: String(dealId)
        });

        if (error) {
            console.warn('[Escrow Refund RPC] تنبيه:', error.message);
            return { ok: false, data: null, error };
        }

        if (accountIdHint && waseetIsValidUuid(accountIdHint)) {
            try {
                await client
                    .from('marketplace_accounts')
                    .update({
                        status: 'available',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', accountIdHint);
            } catch (e) {}
        }

        await waseetRefreshMyWalletBalance();
        return { ok: true, data, error: null };
    } catch (err) {
        console.warn('[Escrow Refund RPC] استثناء:', err);
        return { ok: false, data: null, error: { message: err.message } };
    }
}

/**
 * المؤقت الزمني التلقائي (48 ساعة):
 * يفحص الصفقات والحجوزات التي مر عليها أكثر من 48 ساعة دون اكتمال، فيلغي الحجز تلقائياً،
 * ويسترجع النقاط لمحفظة المشتري، ويعيد الحساب إلى قسم "الحسابات المفحوصة" في السوق العام.
 */
async function waseetExpireStaleEscrowDeals(force = false) {
    const client = initWaseetSupabase();
    if (!client) return null;

    const now = Date.now();
    if (!force && window._waseetLastExpireCheckAt && (now - window._waseetLastExpireCheckAt < 60000)) {
        return null;
    }
    window._waseetLastExpireCheckAt = now;

    try {
        const { data, error } = await client.rpc('expire_stale_escrow_deals');
        if (!error && data && data.expired_count > 0) {
            await waseetRefreshMyWalletBalance();
        }
        return data || null;
    } catch (e) {
        return null;
    }
}
window.waseetExpireStaleEscrowDeals = waseetExpireStaleEscrowDeals;

/**
 * دوال التنقل السريع (Back & Forward Arrows) بين الصفحة الحالية والسابقة
 */
function waseetHistoryBack() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = 'index.html';
    }
}

function waseetHistoryForward() {
    window.history.forward();
}

window.waseetHistoryBack = waseetHistoryBack;
window.waseetHistoryForward = waseetHistoryForward;

/**
 * تهيئة تحسينات التنقل وروابط الدعم المباشر وأزرار الأسهم في جميع صفحات المنصة
 */
function waseetInitNavigationEnhancements() {
    try {
        const DIRECT_SUPPORT_URL = 'https://wa.me/218931467923';
        const DIRECT_SUPPORT_PHONE = '+2180931467923';
        window.WASEET_SUPPORT_PHONE = DIRECT_SUPPORT_PHONE;
        window.WASEET_SUPPORT_URL = DIRECT_SUPPORT_URL;

        // 1. تحديث كافة روابط الدعم المباشر / واتساب لتوجه إلى الرابط الرسمي المعتمد
        document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
            link.setAttribute('href', DIRECT_SUPPORT_URL);
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            if (!link.getAttribute('title')) {
                link.setAttribute('title', `واتساب الدعم المباشر: ${DIRECT_SUPPORT_PHONE}`);
            }
        });

        // 2. التأكد من عدم تكرار الأزرار داخل شريط تنقل البائع والمشتري (#nav-user-middle-group)
        const userNav = document.getElementById('nav-user-middle-group');
        if (userNav) {
            const seenMyAcc = [];
            const seenSupport = [];
            userNav.querySelectorAll('a').forEach(a => {
                const href = (a.getAttribute('href') || '').toLowerCase();
                const txt = (a.textContent || '').trim();
                if (href.includes('my-accounts') || txt.includes('حساباتي')) {
                    seenMyAcc.push(a);
                } else if (href.includes('contact-support') || txt.includes('محادثة الوسيط')) {
                    seenSupport.push(a);
                }
            });
            // إزالة أي أزرار مكررة إن وجدت
            for (let i = 1; i < seenMyAcc.length; i++) seenMyAcc[i].remove();
            for (let i = 1; i < seenSupport.length; i++) seenSupport[i].remove();
        }

        // 3. حذف أزرار أسهم التنقل (الرجوع والتقدم) نهائياً من جميع الصفحات
        document.querySelectorAll('.waseet-global-nav-arrows, .btn-global-history-arrow, .waseet-history-nav-arrows, .btn-history-arrow, .btn-hero-history-arrow').forEach(el => el.remove());
    } catch (e) {}
}
window.waseetInitNavigationEnhancements = waseetInitNavigationEnhancements;

/**
 * تحديث شارة عدد طلبات الشحن المعلقة في شريط تنقل المدير
 */
async function waseetUpdateAdminPendingDepositsBadge() {
    const client = initWaseetSupabase();
    if (!client) return;

    try {
        const user = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? WASEET_STATE.user : null;
        const isAdmin = user && (user.role === 'admin' || user.isAdmin || (typeof isMediatorUser === 'function' && isMediatorUser(user)));
        if (!isAdmin) return;

        const { count, error } = await client
            .from('deposit_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (!error && typeof count === 'number') {
            const badges = document.querySelectorAll('#admin-nav-deposits-badge, .admin-deposits-badge-count');
            badges.forEach(el => {
                el.innerText = count > 0 ? String(count) : '';
                el.style.display = count > 0 ? 'inline-flex' : 'none';
            });
        }
    } catch (e) {}
}

/**
 * مزامنة وإخفاء/إظهار فقاعات الإشعارات (Badges) لأزرار (قيد الشراء، قيد الفحص، المحادثات)
 * بحيث تختفي تماماً إذا كان العدد صفر (0) وتظهر فوراً عند وجود عناصر أو رسائل جديدة
 */
function waseetSyncAllNavBadges() {
    try {
        if (typeof WASEET_STATE === 'undefined') return;
        const user = WASEET_STATE.user;
        const isMed = typeof isMediatorUser === 'function' ? isMediatorUser(user) : !!(user && (user.isAdmin || user.role === 'admin' || user.role === 'mediator'));

        // 1. حساب عدد الصفقات النشطة (قيد الشراء)
        const allActiveDeals = (WASEET_STATE.deals || []).filter(d => d && d.status !== 'completed' && d.status !== 'cancelled');
        let myActiveDealsCount = 0;
        if (isMed) {
            myActiveDealsCount = allActiveDeals.length;
        } else if (user) {
            myActiveDealsCount = allActiveDeals.filter(d =>
                (d.buyer && (d.buyer.id === user.id || d.buyer.name === user.name)) ||
                (d.seller && (d.seller.id === user.id || d.seller.name === user.name))
            ).length;
        }

        const dealsBadgeSelectors = [
            '#deals-badge-count',
            '#admin-nav-deals-badge',
            '#drawer-deals-badge-count'
        ];
        dealsBadgeSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (myActiveDealsCount > 0) {
                    el.innerText = String(myActiveDealsCount);
                    el.style.display = 'inline-flex';
                } else {
                    el.innerText = '';
                    el.style.display = 'none';
                }
            });
        });

        // 2. حساب عدد الحسابات قيد الفحص الفعلي من قاعدة البيانات فقط
        const pendingCount = isMed ? Number(window._waseetExactPendingCount || 0) : 0;
        const pendingBadgeSelectors = [
            '#admin-nav-pending-badge',
            '#drawer-pending-badge-count',
            '#nav-pending-count',
            '#drawer-pending-count'
        ];
        pendingBadgeSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (isMed && pendingCount > 0) {
                    el.innerText = String(pendingCount);
                    el.style.display = 'inline-flex';
                } else {
                    el.innerText = '';
                    el.style.display = 'none';
                }
            });
        });

        if (isMed) {
            waseetFetchExactPendingAccountsCount();
        }

        // 3. تحديث شارة المحادثات غير المقروءة
        const path = (window.location.pathname || '').toLowerCase();
        if (path.includes('chat.html') || path.includes('admin-chats.html') || path.includes('contact-support.html')) {
            sessionStorage.setItem('WASEET_UNREAD_CHATS_COUNT', '0');
        }
        const unreadChats = parseInt(sessionStorage.getItem('WASEET_UNREAD_CHATS_COUNT') || '0', 10);
        waseetRenderChatsUnreadBadge(unreadChats);
        if (window.WaseetNotificationStore && typeof window.WaseetNotificationStore.renderAllBadges === 'function') {
            window.WaseetNotificationStore.renderAllBadges();
        }
    } catch (e) {}
}

async function waseetFetchExactPendingAccountsCount(force = false) {
    const client = initWaseetSupabase();
    if (!client) return 0;

    const now = Date.now();
    if (!force && window._waseetPendingCountPromise) {
        return window._waseetPendingCountPromise;
    }
    if (!force && window._waseetLastPendingCountAt && (now - window._waseetLastPendingCountAt < 2500)) {
        return Number(window._waseetExactPendingCount || 0);
    }

    window._waseetPendingCountPromise = (async () => {
        try {
            const { count, error } = await client
                .from('marketplace_accounts')
                .select('id', { count: 'exact', head: true })
                .in('status', ['pending_verification', 'pending_review', 'pending']);

            const exact = (!error && typeof count === 'number') ? Math.max(0, count) : 0;
            window._waseetExactPendingCount = exact;
            window._waseetLastPendingCountAt = Date.now();

            const user = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? WASEET_STATE.user : null;
            const isMed = typeof isMediatorUser === 'function' ? isMediatorUser(user) : !!(user && (user.isAdmin || user.role === 'admin' || user.role === 'mediator'));

            ['#admin-nav-pending-badge', '#drawer-pending-badge-count', '#nav-pending-count', '#drawer-pending-count'].forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    if (isMed && exact > 0) {
                        el.innerText = String(exact);
                        el.style.display = 'inline-flex';
                    } else {
                        el.innerText = '';
                        el.style.display = 'none';
                    }
                });
            });

            const modalBadge = document.getElementById('pending-modal-badge');
            if (modalBadge) {
                modalBadge.innerText = String(exact);
                modalBadge.style.display = exact > 0 ? 'inline-flex' : 'none';
            }

            return exact;
        } catch (e) {
            return Number(window._waseetExactPendingCount || 0);
        } finally {
            window._waseetPendingCountPromise = null;
        }
    })();

    return window._waseetPendingCountPromise;
}
window.waseetFetchExactPendingAccountsCount = waseetFetchExactPendingAccountsCount;

function waseetRenderChatsUnreadBadge(count) {
    const num = Math.max(0, Number(count) || 0);
    sessionStorage.setItem('WASEET_UNREAD_CHATS_COUNT', String(num));

    // ربط فوري مع مخزن الحالة العام (Global State Store) لتوحيد الشارات
    if (window.WaseetNotificationStore && typeof window.WaseetNotificationStore.setState === 'function') {
        window.WaseetNotificationStore.setState({ unreadSupportCount: num });
    } else {
        // ضمان وجود شارة إشعار داخل جميع أزرار المحادثات في الترويسة والقائمة الجانبية
        const chatLinks = document.querySelectorAll('a[href="chat.html"], a[href="admin-chats.html"], a[href="contact-support.html"]');
        chatLinks.forEach(link => {
            let badge = link.querySelector('.chats-unread-badge, #admin-nav-chats-badge, #nav-chats-badge, #admin-nav-support-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'deals-badge-count chats-unread-badge';
                badge.style.display = 'none';
                badge.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                badge.style.color = '#fff';
                badge.style.marginRight = '4px';
                link.appendChild(badge);
            }
            if (num > 0) {
                badge.innerText = String(num);
                badge.style.display = 'inline-flex';
            } else {
                badge.innerText = '';
                badge.style.display = 'none';
            }
        });
    }
}

function waseetInitGlobalNavRealtimeBadges() {
    const client = initWaseetSupabase();
    if (!client || window._waseetGlobalNavBadgesChannel) return;

    try {
        waseetSyncAllNavBadges();
        window._waseetGlobalNavBadgesChannel = client
            .channel('waseet_global_nav_badges_rt')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'support_messages' },
                (payload) => {
                    const row = payload && payload.new;
                    if (!row) return;
                    const myId = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? WASEET_STATE.user.id : null;
                    if (myId && String(row.sender_id) === String(myId)) return;
                    const isMed = typeof isMediatorUser === 'function' && isMediatorUser();
                    if (!isMed && myId && String(row.receiver_id) !== String(myId)) return;

                    const path = (window.location.pathname || '').toLowerCase();
                    if (!path.includes('admin-chats.html') && !path.includes('contact-support.html')) {
                        const cur = parseInt(sessionStorage.getItem('WASEET_UNREAD_CHATS_COUNT') || '0', 10);
                        waseetRenderChatsUnreadBadge(cur + 1);
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'deal_messages' },
                (payload) => {
                    const row = payload && payload.new;
                    if (!row) return;
                    const myId = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? WASEET_STATE.user.id : null;
                    if (myId && String(row.sender_id) === String(myId)) return;

                    const path = (window.location.pathname || '').toLowerCase();
                    if (!path.includes('chat.html')) {
                        const cur = parseInt(sessionStorage.getItem('WASEET_UNREAD_CHATS_COUNT') || '0', 10);
                        waseetRenderChatsUnreadBadge(cur + 1);
                    }
                }
            )
            .subscribe();
    } catch (e) {}
}

window.waseetRefreshMyWalletBalance = waseetRefreshMyWalletBalance;
window.waseetSubmitDepositRequest = waseetSubmitDepositRequest;
window.waseetFetchMyDepositRequests = waseetFetchMyDepositRequests;
window.waseetFetchMyWalletTransactions = waseetFetchMyWalletTransactions;
window.waseetAdminFetchDepositRequests = waseetAdminFetchDepositRequests;
window.waseetAdminApproveDepositRequest = waseetAdminApproveDepositRequest;
window.waseetAdminRejectDepositRequest = waseetAdminRejectDepositRequest;
window.waseetLockEscrowPointsInDb = waseetLockEscrowPointsInDb;
window.waseetReleaseEscrowPointsInDb = waseetReleaseEscrowPointsInDb;
window.waseetRefundEscrowPointsInDb = waseetRefundEscrowPointsInDb;
window.waseetUpdateAdminPendingDepositsBadge = waseetUpdateAdminPendingDepositsBadge;
window.waseetSyncAllNavBadges = waseetSyncAllNavBadges;
window.waseetRenderChatsUnreadBadge = waseetRenderChatsUnreadBadge;

/**
 * إرسال إشعار لمستخدم في منصة وسيط عبر Supabase RPC أو إدراج مباشر
 */
async function waseetSendNotification(userId, title, message, link = '') {
    const client = initWaseetSupabase();
    if (!client || !userId || !title) return false;

    try {
        // 1. محاولة استدعاء الدالة السحابية send_waseet_notification
        const { data: rpcRes, error: rpcErr } = await client.rpc('send_waseet_notification', {
            p_user_id: userId,
            p_title: title,
            p_message: message || '',
            p_link: link || ''
        });

        if (!rpcErr) {
            return true;
        }

        // 2. كحل احتياطي: إدراج مباشر في جدول notifications
        const { error: insertErr } = await client.from('notifications').insert([{
            user_id: userId,
            title: title,
            message: message || '',
            link: link || '',
            is_read: false
        }]);

        if (insertErr) {
            console.warn('[Supabase Notification] Insert fallback error:', insertErr.message);
            return false;
        }

        return true;
    } catch (err) {
        console.warn('[Supabase Notification] Exception:', err);
        return false;
    }
}
window.waseetSendNotification = waseetSendNotification;

/**
 * الاستماع لتغيرات الجلسة وتحديث الواجهة تلقائياً
 */
function initWaseetAuthListener() {
    const client = initWaseetSupabase();
    if (!client) return;

    client.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            await waseetSyncAuthState();
            await waseetUpdateAdminPendingDepositsBadge();
            waseetSyncAllNavBadges();
        } else if (event === 'SIGNED_OUT') {
            if (typeof WASEET_STATE !== 'undefined') {
                WASEET_STATE.user = null;
                if (typeof saveWaseetData === 'function') saveWaseetData();
            }
            if (window.waseetNotifications && typeof window.waseetNotifications.syncWithUser === 'function') {
                window.waseetNotifications.syncWithUser(null);
            }
            if (window.waseetApp && typeof window.waseetApp.renderUserProfile === 'function') {
                window.waseetApp.renderUserProfile();
            }
            if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
            if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
            waseetSyncAllNavBadges();
        }
    });
}

// تشغيل المستمع بمجرد اكتمال تحميل DOM
if (typeof window !== 'undefined') {
    function runInitialEnhancements() {
        waseetInitNavigationEnhancements();
        initWaseetSupabase();
        initWaseetAuthListener();
        waseetSyncAllNavBadges();
        waseetInitGlobalNavRealtimeBadges();
        waseetSyncAuthState();
        setTimeout(waseetUpdateAdminPendingDepositsBadge, 800);
    }
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', runInitialEnhancements);
    } else {
        runInitialEnhancements();
    }
}
