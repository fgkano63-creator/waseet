/**
 * WASEET (وسيط) - Universal Country Selector & Geolocation Fallback
 * يوفر نافذة ذكية لاختيار الدولة يدوياً أو تلقائياً عبر المتصفح (HTML5 Geolocation)
 * عند فشل الاكتشاف التلقائي عبر الـ IP (بسبب VPN أو حظر الإعلانات)، ويتيح للمستخدمين
 * تحديد وتغيير دولتهم في أي وقت بضغطة زر وتحديث قاعدة البيانات فوراً.
 */

(function () {
    'use strict';

    const COUNTRIES_LIST = [
        { code: 'DZ', name: 'الجزائر', flag: '🇩🇿' },
        { code: 'EG', name: 'مصر', flag: '🇪🇬' },
        { code: 'SA', name: 'المملكة العربية السعودية', flag: '🇸🇦' },
        { code: 'MA', name: 'المغرب', flag: '🇲🇦' },
        { code: 'SY', name: 'سوريا', flag: '🇸🇾' },
        { code: 'IQ', name: 'العراق', flag: '🇮🇶' },
        { code: 'AE', name: 'الإمارات العربية المتحدة', flag: '🇦🇪' },
        { code: 'TN', name: 'تونس', flag: '🇹🇳' },
        { code: 'LY', name: 'ليبيا', flag: '🇱🇾' },
        { code: 'JO', name: 'الأردن', flag: '🇯🇴' },
        { code: 'YE', name: 'اليمن', flag: '🇾🇪' },
        { code: 'KW', name: 'الكويت', flag: '🇰🇼' },
        { code: 'QA', name: 'قطر', flag: '🇶🇦' },
        { code: 'OM', name: 'سلطنة عمان', flag: '🇴🇲' },
        { code: 'BH', name: 'البحرين', flag: '🇧🇭' },
        { code: 'PS', name: 'فلسطين', flag: '🇵🇸' },
        { code: 'LB', name: 'لبنان', flag: '🇱🇧' },
        { code: 'SD', name: 'السودان', flag: '🇸🇩' },
        { code: 'OTHER', name: 'دولة أخرى', flag: '🌍' }
    ];

    /**
     * تحديد الدولة بدقة فائقة عبر إحداثيات المتصفح (HTML5 Geolocation API + Reverse Geocoding)
     * يعتمد على إذن المستخدم ويستخدم BigDataCloud Client API كخيار أول،
     * مع خيار احتياطي عبر OpenStreetMap Nominatim لضمان عدم الانقطاع.
     * @param {Object} options { silent: boolean }
     * @returns {Promise<{countryCode: string, countryName: string, flag: string, latitude: number, longitude: number}>}
     */
    async function waseetDetectCountryViaGeolocation(options = {}) {
        if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
            const msg = 'متصفحك لا يدعم ميزة تحديد الموقع الجغرافي (Geolocation API). يرجى اختيار دولتك من القائمة المنسدلة.';
            if (!options.silent && typeof waseetAlert === 'function') {
                waseetAlert('الموقع غير مدعوم', msg, 'info');
            }
            throw new Error('GEOLOCATION_NOT_SUPPORTED');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const lat = pos && pos.coords ? pos.coords.latitude : null;
                    const lon = pos && pos.coords ? pos.coords.longitude : null;

                    if (typeof lat !== 'number' || typeof lon !== 'number') {
                        const err = new Error('INVALID_COORDINATES');
                        if (!options.silent && typeof waseetAlert === 'function') {
                            waseetAlert('تعذر الوصول للموقع', 'تعذر استخراج إحداثيات الموقع بدقة. يرجى اختيار دولتك من القائمة المنسدلة.', 'info');
                        }
                        return reject(err);
                    }

                    let countryCode = null;
                    let countryName = '';

                    // 1. محاولة جلب رمز الدولة عبر BigDataCloud Client Reverse Geocode API المجانية والدقيقة
                    try {
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), 7000);
                        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=ar`, {
                            signal: controller.signal
                        });
                        clearTimeout(timer);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.countryCode && typeof data.countryCode === 'string') {
                                const code = data.countryCode.trim().toUpperCase();
                                if (/^[A-Z]{2}$/.test(code)) {
                                    countryCode = code;
                                    countryName = (typeof data.countryName === 'string') ? data.countryName.trim() : '';
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('[Geolocation] BigDataCloud reverse geocode note:', e);
                    }

                    // 2. خيار احتياطي موثوق عبر OpenStreetMap Nominatim في حال تعثر الخدمة الأولى
                    if (!countryCode) {
                        try {
                            const controller = new AbortController();
                            const timer = setTimeout(() => controller.abort(), 7000);
                            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=ar`, {
                                headers: { 'Accept': 'application/json' },
                                signal: controller.signal
                            });
                            clearTimeout(timer);
                            if (res.ok) {
                                const data = await res.json();
                                if (data && data.address && data.address.country_code) {
                                    const code = String(data.address.country_code).trim().toUpperCase();
                                    if (/^[A-Z]{2}$/.test(code)) {
                                        countryCode = code;
                                        countryName = (typeof data.address.country === 'string') ? data.address.country.trim() : '';
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[Geolocation] Nominatim reverse geocode note:', e);
                        }
                    }

                    if (!countryCode) {
                        const err = new Error('COULD_NOT_RESOLVE_COUNTRY_FROM_COORDS');
                        if (!options.silent && typeof waseetAlert === 'function') {
                            waseetAlert('تعذر الوصول للموقع', 'تم استلام إحداثيات الموقع ولكن تعذر تحديد الدولة تلقائياً. يرجى اختيار دولتك من القائمة المنسدلة يدوياً.', 'info');
                        }
                        return reject(err);
                    }

                    // حفظ وتحديث الحالة وقاعدة البيانات فوراً
                    try {
                        localStorage.setItem('WASEET_DETECTED_COUNTRY', countryCode);
                        localStorage.setItem('WASEET_USER_MANUAL_COUNTRY_SET', 'true');

                        if (window.WASEET_STATE && window.WASEET_STATE.user) {
                            window.WASEET_STATE.user.country = countryCode;
                        }

                        // التحديث في Supabase إن كان المستخدم مسجلاً
                        const client = (typeof initWaseetSupabase === 'function') ? initWaseetSupabase() : null;
                        const user = (window.WASEET_STATE && window.WASEET_STATE.user) ? window.WASEET_STATE.user : null;
                        if (client && user && user.id && !user.isGuest) {
                            try {
                                await client
                                    .from('profiles')
                                    .update({ country: countryCode, updated_at: new Date().toISOString() })
                                    .eq('id', user.id);
                            } catch (dbErr) {
                                console.warn('[Geolocation DB update note]', dbErr);
                            }
                        }

                        // إطلاق حدث مخصص لإعادة تحميل الوسطاء وطرق الدفع
                        window.dispatchEvent(new CustomEvent('waseet-country-changed', {
                            detail: { country: countryCode, method: 'geolocation', latitude: lat, longitude: lon }
                        }));

                        // تحديث بطاقة الوسيط في القائمة الجانبية فوراً
                        if (typeof window.waseetResolveCurrentUserCountry === 'function') {
                            try {
                                const slot = document.getElementById('drawer-regional-broker-card');
                                if (slot && typeof window.waseetRenderRegionalBrokerCard === 'function') {
                                    window.waseetRenderRegionalBrokerCard(slot);
                                }
                            } catch (e) {}
                        }

                        const matchObj = COUNTRIES_LIST.find(c => c.code === countryCode);
                        const finalName = matchObj ? matchObj.name : (countryName || countryCode);
                        const finalFlag = matchObj ? matchObj.flag : '📍';

                        resolve({
                            countryCode,
                            countryName: finalName,
                            flag: finalFlag,
                            latitude: lat,
                            longitude: lon
                        });
                    } catch (storeErr) {
                        console.error('[Geolocation Store Error]', storeErr);
                        resolve({ countryCode, countryName, flag: '📍', latitude: lat, longitude: lon });
                    }
                },
                (geoErr) => {
                    console.warn('[Geolocation Error]', geoErr);
                    let userMsg = 'تعذر الوصول للموقع. يرجى اختيار دولتك من القائمة المنسدلة.';
                    if (geoErr && geoErr.code === 1) { // PERMISSION_DENIED
                        userMsg = 'تم رفض إذن الوصول للموقع الجغرافي. يمكنك دائماً اختيار دولتك يدوياً من القائمة المنسدلة أدناه.';
                    } else if (geoErr && geoErr.code === 3) { // TIMEOUT
                        userMsg = 'استغرقت محاولة تحديد الموقع وقتاً أطول من المتوقع. يرجى اختيار دولتك يدوياً.';
                    }
                    if (!options.silent && typeof waseetAlert === 'function') {
                        waseetAlert('تعذر الوصول للموقع', userMsg, 'info');
                    }
                    reject(geoErr);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 12000,
                    maximumAge: 60000
                }
            );
        });
    }

    /**
     * إظهار نافذة منبثقة فاخرة ثلاثية الأبعاد لاختيار الدولة
     * @param {Object} options { allowCancel: boolean, title: string, subtitle: string }
     */
    function waseetPromptCountrySelection(options = {}) {
        const existing = document.getElementById('waseet-country-modal');
        if (existing) existing.remove();

        const currentCountry = (typeof waseetGetVisitorCountrySync === 'function' ? waseetGetVisitorCountrySync() : '') ||
            (window.WASEET_STATE && window.WASEET_STATE.user && window.WASEET_STATE.user.country) || '';

        const allowCancel = options.allowCancel !== false;
        const title = options.title || '🌍 حدد دولتك المفضلة';
        const subtitle = options.subtitle || 'يرجى تحديد دولتك لعرض طرق الدفع المحلية المعتمدة والوسيط الإقليمي الخاص بمنطقتك.';

        const modal = document.createElement('div');
        modal.id = 'waseet-country-modal';
        modal.className = 'waseet-dialog-overlay active';
        modal.style.cssText = 'position: fixed; inset: 0; z-index: 999999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.82); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 1rem; animation: fadeIn 0.3s ease;';

        const optionsHtml = COUNTRIES_LIST.map(c => {
            const isSelected = (c.code === currentCountry);
            return `<option value="${c.code}" ${isSelected ? 'selected' : ''}>${c.flag} ${c.name} (${c.code})</option>`;
        }).join('');

        modal.innerHTML = `
            <div class="card-3d animata-glow-card" style="background: linear-gradient(145deg, rgba(18, 24, 38, 0.98), rgba(9, 13, 22, 0.99)); border: 1.5px solid rgba(197, 160, 89, 0.45); border-radius: 22px; padding: 2rem; max-width: 480px; width: 100%; box-shadow: 0 25px 60px rgba(0,0,0,0.9), 0 0 35px rgba(197, 160, 89, 0.18); text-align: center; direction: rtl; font-family: var(--font-ar, 'Tajawal', sans-serif); color: #fff; position: relative;">
                ${allowCancel ? `<button type="button" id="btn-close-country-modal" style="position: absolute; top: 16px; left: 16px; background: rgba(255,255,255,0.08); border: none; color: #aaa; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s;"><i class="fas fa-times"></i></button>` : ''}
                
                <div style="width: 60px; height: 60px; margin: 0 auto 1.2rem; border-radius: 50%; background: radial-gradient(circle, rgba(197, 160, 89, 0.25) 0%, rgba(197, 160, 89, 0.05) 70%); border: 1.5px solid rgba(197, 160, 89, 0.5); display: flex; align-items: center; justify-content: center; font-size: 1.7rem; color: #c5a059;">
                    <i class="fas fa-globe-africa"></i>
                </div>

                <h3 style="font-size: 1.35rem; font-weight: 800; color: #dfb76c; margin-bottom: 0.6rem;">${title}</h3>
                <p style="font-size: 0.88rem; color: #94a3b8; line-height: 1.6; margin-bottom: 1.25rem;">${subtitle}</p>

                <!-- زر تحديد الموقع الفعلي عبر المتصفح HTML5 Geolocation API -->
                <div style="margin-bottom: 1.25rem;">
                    <button type="button" id="btn-modal-use-location" class="btn-location-gps" style="width: 100%; height: 46px; background: rgba(197, 160, 89, 0.12); border: 1.5px dashed rgba(197, 160, 89, 0.55); border-radius: 12px; color: #dfb76c; font-size: 0.95rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.25s ease;">
                        <i class="fas fa-location-crosshairs text-orange" style="color: #f59e0b;"></i> استخدام موقعي الحالي 📍
                    </button>
                    <div style="display: flex; align-items: center; gap: 0.75rem; margin: 0.9rem 0 0.4rem; color: #64748b; font-size: 0.8rem;">
                        <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
                        <span>أو حدد دولتك يدوياً من القائمة</span>
                        <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem; text-align: right;">
                    <label style="display: block; font-size: 0.82rem; color: #c5a059; font-weight: 700; margin-bottom: 0.5rem;">
                        <i class="fas fa-map-marker-alt"></i> اختر الدولة من القائمة:
                    </label>
                    <select id="waseet-country-select-input" style="width: 100%; height: 48px; background: rgba(10, 14, 24, 0.95); border: 1.5px solid rgba(197, 160, 89, 0.4); border-radius: 12px; color: #fff; font-size: 0.95rem; font-family: inherit; padding: 0 1rem; outline: none; transition: border-color 0.3s; cursor: pointer;">
                        <option value="" disabled ${!currentCountry ? 'selected' : ''}>-- اختر دولتك --</option>
                        ${optionsHtml}
                    </select>
                </div>

                <div style="display: flex; gap: 0.75rem; justify-content: center;">
                    <button type="button" id="btn-save-country-modal" class="btn-3d btn-gold" style="flex: 1; height: 46px; border-radius: 12px; font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer;">
                        <i class="fas fa-check-circle"></i> تأكيد وحفظ الدولة
                    </button>
                    ${allowCancel ? `<button type="button" id="btn-cancel-country-modal" style="flex: 0.6; height: 46px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; color: #cbd5e1; font-weight: 600; cursor: pointer; transition: all 0.2s;">لاحقاً</button>` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const selectEl = document.getElementById('waseet-country-select-input');
        const saveBtn = document.getElementById('btn-save-country-modal');
        const cancelBtn = document.getElementById('btn-cancel-country-modal');
        const closeBtn = document.getElementById('btn-close-country-modal');
        const locationBtn = document.getElementById('btn-modal-use-location');

        function closeModal() {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.25s ease';
            setTimeout(() => modal.remove(), 250);
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                sessionStorage.setItem('WASEET_COUNTRY_PROMPT_DISMISSED', 'true');
                closeModal();
            };
        }
        if (closeBtn) {
            closeBtn.onclick = () => {
                sessionStorage.setItem('WASEET_COUNTRY_PROMPT_DISMISSED', 'true');
                closeModal();
            };
        }

        // معالج زر تحديد الموقع الفعلي في النافذة المنبثقة
        if (locationBtn) {
            locationBtn.onclick = async () => {
                const originalHtml = locationBtn.innerHTML;
                locationBtn.disabled = true;
                locationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تحديد موقعك الفعلي...';

                try {
                    const result = await waseetDetectCountryViaGeolocation({ silent: false });
                    if (result && result.countryCode) {
                        if (!selectEl.querySelector(`option[value="${result.countryCode}"]`)) {
                            const opt = document.createElement('option');
                            opt.value = result.countryCode;
                            opt.textContent = `${result.flag || '📍'} ${result.countryName || result.countryCode} (${result.countryCode})`;
                            selectEl.appendChild(opt);
                        }
                        selectEl.value = result.countryCode;

                        closeModal();

                        if (typeof waseetAlert === 'function') {
                            waseetAlert('تم تحديد موقعك بنجاح 📍', `تم التعرف على موقعك وضبط الدولة: ${result.flag || '📍'} ${result.countryName}`, 'success');
                        }
                    }
                } catch (err) {
                    locationBtn.disabled = false;
                    locationBtn.innerHTML = originalHtml;
                    selectEl.focus();
                }
            };
        }

        saveBtn.onclick = async () => {
            const val = selectEl.value;
            if (!val) {
                selectEl.style.borderColor = '#ef4444';
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

            try {
                // 1. تخزين محلي
                localStorage.setItem('WASEET_DETECTED_COUNTRY', val);
                localStorage.setItem('WASEET_USER_MANUAL_COUNTRY_SET', 'true');

                // 2. تحديث كائن المستخدم في الذاكرة
                if (window.WASEET_STATE && window.WASEET_STATE.user) {
                    window.WASEET_STATE.user.country = val;
                }

                // 3. تحديث في قاعدة بيانات Supabase إن كان المستخدم مسجلاً
                const client = (typeof initWaseetSupabase === 'function') ? initWaseetSupabase() : null;
                const user = (window.WASEET_STATE && window.WASEET_STATE.user) ? window.WASEET_STATE.user : null;

                if (client && user && user.id && !user.isGuest) {
                    try {
                        await client
                            .from('profiles')
                            .update({ country: val, updated_at: new Date().toISOString() })
                            .eq('id', user.id);
                    } catch (dbErr) {
                        console.warn('[Country Modal] DB update note:', dbErr);
                    }
                }

                // 4. إطلاق حدث مخصص لإعادة تحميل الوسطاء وطرق الدفع
                window.dispatchEvent(new CustomEvent('waseet-country-changed', { detail: { country: val } }));

                // 5. تحديث بطاقة الوسيط في القائمة الجانبية فوراً
                if (typeof window.waseetResolveCurrentUserCountry === 'function') {
                    try {
                        const slot = document.getElementById('drawer-regional-broker-card');
                        if (slot && typeof window.waseetRenderRegionalBrokerCard === 'function') {
                            window.waseetRenderRegionalBrokerCard(slot);
                        }
                    } catch (e) {}
                }

                closeModal();

                if (typeof waseetAlert === 'function') {
                    const countryObj = COUNTRIES_LIST.find(c => c.code === val) || { name: val, flag: '🌍' };
                    waseetAlert('تم تحديد الدولة بنجاح', `تم تعيين دولتك: ${countryObj.flag} ${countryObj.name}`, 'success');
                }
            } catch (err) {
                console.error('[Country Modal Error]', err);
                closeModal();
            }
        };
    }

    // إتاحة الدوال عالمياً
    window.waseetPromptCountrySelection = waseetPromptCountrySelection;
    window.waseetDetectCountryViaGeolocation = waseetDetectCountryViaGeolocation;

    // فحص ذكي عند بدء التشغيل: إذا لم تكن هناك دولة محددة إطلاقاً بعد انتهاء المهلة، اطلب التحديد بلطف
    function scheduleCountryCheck() {
        if (sessionStorage.getItem('WASEET_COUNTRY_PROMPT_DISMISSED') === 'true') return;

        setTimeout(async () => {
            const country = (typeof waseetGetVisitorCountrySync === 'function' ? waseetGetVisitorCountrySync() : '') ||
                (window.WASEET_STATE && window.WASEET_STATE.user && window.WASEET_STATE.user.country) || '';

            if (!country) {
                // محاولة أخيرة للاكتشاف التلقائي عبر الـ IP
                if (typeof waseetDetectVisitorCountry === 'function') {
                    try {
                        const detected = await waseetDetectVisitorCountry();
                        if (detected) return; // تم الاكتشاف بنجاح، لا داعي لفتح النافذة
                    } catch (e) {}
                }
                // لم يتم التعرف على الدولة إطلاقاً، إظهار النافذة للمستخدم
                waseetPromptCountrySelection({ allowCancel: true });
            }
        }, 3200);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', scheduleCountryCheck);
    } else {
        scheduleCountryCheck();
    }
})();
