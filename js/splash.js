/**
 * ==============================================================================
 * WASEET (وسيط) - Luxury Entrance Splash Screen & Dynamic Network-Synced Preloader
 * File: js/splash.js
 * High-performance, GPU-accelerated splash screen with connection-aware speed profiling,
 * real asset load tracking, and fluid 0% to 100% continuous progress synchronization.
 * ==============================================================================
 */

(function () {
    'use strict';

    if (window._waseetSplashLoaded) return;
    window._waseetSplashLoaded = true;

    var SPLASH_ID = 'waseet-splash-screen';
    var SESSION_KEY = 'waseet_splash_shown';

    // فحص الجلسة: إذا تم عرض الدخولية مسبقاً في هذه الجلسة، يتم تخطيها فوراً دون أي إبطاء
    try {
        if (sessionStorage.getItem(SESSION_KEY)) {
            var existing = document.getElementById(SPLASH_ID);
            if (existing) {
                existing.classList.add('splash-hidden');
                existing.style.display = 'none';
                if (existing.parentNode) existing.parentNode.removeChild(existing);
            }
            document.documentElement.classList.remove('waseet-splash-active');
            document.documentElement.classList.add('waseet-splash-dismissed');
            window.waseetShowSplash = function () {
                try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
                document.documentElement.classList.remove('waseet-splash-dismissed');
                launchSplash(true);
            };
            return;
        }
    } catch (e) {}

    /**
     * فحص سرعة الاتصال بالإنترنت لتحديد الوتيرة المثلى لشريط التقدم
     */
    function getNetworkProfile() {
        var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        var profile = {
            speed: 'fast',
            minDuration: 1350, // ميلي ثانية (لضمان رؤية العداد بوضوح من 0% إلى 100%)
            maxDuration: 2200,
            stepMultiplier: 1.2
        };

        if (conn) {
            var eff = (conn.effectiveType || '').toLowerCase();
            var downlink = conn.downlink || 10;
            var rtt = conn.rtt || 50;

            if (eff === '2g' || eff === 'slow-2g' || downlink < 1.2 || rtt > 500) {
                profile.speed = 'slow';
                profile.minDuration = 2400;
                profile.maxDuration = 4500;
                profile.stepMultiplier = 0.6;
            } else if (eff === '3g' || downlink < 4.0 || rtt > 220) {
                profile.speed = 'medium';
                profile.minDuration = 1800;
                profile.maxDuration = 3000;
                profile.stepMultiplier = 0.85;
            } else {
                profile.speed = 'fast';
                profile.minDuration = 1300;
                profile.maxDuration = 2000;
                profile.stepMultiplier = 1.25;
            }
        }

        return profile;
    }

    /**
     * قياس نسبة اكتمال الموارد والملفات الحقيقية المحملة في الصفحة
     */
    function getResourceLoadRatio() {
        try {
            if (window.performance && typeof performance.getEntriesByType === 'function') {
                var entries = performance.getEntriesByType('resource');
                if (entries && entries.length > 0) {
                    var completed = 0;
                    for (var i = 0; i < entries.length; i++) {
                        if (entries[i].responseEnd > 0) completed++;
                    }
                    return Math.min(1.0, completed / entries.length);
                }
            }
        } catch (e) {}

        if (document.readyState === 'complete') return 1.0;
        if (document.readyState === 'interactive') return 0.75;
        return 0.35;
    }

    /**
     * إنشاء هيكل الـ HTML في حال عدم وجوده مسبقاً
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
                    '<div class="splash-percentage" id="splash-percent-text">0%</div>' +
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
     * تشغيل الجسيمات الذهبية العائمة (Golden Embers)
     */
    function initParticles(canvas) {
        if (!canvas || !canvas.getContext) return { stop: function () {} };

        var ctx = canvas.getContext('2d');
        if (!ctx) return { stop: function () {} };

        var width = 0;
        var height = 0;
        var particles = [];
        var numParticles = window.innerWidth < 768 ? 26 : 42;
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
                radius: Math.random() * 1.6 + 0.6,
                speedY: Math.random() * 0.85 + 0.35,
                speedX: (Math.random() - 0.5) * 0.35,
                opacity: Math.random() * 0.65 + 0.25,
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

                var curOpacity = Math.max(0.05, Math.min(1, pt.opacity + Math.sin(pt.pulsingAngle) * 0.2));

                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
                ctx.fillStyle = pt.goldTone + curOpacity + ')';
                ctx.shadowBlur = 6;
                ctx.shadowColor = 'rgba(212, 175, 55, 0.5)';
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
     * تشغيل شاشة الدخولية مع التدرج السلس الحقيقي من 0% إلى 100%
     */
    function launchSplash(force) {
        if (!force) {
            try {
                if (sessionStorage.getItem(SESSION_KEY)) {
                    var el = document.getElementById(SPLASH_ID);
                    if (el) el.style.display = 'none';
                    document.documentElement.classList.remove('waseet-splash-active');
                    document.documentElement.classList.add('waseet-splash-dismissed');
                    return;
                }
                sessionStorage.setItem(SESSION_KEY, 'true');
            } catch (e) {}
        }
        var splashEl = ensureSplashMarkup();
        if (!splashEl) return;

        splashEl.classList.remove('splash-fading', 'splash-hidden', 'splash-complete');
        document.documentElement.classList.add('waseet-splash-active');

        var canvas = document.getElementById('splash-particle-canvas');
        var particlesCtrl = initParticles(canvas);

        var fillBar = document.getElementById('splash-progress-fill');
        var progBar = document.getElementById('splash-progressbar');
        var percentText = document.getElementById('splash-percent-text');
        var statusText = document.getElementById('splash-status-text');

        var network = getNetworkProfile();
        var startTime = performance.now();
        var isPageLoaded = false;
        var pageLoadedTime = 0;
        var visualProgress = 0; // يبدأ حتماً من 0.0
        var isFinished = false;

        function markPageLoaded() {
            if (!isPageLoaded) {
                isPageLoaded = true;
                pageLoadedTime = performance.now();
            }
        }

        if (document.readyState === 'complete') {
            markPageLoaded();
        } else {
            window.addEventListener('load', markPageLoaded, { once: true });
            document.addEventListener('DOMContentLoaded', function () {
                setTimeout(markPageLoaded, 450);
            }, { once: true });
        }

        // تحديث عناصر واجهة المستخدم في كل إطار
        function renderProgress(val) {
            var displayVal = Math.max(0, Math.min(100, Math.round(val)));
            if (fillBar) {
                fillBar.style.width = val.toFixed(1) + '%';
            }
            if (progBar) {
                progBar.setAttribute('aria-valuenow', displayVal);
            }
            if (percentText) {
                percentText.textContent = displayVal + '%';
            }
        }

        // البدء فوراً بضبط 0% على الشاشة
        renderProgress(0);

        function step(now) {
            if (isFinished) return;

            var elapsed = now - startTime;
            var resourceRatio = getResourceLoadRatio();

            // حساب النسبة المستهدفة بناءً على الوقت المنقضي وموارد الصفحة وسرعة الشبكة
            var targetProgress = 0;

            if (!isPageLoaded) {
                // أثناء انتظار تحميل موارد الصفحة: التقدم متناغم بين الوقت والموارد
                var timeRatio = Math.min(1, elapsed / network.maxDuration);
                var blended = (resourceRatio * 0.6) + (timeRatio * 0.4);
                // لا نتجاوز 88% قبل اكتمال تحميل الصفحة فعلياً
                targetProgress = Math.min(88, blended * 92);
            } else {
                // اكتمل تحميل الصفحة: الانتقال السلس إلى 100%
                var sinceLoad = Math.max(0, now - pageLoadedTime);
                var finishRatio = Math.min(1, sinceLoad / 350);
                var baseTarget = 88 + (finishRatio * 12);

                // ضمان استمرار العرض للمدة الدنيا لجمالية المشهد
                if (elapsed >= network.minDuration) {
                    targetProgress = 100;
                } else {
                    targetProgress = Math.min(98, baseTarget);
                }
            }

            // ضمان التقدم التصاعدي المستمر والسلس لكل إطار دون قفز مفاجئ
            var distance = targetProgress - visualProgress;
            if (distance > 0) {
                // خطوة تقدم ديناميكية ناعمة تضمن التدرج المتصل
                var stepDelta = Math.max(0.35, Math.min(2.2, distance * 0.085 * network.stepMultiplier));
                visualProgress = Math.min(100, visualProgress + stepDelta);
            }

            renderProgress(visualProgress);

            // عند الوصول الحقيقي إلى 100%
            if (visualProgress >= 100) {
                isFinished = true;
                renderProgress(100);

                splashEl.classList.add('splash-complete');

                if (statusText) {
                    statusText.innerHTML = 
                        '<span class="splash-status-ar" style="color: #fde047; text-shadow: 0 0 10px rgba(253, 224, 71, 0.6);">مرحباً بك في وسيط</span>' +
                        '<span class="splash-status-en" style="color: #fef08a;">Welcome to WASEET</span>';
                }

                // التوقف برهة قصيرة ليرى المستخدم نسبة 100% ورسالة الترحيب بوضوح تام
                setTimeout(function () {
                    splashEl.classList.add('splash-fading');
                    document.documentElement.classList.remove('waseet-splash-active');

                    setTimeout(function () {
                        splashEl.classList.add('splash-hidden');
                        particlesCtrl.stop();
                    }, 680);
                }, 300);

                return;
            }

            requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    // إتاحة تشغيل الدخولية يدوياً في أي وقت للمعاينة والتجربة
    window.waseetShowSplash = function () {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        document.documentElement.classList.remove('waseet-splash-dismissed');
        launchSplash(true);
    };

    // التشغيل التلقائي فور بدء التنفيذ
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { launchSplash(false); });
    } else {
        launchSplash(false);
    }
})();
