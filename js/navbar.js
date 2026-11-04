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
        if (user.role === 'regional_broker' || user.role === 'broker' || user.role === 'user') return false;
        try {
            if (typeof isStrictAdmin === 'function') return !!isStrictAdmin(user);
            if (typeof isSuperAdmin === 'function') return !!isSuperAdmin(user);
        } catch (e) { /* تجاهل */ }
        return user.role === 'admin' || user.isAdmin === true;
    }

    function isBrokerUser(user) {
        if (!user) return false;
        if (isAdminUser(user)) return false;
        try {
            if (typeof isRegionalBroker === 'function' && isRegionalBroker(user)) return true;
        } catch (e) { /* تجاهل */ }
        return user.role === 'regional_broker' || user.role === 'broker' || user.isBroker === true || user.brokerRole === 'broker';
    }

    var COUNTRY_NAMES_AR = {
        DZ: 'الجزائر', MA: 'المغرب', TN: 'تونس', LY: 'ليبيا', EG: 'مصر',
        SA: 'السعودية', AE: 'الإمارات', KW: 'الكويت', QA: 'قطر', BH: 'البحرين',
        OM: 'سلطنة عُمان', JO: 'الأردن', IQ: 'العراق', SY: 'سوريا', LB: 'لبنان',
        PS: 'فلسطين', YE: 'اليمن', SD: 'السودان', MR: 'موريتانيا', SO: 'الصومال',
        DJ: 'جيبوتي', KM: 'جزر القمر'
    };

    function renderBrokerSupervisionBanner(user) {
        var existing = byId('waseet-broker-supervision-bar');
        if (!isBrokerUser(user)) {
            if (existing) existing.style.display = 'none';
            return;
        }
        var header = document.querySelector('.header-navbar');
        if (!header) return;

        var code = String(user.country || 'DZ').toUpperCase();
        var countryAr = COUNTRY_NAMES_AR[code] || code;
        var flagSvg = 'assets/flags/' + code.toLowerCase() + '.svg';
        var pts = (user && user.wallet) ? (Number(user.wallet.available) || 0) : 0;

        if (!existing) {
            existing = document.createElement('div');
            existing.id = 'waseet-broker-supervision-bar';
            existing.style.cssText = 'background: linear-gradient(90deg, rgba(16,185,129,0.16), rgba(13,17,26,0.96), rgba(197,160,89,0.14)); border-bottom: 1px solid rgba(16,185,129,0.45); padding: 0.55rem 1rem; position: relative; z-index: 90;';
            header.insertAdjacentElement('afterend', existing);
        }

        existing.style.display = 'block';
        existing.innerHTML =
            '<div class="container" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.65rem;">' +
                '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">' +
                    '<span style="display:inline-flex;align-items:center;gap:0.4rem;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.55);color:#34d399;padding:0.25rem 0.65rem;border-radius:999px;font-size:0.78rem;font-weight:800;">' +
                        '<i class="fas fa-user-shield"></i> شريط إشراف الوسيط الإقليمي المعتمد' +
                    '</span>' +
                    '<span style="display:inline-flex;align-items:center;gap:0.35rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#f8fafc;padding:0.22rem 0.6rem;border-radius:8px;font-size:0.76rem;font-weight:700;">' +
                        '<img src="' + esc(flagSvg) + '" alt="' + esc(code) + '" style="width:18px;height:13px;border-radius:2px;object-fit:cover;" onerror="this.style.display=\'none\'">' +
                        '<span>إقليم الوساطة: ' + esc(countryAr) + ' (' + esc(code) + ')</span>' +
                    '</span>' +
                    '<span style="color:var(--gold-light);font-size:0.76rem;font-weight:700;"><i class="fas fa-percentage"></i> عمولتك: 66.6% من صفقات دولتك (رصيدك: ' + pts + ' نقطة)</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;">' +
                    '<a href="deals.html" class="btn-3d btn-outline" style="padding:0.28rem 0.68rem;font-size:0.75rem;border-color:#10b981;color:#34d399;text-decoration:none;display:inline-flex;align-items:center;gap:0.35rem;">' +
                        '<i class="fas fa-handshake"></i> إدارة صفقات الوساطة' +
                    '</a>' +
                    '<a href="pending-accounts.html" class="btn-3d btn-outline" style="padding:0.28rem 0.68rem;font-size:0.75rem;border-color:var(--orange-bright);color:var(--orange-bright);text-decoration:none;display:inline-flex;align-items:center;gap:0.35rem;">' +
                        '<i class="fas fa-clipboard-check"></i> فحص الحسابات المعلقة' +
                    '</a>' +
                    '<a href="chat.html" class="btn-3d btn-outline" style="padding:0.28rem 0.68rem;font-size:0.75rem;border-color:var(--gold-primary);color:var(--gold-light);text-decoration:none;display:inline-flex;align-items:center;gap:0.35rem;">' +
                        '<i class="fas fa-comments"></i> غرفة الوساطة المباشرة' +
                    '</a>' +
                    '<a href="admin-chats.html" class="btn-3d btn-outline" style="padding:0.28rem 0.68rem;font-size:0.75rem;border-color:rgba(255,255,255,0.25);color:#e2e8f0;text-decoration:none;display:inline-flex;align-items:center;gap:0.35rem;">' +
                        '<i class="fas fa-headset"></i> محادثات المشترين' +
                    '</a>' +
                '</div>' +
            '</div>';
    }
    window.waseetRenderBrokerSupervisionBanner = renderBrokerSupervisionBanner;

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
            if (anchor.parentElement && anchor.parentElement.classList.contains('drawer-header')) {
                anchor.parentElement.insertAdjacentElement('afterend', row);
            } else {
                anchor.insertAdjacentElement('afterend', row);
            }
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
        var broker = !admin && isBrokerUser(user);
        var pts = (user && user.wallet) ? (Number(user.wallet.available) || 0) : 0;

        document.body.classList.toggle('is-admin-mode', admin);
        document.body.classList.toggle('is-broker-mode', broker);

        var userGroup = byId('nav-user-middle-group');
        var adminGroup = byId('nav-admin-middle-group');
        if (userGroup) userGroup.style.display = (admin || broker) ? 'none' : '';
        if (adminGroup) adminGroup.style.display = (admin || broker) ? 'flex' : 'none';

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
                var role = broker
                    ? '🌍 وسيط إقليمي معتمد (' + (user.country || 'DZ') + ')'
                    : (admin ? '👑 الوسيط المعتمد (المدير)' : '🏷️ عضو موثق');
                card.innerHTML =
                    '<img src="' + esc(userAvatar(user)) + '" class="drawer-avatar" alt="' + esc(user.name) + '" referrerpolicy="no-referrer" ' +
                    'onerror="this.onerror=null;this.src=\'' + DEFAULT_AVATAR + '\'">' +
                    '<div class="drawer-user-meta"><span class="drawer-user-name">' + esc(user.name) + '</span>' +
                    '<span class="drawer-user-role">' + role + '</span>' +
                    '<span class="drawer-user-pts"><i class="fas fa-coins text-gold"></i> ' + pts + ' نقطة متاحة</span></div>';
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

        // روابط القائمة الجانبية والشريط المخصصة للمدير والوسيط الإقليمي
        document.querySelectorAll('.btn-nav-admin').forEach(function (el) {
            var href = String(el.getAttribute('href') || '');
            var isStrictAdminOnlyLink = href.indexOf('admin-brokers') !== -1 || href.indexOf('admin-deposits') !== -1 || href.indexOf('admin-withdrawals') !== -1;
            var canShow = admin || (broker && !isStrictAdminOnlyLink);
            el.style.display = canShow ? (el.classList.contains('btn-nav-middle') ? 'inline-flex' : '') : 'none';
        });
        document.querySelectorAll('[data-admin-only]').forEach(function (el) {
            el.style.display = admin ? '' : 'none';
        });
        var drawerBrokers = byId('drawer-admin-brokers-link');
        if (drawerBrokers) drawerBrokers.style.display = admin ? 'flex' : 'none';
        var drawerDeposits = byId('drawer-admin-deposits-link');
        if (drawerDeposits) drawerDeposits.style.display = admin ? 'flex' : 'none';
        var drawerWithdrawals = byId('drawer-admin-withdrawals-link');
        if (drawerWithdrawals) drawerWithdrawals.style.display = admin ? 'flex' : 'none';

        renderBrokerSupervisionBanner(user);

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
        } else {
            renderBrokerSupervisionBanner(currentUser());
            setTimeout(function () { renderBrokerSupervisionBanner(currentUser()); }, 900);
            setTimeout(function () { renderBrokerSupervisionBanner(currentUser()); }, 2500);
        }

        refreshDrawerExtras();
        // مزامنة دورية خفيفة لرصيد المحفظة وشريط إشراف الوسيط الإقليمي
        setInterval(function () {
            refreshDrawerExtras();
            renderBrokerSupervisionBanner(currentUser());
        }, 2500);

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
