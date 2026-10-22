/**
 * WASEET (وسيط) - PWA Unregister & Full Cache Purge
 * إلغاء تفعيل الـ Service Worker بالكامل مؤقتاً ومسح الكاش الجذري لحل مشاكل اللاق وعدم ظهور الصور
 */
(function() {
  'use strict';

  function purgeServiceWorkersAndCaches() {
    // 1. إلغاء تسجيل كافة الـ Service Workers النشطة فوراً
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(function(registrations) {
          if (registrations.length > 0) {
            console.log('[PWA] تم العثور على ' + registrations.length + ' Service Worker قيد التشغيل، جاري إلغاء التسجيل...');
          }
          registrations.forEach(function(registration) {
            registration.unregister().then(function(success) {
              if (success) {
                console.log('[PWA] تم إلغاء تسجيل Service Worker بنجاح بنطاق:', registration.scope);
              }
            }).catch(function(err) {
              console.warn('[PWA] تعذر إلغاء تسجيل Service Worker:', err);
            });
          });
        })
        .catch(function(err) {
          console.warn('[PWA] تعذر الوصول لقائمة Service Worker:', err);
        });
    }

    // 2. مسح وتنظيف كافة الكاشات التابعة للمتصفح نهائياً
    if ('caches' in window) {
      caches.keys()
        .then(function(keys) {
          if (keys.length > 0) {
            console.log('[PWA] جاري حذف ' + keys.length + ' من كاشات المتصفح القديمة...');
          }
          return Promise.all(
            keys.map(function(key) {
              console.log('[PWA] تم حذف الكاش:', key);
              return caches.delete(key);
            })
          );
        })
        .then(function() {
          console.log('[PWA] تم تنظيف ومسح جميع الكاشات بنجاح تام.');
        })
        .catch(function(err) {
          console.warn('[PWA] تعذر تنظيف الكاش:', err);
        });
    }
  }

  // تنفيذ فوري وتنفيذ إضافي بعد اكتمال جاهزية الصفحة
  purgeServiceWorkersAndCaches();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', purgeServiceWorkersAndCaches);
  }
})();
