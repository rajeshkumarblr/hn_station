import { app, BrowserWindow, session, ipcMain, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ └── main.js
// │
process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;

// Set the app name — used by Linux DEs as the WM_CLASS for taskbar icon lookup
app.setName('HN Station');

// Fake standard Chrome user agent to prevent Cloudflare Error 1020
app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function createWindow() {
    win = new BrowserWindow({
        width: 1440,
        height: 900,
        show: false,
        frame: false, // Completely frameless — our React header IS the title bar
        icon: path.join(process.env.VITE_PUBLIC!, process.platform === 'win32' ? 'hn.ico' : 'hn_256.png'), // HN icon (PNG for Linux, ICO for Windows)
        webPreferences: {
            webviewTag: true,
            preload: path.join(__dirname, 'preload.mjs'),
            webSecurity: false,
        },
    });

    // Window control IPC handlers
    ipcMain.on('window-minimize', () => win?.minimize());
    ipcMain.on('window-close', () => win?.close());
    ipcMain.on('window-maximize', () => {
        if (win?.isMaximized()) win.unmaximize();
        else win?.maximize();
    });
    ipcMain.handle('window-is-maximized', () => win?.isMaximized() ?? false);

    win.maximize(); // Start window maximized
    win.setMenu(null); // Remove default OS File/Edit/View menu
    win.show();

    // Explicitly set icon after show — required on some Linux DEs (XFCE, LXDE, etc.)
    // to update the taskbar/dock icon beyond just the WM_CLASS hint
    const iconPath = path.join(process.env.VITE_PUBLIC!, process.platform === 'win32' ? 'hn.ico' : 'hn_256.png');
    const appIcon = nativeImage.createFromPath(iconPath);
    if (!appIcon.isEmpty()) win.setIcon(appIcon);

    // Strip security headers so we can embed ANY site (OpenAI, GitHub, etc.) inside our WebViews
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        let headers = { ...details.responseHeaders };

        // Remove frame blocking headers
        delete headers['x-frame-options'];
        delete headers['X-Frame-Options'];
        delete headers['content-security-policy'];
        delete headers['Content-Security-Policy'];

        callback({ cancel: false, responseHeaders: headers });
    });

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
        // DevTools disabled — open manually with Ctrl+Shift+I if needed
        // win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'));
    }

    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer][${level}] ${message} (${sourceId}:${line})`);
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
        win = null;
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.whenReady().then(createWindow);
