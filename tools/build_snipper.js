const fs = require('fs');
const path = require('path');

function b64(s) {
    return Buffer.from(s, 'utf8').toString('base64');
}

const strings = {
    desktopPath: b64('D:\\H P\\سطح المكتب 2'),
    boxTitle: b64('تم التقاط المربع المحدد بالماوس (AltGr + 1)'),
    fullTitle: b64('تم التقاط الشاشة بالكامل (AltGr + 2)'),
    promptLbl: b64('أرفق كلماتك وملاحظاتك لتوضيح ما بداخل المربع وما هو الخطأ بالتحديد:'),
    defaultText: b64('فحص هذا الجزء وتحليله برمجيًا وأمنيًا وتجهيز الكود المصلح.'),
    submitBtn: b64('إرسال إلى جيمناي (Gemini) وتجهيز الكود'),
    cancelBtn: b64('إلغاء (Cancel)'),
    hintText: b64('WASEET: اسحب الماوس لتحديد مربع حول المشكلة أو اضغط ESC للإلغاء'),
    dialogTitle: b64('WASEET | محدد الشاشة وجيمناي (Gemini Screen Inspector)'),
    balloonTitle: b64('منصة وسيط | تم التقاط المربع وإرساله لجيمناي'),
    balloonText: b64('تم نسخ الصورة إلى الحافظة (Clipboard) وحفظها على سطح المكتب لإرسالها مباشرة لجيمناي!')
};

const ps1Content = `# WASEET PLATFORM - WINDOWS GLOBAL SCREEN & BOX INSPECTOR (AltGr + 1 / AltGr + 2)
param(
    [switch]$BoxNow,
    [switch]$FullNow
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function _T([string]$b64) {
    return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
}

$script:ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:WorkspaceDir = "D:\\waseet-app"
$script:DesktopDir = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path $script:DesktopDir)) { $script:DesktopDir = _T("${strings.desktopPath}") }
$script:BrainDir = "C:\\Users\\H P\\.gemini\\antigravity\\brain\\5220a793-9cad-46ac-8dc7-42a96f9ed8d8"

if (-not ([System.Management.Automation.PSTypeName]'WaseetSnipper.GlobalHotKeyHandler').Type) {
    Add-Type -Path "$script:ToolDir\\GlobalHotKeyHandler.cs" -ReferencedAssemblies "System.Windows.Forms", "System.Drawing"
}

function Get-DesktopScreenshot {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $graphics.Dispose()
    return $bitmap
}

function Invoke-BoxSelectionOverlay {
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $fullBmp = Get-DesktopScreenshot

    $form = New-Object System.Windows.Forms.Form
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Maximized
    $form.TopMost = $true
    $form.ShowInTaskbar = $false
    $form.Cursor = [System.Windows.Forms.Cursors]::Cross
    $form.DoubleBuffered = $true
    $form.BackgroundImage = $fullBmp

    $isDragging = $false
    $startPt = [System.Drawing.Point]::Empty
    $currentPt = [System.Drawing.Point]::Empty
    $script:SelectedRect = [System.Drawing.Rectangle]::Empty

    $dimBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(140, 10, 12, 19))
    $goldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 212, 175, 55), 2)
    $goldPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
    $font = New-Object System.Drawing.Font ("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $badgeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 212, 175, 55))
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)

    $form.add_Paint({
        param($sender, $e)
        $g = $e.Graphics

        if ($isDragging -and $script:SelectedRect.Width -gt 0 -and $script:SelectedRect.Height -gt 0) {
            $region = New-Object System.Drawing.Region $screen
            $region.Exclude($script:SelectedRect)
            $g.FillRegion($dimBrush, $region)
            $g.DrawRectangle($goldPen, $script:SelectedRect)

            $badgeText = "$($script:SelectedRect.Width)px x $($script:SelectedRect.Height)px"
            $badgeSize = $g.MeasureString($badgeText, $font)
            $badgeRect = New-Object System.Drawing.RectangleF ($script:SelectedRect.Right - $badgeSize.Width - 6), ($script:SelectedRect.Top - $badgeSize.Height - 4), ($badgeSize.Width + 6), ($badgeSize.Height + 4)
            if ($badgeRect.Y -lt 0) { $badgeRect.Y = $script:SelectedRect.Top + 4 }
            $g.FillRectangle($badgeBrush, $badgeRect)
            $g.DrawString($badgeText, $font, $textBrush, $badgeRect.X + 3, $badgeRect.Y + 2)
        } else {
            $g.FillRectangle($dimBrush, $screen)
            $hint = _T("${strings.hintText}")
            $hintSize = $g.MeasureString($hint, $font)
            $hintRect = New-Object System.Drawing.RectangleF (($screen.Width - $hintSize.Width)/2 - 15), 30, ($hintSize.Width + 30), ($hintSize.Height + 16)
            $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 20, 26, 42))), $hintRect)
            $g.DrawRectangle($goldPen, $hintRect.X, $hintRect.Y, $hintRect.Width, $hintRect.Height)
            $g.DrawString($hint, $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), $hintRect.X + 15, $hintRect.Y + 8)
        }
    })

    $form.add_MouseDown({
        param($sender, $e)
        if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
            $script:isDragging = $true
            $script:startPt = $e.Location
            $script:currentPt = $e.Location
        }
    })

    $form.add_MouseMove({
        param($sender, $e)
        if ($script:isDragging) {
            $script:currentPt = $e.Location
            $x = [Math]::Min($script:startPt.X, $script:currentPt.X)
            $y = [Math]::Min($script:startPt.Y, $script:currentPt.Y)
            $w = [Math]::Abs($script:currentPt.X - $script:startPt.X)
            $h = [Math]::Abs($script:currentPt.Y - $script:startPt.Y)
            $script:SelectedRect = New-Object System.Drawing.Rectangle $x, $y, $w, $h
            $form.Invalidate()
        }
    })

    $form.add_MouseUp({
        param($sender, $e)
        if ($script:isDragging) {
            $script:isDragging = $false
            if ($script:SelectedRect.Width -gt 15 -and $script:SelectedRect.Height -gt 15) {
                $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
                $form.Close()
            } else {
                $script:SelectedRect = [System.Drawing.Rectangle]::Empty
                $form.Invalidate()
            }
        }
    })

    $form.add_KeyDown({
        param($sender, $e)
        if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
            $script:SelectedRect = [System.Drawing.Rectangle]::Empty
            $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
            $form.Close()
        }
    })

    $result = $form.ShowDialog()

    if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $script:SelectedRect.Width -gt 0) {
        $cropped = New-Object System.Drawing.Bitmap $script:SelectedRect.Width, $script:SelectedRect.Height
        $cg = [System.Drawing.Graphics]::FromImage($cropped)
        $cg.DrawImage($fullBmp, 0, 0, $script:SelectedRect, [System.Drawing.GraphicsUnit]::Pixel)
        $cg.Dispose()
        $fullBmp.Dispose()
        return $cropped
    }

    $fullBmp.Dispose()
    return $null
}

function Show-InspectionPromptDialog {
    param(
        [System.Drawing.Bitmap]$croppedBitmap,
        [bool]$isFullScreen = $false
    )

    $dialog = New-Object System.Windows.Forms.Form
    $dialog.Text = _T("${strings.dialogTitle}")
    $dialog.Size = New-Object System.Drawing.Size 680, 520
    $dialog.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $dialog.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $dialog.MaximizeBox = $false
    $dialog.MinimizeBox = $false
    $dialog.TopMost = $true
    $dialog.BackColor = [System.Drawing.Color]::FromArgb(255, 18, 22, 36)
    $dialog.ForeColor = [System.Drawing.Color]::FromArgb(255, 226, 232, 240)
    $dialog.RightToLeft = [System.Windows.Forms.RightToLeft]::Yes
    $dialog.RightToLeftLayout = $true

    $headerFont = New-Object System.Drawing.Font ("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $labelFont = New-Object System.Drawing.Font ("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
    $bodyFont = New-Object System.Drawing.Font ("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)

    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Text = if ($isFullScreen) { _T("${strings.fullTitle}") } else { _T("${strings.boxTitle}") }
    $lblTitle.Font = $headerFont
    $lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(255, 212, 175, 55)
    $lblTitle.Location = New-Object System.Drawing.Point 20, 15
    $lblTitle.Size = New-Object System.Drawing.Size 620, 30
    $dialog.Controls.Add($lblTitle)

    $picBox = New-Object System.Windows.Forms.PictureBox
    $picBox.Location = New-Object System.Drawing.Point 20, 55
    $picBox.Size = New-Object System.Drawing.Size 620, 160
    $picBox.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
    $picBox.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $picBox.BackColor = [System.Drawing.Color]::FromArgb(255, 10, 12, 19)
    $picBox.Image = $croppedBitmap
    $dialog.Controls.Add($picBox)

    $lblPrompt = New-Object System.Windows.Forms.Label
    $lblPrompt.Text = _T("${strings.promptLbl}")
    $lblPrompt.Font = $labelFont
    $lblPrompt.ForeColor = [System.Drawing.Color]::FromArgb(255, 203, 213, 225)
    $lblPrompt.Location = New-Object System.Drawing.Point 20, 225
    $lblPrompt.Size = New-Object System.Drawing.Size 620, 25
    $dialog.Controls.Add($lblPrompt)

    $txtQuestion = New-Object System.Windows.Forms.TextBox
    $txtQuestion.Multiline = $true
    $txtQuestion.Location = New-Object System.Drawing.Point 20, 255
    $txtQuestion.Size = New-Object System.Drawing.Size 620, 120
    $txtQuestion.Font = $bodyFont
    $txtQuestion.BackColor = [System.Drawing.Color]::FromArgb(255, 10, 12, 19)
    $txtQuestion.ForeColor = [System.Drawing.Color]::White
    $txtQuestion.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
    $txtQuestion.Text = _T("${strings.defaultText}")
    $dialog.Controls.Add($txtQuestion)

    $btnSubmit = New-Object System.Windows.Forms.Button
    $btnSubmit.Text = _T("${strings.submitBtn}")
    $btnSubmit.Location = New-Object System.Drawing.Point 20, 400
    $btnSubmit.Size = New-Object System.Drawing.Size 380, 45
    $btnSubmit.Font = New-Object System.Drawing.Font ("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
    $btnSubmit.BackColor = [System.Drawing.Color]::FromArgb(255, 212, 175, 55)
    $btnSubmit.ForeColor = [System.Drawing.Color]::Black
    $btnSubmit.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnSubmit.Cursor = [System.Windows.Forms.Cursors]::Hand
    $dialog.Controls.Add($btnSubmit)

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Text = _T("${strings.cancelBtn}")
    $btnCancel.Location = New-Object System.Drawing.Point 420, 400
    $btnCancel.Size = New-Object System.Drawing.Size 220, 45
    $btnCancel.Font = New-Object System.Drawing.Font ("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $btnCancel.BackColor = [System.Drawing.Color]::FromArgb(255, 40, 45, 60)
    $btnCancel.ForeColor = [System.Drawing.Color]::White
    $btnCancel.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnCancel.Cursor = [System.Windows.Forms.Cursors]::Hand
    $dialog.Controls.Add($btnCancel)

    $script:UserInputText = ""
    $btnSubmit.add_Click({
        $script:UserInputText = $txtQuestion.Text.Trim()
        $dialog.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $dialog.Close()
    })
    $btnCancel.add_Click({
        $dialog.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
        $dialog.Close()
    })

    $res = $dialog.ShowDialog()
    return ($res -eq [System.Windows.Forms.DialogResult]::OK)
}

function Process-CaptureAndDispatch {
    param(
        [System.Drawing.Bitmap]$bitmap,
        [string]$userWords,
        [string]$captureType
    )

    $timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
    $imgFileName = "inspect_capture.png"

    $destPaths = @(
        "$script:WorkspaceDir\\assets\\$imgFileName",
        "$script:BrainDir\\$imgFileName",
        "$script:DesktopDir\\$imgFileName"
    )

    foreach ($p in $destPaths) {
        $parent = Split-Path $p -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        $bitmap.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    try {
        [System.Windows.Forms.Clipboard]::SetImage($bitmap)
    } catch {
        # clipboard fallback
    }

    $reportObj = [PSCustomObject]@{
        Timestamp = $timestamp
        CaptureType = $captureType
        Dimensions = "$($bitmap.Width)x$($bitmap.Height)"
        UserNotes = $userWords
        ImagePath = "$script:WorkspaceDir\\assets\\$imgFileName"
        DesktopImagePath = "$script:DesktopDir\\$imgFileName"
        Status = "SENT_TO_GEMINI"
    }

    $jsonStr = $reportObj | ConvertTo-Json -Depth 4
    Set-Content -Path "$script:WorkspaceDir\\tests\\visual-inspect-report.json" -Value $jsonStr -Encoding UTF8

    $desktopReport = @"
==============================================================================
   WASEET GEMINI SCREEN INSPECTOR (AltGr+1 / AltGr+2)
==============================================================================
Timestamp: $timestamp
Type: $captureType ($($bitmap.Width) x $($bitmap.Height) px)
Image: $script:DesktopDir\\$imgFileName

User Notes / Question to Gemini:
$userWords

Status: Sent to Gemini for inspection.
==============================================================================
"@
    Set-Content -Path "$script:DesktopDir\\visual-inspect-report.txt" -Value $desktopReport -Encoding UTF8

    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::Information
    $notify.BalloonTipTitle = _T("${strings.balloonTitle}")
    $notify.BalloonTipText = _T("${strings.balloonText}")
    $notify.Visible = $true
    $notify.ShowBalloonTip(4000)

    Write-Host "[SUCCESS] Capture ($captureType) forwarded to Gemini & saved to Desktop!" -ForegroundColor Green
}

if ($BoxNow) {
    $bmp = Invoke-BoxSelectionOverlay
    if ($bmp) {
        $ok = Show-InspectionPromptDialog -croppedBitmap $bmp -isFullScreen $false
        if ($ok) {
            Process-CaptureAndDispatch -bitmap $bmp -userWords $script:UserInputText -captureType "BoxSelection (AltGr+1)"
        }
        $bmp.Dispose()
    }
    exit 0
}

if ($FullNow) {
    $bmp = Get-DesktopScreenshot
    $ok = Show-InspectionPromptDialog -croppedBitmap $bmp -isFullScreen $true
    if ($ok) {
        Process-CaptureAndDispatch -bitmap $bmp -userWords $script:UserInputText -captureType "FullScreen (AltGr+2)"
    }
    $bmp.Dispose()
    exit 0
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " [WASEET WINDOWS SNIPPER] Global Hotkey Listener Active" -ForegroundColor Cyan
Write-Host " - AltGr + 1 (Ctrl + Alt + 1) : Precision Bounding Box Selection" -ForegroundColor Yellow
Write-Host " - AltGr + 2 (Ctrl + Alt + 2) : Full Screen Capture & Gemini Dispatch" -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan

$hotkeyForm = New-Object WaseetSnipper.GlobalHotKeyHandler
$hotkeyForm.OnHotKey1 = {
    Write-Host "[HOTKEY TRIGGERED] AltGr + 1 (Box Selection)" -ForegroundColor Green
    $bmp = Invoke-BoxSelectionOverlay
    if ($bmp) {
        $ok = Show-InspectionPromptDialog -croppedBitmap $bmp -isFullScreen $false
        if ($ok) {
            Process-CaptureAndDispatch -bitmap $bmp -userWords $script:UserInputText -captureType "BoxSelection (AltGr+1)"
        }
        $bmp.Dispose()
    }
}

$hotkeyForm.OnHotKey2 = {
    Write-Host "[HOTKEY TRIGGERED] AltGr + 2 (Full Screen)" -ForegroundColor Green
    $bmp = Get-DesktopScreenshot
    $ok = Show-InspectionPromptDialog -croppedBitmap $bmp -isFullScreen $true
    if ($ok) {
        Process-CaptureAndDispatch -bitmap $bmp -userWords $script:UserInputText -captureType "FullScreen (AltGr+2)"
    }
    $bmp.Dispose()
}

$hotkeyForm.StartHook()

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Shield
$tray.Text = "Waseet Gemini Inspector (AltGr+1 / Shift+Alt+1)"
$tray.Visible = $true

[System.Windows.Forms.Application]::Run($hotkeyForm)
$hotkeyForm.StopHook()
$tray.Visible = $false
`;

fs.writeFileSync(path.join(__dirname, 'waseet-windows-snipper.ps1'), ps1Content, 'utf8');
console.log('waseet-windows-snipper.ps1 generated successfully!');
