/**
 * WASEET (وسيط) - نظام المحادثة المباشرة مع الوسيط المعتمد (Support / Direct Chat)
 * يُتيح للمستخدمين التواصل الفوري المباشر مع إدارة المنصة (الوسيط) بدون الحاجة لصفقة نشطة،
 * مع مزامنة لحظية عبر Supabase Realtime، وحفظ الرسائل في جدول support_messages.
 */

(function() {
    'use strict';

    let supportRealtimeChannel = null;
    let isSupportInitialized = false;

    // الأصوات التنبيهية اللحظية عبر Web Audio API
    function playSupportChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        } catch (e) {
            // Audio context not allowed or unsupported
        }
    }

    /**
     * حقن الزر العائم للتواصل الفوري في أسفل الشاشة
     */
    function initSupportUI() {
        if (window.location.pathname.includes('contact-support.html') || window.location.pathname.includes('admin-chats.html')) {
            return;
        }
        if (document.getElementById('support-floating-btn')) return;

        // حقن الزر العائم للتواصل الفوري في أسفل الشاشة يوجه للصفحة المستقلة
        const currentUser = getCurrentAuthUser();
        const isAdminViewer = currentUser && (typeof isMediatorUser === 'function'
            ? isMediatorUser(currentUser)
            : (currentUser.role === 'admin' || currentUser.email === 'fgkano63@gmail.com'));

        const floatingBtnHtml = isAdminViewer ? `
        <a href="admin-chats.html" class="support-floating-pill" id="support-floating-btn" title="صندوق محادثات الدعم (الإدارة)" style="text-decoration: none;">
            <div class="support-floating-icon">
                <i class="fas fa-headset"></i>
            </div>
            <span class="support-floating-label">محادثات الإدارة</span>
        </a>
        ` : `
        <a href="contact-support.html" class="support-floating-pill" id="support-floating-btn" title="محادثة مباشرة مع الوسيط المعتمد" style="text-decoration: none;">
            <div class="support-floating-icon">
                <i class="fas fa-headset"></i>
                <span class="support-badge-pulse" id="support-unread-dot" style="display: none;"></span>
            </div>
            <span class="support-floating-label">تواصل مع الوسيط</span>
        </a>
        `;

        document.body.insertAdjacentHTML('beforeend', floatingBtnHtml);
    }

    /**
     * التحقق من المستخدم الحالي
     */
    function getCurrentAuthUser() {
        if (typeof WASEET_STATE !== 'undefined' && WASEET_STATE.user) {
            return WASEET_STATE.user;
        }
        try {
            const saved = localStorage.getItem('WASEET_SAVED_USER_PERMANENT');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return null;
    }

    /**
     * توجيه المستخدم مباشرة لصفحة المحادثة المستقلة مع الوسيط
     */
    window.waseetOpenSupportChat = function() {
        window.location.href = 'contact-support.html';
    };

    /**
     * جلب رسائل المستخدم السابقة من Supabase
     */
    async function loadUserSupportMessages(userId) {
        const messagesContainer = document.getElementById('support-chat-messages');
        if (!messagesContainer) return;

        const client = typeof initWaseetSupabase === 'function' ? initWaseetSupabase() : null;
        let messages = [];

        if (client) {
            try {
                const { data, error } = await client
                    .from('support_messages')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: true });

                if (!error && Array.isArray(data)) {
                    messages = data;
                }
            } catch (err) {
                console.warn('[Support Chat] تعذر جلب الرسائل من Supabase:', err);
            }
        }

        // دمج الرسائل المحلية كاحتياط
        if (messages.length === 0) {
            try {
                const local = JSON.parse(localStorage.getItem(`WASEET_SUPPORT_MSGS_${userId}`) || '[]');
                if (Array.isArray(local) && local.length > 0) {
                    messages = local;
                }
            } catch (e) {}
        }

        renderSupportMessagesList(messages);
    }

    /**
     * عرض قائمة الرسائل في الصندوق
     */
    function renderSupportMessagesList(messages) {
        const container = document.getElementById('support-chat-messages');
        if (!container) return;

        // الاحتفاظ بفقاعة الترحيب في الأعلى
        const welcomeHtml = `
            <div class="support-welcome-bubble">
                <div class="support-welcome-icon"><i class="fas fa-shield-alt text-gold"></i></div>
                <h4 style="margin: 0 0 0.35rem; color: #fff; font-size: 0.95rem;">مرحباً بك في المحادثة المباشرة مع الوسيط</h4>
                <p style="margin: 0; font-size: 0.8rem; color: var(--silver-muted); line-height: 1.4;">
                    يمكنك مراسلتنا هنا مباشرة بخصوص فحص الحسابات، طلبات الشحن، أو أي استفسار حول منصة وسيط. رسائلك مشفرة ومحمية وتصل للإدارة فوراً.
                </p>
            </div>
        `;

        if (!messages || messages.length === 0) {
            container.innerHTML = welcomeHtml;
            return;
        }

        container.innerHTML = welcomeHtml;
        const seen = new Set();
        messages.forEach(msg => {
            if (msg.id && seen.has(String(msg.id))) return;
            if (msg.id) seen.add(String(msg.id));
            container.appendChild(createSupportMessageElement(msg));
        });

        scrollToSupportBottom();
    }

    /**
     * توليد عنصر الرسالة باستخدام DOM و textContent للحماية ومنع تشغيل السكربتات والروابط
     */
    function createSupportMessageElement(msg) {
        const isUser = msg.sender_role === 'user';
        const timeStr = formatMsgTime(msg.created_at);

        const row = document.createElement('div');
        row.className = `support-msg-row ${isUser ? 'user-row' : 'admin-row'}`;
        if (msg.id) row.setAttribute('data-msg-id', String(msg.id));
        if (msg.isPending) row.setAttribute('data-pending', 'true');

        if (!isUser) {
            const avatarWrap = document.createElement('div');
            avatarWrap.className = 'support-admin-avatar-tiny';
            avatarWrap.title = 'الوسيط المعتمد';
            const avatarImg = document.createElement('img');
            avatarImg.src = 'assets/logo.png';
            avatarImg.alt = 'الوسيط';
            avatarWrap.appendChild(avatarImg);
            row.appendChild(avatarWrap);
        }

        const bubble = document.createElement('div');
        bubble.className = `support-msg-bubble ${isUser ? 'user-bubble' : 'admin-bubble'}`;

        if (!isUser) {
            const senderTag = document.createElement('div');
            senderTag.className = 'support-admin-sender-tag';
            senderTag.innerHTML = '<i class="fas fa-crown text-gold"></i> الوسيط المعتمد (الإدارة)';
            bubble.appendChild(senderTag);
        }

        // نص خام بحت عبر textContent: منع أي سكربتات وحظر أي روابط تفاعلية
        const textDiv = document.createElement('div');
        textDiv.className = 'support-msg-text';
        textDiv.textContent = String(msg.message || '');
        bubble.appendChild(textDiv);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'support-msg-time';
        timeDiv.textContent = timeStr ? `${timeStr} ` : '';
        if (isUser) {
            const checkIcon = document.createElement('i');
            checkIcon.className = 'fas fa-check-double text-gold';
            checkIcon.style.fontSize = '0.65rem';
            timeDiv.appendChild(checkIcon);
        }
        bubble.appendChild(timeDiv);

        row.appendChild(bubble);
        return row;
    }

    let supportMsgTimestamps = [];

    /**
     * إرسال رسالة جديدة مع حماية ضد السبام (Rate Limiting) ومعالجة الأخطاء (try/catch)
     */
    async function handleSendSupportMessage() {
        try {
            const input = document.getElementById('support-chat-input');
            if (!input) return;
            const text = input.value.trim();
            if (!text) return;

            const now = Date.now();
            supportMsgTimestamps = supportMsgTimestamps.filter(ts => now - ts < 10000);
            const lastTs = supportMsgTimestamps.length > 0 ? supportMsgTimestamps[supportMsgTimestamps.length - 1] : 0;
            if (now - lastTs < 1200 || supportMsgTimestamps.length >= 5) {
                if (typeof waseetAlert === 'function') {
                    await waseetAlert('تنبيه منع السبام', 'يرجى الانتظار قليلاً قبل إرسال رسالة أخرى.', 'warning');
                }
                return;
            }
            supportMsgTimestamps.push(now);

            const user = getCurrentAuthUser();
            if (!user) {
                window.waseetOpenSupportChat();
                return;
            }

            input.value = '';
            input.focus({ preventScroll: true });

        const tempId = 'temp_' + Date.now();
        const newMsg = {
            id: tempId,
            user_id: user.id,
            sender_role: 'user',
            message: text,
            created_at: new Date().toISOString(),
            isPending: true
        };

        // إضافة متفائلة فورية للواجهة (Optimistic UI)
        appendSingleMessageToUI(newMsg);

        // حفظ محلي احتياطي
        try {
            const key = `WASEET_SUPPORT_MSGS_${user.id}`;
            const local = JSON.parse(localStorage.getItem(key) || '[]');
            local.push(newMsg);
            localStorage.setItem(key, JSON.stringify(local));
        } catch (e) {}

        // إرسال لقاعدة بيانات Supabase
        const client = typeof initWaseetSupabase === 'function' ? initWaseetSupabase() : null;
        if (client) {
            try {
                const { data, error } = await client
                    .from('support_messages')
                    .insert([{
                        user_id: user.id,
                        sender_role: 'user',
                        message: text
                    }])
                    .select();

                if (error) {
                    console.warn('[Support Chat] فشل الإرسال إلى جدول support_messages:', error.message);
                } else if (data && data[0]) {
                    const container = document.getElementById('support-chat-messages');
                    if (container) {
                        const pendingEl = container.querySelector(`[data-msg-id="${tempId}"]`);
                        if (pendingEl) {
                            pendingEl.setAttribute('data-msg-id', String(data[0].id));
                            pendingEl.removeAttribute('data-pending');
                        }
                    }
                }
            } catch (err) {
                console.warn('[Support Chat] استثناء في إرسال الرسالة:', err);
            }
        }
        } catch (outerErr) {
            console.warn('[Support Chat] خطأ غير متوقع:', outerErr);
        }
    }

    /**
     * إلحاق رسالة واحدة بالواجهة والتمرير للأسفل
     */
    function appendSingleMessageToUI(msg) {
        const container = document.getElementById('support-chat-messages');
        if (!container) return;

        // 1. منع التكرار بناء على id الدائم إن كان موجوداً
        if (msg.id && !String(msg.id).startsWith('temp_')) {
            const existing = container.querySelector(`[data-msg-id="${msg.id}"]`);
            if (existing) return;
        }

        // 2. إذا كانت الرسالة من المستخدم، نتحقق من وجود رسالة معلقة مؤقتة مطابقة
        if (msg.sender_role === 'user') {
            const pendingEls = container.querySelectorAll('.support-msg-row.user-row[data-pending="true"], .support-msg-row.user-row[data-msg-id^="temp_"]');
            for (const el of pendingEls) {
                const textEl = el.querySelector('.support-msg-text');
                if (textEl && textEl.textContent.trim() === String(msg.message || '').trim()) {
                    if (msg.id) el.setAttribute('data-msg-id', String(msg.id));
                    el.removeAttribute('data-pending');
                    return;
                }
            }
        }

        const element = createSupportMessageElement(msg);
        container.appendChild(element);
        scrollToSupportBottom();
    }

    /**
     * تهيئة الاستماع اللحظي (Supabase Realtime)
     */
    function setupSupportRealtime(userId) {
        const client = typeof initWaseetSupabase === 'function' ? initWaseetSupabase() : null;
        if (!client) return;

        if (supportRealtimeChannel) {
            try { client.removeChannel(supportRealtimeChannel); } catch (e) {}
        }

        try {
            supportRealtimeChannel = client
                .channel(`support-chat-${userId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'support_messages',
                    filter: `user_id=eq.${userId}`
                }, (payload) => {
                    const newMsg = payload.new;
                    if (!newMsg) return;

                    const isChatPage = window.location.pathname.includes('contact-support.html');

                    if (newMsg.sender_role === 'admin') {
                        playSupportChime();
                        if (!isChatPage) {
                            const unreadDot = document.getElementById('support-unread-dot');
                            if (unreadDot) unreadDot.style.display = 'block';
                            if (typeof waseetAlert === 'function') {
                                waseetAlert(
                                    '👑 رد جديد من الوسيط المعتمد',
                                    `أرسل لك الوسيط رسالة جديدة:\n"${newMsg.message.substring(0, 80)}..."\nانقر على زر "تواصل مع الوسيط" لقراءتها والرد.`,
                                    'info'
                                );
                            }
                        }
                    }

                    if (isChatPage) {
                        appendSingleMessageToUI(newMsg);
                    }
                })
                .subscribe();
        } catch (err) {
            console.warn('[Support Realtime] فشل تهيئة البث اللحظي:', err);
        }
    }

    function scrollToSupportBottom() {
        const container = document.getElementById('support-chat-messages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function formatMsgTime(isoString) {
        if (!isoString) return '';
        try {
            const d = new Date(isoString);
            return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // التهيئة التلقائية للواجهة عند تحميل الصفحة
    if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
            initSupportUI();
        });
    }

})();
