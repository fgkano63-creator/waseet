/**
 * WASEET (وسيط) - Custom 3D Luxury Dialog System
 * Replaces ugly browser alerts and confirms with centered, animated 3D modal dialogs.
 */

class WaseetDialogManager {
    constructor() {
        this.overlay = null;
        this.init();
    }

    init() {
        // Create modal overlay container if not exists
        let overlay = document.getElementById('waseet-dialog-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'waseet-dialog-overlay';
            overlay.className = 'waseet-dialog-overlay';
            overlay.innerHTML = `
                <div class="waseet-dialog-box card-3d" id="waseet-dialog-box">
                    <div class="waseet-dialog-icon-circle" id="waseet-dialog-icon-wrap">
                        <i class="fas fa-shield-alt" id="waseet-dialog-icon"></i>
                    </div>
                    <h3 class="waseet-dialog-title" id="waseet-dialog-title">تنبيه الوساطة</h3>
                    <div class="waseet-dialog-body" id="waseet-dialog-body">نص التنبيه</div>
                    <div class="waseet-dialog-actions" id="waseet-dialog-actions">
                        <!-- Buttons injected dynamically -->
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        this.overlay = overlay;
    }

    show({
        title = 'تنبيه منصة WASEET',
        message = '',
        type = 'info', // 'escrow', 'success', 'warning', 'danger', 'info'
        isConfirm = false,
        confirmText = 'تأكيد العملية',
        cancelText = 'إلغاء',
        okText = 'فهمت ذلك'
    }) {
        return new Promise((resolve) => {
            const titleEl = document.getElementById('waseet-dialog-title');
            const bodyEl = document.getElementById('waseet-dialog-body');
            const iconWrap = document.getElementById('waseet-dialog-icon-wrap');
            const iconEl = document.getElementById('waseet-dialog-icon');
            const actionsEl = document.getElementById('waseet-dialog-actions');
            const boxEl = document.getElementById('waseet-dialog-box');

            if (titleEl) titleEl.innerText = title;
            if (bodyEl) {
                // If message has newlines, convert to br and sanitize against XSS
                const formatted = String(message).replace(/\n/g, '<br>');
                const safeHtml = (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize)
                    ? DOMPurify.sanitize(formatted, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'span', 'p', 'code', 'ul', 'li'], ALLOWED_ATTR: ['class', 'style'] })
                    : formatted.replace(/[<>'"]/g, c => ({'<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c] || c)).replace(/\n/g, '<br>');
                bodyEl.innerHTML = safeHtml;
            }

            // Set Icon and Theme Glow
            let iconClass = 'fas fa-info-circle';
            let glowClass = 'glow-gold';

            if (type === 'escrow') {
                iconClass = 'fas fa-shield-alt';
                glowClass = 'glow-orange';
            } else if (type === 'success') {
                iconClass = 'fas fa-check-circle';
                glowClass = 'glow-gold';
            } else if (type === 'warning' || type === 'danger') {
                iconClass = 'fas fa-exclamation-triangle';
                glowClass = 'glow-danger';
            }

            if (iconEl) iconEl.className = iconClass;
            if (iconWrap) iconWrap.className = `waseet-dialog-icon-circle ${glowClass}`;

            // Buttons
            if (isConfirm) {
                actionsEl.innerHTML = `
                    <button class="btn-3d btn-outline" id="waseet-dialog-btn-cancel">${cancelText}</button>
                    <button class="btn-3d btn-orange" id="waseet-dialog-btn-confirm">${confirmText}</button>
                `;

                document.getElementById('waseet-dialog-btn-confirm').onclick = () => {
                    this.close();
                    resolve(true);
                };
                document.getElementById('waseet-dialog-btn-cancel').onclick = () => {
                    this.close();
                    resolve(false);
                };
            } else {
                actionsEl.innerHTML = `
                    <button class="btn-3d btn-gold" id="waseet-dialog-btn-ok" style="min-width: 140px;">${okText}</button>
                `;

                document.getElementById('waseet-dialog-btn-ok').onclick = () => {
                    this.close();
                    resolve(true);
                };
            }

            // Show with animation
            this.overlay.classList.add('active');
            boxEl.classList.remove('animate-out');
            boxEl.classList.add('animate-in');
        });
    }

    close() {
        const boxEl = document.getElementById('waseet-dialog-box');
        if (boxEl) {
            boxEl.classList.remove('animate-in');
            boxEl.classList.add('animate-out');
        }
        setTimeout(() => {
            if (this.overlay) this.overlay.classList.remove('active');
        }, 200);
    }

    prompt({
        title = 'إدخال البيانات',
        message = '',
        defaultValue = '',
        okText = 'تأكيد',
        cancelText = 'إلغاء'
    }) {
        return new Promise((resolve) => {
            const titleEl = document.getElementById('waseet-dialog-title');
            const bodyEl = document.getElementById('waseet-dialog-body');
            const iconWrap = document.getElementById('waseet-dialog-icon-wrap');
            const iconEl = document.getElementById('waseet-dialog-icon');
            const actionsEl = document.getElementById('waseet-dialog-actions');
            const boxEl = document.getElementById('waseet-dialog-box');

            if (titleEl) titleEl.innerText = title;
            if (bodyEl) {
                const formatted = String(message).replace(/\n/g, '<br>');
                const safeMsg = (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize)
                    ? DOMPurify.sanitize(formatted, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'span', 'p', 'code'], ALLOWED_ATTR: ['class', 'style'] })
                    : formatted.replace(/[<>'"]/g, c => ({'<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c] || c));
                const safeDefault = String(defaultValue || '').replace(/[<>'"]/g, c => ({'<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c] || c));
                bodyEl.innerHTML = `
                    <div style="margin-bottom: 0.8rem; font-size: 0.92rem; line-height: 1.6;">${safeMsg}</div>
                    <textarea id="waseet-prompt-input" class="input-3d" style="width: 100%; min-height: 85px; padding: 0.75rem; border-radius: 10px; font-family: var(--font-ar); font-size: 0.9rem; resize: vertical;" placeholder="اكتب هنا...">${safeDefault}</textarea>
                `;
            }

            if (iconWrap) {
                iconWrap.className = 'waseet-dialog-icon-circle waseet-dialog-icon-warning';
            }
            if (iconEl) {
                iconEl.className = 'fas fa-exclamation-triangle';
            }

            actionsEl.innerHTML = `
                <button class="btn-3d btn-gold" id="waseet-dialog-prompt-ok" style="min-width: 120px;">${okText}</button>
                <button class="btn-3d btn-outline" id="waseet-dialog-prompt-cancel" style="min-width: 90px;">${cancelText}</button>
            `;

            document.getElementById('waseet-dialog-prompt-ok').onclick = () => {
                const inp = document.getElementById('waseet-prompt-input');
                const val = inp ? inp.value : '';
                this.close();
                resolve(val);
            };

            document.getElementById('waseet-dialog-prompt-cancel').onclick = () => {
                this.close();
                resolve(null);
            };

            this.overlay.classList.add('active');
            boxEl.classList.remove('animate-out');
            boxEl.classList.add('animate-in');
            setTimeout(() => {
                const inp = document.getElementById('waseet-prompt-input');
                if (inp) inp.focus();
            }, 100);
        });
    }

    /**
     * Mediator Authentication - Client-side login disabled for security
     */
    async promptMediatorLogin({ onSuccess, onCancel } = {}) {
        await window.waseetAlert(
            'لوحة إدارة الوسيط المعتمد',
            'لأسباب أمنية مشددة، تم إيقاف تسجيل الدخول من خلال المتصفح. إدارة صفقات الوساطة تتم حصرياً عبر الخادم المعتمد (Backend) لحماية العمليات المالية.',
            'info'
        );
        if (typeof onCancel === 'function') onCancel();
        return null;
    }
}

// Global helpers available everywhere
window.waseetDialogManager = new WaseetDialogManager();

window.waseetAlert = function(title, message, type = 'info', okText = 'حسناً') {
    return window.waseetDialogManager.show({
        title,
        message,
        type,
        isConfirm: false,
        okText
    });
};

window.waseetConfirm = function(title, message, confirmText = 'نعم، تأكيد', cancelText = 'إلغاء', type = 'escrow') {
    return window.waseetDialogManager.show({
        title,
        message,
        type,
        isConfirm: true,
        confirmText,
        cancelText
    });
};

window.waseetPrompt = function(title, message, defaultValue = '', okText = 'تأكيد', cancelText = 'إلغاء') {
    return window.waseetDialogManager.prompt({
        title,
        message,
        defaultValue,
        okText,
        cancelText
    });
};

window.waseetPromptMediatorLogin = function(onSuccess, onCancel) {
    return window.waseetDialogManager.promptMediatorLogin({ onSuccess, onCancel });
};

