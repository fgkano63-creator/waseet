# ==============================================================================
# WASEET PLATFORM - DEEP AUTOMATED QUALITY, RESPONSIVENESS & SECURITY AUDIT
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = "D:\waseet-app"
$issues = @()
$stats = @{
    TotalChecks = 0
    PassCount = 0
    WarnCount = 0
    FailCount = 0
}

function Record-Check {
    param(
        [string]$Category,
        [string]$Item,
        [string]$Status, # "PASS", "WARN", "FAIL"
        [string]$Message,
        [string]$Severity = "INFO"
    )
    $stats.TotalChecks++
    if ($Status -eq "PASS") {
        $stats.PassCount++
    } elseif ($Status -eq "WARN") {
        $stats.WarnCount++
        $script:issues += [PSCustomObject]@{
            Category = $Category
            Item = $Item
            Status = $Status
            Severity = $Severity
            Message = $Message
        }
    } else {
        $stats.FailCount++
        $script:issues += [PSCustomObject]@{
            Category = $Category
            Item = $Item
            Status = $Status
            Severity = $Severity
            Message = $Message
        }
    }
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  STARTING DEEP AUTOMATED AUDIT: QUALITY, RESPONSIVENESS & SECURITY" -ForegroundColor Cyan
Write-Host "  Workspace: $root" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. HTML QUALITY, ASSET RESOLUTION & SEMANTICS AUDIT
# ------------------------------------------------------------------------------
Write-Host "`n>>> [SECTION 1] HTML QUALITY & ASSET RESOLUTION AUDIT" -ForegroundColor White

$htmlFiles = Get-ChildItem -Path $root -Filter "*.html" -Recurse | Where-Object { $_.FullName -notmatch "node_modules|\.git" }

foreach ($file in $htmlFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $relPath = $file.FullName.Replace($root, "").TrimStart("\/")
    $dir = $file.DirectoryName

    # 1.1 Doctype
    if ($content -match '<!DOCTYPE\s+html>') {
        Record-Check -Category "HTML-Quality" -Item "$relPath - DOCTYPE" -Status "PASS"
    } else {
        Record-Check -Category "HTML-Quality" -Item "$relPath - DOCTYPE" -Status "FAIL" -Message "Missing or malformed <!DOCTYPE html>" -Severity "HIGH"
    }

    # 1.2 Lang and Dir
    if ($content -match '<html[^>]+lang=["'']ar["''][^>]+dir=["'']rtl["'']' -or $content -match '<html[^>]+dir=["'']rtl["''][^>]+lang=["'']ar["'']') {
        Record-Check -Category "HTML-Quality" -Item "$relPath - RTL Lang" -Status "PASS"
    } else {
        Record-Check -Category "HTML-Quality" -Item "$relPath - RTL Lang" -Status "FAIL" -Message "Missing lang='ar' and dir='rtl' on <html> tag" -Severity "MEDIUM"
    }

    # 1.3 Charset UTF-8
    if ($content -match '<meta[^>]+charset=["'']?utf-8["'']?') {
        Record-Check -Category "HTML-Quality" -Item "$relPath - Charset" -Status "PASS"
    } else {
        Record-Check -Category "HTML-Quality" -Item "$relPath - Charset" -Status "FAIL" -Message "Missing UTF-8 charset declaration" -Severity "HIGH"
    }

    # 1.4 Viewport
    if ($content -match '<meta[^>]+name=["'']viewport["''][^>]+content=["''][^"'']*width=device-width') {
        Record-Check -Category "HTML-Quality" -Item "$relPath - Viewport" -Status "PASS"
    } else {
        Record-Check -Category "HTML-Quality" -Item "$relPath - Viewport" -Status "FAIL" -Message "Missing responsive viewport meta tag" -Severity "CRITICAL"
    }

    # 1.5 Title & Meta Description
    if ($content -match '<title>([^<]+)</title>') {
        Record-Check -Category "HTML-Quality" -Item "$relPath - Title" -Status "PASS"
    } else {
        Record-Check -Category "HTML-Quality" -Item "$relPath - Title" -Status "WARN" -Message "Missing <title> tag" -Severity "MEDIUM"
    }

    if ($content -match '<meta[^>]+name=["'']description["''][^>]+content=["'']([^"'']+)["'']') {
        Record-Check -Category "HTML-Quality" -Item "$relPath - Description" -Status "PASS"
    } else {
        Record-Check -Category "HTML-Quality" -Item "$relPath - Description" -Status "WARN" -Message "Missing meta description" -Severity "LOW"
    }

    # 1.6 Verify local script references exist
    $scriptMatches = [regex]::Matches($content, '<script[^>]+src=["'']([^"'']+)["'']')
    foreach ($sm in $scriptMatches) {
        $src = $sm.Groups[1].Value
        if ($src -notmatch '^https?://' -and $src -notmatch '^//') {
            $cleanSrc = ($src.Split('?'))[0]
            $resolved = if ($cleanSrc.StartsWith('/')) {
                [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $cleanSrc.TrimStart('/')))
            } else {
                [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dir, $cleanSrc))
            }
            if (Test-Path $resolved) {
                Record-Check -Category "Asset-Integrity" -Item "$relPath script: $cleanSrc" -Status "PASS"
            } else {
                Record-Check -Category "Asset-Integrity" -Item "$relPath script: $cleanSrc" -Status "FAIL" -Message "Referenced script does not exist: $resolved" -Severity "CRITICAL"
            }
        }
    }

    # 1.7 Verify local stylesheet / link references exist
    $linkMatches = [regex]::Matches($content, '<link[^>]+href=["'']([^"'']+)["'']')
    foreach ($lm in $linkMatches) {
        $href = $lm.Groups[1].Value
        if ($href -notmatch '^https?://' -and $href -notmatch '^//' -and $href -notmatch '^#' -and $href -notmatch '^mailto:') {
            $cleanHref = ($href.Split('?'))[0]
            $resolved = if ($cleanHref.StartsWith('/')) {
                [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $cleanHref.TrimStart('/')))
            } else {
                [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dir, $cleanHref))
            }
            if (Test-Path $resolved) {
                Record-Check -Category "Asset-Integrity" -Item "$relPath link: $cleanHref" -Status "PASS"
            } else {
                Record-Check -Category "Asset-Integrity" -Item "$relPath link: $cleanHref" -Status "FAIL" -Message "Referenced link target does not exist: $resolved" -Severity "HIGH"
            }
        }
    }

    # 1.8 Verify static img src references exist
    $imgMatches = [regex]::Matches($content, '<img[^>]+src=["'']([^"'']+)["'']')
    foreach ($im in $imgMatches) {
        $src = $im.Groups[1].Value
        if ($src -notmatch '^https?://' -and $src -notmatch '^data:' -and $src -notmatch '^\$\{') {
            $cleanSrc = ($src.Split('?'))[0]
            $resolved = if ($cleanSrc.StartsWith('/')) {
                [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $cleanSrc.TrimStart('/')))
            } else {
                [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dir, $cleanSrc))
            }
            if (Test-Path $resolved) {
                Record-Check -Category "Asset-Integrity" -Item "$relPath img: $cleanSrc" -Status "PASS"
            } else {
                Record-Check -Category "Asset-Integrity" -Item "$relPath img: $cleanSrc" -Status "WARN" -Message "Referenced image does not exist: $resolved" -Severity "MEDIUM"
            }
        }
    }

    # 1.9 Duplicate ID check in single HTML file
    $idMatches = [regex]::Matches($content, 'id=["'']([a-zA-Z0-9_\-]+)["'']')
    $idSet = @{}
    $dupIds = @()
    foreach ($im in $idMatches) {
        $idVal = $im.Groups[1].Value
        if ($idSet.ContainsKey($idVal)) {
            if ($idVal -notin $dupIds) { $dupIds += $idVal }
        } else {
            $idSet[$idVal] = 1
        }
    }
    if ($dupIds.Count -gt 0) {
        Record-Check -Category "HTML-Semantics" -Item "$relPath - Duplicate IDs" -Status "WARN" -Message "Duplicate IDs detected in page: $($dupIds -join ', ')" -Severity "MEDIUM"
    } else {
        Record-Check -Category "HTML-Semantics" -Item "$relPath - Unique IDs" -Status "PASS"
    }
}

# ------------------------------------------------------------------------------
# 2. RESPONSIVENESS & MOBILE UX AUDIT
# ------------------------------------------------------------------------------
Write-Host "`n>>> [SECTION 2] RESPONSIVENESS & MOBILE UX AUDIT" -ForegroundColor White

$cssPath = Join-Path $root "css\style.css"
if (Test-Path $cssPath) {
    $cssContent = Get-Content $cssPath -Raw -Encoding UTF8

    # 2.1 CSS Media queries count and breakpoints
    $mediaQueries = [regex]::Matches($cssContent, '@media[^{]+\{')
    $bpMobile = [regex]::Matches($cssContent, 'max-width:\s*(480px|576px|640px|375px)')
    $bpTablet = [regex]::Matches($cssContent, 'max-width:\s*(768px|800px|900px|992px)')
    $bpDesktop = [regex]::Matches($cssContent, 'min-width:\s*(1024px|1200px|1440px)')

    if ($mediaQueries.Count -ge 20) {
        Record-Check -Category "CSS-Responsive" -Item "Media Query Density" -Status "PASS" -Message "Total media queries: $($mediaQueries.Count) (Mobile: $($bpMobile.Count), Tablet: $($bpTablet.Count), Desktop: $($bpDesktop.Count))"
    } else {
        Record-Check -Category "CSS-Responsive" -Item "Media Query Density" -Status "WARN" -Message "Low media query count: $($mediaQueries.Count)" -Severity "MEDIUM"
    }

    # 2.2 Global horizontal overflow prevention
    if ($cssContent -match 'html\s*,\s*body[^{]*\{[^}]*overflow-x\s*:\s*hidden' -or $cssContent -match 'overflow-x\s*:\s*hidden\s*;\s*\}\s*body[^{]*\{[^}]*overflow-x\s*:\s*hidden') {
        Record-Check -Category "CSS-Responsive" -Item "Global Overflow-X Guard" -Status "PASS"
    } else {
        Record-Check -Category "CSS-Responsive" -Item "Global Overflow-X Guard" -Status "WARN" -Message "Missing explicit global overflow-x: hidden on html and body" -Severity "MEDIUM"
    }

    # 2.3 Mobile-friendly Touch Targets (buttons, nav links min padding/height)
    if ($cssContent -match '\.btn-3d' -and $cssContent -match 'min-height|padding:') {
        Record-Check -Category "CSS-TouchTargets" -Item "Interactive Button Sizing" -Status "PASS"
    } else {
        Record-Check -Category "CSS-TouchTargets" -Item "Interactive Button Sizing" -Status "WARN" -Message "Check interactive button sizing for touch screens" -Severity "LOW"
    }

    # 2.4 Mobile Drawer & Navigation responsive rules
    if ($cssContent -match '\.mobile-drawer' -or $cssContent -match '\.nav-menu') {
        Record-Check -Category "CSS-Navigation" -Item "Mobile Drawer Navigation Styles" -Status "PASS"
    } else {
        Record-Check -Category "CSS-Navigation" -Item "Mobile Drawer Navigation Styles" -Status "WARN" -Message "Mobile drawer rules not found in style.css" -Severity "LOW"
    }
}

# ------------------------------------------------------------------------------
# 3. CLIENT-SIDE SECURITY, XSS & PRIVACY AUDIT
# ------------------------------------------------------------------------------
Write-Host "`n>>> [SECTION 3] CLIENT-SIDE SECURITY & PRIVACY AUDIT" -ForegroundColor White

$jsFiles = Get-ChildItem -Path (Join-Path $root "js") -Filter "*.js" -Recurse | Where-Object { $_.FullName -notmatch "vendor|purify" }

foreach ($js in $jsFiles) {
    $code = Get-Content $js.FullName -Raw -Encoding UTF8
    $rel = $js.FullName.Replace($root, "").TrimStart("\/")

    # 3.1 Unescaped innerHTML check
    $rawInnerHtml = [regex]::Matches($code, '\.innerHTML\s*=\s*([^;]+);')
    $unsafeCount = 0
    foreach ($m in $rawInnerHtml) {
        $val = $m.Groups[1].Value.Trim()
        # Safe if uses DOMPurify, sanitize, esc(, or simple static tags
        $isSafe = ($val -match 'DOMPurify\.sanitize') -or 
                  ($val -match '\besc\(') -or 
                  ($val -match 'escapeHtml\(') -or 
                  ($val -match '^["''`][^$]*["''`]$') -or
                  ($val -match '^["''`]\s*<div class=') -or
                  ($val -match '^["''`]\s*<span') -or
                  ($val -match '^["''`]\s*<i class=') -or
                  ($val -match '^["''`]\s*<button') -or
                  ($val -match '^\s*`[\s\S]*`\s*$' -and ($val -match 'esc\(' -or $val -match 'DOMPurify\.sanitize'))
        if (-not $isSafe) {
            # Check if template literal with ${}
            if ($val -match '\$\{[^}]+\}' -and $val -notmatch 'esc\(' -and $val -notmatch 'DOMPurify') {
                $unsafeCount++
            }
        }
    }
    if ($unsafeCount -gt 0) {
        Record-Check -Category "Security-XSS" -Item "$rel - Direct innerHTML Interpolation" -Status "WARN" -Message "Found $unsafeCount unescaped template string innerHTML assignments without DOMPurify/esc" -Severity "HIGH"
    } else {
        Record-Check -Category "Security-XSS" -Item "$rel - innerHTML Sanitization" -Status "PASS"
    }

    # 3.2 Sinks: eval, document.write
    if ($code -match '\beval\s*\(') {
        Record-Check -Category "Security-DangerousSink" -Item "$rel - eval()" -Status "FAIL" -Message "Dangerous eval() usage detected" -Severity "CRITICAL"
    } else {
        Record-Check -Category "Security-DangerousSink" -Item "$rel - No eval" -Status "PASS"
    }

    if ($code -match 'document\.write\s*\(') {
        Record-Check -Category "Security-DangerousSink" -Item "$rel - document.write()" -Status "FAIL" -Message "Dangerous document.write() usage detected" -Severity "HIGH"
    } else {
        Record-Check -Category "Security-DangerousSink" -Item "$rel - No document.write" -Status "PASS"
    }

    # 3.3 Supabase service_role key leak
    if ($code -match 'service_role|sb_secret|serviceRole') {
        Record-Check -Category "Security-SecretLeak" -Item "$rel - Service Role Check" -Status "FAIL" -Message "Possible service_role reference in client code" -Severity "CRITICAL"
    } else {
        Record-Check -Category "Security-SecretLeak" -Item "$rel - No Service Role Leak" -Status "PASS"
    }
}

# ------------------------------------------------------------------------------
# 4. HTTP SECURITY HEADERS & VERCEL ARCHITECTURE AUDIT
# ------------------------------------------------------------------------------
Write-Host "`n>>> [SECTION 4] HTTP SECURITY HEADERS & VERCEL ARCHITECTURE AUDIT" -ForegroundColor White

$vercelJsonPath = Join-Path $root "vercel.json"
if (Test-Path $vercelJsonPath) {
    try {
        $vercel = Get-Content $vercelJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $headers = $vercel.headers
        $hasCsp = $false
        $hasHsts = $false
        $hasXfo = $false
        $hasNosniff = $false
        $hasReferrer = $false
        $hasPermissions = $false

        foreach ($entry in $headers) {
            foreach ($h in $entry.headers) {
                if ($h.key -eq "Content-Security-Policy") { $hasCsp = $true }
                if ($h.key -eq "Strict-Transport-Security") { $hasHsts = $true }
                if ($h.key -eq "X-Frame-Options") { $hasXfo = $true }
                if ($h.key -eq "X-Content-Type-Options") { $hasNosniff = $true }
                if ($h.key -eq "Referrer-Policy") { $hasReferrer = $true }
                if ($h.key -eq "Permissions-Policy") { $hasPermissions = $true }
            }
        }

        if ($hasCsp) { Record-Check -Category "Security-Headers" -Item "CSP" -Status "PASS" } else { Record-Check -Category "Security-Headers" -Item "CSP" -Status "FAIL" -Message "Content-Security-Policy header missing" -Severity "HIGH" }
        if ($hasHsts) { Record-Check -Category "Security-Headers" -Item "HSTS" -Status "PASS" } else { Record-Check -Category "Security-Headers" -Item "HSTS" -Status "FAIL" -Message "Strict-Transport-Security header missing" -Severity "HIGH" }
        if ($hasXfo) { Record-Check -Category "Security-Headers" -Item "X-Frame-Options" -Status "PASS" } else { Record-Check -Category "Security-Headers" -Item "X-Frame-Options" -Status "FAIL" -Message "X-Frame-Options header missing" -Severity "HIGH" }
        if ($hasNosniff) { Record-Check -Category "Security-Headers" -Item "X-Content-Type-Options" -Status "PASS" } else { Record-Check -Category "Security-Headers" -Item "X-Content-Type-Options" -Status "FAIL" -Message "X-Content-Type-Options header missing" -Severity "MEDIUM" }
        if ($hasReferrer) { Record-Check -Category "Security-Headers" -Item "Referrer-Policy" -Status "PASS" } else { Record-Check -Category "Security-Headers" -Item "Referrer-Policy" -Status "FAIL" -Message "Referrer-Policy header missing" -Severity "LOW" }
        if ($hasPermissions) { Record-Check -Category "Security-Headers" -Item "Permissions-Policy" -Status "PASS" } else { Record-Check -Category "Security-Headers" -Item "Permissions-Policy" -Status "FAIL" -Message "Permissions-Policy header missing" -Severity "LOW" }

        # Check OAuth callback rewrite
        $hasAuthRewrite = $false
        foreach ($rw in $vercel.rewrites) {
            if ($rw.source -match '/auth/callback' -and ($rw.destination -match 'callback\.html' -or $rw.destination -match 'callback/index\.html')) {
                $destFile = Join-Path $root ($rw.destination.TrimStart('/'))
                if (Test-Path $destFile) {
                    $hasAuthRewrite = $true
                }
            }
        }
        if ($hasAuthRewrite) {
            Record-Check -Category "Deployment-Vercel" -Item "Auth Callback Rewrite" -Status "PASS"
        } else {
            Record-Check -Category "Deployment-Vercel" -Item "Auth Callback Rewrite" -Status "FAIL" -Message "Missing OAuth /auth/callback rewrite" -Severity "CRITICAL"
        }
    } catch {
        Record-Check -Category "Deployment-Vercel" -Item "vercel.json Parse" -Status "FAIL" -Message "Failed to parse vercel.json: $($_.Exception.Message)" -Severity "CRITICAL"
    }
}

# ------------------------------------------------------------------------------
# 5. SUPABASE RLS, DATABASE & ESCROW INTEGRITY AUDIT
# ------------------------------------------------------------------------------
Write-Host "`n>>> [SECTION 5] SUPABASE RLS, DATABASE & ESCROW INTEGRITY AUDIT" -ForegroundColor White

$sqlFiles = Get-ChildItem -Path (Join-Path $root "supabase") -Filter "*.sql" | Sort-Object Name
$allSqlText = ($sqlFiles | ForEach-Object { Get-Content $_.FullName -Raw -Encoding UTF8 }) -join "`n"

# Verify all key tables have RLS enabled
$keyTables = @(
    'profiles', 'deals', 'marketplace_accounts', 'marketplace_account_secrets',
    'deal_messages', 'support_messages', 'wallet_transactions', 'deposit_requests',
    'withdrawals', 'payment_methods', 'broker_reviews', 'regional_brokers', 'notifications'
)

foreach ($tbl in $keyTables) {
    if ($allSqlText -match "ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?$tbl\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY") {
        Record-Check -Category "Database-RLS" -Item "Table $tbl RLS Enabled" -Status "PASS"
    } else {
        Record-Check -Category "Database-RLS" -Item "Table $tbl RLS Enabled" -Status "FAIL" -Message "Table $tbl missing ALTER TABLE ENABLE ROW LEVEL SECURITY" -Severity "CRITICAL"
    }
}

# Verify SECURITY DEFINER functions have search_path = public, pg_temp
$secDefinerMatches = [regex]::Matches($allSqlText, 'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_\.]+)[^;]+SECURITY\s+DEFINER[^;]+;')
$unsafeSecDefiners = @()
foreach ($m in $secDefinerMatches) {
    $fnDef = $m.Value
    $fnName = $m.Groups[1].Value
    if ($fnDef -notmatch 'SET\s+search_path\s*=\s*public') {
        $unsafeSecDefiners += $fnName
    }
}
if ($unsafeSecDefiners.Count -gt 0) {
    Record-Check -Category "Database-RLS" -Item "SECURITY DEFINER search_path Hygiene" -Status "WARN" -Message "Found $($unsafeSecDefiners.Count) SECURITY DEFINER functions without explicit search_path: $($unsafeSecDefiners -join ', ')" -Severity "HIGH"
} else {
    Record-Check -Category "Database-RLS" -Item "SECURITY DEFINER search_path Hygiene" -Status "PASS"
}

# Verify Escrow status manipulation & balance safeguards
$criticalTriggers = @(
    'tr_prevent_deal_financial_tampering',
    'tr_prevent_unfrozen_withdrawal_insert'
)
foreach ($trig in $criticalTriggers) {
    if ($allSqlText -match $trig) {
        Record-Check -Category "Database-Escrow" -Item "Trigger $trig" -Status "PASS"
    } else {
        Record-Check -Category "Database-Escrow" -Item "Trigger $trig" -Status "FAIL" -Message "Missing critical financial trigger $trig" -Severity "HIGH"
    }
}

# ------------------------------------------------------------------------------
# AUDIT SUMMARY OUTPUT
# ------------------------------------------------------------------------------
Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " [AUDIT COMPLETE] METRICS & FINDINGS" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Total Automated Checks : $($stats.TotalChecks)"
Write-Host " Passed                 : $($stats.PassCount)" -ForegroundColor Green
Write-Host " Warnings               : $($stats.WarnCount)" -ForegroundColor Yellow
Write-Host " Failures               : $($stats.FailCount)" -ForegroundColor Red
Write-Host "=================================================================" -ForegroundColor Cyan

if ($script:issues.Count -gt 0) {
    Write-Host "`n>>> ACTIONABLE FINDINGS DETECTED ($($script:issues.Count)):" -ForegroundColor Magenta
    $script:issues | Format-Table -AutoSize
} else {
    Write-Host "`n>>> 100% CLEAN: ZERO WARNINGS AND ZERO FAILURES DETECTED! <<<" -ForegroundColor Green
}
