/**
 * WASEET (وسيط) - Main Application Controller
 * Handles:
 * 1. Social Login & User Profile management (Google, Facebook, Quick Mediator).
 * 2. Mediator Deals List modal with direct links to individual escrow rooms.
 * 3. 30 Accounts per page Pagination with mobile 3D screen / door slide transition.
 * 4. 3D Playing Cards Fan Spread showcase (أوراق لعب مفتوحة) with rich specs below.
 * 5. Free Fire Evo guns, iconic pants, rare skins, and notes.
 * 6. Dynamic multi-game filters & Game selection in Sell modal.
 * 7. Clean in-site dialog replacements (waseetAlert & waseetConfirm).
 */

class WaseetApp {
    constructor() {
        this.uploadedImages = [];
        this.currentPage = 1;
        this.pageSize = 30; // Strictly max 30 accounts per page as requested
        this.currentFilteredAccounts = [...WASEET_STATE.accounts];
        this.selectedDeckCard = null;
        this.currentDeckIndex = 0; // For image navigation arrows
        this.currentDeckImages = []; // Current deck images array
        this.currentDeckAccountId = null; // Current deck account ID
        this.searchQuery = ''; // Search query state
        this.init();
    }

    init() {
        this.renderUserProfile();
        this.renderMarketplace();
        this.bindCalculator();
        this.bindFilters();
        this.bindModals();
        this.bindImageUploader();
        this.bindSellForm();
        this.updateWalletDisplay();

        // Non-blocking visitor welcome prompt for first-time visitors (Requirement 1)
        if (!WASEET_STATE.user) {
            const prompted = sessionStorage.getItem('waseet_guest_welcome_shown');
            if (!prompted) {
                sessionStorage.setItem('waseet_guest_welcome_shown', 'true');
                setTimeout(() => {
                    this.showVisitorWelcomePrompt();
                }, 800);
            }
        }

        // Initialize 3-Way Escrow Room only if on dedicated chat page
        if (typeof WaseetEscrowRoom !== 'undefined' && document.getElementById('escrow-workspace-container')) {
            window.escrowRoom = new WaseetEscrowRoom();
        }
    }

    /* ==========================================================================
       USER PROFILE & SOCIAL LOGIN SYSTEM (Google, Facebook, Mediator)
       ========================================================================== */

    renderUserProfile() {
        const container = document.getElementById('nav-user-container');
        const dealsBtn = document.getElementById('btn-mediator-deals');
        const dealsCountBadge = document.getElementById('nav-deals-count');
        const user = WASEET_STATE.user;

        // Show/Hide Mediator Deals Button on left of Sell Account
        if (dealsBtn) {
            if (user && user.role === 'mediator') {
                dealsBtn.style.display = 'inline-flex';
                if (dealsCountBadge && WASEET_STATE.deals) {
                    dealsCountBadge.innerText = WASEET_STATE.deals.length;
                }
            } else {
                dealsBtn.style.display = 'none';
            }
        }

        if (!container) return;

        if (user) {
            // جلب رابط الصورة مباشرة من user.user_metadata.avatar_url كما هو مطلوب
            const avatarUrl = (user.user_metadata && user.user_metadata.avatar_url)
                || user.avatar
                || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

            const roleBadge = user.role === 'mediator'
                ? '<i class="fas fa-crown text-gold" style="font-size: 0.8rem; margin-right: 0.25rem;" title="الوسيط المعتمد"></i>'
                : '';

            // استبدال زر تسجيل الدخول بعنصر صورة دائرية للملف الشخصي
            container.innerHTML = `
                <div class="user-profile-pill" onclick="window.waseetApp.openLoginModal()" title="${user.name} - انقر لإدارة الحساب أو تسجيل الخروج" style="cursor: pointer; display: inline-flex; align-items: center; gap: 0.55rem; padding: 3px 12px 3px 4px; background: rgba(14, 18, 28, 0.85); border: 1px solid var(--border-metal); border-radius: 999px;">
                    <img src="${avatarUrl}" alt="${user.name}" class="user-avatar-img" referrerpolicy="no-referrer" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 2px solid var(--gold-primary); box-shadow: 0 0 10px var(--gold-glow); display: block;">
                    <span style="font-size: 0.88rem; font-weight: 700; color: #fff; white-space: nowrap;">${user.name}</span>
                    ${roleBadge}
                </div>
            `;
        } else {
            container.innerHTML = `
                <button class="btn-3d btn-outline" onclick="window.waseetApp.openLoginModal()" style="padding: 0.45rem 0.9rem; font-size: 0.85rem; border-radius: 999px;">
                    <i class="fas fa-user-circle text-gold"></i>
                    <span>تسجيل الدخول</span>
                </button>
            `;
        }

        this.updateMobileDrawer();
    }

    toggleMobileDrawer() {
        const overlay = document.getElementById('mobile-drawer-overlay');
        const drawer = document.getElementById('mobile-drawer-sidebar');
        if (overlay && drawer) {
            const isActive = drawer.classList.contains('active');
            if (isActive) {
                this.closeMobileDrawer();
            } else {
                overlay.classList.add('active');
                drawer.classList.add('active');
                this.updateMobileDrawer();
            }
        }
    }

    closeMobileDrawer() {
        const overlay = document.getElementById('mobile-drawer-overlay');
        const drawer = document.getElementById('mobile-drawer-sidebar');
        if (overlay) overlay.classList.remove('active');
        if (drawer) drawer.classList.remove('active');
    }

    updateMobileDrawer() {
        const userCard = document.getElementById('drawer-user-card');
        const authActions = document.getElementById('drawer-auth-actions');
        const user = WASEET_STATE.user;

        if (userCard) {
            if (user) {
                const avatar = user.avatar || (user.role === 'mediator' 
                    ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200' 
                    : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200');
                const roleLabel = user.role === 'mediator' ? '👑 الوسيط المعتمد (المدير)' : (user.role === 'buyer' ? '🛒 مشتري موثق' : '🏷️ بائع موثق');
                const pts = user.wallet ? user.wallet.available : 0;
                userCard.innerHTML = `
                    <img src="${avatar}" class="drawer-avatar" alt="${user.name}">
                    <div class="drawer-user-meta">
                        <span class="drawer-user-name">${user.name}</span>
                        <span class="drawer-user-role">${roleLabel}</span>
                        <span style="font-size: 0.72rem; color: var(--gold-light); margin-top: 2px;"><i class="fas fa-coins"></i> ${pts} نقطة متاحة</span>
                    </div>
                `;
            } else {
                userCard.innerHTML = `
                    <div class="drawer-avatar" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);color:var(--silver-muted);font-size:1.3rem;">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="drawer-user-meta">
                        <span class="drawer-user-name">زائر المتجر</span>
                        <span class="drawer-user-role" style="color: var(--silver-muted);">سجل الدخول لحفظ صفقاتك ونقاطك</span>
                    </div>
                `;
            }
        }

        if (authActions) {
            if (user) {
                authActions.innerHTML = `
                    <button class="btn-3d btn-outline" onclick="window.waseetApp.logoutUser(); window.waseetApp.closeMobileDrawer();" style="width: 100%; border-color: #ef4444; color: #ef4444;">
                        <i class="fas fa-sign-out-alt"></i> تسجيل الخروج (العودة كزائر)
                    </button>
                    ${user.role !== 'mediator' ? `
                        <button class="btn-3d btn-gold" onclick="window.waseetApp.loginAsMediator(); window.waseetApp.closeMobileDrawer();" style="width: 100%; margin-top: 0.5rem;">
                            <i class="fas fa-crown"></i> الدخول بصلاحية الوسيط المعتمد
                        </button>
                    ` : ''}
                `;
            } else {
                authActions.innerHTML = `
                    <button class="btn-social-login btn-social-google" onclick="window.waseetApp.loginWithProvider('google'); window.waseetApp.closeMobileDrawer();">
                        <i class="fab fa-google" style="color: #ea4335;"></i> المتابعة باستخدام Google
                    </button>
                    <button class="btn-social-login btn-social-facebook" onclick="window.waseetApp.loginWithProvider('facebook'); window.waseetApp.closeMobileDrawer();">
                        <i class="fab fa-facebook-f" style="color: #1877f2;"></i> المتابعة باستخدام Facebook
                    </button>
                    <button class="btn-3d btn-gold" onclick="window.waseetApp.loginAsMediator(); window.waseetApp.closeMobileDrawer();" style="width: 100%;">
                        <i class="fas fa-crown"></i> الدخول كـ الوسيط المعتمد
                    </button>
                `;
            }
        }
    }

    async showVisitorWelcomePrompt() {
        if (typeof waseetConfirm === 'function') {
            const wantLogin = await waseetConfirm(
                'مرحباً بك في منصة WASEET',
                'أهلاً بك في منصة الوساطة الآمنة لحسابات الألعاب!\n\nيمكنك تصفح سوق الحسابات بحرية تامة كزائر، أو تسجيل الدخول لحفظ بياناتك بشكل دائم وإتمام صفقات الوساطة.',
                'تسجيل الدخول الآن',
                'تصفح كزائر مجاناً',
                'escrow'
            );
            if (wantLogin) {
                this.openLoginModal();
            }
        }
    }

    openLoginModal() {
        const modal = document.getElementById('modal-login');
        if (!modal) return;
        
        // Dynamically update login modal content if already logged in
        const currentStatusBox = document.getElementById('login-current-status-box');
        if (currentStatusBox) {
            if (WASEET_STATE.user) {
                const roleBadge = WASEET_STATE.user.role === 'mediator' ? '👑 الوسيط المعتمد' : 'مستخدم';
                const avatar = (WASEET_STATE.user.user_metadata && WASEET_STATE.user.user_metadata.avatar_url)
                    || WASEET_STATE.user.avatar
                    || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';
                currentStatusBox.innerHTML = `
                    <div style="background: rgba(197,160,89,0.12); border: 1px solid var(--gold-primary); border-radius: 12px; padding: 0.8rem; margin-bottom: 1.2rem; text-align: center;">
                        <img src="${avatar}" referrerpolicy="no-referrer" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--gold-primary); margin: 0 auto 0.5rem; display: block;" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'">
                        <div style="font-size: 0.8rem; color: var(--silver-muted);">أنت مسجل حالياً باسم:</div>
                        <strong style="color: #fff; font-size: 0.95rem;">${WASEET_STATE.user.name}</strong>
                        <div style="font-size: 0.75rem; color: var(--gold-light); margin-top: 2px;">(${roleBadge})</div>
                        <button class="btn-3d btn-outline" onclick="window.waseetApp.logoutUser()" style="width: 100%; margin-top: 0.6rem; padding: 0.35rem; font-size: 0.8rem; border-color: rgba(239,68,68,0.5); color: #ef4444;">
                            <i class="fas fa-sign-out-alt"></i> تسجيل الخروج (العودة كزائر)
                        </button>
                    </div>
                `;
                currentStatusBox.style.display = 'block';
            } else {
                currentStatusBox.style.display = 'none';
            }
        }

        modal.classList.add('active');
    }

    openSellModal() {
        const modal = document.getElementById('modal-sell');
        if (modal) modal.classList.add('active');
    }

    async loginWithProvider(provider) {
        const modal = document.getElementById('modal-login');
        if (modal) modal.classList.remove('active');

        const defaultWallet = { available: 0, locked: 0, total: 0 };
        const existingWallet = (WASEET_STATE.user && WASEET_STATE.user.wallet) || defaultWallet;

        if (provider === 'google') {
            if (typeof waseetSignInWithGoogle === 'function') {
                await waseetSignInWithGoogle();
                return;
            }
            if (typeof window.waseetAuth !== 'undefined') {
                await window.waseetAuth.initiateGoogleLogin();
                return;
            }
        } else if (provider === 'facebook') {
            if (typeof window.waseetAuth !== 'undefined') {
                const fbRes = await window.waseetAuth.initiateFacebookLogin();
                if (fbRes && fbRes.success) {
                    WASEET_STATE.user = {
                        ...fbRes.user,
                        wallet: existingWallet
                    };
                    saveWaseetData();
                    this.renderUserProfile();
                    this.updateWalletDisplay();
                    await waseetAlert('تسجيل دخول ناجح', `مرحباً بك يا ${fbRes.user.name}! تم تسجيل دخولك بنجاح بحساب Facebook.`, 'success');
                    return;
                }
                if (fbRes && fbRes.error === 'USER_CANCELLED') {
                    return; // User intentionally cancelled login popup
                }
            }
            // Graceful fallback for offline or environments where FB SDK is blocked by ad-blocker
            WASEET_STATE.user = {
                id: 'usr_fb_' + Date.now(),
                name: 'مستخدم Facebook',
                email: 'user_fb@facebook.com',
                role: 'user',
                provider: 'facebook',
                avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
                wallet: existingWallet
            };
            saveWaseetData();
            this.renderUserProfile();
            this.updateWalletDisplay();
            await waseetAlert('تسجيل دخول ناجح', 'مرحباً بك! تم تسجيل دخولك بنجاح عبر منصة Facebook.', 'success');
        }
    }

    async loginAsMediator() {
        const modal = document.getElementById('modal-login');
        if (modal) modal.classList.remove('active');

        if (typeof isMediatorUser === 'function' && isMediatorUser()) {
            await waseetAlert(
                'أنت مسجل بالفعل',
                'أنت مسجل حالياً بصلاحية الوسيط المعتمد.',
                'success'
            );
            return;
        }

        if (typeof window.waseetPromptMediatorLogin === 'function') {
            window.waseetPromptMediatorLogin((user) => {
                this.renderUserProfile();
                this.updateWalletDisplay();
                this.updateMobileDrawer();
            });
        }
    }

    async logoutUser() {
        const modal = document.getElementById('modal-login');
        if (modal) modal.classList.remove('active');

        if (typeof waseetSignOut === 'function') {
            await waseetSignOut();
            return;
        }

        WASEET_STATE.user = null;
        saveWaseetData();
        this.renderUserProfile();
        this.updateWalletDisplay();

        await waseetAlert(
            'تم تسجيل الخروج',
            'تم تسجيل خروجك بنجاح. أنت تتصفح الموقع الآن كزائر.',
            'info'
        );
    }

    /* ==========================================================================
       MEDIATOR DEALS LIST MODAL (قائمة صفقات الوساطة)
       ========================================================================== */

    openMediatorDealsModal() {
        const container = document.getElementById('mediator-deals-list-container');
        const modal = document.getElementById('modal-mediator-deals');
        if (!modal || !container) return;

        const deals = WASEET_STATE.deals || [WASEET_STATE.activeDeal];

        container.innerHTML = deals.map((deal, idx) => {
            const stepTitles = [
                'المرحلة 0: ملغاة',
                'المرحلة 1: حجز النقاط وتأكيد الطلب',
                'المرحلة 2: فحص بيانات الدخول والروابط',
                'المرحلة 3: نقل الملكية للمشتري وتأمين الحساب',
                'المرحلة 4: تحرير الرصيد وإرسال الأرباح',
                'المرحلة 5: مكتملة بنجاح 100%'
            ];
            const currentTitle = stepTitles[deal.currentStep] || deal.stageText;

            return `
                <div class="deal-card-item">
                    <div class="deal-card-header">
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <span class="deal-num-tag">#DEAL-${deal.dealNumber || (idx + 1)}</span>
                            <strong style="color: #fff; font-size: 1rem;">${deal.accountTitle}</strong>
                        </div>
                        <span style="font-family: var(--font-en); font-weight: 800; color: var(--gold-light); font-size: 1.15rem;">
                            ${deal.totalPoints}$ (${deal.totalPoints} نقطة)
                        </span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.6rem; margin: 0.8rem 0; font-size: 0.85rem; color: var(--silver-muted);">
                        <div><i class="fas fa-shopping-cart text-orange"></i> المشتري: <strong style="color:#fff;">${deal.buyer.name}</strong></div>
                        <div><i class="fas fa-store text-silver"></i> البائع: <strong style="color:#fff;">${deal.seller.name}</strong></div>
                        <div><i class="fas fa-coins text-gold"></i> عمولة الموقع: <strong class="text-orange">+$${deal.fee}</strong></div>
                    </div>

                    <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 0.6rem 0.8rem; margin-bottom: 0.9rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem;">
                        <span style="color: var(--silver-muted);"><i class="fas fa-tasks text-gold"></i> حالة الصفقة:</span>
                        <span style="color: var(--gold-light); font-weight: 700;">${currentTitle}</span>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 0.6rem;">
                        <a href="chat.html?dealId=${deal.id}" class="btn-3d btn-orange" style="text-decoration: none; font-size: 0.88rem; padding: 0.55rem 1.1rem;">
                            <i class="fas fa-shield-alt"></i> الدخول إلى غرفة الوساطة المباشرة لهذه الصفقة
                        </a>
                    </div>
                </div>
            `;
        }).join('');

        modal.classList.add('active');
    }

    updateWalletDisplay() {
        const wallet = (WASEET_STATE.user && WASEET_STATE.user.wallet) || { available: 0, locked: 0, total: 0 };
        const totalEl = document.getElementById('wallet-total-pts');
        const lockedEl = document.getElementById('wallet-locked-pts');
        const modalAvailEl = document.getElementById('modal-wallet-avail');
        const modalLockEl = document.getElementById('modal-wallet-lock');
        const chatsBadge = document.getElementById('nav-chats-badge');

        if (totalEl) totalEl.innerText = `${wallet.available} نقطة`;
        if (lockedEl) {
            if (wallet.locked > 0) {
                lockedEl.innerText = `${wallet.locked} محجوز`;
                lockedEl.style.display = 'inline-block';
            } else {
                lockedEl.style.display = 'none';
            }
        }
        if (modalAvailEl) modalAvailEl.innerText = `${wallet.available} نقطة ($${wallet.available})`;
        if (modalLockEl) modalLockEl.innerText = `${wallet.locked} نقطة ($${wallet.locked})`;

        if (chatsBadge) {
            let userChatsCount = 0;
            const currentUser = WASEET_STATE.user;
            
            if (currentUser) {
                if (typeof isMediatorUser === 'function' && isMediatorUser(currentUser)) {
                    // Mediator sees all active deals requiring mediation
                    userChatsCount = (WASEET_STATE.deals || []).filter(d => d.status === 'active' || !d.status).length;
                } else {
                    // Regular Buyer / Seller only sees active deals where they are the buyer or seller
                    userChatsCount = (WASEET_STATE.deals || []).filter(d => {
                        const isActive = d.status === 'active' || !d.status;
                        const isBuyer = d.buyer && (d.buyer.id === currentUser.id || d.buyer.name === currentUser.name);
                        const isSeller = d.seller && (d.seller.id === currentUser.id || d.seller.name === currentUser.name);
                        return isActive && (isBuyer || isSeller);
                    }).length;
                }
            } else {
                userChatsCount = 0; // Guest / visitor sees 0
            }

            if (userChatsCount > 0) {
                chatsBadge.style.display = 'inline-flex';
                chatsBadge.innerText = userChatsCount;
            } else {
                chatsBadge.style.display = 'none';
            }
        }
    }

    /* ==========================================================================
       SEARCH FUNCTIONALITY (البحث بالرقم أو الاسم)
       ========================================================================== */

    handleSearch(query) {
        this.searchQuery = query.trim().toLowerCase();
        let list = [...WASEET_STATE.accounts];

        if (this.searchQuery) {
            list = list.filter(acc => {
                const numMatch = acc.accountNumber && String(acc.accountNumber).includes(this.searchQuery);
                const titleMatch = acc.title && acc.title.toLowerCase().includes(this.searchQuery);
                const idMatch = acc.id && acc.id.toLowerCase().includes(this.searchQuery);
                const sellerMatch = acc.sellerName && acc.sellerName.toLowerCase().includes(this.searchQuery);
                return numMatch || titleMatch || idMatch || sellerMatch;
            });
        }

        // Also apply current filters
        const gameSelect = document.getElementById('filter-game');
        const primeSelect = document.getElementById('filter-prime');
        const levelSelect = document.getElementById('filter-level');
        const evoSelect = document.getElementById('filter-evo');
        const loginSelect = document.getElementById('filter-login');
        const sortSelect = document.getElementById('filter-sort');

        const gameVal = gameSelect ? gameSelect.value : 'all';
        const primeVal = primeSelect ? primeSelect.value : 'all';
        const levelVal = levelSelect ? levelSelect.value : 'all';
        const evoVal = evoSelect ? evoSelect.value : 'all';
        const loginVal = loginSelect ? loginSelect.value : 'all';
        const sortVal = sortSelect ? sortSelect.value : 'default';

        if (gameVal !== 'all') list = list.filter(a => a.game === gameVal);
        if (primeVal !== 'all') list = list.filter(a => a.primeLevel === parseInt(primeVal));
        if (levelVal !== 'all') list = list.filter(a => a.level >= parseInt(levelVal));
        if (evoVal !== 'all') list = list.filter(a => (a.evoGunsCount || 0) >= parseInt(evoVal));
        if (loginVal !== 'all') list = list.filter(a => a.loginType === loginVal);
        if (sortVal === 'price-asc') list.sort((a, b) => a.sellerPrice - b.sellerPrice);
        else if (sortVal === 'price-desc') list.sort((a, b) => b.sellerPrice - a.sellerPrice);
        else if (sortVal === 'level') list.sort((a, b) => b.level - a.level);

        this.renderMarketplace(list);
    }

    /* ==========================================================================
       PAGINATION (30 ACCOUNTS PER PAGE) & 3D PHONE SLIDE TRANSITION
       ========================================================================== */

    setPage(pageNum) {
        const totalPages = Math.ceil(this.currentFilteredAccounts.length / this.pageSize);
        if (pageNum < 1 || pageNum > totalPages || pageNum === this.currentPage) return;

        const grid = document.getElementById('accounts-grid');
        if (!grid) return;

        // Trigger phone-like 3D screen / door transition animation
        grid.classList.remove('phone-transition-in');
        grid.classList.add('phone-transition-out');

        setTimeout(() => {
            this.currentPage = pageNum;
            this.renderMarketplaceCardsOnly();
            this.renderPagination();

            grid.classList.remove('phone-transition-out');
            grid.classList.add('phone-transition-in');

            setTimeout(() => {
                grid.classList.remove('phone-transition-in');
            }, 400);

            // Smooth scroll to top of marketplace
            const section = document.getElementById('marketplace');
            if (section) section.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    }

    renderMarketplace(filteredAccounts = null) {
        if (filteredAccounts !== null) {
            this.currentFilteredAccounts = filteredAccounts;
            this.currentPage = 1; // reset to page 1 on new filter
        } else {
            this.currentFilteredAccounts = [...WASEET_STATE.accounts];
        }

        this.renderMarketplaceCardsOnly();
        this.renderPagination();
    }

    renderMarketplaceCardsOnly() {
        const grid = document.getElementById('accounts-grid');
        const counterEl = document.getElementById('accounts-total-counter');
        if (!grid) return;

        const accounts = this.currentFilteredAccounts;
        const total = accounts.length;

        if (total === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--silver-muted);">
                    <i class="fas fa-search" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--gold-primary);"></i>
                    <p style="font-size: 1.1rem;">لا توجد حسابات مطابقة لهذه الفلاتر حالياً.</p>
                </div>
            `;
            if (counterEl) counterEl.innerText = '0 حسابات';
            return;
        }

        // Slice for strictly max 30 accounts per page
        const startIdx = (this.currentPage - 1) * this.pageSize;
        const endIdx = startIdx + this.pageSize;
        const pageAccounts = accounts.slice(startIdx, endIdx);

        if (counterEl) {
            counterEl.innerText = `عرض ${startIdx + 1}-${Math.min(endIdx, total)} من أصل ${total} حساب (صفحة ${this.currentPage})`;
        }

        grid.innerHTML = pageAccounts.map(acc => {
            const pricing = calculateWaseetFee(acc.sellerPrice);
            const loginIcon = acc.loginType === 'google' ? 'fab fa-google text-orange' : 'fab fa-facebook text-silver';
            const loginName = acc.loginType === 'google' ? 'جوجل Gmail' : 'فيسبوك';
            const imagesList = acc.images && acc.images.length > 0 ? acc.images : [acc.image];

            const evoTag = (acc.evoGunsCount && acc.evoGunsCount > 0)
                ? `<span class="spec-chip" style="background: rgba(234, 88, 12, 0.2); border-color: var(--orange-primary); color: var(--orange-bright);"><i class="fas fa-crosshairs"></i> ${acc.evoGunsCount} أسلحة إيفو</span>`
                : '';

            const pantsTag = (acc.iconicPants && acc.iconicPants.length > 0)
                ? `<span class="spec-chip"><i class="fas fa-tshirt text-gold"></i> ${acc.iconicPants[0]}</span>`
                : '';

            // Requirement 3 & 7: Organized Account number badge replacing primary link badge
            const accNum = acc.accountNumber || (index + 1001);
            let primeBadgeHtml = '';
            if (acc.game === 'free_fire') {
                primeBadgeHtml = `<div class="prime-badge-3d"><i class="fas fa-crown"></i> برايم ${acc.primeLevel}</div>`;
            } else if (acc.badge) {
                primeBadgeHtml = `<div class="prime-badge-3d" style="background: linear-gradient(135deg, rgba(234, 88, 12, 0.95), rgba(197, 160, 89, 0.95)); color: #fff; border: 1px solid var(--gold-light);"><i class="fas fa-award"></i> ${acc.badge}</div>`;
            }

            // Prominent Account Number Tag replacing the primary link badge (Requirement 3)
            const accountNumBadgeHtml = `<div class="account-num-tag"><i class="fas fa-hashtag text-gold"></i> #${accNum}</div>`;

            return `
                <div class="account-card-3d card-3d">
                    <div class="card-media" onclick="window.waseetApp.openCardDeck('${acc.id}')" style="cursor: pointer;" title="انقر لعرض صور الحساب مع كامل التفاصيل">
                        <img src="${imagesList[0]}" alt="${acc.title}" class="card-img" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'">
                        ${primeBadgeHtml}
                        ${accountNumBadgeHtml}
                        <div class="level-tag">
                            Lv. ${acc.level}
                        </div>
                        <button class="btn-gallery-badge" onclick="event.stopPropagation(); window.waseetApp.openCardDeck('${acc.id}')">
                            <i class="fas fa-layer-group"></i> ${imagesList.length} صور
                        </button>
                    </div>
                    <div class="card-body">
                        <h3 class="card-title" onclick="window.waseetApp.openCardDeck('${acc.id}')" style="cursor: pointer;">${acc.title}</h3>
                        <div class="card-specs">
                            <span class="spec-chip"><i class="fas fa-globe-asia text-gold"></i> الشرق الأوسط</span>
                            <span class="spec-chip"><i class="fas fa-link text-orange"></i> ربط ${acc.bindStatus === 'single' ? 'أحادي آمن' : 'ثنائي'}</span>
                            ${evoTag}
                            ${pantsTag}
                        </div>
                        <div class="card-footer">
                            <div class="price-col">
                                <span class="price-sub">صافي البائع: $${pricing.sellerPrice} + عمولة $${pricing.fee}</span>
                                <span class="price-main">${pricing.buyerPrice} <span style="font-size: 0.9rem; color: var(--gold-light);">نقطة</span></span>
                            </div>
                            <button class="btn-3d btn-orange" onclick="window.waseetApp.requestEscrow('${acc.id}')">
                                <i class="fas fa-shield-alt"></i> طلب وساطة
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (typeof init3DTilt === 'function') {
            init3DTilt();
        }
    }

    renderPagination() {
        const container = document.getElementById('marketplace-pagination');
        if (!container) return;

        const totalAccounts = this.currentFilteredAccounts.length;
        const totalPages = Math.ceil(totalAccounts / this.pageSize);

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let pillsHtml = '';
        for (let i = 1; i <= totalPages; i++) {
            pillsHtml += `
                <button class="page-number-pill ${i === this.currentPage ? 'active' : ''}" onclick="window.waseetApp.setPage(${i})">
                    ${i}
                </button>
            `;
        }

        container.innerHTML = `
            <div class="pagination-info">
                الصفحة ${this.currentPage} من إجمالي ${totalPages} صفحات (حد أقصى 30 حساب لكل صفحة)
            </div>
            <button class="page-btn" ${this.currentPage <= 1 ? 'disabled' : ''} onclick="window.waseetApp.setPage(${this.currentPage - 1})">
                <i class="fas fa-arrow-right"></i> الصفحة السابقة
            </button>
            ${pillsHtml}
            <button class="page-btn" ${this.currentPage >= totalPages ? 'disabled' : ''} onclick="window.waseetApp.setPage(${this.currentPage + 1})">
                الصفحة التالية <i class="fas fa-arrow-left"></i>
            </button>
        `;
    }

    /* ==========================================================================
       FEATURE 3: INTERACTIVE IMAGE GALLERY WITH RIGHT/LEFT ARROWS & ZOOM (Requirement 3)
       ========================================================================== */

    openCardDeck(accountId) {
        const acc = WASEET_STATE.accounts.find(a => a.id === accountId);
        if (!acc) return;

        this.currentDeckAccountId = accountId;
        this.currentDeckImages = acc.images && acc.images.length ? acc.images : [acc.image];
        this.currentDeckIndex = 0;

        const modal = document.getElementById('modal-card-deck');
        const titleEl = document.getElementById('deck-modal-title');
        const badgesEl = document.getElementById('deck-modal-badges');
        const detailsPanel = document.getElementById('deck-details-panel');

        if (!modal || !detailsPanel) return;

        if (titleEl) titleEl.innerText = acc.title;
        if (badgesEl) {
            const accNumTag = `<span class="badge-acc-number" style="background: rgba(197, 160, 89, 0.2); border: 1px solid var(--gold-primary); color: var(--gold-light); font-weight: 800; padding: 2px 8px; border-radius: 6px; font-family: var(--font-en);"><i class="fas fa-hashtag"></i> #${acc.accountNumber || ''}</span> • `;
            badgesEl.innerHTML = `
                ${accNumTag}
                <span class="text-gold"><i class="fas fa-crown"></i> برايم ${acc.primeLevel}</span> • 
                <span><i class="fas fa-bolt text-orange"></i> ليفل ${acc.level}</span> • 
                <span><i class="fas fa-shield-alt text-gold"></i> حماية الوساطة</span> • 
                <span class="text-orange">${acc.game === 'free_fire' ? 'فري فاير' : (acc.game === 'pubg' ? 'ببجي' : 'ألعاب')}</span>
            `;
        }

        // Render current main image and thumbnails
        this.updateDeckDisplay();

        // Details Underneath the Image Gallery
        const pricing = calculateWaseetFee(acc.sellerPrice);
        const evoListHtml = (acc.evoGuns && acc.evoGuns.length)
            ? acc.evoGuns.map(g => `<span class="evo-chip"><i class="fas fa-fire text-orange"></i> ${g}</span>`).join('')
            : '<span style="color: var(--silver-muted); font-size: 0.85rem;">لا توجد أسلحة إيفو مسجلة</span>';

        const pantsListHtml = (acc.iconicPants && acc.iconicPants.length)
            ? acc.iconicPants.map(p => `<span class="pants-chip"><i class="fas fa-tshirt text-gold"></i> ${p}</span>`).join('')
            : '<span style="color: var(--silver-muted); font-size: 0.85rem;">بنطلونات عادية</span>';

        const skinsListHtml = (acc.rareSkins && acc.rareSkins.length)
            ? acc.rareSkins.map(s => `<span class="spec-chip">${s}</span>`).join('')
            : '';

        detailsPanel.innerHTML = `
            <div class="details-specs-grid">
                <div class="spec-box">
                    <div class="spec-box-label"><i class="fas fa-crown text-gold"></i> مستوى البرايم (Prime)</div>
                    <div class="spec-box-value text-gold">برايم ${acc.primeLevel} أسطوري</div>
                </div>
                <div class="spec-box">
                    <div class="spec-box-label"><i class="fas fa-bolt text-orange"></i> ليفل الحساب (Level)</div>
                    <div class="spec-box-value">Level ${acc.level}</div>
                </div>
                <div class="spec-box">
                    <div class="spec-box-label"><i class="fas fa-link text-silver"></i> نوع وحالة الربط</div>
                    <div class="spec-box-value">${acc.loginType === 'google' ? 'جوجل Gmail' : 'فيسبوك'} (${acc.bindStatus === 'single' ? 'ربط أحادي آمن' : 'ربط ثنائي'})</div>
                </div>
                <div class="spec-box">
                    <div class="spec-box-label"><i class="fas fa-user-shield text-gold"></i> تقييم البائع بالمنصة</div>
                    <div class="spec-box-value">${acc.sellerName} (⭐ ${acc.sellerRating} • ${acc.sellerDeals} صفقة ناجحة)</div>
                </div>
            </div>

            <!-- Free Fire Evo Guns Section -->
            <div style="margin-bottom: 1.2rem;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--orange-bright); margin-bottom: 0.4rem;">
                    <i class="fas fa-crosshairs"></i> أسلحة إيفو المطورة (Evo Guns):
                </h4>
                <div class="chip-tag-group">
                    ${evoListHtml}
                </div>
            </div>

            <!-- Free Fire Iconic Pants Section -->
            <div style="margin-bottom: 1.2rem;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--gold-light); margin-bottom: 0.4rem;">
                    <i class="fas fa-tshirt"></i> السراويل المميزة والنادرة:
                </h4>
                <div class="chip-tag-group">
                    ${pantsListHtml}
                </div>
            </div>

            <!-- Rare Skins -->
            ${skinsListHtml ? `
                <div style="margin-bottom: 1.2rem;">
                    <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--silver-white); margin-bottom: 0.4rem;">
                        <i class="fas fa-gem text-gold"></i> السكنات والحزم النادرة:
                    </h4>
                    <div class="chip-tag-group">
                        ${skinsListHtml}
                    </div>
                </div>
            ` : ''}

            <!-- Account Notes -->
            <div class="account-notes-box">
                <strong style="color: var(--gold-light); display: block; margin-bottom: 0.3rem;">
                    <i class="fas fa-clipboard-check"></i> ملاحظة البائع وتفاصيل الضمان:
                </strong>
                ${acc.accountNotes || 'حساب مفحوص ومطابق للمواصفات، يخضع لضمان وسيط WASEET لمدة 48 ساعة ضد الاسترجاع.'}
            </div>

            <!-- Bottom Actions Bar -->
            <div class="deck-actions-bar">
                <div class="price-col">
                    <span class="price-sub">صافي البائع: $${pricing.sellerPrice} + عمولة الوساطة: $${pricing.fee}</span>
                    <span class="price-main" style="font-size: 1.6rem;">${pricing.buyerPrice} <span style="font-size: 1rem; color: var(--gold-light);">نقطة ($${pricing.buyerPrice})</span></span>
                </div>
                <div style="display: flex; gap: 0.8rem;">
                    <a href="${WASEET_STATE.activeDeal ? 'chat.html?dealId=' + WASEET_STATE.activeDeal.id : 'chat.html'}" class="btn-3d btn-outline" style="text-decoration: none;">
                        <i class="fas fa-comments"></i> استفسار بالشات
                    </a>
                    <button class="btn-3d btn-orange" onclick="window.waseetApp.requestEscrow('${acc.id}')">
                        <i class="fas fa-shield-alt"></i> طلب وساطة فوري للشراء
                    </button>
                </div>
            </div>
        `;

        modal.classList.add('active');
    }

    updateDeckDisplay() {
        const displayImg = document.getElementById('deck-main-display-img');
        const counterEl = document.getElementById('deck-image-counter');
        const thumbsContainer = document.getElementById('deck-thumbs-strip');

        const images = this.currentDeckImages || [];
        if (!images.length) return;

        const currentSrc = images[this.currentDeckIndex] || images[0];

        if (displayImg) {
            displayImg.src = currentSrc;
        }

        if (counterEl) {
            counterEl.innerText = `${this.currentDeckIndex + 1} / ${images.length}`;
        }

        if (thumbsContainer) {
            thumbsContainer.innerHTML = images.map((src, idx) => `
                <div class="deck-thumb-item ${idx === this.currentDeckIndex ? 'active' : ''}" onclick="window.waseetApp.selectDeckImage(${idx})">
                    <img src="${src}" alt="Thumb ${idx + 1}" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'">
                </div>
            `).join('');
        }
    }

    prevDeckImage() {
        const total = (this.currentDeckImages && this.currentDeckImages.length) || 1;
        this.currentDeckIndex = (this.currentDeckIndex - 1 + total) % total;
        this.updateDeckDisplay();
    }

    nextDeckImage() {
        const total = (this.currentDeckImages && this.currentDeckImages.length) || 1;
        this.currentDeckIndex = (this.currentDeckIndex + 1) % total;
        this.updateDeckDisplay();
    }

    selectDeckImage(index) {
        this.currentDeckIndex = index;
        this.updateDeckDisplay();
    }

    zoomCurrentImage() {
        const images = this.currentDeckImages || [];
        if (!images.length) return;
        const currentSrc = images[this.currentDeckIndex] || images[0];

        const lightbox = document.getElementById('modal-image-lightbox');
        const enlargedImg = document.getElementById('lightbox-enlarged-img');
        const caption = document.getElementById('lightbox-caption');

        if (enlargedImg) enlargedImg.src = currentSrc;
        if (caption) {
            const acc = WASEET_STATE.accounts.find(a => a.id === this.currentDeckAccountId);
            caption.innerText = `${acc ? acc.title : 'صورة الحساب'} (${this.currentDeckIndex + 1} من ${images.length})`;
        }
        if (lightbox) lightbox.classList.add('active');
    }

    /* ==========================================================================
       DYNAMIC MULTI-GAME FILTERS (Requirement 6)
       ========================================================================== */

    bindFilters() {
        const gameSelect = document.getElementById('filter-game');
        const primeSelect = document.getElementById('filter-prime');
        const levelSelect = document.getElementById('filter-level');
        const evoSelect = document.getElementById('filter-evo');
        const loginSelect = document.getElementById('filter-login');
        const sortSelect = document.getElementById('filter-sort');
        const dynamicContainer = document.getElementById('dynamic-game-filters');

        // Dynamic adjustment based on selected game
        if (gameSelect && dynamicContainer) {
            gameSelect.addEventListener('change', () => {
                const g = gameSelect.value;
                if (g === 'free_fire' || g === 'all') {
                    dynamicContainer.style.display = 'contents';
                } else {
                    // For PUBG or Brawl Stars
                    dynamicContainer.style.display = 'contents';
                }
                applyFilters();
            });
        }

        const applyFilters = () => {
            let list = [...WASEET_STATE.accounts];
            const gameVal = gameSelect ? gameSelect.value : 'all';
            const primeVal = primeSelect ? primeSelect.value : 'all';
            const levelVal = levelSelect ? levelSelect.value : 'all';
            const evoVal = evoSelect ? evoSelect.value : 'all';
            const loginVal = loginSelect ? loginSelect.value : 'all';
            const sortVal = sortSelect ? sortSelect.value : 'default';

            // Filter 1: Game
            if (gameVal !== 'all') {
                list = list.filter(a => a.game === gameVal);
            }

            // Filter 2: Free Fire Prime Level
            if (primeVal !== 'all') {
                list = list.filter(a => a.primeLevel === parseInt(primeVal));
            }

            // Filter 3: Level
            if (levelVal !== 'all') {
                const minLvl = parseInt(levelVal);
                list = list.filter(a => a.level >= minLvl);
            }

            // Filter 4: Evo Guns Count
            if (evoVal !== 'all') {
                const minEvo = parseInt(evoVal);
                list = list.filter(a => (a.evoGunsCount || 0) >= minEvo);
            }

            // Filter 5: Login type
            if (loginVal !== 'all') {
                list = list.filter(a => a.loginType === loginVal);
            }

            // Filter 6: Sorting
            if (sortVal === 'price-asc') {
                list.sort((a, b) => a.sellerPrice - b.sellerPrice);
            } else if (sortVal === 'price-desc') {
                list.sort((a, b) => b.sellerPrice - a.sellerPrice);
            } else if (sortVal === 'level') {
                list.sort((a, b) => b.level - a.level);
            }

            this.renderMarketplace(list);
        };

        if (primeSelect) primeSelect.addEventListener('change', applyFilters);
        if (levelSelect) levelSelect.addEventListener('change', applyFilters);
        if (evoSelect) evoSelect.addEventListener('change', applyFilters);
        if (loginSelect) loginSelect.addEventListener('change', applyFilters);
        if (sortSelect) sortSelect.addEventListener('change', applyFilters);
    }

    bindCalculator() {
        const input = document.getElementById('calc-seller-input');
        if (!input) return;

        const updateCalc = () => {
            const val = parseFloat(input.value) || 0;
            const res = calculateWaseetFee(val);

            document.getElementById('calc-res-seller').innerText = `$${res.sellerPrice}`;
            document.getElementById('calc-res-fee').innerText = `+$${res.fee}`;
            document.getElementById('calc-res-buyer').innerText = `${res.buyerPrice} نقطة ($${res.buyerPrice})`;
            document.getElementById('calc-res-tier').innerText = res.tierText;
        };

        input.addEventListener('input', updateCalc);
        updateCalc();
    }

    bindModals() {
        // Open Sell Modal
        const btnOpenSell = document.getElementById('btn-open-sell');
        const modalSell = document.getElementById('modal-sell');
        const btnCloseSell = document.getElementById('btn-close-sell');

        if (btnOpenSell && modalSell) {
            btnOpenSell.onclick = () => modalSell.classList.add('active');
        }
        if (btnCloseSell && modalSell) {
            btnCloseSell.onclick = () => modalSell.classList.remove('active');
        }

        // Open Wallet Modal
        const btnWalletPill = document.getElementById('wallet-pill-btn');
        const modalWallet = document.getElementById('modal-wallet');
        const btnCloseWallet = document.getElementById('btn-close-wallet');

        if (btnWalletPill && modalWallet) {
            btnWalletPill.onclick = () => modalWallet.classList.add('active');
        }
        if (btnCloseWallet && modalWallet) {
            btnCloseWallet.onclick = () => modalWallet.classList.remove('active');
        }

        // Mediator Deals Modal
        const btnMediatorDeals = document.getElementById('btn-mediator-deals');
        const btnCloseMediatorDeals = document.getElementById('btn-close-mediator-deals');
        const modalMediatorDeals = document.getElementById('modal-mediator-deals');

        if (btnMediatorDeals) {
            btnMediatorDeals.onclick = () => this.openMediatorDealsModal();
        }
        if (btnCloseMediatorDeals && modalMediatorDeals) {
            btnCloseMediatorDeals.onclick = () => modalMediatorDeals.classList.remove('active');
        }

        // Login Modal
        const btnCloseLogin = document.getElementById('btn-close-login');
        const modalLogin = document.getElementById('modal-login');
        if (btnCloseLogin && modalLogin) {
            btnCloseLogin.onclick = () => modalLogin.classList.remove('active');
        }

        // Card Deck Modal
        const btnCloseCardDeck = document.getElementById('btn-close-card-deck');
        const modalCardDeck = document.getElementById('modal-card-deck');
        if (btnCloseCardDeck && modalCardDeck) {
            btnCloseCardDeck.onclick = () => modalCardDeck.classList.remove('active');
        }

        // Close on background overlay click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                e.target.classList.remove('active');
            }
        });
    }

    /* ==========================================================================
       SELL ACCOUNT FORM & GAME SELECTOR (Requirements 3 & 5)
       ========================================================================== */

    bindSellForm() {
        const form = document.getElementById('sell-account-form');
        const priceInput = document.getElementById('form-seller-price');
        const previewEl = document.getElementById('form-fee-preview');
        const gameTabs = document.querySelectorAll('#sell-game-tabs .game-tab-btn');
        const selectedGameInput = document.getElementById('form-selected-game');
        const ffDetailedFields = document.getElementById('freefire-detailed-fields');
        const primeGroup = document.getElementById('group-form-prime');

        // Game selector tabs
        gameTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                gameTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const g = tab.getAttribute('data-game');
                if (selectedGameInput) selectedGameInput.value = g;

                if (g === 'free_fire') {
                    if (ffDetailedFields) ffDetailedFields.style.display = 'block';
                    if (primeGroup) primeGroup.style.display = 'block';
                } else {
                    if (ffDetailedFields) ffDetailedFields.style.display = 'none';
                    if (primeGroup) primeGroup.style.display = 'none';
                }
            });
        });

        if (priceInput && previewEl) {
            const updateFeePreview = () => {
                const val = parseFloat(priceInput.value) || 0;
                const calc = calculateWaseetFee(val);
                previewEl.innerHTML = `
                    <div style="background: rgba(197, 160, 89, 0.1); border: 1px solid var(--gold-primary); padding: 0.75rem; border-radius: 10px; font-size: 0.85rem;">
                        <div>صافي ربحك: <strong class="text-gold">$${calc.sellerPrice}</strong></div>
                        <div>عمولة الوساطة المضافة: <strong class="text-orange">+$${calc.fee}</strong></div>
                        <div style="margin-top: 0.3rem; font-weight: 700; color: #fff;">السعر الذي سيظهر للمشتري: ${calc.buyerPrice} نقطة ($${calc.buyerPrice})</div>
                    </div>
                `;
            };
            priceInput.addEventListener('input', updateFeePreview);
            updateFeePreview();
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const game = selectedGameInput ? selectedGameInput.value : 'free_fire';
                const title = document.getElementById('form-title').value;
                const level = parseInt(document.getElementById('form-level').value) || 50;
                const primeLevel = parseInt(document.getElementById('form-prime').value) || 1;
                const loginType = document.getElementById('form-login-type').value;
                const bindStatus = document.getElementById('form-bind-status').value;
                const sellerPrice = parseFloat(document.getElementById('form-seller-price').value) || 30;

                // Free fire detailed attributes
                const evoCount = parseInt(document.getElementById('form-evo-count')?.value) || 0;
                const iconicPantsStr = document.getElementById('form-iconic-pants')?.value || '';
                const rareSkinsStr = document.getElementById('form-rare-skins')?.value || '';
                const notesStr = document.getElementById('form-account-notes')?.value || '';

                const iconicPants = iconicPantsStr ? iconicPantsStr.split('،').map(s => s.trim()) : ['بنطلون مميز'];
                const rareSkins = rareSkinsStr ? rareSkinsStr.split('،').map(s => s.trim()) : ['سكنات نادرة'];

                let finalImages = [];
                if (this.uploadedImages.length > 0) {
                    finalImages = [...this.uploadedImages];
                } else {
                    finalImages = [
                        'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1000',
                        'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1000',
                        'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1000'
                    ];
                }

                const newAccount = {
                    id: 'acc_' + Date.now(),
                    accountNumber: 1001 + WASEET_STATE.accounts.length, // Sequential number
                    game: game,
                    title: title,
                    level: level,
                    primeLevel: primeLevel,
                    loginType: loginType,
                    bindStatus: bindStatus,
                    server: 'mena',
                    sellerName: WASEET_STATE.user.name,
                    sellerId: WASEET_STATE.user.id,
                    sellerRating: 5.0,
                    sellerDeals: 1,
                    sellerPrice: sellerPrice,
                    evoGunsCount: evoCount,
                    evoGuns: evoCount > 0 ? [`${evoCount} أسلحة إيفو مطورة`] : [],
                    rareSkins: rareSkins,
                    iconicPants: iconicPants,
                    accountNotes: notesStr || 'حساب مضمون ومفحوص من المالك الأصلي مباشرة.',
                    image: finalImages[0],
                    images: finalImages,
                    badge: game === 'free_fire' ? `برايم ${primeLevel}` : 'مميز',
                    featured: false,
                    status: 'available'
                };

                WASEET_STATE.accounts.unshift(newAccount);
                // Save new account to localStorage so it persists on reload
                try {
                    const savedAccounts = JSON.parse(localStorage.getItem('WASEET_USER_ACCOUNTS') || '[]');
                    savedAccounts.unshift(newAccount);
                    localStorage.setItem('WASEET_USER_ACCOUNTS', JSON.stringify(savedAccounts));
                } catch(e) { console.warn('Could not save account', e); }
                saveWaseetData();
                this.renderMarketplace();

                // Reset and close
                this.uploadedImages = [];
                this.renderImagePreviews();
                document.getElementById('modal-sell').classList.remove('active');
                form.reset();

                await waseetAlert(
                    'تم نشر الحساب بنجاح!',
                    `تم إدراج حسابك بنجاح في متجر WASEET مع ${finalImages.length} صور تم إعدادها كـ أوراق لعب ثلاثية الأبعاد!`,
                    'success'
                );
            });
        }
    }

    bindImageUploader() {
        const fileInput = document.getElementById('form-account-images');
        const dropzone = document.getElementById('image-dropzone');
        if (!fileInput || !dropzone) return;

        fileInput.addEventListener('change', (e) => {
            this.handleSelectedFiles(e.target.files);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length) {
                this.handleSelectedFiles(dt.files);
            }
        });
    }

    handleSelectedFiles(fileList) {
        const files = Array.from(fileList);
        if (!files.length) return;

        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                this.uploadedImages.push(event.target.result);
                this.renderImagePreviews();
            };
            reader.readAsDataURL(file);
        });
    }

    renderImagePreviews() {
        const grid = document.getElementById('image-previews-grid');
        const badge = document.getElementById('upload-count-badge');
        if (!grid) return;

        if (badge) {
            badge.innerText = `${this.uploadedImages.length} صور مختارة`;
        }

        grid.innerHTML = this.uploadedImages.map((src, index) => {
            const isMain = index === 0;
            return `
                <div class="preview-thumb-card">
                    <img src="${src}" alt="Preview ${index + 1}" class="preview-thumb-img">
                    ${isMain ? '<span class="preview-main-badge">الغلاف الرئيسي</span>' : ''}
                    <button type="button" class="btn-remove-thumb" onclick="window.waseetApp.removeUploadedImage(${index})" title="حذف الصورة">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    removeUploadedImage(index) {
        this.uploadedImages.splice(index, 1);
        this.renderImagePreviews();
    }

    /* ==========================================================================
       ESCROW REQUEST & WALLET TOPUP (With Waseet Custom Dialogs)
       ========================================================================== */

    async requestEscrow(accountId) {
        // 1. Login requirement check (Requirement 1)
        if (!WASEET_STATE.user) {
            if (typeof waseetAlert === 'function') {
                await waseetAlert(
                    'تسجيل الدخول مطلوب',
                    'يجب تسجيل الدخول أولاً لتتمكن من طلب الوساطة وحجز النقاط في الخزينة الآمنة.',
                    'warning'
                );
            }
            this.openLoginModal();
            return;
        }

        const acc = WASEET_STATE.accounts.find(a => a.id === accountId);
        if (!acc) return;

        const pricing = calculateWaseetFee(acc.sellerPrice);
        const confirmBuy = await waseetConfirm(
            'طلب وساطة وشراء الحساب',
            `هل تود حجز نقاط لشراء هذا الحساب؟\n\nالسعر الإجمالي: ${pricing.buyerPrice} نقطة ($${pricing.buyerPrice})\n(سيتم حجز النقاط في محفظة الوساطة حتى تفحص الحساب وتؤكد استلامه وتغيير كلمة السر بإشراف الوسيط).`,
            'نعم، حجز النقاط والمتابعة',
            'إلغاء الطلب',
            'escrow'
        );

        if (confirmBuy) {
            // Ensure wallet is initialized
            if (!WASEET_STATE.user.wallet) {
                WASEET_STATE.user.wallet = { available: 0, locked: 0, total: 0 };
            }

            // Check available points
            if (WASEET_STATE.user.wallet.available < pricing.buyerPrice) {
                const addPts = await waseetConfirm(
                    'رصيد النقاط غير كافٍ',
                    `رصيدك المتاح (${WASEET_STATE.user.wallet.available} نقطة) لا يكفي لشراء الحساب (${pricing.buyerPrice} نقطة).\nهل تود شحن نقاط المحفظة الآن؟`,
                    'فتح نافذة الشحن',
                    'إلغاء',
                    'warning'
                );
                if (addPts) {
                    document.getElementById('modal-wallet').classList.add('active');
                }
                return;
            }

            // Lock points in escrow
            WASEET_STATE.user.wallet.available -= pricing.buyerPrice;
            WASEET_STATE.user.wallet.locked += pricing.buyerPrice;

            // Dynamically create a real deal record (Requirement 2 & 4)
            // Use localStorage to get a globally persistent deal counter
            let dealCounter = parseInt(localStorage.getItem('WASEET_DEAL_COUNTER') || '0') + 1;
            localStorage.setItem('WASEET_DEAL_COUNTER', String(dealCounter));

            const newDeal = {
                id: 'deal_' + Date.now(),
                dealNumber: dealCounter,
                title: `صفقة رقم ${dealCounter} • ${acc.title}`,
                accountId: acc.id,
                accountTitle: acc.title,
                buyer: { id: WASEET_STATE.user.id, name: WASEET_STATE.user.name, phone: '+212 60 *** ***' },
                seller: { id: 'seller_' + acc.id, name: acc.sellerName, phone: '+213 55 *** ***' },
                mediator: { id: 'admin_waseet', name: 'الوسيط المعتمد' },
                sellerPrice: acc.sellerPrice,
                fee: pricing.fee,
                totalPoints: pricing.buyerPrice,
                currentStep: 2,
                status: 'active',
                stageText: 'المرحلة 2: فحص بيانات الدخول والروابط بواسطة الوسيط',
                credentials: {
                    email: 'seller_' + acc.id + '@gmail.com',
                    password: '•••••••••••• (محمية ومطابقة)',
                    rawPassword: 'FF_Secure_Pass_2026!',
                    loginType: acc.loginType === 'google' ? 'جوجل Gmail' : 'فيسبوك',
                    backupCodes: '8912-4410, 6721-9981'
                },
                sellerMessages: [
                    { sender: 'system', text: `قام المشتري ${WASEET_STATE.user.name} بحجز ${pricing.buyerPrice} نقطة لشراء الحساب.`, time: '12:00' },
                    { sender: 'seller', name: acc.sellerName + ' (البائع)', text: 'مرحباً بالوسيط، قمت برفع بيانات الحساب (الإيميل ورمز الدخول). الحساب نظيف تماماً.', time: '12:02' },
                    { sender: 'mediator', name: 'أنت (الوسيط)', text: 'أهلاً بك، أقوم الآن بفحص الحساب والتأكد من مطابقة السكنات والروابط.', time: '12:04' }
                ],
                buyerMessages: [
                    { sender: 'system', text: `تم حجز ${pricing.buyerPrice} نقطة بنجاح في خزينة الوساطة الآمنة.`, time: '12:00' },
                    { sender: 'buyer', name: WASEET_STATE.user.name + ' (المشتري)', text: 'مرحباً بالوسيط، تم حجز النقاط. بانتظار فحص الحساب والتأكد من بياناته.', time: '12:03' },
                    { sender: 'mediator', name: 'الوسيط المعتمد', text: 'أهلاً بك، أموالك مؤمنة بالكامل في الخزينة، جاري فحص الحساب ومطابقة المواصفات.', time: '12:05' }
                ]
            };

            if (!WASEET_STATE.deals) WASEET_STATE.deals = [];
            WASEET_STATE.deals.unshift(newDeal);
            WASEET_STATE.activeDeal = newDeal;

            this.updateWalletDisplay();
            saveWaseetData();
            this.renderUserProfile();

            // Requirement 2: Notification 2 does NOT stay; disappears automatically and redirects
            this.showAutoDismissToast(
                'تم تأكيد طلب الوساطة وحجز النقاط بنجاح!',
                `تم حجز ${pricing.buyerPrice} نقطة بأمان في خزينة الوساطة وأُدرجت الصفقة في جدول الوسيط!\nجاري نقلك تلقائياً إلى غرفة الوساطة...`,
                2200,
                () => {
                    window.location.href = 'chat.html?dealId=' + newDeal.id;
                }
            );
        }
    }

    showAutoDismissToast(title, message, durationMs = 2200, onComplete = null) {
        const existing = document.getElementById('waseet-auto-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'waseet-auto-toast';
        toast.className = 'waseet-auto-toast card-3d animate-in';
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon-circle glow-orange">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <div class="toast-text-col">
                    <h4 class="toast-title">${title}</h4>
                    <p class="toast-body">${message.replace(/\n/g, '<br>')}</p>
                </div>
            </div>
            <div class="toast-progress-bar">
                <div class="toast-progress-fill" style="animation-duration: ${durationMs}ms;"></div>
            </div>
        `;
        document.body.appendChild(toast);

        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            toast.classList.remove('animate-in');
            toast.classList.add('animate-out');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
                if (typeof onComplete === 'function') onComplete();
            }, 300);
        };

        toast.onclick = finish;
        setTimeout(finish, durationMs);
    }

    async topupSimulation() {
        if (!WASEET_STATE.user) {
            document.getElementById('modal-wallet').classList.remove('active');
            await waseetAlert(
                'تسجيل الدخول مطلوب',
                'يرجى تسجيل الدخول أولاً لتتمكن من شحن وإدارة محفظة النقاط الخاصة بك.',
                'warning'
            );
            this.openLoginModal();
            return;
        }
        if (!WASEET_STATE.user.wallet) {
            WASEET_STATE.user.wallet = { available: 0, locked: 0, total: 0 };
        }
        const amount = parseFloat(document.getElementById('topup-amount').value) || 50;
        const methodInput = document.getElementById('selected-payment-method-val');
        const paymentMethod = methodInput ? methodInput.value : 'طريقة دفع محلية';

        WASEET_STATE.user.wallet.available += amount;
        WASEET_STATE.user.wallet.total += amount;
        this.updateWalletDisplay();
        saveWaseetData();

        document.getElementById('modal-wallet').classList.remove('active');
        await waseetAlert(
            'تم شحن النقاط بنجاح',
            `تم شحن ${amount} نقطة بنجاح إلى محفظتك الآمنة عبر [${paymentMethod}]!\nالرصيد المتاح الآن: ${WASEET_STATE.user.wallet.available} نقطة ($${WASEET_STATE.user.wallet.available}).`,
            'success'
        );
    }
}

/* ============================================================
   Global Helpers for Luxury Stepper & Custom Payment Dropdown
   ============================================================ */
window.waseetAdjustTopup = function(delta) {
    const input = document.getElementById('topup-amount');
    if (!input) return;
    let val = (parseFloat(input.value) || 0) + delta;
    if (val < 10) val = 10;
    if (val > 10000) val = 10000;
    input.value = val;
    window.waseetSyncTopupInput();
};

window.waseetAdjustCalc = function(delta) {
    const input = document.getElementById('calc-seller-input');
    if (!input) return;
    let val = (parseFloat(input.value) || 0) + delta;
    if (val < 5) val = 5;
    if (val > 10000) val = 10000;
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

window.waseetSetTopup = function(val) {
    const input = document.getElementById('topup-amount');
    if (!input) return;
    input.value = val;
    window.waseetSyncTopupInput();
};

window.waseetSyncTopupInput = function() {
    const input = document.getElementById('topup-amount');
    const preview = document.getElementById('topup-live-preview');
    if (!input) return;
    const val = parseFloat(input.value) || 0;
    if (preview) {
        preview.textContent = `${val} نقطة ($${val})`;
    }
    // Update active preset pill
    const pills = document.querySelectorAll('#topup-presets-container .preset-pill');
    pills.forEach(pill => {
        const pVal = parseFloat(pill.textContent.replace('$', '').trim());
        if (pVal === val) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
};

window.waseetTogglePaymentDropdown = function() {
    const wrap = document.getElementById('wallet-payment-select-wrap');
    if (wrap) {
        wrap.classList.toggle('open');
    }
};

window.waseetSelectPaymentCard = function(el) {
    if (!el) return;
    const val = el.getAttribute('data-val') || '';
    const title = el.getAttribute('data-title') || '';
    const country = el.getAttribute('data-country') || '';
    const img = el.getAttribute('data-img') || '';
    const account = el.getAttribute('data-account') || '';
    const label = el.getAttribute('data-account-label') || 'رقم الحساب / المحفظة:';
    const note = el.getAttribute('data-note') || '';

    // Update hidden input
    const hidden = document.getElementById('selected-payment-method-val');
    if (hidden) hidden.value = val;

    // Update active class on cards
    const cards = document.querySelectorAll('#payment-cards-grid .payment-card-item');
    cards.forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    // Update live details panel
    const detailImg = document.getElementById('pay-detail-img');
    const detailTitle = document.getElementById('pay-detail-title');
    const detailCountry = document.getElementById('pay-detail-country');
    const detailLabel = document.getElementById('pay-detail-label');
    const detailAccount = document.getElementById('pay-detail-account');
    const detailNote = document.getElementById('pay-detail-note');

    if (detailImg && img) detailImg.src = img;
    if (detailTitle) detailTitle.textContent = title;
    if (detailCountry) detailCountry.textContent = country;
    if (detailLabel) detailLabel.textContent = label;
    if (detailAccount) detailAccount.textContent = account;
    if (detailNote) {
        detailNote.innerHTML = `<i class="fas fa-info-circle text-gold"></i> <span>${note}</span>`;
    }

    // Sync custom dropdown trigger
    const selectedDisplay = document.getElementById('wallet-payment-selected-val');
    if (selectedDisplay) {
        selectedDisplay.innerHTML = `
            <img src="${img}" class="pay-logo-img" alt="${title}">
            <span class="pay-title-txt">${val}</span>
            <span class="pay-country-pill">${country}</span>
        `;
    }

    // Sync active class in dropdown menu
    const options = document.querySelectorAll('#wallet-payment-menu .custom-select-opt');
    options.forEach(opt => {
        if (opt.getAttribute('data-val') === val) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
};

window.waseetSelectPayment = function(el) {
    if (!el) return;
    const val = el.getAttribute('data-val') || '';
    const title = el.getAttribute('data-title') || '';
    const country = el.getAttribute('data-country') || '';
    const img = el.getAttribute('data-img') || '';

    // Find corresponding card in grid and trigger its selection
    const card = document.querySelector(`#payment-cards-grid .payment-card-item[data-val="${val}"]`);
    if (card) {
        window.waseetSelectPaymentCard(card);
    } else {
        // Fallback
        const hidden = document.getElementById('selected-payment-method-val');
        if (hidden) hidden.value = val;

        const selectedDisplay = document.getElementById('wallet-payment-selected-val');
        if (selectedDisplay) {
            selectedDisplay.innerHTML = `
                <img src="${img}" class="pay-logo-img" alt="${title}">
                <span class="pay-title-txt">${title}</span>
                <span class="pay-country-pill">${country}</span>
            `;
        }
    }

    // Close dropdown
    const wrap = document.getElementById('wallet-payment-select-wrap');
    if (wrap) wrap.classList.remove('open');
};

window.waseetCopyPaymentAccount = function(btn) {
    const valEl = document.getElementById('pay-detail-account');
    if (!valEl) return;
    const text = valEl.textContent.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
    }
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> <span>تم النسخ!</span>';
    btn.style.background = 'var(--gold-primary)';
    btn.style.color = '#0b0e14';
    setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.style.background = '';
        btn.style.color = '';
    }, 1500);
};

// Global click outside to close luxury custom dropdown
document.addEventListener('click', (e) => {
    const wrap = document.getElementById('wallet-payment-select-wrap');
    if (wrap && wrap.classList.contains('open')) {
        if (!wrap.contains(e.target)) {
            wrap.classList.remove('open');
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    window.waseetApp = new WaseetApp();
    if (typeof window.waseetSyncTopupInput === 'function') {
        window.waseetSyncTopupInput();
    }
});

