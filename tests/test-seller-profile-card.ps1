# tests/test-seller-profile-card.ps1
# Automated audit for Seller Store & Profile Card in Account Details

$ErrorActionPreference = "Stop"

Write-Host "================================================================="
Write-Host " [AUDIT] Seller Profile & Store Card Interface Verification"
Write-Host "================================================================="

$css = Get-Content -Raw -Path "css/style.css"
$appJs = Get-Content -Raw -Path "js/app.js"
$supabaseJs = Get-Content -Raw -Path "js/supabase.js"

function Assert-Regex($haystack, $pattern, $label) {
    if ($haystack -match $pattern) {
        Write-Host " [PASS] $label" -ForegroundColor Green
    } else {
        Write-Host " [FAIL] $label - Pattern not matched: $pattern" -ForegroundColor Red
        exit 1
    }
}

function Assert-Contains($haystack, $needle, $label) {
    if ($haystack -match [regex]::Escape($needle)) {
        Write-Host " [PASS] $label" -ForegroundColor Green
    } else {
        Write-Host " [FAIL] $label - Needle not found: $needle" -ForegroundColor Red
        exit 1
    }
}

# 1. CSS Flexbox & Container Tests
Assert-Regex $css '\.deck-seller-card\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*space-between' "CSS -> .deck-seller-card: Flexbox layout with space-between"
Assert-Regex $css '\.seller-card-main\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center' "CSS -> .seller-card-main: Flexbox alignment"

# 2. CSS Avatar Styling Tests (54x54 circular, initial fallback, border, floating bottom nav)
Assert-Regex $css '\.seller-avatar-img\s*\{[^}]*width:\s*54px[^}]*height:\s*54px[^}]*border-radius:\s*50%' "CSS -> .seller-avatar-img: 54x54px circular avatar"
Assert-Regex $css '\.seller-avatar-initial\s*\{[^}]*border-radius:\s*50%' "CSS -> .seller-avatar-initial: circular colored initial fallback"
Assert-Regex $css '\.seller-avatar-img\s*\{[^}]*border:\s*2px\s+solid' "CSS -> .seller-avatar-img: border styling"
Assert-Regex $css '\.seller-verified-badge\s*\{[^}]*border-radius:\s*50%' "CSS -> .seller-verified-badge: verified badge styling"
Assert-Regex $css '\.mobile-bottom-nav\s*\{[^}]*bottom:\s*20px;[^}]*transform:\s*translateX\(-50%\);[^}]*width:\s*90%;[^}]*max-width:\s*400px;[^}]*border-radius:\s*25px;[^}]*box-shadow:\s*0\s+10px\s+30px\s+rgba\(0,\s*0,\s*0,\s*0\.5\);' "CSS -> .mobile-bottom-nav: floating bottom pill navigation"

# 3. CSS Visit Store Button & Responsive Styling
Assert-Regex $css '\.btn-visit-store\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center' "CSS -> .btn-visit-store: button styling"
Assert-Regex $css '@media\s*\(\s*max-width:\s*600px\s*\)\s*\{[^}]*\.deck-seller-card\s*\{[^}]*flex-direction:\s*column' "CSS -> Responsive mobile media query"

# 4. JavaScript Supabase Integration Tests
Assert-Regex $supabaseJs 'sellerAvatar:\s*sellerAvatar' "JS Supabase -> waseetMapRemoteAccountRow assigns sellerAvatar"
Assert-Regex $supabaseJs 'profileObj\s*&&\s*\(profileObj\.avatar_url' "JS Supabase -> extracts avatar_url from profiles table"
Assert-Regex $supabaseJs 'sellerAvatar:\s*account\.sellerAvatar' "JS Supabase -> waseetSaveAccountToSupabase preserves sellerAvatar in details"

# 5. JavaScript UI Modal (openCardDeck) Tests
Assert-Contains $appJs 'class="deck-seller-card"' "JS App -> openCardDeck renders .deck-seller-card"
Assert-Contains $appJs 'class="seller-avatar-img"' "JS App -> openCardDeck renders .seller-avatar-img"
Assert-Contains $appJs 'class="seller-verified-badge"' "JS App -> openCardDeck renders .seller-verified-badge"
Assert-Contains $appJs 'class="btn-visit-store"' "JS App -> openCardDeck renders .btn-visit-store"
Assert-Contains $appJs 'profile.html?id=' "JS App -> openCardDeck links to seller store profile.html?id="
Assert-Contains $appJs 'fallbackSellerAvatar' "JS App -> fallback placeholder configured for avatar"
Assert-Contains $appJs 'onerror="this.onerror=null;' "JS App -> onerror fallback guard configured on img"

Write-Host "`n>>> ALL SELLER PROFILE CARD AUDITS PASSED SUCCESSFULLY! (100%) <<<" -ForegroundColor Green
