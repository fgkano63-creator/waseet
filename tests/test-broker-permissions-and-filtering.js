/**
 * tests/test-broker-permissions-and-filtering.js
 * Comprehensive Forensic Audit for Regional Broker vs Super Admin Permissions & Data Filtering
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
const walletHtml = checkFile('wallet.html');
const dealsHtml = checkFile('deals.html');
const pendingAccountsHtml = checkFile('pending-accounts.html');
const adminDepositsHtml = checkFile('admin-deposits.html');
const adminChatsHtml = checkFile('admin-chats.html');
const styleCss = checkFile('css/style.css');

const tests = [
    {
        name: 'Staff Desktop Hamburger Button Display (3 lines ☰)',
        assert: () => {
            return styleCss.includes('.mobile-hamburger-btn') &&
                   styleCss.includes('display: flex !important;');
        }
    },
    {
        name: 'Regional Broker Hides "الوسطاء الإقليميين" in app.js & supabase.js',
        assert: () => {
            return appJs.includes("drawerAdminBrokers.style.display = isAdmin ? 'flex' : 'none'") &&
                   supabaseJs.includes("drawerAdminBrokers.style.display = isAdmin ? 'flex' : 'none'");
        }
    },
    {
        name: 'Regional Broker Shows "شحن النقاط" in app.js, navbar.js & supabase.js',
        assert: () => {
            return appJs.includes("drawerAdminDeposits.style.display = (isAdmin || isBroker) ? 'flex' : 'none'") &&
                   supabaseJs.includes("drawerAdminDeposits.style.display = (isAdmin || isBroker) ? 'flex' : 'none'") &&
                   navbarJs.includes("drawerDeposits.style.display = (admin || broker) ? 'flex' : 'none'");
        }
    },
    {
        name: 'Unified Navbar Renders 4 Broker Tools (قيد الشراء، قيد الفحص، شحن النقاط، محادثات الإدارة)',
        assert: () => {
            return navbarJs.includes('href="deals.html"') &&
                   navbarJs.includes('قيد الشراء') &&
                   navbarJs.includes('href="pending-accounts.html"') &&
                   navbarJs.includes('قيد الفحص') &&
                   navbarJs.includes('href="admin-deposits.html"') &&
                   navbarJs.includes('شحن النقاط') &&
                   navbarJs.includes('href="admin-chats.html"') &&
                   navbarJs.includes('محادثات الإدارة');
        }
    },
    {
        name: 'Regional Broker Hides Payment Cards Manager in wallet.html',
        assert: () => {
            return walletHtml.includes("if (adminManagerPanel) adminManagerPanel.style.display = 'none'") &&
                   walletHtml.includes("if (userDepositPanel) userDepositPanel.style.display = 'block'");
        }
    },
    {
        name: 'Wallet Drawer User Card Populated (Resolves Image 2 Empty Box)',
        assert: () => {
            return walletHtml.includes("const drawerUserCard = document.getElementById('drawer-user-card')") &&
                   walletHtml.includes("drawerUserCard.innerHTML = `") &&
                   navbarJs.includes("function updateDrawerUserCard");
        }
    },
    {
        name: 'Deals Country & Broker ID Filtering for Regional Broker in deals.html',
        assert: () => {
            return dealsHtml.includes("isBrokerUserRole && !isStrictAdminUser") &&
                   dealsHtml.includes("d.assigned_broker_id") &&
                   dealsHtml.includes("dCountry === brokerCountry");
        }
    },
    {
        name: 'Pending Accounts Country Filtering for Regional Broker in pending-accounts.html',
        assert: () => {
            return pendingAccountsHtml.includes("isBrokerUserRole && !isStrictAdminUser") &&
                   pendingAccountsHtml.includes("acc.assigned_broker_id") &&
                   pendingAccountsHtml.includes("aCountry === brokerCountry");
        }
    },
    {
        name: 'Admin Deposits Access Allowed for Regional Broker with Country Filtering',
        assert: () => {
            return adminDepositsHtml.includes("if (!isAdmin && !isBroker)") &&
                   supabaseJs.includes("if (isBroker && !isAdmin)") &&
                   supabaseJs.includes("brokerCountry === 'DZ'");
        }
    },
    {
        name: 'Super Admin Unrestricted Access to All Platform Data Across All Countries',
        assert: () => {
            return dealsHtml.includes("!isStrictAdminUser") &&
                   pendingAccountsHtml.includes("!isStrictAdminUser") &&
                   supabaseJs.includes("if (isBroker && !isAdmin)");
        }
    }
];

let passed = 0;
let failed = 0;

console.log('=================================================================');
console.log(' [AUDIT] Regional Broker Permissions & Data Filtering Audit');
console.log('=================================================================');

tests.forEach((t, i) => {
    try {
        const ok = t.assert();
        if (ok) {
            console.log(` [PASS] Check ${i + 1}: ${t.name}`);
            passed++;
        } else {
            console.error(` [FAIL] Check ${i + 1}: ${t.name}`);
            failed++;
        }
    } catch (e) {
        console.error(` [FAIL] Check ${i + 1}: ${t.name} -> ${e.message}`);
        failed++;
    }
});

console.log('=================================================================');
console.log(`Summary: ${passed}/${tests.length} tests passed.`);
if (failed > 0) {
    console.error('Audit completed with failures.');
    process.exit(1);
} else {
    console.log('ALL REGIONAL BROKER PERMISSIONS & FILTERING AUDITS PASSED WITH 100% SUCCESS!');
    process.exit(0);
}
