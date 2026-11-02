/**
 * WASEET (وسيط) - Instant Navigation & Preload Engine
 * Solves the 3-second page switching lag by:
 * 1. Prefetching HTML documents into cache on hover/touch
 * 2. Preloading core navigation pages in background
 * 3. Providing smooth, zero-latency transitions
 */

(function() {
    'use strict';

    const prefetchCache = new Set();
    const CORE_PAGES = [
        'index.html',
        'deals.html',
        'wallet.html',
        'my-accounts.html',
        'profile.html',
        'chat.html',
        'admin-chats.html',
        'pending-accounts.html',
        'admin-deposits.html',
        'admin-brokers.html',
        'admin-withdrawals.html',
        'contact-support.html'
    ];

    /**
     * Prefetch a document via low-priority fetch or link prefetch
     */
    function prefetchPage(url) {
        if (!url || prefetchCache.has(url)) return;
        try {
            const cleanUrl = url.split('#')[0].split('?')[0];
            const isHtml = cleanUrl.endsWith('.html');
            const isRoot = cleanUrl === '/' || cleanUrl === '';
            const isPretty = /^\/(deals|chat|wallet|my-accounts|profile|pending-accounts|admin-chats|admin-deposits|admin-brokers|admin-withdrawals|contact-support|auth\/callback|index)$/.test(cleanUrl);
            if (!isHtml && !isRoot && !isPretty) return;
            if (cleanUrl.startsWith('http') && !cleanUrl.startsWith(window.location.origin)) return;

            prefetchCache.add(url);
            
            // Modern link rel=prefetch
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = url;
            link.as = 'document';
            document.head.appendChild(link);
        } catch (e) {
            // Silently ignore prefetch errors
        }
    }

    /**
     * Preload all core application links when browser is idle
     */
    function prefetchCorePages() {
        const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
        schedule(() => {
            CORE_PAGES.forEach(page => {
                prefetchPage(page);
            });
        });
    }

    /**
     * Attach hover / touch listeners to internal links for instant 0ms prefetch
     */
    function initLinkPrefetching() {
        document.addEventListener('mouseover', (e) => {
            const a = e.target.closest('a[href]');
            if (a && a.href && a.origin === window.location.origin) {
                prefetchPage(a.getAttribute('href'));
            }
        }, { passive: true });

        document.addEventListener('touchstart', (e) => {
            const a = e.target.closest('a[href]');
            if (a && a.href && a.origin === window.location.origin) {
                prefetchPage(a.getAttribute('href'));
            }
        }, { passive: true });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initLinkPrefetching();
            prefetchCorePages();
            purgeNetlifyBadge();
        });
    } else {
        initLinkPrefetching();
        prefetchCorePages();
        purgeNetlifyBadge();
    }

    /**
     * Purge injected Netlify badges and floating advertisements from DOM
     */
    function purgeNetlifyBadge() {
        const cleanup = () => {
            try {
                const selectors = [
                    '#netlify-badge',
                    '.netlify-badge',
                    '#netlify-banner',
                    '.netlify-banner',
                    '#netlify-drawer',
                    '.netlify-drawer',
                    'netlify-drawer',
                    '[data-netlify-badge]',
                    '[data-netlify-drawer]',
                    '[data-netlify-deploy-id]',
                    'a[href*="netlify.com"]',
                    'a[href*="netlify.app"]',
                    'a[href*="netlify"]',
                    'iframe[src*="netlify"]'
                ];
                selectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                });

                // Deep scan for floating text badge
                document.querySelectorAll('a, div, span, button').forEach(el => {
                    if (el.textContent && el.textContent.includes('Powered by Netlify')) {
                        const target = el.closest('a') || el.closest('div') || el;
                        target.remove();
                    }
                });
            } catch (e) {}
        };

        cleanup();
        window.addEventListener('load', cleanup);
        setTimeout(cleanup, 400);
        setTimeout(cleanup, 1200);
        setTimeout(cleanup, 2500);
    }
})();
