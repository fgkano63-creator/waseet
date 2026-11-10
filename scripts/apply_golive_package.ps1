# PowerShell script to apply Go-Live Package to all WASEET pages
$appDir = "D:\waseet-app"

$analyticsSnippet = @"
    <!-- ================= Marketing & Analytics Tracking ================= -->
    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-XXXXXXXXXX');</script>
    <!-- Meta Pixel -->
    <script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','XXXXXXXXXXXXXXX');fbq('track','PageView');</script>
"@

$universalFooter = @"
        <!-- ================= WASEET Universal Legal Footer ================= -->
        <footer class="waseet-legal-footer" style="background: rgba(8, 12, 20, 0.95); border-top: 1px solid rgba(197, 160, 89, 0.25); padding: 1.8rem 1rem 5.5rem 1rem; text-align: center; color: var(--silver-muted, #94a3b8); font-size: 0.88rem; position: relative; z-index: 10;">
            <div class="container" style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0.85rem;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 0.6rem;">
                    <img src="assets/logo.png" alt="WASEET Logo" style="width: 32px; height: 32px; object-fit: contain;">
                    <span style="font-family: var(--font-en, 'Cabinet Grotesk', sans-serif); font-weight: 800; font-size: 1.1rem; color: #fff; letter-spacing: 0.5px;">WASEET</span>
                    <span style="color: var(--gold-light, #fbbf24); font-size: 0.8rem; font-weight: 700; border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 999px; padding: 2px 8px;">الوساطة الآمنة</span>
                </div>
                <div class="legal-footer-links" style="display: flex; align-items: center; justify-content: center; gap: 1.25rem; flex-wrap: wrap;">
                    <a href="terms.html" style="color: #cbd5e1; text-decoration: none; font-weight: 600; transition: color 0.2s;" onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='#cbd5e1'">شروط الاستخدام</a>
                    <span style="color: rgba(148, 163, 184, 0.4);">•</span>
                    <a href="privacy.html" style="color: #cbd5e1; text-decoration: none; font-weight: 600; transition: color 0.2s;" onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='#cbd5e1'">سياسة الخصوصية</a>
                    <span style="color: rgba(148, 163, 184, 0.4);">•</span>
                    <a href="disputes.html" style="color: #cbd5e1; text-decoration: none; font-weight: 600; transition: color 0.2s;" onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='#cbd5e1'">سياسة النزاعات والتحكيم</a>
                </div>
                <div class="legal-footer-copy" style="color: #64748b; font-size: 0.82rem;">
                    © 2026 WASEET. جميع الحقوق محفوظة • منصة الوساطة وحماية التعاملات الرقمية
                </div>
            </div>
        </footer>
"@

$fiatRampsSection = @"
            <!-- ================= طرق الشحن والسحب المعتمدة (Approved Fiat & Crypto Ramps UI) ================= -->
            <section class="approved-ramps-section" style="margin-bottom: 2rem;">
                <div class="wallet-panel-card" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(10, 15, 28, 0.95) 100%); border: 1px solid rgba(197, 160, 89, 0.35); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45); border-radius: 18px; padding: 1.6rem;">
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 1.2rem; border-bottom: 1px solid rgba(197, 160, 89, 0.2); padding-bottom: 0.9rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(234, 88, 12, 0.15); border: 1px solid rgba(234, 88, 12, 0.4); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: var(--gold-light);">
                                <i class="fas fa-money-check-alt"></i>
                            </div>
                            <div>
                                <h2 style="color: #fff; font-size: 1.25rem; font-weight: 800; margin: 0 0 0.25rem 0; display: flex; align-items: center; gap: 0.5rem;">
                                    طرق الشحن والسحب المعتمدة
                                    <span style="background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 6px;">
                                        <i class="fas fa-check-circle"></i> معتمدة وآمنة 100%
                                    </span>
                                </h2>
                                <p style="color: var(--silver-muted); font-size: 0.85rem; margin: 0;">
                                    نوفر مسارات دفع رسمية وموثوقة لشحن المحفظة وسحب الأرباح بسهولة عبر الإدارة مباشرة أو شبكة الوسطاء المعتمدين في بلدك.
                                </p>
                            </div>
                        </div>

                        <!-- الزر الكبير: طلب شحن رصيد الآن -->
                        <button type="button" class="btn-3d btn-primary" onclick="scrollToDepositForm()" style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: #000; font-weight: 900; font-size: 0.98rem; padding: 0.8rem 1.8rem; border-radius: 14px; border: none; cursor: pointer; display: flex; align-items: center; gap: 0.6rem; box-shadow: 0 6px 20px rgba(234, 88, 12, 0.4); transition: transform 0.2s, box-shadow 0.2s;">
                            <i class="fas fa-bolt" style="font-size: 1.1rem;"></i>
                            <span>طلب شحن رصيد الآن</span>
                        </button>
                    </div>

                    <!-- شبكة بطاقات الدفع (2 Cards) -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 1.2rem; margin-top: 1rem;">
                        
                        <!-- البطاقة الأولى: USDT دولي ومباشر للإدارة -->
                        <div class="ramp-card" style="background: rgba(12, 17, 29, 0.75); border: 1px solid rgba(251, 191, 36, 0.25); border-radius: 14px; padding: 1.3rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem; position: relative; overflow: hidden;">
                            <div style="position: absolute; top: -15px; left: -15px; width: 70px; height: 70px; background: radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%); pointer-events: none;"></div>
                            <div>
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem;">
                                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.1)); border: 1px solid rgba(245, 158, 11, 0.4); display: flex; align-items: center; justify-content: center; font-size: 1.6rem; color: #f59e0b;">
                                        <i class="fab fa-bitcoin"></i>
                                    </div>
                                    <span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 0.74rem; font-weight: 800; padding: 3px 9px; border-radius: 8px;">
                                        دولي ومباشر للإدارة
                                    </span>
                                </div>
                                <h3 style="color: #fff; font-size: 1.05rem; font-weight: 800; margin: 0 0 0.45rem 0;">
                                    USDT - دولي ومباشر للإدارة
                                </h3>
                                <p style="color: var(--silver-muted); font-size: 0.84rem; line-height: 1.5; margin: 0 0 0.8rem 0;">
                                    شحن وسحب فوري وآمن بالعملات الرقمية بدون أي وسيط، مدعوم عبر شبكات TRC20 و BEP20 و Binance Pay مباشرة لحساب الإدارة الرسمي.
                                </p>
                                <div style="display: flex; gap: 0.45rem; flex-wrap: wrap;">
                                    <span style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 0.72rem; padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-check text-gold"></i> Binance Pay ID</span>
                                    <span style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 0.72rem; padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-check text-gold"></i> USDT TRC20</span>
                                    <span style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 0.72rem; padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-check text-gold"></i> عمولة 0%</span>
                                </div>
                            </div>
                            <button type="button" onclick="selectRampCategory('crypto')" style="width: 100%; padding: 0.65rem 1rem; border-radius: 10px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; font-weight: 800; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(245, 158, 11, 0.22)'" onmouseout="this.style.background='rgba(245, 158, 11, 0.12)'">
                                <i class="fas fa-coins"></i> اختيار الشحن عبر USDT
                            </button>
                        </div>

                        <!-- البطاقة الثانية: محافظ محلية عبر وسيط بلدك -->
                        <div class="ramp-card" style="background: rgba(12, 17, 29, 0.75); border: 1px solid rgba(234, 88, 12, 0.25); border-radius: 14px; padding: 1.3rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem; position: relative; overflow: hidden;">
                            <div style="position: absolute; top: -15px; left: -15px; width: 70px; height: 70px; background: radial-gradient(circle, rgba(234, 88, 12, 0.15) 0%, transparent 70%); pointer-events: none;"></div>
                            <div>
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem;">
                                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, rgba(234, 88, 12, 0.2), rgba(16, 185, 129, 0.1)); border: 1px solid rgba(234, 88, 12, 0.4); display: flex; align-items: center; justify-content: center; font-size: 1.6rem; color: #f97316;">
                                        <i class="fas fa-wallet"></i>
                                    </div>
                                    <span style="background: rgba(234, 88, 12, 0.15); color: #fb923c; border: 1px solid rgba(234, 88, 12, 0.4); font-size: 0.74rem; font-weight: 800; padding: 3px 9px; border-radius: 8px;">
                                        دفع محلي بالعملة الوطنية
                                    </span>
                                </div>
                                <h3 style="color: #fff; font-size: 1.05rem; font-weight: 800; margin: 0 0 0.45rem 0;">
                                    محافظ محلية: زين كاش، فودافون، سداد عبر وسيط بلدك
                                </h3>
                                <p style="color: var(--silver-muted); font-size: 0.84rem; line-height: 1.5; margin: 0 0 0.8rem 0;">
                                    تحويل فوري متاح داخل 9 دول عربية عبر المحافظ المحلية والحسابات البنكية المعتمدة بتنفيذ آمن ومطابقة يدوية مع الوسيط الإقليمي الرسمي.
                                </p>
                                <div style="display: flex; gap: 0.45rem; flex-wrap: wrap;">
                                    <span style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 0.72rem; padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-check text-orange"></i> زين كاش العراق</span>
                                    <span style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 0.72rem; padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-check text-orange"></i> فودافون كاش مصر</span>
                                    <span style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 0.72rem; padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-check text-orange"></i> سداد وليبيا باي</span>
                                    <span style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 0.72rem; padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-check text-orange"></i> شام كاش وسيريتل</span>
                                </div>
                            </div>
                            <button type="button" onclick="selectRampCategory('local')" style="width: 100%; padding: 0.65rem 1rem; border-radius: 10px; background: rgba(234, 88, 12, 0.12); border: 1px solid rgba(234, 88, 12, 0.35); color: #fb923c; font-weight: 800; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(234, 88, 12, 0.22)'" onmouseout="this.style.background='rgba(234, 88, 12, 0.12)'">
                                <i class="fas fa-university"></i> اختيار المحافظ والوسطاء المحليين
                            </button>
                        </div>

                    </div>
                </div>
            </section>
"@

$fiatRampsScript = @"
    <script>
        function scrollToDepositForm() {
            var el = document.getElementById('user-deposit-panel');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                var input = document.getElementById('deposit-amount-input');
                if (input) {
                    setTimeout(function() { input.focus(); }, 350);
                }
            }
        }

        function selectRampCategory(cat) {
            if (typeof switchGatewayCategory === 'function') {
                switchGatewayCategory(cat);
            }
            scrollToDepositForm();
        }
    </script>
"@

# 1. Process all HTML files for Analytics & Pixel in <head>
$htmlFiles = Get-ChildItem -Path $appDir -Filter "*.html"

foreach ($file in $htmlFiles) {
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    $modified = $false

    # Add Google Analytics & Pixel if missing
    if (-not $content.Contains("googletagmanager.com/gtag/js?id=G-XXXXXXXXXX")) {
        if ($content.Contains("</head>")) {
            $content = $content.Replace("</head>", "$analyticsSnippet`r`n</head>")
            $modified = $true
            Write-Output "Injected Analytics & Pixel into $($file.Name)"
        }
    }

    # Add Legal Links to index.html existing footer
    if ($file.Name -eq "index.html") {
        if (-not $content.Contains("terms.html")) {
            $oldIdxFooter = '<div class="footer-bottom">'
            $newIdxFooter = @"
                <div class="footer-legal-bar" style="margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap;">
                    <a href="terms.html" style="color: var(--silver-muted, #94a3b8); text-decoration: none; font-size: 0.86rem; font-weight: 600;" onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='var(--silver-muted, #94a3b8)'">شروط الاستخدام</a>
                    <span style="color: rgba(255,255,255,0.2);">•</span>
                    <a href="privacy.html" style="color: var(--silver-muted, #94a3b8); text-decoration: none; font-size: 0.86rem; font-weight: 600;" onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='var(--silver-muted, #94a3b8)'">سياسة الخصوصية</a>
                    <span style="color: rgba(255,255,255,0.2);">•</span>
                    <a href="disputes.html" style="color: var(--silver-muted, #94a3b8); text-decoration: none; font-size: 0.86rem; font-weight: 600;" onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='var(--silver-muted, #94a3b8)'">سياسة النزاعات والتحكيم</a>
                </div>
                <div class="footer-bottom">
"@
            if ($content.Contains($oldIdxFooter)) {
                $content = $content.Replace($oldIdxFooter, $newIdxFooter)
                $modified = $true
                Write-Output "Updated footer in index.html with legal links"
            }
        }
    }
    elseif ($file.Name -eq "deals.html") {
        if (-not $content.Contains("terms.html")) {
            $posFoot = $content.IndexOf('<footer class="footer"')
            if ($posFoot -ge 0) {
                $endFoot = $content.IndexOf('</footer>', $posFoot)
                if ($endFoot -ge 0) {
                    $oldDealsFoot = $content.Substring($posFoot, $endFoot - $posFoot + 9)
                    $content = $content.Replace($oldDealsFoot, $universalFooter)
                    $modified = $true
                    Write-Output "Updated footer in deals.html with universal legal footer"
                }
            }
        }
    }
    elseif ($file.Name -eq "my-accounts.html") {
        if (-not $content.Contains("terms.html")) {
            $posFoot = $content.IndexOf('<footer style="text-align: center;')
            if ($posFoot -ge 0) {
                $endFoot = $content.IndexOf('</footer>', $posFoot)
                if ($endFoot -ge 0) {
                    $oldFoot = $content.Substring($posFoot, $endFoot - $posFoot + 9)
                    $content = $content.Replace($oldFoot, $universalFooter)
                    $modified = $true
                    Write-Output "Updated footer in my-accounts.html with universal legal footer"
                }
            }
        }
    }
    elseif ($file.Name -ne "terms.html" -and $file.Name -ne "privacy.html" -and $file.Name -ne "disputes.html") {
        # Other pages: inject universal footer before mobile-bottom-nav or before </body>
        if (-not $content.Contains("waseet-legal-footer") -and -not $content.Contains("terms.html")) {
            if ($content.Contains('<nav class="mobile-bottom-nav')) {
                $content = $content.Replace('<nav class="mobile-bottom-nav', "$universalFooter`r`n`r`n    <nav class=`"mobile-bottom-nav")
                $modified = $true
                Write-Output "Injected universal legal footer before mobile nav in $($file.Name)"
            }
            elseif ($content.Contains('</body>')) {
                $content = $content.Replace('</body>', "$universalFooter`r`n</body>")
                $modified = $true
                Write-Output "Injected universal legal footer before body in $($file.Name)"
            }
        }
    }

    # Wallet.html specific updates: Fiat Ramps UI
    if ($file.Name -eq "wallet.html") {
        if (-not $content.Contains("approved-ramps-section")) {
            $targetLayout = '<!-- 2. الشبكة الرئيسية: نموذج طلب شحن الرصيد + سجل العمليات -->'
            if (-not $content.Contains($targetLayout)) {
                $targetLayout = '<section class="wallet-main-layout">'
            }
            if ($content.Contains($targetLayout)) {
                $content = $content.Replace($targetLayout, "$fiatRampsSection`r`n`r`n            $targetLayout")
                $modified = $true
                Write-Output "Injected Fiat Ramps UI section into wallet.html"
            }
        }
        if (-not $content.Contains("scrollToDepositForm")) {
            if ($content.Contains("</body>")) {
                $content = $content.Replace("</body>", "$fiatRampsScript`r`n</body>")
                $modified = $true
                Write-Output "Injected Fiat Ramps helper script into wallet.html"
            }
        }
    }

    if ($modified) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
    }
}

Write-Output "Go-Live Package scripts injection complete!"
