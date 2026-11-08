/**
 * js/security-validator.js
 * WASEET Platform - Centralized Security Validation & XSS/Injection Sanitizer
 * Implements strict input validation, Zod-inspired schemas, and DOMPurify sanitization.
 */

(function (window) {
    'use strict';

    // ── 1. تشفير وتحييد النصوص والأكواد (HTML Escaping & Sanitization) ──
    function waseetEscapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function waseetSanitizeText(str, options = {}) {
        if (str === null || str === undefined) return '';
        let raw = String(str);

        // 1. إذا كانت مكتبة DOMPurify متوفرة
        if (typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function') {
            const allowedTags = options.allowFormatting ? ['b', 'i', 'em', 'strong', 'br', 'code'] : [];
            raw = window.DOMPurify.sanitize(raw, {
                ALLOWED_TAGS: allowedTags,
                ALLOWED_ATTR: [],
                KEEP_CONTENT: true
            });
        } else {
            // تحييد صريح لكافة وسوم HTML في حال عدم توفر DOMPurify
            raw = raw.replace(/<[^>]*>/g, '');
        }

        // تشفير الحروف الخطرة لضمان قراءتها كنص عادي (Plain Text)
        return waseetEscapeHtml(raw);
    }

    // ── 2. محرك التحقق من صحة المدخلات (Zod/Joi Inspired Schema Validator) ──
    const WaseetValidator = {
        /**
         * التحقق من الاسم الظاهر أو اسم المتجر
         */
        name(val) {
            if (!val || typeof val !== 'string') {
                return { isValid: false, error: 'الاسم مطلوب', value: '' };
            }
            const clean = val.trim();
            if (clean.length < 2) {
                return { isValid: false, error: 'الاسم يجب أن يتكون من حرفين على الأقل', value: clean };
            }
            if (clean.length > 60) {
                return { isValid: false, error: 'الاسم طويل جداً (الحد الأقصى 60 حرفاً)', value: clean.slice(0, 60) };
            }
            // منع إدخال وسوم برمجية أو نصوص خبيثة
            if (/<[^>]*script/i.test(clean) || /javascript:/i.test(clean) || /<[^>]+>/i.test(clean)) {
                return { isValid: false, error: 'الاسم يحتوي على رموز أو وسوم برمجية غير مسموحة', value: '' };
            }
            return { isValid: true, value: clean };
        },

        /**
         * التحقق من رسائل الشات والدعم الفني
         */
        chatMessage(val) {
            if (!val || typeof val !== 'string') {
                return { isValid: false, error: 'نص الرسالة مطلوب', value: '' };
            }
            const clean = val.trim();
            if (clean.length === 0) {
                return { isValid: false, error: 'لا يمكن إرسال رسالة فارغة', value: '' };
            }
            if (clean.length > 1500) {
                return { isValid: false, error: 'الرسالة تتجاوز الحد الأقصى المسموح (1500 حرف)', value: clean.slice(0, 1500) };
            }
            // حظر أحداث JavaScript الخبيثة ومحاولات الحقن
            if (/<[^>]*script/i.test(clean) || /javascript:/i.test(clean) || /on\w+\s*=/i.test(clean)) {
                return { isValid: false, error: 'الرسالة تحتوي على أكواد غير مصرح بها', value: '' };
            }
            return { isValid: true, value: clean };
        },

        /**
         * التحقق من نصوص البحث وتعقيمها من أي محاولات حقن SQL/XSS
         */
        searchQuery(val) {
            if (!val) return { isValid: true, value: '' };
            let clean = String(val).trim();
            if (clean.length > 100) clean = clean.slice(0, 100);
            // إزالة أي وسوم HTML أو محاولات كسر المعاملات
            clean = clean.replace(/<[^>]*>/g, '').replace(/['";\\]/g, '');
            return { isValid: true, value: clean };
        },

        /**
         * التحقق الصارم من معرفات UUID لمنع حقن استعلامات PostgREST
         */
        uuid(val) {
            const str = String(val || '').trim();
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(str)) {
                return { isValid: false, error: 'المعرف الممرر غير صالح', value: null };
            }
            return { isValid: true, value: str.toLowerCase() };
        },

        /**
         * التحقق المباشر البولياني من معرف UUID
         */
        isValidUUID(val) {
            return this.uuid(val).isValid;
        },

        /**
         * التحقق من سلامة روابط الصور (Avatar & Account Images)
         */
        imageUrl(val) {
            if (!val) return { isValid: true, value: '' };
            const str = String(val).trim();
            if (str.length > 2000) {
                return { isValid: false, error: 'رابط الصورة طويل جداً', value: '' };
            }
            // منع بروتوكولات الحقن الشائعة (javascript:, data:text/html, vbscript:)
            if (/^(javascript:|data:text|vbscript:)/i.test(str)) {
                return { isValid: false, error: 'رابط الصورة غير آمن ومحظور', value: '' };
            }
            if (!/^(https?:\/\/|\/|assets\/|data:image\/)/i.test(str)) {
                return { isValid: false, error: 'يجب أن يبدأ الرابط بـ https:// أو مسار صورة محلي', value: '' };
            }
            return { isValid: true, value: str };
        },

        /**
         * التحقق من رقم الهاتف
         */
        phone(val) {
            if (!val) return { isValid: true, value: '' };
            const clean = String(val).trim();
            if (clean.length > 20) {
                return { isValid: false, error: 'رقم الهاتف طويل جداً', value: clean.slice(0, 20) };
            }
            if (!/^[0-9+\-\s()]+$/.test(clean)) {
                return { isValid: false, error: 'رقم الهاتف يحتوي على رموز غير صالحة', value: '' };
            }
            return { isValid: true, value: clean };
        },

        /**
         * التحقق من رمز الدولة
         */
        countryCode(val) {
            const str = String(val || 'DZ').trim().toUpperCase();
            if (!/^[A-Z]{2}$/.test(str)) {
                return { isValid: false, error: 'رمز الدولة غير صالح', value: 'DZ' };
            }
            return { isValid: true, value: str };
        },

        /**
         * فحص كائن كامل وفق مخطط Schema محدد (Zod-like API)
         */
        validateSchema(schema, data) {
            const errors = {};
            const cleanData = {};
            let hasError = false;

            for (const [key, validator] of Object.entries(schema)) {
                const res = validator(data ? data[key] : undefined);
                if (!res.isValid) {
                    errors[key] = res.error;
                    hasError = true;
                } else {
                    cleanData[key] = res.value;
                }
            }

            return {
                isValid: !hasError,
                errors,
                data: cleanData
            };
        }
    };

    // ── تصدير الكائن والدوال للنافذة العامة ──
    window.WaseetValidator = WaseetValidator;
    window.WaseetSecurity = {
        escapeHtml: waseetEscapeHtml,
        sanitizeText: waseetSanitizeText,
        validator: WaseetValidator
    };
    window.waseetEscapeHtml = waseetEscapeHtml;
    window.waseetSanitizeText = waseetSanitizeText;

})(typeof window !== 'undefined' ? window : globalThis);
