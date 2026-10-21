/**
 * WASEET (وسيط) - PWA Registration & Auto Update Manager
 * يضمن تسجيل Service Worker فورياً لاجتياز اختبارات PWABuilder،
 * وتحديث الصفحة تلقائياً عند تفعيل إصدار جديد لمنع بقاء المستخدمين على الكاش القديم.
 */
(function() {
  'use strict';

  if (!('serviceWorker' in navigator)) {
    return;
  }

  var isRefreshing = false;

  // 1. إعادة تحميل الصفحة تلقائياً ومرة واحدة عند تفعيل Service Worker جديد
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (isRefreshing) return;
    isRefreshing = true;
    console.log('[PWA] تم تفعيل إصدار جديد من تطبيق وسيط. جاري تحديث الصفحة تلقائياً...');
    window.location.reload();
  });

  // 2. الاستماع لرسائل السيرفس ووركر
  navigator.serviceWorker.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SW_ACTIVATED') {
      console.log('[PWA] إصدار السيرفس ووركر النشط حالياً:', event.data.version);
    }
  });

  // 3. دالة التسجيل الموثوقة
  function registerWaseetSW() {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(function(registration) {
        console.log('[PWA] تم تسجيل Service Worker بنجاح، النطاق:', registration.scope);

        // فحص وجود تحديث جديد دورياً
        registration.addEventListener('updatefound', function() {
          var installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', function() {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                console.log('[PWA] تم تثبيت إصدار جديد، جاري الانتقال إليه...');
                // إرسال طلب التخطي الفوري
                if (installingWorker.postMessage) {
                  installingWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              } else {
                console.log('[PWA] تم تخزين المحتوى للاستخدام دون إنترنت.');
              }
            }
          });
        });
      })
      .catch(function(error) {
        console.warn('[PWA] تعذر تسجيل Service Worker:', error);
      });
  }

  // 4. تشغيل التسجيل فوراً دون تأخير لضمان التقاطه من قِبل PWABuilder
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerWaseetSW);
  } else {
    registerWaseetSW();
  }
})();
