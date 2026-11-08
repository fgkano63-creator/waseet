# ==============================================================================
# WASEET PLATFORM - LOCAL DEV WEBHOOK ALERT RECEIVER
# Location: D:\waseet-app\tests\dev-webhook-receiver.ps1
#
# Partners: AntiGravity (Lead AI) & OpenCode (First Assistant)
# Purpose : Zero-dependency local HTTP listener on port 5055 to receive and log
#           broken button alerts in real-time during development & testing.
# ==============================================================================

param (
    [int]$Port = 5055
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

$root = "D:\waseet-app"
$queueFile = Join-Path $root "tests\broken-buttons-queue.json"

if (-not (Test-Path $queueFile)) {
    "[]" | Out-File -FilePath $queueFile -Encoding UTF8
}

try {
    $listener.Start()
} catch {
    Write-Host "[Error] Could not bind to $prefix. Make sure port $Port is free or run with elevated permissions." -ForegroundColor Red
    exit 1
}

Write-Host "================================================================================" -ForegroundColor Green
Write-Host " [WASEET LOCAL DEV WEBHOOK RECEIVER] Active on $prefix" -ForegroundColor Green
Write-Host " Listening for alerts on:" -ForegroundColor White
Write-Host "   - POST http://localhost:$Port/webhook/button-alert" -ForegroundColor Cyan
Write-Host "   - POST http://localhost:$Port/api/log-error" -ForegroundColor Cyan
Write-Host " Queue File: $queueFile" -ForegroundColor DarkGray
Write-Host " Press Ctrl+C in console to stop listener." -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Green

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Add CORS Headers so browser fetch requests succeed smoothly
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")

        # Handle Preflight OPTIONS
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        if ($request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

            try {
                $payload = $body | ConvertFrom-Json

                # Handle Visual Box Inspector reports
                if ($request.Url.AbsolutePath -like "*visual-inspect*" -or $payload.captureType) {
                    Write-Host "`n🔍 ======================================================================" -ForegroundColor Cyan
                    Write-Host "🔍 [VISUAL BOX SCREEN INSPECTION RECEIVED AT $timestamp]" -ForegroundColor Cyan
                    Write-Host "   Capture Type : $($payload.captureType) ($($payload.selectionBoxDimensions))" -ForegroundColor White
                    Write-Host "   Page URL     : $($payload.page.url)" -ForegroundColor White
                    Write-Host "   User Question: $($payload.userQuestion)" -ForegroundColor Yellow
                    Write-Host "   Elements     : $($payload.elementsDetected) elements detected" -ForegroundColor DarkGray
                    Write-Host "🔍 ======================================================================`n" -ForegroundColor Cyan

                    $reportFile = Join-Path $root "tests\visual-inspect-report.json"
                    $body | Out-File -FilePath $reportFile -Encoding UTF8
                } else {
                    # Output Formatted Incident Report
                    Write-Host "`n🚨 ======================================================================" -ForegroundColor Red
                    Write-Host "🚨 [INCOMING BROKEN BUTTON ALERT RECEIVED AT $timestamp]" -ForegroundColor Red
                    Write-Host "   Target Agents : AntiGravity & OpenCode (First Assistant)" -ForegroundColor Green
                    Write-Host "   Page URL      : $($payload.page.url)" -ForegroundColor White
                    Write-Host "   Selector      : $($payload.element.selector)" -ForegroundColor Yellow
                    Write-Host "   Button Text   : $($payload.element.buttonText)" -ForegroundColor White
                    Write-Host "   Failure Type  : $($payload.failure.code) ($($payload.failure.title))" -ForegroundColor Red
                    Write-Host "   Failure Detail: $($payload.failure.detailedReason)" -ForegroundColor Yellow
                    
                    if ($payload.failure.blockingElement) {
                        Write-Host "   Blocking Elem : $($payload.failure.blockingElement.selector) (z-index: $($payload.failure.blockingElement.zIndex))" -ForegroundColor Magenta
                    }
                    
                    Write-Host "   Suggested Fix : $($payload.agentDispatch.suggestedFix)" -ForegroundColor Cyan
                    Write-Host "🚨 ======================================================================`n" -ForegroundColor Red
                }

                # Append to queue
                try {
                    $rawQueue = Get-Content $queueFile -Raw -Encoding UTF8
                    $queue = if ($rawQueue) { $rawQueue | ConvertFrom-Json } else { @() }
                    if ($queue -isnot [System.Collections.IEnumerable] -or $queue -is [string]) { $queue = @($queue) }
                    $queue += $payload
                    if ($queue.Count -gt 50) { $queue = $queue[-50..-1] }
                    $queue | ConvertTo-Json -Depth 6 | Out-File -FilePath $queueFile -Encoding UTF8
                } catch {
                    Write-Host "   [!] Failed to update queue file: $($_.Exception.Message)" -ForegroundColor DarkYellow
                }

                $respObj = @{
                    status = "RECEIVED"
                    message = "Alert dispatched to AntiGravity & OpenCode for immediate remediation."
                    receivedAt = $timestamp
                    assignedAgents = @("AntiGravity", "OpenCode")
                }
                $respJson = $respObj | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($respJson)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.StatusCode = 200
            } catch {
                Write-Host "[-] Failed to parse incoming JSON: $($_.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 400
            }
        } else {
            # GET / Status Check
            $statusObj = @{
                server = "Waseet Dev Webhook Receiver"
                status = "ACTIVE"
                endpoints = @(
                    "/webhook/button-alert",
                    "/api/log-error"
                )
                queueFile = $queueFile
            }
            $buffer = [System.Text.Encoding]::UTF8.GetBytes(($statusObj | ConvertTo-Json))
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.StatusCode = 200
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
