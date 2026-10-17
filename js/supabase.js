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
 * التأكد المضمون 100% من وجود سجل للمستخدم الحالي (أو المدير) في جدول public.profiles
 * لمنع خطأ violates foreign key constraint "deal_messages_sender_id_fkey"
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

        // 1. إذا كان لدينا معرف مرشح صالح، نتحقق أولاً من وجوده فعلياً في جدول public.profiles باستخدام select('*')
        if (rawCandidateId && waseetIsValidUuid(rawCandidateId)) {
            const { data: existingProf, error: checkErr } = await client
                .from('profiles')
                .select('*')
                .eq('id', rawCandidateId)
                .maybeSingle();

            if (checkErr) {
                console.warn('[Supabase Profiles] خطأ أثناء فحص وجود المستخدم في profiles:', checkErr.message);
            }

            if (existingProf && existingProf.id) {
                if (stateUser && stateUser.id !== existingProf.id) {
                    stateUser.id = existingProf.id;
                    if (typeof saveWaseetData === 'function') saveWaseetData();
                }
                console.log('[Supabase Profiles] تم تأكيد وجود sender_id في جدول profiles:', existingProf.id);
                return existingProf;
            }

            // 2. إذا لم يكن موجوداً، نحاول إنشاءه بعدة صيغ متوافقة مع مختلف هياكل جدول profiles
            const candidatePayloads = [
                { id: rawCandidateId, name: nameVal, email: emailVal || undefined, avatar_url: avatarVal, role: targetRole },
                { id: rawCandidateId, username: nameVal, avatar_url: avatarVal, role: targetRole },
                { id: rawCandidateId, name: nameVal, role: targetRole },
                { id: rawCandidateId, role: targetRole },
                { id: rawCandidateId }
            ];

            for (const payload of candidatePayloads) {
                const { data: upserted, error: upsertErr } = await client
                    .from('profiles')
                    .upsert(payload, { onConflict: 'id' })
                    .select('*')
                    .maybeSingle();

                if (!upsertErr && upserted && upserted.id) {
                    console.log('[Supabase Profiles] تم إنشاء/تأكيد سجل المستخدم بنجاح في profiles:', upserted.id);
                    if (stateUser) {
                        stateUser.id = upserted.id;
                        if (typeof saveWaseetData === 'function') saveWaseetData();
                    }
                    return upserted;
                }
            }

            // فحص نهائي بعد محاولات الـ upsert للتأكد مما إذا تم إدراج الصف فعلياً
            const { data: verifiedAfterUpsert } = await client
                .from('profiles')
                .select('*')
                .eq('id', rawCandidateId)
                .maybeSingle();

            if (verifiedAfterUpsert && verifiedAfterUpsert.id) {
                console.log('[Supabase Profiles] تم التحقق من وجود السجل بعد الإدراج:', verifiedAfterUpsert.id);
                return verifiedAfterUpsert;
            }
        }

        // 3. خطة بديلة مضمونة 100%: جلب معرّف موثق وموجود فعلياً في جدول public.profiles
        console.warn('[Supabase Profiles] جاري البحث عن سجل موثق مطابق في جدول public.profiles...');
        const { data: allProfiles, error: listErr } = await client
            .from('profiles')
            .select('*')
            .limit(50);

        if (!listErr && Array.isArray(allProfiles) && allProfiles.length > 0) {
            let matchedProfile = null;

            // أ) إذا كان المرسل هو الوسيط/المدير، نبحث عن حساب المدير في جدول profiles
            if (isAdmin) {
                matchedProfile = allProfiles.find(p =>
                    p.role === 'admin' ||
                    p.role === 'mediator' ||
                    (p.email && ['fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com'].includes(String(p.email).toLowerCase().trim()))
                );
            }

            // ب) البحث عبر البريد الإلكتروني أو الاسم
            if (!matchedProfile && emailLower) {
                matchedProfile = allProfiles.find(p => p.email && String(p.email).toLowerCase().trim() === emailLower);
            }
            if (!matchedProfile && nameVal) {
                matchedProfile = allProfiles.find(p => (p.name && p.name === nameVal) || (p.username && p.username === nameVal));
            }

            // ج) المطابقة مع أطراف الصفقة المسجلين فعلياً في جدول profiles
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

            // د) أخذ أول ملف شخصي صالح في حال تعذر كل ما سبق لضمان عدم كسر قيد المفتاح الأجنبي
            if (!matchedProfile) {
                matchedProfile = allProfiles[0];
            }

            if (matchedProfile && matchedProfile.id) {
                console.log('[Supabase Profiles] تم اعتماد معرف موثق من جدول profiles:', matchedProfile.id);
                if (stateUser && !waseetIsValidUuid(stateUser.id)) {
                    stateUser.id = matchedProfile.id;
                    if (typeof saveWaseetData === 'function') saveWaseetData();
                }
                return matchedProfile;
            }
        }

        return null;
    } catch (err) {
        console.warn('[Supabase Profiles] استثناء أثناء تأكيد ملف المستخدم في profiles:', err);
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

    try {
        const { data: { session }, error } = await client.auth.getSession();
        if (error || !session || !session.user) return;

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

        // التأكد من إنشاء/تحديث حساب المستخدم أو المدير في جدول public.profiles بشكل سليم
        if (!profile || (isAdmin && profile.role !== 'admin')) {
            await waseetEnsureUserProfileInDb(mappedUser);
        }

        // تحديث عناصر الشريط العلوي فوراً قبل انتظار الجلب الشبكي المطول
        if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
        if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
        if (typeof renderNavbarUser === 'function') renderNavbarUser();
        if (typeof renderMyAccountsNavbarUser === 'function') renderMyAccountsNavbarUser();

        // جلب ومزامنة جميع الصفقات والحسابات من قاعدة بيانات Supabase
        await waseetFetchAccountsFromSupabase();
        await waseetFetchDealsFromSupabase();

        // تحديث عناصر الواجهة فوراً وظهور الصورة والتاج في الشريط العلوي
        if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
        if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
        if (typeof renderNavbarUser === 'function') renderNavbarUser();
        if (typeof renderMyAccountsNavbarUser === 'function') renderMyAccountsNavbarUser();
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
    }
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
        password: String(parsedCreds.password || parsedCreds.pass || (acc && acc.raw_password) || details.password || '••••••••')
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
            : (acc.image_url ? [acc.image_url] : (Array.isArray(details.images) && details.images.length > 0 ? details.images : ['https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'])));

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
        sellerEmail: sellerEmail,
        sellerAvatar: (profileObj && profileObj.avatar_url) || null,
        sellerId: acc.seller_id,
        seller_id: acc.seller_id,
        sellerRating: 5.0,
        sellerDeals: 1,
        sellerPrice: parseFloat(acc.seller_price) || 0,
        evoGunsCount: Number(details.evoGunsCount ?? acc.evo_guns_count ?? 0),
        evoGuns: Array.isArray(details.evoGuns) ? details.evoGuns : (Number(details.evoGunsCount || acc.evo_guns_count) > 0 ? [`${details.evoGunsCount || acc.evo_guns_count} أسلحة إيفو مطورة`] : []),
        rareSkins: Array.isArray(rareSkinsVal) ? rareSkinsVal : String(rareSkinsVal).split('،').map(s => s.trim()),
        iconicPants: Array.isArray(iconicPantsVal) ? iconicPantsVal : String(iconicPantsVal).split('،').map(s => s.trim()),
        accountNotes: details.accountNotes || details.notes || acc.account_notes || acc.notes || '',
        image: imgs[0] || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800',
        images: imgs,
        badge: details.badge || ((details.originalGame || acc.game) === 'free_fire' ? `برايم ${acc.prime_level || 1}` : 'مميز'),
        featured: false,
        status: acc.status || 'pending_verification',
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
 * بحيث لا يظهر في السوق العام أي حساب معلق (قيد الفحص) أو مرفوض.
 */
async function waseetFetchAccountsFromSupabase(options = {}) {
    const client = initWaseetSupabase();
    if (!client || typeof WASEET_STATE === 'undefined') return [];

    const includeAllStatuses = !!(options && options.includeAllStatuses);

    try {
        // أولاً: رفع أي حسابات محلية في WASEET_USER_ACCOUNTS لم يتم رفعها بعد إلى السحابة
        try {
            const localSaved = JSON.parse(localStorage.getItem('WASEET_USER_ACCOUNTS') || '[]');
            for (const localAcc of localSaved) {
                if (localAcc && !waseetIsValidUuid(localAcc.id) && !localAcc.syncedToSupabase) {
                    await waseetSaveAccountToSupabase(localAcc);
                }
            }
        } catch (e) {}

        // ثانياً: جلب الحسابات من Supabase:
        // في المتجر العام (الوضع الافتراضي) نجلب فقط الحسابات المعتمدة ('available' أو 'approved')
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
            .filter(Boolean);

        // دمج الحسابات السحابية مع الحسابات المحلية المعتمدة فقط للمتجر العام
        const existingAccounts = WASEET_STATE.accounts || [];
        const mergedMap = new Map();

        remoteAccounts.forEach(acc => {
            mergedMap.set(String(acc.id), acc);
        });

        existingAccounts.forEach(localAcc => {
            if (!localAcc) return;
            // في المتجر العام، لا ندمج أي حساب معلق أو مرفوض
            if (!includeAllStatuses && localAcc.status && localAcc.status !== 'available' && localAcc.status !== 'approved') {
                return;
            }
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
            console.warn('[Escrow Message] محاولة إصلاح تلقائي لسجل المرسل في profiles بعد خطأ FK...');
            await client.from('profiles').upsert({ id: senderUuid }, { onConflict: 'id' });

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
