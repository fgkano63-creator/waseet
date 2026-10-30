/**
 * WASEET (وسيط) - PWA Unregister & Controlled Cache Maintenance
 * إلغاء تسجيل Service Worker القديم ومسح الكاش لمرة واحدة منظمة دون تعطيل التخزين المؤقت المستمر
 */
(function() {
  'use strict';

  const PURGE_VERSION_KEY = 'WASEET_PWA_PURGE_20261028_DONE';

  function cleanupServiceWorkers() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(function(registrations) {
          registrations.forEach(function(registration) {
            registration.unregister().then(function(success) {
              if (success) {
                console.log('[PWA] تم إلغاء تسجيل Service Worker القديم بنطاق:', registration.scope);
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
  }

  function oneTimeCachePurge() {
    // التحقق مما إذا كان قد تم تنظيف الكاش القديم مسبقاً لهذا المتصفح
    try {
      if (localStorage.getItem(PURGE_VERSION_KEY)) {
        return; // تم التنظيف مسبقاً، نحافظ على كاش المتصفح لزيادة سرعة التصفح
      }
    } catch (e) {}

    if ('caches' in window) {
      caches.keys()
        .then(function(keys) {
          if (!keys.length) {
            try { localStorage.setItem(PURGE_VERSION_KEY, 'true'); } catch (e) {}
            return;
          }
          console.log('[PWA] جاري إجراء صيانة الكاش لمرة واحدة (' + keys.length + ' كاش)...');
          return Promise.all(
            keys.map(function(key) {
              return caches.delete(key);
            })
          ).then(function() {
            try { localStorage.setItem(PURGE_VERSION_KEY, 'true'); } catch (e) {}
            console.log('[PWA] تم تنظيف الكاش القديم بنجاح، لن يتم تكرار التفريغ عند كل تنقل.');
          });
        })
        .catch(function(err) {
          console.warn('[PWA] تعذر تنظيف الكاش:', err);
        });
    }
  }

  cleanupServiceWorkers();
  oneTimeCachePurge();
})();
