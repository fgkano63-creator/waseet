$path = "D:\waseet-app\contact-support.html"
$bytes = [System.IO.File]::ReadAllBytes($path)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$text = $text -replace "(\r?\n)", "`r`n"
$text = $text -replace "(`r`n`r`n)", "`r`n"
# More simply:
$lines = [System.IO.File]::ReadAllLines($path)
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host "Normalized lines: $($lines.Length)"
