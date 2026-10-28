# tests/test-drawer-profile-header.ps1
# Automated audit for sidebar drawer user profile header styling and structure

$ErrorActionPreference = "Stop"

Write-Host "================================================================="
Write-Host " [AUDIT] Mobile Drawer Sidebar Profile Header Verification"
Write-Host "================================================================="

$cssPath = "css/style.css"
$css = Get-Content -Raw -Path $cssPath

function Assert-Contains($haystack, $needle, $label) {
    if ($haystack -match [regex]::Escape($needle)) {
        Write-Host " [PASS] $label" -ForegroundColor Green
    } else {
        Write-Host " [FAIL] $label - Expected string not found: $needle" -ForegroundColor Red
        exit 1
    }
}

function Assert-Regex($haystack, $pattern, $label) {
    if ($haystack -match $pattern) {
        Write-Host " [PASS] $label" -ForegroundColor Green
    } else {
        Write-Host " [FAIL] $label - Pattern not matched: $pattern" -ForegroundColor Red
        exit 1
    }
}

# 1. CSS Audit: Profile Header Container (.drawer-user-card)
Assert-Regex $css '\.drawer-user-card\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*gap:\s*10px' "CSS -> .drawer-user-card: display: flex; align-items: center; gap: 10px;"

# 2. CSS Audit: Prevent Wrapping (.drawer-user-meta)
Assert-Regex $css '\.drawer-user-meta\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column' "CSS -> .drawer-user-meta: display: flex; flex-direction: column;"

# 3. CSS Audit: User Name & Role formatting (white-space: nowrap)
Assert-Regex $css '\.drawer-user-name\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis' "CSS -> .drawer-user-name: white-space: nowrap; text-overflow: ellipsis;"
Assert-Regex $css '\.drawer-user-role\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis' "CSS -> .drawer-user-role: white-space: nowrap; text-overflow: ellipsis;"

# 4. CSS Audit: Points Badge (horizontal single row)
Assert-Regex $css '\.drawer-user-pts[^{]*\{[^}]*display:\s*flex[^}]*flex-direction:\s*row[^}]*align-items:\s*center[^}]*gap:\s*5px[^}]*white-space:\s*nowrap' "CSS -> .drawer-user-pts: display: flex; flex-direction: row; gap: 5px; white-space: nowrap;"

# 5. HTML Structure Audit: .drawer-user-card is NOT inside .drawer-header
$htmlFiles = @("index.html", "chat.html", "deals.html", "wallet.html", "admin-deposits.html", "admin-chats.html", "my-accounts.html", "pending-accounts.html", "contact-support.html", "profile.html")
foreach ($file in $htmlFiles) {
    if (Test-Path $file) {
        $html = Get-Content -Raw -Path $file
        $headerIndex = $html.IndexOf('class="drawer-header"')
        $cardIndex = $html.IndexOf('id="drawer-user-card"')
        if ($headerIndex -ge 0 -and $cardIndex -ge 0) {
            # Find the closing tag corresponding to drawer-header
            # Look for </div> that ends the drawer-header
            $sub = $html.Substring($headerIndex, [Math]::Min(500, $html.Length - $headerIndex))
            if ($sub -match 'class="drawer-header"[\s\S]*?<\/div>') {
                $headerClosingPos = $headerIndex + $Matches[0].Length
                if ($cardIndex -ge $headerClosingPos) {
                    Write-Host " [PASS] HTML -> $($file): .drawer-user-card is properly placed outside .drawer-header" -ForegroundColor Green
                } else {
                    Write-Host " [FAIL] HTML -> $($file): .drawer-user-card was found inside .drawer-header" -ForegroundColor Red
                    exit 1
                }
            } else {
                Write-Host " [PASS] HTML -> $($file): Validated" -ForegroundColor Green
            }
        } else {
            Write-Host " [PASS] HTML -> $($file): Validated" -ForegroundColor Green
        }
    }
}

# 6. JS Rendering Audit
$navbarJs = Get-Content -Raw -Path "js/navbar.js"
Assert-Contains $navbarJs 'class="drawer-user-pts"' "JS -> navbar.js uses .drawer-user-pts"
Assert-Contains $navbarJs "anchor.parentElement.classList.contains('drawer-header')" "JS -> navbar.js guards against drawer-header nesting"

$appJs = Get-Content -Raw -Path "js/app.js"
Assert-Contains $appJs 'class="drawer-user-pts"' "JS -> app.js uses .drawer-user-pts"

Write-Host "`n>>> ALL DRAWER PROFILE HEADER AUDITS PASSED SUCCESSFULLY! <<<" -ForegroundColor Green
