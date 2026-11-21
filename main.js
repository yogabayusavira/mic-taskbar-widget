const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

// Windows 10 taskbar look: DWM blur-behind (accent state 3) plus a rounded window region.
// shortcut: runs once at startup via PowerShell (no native addon); region won't follow a later DPI change, re-run on display-metrics-changed if that matters.
const BLUR_CS = `
using System; using System.Runtime.InteropServices;
public static class WidgetBlur {
  [StructLayout(LayoutKind.Sequential)] struct Accent { public int State, Flags; public uint Color; public int Anim; }
  [StructLayout(LayoutKind.Sequential)] struct Data { public int Attr; public IntPtr Ptr; public IntPtr Size; }
  [DllImport("user32.dll")] static extern int SetWindowCompositionAttribute(IntPtr h, ref Data d);
  [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr h, IntPtr r, bool redraw);
  [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int l, int t, int r, int b, int w, int h);
  public static string Apply(long hwnd, int l, int t, int r, int b, int d) {
    var h = new IntPtr(hwnd); var a = new Accent { State = 3 }; int n = Marshal.SizeOf(a);
    IntPtr p = Marshal.AllocHGlobal(n); Marshal.StructureToPtr(a, p, false);
    var data = new Data { Attr = 19, Ptr = p, Size = new IntPtr(n) };
    int blur = SetWindowCompositionAttribute(h, ref data); Marshal.FreeHGlobal(p);
    int rgn = SetWindowRgn(h, CreateRoundRectRgn(l, t, r, b, d, d), true);
    return blur + " " + rgn;
  }
}`;

function applyTaskbarGlass(win) {
  if (process.platform !== 'win32') return;
  const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0);
  const s = screen.getPrimaryDisplay().scaleFactor;
  // Window is exactly the .widget box; 12px radius matches styles.css. No margin, or the blur shows in it.
  const px = (v) => Math.round(v * s);
  const args = [hwnd, 0, 0, px(WIDGET_WIDTH) + 1, px(WIDGET_HEIGHT) + 1, px(24)].join(', ');
  const script = `Add-Type -TypeDefinition @'\n${BLUR_CS}\n'@\n[WidgetBlur]::Apply(${args})`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { windowsHide: true }, (err, out) => { if (err) console.error('glass failed:', err.message); else console.log('glass:', out.trim()); });
}

const WIDGET_WIDTH = 266;
const WIDGET_HEIGHT = 56;
let widget;
let isQuitting = false;
let dockTimer;

function taskbarPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WIDGET_WIDTH - 18,
    y: workArea.y + workArea.height - WIDGET_HEIGHT - 4, // small gap so the rounded bottom clears the taskbar
  };
}

function dockToTaskbar() {
  if (!widget || widget.isDestroyed()) return;
  clearTimeout(dockTimer);
  const target = taskbarPosition();
  const [x, y] = widget.getPosition();
  if (x !== target.x || y !== target.y) widget.setPosition(target.x, target.y);
}

function createWidget() {
  widget = new BrowserWindow({
    ...taskbarPosition(),
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    minWidth: WIDGET_WIDTH,
    minHeight: WIDGET_HEIGHT,
    maxWidth: WIDGET_WIDTH,
    maxHeight: WIDGET_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false, // Windows draws the shadow as a rectangle around the rounded window
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widget.setAlwaysOnTop(true, 'floating');
  widget.loadFile('index.html');
  widget.once('ready-to-show', () => { widget.showInactive(); applyTaskbarGlass(widget); });
  // The pill may be tugged, but always settles back onto the taskbar edge.
  widget.on('moved', () => {
    clearTimeout(dockTimer);
    dockTimer = setTimeout(dockToTaskbar, 180);
  });
  widget.on('closed', () => { widget = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(() => {
  // This takes effect after the packaged app is installed; development launches stay manual.
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  createWidget();
  screen.on('display-metrics-changed', dockToTaskbar);
  screen.on('display-added', dockToTaskbar);
  screen.on('display-removed', dockToTaskbar);
});

app.on('second-instance', () => {
  if (widget) widget.showInactive();
});

ipcMain.on('widget:quit', () => {
  isQuitting = true;
  app.quit();
});
app.on('window-all-closed', (event) => {
  if (!isQuitting) event.preventDefault();
});
