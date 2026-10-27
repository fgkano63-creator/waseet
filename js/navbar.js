/**
 * WASEET (وسيط) - وحدة التنقل المشتركة (Shared Navigation Helper)
 *
 * تعمل على جميع الصفحات التي تحتوي على الشريط العلوي (header-navbar) والقائمة الجانبية (drawer):
 *  1) window.toggleWaseetDrawer(): فتح/إغلاق القائمة الجانبية للصفحات التي لا تملك دالة خاصة (الإدارة والملفات العامة).
 *  2) بطاقة "رصيد المحفظة" داخل القائمة الجانبية (لأن شارة الرصيد تُخفى من الشريط العلوي على الجوال ≤ 768px).
 *  3) اختصار "ملفي ومتجري" داخل القائمة الجانبية يقود إلى profile.html?id=<معرّف المستخدم>.
 *  4) رسم الشريط العلوي تلقائياً (المحفظة/الحساب/المجموعة الإدارية) للصفحات المعلَّمة بـ <body data-waseet-nav="auto">.
 */
(function () {
    'use strict';

    var DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

    function byId(id) { return document.getElementById(id); }

    function esc(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function currentUser() {
        try {
            return (typeof WASEET_STATE !== 'undefined' && WASEET_STATE && WASEET_STATE.user) ? WASEET_STATE.user : null;
        } catch (e) {
            return null;
        }
    }

    function isAdminUser(user) {
        if (!user) return false;
        try {
            if (typeof isMediatorUser === 'function') return !!isMediatorUser(user);
        } catch (e) { /* تجاهل */ }
        return user.role === 'admin' || user.role === 'mediator' || user.isAdmin === true;
    }

    function userAvatar(user) {
        return (user && ((user.user_metadata && user.user_metadata.avatar_url) || user.avatar)) || DEFAULT_AVATAR;
    }

    function getDrawer() {
        return byId('mobile-drawer') || byId('mobile-drawer-sidebar') || document.querySelector('.mobile-drawer');
    }

    function getOverlay() {
        return byId('drawer-overlay') || byId('mobile-drawer-overlay') || document.querySelector('.drawer-overlay');
    }

    /* ======================================================================
       1) فتح / إغلاق القائمة الجانبية
       ====================================================================== */
    function toggleWaseetDrawer(force) {
        var drawer = getDrawer();
        var overlay = getOverlay();
        if (!drawer) return;
        var shouldOpen = (typeof force === 'boolean') ? force : !drawer.classList.contains('active');
        drawer.classList.toggle('active', shouldOpen);
        if (overlay) overlay.classList.toggle('active', shouldOpen);
        if (shouldOpen) refreshDrawerExtras();
    }
    window.toggleWaseetDrawer = toggleWaseetDrawer;

    /* ======================================================================
       2 + 3) بطاقة المحفظة واختصار "ملفي ومتجري" داخل القائمة الجانبية
       ====================================================================== */
    function ensureWalletRow(drawer) {
        var row = drawer.querySelector('.drawer-wallet-row');
        if (!row) {
            var anchor = drawer.querySelector('.drawer-user-card');
            if (!anchor) return null;
            row = document.createElement('a');
            row.className = 'drawer-wallet-row';
            row.href = 'wallet.html';
            row.title = 'محفظتي وشحن النقاط';
            row.innerHTML = '<span class="dw-label"><i class="fas fa-wallet"></i> رصيد المحفظة</span>' +
                            '<span class="dw-amount">0 نقطة</span>';
            anchor.insertAdjacentElement('afterend', row);
        }
        return row;
    }

    function ensureMyStoreLink(drawer, user) {
        var link = drawer.querySelector('#drawer-my-store-link');
        var grid = drawer.querySelector('.drawer-shortcuts-grid');
        if (!grid) return;
        if (!user || !user.id) {
            if (link) link.style.display = 'none';
            return;
        }
        if (!link) {
            link = document.createElement('a');
            link.id = 'drawer-my-store-link';
            link.className = 'drawer-shortcut-card';
            link.innerHTML = '<i class="fas fa-store-alt text-gold"></i><span>ملفي ومتجري</span>';
            grid.appendChild(link);
        }
        link.href = 'profile.html?id=' + encodeURIComponent(user.id);
        link.style.display = '';
    }

    function refreshDrawerExtras() {
        var user = currentUser();
        document.querySelectorAll('.mobile-drawer, .mobile-drawer-sidebar').forEach(function (drawer) {
            var row = ensureWalletRow(drawer);
            if (row) {
                row.style.display = user ? '' : 'none';
                var amt = row.querySelector('.dw-amount');
                var pts = (user && user.wallet) ? (Number(user.wallet.available) || 0) : 0;
                if (amt) amt.textContent = pts + ' نقطة';
            }
            ensureMyStoreLink(drawer, user);
        });
    }
    window.waseetRefreshDrawerExtras = refreshDrawerExtras;

    /* ======================================================================
       4) الرسم التلقائي للشريط العلوي (للصفحات المعلَّمة data-waseet-nav="auto")
       ====================================================================== */
    function autoRenderNavbar() {
        var user = currentUser();
        var admin = isAdminUser(user);
        var pts = (user && user.wallet) ? (Number(user.wallet.available) || 0) : 0;

        document.body.classList.toggle('is-admin-mode', admin);

        var userGroup = byId('nav-user-middle-group');
        var adminGroup = byId('nav-admin-middle-group');
        if (userGroup) userGroup.style.display = admin ? 'none' : '';
        if (adminGroup) adminGroup.style.display = admin ? 'flex' : 'none';

        ['wallet-total-pts', 'admin-wallet-total-pts'].forEach(function (id) {
            var el = byId(id);
            if (el) el.textContent = pts + ' نقطة';
        });
        var walletPill = byId('wallet-pill-btn');
        if (walletPill) walletPill.style.display = user ? '' : 'none';

        // زر الحساب في الشريط العلوي (يظهر على الكمبيوتر فقط، ويُخفى على الجوال ≤ 768px)
        var box = byId('nav-user-container');
        if (box) {
            if (user) {
                box.innerHTML =
                    '<div class="user-profile-pill" role="button" title="' + esc(user.name) + ' - فتح القائمة" onclick="toggleWaseetDrawer(true)">' +
                    '<img src="' + esc(userAvatar(user)) + '" alt="' + esc(user.name) + '" class="user-avatar-img" referrerpolicy="no-referrer" ' +
                    'onerror="this.onerror=null;this.src=\'' + DEFAULT_AVATAR + '\'">' +
                    '</div>';
            } else {
                box.innerHTML =
                    '<button type="button" class="btn-3d btn-outline btn-nav-login" onclick="if(typeof waseetSignInWithGoogle===\'function\') waseetSignInWithGoogle();">' +
                    '<i class="fas fa-user-circle text-gold"></i> <span>تسجيل الدخول</span></button>';
            }
        }

        // بطاقة المستخدم وأزرار الدخول/الخروج داخل القائمة الجانبية
        var card = byId('drawer-user-card');
        if (card) {
            if (user) {
                var role = admin ? '👑 الوسيط المعتمد (المدير)' : '🏷️ عضو موثق';
                card.innerHTML =
                    '<img src="' + esc(userAvatar(user)) + '" class="drawer-avatar" alt="' + esc(user.name) + '" referrerpolicy="no-referrer" ' +
                    'onerror="this.onerror=null;this.src=\'' + DEFAULT_AVATAR + '\'">' +
                    '<div class="drawer-user-meta"><span class="drawer-user-name">' + esc(user.name) + '</span>' +
                    '<span class="drawer-user-role">' + role + '</span></div>';
            } else {
                card.innerHTML =
                    '<div class="drawer-avatar" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);color:var(--silver-muted);font-size:1.3rem;">' +
                    '<i class="fas fa-user-circle text-gold"></i></div>' +
                    '<div class="drawer-user-meta"><span class="drawer-user-name">زائر غير مسجل</span>' +
                    '<span class="drawer-user-role" style="color: var(--gold-light);">سجّل دخولك للاستفادة من كل المزايا</span></div>';
            }
        }

        var auth = byId('drawer-auth-actions');
        if (auth) {
            if (user) {
                auth.innerHTML =
                    '<button type="button" class="btn-3d btn-outline" style="width:100%;border-color:#ef4444;color:#ef4444;" onclick="waseetNavSignOut()">' +
                    '<i class="fas fa-sign-out-alt"></i> تسجيل الخروج</button>';
            } else {
                auth.innerHTML =
                    '<button type="button" class="btn-social-login btn-social-google" onclick="if(typeof waseetSignInWithGoogle===\'function\') waseetSignInWithGoogle();">' +
                    '<i class="fab fa-google" style="color:#ea4335;"></i> المتابعة باستخدام Google</button>';
            }
        }

        // روابط القائمة الجانبية المخصصة للمدير فقط
        document.querySelectorAll('[data-admin-only]').forEach(function (el) {
            el.style.display = admin ? '' : 'none';
        });

        if (typeof window.waseetSyncAllNavBadges === 'function') {
            try { window.waseetSyncAllNavBadges(); } catch (e) { /* تجاهل */ }
        }
        refreshDrawerExtras();
    }

    window.waseetNavSignOut = async function () {
        try {
            if (typeof waseetSignOut === 'function') await waseetSignOut();
        } catch (e) { /* تجاهل */ }
        window.location.reload();
    };

    /* ======================================================================
       التهيئة
       ====================================================================== */
    function init() {
        var auto = document.body && document.body.getAttribute('data-waseet-nav') === 'auto';

        if (auto) {
            // supabase.js يستدعي renderNavbarUser() تلقائياً بعد مزامنة الجلسة
            if (typeof window.renderNavbarUser !== 'function') {
                window.renderNavbarUser = autoRenderNavbar;
            }
            autoRenderNavbar();
            // إعادة الرسم بعد اكتمال استعادة الجلسة من Supabase
            setTimeout(autoRenderNavbar, 900);
            setTimeout(autoRenderNavbar, 2500);
        }

        refreshDrawerExtras();
        // مزامنة دورية خفيفة لرصيد المحفظة داخل القائمة الجانبية
        setInterval(refreshDrawerExtras, 2500);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var drawer = getDrawer();
                if (drawer && drawer.classList.contains('active')) toggleWaseetDrawer(false);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
