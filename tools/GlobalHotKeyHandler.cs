using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace WaseetSnipper {
    public class GlobalHotKeyHandler : Form {
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_HOTKEY = 0x0312;

        public const int MOD_ALT = 0x0001;
        public const int MOD_CONTROL = 0x0002;
        public const int MOD_SHIFT = 0x0004;

        private const int VK_SHIFT = 0x10;
        private const int VK_CONTROL = 0x11;
        private const int VK_MENU = 0x12; // Alt
        private const int VK_RMENU = 0xA5; // Right Alt (AltGr)

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
        private LowLevelKeyboardProc _proc;
        private IntPtr _hookId = IntPtr.Zero;

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, int fsModifiers, int vk);

        [DllImport("user32.dll")]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        public Action OnHotKey1;
        public Action OnHotKey2;

        private bool _isActionRunning = false;

        public GlobalHotKeyHandler() {
            this.ShowInTaskbar = false;
            this.WindowState = FormWindowState.Minimized;
            this.FormBorderStyle = FormBorderStyle.None;
            this.Size = new System.Drawing.Size(0, 0);
            this.Opacity = 0;
            // Force Win32 window handle creation
            IntPtr h = this.Handle;
            _proc = HookCallback;
        }

        protected override void SetVisibleCore(bool value) {
            base.SetVisibleCore(false);
        }

        public void StartHook() {
            // Register low-level hook
            if (_hookId == IntPtr.Zero) {
                _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, IntPtr.Zero, 0);
            }

            // Dual protection: Also register Windows HotKeys on HWND
            RegisterHotKey(this.Handle, 101, MOD_CONTROL | MOD_ALT, 0x31); // Ctrl+Alt+1
            RegisterHotKey(this.Handle, 102, MOD_CONTROL | MOD_ALT, 0x32); // Ctrl+Alt+2
            RegisterHotKey(this.Handle, 103, MOD_SHIFT | MOD_ALT, 0x31);   // Shift+Alt+1
            RegisterHotKey(this.Handle, 104, MOD_SHIFT | MOD_ALT, 0x32);   // Shift+Alt+2
            RegisterHotKey(this.Handle, 105, MOD_CONTROL | MOD_SHIFT, 0x58); // Ctrl+Shift+X
        }

        public void StopHook() {
            if (_hookId != IntPtr.Zero) {
                UnhookWindowsHookEx(_hookId);
                _hookId = IntPtr.Zero;
            }
            try {
                UnregisterHotKey(this.Handle, 101);
                UnregisterHotKey(this.Handle, 102);
                UnregisterHotKey(this.Handle, 103);
                UnregisterHotKey(this.Handle, 104);
                UnregisterHotKey(this.Handle, 105);
            } catch {}
        }

        protected override void WndProc(ref Message m) {
            base.WndProc(ref m);
            if (m.Msg == WM_HOTKEY && !_isActionRunning) {
                int id = m.WParam.ToInt32();
                if ((id == 101 || id == 103 || id == 105) && OnHotKey1 != null) {
                    TriggerBoxAction();
                } else if ((id == 102 || id == 104) && OnHotKey2 != null) {
                    TriggerFullAction();
                }
            }
        }

        private void TriggerBoxAction() {
            if (_isActionRunning) return;
            _isActionRunning = true;
            this.BeginInvoke(new Action(() => {
                try {
                    if (OnHotKey1 != null) OnHotKey1();
                } catch (Exception ex) {
                    try { System.IO.File.AppendAllText("D:\\waseet-app\\tests\\snipper-error.log", ex.ToString() + Environment.NewLine); } catch {}
                } finally {
                    _isActionRunning = false;
                }
            }));
        }

        private void TriggerFullAction() {
            if (_isActionRunning) return;
            _isActionRunning = true;
            this.BeginInvoke(new Action(() => {
                try {
                    if (OnHotKey2 != null) OnHotKey2();
                } catch (Exception ex) {
                    try { System.IO.File.AppendAllText("D:\\waseet-app\\tests\\snipper-error.log", ex.ToString() + Environment.NewLine); } catch {}
                } finally {
                    _isActionRunning = false;
                }
            }));
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
                KBDLLHOOKSTRUCT kb = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));

                bool isAltDown = (kb.flags & 32) != 0 || 
                                 (GetAsyncKeyState(VK_MENU) & 0x8000) != 0 || 
                                 (GetAsyncKeyState(VK_RMENU) & 0x8000) != 0;
                bool isCtrlDown = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
                bool isShiftDown = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
                bool isRightAltDown = (GetAsyncKeyState(VK_RMENU) & 0x8000) != 0;

                bool boxModifier = (isAltDown && isCtrlDown) || 
                                   (isAltDown && isShiftDown) || 
                                   (isCtrlDown && isShiftDown) ||
                                   isRightAltDown;

                if (boxModifier && !_isActionRunning) {
                    // Box Selection keys: '1' (0x31), Numpad1 (0x61), 'X' (0x58), 'Z' (0x5A)
                    if (kb.vkCode == 0x31 || kb.vkCode == 0x61 || kb.vkCode == 0x58 || kb.vkCode == 0x5A) {
                        TriggerBoxAction();
                        return (IntPtr)1; // Consume keystroke
                    }

                    // Full Screen keys: '2' (0x32), Numpad2 (0x62), 'F' (0x46)
                    if (kb.vkCode == 0x32 || kb.vkCode == 0x62 || kb.vkCode == 0x46) {
                        TriggerFullAction();
                        return (IntPtr)1; // Consume keystroke
                    }
                }
            }
            return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }
    }
}
