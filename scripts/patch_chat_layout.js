const fs = require('fs');

const path = 'D:/waseet-app/contact-support.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Update CSS
const oldCssPattern = /#support-chat-active\s*\{[\s\S]*?position:\s*relative\s*!important;\s*\}/;

const newCss = `        #support-chat-placeholder {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            flex: 1 1 0% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            box-sizing: border-box !important;
        }

        #support-chat-placeholder[style*="display: none"] {
            display: none !important;
        }

        #support-chat-active {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: 100% !important;
            min-height: 0 !important;
            flex-direction: column !important;
            flex: 1 1 0% !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            position: relative !important;
        }

        #support-chat-active[style*="display: none"] {
            display: none !important;
        }

        #support-chat-active:not([style*="display: none"]) {
            display: flex !important;
        }

        .whatsapp-chat-header {
            order: 1 !important;
            flex-shrink: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            background: rgba(14, 18, 28, 0.98) !important;
            border-bottom: 1px solid var(--border-metal) !important;
            padding: 0.75rem 1rem !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 0.6rem !important;
            box-sizing: border-box !important;
            z-index: 10 !important;
        }

        .support-quick-chips {
            order: 2 !important;
            flex-shrink: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: auto !important;
            padding: 0.5rem 0.75rem !important;
            background: rgba(9, 12, 19, 0.85) !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
            display: flex !important;
            gap: 0.45rem !important;
            white-space: nowrap !important;
            z-index: 9 !important;
        }

        .whatsapp-chat-body,
        .support-chat-messages,
        #support-chat-messages {
            order: 3 !important;
            flex: 1 1 0% !important;
            min-height: 0 !important;
            height: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            overscroll-behavior: contain !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 0.9rem !important;
            background: radial-gradient(circle at center, rgba(16, 22, 34, 0.9), rgba(9, 12, 18, 0.98)) !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0.75rem !important;
        }

        .whatsapp-chat-footer,
        .support-chat-input-bar,
        .chat-input-area,
        #support-chat-form {
            order: 4 !important;
            flex-shrink: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0.75rem 1rem !important;
            background: rgba(14, 18, 28, 0.98) !important;
            border-top: 1px solid var(--border-metal) !important;
            display: flex !important;
            align-items: center !important;
            gap: 0.6rem !important;
            position: relative !important;
            z-index: 10 !important;
        }`;

if (oldCssPattern.test(html)) {
    html = html.replace(oldCssPattern, newCss);
    console.log('[1] Replaced CSS successfully');
} else {
    console.warn('[1] CSS pattern not matched');
}

// 2. Ensure selectContact forces display styles cleanly
html = html.replace(
    /if\s*\(\s*placeholderEl\s*\)\s*placeholderEl\.style\.display\s*=\s*'none';/g,
    "if (placeholderEl) { placeholderEl.style.setProperty('display', 'none', 'important'); }"
);
html = html.replace(
    /if\s*\(\s*chatActiveEl\s*\)\s*chatActiveEl\.style\.display\s*=\s*'flex';/g,
    "if (chatActiveEl) { chatActiveEl.style.setProperty('display', 'flex', 'important'); }"
);
html = html.replace(
    /if\s*\(\s*placeholderEl\s*\)\s*placeholderEl\.style\.display\s*=\s*'flex';/g,
    "if (placeholderEl) { placeholderEl.style.setProperty('display', 'flex', 'important'); }"
);
html = html.replace(
    /if\s*\(\s*chatActiveEl\s*\)\s*chatActiveEl\.style\.display\s*=\s*'none';/g,
    "if (chatActiveEl) { chatActiveEl.style.setProperty('display', 'none', 'important'); }"
);

// 3. Auto-select first contact on desktop upon init so layout is immediately established
const autoSelectSnippet = `
                // تفعيل جهة الاتصال الأولى تلقائياً على الشاشات الكبيرة لمنع أي فراغ أو تشوه في التخطيط
                if (window.innerWidth > 868 && Array.isArray(contacts) && contacts.length > 0 && !activeContactId) {
                    selectContact(contacts[0].id, false);
                }
`;

if (!html.includes('تفعيل جهة الاتصال الأولى تلقائياً')) {
    html = html.replace(
        /(renderContactsList\(\);)/,
        `$1\n${autoSelectSnippet}`
    );
    console.log('[2] Added desktop auto-select snippet');
}

fs.writeFileSync(path, html, 'utf8');
console.log('Successfully patched contact-support.html');
