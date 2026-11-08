[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$tests = @(
    [PSCustomObject]@{ Name = "1. Core Architecture & Security Audit"; Script = "tests\audit-runner.ps1"; Type = "ps1" },
    [PSCustomObject]@{ Name = "2. Forensic Button & Interaction Auditor"; Script = "tests\button-auditor.ps1"; Type = "ps1" },
    [PSCustomObject]@{ Name = "3. OAuth 2.0 & Auth Security Runner"; Script = "tests\run-auth-tests.ps1"; Type = "ps1" },
    [PSCustomObject]@{ Name = "4. Self-Healing E2E Simulation Suite"; Script = "tests\self-healing-e2e-tester.ps1"; Type = "ps1" },
    [PSCustomObject]@{ Name = "5. Mobile Drawer Profile Header Audit"; Script = "tests\test-drawer-profile-header.ps1"; Type = "ps1" },
    [PSCustomObject]@{ Name = "6. Seller Profile & Store Card Audit"; Script = "tests\test-seller-profile-card.ps1"; Type = "ps1" },
    [PSCustomObject]@{ Name = "7. Master Automated Engine V3.0"; Script = "tests\audit-master-engine.js"; Type = "node" },
    [PSCustomObject]@{ Name = "8. OAuth Callback & Session Lifecycle Audit"; Script = "tests\test-oauth-callback.js"; Type = "node" },
    [PSCustomObject]@{ Name = "9. Regional Broker Permissions & Filtering Audit"; Script = "tests\test-broker-permissions-and-filtering.js"; Type = "node" },
    [PSCustomObject]@{ Name = "10. Regional Broker Card & Real-time Reactivity Audit"; Script = "tests\test-broker-card-and-realtime-reactivity.js"; Type = "node" },
    [PSCustomObject]@{ Name = "11. Dynamic Broker Rating, Credentials & Fake Broker Purge Audit"; Script = "tests\test-dynamic-rating-and-credentials.js"; Type = "node" },
    [PSCustomObject]@{ Name = "12. Deep Quality, Responsiveness & Security Audit"; Script = "tests\audit-deep-scan.ps1"; Type = "ps1" },
    [PSCustomObject]@{ Name = "13. Profile Dashboard & UI Libraries Integration Audit"; Script = "tests\test-profile-dashboard-and-ui-libraries.js"; Type = "node" },
    [PSCustomObject]@{ Name = "14. Forensic Deep Quality, Responsiveness & Security Audit"; Script = "tests\audit-forensic-deep.js"; Type = "node" },
    [PSCustomObject]@{ Name = "15. Cloudflare Security Audit & Vulnerability Suite"; Script = "tests\audit-cloudflare-security.js"; Type = "node" },
    [PSCustomObject]@{ Name = "16. Button Self-Reporting Sentinel & Interactive Scan"; Script = "tests\button-self-reporting-auditor.ps1"; Type = "ps1" }
)

$summary = @()

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "           WASEET PLATFORM - DAILY MASTER AUDIT                  " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

foreach ($t in $tests) {
    Write-Host "`n>>> Running: $($t.Name)..." -ForegroundColor Yellow
    if ($t.Type -eq "node") {
        $out = & agy-node $t.Script 2>&1
    } else {
        $out = & powershell -ExecutionPolicy Bypass -File $t.Script 2>&1
    }
    $outStr = $out -join "`n"
    $hasFail = ($outStr -match '\[FAIL\]') -or ($LASTEXITCODE -ne 0)

    $checksCount = 0
    if ($outStr -match '\[E2E SIMULATION AND VERIFICATION SUMMARY\][\s\S]*?Total Tests\s*:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match 'Total Checks Conducted\s*:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match 'Total Automated Checks\s*:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match 'Total Checks\s*:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match 'Total Elements Scanned\s*:\s*([0-9]+)' -or $outStr -match 'Total Buttons & Links Scanned:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match 'Total Tests\s*:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match '\[OAUTH TEST RESULTS SUMMARY\] Passed:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match 'ALL DRAWER PROFILE HEADER AUDITS PASSED') {
        $checksCount = 19
    } elseif ($outStr -match 'ALL SELLER PROFILE CARD AUDITS PASSED') {
        $checksCount = 18
    } elseif ($outStr -match 'ALL PROFILE DASHBOARD & UI LIBRARIES AUDITS PASSED') {
        $checksCount = 26
    } elseif ($outStr -match 'Total Security Checks\s*:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match 'Total Interactive Elements Audited\s*:\s*([0-9]+)') {
        $checksCount = [int]$Matches[1]
    } elseif ($outStr -match 'Summary:\s*([0-9]+)/') {
        $checksCount = [int]$Matches[1]
    }

    $status = if ($hasFail) { "FAIL" } else { "PASS" }
    $color = if ($hasFail) { "Red" } else { "Green" }
    Write-Host ">>> Status: [$status] (Checks: $checksCount)" -ForegroundColor $color

    $summary += [PSCustomObject]@{
        Suite = $t.Name
        Status = $status
        Checks = $checksCount
    }
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "                   DAILY AUDIT FINAL SUMMARY                     " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
$totalChecks = ($summary | Measure-Object -Property Checks -Sum).Sum
$allPassed = -not ($summary | Where-Object { $_.Status -ne "PASS" })

$summary | Format-Table -AutoSize

Write-Host "Total Verified Checks Across All Suites: $totalChecks" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "RESULT: ALL AUDIT SUITES PASSED WITH 100% SUCCESS!" -ForegroundColor Green
} else {
    Write-Host "RESULT: SOME AUDIT SUITES REPORTED ISSUES!" -ForegroundColor Red
}
Write-Host "=================================================================" -ForegroundColor Cyan
