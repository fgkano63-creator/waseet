/**
 * WASEET (وسيط) - نظام الإشعارات الفورية وشارات PWA ومخزن الحالة العام (Global Notification Store)
 * يدعم:
 * 1. Global State Store موحد (نمط Zustand / Context API) لمزامنة الشارة الحمراء لحظياً بين:
 *    - الزر العائم في الأسفل (#support-floating-btn)
 *    - زر محادثات الإدارة / الوسيط في الشريط العلوي (Navbar #admin-nav-support-badge)
 *    - جرس الإشعارات والقائمة المنسدلة (#btn-nav-notif, #notif-badge)
 *    - روابط القائمة الجانبية (Drawer #drawer-admin-chats-link)
 *    - شارة أيقونة التطبيق الخارجية (PWA App Badging API: setAppBadge / clearAppBadge)
 * 2. المزامنة اللحظية (Supabase Realtime) مع تنبيهات صوتية وإشعارات Toast منبثقة.
 * 3. التوجيه الذكي وتحديث حالة القراءة فوراً (is_read = true).
 */

(function () {
    'use strict';

    /**
     * ==============================================================================
     * 1. Global Notification Store (مخزن الحالة العام المشترك)
     * ==============================================================================
     */
    const WaseetNotificationStore = {
        state: {
            unreadSupportCount: 0,
            unreadNotificationsCount: 0,
            totalUnreadCount: 0,
            notifications: [],
            currentUser: null,
            isLoaded: false
        },
        subscribers: new Set(),

        getState() {
            return { ...this.state };
        },

        setState(partial) {
            this.state = Object.assign({}, this.state, partial);

            // حساب الإجمالي بدقة
            const supportCount = Math.max(0, Number(this.state.unreadSupportCount) || 0);
            const notifCount = Math.max(0, Number(this.state.unreadNotificationsCount) || 0);
            this.state.totalUnreadCount = supportCount + notifCount;

            // الحفظ المؤقت للاسترجاع السريع والفوري عبر كافة صفحات المنصة
            try {
                sessionStorage.setItem('WASEET_UNREAD_CHATS_COUNT', String(supportCount));
                localStorage.setItem('WASEET_TOTAL_UNREAD_COUNT', String(this.state.totalUnreadCount));
            } catch (e) {}

            this.notify();
            this.renderAllBadges();
        },

        subscribe(listener) {
            if (typeof listener === 'function') {
                this.subscribers.add(listener);
                return () => this.subscribers.delete(listener);
            }
            return () => {};
        },

        notify() {
            this.subscribers.forEach((fn) => {
                try { fn(this.state); } catch (err) { console.warn('[NotificationStore Notify]', err); }
            });
        },

        /**
         * توحيد رسم وتحديث كافة الشارات في الصفحة دفعة واحدة برقم متطابق 100%
         */
        renderAllBadges() {
            const supportCount = Math.max(0, Number(this.state.unreadSupportCount) || 0);
            const notifCount = Math.max(0, Number(this.state.unreadNotificationsCount) || 0);
            const totalCount = Math.max(0, Number(this.state.totalUnreadCount) || (supportCount + notifCount));

            const badgeText = supportCount > 99 ? '99+' : String(supportCount);
            const totalBadgeText = totalCount > 99 ? '99+' : String(totalCount);

            // 1. تحديث الزر العائم للتواصل في الأسفل (#support-floating-btn)
            const floatingBtn = document.getElementById('support-floating-btn');
            if (floatingBtn) {
                let badge = floatingBtn.querySelector('.chats-unread-badge, .support-floating-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'deals-badge-count chats-unread-badge support-floating-badge';
                    badge.id = 'support-floating-badge';
                    badge.style.display = 'none';
                    floatingBtn.appendChild(badge);
                }
                if (supportCount > 0) {
                    badge.innerText = badgeText;
                    badge.style.display = 'inline-flex';
                } else {
                    badge.innerText = '';
                    badge.style.display = 'none';
                }

                const pulseDot = document.getElementById('support-unread-dot');
                if (pulseDot) {
                    pulseDot.style.display = supportCount > 0 ? 'block' : 'none';
                }
            }

            // 2. تحديث زر محادثات الإدارة والروابط في الشريط العلوي (Navbar) والقائمة الجانبية
            const navChatSelectors = [
                '#admin-nav-support-badge',
                '#admin-nav-chats-badge',
                '#drawer-admin-chats-link',
                '#chat-drawer-admin-chats',
                '#deals-drawer-admin-chats',
                '#drawer-support-badge'
            ];
            navChatSelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    if (el.tagName === 'SPAN') {
                        if (supportCount > 0) {
                            el.innerText = badgeText;
                            el.style.display = 'inline-flex';
                        } else {
                            el.innerText = '';
                            el.style.display = 'none';
                        }
                    } else if (el.tagName === 'A') {
                        let badge = el.querySelector('.chats-unread-badge, .deals-badge-count');
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'deals-badge-count chats-unread-badge';
                            badge.style.display = 'none';
                            el.appendChild(badge);
                        }
                        if (supportCount > 0) {
                            badge.innerText = badgeText;
                            badge.style.display = 'inline-flex';
                        } else {
                            badge.innerText = '';
                            badge.style.display = 'none';
                        }
                    }
                });
            });

            // ضمان مزامنة جميع عناصر a[href*="admin-chats.html"] و a[href*="contact-support.html"] في الترويسة
            const navLinks = document.querySelectorAll('header a[href*="admin-chats.html"], nav a[href*="admin-chats.html"], header a[href*="contact-support.html"], nav a[href*="contact-support.html"]');
            navLinks.forEach(link => {
                let badge = link.querySelector('.chats-unread-badge, #admin-nav-support-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'deals-badge-count chats-unread-badge';
                    badge.id = 'admin-nav-support-badge';
                    badge.style.display = 'none';
                    link.appendChild(badge);
                }
                if (supportCount > 0) {
                    badge.innerText = badgeText;
                    badge.style.display = 'inline-flex';
                } else {
                    badge.innerText = '';
                    badge.style.display = 'none';
                }
            });

            // 3. تحديث جرس الإشعارات في الشريط العلوي (#btn-nav-notif)
            const notifBadgeEl = document.getElementById('notif-badge');
            const notifTagEl = document.getElementById('notif-count-tag');
            if (notifBadgeEl) {
                if (totalCount > 0) {
                    notifBadgeEl.innerText = totalBadgeText;
                    notifBadgeEl.style.display = 'inline-flex';
                } else {
                    notifBadgeEl.innerText = '0';
                    notifBadgeEl.style.display = 'none';
                }
            }
            if (notifTagEl) {
                if (totalCount > 0) {
                    notifTagEl.innerText = `${totalCount} غير مقروء`;
                    notifTagEl.style.display = 'inline-block';
                } else {
                    notifTagEl.style.display = 'none';
                }
            }

            // 4. مزامنة شارة أيقونة التطبيق الخارجية على شاشة الهاتف (PWA App Badging)
            try {
                if ('setAppBadge' in navigator) {
                    if (totalCount > 0) {
                        navigator.setAppBadge(totalCount).catch(() => {});
                    } else {
                        navigator.clearAppBadge().catch(() => {});
                    }
                } else if ('clearAppBadge' in navigator && totalCount === 0) {
                    navigator.clearAppBadge().catch(() => {});
                }
            } catch (err) {}
        }
    };

    window.WaseetNotificationStore = WaseetNotificationStore;

    /**
     * ==============================================================================
     * 2. نظام إدارة الإشعارات الفورية والمزامنة السحابية (WaseetNotificationSystem)
     * ==============================================================================
     */
    class WaseetNotificationSystem {
        constructor() {
            this.notifications = [];
            this.unreadCount = 0;
            this.isOpen = false;
            this.realtimeChannel = null;
            this.supportRealtimeChannel = null;
            this.audioCtx = null;
            this.currentUser = null;
            this.isFetching = false;
            this.lastFetchAt = 0;
            this.subscribedUserId = null;
            this.hasWarnedGrant = false;

            this.init();
        }

        init() {
            // استرجاع فوري للعدد المخزن مسبقاً لرسم الشارات بأعلى سرعة دون وميض
            const cachedSupportCount = parseInt(sessionStorage.getItem('WASEET_UNREAD_CHATS_COUNT') || '0', 10);
            if (cachedSupportCount > 0) {
                WaseetNotificationStore.setState({ unreadSupportCount: cachedSupportCount });
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setup());
            } else {
                this.setup();
            }
        }

        setup() {
            this.injectNavbarBell();
            this.bindGlobalEvents();
            this.syncWithUser();

            // الاستماع لتغير حالة المصادقة من Supabase أو التطبيق
            window.addEventListener('waseet:auth-changed', (e) => {
                this.syncWithUser(e.detail ? e.detail.user : null);
            });

            // مزامنة فورية عند عودة التطبيق للواجهة (Visibility Change & Page Show)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.currentUser) {
                    this.fetchNotifications(true);
                }
            });

            window.addEventListener('pageshow', () => {
                if (this.currentUser) {
                    this.fetchNotifications(true);
                }
            });

            // فحص إضافي عند اكتمال تحميل الموارد
            window.addEventListener('load', () => {
                WaseetNotificationStore.renderAllBadges();
            });
        }

        /**
         * حقن جرس الإشعارات في شريط التنقل العلوي تلقائياً
         */
        injectNavbarBell() {
            if (document.getElementById('waseet-notif-wrap')) return;

            const navLeft = document.querySelector('.nav-left-group');
            if (!navLeft) return;

            const wrap = document.createElement('div');
            wrap.className = 'waseet-notif-wrap';
            wrap.id = 'waseet-notif-wrap';
            wrap.innerHTML = `
                <button type="button" class="btn-nav-notif" id="btn-nav-notif" aria-label="الإشعارات" title="الإشعارات" onclick="window.waseetNotifications && window.waseetNotifications.toggleDropdown(event)">
                    <i class="fas fa-bell"></i>
                    <span class="notif-badge" id="notif-badge" style="display: none;">0</span>
                </button>
                <div class="notif-dropdown" id="notif-dropdown" style="display: none;" role="dialog" aria-label="قائمة الإشعارات">
                    <div class="notif-dropdown-header">
                        <div class="notif-header-title">
                            <i class="fas fa-bell text-gold"></i>
                            <span>الإشعارات</span>
                            <span class="notif-count-tag" id="notif-count-tag" style="display: none;">0 جديدة</span>
                        </div>
                        <button type="button" class="btn-mark-all-read" id="btn-mark-all-read" onclick="window.waseetNotifications && window.waseetNotifications.markAllAsRead(event)">
                            <i class="fas fa-check-double"></i> قراءة الكل
                        </button>
                    </div>
                    <div class="notif-dropdown-body" id="notif-dropdown-body">
                        <div class="notif-empty-state">
                            <i class="fas fa-bell-slash"></i>
                            <p>لا توجد إشعارات حالياً</p>
                        </div>
                    </div>
                </div>
            `;

            // إدراج جرس الإشعارات قبل زر الحساب أو زر القائمة الجانبية
            const userBox = navLeft.querySelector('#nav-user-container, #deals-nav-user-container, #chat-nav-user-container');
            const hamburger = navLeft.querySelector('.mobile-hamburger-btn');
            if (userBox) {
                navLeft.insertBefore(wrap, userBox);
            } else if (hamburger) {
                navLeft.insertBefore(wrap, hamburger);
            } else {
                navLeft.appendChild(wrap);
            }

            WaseetNotificationStore.renderAllBadges();
        }

        /**
         * ربط الأحداث العامة للنقر خارج القائمة ومفتاح الهروب
         */
        bindGlobalEvents() {
            document.addEventListener('click', (e) => {
                const wrap = document.getElementById('waseet-notif-wrap');
                if (this.isOpen && wrap && !wrap.contains(e.target)) {
                    this.closeDropdown();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.closeDropdown();
                }
            });
        }

        /**
         * التحقق من صلاحيات المدير أو الوسيط المعتمد
         */
        isMediatorUser(user) {
            if (!user) return false;
            if (typeof isMediatorUser === 'function') {
                return isMediatorUser(user);
            }
            const email = (user.email || '').toLowerCase();
            return user.role === 'admin' || user.role === 'mediator' || user.isAdmin === true ||
                ['fgkano63@gmail.com', 'saadani2009@gmail.com', 'mediator@waseet.com'].includes(email);
        }

        /**
         * مزامنة حالة المستخدم وجلب الإشعارات
         */
        syncWithUser(explicitUser = null) {
            let user = explicitUser;
            if (!user && typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) {
                user = WASEET_STATE.user;
            }
            if (!user) {
                try {
                    const saved = localStorage.getItem('WASEET_SAVED_USER_PERMANENT');
                    if (saved) user = JSON.parse(saved);
                } catch (e) {}
            }

            this.currentUser = user;

            if (user && user.id) {
                this.fetchNotifications();
                if (this.subscribedUserId !== user.id) {
                    this.subscribeRealtime(user.id);
                }
            } else {
                this.subscribedUserId = null;
                this.notifications = [];
                WaseetNotificationStore.setState({
                    notifications: [],
                    unreadNotificationsCount: 0,
                    unreadSupportCount: 0,
                    currentUser: null
                });
                this.clearAppBadge();
                if (this.realtimeChannel && typeof initWaseetSupabase === 'function') {
                    const client = initWaseetSupabase();
                    if (client) client.removeChannel(this.realtimeChannel);
                    this.realtimeChannel = null;
                }
                if (this.supportRealtimeChannel && typeof initWaseetSupabase === 'function') {
                    const client = initWaseetSupabase();
                    if (client) client.removeChannel(this.supportRealtimeChannel);
                    this.supportRealtimeChannel = null;
                }
            }
        }

        /**
         * جلب الإشعارات ورسائل الدعم غير المقروءة ومزامنة العدادات عبر Supabase
         */
        async fetchNotifications(isSilent = false) {
            if (!this.currentUser || !this.currentUser.id) return;
            if (typeof initWaseetSupabase !== 'function') return;

            const client = initWaseetSupabase();
            if (!client) return;

            if (this.isFetching) return;
            const now = Date.now();
            if (!isSilent && (now - this.lastFetchAt < 1500)) return;
            this.isFetching = true;
            this.lastFetchAt = now;

            try {
                // 1. جلب الإشعارات الرسمية من جدول notifications
                const { data: notifData, error: notifErr } = await client
                    .from('notifications')
                    .select('*')
                    .eq('user_id', this.currentUser.id)
                    .order('created_at', { ascending: false })
                    .limit(40);

                if (notifErr) {
                    if (notifErr.code === '42501' || (notifErr.message && notifErr.message.includes('permission denied'))) {
                        if (!this.hasWarnedGrant) {
                            console.info('[Notifications] تنبيه: صلاحيات جدول notifications بحاجة للتفعيل في Supabase SQL Editor عبر أمر GRANT.');
                            this.hasWarnedGrant = true;
                        }
                    } else if (notifErr.code !== '42P01') {
                        console.warn('[Notifications] fetch error:', notifErr.message);
                    }
                }

                this.notifications = Array.isArray(notifData) ? [...notifData] : [];

                // 2. فحص ومزامنة رسائل الدعم (support_messages) غير المقروءة بدقة
                const isAdmin = this.isMediatorUser(this.currentUser);
                const currentPath = (window.location.pathname || '').toLowerCase();
                let supportUnreadCount = 0;

                if (isAdmin) {
                    // إذا كان في صفحة محادثات الإدارة، يتم تصفير العداد وتحديث وقت المشاهدة
                    if (currentPath.includes('admin-chats.html')) {
                        supportUnreadCount = 0;
                        localStorage.setItem('WASEET_ADMIN_LAST_SEEN_SUPPORT', new Date().toISOString());
                    } else {
                        // استعلام رسائل الدعم المرسلة من المستخدمين
                        const { data: supportData, error: supportErr } = await client
                            .from('support_messages')
                            .select('*')
                            .eq('sender_role', 'user')
                            .order('created_at', { ascending: false })
                            .limit(50);

                        if (!supportErr && Array.isArray(supportData) && supportData.length > 0) {
                            const lastSeenStr = localStorage.getItem('WASEET_ADMIN_LAST_SEEN_SUPPORT');
                            const lastSeenTime = lastSeenStr ? new Date(lastSeenStr).getTime() : 0;

                            // حساب الرسائل الحديثة بعد آخر زيارة
                            const unreadMessages = supportData.filter(m => {
                                const msgTime = new Date(m.created_at).getTime();
                                return msgTime > lastSeenTime;
                            });

                            supportUnreadCount = unreadMessages.length;

                            // إذا كانت الإشعارات في جدول notifications لا تحتوي هذه الرسائل بعد، ندمجها بالقائمة المنسدلة
                            unreadMessages.forEach(msg => {
                                const exists = this.notifications.some(n =>
                                    n.link && n.link.includes('admin-chats.html') &&
                                    (n.link.includes(msg.user_id) || n.message === msg.message)
                                );
                                if (!exists) {
                                    this.notifications.unshift({
                                        id: 'synth_support_' + msg.id,
                                        user_id: this.currentUser.id,
                                        title: 'رسالة دعم جديدة 💬',
                                        message: msg.message || 'لديك رسالة جديدة في محادثات الإدارة',
                                        link: 'admin-chats.html?user=' + (msg.user_id || ''),
                                        is_read: false,
                                        created_at: msg.created_at,
                                        isSupportMsg: true
                                    });
                                }
                            });
                        }
                    }
                } else {
                    // المستخدم العادي: فحص ردود الوسيط المعتمد
                    if (currentPath.includes('contact-support.html')) {
                        supportUnreadCount = 0;
                        localStorage.setItem('WASEET_USER_LAST_SEEN_SUPPORT', new Date().toISOString());
                    } else {
                        const { data: userSupportData, error: userSupErr } = await client
                            .from('support_messages')
                            .select('*')
                            .eq('user_id', this.currentUser.id)
                            .in('sender_role', ['admin', 'mediator'])
                            .order('created_at', { ascending: false })
                            .limit(20);

                        if (!userSupErr && Array.isArray(userSupportData) && userSupportData.length > 0) {
                            const lastSeenStr = localStorage.getItem('WASEET_USER_LAST_SEEN_SUPPORT');
                            const lastSeenTime = lastSeenStr ? new Date(lastSeenStr).getTime() : 0;

                            const unreadReplies = userSupportData.filter(m => {
                                const msgTime = new Date(m.created_at).getTime();
                                return msgTime > lastSeenTime;
                            });

                            supportUnreadCount = unreadReplies.length;

                            unreadReplies.forEach(msg => {
                                const exists = this.notifications.some(n =>
                                    n.link && n.link.includes('contact-support.html')
                                );
                                if (!exists) {
                                    this.notifications.unshift({
                                        id: 'synth_user_reply_' + msg.id,
                                        user_id: this.currentUser.id,
                                        title: '👑 رد جديد من الوسيط المعتمد',
                                        message: msg.message || 'لديك رد جديد من فريق الوساطة والدعم',
                                        link: 'contact-support.html',
                                        is_read: false,
                                        created_at: msg.created_at,
                                        isSupportMsg: true
                                    });
                                }
                            });
                        }
                    }
                }

                // فرز القائمة ترتيباً زمنياً تنازلياً
                this.notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                // 3. حساب عدد الإشعارات العادية غير المقروءة
                const unreadNotifsCount = this.notifications.filter(n => !n.is_read && !n.isSupportMsg).length;

                // 4. تحديث مخزن الحالة العام (Global State Store) لتوحيد الشارات في كل مكان فوراً
                WaseetNotificationStore.setState({
                    notifications: this.notifications,
                    unreadNotificationsCount: unreadNotifsCount,
                    unreadSupportCount: supportUnreadCount,
                    currentUser: this.currentUser,
                    isLoaded: true
                });

                this.renderDropdownItems();
            } catch (err) {
                console.warn('[Notifications] fetch exception:', err);
            } finally {
                this.isFetching = false;
            }
        }

        /**
         * الاشتراك في التحديثات الفورية (Realtime) لجدول notifications وجدول support_messages
         */
        subscribeRealtime(userId) {
            if (!userId || typeof initWaseetSupabase !== 'function') return;
            const client = initWaseetSupabase();
            if (!client) return;

            this.subscribedUserId = userId;

            // إزالة القنوات السابقة إن وجدت
            if (this.realtimeChannel) {
                client.removeChannel(this.realtimeChannel);
                this.realtimeChannel = null;
            }
            if (this.supportRealtimeChannel) {
                client.removeChannel(this.supportRealtimeChannel);
                this.supportRealtimeChannel = null;
            }

            try {
                // 1. الاستماع لجدول notifications الخاص بالمستخدم
                this.realtimeChannel = client
                    .channel(`waseet_notifs_user_${userId}`)
                    .on(
                        'postgres_changes',
                        {
                            event: '*',
                            schema: 'public',
                            table: 'notifications',
                            filter: `user_id=eq.${userId}`
                        },
                        (payload) => {
                            this.handleRealtimeEvent(payload);
                        }
                    )
                    .subscribe();

                // 2. الاستماع اللحظي لرسائل الدعم الفني (support_messages)
                const isAdmin = this.isMediatorUser(this.currentUser);
                const supportConfig = isAdmin
                    ? { event: 'INSERT', schema: 'public', table: 'support_messages' }
                    : { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `user_id=eq.${userId}` };

                this.supportRealtimeChannel = client
                    .channel(`waseet_support_live_${userId}_${isAdmin ? 'adm' : 'usr'}`)
                    .on(
                        'postgres_changes',
                        supportConfig,
                        (payload) => {
                            this.handleSupportRealtimeMessage(payload);
                        }
                    )
                    .subscribe();
            } catch (e) {
                console.warn('[Notifications] Realtime subscribe error:', e);
            }
        }

        /**
         * معالجة أحداث التغيير الفوري لجدول notifications
         */
        handleRealtimeEvent(payload) {
            const eventType = payload.eventType;
            const newRecord = payload.new;
            const oldRecord = payload.old;

            if (eventType === 'INSERT' && newRecord) {
                // تجنب التكرار
                if (!this.notifications.some(n => n.id === newRecord.id)) {
                    this.notifications.unshift(newRecord);
                }

                // تنبيه مرئي وصوتي
                this.showToast(newRecord);
                this.playChimeSound();

                // تحديث العداد
                const unreadNotifs = this.notifications.filter(n => !n.is_read && !n.isSupportMsg).length;
                WaseetNotificationStore.setState({
                    notifications: this.notifications,
                    unreadNotificationsCount: unreadNotifs
                });
                this.renderDropdownItems();
            } else if (eventType === 'UPDATE' && newRecord) {
                const idx = this.notifications.findIndex((n) => n.id === newRecord.id);
                if (idx !== -1) {
                    this.notifications[idx] = newRecord;
                } else {
                    this.notifications.unshift(newRecord);
                }
                const unreadNotifs = this.notifications.filter(n => !n.is_read && !n.isSupportMsg).length;
                WaseetNotificationStore.setState({
                    notifications: this.notifications,
                    unreadNotificationsCount: unreadNotifs
                });
                this.renderDropdownItems();
            } else if (eventType === 'DELETE' && oldRecord) {
                this.notifications = this.notifications.filter((n) => n.id !== oldRecord.id);
                const unreadNotifs = this.notifications.filter(n => !n.is_read && !n.isSupportMsg).length;
                WaseetNotificationStore.setState({
                    notifications: this.notifications,
                    unreadNotificationsCount: unreadNotifs
                });
                this.renderDropdownItems();
            }
        }

        /**
         * معالجة الرسائل اللحظية الواردة في الدعم الفني
         */
        handleSupportRealtimeMessage(payload) {
            const newMsg = payload && payload.new;
            if (!newMsg) return;

            const isAdmin = this.isMediatorUser(this.currentUser);
            const currentPath = (window.location.pathname || '').toLowerCase();

            if (isAdmin) {
                // إذا أرسل مستخدم رسالة إلى الإدارة
                if (newMsg.sender_role === 'user') {
                    if (currentPath.includes('admin-chats.html')) {
                        return; // الصفحة المفتوحة تتولى عرضها في المحادثة
                    }

                    // صوت تنبيهي وتوست منبثق
                    this.playChimeSound();
                    this.showToast({
                        id: 'toast_sup_' + newMsg.id,
                        title: 'رسالة دعم جديدة من مستخدم 💬',
                        message: newMsg.message || 'رسالة جديدة في محادثات الإدارة',
                        link: 'admin-chats.html?user=' + (newMsg.user_id || '')
                    });

                    // زيادة عداد رسائل الدعم في المخزن العام وتحديث الشارات
                    const curSupport = WaseetNotificationStore.getState().unreadSupportCount || 0;
                    const newSupportCount = curSupport + 1;

                    // إضافة عنصر للقائمة المنسدلة
                    this.notifications.unshift({
                        id: 'synth_support_' + newMsg.id,
                        user_id: this.currentUser.id,
                        title: 'رسالة دعم جديدة 💬',
                        message: newMsg.message || 'لديك رسالة جديدة في محادثات الإدارة',
                        link: 'admin-chats.html?user=' + (newMsg.user_id || ''),
                        is_read: false,
                        created_at: newMsg.created_at,
                        isSupportMsg: true
                    });

                    WaseetNotificationStore.setState({
                        unreadSupportCount: newSupportCount,
                        notifications: this.notifications
                    });
                    this.renderDropdownItems();
                }
            } else {
                // إذا رد الوسيط على المستخدم
                if (['admin', 'mediator'].includes(newMsg.sender_role)) {
                    if (currentPath.includes('contact-support.html')) {
                        return;
                    }

                    this.playChimeSound();
                    this.showToast({
                        id: 'toast_sup_reply_' + newMsg.id,
                        title: '👑 رد جديد من الوسيط المعتمد',
                        message: newMsg.message || 'أرسل لك الوسيط رسالة جديدة',
                        link: 'contact-support.html'
                    });

                    const curSupport = WaseetNotificationStore.getState().unreadSupportCount || 0;
                    const newSupportCount = curSupport + 1;

                    this.notifications.unshift({
                        id: 'synth_user_reply_' + newMsg.id,
                        user_id: this.currentUser.id,
                        title: '👑 رد جديد من الوسيط المعتمد',
                        message: newMsg.message || 'لديك رد جديد من فريق الوساطة',
                        link: 'contact-support.html',
                        is_read: false,
                        created_at: newMsg.created_at,
                        isSupportMsg: true
                    });

                    WaseetNotificationStore.setState({
                        unreadSupportCount: newSupportCount,
                        notifications: this.notifications
                    });
                    this.renderDropdownItems();
                }
            }
        }

        clearAppBadge() {
            try {
                if ('clearAppBadge' in navigator) {
                    navigator.clearAppBadge().catch(() => {});
                }
            } catch (e) {}
        }

        /**
         * فتح وإغلاق القائمة المنسدلة
         */
        toggleDropdown(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (this.isOpen) {
                this.closeDropdown();
            } else {
                this.openDropdown();
            }
        }

        openDropdown() {
            const dropdown = document.getElementById('notif-dropdown');
            const btn = document.getElementById('btn-nav-notif');
            if (!dropdown) return;

            dropdown.style.display = 'flex';
            dropdown.classList.add('active');
            if (btn) btn.classList.add('active');
            this.isOpen = true;

            this.renderDropdownItems();
        }

        closeDropdown() {
            const dropdown = document.getElementById('notif-dropdown');
            const btn = document.getElementById('btn-nav-notif');
            if (!dropdown) return;

            dropdown.classList.remove('active');
            dropdown.style.display = 'none';
            if (btn) btn.classList.remove('active');
            this.isOpen = false;
        }

        /**
         * رسم عناصر القائمة المنسدلة
         */
        renderDropdownItems() {
            const body = document.getElementById('notif-dropdown-body');
            if (!body) return;

            if (!this.currentUser) {
                body.innerHTML = `
                    <div class="notif-empty-state">
                        <i class="fas fa-user-lock"></i>
                        <p>يرجى تسجيل الدخول لعرض إشعارات حسابك</p>
                        <button type="button" class="btn-3d btn-gold btn-notif-login" onclick="if(window.waseetApp) window.waseetApp.openLoginModal();">
                            تسجيل الدخول
                        </button>
                    </div>
                `;
                return;
            }

            if (!this.notifications || this.notifications.length === 0) {
                body.innerHTML = `
                    <div class="notif-empty-state">
                        <i class="fas fa-bell-slash"></i>
                        <p>لا توجد إشعارات حالياً</p>
                    </div>
                `;
                return;
            }

            const html = this.notifications
                .map((notif) => {
                    const isUnread = !notif.is_read;
                    const unreadClass = isUnread ? 'unread' : '';
                    const timeAgo = this.formatTimeAgo(notif.created_at);
                    const safeTitle = this.escapeHtml(notif.title || 'إشعار من وسيط');
                    const safeMsg = this.escapeHtml(notif.message || '');
                    const notifId = notif.id;

                    return `
                        <div class="notif-item ${unreadClass}" onclick="window.waseetNotifications && window.waseetNotifications.handleItemClick('${notifId}', event)" role="button" tabindex="0">
                            <div class="notif-item-icon">
                                <i class="${this.pickIconForTitle(safeTitle)}"></i>
                            </div>
                            <div class="notif-item-content">
                                <div class="notif-item-title-row">
                                    <strong class="notif-item-title">${safeTitle}</strong>
                                    ${isUnread ? '<span class="notif-dot" title="غير مقروء"></span>' : ''}
                                </div>
                                <p class="notif-item-msg">${safeMsg}</p>
                                <span class="notif-item-time"><i class="far fa-clock"></i> ${timeAgo}</span>
                            </div>
                        </div>
                    `;
                })
                .join('');

            body.innerHTML = html;
        }

        /**
         * عند النقر على إشعار: تحويله لمقروء والانتقال الذكي للرابط المرفق
         */
        async handleItemClick(notifId, e) {
            if (e && e.stopPropagation) e.stopPropagation();

            const notif = this.notifications.find((n) => n.id === notifId);
            if (!notif) return;

            // تحديث محلي فوري
            if (!notif.is_read) {
                notif.is_read = true;

                if (notif.isSupportMsg) {
                    const curSupport = WaseetNotificationStore.getState().unreadSupportCount || 0;
                    WaseetNotificationStore.setState({
                        unreadSupportCount: Math.max(0, curSupport - 1),
                        notifications: this.notifications
                    });
                    if (this.isMediatorUser(this.currentUser)) {
                        localStorage.setItem('WASEET_ADMIN_LAST_SEEN_SUPPORT', new Date().toISOString());
                    } else {
                        localStorage.setItem('WASEET_USER_LAST_SEEN_SUPPORT', new Date().toISOString());
                    }
                } else {
                    const unreadNotifs = this.notifications.filter(n => !n.is_read && !n.isSupportMsg).length;
                    WaseetNotificationStore.setState({
                        unreadNotificationsCount: unreadNotifs,
                        notifications: this.notifications
                    });

                    // تحديث في قاعدة بيانات Supabase
                    if (typeof initWaseetSupabase === 'function') {
                        const client = initWaseetSupabase();
                        if (client && !String(notifId).startsWith('synth_')) {
                            client
                                .from('notifications')
                                .update({ is_read: true })
                                .eq('id', notifId)
                                .then(() => {})
                                .catch((err) => console.warn('[Notifications] mark read err:', err));
                        }
                    }
                }

                this.renderDropdownItems();
            }

            this.closeDropdown();

            // التوجيه الذكي
            if (notif.link && typeof notif.link === 'string' && notif.link.trim() !== '') {
                const targetLink = notif.link.trim();
                setTimeout(() => {
                    window.location.href = targetLink;
                }, 80);
            }
        }

        /**
         * تحديد الكل كمقروء
         */
        async markAllAsRead(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (!this.currentUser || !this.currentUser.id) return;

            // تحديث محلي فوري
            this.notifications.forEach((n) => {
                n.is_read = true;
            });

            if (this.isMediatorUser(this.currentUser)) {
                localStorage.setItem('WASEET_ADMIN_LAST_SEEN_SUPPORT', new Date().toISOString());
            } else {
                localStorage.setItem('WASEET_USER_LAST_SEEN_SUPPORT', new Date().toISOString());
            }

            WaseetNotificationStore.setState({
                notifications: this.notifications,
                unreadNotificationsCount: 0,
                unreadSupportCount: 0
            });

            this.renderDropdownItems();
            this.clearAppBadge();

            // تحديث جدول notifications في Supabase
            if (typeof initWaseetSupabase === 'function') {
                const client = initWaseetSupabase();
                if (client) {
                    try {
                        await client
                            .from('notifications')
                            .update({ is_read: true })
                            .eq('user_id', this.currentUser.id)
                            .eq('is_read', false);
                    } catch (err) {
                        console.warn('[Notifications] mark all read err:', err);
                    }
                }
            }
        }

        /**
         * عرض إشعار منبثق فوري (Toast) عند ورود إشعار جديد
         */
        showToast(notif) {
            let container = document.getElementById('waseet-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'waseet-toast-container';
                container.className = 'waseet-toast-container';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = 'waseet-toast-card';
            toast.innerHTML = `
                <div class="toast-icon">
                    <i class="${this.pickIconForTitle(notif.title)}"></i>
                </div>
                <div class="toast-body">
                    <h5 class="toast-title">${this.escapeHtml(notif.title || 'إشعار جديد')}</h5>
                    <p class="toast-msg">${this.escapeHtml(notif.message || '')}</p>
                </div>
                <button type="button" class="toast-close-btn" aria-label="إغلاق">&times;</button>
            `;

            toast.onclick = (e) => {
                if (e.target.classList.contains('toast-close-btn')) {
                    e.stopPropagation();
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                    return;
                }
                if (notif.id) this.handleItemClick(notif.id, e);
                else if (notif.link) window.location.href = notif.link;
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            };

            const closeBtn = toast.querySelector('.toast-close-btn');
            if (closeBtn) {
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                };
            }

            container.appendChild(toast);

            // إظهار التنبيه بتأثير سلس
            setTimeout(() => toast.classList.add('show'), 50);

            // إخفاء تلقائي بعد 5.5 ثانية
            setTimeout(() => {
                if (toast && toast.parentNode) {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 350);
                }
            }, 5500);
        }

        /**
         * نغمة تنبيه صوتية لطيفة وخفيفة عبر Web Audio API
         */
        playChimeSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;

                if (!this.audioCtx) {
                    this.audioCtx = new AudioCtx();
                }
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }

                const now = this.audioCtx.currentTime;

                // النغمة الأولى (D5: 587.33 Hz)
                const osc1 = this.audioCtx.createOscillator();
                const gain1 = this.audioCtx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(587.33, now);
                gain1.gain.setValueAtTime(0.08, now);
                gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc1.connect(gain1);
                gain1.connect(this.audioCtx.destination);
                osc1.start(now);
                osc1.stop(now + 0.35);

                // النغمة الثانية (A5: 880 Hz)
                const osc2 = this.audioCtx.createOscillator();
                const gain2 = this.audioCtx.createGain();
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(880, now + 0.12);
                gain2.gain.setValueAtTime(0.12, now + 0.12);
                gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
                osc2.connect(gain2);
                gain2.connect(this.audioCtx.destination);
                osc2.start(now + 0.12);
                osc2.stop(now + 0.55);
            } catch (e) {
                // منع رمي أخطاء إذا تم حظر الصوت قبل تفاعل المستخدم
            }
        }

        pickIconForTitle(title = '') {
            const t = title.toLowerCase();
            if (t.includes('حجز') || t.includes('صفقة') || t.includes('lock')) return 'fas fa-shield-alt text-gold';
            if (t.includes('اعتماد') || t.includes('موافقة') || t.includes('تهانينا') || t.includes('نجاح')) return 'fas fa-check-circle text-gold';
            if (t.includes('شحن') || t.includes('نقاط') || t.includes('محفظ')) return 'fas fa-coins text-gold';
            if (t.includes('فحص') || t.includes('مراجعة')) return 'fas fa-clipboard-check text-orange';
            if (t.includes('رسالة') || t.includes('وسيط') || t.includes('محادثة') || t.includes('دعم')) return 'fas fa-comments text-orange';
            if (t.includes('رفض') || t.includes('إلغاء') || t.includes('تنبيه')) return 'fas fa-exclamation-triangle text-orange';
            return 'fas fa-bell text-gold';
        }

        formatTimeAgo(dateString) {
            if (!dateString) return 'الآن';
            try {
                const date = new Date(dateString);
                const now = new Date();
                const diffSeconds = Math.max(0, Math.floor((now - date) / 1000));

                if (diffSeconds < 60) return 'الآن';
                const diffMinutes = Math.floor(diffSeconds / 60);
                if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;
                const diffHours = Math.floor(diffMinutes / 60);
                if (diffHours < 24) return `منذ ${diffHours} ساعة`;
                const diffDays = Math.floor(diffHours / 24);
                if (diffDays === 1) return 'أمس';
                if (diffDays < 7) return `منذ ${diffDays} أيام`;
                return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
            } catch (e) {
                return 'الآن';
            }
        }

        escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }

    // تصدير الكائن العام
    window.WaseetNotificationSystem = WaseetNotificationSystem;
    window.waseetNotifications = new WaseetNotificationSystem();
})();
