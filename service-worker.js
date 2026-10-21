/**
 * WASEET (وسيط) - Service Worker (v3)
 * استراتيجية Network-First فائقة السرعة للملفات الحيوية (HTML, CSS, JS) لمنع التخزين العنيف.
 * دعم PWA كامل واجتياز اختبارات PWABuilder ومتجر Google Play.
 * استثناء تام للاتصالات اللحظية وواجهات Supabase لضمان دقة وسرعة العمليات المالية.
 */

const CACHE_NAME = 'waseet-pwa-v3';

// الملفات الأساسية للتخزين المؤقت الأولي
const STATIC_ASSETS = [
  './',
  './index.html',
  './deals.html',
  './chat.html',
  './contact-support.html',
  './admin-chats.html',
  './my-accounts.html',
  './pending-accounts.html',
  './wallet.html',
  './admin-deposits.html',
  './manifest.json',
  './css/style.css',
  './js/pwa-register.js',
  './js/supabase.js',
  './js/app.js',
  './assets/favicon-192.png',
  './assets/favicon-512.png',
  './assets/logo.png',
  './assets/screenshots/screenshot-mobile.png',
  './assets/screenshots/screenshot-desktop.png'
];

// 1. التثبيت والتخزين الأولي مع التفعيل الفوري
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] فشل تخزين ملف أثناء التثبيت:', url, err);
          })
        )
      );
    })
  );
});

// 2. التفعيل وحذف كافة نسخ الكاش القديمة فوراً
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] تنظيف كاش قديم:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // إرسال إشعار لكافة الصفحات بأن الإصدار الجديد أصبح نشطاً
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// 3. الاستجابة للرسائل المباشرة
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. استراتيجية الجلب (Fetch Strategy): Network First للملفات الحيوية
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // استثناء كافة الطلبات غير GET
  if (req.method !== 'GET') {
    return;
  }

  // استثناء تام لاتصالات Supabase وقواعد البيانات والـ Realtime
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/rest/v1') ||
    url.pathname.includes('/auth/v1') ||
    url.pathname.includes('/realtime/v1') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    return;
  }

  // استراتيجية Network-First للصفحات (HTML) والملفات البرمجية (JS, CSS, JSON)
  const isHtml = req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html');
  const isScriptOrStyle = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.json');

  if (isHtml || isScriptOrStyle) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          // في حال عدم توفر اتصال بالإنترنت، الرجوع لنسخة الكاش
          const cached = await caches.match(req);
          if (cached) return cached;
          if (isHtml) {
            return (await caches.match('./index.html')) || (await caches.match('./'));
          }
          return new Response('Network offline and asset not in cache', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // لباقي الملفات الثابتة (الصور والأيقونات): Cache First مع تحديث بالخلفية
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) {
        return cachedRes;
      }
      return fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      });
    })
  );
});
