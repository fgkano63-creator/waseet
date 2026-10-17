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

        let html = welcomeHtml;
        messages.forEach(msg => {
            html += generateMessageBubbleHtml(msg);
        });

        container.innerHTML = html;
        scrollToSupportBottom();
    }

    /**
     * توليد HTML لفقاعة الرسالة
     */
    function generateMessageBubbleHtml(msg) {
        const isUser = msg.sender_role === 'user';
        const timeStr = formatMsgTime(msg.created_at);

        if (isUser) {
            return `
                <div class="support-msg-row user-row">
                    <div class="support-msg-bubble user-bubble">
                        <div class="support-msg-text">${escapeHtml(msg.message)}</div>
                        <div class="support-msg-time">${timeStr} <i class="fas fa-check-double text-gold" style="font-size: 0.65rem;"></i></div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="support-msg-row admin-row">
                    <div class="support-admin-avatar-tiny" title="الوسيط المعتمد">
                        <img src="assets/logo.png" alt="الوسيط">
                    </div>
                    <div class="support-msg-bubble admin-bubble">
                        <div class="support-admin-sender-tag">
                            <i class="fas fa-crown text-gold"></i> الوسيط المعتمد (الإدارة)
                        </div>
                        <div class="support-msg-text">${escapeHtml(msg.message)}</div>
                        <div class="support-msg-time">${timeStr}</div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * إرسال رسالة جديدة
     */
    async function handleSendSupportMessage() {
        const input = document.getElementById('support-chat-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const user = getCurrentAuthUser();
        if (!user) {
            window.waseetOpenSupportChat();
            return;
        }

        input.value = '';
        input.focus();

        const newMsg = {
            id: 'temp_' + Date.now(),
            user_id: user.id,
            sender_role: 'user',
            message: text,
            created_at: new Date().toISOString()
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
                    // تحديث المعرف المؤقت
                    newMsg.id = data[0].id;
                }
            } catch (err) {
                console.warn('[Support Chat] استثناء في إرسال الرسالة:', err);
            }
        }
    }

    /**
     * إلحاق رسالة واحدة بالواجهة والتمرير للأسفل
     */
    function appendSingleMessageToUI(msg) {
        const container = document.getElementById('support-chat-messages');
        if (!container) return;

        // منع التكرار بناء على id أو النص والوقت المتطابق
        if (msg.id && !msg.id.startsWith('temp_')) {
            const existing = document.querySelector(`[data-msg-id="${msg.id}"]`);
            if (existing) return;
        }

        const div = document.createElement('div');
        div.innerHTML = generateMessageBubbleHtml(msg);
        const child = div.firstElementChild;
        if (child && msg.id) {
            child.setAttribute('data-msg-id', msg.id);
        }
        container.appendChild(child);
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
