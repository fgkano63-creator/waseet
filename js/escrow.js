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
        // الاسترجاع الذاتي للصفقات من التخزين المحلي في حال عدم اكتمال تحميل الحالة في الذاكرة
        if ((!WASEET_STATE.deals || WASEET_STATE.deals.length === 0) && typeof localStorage !== 'undefined') {
            try {
                const storedActive = JSON.parse(localStorage.getItem('WASEET_DEALS_ACTIVE') || '[]');
                if (Array.isArray(storedActive) && storedActive.length > 0) {
                    WASEET_STATE.deals = storedActive;
                }
                const storedCompleted = JSON.parse(localStorage.getItem('WASEET_DEALS_COMPLETED') || '[]');
                if (Array.isArray(storedCompleted) && storedCompleted.length > 0) {
                    WASEET_STATE.completedDeals = storedCompleted;
                }
            } catch (e) {}
        }

        const urlParams = new URLSearchParams(window.location.search);
        const reqDealId = urlParams.get('dealId');
        const allDeals = [...(WASEET_STATE.deals || []), ...(WASEET_STATE.completedDeals || [])];
        if (reqDealId) {
            this.deal = allDeals.find(d => String(d.id) === String(reqDealId)) || WASEET_STATE.activeDeal;
        } else {
            this.deal = WASEET_STATE.activeDeal || allDeals[0] || null;
        }

        if (this.deal) {
            if (!this.deal.sellerMessages) this.deal.sellerMessages = [];
            if (!this.deal.buyerMessages) this.deal.buyerMessages = [];
            if (!this.deal.status) this.deal.status = 'active';
        }

        this._msgTimestamps = [];
        this.viewerRole = this.detectViewerRole();
        this.mediatorTab = 'seller';
        this.buyerTab = 'chat';
        this.init();
    }

    detectViewerRole() {
        const urlParams = new URLSearchParams(window.location.search);
        const forcedRole = urlParams.get('role');
        const currentUser = (typeof WASEET_STATE !== 'undefined') ? WASEET_STATE.user : null;

        if (typeof isMediatorUser === 'function' && isMediatorUser(currentUser)) {
            return 'mediator';
        }
        if (forcedRole === 'buyer' || forcedRole === 'seller') {
            return forcedRole;
        }
        if (!currentUser || !this.deal) {
            return 'buyer';
        }

        const myId = String(currentUser.id || '');
        const buyerId = String((this.deal.buyer && this.deal.buyer.id) || this.deal.buyer_id || '');
        const sellerId = String((this.deal.seller && this.deal.seller.id) || this.deal.seller_id || '');

        // إذا كان المشتري والبائع لهما نفس المعرف (تجربة شراء حساب خاص)، نعطي الأولوية لدور المشتري لأنه من بدأ طلب الشراء
        if (myId && buyerId && sellerId && buyerId === sellerId && myId === buyerId) {
            return 'buyer';
        }
        if (myId && buyerId && myId === buyerId) {
            return 'buyer';
        }
        if (myId && sellerId && myId === sellerId) {
            return 'seller';
        }
        if (this.deal.buyer && this.deal.buyer.name && this.deal.buyer.name === currentUser.name) {
            return 'buyer';
        }
        if (this.deal.seller && this.deal.seller.name && this.deal.seller.name === currentUser.name) {
            return 'seller';
        }
        return 'buyer';
    }

    checkMessageRateLimit() {
        const now = Date.now();
        if (!this._msgTimestamps) this._msgTimestamps = [];
        this._msgTimestamps = this._msgTimestamps.filter(ts => now - ts < 10000);

        const lastTs = this._msgTimestamps.length > 0 ? this._msgTimestamps[this._msgTimestamps.length - 1] : 0;
        if (now - lastTs < 1200 || this._msgTimestamps.length >= 5) {
            this.showSpamWarningToast('يرجى الانتظار قليلاً قبل إرسال رسالة أخرى لمنع السبام.');
            return false;
        }
        this._msgTimestamps.push(now);
        return true;
    }

    showSpamWarningToast(message) {
        let toast = document.getElementById('waseet-rate-limit-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'waseet-rate-limit-toast';
            toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(220,38,38,0.95);color:#fff;padding:0.65rem 1.2rem;border-radius:12px;font-family:var(--font-ar);font-size:0.86rem;font-weight:800;box-shadow:0 10px 25px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.25);display:flex;align-items:center;gap:0.5rem;pointer-events:none;transition:opacity 0.25s ease;';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<i class="fas fa-hourglass-half"></i> <span>${message}</span>`;
        toast.style.opacity = '1';
        clearTimeout(this._spamToastTimer);
        this._spamToastTimer = setTimeout(() => {
            if (toast) toast.style.opacity = '0';
        }, 2400);
    }

    init() {
        this.sanitizeDealChannelMessages();
        this.syncDealToGlobalState();
        this.renderAll();
        this.initLiveSync();
        this.fetchDealParticipantsProfiles();
    }

    generateMessageUuid() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    normalizeMessageChannel(msgOrRow, fallbackChannel = '') {
        if (!msgOrRow) return fallbackChannel;
        const rawChannel = String(msgOrRow.channel_type || msgOrRow.channelType || '').trim();
        const senderRole = String(msgOrRow.sender_role || msgOrRow.sender || '').trim();

        if (rawChannel === 'seller_mediator') return 'seller_mediator';
        if (rawChannel === 'buyer_mediator') return 'buyer_mediator';
        if (rawChannel === 'system' || senderRole === 'system') return 'system';

        // إذا كانت الرسالة من المشتري فهي حتماً لقناة buyer_mediator فقط، وإذا كانت من البائع فهي لقناة seller_mediator فقط
        if (senderRole === 'buyer') return 'buyer_mediator';
        if (senderRole === 'seller') return 'seller_mediator';

        return fallbackChannel || rawChannel || '';
    }

    sanitizeDealChannelMessages() {
        if (!this.deal) return;
        if (!Array.isArray(this.deal.sellerMessages)) this.deal.sellerMessages = [];
        if (!Array.isArray(this.deal.buyerMessages)) this.deal.buyerMessages = [];

        const filterAndDedup = (arr, targetChannel) => {
            const seenIds = new Set();
            const seenContent = new Set();
            const result = [];

            arr.forEach(m => {
                if (!m || !m.text) return;
                const ch = this.normalizeMessageChannel(m, targetChannel);
                const sender = m.sender_role || m.sender || '';

                // عزل صارم للقنوات: منع رسائل buyer_mediator من الظهور في شات البائع والعكس
                if (targetChannel === 'seller_mediator') {
                    if (ch === 'buyer_mediator' || sender === 'buyer') return;
                } else if (targetChannel === 'buyer_mediator') {
                    if (ch === 'seller_mediator' || sender === 'seller') return;
                }

                m.channel_type = (ch === 'system') ? 'system' : targetChannel;
                const idKey = m.id ? String(m.id) : null;
                const contentKey = `${sender}|${targetChannel}|${(m.text || '').trim()}|${m.time || ''}`;

                if ((idKey && seenIds.has(idKey)) || seenContent.has(contentKey)) return;
                if (idKey) seenIds.add(idKey);
                seenContent.add(contentKey);
                result.push(m);
            });

            return result;
        };

        this.deal.sellerMessages = filterAndDedup(this.deal.sellerMessages, 'seller_mediator');
        this.deal.buyerMessages = filterAndDedup(this.deal.buyerMessages, 'buyer_mediator');

        // ضمان وجود رسالة الترحيب التلقائية من الوسيط مع أزرار الردود السريعة (Quick Replies) لكل من المشتري والبائع
        const nowStr = this.formatRowTime(new Date().toISOString());
        const hasSellerQuickPrompt = this.deal.sellerMessages.some(m => m && (m.quickReplyRole === 'seller' || (m.sender === 'mediator' && String(m.text || '').includes('هل ترغب في البيع'))));
        if (!hasSellerQuickPrompt) {
            const firstMedSeller = this.deal.sellerMessages.find(m => m && m.sender === 'mediator');
            if (firstMedSeller) {
                firstMedSeller.name = 'الوسيط المعتمد';
                if (!String(firstMedSeller.text || '').includes('هل ترغب في البيع')) {
                    firstMedSeller.text = `${firstMedSeller.text} — هل ترغب في البيع؟`;
                }
                firstMedSeller.quickReplyRole = 'seller';
                firstMedSeller.quickReplies = ['نعم', 'لا', 'غير متأكد'];
            } else {
                this.deal.sellerMessages.unshift({
                    id: 'auto_med_seller_' + (this.deal.id || '1'),
                    sender: 'mediator',
                    name: 'الوسيط المعتمد',
                    text: 'مرحباً بك في غرفة الوساطة الآمنة. هل ترغب في البيع؟',
                    quickReplyRole: 'seller',
                    quickReplies: ['نعم', 'لا', 'غير متأكد'],
                    time: nowStr,
                    channel_type: 'seller_mediator'
                });
            }
        }

        const hasBuyerQuickPrompt = this.deal.buyerMessages.some(m => m && (m.quickReplyRole === 'buyer' || (m.sender === 'mediator' && String(m.text || '').includes('هل تريد الشراء'))));
        if (!hasBuyerQuickPrompt) {
            const firstMedBuyer = this.deal.buyerMessages.find(m => m && m.sender === 'mediator');
            if (firstMedBuyer) {
                firstMedBuyer.name = 'الوسيط المعتمد';
                if (!String(firstMedBuyer.text || '').includes('هل تريد الشراء')) {
                    firstMedBuyer.text = `${firstMedBuyer.text} — هل تريد الشراء؟`;
                }
                firstMedBuyer.quickReplyRole = 'buyer';
                firstMedBuyer.quickReplies = ['نعم', 'لا', 'غير متأكد'];
            } else {
                this.deal.buyerMessages.unshift({
                    id: 'auto_med_buyer_' + (this.deal.id || '1'),
                    sender: 'mediator',
                    name: 'الوسيط المعتمد',
                    text: 'مرحباً بك في غرفة الوساطة الآمنة. نقاطك مؤمنة في الخزينة، هل تريد الشراء؟',
                    quickReplyRole: 'buyer',
                    quickReplies: ['نعم', 'لا', 'غير متأكد'],
                    time: nowStr,
                    channel_type: 'buyer_mediator'
                });
            }
        }
    }

    syncDealToGlobalState() {
        if (!this.deal || !this.deal.id || typeof WASEET_STATE === 'undefined') return;
        this.sanitizeDealChannelMessages();

        if (!Array.isArray(WASEET_STATE.deals)) WASEET_STATE.deals = [];
        const idx = WASEET_STATE.deals.findIndex(d => d && String(d.id) === String(this.deal.id));
        if (idx !== -1) {
            WASEET_STATE.deals[idx] = this.deal;
        } else if (this.deal.status !== 'completed' && this.deal.status !== 'cancelled') {
            WASEET_STATE.deals.unshift(this.deal);
        }
        WASEET_STATE.activeDeal = this.deal;
    }

    formatRowTime(isoStr) {
        try {
            const dt = isoStr ? new Date(isoStr) : new Date();
            if (isNaN(dt.getTime())) return 'الآن';
            return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        } catch (e) {
            return 'الآن';
        }
    }

    resolveSenderDisplayName(senderRole) {
        const sellerName = (this.deal && this.deal.seller && this.deal.seller.name) ? this.deal.seller.name : 'البائع';
        const buyerName = (this.deal && this.deal.buyer && this.deal.buyer.name) ? this.deal.buyer.name : 'المشتري';
        if (senderRole === 'mediator') return 'الوسيط المعتمد';
        if (senderRole === 'seller') return `${sellerName} (البائع)`;
        if (senderRole === 'buyer') return `${buyerName} (المشتري)`;
        return 'النظام';
    }

    appendIncomingRowToDeal(row) {
        if (!row || !this.deal || !row.message) return false;
        const senderRole = row.sender_role || 'buyer';
        const channelType = this.normalizeMessageChannel(row);

        // فلترة حسب دور المستخدم الحالي لمنع تسرب القنوات (Channel Leak)
        if (this.viewerRole === 'buyer' && channelType === 'seller_mediator') {
            return false;
        }
        if (this.viewerRole === 'seller' && channelType === 'buyer_mediator') {
            return false;
        }

        const msgObj = {
            id: row.id || this.generateMessageUuid(),
            sender: senderRole,
            name: this.resolveSenderDisplayName(senderRole),
            text: row.message,
            time: this.formatRowTime(row.created_at),
            channel_type: channelType,
            created_at: row.created_at || new Date().toISOString()
        };

        let changed = false;
        const addIfMissing = (arr, targetContainerId) => {
            // 1. فحص ما إذا كان معرّف الرسالة (id) موجوداً بالفعل في الشاشة (DOM)
            if (row.id && typeof document !== 'undefined') {
                const domContainer = document.getElementById(targetContainerId);
                if (domContainer && domContainer.querySelector(`[data-msg-id="${row.id}"]`)) {
                    return;
                }
            }

            // 2. فحص ما إذا كانت الرسالة موجودة بالفعل في المصفوفة (سواء بنفس الـ id أو كرسالة Optimistic محلية)
            const existingMsg = arr.find(m => {
                if (!m) return false;
                if (m.id && row.id && String(m.id) === String(row.id)) return true;
                if (m.tempId && row.id && String(m.tempId) === String(row.id)) return true;
                const sameSenderAndText = m.sender === msgObj.sender && (m.text || '').trim() === (msgObj.text || '').trim();
                if (sameSenderAndText && (m._optimistic || m.time === msgObj.time)) return true;
                return false;
            });

            if (existingMsg) {
                // تحديث المعرف المحلي بمعرف قاعدة البيانات دون إضافة نسخة مكررة
                if (row.id) existingMsg.id = row.id;
                existingMsg._optimistic = false;
                existingMsg.channel_type = channelType;
                return;
            }

            arr.push(msgObj);
            changed = true;
        };

        if (!Array.isArray(this.deal.sellerMessages)) this.deal.sellerMessages = [];
        if (!Array.isArray(this.deal.buyerMessages)) this.deal.buyerMessages = [];

        // توجيه كل رسالة إلى قناتها المحددة فقط دون أي تداخل
        if (channelType === 'seller_mediator') {
            addIfMissing(this.deal.sellerMessages, 'chat-messages-seller');
        } else if (channelType === 'buyer_mediator') {
            addIfMissing(this.deal.buyerMessages, 'chat-messages-buyer');
        } else if (channelType === 'system') {
            addIfMissing(this.deal.sellerMessages, 'chat-messages-seller');
            addIfMissing(this.deal.buyerMessages, 'chat-messages-buyer');
        }

        return changed;
    }

    async loadDealMessagesFromSupabase() {
        if (!this.deal || !this.deal.id || typeof window.waseetFetchDealMessagesFromSupabase !== 'function') return;
        try {
            const { data: rows, error } = await window.waseetFetchDealMessagesFromSupabase(this.deal.id);
            if (error || !Array.isArray(rows) || rows.length === 0) return;

            let anyAdded = false;
            rows.forEach(row => {
                if (this.appendIncomingRowToDeal(row)) {
                    anyAdded = true;
                }
            });

            if (anyAdded) {
                this.syncDealToGlobalState();
                saveWaseetData();
                this.updateChatMessagesOnly();
            }
        } catch (err) {
            console.warn('Could not load deal messages from Supabase:', err);
        }
    }

    initSupabaseRealtime() {
        const client = window.waseetSupabaseClient || (typeof initWaseetSupabase === 'function' ? initWaseetSupabase() : null);
        if (!client || !this.deal || !this.deal.id) return;

        const targetDealId = String(this.deal.id);
        if (this.realtimeDealId === targetDealId && this.realtimeChannel) return;

        if (this.realtimeChannel) {
            try {
                client.removeChannel(this.realtimeChannel);
            } catch (e) {}
            this.realtimeChannel = null;
        }

        this.realtimeDealId = targetDealId;

        try {
            this.realtimeChannel = client
                .channel('escrow_room_' + targetDealId)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'deal_messages',
                        filter: `deal_id=eq.${targetDealId}`
                    },
                    (payload) => {
                        if (payload && payload.new) {
                            const incomingRow = payload.new;
                            const rowChannel = this.normalizeMessageChannel(incomingRow);

                            // تجاهل الرسالة إذا كانت لا تخص قناة المستخدم الحالي
                            if (this.viewerRole === 'buyer' && rowChannel === 'seller_mediator') return;
                            if (this.viewerRole === 'seller' && rowChannel === 'buyer_mediator') return;

                            const added = this.appendIncomingRowToDeal(incomingRow);
                            if (added) {
                                this.syncDealToGlobalState();
                                saveWaseetData();
                                this.updateChatMessagesOnly(rowChannel);
                            }
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'deals',
                        filter: `id=eq.${targetDealId}`
                    },
                    (payload) => {
                        if (payload && payload.new && this.deal) {
                            const row = payload.new;
                            let parsed = null;
                            if (row.notes && typeof row.notes === 'string' && row.notes.trim().startsWith('{')) {
                                try { parsed = JSON.parse(row.notes); } catch (e) {}
                            }
                            let msgChanged = false;
                            if (parsed && typeof window.waseetMergeDealMessagesList === 'function') {
                                const mergedSeller = window.waseetMergeDealMessagesList(this.deal.sellerMessages || [], parsed.sellerMessages || [], 'seller_mediator');
                                const mergedBuyer = window.waseetMergeDealMessagesList(this.deal.buyerMessages || [], parsed.buyerMessages || [], 'buyer_mediator');
                                if (mergedSeller.length !== (this.deal.sellerMessages || []).length) {
                                    this.deal.sellerMessages = mergedSeller;
                                    msgChanged = true;
                                }
                                if (mergedBuyer.length !== (this.deal.buyerMessages || []).length) {
                                    this.deal.buyerMessages = mergedBuyer;
                                    msgChanged = true;
                                }
                            }
                            const newStep = Number(row.current_step ?? (parsed && parsed.currentStep) ?? this.deal.currentStep);
                            const newStatus = (row.status === 'completed' || (parsed && parsed.status === 'completed'))
                                ? 'completed'
                                : ((row.status === 'cancelled' || (parsed && parsed.status === 'cancelled')) ? 'cancelled' : this.deal.status);

                            const stepOrStatusChanged = (newStep !== this.deal.currentStep) || (newStatus !== this.deal.status);
                            this.deal.currentStep = newStep;
                            this.deal.status = newStatus;

                            if (msgChanged || stepOrStatusChanged) {
                                this.syncDealToGlobalState();
                                saveWaseetData();
                                this.updateChatMessagesOnly();
                                if (stepOrStatusChanged) {
                                    this.renderPipeline();
                                    this.renderTopAmountPill();
                                    const credsPane = document.getElementById('mediator-control-pane');
                                    if (credsPane) credsPane.innerHTML = this.renderMediatorControlPanel();
                                }
                            }
                        }
                    }
                )
                .subscribe();
        } catch (err) {
            console.warn('Supabase Realtime subscription warning:', err);
        }
    }

    async fetchDealParticipantsProfiles() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const reqDealId = urlParams.get('dealId');

            // If deal isn't found locally yet, sync deals from Supabase first
            if ((!this.deal || (reqDealId && this.deal.id !== reqDealId)) && typeof window.waseetFetchDealsFromSupabase === 'function') {
                await window.waseetFetchDealsFromSupabase();
                const allDeals = [...(WASEET_STATE.deals || []), ...(WASEET_STATE.completedDeals || [])];
                if (reqDealId) {
                    this.deal = allDeals.find(d => String(d.id) === String(reqDealId)) || this.deal;
                } else if (!this.deal && allDeals.length > 0) {
                    this.deal = allDeals[0];
                }
            }

            if (!this.deal) return;

            this.sanitizeDealChannelMessages(this.deal);

            // Detect role again in case deal or user finished loading asynchronously
            const currentUser = (typeof WASEET_STATE !== 'undefined') ? WASEET_STATE.user : null;
            this.viewerRole = this.detectViewerRole();

            // ضمان وجود سجل المستخدم الحالي (أو المدير) في جدول public.profiles لتفادي خطأ deal_messages_sender_id_fkey
            if (typeof window.waseetEnsureUserProfileInDb === 'function') {
                await window.waseetEnsureUserProfileInDb(currentUser, this.deal, this.viewerRole);
            }

            if (!this.deal.seller) this.deal.seller = { name: 'البائع' };
            if (!this.deal.buyer) this.deal.buyer = { name: 'المشتري' };

            const sellerId = this.deal.seller.id || this.deal.seller_id || this.deal.sellerId || null;
            const buyerId = this.deal.buyer.id || this.deal.buyer_id || this.deal.buyerId || null;
            const isSameUserId = sellerId && buyerId && String(sellerId) === String(buyerId);

            let updated = false;

            // 1. Fetch from Supabase profiles table using seller_id and buyer_id
            if (window.waseetSupabaseClient) {
                const uuidList = [sellerId, buyerId].filter(id => id && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id)));
                if (uuidList.length > 0) {
                    const { data: profs, error } = await window.waseetSupabaseClient
                        .from('profiles')
                        .select('*')
                        .in('id', uuidList);

                    if (!error && Array.isArray(profs)) {
                        profs.forEach(p => {
                            const realName = p.name || p.username || p.full_name || (p.email ? p.email.split('@')[0] : null);
                            if (realName) {
                                // إذا كان البائع والمشتري مختلفين، نحدث اسم البائع من ملفه الشخصي
                                if (!isSameUserId && String(p.id) === String(sellerId) && this.deal.seller.name !== realName) {
                                    this.deal.seller.name = realName;
                                    updated = true;
                                }
                                if (String(p.id) === String(buyerId) && this.deal.buyer.name !== realName) {
                                    this.deal.buyer.name = realName;
                                    updated = true;
                                }
                            }
                        });
                    }
                }
            }

            // 2. Fallback: Check linked account in WASEET_STATE.accounts if seller name is still generic
            if ((!this.deal.seller.name || this.deal.seller.name === 'البائع' || this.deal.seller.name === 'سامي') && this.deal.accountId && Array.isArray(WASEET_STATE.accounts)) {
                const linkedAcc = WASEET_STATE.accounts.find(a => String(a.id) === String(this.deal.accountId));
                if (linkedAcc && linkedAcc.sellerName && linkedAcc.sellerName !== 'البائع') {
                    this.deal.seller.name = linkedAcc.sellerName;
                    updated = true;
                }
            }

            // 2.5. If credentials are missing or generic and we have accountId, load them from marketplace_accounts or WASEET_STATE.accounts
            if ((!this.deal.credentials || !this.deal.credentials.email || this.deal.credentials.email.includes('buyer@') || this.deal.credentials.email.includes('seller@')) && (this.deal.accountId || this.deal.account_id)) {
                const accId = this.deal.accountId || this.deal.account_id;
                let foundCreds = null;
                if (Array.isArray(WASEET_STATE.accounts)) {
                    const acc = WASEET_STATE.accounts.find(a => String(a.id) === String(accId));
                    if (acc && acc.credentials && (acc.credentials.email || acc.credentials.loginType)) {
                        foundCreds = acc.credentials;
                    }
                }
                if (!foundCreds && window.waseetSupabaseClient && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(accId))) {
                    try {
                        const { data: accData } = await window.waseetSupabaseClient
                            .from('marketplace_accounts')
                            .select('credentials, details, login_type')
                            .eq('id', accId)
                            .maybeSingle();
                        if (accData && accData.credentials) {
                            foundCreds = accData.credentials;
                            if (accData.login_type && !foundCreds.loginType) {
                                foundCreds.loginType = accData.login_type;
                            }
                        }
                    } catch (e) {}
                }
                if (foundCreds) {
                    this.deal.credentials = Object.assign({}, this.deal.credentials || {}, foundCreds);
                    updated = true;
                }
            }

            this.syncDealToGlobalState();
            if (updated) {
                saveWaseetData();
            }
            this.renderAll();

            // 3. Load messages from deal_messages table and subscribe to Supabase Realtime
            await this.loadDealMessagesFromSupabase();
            this.initSupabaseRealtime();
        } catch (err) {
            console.warn('Could not fetch deal participant profiles:', err);
        }
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

        // 3. Fallback local polling loop (checks every 1200ms)
        if (!this.syncInterval) {
            this.syncInterval = setInterval(() => {
                this.syncDealFromStorage();
            }, 1200);
        }

        // 4. Periodic Supabase cloud sync every 4000ms (backup for Realtime across devices)
        if (!this.cloudPollInterval) {
            this.cloudPollInterval = setInterval(() => {
                this.loadDealMessagesFromSupabase();
            }, 4000);
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
                        this.sanitizeDealChannelMessages(this.deal);
                        WASEET_STATE.deals = deals;
                        WASEET_STATE.activeDeal = deals[0];
                        this.renderAll();
                        this.loadDealMessagesFromSupabase();
                        this.initSupabaseRealtime();
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
            const updatedDeal = deals.find(d => d && String(d.id) === String(currentDealId));
            if (!updatedDeal) return;

            this.sanitizeDealChannelMessages(updatedDeal);

            const oldSellerCount = (this.deal.sellerMessages || []).length;
            const oldBuyerCount = (this.deal.buyerMessages || []).length;
            const newSellerCount = (updatedDeal.sellerMessages || []).length;
            const newBuyerCount = (updatedDeal.buyerMessages || []).length;
            const stepChanged = this.deal.currentStep !== updatedDeal.currentStep;
            const statusChanged = this.deal.status !== updatedDeal.status;

            // حماية صارمة: لا نقوم أبداً باستبدال الرسائل المحلية بنسخة أقدم/أقل رسائل من localStorage
            if (oldSellerCount > newSellerCount || oldBuyerCount > newBuyerCount) {
                this.syncDealToGlobalState();
                saveWaseetData();
                return;
            }

            if (newSellerCount > oldSellerCount || newBuyerCount > oldBuyerCount || stepChanged || statusChanged) {
                this.deal = updatedDeal;
                this.syncDealToGlobalState();

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

    updateChatMessagesOnly(targetChannel = null) {
        if (!this.deal) return;
        this.sanitizeDealChannelMessages(this.deal);

        const buyerChatEl = document.getElementById('chat-messages-buyer');
        const sellerChatEl = document.getElementById('chat-messages-seller');

        if (buyerChatEl && (!targetChannel || targetChannel === 'buyer_mediator' || targetChannel === 'all')) {
            const newHtml = this.renderMessageList(this.deal.buyerMessages || [], 'buyer_mediator');
            if (buyerChatEl.innerHTML !== newHtml) {
                buyerChatEl.innerHTML = newHtml;
                buyerChatEl.scrollTop = buyerChatEl.scrollHeight;
            }
        }

        if (sellerChatEl && (!targetChannel || targetChannel === 'seller_mediator' || targetChannel === 'all')) {
            const newHtml = this.renderMessageList(this.deal.sellerMessages || [], 'seller_mediator');
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
                        لبدء صفقة شراء آمنة، تصفح سوق الحسابات واختر الحساب المناسب ثم اضغط على "طلب وساطة" لحجز الرصيد وبدء المحادثة المشفرة فوراً مع الوسيط المعتمد.
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
                    #DEAL-${d.dealNumber || (idx + 1)} (${d.totalPoints} نقطة)
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
                <strong style="color: #ef4444; font-family: var(--font-ar); font-size: 1.05rem;">ملغاة • تم استرجاع ${this.deal.totalPoints} نقطة للمشتري</strong>
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
                <strong style="color: var(--gold-light); font-family: var(--font-en); font-size: 1.2rem;">${this.deal.totalPoints} نقطة</strong>
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
            if (isCancelled) note = `⚠️ تم إلغاء الصفقة ورفض الحساب وتمت إعادة كامل المبلغ (${pts} نقطة) إلى محفظة المشتري.`;
            if (isCompleted) note = `✅ اكتملت صفقة الوساطة بنجاح! تم تحويل ${sellerPayout} نقطة للبائع وإيداع عمولتك ${fee} نقطة في أرباح المنصة.`;

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
            if (isCancelled) note = '⚠️ تم إلغاء الصفقة لعدم مطابقة بيانات الحساب للشروط، وتم استرجاع الرصيد للمشتري.';
            if (isCompleted) note = `💰 مبروك! تم إيداع ${sellerPayout} نقطة في رصيدك المتاح.`;

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
                    <i class="fas fa-times-circle"></i> تم إيقاف وإلغاء مراحل الصفقة • تم إرجاع الرصيد للمشتري
                </div>
            `;
            return;
        }

        const pts = this.deal.totalPoints || 0;
        const steps = [
            { num: 1, title: 'حجز الرصيد', desc: `تم حجز ${pts} نقطة بالخزينة` },
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

        const sellerName = (this.deal && this.deal.seller && this.deal.seller.name) ? this.deal.seller.name : 'البائع';
        const buyerName = (this.deal && this.deal.buyer && this.deal.buyer.name) ? this.deal.buyer.name : 'المشتري';

        // ==========================================
        // 1. MEDIATOR VIEW (3 SCREENS / 3 COLUMNS)
        // Screen 1: الوسيط ↔ البائع
        // Screen 2: الوسيط ↔ المشتري
        // Screen 3: بيانات الدخول السرية + أدوات التحكم
        // ==========================================
        if (this.viewerRole === 'mediator') {
            container.innerHTML = `
                <div class="escrow-tri-split">
                    
                    <!-- Screen 1: الشات بين الوسيط والبائع (${sellerName}) -->
                    <div class="chat-pane chat-pane-seller">
                        <div class="chat-header">
                            <div class="chat-title chat-card-title-seller">
                                <i class="fas fa-store text-silver"></i>
                                <span>شات مع البائع (${sellerName})</span>
                            </div>
                            <span class="badge-role seller-badge">قناة البائع</span>
                        </div>
                        <div class="chat-messages" id="chat-messages-seller">
                            ${this.renderMessageList(this.deal.sellerMessages, 'seller_mediator')}
                        </div>
                        <div class="chat-footer">
                            <input type="text" id="input-seller-chat" class="chat-input" placeholder="رسالة للبائع (${sellerName}) فقط...">
                            <button class="btn-3d btn-outline" onclick="window.escrowRoom.sendMessageToSeller()">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Screen 2: الشات بين الوسيط والمشتري (${buyerName}) -->
                    <div class="chat-pane chat-pane-buyer">
                        <div class="chat-header">
                            <div class="chat-title chat-card-title-buyer">
                                <i class="fas fa-shopping-cart text-orange"></i>
                                <span>شات مع المشتري (${buyerName})</span>
                            </div>
                            <span class="badge-role buyer-badge">قناة المشتري</span>
                        </div>
                        <div class="chat-messages" id="chat-messages-buyer">
                            ${this.renderMessageList(this.deal.buyerMessages, 'buyer_mediator')}
                        </div>
                        <div class="chat-footer">
                            <input type="text" id="input-buyer-chat" class="chat-input" placeholder="رسالة للمشتري (${buyerName}) فقط...">
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
        // 2. BUYER VIEW (SPLIT LAYOUT WITH UNLOCKED DELIVERY BOX)
        // Responsive: Desktop shows chat + account delivery box side by side; Mobile has top action button & modal
        // ==========================================
        if (this.viewerRole === 'buyer') {
            const isCompleted = this.deal.status === 'completed' || this.deal.currentStep >= 4;

            container.innerHTML = `
                <div class="escrow-buyer-grid">
                    <!-- Column 1: محادثة المشتري مع الوسيط المعتمد -->
                    <div class="chat-pane buyer-chat-pane">
                        <div class="chat-header">
                            <div class="chat-title">
                                <i class="fas fa-comments text-orange"></i>
                                <span>محادثة المشتري (${buyerName}) مع الوسيط المعتمد</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.6rem;">
                                <button type="button" class="btn-3d btn-receive-credentials ${isCompleted ? 'glow-green' : ''}" id="btn-receive-account-header" onclick="window.escrowRoom.openBuyerDeliveryModal()" title="${isCompleted ? 'انقر لعرض بيانات الدخول كاملة' : 'متابعة حالة تسليم الحساب'}">
                                    <i class="fas ${isCompleted ? 'fa-key text-gold' : 'fa-shield-alt text-orange'}"></i>
                                    <span>${isCompleted ? 'استلام بيانات الحساب' : 'حالة استلام الحساب'}</span>
                                </button>
                                <span class="badge-role buyer-badge"><i class="fas fa-circle" style="font-size:0.5rem;color:#10b981;margin-left:4px;"></i> متصل الآن</span>
                            </div>
                        </div>

                        <!-- شريط إشعار علوي جذاب داخل الشات للهواتف والشاشات الصغيرة -->
                        <div class="buyer-mobile-delivery-alert" onclick="window.escrowRoom.openBuyerDeliveryModal()" style="${isCompleted ? '' : 'background: rgba(234, 88, 12, 0.12); border-color: rgba(234, 88, 12, 0.4);'}">
                            <div style="display: flex; align-items: center; gap: 0.6rem;">
                                <i class="fas ${isCompleted ? 'fa-check-circle' : 'fa-shield-alt text-orange'}" style="color: ${isCompleted ? '#10b981' : 'var(--orange-primary)'}; font-size: 1.3rem;"></i>
                                <div>
                                    <strong style="color: #fff; font-size: 0.88rem;">${isCompleted ? 'اكتملت الصفقة بنجاح! تم فك تشفير الحساب' : 'الصفقة نشطة في خزينة الوساطة الآمنة'}</strong>
                                    <div style="color: var(--silver-muted); font-size: 0.75rem;">${isCompleted ? 'اضغط هنا لاستلام بيانات الدخول (الإيميل وكلمة المرور)' : 'اضغط هنا لمتابعة خطوات الفحص والتأمين واستلام الحساب'}</div>
                                </div>
                            </div>
                            <button type="button" class="btn-3d btn-receive-credentials" style="padding: 0.3rem 0.75rem; font-size: 0.78rem;">
                                ${isCompleted ? 'استلام الآن' : 'عرض التفاصيل'} <i class="fas fa-arrow-left"></i>
                            </button>
                        </div>

                        <div class="chat-messages" id="chat-messages-buyer">
                            ${this.renderMessageList(this.deal.buyerMessages, 'buyer_mediator')}
                        </div>

                        <div class="chat-footer">
                            <input type="text" id="input-buyer-single" class="chat-input" placeholder="اكتب رسالتك للوسيط المعتمد...">
                            <button type="button" class="btn-3d btn-orange" onclick="window.escrowRoom.sendBuyerMessage()">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Column 2 (على يسار المحادثة في شاشات الكمبيوتر): صندوق تفاصيل وتسليم الحساب الدائم -->
                    <div class="mediator-pane buyer-side-pane" id="buyer-delivery-side-pane">
                        ${this.renderBuyerSideCard()}
                    </div>
                </div>
            `;
            this.bindSingleChatInput('input-buyer-single', () => this.sendBuyerMessage());
            this.scrollAllChats();
            return;
        }

        // ==========================================
        // 3. SELLER VIEW (FULL-SCREEN CHAT WITHOUT SIDE CLUTTER BOX)
        // ==========================================
        if (this.viewerRole === 'seller') {
            container.innerHTML = `
                <div class="escrow-split escrow-single-full">
                    <div class="chat-pane seller-chat-pane" style="width: 100%; flex: 1;">
                        <div class="chat-header">
                            <div class="chat-title">
                                <i class="fas fa-shield-alt text-silver"></i>
                                <span>محادثة البائع (${sellerName}) مع الوسيط المعتمد</span>
                            </div>
                            <span class="badge-role seller-badge"><i class="fas fa-circle" style="font-size:0.5rem;color:#10b981;margin-left:4px;"></i> متصل الآن</span>
                        </div>
                        <div class="chat-messages" id="chat-messages-seller">
                            ${this.renderMessageList(this.deal.sellerMessages, 'seller_mediator')}
                        </div>
                        <div class="chat-footer">
                            <input type="text" id="input-seller-single" class="chat-input" placeholder="اكتب رسالتك للوسيط المعتمد...">
                            <button type="button" class="btn-3d btn-gold" onclick="window.escrowRoom.sendSellerMessage()">
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
                        تم استرجاع ${pts} نقطة بالكامل إلى محفظة المشتري وإلغاء تجميد الرصيد.
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
                        <i class="fas fa-coins"></i> تحرير الرصيد (${sellerPayout} نقطة للبائع + ${fee} نقطة عمولة المنصة)
                    </button>
                `;
            }

            actionButtonsHtml = `
                ${nextBtn}
                <button class="btn-3d btn-danger-cancel" onclick="window.escrowRoom.cancelAndRefundDeal()">
                    <i class="fas fa-undo-alt"></i> إلغاء الصفقة واسترجاع ${pts} نقطة للمشتري
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
                    <div class="creds-title"><i class="fas fa-undo-alt" style="color: #ef4444;"></i> <span>إلغاء الصفقة واسترجاع الرصيد</span></div>
                    <span class="badge-secure" style="border-color: #ef4444; color: #ef4444;">تم الاسترجاع</span>
                </div>
                <div class="safe-panel-body">
                    <div class="cancelled-card-highlight">
                        <i class="fas fa-wallet text-gold" style="font-size: 2.2rem; margin-bottom: 0.5rem;"></i>
                        <h4 style="color: #fff; margin-bottom: 0.4rem;">تم استرجاع ${pts} نقطة لمحفظتك بالكامل</h4>
                        <p style="color: var(--silver-muted); font-size: 0.85rem; line-height: 1.6;">
                            قام الوسيط المعتمد برفض بيانات الحساب لعدم مطابقتها أو لحمايتك من أي خلل. تمت إعادة كامل المبلغ إلى رصيدك المتاح دون خصم أي عمولة.
                        </p>
                    </div>
                </div>
            `;
        }

        if (isCompleted) {
            const rawPwd = creds.rawPassword || creds.password || '••••••••';
            const safeEmail = creds.email || 'حساب غير محدد';
            const safeLoginType = creds.loginType || 'جوجل Gmail';
            const safeBackup = creds.backupCodes || creds.recoveryEmail || creds.notes || 'لا توجد أكواد إضافية';

            return `
                <div class="creds-header" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(197, 160, 89, 0.12)); border-bottom: 1px solid rgba(16, 185, 129, 0.35);">
                    <div class="creds-title">
                        <i class="fas fa-box-open" style="color: #10b981;"></i>
                        <span style="color: #fff;">صندوق تسليم الحساب (مفتوح)</span>
                    </div>
                    <span class="badge-secure" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border-color: #10b981;">
                        <i class="fas fa-check-double"></i> مكتملة وموثقة 100%
                    </span>
                </div>
                <div class="safe-panel-body" style="padding: 1.1rem;">
                    <div class="success-card-highlight" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 1rem; margin-bottom: 1rem; text-align: center;">
                        <i class="fas fa-crown text-gold" style="font-size: 2.2rem; margin-bottom: 0.4rem; display: block;"></i>
                        <h4 style="color: #fff; font-size: 1.1rem; margin: 0 0 0.3rem;">🎉 تهانينا! الحساب أصبح ملكك رسمياً</h4>
                        <p style="color: var(--silver-muted); font-size: 0.82rem; margin: 0; line-height: 1.6;">
                            تم فحص الحساب وتأكيده بواسطة الوسيط، وفك الروابط السابقة وتثبيت ملكيته لك مع سريان ضمان وسيط الذهبي.
                        </p>
                    </div>

                    <!-- بطاقة بيانات الدخول الحساسة المفتوحة -->
                    <div class="delivery-credentials-card" style="background: rgba(8, 10, 16, 0.85); border: 1px solid rgba(16, 185, 129, 0.45); border-radius: 14px; padding: 1.1rem;">
                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.82rem;"><i class="fas fa-link text-gold"></i> نوع الربط:</span>
                            <span class="cred-value font-mono text-silver" style="font-weight: 700;">${safeLoginType}</span>
                        </div>

                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.82rem;"><i class="fas fa-envelope text-gold"></i> البريد / المعرف:</span>
                            <div style="display: flex; align-items: center; gap: 0.45rem;">
                                <span class="cred-value font-mono text-gold" id="side-buyer-email" style="font-weight: 700; font-size: 0.85rem;">${safeEmail}</span>
                                <button type="button" class="btn-copy-cred" onclick="window.escrowRoom.copyCredText('${safeEmail}', 'تم نسخ البريد الإلكتروني')" title="نسخ البريد">
                                    <i class="far fa-copy"></i>
                                </button>
                            </div>
                        </div>

                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.82rem;"><i class="fas fa-lock text-orange"></i> كلمة المرور:</span>
                            <div style="display: flex; align-items: center; gap: 0.45rem;">
                                <span class="cred-value font-mono" id="side-buyer-pwd" style="color: #10b981; font-weight: 700; font-size: 0.85rem;">••••••••••••</span>
                                <button type="button" class="btn-toggle-cred-pwd" onclick="window.escrowRoom.toggleBuyerCredPassword('${rawPwd}', 'side-buyer-pwd', 'side-buyer-eye')" title="إظهار / إخفاء">
                                    <i class="fas fa-eye" id="side-buyer-eye"></i>
                                </button>
                                <button type="button" class="btn-copy-cred" onclick="window.escrowRoom.copyCredText('${rawPwd}', 'تم نسخ كلمة المرور')" title="نسخ كلمة المرور">
                                    <i class="far fa-copy"></i>
                                </button>
                            </div>
                        </div>

                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.82rem;"><i class="fas fa-shield-alt text-gold"></i> أكواد الاسترداد / الملاحظات:</span>
                            <div style="display: flex; align-items: center; gap: 0.45rem;">
                                <span class="cred-value font-mono text-silver" style="font-size: 0.82rem;">${safeBackup}</span>
                                <button type="button" class="btn-copy-cred" onclick="window.escrowRoom.copyCredText('${safeBackup}', 'تم نسخ الملاحظات وأكواد الاسترداد')" title="نسخ">
                                    <i class="far fa-copy"></i>
                                </button>
                            </div>
                        </div>

                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.2rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.82rem;"><i class="fas fa-shield-virus text-gold"></i> حماية WASEET:</span>
                            <span class="cred-value" style="color: #10b981; font-weight: 700; font-size: 0.82rem;"><i class="fas fa-check-circle"></i> 48 ساعة ضد الاسترجاع</span>
                        </div>
                    </div>

                    <button type="button" class="btn-3d btn-receive-credentials" style="width: 100%; margin-top: 1rem; padding: 0.7rem; justify-content: center; font-weight: 800;" onclick="window.escrowRoom.copyAllCredentials('${safeLoginType}', '${safeEmail}', '${rawPwd}', '${safeBackup}')">
                        <i class="fas fa-clipboard-check"></i> نسخ كافة بيانات الدخول
                    </button>
                </div>
            `;
        }

        return `
            <div class="creds-header" style="background: linear-gradient(135deg, rgba(234, 88, 12, 0.12), rgba(197, 160, 89, 0.1));">
                <div class="creds-title">
                    <i class="fas fa-user-shield text-gold"></i>
                    <span>حماية المشتري وضمان الاستلام</span>
                </div>
                <span class="badge-secure"><i class="fas fa-lock"></i> رصيدك مؤمن 100%</span>
            </div>
            <div class="safe-panel-body" style="padding: 1.1rem;">
                <div class="shield-lock-notice" style="background: rgba(234, 88, 12, 0.08); border: 1px solid rgba(234, 88, 12, 0.3); border-radius: 12px; padding: 1.1rem; text-align: center; margin-bottom: 1rem;">
                    <i class="fas fa-lock text-orange" style="font-size: 2.2rem; margin-bottom: 0.5rem; display: block;"></i>
                    <h4 style="color: #fff; font-size: 1.05rem; margin: 0 0 0.4rem;">بيانات الدخول محمية ومحجوبة حالياً</h4>
                    <p style="color: var(--silver-muted); font-size: 0.83rem; margin: 0; line-height: 1.65;">
                        يقوم الوسيط المعتمد الآن بمتابعة نقل الربط وتأمين الحساب باسمك 100%. لن يُحرر أي رصيد للبائع وتظل البيانات محجوبة ومشفرة حتى اكتمال النقل تماماً لحمايتك من أي محاولة احتيال.
                    </p>
                </div>
                <div class="deal-receipt-summary" style="background: rgba(14, 18, 28, 0.75); border: 1px solid var(--border-metal); border-radius: 12px; padding: 1rem;">
                    <div class="receipt-row" style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><span style="color: var(--silver-muted); font-size: 0.85rem;">الحساب المطلوب:</span><span class="text-white" style="font-weight: 700; font-size: 0.88rem;">${this.deal.accountTitle || 'حساب وسيط'}</span></div>
                    <div class="receipt-row" style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><span style="color: var(--silver-muted); font-size: 0.85rem;">المبلغ المحجوز من محفظتك:</span><span class="text-gold font-mono" style="font-weight: 800;">${this.deal.totalPoints || 0} نقطة</span></div>
                    <div class="receipt-row" style="display: flex; justify-content: space-between;"><span style="color: var(--silver-muted); font-size: 0.85rem;">حالة الضمان:</span><span style="color: #10b981; font-weight: 700; font-size: 0.85rem;"><i class="fas fa-check-circle"></i> مؤمن بالكامل في خزينة الوساطة</span></div>
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
                            تم إلغاء الصفقة وإرجاع الرصيد للمشتري. يرجى مراجعة الوسيط عبر الشات لمعرفة سبب الرفض وإعادة نشر الحساب بالشروط الصحيحة.
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
                        <div style="font-size: 2.2rem; font-weight: 800; font-family: var(--font-en); color: #10b981; margin: 0.3rem 0;">+${sellerPayout} نقطة</div>
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
                    <div style="font-size: 2rem; font-weight: 800; font-family: var(--font-en); color: var(--gold-light); margin: 0.3rem 0;">${sellerPayout} نقطة</div>
                    <span style="font-size: 0.75rem; color: var(--silver-muted);">+ ${fee} نقطة عمولة المنصة يدفعها المشتري تلقائياً</span>
                </div>
                <p style="color: var(--silver-muted); font-size: 0.85rem; line-height: 1.7; margin-top: 1rem;">
                    تم استلام بيانات الحساب التي رفعتها ويقوم الوسيط بفحصها الآن. بمجرد أن ينهي الوسيط تسليم الحساب للمشتري وتأكيد الربط، سيقوم الوسيط فوراً بضغط زر <strong>تحرير الرصيد</strong> ليصلك مبلغ ${sellerPayout} نقطة في محفظتك المتاحة للسحب كاش.
                </p>
            </div>
        `;
    }

    renderMessageList(messagesArray, expectedChannelType = null) {
        if (!messagesArray || !messagesArray.length) {
            return '<div style="color: var(--silver-muted); text-align: center; font-size: 0.8rem; padding: 2rem;">لا توجد رسائل سابقة.</div>';
        }

        const expectedCh = expectedChannelType ? this.normalizeMessageChannel(expectedChannelType) : null;
        const seenIds = new Set();
        const seenContentKeys = new Set();

        const filteredMessages = messagesArray.filter(msg => {
            if (!msg) return false;

            // 1. عزل صارم للقنوات (Channel Isolation): منع رسائل المشتري من الظهور في شات البائع والعكس
            const msgCh = this.normalizeMessageChannel(msg.channel_type || msg.channelType);
            if (expectedCh === 'seller_mediator') {
                if (msgCh === 'buyer_mediator') return false;
                if (msg.sender === 'buyer') return false;
            } else if (expectedCh === 'buyer_mediator') {
                if (msgCh === 'seller_mediator') return false;
                if (msg.sender === 'seller') return false;
            }

            // 2. منع تكرار الرسائل (Deduplication) حسب المعرف (id) أو البصمة الزمنية للنص
            if (msg.id) {
                const idKey = String(msg.id);
                if (seenIds.has(idKey)) return false;
                seenIds.add(idKey);
            }

            const contentKey = `${msg.sender}|${(msg.text || '').trim()}|${msg.time || ''}`;
            if (seenContentKeys.has(contentKey)) return false;
            seenContentKeys.add(contentKey);

            return true;
        });

        if (!filteredMessages.length) {
            return '<div style="color: var(--silver-muted); text-align: center; font-size: 0.8rem; padding: 2rem;">لا توجد رسائل سابقة.</div>';
        }

        return filteredMessages.map(msg => {
            const safeMsgId = String(msg.id || '').replace(/"/g, '&quot;');
            const safeChannel = String(msg.channel_type || expectedCh || '').replace(/"/g, '&quot;');

            if (msg.sender === 'system') {
                return `
                    <div class="chat-msg system-msg" id="escrow-msg-${safeMsgId}" data-msg-id="${safeMsgId}" data-channel-type="${safeChannel}">
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

            // حل جذري لعكس الأسماء: نعتمد دائماً على الدور الحقيقي لمرسل الرسالة (msg.sender)
            const trueAuthorName = this.resolveSenderDisplayName(msg.sender);

            // أزرار الردود السريعة (Quick Replies) في الرسالة التلقائية للوسيط
            let quickRepliesHtml = '';
            if (msg.sender === 'mediator' && (Array.isArray(msg.quickReplies) || msg.quickReplyRole)) {
                const qRole = msg.quickReplyRole || (expectedCh === 'seller_mediator' ? 'seller' : 'buyer');
                const options = Array.isArray(msg.quickReplies) && msg.quickReplies.length > 0
                    ? msg.quickReplies
                    : ['نعم', 'لا', 'غير متأكد'];
                const promptQuestion = qRole === 'seller' ? 'هل ترغب في البيع؟' : 'هل تريد الشراء؟';

                quickRepliesHtml = `
                    <div class="quick-replies-box" style="margin-top: 0.65rem; padding-top: 0.55rem; border-top: 1px dashed rgba(197, 160, 89, 0.35);">
                        <div style="font-size: 0.8rem; font-weight: 800; color: var(--gold-light); margin-bottom: 0.45rem;">
                            <i class="fas fa-bolt text-orange"></i> ${promptQuestion}
                        </div>
                        <div style="display: flex; gap: 0.45rem; flex-wrap: wrap;">
                            ${options.map(opt => `
                                <button type="button" class="btn-quick-reply-opt" onclick="window.escrowRoom.sendQuickReply('${qRole}', '${opt}')" style="background: rgba(197, 160, 89, 0.16); border: 1px solid var(--gold-primary); color: #fff; border-radius: 999px; padding: 0.28rem 0.85rem; font-family: var(--font-ar); font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.2s ease;">
                                    ${opt}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            return `
                <div class="chat-msg ${senderClass}" id="escrow-msg-${safeMsgId}" data-msg-id="${safeMsgId}" data-channel-type="${safeChannel}">
                    <div class="msg-header">
                        <span class="msg-author">${trueAuthorName}</span>
                        ${senderBadge}
                        <span class="msg-time">${msg.time}</span>
                    </div>
                    <div class="msg-body">${msg.text}${quickRepliesHtml}</div>
                </div>
            `;
        }).join('');
    }

    bindMediatorInputs() {
        const inputSeller = document.getElementById('input-seller-chat');
        const inputBuyer = document.getElementById('input-buyer-chat');

        if (inputSeller) {
            inputSeller.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessageToSeller();
                }
            };
        }
        if (inputBuyer) {
            inputBuyer.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessageToBuyer();
                }
            };
        }
    }

    bindSingleChatInput(inputId, sendFn) {
        const el = document.getElementById(inputId);
        if (el) {
            el.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendFn();
                }
            };
        }
    }

    async sendQuickReply(role, choiceText) {
        try {
            if (!choiceText) return;
            const isSeller = role === 'seller';
            const questionLabel = isSeller ? 'هل ترغب في البيع؟' : 'هل تريد الشراء؟';
            const formattedText = `${questionLabel} — الإجابة: ${choiceText}`;

            const targetArrayKey = isSeller ? 'sellerMessages' : 'buyerMessages';
            const channelType = isSeller ? 'seller_mediator' : 'buyer_mediator';
            const senderRole = isSeller ? 'seller' : 'buyer';
            const senderDisplayName = this.resolveSenderDisplayName(senderRole);

            await this.handleSendEscrowMessage({
                inputId: null,
                directText: formattedText,
                targetArrayKey,
                channelType,
                senderRole,
                senderDisplayName
            });
        } catch (err) {
            console.warn('[Escrow QuickReply] خطأ إرسال الرد السريع:', err);
        }
    }

    async handleSendEscrowMessage({ inputId, directText = null, targetArrayKey, channelType, senderRole, senderDisplayName }) {
        try {
            const input = inputId ? document.getElementById(inputId) : null;
            const text = directText !== null ? String(directText).trim() : (input ? input.value.trim() : '');
            if (!text) return;

            if (!this.checkMessageRateLimit()) {
                return;
            }

            if (!this.deal || !this.deal.id) {
                if (typeof waseetAlert === 'function') {
                    await waseetAlert('تنبيه', 'لا توجد صفقة نشطة حالياً لإرسال الرسالة فيها.', 'warning');
                }
                return;
            }

            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const messageUuid = this.generateMessageUuid();
            const currentUserId = (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user && WASEET_STATE.user.id)
                ? WASEET_STATE.user.id
                : null;

            const resolvedAuthor = this.resolveSenderDisplayName(senderRole) || senderDisplayName;

            const msgObj = {
                id: messageUuid,
                sender: senderRole,
                sender_id: currentUserId,
                name: resolvedAuthor,
                text: text,
                time: timeStr,
                channel_type: channelType,
                created_at: now.toISOString(),
                _optimistic: true
            };

            if (!Array.isArray(this.deal[targetArrayKey])) {
                this.deal[targetArrayKey] = [];
            }

            if (!this.deal[targetArrayKey].some(m => m && String(m.id) === String(messageUuid))) {
                this.deal[targetArrayKey].push(msgObj);
            }

            if (input) {
                input.value = '';
                input.focus();
            }
            this.syncDealToGlobalState();
            saveWaseetData();
            this.updateChatMessagesOnly(channelType);
            this.scrollAllChats();
            this.broadcastUpdate();

            if (typeof window.waseetSendEscrowMessageToSupabase === 'function') {
                const { data, error } = await window.waseetSendEscrowMessageToSupabase(this.deal, msgObj, channelType, senderRole);
                if (error) {
                    console.error('Escrow Message Insert Error:', error);
                    if (Array.isArray(this.deal[targetArrayKey])) {
                        this.deal[targetArrayKey] = this.deal[targetArrayKey].filter(m => m && String(m.id) !== String(messageUuid));
                        this.syncDealToGlobalState();
                        saveWaseetData();
                        this.updateChatMessagesOnly(channelType);
                    }
                    return;
                }
                if (data && data.id) {
                    msgObj.id = data.id;
                    msgObj.sender_id = data.sender_id || msgObj.sender_id;
                    msgObj._optimistic = false;
                    this.syncDealToGlobalState();
                    saveWaseetData();
                }
            } else if (typeof window.waseetSaveDealToSupabase === 'function') {
                const res = await window.waseetSaveDealToSupabase(this.deal, { returnError: true, showAlert: false });
                if (res && res.error) {
                    console.error('Escrow Deal Save Error:', res.error);
                }
            }
        } catch (err) {
            console.error('[Escrow Send] استثناء غير متوقع أثناء إرسال الرسالة:', err);
            this.showSpamWarningToast('تعذر إرسال الرسالة مؤقتاً، يرجى المحاولة بعد لحظات.');
        }
    }

    sendMessageToSeller() {
        return this.handleSendEscrowMessage({
            inputId: 'input-seller-chat',
            targetArrayKey: 'sellerMessages',
            channelType: 'seller_mediator',
            senderRole: 'mediator',
            senderDisplayName: 'الوسيط المعتمد'
        });
    }

    sendMessageToBuyer() {
        return this.handleSendEscrowMessage({
            inputId: 'input-buyer-chat',
            targetArrayKey: 'buyerMessages',
            channelType: 'buyer_mediator',
            senderRole: 'mediator',
            senderDisplayName: 'الوسيط المعتمد'
        });
    }

    sendBuyerMessage() {
        return this.handleSendEscrowMessage({
            inputId: 'input-buyer-single',
            targetArrayKey: 'buyerMessages',
            channelType: 'buyer_mediator',
            senderRole: 'buyer',
            senderDisplayName: this.resolveSenderDisplayName('buyer')
        });
    }

    sendSellerMessage() {
        return this.handleSendEscrowMessage({
            inputId: 'input-seller-single',
            targetArrayKey: 'sellerMessages',
            channelType: 'seller_mediator',
            senderRole: 'seller',
            senderDisplayName: this.resolveSenderDisplayName('seller')
        });
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

    async advanceStep(nextStep, systemNotice) {
        this.deal.currentStep = nextStep;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const noticeObj = {
            id: this.generateMessageUuid(),
            sender: 'system',
            text: systemNotice,
            time: timeStr,
            channel_type: 'system',
            created_at: now.toISOString(),
            _optimistic: true
        };

        this.deal.sellerMessages.push({ ...noticeObj });
        this.deal.buyerMessages.push({ ...noticeObj });

        this.syncDealToGlobalState();
        this.renderAll();
        saveWaseetData();
        this.broadcastUpdate();

        if (typeof window.waseetSendEscrowMessageToSupabase === 'function') {
            await window.waseetSendEscrowMessageToSupabase(this.deal, noticeObj, 'system', 'system');
        } else if (typeof window.waseetSaveDealToSupabase === 'function') {
            await window.waseetSaveDealToSupabase(this.deal, { showAlert: true });
        }
    }

    async completeDeal() {
        this.deal.status = 'completed';
        this.deal.currentStep = 4;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        this.deal.sellerMessages.push({
            sender: 'system',
            text: `🎉 تم تحرير الرصيد بنجاح! تم إيداع ${this.deal.sellerPrice} نقطة في محفظتك المتاحة.`,
            time: timeStr
        });

        this.deal.buyerMessages.push({
            sender: 'system',
            text: '🎉 اكتملت الصفقة بنجاح وتم تسليم الحساب لك رسمياً مع سريان ضمان WASEET الذهبي لمدة 48 ساعة.',
            time: timeStr
        });

        // Release points in Supabase DB via atomic RPC & mark account as sold
        if (typeof window.waseetReleaseEscrowPointsInDb === 'function') {
            try {
                await window.waseetReleaseEscrowPointsInDb(this.deal.id, this.deal.accountId);
            } catch (e) {
                console.warn('Could not release escrow points in DB:', e);
            }
        }
        if (typeof window.waseetFetchAccountsFromSupabase === 'function') {
            try {
                await window.waseetFetchAccountsFromSupabase();
            } catch (e) {}
        }

        // Deduct from locked points in local state
        if (WASEET_STATE.user && WASEET_STATE.user.wallet) {
            if (WASEET_STATE.user.wallet.locked >= this.deal.totalPoints) {
                WASEET_STATE.user.wallet.locked -= this.deal.totalPoints;
                WASEET_STATE.user.wallet.total -= this.deal.totalPoints;
            }
        }

        if (typeof window.waseetRefreshMyWalletBalance === 'function') {
            try {
                await window.waseetRefreshMyWalletBalance();
            } catch (e) {}
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
        if (typeof window.waseetSaveDealToSupabase === 'function') {
            await window.waseetSaveDealToSupabase(this.deal);
        }
        this.broadcastUpdate();
        this.renderAll();
        if (typeof waseetAlert === 'function') {
            await waseetAlert(
                'مبروك! اكتملت الصفقة بنجاح 100%',
                `تم إنهاء صفقة الوساطة بنجاح! تم تحويل ${this.deal.sellerPrice} نقطة للبائع وإيداع عمولتك ${this.deal.fee} نقطة في أرباح المنصة.`,
                'success'
            );
        }
    }

    async cancelAndRefundDeal() {
        let confirmCancel = true;
        if (typeof waseetConfirm === 'function') {
            confirmCancel = await waseetConfirm(
                'تأكيد رفض الحساب وإلغاء الصفقة',
                `هل أنت متأكد من رفض الحساب وإلغاء صفقة الوساطة؟\n\nسيتم فك الحجز وإرجاع كامل المبلغ (${this.deal.totalPoints} نقطة) إلى محفظة المشتري المتاحة فوراً دون خصم أي عمولة.`,
                'نعم، رفض الحساب وإرجاع الرصيد',
                'تراجع',
                'danger'
            );
        } else {
            confirmCancel = confirm(`هل أنت متأكد من رفض الحساب وإلغاء صفقة الوساطة؟`);
        }

        if (!confirmCancel) return;

        this.deal.status = 'cancelled';
        this.deal.currentStep = 0;

        // Refund points in Supabase DB via atomic RPC & return account to available in marketplace
        if (typeof window.waseetRefundEscrowPointsInDb === 'function') {
            try {
                await window.waseetRefundEscrowPointsInDb(this.deal.id, this.deal.accountId);
            } catch (e) {
                console.warn('Could not refund escrow points in DB:', e);
            }
        }
        if (typeof window.waseetFetchAccountsFromSupabase === 'function') {
            try {
                await window.waseetFetchAccountsFromSupabase();
            } catch (e) {}
        }

        // Refund points back to buyer's available wallet in local state
        if (WASEET_STATE.user && WASEET_STATE.user.wallet) {
            WASEET_STATE.user.wallet.available += this.deal.totalPoints;
            if (WASEET_STATE.user.wallet.locked >= this.deal.totalPoints) {
                WASEET_STATE.user.wallet.locked -= this.deal.totalPoints;
            }
        }

        if (typeof window.waseetRefreshMyWalletBalance === 'function') {
            try {
                await window.waseetRefreshMyWalletBalance();
            } catch (e) {}
        }

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        this.deal.buyerMessages.push({
            sender: 'system',
            text: `⚠️ قام الوسيط المعتمد برفض الحساب وإلغاء الصفقة. تم استرجاع كامل المبلغ (${this.deal.totalPoints} نقطة) إلى محفظتك المتاحة.`,
            time: timeStr
        });

        this.deal.sellerMessages.push({
            sender: 'system',
            text: `⚠️ قام الوسيط المعتمد بإلغاء الصفقة لعدم صحة/مطابقة بيانات الحساب للشروط، وتم استرجاع الرصيد للمشتري.`,
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
        if (typeof window.waseetSaveDealToSupabase === 'function') {
            await window.waseetSaveDealToSupabase(this.deal);
        }
        this.broadcastUpdate();
        this.renderAll();

        if (typeof waseetAlert === 'function') {
            await waseetAlert(
                'تم إلغاء الصفقة واسترجاع الرصيد',
                `تم إلغاء الصفقة بنجاح! تم استرجاع كامل المبلغ (${this.deal.totalPoints} نقطة) إلى محفظة المشتري المتاحة دون خصم أي عمولة.`,
                'info'
            );
        }
    }

    openBuyerDeliveryModal() {
        const modal = document.getElementById('modal-buyer-delivery');
        const body = document.getElementById('buyer-delivery-modal-body');
        if (!modal) return;

        const isCompleted = this.deal && (this.deal.status === 'completed' || this.deal.currentStep >= 4);
        const creds = (this.deal && this.deal.credentials) || {
            loginType: 'جوجل Gmail',
            email: 'لم يتم التحديد',
            password: '••••••••',
            rawPassword: '••••••••',
            backupCodes: 'لا يوجد'
        };

        const rawPwd = creds.rawPassword || creds.password || '••••••••';
        const safeEmail = creds.email || 'لم يتم التحديد';
        const safeLoginType = creds.loginType || 'جوجل Gmail';
        const safeBackup = creds.backupCodes || creds.recoveryEmail || creds.notes || 'لا توجد أكواد إضافية';

        if (body) {
            if (isCompleted) {
                body.innerHTML = `
                    <div class="success-card-highlight" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 12px; padding: 1rem; margin-bottom: 1.2rem; text-align: center;">
                        <i class="fas fa-crown text-gold" style="font-size: 2.2rem; margin-bottom: 0.4rem; display: block;"></i>
                        <h4 style="color: #fff; font-size: 1.15rem; margin: 0 0 0.3rem;">🎉 تهانينا! الحساب أصبح ملكك رسمياً</h4>
                        <p style="color: var(--silver-muted); font-size: 0.84rem; margin: 0; line-height: 1.6;">
                            تم نقل الحساب إليك وتأمينه بنجاح بواسطة الوسيط المعتمد، ويسري ضمان المنصة لمدة 48 ساعة.
                        </p>
                    </div>

                    <div class="delivery-credentials-card" style="background: rgba(8, 10, 16, 0.9); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 14px; padding: 1.2rem;">
                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.85rem;"><i class="fas fa-link text-gold"></i> نوع الربط:</span>
                            <span class="cred-value font-mono text-silver" style="font-weight: 700;">${safeLoginType}</span>
                        </div>

                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.85rem;"><i class="fas fa-envelope text-gold"></i> البريد / المعرف:</span>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="cred-value font-mono text-gold" id="modal-buyer-email" style="font-weight: 700;">${safeEmail}</span>
                                <button type="button" class="btn-copy-cred" onclick="window.escrowRoom.copyCredText('${safeEmail}', 'تم نسخ البريد الإلكتروني')" title="نسخ البريد">
                                    <i class="far fa-copy"></i>
                                </button>
                            </div>
                        </div>

                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.85rem;"><i class="fas fa-lock text-orange"></i> كلمة المرور:</span>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="cred-value font-mono" id="modal-buyer-pwd" style="color: #10b981; font-weight: 700;">••••••••••••</span>
                                <button type="button" class="btn-toggle-cred-pwd" onclick="window.escrowRoom.toggleBuyerCredPassword('${rawPwd}', 'modal-buyer-pwd', 'modal-buyer-eye')" title="إظهار / إخفاء">
                                    <i class="fas fa-eye" id="modal-buyer-eye"></i>
                                </button>
                                <button type="button" class="btn-copy-cred" onclick="window.escrowRoom.copyCredText('${rawPwd}', 'تم نسخ كلمة المرور')" title="نسخ كلمة المرور">
                                    <i class="far fa-copy"></i>
                                </button>
                            </div>
                        </div>

                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.85rem;"><i class="fas fa-shield-alt text-gold"></i> أكواد الاسترداد / الملاحظات:</span>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="cred-value font-mono text-silver" style="font-size: 0.85rem;">${safeBackup}</span>
                                <button type="button" class="btn-copy-cred" onclick="window.escrowRoom.copyCredText('${safeBackup}', 'تم نسخ الملاحظات')" title="نسخ">
                                    <i class="far fa-copy"></i>
                                </button>
                            </div>
                        </div>

                        <div class="cred-item" style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.2rem;">
                            <span class="cred-label" style="color: var(--silver-muted); font-size: 0.85rem;"><i class="fas fa-shield-virus text-gold"></i> حماية WASEET:</span>
                            <span class="cred-value" style="color: #10b981; font-weight: 700; font-size: 0.85rem;"><i class="fas fa-check-circle"></i> 48 ساعة ضد الاسترجاع</span>
                        </div>
                    </div>

                    <div style="margin-top: 1.2rem; display: flex; gap: 0.6rem; flex-wrap: wrap;">
                        <button type="button" class="btn-3d btn-receive-credentials glow-green" style="flex: 1; min-width: 200px; padding: 0.75rem; justify-content: center; font-weight: 800;" onclick="window.escrowRoom.copyAllCredentials('${safeLoginType}', '${safeEmail}', '${rawPwd}', '${safeBackup}')">
                            <i class="fas fa-clipboard-check"></i> نسخ كافة البيانات
                        </button>
                        <a href="my-accounts.html?tab=purchases" class="btn-3d btn-outline" style="padding: 0.75rem 1rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem;">
                            <i class="fas fa-boxes"></i> حساباتي المشتراة
                        </a>
                    </div>
                `;
            } else {
                body.innerHTML = `
                    <div class="shield-lock-notice" style="background: rgba(234, 88, 12, 0.1); border: 1px solid rgba(234, 88, 12, 0.4); border-radius: 12px; padding: 1.2rem; text-align: center; margin-bottom: 1.2rem;">
                        <i class="fas fa-user-shield text-gold" style="font-size: 2.5rem; margin-bottom: 0.5rem; display: block;"></i>
                        <h4 style="color: #fff; font-size: 1.15rem; margin: 0 0 0.4rem;">حالة تسليم الحساب: قيد الفحص والتأمين</h4>
                        <p style="color: var(--silver-muted); font-size: 0.88rem; margin: 0; line-height: 1.65;">
                            رصيدك (${this.deal?.totalPoints || 0} نقطة) محجوز بأمان في خزينة الوساطة. يقوم الوسيط المعتمد حالياً بمراجعة الحساب وتأمين الربط قبل تسليمه لك.
                        </p>
                    </div>

                    <div style="background: rgba(8, 10, 16, 0.85); border: 1px solid var(--border-metal); border-radius: 12px; padding: 1rem; font-size: 0.86rem; color: var(--silver-muted); line-height: 1.8;">
                        <div><strong class="text-white">اسم الحساب:</strong> ${this.deal?.accountTitle || 'حساب وسيط'}</div>
                        <div><strong class="text-white">المرحلة الحالية:</strong> ${this.deal?.stageText || 'المرحلة 2: نقل الملكية للمشتري وتأمين الحساب'}</div>
                        <div><strong class="text-white">حماية الرصيد:</strong> <span style="color: #10b981;"><i class="fas fa-check-circle"></i> مؤمن 100% في الخزينة</span></div>
                    </div>

                    <div style="margin-top: 1.2rem; display: flex; gap: 0.6rem; justify-content: flex-end;">
                        <button type="button" class="btn-3d btn-gold" onclick="window.escrowRoom.closeBuyerDeliveryModal()" style="padding: 0.6rem 1.4rem;">
                            حسناً، متابعة المحادثة
                        </button>
                    </div>
                `;
            }
        }

        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    closeBuyerDeliveryModal() {
        const modal = document.getElementById('modal-buyer-delivery');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
    }

    toggleBuyerCredPassword(rawPwd, elId = 'buyer-cred-pwd', eyeId = 'buyer-cred-eye') {
        const pwdEl = document.getElementById(elId);
        const eyeEl = document.getElementById(eyeId);
        if (!pwdEl) return;
        if (pwdEl.innerText.includes('•')) {
            pwdEl.innerText = rawPwd;
            if (eyeEl) { eyeEl.classList.remove('fa-eye'); eyeEl.classList.add('fa-eye-slash'); }
        } else {
            pwdEl.innerText = '••••••••••••';
            if (eyeEl) { eyeEl.classList.remove('fa-eye-slash'); eyeEl.classList.add('fa-eye'); }
        }
    }

    async copyCredText(text, successMsg = 'تم النسخ بنجاح') {
        try {
            await navigator.clipboard.writeText(text);
            if (typeof waseetAlert === 'function') {
                waseetAlert('تم النسخ', successMsg, 'success');
            } else {
                alert(successMsg);
            }
        } catch (e) {
            prompt('انسخ النص التالي:', text);
        }
    }

    async copyAllCredentials(loginType, email, pwd, backup) {
        const fullText = `بيانات استلام الحساب من منصة وسيط (WASEET):\n-----------------------------------\nنوع الربط: ${loginType}\nالبريد / اسم المستخدم: ${email}\nكلمة المرور: ${pwd}\nأكواد الاسترداد / الملاحظات: ${backup}\n-----------------------------------\nالحساب مؤمن بضمان منصة وسيط الذهبي لمدة 48 ساعة.`;
        await this.copyCredText(fullText, 'تم نسخ كافة بيانات تسجيل الدخول بنجاح!');
    }
}
