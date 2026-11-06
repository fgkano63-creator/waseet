/**
 * tests/test-dynamic-rating-and-credentials.js
 * Comprehensive Forensic Audit for:
 * 1. 4-Field Buyer Credentials Display (Account Email, Account Password, Recovery Email, Recovery Password)
 * 2. Permanent Account Deletion & Ghost Listings Elimination
 * 3. Demote/Strip Fake Brokers (zaki 0000 & Ibrahim Jalali in DZ) while keeping Ibrahim in SY and Massimo in DZ
 * 4. Live Online Status Glow Indicators (.online & .offline)
 * 5. Dynamic Broker Review System & Mean Rating Calculation Starting from 0
 */

const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');

function checkFile(relPath) {
    const fullPath = path.join(repoDir, relPath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${relPath}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
}

const supabaseJs = checkFile('js/supabase.js');
const myAccountsHtml = checkFile('my-accounts.html');
const escrowJs = checkFile('js/escrow.js');
const styleCss = checkFile('css/style.css');
const migration28 = checkFile('supabase/28_broker_reviews_and_dynamic_rating.sql');

const tests = [
    {
        name: '4-Field Credentials in my-accounts.html (Primary Email, Primary Pwd, Recovery Email, Recovery Pwd)',
        assert: () => {
            return myAccountsHtml.includes('بيانات الدخول الأساسية للحساب') &&
                   myAccountsHtml.includes('حساب الاسترداد والتأمين (Recovery Account)') &&
                   myAccountsHtml.includes('p-modal-email') &&
                   myAccountsHtml.includes('p-modal-pwd') &&
                   myAccountsHtml.includes('p-modal-rec-email') &&
                   myAccountsHtml.includes('p-modal-rec-pwd') &&
                   myAccountsHtml.includes('copyAllPurchasedCredentials');
        }
    },
    {
        name: '4-Field Credentials in escrow.js Delivery Modal & Buyer Card',
        assert: () => {
            return escrowJs.includes('بيانات الدخول الأساسية') &&
                   escrowJs.includes('حساب الاسترداد والتأمين') &&
                   escrowJs.includes('modal-buyer-email') &&
                   escrowJs.includes('modal-buyer-pwd') &&
                   escrowJs.includes('modal-buyer-rec-email') &&
                   escrowJs.includes('modal-buyer-rec-pwd') &&
                   escrowJs.includes('copyBuyerRecoveryEmail') &&
                   escrowJs.includes('copyBuyerRecoveryPassword');
        }
    },
    {
        name: 'Permanent Account Deletion (delete_marketplace_account RPC in Migration 28)',
        assert: () => {
            return migration28.includes('CREATE OR REPLACE FUNCTION public.delete_marketplace_account') &&
                   migration28.includes('DELETE FROM public.marketplace_account_secrets WHERE account_id = p_account_id;') &&
                   migration28.includes('DELETE FROM public.marketplace_accounts WHERE id = p_account_id;') &&
                   supabaseJs.includes('async function waseetDeleteMarketplaceAccount') &&
                   myAccountsHtml.includes('window.waseetDeleteMarketplaceAccount(accId)');
        }
    },
    {
        name: 'Ghost Listings Prevention (LocalStorage & State Purge on Delete)',
        assert: () => {
            return supabaseJs.includes("localStorage.setItem('WASEET_USER_ACCOUNTS'") &&
                   supabaseJs.includes("localStorage.setItem('waseet_accounts'") &&
                   myAccountsHtml.includes("localStorage.setItem('WASEET_USER_ACCOUNTS'");
        }
    },
    {
        name: 'Fake Brokers Stripped in Migration 28 (zaki 0000 & Ibrahim Jalali in DZ)',
        assert: () => {
            return migration28.includes("name ILIKE '%zaki%0000%'") &&
                   migration28.includes("email ILIKE '%z1a2k4i5%'") &&
                   migration28.includes("name ILIKE '%إبراهيم جلالي%'") &&
                   migration28.includes("DELETE FROM public.regional_brokers");
        }
    },
    {
        name: 'Client-side Fake Broker Purge (isFakeBrokerRecord filters zaki & Ibrahim in DZ, keeps Syria & Massimo)',
        assert: () => {
            // Test the function definition directly from the source code
            const match = supabaseJs.match(/function\s+isFakeBrokerRecord\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
            if (!match) return false;

            const fn = new Function('b', match[0] + '; return isFakeBrokerRecord(b);');

            const fakeZaki = fn({ name: 'zaki 0000', email: 'z1a2k4i5@gmail.com', country: 'DZ' });
            const fakeIbrahimDZ = fn({ name: 'إبراهيم جلالي', email: 'ibrahim@gmail.com', country: 'DZ' });
            const keepIbrahimSY = fn({ name: 'ابراهيم جللي', email: 'syria_broker@gmail.com', country: 'SY' });
            const keepMassimoDZ = fn({ name: 'Massimo Moussaoui', email: 'massimo@gmail.com', country: 'DZ' });

            return fakeZaki === true &&
                   fakeIbrahimDZ === true &&
                   keepIbrahimSY === false &&
                   keepMassimoDZ === false;
        }
    },
    {
        name: 'Live Online Status Indicator (.online glow & .offline dimmed in style.css & supabase.js)',
        assert: () => {
            return styleCss.includes('.global-broker-online-dot.online') &&
                   styleCss.includes('.global-broker-online-dot.offline') &&
                   supabaseJs.includes('global-broker-online-dot ${isOnline ? \'online\' : \'offline\'}');
        }
    },
    {
        name: 'Dynamic Rating & Deals Start From 0 (No hardcoded 28 or 5.0 fallback)',
        assert: () => {
            return !supabaseJs.includes('completedDealsCount = 28') &&
                   supabaseJs.includes('const dealsCount = Number(broker.completed_deals || 0);') &&
                   supabaseJs.includes('const rating = Number(broker.rating || 0.0).toFixed(1);');
        }
    },
    {
        name: 'Broker Reviews Table & submit_broker_review RPC in Migration 28',
        assert: () => {
            return migration28.includes('CREATE TABLE IF NOT EXISTS public.broker_reviews') &&
                   migration28.includes('CREATE OR REPLACE FUNCTION public.submit_broker_review') &&
                   migration28.includes('CREATE OR REPLACE FUNCTION public.get_broker_rating_stats');
        }
    },
    {
        name: 'Client Broker Review Modal & Functions (waseetSubmitBrokerReview, waseetOpenBrokerReviewModal)',
        assert: () => {
            return supabaseJs.includes('waseetSubmitBrokerReview') &&
                   supabaseJs.includes('waseetGetBrokerRatingStats') &&
                   supabaseJs.includes('waseetOpenBrokerReviewModal') &&
                   styleCss.includes('.broker-review-modal-card') &&
                   styleCss.includes('.broker-star-rating-row');
        }
    }
];

console.log('=================================================================');
console.log('   DYNAMIC RATING, CREDENTIALS & FAKE BROKER PURGE AUDIT         ');
console.log('=================================================================');

let passed = 0;
let failed = 0;

tests.forEach((t, i) => {
    try {
        const ok = t.assert();
        if (ok) {
            console.log(`[PASS] (${i + 1}/${tests.length}) ${t.name}`);
            passed++;
        } else {
            console.error(`[FAIL] (${i + 1}/${tests.length}) ${t.name}`);
            failed++;
        }
    } catch (err) {
        console.error(`[FAIL] (${i + 1}/${tests.length}) ${t.name} -> Error: ${err.message}`);
        failed++;
    }
});

console.log('=================================================================');
console.log(`Summary: ${passed}/${tests.length} tests passed (${failed} failed)`);
console.log('=================================================================');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
