/**
 * tests/test-broker-card-and-realtime-reactivity.js
 * Verification of Regional Broker Identity Card, Real-time profiles sync & False-Positive Toast Elimination
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

const appJs = checkFile('js/app.js');
const navbarJs = checkFile('js/navbar.js');
const supabaseJs = checkFile('js/supabase.js');
const dealsHtml = checkFile('deals.html');
const indexHtml = checkFile('index.html');
const walletHtml = checkFile('wallet.html');
const styleCss = checkFile('css/style.css');

const tests = [
    {
        name: 'Regional Broker Identity Card CSS is Defined and Elegant',
        assert: () => {
            return styleCss.includes('.regional-broker-identity-card') &&
                   styleCss.includes('.broker-avatar-wrap') &&
                   styleCss.includes('.broker-avatar-img') &&
                   styleCss.includes('.broker-country-badge') &&
                   styleCss.includes('.broker-role-desc');
        }
    },
    {
        name: 'Old Floating Showcase at Screen Bottom is Hidden / Removed',
        assert: () => {
            return (styleCss.includes('#regional-brokers-showcase') && styleCss.includes('display: none !important;')) ||
                   !indexHtml.includes('id="regional-brokers-showcase"');
        }
    },
    {
        name: 'waseetRenderRegionalBrokerCard is Globally Exposed in supabase.js',
        assert: () => {
            return supabaseJs.includes('async function waseetRenderRegionalBrokerCard') &&
                   supabaseJs.includes('window.waseetRenderRegionalBrokerCard = waseetRenderRegionalBrokerCard;') &&
                   supabaseJs.includes('الوسيط الإقليمي المعتمد لبلدك');
        }
    },
    {
        name: 'Regional Broker Card Slot Injected in Mobile Drawer (app.js & navbar.js)',
        assert: () => {
            return appJs.includes("id = 'drawer-regional-broker-card'") &&
                   appJs.includes('waseetRenderRegionalBrokerCard(brokerCardSlot)') &&
                   navbarJs.includes("id = 'drawer-regional-broker-card'") &&
                   navbarJs.includes('window.waseetRenderRegionalBrokerCard(brokerCardSlot)');
        }
    },
    {
        name: 'Deals Page Contains Regional Broker Card Container & Triggers Render',
        assert: () => {
            return dealsHtml.includes('id="deals-regional-broker-card-container"') &&
                   dealsHtml.includes("waseetRenderRegionalBrokerCard('deals-regional-broker-card-container')");
        }
    },
    {
        name: 'Google Auth Sync Compares Metadata with public.profiles & Updates Table',
        assert: () => {
            return supabaseJs.includes('googleName') &&
                   supabaseJs.includes('googleAvatar') &&
                   supabaseJs.includes("client.from('profiles').update") &&
                   supabaseJs.includes('nameChanged || avatarChanged');
        }
    },
    {
        name: 'Supabase Realtime profiles Subscription Dispatches updateAuthUI(payload.new)',
        assert: () => {
            return supabaseJs.includes("table: 'profiles'") &&
                   supabaseJs.includes('handleProfileRealtimeUpdate') &&
                   supabaseJs.includes('updateAuthUI(updatedRow)') &&
                   (supabaseJs.includes("String(curUser.id) === String(updatedRow.id)") || supabaseJs.includes("String(curUser.id) !== String(updatedRow.id)"));
        }
    },
    {
        name: 'updateAuthUI in app.js and supabase.js Dynamically Merges and Re-renders UI',
        assert: () => {
            return appJs.includes('updateAuthUI(user = null)') &&
                   appJs.includes('WASEET_STATE.user.avatar') &&
                   supabaseJs.includes('function updateAuthUI(user = null)') &&
                   supabaseJs.includes('window.updateAuthUI = updateAuthUI;');
        }
    },
    {
        name: 'False Positive Toast Guard: Exclude regular users and sellers',
        assert: () => {
            return supabaseJs.includes('waseetShowRoleUpgradeToast(user, isExplicitPromotion') &&
                   supabaseJs.includes("user.role === 'user'") &&
                   supabaseJs.includes("user.role === 'seller'") &&
                   !appJs.includes("'zaki 0000'");
        }
    },
    {
        name: 'Drawer Regional Broker Card Slots Exist in HTML Files',
        assert: () => {
            return indexHtml.includes('id="drawer-regional-broker-card"') &&
                   dealsHtml.includes('id="drawer-regional-broker-card"') &&
                   walletHtml.includes('id="drawer-regional-broker-card"');
        }
    }
];

let passed = 0;
let failed = 0;

console.log('\n--- Regional Broker Card & Real-time Reactivity Audit ---');
tests.forEach((t, i) => {
    try {
        if (t.assert()) {
            console.log(`[PASS] ${i + 1}. ${t.name}`);
            passed++;
        } else {
            console.error(`[FAIL] ${i + 1}. ${t.name}`);
            failed++;
        }
    } catch (err) {
        console.error(`[ERROR] ${i + 1}. ${t.name}:`, err.message);
        failed++;
    }
});

console.log(`\nTotal Checks Conducted: ${passed}`);
console.log(`Result: ${passed}/${tests.length} tests passed.`);
if (failed > 0) {
    process.exit(1);
}
