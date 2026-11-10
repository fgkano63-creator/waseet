/**
 * ==============================================================================
 * WASEET (وسيط) - Luxury Entrance Splash Screen (شاشة الدخولية الفاخرة)
 * File: js/splash.js
 * High-performance, GPU-accelerated splash preloader with ambient golden embers,
 * metallic typography, circular golden spinner, and smooth progress tracking.
 * ==============================================================================
 */

(function () {
    'use strict';

    // منع التكرار إذا كان السكريبت محملاً مسبقاً
    if (window._waseetSplashLoaded) return;
    window._waseetSplashLoaded = true;

    var SPLASH_ID = 'waseet-splash-screen';
    var MAX_WAIT_MS = 1800; // الحد الأقصى للمدة الزمنية لضمان عدم حجب المستخدم أبداً
    var MIN_SHOW_MS = 950;  // الحد الأدنى للاستمتاع بالمظهر الفاخر

    /**
     * بناء كود الـ HTML الخاص بشاشة الدخولية إذا لم تكن موجودة في الصفحة
     */
    function ensureSplashMarkup() {
        var existing = document.getElementById(SPLASH_ID);
        if (existing) return existing;

        var splashEl = document.createElement('aside');
        splashEl.id = SPLASH_ID;
        splashEl.className = 'waseet-splash-screen';
        splashEl.setAttribute('aria-live', 'polite');
        splashEl.setAttribute('aria-label', 'شاشة الدخول والتحميل لمنصة وسيط');

        splashEl.innerHTML = 
            '<div class="splash-bg-glow" aria-hidden="true"></div>' +
            '<div class="splash-geom-watermark" aria-hidden="true"></div>' +
            '<canvas id="splash-particle-canvas" class="splash-particle-canvas" aria-hidden="true"></canvas>' +
            '<div class="splash-content">' +
                '<div class="splash-emblem-wrap">' +
                    '<div class="splash-emblem-aura" aria-hidden="true"></div>' +
                    '<img src="assets/logo.png?v=20261027_orig" alt="شعار منصة وسيط WASEET" class="splash-emblem-img" width="145" height="145" decoding="async">' +
                '</div>' +
                '<div class="splash-brand-titles">' +
                    '<span class="splash-brand-en">WASEET</span>' +
                    '<span class="splash-brand-ar">وســـيـــط</span>' +
                    '<p class="splash-brand-tagline">المنصة الآمنة للوساطة والضمان</p>' +
                '</div>' +
                '<div class="splash-loader-area">' +
                    '<div class="splash-ring-spinner" aria-hidden="true">' +
                        '<svg viewBox="0 0 50 50" class="splash-ring-svg">' +
                            '<circle class="splash-ring-track" cx="25" cy="25" r="20" fill="none" stroke-width="3"></circle>' +
                            '<circle class="splash-ring-head" cx="25" cy="25" r="20" fill="none" stroke-width="3"></circle>' +
                        '</svg>' +
                    '</div>' +
                    '<div class="splash-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="splash-progressbar">' +
                        '<div class="splash-progress-bar" id="splash-progress-fill">' +
                            '<span class="splash-progress-head"></span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="splash-status-text" id="splash-status-text">' +
                        '<span class="splash-status-ar">جاري التحميل...</span>' +
                        '<span class="splash-status-en">Loading...</span>' +
                    '</div>' +
                '</div>' +
            '</div>';

        if (document.body) {
            document.body.insertBefore(splashEl, document.body.firstChild);
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                document.body.insertBefore(splashEl, document.body.firstChild);
            });
        }
        return splashEl;
    }

    /**
     * تشغيل الجسيمات الذهبية العائمة (Golden Embers) بأداء عالي خفيف جداً
     */
    function initParticles(canvas) {
        if (!canvas || !canvas.getContext) return { stop: function () {} };

        var ctx = canvas.getContext('2d');
        if (!ctx) return { stop: function () {} };

        var width = 0;
        var height = 0;
        var particles = [];
        var numParticles = window.innerWidth < 768 ? 28 : 45;
        var animId = null;
        var isRunning = true;

        function resize() {
            width = canvas.width = window.innerWidth || 360;
            height = canvas.height = window.innerHeight || 640;
        }
        resize();

        function createParticle(initial) {
            return {
                x: Math.random() * width,
                y: initial ? Math.random() * height : height + 10,
                radius: Math.random() * 1.8 + 0.6,
                speedY: Math.random() * 0.9 + 0.35,
                speedX: (Math.random() - 0.5) * 0.4,
                opacity: Math.random() * 0.7 + 0.25,
                pulsingSpeed: Math.random() * 0.02 + 0.01,
                pulsingAngle: Math.random() * Math.PI * 2,
                goldTone: Math.random() > 0.4 ? 'rgba(212, 175, 55,' : 'rgba(255, 230, 140,'
            };
        }

        for (var i = 0; i < numParticles; i++) {
            particles.push(createParticle(true));
        }

        function render() {
            if (!isRunning) return;
            ctx.clearRect(0, 0, width, height);

            for (var p = 0; p < particles.length; p++) {
                var pt = particles[p];
                pt.y -= pt.speedY;
                pt.x += pt.speedX;
                pt.pulsingAngle += pt.pulsingSpeed;

                var curOpacity = Math.max(0.05, Math.min(1, pt.opacity + Math.sin(pt.pulsingAngle) * 0.25));

                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
                ctx.fillStyle = pt.goldTone + curOpacity + ')';
                ctx.shadowBlur = 8;
                ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
                ctx.fill();

                if (pt.y < -15 || pt.x < -10 || pt.x > width + 10) {
                    particles[p] = createParticle(false);
                }
            }

            animId = requestAnimationFrame(render);
        }

        render();

        return {
            stop: function () {
                isRunning = false;
                if (animId) cancelAnimationFrame(animId);
                ctx.clearRect(0, 0, width, height);
            }
        };
    }

    /**
     * تشغيل شاشة الدخولية مع شريط التقدم التفاعلي
     */
    function launchSplash(force) {
        var splashEl = ensureSplashMarkup();
        if (!splashEl) return;

        // إتاحة فرصة التخطي إذا كانت الشاشة قد عُرضت في الجلسة الحالية ما لم يُطلب العرض صراحة
        var sessionKey = 'waseet_splash_seen_v1';
        if (!force) {
            try {
                if (sessionStorage.getItem(sessionKey) === 'true') {
                    splashEl.classList.add('splash-hidden');
                    return;
                }
            } catch (e) {}
        }

        try {
            sessionStorage.setItem(sessionKey, 'true');
        } catch (e) {}

        splashEl.classList.remove('splash-fading', 'splash-hidden');
        document.documentElement.classList.add('waseet-splash-active');

        var canvas = document.getElementById('splash-particle-canvas');
        var particlesCtrl = initParticles(canvas);

        var fillBar = document.getElementById('splash-progress-fill');
        var progBar = document.getElementById('splash-progressbar');
        var statusText = document.getElementById('splash-status-text');

        var currentProgress = 0;
        var startTime = performance.now();
        var isDomReady = document.readyState === 'complete';
        var isFinished = false;

        function onComplete() {
            isDomReady = true;
        }

        if (document.readyState === 'complete') {
            isDomReady = true;
        } else {
            window.addEventListener('load', onComplete, { once: true });
            document.addEventListener('DOMContentLoaded', onComplete, { once: true });
        }

        function setProgress(val) {
            currentProgress = Math.max(0, Math.min(100, Math.round(val)));
            if (fillBar) fillBar.style.width = currentProgress + '%';
            if (progBar) progBar.setAttribute('aria-valuenow', currentProgress);
        }

        function step(now) {
            if (isFinished) return;
            var elapsed = now - startTime;

            var targetProgress = 0;
            if (elapsed < 300) {
                targetProgress = (elapsed / 300) * 35;
            } else if (elapsed < 750) {
                targetProgress = 35 + ((elapsed - 300) / 450) * 45;
            } else if (isDomReady || elapsed >= MIN_SHOW_MS) {
                targetProgress = 80 + ((elapsed - 750) / (MIN_SHOW_MS - 750 + 200)) * 20;
            } else {
                targetProgress = Math.min(88, 80 + (elapsed - 750) * 0.02);
            }

            if (elapsed >= MAX_WAIT_MS || (isDomReady && elapsed >= MIN_SHOW_MS)) {
                targetProgress = 100;
            }

            setProgress(Math.max(currentProgress, targetProgress));

            if (currentProgress >= 100) {
                isFinished = true;
                if (statusText) {
                    statusText.innerHTML = 
                        '<span class="splash-status-ar" style="color: #fde047;">مرحباً بك في وسيط</span>' +
                        '<span class="splash-status-en" style="color: #fef08a;">Welcome to WASEET</span>';
                }

                setTimeout(function () {
                    splashEl.classList.add('splash-fading');
                    document.documentElement.classList.remove('waseet-splash-active');

                    setTimeout(function () {
                        splashEl.classList.add('splash-hidden');
                        particlesCtrl.stop();
                    }, 680);
                }, 200);
                return;
            }

            requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    // إتاحة تشغيل الدخولية يدوياً في أي وقت للمعاينة
    window.waseetShowSplash = function () {
        launchSplash(true);
    };

    // تشغيل تلقائي عند جاهزية المستند
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            launchSplash(false);
        });
    } else {
        launchSplash(false);
    }
})();
