/**
 * تسجيل وإدارة الـ Service Worker لتطبيق WASEET PWA
 */
(function() {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .then(function(registration) {
          // التحقق من وجود تحديث جديد للسيرفس ووركر
          registration.onupdatefound = function() {
            var installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = function() {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] تم تحديث تطبيق وسيط في الخلفية بنجاح.');
                }
              };
            }
          };
        })
        .catch(function(error) {
          console.warn('[PWA] تعذر تسجيل Service Worker:', error);
        });
    });
  }
})();
