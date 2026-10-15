/**
 * WASEET (وسيط) - 3-Way Escrow Room Engine
 * Orchestrates Buyer + Seller + Mediator interactions, verification steps, and dynamic role-based views.
 * Supports:
 * 1. Mediator View: 3 Screens (Seller Chat + Buyer Chat + Private Credentials & Control Panel).
 * 2. Buyer View: Buyer Chat + Safe Guarantee / Delivery Slip.
 * 3. Seller View: Seller Chat + Payout Status Card.
 * 4. Refund & Cancellation mechanism (returns points back to buyer's wallet).
 */

class WaseetEscrowRoom {
    constructor() {
        const urlParams = new URLSearchParams(window.location.search);
        const reqDealId = urlParams.get('dealId');
        if (reqDealId && WASEET_STATE.deals) {
            this.deal = WASEET_STATE.deals.find(d => d.id === reqDealId) || WASEET_STATE.activeDeal;
        } else {
            this.deal = WASEET_STATE.activeDeal || (WASEET_STATE.deals && WASEET_STATE.deals[0]) || null;
        }

        if (this.deal) {
            if (!this.deal.sellerMessages) this.deal.sellerMessages = [];
            if (!this.deal.buyerMessages) this.deal.buyerMessages = [];
            if (!this.deal.status) this.deal.status = 'active';
        }

        // Auto-detect viewer role strictly from real logged in user:
        // 1. Mediator/Admin -> shows 3-screen mediator dashboard
        // 2. Seller of the deal -> shows seller view
        // 3. Buyer of the deal -> shows buyer view
        const currentUser = (typeof WASEET_STATE !== 'undefined') ? WASEET_STATE.user : null;
        if (typeof isMediatorUser === 'function' && isMediatorUser(currentUser)) {
            this.viewerRole = 'mediator';
        } else if (currentUser && this.deal && this.deal.seller && (this.deal.seller.id === currentUser.id || this.deal.seller.name === currentUser.name)) {
            this.viewerRole = 'seller';
        } else {
            this.viewerRole = 'buyer';
        }
        this.mediatorTab = 'seller';
        this.buyerTab = 'chat';
        this.init();
    }

    init() {
        this.renderAll();
        this.initLiveSync();
    }

    initLiveSync() {
        if (typeof window === 'undefined') return;

        // 1. BroadcastChannel for instant zero-latency multi-tab sync on same origin
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.syncChannel = new BroadcastChannel('waseet_escrow_live_sync');
                this.syncChannel.onmessage = (event) => {
                    if (event.data && event.data.type === 'NEW_ESCROW_MESSAGE') {
                        this.syncDealFromStorage(event.data.dealId);
                    }
                };
            } catch (e) {
                console.warn('BroadcastChannel not supported', e);
            }
        }

        // 2. Storage event listener (fires when other tabs update localStorage)
        window.addEventListener('storage', (e) => {
            if (e.key === 'WASEET_DEALS_ACTIVE' || e.key === 'WASEET_SYNC_PING') {
                this.syncDealFromStorage();
            }
        });

        // 3. Fallback polling loop (checks every 1200ms)
        if (!this.syncInterval) {
            this.syncInterval = setInterval(() => {
                this.syncDealFromStorage();
            }, 1200);
        }
    }

    broadcastUpdate() {
        if (this.syncChannel) {
            try {
                this.syncChannel.postMessage({
                    type: 'NEW_ESCROW_MESSAGE',
                    dealId: this.deal ? this.deal.id : null,
                    timestamp: Date.now()
                });
            } catch (e) {}
        }
        try {
            localStorage.setItem('WASEET_SYNC_PING', String(Date.now()));
        } catch (e) {}
    }

    syncDealFromStorage(targetDealId = null) {
        if (!this.deal) {
            try {
                const raw = localStorage.getItem('WASEET_DEALS_ACTIVE');
                if (raw) {
                    const deals = JSON.parse(raw);
                    if (Array.isArray(deals) && deals.length > 0) {
                        this.deal = deals[0];
                        WASEET_STATE.deals = deals;
                        WASEET_STATE.activeDeal = deals[0];
                        this.renderAll();
                    }
                }
            } catch (e) {}
            return;
        }

        const currentDealId = targetDealId || this.deal.id;
        try {
            const raw = localStorage.getItem('WASEET_DEALS_ACTIVE');
            if (!raw) return;
            const deals = JSON.parse(raw);
            if (!Array.isArray(deals)) return;
            const updatedDeal = deals.find(d => d.id === currentDealId);
            if (!updatedDeal) return;

            const oldSellerCount = (this.deal.sellerMessages || []).length;
            const oldBuyerCount = (this.deal.buyerMessages || []).length;
            const newSellerCount = (updatedDeal.sellerMessages || []).length;
            const newBuyerCount = (updatedDeal.buyerMessages || []).length;
            const stepChanged = this.deal.currentStep !== updatedDeal.currentStep;
            const statusChanged = this.deal.status !== updatedDeal.status;

            if (newSellerCount !== oldSellerCount || newBuyerCount !== oldBuyerCount || stepChanged || statusChanged) {
                this.deal = updatedDeal;
                if (WASEET_STATE.deals) {
                    const idx = WASEET_STATE.deals.findIndex(d => d.id === this.deal.id);
                    if (idx !== -1) WASEET_STATE.deals[idx] = updatedDeal;
                }
                WASEET_STATE.activeDeal = updatedDeal;

                this.updateChatMessagesOnly();
                if (stepChanged || statusChanged) {
                    this.renderPipeline();
                    this.renderTopAmountPill();
                    const credsPane = document.getElementById('mediator-control-pane');
                    if (credsPane) {
                        credsPane.innerHTML = this.renderMediatorControlPanel();
                    }
                }
            }
        } catch (e) {
            console.warn('Sync failed', e);
        }
    }

    updateChatMessagesOnly() {
        if (!this.deal) return;
        const buyerChatEl = document.getElementById('chat-messages-buyer');
        const sellerChatEl = document.getElementById('chat-messages-seller');

        if (buyerChatEl) {
            const newHtml = this.renderMessageList(this.deal.buyerMessages || []);
            if (buyerChatEl.innerHTML !== newHtml) {
                buyerChatEl.innerHTML = newHtml;
                buyerChatEl.scrollTop = buyerChatEl.scrollHeight;
            }
        }

        if (sellerChatEl) {
            const newHtml = this.renderMessageList(this.deal.sellerMessages || []);
            if (sellerChatEl.innerHTML !== newHtml) {
                sellerChatEl.innerHTML = newHtml;
                sellerChatEl.scrollTop = sellerChatEl.scrollHeight;
            }
        }
    }

    setViewerRole(role) {
        this.viewerRole = role;
        this.renderAll();
    }

    switchMediatorTab(tab) {
        this.mediatorTab = tab;
        const triSplit = document.querySelector('.escrow-tri-split');
        if (triSplit) triSplit.setAttribute('data-active-tab', tab);
        ['seller', 'buyer', 'creds'].forEach(t => {
            const btn = document.getElementById(`tab-btn-${t}`);
            if (btn) btn.classList.toggle('active', t === tab);
        });
        this.scrollAllChats();
    }

    switchBuyerTab(tab) {
        this.buyerTab = tab;
        const split = document.querySelector('.escrow-split');
        if (split) split.setAttribute('data-active-tab', tab);
        ['chat', 'info'].forEach(t => {
            const btn = document.getElementById(`tab-btn-buyer-${t}`);
            if (btn) btn.classList.toggle('active', t === tab);
        });
        this.scrollAllChats();
    }

    renderAll() {
        if (!this.deal) {
            this.renderEmptyState();
            return;
        }
        // Banner hidden for all roles (removed by design)
        const banner = document.getElementById('role-notice-banner');
        if (banner) banner.innerHTML = '';
        this.renderTopAmountPill();
        this.renderPipeline();
        this.renderWorkspace();
    }

    renderEmptyState() {
        const topPill = document.querySelector('.locked-amount-pill');
        const metaTitle = document.querySelector('.deal-meta-title');
        const metaDesc = document.querySelector('.deal-meta-id');
        const banner = document.getElementById('role-notice-banner');
        const pipeline = document.getElementById('escrow-pipeline');
        const container = document.getElementById('escrow-workspace-container');
        const dealSelect = document.getElementById('active-deal-switcher');

        if (dealSelect) {
            dealSelect.innerHTML = '<option value="">لا توجد صفقات جارية</option>';
        }
        if (metaTitle) metaTitle.innerText = 'غرفة الوساطة المباشرة';
        if (metaDesc) metaDesc.innerText = 'لا توجد صفقة نشطة حالياً في النظام';
        if (topPill) {
            topPill.innerHTML = `<span>المبلغ المحجوز:</span> <strong style="color: var(--gold-light); font-family: var(--font-en); font-size: 1.2rem;">0 نقطة</strong>`;
            topPill.style.borderColor = 'var(--gold-primary)';
            topPill.style.boxShadow = 'none';
        }
        if (banner) banner.innerHTML = '';
        if (pipeline) pipeline.innerHTML = '';

        if (container) {
            container.innerHTML = `
                <div class="empty-deals-box" style="padding: 3.5rem 1.5rem; text-align: center; max-width: 650px; margin: 1.5rem auto;">
                    <i class="fas fa-shield-alt text-gold" style="font-size: 3.5rem; margin-bottom: 1.2rem; display: block; opacity: 0.85;"></i>
                    <h2 style="color: #fff; font-size: 1.45rem; margin-bottom: 0.6rem;">لا توجد جلسة وساطة نشطة حالياً</h2>
                    <p style="font-size: 0.95rem; line-height: 1.8; color: var(--silver-muted); margin-bottom: 2rem;">
                        لبدء صفقة شراء آمنة، تصفح سوق الحسابات واختر الحساب المناسب ثم اضغط على "طلب وساطة" لحجز النقاط وبدء المحادثة المشفرة فوراً مع الوسيط المعتمد.
                    </p>
                    <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                        <a href="index.html#marketplace" class="btn-3d btn-orange" style="text-decoration: none; padding: 0.75rem 1.4rem;">
                            <i class="fas fa-store"></i> الانتقال إلى سوق الحسابات
                        </a>
                        <a href="deals.html" class="btn-3d btn-gold" style="text-decoration: none; padding: 0.75rem 1.4rem;">
                            <i class="fas fa-crown"></i> إدارة قائمة الصفقات
                        </a>
                    </div>
                </div>
            `;
        }
    }

    renderTopAmountPill() {
        const topPill = document.querySelector('.locked-amount-pill');
        const metaTitle = document.querySelector('.deal-meta-title');
        const metaDesc = document.querySelector('.deal-meta-id');
        const dealSelect = document.getElementById('active-deal-switcher');

        if (dealSelect) {
            const allDeals = (WASEET_STATE.deals && WASEET_STATE.deals.length) ? [...WASEET_STATE.deals] : [this.deal];
            if (!allDeals.some(d => d.id === this.deal.id)) {
                allDeals.unshift(this.deal);
            }
            dealSelect.innerHTML = allDeals.map((d, idx) => `
                <option value="${d.id}" ${d.id === this.deal.id ? 'selected' : ''}>
                    #DEAL-${d.dealNumber || (idx + 1)} (${d.totalPoints}$)
                </option>
            `).join('');
            dealSelect.value = this.deal.id;
            const wrap = document.getElementById('deal-switcher-wrap');
            if (wrap) {
                wrap.style.display = allDeals.length > 1 ? 'flex' : 'none';
            }
        }

        if (metaTitle) {
            metaTitle.innerText = `غرفة الوساطة المباشرة (${this.deal.title || '#' + this.deal.id})`;
        }
        if (metaDesc) {
            const buyerName = (this.deal.buyer && this.deal.buyer.name) ? this.deal.buyer.name : 'المشتري';
            const sellerName = (this.deal.seller && this.deal.seller.name) ? this.deal.seller.name : 'البائع';
            metaDesc.innerText = `${this.deal.accountTitle} • المشتري: ${buyerName} • البائع: ${sellerName} • الوسيط: إدارة المنصة`;
        }

        if (!topPill) return;

        if (this.deal.status === 'cancelled') {
            topPill.innerHTML = `
                <span style="color: #ef4444; font-weight: 700;"><i class="fas fa-undo-alt"></i> حالة الصفقة:</span>
                <strong style="color: #ef4444; font-family: var(--font-ar); font-size: 1.05rem;">ملغاة • تم استرجاع ${this.deal.totalPoints}$ للمشتري</strong>
            `;
            topPill.style.borderColor = '#ef4444';
            topPill.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.3)';
        } else if (this.deal.status === 'completed' || this.deal.currentStep >= 4) {
            topPill.innerHTML = `
                <span style="color: #10b981; font-weight: 700;"><i class="fas fa-check-double"></i> حالة الصفقة:</span>
                <strong style="color: #10b981; font-family: var(--font-ar); font-size: 1.05rem;">مكتملة بنجاح 100% • تم تحرير الأرباح</strong>
            `;
            topPill.style.borderColor = '#10b981';
            topPill.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.3)';
        } else {
            topPill.innerHTML = `
                <span>المبلغ المحجوز:</span>
                <strong style="color: var(--gold-light); font-family: var(--font-en); font-size: 1.2rem;">${this.deal.totalPoints} نقطة (${this.deal.totalPoints}$)</strong>
            `;
            topPill.style.borderColor = 'var(--gold-primary)';
            topPill.style.boxShadow = 'none';
        }
    }

    renderNoticeBanner() {
        const banner = document.getElementById('role-notice-banner');
        if (!banner || !this.deal) return;

        const isCancelled = this.deal.status === 'cancelled';
        const isCompleted = this.deal.status === 'completed' || this.deal.currentStep >= 4;
        const buyerName = (this.deal.buyer && this.deal.buyer.name) ? this.deal.buyer.name : 'المشتري';
        const sellerName = (this.deal.seller && this.deal.seller.name) ? this.deal.seller.name : 'البائع';
        const pts = this.deal.totalPoints || 0;
        const sellerPayout = this.deal.sellerPrice || 0;
        const fee = this.deal.fee || 0;

        if (this.viewerRole === 'mediator') {
            let note = 'لديك شاشات مستقلة للتواصل مع البائع والمشتري بشكل منفصل، مع صلاحية حصرية لفحص بيانات الدخول وإلغاء/تحرير الصفقة.';
            if (isCancelled) note = `⚠️ تم إلغاء الصفقة ورفض الحساب وتمت إعادة كامل المبلغ (${pts}$) إلى محفظة المشتري.`;
            if (isCompleted) note = `✅ اكتملت صفقة الوساطة بنجاح! تم تحويل ${sellerPayout}$ للبائع وإيداع عمولتك ${fee}$ في أرباح المنصة.`;

            banner.innerHTML = `
                <div class="banner-mediator">
                    <i class="fas fa-crown text-gold"></i>
                    <div style="flex: 1;">
                        <strong>أنت تشاهد الغرفة بصفتك: الوسيط المعتمد (المدير) - وضع الشاشات الثلاث</strong>
                        <div style="font-size: 0.8rem; color: var(--silver-muted); margin-top: 2px;">${note}</div>
                    </div>
                </div>
            `;
        } else if (this.viewerRole === 'buyer') {
            let note = 'أنت تتواصل في شات خاص ومباشر مع الوسيط المعتمد فقط. أموالك مؤمنة بالكامل.';
            if (isCancelled) note = `💰 تم إلغاء الصفقة واسترجاع ${pts} نقطة بالكامل إلى محفظتك المتاحة بنجاح دون أي خصم.`;
            if (isCompleted) note = '🎉 تهانينا! اكتملت صفقة الشراء بنجاح والحساب أصبح ملكك رسمياً مع ضمان WASEET الذهبي.';

            banner.innerHTML = `
                <div class="banner-buyer">
                    <i class="fas fa-shopping-cart text-orange"></i>
                    <div style="flex: 1;">
                        <strong>أنت تشاهد الغرفة بصفتك: المشتري (${buyerName})</strong>
                        <div style="font-size: 0.8rem; color: var(--silver-muted); margin-top: 2px;">${note}</div>
                    </div>
                </div>
            `;
        } else {
            let note = 'أنت تتواصل في شات خاص ومباشر مع الوسيط المعتمد فقط لمتابعة تسليم الحساب ومستحقاتك.';
            if (isCancelled) note = '⚠️ تم إلغاء الصفقة لعدم مطابقة بيانات الحساب للشروط، وتم استرجاع النقاط للمشتري.';
            if (isCompleted) note = `💰 مبروك! تم إيداع ${sellerPayout}$ في رصيدك المتاح للسحب كاش فوراً.`;

            banner.innerHTML = `
                <div class="banner-seller">
                    <i class="fas fa-store text-silver"></i>
                    <div style="flex: 1;">
                        <strong>أنت تشاهد الغرفة بصفتك: البائع (${sellerName})</strong>
                        <div style="font-size: 0.8rem; color: var(--silver-muted); margin-top: 2px;">${note}</div>
                    </div>
                </div>
            `;
        }
    }

    renderPipeline() {
        const pipelineContainer = document.getElementById('escrow-pipeline');
        if (!pipelineContainer) return;

        if (this.deal.status === 'cancelled') {
            pipelineContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 0.5rem; color: #ef4444; font-weight: 700;">
                    <i class="fas fa-times-circle"></i> تم إيقاف وإلغاء مراحل الصفقة • تم إرجاع النقاط للمشتري
                </div>
            `;
            return;
        }

        const pts = this.deal.totalPoints || 0;
        const steps = [
            { num: 1, title: 'حجز النقاط', desc: `تم حجز ${pts} نقطة بالخزينة` },
            { num: 2, title: 'نقل الملكية', desc: 'تغيير الربط وتأمين المشتري' },
            { num: 3, title: 'تحرير الرصيد', desc: 'إرسال الأرباح وإنهاء الصفقة' }
        ];

        pipelineContainer.innerHTML = steps.map(step => {
            let statusClass = 'step-pending';
            let icon = `<span class="step-num">${step.num}</span>`;

            if (step.num < this.deal.currentStep) {
                statusClass = 'step-done';
                icon = '<i class="fas fa-check"></i>';
            } else if (step.num === this.deal.currentStep) {
                statusClass = 'step-active';
                icon = `<span class="step-num pulse">${step.num}</span>`;
            }

            return `
                <div class="pipeline-step ${statusClass}">
                    <div class="step-icon-wrap">${icon}</div>
                    <div class="step-info">
                        <div class="step-title">${step.title}</div>
                        <div class="step-desc">${step.desc}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderWorkspace() {
        const container = document.getElementById('escrow-workspace-container');
        if (!container) return;

        // ==========================================
        // 1. MEDIATOR VIEW (3 SCREENS / 3 COLUMNS)
        // Screen 1: الوسيط ↔ البائع
        // Screen 2: الوسيط ↔ المشتري
        // Screen 3: بيانات الدخول السرية + أدوات التحكم
        // ==========================================
        if (this.viewerRole === 'mediator') {
            container.innerHTML = `
                <div class="escrow-tri-split">
                    
                    <!-- Screen 1: الشات بين الوسيط والبائع (سامي) -->
                    <div class="chat-pane chat-pane-seller">
                        <div class="chat-header">
                            <div class="chat-title chat-card-title-seller">
                                <i class="fas fa-store text-silver"></i>
                                <span>شات مع البائع (سامي)</span>
                            </div>
                            <span class="badge-role seller-badge">قناة البائع</span>
                        </div>
                        <div class="chat-messages" id="chat-messages-seller">
                            ${this.renderMessageList(this.deal.sellerMessages)}
                        </div>
                        <div class="chat-footer">
                            <input type="text" id="input-seller-chat" class="chat-input" placeholder="رسالة للبائع فقط...">
                            <button class="btn-3d btn-outline" onclick="window.escrowRoom.sendMessageToSeller()">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Screen 2: الشات بين الوسيط والمشتري (أحمد) -->
                    <div class="chat-pane chat-pane-buyer">
                        <div class="chat-header">
                            <div class="chat-title chat-card-title-buyer">
                                <i class="fas fa-shopping-cart text-orange"></i>
                                <span>شات مع المشتري (أحمد)</span>
                            </div>
                            <span class="badge-role buyer-badge">قناة المشتري</span>
                        </div>
                        <div class="chat-messages" id="chat-messages-buyer">
                            ${this.renderMessageList(this.deal.buyerMessages)}
                        </div>
                        <div class="chat-footer">
                            <input type="text" id="input-buyer-chat" class="chat-input" placeholder="رسالة للمشتري فقط...">
                            <button class="btn-3d btn-orange" onclick="window.escrowRoom.sendMessageToBuyer()">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Screen 3: بيانات الدخول السرية + أزرار التأكيد أو الإلغاء -->
                    <div class="mediator-pane" id="mediator-control-pane">
                        ${this.renderMediatorControlPanel()}
                    </div>

                </div>
            `;
            this.bindMediatorInputs();
            this.scrollAllChats();
            return;
        }

        // ==========================================
        // 2. BUYER VIEW (ONLY HIS CHAT & GUARANTEE CARD - Requirement 4 & 9)
        // Strictly isolated: Buyer sees only mediator chat and receipt guarantee
        // ==========================================
        if (this.viewerRole === 'buyer') {
            container.innerHTML = `
                <div class="escrow-split">
                    <!-- Column 1: محادثة المشتري مع الوسيط المعتمد فقط -->
                    <div class="chat-pane buyer-chat-pane">
                        <div class="chat-header">
                            <div class="chat-title">
                                <i class="fas fa-comments text-orange"></i>
                                <span>محادثة المشتري مع الوسيط المعتمد</span>
                            </div>
                        </div>
                        <div class="chat-messages" id="chat-messages-buyer">
                            ${this.renderMessageList(this.deal.buyerMessages)}
                        </div>
                        <div class="chat-footer">
                            <input type="text" id="input-buyer-single" class="chat-input" placeholder="اكتب استفسارك للوسيط المعتمد...">
                            <button class="btn-3d btn-orange" onclick="window.escrowRoom.sendBuyerMessage()">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Column 2: بطاقة الحساب وضمان الاستلام للمشتري -->
                    <div class="mediator-pane buyer-side-pane">
                        ${this.renderBuyerSideCard()}
                    </div>
                </div>
            `;
            this.bindSingleChatInput('input-buyer-single', () => this.sendBuyerMessage());
            this.scrollAllChats();
            return;
        }

        // ==========================================
        // 3. SELLER VIEW (2 SCREENS)
        // Screen 1: الشات مع الوسيط فقط
        // Screen 2: بطاقة المستحقات والضمان
        // ==========================================
        if (this.viewerRole === 'seller') {
            container.innerHTML = `
                <div class="escrow-split">
                    <div class="mediator-pane">
                        ${this.renderSellerSideCard()}
                    </div>
                    <div class="chat-pane">
                        <div class="chat-header">
                            <div class="chat-title">
                                <i class="fas fa-shield-alt text-silver"></i>
                                <span>محادثة البائع مع الوسيط المعتمد</span>
                            </div>
                        </div>
                        <div class="chat-messages" id="chat-messages-seller">
                            ${this.renderMessageList(this.deal.sellerMessages)}
                        </div>
                        <div class="chat-footer">
                            <input type="text" id="input-seller-single" class="chat-input" placeholder="اكتب للوسيط بخصوص الحساب...">
                            <button class="btn-3d btn-gold" onclick="window.escrowRoom.sendSellerMessage()">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            this.bindSingleChatInput('input-seller-single', () => this.sendSellerMessage());
            this.scrollAllChats();
        }
    }

    renderMediatorControlPanel() {
        const creds = this.deal.credentials || {
            loginType: 'جوجل Gmail',
            email: 'seller@gmail.com',
            password: '••••••••••••',
            rawPassword: 'Pass@2026',
            backupCodes: 'غير محدد'
        };
        const isCancelled = this.deal.status === 'cancelled';
        const isCompleted = this.deal.status === 'completed' || this.deal.currentStep >= 4;

        let actionButtonsHtml = '';

        const pts = this.deal.totalPoints || 0;
        const sellerPayout = this.deal.sellerPrice || 0;
        const fee = this.deal.fee || 0;

        if (isCancelled) {
            actionButtonsHtml = `
                <div class="cancelled-card-highlight">
                    <i class="fas fa-times-circle text-orange" style="font-size: 2rem; margin-bottom: 0.5rem; color: #ef4444;"></i>
                    <h4 style="color: #fff; margin-bottom: 0.3rem;">تم إلغاء الصفقة ورفض الحساب</h4>
                    <p style="color: var(--silver-muted); font-size: 0.8rem; line-height: 1.6;">
                        تم استرجاع ${pts}$ بالكامل إلى محفظة المشتري وإلغاء تجميد الرصيد.
                    </p>
                </div>
            `;
        } else if (isCompleted) {
            actionButtonsHtml = `
                <div class="deal-completed-badge" style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; padding: 0.8rem; border-radius: 10px; text-align: center; font-weight: 700;">
                    <i class="fas fa-check-circle"></i> اكتملت صفقة الوساطة بنجاح 100%!
                </div>
            `;
        } else {
            let nextBtn = '';
            if (this.deal.currentStep <= 2) {
                nextBtn = `
                    <button class="btn-3d btn-gold glow-gold" style="width: 100%;" onclick="window.escrowRoom.advanceStep(3, 'الحساب مفحوص ومطابق للمواصفات مسبقاً قبل العرض. قام الوسيط بتسليم البيانات ونقل الربط للمشتري وتأمينه بنجاح.')">
                        <i class="fas fa-key"></i> تأكيد نقل الملكية للمشتري
                    </button>
                `;
            } else if (this.deal.currentStep === 3) {
                nextBtn = `
                    <button class="btn-3d btn-gold glow-gold" style="width: 100%;" onclick="window.escrowRoom.completeDeal()">
                        <i class="fas fa-coins"></i> تحرير الرصيد (${sellerPayout}$ للبائع + ${fee}$ عمولة المنصة)
                    </button>
                `;
            }

            actionButtonsHtml = `
                ${nextBtn}
                <button class="btn-3d btn-danger-cancel" onclick="window.escrowRoom.cancelAndRefundDeal()">
                    <i class="fas fa-undo-alt"></i> إلغاء الصفقة واسترجاع ${pts}$ للمشتري
                </button>
            `;
        }

        return `
            <div class="creds-header">
                <div class="creds-title">
                    <i class="fas fa-shield-alt text-gold"></i>
                    <span>بيانات الدخول السرية (خاصة بالوسيط)</span>
                </div>
                <span class="badge-secure">مشفرة برمجياً</span>
            </div>
            <div class="creds-grid">
                <div class="cred-item">
                    <span class="cred-label">طريقة الدخول:</span>
                    <span class="cred-value">${creds.loginType}</span>
                </div>
                <div class="cred-item">
                    <span class="cred-label">البريد الإلكتروني:</span>
                    <span class="cred-value text-silver font-mono">${creds.email}</span>
                </div>
                <div class="cred-item">
                    <span class="cred-label">كلمة المرور:</span>
                    <span class="cred-value font-mono text-orange" id="cred-pwd">${creds.password}</span>
                    <button class="btn-sm-reveal" onclick="window.escrowRoom.togglePassword()">
                        <i class="fas fa-eye"></i> إظهار
                    </button>
                </div>
                <div class="cred-item">
                    <span class="cred-label">أكواد الاسترداد:</span>
                    <span class="cred-value font-mono">${creds.backupCodes}</span>
                </div>
            </div>
            <div class="mediator-actions-bar" style="margin-top: 1.2rem; display: flex; flex-direction: column; gap: 0.5rem;">
                ${actionButtonsHtml}
            </div>
        `;
    }

    renderBuyerSideCard() {
        const isCancelled = this.deal.status === 'cancelled';
        const isCompleted = this.deal.status === 'completed' || this.deal.currentStep >= 4;
        const creds = this.deal.credentials || {
            loginType: 'جوجل Gmail',
            email: 'buyer@gmail.com',
            password: '••••••••••••',
            rawPassword: '••••••••••••',
            backupCodes: 'لا يوجد'
        };

        if (isCancelled) {
            const pts = this.deal.totalPoints || 0;
            return `
                <div class="creds-header">
                    <div class="creds-title"><i class="fas fa-undo-alt" style="color: #ef4444;"></i> <span>إلغاء الصفقة واسترجاع النقاط</span></div>
                    <span class="badge-secure" style="border-color: #ef4444; color: #ef4444;">تم الاسترجاع</span>
                </div>
                <div class="safe-panel-body">
                    <div class="cancelled-card-highlight">
                        <i class="fas fa-wallet text-gold" style="font-size: 2.2rem; margin-bottom: 0.5rem;"></i>
                        <h4 style="color: #fff; margin-bottom: 0.4rem;">تم استرجاع ${pts} نقطة لمحافظتك بالكامل</h4>
                        <p style="color: var(--silver-muted); font-size: 0.85rem; line-height: 1.6;">
                            قام الوسيط المعتمد برفض بيانات الحساب لعدم مطابقتها أو لحمايتك من أي خلل. تمت إعادة كامل المبلغ إلى رصيدك المتاح دون خصم أي عمولة.
                        </p>
                    </div>
                </div>
            `;
        }

        if (isCompleted) {
            return `
                <div class="creds-header">
                    <div class="creds-title"><i class="fas fa-certificate text-gold"></i> <span>بطاقة استلام الحساب والضمان المعتمد</span></div>
                    <span class="badge-secure" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border-color: #10b981;"><i class="fas fa-check-circle"></i> اكتملت الصفقة 100%</span>
                </div>
                <div class="safe-panel-body">
                    <div class="success-card-highlight">
                        <i class="fas fa-crown text-gold" style="font-size: 2.3rem; margin-bottom: 0.5rem;"></i>
                        <h4 style="color: #fff; font-size: 1.15rem; margin-bottom: 0.4rem;">🎉 تهانينا! الحساب أصبح ملكك رسمياً</h4>
                        <p style="color: var(--silver-muted); font-size: 0.85rem; line-height: 1.7;">
                            تم فحص الحساب مسبقاً وتأكيد سلامته، وقام الوسيط المعتمد بفك كافة الروابط القديمة للبائع وتثبيت بياناتك الشخصية بنجاح.
                        </p>
                    </div>
                    <div class="delivery-credentials-card">
                        <div class="cred-item"><span class="cred-label">نوع الربط:</span><span class="cred-value font-mono text-silver">${creds.loginType}</span></div>
                        <div class="cred-item"><span class="cred-label">البريد الإلكتروني:</span><span class="cred-value font-mono text-gold">${creds.email}</span></div>
                        <div class="cred-item"><span class="cred-label">حالة كلمة المرور:</span><span class="cred-value" style="color: #10b981; font-weight: 700;"><i class="fas fa-check-circle"></i> مؤمنة ومربوطة بجهازك</span></div>
                        <div class="cred-item"><span class="cred-label">ضمان WASEET:</span><span class="cred-value" style="color: #10b981; font-weight: 700;"><i class="fas fa-shield-alt"></i> 48 ساعة حماية ضد الاسترجاع</span></div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="creds-header">
                <div class="creds-title"><i class="fas fa-user-shield text-gold"></i> <span>حماية المشتري وضمان الاستلام</span></div>
                <span class="badge-secure">نقاطك مؤمنة 100%</span>
            </div>
            <div class="safe-panel-body">
                <div class="shield-lock-notice">
                    <i class="fas fa-lock text-orange" style="font-size: 2.2rem; margin-bottom: 0.6rem;"></i>
                    <h4 style="color: #fff; font-size: 1.05rem; margin-bottom: 0.4rem;">بيانات الدخول محمية ومحجوبة عنك حالياً</h4>
                    <p style="color: var(--silver-muted); font-size: 0.85rem; line-height: 1.7;">
                        الحساب تم فحصه واعتماده مسبقاً قبل عرضه في المتجر. يقوم الوسيط المعتمد الآن بنقل الربط وتغيير بيانات الدخول وتأمين الحساب باسمك 100%. لن يُحرر أي رصيد للبائع إلا بعد استلامك التام للحساب.
                    </p>
                </div>
                <div class="deal-receipt-summary">
                    <div class="receipt-row"><span style="color: var(--silver-muted);">الحساب المطلوب:</span><span class="text-white" style="font-weight: 700;">${this.deal.accountTitle}</span></div>
                    <div class="receipt-row"><span style="color: var(--silver-muted);">المبلغ المحجوز من محفظتك:</span><span class="text-gold font-mono" style="font-weight: 800;">${this.deal.totalPoints} نقطة (${this.deal.totalPoints}$)</span></div>
                    <div class="receipt-row"><span style="color: var(--silver-muted);">حالة الضمان:</span><span style="color: #10b981; font-weight: 700;"><i class="fas fa-check-circle"></i> مؤمن بالكامل في خزينة الوساطة</span></div>
                </div>
            </div>
        `;
    }

    renderSellerSideCard() {
        const isCancelled = this.deal.status === 'cancelled';
        const isCompleted = this.deal.status === 'completed' || this.deal.currentStep >= 4;

        if (isCancelled) {
            return `
                <div class="creds-header">
                    <div class="creds-title"><i class="fas fa-times-circle" style="color: #ef4444;"></i> <span>إلغاء الصفقة</span></div>
                    <span class="badge-secure" style="border-color: #ef4444; color: #ef4444;">ملغاة</span>
                </div>
                <div class="safe-panel-body">
                    <div class="cancelled-card-highlight">
                        <i class="fas fa-ban" style="font-size: 2.2rem; margin-bottom: 0.5rem; color: #ef4444;"></i>
                        <h4 style="color: #fff; margin-bottom: 0.4rem;">تم إلغاء الصفقة بواسطة الوسيط</h4>
                        <p style="color: var(--silver-muted); font-size: 0.85rem; line-height: 1.6;">
                            تم إلغاء الصفقة وإرجاع النقاط للمشتري. يرجى مراجعة الوسيط عبر الشات لمعرفة سبب الرفض وإعادة نشر الحساب بالشروط الصحيحة.
                        </p>
                    </div>
                </div>
            `;
        }

        const sellerPayout = this.deal.sellerPrice || 0;
        const fee = this.deal.fee || 0;

        if (isCompleted) {
            return `
                <div class="creds-header">
                    <div class="creds-title"><i class="fas fa-check-double text-gold"></i> <span>إشعار تحويل الأرباح للمحفظة</span></div>
                    <span class="badge-secure" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border-color: #10b981;"><i class="fas fa-coins"></i> تم الإيداع بنجاح</span>
                </div>
                <div class="safe-panel-body">
                    <div class="payout-card-highlight">
                        <i class="fas fa-wallet text-gold" style="font-size: 2.4rem; margin-bottom: 0.5rem;"></i>
                        <span style="font-size: 0.85rem; color: var(--silver-muted);">تم إيداع أرباحك في محفظتك المتاحة:</span>
                        <div style="font-size: 2.2rem; font-weight: 800; font-family: var(--font-en); color: #10b981; margin: 0.3rem 0;">+$${sellerPayout} <span style="font-size: 1rem; color: #fff;">(${sellerPayout} نقطة)</span></div>
                        <span style="font-size: 0.75rem; color: var(--silver-muted);">رصيدك متاح الآن للسحب الفوري كاش</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="creds-header">
                <div class="creds-title"><i class="fas fa-wallet text-gold"></i> <span>مستحقات البائع والضمان المالي</span></div>
                <span class="badge-secure">الرصيد محجوز بالخزينة</span>
            </div>
            <div class="safe-panel-body">
                <div class="payout-card-highlight">
                    <span style="font-size: 0.8rem; color: var(--silver-muted);">صافي ربحك من هذه الصفقة:</span>
                    <div style="font-size: 2rem; font-weight: 800; font-family: var(--font-en); color: var(--gold-light); margin: 0.3rem 0;">$${sellerPayout} <span style="font-size: 0.95rem; color: #fff;">(${sellerPayout} نقطة)</span></div>
                    <span style="font-size: 0.75rem; color: var(--silver-muted);">+ ${fee}$ عمولة المنصة يدفعها المشتري تلقائياً</span>
                </div>
                <p style="color: var(--silver-muted); font-size: 0.85rem; line-height: 1.7; margin-top: 1rem;">
                    تم استلام بيانات الحساب التي رفعتها ويقوم الوسيط بفحصها الآن. بمجرد أن ينهي الوسيط تسليم الحساب للمشتري وتأكيد الربط، سيقوم الوسيط فوراً بضغط زر <strong>تحرير الرصيد</strong> لتصلك الـ ${sellerPayout} نقطة في محفظتك المتاحة للسحب كاش.
                </p>
            </div>
        `;
    }

    renderMessageList(messagesArray) {
        if (!messagesArray || !messagesArray.length) {
            return '<div style="color: var(--silver-muted); text-align: center; font-size: 0.8rem; padding: 2rem;">لا توجد رسائل سابقة.</div>';
        }

        return messagesArray.map(msg => {
            if (msg.sender === 'system') {
                return `
                    <div class="chat-msg system-msg">
                        <i class="fas fa-info-circle text-gold"></i>
                        <span>${msg.text}</span>
                        <span class="msg-time">${msg.time}</span>
                    </div>
                `;
            }

            let senderClass = '';
            let senderBadge = '';

            if (msg.sender === 'mediator') {
                senderClass = 'msg-mediator';
                senderBadge = '<span class="badge-role mediator-badge"><i class="fas fa-crown"></i> الوسيط المعتمد</span>';
            } else if (msg.sender === 'buyer') {
                senderClass = 'msg-buyer';
                senderBadge = '<span class="badge-role buyer-badge"><i class="fas fa-shopping-cart"></i> المشتري</span>';
            } else {
                senderClass = 'msg-seller';
                senderBadge = '<span class="badge-role seller-badge"><i class="fas fa-store"></i> البائع</span>';
            }

            return `
                <div class="chat-msg ${senderClass}">
                    <div class="msg-header">
                        <span class="msg-author">${msg.name}</span>
                        ${senderBadge}
                        <span class="msg-time">${msg.time}</span>
                    </div>
                    <div class="msg-body">${msg.text}</div>
                </div>
            `;
        }).join('');
    }

    bindMediatorInputs() {
        const inputSeller = document.getElementById('input-seller-chat');
        const inputBuyer = document.getElementById('input-buyer-chat');

        if (inputSeller) {
            inputSeller.onkeypress = (e) => {
                if (e.key === 'Enter') this.sendMessageToSeller();
            };
        }
        if (inputBuyer) {
            inputBuyer.onkeypress = (e) => {
                if (e.key === 'Enter') this.sendMessageToBuyer();
            };
        }
    }

    bindSingleChatInput(inputId, sendFn) {
        const el = document.getElementById(inputId);
        if (el) {
            el.onkeypress = (e) => {
                if (e.key === 'Enter') sendFn();
            };
        }
    }

    sendMessageToSeller() {
        const input = document.getElementById('input-seller-chat');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        this.deal.sellerMessages.push({
            sender: 'mediator',
            name: 'الوسيط المعتمد (أنت)',
            text: text,
            time: timeStr
        });

        input.value = '';
        this.renderWorkspace();
        saveWaseetData();
        this.broadcastUpdate();
    }

    sendMessageToBuyer() {
        const input = document.getElementById('input-buyer-chat');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        this.deal.buyerMessages.push({
            sender: 'mediator',
            name: 'الوسيط المعتمد (أنت)',
            text: text,
            time: timeStr
        });

        input.value = '';
        this.renderWorkspace();
        saveWaseetData();
        this.broadcastUpdate();
    }

    sendBuyerMessage() {
        const input = document.getElementById('input-buyer-single');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const buyerName = (WASEET_STATE.user && WASEET_STATE.user.name) ? WASEET_STATE.user.name + ' (المشتري)' : ((this.deal.buyer && this.deal.buyer.name) ? this.deal.buyer.name + ' (المشتري)' : 'المشتري');

        this.deal.buyerMessages.push({
            sender: 'buyer',
            name: buyerName,
            text: text,
            time: timeStr
        });

        input.value = '';
        this.renderWorkspace();
        saveWaseetData();
        this.broadcastUpdate();
    }

    sendSellerMessage() {
        const input = document.getElementById('input-seller-single');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const sellerName = (WASEET_STATE.user && WASEET_STATE.user.name) ? WASEET_STATE.user.name + ' (البائع)' : ((this.deal.seller && this.deal.seller.name) ? this.deal.seller.name + ' (البائع)' : 'البائع');

        this.deal.sellerMessages.push({
            sender: 'seller',
            name: sellerName,
            text: text,
            time: timeStr
        });

        input.value = '';
        this.renderWorkspace();
        saveWaseetData();
        this.broadcastUpdate();
    }

    scrollAllChats() {
        const containers = ['chat-messages-seller', 'chat-messages-buyer'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.scrollTop = el.scrollHeight;
        });
    }

    togglePassword() {
        const pwdEl = document.getElementById('cred-pwd');
        if (!pwdEl) return;
        if (pwdEl.innerText.includes('•')) {
            pwdEl.innerText = this.deal.credentials.rawPassword;
        } else {
            pwdEl.innerText = this.deal.credentials.password;
        }
    }

    advanceStep(nextStep, systemNotice) {
        this.deal.currentStep = nextStep;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const noticeObj = {
            sender: 'system',
            text: systemNotice,
            time: timeStr
        };

        this.deal.sellerMessages.push(noticeObj);
        this.deal.buyerMessages.push(noticeObj);

        this.renderAll();
        saveWaseetData();
        this.broadcastUpdate();
    }

    async completeDeal() {
        this.deal.status = 'completed';
        this.deal.currentStep = 4;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        this.deal.sellerMessages.push({
            sender: 'system',
            text: `🎉 تم تحرير الرصيد بنجاح! تم إيداع ${this.deal.sellerPrice}$ في محفظتك المتاحة للسحب كاش.`,
            time: timeStr
        });

        this.deal.buyerMessages.push({
            sender: 'system',
            text: '🎉 اكتملت الصفقة بنجاح وتم تسليم الحساب لك رسمياً مع سريان ضمان WASEET الذهبي لمدة 48 ساعة.',
            time: timeStr
        });

        // Deduct from locked points
        if (WASEET_STATE.user && WASEET_STATE.user.wallet) {
            if (WASEET_STATE.user.wallet.locked >= this.deal.totalPoints) {
                WASEET_STATE.user.wallet.locked -= this.deal.totalPoints;
                WASEET_STATE.user.wallet.total -= this.deal.totalPoints;
            }
        }

        // Move deal from active to completed deals archive (Requirement 5)
        if (WASEET_STATE.deals) {
            WASEET_STATE.deals = WASEET_STATE.deals.filter(d => d.id !== this.deal.id);
        }
        if (!WASEET_STATE.completedDeals) WASEET_STATE.completedDeals = [];
        if (!WASEET_STATE.completedDeals.some(d => d.id === this.deal.id)) {
            WASEET_STATE.completedDeals.unshift(this.deal);
        }

        saveWaseetData();
        this.broadcastUpdate();
        this.renderAll();
        if (typeof waseetAlert === 'function') {
            await waseetAlert(
                'مبروك! اكتملت الصفقة بنجاح 100%',
                `تم إنهاء صفقة الوساطة بنجاح! تم تحويل ${this.deal.sellerPrice}$ للبائع وإيداع عمولتك ${this.deal.fee}$ في أرباح المنصة.`,
                'success'
            );
        }
    }

    async cancelAndRefundDeal() {
        let confirmCancel = true;
        if (typeof waseetConfirm === 'function') {
            confirmCancel = await waseetConfirm(
                'تأكيد رفض الحساب وإلغاء الصفقة',
                `هل أنت متأكد من رفض الحساب وإلغاء صفقة الوساطة؟\n\nسيتم فك الحجز وإرجاع كامل المبلغ (${this.deal.totalPoints} نقطة / ${this.deal.totalPoints}$) إلى محفظة المشتري المتاحة فوراً دون خصم أي عمولة.`,
                'نعم، رفض الحساب وإرجاع النقاط',
                'تراجع',
                'danger'
            );
        } else {
            confirmCancel = confirm(`هل أنت متأكد من رفض الحساب وإلغاء صفقة الوساطة؟`);
        }

        if (!confirmCancel) return;

        this.deal.status = 'cancelled';
        this.deal.currentStep = 0;

        // Refund points back to buyer's available wallet
        if (WASEET_STATE.user && WASEET_STATE.user.wallet) {
            WASEET_STATE.user.wallet.available += this.deal.totalPoints;
            if (WASEET_STATE.user.wallet.locked >= this.deal.totalPoints) {
                WASEET_STATE.user.wallet.locked -= this.deal.totalPoints;
            }
        }

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        this.deal.buyerMessages.push({
            sender: 'system',
            text: `⚠️ قام الوسيط المعتمد برفض الحساب وإلغاء الصفقة. تم استرجاع كامل المبلغ (${this.deal.totalPoints} نقطة / ${this.deal.totalPoints}$) إلى محفظتك المتاحة.`,
            time: timeStr
        });

        this.deal.sellerMessages.push({
            sender: 'system',
            text: `⚠️ قام الوسيط المعتمد بإلغاء الصفقة لعدم صحة/مطابقة بيانات الحساب للشروط، وتم استرجاع النقاط للمشتري.`,
            time: timeStr
        });

        // Move deal from active to completed/cancelled archive (Requirement 5)
        if (WASEET_STATE.deals) {
            WASEET_STATE.deals = WASEET_STATE.deals.filter(d => d.id !== this.deal.id);
        }
        if (!WASEET_STATE.completedDeals) WASEET_STATE.completedDeals = [];
        if (!WASEET_STATE.completedDeals.some(d => d.id === this.deal.id)) {
            WASEET_STATE.completedDeals.unshift(this.deal);
        }

        saveWaseetData();
        this.broadcastUpdate();
        this.renderAll();

        if (typeof waseetAlert === 'function') {
            await waseetAlert(
                'تم إلغاء الصفقة واسترجاع الرصيد',
                `تم إلغاء الصفقة بنجاح! تم استرجاع كامل المبلغ (${this.deal.totalPoints}$) إلى محفظة المشتري المتاحة دون خصم أي عمولة.`,
                'info'
            );
        }
    }
}
