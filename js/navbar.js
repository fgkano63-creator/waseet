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
        if (user.role === 'regional_broker' || user.role === 'broker' || user.isBroker === true || user.brokerRole === 'broker') return true;
        try {
            if (typeof isRegionalBroker === 'function' && isRegionalBroker(user)) return true;
        } catch (e) { /* تجاهل */ }
        try {
            var rawAvatar = String(user.avatar || (user.user_metadata && user.user_metadata.avatar_url) || '');
            if (rawAvatar.indexOf('#waseet_broker=') !== -1) return true;
        } catch (e) {}
        try {
            var rawCache = localStorage.getItem('WASEET_REGIONAL_BROKERS_CACHE');
            if (rawCache) {
                var list = JSON.parse(rawCache);
                if (Array.isArray(list)) {
                    var uId = String(user.id || '').trim();
                    var uEmail = String(user.email || '').toLowerCase().trim();
                    return list.some(function (b) {
                        return b && b.is_active !== false && (
                            (uId && String(b.id || b.user_id || '') === uId) ||
                            (uEmail && String(b.email || '').toLowerCase().trim() === uEmail)
                        );
                    });
                }
            }
        } catch (e) {}
        return false;
    }

    var COUNTRY_NAMES_AR = {
        DZ: 'الجزائر', MA: 'المغرب', TN: 'تونس', LY: 'ليبيا', EG: 'مصر',
        SA: 'السعودية', AE: 'الإمارات', KW: 'الكويت', QA: 'قطر', BH: 'البحرين',
        OM: 'سلطنة عُمان', JO: 'الأردن', IQ: 'العراق', SY: 'سوريا', LB: 'لبنان',
        PS: 'فلسطين', YE: 'اليمن', SD: 'السودان', MR: 'موريتانيا', SO: 'الصومال',
        DJ: 'جيبوتي', KM: 'جزر القمر'
    };

    /**
     * دمج أزرار الإشراف في الشريط العلوي الأساسي (Navbar Unification)
     * إزالة أي شريط إشراف إضافي منفصل ودمج أدوات الوسيط مباشرة داخل الشريط العلوي الموحد
     */
    function renderUnifiedBrokerNavLinks(user) {
        var userGroup = byId('nav-user-middle-group');
        var isBroker = isBrokerUser(user);

        // إزالة أي شريط إشراف منفصل تحت الـ Navbar نهائياً
        var existingSubBar = byId('waseet-broker-supervision-bar');
        if (existingSubBar) {
            existingSubBar.remove();
        }

        if (!userGroup) return;

        var existingBrokerWrap = byId('unified-broker-nav-items');
        var oldBrokerBtn = byId('broker-supervision-nav-btn');
        if (oldBrokerBtn) oldBrokerBtn.remove();

        if (!isBroker) {
            if (existingBrokerWrap) existingBrokerWrap.remove();
            userGroup.querySelectorAll('.btn-nav-broker').forEach(function (el) { el.remove(); });
            return;
        }

        if (!existingBrokerWrap) {
            existingBrokerWrap = document.createElement('div');
            existingBrokerWrap.id = 'unified-broker-nav-items';
            existingBrokerWrap.className = 'unified-broker-nav-group';
            existingBrokerWrap.style.cssText = 'display: inline-flex; align-items: center; gap: 0.35rem;';
            userGroup.appendChild(existingBrokerWrap);
        }

        var curPath = (window.location.pathname || '').toLowerCase();
        var isDealsPage = curPath.indexOf('deals') !== -1;
        var isPendingPage = curPath.indexOf('pending-accounts') !== -1;
        var isDepositsPage = curPath.indexOf('admin-deposits') !== -1;
        var isChatsPage = curPath.indexOf('admin-chats') !== -1;

        existingBrokerWrap.innerHTML =
            '<a href="deals.html" class="btn-nav-middle btn-nav-broker' + (isDealsPage ? ' active' : '') + '" style="border: 1px solid rgba(16, 185, 129, 0.45); background: rgba(16, 185, 129, 0.12); color: #34d399; font-weight: 700;" title="إدارة صفقات قيد الشراء">' +
                '<i class="fas fa-shield-alt text-emerald"></i> <span>قيد الشراء</span>' +
                '<span class="deals-badge-count admin-deals-badge" id="broker-unified-deals-badge" style="display: none;">0</span>' +
            '</a>' +
            '<a href="pending-accounts.html" class="btn-nav-middle btn-nav-broker' + (isPendingPage ? ' active' : '') + '" style="border: 1px solid rgba(245, 158, 11, 0.45); background: rgba(245, 158, 11, 0.12); color: #fbbf24; font-weight: 700;" title="فحص الحسابات قيد الفحص">' +
                '<i class="fas fa-clipboard-check text-orange"></i> <span>قيد الفحص</span>' +
                '<span class="deals-badge-count admin-pending-badge" id="broker-unified-pending-badge" style="display: none;">0</span>' +
            '</a>' +
            '<a href="admin-deposits.html" class="btn-nav-middle btn-nav-broker' + (isDepositsPage ? ' active' : '') + '" style="border: 1px solid rgba(234, 179, 8, 0.45); background: rgba(234, 179, 8, 0.12); color: #facc15; font-weight: 700;" title="إدارة طلبات شحن النقاط">' +
                '<i class="fas fa-coins text-gold"></i> <span>شحن النقاط</span>' +
                '<span class="deals-badge-count admin-deposits-badge" id="broker-unified-deposits-badge" style="display: none;">0</span>' +
            '</a>' +
            '<a href="admin-chats.html" class="btn-nav-middle btn-nav-broker' + (isChatsPage ? ' active' : '') + '" style="border: 1px solid rgba(14, 165, 233, 0.45); background: rgba(14, 165, 233, 0.12); color: #38bdf8; font-weight: 700;" title="محادثات الإدارة والوساطة">' +
                '<i class="fas fa-headset text-gold"></i> <span>محادثات الإدارة</span>' +
                '<span class="deals-badge-count chats-unread-badge" style="display: none;"></span>' +
            '</a>';
    }

    function renderBrokerSupervisionBanner(user) {
        // تفكيك وإزالة أي شريط إشراف إضافي تحت الـ Navbar ودمج كافة الأزرار داخل الشريط العلوي الأساسي
        renderUnifiedBrokerNavLinks(user);
    }
    window.waseetRenderBrokerSupervisionBanner = renderBrokerSupervisionBanner;
    window.waseetRenderUnifiedBrokerNavLinks = renderUnifiedBrokerNavLinks;

    function userAvatar(user) {
        return (user && ((user.user_metadata && user.user_metadata.avatar_url) || user.avatar)) || DEFAULT_AVATAR;
    }

    function getDrawer() {
        return byId('mobile-drawer-sidebar') || byId('mobile-drawer') || document.querySelector('.mobile-drawer-sidebar') || document.querySelector('.mobile-drawer');
    }

    function getOverlay() {
        return byId('mobile-drawer-overlay') || byId('drawer-overlay') || document.querySelector('.mobile-drawer-overlay') || document.querySelector('.drawer-overlay');
    }

    function getUniversalDrawerHtml() {
        return '<div class="mobile-drawer-overlay drawer-overlay" id="mobile-drawer-overlay" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()"></div>' +
            '<aside class="mobile-drawer-sidebar mobile-drawer" id="mobile-drawer-sidebar">' +
                '<div class="drawer-header">' +
                    '<div class="drawer-brand">' +
                        '<img src="assets/icons/icon-192.png" alt="منصة وسيط" class="drawer-logo" onerror="this.onerror=null; this.src=\'assets/logo.png\'">' +
                        '<span class="drawer-title">منصة وسيط</span>' +
                    '</div>' +
                    '<button class="drawer-close-btn" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()" aria-label="إغلاق">&times;</button>' +
                '</div>' +
                '<div class="drawer-user-card" id="drawer-user-card"></div>' +
                '<div id="drawer-regional-broker-card"></div>' +
                '<a href="wallet.html" class="drawer-wallet-row" id="drawer-wallet-row" title="محفظتي وشحن النقاط" style="display: none;">' +
                    '<span class="dw-label"><i class="fas fa-wallet"></i> رصيد المحفظة</span>' +
                    '<span class="dw-amount" id="drawer-wallet-pts">0 نقطة</span>' +
                '</a>' +
                '<div class="drawer-section">' +
                    '<h4 class="drawer-section-title">اختصاراتك والخدمات</h4>' +
                    '<div class="drawer-shortcuts-grid">' +
                        '<a href="index.html#marketplace" class="drawer-shortcut-card" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-store text-gold"></i><span>سوق الحسابات</span>' +
                        '</a>' +
                        '<a href="chat.html" class="drawer-shortcut-card" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-comments text-orange"></i><span>غرفة الوساطة</span>' +
                        '</a>' +
                        '<a href="deals.html" class="drawer-shortcut-card" id="drawer-deals-link" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-shield-alt text-gold"></i><span>قيد الشراء</span>' +
                            '<span class="deals-badge-count admin-deals-badge" id="drawer-deals-badge" style="display: none;">0</span>' +
                        '</a>' +
                        '<a href="pending-accounts.html" class="drawer-shortcut-card" id="drawer-btn-pending-verification" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe();" style="display: none;">' +
                            '<i class="fas fa-clipboard-check text-orange"></i><span>حسابات قيد الفحص</span>' +
                            '<span class="deals-badge-count admin-pending-badge" id="drawer-pending-count" style="display: none;">0</span>' +
                        '</a>' +
                        '<a href="index.html#open-sell" class="drawer-shortcut-card" id="drawer-btn-sell-modal" onclick="if(window.waseetApp && window.waseetApp.openSellModal){window.waseetApp.openSellModal();} window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe();">' +
                            '<i class="fas fa-plus-circle text-orange"></i><span>بيع حساب</span>' +
                        '</a>' +
                        '<a href="my-accounts.html" class="drawer-shortcut-card" id="drawer-btn-seller-listings" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-boxes text-gold"></i><span>حساباتي</span>' +
                        '</a>' +
                        '<a href="contact-support.html" class="drawer-shortcut-card" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-headset text-orange"></i><span>تواصل مع الوسيط</span>' +
                        '</a>' +
                        '<a href="admin-chats.html" class="drawer-shortcut-card" id="drawer-admin-chats-link" style="display: none;" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-inbox text-gold"></i><span>محادثات الإدارة</span>' +
                            '<span class="deals-badge-count chats-unread-badge" id="drawer-chats-badge" style="display: none;">0</span>' +
                        '</a>' +
                        '<a href="admin-deposits.html" class="drawer-shortcut-card" id="drawer-admin-deposits-link" style="display: none;" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-money-check-alt text-gold"></i><span>شحن النقاط</span>' +
                            '<span class="deals-badge-count admin-deposits-badge" id="drawer-deposits-badge" style="display: none;">0</span>' +
                        '</a>' +
                        '<a href="admin-brokers.html" class="drawer-shortcut-card" id="drawer-admin-brokers-link" style="display: none;" data-admin-only onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-globe-africa text-orange"></i><span>الوسطاء الإقليميين</span>' +
                        '</a>' +
                        '<a href="admin-withdrawals.html" class="drawer-shortcut-card" id="drawer-admin-withdrawals-link" style="display: none;" data-admin-only onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-hand-holding-usd text-gold"></i><span>طلبات السحب</span>' +
                        '</a>' +
                        '<a href="index.html#fee-calculator" class="drawer-shortcut-card" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-calculator text-silver"></i><span>حاسبة العمولات</span>' +
                        '</a>' +
                        '<a href="wallet.html" class="drawer-shortcut-card" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-wallet text-gold"></i><span>محفظتي والنقاط</span>' +
                        '</a>' +
                        '<a href="profile.html" class="drawer-shortcut-card" id="drawer-my-store-link" style="display: none;" onclick="window.waseetCloseDrawerSafe && window.waseetCloseDrawerSafe()">' +
                            '<i class="fas fa-store-alt text-gold"></i><span>ملفي ومتجري</span>' +
                        '</a>' +
                    '</div>' +
                '</div>' +
                '<div class="drawer-section">' +
                    '<h4 class="drawer-section-title">الحساب وتسجيل الدخول</h4>' +
                    '<div class="drawer-auth-actions" id="drawer-auth-actions"></div>' +
                '</div>' +
                '<div class="drawer-section">' +
                    '<h4 class="drawer-section-title">المساعدة والدعم</h4>' +
                    '<ul class="drawer-links-list">' +
                        '<li><a href="#" onclick="if(typeof waseetAlert===\'function\') waseetAlert(\'ضمان WASEET الذهبي\', \'منصة WASEET تضمن الحساب بنسبة 100% لمدة 48 ساعة ضد أي محاولة استرجاع، وتتحمل المسؤولية الكاملة في حال حدوث أي خلل.\', \'success\'); return false;"><i class="fas fa-shield-check text-gold"></i> شروط الضمان والأمان</a></li>' +
                        '<li><a href="https://wa.me/218931467923" target="_blank" rel="noopener noreferrer" title="واتساب الدعم المباشر: +2180931467923"><i class="fab fa-whatsapp" style="color: #25D366;"></i> الدعم المباشر (<span dir="ltr">+2180931467923</span>)</a></li>' +
                    '</ul>' +
                '</div>' +
            '</aside>';
    }

    function waseetRenderMobileDrawerUniversal(force) {
        if (typeof window.waseetApp !== 'undefined' && typeof window.waseetApp.renderMobileDrawer === 'function') {
            window.waseetApp.renderMobileDrawer(force);
            return;
        }
        var container = byId('mobile-drawer-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mobile-drawer-container';
            document.body.appendChild(container);
        }
        var existingDrawer = container.querySelector('.mobile-drawer-sidebar') || container.querySelector('.mobile-drawer');
        if (!existingDrawer || force) {
            container.innerHTML = getUniversalDrawerHtml();
        }
        refreshDrawerExtras();
    }
    window.renderMobileDrawer = window.renderMobileDrawer || waseetRenderMobileDrawerUniversal;
    window.waseetRenderMobileDrawerUniversal = waseetRenderMobileDrawerUniversal;

    function waseetCloseDrawerSafe() {
        if (typeof window.waseetApp !== 'undefined' && typeof window.waseetApp.closeMobileDrawer === 'function') {
            try { window.waseetApp.closeMobileDrawer(); } catch (e) {}
        }
        toggleWaseetDrawer(false);
        var drawer = getDrawer();
        var overlay = getOverlay();
        if (drawer) drawer.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }
    window.waseetCloseDrawerSafe = waseetCloseDrawerSafe;

    /* ======================================================================
       1) فتح / إغلاق القائمة الجانبية
       ====================================================================== */
    function toggleWaseetDrawer(force) {
        waseetRenderMobileDrawerUniversal();
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

    function updateDrawerUserCard(user) {
        var u = user || currentUser();
        var admin = isAdminUser(u);
        var broker = !admin && isBrokerUser(u);
        var pts = (u && u.wallet) ? (Number(u.wallet.available) || 0) : ((u && typeof u.points_balance !== 'undefined') ? Number(u.points_balance) : 0);
        document.querySelectorAll('.drawer-user-card, #drawer-user-card').forEach(function (card) {
            if (u && !u.isGuest) {
                var role = broker
                    ? '🌍 وسيط إقليمي معتمد (' + (u.country || 'DZ') + ')'
                    : (admin ? '👑 الوسيط المعتمد (المدير)' : '🏷️ عضو موثق');
                card.innerHTML =
                    '<img src="' + esc(userAvatar(u)) + '" class="drawer-avatar" alt="' + esc(u.name || 'مستخدم') + '" referrerpolicy="no-referrer" ' +
                    'onerror="this.onerror=null;this.src=\'' + DEFAULT_AVATAR + '\'">' +
                    '<div class="drawer-user-meta"><span class="drawer-user-name">' + esc(u.name || 'مستخدم') + '</span>' +
                    '<span class="drawer-user-role">' + role + '</span>' +
                    '<span class="drawer-user-pts"><i class="fas fa-coins text-gold"></i> ' + pts + ' نقطة متاحة</span></div>';
            } else {
                card.innerHTML =
                    '<div class="drawer-avatar" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);color:var(--silver-muted);font-size:1.3rem;">' +
                    '<i class="fas fa-user-circle text-gold"></i></div>' +
                    '<div class="drawer-user-meta"><span class="drawer-user-name">زائر غير مسجل</span>' +
                    '<span class="drawer-user-role" style="color: var(--gold-light);">سجّل دخولك للاستفادة من كل المزايا</span></div>';
            }
        });
    }

    function refreshDrawerExtras() {
        var user = currentUser();
        updateDrawerUserCard(user);
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
    window.waseetUpdateDrawerUserCard = updateDrawerUserCard;

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
        // للمدير العام فقط تظهر أزرار الإدارة، أما الوسيط الإقليمي وكافة المستخدمين يظل الشريط العلوي موحداً كلياً
        if (userGroup) userGroup.style.display = admin ? 'none' : '';
        if (adminGroup) adminGroup.style.display = admin ? 'flex' : 'none';

        // دمج أزرار الإشراف في الشريط العلوي الأساسي الموحد (Navbar Unification)
        renderUnifiedBrokerNavLinks(user);

        ['wallet-total-pts', 'admin-wallet-total-pts'].forEach(function (id) {
            var el = byId(id);
            if (el) el.textContent = pts + ' نقطة';
        });
        var walletPill = byId('wallet-pill-btn');
        var adminWalletPill = byId('admin-wallet-pill');
        if (walletPill) walletPill.style.display = (user && !admin) ? 'inline-flex' : (user ? '' : 'none');
        if (adminWalletPill) adminWalletPill.style.display = admin ? 'inline-flex' : 'none';

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

        // حقن بطاقة الوسيط الإقليمي المعتمد لبلدك داخل القائمة الجانبية الموحدة
        var brokerCardSlot = byId('drawer-regional-broker-card');
        if (!brokerCardSlot && card && card.parentNode) {
            brokerCardSlot = document.createElement('div');
            brokerCardSlot.id = 'drawer-regional-broker-card';
            card.parentNode.insertBefore(brokerCardSlot, card.nextSibling);
        }
        if (brokerCardSlot && typeof window.waseetRenderRegionalBrokerCard === 'function') {
            window.waseetRenderRegionalBrokerCard(brokerCardSlot);
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
            var isStrictAdminOnlyLink = href.indexOf('admin-deposits') !== -1 || href.indexOf('admin-withdrawals') !== -1;
            var canShow = admin || (broker && !isStrictAdminOnlyLink);
            el.style.display = canShow ? (el.classList.contains('btn-nav-middle') ? 'inline-flex' : '') : 'none';
        });
        document.querySelectorAll('[data-admin-only]').forEach(function (el) {
            if (el.id === 'drawer-admin-deposits-link' || el.getAttribute('href') === 'admin-deposits.html') {
                el.style.display = (admin || broker) ? 'flex' : 'none';
            } else {
                el.style.display = admin ? '' : 'none';
            }
        });
        var drawerBrokers = byId('drawer-admin-brokers-link');
        if (drawerBrokers) drawerBrokers.style.setProperty('display', admin ? 'flex' : 'none', 'important');
        var drawerDeposits = byId('drawer-admin-deposits-link');
        if (drawerDeposits) drawerDeposits.style.setProperty('display', (admin || broker) ? 'flex' : 'none', 'important');
        var drawerWithdrawals = byId('drawer-admin-withdrawals-link');
        if (drawerWithdrawals) drawerWithdrawals.style.setProperty('display', admin ? 'flex' : 'none', 'important');
        var drawerPending = byId('drawer-btn-pending-verification') || byId('deals-drawer-btn-pending');
        if (drawerPending) drawerPending.style.setProperty('display', (admin || broker) ? 'flex' : 'none', 'important');
        var drawerChats = byId('drawer-admin-chats-link') || byId('deals-drawer-admin-chats');
        if (drawerChats) drawerChats.style.setProperty('display', (admin || broker) ? 'flex' : 'none', 'important');

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
        // حقن القائمة الجانبية المركزية فوراً في أي صفحة تحمل navbar.js
        waseetRenderMobileDrawerUniversal();

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

    // أسماء بديلة شائعة عبر الصفحات للتوافق التام 100%
    window.toggleDealsDrawer = window.toggleDealsDrawer || toggleWaseetDrawer;
    window.closeDealsDrawer = window.closeDealsDrawer || waseetCloseDrawerSafe;
    window.toggleWalletDrawer = window.toggleWalletDrawer || toggleWaseetDrawer;
    window.closeWalletDrawer = window.closeWalletDrawer || waseetCloseDrawerSafe;
    window.toggleChatDrawer = window.toggleChatDrawer || toggleWaseetDrawer;
    window.closeChatDrawer = window.closeChatDrawer || waseetCloseDrawerSafe;
    window.toggleSupportDrawer = window.toggleSupportDrawer || toggleWaseetDrawer;
    window.closeSupportDrawer = window.closeSupportDrawer || waseetCloseDrawerSafe;
    window.toggleMyAccountsDrawer = window.toggleMyAccountsDrawer || toggleWaseetDrawer;
    window.closeMyAccountsDrawer = window.closeMyAccountsDrawer || waseetCloseDrawerSafe;
    window.togglePendingDrawer = window.togglePendingDrawer || toggleWaseetDrawer;
    window.closePendingDrawer = window.closePendingDrawer || waseetCloseDrawerSafe;
    window.toggleMobileDrawer = window.toggleMobileDrawer || toggleWaseetDrawer;
    window.closeMobileDrawer = window.closeMobileDrawer || waseetCloseDrawerSafe;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
