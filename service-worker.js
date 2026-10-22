/**
 * WASEET (وسيط) - Empty Service Worker / Cache Cleaner
 * تم إيقاف الـ Service Worker مؤقتاً ومسح الكاش نهائياً بناءً على طلب الإدارة
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});
