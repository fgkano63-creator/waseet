# ==============================================================================
# WASEET PLATFORM - AUTOMATED BUTTON CLICK TESTING & SELF-REPORTING ENGINE
# Location: D:\waseet-app\tests\button-self-reporting-auditor.ps1
#
# Partners: AntiGravity (Lead AI) & OpenCode (First Assistant)
# Purpose : Forensic button audit across all pages with automated Self-Reporting
#           via Webhook and API endpoint to summon agents upon failure.
# ==============================================================================

param (
    [string]$WebhookUrl = "http://localhost:5055/webhook/button-alert",
    [string]$ApiEndpoint = "http://localhost:5055/api/log-error",
    [switch]$SimulateFailure,
    [switch]$TestWebhookOnly
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " [WASEET AUTOMATED CLICK TESTING & SELF-REPORTING SENTINEL]" -ForegroundColor Cyan
Write-Host " Collaboration: AntiGravity & OpenCode (First Assistant)" -ForegroundColor DarkCyan
Write-Host " Target Base  : D:\waseet-app" -ForegroundColor DarkCyan
Write-Host " Timestamp    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkCyan
Write-Host "================================================================================" -ForegroundColor Cyan

$root = "D:\waseet-app"
$queueFile = Join-Path $root "tests\broken-buttons-queue.json"

if (-not (Test-Path $queueFile)) {
    "[]" | Out-File -FilePath $queueFile -Encoding UTF8
}

function Dispatch-BrokenButtonAlert {
    param (
        [PSCustomObject]$Payload
    )

    $jsonPayload = $Payload | ConvertTo-Json -Depth 6

    # 1. Append to Local Persistent Agent Queue
    try {
        $rawQueue = Get-Content $queueFile -Raw -Encoding UTF8
        $queue = if ($rawQueue) { $rawQueue | ConvertFrom-Json } else { @() }
        if ($queue -isnot [System.Collections.IEnumerable] -or $queue -is [string]) { $queue = @($queue) }
        $queue += $Payload
        if ($queue.Count -gt 50) { $queue = $queue[-50..-1] }
        $queue | ConvertTo-Json -Depth 6 | Out-File -FilePath $queueFile -Encoding UTF8
        Write-Host "   -> Logged to persistent incident queue: tests\broken-buttons-queue.json" -ForegroundColor DarkGray
    } catch {
        Write-Host "   -> [Queue Warning] $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # 2. Terminal Alarm Banner
    Write-Host ""
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Red
    Write-Host " [CRITICAL BUTTON FAILURE ALERT DISPATCHED]" -ForegroundColor Red
    Write-Host "   Page URL : $($Payload.page.url)" -ForegroundColor White
    Write-Host "   Selector : $($Payload.element.selector) [ID: $($Payload.element.id), Class: $($Payload.element.className)]" -ForegroundColor Yellow
    Write-Host "   Text     : $($Payload.element.buttonText)" -ForegroundColor White
    Write-Host "   Failure  : $($Payload.failure.code) - $($Payload.failure.detailedReason)" -ForegroundColor Red
    Write-Host "   Action   : Dispatched to AntiGravity & OpenCode for IMMEDIATE HOTFIX" -ForegroundColor Green
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Red
    Write-Host ""

    # 3. Dispatch to Webhook
    if ($WebhookUrl) {
        try {
            $bodyToSend = $jsonPayload

            if ($WebhookUrl -like "*discord.com/api/webhooks*") {
                $discordBody = @{
                    username = "Waseet Self-Reporting Sentinel"
                    content = "[CRITICAL ALERT] Broken Button Detected -> Summoning AntiGravity & OpenCode"
                    embeds = @(
                        @{
                            title = "Button Failure: " + $Payload.failure.title
                            color = 15158332
                            fields = @(
                                @{ name = "Page URL"; value = [string]$Payload.page.url; inline = $false },
                                @{ name = "Selector"; value = [string]$Payload.element.selector; inline = $true },
                                @{ name = "Button Text"; value = [string]$Payload.element.buttonText; inline = $true },
                                @{ name = "Failure Reason"; value = [string]$Payload.failure.detailedReason; inline = $false },
                                @{ name = "Suggested Fix"; value = [string]$Payload.agentDispatch.suggestedFix; inline = $false }
                            )
                        }
                    )
                }
                $bodyToSend = $discordBody | ConvertTo-Json -Depth 6
            }

            $response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $bodyToSend -ContentType "application/json" -TimeoutSec 3 -ErrorAction Stop
            Write-Host "   [+] Webhook Dispatched Successfully to $WebhookUrl" -ForegroundColor Green
        } catch {
            Write-Host "   [-] Webhook endpoint offline or unreachable ($WebhookUrl): $($_.Exception.Message)" -ForegroundColor DarkYellow
            Write-Host "       (Alert safely recorded in persistent queue for AntiGravity & OpenCode inspection)" -ForegroundColor DarkGray
        }
    }
}

# Webhook Health Test Only
if ($TestWebhookOnly) {
    Write-Host ""
    Write-Host "[*] Dispatching Synthetic Test Alert to Webhook..." -ForegroundColor Yellow
    $testPayload = [PSCustomObject]@{
        alertType = "BROKEN_BUTTON_DETECTED"
        severity = "CRITICAL"
        timestamp = (Get-Date).ToString("o")
        environment = "Development Test"
        page = [PSCustomObject]@{
            url = "http://localhost:5055/deals.html"
            pathname = "/deals.html"
            title = "Waseet Platform | Deals Market"
        }
        element = [PSCustomObject]@{
            tagName = "BUTTON"
            id = "test-btn-confirm"
            className = "btn-3d btn-gold"
            selector = "button#test-btn-confirm.btn-3d"
            buttonText = "Complete Deal Now"
        }
        failure = [PSCustomObject]@{
            code = "Z_INDEX_COVERED"
            title = "Click Intercepted by Higher Z-Index Overlay"
            detailedReason = "Physical click is blocked because element 'div#modal-backdrop.active' (z-index: 9999) covers this button."
        }
        agentDispatch = [PSCustomObject]@{
            summonTargets = @("AntiGravity", "OpenCode (First Assistant)")
            priority = "IMMEDIATE_ACTION_REQUIRED"
            suggestedFix = "Adjust modal backdrop z-index or add pointer-events: none when modal is closing."
        }
    }
    Dispatch-BrokenButtonAlert -Payload $testPayload
    exit 0
}

# Scan Codebase
$htmlFiles = Get-ChildItem -Path $root -Filter '*.html' -Recurse | Where-Object { $_.FullName -notmatch '\\(tests|brain|vendor-ui)\\' }
$jsFiles = Get-ChildItem -Path (Join-Path $root "js") -Filter '*.js' -Recurse

Write-Host ""
Write-Host "[*] Indexing JavaScript interactive scopes..." -ForegroundColor White
$allJsContent = ""
foreach ($jf in $jsFiles) {
    $allJsContent += "`n" + (Get-Content $jf.FullName -Raw -Encoding UTF8)
}

$totalButtons = 0
$passedButtons = 0
$failedButtons = 0
$brokenButtonList = @()

Write-Host "[*] Auditing $($htmlFiles.Count) HTML pages for button health & click integrity..." -ForegroundColor White

foreach ($hf in $htmlFiles) {
    $rel = $hf.FullName.Replace($root, '').TrimStart('\', '/')
    $content = Get-Content $hf.FullName -Raw -Encoding UTF8

    # Combine page inline scripts with global JS
    $pageJs = $allJsContent
    $inlineScripts = [regex]::Matches($content, '<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>')
    foreach ($is in $inlineScripts) {
        $pageJs += "`n" + $is.Groups[1].Value
    }

    # 1. Audit Buttons: <button ...>...</button>
    $btnMatches = [regex]::Matches($content, '<button\b([^>]*)>(.*?)<\/button>', [System.Text.RegularExpressions.RegexOptions]::Singleline)

    foreach ($bm in $btnMatches) {
        $totalButtons++
        $attrs = $bm.Groups[1].Value
        $inner = ($bm.Groups[2].Value.Trim() -replace '<[^>]+>', '' -replace '\s+', ' ')
        if ($inner.Length -gt 35) { $inner = $inner.Substring(0, 32) + "..." }
        if (-not $inner) { $inner = "[Icon/Image Button]" }

        $hasOnclick = [regex]::IsMatch($attrs, 'onclick\s*=\s*["'']([^"'']+)["'']')
        $idMatch = [regex]::Match($attrs, 'id\s*=\s*["'']([^"'']+)["'']')
        $idVal = if ($idMatch.Success) { $idMatch.Groups[1].Value } else { "" }
        $typeMatch = [regex]::Match($attrs, 'type\s*=\s*["'']([^"'']+)["'']')
        $typeVal = if ($typeMatch.Success) { $typeMatch.Groups[1].Value } else { "submit" }
        $classMatch = [regex]::Match($attrs, 'class\s*=\s*["'']([^"'']+)["'']')
        $classVal = if ($classMatch.Success) { $classMatch.Groups[1].Value } else { "" }
        $hasDataAction = [regex]::IsMatch($attrs, 'data-(action|target|bs-toggle|modal)\s*=\s*["'']([^"'']+)["'']')

        $firstClass = if ($classVal) { $classVal.Trim().Split(" ")[0] } else { "" }
        $selector = if ($idVal) { "button#$idVal" } elseif ($firstClass) { "button.$firstClass" } else { "button:contains('$inner')" }

        $isHandled = $false

        if ($hasOnclick) {
            $isHandled = $true
        } elseif ($typeVal -eq "submit") {
            $isHandled = $true
        } elseif ($hasDataAction) {
            $isHandled = $true
        } elseif ($idVal -and ($pageJs -match "['""]#?$idVal['""]")) {
            $isHandled = $true
        } elseif ($classVal) {
            foreach ($cls in $classVal.Split(" ")) {
                if ($cls -and ($pageJs -match "\.$cls" -or $pageJs -match "['""][^'""]*$cls['""]")) {
                    $isHandled = $true
                    break
                }
            }
        }

        if ($isHandled) {
            $passedButtons++
        } else {
            $failedButtons++
            $alertPayload = [PSCustomObject]@{
                alertType = "BROKEN_BUTTON_DETECTED"
                severity = "CRITICAL"
                timestamp = (Get-Date).ToString("o")
                environment = "Development Audit"
                page = [PSCustomObject]@{
                    url = "file:///$($hf.FullName.Replace('\', '/'))"
                    pathname = "/$rel"
                    title = "Page: $rel"
                }
                element = [PSCustomObject]@{
                    tagName = "BUTTON"
                    id = $idVal
                    className = $classVal
                    selector = $selector
                    buttonText = $inner
                }
                failure = [PSCustomObject]@{
                    code = "NO_EVENT_LISTENER"
                    title = "Dead Button: No Event Listener or Action"
                    detailedReason = "Button has type='$typeVal', no onclick handler, no data-action, and no matching ID/Class event listener in JavaScript scopes."
                }
                agentDispatch = [PSCustomObject]@{
                    summonTargets = @("AntiGravity", "OpenCode (First Assistant)")
                    priority = "IMMEDIATE_ACTION_REQUIRED"
                    suggestedFix = "Attach click listener in JS or provide onclick attribute to '$selector'."
                }
            }
            $brokenButtonList += $alertPayload
            Dispatch-BrokenButtonAlert -Payload $alertPayload
        }
    }

    # 2. Audit Anchor Buttons: <a class="...btn..." ...>...</a>
    $aMatches = [regex]::Matches($content, '<a\b([^>]*)>(.*?)<\/a>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    foreach ($am in $aMatches) {
        $attrs = $am.Groups[1].Value
        $inner = ($am.Groups[2].Value.Trim() -replace '<[^>]+>', '' -replace '\s+', ' ')
        if ($inner.Length -gt 35) { $inner = $inner.Substring(0, 32) + "..." }
        
        $hrefMatch = [regex]::Match($attrs, 'href\s*=\s*["'']([^"'']+)["'']')
        $hrefVal = if ($hrefMatch.Success) { $hrefMatch.Groups[1].Value } else { "" }
        $hasOnclick = [regex]::IsMatch($attrs, 'onclick\s*=\s*["'']([^"'']+)["'']')
        $classMatch = [regex]::Match($attrs, 'class\s*=\s*["'']([^"'']+)["'']')
        $classVal = if ($classMatch.Success) { $classMatch.Groups[1].Value } else { "" }

        if ($classVal -match "btn|button" -or ($hrefVal -and -not $hrefVal.StartsWith("http") -and -not $hrefVal.StartsWith("#") -and -not $hrefVal.StartsWith("javascript:") -and -not $hrefVal.StartsWith("mailto:") -and -not $hrefVal.StartsWith("tel:"))) {
            $totalButtons++
            $cleanTarget = $hrefVal.Split("#")[0].Split("?")[0].TrimStart([char[]]@('/', '\'))
            if ($cleanTarget) {
                $targetFile = Join-Path $root $cleanTarget
                if (-not (Test-Path $targetFile)) {
                    $failedButtons++
                    $alertPayload = [PSCustomObject]@{
                        alertType = "BROKEN_BUTTON_DETECTED"
                        severity = "CRITICAL"
                        timestamp = (Get-Date).ToString("o")
                        environment = "Development Audit"
                        page = [PSCustomObject]@{
                            url = "file:///$($hf.FullName.Replace('\', '/'))"
                            pathname = "/$rel"
                            title = "Page: $rel"
                        }
                        element = [PSCustomObject]@{
                            tagName = "A"
                            id = ""
                            className = $classVal
                            selector = "a[href='$hrefVal']"
                            buttonText = $inner
                        }
                        failure = [PSCustomObject]@{
                            code = "404_BROKEN_NAVIGATION_LINK"
                            title = "Broken Navigation Target Page"
                            detailedReason = "Anchor button targets file '$cleanTarget' which does NOT exist on disk."
                        }
                        agentDispatch = [PSCustomObject]@{
                            summonTargets = @("AntiGravity", "OpenCode (First Assistant)")
                            priority = "IMMEDIATE_ACTION_REQUIRED"
                            suggestedFix = "Create target file '$cleanTarget' or fix href attribute."
                        }
                    }
                    $brokenButtonList += $alertPayload
                    Dispatch-BrokenButtonAlert -Payload $alertPayload
                } else {
                    $passedButtons++
                }
            } else {
                $passedButtons++
            }
        }
    }
}

# If simulate failure flag is set, generate a real simulation alert to verify end-to-end alerting pipeline
if ($SimulateFailure) {
    Write-Host ""
    Write-Host "[*] [Simulation Mode Enabled] Emulating detected broken button to verify self-reporting..." -ForegroundColor Magenta
    $simPayload = [PSCustomObject]@{
        alertType = "BROKEN_BUTTON_DETECTED"
        severity = "CRITICAL"
        timestamp = (Get-Date).ToString("o")
        environment = "Simulation & Verification"
        page = [PSCustomObject]@{
            url = "http://localhost:5055/deals.html"
            pathname = "/deals.html"
            title = "Waseet Deals Platform"
        }
        element = [PSCustomObject]@{
            tagName = "BUTTON"
            id = "btn-accept-escrow"
            className = "btn-3d btn-emerald action-escrow"
            selector = "button#btn-accept-escrow.btn-3d"
            buttonText = "Accept Escrow Transfer"
        }
        failure = [PSCustomObject]@{
            code = "Z_INDEX_COVERED"
            title = "Click Intercepted by Higher Z-Index Overlay"
            detailedReason = "Physical click is blocked because element 'div.drawer-backdrop' (z-index: 9999) covers this button completely."
        }
        agentDispatch = [PSCustomObject]@{
            summonTargets = @("AntiGravity", "OpenCode (First Assistant)")
            priority = "IMMEDIATE_ACTION_REQUIRED"
            suggestedFix = "Check drawer backdrop active state; ensure pointer-events: none is applied when closed."
        }
    }
    Dispatch-BrokenButtonAlert -Payload $simPayload
}

# Summary
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " [AUDIT SCAN COMPLETE]" -ForegroundColor Cyan
Write-Host " Total Interactive Elements Audited : $totalButtons" -ForegroundColor White
Write-Host " Passed Elements                    : $passedButtons" -ForegroundColor Green
Write-Host " Broken / Unhandled Elements        : $failedButtons" -ForegroundColor $(if ($failedButtons -eq 0) { "Green" } else { "Red" })
Write-Host "================================================================================" -ForegroundColor Cyan

if ($failedButtons -gt 0) {
    Write-Host ""
    Write-Host "[!] CRITICAL: $failedButtons broken button(s) detected. Alerts were dispatched." -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[OK] 100% SUCCESS: All buttons and interactive elements verified healthy." -ForegroundColor Green
    exit 0
}
