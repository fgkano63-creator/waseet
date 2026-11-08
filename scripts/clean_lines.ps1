$path = "D:\waseet-app\contact-support.html"
$lines = [System.IO.File]::ReadAllLines($path)
$clean = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $lines.Length; $i++) {
    # If the previous line had content and this line is purely empty, check if it was due to \r\r\n
    # Look at original: all lines had an extra blank line between them.
    # If every odd line is blank:
    if ($lines[$i] -ne "" -or ($i -gt 0 -and $lines[$i-1] -eq "")) {
        $clean.Add($lines[$i])
    }
}
Write-Host "Old: $($lines.Length) -> New: $($clean.Count)"
[System.IO.File]::WriteAllLines($path, $clean, [System.Text.Encoding]::UTF8)
