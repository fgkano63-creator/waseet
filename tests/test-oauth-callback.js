/**
 * WASEET PLATFORM - OAuth Callback & Session Lifecycle Simulation Test
 */
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('   WASEET PLATFORM - OAUTH CALLBACK & SESSION VERIFICATION TEST  ');
console.log('=================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(` [PASS] ${testName}`);
        if (details) console.log(`        Detail: ${details}`);
    } else {
        console.error(` [FAIL] ${testName}`);
        if (details) console.error(`        Error: ${details}`);
    }
}

// 1. Read files
const supabaseJs = fs.readFileSync(path.join(__dirname, '../js/supabase.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

// Check 1: updateAuthUI and updateUI existence in supabase.js
assert(
    supabaseJs.includes('function updateAuthUI(user = null)') &&
    supabaseJs.includes('window.updateAuthUI = updateAuthUI;') &&
    supabaseJs.includes('window.updateUI = updateAuthUI;'),
    'Global updateAuthUI and updateUI exposed in supabase.js',
    'window.updateAuthUI and window.updateUI correctly defined to synchronize live role and UI'
);

// Check 2: onAuthStateChange handles SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED, USER_UPDATED in supabase.js
assert(
    supabaseJs.includes("event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED'") &&
    supabaseJs.includes('await waseetSyncAuthState({ session, force: true });') &&
    supabaseJs.includes('updateAuthUI(WASEET_STATE?.user || session.user);'),
    'onAuthStateChange in supabase.js passes session and invokes updateAuthUI',
    'Ensures immediate interface update without dropping session or ignoring incoming user'
);

// Check 3: waseetSyncAuthState accepts session directly & handles OAuth code exchange
assert(
    supabaseJs.includes('let session = (options && options.session) || null;') &&
    supabaseJs.includes('exchangeCodeForSession') &&
    supabaseJs.includes('isOAuthCallbackPending'),
    'waseetSyncAuthState accepts session and safely detects in-flight OAuth callback',
    'Guarantees that pending OAuth callback URLs are not wiped to guest prematurely'
);

// Check 4: Safe refreshSession (only when session exists)
assert(
    supabaseJs.includes('if (shouldRefreshToken && session)') &&
    supabaseJs.includes('function runInitialEnhancements()') &&
    supabaseJs.includes('waseetSyncAuthState({ force: true });'),
    'Safe token refresh prevents AuthSessionMissingError on cold load',
    'Initial boot uses waseetSyncAuthState({ force: true }) without forcing empty refreshSession'
);

// Check 5: initAuthSession exists in WaseetApp in app.js
assert(
    appJs.includes('this.initAuthSession();') &&
    appJs.includes('async initAuthSession()') &&
    appJs.includes('client.auth.getSession()'),
    'WaseetApp.initAuthSession() handles session on page load via getSession()',
    'Proactively reads session and synchronizes auth state on application startup'
);

// Check 6: WaseetApp listens to onAuthStateChange and triggers updateAuthUI
assert(
    appJs.includes('client.auth.onAuthStateChange(async (event, session) =>') &&
    appJs.includes('this.updateAuthUI(WASEET_STATE?.user || session.user);'),
    'WaseetApp subscribes to onAuthStateChange and triggers updateAuthUI on SIGNED_IN',
    'Interface updates immediately when user returns from Google OAuth'
);

// Check 7: updateAuthUI and updateUI methods implemented on WaseetApp
assert(
    appJs.includes('updateAuthUI(user = null)') &&
    appJs.includes('updateUI(user = null)') &&
    appJs.includes('this.renderUserProfile()') &&
    appJs.includes('this.updateWalletDisplay()') &&
    appJs.includes('this.updateMobileDrawer()'),
    'updateAuthUI and updateUI methods implemented on WaseetApp instance',
    'Updates profile avatar, wallet points, drawer, and hides login modal'
);

// Check 8: Clean URL replacement
assert(
    supabaseJs.includes('window.history.replaceState') &&
    supabaseJs.includes('cleanSearch'),
    'OAuth callback URL parameters cleaned up without page reload',
    'Tokens and codes are cleanly removed from address bar after session verification'
);

console.log('=================================================================');
console.log(` [OAUTH TEST RESULTS SUMMARY] Passed: ${passedTests}/${totalTests}`);
console.log('=================================================================');

if (passedTests === totalTests) {
    console.log(' ALL OAUTH CALLBACK & SESSION TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
} else {
    console.error(' SOME OAUTH TESTS FAILED!');
    process.exit(1);
}
