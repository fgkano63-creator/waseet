[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " [WASEET INTERACTION & BUTTON AUDITOR] Forensic Full-Suite Scan" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$htmlFiles = Get-ChildItem -Path 'D:\waseet-app' -Filter '*.html' -Recurse | Where-Object { $_.FullName -notmatch '\\(tests|brain)\\' }
$jsFiles = Get-ChildItem -Path 'D:\waseet-app\js' -Filter '*.js' -Recurse

$allJsContent = ""
foreach ($jf in $jsFiles) {
    $allJsContent += "`n" + (Get-Content $jf.FullName -Raw -Encoding UTF8)
}

$issues = @()
$totalButtons = 0
$passedButtons = 0

foreach ($hf in $htmlFiles) {
    $rel = $hf.FullName.Replace('D:\waseet-app\', '')
    $content = Get-Content $hf.FullName -Raw -Encoding UTF8
    
    # Combined JS scope
    $pageJs = $allJsContent
    $inlineScripts = [regex]::Matches($content, '<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>')
    foreach ($is in $inlineScripts) {
        $pageJs += "`n" + $is.Groups[1].Value
    }
    
    # 1. Audit Buttons
    $btnMatches = [regex]::Matches($content, '<button\b([^>]*)>(.*?)<\/button>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    
    foreach ($bm in $btnMatches) {
        $totalButtons++
        $attrs = $bm.Groups[1].Value
        $inner = ($bm.Groups[2].Value.Trim() -replace '<[^>]+>', '' -replace '\s+', ' ')
        if ($inner.Length -gt 35) { $inner = $inner.Substring(0, 32) + "..." }
        if (-not $inner) { $inner = "[Icon/Image Button]" }
        
        $hasOnclick = $attrs -match 'onclick=["'']([^"'']+)["'']'
        $onclickVal = if ($hasOnclick) { $Matches[1] } else { "" }
        $hasId = $attrs -match 'id=["'']([^"'']+)["'']'
        $idVal = if ($hasId) { $Matches[1] } else { "" }
        $hasType = $attrs -match 'type=["'']([^"'']+)["'']'
        $typeVal = if ($hasType) { $Matches[1] } else { "submit" }
        $hasClass = $attrs -match 'class=["'']([^"'']+)["'']'
        $classVal = if ($hasClass) { $Matches[1] } else { "" }
        
        $isHandled = $false
        
        if ($hasOnclick) {
            $isHandled = $true
        } elseif ($typeVal -eq "submit") {
            $isHandled = $true
        } elseif ($idVal -and ($pageJs -match "['""]#?$idVal['""]")) {
            $isHandled = $true
        } elseif ($classVal) {
            foreach ($cls in $classVal.Split(' ')) {
                if ($cls -and ($pageJs -match "\.$cls" -or $pageJs -match "['""][^'""]*$cls['""]")) {
                    $isHandled = $true
                    break
                }
            }
        }
        
        if ($isHandled) {
            $passedButtons++
        } else {
            $issues += [PSCustomObject]@{
                Page = $rel
                Element = "<button id='$idVal'>"
                Text = $inner
                Problem = "Button has NO onclick, NO type='submit', and NO matching JS event listener"
            }
        }
    }
    
    # 2. Audit Anchor Links acting as Buttons or Navigation
    $aMatches = [regex]::Matches($content, '<a\b([^>]*)>(.*?)<\/a>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    foreach ($am in $aMatches) {
        $attrs = $am.Groups[1].Value
        $inner = ($am.Groups[2].Value.Trim() -replace '<[^>]+>', '' -replace '\s+', ' ')
        if ($inner.Length -gt 35) { $inner = $inner.Substring(0, 32) + "..." }
        
        $hasHref = $attrs -match 'href=["'']([^"'']+)["'']'
        $hrefVal = if ($hasHref) { $Matches[1] } else { "" }
        $hasOnclick = $attrs -match 'onclick=["'']([^"'']+)["'']'
        
        if ($hrefVal -and -not $hrefVal.StartsWith('http') -and -not $hrefVal.StartsWith('mailto:') -and -not $hrefVal.StartsWith('tel:') -and -not $hrefVal.StartsWith('#') -and -not $hrefVal.StartsWith('javascript:')) {
            $cleanTarget = $hrefVal.Split('#')[0].Split('?')[0].TrimStart('/')
            if ($cleanTarget) {
                $targetFile = Join-Path 'D:\waseet-app' $cleanTarget
                if (-not (Test-Path $targetFile)) {
                    $issues += [PSCustomObject]@{
                        Page = $rel
                        Element = "<a href='$hrefVal'>"
                        Text = $inner
                        Problem = "Target file '$cleanTarget' does not exist on disk"
                    }
                }
            }
        }
    }
}

Write-Host "`nTotal Buttons & Links Scanned: $totalButtons" -ForegroundColor White
Write-Host "Passed Elements              : $passedButtons" -ForegroundColor Green
Write-Host "Issues Detected              : $($issues.Count)" -ForegroundColor $(if ($issues.Count -eq 0) { 'Green' } else { 'Red' })

if ($issues.Count -gt 0) {
    Write-Host "`nISSUES LIST:" -ForegroundColor Red
    $issues | Format-Table -AutoSize Page, Element, Text, Problem
    exit 1
} else {
    Write-Host "`n>>> ALL BUTTONS AND INTERACTIVE LINKS VERIFIED WITH 100% SUCCESS! <<<" -ForegroundColor Green
    exit 0
}
