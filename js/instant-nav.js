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
        'admin-chats.html'
    ];

    /**
     * Prefetch a document via low-priority fetch or link prefetch
     */
    function prefetchPage(url) {
        if (!url || prefetchCache.has(url)) return;
        try {
            const cleanUrl = url.split('#')[0].split('?')[0];
            if (!cleanUrl.endsWith('.html') && cleanUrl !== '/') return;
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
        });
    } else {
        initLinkPrefetching();
        prefetchCorePages();
    }
})();
