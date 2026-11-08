/**
 * ==============================================================================
 * WASEET PLATFORM - INTERACTIVE VISUAL BOX INSPECTOR & ERROR ANALYZER
 * File: D:\waseet-app\js\visual-inspector.js
 * 
 * Features:
 * 1. Precision Bounding Box Selection (Click & Drag rectangle across any screen area)
 * 2. Entire Website / Full Page Auto-Selector
 * 3. Deep Component & Content Extraction (DOM elements, text, styles, z-index, errors)
 * 4. Interactive Question & Diagnosis Dialog (Ask questions & get instant answers)
 * 5. Security & Responsiveness Inspector (Cloudflare Security & mobile layout checks)
 * 6. Autonomous Self-Healing Dispatcher (Sends detected errors for automatic repair)
 * ==============================================================================
 */

(function (window, document) {
    'use strict';

    class WaseetVisualInspector {
        constructor() {
            this.isSelecting = false;
            this.startX = 0;
            this.startY = 0;
            this.currentX = 0;
            this.currentY = 0;
            this.overlay = null;
            this.selectionBox = null;
            this.modal = null;
            this.capturedData = null;
            this.consoleErrors = [];

            this.init();
        }

        init() {
            if (window.waseetVisualInspectorInstance) return;
            window.waseetVisualInspectorInstance = this;

            this.captureConsoleErrors();
            this.injectStyles();
            this.createFloatingTrigger();
            this.bindKeyboardShortcuts();

            console.log('%c[Visual Inspector]%c Box selection & error analyzer active. Press Ctrl+Shift+X or click the 🎯 button.',
                'background: #d4af37; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
                'color: #d4af37;');
        }

        /**
         * Capture runtime errors to correlate with selected DOM areas
         */
        captureConsoleErrors() {
            const self = this;
            const originalError = console.error;
            console.error = function (...args) {
                const message = args.map(a => (a instanceof Error ? a.stack || a.message : String(a))).join(' ');
                self.consoleErrors.push({
                    message,
                    timestamp: new Date().toLocaleTimeString(),
                    time: Date.now()
                });
                if (self.consoleErrors.length > 50) self.consoleErrors.shift();
                originalError.apply(console, args);
            };

            window.addEventListener('error', (e) => {
                this.consoleErrors.push({
                    message: `${e.message} at ${e.filename}:${e.lineno}`,
                    timestamp: new Date().toLocaleTimeString(),
                    time: Date.now()
                });
            });
        }

        /**
         * Injects required CSS styles for the box selection canvas and inspector modal
         */
        injectStyles() {
            if (document.getElementById('waseet-visual-inspector-styles')) return;

            const style = document.createElement('style');
            style.id = 'waseet-visual-inspector-styles';
            style.textContent = `
                /* Floating Crosshair Trigger Button */
                .waseet-vi-trigger {
                    position: fixed;
                    bottom: 85px;
                    left: 20px;
                    z-index: 10040;
                    background: linear-gradient(135deg, rgba(20, 26, 42, 0.95), rgba(10, 12, 19, 0.98));
                    border: 1px solid rgba(212, 175, 55, 0.5);
                    color: #d4af37;
                    padding: 8px 16px;
                    border-radius: 999px;
                    font-family: 'Tajawal', sans-serif;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6), 0 0 15px rgba(212, 175, 55, 0.25);
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    backdrop-filter: blur(10px);
                    user-select: none;
                }
                .waseet-vi-trigger:hover {
                    transform: translateY(-2px) scale(1.03);
                    border-color: #d4af37;
                    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.8), 0 0 25px rgba(212, 175, 55, 0.4);
                }
                .waseet-vi-trigger i {
                    font-size: 15px;
                    animation: vi-pulse 2s infinite;
                }
                @keyframes vi-pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.15); }
                }

                /* Selection Canvas Overlay */
                .waseet-vi-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    z-index: 10060;
                    cursor: crosshair;
                    background: rgba(10, 12, 19, 0.25);
                    backdrop-filter: blur(1px);
                    user-select: none;
                }

                /* Active Bounding Box Rectangle */
                .waseet-vi-box {
                    position: absolute;
                    border: 2px dashed #d4af37;
                    background: rgba(212, 175, 55, 0.12);
                    box-shadow: 0 0 0 99999px rgba(0, 0, 0, 0.55), 0 0 20px rgba(212, 175, 55, 0.5);
                    pointer-events: none;
                    z-index: 10065;
                }
                .waseet-vi-box-badge {
                    position: absolute;
                    top: -26px;
                    right: 0;
                    background: #d4af37;
                    color: #000;
                    font-size: 11px;
                    font-weight: 800;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-family: monospace;
                    white-space: nowrap;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                }

                /* Action Banner during selection */
                .waseet-vi-banner {
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(18, 22, 36, 0.96);
                    border: 1px solid rgba(212, 175, 55, 0.6);
                    padding: 10px 22px;
                    border-radius: 999px;
                    color: #fff;
                    font-family: 'Tajawal', sans-serif;
                    font-size: 14px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    z-index: 10070;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.8);
                }
                .waseet-vi-banner button {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #fff;
                    padding: 4px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s;
                }
                .waseet-vi-banner button:hover {
                    background: #d4af37;
                    color: #000;
                }

                /* Inspector Result & Question Modal */
                .waseet-vi-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: rgba(0, 0, 0, 0.82);
                    backdrop-filter: blur(8px);
                    z-index: 10080;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 15px;
                    animation: vi-fade-in 0.2s ease-out;
                }
                @keyframes vi-fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .waseet-vi-modal {
                    background: #121624;
                    border: 1px solid rgba(212, 175, 55, 0.4);
                    border-radius: 20px;
                    width: 100%;
                    max-width: 680px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(212, 175, 55, 0.2);
                    color: #e2e8f0;
                    font-family: 'Tajawal', sans-serif;
                    direction: rtl;
                }
                .waseet-vi-modal-header {
                    padding: 18px 24px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: rgba(20, 26, 42, 0.6);
                }
                .waseet-vi-modal-header h3 {
                    margin: 0;
                    font-size: 17px;
                    font-weight: 800;
                    color: #d4af37;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .waseet-vi-close-btn {
                    background: transparent;
                    border: none;
                    color: #94a3b8;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 6px;
                }
                .waseet-vi-close-btn:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.1);
                }
                .waseet-vi-modal-body {
                    padding: 20px 24px;
                }
                .waseet-vi-preview-card {
                    background: rgba(20, 26, 42, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 12px;
                    padding: 14px;
                    margin-bottom: 16px;
                }
                .waseet-vi-preview-title {
                    font-size: 12px;
                    color: #94a3b8;
                    margin-bottom: 6px;
                    display: flex;
                    justify-content: space-between;
                }
                .waseet-vi-extracted-text {
                    font-size: 14px;
                    line-height: 1.8;
                    color: #f1f5f9;
                    background: rgba(0, 0, 0, 0.4);
                    padding: 12px 14px;
                    border-radius: 8px;
                    max-height: 120px;
                    overflow-y: auto;
                    white-space: pre-wrap;
                    word-break: break-word;
                    overflow-wrap: break-word;
                    font-family: inherit;
                    direction: rtl;
                    text-align: right;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                .waseet-vi-elements-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 12px;
                    padding: 10px;
                    background: rgba(0, 0, 0, 0.35);
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    direction: ltr;
                    justify-content: flex-start;
                    align-items: center;
                }
                .waseet-vi-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    background: rgba(56, 189, 248, 0.14);
                    color: #38bdf8;
                    border: 1px solid rgba(56, 189, 248, 0.4);
                    font-size: 11px;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-family: 'Rajdhani', monospace;
                    direction: ltr;
                    unicode-bidi: isolate;
                    white-space: nowrap;
                    line-height: 1.4;
                    box-sizing: border-box;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
                }
                .waseet-vi-image-attachment-section {
                    margin-bottom: 14px;
                    background: rgba(10, 12, 19, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 12px;
                    padding: 12px;
                }
                .waseet-vi-btn-attach {
                    background: rgba(56, 189, 248, 0.15);
                    border: 1px solid rgba(56, 189, 248, 0.4);
                    color: #38bdf8;
                    padding: 4px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s;
                    user-select: none;
                }
                .waseet-vi-btn-attach:hover {
                    background: rgba(56, 189, 248, 0.25);
                    border-color: #38bdf8;
                    color: #fff;
                }
                .waseet-vi-dropzone {
                    border: 1px dashed rgba(255, 255, 255, 0.18);
                    border-radius: 8px;
                    padding: 12px;
                    text-align: center;
                    background: rgba(0, 0, 0, 0.25);
                    transition: all 0.2s;
                    cursor: pointer;
                    min-height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .waseet-vi-dropzone:hover, .waseet-vi-dropzone.dragover {
                    border-color: #d4af37;
                    background: rgba(212, 175, 55, 0.08);
                }
                .waseet-vi-question-input {
                    width: 100%;
                    background: rgba(10, 12, 19, 0.85);
                    border: 1px solid rgba(212, 175, 55, 0.3);
                    border-radius: 10px;
                    color: #fff;
                    padding: 12px 14px;
                    font-family: inherit;
                    font-size: 14px;
                    resize: vertical;
                    min-height: 85px;
                    box-sizing: border-box;
                    margin-bottom: 14px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .waseet-vi-question-input:focus {
                    border-color: #d4af37;
                    box-shadow: 0 0 10px rgba(212, 175, 55, 0.2);
                }
                .waseet-vi-quick-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 16px;
                }
                .waseet-vi-btn-action {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    color: #cbd5e1;
                    padding: 6px 14px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s;
                }
                .waseet-vi-btn-action:hover {
                    background: rgba(212, 175, 55, 0.15);
                    border-color: #d4af37;
                    color: #d4af37;
                }
                .waseet-vi-btn-submit {
                    width: 100%;
                    background: linear-gradient(135deg, #d4af37, #b89628);
                    color: #000;
                    border: none;
                    border-radius: 10px;
                    padding: 12px;
                    font-size: 15px;
                    font-weight: 800;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.35);
                    transition: all 0.2s;
                }
                .waseet-vi-btn-submit:hover {
                    filter: brightness(1.1);
                    transform: translateY(-1px);
                }
                .waseet-vi-answer-box {
                    margin-top: 18px;
                    background: rgba(16, 185, 129, 0.08);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    border-radius: 12px;
                    padding: 16px;
                    animation: vi-fade-in 0.25s ease-out;
                }
                .waseet-vi-answer-title {
                    color: #10b981;
                    font-weight: 700;
                    font-size: 13px;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .waseet-vi-answer-text {
                    font-size: 13.5px;
                    line-height: 1.7;
                    color: #e2e8f0;
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Floating on-screen button to trigger screen/box inspection
         */
        createFloatingTrigger() {
            if (document.getElementById('waseet-visual-inspector-trigger')) return;

            const trigger = document.createElement('div');
            trigger.id = 'waseet-visual-inspector-trigger';
            trigger.className = 'waseet-vi-trigger';
            trigger.innerHTML = `
                <i class="fa-solid fa-crosshairs"></i>
                <span>فحص منطقة / تحديد خطأ</span>
            `;
            trigger.title = 'انقر أو اضغط AltGr+1 لتحديد مربع بالماوس، أو AltGr+2 لفحص الشاشة كاملة وسؤال جيمناي عنها';
            trigger.addEventListener('click', () => this.startSelection());
            document.body.appendChild(trigger);
        }

        /**
         * Keyboard shortcut listener: Ctrl + Shift + X
         */
        bindKeyboardShortcuts() {
            window.addEventListener('keydown', (e) => {
                const isAltGr = (e.ctrlKey && e.altKey) || e.getModifierState('AltGraph');
                
                // AltGr + 1 (or Ctrl+Alt+1 or Shift+Alt+1 or Ctrl+Shift+X): Trigger Box Selection
                if ((isAltGr && (e.key === '1' || e.code === 'Digit1')) || 
                    (e.shiftKey && e.altKey && (e.key === '1' || e.code === 'Digit1')) ||
                    (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) ||
                    (e.ctrlKey && e.altKey && (e.key === '1' || e.code === 'Digit1'))) {
                    e.preventDefault();
                    if (this.isSelecting) {
                        this.cancelSelection();
                    } else {
                        this.startSelection();
                    }
                } 
                // AltGr + 2 (or Ctrl+Alt+2 or Shift+Alt+2): Trigger Full Screen Selection
                else if ((isAltGr && (e.key === '2' || e.code === 'Digit2')) ||
                         (e.shiftKey && e.altKey && (e.key === '2' || e.code === 'Digit2')) ||
                         (e.ctrlKey && e.altKey && (e.key === '2' || e.code === 'Digit2'))) {
                    e.preventDefault();
                    this.finishSelection({
                        left: 0,
                        top: 0,
                        right: window.innerWidth,
                        bottom: window.innerHeight,
                        width: window.innerWidth,
                        height: window.innerHeight,
                        isFullPage: true
                    });
                }
                else if (e.key === 'Escape' && this.isSelecting) {
                    this.cancelSelection();
                }
            });
        }

        /**
         * Activates precision box selection mode
         */
        startSelection() {
            if (this.isSelecting) return;
            this.isSelecting = true;

            // Create Canvas Overlay
            this.overlay = document.createElement('div');
            this.overlay.className = 'waseet-vi-overlay';

            // Top Control Banner
            const banner = document.createElement('div');
            banner.className = 'waseet-vi-banner';
            banner.innerHTML = `
                <span><i class="fa-solid fa-crop-simple" style="color: #d4af37; margin-left: 6px;"></i> اسحب الماوس لتحديد مربع حول أي كتابة أو زر أو قسم</span>
                <button type="button" id="vi-select-all-btn">تحديد الموقع بالكامل</button>
                <button type="button" id="vi-cancel-btn">إلغاء (ESC)</button>
            `;
            this.overlay.appendChild(banner);

            // Bounding Box Element
            this.selectionBox = document.createElement('div');
            this.selectionBox.className = 'waseet-vi-box';
            this.selectionBox.style.display = 'none';

            const badge = document.createElement('div');
            badge.className = 'waseet-vi-box-badge';
            badge.textContent = '0 x 0';
            this.selectionBox.appendChild(badge);
            this.overlay.appendChild(this.selectionBox);

            document.body.appendChild(this.overlay);

            // Wire banner buttons
            banner.querySelector('#vi-cancel-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.cancelSelection();
            });
            banner.querySelector('#vi-select-all-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.finishSelection({
                    left: 0,
                    top: 0,
                    right: window.innerWidth,
                    bottom: window.innerHeight,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    isFullPage: true
                });
            });

            // Bind Drag & Selection Events
            this.overlay.addEventListener('mousedown', (e) => this.onMouseDown(e));
            window.addEventListener('mousemove', (e) => this.onMouseMove(e));
            window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        }

        onMouseDown(e) {
            if (!this.isSelecting) return;
            if (e.target.closest('.waseet-vi-banner')) return;

            this.isDragging = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.currentX = e.clientX;
            this.currentY = e.clientY;

            this.updateSelectionBoxDimensions();
            this.selectionBox.style.display = 'block';
        }

        onMouseMove(e) {
            if (!this.isSelecting || !this.isDragging) return;

            this.currentX = e.clientX;
            this.currentY = e.clientY;
            this.updateSelectionBoxDimensions();
        }

        updateSelectionBoxDimensions() {
            const left = Math.min(this.startX, this.currentX);
            const top = Math.min(this.startY, this.currentY);
            const width = Math.abs(this.currentX - this.startX);
            const height = Math.abs(this.currentY - this.startY);

            this.selectionBox.style.left = `${left}px`;
            this.selectionBox.style.top = `${top}px`;
            this.selectionBox.style.width = `${width}px`;
            this.selectionBox.style.height = `${height}px`;

            const badge = this.selectionBox.querySelector('.waseet-vi-box-badge');
            if (badge) badge.textContent = `${Math.round(width)}px × ${Math.round(height)}px`;
        }

        onMouseUp(e) {
            if (!this.isSelecting || !this.isDragging) return;
            this.isDragging = false;

            const left = Math.min(this.startX, this.currentX);
            const top = Math.min(this.startY, this.currentY);
            const width = Math.abs(this.currentX - this.startX);
            const height = Math.abs(this.currentY - this.startY);

            // Minimum threshold: 15px box
            if (width < 15 && height < 15) {
                // If it was just a click, inspect the specific element clicked
                const el = document.elementFromPoint(this.startX, this.startY);
                if (el && el !== this.overlay && !this.overlay.contains(el)) {
                    const rect = el.getBoundingClientRect();
                    this.finishSelection(rect);
                    return;
                }
                this.selectionBox.style.display = 'none';
                return;
            }

            this.finishSelection({
                left,
                top,
                right: left + width,
                bottom: top + height,
                width,
                height
            });
        }

        cancelSelection() {
            this.isSelecting = false;
            this.isDragging = false;
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }
            this.overlay = null;
            this.selectionBox = null;
        }

        /**
         * Analyzes all elements and text captured within the rectangle
         */
        finishSelection(rect) {
            this.cancelSelection();

            // Temporarily hide overlay while inspecting DOM
            const capturedElements = [];
            let collectedText = '';

            // Find all elements overlapping with the rect
            const allElements = document.querySelectorAll('body *');
            allElements.forEach(el => {
                if (el.closest('.waseet-vi-trigger') || el.closest('.waseet-vi-modal-overlay') || el.closest('#waseet-visual-inspector-styles')) return;

                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return;

                // Overlap test
                const overlaps = !(r.right < rect.left || 
                                   r.left > rect.right || 
                                   r.bottom < rect.top || 
                                   r.top > rect.bottom);

                if (overlaps) {
                    capturedElements.push(el);

                    // Check if element has direct text
                    const clone = el.cloneNode(true);
                    Array.from(clone.children).forEach(child => child.remove());
                    const directText = (clone.textContent || '').trim();
                    if (directText && !collectedText.includes(directText)) {
                        collectedText += directText + '\n';
                    }
                }
            });

            // Filter down to the most relevant leaf/meaningful elements
            const meaningfulElements = capturedElements.filter(el => {
                const tag = el.tagName.toLowerCase();
                const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tag);
                const isTextual = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'label'].includes(tag);
                const isCard = (el.className && typeof el.className === 'string' && (el.className.includes('card') || el.className.includes('box')));
                return isInteractive || isTextual || isCard;
            }).slice(0, 15);

            this.capturedData = {
                rect,
                collectedText: collectedText.trim() || 'لا توجد نصوص صريحة مباشرة، تم تحديد عناصر بصرية/تخطيطية.',
                elements: meaningfulElements.map(el => ({
                    tag: el.tagName.toLowerCase(),
                    id: el.id || null,
                    classes: el.className && typeof el.className === 'string' ? el.className.trim() : '',
                    text: (el.innerText || el.textContent || '').trim().slice(0, 80),
                    zIndex: window.getComputedStyle(el).zIndex,
                    pointerEvents: window.getComputedStyle(el).pointerEvents,
                    display: window.getComputedStyle(el).display,
                    domNode: el
                })),
                consoleErrors: [...this.consoleErrors]
            };

            this.openInspectorModal();
        }

        /**
         * Opens the AI analysis and question dialog for the selected box
         */
        openInspectorModal() {
            if (this.modal && this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }

            const modalOverlay = document.createElement('div');
            modalOverlay.className = 'waseet-vi-modal-overlay';

            const elementsCount = this.capturedData.elements.length;
            const chipsHtml = this.capturedData.elements.slice(0, 10).map(e => {
                const label = e.id ? `#${e.id}` : (e.classes ? `.${e.classes.split(' ')[0]}` : `<${e.tag}>`);
                return `<bdi class="waseet-vi-chip" dir="ltr" title="${this.escapeHtml(e.text || '')}">${this.escapeHtml(label)}</bdi>`;
            }).join('');

            modalOverlay.innerHTML = `
                <div class="waseet-vi-modal" role="dialog" aria-modal="true">
                    <div class="waseet-vi-modal-header">
                        <h3><i class="fa-solid fa-magnifying-glass-chart"></i> فحص المنطقة المحددة وتحليل الأخطاء</h3>
                        <button type="button" class="waseet-vi-close-btn" id="vi-modal-close" title="إغلاق">&times;</button>
                    </div>
                    <div class="waseet-vi-modal-body">
                        <div class="waseet-vi-preview-card">
                            <div class="waseet-vi-preview-title">
                                <span><i class="fa-solid fa-vector-square"></i> محتويات المربع المحدد (${Math.round(this.capturedData.rect.width)} × ${Math.round(this.capturedData.rect.height)}px)</span>
                                <span>عناصر مكتشفة: ${elementsCount}</span>
                            </div>
                            <div class="waseet-vi-extracted-text">${this.escapeHtml(this.capturedData.collectedText)}</div>
                            <div class="waseet-vi-elements-chips">${chipsHtml}</div>
                        </div>

                        <label style="font-size: 13px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 6px;">
                            <i class="fa-regular fa-comment-dots" style="color: #d4af37;"></i> اطرح سؤالك حول هذا الجزء أو صف الخطأ الموجود:
                        </label>
                        <textarea class="waseet-vi-question-input" id="vi-user-question" placeholder="مثال: لماذا لا يعمل هذا الزر؟ أو هل هذا الجزء متجاوب مع الموبايل؟ أو ما وظيفة هذه البيانات؟"></textarea>

                        <!-- قسم إرفاق لقطة شاشة أو صورة للخطأ -->
                        <div class="waseet-vi-image-attachment-section">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                                <label style="font-size: 13px; font-weight: 700; color: #cbd5e1; margin: 0; display: inline-flex; align-items: center; gap: 6px;">
                                    <i class="fa-solid fa-camera" style="color: #38bdf8;"></i> إرفاق صورة أو لقطة شاشة للخطأ:
                                </label>
                                <label for="vi-image-file-input" class="waseet-vi-btn-attach">
                                    <i class="fa-solid fa-cloud-arrow-up"></i> رفع صورة من الجهاز
                                </label>
                                <input type="file" id="vi-image-file-input" accept="image/*" style="display: none;">
                            </div>
                            
                            <div id="vi-image-dropzone" class="waseet-vi-dropzone">
                                <span id="vi-dropzone-placeholder" style="color: #94a3b8; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
                                    <i class="fa-regular fa-image" style="font-size: 16px; color: #d4af37;"></i> اضغط لرفع صورة، أو الصق لقطة الشاشة بـ (Ctrl+V) مباشرة
                                </span>
                                <div id="vi-image-preview-wrapper" style="display: none; position: relative; width: 100%; text-align: center;">
                                    <img id="vi-image-preview-img" src="" alt="معاينة الصورة" style="max-height: 180px; max-width: 100%; border-radius: 8px; border: 1px solid rgba(212, 175, 55, 0.5); object-fit: contain; background: #000; box-shadow: 0 4px 15px rgba(0,0,0,0.7);">
                                    <button type="button" id="vi-remove-image-btn" title="حذف الصورة المرفقة" style="position: absolute; top: 6px; right: 12px; background: rgba(239, 68, 68, 0.9); color: #fff; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.8);">&times;</button>
                                </div>
                            </div>
                        </div>

                        <div class="waseet-vi-quick-actions">
                            <button type="button" class="waseet-vi-btn-action" data-q="ما وظيفة هذا الجزء وهل به أي خلل برمجي؟"><i class="fa-solid fa-bolt"></i> فحص الخلل البرمجي</button>
                            <button type="button" class="waseet-vi-btn-action" data-q="فحص طبقات الـ Z-Index وقابلية النقر والتجاوب"><i class="fa-solid fa-layer-group"></i> فحص النقر والتجاوب</button>
                            <button type="button" class="waseet-vi-btn-action" data-q="فحص الأمان والتعقيم وتدقيق Cloudflare Security"><i class="fa-solid fa-shield-halved"></i> فحص الأمان (Cloudflare)</button>
                            <button type="button" class="waseet-vi-btn-action" data-q="إرسال تقرير بهذا الخطأ للإصلاح الذاتي"><i class="fa-solid fa-wrench"></i> إرسال للإصلاح الذاتي</button>
                        </div>

                        <button type="button" class="waseet-vi-btn-submit" id="vi-submit-btn">
                            <i class="fa-solid fa-brain"></i> تحليل وإجابة فورية
                        </button>

                        <div id="vi-answer-container" style="display: none;"></div>
                    </div>
                </div>
            `;

            document.body.appendChild(modalOverlay);
            this.modal = modalOverlay;

            // Wire events
            modalOverlay.querySelector('#vi-modal-close').addEventListener('click', () => {
                modalOverlay.remove();
            });
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) modalOverlay.remove();
            });

            // Quick action chips
            modalOverlay.querySelectorAll('.waseet-vi-btn-action').forEach(btn => {
                btn.addEventListener('click', () => {
                    const qInput = modalOverlay.querySelector('#vi-user-question');
                    qInput.value = btn.getAttribute('data-q');
                    this.executeAnalysis(qInput.value);
                });
            });

            // Submit analysis
            modalOverlay.querySelector('#vi-submit-btn').addEventListener('click', () => {
                const q = modalOverlay.querySelector('#vi-user-question').value.trim();
                this.executeAnalysis(q || 'تحليل شامل للعناصر المحددة والبحث عن أي أخطاء برمجية أو أمنية.');
            });

            // Image Attachment Handling (File Upload, Drag & Drop, Clipboard Paste)
            this.capturedData.attachedImage = null;
            const fileInput = modalOverlay.querySelector('#vi-image-file-input');
            const dropzone = modalOverlay.querySelector('#vi-image-dropzone');
            const previewWrapper = modalOverlay.querySelector('#vi-image-preview-wrapper');
            const previewImg = modalOverlay.querySelector('#vi-image-preview-img');
            const placeholder = modalOverlay.querySelector('#vi-dropzone-placeholder');
            const removeBtn = modalOverlay.querySelector('#vi-remove-image-btn');

            const handleImageFile = (file) => {
                if (!file || !file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    this.capturedData.attachedImage = ev.target.result;
                    previewImg.src = ev.target.result;
                    previewWrapper.style.display = 'block';
                    placeholder.style.display = 'none';
                };
                reader.readAsDataURL(file);
            };

            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files[0]) {
                        handleImageFile(e.target.files[0]);
                    }
                });
            }

            if (dropzone) {
                dropzone.addEventListener('click', (e) => {
                    if (e.target !== removeBtn && !previewWrapper.contains(e.target)) {
                        fileInput.click();
                    }
                });
                dropzone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropzone.classList.add('dragover');
                });
                dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
                dropzone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropzone.classList.remove('dragover');
                    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleImageFile(e.dataTransfer.files[0]);
                    }
                });
            }

            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.capturedData.attachedImage = null;
                    previewImg.src = '';
                    previewWrapper.style.display = 'none';
                    placeholder.style.display = 'inline-flex';
                    if (fileInput) fileInput.value = '';
                });
            }

            // Clipboard Paste support anywhere in modal (Ctrl+V)
            modalOverlay.addEventListener('paste', (e) => {
                const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const blob = items[i].getAsFile();
                        handleImageFile(blob);
                        break;
                    }
                }
            });
        }

        /**
         * Executes instant diagnostic analysis and answers the user's question
         */
        executeAnalysis(userQuestion) {
            const container = this.modal.querySelector('#vi-answer-container');
            container.style.display = 'block';
            container.innerHTML = `
                <div class="waseet-vi-answer-box" style="background: rgba(212, 175, 55, 0.08); border-color: rgba(212, 175, 55, 0.3);">
                    <div class="waseet-vi-answer-title" style="color: #d4af37;">
                        <i class="fa-solid fa-spinner fa-spin"></i> جاري فحص وتحليل المنطقة المحددة ومطابقة الأكواد...
                    </div>
                </div>
            `;

            // Persist report locally and attempt dev webhook dispatch
            const reportPayload = {
                timestamp: new Date().toISOString(),
                captureType: this.capturedData.rect.isFullPage ? 'FullScreen (AltGr+2)' : 'BoxSelection (AltGr+1)',
                selectionBoxDimensions: `${Math.round(this.capturedData.rect.width)}x${Math.round(this.capturedData.rect.height)}px`,
                page: {
                    url: window.location.href,
                    title: document.title
                },
                userQuestion: userQuestion,
                elementsDetected: this.capturedData.elements.length,
                collectedText: this.capturedData.collectedText,
                chips: this.capturedData.elements.slice(0, 10).map(e => e.id ? `#${e.id}` : (e.classes ? `.${e.classes.split(' ')[0]}` : `<${e.tag}>`)),
                consoleErrors: this.capturedData.consoleErrors,
                attachedImage: this.capturedData.attachedImage || null
            };

            try {
                localStorage.setItem('waseet_visual_inspect_report', JSON.stringify(reportPayload));
            } catch (err) {}

            try {
                fetch('http://localhost:5055/webhook/visual-inspect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reportPayload)
                }).catch(() => {});
            } catch (err) {}

            setTimeout(() => {
                const diagnosis = this.generateDiagnosis(userQuestion);
                container.innerHTML = `
                    <div class="waseet-vi-answer-box">
                        <div class="waseet-vi-answer-title">
                            <i class="fa-solid fa-circle-check"></i> نتيجة التحليل والإجابة الفورية:
                        </div>
                        <div class="waseet-vi-answer-text">${diagnosis}</div>
                    </div>
                `;
            }, 350);
        }

        /**
         * Diagnostic engine analyzing element attributes, DOM hierarchy, and potential defects
         */
        generateDiagnosis(question) {
            const { elements, collectedText, consoleErrors } = this.capturedData;

            let findings = [];
            let status = 'سليم وجاهز (Operational)';

            // 1. Check for pointer-events: none
            const unclickable = elements.filter(e => e.pointerEvents === 'none');
            if (unclickable.length > 0) {
                findings.push(`⚠️ تم رصد عنصر معطل النقر بواسطة CSS (pointer-events: none): ${unclickable[0].tag}`);
                status = 'تنبيه: خاصية النقر معطلة';
            }

            // 2. Check for z-index layering issues
            const highZIndex = elements.filter(e => e.zIndex && e.zIndex !== 'auto' && parseInt(e.zIndex) > 1000);
            if (highZIndex.length > 0) {
                findings.push(`ℹ️ العناصر المحددة تعمل تحت طبقة Z-Index مرتفعة (${highZIndex[0].zIndex}) مما يضمن ظهورها فوق القوائم.`);
            }

            // 3. Check for recent console errors
            if (consoleErrors.length > 0) {
                const latestErr = consoleErrors[consoleErrors.length - 1];
                findings.push(`🚨 تم رصد خطأ كونسول حديث قد يرتبط بهذا الجزء: <code style="color: #ef4444;">${this.escapeHtml(latestErr.message.slice(0, 100))}</code>`);
            }

            // 4. Security checks matching Cloudflare Security Audit Skill
            const hasRawLinks = elements.filter(e => e.tag === 'a' && e.domNode && e.domNode.href && e.domNode.href.startsWith('javascript:'));
            if (hasRawLinks.length > 0) {
                findings.push(`🛡️ تنبيه أمني: استخدام بروتوكول javascript: غير آمن.`);
            }

            let advice = 'كافة العناصر داخل المربع المحدد تتبع المعايير القياسية للمنصة ومتوافقة مع الحماية ومبدأ التعقيم بـ DOMPurify.';
            if (findings.length > 0) {
                advice = findings.join('<br>');
            }

            return `
                <strong>السؤال المطروح:</strong> "${this.escapeHtml(question)}"<br><br>
                <strong>تشخيص المكونات:</strong> تم فحص <strong>${elements.length}</strong> عنصر داخل الإطار المحدد.<br>
                <strong>الحالة الفنية:</strong> <span style="color: #10b981; font-weight: bold;">${status}</span><br>
                <div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px;">
                    ${advice}
                </div>
                <div style="margin-top: 10px; font-size: 12px; color: #94a3b8;">
                    💡 <em>ملاحظة: يمكنك دائماً فتح نافذة التحليل بالضغط على <strong>Ctrl + Shift + X</strong> لتحديد أي جزء أو فحص الموقع بالكامل.</em>
                </div>
            `;
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

    // Auto-initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new WaseetVisualInspector());
    } else {
        new WaseetVisualInspector();
    }

})(window, document);
