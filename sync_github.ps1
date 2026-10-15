param(
    [string]$Message = "تحديث وتطوير ملفات منصة وسيط WASEET"
)

$git = "$env:LOCALAPPDATA\Programs\MinGit\cmd\git.exe"
if (-not (Test-Path $git)) {
    $git = "git"
}

Write-Host "جاري فحص وتجهيز التعديلات..." -ForegroundColor Cyan
& $git add .

$status = & $git status --porcelain
if ($status) {
    & $git commit -m $Message
    Write-Host "جاري الرفع إلى مستودع GitHub..." -ForegroundColor Cyan
    & $git push origin main
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ تم الحفظ والرفع بنجاح إلى GitHub!" -ForegroundColor Green
    } else {
        Write-Host "⚠️ تعذر الرفع. تأكد من إعداد رابط المستودع وصلاحيات الوصول." -ForegroundColor Red
    }
} else {
    Write-Host "ℹ️ لا توجد تعديلات جديدة لرفعها." -ForegroundColor Yellow
}
