/**
 * WASEET (وسيط) - المرحلة الأولى: تكامل المصادقة مع Supabase Auth & Google OAuth
 * يتعامل حصرياً مع تسجيل الدخول وجلب الملف الشخصي (Profile) المطبق عليه سياسات RLS الصارمة.
 */

const WASEET_DEFAULT_SUPABASE_URL = 'https://vjhcvvewbqeiigrjtydu.supabase.co';

function waseetValidateSupabaseOrigin(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return WASEET_DEFAULT_SUPABASE_URL;
    const cleaned = rawUrl.trim().replace(/\/+$/, '');
    if (/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cleaned)) {
        return cleaned;
    }
    return WASEET_DEFAULT_SUPABASE_URL;
}

const WASEET_SUPABASE_CONFIG = {
    // المفتاح العام المعتمد والآمن للمتصفح
    publishableKey: 'sb_publishable_UEvEqB66XyoQscufdRq06A_3CR2SEqn',
    // رابط مشروع Supabase المعتمد مع التحقق الصارم من النطاق
    projectUrl: waseetValidateSupabaseOrigin(localStorage.getItem('WASEET_SUPABASE_URL'))
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
    if (!url || typeof url !== 'string') return false;
    const cleaned = url.trim().replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cleaned)) {
        console.warn('[Supabase Security] تم رفض رابط غير موثوق خارج نطاق supabase.co');
        return false;
    }
    WASEET_SUPABASE_CONFIG.projectUrl = cleaned;
    localStorage.setItem('WASEET_SUPABASE_URL', cleaned);
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
async function waseetSignInWithGoogle(options = {}) {
    console.log('[Supabase Auth] waseetSignInWithGoogle invoked');
    const client = initWaseetSupabase();
    const returnUrl = (options && options.redirectTo)
        ? options.redirectTo
        : ((typeof window !== 'undefined' && window.location) ? window.location.href.split('#')[0] : '');

    if (!client || !client.auth) {
        console.warn('[Supabase Auth] Supabase client not ready, trying fallback to waseetAuth...');
        if (typeof window.waseetAuth !== 'undefined' && typeof window.waseetAuth.initiateGoogleLogin === 'function') {
            return await window.waseetAuth.initiateGoogleLogin({ redirect: true });
        }
        alert('تعذر تهيئة اتصال Supabase، يرجى إعادة المحاولة.');
        return false;
    }

    try {
        console.log('[Supabase Auth] Starting signInWithOAuth for Google with redirectTo:', returnUrl);
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: returnUrl || window.location.origin,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'select_account'
                }
            }
        });

        if (error) {
            console.error('[Supabase Auth] خطأ تسجيل الدخول عبر Google:', error.message);
            if (typeof window.waseetAuth !== 'undefined' && typeof window.waseetAuth.initiateGoogleLogin === 'function') {
                return await window.waseetAuth.initiateGoogleLogin({ redirect: true });
            }
            if (typeof waseetAlert === 'function') {
                waseetAlert('خطأ في تسجيل الدخول', error.message, 'danger');
            } else {
                alert('خطأ في تسجيل الدخول: ' + error.message);
            }
            return false;
        }

        if (data && data.url) {
            console.log('[Supabase Auth] Redirecting browser to Google OAuth URL:', data.url);
            window.location.href = data.url;
        }
        return true;
    } catch (err) {
        console.error('[Supabase Auth] استثناء تسجيل الدخول:', err);
        if (typeof window.waseetAuth !== 'undefined' && typeof window.waseetAuth.initiateGoogleLogin === 'function') {
            return await window.waseetAuth.initiateGoogleLogin({ redirect: true });
        }
        return false;
    }
}

window.waseetSignInWithGoogle = waseetSignInWithGoogle;
window.signInWithOAuth = waseetSignInWithGoogle;

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

window.waseetSignOut = waseetSignOut;

function enrichProfileWithBrokerStatus(profileRecord, extraSources = {}) {
    if (!profileRecord) return null;
    const userRow = extraSources.userRow || null;
    const brokerRow = extraSources.brokerRow || null;

    const rawAvatar = String(profileRecord.avatar_url || (userRow && userRow.avatar_url) || '').trim();
    const match = rawAvatar.match(/#waseet_broker=([A-Za-z]{2,6})/i);
    const cleanAvatar = rawAvatar.replace(/#waseet_broker=[A-Za-z]{2,6}/gi, '') || profileRecord.avatar_url || '';
    const avatarTagCountry = match ? match[1].toUpperCase() : '';

    const emailLower = String(profileRecord.email || (userRow && userRow.email) || '').toLowerCase().trim();
    let cachedMatch = null;
    try {
        const cachedList = typeof getCachedRegionalBrokersList === 'function'
            ? getCachedRegionalBrokersList()
            : JSON.parse(localStorage.getItem('WASEET_REGIONAL_BROKERS_CACHE') || '[]');
        if (Array.isArray(cachedList)) {
            cachedMatch = cachedList.find(b =>
                b && b.is_active !== false && (
                    (b.id && profileRecord.id && String(b.id) === String(profileRecord.id)) ||
                    (b.email && emailLower && String(b.email).toLowerCase().trim() === emailLower)
                )
            );
        }
    } catch (e) {}

    const dbRole = String(profileRecord.role || '').toLowerCase().trim();
    const altUserRole = String((userRow && userRow.role) || '').toLowerCase().trim();
    const explicitDemotedInDb = (dbRole === 'user' && (!userRow || altUserRole === 'user') && !brokerRow && !match);

    const isAdminRole = dbRole === 'admin' || dbRole === 'mediator' ||
        altUserRole === 'admin' || altUserRole === 'mediator' ||
        profileRecord.is_admin === true || (userRow && userRow.is_admin === true) ||
        ['fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com'].includes(emailLower);

    const isBroker = !isAdminRole && dbRole !== 'user' && (
        dbRole === 'broker' ||
        dbRole === 'regional_broker' ||
        altUserRole === 'broker' ||
        altUserRole === 'regional_broker' ||
        profileRecord.is_broker === true ||
        (userRow && userRow.is_broker === true) ||
        Boolean(brokerRow && brokerRow.is_active !== false) ||
        Boolean(match) ||
        (!explicitDemotedInDb && Boolean(cachedMatch))
    );

    if (isAdminRole) {
        return {
            ...profileRecord,
            avatar_url: cleanAvatar,
            role: 'admin',
            isAdmin: true,
            isBroker: false
        };
    }

    if (isBroker) {
        // الأولوية القصوى لوسم الوسيط الإقليمي في avatar_url أو كاش الوسطاء، لأن عمود profiles.country بقاعدة البيانات له قيمة افتراضية صلبة 'DZ'
        const resolvedCountry = String(
            avatarTagCountry ||
            (cachedMatch && cachedMatch.country) ||
            (brokerRow && brokerRow.country) ||
            (profileRecord.country && profileRecord.country !== 'DZ' ? profileRecord.country : '') ||
            (userRow && userRow.country && userRow.country !== 'DZ' ? userRow.country : '') ||
            profileRecord.country ||
            'DZ'
        ).toUpperCase().trim();

        return {
            ...profileRecord,
            avatar_url: cleanAvatar,
            role: 'regional_broker',
            brokerRole: 'broker',
            isBroker: true,
            country: resolvedCountry
        };
    }

    return {
        ...profileRecord,
        avatar_url: cleanAvatar,
        role: dbRole || 'user',
        isBroker: false
    };
}

/**
 * جلب بيانات ملف المستخدم من جدول profiles و users و regional_brokers لضمان انعكاس الترقية فوراً
 */
async function waseetFetchUserProfile(userId, userEmail = null) {
    const client = initWaseetSupabase();
    if (!client || (!userId && !userEmail)) return null;

    try {
        const cleanEmail = userEmail ? String(userEmail).toLowerCase().trim() : '';

        // جلب متوازٍ من الجداول الثلاثة لضمان التقاط أي ترقية في قاعدة البيانات فوراً
        const [profByIdRes, userTableRes, rbTableRes] = await Promise.allSettled([
            userId
                ? client.from('profiles').select('*').eq('id', userId).maybeSingle()
                : Promise.resolve({ data: null, error: null }),
            userId
                ? client.from('users').select('*').eq('id', userId).maybeSingle()
                : (cleanEmail ? client.from('users').select('*').ilike('email', cleanEmail).maybeSingle() : Promise.resolve({ data: null, error: null })),
            cleanEmail
                ? client.from('regional_brokers').select('*').ilike('email', cleanEmail).maybeSingle()
                : (userId ? client.from('regional_brokers').select('*').eq('id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }))
        ]);

        let profileRow = (profByIdRes.status === 'fulfilled' && profByIdRes.value && !profByIdRes.value.error)
            ? profByIdRes.value.data
            : null;

        // إذا لم يُعثر عليه بالـ ID وتوفر البريد الإلكتروني، نبحث بالبريد في جدول profiles
        if (!profileRow && cleanEmail) {
            try {
                const { data: profByEmail, error: emailErr } = await client
                    .from('profiles')
                    .select('*')
                    .ilike('email', cleanEmail)
                    .maybeSingle();
                if (!emailErr && profByEmail) {
                    profileRow = profByEmail;
                }
            } catch (e) {}
        }

        let userRow = (userTableRes.status === 'fulfilled' && userTableRes.value && !userTableRes.value.error)
            ? userTableRes.value.data
            : null;
        if (!userRow && cleanEmail && userId) {
            try {
                const { data: uByEmail, error: uErr } = await client
                    .from('users')
                    .select('*')
                    .ilike('email', cleanEmail)
                    .maybeSingle();
                if (!uErr && uByEmail) userRow = uByEmail;
            } catch (e) {}
        }

        let brokerRow = (rbTableRes.status === 'fulfilled' && rbTableRes.value && !rbTableRes.value.error)
            ? rbTableRes.value.data
            : null;

        const baseRecord = profileRow || userRow || (brokerRow ? {
            id: userId || brokerRow.id,
            email: cleanEmail || brokerRow.email,
            name: brokerRow.name || (cleanEmail ? cleanEmail.split('@')[0] : 'وسيط معتمد'),
            avatar_url: brokerRow.avatar_url || '',
            role: 'regional_broker',
            country: brokerRow.country || 'DZ',
            wallet_balance: Number(brokerRow.wallet_balance || 0),
            points_balance: Number(brokerRow.points_balance || 0)
        } : null);

        if (baseRecord) {
            return enrichProfileWithBrokerStatus(baseRecord, { userRow, brokerRow });
        }

        return null;
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
 * تطبيق تحديث الرتبة والصلاحيات فوراً على جميع عناصر الواجهة في الصفحة الحالية دون الحاجة لإعادة التحميل أو تسجيل الخروج
 */
function waseetApplyLiveRoleUpdateToUI(user) {
    try {
        const isAdmin = !!(user && (
            user.role === 'admin' ||
            (typeof isStrictAdmin === 'function' ? isStrictAdmin(user) : (user.isAdmin === true || user.is_admin === true))
        ) && user.role !== 'regional_broker' && user.role !== 'broker' && user.role !== 'user');

        const isBroker = !isAdmin && !!(user && (
            user.role === 'regional_broker' ||
            user.role === 'broker' ||
            user.isBroker === true ||
            user.brokerRole === 'broker' ||
            (typeof isRegionalBroker === 'function' && isRegionalBroker(user))
        ));

        if (document.body) {
            document.body.classList.toggle('is-admin-mode', isAdmin);
            document.body.classList.toggle('is-broker-mode', isBroker);
        }

        // تحديث مجموعات الشريط العلوي (Navbar Middle Groups) في جميع الصفحات
        const userNavMiddle = document.getElementById('nav-user-middle-group');
        const adminNavMiddle = document.getElementById('nav-admin-middle-group');
        const defaultWalletPill = document.getElementById('wallet-pill-btn');
        const adminWalletPill = document.getElementById('admin-wallet-pill');

        // للمدير العام فقط تظهر مجموعة أزرار الإدارة (#nav-admin-middle-group)
        // للوسيط الإقليمي والمشترين والبائعين والزوار: يظل الشريط العلوي موحداً كلياً (#nav-user-middle-group)
        if (isAdmin) {
            if (userNavMiddle) userNavMiddle.style.display = 'none';
            if (adminNavMiddle) adminNavMiddle.style.display = 'flex';
            if (defaultWalletPill && window.innerWidth > 900) defaultWalletPill.style.display = 'none';
            if (adminWalletPill) adminWalletPill.style.display = 'inline-flex';

            document.querySelectorAll('.btn-nav-admin, [data-admin-only]').forEach(el => {
                el.style.display = el.classList.contains('btn-nav-middle') ? 'inline-flex' : '';
            });
        } else {
            // شريط علوي موحد بالكامل كباقي المستخدمين
            if (userNavMiddle) userNavMiddle.style.display = 'flex';
            if (adminNavMiddle) adminNavMiddle.style.display = 'none';
            if (defaultWalletPill) defaultWalletPill.style.display = user ? 'inline-flex' : 'none';
            if (adminWalletPill) adminWalletPill.style.display = 'none';

            document.querySelectorAll('.btn-nav-admin, [data-admin-only]').forEach(el => {
                el.style.display = 'none';
            });
        }

        // دمج أزرار الإشراف في الشريط العلوي الأساسي الموحد (Navbar Unification)
        if (typeof window.waseetRenderUnifiedBrokerNavLinks === 'function') {
            window.waseetRenderUnifiedBrokerNavLinks(user);
        } else if (typeof window.waseetRenderBrokerSupervisionBanner === 'function') {
            window.waseetRenderBrokerSupervisionBanner(user);
        } else {
            const existingSubBar = document.getElementById('waseet-broker-supervision-bar');
            if (existingSubBar) existingSubBar.remove();
        }

        // تحديث روابط القائمة الجانبية للمدير والوسيط
        const drawerAdminChats = document.getElementById('drawer-admin-chats-link');
        if (drawerAdminChats) drawerAdminChats.style.setProperty('display', (isAdmin || isBroker) ? 'flex' : 'none', 'important');
        const drawerPendingBtn = document.getElementById('drawer-btn-pending-verification');
        if (drawerPendingBtn) drawerPendingBtn.style.setProperty('display', (isAdmin || isBroker) ? 'flex' : 'none', 'important');
        const drawerAdminBrokers = document.getElementById('drawer-admin-brokers-link');
        if (drawerAdminBrokers) drawerAdminBrokers.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');
        const drawerAdminDeposits = document.getElementById('drawer-admin-deposits-link');
        if (drawerAdminDeposits) drawerAdminDeposits.style.setProperty('display', (isAdmin || isBroker) ? 'flex' : 'none', 'important');
        const drawerAdminWithdrawals = document.getElementById('drawer-admin-withdrawals-link');
        if (drawerAdminWithdrawals) drawerAdminWithdrawals.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');

        // استدعاء دوال التحديث الخاصة بكل صفحة
        if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
        if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
        if (typeof renderNavbarUser === 'function') renderNavbarUser();
        if (typeof renderMyAccountsNavbarUser === 'function') renderMyAccountsNavbarUser();
        if (typeof window.waseetRefreshDrawerExtras === 'function') window.waseetRefreshDrawerExtras();
        if (typeof waseetSyncAllNavBadges === 'function') waseetSyncAllNavBadges();

        if (window.waseetApp) {
            if (typeof window.waseetApp.renderUserProfile === 'function') {
                window.waseetApp.renderUserProfile();
            }
            if (typeof window.waseetApp.updateMobileDrawer === 'function') {
                window.waseetApp.updateMobileDrawer();
            }
            if (typeof window.waseetApp.updateWalletDisplay === 'function') {
                window.waseetApp.updateWalletDisplay();
            }
            if (typeof window.waseetApp.loadStoreRegionalBrokers === 'function') {
                window.waseetApp.loadStoreRegionalBrokers();
            }
        }

        if (typeof renderDealsView === 'function') renderDealsView();
        if (typeof loadPendingAccounts === 'function') loadPendingAccounts();
        if ((isAdmin || isBroker) && window.escrowRoom && typeof window.escrowRoom.setViewerRole === 'function') {
            window.escrowRoom.setViewerRole('mediator');
        }
    } catch (uiErr) {
        console.warn('[Session Refresh] UI update warning:', uiErr);
    }
}
window.waseetApplyLiveRoleUpdateToUI = waseetApplyLiveRoleUpdateToUI;

/**
 * إشعار مرئي فوري عند ترقية المستخدم إلى وسيط في قاعدة البيانات أثناء تصفحه للمتجر
 */
function waseetShowRoleUpgradeToast(user, isExplicitPromotion = false) {
    try {
        if (!user || typeof document === 'undefined') return;

        // حماية صارمة: استبعاد المستخدمين العاديين والبائعين والمشترين نهائياً من هذا الإشعار (False Positive Guard)
        const isActuallyBroker = user.role === 'regional_broker' || (user.isBroker === true && user.role !== 'user');
        const isActuallyAdmin = user.role === 'admin' || user.isAdmin === true;
        if (!isActuallyBroker && !isActuallyAdmin) return;
        if (user.role === 'user' || user.role === 'buyer' || user.role === 'seller') return;

        // لا يظهر الإشعار إلا عند استلام حدث ترقية صريح ومؤكد من لوحة الإدارة
        if (!isExplicitPromotion) return;

        const toastKey = 'waseet_upgrade_toast_shown_' + (user.id || user.email || 'user') + '_' + (user.role || 'broker');
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(toastKey)) {
            return; // تم عرضه مسبقاً في هذه الجلسة — منع التكرار المزعج
        }
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(toastKey, 'true');
        }

        const existing = document.getElementById('waseet-role-upgrade-toast');
        if (existing) existing.remove();

        const isBroker = user.role === 'regional_broker' || user.isBroker === true;
        const roleTitle = isBroker
            ? `وسيط إقليمي معتمد (${user.country || 'DZ'})`
            : 'الوسيط المعتمد (إدارة المنصة)';

        const toast = document.createElement('div');
        toast.id = 'waseet-role-upgrade-toast';
        toast.style.cssText = 'position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:10040;background:linear-gradient(135deg, rgba(16,185,129,0.96), rgba(13,20,33,0.98));border:1px solid #34d399;border-radius:14px;padding:0.75rem 1.15rem;color:#fff;box-shadow:0 18px 45px rgba(0,0,0,0.65);display:flex;align-items:center;gap:0.75rem;max-width:92vw;font-family:inherit;direction:rtl;';
        toast.innerHTML = `
            <i class="fas fa-user-shield" style="font-size:1.4rem;color:#fde047;"></i>
            <div style="flex:1;">
                <div style="font-weight:800;font-size:0.9rem;color:#fff;">🎉 تم تحديث جلستك وترقية رتبتك تلقائياً!</div>
                <div style="font-size:0.78rem;color:#d1fae5;margin-top:2px;">أنت الآن <strong>${roleTitle}</strong> — تم تفعيل جميع أدوات الوساطة فوراً.</div>
            </div>
            <button type="button" onclick="this.closest('#waseet-role-upgrade-toast').remove()" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;opacity:0.8;padding:0 4px;margin-right:4px;" title="إغلاق">&times;</button>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast && toast.parentNode) toast.remove();
        }, 4000);
    } catch (e) {}
}

/**
 * مزامنة حالة الجلسة الحالية وتحديث المتغير العام WASEET_STATE تلقائياً
 */
async function waseetSyncAuthState(options = {}) {
    const client = initWaseetSupabase();
    if (!client) return;

    const forceSync = !!(options && options.force);
    const shouldRefreshToken = !!(options && options.refreshToken);
    let session = (options && options.session) || null;

    if (window._waseetSyncAuthInFlight) {
        if (!forceSync) return window._waseetSyncAuthInFlight;
        try { await window._waseetSyncAuthInFlight; } catch (e) {}
    }

    window._waseetSyncAuthInFlight = (async () => {
    try {
        // 1. معالجة فورية لاستقبال OAuth Callback إذا كان هناك كود تفويض (code) في الرابط
        if (!session && typeof window !== 'undefined' && window.location) {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const authCode = urlParams.get('code');
                if (authCode && client.auth && typeof client.auth.exchangeCodeForSession === 'function') {
                    console.log('[Supabase Auth] Exchanging OAuth authorization code from callback URL...');
                    const { data: codeData, error: codeErr } = await client.auth.exchangeCodeForSession(authCode);
                    if (!codeErr && codeData && codeData.session) {
                        session = codeData.session;
                        console.log('[Supabase Auth] OAuth code successfully exchanged for session:', session.user?.email);
                    } else if (codeErr) {
                        console.warn('[Supabase Auth] exchangeCodeForSession returned error:', codeErr.message);
                    }
                }
            } catch (ce) {
                console.warn('[Supabase Auth] OAuth code exchange exception:', ce);
            }
        }

        // 2. إذا لم تتوفر الجلسة بعد، نجلبها مباشرة عبر getSession
        if (!session) {
            try {
                const { data: sessionData, error: gsError } = await client.auth.getSession();
                if (!gsError && sessionData && sessionData.session) {
                    session = sessionData.session;
                } else if (gsError) {
                    console.warn('[Supabase Auth] getSession error:', gsError.message);
                }
            } catch (gsEx) {
                console.warn('[Supabase Auth] getSession exception:', gsEx);
            }
        }

        // 3. إذا طُلب تحديث التوكن وكانت هناك جلسة نشطة بالفعل (دون محاولة التحديث على جلسة فارغة)
        if (shouldRefreshToken && session) {
            try {
                const { data: refreshedData } = await client.auth.refreshSession();
                if (refreshedData && refreshedData.session) {
                    session = refreshedData.session;
                }
            } catch (rfErr) {}
        }

        const isOAuthCallbackPending = typeof window !== 'undefined' && window.location && (
            (window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('refresh_token='))) ||
            (window.location.search && window.location.search.includes('code='))
        );

        if (!session || !session.user) {
            // إذا كان المتصفح عائداً من OAuth والرابط يحتوي توكن أو كود، لا نمسح الجلسة بل ننتظر اكتمال معالجة المستمع
            if (isOAuthCallbackPending) {
                console.log('[Supabase Auth] OAuth callback pending in URL, awaiting onAuthStateChange event...');
                return;
            }
            WASEET_STATE.user = null;
            try { localStorage.removeItem('WASEET_SAVED_USER_PERMANENT'); } catch (e) {}
            waseetApplyLiveRoleUpdateToUI(null);
            if (typeof window.updateAuthUI === 'function') {
                try { window.updateAuthUI(null); } catch (e) {}
            }
            return;
        }

        // تنظيف الرابط من كود وتوكنات OAuth الحساسة بعد استلام الجلسة بنجاح
        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
            try {
                if (window.location.hash && window.location.hash.includes('access_token=')) {
                    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
                }
                if (window.location.search && window.location.search.includes('code=')) {
                    const cleanSearch = window.location.search.replace(/[?&]code=[^&]+/, '').replace(/^[?&]/, '?');
                    window.history.replaceState({}, document.title, window.location.pathname + (cleanSearch === '?' ? '' : cleanSearch));
                }
            } catch (histErr) {}
        }

        // جلب أحدث بيانات المستخدم من خادم Auth إن أمكن لضمان التقاط أي تحديث في user_metadata / app_metadata
        let authUser = session.user;
        if (forceSync || shouldRefreshToken) {
            try {
                const { data: freshUserRes } = await client.auth.getUser();
                if (freshUserRes && freshUserRes.user) {
                    authUser = freshUserRes.user;
                }
            } catch (guErr) {}
        }

        const prevUser = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? { ...WASEET_STATE.user } : null;

        // 2. جلب الوسطاء الإقليميين وملف المستخدم من قاعدة البيانات بالتوازي قبل حساب الرتبة!
        const [profileRes] = await Promise.allSettled([
            waseetFetchUserProfile(authUser.id, authUser.email),
            typeof waseetFetchRegionalBrokers === 'function' ? waseetFetchRegionalBrokers() : Promise.resolve()
        ]);

        let profile = (profileRes.status === 'fulfilled') ? profileRes.value : null;

        // 2.1 مزامنة بيانات Google (الاسم والصورة) مع جدول public.profiles تلقائياً وتحديث الجدول عند وجود أي تغيير
        const googleName = String(authUser.user_metadata?.full_name || authUser.user_metadata?.name || '').trim();
        const googleAvatar = String(authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || '').trim();

        if (client && authUser.id && (googleName || googleAvatar)) {
            const currentDbName = String(profile?.name || '').trim();
            const currentDbAvatar = String(profile?.avatar_url || '').trim();

            const nameChanged = Boolean(googleName && googleName !== currentDbName);
            const avatarChanged = Boolean(googleAvatar && googleAvatar !== currentDbAvatar);

            if (nameChanged || avatarChanged) {
                console.log('[Google Auth Sync] Updating public.profiles with fresh Google credentials:', {
                    nameChanged, avatarChanged, googleName, googleAvatar
                });
                try {
                    const updatePayload = {};
                    if (nameChanged) updatePayload.name = googleName;
                    if (avatarChanged) updatePayload.avatar_url = googleAvatar;
                    updatePayload.updated_at = new Date().toISOString();

                    const { error: updErr } = await client
                        .from('profiles')
                        .update(updatePayload)
                        .eq('id', authUser.id);

                    if (!updErr) {
                        console.log('[Google Auth Sync] Successfully updated profiles table from Google metadata');
                        if (profile) {
                            if (updatePayload.name) profile.name = updatePayload.name;
                            if (updatePayload.avatar_url) profile.avatar_url = updatePayload.avatar_url;
                        }
                    } else {
                        console.warn('[Google Auth Sync] Warning updating profiles table:', updErr.message);
                    }
                } catch (syncEx) {
                    console.warn('[Google Auth Sync] Exception during sync:', syncEx);
                }
            }
        }

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
        const metaRole = String(authUser.app_metadata?.role || authUser.user_metadata?.role || '').toLowerCase().trim();
        const profRole = String((profile && profile.role) || '').toLowerCase().trim();

        const isAdmin = !!(
            profRole === 'admin' ||
            profRole === 'mediator' ||
            metaRole === 'admin' ||
            metaRole === 'mediator' ||
            (profile && profile.isAdmin === true) ||
            emailLower === 'fgkano63@gmail.com' ||
            emailLower === 'saadani2009@gmail.com' ||
            emailLower === 'mediator@waseet.com'
        );

        let cachedBrokerEntry = null;
        try {
            const cachedList = typeof getCachedRegionalBrokersList === 'function'
                ? getCachedRegionalBrokersList()
                : JSON.parse(localStorage.getItem('WASEET_REGIONAL_BROKERS_CACHE') || '[]');
            if (Array.isArray(cachedList)) {
                cachedBrokerEntry = cachedList.find(b =>
                    b && b.is_active !== false && (
                        (b.id && authUser.id && String(b.id) === String(authUser.id)) ||
                        (b.email && emailLower && String(b.email).toLowerCase().trim() === emailLower)
                    )
                );
            }
        } catch (e) {}

        const explicitRegularUserInDb = (profRole === 'user' && metaRole !== 'broker' && metaRole !== 'regional_broker' && !(profile && profile.isBroker));

        const isBroker = !isAdmin && !!(
            (profRole === 'regional_broker' ||
            profRole === 'broker' ||
            metaRole === 'regional_broker' ||
            metaRole === 'broker' ||
            (profile && profile.isBroker === true) ||
            (!explicitRegularUserInDb && cachedBrokerEntry)) && profRole !== 'user'
        );

        const userRole = isAdmin
            ? 'admin'
            : (isBroker ? 'regional_broker' : (profRole || 'user'));

        const avatarMeta = parseBrokerAvatarMeta(profile?.avatar_url || authUser.user_metadata?.avatar_url);
        const userCountry = String(
            avatarMeta.countryCode ||
            (cachedBrokerEntry && cachedBrokerEntry.country) ||
            (profile && profile.country && profile.country !== 'DZ' ? profile.country : '') ||
            authUser.user_metadata?.country ||
            (profile && profile.country) ||
            'DZ'
        ).toUpperCase().trim();

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
            brokerRole: isBroker ? 'broker' : null,
            isBroker: isBroker,
            country: userCountry,
            isAdmin: isAdmin,
            provider: 'supabase_google',
            wallet: {
                available: rawAvail,
                locked: rawLocked,
                total: rawAvail + rawLocked
            }
        };

        const prevWasStaff = !!(prevUser && (prevUser.isAdmin || prevUser.isBroker || prevUser.role === 'admin' || prevUser.role === 'mediator' || prevUser.role === 'regional_broker' || prevUser.role === 'broker'));
        const nowIsStaff = !!(isAdmin || isBroker);
        const roleChanged = !!(prevUser && String(prevUser.id) === String(mappedUser.id) && (
            prevUser.role !== mappedUser.role ||
            Boolean(prevUser.isAdmin) !== Boolean(mappedUser.isAdmin) ||
            Boolean(prevUser.isBroker) !== Boolean(mappedUser.isBroker) ||
            String(prevUser.country || '') !== String(mappedUser.country || '')
        ));

        if (typeof WASEET_STATE !== 'undefined') {
            WASEET_STATE.user = mappedUser;
            if (typeof saveWaseetData === 'function') saveWaseetData();
        }

        // إذا تغيرت رتبة المستخدم في قاعدة البيانات، ننعش توكن الجلسة في الخلفية ونعرض إشعار الترقية الفوري
        if (roleChanged) {
            console.log(`[Session Refresh] User role updated automatically: ${prevUser.role} -> ${mappedUser.role}`);
            if (!shouldRefreshToken) {
                try { client.auth.refreshSession(); } catch (e) {}
            }
            if (!prevWasStaff && nowIsStaff && mappedUser.role !== 'user') {
                waseetShowRoleUpgradeToast(mappedUser, true);
            }
            try {
                window.dispatchEvent(new CustomEvent('waseet:role-updated', {
                    detail: { user: mappedUser, previousRole: prevUser.role, newRole: mappedUser.role }
                }));
            } catch (e) {}
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

        // تطبيق الرتبة والأدوات على الواجهة فوراً قبل انتظار الجلب الشبكي المطول
        waseetApplyLiveRoleUpdateToUI(mappedUser);

        // جلب ومزامنة جميع الصفقات والحسابات من قاعدة بيانات Supabase بالتوازي
        if (!options || !options.profileOnly) {
            await Promise.allSettled([
                waseetFetchAccountsFromSupabase(),
                waseetFetchDealsFromSupabase()
            ]);
        }

        // تحديث عناصر الواجهة النهائية بعد جلب الحسابات والصفقات
        waseetApplyLiveRoleUpdateToUI(mappedUser);
        if (typeof window.updateAuthUI === 'function') {
            try { window.updateAuthUI(mappedUser); } catch (uErr) {}
        } else if (typeof window.updateUI === 'function') {
            try { window.updateUI(mappedUser); } catch (uErr) {}
        }
        if (window.waseetApp && typeof window.waseetApp.renderMarketplace === 'function' && (!options || !options.profileOnly)) {
            window.waseetApp.renderMarketplace();
        }
        if (typeof loadMyAccountsData === 'function' && (!options || !options.profileOnly)) {
            loadMyAccountsData();
        }
        return mappedUser;
    } catch (err) {
        console.warn('[Supabase Auth] استثناء مزامنة الجلسة:', err);
    } finally {
        window._waseetSyncAuthInFlight = null;
    }
    })();
    return window._waseetSyncAuthInFlight;
}

window.waseetSyncAuthState = waseetSyncAuthState;
window.waseetRefreshUserSession = () => waseetSyncAuthState({ force: true, refreshToken: true });

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
            sellerAvatar: account.sellerAvatar || (sessionUser && (sessionUser.avatar || sessionUser.avatar_url)) || '',
            evoGunsCount: Number(account.evoGunsCount || 0),
            evoGuns: account.evoGuns || [],
            rareSkins: account.rareSkins || [],
            iconicPants: account.iconicPants || [],
            accountNotes: account.accountNotes || '',
            notes: account.accountNotes || '',
            badge: account.badge || '',
            reviewStatus: account.reviewStatus || (dbStatus === 'available' ? 'approved' : 'pending'),
            rejectionReason: account.rejectionReason || '',
            // أمني: حماية بيانات الدخول وعدم تخزين كلمة المرور داخل details لمنع تسريبها في السوق العام
            credentials: {
                email_or_phone: credsObj.email_or_phone || '',
                has_password: !!(credsObj.password && credsObj.password !== '••••••••')
            }
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

            // أمني: حفظ بيانات الدخول الحساسة في الجدول المنعزل والمحمي حصراً عبر RPC الآمن
            if (credsObj && (credsObj.password || credsObj.email_or_phone)) {
                try {
                    await client.rpc('save_account_credentials_secure', {
                        p_account_id: resultRow.id,
                        p_email_or_phone: credsObj.email_or_phone || '',
                        p_password: credsObj.password || '',
                        p_recovery_email: credsObj.recovery_email || '',
                        p_recovery_password: credsObj.recovery_password || '',
                        p_notes: detailsObj.accountNotes || ''
                    });
                } catch (rpcErr) {
                    console.warn('[Credentials Secure Save] تنبيه:', rpcErr);
                }
            }

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
    const fallbackSellerAvatar = '';
    const rawSellerAvatar = (profileObj && (profileObj.avatar_url || profileObj.avatar))
        || details.sellerAvatar
        || details.seller_avatar
        || acc.seller_avatar
        || acc.sellerAvatar
        || (acc.seller && (acc.seller.avatar_url || acc.seller.avatar))
        || fallbackSellerAvatar;
    const sellerAvatar = (rawSellerAvatar && !String(rawSellerAvatar).includes('photo-1535713875002-d1d0cf377fde'))
        ? rawSellerAvatar
        : '';
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
        sellerAvatar: sellerAvatar,
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
 * جلب بيانات الدخول الحساسة وكلمة المرور المشفرة حصرياً عبر Secure RPC للمصرح لهم (الوسيط / البائع / المشتري)
 */
async function waseetGetAccountCredentialsSecure(accountId) {
    const client = initWaseetSupabase();
    if (!client || !accountId) return null;
    try {
        const { data, error } = await client.rpc('get_account_credentials_secure', {
            p_account_id: accountId
        });
        if (error) {
            console.warn('[Secure Credentials RPC] تنبيه:', error.message);
            return null;
        }
        return data;
    } catch (e) {
        console.warn('[Secure Credentials RPC] استثناء:', e);
        return null;
    }
}
window.waseetGetAccountCredentialsSecure = waseetGetAccountCredentialsSecure;

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

        // جلب الحسابات الفعلية فقط من Supabase مع انتقاء الأعمدة العامة لحماية البيانات الحساسة
        const publicColumns = 'id, account_number, seller_id, buyer_id, game, title, level, prime_level, login_type, bind_status, server, seller_price, images, details, status, created_at, updated_at';
        let rows = null;
        let joinQuery = client
            .from('marketplace_accounts')
            .select(`${publicColumns}, profiles(id, name, email, avatar_url)`);
        if (!includeAllStatuses) {
            joinQuery = joinQuery.in('status', ['available', 'approved']);
        }
        const { data: joinData, error: joinError } = await joinQuery.order('created_at', { ascending: false });

        if (!joinError && Array.isArray(joinData)) {
            rows = joinData;
        } else {
            let plainQuery = client
                .from('marketplace_accounts')
                .select(publicColumns);
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
 * مزامنة وتصحيح الرصيد المحجوز (Escrow & Withdrawals) وإعادة أي فائض معلق للمتاح
 */
async function waseetSyncWalletLockedPoints() {
    const client = initWaseetSupabase();
    if (!client) return { ok: false, message: 'تعذر الاتصال بالسحابة' };

    try {
        const { data, error } = await client.rpc('sync_wallet_locked_points');
        if (error) {
            console.warn('[Sync Locked Points RPC Warn]', error.message || error);
            // Fallback محلي إذا لم تكن دالة RPC مثبتة بعد في Supabase
            if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user && WASEET_STATE.user.wallet) {
                const user = WASEET_STATE.user;
                const activeDeals = (WASEET_STATE.deals || []).filter(d => d && d.status !== 'completed' && d.status !== 'cancelled');
                let dealsLocked = 0;
                activeDeals.forEach(d => {
                    const isBuyer = (user.id && (String(d.buyer_id) === String(user.id) || (d.buyer && String(d.buyer.id) === String(user.id)))) ||
                                    (user.name && d.buyer && d.buyer.name === user.name);
                    if (isBuyer) {
                        dealsLocked += Number(d.totalPoints || d.total_points || 0);
                    }
                });

                let withdrawalsLocked = 0;
                if (typeof waseetFetchMyWithdrawals === 'function') {
                    try {
                        const myW = await waseetFetchMyWithdrawals();
                        if (Array.isArray(myW)) {
                            withdrawalsLocked = myW
                                .filter(w => w && w.status === 'pending')
                                .reduce((sum, w) => sum + Number(w.amount || 0), 0);
                        }
                    } catch (we) {}
                }

                const realLocked = dealsLocked + withdrawalsLocked;
                const oldLocked = Number(user.wallet.locked || 0);
                const orphan = Math.max(0, oldLocked - realLocked);
                user.wallet.locked = realLocked;
                user.wallet.available = Number(user.wallet.available || 0) + orphan;
                user.wallet.total = user.wallet.available + user.wallet.locked;
                if (typeof saveWaseetData === 'function') saveWaseetData();
                return {
                    ok: true,
                    data: {
                        orphan_released: orphan,
                        new_locked: realLocked,
                        deals_locked: dealsLocked,
                        withdrawals_locked: withdrawalsLocked,
                        new_available: user.wallet.available
                    }
                };
            }
            return { ok: false, error };
        }
        await waseetRefreshMyWalletBalance();
        return { ok: true, data };
    } catch (err) {
        console.error('[Sync Locked Points Exception]', err);
        return { ok: false, message: err.message };
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
                .select('id, name, email, avatar_url, points_balance, wallet_balance, country')
                .in('id', userIds);

            if (Array.isArray(profiles)) {
                profiles.forEach(p => {
                    if (p && p.id) profilesMap[p.id] = p;
                });
            }
        }

        let mapped = requests.map(r => ({
            ...r,
            userProfile: profilesMap[r.user_id] || null
        }));

        // تصفية البيانات للوسيط الإقليمي: يرى فقط طلبات الشحن الخاصة بدولته أو الموجهة له
        // أما المدير العام فيرى كافة الطلبات من جميع الدول بدون تصفية
        const currentUser = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? WASEET_STATE.user : null;
        const isAdmin = !!(currentUser && (
            currentUser.role === 'admin' ||
            (typeof isStrictAdmin === 'function' ? isStrictAdmin(currentUser) : (currentUser.isAdmin === true || currentUser.is_admin === true))
        ) && currentUser.role !== 'regional_broker' && currentUser.role !== 'broker' && currentUser.role !== 'user');
        const isBroker = !isAdmin && !!(currentUser && (
            currentUser.role === 'regional_broker' ||
            currentUser.role === 'broker' ||
            currentUser.isBroker === true ||
            (typeof isRegionalBroker === 'function' && isRegionalBroker(currentUser))
        ));

        if (isBroker && !isAdmin) {
            const brokerCountry = (currentUser && currentUser.country) ? String(currentUser.country).toUpperCase().trim() : 'DZ';
            mapped = mapped.filter(r => {
                if (r.assigned_broker_id && currentUser && r.assigned_broker_id === currentUser.id) return true;
                const uCountry = r.userProfile && r.userProfile.country ? String(r.userProfile.country).toUpperCase().trim() : '';
                if (uCountry && uCountry === brokerCountry) return true;
                const reqCountry = r.country ? String(r.country).toUpperCase().trim() : '';
                if (reqCountry && reqCountry === brokerCountry) return true;
                const pMethod = String(r.payment_method || '').toUpperCase();
                const pNotes = String(r.notes || '').toUpperCase();
                if (pMethod.includes(brokerCountry) || pNotes.includes(brokerCountry)) return true;
                if (brokerCountry === 'DZ' && (pMethod.includes('بريدي') || pMethod.includes('BARIDIMOB') || pMethod.includes('CCP') || pMethod.includes('الجزائر'))) return true;
                if (brokerCountry === 'EG' && (pMethod.includes('فودافون') || pMethod.includes('VODAFONE') || pMethod.includes('INSTAPAY') || pMethod.includes('إنستاباي') || pMethod.includes('مصر'))) return true;
                if (brokerCountry === 'SA' && (pMethod.includes('STC') || pMethod.includes('راجحي') || pMethod.includes('السعودية'))) return true;
                if (brokerCountry === 'LY' && (pMethod.includes('تداول') || pMethod.includes('سداد') || pMethod.includes('ليبيا'))) return true;
                return false;
            });
        }

        return mapped;
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
 * ==============================================================================
 * نظام سحب الرصيد والنقاط (Withdrawals System)
 * ==============================================================================
 */

/**
 * إرسال طلب سحب رصيد وتجميد النقاط ذرياً عبر Supabase RPC (أو fallback)
 */
async function waseetSubmitWithdrawalRequest({ amount, method, details }) {
    const client = initWaseetSupabase();
    if (!client) {
        return { data: null, error: { message: 'تعذر الاتصال بقاعدة بيانات Supabase' } };
    }

    try {
        const ensuredProfile = await waseetEnsureUserProfileInDb();
        if (!ensuredProfile || !ensuredProfile.id) {
            return { data: null, error: { message: 'يرجى تسجيل الدخول بحسابك أولاً لتقديم طلب السحب' } };
        }

        const numAmount = Number(amount);
        if (!numAmount || numAmount <= 0) {
            return { data: null, error: { message: 'يرجى إدخال مبلغ صحيح أكبر من الصفر' } };
        }

        const cleanDetails = (details || '').trim();
        if (!cleanDetails) {
            return { data: null, error: { message: 'يرجى كتابة بيانات الحساب المالي أو المحفظة للاستلام' } };
        }

        const cleanMethod = (method || 'تحويل بنكي').trim();

        // فحص محلي أولي للرصيد المتاح لتجربة مستخدم سريعة
        const totalPts = Number(ensuredProfile.points_balance || ensuredProfile.wallet_balance || 0);
        const lockedPts = Number(ensuredProfile.locked_points || 0);
        const availablePts = Math.max(0, totalPts - lockedPts);

        if (availablePts < numAmount) {
            return {
                data: null,
                error: {
                    message: `عذراً، الرصيد المتاح القابل للسحب (${availablePts} نقطة) غير كافٍ لتغطية المبلغ المطلوب (${numAmount} نقطة).`
                }
            };
        }

        // استدعاء دالة RPC الذرية المؤمّنة (Atomic Request & Freeze)
        const { data: rpcData, error: rpcError } = await client.rpc('request_withdrawal', {
            p_amount: numAmount,
            p_method: cleanMethod,
            p_details: cleanDetails
        });

        if (!rpcError && rpcData) {
            await waseetRefreshMyWalletBalance();
            return { data: rpcData, error: null };
        }

        // إذا كان الخطأ ناتجاً عن شروط دالة RPC (نقص رصيد، شروط أمنية)، نعيد الخطأ مباشرة دون محاولة الإدراج المباشر المحظور بالميجريشن 20
        const isRpcMissing = rpcError && (rpcError.code === '42883' || (rpcError.message?.includes('function') && rpcError.message?.includes('does not exist')));
        if (!isRpcMissing) {
            console.warn('[Withdrawal Request] رفض طلب السحب من دالة RPC:', rpcError?.message);
            return { data: null, error: rpcError };
        }

        // في حال عدم توفر دالة RPC في قواعد البيانات القديمة فقط، استخدام الإدراج المباشر مع Fallback
        console.warn('[Withdrawal Request] دالة RPC غير موجودة، محاولة الإدراج المباشر كبديل:', rpcError?.message);

        const payload = {
            user_id: ensuredProfile.id,
            amount: numAmount,
            method: cleanMethod,
            details: cleanDetails,
            status: 'pending'
        };

        const { data: insertData, error: insertError } = await client
            .from('withdrawals')
            .insert([payload])
            .select('*')
            .single();

        if (insertError) {
            console.error('[Withdrawal Request] خطأ الإدراج في withdrawals:', insertError.message);
            return { data: null, error: insertError };
        }

        // تحديث محلي في الذاكرة لتجميد النقاط
        if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) {
            WASEET_STATE.user.locked_points = (WASEET_STATE.user.locked_points || 0) + numAmount;
            if (typeof saveWaseetData === 'function') saveWaseetData();
        }

        await waseetRefreshMyWalletBalance();
        return { data: insertData, error: null };
    } catch (err) {
        console.error('[Withdrawal Request] استثناء أثناء تقديم طلب السحب:', err);
        return { data: null, error: { message: err.message || 'حدث خطأ غير متوقع أثناء إرسال طلب السحب' } };
    }
}

/**
 * جلب طلبات السحب الخاصة بالمستخدم الحالي
 */
async function waseetFetchMyWithdrawals() {
    const client = initWaseetSupabase();
    if (!client) return [];

    try {
        const { data: { session } } = await client.auth.getSession();
        const userId = session?.user?.id || (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user ? WASEET_STATE.user.id : null);
        if (!userId || !waseetIsValidUuid(userId)) return [];

        const { data, error } = await client
            .from('withdrawals')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.warn('[Withdrawals] خطأ جلب طلباتي:', error.message);
            return [];
        }
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.warn('[Withdrawals] استثناء جلب طلباتي:', err);
        return [];
    }
}

/**
 * [للمدير] جلب كافة طلبات السحب مع بيانات أصحابها
 */
async function waseetAdminFetchWithdrawals() {
    const client = initWaseetSupabase();
    if (!client) return [];

    try {
        const { data: requests, error } = await client
            .from('withdrawals')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

        if (error) {
            console.error('[Admin Withdrawals] خطأ جلب طلبات السحب:', error.message);
            return [];
        }

        if (!Array.isArray(requests) || requests.length === 0) return [];

        const userIds = Array.from(new Set(requests.map(r => r.user_id).filter(id => waseetIsValidUuid(id))));
        const profilesMap = {};

        if (userIds.length > 0) {
            const { data: profiles } = await client
                .from('profiles')
                .select('id, name, email, avatar_url, points_balance, wallet_balance, locked_points')
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
        console.error('[Admin Withdrawals] استثناء جلب طلبات السحب:', err);
        return [];
    }
}

/**
 * [للمدير] اعتماد طلب سحب رصيد وخصم النقاط نهائياً
 */
async function waseetAdminApproveWithdrawal(requestId, adminNote = '') {
    const client = initWaseetSupabase();
    if (!client) return { data: null, error: { message: 'تعذر الاتصال بـ Supabase' } };

    try {
        const { data, error } = await client.rpc('approve_withdrawal_request', {
            p_request_id: requestId,
            p_admin_note: adminNote || 'تم تحويل المبلغ المالي واعتماد السحب بنجاح'
        });

        if (error) {
            console.error('[Admin Approve Withdrawal] خطأ RPC:', error.message);
            return { data: null, error };
        }

        await waseetRefreshMyWalletBalance();
        await waseetUpdateAdminPendingWithdrawalsBadge();
        return { data, error: null };
    } catch (err) {
        console.error('[Admin Approve Withdrawal] استثناء:', err);
        return { data: null, error: { message: err.message || 'فشل اعتماد طلب السحب' } };
    }
}

/**
 * [للمدير] رفض طلب سحب رصيد وفك تجميد النقاط لتعود للمستخدم
 */
async function waseetAdminRejectWithdrawal(requestId, adminNote = '') {
    const client = initWaseetSupabase();
    if (!client) return { data: null, error: { message: 'تعذر الاتصال بـ Supabase' } };

    try {
        const { data, error } = await client.rpc('reject_withdrawal_request', {
            p_request_id: requestId,
            p_admin_note: adminNote || 'تم رفض طلب السحب وإعادة النقاط للمحفظة'
        });

        if (error) {
            console.error('[Admin Reject Withdrawal] خطأ RPC:', error.message);
            return { data: null, error };
        }

        await waseetRefreshMyWalletBalance();
        await waseetUpdateAdminPendingWithdrawalsBadge();
        return { data, error: null };
    } catch (err) {
        console.error('[Admin Reject Withdrawal] استثناء:', err);
        return { data: null, error: { message: err.message || 'فشل رفض طلب السحب' } };
    }
}

/**
 * تحديث شارة عدد طلبات السحب المعلقة في شريط التنقل للمدير
 */
async function waseetUpdateAdminPendingWithdrawalsBadge() {
    const client = initWaseetSupabase();
    if (!client) return;

    try {
        const user = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) ? WASEET_STATE.user : null;
        const isAdmin = user && (user.role === 'admin' || user.isAdmin || (typeof isMediatorUser === 'function' ? isMediatorUser(user) : false));
        if (!isAdmin) return;

        const { count, error } = await client
            .from('withdrawals')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (!error && typeof count === 'number') {
            const badges = document.querySelectorAll('#admin-nav-withdrawals-badge, .admin-withdrawals-badge-count');
            badges.forEach(el => {
                el.innerText = count > 0 ? String(count) : '';
                el.style.display = count > 0 ? 'inline-flex' : 'none';
            });
        }
    } catch (e) {}
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

        if (data && data.assigned_broker_id) {
            dealObj.assigned_broker_id = data.assigned_broker_id;
            dealObj.assignedBrokerId = data.assigned_broker_id;
            if (data.broker_info && data.broker_info.found) {
                dealObj.assignedBroker = data.broker_info;
                dealObj.mediator = {
                    id: data.broker_info.id,
                    name: `${data.broker_info.name || 'الوسيط الإقليمي'} (${data.broker_info.country || 'معتمد'})`,
                    country: data.broker_info.country
                };
            }
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
async function waseetReleaseEscrowPointsInDb(dealId, accountIdHint = null, dealObjHint = null) {
    const client = initWaseetSupabase();
    if (!client || !dealId) return { ok: false, data: null, error: { message: 'معرف الصفقة غير صالح' } };

    let buyerId = (dealObjHint && (dealObjHint.buyerId || (dealObjHint.buyer && dealObjHint.buyer.id))) || null;
    let sellerId = (dealObjHint && (dealObjHint.sellerId || (dealObjHint.seller && dealObjHint.seller.id))) || null;
    let sellerPrice = Number(dealObjHint?.sellerPrice || 0);
    let fee = Number(dealObjHint?.fee || 0);
    let totalPoints = Number(dealObjHint?.totalPoints || (sellerPrice + fee));

    try {
        const { data, error } = await client.rpc('release_escrow_deal_points', {
            p_deal_id: String(dealId)
        });

        if (error) {
            console.warn('[Escrow Release RPC] خطأ RPC، جاري تنفيذ المعاملة البديلة المباشرة:', error.message);

            // استرجاع بيانات الصفقة إذا لم تكن ممررة
            if (!buyerId || !sellerId) {
                try {
                    const { data: dbDeal } = await client.from('deals').select('*').eq('id', String(dealId)).maybeSingle();
                    if (dbDeal) {
                        buyerId = buyerId || dbDeal.buyer_id;
                        sellerId = sellerId || dbDeal.seller_id;
                        sellerPrice = sellerPrice || Number(dbDeal.seller_price || 0);
                        fee = fee || Number(dbDeal.fee || 0);
                        totalPoints = totalPoints || Number(dbDeal.total_points || (sellerPrice + fee));
                        accountIdHint = accountIdHint || dbDeal.account_id;
                    }
                } catch (e) {}
            }

            // 1. خصم النقاط المحجوزة من محفظة المشتري
            if (buyerId && waseetIsValidUuid(buyerId)) {
                try {
                    const { data: bProf } = await client.from('profiles').select('locked_points').eq('id', buyerId).maybeSingle();
                    if (bProf) {
                        const newLocked = Math.max(0, (Number(bProf.locked_points) || 0) - totalPoints);
                        await client.from('profiles').update({ locked_points: newLocked, updated_at: new Date().toISOString() }).eq('id', buyerId);
                    }
                } catch (bErr) { console.warn('[Escrow Release Fallback] خطأ خصم المشتري:', bErr); }
            }

            // 2. إيداع حصة البائع في محفظته
            if (sellerId && waseetIsValidUuid(sellerId) && sellerPrice > 0) {
                try {
                    const { data: sProf } = await client.from('profiles').select('points_balance').eq('id', sellerId).maybeSingle();
                    if (sProf) {
                        const newBal = (Number(sProf.points_balance) || 0) + sellerPrice;
                        await client.from('profiles').update({ points_balance: newBal, wallet_balance: newBal, updated_at: new Date().toISOString() }).eq('id', sellerId);
                        await client.from('wallet_transactions').insert({
                            user_id: sellerId,
                            deal_id: String(dealId),
                            amount: sellerPrice,
                            balance_after: newBal,
                            type: 'payout',
                            status: 'completed',
                            description: `استلام أرباح بيع حساب (صفقة #${dealId})`
                        });
                    }
                } catch (sErr) { console.warn('[Escrow Release Fallback] خطأ إيداع البائع:', sErr); }
            }

            // 3. التوزيع المالي الذكي للعمولة (Commission Splitting)
            if (fee > 0) {
                try {
                    let brokerId = (dealObjHint && (dealObjHint.assigned_broker_id || dealObjHint.assignedBrokerId)) || null;
                    if (!brokerId && typeof dbDeal !== 'undefined' && dbDeal) brokerId = dbDeal.assigned_broker_id;

                    const { data: admins } = await client.from('profiles').select('id, points_balance').in('role', ['admin', 'mediator']).limit(1);
                    const adminRow = (admins && admins.length) ? admins[0] : null;

                    if (brokerId && waseetIsValidUuid(brokerId) && (!adminRow || String(brokerId) !== String(adminRow.id))) {
                        // تقسيم 66% للوسيط الإقليمي و 34% لأرباح المنصة
                        const brokerFee = Math.floor(fee * (2 / 3));
                        const adminFee = fee - brokerFee;

                        // 1. إيداع حصة الوسيط الإقليمي
                        if (brokerFee > 0) {
                            const { data: bProf } = await client.from('profiles').select('points_balance').eq('id', brokerId).maybeSingle();
                            const newBrokBal = ((bProf && Number(bProf.points_balance)) || 0) + brokerFee;
                            await client.from('profiles').update({ points_balance: newBrokBal, wallet_balance: newBrokBal, updated_at: new Date().toISOString() }).eq('id', brokerId);
                            await client.from('wallet_transactions').insert({
                                user_id: brokerId,
                                deal_id: String(dealId),
                                amount: brokerFee,
                                balance_after: newBrokBal,
                                type: 'broker_commission',
                                status: 'completed',
                                description: `عمولة وساطة إقليمية من الصفقة #${dealId} (نسبة 66%)`
                            });
                        }

                        // 2. إيداع حصة المدير العام / المنصة
                        if (adminRow && adminFee > 0) {
                            const newAdminBal = (Number(adminRow.points_balance) || 0) + adminFee;
                            await client.from('profiles').update({ points_balance: newAdminBal, wallet_balance: newAdminBal, updated_at: new Date().toISOString() }).eq('id', adminRow.id);
                            await client.from('wallet_transactions').insert({
                                user_id: adminRow.id,
                                deal_id: String(dealId),
                                amount: adminFee,
                                balance_after: newAdminBal,
                                type: 'admin_commission',
                                status: 'completed',
                                description: `أرباح المنصة / عمولة الإدارة من الصفقة #${dealId} (نسبة 34%)`
                            });
                        }
                    } else if (adminRow) {
                        // لا يوجد وسيط إقليمي منفصل، تحصيل كامل العمولة للمنصة
                        const newAdminBal = (Number(adminRow.points_balance) || 0) + fee;
                        await client.from('profiles').update({ points_balance: newAdminBal, wallet_balance: newAdminBal, updated_at: new Date().toISOString() }).eq('id', adminRow.id);
                        await client.from('wallet_transactions').insert({
                            user_id: adminRow.id,
                            deal_id: String(dealId),
                            amount: fee,
                            balance_after: newAdminBal,
                            type: 'admin_commission',
                            status: 'completed',
                            description: `عمولة وساطة من صفقة #${dealId}`
                        });
                    }
                } catch (aErr) { console.warn('[Escrow Release Fallback] خطأ توزيع العمولة:', aErr); }
            }

            // 4. تحديث حالة الصفقة إلى مكتملة
            try {
                await client.from('deals').update({ status: 'completed', current_step: 4, updated_at: new Date().toISOString() }).eq('id', String(dealId));
            } catch (dErr) {}
        }

        // 5. نقل ملكية الحساب وحالته إلى sold وتعيين owner_id و buyer_id
        if (accountIdHint && waseetIsValidUuid(accountIdHint)) {
            try {
                const updatePayload = {
                    status: 'sold',
                    updated_at: new Date().toISOString()
                };
                if (buyerId && waseetIsValidUuid(buyerId)) {
                    updatePayload.buyer_id = buyerId;
                    updatePayload.owner_id = buyerId;
                }
                await client
                    .from('marketplace_accounts')
                    .update(updatePayload)
                    .eq('id', accountIdHint);
            } catch (e) {
                console.warn('[Escrow Release] تنبيه تحديث مالك الحساب:', e);
            }
        }

        await waseetRefreshMyWalletBalance();
        return { ok: true, data: data || { success: true }, error: null };
    } catch (err) {
        console.warn('[Escrow Release RPC] استثناء:', err);
        return { ok: false, data: null, error: { message: err.message } };
    }
}

/**
 * استرداد النقاط المحجوزة إلى المشتري عند إلغاء الصفقة وإعادة الحساب للظهور في السوق تلقائياً (available)
 */
async function waseetRefundEscrowPointsInDb(dealId, accountIdHint = null, reason = null) {
    const client = initWaseetSupabase();
    if (!client || !dealId) return { ok: false, data: null, error: { message: 'معرف الصفقة غير صالح' } };

    try {
        let rpcRes = await client.rpc('cancel_escrow_deal', {
            p_deal_id: String(dealId),
            p_reason: reason || 'تم إلغاء الصفقة واسترداد كامل النقاط'
        });

        if (rpcRes && rpcRes.error) {
            // Fallback to refund_escrow_deal_points (Migration 21)
            rpcRes = await client.rpc('refund_escrow_deal_points', {
                p_deal_id: String(dealId)
            });
        }

        if (rpcRes && rpcRes.error) {
            console.warn('[Escrow Refund RPC] تنبيه:', rpcRes.error.message);
            return { ok: false, data: null, error: rpcRes.error };
        }

        const data = rpcRes ? rpcRes.data : null;

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
window.waseetSyncWalletLockedPoints = waseetSyncWalletLockedPoints;
window.waseetSubmitDepositRequest = waseetSubmitDepositRequest;
window.waseetFetchMyDepositRequests = waseetFetchMyDepositRequests;
window.waseetFetchMyWalletTransactions = waseetFetchMyWalletTransactions;
window.waseetAdminFetchDepositRequests = waseetAdminFetchDepositRequests;
window.waseetAdminApproveDepositRequest = waseetAdminApproveDepositRequest;
window.waseetAdminRejectDepositRequest = waseetAdminRejectDepositRequest;
window.waseetLockEscrowPointsInDb = waseetLockEscrowPointsInDb;
window.waseetReleaseEscrowPointsInDb = waseetReleaseEscrowPointsInDb;
window.waseetRefundEscrowPointsInDb = waseetRefundEscrowPointsInDb;
window.waseetCancelEscrowDealInDb = waseetRefundEscrowPointsInDb;
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
/**
 * إنشاء صفقة وساطة مباشرة وحجز النقاط من متجر الملف الشخصي للبائع أو السوق
 */
async function waseetCreateEscrowDealOnSupabase(params) {
    if (!params || !params.account_id) return null;

    let dealCounter = parseInt(localStorage.getItem('WASEET_DEAL_COUNTER') || '0') + 1;
    const existingDeals = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.deals) ? WASEET_STATE.deals : [];
    const completedDeals = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.completedDeals) ? WASEET_STATE.completedDeals : [];
    const maxExistingNum = Math.max(
        1,
        ...existingDeals.map(d => Number(d.dealNumber) || 0),
        ...completedDeals.map(d => Number(d.dealNumber) || 0)
    );
    if (dealCounter <= maxExistingNum) dealCounter = maxExistingNum + 1;
    localStorage.setItem('WASEET_DEAL_COUNTER', String(dealCounter));

    const currentUser = (typeof WASEET_STATE !== 'undefined') ? WASEET_STATE.user : null;
    const buyerName = currentUser?.name || 'مشتري معتمد';
    const buyerCountry = currentUser?.country || 'DZ';

    // التوجيه الذكي للوسيط الإقليمي (Smart Routing)
    let assignedBroker = null;
    if (client) {
        try {
            const { data: brokerRpc } = await client.rpc('get_regional_broker_for_country', {
                p_country: buyerCountry
            });
            if (brokerRpc && brokerRpc.found) {
                assignedBroker = brokerRpc;
            }
        } catch (e) {}
    }
    if (!assignedBroker && typeof WASEET_STATE !== 'undefined' && Array.isArray(WASEET_STATE.brokers)) {
        assignedBroker = WASEET_STATE.brokers.find(b => b.country === buyerCountry) || WASEET_STATE.brokers[0] || null;
    }

    const assignedBrokerId = assignedBroker ? assignedBroker.id : null;
    const mediatorTitle = assignedBroker
        ? `${assignedBroker.name || 'الوسيط الإقليمي'} (${assignedBroker.country || buyerCountry})`
        : 'الوسيط المعتمد';

    const newDeal = {
        id: 'deal_' + Date.now(),
        dealNumber: dealCounter,
        title: `صفقة رقم ${dealCounter} • ${params.account_title || 'حساب مميز'}`,
        accountId: params.account_id,
        accountTitle: params.account_title || 'حساب مميز',
        assigned_broker_id: assignedBrokerId,
        assignedBrokerId: assignedBrokerId,
        assignedBroker: assignedBroker,
        buyer: { id: params.buyer_id || currentUser?.id, name: buyerName, phone: '+212 60 *** ***', country: buyerCountry },
        seller: { id: params.seller_id || ('seller_' + params.account_id), name: 'بائع معتمد', phone: '+213 55 *** ***' },
        mediator: { id: assignedBrokerId || 'admin_waseet', name: mediatorTitle, country: assignedBroker?.country || 'DZ' },
        sellerPrice: Number(params.seller_amount || 0),
        fee: Number(params.fee_amount || 0),
        totalPoints: Number(params.total_amount || 0),
        currentStep: 2,
        status: 'active',
        createdAt: new Date().toISOString(),
        stageText: 'المرحلة 2: نقل الملكية للمشتري وتأمين الحساب (الحساب مفحوص ومعتمد)',
        credentials: {
            email: 'buyer_' + Date.now() + '@gmail.com',
            password: '•••••••••••• (محمية ومطابقة)',
            rawPassword: '••••••••••••',
            loginType: 'جوجل Gmail',
            backupCodes: 'لا توجد أكواد إضافية'
        },
        sellerMessages: [
            { sender: 'system', text: `قام المشتري ${buyerName} بحجز ${params.total_amount} نقطة لشراء الحساب المفحوص والمعتمد.`, time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) },
            { sender: 'mediator', name: 'الوسيط المعتمد', text: 'مرحباً بك في غرفة الوساطة الآمنة. هل ترغب في البيع؟', quickReplyRole: 'seller', quickReplies: ['نعم', 'لا', 'غير متأكد'], time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) }
        ],
        buyerMessages: [
            { sender: 'system', text: `تم حجز ${params.total_amount} نقطة بنجاح في خزينة الوساطة الآمنة.`, time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) },
            { sender: 'mediator', name: 'الوسيط المعتمد', text: 'مرحباً بك في غرفة الوساطة الآمنة. نقاطك مؤمنة بالكامل في الخزينة، هل تريد الشراء؟', quickReplyRole: 'buyer', quickReplies: ['نعم', 'لا', 'غير متأكد'], time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) }
        ]
    };

    let dbLocked = false;
    if (typeof waseetLockEscrowPointsInDb === 'function') {
        const lockRes = await waseetLockEscrowPointsInDb(newDeal);
        if (lockRes && lockRes.ok && lockRes.data && !lockRes.data.local) {
            dbLocked = true;
            if (lockRes.data.deal_id) {
                newDeal.id = String(lockRes.data.deal_id);
            }
        } else if (lockRes && !lockRes.ok && !window.WASEET_SIMULATION_MODE) {
            console.warn('[Profile Escrow Deal] فشل حجز النقاط في قاعدة البيانات:', lockRes.error?.message);
            return { error: lockRes.error || { message: 'تعذر حجز نقاط الصفقة في الخزينة' } };
        }
    }

    if (!dbLocked && currentUser && currentUser.wallet) {
        currentUser.wallet.available = Math.max(0, (Number(currentUser.wallet.available) || 0) - Number(params.total_amount || 0));
        currentUser.wallet.locked = (Number(currentUser.wallet.locked) || 0) + Number(params.total_amount || 0);
        currentUser.wallet.total = currentUser.wallet.available + currentUser.wallet.locked;
    }

    if (typeof WASEET_STATE !== 'undefined') {
        if (!WASEET_STATE.deals) WASEET_STATE.deals = [];
        WASEET_STATE.deals.unshift(newDeal);
        WASEET_STATE.activeDeal = newDeal;
        if (typeof saveWaseetData === 'function') saveWaseetData();
    }

    try {
        const storedActive = JSON.parse(localStorage.getItem('WASEET_DEALS_ACTIVE') || '[]');
        storedActive.unshift(newDeal);
        localStorage.setItem('WASEET_DEALS_ACTIVE', JSON.stringify(storedActive));
    } catch (e) {}

    if (typeof waseetSaveDealToSupabase === 'function') {
        try {
            await waseetSaveDealToSupabase(newDeal);
        } catch (e) {
            console.warn('[Profile Escrow Deal] خطأ حفظ في Supabase:', e);
        }
    }

    return newDeal;
}
window.waseetCreateEscrowDealOnSupabase = waseetCreateEscrowDealOnSupabase;

window.waseetSendNotification = waseetSendNotification;

/**
 * ============================================================================
 * إدارة طرق وحسابات الدفع (Payment Methods Management)
 * ============================================================================
 */

function sanitizePaymentMethodRecord(pm) {
    if (!pm) return pm;
    const isAlgeria = pm.id === 'algeria_baridimob'
        || (pm.countryCode || pm.country_code || '').toUpperCase() === 'DZ'
        || (pm.countryName || pm.country_name || '').includes('جزائر');
    if (isAlgeria) {
        const bName = pm.beneficiaryName || pm.beneficiary_name || '';
        const legacyPrefix = 'KARIM' + ' ' + 'BENALI';
        if (!bName || bName.toUpperCase().includes(legacyPrefix)) {
            pm.beneficiaryName = 'MOUSSAOUI DHAYA EDDINE';
        }
        const accNum = pm.accountNumber || pm.account_number || '';
        if (!accNum || accNum === '00799999001234567890') {
            pm.accountNumber = '00799999004188617443';
        }
        const secVal = pm.secondaryValue || pm.secondary_value || '';
        if (!secVal || secVal === '0012345678 Clé 90') {
            pm.secondaryValue = '0041886174 Clé 43';
        }
    }
    return pm;
}

function getLocalPaymentMethodsFallback() {
    try {
        const cached = localStorage.getItem('WASEET_PAYMENT_METHODS_CACHE');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map(sanitizePaymentMethodRecord);
            }
        }
    } catch (e) {}
    if (typeof window.WASEET_PAYMENT_GATEWAYS !== 'undefined' && Array.isArray(window.WASEET_PAYMENT_GATEWAYS) && window.WASEET_PAYMENT_GATEWAYS.length > 0) {
        return window.WASEET_PAYMENT_GATEWAYS.map(sanitizePaymentMethodRecord);
    }
    const fb = typeof FALLBACK_PAYMENT_GATEWAYS !== 'undefined' ? FALLBACK_PAYMENT_GATEWAYS : [];
    return fb.map(sanitizePaymentMethodRecord);
}

/**
 * جلب قائمة طرق وحسابات الدفع من Supabase مع مزامنة الكاش المحلي
 */
async function waseetFetchPaymentMethods(onlyActive = false) {
    const client = initWaseetSupabase();
    if (!client) {
        const fallback = getLocalPaymentMethodsFallback();
        return onlyActive ? fallback.filter(m => m.isActive !== false && m.is_active !== false) : fallback;
    }
    try {
        let query = client.from('payment_methods').select('*').order('display_order', { ascending: true });
        if (onlyActive) {
            query = query.eq('is_active', true);
        }
        const { data, error } = await query;
        if (error || !Array.isArray(data) || data.length === 0) {
            const fallback = getLocalPaymentMethodsFallback();
            return onlyActive ? fallback.filter(m => m.isActive !== false && m.is_active !== false) : fallback;
        }

        const formatted = data.map(row => sanitizePaymentMethodRecord({
            id: row.id,
            category: row.category || 'local',
            countryName: row.country_name || '',
            countryCode: row.country_code || '',
            countryFlag: row.country_flag || '💳',
            iconSvg: row.icon_svg || '',
            iconClass: row.icon_class || 'fas fa-credit-card',
            methodName: row.method_name || '',
            shortLabel: row.short_label || row.method_name || '',
            beneficiaryLabel: row.beneficiary_label || 'اسم المستفيد',
            beneficiaryName: row.beneficiary_name || '',
            accountLabel: row.account_label || 'رقم الحساب / المحفظة',
            accountNumber: row.account_number || '',
            secondaryLabel: row.secondary_label || '',
            secondaryValue: row.secondary_value || '',
            currencyHint: row.currency_hint || '',
            instructions: row.instructions || '',
            isActive: row.is_active !== false,
            displayOrder: Number(row.display_order) || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));

        try {
            localStorage.setItem('WASEET_PAYMENT_METHODS_CACHE', JSON.stringify(formatted));
        } catch (e) {}

        if (typeof window !== 'undefined') {
            window.WASEET_PAYMENT_GATEWAYS = formatted.filter(m => m.isActive);
        }

        return formatted;
    } catch (err) {
        console.warn('[Payment Methods] خطأ جلب طرق الدفع:', err);
        const fallback = getLocalPaymentMethodsFallback();
        return onlyActive ? fallback.filter(m => m.isActive !== false && m.is_active !== false) : fallback;
    }
}

/**
 * [للمدير] إضافة أو تعديل طريقة دفع في جدول payment_methods
 */
async function waseetAdminSavePaymentMethod(methodData) {
    const client = initWaseetSupabase();
    const id = methodData.id || ('pm_' + Date.now());
    const payload = {
        id: id,
        category: methodData.category || 'local',
        country_name: methodData.countryName || '',
        country_code: methodData.countryCode || '',
        country_flag: methodData.countryFlag || '💳',
        icon_svg: methodData.iconSvg || '',
        icon_class: methodData.iconClass || 'fas fa-credit-card',
        method_name: methodData.methodName,
        short_label: methodData.shortLabel || methodData.methodName,
        beneficiary_label: methodData.beneficiaryLabel || 'اسم المستفيد',
        beneficiary_name: methodData.beneficiaryName,
        account_label: methodData.accountLabel || 'رقم الحساب / المحفظة',
        account_number: methodData.accountNumber,
        secondary_label: methodData.secondaryLabel || '',
        secondary_value: methodData.secondaryValue || '',
        currency_hint: methodData.currencyHint || '',
        instructions: methodData.instructions || '',
        is_active: methodData.isActive !== false,
        display_order: Number(methodData.displayOrder) || 0,
        updated_at: new Date().toISOString()
    };

    if (client) {
        try {
            const { error } = await client
                .from('payment_methods')
                .upsert(payload);
            if (error) {
                console.warn('[Payment Methods Save Supabase Error]', error);
            }
        } catch (err) {
            console.warn('[Payment Methods Save Exception]', err);
        }
    }

    let localList = getLocalPaymentMethodsFallback();
    const existingIndex = localList.findIndex(m => m.id === id);
    const formattedObj = {
        id,
        category: payload.category,
        countryName: payload.country_name,
        countryCode: payload.country_code,
        countryFlag: payload.country_flag,
        iconSvg: payload.icon_svg,
        iconClass: payload.icon_class,
        methodName: payload.method_name,
        shortLabel: payload.short_label,
        beneficiaryLabel: payload.beneficiary_label,
        beneficiaryName: payload.beneficiary_name,
        accountLabel: payload.account_label,
        accountNumber: payload.account_number,
        secondaryLabel: payload.secondary_label,
        secondaryValue: payload.secondary_value,
        currencyHint: payload.currency_hint,
        instructions: payload.instructions,
        isActive: payload.is_active,
        displayOrder: payload.display_order
    };

    if (existingIndex >= 0) {
        localList[existingIndex] = formattedObj;
    } else {
        localList.push(formattedObj);
    }

    try {
        localStorage.setItem('WASEET_PAYMENT_METHODS_CACHE', JSON.stringify(localList));
    } catch (e) {}

    window.WASEET_PAYMENT_GATEWAYS = localList.filter(m => m.isActive);

    return { ok: true, data: formattedObj };
}

/**
 * [للمدير] حذف طريقة دفع
 */
async function waseetAdminDeletePaymentMethod(methodId) {
    const client = initWaseetSupabase();
    if (client) {
        try {
            const { error } = await client
                .from('payment_methods')
                .delete()
                .eq('id', methodId);
            if (error) {
                console.warn('[Payment Methods Delete Supabase Error]', error);
            }
        } catch (err) {
            console.warn('[Payment Methods Delete Exception]', err);
        }
    }

    let localList = getLocalPaymentMethodsFallback().filter(m => m.id !== methodId);
    try {
        localStorage.setItem('WASEET_PAYMENT_METHODS_CACHE', JSON.stringify(localList));
    } catch (e) {}
    window.WASEET_PAYMENT_GATEWAYS = localList.filter(m => m.isActive);

    return { ok: true };
}

function parseBrokerAvatarMeta(avatarUrl) {
    const raw = String(avatarUrl || '').trim();
    const match = raw.match(/#waseet_broker=([A-Za-z]{2,6})/i);
    const cleanAvatar = raw.replace(/#waseet_broker=[A-Za-z]{2,6}/gi, '') || 'assets/logo.png';
    return {
        isBrokerTagged: Boolean(match),
        countryCode: match ? match[1].toUpperCase() : '',
        cleanAvatarUrl: cleanAvatar
    };
}

function getCachedRegionalBrokersList() {
    let list = [];
    try {
        const raw = localStorage.getItem('WASEET_REGIONAL_BROKERS_CACHE');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) list = parsed;
        }
    } catch (e) {}
    if (list.length === 0 && typeof WASEET_STATE !== 'undefined' && Array.isArray(WASEET_STATE.brokers)) {
        list = [...WASEET_STATE.brokers];
    }
    return list;
}

function saveCachedRegionalBrokersList(list) {
    const cleanList = Array.isArray(list) ? list : [];
    if (typeof WASEET_STATE !== 'undefined') {
        WASEET_STATE.brokers = cleanList;
    }
    try {
        localStorage.setItem('WASEET_REGIONAL_BROKERS_CACHE', JSON.stringify(cleanList));
    } catch (e) {}
}

/**
 * [للمدير] ترقية مستخدم إلى وسيط إقليمي معتمد وتحديد دولته
 */
async function waseetPromoteUserToBroker(targetUser, country = 'DZ') {
    const client = initWaseetSupabase();
    const cleanCountry = String(country || 'DZ').toUpperCase().trim();
    const cleanTarget = String(targetUser || '').trim();

    console.log('[Broker Promotion] Starting promotion request:', { targetUser: cleanTarget, country: cleanCountry });

    if (!cleanTarget) return { ok: false, error: { message: 'يرجى إدخال البريد الإلكتروني أو معرف المستخدم' } };

    let resolvedBrokerRecord = null;

    if (client) {
        // 1. محاولة استدعاء RPC إن وجد
        try {
            const { data, error } = await client.rpc('promote_to_regional_broker', {
                p_target_user: cleanTarget,
                p_country: cleanCountry
            });
            if (!error && data && data.success !== false) {
                console.log('[Broker Promotion] RPC promote_to_regional_broker succeeded:', data);
                resolvedBrokerRecord = data;
            } else if (error) {
                console.log('[Broker Promotion] RPC fallback triggered:', error.message || error);
            }
        } catch (rpcErr) {
            console.warn('[Broker Promotion] RPC Exception:', rpcErr);
        }

        // 2. محاولة التحديث في جدول users (role = 'broker') إن وجد
        try {
            const isUuidUser = waseetIsValidUuid(cleanTarget);
            const userUpdateQuery = isUuidUser
                ? client.from('users').update({ role: 'broker', country: cleanCountry }).eq('id', cleanTarget)
                : client.from('users').update({ role: 'broker', country: cleanCountry }).ilike('email', cleanTarget);
            const { data: uData, error: uErr } = await userUpdateQuery.select('*').maybeSingle();
            if (!uErr && uData) {
                console.log('[Broker Promotion] Updated users table role = broker:', uData);
                resolvedBrokerRecord = uData;
            }
        } catch (uEx) {}

        // 2b. محاولة الحفظ في جدول regional_brokers إن وجد
        try {
            const { data: rbData, error: rbErr } = await client
                .from('regional_brokers')
                .upsert({
                    email: cleanTarget.includes('@') ? cleanTarget.toLowerCase() : `${cleanTarget}@waseet.com`,
                    country: cleanCountry,
                    role: 'regional_broker',
                    is_active: true,
                    updated_at: new Date().toISOString()
                })
                .select()
                .maybeSingle();
            if (!rbErr && rbData) {
                console.log('[Broker Promotion] Saved in regional_brokers table:', rbData);
                resolvedBrokerRecord = rbData;
            }
        } catch (rbEx) {}

        // 3. البحث في جدول profiles وتحديثه (يدعم العمل مع أو بدون عمود country ومع role = 'broker' أو 'regional_broker')
        try {
            const isUuid = waseetIsValidUuid(cleanTarget);
            const lookupQuery = isUuid
                ? client.from('profiles').select('*').eq('id', cleanTarget).maybeSingle()
                : client.from('profiles').select('*').ilike('email', cleanTarget).maybeSingle();

            const { data: existingProfile } = await lookupQuery;

            if (existingProfile && existingProfile.id) {
                const avatarMeta = parseBrokerAvatarMeta(existingProfile.avatar_url);
                const taggedAvatar = `${avatarMeta.cleanAvatarUrl}#waseet_broker=${cleanCountry}`;

                // محاولة أولى مع عمود country و role
                const { data: fullUpdate, error: fullErr } = await client
                    .from('profiles')
                    .update({
                        role: 'regional_broker',
                        country: cleanCountry,
                        avatar_url: taggedAvatar,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingProfile.id)
                    .select('*')
                    .maybeSingle();

                if (!fullErr && fullUpdate) {
                    console.log('[Broker Promotion] Updated profiles row (full schema):', fullUpdate);
                    resolvedBrokerRecord = {
                        ...fullUpdate,
                        role: 'regional_broker',
                        brokerRole: 'broker',
                        isBroker: true,
                        country: cleanCountry,
                        avatar_url: avatarMeta.cleanAvatarUrl
                    };
                } else {
                    // محاولة ثانية لتحديث role إلى broker أو regional_broker بدون عمود country
                    const { data: roleOnlyUpdate, error: roleOnlyErr } = await client
                        .from('profiles')
                        .update({
                            role: 'regional_broker',
                            avatar_url: taggedAvatar,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existingProfile.id)
                        .select('*')
                        .maybeSingle();

                    if (!roleOnlyErr && roleOnlyUpdate) {
                        console.log('[Broker Promotion] Updated profiles row (role + tagged avatar):', roleOnlyUpdate);
                        resolvedBrokerRecord = {
                            ...roleOnlyUpdate,
                            role: 'regional_broker',
                            brokerRole: 'broker',
                            isBroker: true,
                            country: cleanCountry,
                            avatar_url: avatarMeta.cleanAvatarUrl
                        };
                    } else {
                        // محاولة ثالثة متوافقة 100% مع جدول profiles الأساسي المحمي بـ Trigger
                        const { data: compatUpdate, error: compatErr } = await client
                            .from('profiles')
                            .update({
                                avatar_url: taggedAvatar,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', existingProfile.id)
                            .select('*')
                            .maybeSingle();

                        if (!compatErr && compatUpdate) {
                            console.log('[Broker Promotion] Updated profiles row (compatible schema):', compatUpdate);
                            resolvedBrokerRecord = {
                                ...compatUpdate,
                                role: 'regional_broker',
                                brokerRole: 'broker',
                                isBroker: true,
                                country: cleanCountry,
                                avatar_url: avatarMeta.cleanAvatarUrl
                            };
                        }
                    }
                }
            }
        } catch (fbErr) {
            console.warn('[Broker Promotion] Direct profile update warning:', fbErr);
        }
    }

    // 4. توحيد السجل النهائي وحفظه في الكاش والذاكرة لضمان ظهوره الفوري في المتجر ولوحة الإدارة
    const finalBroker = {
        id: (resolvedBrokerRecord && (resolvedBrokerRecord.id || resolvedBrokerRecord.user_id))
            ? (resolvedBrokerRecord.id || resolvedBrokerRecord.user_id)
            : (waseetIsValidUuid(cleanTarget) ? cleanTarget : ('broker_' + Date.now())),
        name: (resolvedBrokerRecord && resolvedBrokerRecord.name)
            ? resolvedBrokerRecord.name
            : (cleanTarget.split('@')[0] || 'وسيط إقليمي معتمد'),
        email: (resolvedBrokerRecord && resolvedBrokerRecord.email)
            ? resolvedBrokerRecord.email
            : (cleanTarget.includes('@') ? cleanTarget.toLowerCase() : `${cleanTarget}@waseet.com`),
        avatar_url: (resolvedBrokerRecord && resolvedBrokerRecord.avatar_url)
            ? parseBrokerAvatarMeta(resolvedBrokerRecord.avatar_url).cleanAvatarUrl
            : 'assets/logo.png',
        role: 'regional_broker',
        country: cleanCountry,
        is_active: true,
        wallet_balance: Number(resolvedBrokerRecord && resolvedBrokerRecord.wallet_balance) || 0,
        points_balance: Number(resolvedBrokerRecord && resolvedBrokerRecord.points_balance) || 0,
        created_at: (resolvedBrokerRecord && resolvedBrokerRecord.created_at) || new Date().toISOString()
    };

    const currentList = getCachedRegionalBrokersList();
    const existingIdx = currentList.findIndex(b =>
        (b.email && finalBroker.email && b.email.toLowerCase() === finalBroker.email.toLowerCase()) ||
        (b.id && finalBroker.id && String(b.id) === String(finalBroker.id))
    );
    if (existingIdx >= 0) {
        currentList[existingIdx] = { ...currentList[existingIdx], ...finalBroker, country: cleanCountry, role: 'regional_broker', is_active: true };
    } else {
        currentList.unshift(finalBroker);
    }

    saveCachedRegionalBrokersList(currentList);
    console.log('[Broker Promotion] Broker saved and synchronized successfully:', finalBroker);

    // بث حدث الترقية الفوري عبر Supabase Realtime ليصل لمتصفح الوسيط المرقّى فوراً دون الحاجة لتسجيل الخروج
    try {
        if (window._waseetLiveRoleChannel && typeof window._waseetLiveRoleChannel.send === 'function') {
            window._waseetLiveRoleChannel.send({
                type: 'broadcast',
                event: 'broker_role_changed',
                payload: {
                    action: 'promote',
                    id: finalBroker.id,
                    email: finalBroker.email,
                    role: 'regional_broker',
                    country: cleanCountry,
                    timestamp: Date.now()
                }
            });
        }
    } catch (bErr) {}

    // إذا كان المستخدم المرقى هو نفس المستخدم المسجل حالياً، نحدّث جلسته وواجهته فوراً
    if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) {
        const curId = String(WASEET_STATE.user.id || '').trim();
        const curEmail = String(WASEET_STATE.user.email || '').toLowerCase().trim();
        if ((curId && String(finalBroker.id) === curId) || (curEmail && String(finalBroker.email).toLowerCase().trim() === curEmail)) {
            await waseetSyncAuthState({ force: true, refreshToken: true, profileOnly: true });
        }
    }
    if (window.waseetApp && typeof window.waseetApp.loadStoreRegionalBrokers === 'function') {
        window.waseetApp.loadStoreRegionalBrokers();
    }

    return { ok: true, data: finalBroker };
}

/**
 * [للمدير] إلغاء ترقية وسيط إقليمي وإعادته لمستخدم عادي مع الحذف الجذري المتسلسل (Cascading Delete)
 */
async function waseetDemoteBroker(targetId, targetEmail) {
    const client = initWaseetSupabase();
    if (!targetId && !targetEmail) return { ok: false, error: { message: 'معرف الوسيط أو البريد الإلكتروني غير صالح' } };

    const cleanTargetId = targetId ? String(targetId).trim() : '';
    const cleanTargetEmail = targetEmail ? String(targetEmail).trim().toLowerCase() : '';

    console.log('[Broker Demotion] Demoting broker Cascading Delete:', { id: cleanTargetId, email: cleanTargetEmail });

    if (client) {
        // 1. استدعاء الدالة السحابية الشاملة للحذف المتسلسل demote_regional_broker
        try {
            if (cleanTargetId) {
                await client.rpc('demote_regional_broker', { p_target_id: cleanTargetId });
            }
        } catch (rpcErr) {
            console.warn('[Broker Demotion] RPC by ID notice:', rpcErr && (rpcErr.message || rpcErr));
        }

        try {
            if (cleanTargetEmail) {
                await client.rpc('demote_regional_broker', { p_target_id: cleanTargetEmail });
            }
        } catch (rpcEmailErr) {
            console.warn('[Broker Demotion] RPC by Email notice:', rpcEmailErr && (rpcEmailErr.message || rpcEmailErr));
        }

        // 2. الحذف المباشر الصريح من جدول regional_brokers بالمعرف وبالبريد وبالـ user_id
        try {
            if (cleanTargetId) {
                await client.from('regional_brokers').delete().eq('id', cleanTargetId);
                await client.from('regional_brokers').delete().eq('user_id', cleanTargetId);
            }
            if (cleanTargetEmail) {
                await client.from('regional_brokers').delete().ilike('email', cleanTargetEmail);
            }
        } catch (rbDelErr) {
            console.warn('[Broker Demotion] regional_brokers table delete notice:', rbDelErr);
        }

        // 3. تحديث جدول profiles لتحويل الرتبة فوراً إلى 'user' وتطهير وسم الوسيط من avatar_url
        try {
            const isUuid = waseetIsValidUuid(cleanTargetId);
            const profQuery = isUuid
                ? client.from('profiles').select('*').eq('id', cleanTargetId).maybeSingle()
                : (cleanTargetEmail ? client.from('profiles').select('*').ilike('email', cleanTargetEmail).maybeSingle() : Promise.resolve({ data: null }));

            const { data: existingProf } = await profQuery;
            const cleanAvatar = existingProf
                ? String(existingProf.avatar_url || '').replace(/#waseet_broker=[^&]*/g, '')
                : 'assets/logo.png';
            const nextRole = (existingProf && existingProf.role === 'admin') ? 'admin' : 'user';

            const updatePayload = {
                role: nextRole,
                avatar_url: cleanAvatar,
                updated_at: new Date().toISOString()
            };

            if (isUuid) {
                await client.from('profiles').update(updatePayload).eq('id', cleanTargetId);
            }
            if (cleanTargetEmail) {
                await client.from('profiles').update(updatePayload).ilike('email', cleanTargetEmail);
            }
        } catch (profErr) {
            console.warn('[Broker Demotion] profiles update notice:', profErr);
        }

        // 4. تحديث جدول users إن وُجد
        try {
            if (waseetIsValidUuid(cleanTargetId)) {
                await client.from('users').update({ role: 'user' }).eq('id', cleanTargetId);
            }
            if (cleanTargetEmail) {
                await client.from('users').update({ role: 'user' }).ilike('email', cleanTargetEmail);
            }
        } catch (uErr) {}
    }

    // 5. التطهير الجذري للكاش المحلي WASEET_REGIONAL_BROKERS_CACHE
    const currentList = getCachedRegionalBrokersList();
    const updatedList = currentList.filter(b => {
        if (!b) return false;
        const bId = String(b.id || b.user_id || '').trim();
        const bEmail = String(b.email || '').trim().toLowerCase();
        if (cleanTargetId && (bId === cleanTargetId || (b.user_id && String(b.user_id) === cleanTargetId))) return false;
        if (cleanTargetEmail && bEmail === cleanTargetEmail) return false;
        return true;
    });
    saveCachedRegionalBrokersList(updatedList);

    // 6. بث الحدث اللحظي لتحديث كافة التبويبات النشطة
    try {
        if (window._waseetLiveRoleChannel && typeof window._waseetLiveRoleChannel.send === 'function') {
            window._waseetLiveRoleChannel.send({
                type: 'broadcast',
                event: 'broker_role_changed',
                payload: {
                    action: 'demote',
                    id: cleanTargetId,
                    email: cleanTargetEmail,
                    role: 'user',
                    timestamp: Date.now()
                }
            });
        }
    } catch (bErr) {}

    // بث الحدث عبر التخزين المحلي للمزامنة الفورية بين تبويبات المتصفح
    try {
        localStorage.setItem('WASEET_LAST_DEMOTE_EVENT', JSON.stringify({
            id: cleanTargetId,
            email: cleanTargetEmail,
            time: Date.now()
        }));
    } catch (e) {}

    // 7. إذا كان المستخدم الحالي هو الوسيط المحذوف، تحديث حالته فوراً وتجريده من صلاحية الوسيط
    if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) {
        const myId = String(WASEET_STATE.user.id || '').trim();
        const myEmail = String(WASEET_STATE.user.email || '').trim().toLowerCase();
        if ((cleanTargetId && myId === cleanTargetId) || (cleanTargetEmail && myEmail === cleanTargetEmail)) {
            WASEET_STATE.user.role = 'user';
            WASEET_STATE.user.isBroker = false;
            WASEET_STATE.user.brokerRole = 'user';
            if (WASEET_STATE.user.avatar) {
                WASEET_STATE.user.avatar = String(WASEET_STATE.user.avatar).replace(/#waseet_broker=[^&]*/g, '');
            }
            try {
                localStorage.setItem('WASEET_CURRENT_USER', JSON.stringify(WASEET_STATE.user));
                localStorage.setItem('WASEET_SAVED_USER_PERMANENT', JSON.stringify(WASEET_STATE.user));
            } catch (e) {}
            waseetApplyLiveRoleUpdateToUI(WASEET_STATE.user);
            await waseetSyncAuthState({ force: true, refreshToken: true, profileOnly: true });
        }
    }

    if (window.waseetApp && typeof window.waseetApp.loadStoreRegionalBrokers === 'function') {
        window.waseetApp.loadStoreRegionalBrokers();
    }

    return { ok: true, data: { success: true } };
}

/**
 * جلب قائمة كافة الوسطاء الإقليميين النشطين من Supabase + الذاكرة المحلية
 */
async function waseetFetchRegionalBrokers() {
    const client = initWaseetSupabase();
    const dbBrokers = [];

    console.log('[Regional Brokers] Fetching active regional brokers from Supabase...');

    if (client) {
        // 1. محاولة الجلب من جدول regional_brokers إن كان موجوداً
        try {
            const { data: rbRows, error: rbError } = await client
                .from('regional_brokers')
                .select('*')
                .order('created_at', { ascending: false });

            if (!rbError && Array.isArray(rbRows) && rbRows.length > 0) {
                console.log('[Regional Brokers] Found rows in regional_brokers table:', rbRows.length);
                rbRows.forEach(r => {
                    if (r.is_active !== false) {
                        dbBrokers.push({
                            id: r.id || r.user_id || ('broker_' + Date.now()),
                            name: r.name || (r.email ? r.email.split('@')[0] : 'وسيط إقليمي معتمد'),
                            email: r.email || '',
                            avatar_url: parseBrokerAvatarMeta(r.avatar_url).cleanAvatarUrl,
                            role: 'regional_broker',
                            country: String(r.country || 'DZ').toUpperCase(),
                            is_active: true,
                            wallet_balance: Number(r.wallet_balance) || 0,
                            points_balance: Number(r.points_balance) || 0,
                            created_at: r.created_at || new Date().toISOString()
                        });
                    }
                });
            }
        } catch (rbEx) {}
    }

    // 3. دمج نتائج قاعدة البيانات مع الكاش المحلي لضمان عدم ضياع أي وسيط تمت ترقيته
    const cachedBrokers = getCachedRegionalBrokersList();

    // 2. الجلب الآمن من جدول profiles عبر select('*') لتجنب خطأ غياب عمود country
    if (client) {
        try {
            const { data: profileRows, error: profError } = await client
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (!profError && Array.isArray(profileRows)) {
                profileRows.forEach(row => {
                    // إذا تم إرجاع رتبة المستخدم إلى 'user'، يتم استبعاده فوراً وحظره من الظهور كوسيط
                    if (row.role === 'user') return;

                    const avatarMeta = parseBrokerAvatarMeta(row.avatar_url);
                    const isBrokerRole = row.role === 'regional_broker' || row.role === 'broker';
                    if (isBrokerRole || (avatarMeta.isBrokerTagged && row.role !== 'user')) {
                        const cachedMatch = cachedBrokers.find(cb =>
                            cb && (
                                (cb.id && row.id && String(cb.id) === String(row.id)) ||
                                (cb.email && row.email && String(cb.email).toLowerCase().trim() === String(row.email).toLowerCase().trim())
                            )
                        );
                        // أولوية الدولة: وسم الصورة avatarMeta ثم الكاش المحلي ثم عمود profiles إذا لم يكن DZ الافتراضي
                        const resolvedCountry = String(
                            avatarMeta.countryCode ||
                            (cachedMatch && cachedMatch.country) ||
                            (row.country && row.country !== 'DZ' ? row.country : '') ||
                            row.country ||
                            'DZ'
                        ).toUpperCase().trim();

                        dbBrokers.push({
                            id: row.id,
                            name: row.name || (row.email ? row.email.split('@')[0] : 'وسيط إقليمي معتمد'),
                            email: row.email || '',
                            avatar_url: avatarMeta.cleanAvatarUrl,
                            role: 'regional_broker',
                            country: resolvedCountry,
                            is_active: true,
                            wallet_balance: Number(row.wallet_balance) || 0,
                            points_balance: Number(row.points_balance) || 0,
                            created_at: row.created_at || new Date().toISOString()
                        });
                    }
                });
            } else if (profError) {
                console.warn('[Regional Brokers] Supabase profiles query warning:', profError.message || profError);
            }
        } catch (err) {
            console.warn('[Regional Brokers] Fetch Supabase Exception:', err);
        }
    }
    const mergedMap = new Map();

    dbBrokers.forEach(b => {
        const key = (b.email || b.id || '').toLowerCase();
        if (key) mergedMap.set(key, b);
    });

    cachedBrokers.forEach(b => {
        if (b && b.is_active !== false) {
            const key = (b.email || b.id || '').toLowerCase();
            if (key) {
                if (!mergedMap.has(key)) {
                    mergedMap.set(key, {
                        ...b,
                        role: 'regional_broker',
                        country: String(b.country || 'DZ').toUpperCase().trim()
                    });
                } else {
                    // إذا كان السجل موجوداً في قاعدة البيانات لكن دولته DZ بينما الكاش يحمل دولة محددة مسندة (مثل SY أو LY)، يتم اعتماد الدولة المسندة
                    const existing = mergedMap.get(key);
                    if (existing && (!existing.country || existing.country === 'DZ') && b.country && b.country !== 'DZ') {
                        existing.country = String(b.country).toUpperCase().trim();
                    }
                }
            }
        }
    });

    const finalBrokers = Array.from(mergedMap.values());
    saveCachedRegionalBrokersList(finalBrokers);

    // إذا كان المستخدم الحالي وسيطاً معتمداً بالفعل، نقوم بمزامنة دولته المسندة في الجلسة الحالية
    if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user && (WASEET_STATE.user.role === 'regional_broker' || WASEET_STATE.user.isBroker) && WASEET_STATE.user.role !== 'admin' && !WASEET_STATE.user.isAdmin) {
        const curId = String(WASEET_STATE.user.id || '');
        const curEmail = String(WASEET_STATE.user.email || '').toLowerCase().trim();
        const myBrokerRecord = finalBrokers.find(b =>
            (b.id && curId && String(b.id) === curId) ||
            (b.email && curEmail && String(b.email).toLowerCase().trim() === curEmail)
        );
        if (myBrokerRecord && myBrokerRecord.country && WASEET_STATE.user.country !== myBrokerRecord.country) {
            WASEET_STATE.user.country = myBrokerRecord.country;
            if (typeof saveWaseetData === 'function') saveWaseetData();
            waseetApplyLiveRoleUpdateToUI(WASEET_STATE.user);
        }
    }

    console.log('[Regional Brokers] Total active regional brokers loaded:', finalBrokers.length, finalBrokers);
    return { ok: true, data: finalBrokers };
}

/**
 * توليد وعرض بطاقة تعريفية أنيقة للوسيط الإقليمي المعتمد لبلد المستخدم (Regional Broker Card)
 */
async function waseetRenderRegionalBrokerCard(targetElOrId, options = {}) {
    try {
        const container = (typeof targetElOrId === 'string') ? document.getElementById(targetElOrId) : targetElOrId;
        if (!container) return;

        let brokers = [];
        if (typeof waseetFetchRegionalBrokers === 'function') {
            const res = await waseetFetchRegionalBrokers();
            if (res && res.ok && Array.isArray(res.data)) brokers = res.data;
        }
        if (brokers.length === 0 && typeof getCachedRegionalBrokersList === 'function') {
            brokers = getCachedRegionalBrokersList();
        }

        const currentUser = (typeof WASEET_STATE !== 'undefined') ? WASEET_STATE.user : null;
        const userCountry = (currentUser && currentUser.country) ? String(currentUser.country).toUpperCase().trim() : 'DZ';

        // مطابقة الوسيط حسب بلد المستخدم أو اعتماد أول وسيط نشط مسجل
        let activeBroker = brokers.find(b => b && b.is_active !== false && String(b.country || '').toUpperCase().trim() === userCountry);
        if (!activeBroker && brokers.length > 0) {
            activeBroker = brokers.find(b => b && b.is_active !== false) || brokers[0];
        }

        if (!activeBroker) {
            activeBroker = {
                name: 'الوسيط المعتمد',
                country: userCountry || 'DZ',
                avatar_url: 'assets/logo.png',
                email: 'mediator@waseet.com'
            };
        }

        const countryCode = String(activeBroker.country || userCountry || 'DZ').toUpperCase().trim();
        const countryNamesMap = {
            DZ: 'الجزائر', EG: 'مصر', SA: 'السعودية', MA: 'المغرب', TN: 'تونس',
            SY: 'سوريا', IQ: 'العراق', LY: 'ليبيا', JO: 'الأردن', AE: 'الإمارات',
            KW: 'الكويت', QA: 'قطر', OM: 'عُمان', BH: 'البحرين', YE: 'اليمن',
            PS: 'فلسطين', LB: 'لبنان', SD: 'السودان', MR: 'موريتانيا'
        };
        const countryName = countryNamesMap[countryCode] || countryCode;
        const flagSvg = (countryCode === 'DZ') ? 'assets/flags/dz.svg' : `assets/flags/${countryCode.toLowerCase()}.svg`;
        const brokerName = activeBroker.name || (activeBroker.email ? activeBroker.email.split('@')[0] : 'وسيط معتمد');
        let avatarUrl = activeBroker.avatar_url || 'assets/logo.png';
        if (avatarUrl.includes('#waseet_broker=')) {
            avatarUrl = avatarUrl.replace(/#waseet_broker=[A-Za-z]{2,6}/gi, '');
        }

        const escapeHtmlSafe = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        container.innerHTML = `
            <div class="regional-broker-identity-card" title="الوسيط الإقليمي المعتمد لبلدك: ${escapeHtmlSafe(brokerName)} (${escapeHtmlSafe(countryName)})">
                <div class="broker-avatar-wrap">
                    <img src="${escapeHtmlSafe(avatarUrl)}" alt="${escapeHtmlSafe(brokerName)}" class="broker-avatar-img" referrerpolicy="no-referrer" onerror="this.src='assets/logo.png'">
                    <span class="broker-avatar-badge" title="وسيط معتمد وموثق"><i class="fas fa-shield-alt"></i></span>
                </div>
                <div class="broker-info-col">
                    <div class="broker-name-row">
                        <h4 class="broker-name">${escapeHtmlSafe(brokerName)}</h4>
                        <span class="broker-country-badge">
                            <img src="${escapeHtmlSafe(flagSvg)}" alt="${escapeHtmlSafe(countryName)}" class="broker-flag-img" onerror="this.src='assets/flags/dz.svg'">
                            <span>${escapeHtmlSafe(countryName)} (${escapeHtmlSafe(countryCode)})</span>
                        </span>
                    </div>
                    <p class="broker-role-desc">
                        <i class="fas fa-user-shield text-emerald"></i>
                        <span>الوسيط الإقليمي المعتمد لبلدك</span>
                    </p>
                </div>
            </div>
        `;
    } catch (cardErr) {
        console.warn('[Regional Broker Card] Error rendering broker identity card:', cardErr);
    }
}
window.waseetRenderRegionalBrokerCard = waseetRenderRegionalBrokerCard;

/**
 * البحث عن وسيط إقليمي لدولة معينة (Smart Routing)
 */
async function waseetGetBrokerForCountry(countryCode) {
    const client = initWaseetSupabase();
    const cleanCountry = String(countryCode || 'DZ').toUpperCase().trim();

    if (client) {
        try {
            const { data, error } = await client.rpc('get_regional_broker_for_country', {
                p_country: cleanCountry
            });
            if (!error && data && data.found) return data;
        } catch (e) {}
    }

    const { data: allBrokers } = await waseetFetchRegionalBrokers();
    const match = (allBrokers || []).find(b => String(b.country).toUpperCase() === cleanCountry) || (allBrokers && allBrokers[0]) || null;
    if (match) {
        return { found: true, id: match.id, name: match.name, email: match.email, country: match.country, avatar_url: match.avatar_url };
    }

    return null;
}

window.waseetFetchPaymentMethods = waseetFetchPaymentMethods;
window.waseetAdminSavePaymentMethod = waseetAdminSavePaymentMethod;
window.waseetAdminDeletePaymentMethod = waseetAdminDeletePaymentMethod;

window.waseetPromoteUserToBroker = waseetPromoteUserToBroker;
window.waseetDemoteBroker = waseetDemoteBroker;
window.waseetFetchRegionalBrokers = waseetFetchRegionalBrokers;
window.waseetGetBrokerForCountry = waseetGetBrokerForCountry;

window.waseetSubmitWithdrawalRequest = waseetSubmitWithdrawalRequest;
window.waseetFetchMyWithdrawals = waseetFetchMyWithdrawals;
window.waseetAdminFetchWithdrawals = waseetAdminFetchWithdrawals;
window.waseetAdminApproveWithdrawal = waseetAdminApproveWithdrawal;
window.waseetAdminRejectWithdrawal = waseetAdminRejectWithdrawal;
window.waseetUpdateAdminPendingWithdrawalsBadge = waseetUpdateAdminPendingWithdrawalsBadge;

/**
 * تهيئة المزامنة الفورية والتلقائية لرتبة المستخدم وجلسته (Automatic Live Session & Role Refresh)
 * يضمن انعكاس ترقية المستخدم إلى "وسيط" في قاعدة البيانات فوراً في الواجهة دون الحاجة لتسجيل الخروج والدخول.
 */
let _waseetLiveRoleSyncInitialized = false;
let _waseetLastFocusRoleCheckAt = 0;

function waseetInitLiveRoleAndSessionSync() {
    if (_waseetLiveRoleSyncInitialized) return;
    _waseetLiveRoleSyncInitialized = true;

    const client = initWaseetSupabase();

    // 1. الاستماع الفوري عبر Supabase Realtime لجداول profiles و regional_brokers و users + Broadcast
    if (client && typeof client.channel === 'function') {
        try {
            let rtDebounceTimer = null;
            const triggerRealtimeRoleCheck = (payload) => {
                // 1. تحديث قائمة الوسطاء في المتجر دائماً لجميع المستخدمين والزوار
                if (window.waseetApp && typeof window.waseetApp.loadStoreRegionalBrokers === 'function') {
                    setTimeout(() => {
                        try { window.waseetApp.loadStoreRegionalBrokers(); } catch (e) {}
                    }, 150);
                }

                const rawData = (payload && (payload.payload || payload.new || payload)) || {};
                const action = rawData.action || (rawData.role === 'user' ? 'demote' : null);
                const targetId = String(rawData.id || rawData.user_id || '').trim();
                const targetEmail = String(rawData.email || '').toLowerCase().trim();

                // 2. عند إلغاء أو حذف وسيط: تطهير الكاش المحلي فوراً في جميع التبويبات المفتوحة
                if (action === 'demote') {
                    try {
                        const cachedList = getCachedRegionalBrokersList();
                        const updatedCached = cachedList.filter(b => {
                            if (!b) return false;
                            const bId = String(b.id || b.user_id || '').trim();
                            const bEmail = String(b.email || '').toLowerCase().trim();
                            if (targetId && (bId === targetId || (b.user_id && String(b.user_id) === targetId))) return false;
                            if (targetEmail && bEmail === targetEmail) return false;
                            return true;
                        });
                        saveCachedRegionalBrokersList(updatedCached);
                    } catch (e) {}
                }

                if (typeof WASEET_STATE === 'undefined' || !WASEET_STATE.user || WASEET_STATE.user.isGuest) return;
                const curId = String(WASEET_STATE.user.id || '').trim();
                const curEmail = String(WASEET_STATE.user.email || '').toLowerCase().trim();

                // 3. فحص ما إذا كان المستخدم الحالي هو الوسيط الملغى / المحذوف
                const isTargetOfDemote = action === 'demote' && ((targetId && curId === targetId) || (targetEmail && curEmail === targetEmail));

                if (isTargetOfDemote) {
                    console.warn('[Live Session Sync] Instant demotion & role strip for current user:', curEmail);
                    WASEET_STATE.user.role = 'user';
                    WASEET_STATE.user.isBroker = false;
                    WASEET_STATE.user.brokerRole = 'user';
                    if (WASEET_STATE.user.avatar) {
                        WASEET_STATE.user.avatar = String(WASEET_STATE.user.avatar).replace(/#waseet_broker=[^&]*/g, '');
                    }
                    try {
                        localStorage.setItem('WASEET_CURRENT_USER', JSON.stringify(WASEET_STATE.user));
                        localStorage.setItem('WASEET_SAVED_USER_PERMANENT', JSON.stringify(WASEET_STATE.user));
                    } catch (e) {}

                    // تجريد فوري لكافة عناصر الوساطة من واجهة المستخدم
                    waseetApplyLiveRoleUpdateToUI(WASEET_STATE.user);

                    if (typeof waseetAlert === 'function') {
                        waseetAlert('تم تعديل رتبتك في المنصة وإعادتك لمستخدم عادي من قبل الإدارة.', 'تحديث الصلاحيات', 'info');
                    }
                    waseetSyncAuthState({ force: true, refreshToken: true, profileOnly: true });
                    return;
                }

                const newRow = (payload && (payload.new || payload.payload)) || {};
                const oldRow = (payload && payload.old) || {};
                const rowId = String(newRow.id || newRow.user_id || oldRow.id || oldRow.user_id || '').trim();
                const rowEmail = String(newRow.email || oldRow.email || '').toLowerCase().trim();

                const isRelevantToCurrentUser =
                    !rowId ||
                    (curId && rowId === curId) ||
                    (curEmail && rowEmail && rowEmail === curEmail) ||
                    (payload && (payload.table === 'regional_brokers' || payload.event === 'broker_role_changed'));

                if (!isRelevantToCurrentUser) return;

                if (rtDebounceTimer) clearTimeout(rtDebounceTimer);
                rtDebounceTimer = setTimeout(() => {
                    waseetSyncAuthState({ force: true, refreshToken: true, profileOnly: true });
                }, 200);
            };

            // 2. اشتراك Supabase Realtime فوري على جدول profiles لتحديث الاسم والصورة بالهيدر والقائمة الجانبية فوراً دون تحديث الصفحة
            const handleProfileRealtimeUpdate = (payload) => {
                const updatedRow = (payload && (payload.new || payload.payload)) || {};
                if (!updatedRow || !updatedRow.id) return;

                const curUser = (typeof WASEET_STATE !== 'undefined') ? WASEET_STATE.user : null;
                if (!curUser || String(curUser.id) !== String(updatedRow.id)) return;

                console.log('[Realtime Profiles] Live profile update received for current user:', updatedRow);

                if (updatedRow.name) curUser.name = updatedRow.name;
                if (updatedRow.avatar_url) {
                    curUser.avatar = updatedRow.avatar_url;
                    if (curUser.user_metadata) {
                        curUser.user_metadata.avatar_url = updatedRow.avatar_url;
                        curUser.user_metadata.picture = updatedRow.avatar_url;
                    }
                }
                if (updatedRow.points_balance !== undefined) {
                    if (!curUser.wallet) curUser.wallet = { available: 0, locked: 0, total: 0 };
                    curUser.wallet.available = Number(updatedRow.points_balance || 0);
                    curUser.wallet.total = curUser.wallet.available + Number(curUser.wallet.locked || 0);
                }

                if (typeof saveWaseetData === 'function') saveWaseetData();
                try {
                    localStorage.setItem('WASEET_CURRENT_USER', JSON.stringify(curUser));
                    localStorage.setItem('WASEET_SAVED_USER_PERMANENT', JSON.stringify(curUser));
                } catch (e) {}

                // استدعاء دالة updateAuthUI(payload.new) فوراً لتحديث الاسم والصورة في الهيدر والقائمة الجانبية في نفس اللحظة (Real-time)
                if (typeof updateAuthUI === 'function') {
                    updateAuthUI(updatedRow);
                } else if (window.waseetApp && typeof window.waseetApp.updateAuthUI === 'function') {
                    window.waseetApp.updateAuthUI(updatedRow);
                }
                if (typeof window.renderNavbarUser === 'function') {
                    try { window.renderNavbarUser(); } catch (e) {}
                }
            };

            const roleChannel = client
                .channel('waseet_live_role_sync_rt')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
                    handleProfileRealtimeUpdate(payload);
                    triggerRealtimeRoleCheck(payload);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'regional_brokers' }, triggerRealtimeRoleCheck)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, triggerRealtimeRoleCheck)
                .on('broadcast', { event: 'broker_role_changed' }, triggerRealtimeRoleCheck)
                .subscribe();
            window._waseetLiveRoleChannel = roleChannel;
        } catch (rtErr) {
            console.warn('[Live Role Sync] Realtime subscription warning:', rtErr);
        }
    }

    // 2. التحديث الفوري عند العودة لنافذة المتجر (Window Focus / Tab Visibility Change)
    const handleVisibilityOrFocus = () => {
        if (document.hidden) return;
        const now = Date.now();
        if (now - _waseetLastFocusRoleCheckAt < 2000) return;
        _waseetLastFocusRoleCheckAt = now;
        if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user && !WASEET_STATE.user.isGuest) {
            waseetSyncAuthState({ force: true, refreshToken: true, profileOnly: true });
        }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // 3. المزامنة عبر التبويبات المفتوحة (Cross-Tab Storage Sync)
    window.addEventListener('storage', (event) => {
        if (!event || !event.key) return;
        if (event.key === 'WASEET_SAVED_USER_PERMANENT' && event.newValue) {
            try {
                const updatedUser = JSON.parse(event.newValue);
                if (updatedUser && typeof WASEET_STATE !== 'undefined') {
                    const prevRole = WASEET_STATE.user ? WASEET_STATE.user.role : null;
                    WASEET_STATE.user = updatedUser;
                    waseetApplyLiveRoleUpdateToUI(updatedUser);
                    if (prevRole !== updatedUser.role) {
                        waseetShowRoleUpgradeToast(updatedUser);
                    }
                }
            } catch (e) {}
        } else if (event.key === 'WASEET_LAST_DEMOTE_EVENT' && event.newValue) {
            try {
                const demoteInfo = JSON.parse(event.newValue);
                if (demoteInfo && typeof triggerRealtimeRoleCheck === 'function') {
                    triggerRealtimeRoleCheck({ payload: { action: 'demote', id: demoteInfo.id, email: demoteInfo.email } });
                }
            } catch (e) {}
        } else if (event.key === 'WASEET_REGIONAL_BROKERS_CACHE') {
            if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user && !WASEET_STATE.user.isGuest) {
                waseetSyncAuthState({ force: true, profileOnly: true });
            }
        }
    });

    // 4. فحص دوري خفيف بالخلفية كل 30 ثانية كاحتياط إضافي لضمان انعكاس الترقية حتى لو لم يكن Realtime مفعلاً
    setInterval(() => {
        if (document.hidden) return;
        if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user && !WASEET_STATE.user.isGuest) {
            waseetSyncAuthState({ force: true, profileOnly: true });
        }
    }, 30000);
}

window.waseetInitLiveRoleAndSessionSync = waseetInitLiveRoleAndSessionSync;
window.waseetRefreshSessionRoleNow = function () {
    return waseetSyncAuthState({ force: true, refreshToken: true, profileOnly: true });
};

/**
 * دوال تحديث واجهة المستخدم بعد المصادقة (Auth UI Updater)
 */
function updateAuthUI(user = null) {
    let targetUser = user || (typeof WASEET_STATE !== 'undefined' ? WASEET_STATE.user : null);
    if (targetUser && typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) {
        if (targetUser.name) WASEET_STATE.user.name = targetUser.name;
        if (targetUser.avatar_url || targetUser.avatar) {
            WASEET_STATE.user.avatar = targetUser.avatar_url || targetUser.avatar;
            if (WASEET_STATE.user.user_metadata) {
                WASEET_STATE.user.user_metadata.avatar_url = WASEET_STATE.user.avatar;
                WASEET_STATE.user.user_metadata.picture = WASEET_STATE.user.avatar;
            }
        }
        if (targetUser.points_balance !== undefined) {
            if (!WASEET_STATE.user.wallet) WASEET_STATE.user.wallet = { available: 0, locked: 0, total: 0 };
            WASEET_STATE.user.wallet.available = Number(targetUser.points_balance || 0);
            WASEET_STATE.user.wallet.total = WASEET_STATE.user.wallet.available + Number(WASEET_STATE.user.wallet.locked || 0);
        }
        targetUser = WASEET_STATE.user;
    }

    waseetApplyLiveRoleUpdateToUI(targetUser);

    if (window.waseetApp) {
        if (typeof window.waseetApp.updateAuthUI === 'function') {
            try { window.waseetApp.updateAuthUI(targetUser); } catch (e) {}
        } else if (typeof window.waseetApp.renderUserProfile === 'function') {
            try { window.waseetApp.renderUserProfile(); } catch (e) {}
        }
    }
    if (typeof window.renderNavbarUser === 'function') {
        try { window.renderNavbarUser(); } catch (e) {}
    }
}
window.updateAuthUI = updateAuthUI;
window.updateUI = updateAuthUI;

/**
 * الاستماع لتغيرات الجلسة وتحديث الواجهة تلقائياً
 */
function initWaseetAuthListener() {
    const client = initWaseetSupabase();
    if (!client || !client.auth) return;

    if (window._waseetAuthListenerRegistered) return;
    window._waseetAuthListenerRegistered = true;

    client.auth.onAuthStateChange(async (event, session) => {
        console.log(`[Supabase Auth Listener] Event: ${event}`, session ? session.user?.email : 'no-session');
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (session && session.user) {
                await waseetSyncAuthState({ session, force: true });
                updateAuthUI(WASEET_STATE?.user || session.user);
                await waseetUpdateAdminPendingDepositsBadge();
                await waseetUpdateAdminPendingWithdrawalsBadge();
                waseetSyncAllNavBadges();
            }
        } else if (event === 'SIGNED_OUT') {
            if (typeof WASEET_STATE !== 'undefined') {
                WASEET_STATE.user = null;
                if (typeof saveWaseetData === 'function') saveWaseetData();
            }
            try { localStorage.removeItem('WASEET_SAVED_USER_PERMANENT'); } catch (e) {}
            updateAuthUI(null);
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
        waseetInitLiveRoleAndSessionSync();
        waseetSyncAllNavBadges();
        waseetInitGlobalNavRealtimeBadges();
        waseetSyncAuthState({ force: true });
        setTimeout(waseetUpdateAdminPendingDepositsBadge, 800);
        setTimeout(waseetUpdateAdminPendingWithdrawalsBadge, 850);
    }
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', runInitialEnhancements);
    } else {
        runInitialEnhancements();
    }
}
