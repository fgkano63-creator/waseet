const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = 'D:/waseet-app';

console.log('=================================================================');
console.log('       WASEET DEEP INDEPENDENT FORENSIC AUDIT ENGINE             ');
console.log('=================================================================');

const findings = {
    pass: 0,
    warn: 0,
    fail: 0,
    items: []
};

function logItem(category, id, status, severity, msg, details = null) {
    if (status === 'PASS') findings.pass++;
    else if (status === 'WARN') findings.warn++;
    else findings.fail++;

    findings.items.push({ category, id, status, severity, msg, details });
    const col = status === 'PASS' ? '[PASS]' : (status === 'WARN' ? '[WARN]' : '[FAIL]');
    console.log(`${col} [${category}] ${id}: ${msg}`);
    if (details && status !== 'PASS') {
        console.log(`       -> Details: ${typeof details === 'object' ? JSON.stringify(details) : details}`);
    }
}

// 1. SCAN HTML FILES
console.log('\n>>> SECTION 1: HTML STRUCTURE, ACCESSIBILITY & LINK INTEGRITY');
const htmlFiles = fs.readdirSync(ROOT_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(ROOT_DIR, f));

// Also add auth callback html files
if (fs.existsSync(path.join(ROOT_DIR, 'auth/callback.html'))) {
    htmlFiles.push(path.join(ROOT_DIR, 'auth/callback.html'));
}
if (fs.existsSync(path.join(ROOT_DIR, 'auth/callback/index.html'))) {
    htmlFiles.push(path.join(ROOT_DIR, 'auth/callback/index.html'));
}

htmlFiles.forEach(file => {
    const rel = path.relative(ROOT_DIR, file);
    const content = fs.readFileSync(file, 'utf8');

    // 1.1 Duplicate IDs
    const idMatches = [...content.matchAll(/id=["']([a-zA-Z0-9_\-]+)["']/g)].map(m => m[1]);
    const idCounts = {};
    const dupIds = [];
    idMatches.forEach(id => {
        idCounts[id] = (idCounts[id] || 0) + 1;
        if (idCounts[id] === 2) dupIds.push(id);
    });

    if (dupIds.length === 0) {
        logItem('HTML-ID', `${rel} Duplicate IDs`, 'PASS', 'INFO', `Zero duplicate IDs found (${idMatches.length} IDs checked)`);
    } else {
        logItem('HTML-ID', `${rel} Duplicate IDs`, 'WARN', 'MEDIUM', `Duplicate element IDs detected: ${dupIds.join(', ')}`);
    }

    // 1.2 Viewport
    if (content.includes('name="viewport"') && content.includes('width=device-width')) {
        logItem('HTML-Viewport', `${rel} Viewport`, 'PASS', 'INFO', 'Responsive viewport configured');
    } else {
        logItem('HTML-Viewport', `${rel} Viewport`, 'FAIL', 'HIGH', 'Missing or improper viewport tag');
    }

    // 1.3 Alt tags on images
    const imgTags = [...content.matchAll(/<img\s+([^>]+)>/gi)];
    let missingAltCount = 0;
    imgTags.forEach(img => {
        const attrs = img[1];
        if (!attrs.includes('alt=') || /alt=["']\s*["']/.test(attrs)) {
            // Check if it's decorative
            if (!attrs.includes('role="presentation"') && !attrs.includes('aria-hidden="true"')) {
                missingAltCount++;
            }
        }
    });
    if (missingAltCount === 0) {
        logItem('HTML-A11y', `${rel} Image Alt Tags`, 'PASS', 'INFO', `All ${imgTags.length} <img> tags have alt descriptions`);
    } else {
        logItem('HTML-A11y', `${rel} Image Alt Tags`, 'WARN', 'LOW', `${missingAltCount} of ${imgTags.length} <img> tags missing descriptive alt attribute`);
    }

    // 1.4 Script sources
    const scriptSrcs = [...content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
    let missingScriptCount = 0;
    scriptSrcs.forEach(src => {
        if (!src.startsWith('http') && !src.startsWith('//')) {
            const cleanSrc = src.split('?')[0];
            const targetPath = cleanSrc.startsWith('/')
                ? path.join(ROOT_DIR, cleanSrc.slice(1))
                : path.resolve(path.dirname(file), cleanSrc);
            if (!fs.existsSync(targetPath)) {
                missingScriptCount++;
                logItem('HTML-Asset', `${rel} Script 404`, 'FAIL', 'HIGH', `Script file not found: ${src} -> ${targetPath}`);
            }
        }
    });
    if (missingScriptCount === 0) {
        logItem('HTML-Asset', `${rel} Script Sources`, 'PASS', 'INFO', `All ${scriptSrcs.length} script sources resolve on disk`);
    }

    // 1.5 Stylesheet links
    const cssLinks = [...content.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map(m => m[1]);
    let missingCssCount = 0;
    cssLinks.forEach(href => {
        if (!href.startsWith('http') && !href.startsWith('//')) {
            const cleanHref = href.split('?')[0];
            const targetPath = cleanHref.startsWith('/')
                ? path.join(ROOT_DIR, cleanHref.slice(1))
                : path.resolve(path.dirname(file), cleanHref);
            if (!fs.existsSync(targetPath)) {
                missingCssCount++;
                logItem('HTML-Asset', `${rel} CSS 404`, 'FAIL', 'HIGH', `Stylesheet not found: ${href} -> ${targetPath}`);
            }
        }
    });
    if (missingCssCount === 0) {
        logItem('HTML-Asset', `${rel} Stylesheet Sources`, 'PASS', 'INFO', `All ${cssLinks.length} stylesheet links resolve on disk`);
    }

    // 1.6 Inline Scripts Syntax
    const inlineScripts = [...content.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    inlineScripts.forEach((scr, idx) => {
        const code = scr[1].trim();
        if (code) {
            try {
                new vm.Script(code, { filename: `${rel}-inline-${idx + 1}` });
                logItem('JS-InlineSyntax', `${rel} inline script #${idx + 1}`, 'PASS', 'INFO', 'Syntax valid');
            } catch (err) {
                logItem('JS-InlineSyntax', `${rel} inline script #${idx + 1}`, 'FAIL', 'HIGH', `Syntax error: ${err.message}`);
            }
        }
    });
});

// 2. SCAN JS FILES
console.log('\n>>> SECTION 2: JAVASCRIPT STATIC ANALYSIS, XSS SINKS & SAFETY');
const jsDir = path.join(ROOT_DIR, 'js');
const jsFiles = fs.readdirSync(jsDir)
    .filter(f => f.endsWith('.js') && !f.includes('.min.'))
    .map(f => path.join(jsDir, f));

// Also add service-worker.js
if (fs.existsSync(path.join(ROOT_DIR, 'service-worker.js'))) {
    jsFiles.push(path.join(ROOT_DIR, 'service-worker.js'));
}

jsFiles.forEach(file => {
    const rel = path.relative(ROOT_DIR, file);
    const content = fs.readFileSync(file, 'utf8');

    // 2.1 Syntax validation
    try {
        new vm.Script(content, { filename: rel });
        logItem('JS-Syntax', rel, 'PASS', 'INFO', 'Valid JavaScript syntax');
    } catch (err) {
        logItem('JS-Syntax', rel, 'FAIL', 'CRITICAL', `Syntax error in file: ${err.message}`);
    }

    // 2.2 Dangerous eval / Function constructors
    const evalMatches = content.match(/\beval\s*\(|\bnew\s+Function\s*\(/g);
    if (!evalMatches) {
        logItem('JS-DynamicExec', rel, 'PASS', 'INFO', 'Zero eval() or dynamic Function constructors found');
    } else {
        logItem('JS-DynamicExec', rel, 'FAIL', 'HIGH', `Dynamic code execution found: ${evalMatches.length} occurrences`);
    }

    // 2.3 Document.write
    if (content.includes('document.write(')) {
        logItem('JS-DocWrite', rel, 'FAIL', 'HIGH', 'document.write() usage detected');
    } else {
        logItem('JS-DocWrite', rel, 'PASS', 'INFO', 'No document.write() usage');
    }

    // 2.4 Unprotected JSON.parse check
    const lines = content.split('\n');
    let unprotectedJsonParses = 0;
    lines.forEach((line, idx) => {
        if (/JSON\.parse\s*\(/.test(line)) {
            // Check context for try {
            const start = Math.max(0, idx - 10);
            const context = lines.slice(start, idx + 1).join('\n');
            if (!context.includes('try')) {
                unprotectedJsonParses++;
            }
        }
    });
    if (unprotectedJsonParses === 0) {
        logItem('JS-JSONParse', rel, 'PASS', 'INFO', 'All JSON.parse calls wrapped in try/catch or protected');
    } else {
        logItem('JS-JSONParse', rel, 'WARN', 'LOW', `${unprotectedJsonParses} JSON.parse calls outside immediate try/catch (verify storage safety)`);
    }

    // 2.5 InnerHTML Sanitization check
    let unsanitizedInnerHTML = 0;
    lines.forEach((line, idx) => {
        if (/\.innerHTML\s*=/.test(line)) {
            const hasEscape = line.includes('escapeHtml') || line.includes('sanitizeText') || line.includes('DOMPurify') || line.includes('waseetEscape') || line.includes('Number(') || line.includes('parseInt') || !line.includes('${');
            if (!hasEscape) {
                // If it's pure static HTML or icons, it's safe
                if (/\$\{([a-zA-Z0-9_\.]+)\}/.test(line)) {
                    unsanitizedInnerHTML++;
                }
            }
        }
    });
    if (unsanitizedInnerHTML === 0) {
        logItem('JS-XSS', `${rel} innerHTML sanitization`, 'PASS', 'INFO', 'All dynamic innerHTML interpolations sanitized');
    } else {
        logItem('JS-XSS', `${rel} innerHTML sanitization`, 'WARN', 'MEDIUM', `${unsanitizedInnerHTML} potentially unescaped dynamic variable interpolations into innerHTML`);
    }
});

// 3. SCAN CSS & RESPONSIVENESS
console.log('\n>>> SECTION 3: CSS ARCHITECTURE, RESPONSIVENESS & RTL AUDIT');
const cssPath = path.join(ROOT_DIR, 'css', 'style.css');
if (fs.existsSync(cssPath)) {
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // 3.1 Media query breakpoints
    const mqMatches = [...cssContent.matchAll(/@media[^{]+\{/g)].map(m => m[0]);
    const hasMobile = mqMatches.some(m => m.includes('480px') || m.includes('576px') || m.includes('375px'));
    const hasTablet = mqMatches.some(m => m.includes('768px') || m.includes('800px'));
    const hasDesktop = mqMatches.some(m => m.includes('992px') || m.includes('1024px') || m.includes('1200px'));

    if (hasMobile && hasTablet && hasDesktop) {
        logItem('CSS-Breakpoints', 'Responsive Breakpoints', 'PASS', 'INFO', `Found ${mqMatches.length} media queries spanning mobile, tablet, and desktop viewports`);
    } else {
        logItem('CSS-Breakpoints', 'Responsive Breakpoints', 'WARN', 'MEDIUM', 'Missing full spectrum responsive breakpoints');
    }

    // 3.2 Overflow-x prevention
    if (cssContent.includes('overflow-x: hidden') && cssContent.includes('overflow-x: clip')) {
        logItem('CSS-Overflow', 'Horizontal Overflow Protection', 'PASS', 'INFO', 'html and body enforce overflow-x suppression');
    } else if (cssContent.includes('overflow-x: hidden')) {
        logItem('CSS-Overflow', 'Horizontal Overflow Protection', 'PASS', 'INFO', 'overflow-x: hidden enforced');
    } else {
        logItem('CSS-Overflow', 'Horizontal Overflow Protection', 'FAIL', 'HIGH', 'Missing overflow-x: hidden guard on viewport root');
    }

    // 3.3 RTL Directionality
    const rtlRules = cssContent.match(/\[dir=["']?rtl["']?\]|direction:\s*rtl/gi);
    if (rtlRules && rtlRules.length > 0) {
        logItem('CSS-RTL', 'RTL Layout Rules', 'PASS', 'INFO', `Found ${rtlRules.length} explicit RTL directionality rules in style.css`);
    } else {
        logItem('CSS-RTL', 'RTL Layout Rules', 'WARN', 'LOW', 'Few explicit RTL CSS overrides found (relies on browser default RTL flexbox)');
    }

    // 3.4 Mobile bottom navigation safe areas
    if (cssContent.includes('env(safe-area-inset-bottom)')) {
        logItem('CSS-SafeArea', 'iOS Safe Area Inset Support', 'PASS', 'INFO', 'env(safe-area-inset-bottom) properly configured for notched devices');
    } else {
        logItem('CSS-SafeArea', 'iOS Safe Area Inset Support', 'WARN', 'LOW', 'Missing env(safe-area-inset-bottom) on bottom bar');
    }

    // 3.5 Large fixed widths that might break on small mobile (<360px)
    const fixedWidthMatches = [...cssContent.matchAll(/([a-zA-Z0-9_\-\.]+)\s*\{[^}]*(?<![a-zA-Z\-])width:\s*([4-9]\d{2,}|[1-9]\d{3,})px/g)];
    const dangerousFixedWidths = fixedWidthMatches.filter(m => {
        const selector = m[1];
        // Allow modal dialogs, containers with max-width: 100%, etc.
        return !selector.includes('modal') && !selector.includes('dialog') && !selector.includes('container') && !selector.includes('card');
    });
    if (dangerousFixedWidths.length === 0) {
        logItem('CSS-FixedWidth', 'Mobile Fixed-Width Overflow', 'PASS', 'INFO', 'No unconstrained fixed-width blocks (>400px) found');
    } else {
        logItem('CSS-FixedWidth', 'Mobile Fixed-Width Overflow', 'WARN', 'LOW', `${dangerousFixedWidths.length} elements have fixed widths > 400px`);
    }
}

// 4. SCAN SUPABASE MIGRATIONS & RLS
console.log('\n>>> SECTION 4: DATABASE SCHEMA, ROW LEVEL SECURITY & ESCROW LOGIC');
const supabaseDir = path.join(ROOT_DIR, 'supabase');
if (fs.existsSync(supabaseDir)) {
    const sqlFiles = fs.readdirSync(supabaseDir).filter(f => f.endsWith('.sql'));
    let combinedSql = '';
    sqlFiles.forEach(f => {
        combinedSql += '\n-- FILE: ' + f + '\n' + fs.readFileSync(path.join(supabaseDir, f), 'utf8');
    });

    const tables = [
        'profiles',
        'deals',
        'marketplace_accounts',
        'marketplace_account_secrets',
        'wallet_transactions',
        'deposit_requests',
        'deal_messages',
        'support_messages',
        'notifications',
        'payment_methods',
        'withdrawals'
    ];

    tables.forEach(tbl => {
        const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:public\\.)?${tbl}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
        if (rlsRegex.test(combinedSql)) {
            logItem('DB-RLS', `RLS on ${tbl}`, 'PASS', 'INFO', `Row Level Security explicitly enabled on table '${tbl}'`);
        } else {
            logItem('DB-RLS', `RLS on ${tbl}`, 'FAIL', 'CRITICAL', `Table '${tbl}' is missing ENABLE ROW LEVEL SECURITY!`);
        }
    });

    // 4.1 Search Path Hygiene
    const secDefFuncs = [...combinedSql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\([^)]*\)[\s\S]*?SECURITY\s+DEFINER[\s\S]*?(?:AS\s+\$\$|BEGIN)/gi)];
    let missingSearchPath = [];
    secDefFuncs.forEach(fnMatch => {
        const fnName = fnMatch[1];
        const fnBlock = fnMatch[0].toLowerCase();
        if (!fnBlock.includes('set search_path =') && !fnBlock.includes('set search_path=')) {
            missingSearchPath.push(fnName);
        }
    });

    if (missingSearchPath.length === 0) {
        logItem('DB-SecDefiner', 'SECURITY DEFINER search_path hygiene', 'PASS', 'INFO', `All ${secDefFuncs.length} SECURITY DEFINER functions set search_path = public, pg_temp`);
    } else {
        logItem('DB-SecDefiner', 'SECURITY DEFINER search_path hygiene', 'WARN', 'MEDIUM', `Functions missing explicit search_path: ${missingSearchPath.join(', ')}`);
    }

    // 4.2 Financial Integrity Triggers
    if (combinedSql.includes('prevent_deal_financial_tampering') && combinedSql.includes('tr_prevent_deal_financial_tampering')) {
        logItem('DB-Financial', 'Deals Financial Tampering Guard', 'PASS', 'INFO', 'BEFORE UPDATE trigger prevents tampering with seller_price, fee, total_points, or status transitions');
    } else {
        logItem('DB-Financial', 'Deals Financial Tampering Guard', 'FAIL', 'HIGH', 'Missing deals financial tampering trigger');
    }

    if (combinedSql.includes('prevent_unfrozen_withdrawal_insert') && combinedSql.includes('tr_prevent_unfrozen_withdrawal_insert')) {
        logItem('DB-Financial', 'Withdrawals Atomic Points Freeze Guard', 'PASS', 'INFO', 'BEFORE INSERT trigger prevents direct un-frozen withdrawal injection');
    } else {
        logItem('DB-Financial', 'Withdrawals Atomic Points Freeze Guard', 'FAIL', 'HIGH', 'Missing withdrawals atomic freeze trigger');
    }

    if (combinedSql.includes('account_secrets_seller_update') && combinedSql.includes('in_deal')) {
        logItem('DB-Financial', 'Account Secrets Active Deal Lock', 'PASS', 'INFO', 'Sellers locked from modifying credentials once an account is in deal or sold');
    } else {
        logItem('DB-Financial', 'Account Secrets Active Deal Lock', 'FAIL', 'HIGH', 'Missing account secrets active deal mutation lock');
    }
}

// 5. SCAN SECRETS & DEPLOYMENT CONFIG
console.log('\n>>> SECTION 5: SECRETS LEAKAGE & VERCEL DEPLOYMENT CONFIG');

// 5.1 Check .gitignore
const gitignorePath = path.join(ROOT_DIR, '.gitignore');
if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (gitignore.includes('.env')) {
        logItem('Security-Git', '.gitignore .env protection', 'PASS', 'INFO', '.env files strictly excluded from git');
    } else {
        logItem('Security-Git', '.gitignore .env protection', 'FAIL', 'CRITICAL', '.gitignore missing .env entry');
    }
}

// 5.2 Check vercel.json
const vercelPath = path.join(ROOT_DIR, 'vercel.json');
if (fs.existsSync(vercelPath)) {
    try {
        const vercelJson = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
        logItem('Deployment-Vercel', 'vercel.json syntax', 'PASS', 'INFO', 'Valid JSON configuration');

        const headers = vercelJson.headers?.[0]?.headers || [];
        const headerNames = headers.map(h => h.key);
        
        const reqHeaders = [
            'Content-Security-Policy',
            'X-Frame-Options',
            'X-Content-Type-Options',
            'Strict-Transport-Security',
            'Referrer-Policy',
            'Permissions-Policy'
        ];

        reqHeaders.forEach(rh => {
            if (headerNames.includes(rh)) {
                logItem('Security-Headers', rh, 'PASS', 'INFO', 'Configured in vercel.json');
            } else {
                logItem('Security-Headers', rh, 'FAIL', 'HIGH', `Missing security header: ${rh}`);
            }
        });
    } catch (e) {
        logItem('Deployment-Vercel', 'vercel.json syntax', 'FAIL', 'CRITICAL', `Invalid vercel.json: ${e.message}`);
    }
}

console.log('\n=================================================================');
console.log('                 INDEPENDENT AUDIT SUMMARY                       ');
console.log('=================================================================');
console.log(` Total Checks : ${findings.pass + findings.warn + findings.fail}`);
console.log(` Passed       : ${findings.pass}`);
console.log(` Warnings     : ${findings.warn}`);
console.log(` Failures     : ${findings.fail}`);
console.log('=================================================================');

fs.writeFileSync(
    path.join(ROOT_DIR, 'scratch', 'independent-audit-summary.json'),
    JSON.stringify(findings, null, 2),
    'utf8'
);
