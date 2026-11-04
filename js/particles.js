/**
 * WASEET (وسيط) - Luxury Frontend Motion & Visual Engine
 * 1) GSAP Anti-Gravity Levitation Engine (Logos, Badges, Store Cards, Regional Broker Cards)
 * 2) Lenis Smooth Scroll (darkroom.engineering) synchronized with GSAP Ticker & ScrollTrigger
 * 3) React Bits Dark Luxury Backgrounds (Aurora Beams + Interactive Squares Grid + Particles + SpotlightCard)
 */

(function () {
    'use strict';

    /* ==========================================================================
       1. DYNAMIC LOADER FOR GSAP, SCROLLTRIGGER & LENIS (Local Vendor + CDN Fallback)
       ========================================================================== */
    function loadScriptSequential(urls) {
        return new Promise((resolve) => {
            let idx = 0;
            function tryNext() {
                if (idx >= urls.length) {
                    resolve(false);
                    return;
                }
                const s = document.createElement('script');
                s.src = urls[idx++];
                s.async = false;
                s.onload = () => resolve(true);
                s.onerror = () => tryNext();
                document.head.appendChild(s);
            }
            tryNext();
        });
    }

    async function ensureMotionLibraries() {
        if (typeof window.gsap === 'undefined') {
            await loadScriptSequential([
                'js/vendor/gsap.min.js',
                'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'
            ]);
        }
        if (typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger === 'undefined') {
            await loadScriptSequential([
                'js/vendor/ScrollTrigger.min.js',
                'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js'
            ]);
        }
        if (typeof window.Lenis === 'undefined') {
            await loadScriptSequential([
                'js/vendor/lenis.min.js',
                'https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js',
                'https://unpkg.com/lenis@1.1.20/dist/lenis.min.js'
            ]);
        }
        if (typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined') {
            try {
                window.gsap.registerPlugin(window.ScrollTrigger);
            } catch (e) {}
        }
    }

    /* ==========================================================================
       2. REACT BITS DARK LUXURY BACKGROUND (Aurora + Interactive Squares + Particles)
       ========================================================================== */
    function injectReactBitsAurora() {
        if (document.getElementById('react-bits-aurora-bg')) return;
        const aurora = document.createElement('div');
        aurora.id = 'react-bits-aurora-bg';
        aurora.setAttribute('aria-hidden', 'true');
        aurora.innerHTML = `
            <div class="rb-aurora-beam beam-gold"></div>
            <div class="rb-aurora-beam beam-ember"></div>
            <div class="rb-aurora-beam beam-emerald"></div>
        `;
        document.body.insertBefore(aurora, document.body.firstChild);

        if (typeof window.gsap !== 'undefined') {
            const gsap = window.gsap;
            gsap.to('#react-bits-aurora-bg .beam-gold', {
                x: -60,
                y: 45,
                scale: 1.12,
                duration: 9,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1
            });
            gsap.to('#react-bits-aurora-bg .beam-ember', {
                x: 55,
                y: -40,
                scale: 1.15,
                duration: 11,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1
            });
            gsap.to('#react-bits-aurora-bg .beam-emerald', {
                x: -35,
                y: -30,
                scale: 1.08,
                duration: 13,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1
            });
        }
    }

    class WaseetBackground {
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) {
                this.canvas = document.createElement('canvas');
                this.canvas.id = canvasId;
                this.canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0;';
                document.body.insertBefore(this.canvas, document.body.firstChild);
            }
            this.ctx = this.canvas.getContext('2d');

            this.particles = [];
            this.numParticles = window.innerWidth <= 768 ? 28 : 48;
            this.squareSize = 68;
            this.hoveredSquares = new Map();
            this.mouse = { x: -1000, y: -1000, rawX: -1000, rawY: -1000, targetX: 0, targetY: 0 };
            this.time = 0;

            this.resize();
            this.initParticles();
            this.bindEvents();
            this.animate();
        }

        resize() {
            this.width = this.canvas.width = window.innerWidth;
            this.height = this.canvas.height = window.innerHeight;
        }

        initParticles() {
            this.particles = [];
            for (let i = 0; i < this.numParticles; i++) {
                this.particles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    size: Math.random() * 2.4 + 0.9,
                    speedY: Math.random() * 0.42 + 0.15,
                    speedX: (Math.random() - 0.5) * 0.28,
                    baseAlpha: Math.random() * 0.5 + 0.2,
                    colorType: Math.random() > 0.35 ? 'gold' : (Math.random() > 0.5 ? 'orange' : 'emerald'),
                    floatOffset: Math.random() * Math.PI * 2,
                    depth: Math.random() * 0.8 + 0.2
                });
            }
        }

        bindEvents() {
            window.addEventListener('resize', () => {
                this.resize();
                this.initParticles();
            });

            window.addEventListener('mousemove', (e) => {
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                this.mouse.rawX = e.clientX;
                this.mouse.rawY = e.clientY;
                this.mouse.targetX = ((e.clientX - centerX) / centerX) * 32;
                this.mouse.targetY = ((e.clientY - centerY) / centerY) * 32;

                // React Bits Interactive Squares cell highlight
                const col = Math.floor(e.clientX / this.squareSize);
                const row = Math.floor(e.clientY / this.squareSize);
                const key = `${col}:${row}`;
                this.hoveredSquares.set(key, { col, row, alpha: 0.24 });
            }, { passive: true });
        }

        animate() {
            requestAnimationFrame(() => this.animate());
            if (document.hidden) return;
            this.time += 0.015;

            this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
            this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

            this.ctx.clearRect(0, 0, this.width, this.height);

            // Subtle ambient radial spotlight
            const bgGradient = this.ctx.createRadialGradient(
                this.width / 2 + this.mouse.x * 0.5,
                this.height / 3 + this.mouse.y * 0.5,
                50,
                this.width / 2,
                this.height / 2,
                Math.max(this.width, this.height) * 0.8
            );
            bgGradient.addColorStop(0, 'rgba(217, 83, 15, 0.07)');
            bgGradient.addColorStop(0.5, 'rgba(197, 160, 89, 0.04)');
            bgGradient.addColorStop(1, 'rgba(7, 8, 12, 0)');
            this.ctx.fillStyle = bgGradient;
            this.ctx.fillRect(0, 0, this.width, this.height);

            // React Bits Squares Grid + Interactive Cell Trails
            this.drawReactBitsSquaresGrid();

            // Anti-Gravity Floating Particles + Constellation Links
            const renderedPoints = [];
            for (let p of this.particles) {
                p.y -= p.speedY;
                p.x += Math.sin(this.time + p.floatOffset) * 0.38 + p.speedX;

                if (p.y < -10) {
                    p.y = this.height + 10;
                    p.x = Math.random() * this.width;
                }
                if (p.x < -10) p.x = this.width + 10;
                if (p.x > this.width + 10) p.x = -10;

                const renderX = p.x + this.mouse.x * p.depth;
                const renderY = p.y + this.mouse.y * p.depth;
                renderedPoints.push({ x: renderX, y: renderY, colorType: p.colorType });

                const alpha = p.baseAlpha * (0.6 + 0.4 * Math.sin(this.time * 2 + p.floatOffset));
                this.ctx.beginPath();
                this.ctx.arc(renderX, renderY, p.size, 0, Math.PI * 2);

                if (p.colorType === 'orange') {
                    this.ctx.fillStyle = `rgba(234, 88, 12, ${alpha})`;
                    this.ctx.shadowColor = 'rgba(234, 88, 12, 0.75)';
                } else if (p.colorType === 'emerald') {
                    this.ctx.fillStyle = `rgba(16, 185, 129, ${alpha * 0.85})`;
                    this.ctx.shadowColor = 'rgba(16, 185, 129, 0.65)';
                } else {
                    this.ctx.fillStyle = `rgba(212, 175, 55, ${alpha})`;
                    this.ctx.shadowColor = 'rgba(212, 175, 55, 0.8)';
                }
                this.ctx.shadowBlur = 7;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }

            // React Bits Constellation connection lines near cursor
            if (this.mouse.rawX > 0 && window.innerWidth > 768) {
                for (let i = 0; i < renderedPoints.length; i++) {
                    const pt = renderedPoints[i];
                    const dx = pt.x - this.mouse.rawX;
                    const dy = pt.y - this.mouse.rawY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 145) {
                        const lineAlpha = (1 - dist / 145) * 0.18;
                        this.ctx.strokeStyle = `rgba(212, 175, 55, ${lineAlpha})`;
                        this.ctx.lineWidth = 0.8;
                        this.ctx.beginPath();
                        this.ctx.moveTo(pt.x, pt.y);
                        this.ctx.lineTo(this.mouse.rawX, this.mouse.rawY);
                        this.ctx.stroke();
                    }
                }
            }
        }

        drawReactBitsSquaresGrid() {
            const step = this.squareSize;
            this.ctx.strokeStyle = 'rgba(197, 160, 89, 0.024)';
            this.ctx.lineWidth = 1;

            for (let x = 0; x < this.width; x += step) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.height);
                this.ctx.stroke();
            }
            for (let y = 0; y < this.height; y += step) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.width, y);
                this.ctx.stroke();
            }

            // Fade & render interactive React Bits square trails
            this.hoveredSquares.forEach((cell, key) => {
                cell.alpha -= 0.006;
                if (cell.alpha <= 0.005) {
                    this.hoveredSquares.delete(key);
                    return;
                }
                const x = cell.col * step;
                const y = cell.row * step;
                this.ctx.fillStyle = `rgba(197, 160, 89, ${cell.alpha * 0.32})`;
                this.ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
                this.ctx.strokeStyle = `rgba(212, 175, 55, ${cell.alpha})`;
                this.ctx.strokeRect(x + 0.5, y + 0.5, step - 1, step - 1);
            });
        }
    }

    /* ==========================================================================
       3. LENIS SMOOTH SCROLL (darkroom.engineering) + GSAP TICKER SYNC
       ========================================================================== */
    function initLenisSmoothScroll() {
        if (window.waseetLenis) return window.waseetLenis;
        if (typeof window.Lenis === 'undefined') return null;

        // Avoid enabling wheel hijack on dedicated full-screen chat rooms where inner container scrolls
        const isChatPage = /chat\.html|admin-chats\.html/i.test(window.location.pathname);
        if (isChatPage) return null;

        try {
            // Mark scrollable modals & drawers with data-lenis-prevent
            const markPreventContainers = () => {
                document.querySelectorAll(
                    '.modal-box, .mobile-drawer, .mobile-drawer-sidebar, .chat-messages, .support-chat-messages, #pending-accounts-list-container'
                ).forEach((el) => {
                    if (!el.hasAttribute('data-lenis-prevent')) {
                        el.setAttribute('data-lenis-prevent', 'true');
                    }
                });
            };
            markPreventContainers();

            const lenis = new window.Lenis({
                autoRaf: typeof window.gsap === 'undefined',
                duration: 1.12,
                easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                smoothWheel: true,
                wheelMultiplier: 1.0,
                touchMultiplier: 1.5
            });

            window.waseetLenis = lenis;

            // Synchronize Lenis with GSAP Ticker & ScrollTrigger per official darkroom.engineering docs
            if (typeof window.gsap !== 'undefined') {
                if (typeof window.ScrollTrigger !== 'undefined') {
                    lenis.on('scroll', window.ScrollTrigger.update);
                }
                window.gsap.ticker.add((time) => {
                    lenis.raf(time * 1000);
                });
                window.gsap.ticker.lagSmoothing(0);
            }

            // Smooth anchor scrolling (#marketplace, #how-it-works, etc.)
            document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
                if (anchor.dataset.lenisBound === 'true') return;
                anchor.dataset.lenisBound = 'true';
                anchor.addEventListener('click', (e) => {
                    const href = anchor.getAttribute('href');
                    if (!href || href === '#') return;
                    const target = document.querySelector(href);
                    if (target) {
                        e.preventDefault();
                        lenis.scrollTo(target, { offset: -80, duration: 1.15 });
                    }
                });
            });

            return lenis;
        } catch (err) {
            console.warn('[Lenis Smooth Scroll] Init warning:', err);
            return null;
        }
    }

    /* ==========================================================================
       4. GSAP ANTI-GRAVITY LEVITATION & REACT BITS SPOTLIGHT CARDS
       ========================================================================== */
    function applyGsapAntiGravity() {
        // Bind React Bits SpotlightCard mouse tracker even if GSAP is still loading
        const spotlightCards = document.querySelectorAll(
            '.account-card, .store-broker-card, .stat-card, .step-card, .broker-stat-card'
        );
        spotlightCards.forEach((card) => {
            if (card.dataset.rbSpotlightBound === 'true') return;
            card.dataset.rbSpotlightBound = 'true';
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty('--spotlight-x', `${x}px`);
                card.style.setProperty('--spotlight-y', `${y}px`);
            }, { passive: true });
        });

        if (typeof window.gsap === 'undefined') return;
        const gsap = window.gsap;
        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        // 4.1 Anti-Gravity on Brand Logos, Hero Badges & Floating Icons
        const logoElements = document.querySelectorAll(
            '.brand-logo-badge, .hero-badge, .mediator-floating-badge, .store-broker-flag-icon, .broker-stat-icon, .empty-deals-box i'
        );
        logoElements.forEach((el, idx) => {
            if (el.dataset.gsapAntigravity === 'true') return;
            el.dataset.gsapAntigravity = 'true';
            el.classList.add('gsap-antigravity-logo');

            gsap.to(el, {
                y: -5.5,
                rotation: idx % 2 === 0 ? 1.4 : -1.4,
                duration: 2.4 + (idx % 3) * 0.4,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1,
                delay: (idx % 5) * 0.18,
                force3D: true
            });
        });

        // 4.2 Anti-Gravity Wave on Store Cards, Regional Broker Cards, Stat Cards & Step Cards
        const cardElements = document.querySelectorAll(
            '.account-card, .store-broker-card, .stat-card, .step-card, .broker-stat-card'
        );
        const isDesktop = window.innerWidth > 768 && !('ontouchstart' in window);

        cardElements.forEach((card, idx) => {
            if (card.dataset.gsapAntigravity === 'true') return;
            card.dataset.gsapAntigravity = 'true';
            card.classList.add('gsap-antigravity-card');

            // Continuous organic Anti-Gravity levitation tween
            const floatAmplitude = card.classList.contains('account-card') ? -6.5 : -5;
            const floatTween = gsap.to(card, {
                y: floatAmplitude,
                duration: 2.6 + (idx % 4) * 0.35,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1,
                delay: (idx % 6) * 0.22,
                force3D: true
            });

            if (isDesktop) {
                card.addEventListener('mouseenter', () => {
                    floatTween.pause();
                    gsap.to(card, {
                        y: -11,
                        scale: 1.018,
                        duration: 0.32,
                        ease: 'power2.out',
                        overwrite: 'auto',
                        force3D: true
                    });
                });

                card.addEventListener('mousemove', (e) => {
                    if (window.innerWidth <= 768) return;
                    const rect = card.getBoundingClientRect();
                    const relX = (e.clientX - rect.left) / rect.width - 0.5;
                    const relY = (e.clientY - rect.top) / rect.height - 0.5;
                    gsap.to(card, {
                        rotateY: relX * 7,
                        rotateX: -relY * 7,
                        transformPerspective: 1000,
                        duration: 0.25,
                        ease: 'power1.out',
                        overwrite: 'auto'
                    });
                }, { passive: true });

                card.addEventListener('mouseleave', () => {
                    gsap.to(card, {
                        y: 0,
                        scale: 1,
                        rotateX: 0,
                        rotateY: 0,
                        duration: 0.45,
                        ease: 'power2.out',
                        overwrite: 'auto',
                        onComplete: () => {
                            floatTween.restart(true);
                        }
                    });
                });
            }
        });
    }

    window.waseetApplyGsapAntiGravity = applyGsapAntiGravity;

    /* ==========================================================================
       5. MUTATION OBSERVER FOR DYNAMICALLY LOADED SUPABASE STORE & BROKER CARDS
       ========================================================================== */
    function initDynamicCardsObserver() {
        let debounceTimer = null;
        const observer = new MutationObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                applyGsapAntiGravity();
            }, 120);
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    /* ==========================================================================
       6. INITIALIZATION PIPELINE
       ========================================================================== */
    async function bootLuxuryFrontendEngine() {
        // Start Canvas Background immediately for fast first paint
        new WaseetBackground('ambient-canvas');

        // Ensure GSAP, ScrollTrigger & Lenis are loaded
        await ensureMotionLibraries();

        // Inject React Bits Dark Luxury Aurora
        injectReactBitsAurora();

        // Initialize Lenis Smooth Scroll hooked to GSAP Ticker
        initLenisSmoothScroll();

        // Apply GSAP Anti-Gravity to Logos, Store Cards & Regional Broker Cards
        applyGsapAntiGravity();

        // Watch for dynamic Supabase renders (Marketplace & Regional Brokers)
        initDynamicCardsObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootLuxuryFrontendEngine);
    } else {
        bootLuxuryFrontendEngine();
    }
})();
