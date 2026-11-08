/**
 * ==============================================================================
 * WASEET PLATFORM - AUTOMATED CLICK TESTING & SELF-REPORTING SYSTEM
 * Location: D:\waseet-app\js\button-self-reporter.js
 * 
 * Comprehensive In-Browser & Automated Click Auditor with Real-time Self-Alerting:
 * 1. Event Listener & Actionability Verifier (Missing listener / Dead button)
 * 2. Visual Obscurity & Z-Index Collision Detector (elementFromPoint hit-testing)
 * 3. Runtime Console & Exception Interceptor (Catches crashes triggered on click)
 * 4. Self-Reporting Dispatcher (Webhook / API payload to AntiGravity & OpenCode)
 * ==============================================================================
 */

(function (window, document) {
    'use strict';

    class ButtonSelfReporter {
        constructor(config = {}) {
            this.config = Object.assign({
                webhookUrl: window.WASEET_ALERT_WEBHOOK || localStorage.getItem('WASEET_ALERT_WEBHOOK') || 'http://localhost:5055/webhook/button-alert',
                apiEndpoint: window.WASEET_ALERT_API || localStorage.getItem('WASEET_ALERT_API') || '/api/log-error',
                environment: window.WASEET_ENV || 'development',
                cooldownSeconds: 30, // Prevent spamming duplicate alerts for the same selector
                autoAuditOnLoad: false,
                interceptRealClicks: true,
                debugMode: true
            }, config);

            this.reportedIncidents = new Map();
            this.eventLog = [];
            this.activeErrorsInFlight = [];
            this.initialized = false;

            this.init();
        }

        init() {
            if (this.initialized) return;
            this.initialized = true;

            // Global error interception
            this.setupGlobalErrorTraps();

            // Intercept real clicks if configured
            if (this.config.interceptRealClicks) {
                this.setupRealClickMonitoring();
            }

            if (this.config.autoAuditOnLoad) {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => this.runFullAudit());
                } else {
                    this.runFullAudit();
                }
            }

            // Expose globally
            window.buttonSelfReporter = this;
            console.log('%c[Self-Reporting Auditor]%c Activated. Monitoring button health and z-index integrity.',
                'background: #10b981; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
                'color: #10b981;');
        }

        /**
         * Global error listener to capture runtime errors triggered during click events
         */
        setupGlobalErrorTraps() {
            const originalConsoleError = console.error;
            const self = this;

            console.error = function (...args) {
                const errorStr = args.map(a => (a instanceof Error ? a.stack || a.message : String(a))).join(' ');
                self.activeErrorsInFlight.push({
                    type: 'console.error',
                    message: errorStr,
                    timestamp: new Date().toISOString()
                });
                originalConsoleError.apply(console, args);
            };

            window.addEventListener('error', (event) => {
                this.activeErrorsInFlight.push({
                    type: 'window.error',
                    message: event.message || 'Script error',
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    stack: event.error ? event.error.stack : null,
                    timestamp: new Date().toISOString()
                });
            }, true);

            window.addEventListener('unhandledrejection', (event) => {
                const reason = event.reason;
                this.activeErrorsInFlight.push({
                    type: 'unhandledrejection',
                    message: reason instanceof Error ? (reason.stack || reason.message) : String(reason),
                    timestamp: new Date().toISOString()
                });
            }, true);
        }

        /**
         * Monitors real user interactions to catch silent or blocked clicks in real-time
         */
        setupRealClickMonitoring() {
            document.addEventListener('click', (event) => {
                const target = event.target;
                const buttonCandidate = target.closest('button, [role="button"], a.btn, a.btn-3d, input[type="button"], input[type="submit"]');
                
                if (buttonCandidate) {
                    // Check if the button was visually obstructed or if clicks produced an immediate error
                    setTimeout(() => {
                        this.verifyClickPostExecution(buttonCandidate, event);
                    }, 50);
                }
            }, true);
        }

        /**
         * Verifies whether an actual click triggered a runtime exception
         */
        verifyClickPostExecution(buttonElement, clickEvent) {
            if (this.activeErrorsInFlight.length > 0) {
                const recentErrors = [...this.activeErrorsInFlight];
                this.activeErrorsInFlight = [];

                this.triggerAlert({
                    element: buttonElement,
                    failureCode: 'CONSOLE_RUNTIME_ERROR',
                    failureTitle: 'خطأ برمجي في الكونسول أثناء النقر (Runtime Error on Click)',
                    details: 'Triggered unhandled console or runtime exceptions when clicked.',
                    runtimeErrors: recentErrors,
                    clickEventData: {
                        clientX: clickEvent.clientX,
                        clientY: clickEvent.clientY,
                        isTrusted: clickEvent.isTrusted
                    }
                });
            }
        }

        /**
         * Generates a stable, unambiguous CSS selector for any DOM element
         */
        getElementSelector(el) {
            if (!el || !(el instanceof Element)) return 'unknown';
            if (el.id) return `#${el.id}`;

            let path = [];
            let current = el;

            while (current && current.nodeType === Node.ELEMENT_NODE) {
                let selector = current.nodeName.toLowerCase();
                if (current.id) {
                    selector = `#${current.id}`;
                    path.unshift(selector);
                    break;
                } else {
                    let sibling = current;
                    let nth = 1;
                    while (sibling = sibling.previousElementSibling) {
                        if (sibling.nodeName.toLowerCase() === selector) nth++;
                    }
                    if (nth !== 1) selector += `:nth-of-type(${nth})`;
                    if (current.className && typeof current.className === 'string') {
                        const classes = current.className.trim().split(/\s+/).filter(c => c && !c.includes(':')).slice(0, 2);
                        if (classes.length) selector += '.' + classes.join('.');
                    }
                }
                path.unshift(selector);
                current = current.parentElement;
                if (path.length >= 4) break;
            }

            return path.join(' > ');
        }

        /**
         * Comprehensive inspection of a single button/interactive element
         */
        inspectElement(el) {
            const selector = this.getElementSelector(el);
            const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' ');
            const rect = el.getBoundingClientRect();
            const computed = window.getComputedStyle(el);

            // 1. Check Visibility & Layout
            const isVisible = rect.width > 0 && rect.height > 0 && 
                              computed.display !== 'none' && 
                              computed.visibility !== 'hidden' && 
                              parseFloat(computed.opacity) > 0.05;

            // If completely hidden via standard CSS classes or deliberate visibility, skip unless marked required
            if (!isVisible) {
                if (computed.display === 'none' || computed.visibility === 'hidden') {
                    return { status: 'SKIPPED_HIDDEN', selector, text };
                }
            }

            // 2. Check Pointer-Events (CSS click blocking)
            if (computed.pointerEvents === 'none') {
                return {
                    status: 'FAIL',
                    element: el,
                    failureCode: 'POINTER_EVENTS_DISABLED',
                    failureTitle: 'خاصية النقر معطلة عبر CSS (pointer-events: none)',
                    details: 'Element has CSS pointer-events: none, making it physically unclickable.',
                    selector,
                    text
                };
            }

            // 3. Physical Hit-Testing & Z-Index Collision Detection
            // Uses document.elementFromPoint to detect if another element covers this button
            const centerX = Math.floor(rect.left + rect.width / 2);
            const centerY = Math.floor(rect.top + rect.height / 2);

            // Only test elementFromPoint if within current viewport
            if (centerX >= 0 && centerX <= window.innerWidth && centerY >= 0 && centerY <= window.innerHeight) {
                const topElement = document.elementFromPoint(centerX, centerY);
                if (topElement && topElement !== el && !el.contains(topElement) && !topElement.contains(el)) {
                    const topComputed = window.getComputedStyle(topElement);
                    const topSelector = this.getElementSelector(topElement);
                    return {
                        status: 'FAIL',
                        element: el,
                        failureCode: 'Z_INDEX_COVERED',
                        failureTitle: 'الزر مغطى بعنصر آخر عبر Z-Index (Click Intercepted by Overlay)',
                        details: `Physical click is blocked because element '${topSelector}' is positioned over this button.`,
                        selector,
                        text,
                        blockingElement: {
                            tagName: topElement.tagName,
                            id: topElement.id || null,
                            className: topElement.className || null,
                            selector: topSelector,
                            zIndex: topComputed.zIndex,
                            position: topComputed.position,
                            opacity: topComputed.opacity
                        }
                    };
                }
            }

            // 4. Actionability & Event Listener Verification
            const hasOnclickAttr = el.hasAttribute('onclick');
            const hasInlineOnclick = typeof el.onclick === 'function';
            const isSubmit = el.tagName === 'BUTTON' && (el.type === 'submit' || !el.type) && el.closest('form');
            const isAnchorWithHref = el.tagName === 'A' && el.getAttribute('href') && 
                                     !el.getAttribute('href').startsWith('#') && 
                                     !el.getAttribute('href').startsWith('javascript:void');
            const hasDataAction = el.hasAttribute('data-action') || el.hasAttribute('data-target') || 
                                  el.hasAttribute('data-bs-toggle') || el.hasAttribute('data-modal');
            const hasCustomListeners = el._hasClickListener || false;

            // In modern apps, event delegation might be used. Check if parent form or container has listeners
            const hasFormHandler = el.closest('form') && (el.closest('form').hasAttribute('onsubmit') || typeof el.closest('form').onsubmit === 'function');

            const isActionable = hasOnclickAttr || hasInlineOnclick || isSubmit || isAnchorWithHref || hasDataAction || hasCustomListeners || hasFormHandler;

            if (!isActionable && el.tagName === 'BUTTON' && el.type === 'button') {
                return {
                    status: 'FAIL',
                    element: el,
                    failureCode: 'NO_EVENT_LISTENER',
                    failureTitle: 'زر بدون أي حدث تفاعلي (Dead Button: No Event Listener or Action)',
                    details: 'Button has type="button", no onclick attribute, no data-action, and no bound listener.',
                    selector,
                    text
                };
            }

            // 5. Test Synthetic Click & Runtime Exception Catching
            this.activeErrorsInFlight = [];
            let clickException = null;

            try {
                // Dispatch synthetic event with cancelable flag
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });

                // Prevent actual page navigation during diagnostic test
                const preventDefaultHandler = (e) => {
                    if (e.target.tagName === 'A' && e.target.href) {
                        e.preventDefault();
                    }
                };
                el.addEventListener('click', preventDefaultHandler, { once: true });

                el.dispatchEvent(clickEvent);
            } catch (err) {
                clickException = err;
            }

            if (clickException || this.activeErrorsInFlight.length > 0) {
                const errors = clickException ? 
                    [{ message: clickException.message, stack: clickException.stack, type: 'thrown' }, ...this.activeErrorsInFlight] : 
                    [...this.activeErrorsInFlight];
                this.activeErrorsInFlight = [];

                return {
                    status: 'FAIL',
                    element: el,
                    failureCode: 'CONSOLE_RUNTIME_ERROR',
                    failureTitle: 'خطأ برمجي مباشر عند النقر (Runtime Error On Synthetic Click)',
                    details: 'Triggered immediate JavaScript exceptions when synthetic click was dispatched.',
                    selector,
                    text,
                    runtimeErrors: errors
                };
            }

            return {
                status: 'PASS',
                selector,
                text
            };
        }

        /**
         * Executes full-page audit on all buttons and interactive elements
         */
        runFullAudit() {
            const candidates = Array.from(document.querySelectorAll('button, [role="button"], a.btn, a.btn-3d, input[type="button"], input[type="submit"]'));
            const results = {
                timestamp: new Date().toISOString(),
                pageUrl: window.location.href,
                pageTitle: document.title,
                totalScanned: candidates.length,
                passed: 0,
                failed: 0,
                skipped: 0,
                failures: []
            };

            console.group(`%c[Button Self-Reporting Audit] Scanning ${candidates.length} elements...`, 'color: #38bdf8; font-weight: bold;');

            candidates.forEach((el, index) => {
                const res = this.inspectElement(el);
                if (res.status === 'PASS') {
                    results.passed++;
                } else if (res.status === 'SKIPPED_HIDDEN') {
                    results.skipped++;
                } else if (res.status === 'FAIL') {
                    results.failed++;
                    results.failures.push(res);
                    this.triggerAlert(res);
                }
            });

            console.log(`Scan Complete: ${results.passed} Passed, ${results.failed} Failed, ${results.skipped} Skipped.`);
            console.groupEnd();

            // Store summary in localStorage
            localStorage.setItem('WASEET_LAST_BUTTON_AUDIT', JSON.stringify(results));
            return results;
        }

        /**
         * Dispatches high-priority self-reporting alert via Webhook & API
         */
        async triggerAlert(failureData) {
            const el = failureData.element;
            const selector = failureData.selector || this.getElementSelector(el);
            const now = Date.now();

            // Anti-spam cooldown check
            const lastReported = this.reportedIncidents.get(selector);
            if (lastReported && (now - lastReported) < (this.config.cooldownSeconds * 1000)) {
                if (this.config.debugMode) console.warn(`[Alert Cooldown] Suppressing duplicate alert for ${selector}`);
                return null;
            }
            this.reportedIncidents.set(selector, now);

            const text = failureData.text || (el ? (el.innerText || el.textContent || '').trim() : '');
            const rect = el ? el.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 };

            // Build Ultra-Detailed Payload
            const payload = {
                alertType: 'BROKEN_BUTTON_DETECTED',
                severity: 'CRITICAL',
                timestamp: new Date().toISOString(),
                environment: this.config.environment,
                page: {
                    url: window.location.href,
                    pathname: window.location.pathname,
                    title: document.title,
                    userAgent: navigator.userAgent
                },
                element: {
                    tagName: el ? el.tagName : 'UNKNOWN',
                    id: el ? (el.id || null) : null,
                    classList: el ? Array.from(el.classList) : [],
                    selector: selector,
                    buttonText: text || '[No Text / Icon Button]',
                    htmlSnippet: el ? el.outerHTML.substring(0, 200) : null,
                    coordinates: {
                        top: Math.round(rect.top),
                        left: Math.round(rect.left),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    }
                },
                failure: {
                    code: failureData.failureCode,
                    title: failureData.failureTitle,
                    detailedReason: failureData.details,
                    blockingElement: failureData.blockingElement || null,
                    runtimeErrors: failureData.runtimeErrors || null
                },
                agentDispatch: {
                    summonTargets: ['AntiGravity (Principal AI)', 'OpenCode (First Assistant)'],
                    priority: 'IMMEDIATE_ACTION_REQUIRED',
                    suggestedFix: this.computeSuggestedFix(failureData)
                }
            };

            // 1. Output Eye-Catching Console Banner
            this.renderConsoleAlertBanner(payload);

            // 2. Add to Local Storage Queue for Agent Inspection
            this.recordToLocalQueue(payload);

            // 3. Dispatch Webhook & API Alerts
            await this.dispatchToWebhook(payload);
            await this.dispatchToApi(payload);

            // 4. Fire Custom DOM Event for Local Handlers / UI Notification
            window.dispatchEvent(new CustomEvent('waseet:broken-button-alert', { detail: payload }));

            return payload;
        }

        /**
         * Suggests exact actionable fix based on the failure code
         */
        computeSuggestedFix(failureData) {
            switch (failureData.failureCode) {
                case 'Z_INDEX_COVERED':
                    const blocker = failureData.blockingElement;
                    return `Adjust z-index of '${blocker ? blocker.selector : 'overlay'}' or add pointer-events: none to the overlay when inactive so clicks reach '${failureData.selector}'.`;
                case 'NO_EVENT_LISTENER':
                    return `Attach a click event handler (e.g. document.querySelector('${failureData.selector}').addEventListener('click', ...)) or provide an onclick attribute.`;
                case 'POINTER_EVENTS_DISABLED':
                    return `Remove 'pointer-events: none' from '${failureData.selector}' or its parent element.`;
                case 'CONSOLE_RUNTIME_ERROR':
                    return `Debug and resolve the runtime exception thrown in the click handler callback. Check stack trace in payload.`;
                default:
                    return `Inspect element binding and ensure proper event propagation.`;
            }
        }

        /**
         * Sends JSON payload to Webhook (supports Discord, Slack, and generic webhooks)
         */
        async dispatchToWebhook(payload) {
            const url = this.config.webhookUrl;
            if (!url) return;

            let bodyContent = null;

            // Auto-format for Discord Webhooks
            if (url.includes('discord.com/api/webhooks')) {
                bodyContent = JSON.stringify({
                    username: 'Waseet Self-Reporting Sentinel',
                    avatar_url: 'https://cdn-icons-png.flaticon.com/512/595/595067.png',
                    content: `🚨 **[استدعاء فوري: زر معطل في بيئة العمل]**\nموجه إلى: **AntiGravity** & **OpenCode (المساعد الأول)**`,
                    embeds: [{
                        title: `فشل الزر: ${payload.failure.title}`,
                        color: 15158332, // Red
                        fields: [
                            { name: '🌐 الصفحة (Page URL)', value: payload.page.url, inline: false },
                            { name: '🎯 المحدد (Selector)', value: `\`${payload.element.selector}\``, inline: true },
                            { name: '🏷️ نص الزر (Button Text)', value: payload.element.buttonText || 'بدون نص', inline: true },
                            { name: '⚠️ سبب الفشل الدقيق', value: payload.failure.detailedReason, inline: false },
                            { name: '🛠️ الحل المقترح (Suggested Fix)', value: payload.agentDispatch.suggestedFix, inline: false }
                        ],
                        footer: { text: `Waseet Automated Testing System • ${payload.timestamp}` }
                    }]
                });
            } else {
                // Standard Generic Webhook Payload
                bodyContent = JSON.stringify(payload);
            }

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: bodyContent,
                    mode: 'cors'
                });
                console.log(`%c[Webhook Dispatched]%c Sent to ${url} (Status: ${response.status})`, 'color: #10b981;', 'color: #94a3b8;');
            } catch (err) {
                // Fallback for local development or disconnected webhook
                console.warn(`[Webhook Dispatch Warning] Could not reach endpoint (${url}): ${err.message}. Payload stored in local queue.`);
            }
        }

        /**
         * Sends JSON payload to dedicated API Endpoint and Supabase table if available
         */
        async dispatchToApi(payload) {
            // 1. Direct Supabase Storage (if configured)
            try {
                let sb = null;
                if (typeof initWaseetSupabase === 'function') {
                    sb = initWaseetSupabase();
                } else if (window.waseetSupabaseClient) {
                    sb = window.waseetSupabaseClient;
                }

                if (sb && typeof sb.from === 'function') {
                    await sb.from('button_error_incidents').insert([{
                        page_url: payload.page.url,
                        page_pathname: payload.page.pathname,
                        page_title: payload.page.title,
                        selector: payload.element.selector,
                        button_id: payload.element.id,
                        button_class: (payload.element.classList || []).join(' '),
                        button_text: payload.element.buttonText,
                        failure_code: payload.failure.code,
                        failure_title: payload.failure.title,
                        detailed_reason: payload.failure.detailedReason,
                        blocking_element: payload.failure.blockingElement,
                        runtime_error: payload.failure.runtimeErrors,
                        agent_dispatch: payload.agentDispatch,
                        environment: payload.environment
                    }]);
                    console.log('%c[Supabase Alert Logged]%c Incident stored in public.button_error_incidents', 'color: #10b981;', 'color: #94a3b8;');
                }
            } catch (sbErr) {
                // Suppress if table does not exist or client not ready
            }

            // 2. HTTP API Endpoint Dispatch
            const endpoint = this.config.apiEndpoint;
            if (!endpoint || endpoint === this.config.webhookUrl) return;

            try {
                await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (e) {
                // Suppress network error in dev if endpoint is mock
            }
        }

        /**
         * Records incident into persistent local queue for agent retrieval
         */
        recordToLocalQueue(payload) {
            try {
                const existing = JSON.parse(localStorage.getItem('WASEET_BROKEN_BUTTONS_QUEUE') || '[]');
                existing.unshift(payload);
                // Keep last 50 incidents
                const trimmed = existing.slice(0, 50);
                localStorage.setItem('WASEET_BROKEN_BUTTONS_QUEUE', JSON.stringify(trimmed));
            } catch (e) {
                // Ignore storage quota
            }
        }

        /**
         * Formatted ANSI/CSS banner in console
         */
        renderConsoleAlertBanner(p) {
            console.log(
                `%c🚨 [SELF-REPORTING ERROR ALERT] Broken Button Detected!%c\n` +
                `%cElement:%c ${p.element.selector} ("${p.element.buttonText}")\n` +
                `%cPage:%c    ${p.page.url}\n` +
                `%cReason:%c  ${p.failure.detailedReason}\n` +
                `%cAction:%c  Dispatched to AntiGravity & OpenCode for immediate hotfix.`,
                'background: #ef4444; color: #fff; font-weight: bold; font-size: 14px; padding: 4px 8px; border-radius: 4px;',
                '',
                'font-weight: bold; color: #f59e0b;', 'color: #e2e8f0;',
                'font-weight: bold; color: #38bdf8;', 'color: #e2e8f0;',
                'font-weight: bold; color: #ef4444;', 'color: #fca5a5;',
                'font-weight: bold; color: #10b981;', 'color: #a7f3d0;'
            );
        }
    }

    // Auto-instantiate
    window.ButtonSelfReporter = ButtonSelfReporter;
    new ButtonSelfReporter();

})(window, document);
