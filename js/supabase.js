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

        // تحديث عناصر الواجهة فوراً وظهور الصورة والتاج في الشريط العلوي
        if (typeof updateDrawerProfile === 'function') updateDrawerProfile();
        if (typeof updateChatDrawerProfile === 'function') updateChatDrawerProfile();
        if (window.waseetApp) {
            if (typeof window.waseetApp.renderUserProfile === 'function') {
                window.waseetApp.renderUserProfile();
            }
            if (typeof window.waseetApp.updateWalletDisplay === 'function') {
                window.waseetApp.updateWalletDisplay();
            }
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
    });
}
