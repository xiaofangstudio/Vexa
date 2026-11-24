param(
  [string]$Exe = "D:\20533\deskbox\fangwork\Vexa\src-tauri\target\release\vexa.exe",
  [string]$Out = "D:\20533\deskbox\fangwork\Vexa\docs\shots\layers-final.png",
  [string[]]$AppArgs = @(),
  [int]$WaitMs = 3200,
  [int]$PostWaitMs = 900,
  [int]$WinWidth = 0,
  [int]$WinHeight = 0,
  [string]$CdpScript = "",
  [int]$CdpPort = 0
)

$ErrorActionPreference = "Stop"
$outDir = Split-Path -Parent $Out
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class VexaShot {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2;
    public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int left, top, right, bottom; }
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, int flags, uint access, IntPtr attrs);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool CloseDesktop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumDesktopWindows(IntPtr h, EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int h2, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);

  public static IntPtr FindDesktopWindow(IntPtr desktop, uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumDesktopWindows(desktop, delegate(IntPtr h, IntPtr lp) {
      uint p;
      GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        if (sb.Length > 0) { found = h; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static IntPtr RunOnDesktop(string desktopName, string exe, string cmdline, out uint pid) {
    STARTUPINFO si = new STARTUPINFO();
    si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
    si.lpDesktop = desktopName;
    PROCESS_INFORMATION pi;
    bool ok = CreateProcess(exe, cmdline, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, System.IO.Path.GetDirectoryName(exe), ref si, out pi);
    if (!ok) { pid = 0; return IntPtr.Zero; }
    pid = (uint)pi.dwProcessId;
    CloseHandle(pi.hThread);
    return pi.hProcess;
  }
}
"@

try { [VexaShot]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch {}

function Get-ExeCommandLine {
  param([string[]]$Extra)
  if ($Extra.Count -eq 0) { return "" }
  return ($Extra | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join " "
}

function Capture-Window {
  param([IntPtr]$Hwnd, [string]$Path)
  if ($Hwnd -eq [IntPtr]::Zero) { return $false }
  [VexaShot+RECT]$r = New-Object VexaShot+RECT
  [VexaShot]::GetWindowRect($Hwnd, [ref]$r) | Out-Null
  $w = $r.right - $r.left
  $h = $r.bottom - $r.top
  if ($w -lt 100 -or $h -lt 100) { return $false }
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = [VexaShot]::PrintWindow($Hwnd, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return $ok
}

Get-Process vexa -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 200
if ($CdpPort -gt 0) {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$CdpPort --remote-allow-origins=*"
}

$desktop = [IntPtr]::Zero
$proc = $null
$procHandle = [IntPtr]::Zero
$hwnd = [IntPtr]::Zero
try {
  $name = "VexaShot-" + (Get-Random)
  $desktop = [VexaShot]::CreateDesktop($name, [IntPtr]::Zero, [IntPtr]::Zero, 0, 0x10000000, [IntPtr]::Zero)
  if ($desktop -ne [IntPtr]::Zero) {
    $cmd = Get-ExeCommandLine $AppArgs
    $full = if ($cmd) { '"' + $Exe + '" ' + $cmd } else { '"' + $Exe + '"' }
    [uint32]$procId = 0
    $procHandle = [VexaShot]::RunOnDesktop($name, $Exe, $full, [ref]$procId)
    if ($procHandle -ne [IntPtr]::Zero) {
      $deadline = (Get-Date).AddMilliseconds($WaitMs + 3000)
      while ((Get-Date) -lt $deadline -and $hwnd -eq [IntPtr]::Zero) {
        Start-Sleep -Milliseconds 150
        $hwnd = [VexaShot]::FindDesktopWindow($desktop, $procId)
      }
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    }
  }

  if ($hwnd -eq [IntPtr]::Zero) {
    if ($desktop -ne [IntPtr]::Zero) { [VexaShot]::CloseDesktop($desktop) | Out-Null; $desktop = [IntPtr]::Zero }
    $proc = Start-Process -FilePath $Exe -ArgumentList $AppArgs -PassThru
    $deadline = (Get-Date).AddMilliseconds($WaitMs + 3000)
    while ((Get-Date) -lt $deadline -and $hwnd -eq [IntPtr]::Zero) {
      Start-Sleep -Milliseconds 150
      $hwnd = $proc.MainWindowHandle
    }
  }

  if ($hwnd -eq [IntPtr]::Zero) { throw "Vexa 窗口没有出现" }
  if ($WinWidth -gt 0 -and $WinHeight -gt 0) {
    [VexaShot]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, $WinWidth, $WinHeight, 0x0006) | Out-Null
    Start-Sleep -Milliseconds 500
  }
  Start-Sleep -Milliseconds $WaitMs
  if ($CdpScript) {
    if ($CdpPort -gt 0) { $env:CDP_PORT = "$CdpPort" }
    & node $CdpScript
  }
  Start-Sleep -Milliseconds $PostWaitMs
  $ok = Capture-Window $hwnd $Out
  "saved $Out hwnd=$hwnd virtualDesktop=$($desktop -ne [IntPtr]::Zero) printWindow=$ok"
}
finally {
  if ($proc) { try { $proc | Stop-Process -Force } catch {} }
  if ($procHandle -ne [IntPtr]::Zero) { try { [VexaShot]::TerminateProcess($procHandle, 0) | Out-Null; [VexaShot]::CloseHandle($procHandle) | Out-Null } catch {} }
  Get-Process vexa -ErrorAction SilentlyContinue | Stop-Process -Force
  if ($desktop -ne [IntPtr]::Zero) { [VexaShot]::CloseDesktop($desktop) | Out-Null }
}
