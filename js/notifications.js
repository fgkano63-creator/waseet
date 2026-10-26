/**
 * WASEET (وسيط) - نظام الإشعارات الفورية وشارات PWA (App Badging API)
 * يدعم:
 * 1. جرس الإشعارات مع القائمة المنسدلة في الشريط العلوي (Navbar).
 * 2. المزامنة اللحظية (Supabase Realtime) مع تنبيهات صوتية وإشعارات Toast منبثقة.
 * 3. التوجيه الذكي وتحديث حالة القراءة فوراً (is_read = true).
 * 4. شارة أيقونة التطبيق الخارجية عبر navigator.setAppBadge() و navigator.clearAppBadge().
 */

(function () {
    'use strict';

    class WaseetNotificationSystem {
        constructor() {
            this.notifications = [];
            this.unreadCount = 0;
            this.isOpen = false;
            this.realtimeChannel = null;
            this.audioCtx = null;
            this.currentUser = null;

            this.init();
        }

        init() {
            // انتظار جاهزية الصفحة
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

            // مزامنة الشارة الخارجية عند عودة التطبيق للواجهة
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
                this.subscribeRealtime(user.id);
            } else {
                this.notifications = [];
                this.unreadCount = 0;
                this.updateBadges();
                this.clearAppBadge();
                if (this.realtimeChannel && typeof initWaseetSupabase === 'function') {
                    const client = initWaseetSupabase();
                    if (client) client.removeChannel(this.realtimeChannel);
                    this.realtimeChannel = null;
                }
            }
        }

        /**
         * جلب الإشعارات من Supabase
         */
        async fetchNotifications(isSilent = false) {
            if (!this.currentUser || !this.currentUser.id) return;
            if (typeof initWaseetSupabase !== 'function') return;

            const client = initWaseetSupabase();
            if (!client) return;

            try {
                const { data, error } = await client
                    .from('notifications')
                    .select('*')
                    .eq('user_id', this.currentUser.id)
                    .order('created_at', { ascending: false })
                    .limit(35);

                if (error) {
                    // إذا كان الجدول غير موجود بعد في Supabase، لا نلقي أخطاء مزعجة
                    if (error.code !== '42P01') {
                        console.warn('[Notifications] fetch error:', error.message);
                    }
                    return;
                }

                this.notifications = data || [];
                this.calculateUnread();
                this.updateBadges();
                this.renderDropdownItems();
            } catch (err) {
                console.warn('[Notifications] fetch exception:', err);
            }
        }

        /**
         * الاشتراك في التحديثات الفورية (Realtime) لجدول notifications
         */
        subscribeRealtime(userId) {
            if (!userId || typeof initWaseetSupabase !== 'function') return;
            const client = initWaseetSupabase();
            if (!client) return;

            // إزالة القناة السابقة إن وجدت
            if (this.realtimeChannel) {
                client.removeChannel(this.realtimeChannel);
                this.realtimeChannel = null;
            }

            try {
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
                    .subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            // اشتراك ناجح
                        }
                    });
            } catch (e) {
                console.warn('[Notifications] Realtime subscribe error:', e);
            }
        }

        /**
         * معالجة أحداث التغيير الفوري
         */
        handleRealtimeEvent(payload) {
            const eventType = payload.eventType;
            const newRecord = payload.new;
            const oldRecord = payload.old;

            if (eventType === 'INSERT' && newRecord) {
                // إضافة الإشعار الجديد لأعلى القائمة
                this.notifications.unshift(newRecord);
                this.calculateUnread();
                this.updateBadges();
                this.renderDropdownItems();

                // تنبيه مرئي وصوتي
                this.showToast(newRecord);
                this.playChimeSound();
            } else if (eventType === 'UPDATE' && newRecord) {
                const idx = this.notifications.findIndex((n) => n.id === newRecord.id);
                if (idx !== -1) {
                    this.notifications[idx] = newRecord;
                } else {
                    this.notifications.unshift(newRecord);
                }
                this.calculateUnread();
                this.updateBadges();
                this.renderDropdownItems();
            } else if (eventType === 'DELETE' && oldRecord) {
                this.notifications = this.notifications.filter((n) => n.id !== oldRecord.id);
                this.calculateUnread();
                this.updateBadges();
                this.renderDropdownItems();
            }
        }

        /**
         * حساب عدد الإشعارات غير المقروءة
         */
        calculateUnread() {
            this.unreadCount = this.notifications.filter((n) => !n.is_read).length;
        }

        /**
         * تحديث العدادات وشارات التطبيق (PWA Badging API)
         */
        updateBadges() {
            const count = this.unreadCount;
            const badgeEl = document.getElementById('notif-badge');
            const tagEl = document.getElementById('notif-count-tag');

            if (badgeEl) {
                if (count > 0) {
                    badgeEl.innerText = count > 99 ? '99+' : String(count);
                    badgeEl.style.display = 'inline-flex';
                } else {
                    badgeEl.innerText = '0';
                    badgeEl.style.display = 'none';
                }
            }

            if (tagEl) {
                if (count > 0) {
                    tagEl.innerText = `${count} غير مقروء`;
                    tagEl.style.display = 'inline-block';
                } else {
                    tagEl.style.display = 'none';
                }
            }

            // تطبيق ميزة الشارة الخارجية على أيقونة التطبيق (PWA App Badging)
            this.syncAppBadge(count);
        }

        /**
         * PWA App Badging API: ضبط أو مسح الشارة على أيقونة التطبيق في شاشة الهاتف
         */
        syncAppBadge(count) {
            try {
                if ('setAppBadge' in navigator) {
                    if (count > 0) {
                        navigator.setAppBadge(count).catch((err) => {
                            console.log('[PWA Badge] setAppBadge info:', err);
                        });
                    } else {
                        navigator.clearAppBadge().catch(() => {});
                    }
                } else if ('clearAppBadge' in navigator && count === 0) {
                    navigator.clearAppBadge().catch(() => {});
                }
            } catch (err) {
                console.log('[PWA Badge] Exception:', err);
            }
        }

        clearAppBadge() {
            this.syncAppBadge(0);
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
                        <p>لا توجد إشعارات جديدة حالياً</p>
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

            // تحديث محلي فوري للاستجابة السريعة (Optimistic UI)
            if (!notif.is_read) {
                notif.is_read = true;
                this.calculateUnread();
                this.updateBadges();
                this.renderDropdownItems();

                // تحديث في قاعدة بيانات Supabase
                if (typeof initWaseetSupabase === 'function') {
                    const client = initWaseetSupabase();
                    if (client) {
                        client
                            .from('notifications')
                            .update({ is_read: true })
                            .eq('id', notifId)
                            .then(() => {})
                            .catch((err) => console.warn('[Notifications] mark read err:', err));
                    }
                }
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
            this.calculateUnread();
            this.updateBadges();
            this.renderDropdownItems();
            this.clearAppBadge();

            // تحديث Supabase
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
                this.handleItemClick(notif.id, e);
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

            // إخفاء تلقائي بعد 5 ثوانٍ
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
                // قد يتم حظر الصوت التلقائي قبل تفاعل المستخدم
            }
        }

        /**
         * اختيار الأيقونة المناسبة لعنوان الإشعار
         */
        pickIconForTitle(title = '') {
            const t = title.toLowerCase();
            if (t.includes('حجز') || t.includes('صفقة') || t.includes('lock')) return 'fas fa-shield-alt text-gold';
            if (t.includes('اعتماد') || t.includes('موافقة') || t.includes('تهانينا') || t.includes('نجاح')) return 'fas fa-check-circle text-gold';
            if (t.includes('شحن') || t.includes('نقاط') || t.includes('محفظ')) return 'fas fa-coins text-gold';
            if (t.includes('فحص') || t.includes('مراجعة')) return 'fas fa-clipboard-check text-orange';
            if (t.includes('رسالة') || t.includes('وسيط') || t.includes('محادثة')) return 'fas fa-comments text-orange';
            if (t.includes('رفض') || t.includes('إلغاء') || t.includes('تنبيه')) return 'fas fa-exclamation-triangle text-orange';
            return 'fas fa-bell text-gold';
        }

        /**
         * تنسيق الوقت المنقضي بطريقة عربية مبسطة
         */
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
