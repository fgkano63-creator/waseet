param(
    [string]$Message = "Update WASEET platform files"
)

$git = "$env:LOCALAPPDATA\Programs\MinGit\cmd\git.exe"
if (-not (Test-Path $git)) {
    $git = "git"
}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "Checking and staging changes..." -ForegroundColor Cyan
& $git add .

$status = & $git status --porcelain
if ($status) {
    Write-Host "Committing changes..." -ForegroundColor Cyan
    & $git commit -m $Message
    Write-Host "Pushing to GitHub (origin/main)..." -ForegroundColor Cyan
    & $git push origin main
    if ($LASTEXITCODE -eq 0) {
        Write-Host "SUCCESS: Repository synced to GitHub!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Push failed. Check your network or credentials." -ForegroundColor Red
    }
} else {
    Write-Host "INFO: Working tree clean. No changes to commit." -ForegroundColor Yellow
}
