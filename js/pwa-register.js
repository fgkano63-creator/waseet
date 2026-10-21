/**
 * WASEET (وسيط) - PWA Registration Manager
 * تسجيل موثوق وهادئ للـ Service Worker لمتجر Google Play و PWABuilder دون أي إعادة تحميل قسرية.
 */
(function() {
  'use strict';

  if (!('serviceWorker' in navigator)) {
    return;
  }

  function registerWaseetSW() {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(function(registration) {
        console.log('[PWA] Service Worker مسجل بنجاح، النطاق:', registration.scope);
      })
      .catch(function(error) {
        console.warn('[PWA] تعذر تسجيل Service Worker:', error);
      });
  }

  // تشغيل التسجيل فوراً عند اكتمال جاهزية الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerWaseetSW);
  } else {
    registerWaseetSW();
  }
})();
