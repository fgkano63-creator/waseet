/**
 * WASEET (وسيط) - Service Worker
 * يوفر دعم PWA وتثبيت التطبيق على الهواتف ومتجر Google Play
 * مع استثناء كامل للاتصالات اللحظية وواجهات Supabase لضمان سرعة وموثوقية الصفقات.
 */

const CACHE_NAME = 'waseet-pwa-v2';

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
  './assets/favicon-192.png',
  './assets/favicon-512.png',
  './assets/logo.png'
];

// تثبيت الـ Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // محاولة تخزين الملفات الأساسية مع تجاهل أي فشل لملفات ثانوية
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] فشل تخزين ملف مبدئي:', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// تفعيل وحذف الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// التعامل مع الطلبات (Fetch Handler)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. استثناء كل الطلبات غير GET (مثل POST و PUT و DELETE)
  if (req.method !== 'GET') {
    return;
  }

  // 2. استثناء كامل لاتصالات Supabase، الـ Realtime، والـ WebSockets لحماية وسرعة الصفقات
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/rest/v1') ||
    url.pathname.includes('/auth/v1') ||
    url.pathname.includes('/realtime/v1') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    // تمرير الطلب للشبكة مباشرة دون لمس الكاش
    return;
  }

  // 3. لصفحات HTML (Navigation requests): استراتيجية Network-First
  // محاولة جلب أحدث نسخة من الشبكة، وإذا تعذر الاتصال يتم استخدام الكاش
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
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
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('./index.html');
        })
    );
    return;
  }

  // 4. للملفات الثابتة (CSS, JS, Images, Fonts): استراتيجية Stale-While-Revalidate
  // إرجاع النسخة المخزنة فوراً مع تحديثها في الخلفية من الشبكة
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          // في حال عدم توفر اتصال بالإنترنت، يعتمد على الكاش فقط
        });

      return cachedRes || fetchPromise;
    })
  );
});
