import { app, BrowserWindow, session, ipcMain, nativeImage, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT, 'public')
    : RENDERER_DIST;

// Set App User Model ID early for correct Windows Taskbar grouping/pinning
if (process.platform === 'win32') {
    app.setAppUserModelId('com.hnstation.app');
}

let win: BrowserWindow | null = null;
let localBackend: ChildProcess | null = null;
let localApiPort: number | null = null;

// Set the app name — used by Linux DEs as the WM_CLASS for taskbar icon lookup
app.setName('HN Station');

// Fake standard Chrome user agent to prevent Cloudflare Error 1020
app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ── Local backend (hn-local binary) ──────────────────────────────────────────
// Locate the bundled Go binary: in packaged app it's in resources/, in dev it's in web/resources/
function getLocalBinaryPath(): string | null {
    const binaryName = process.platform === 'win32' ? 'hn-local.exe' : 'hn-local';

    // Packaged: resources/ next to the app
    const packaged = path.join(process.resourcesPath ?? '', binaryName);
    if (fs.existsSync(packaged)) return packaged;

    // Dev: web/resources/hn-local
    const dev = path.join(process.env.APP_ROOT ?? path.join(__dirname, '..'), 'resources', binaryName);
    if (fs.existsSync(dev)) return dev;

    return null;
}

function startLocalBackend(): Promise<number> {
    return new Promise((resolve, reject) => {
        const binaryPath = getLocalBinaryPath();
        if (!binaryPath) {
            reject(new Error('hn-local binary not found — run: make build-local-linux'));
            return;
        }

        // DB lives in userData so it persists across app updates
        const dbPath = path.join(app.getPath('userData'), 'hn.db');
        console.log(`[backend] Starting ${binaryPath} --db ${dbPath}`);

        localBackend = spawn(binaryPath, ['--port', '0', '--db', dbPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let resolved = false;

        // Read stdout line by line to find LISTENING:<port>
        let stdoutBuf = '';
        localBackend.stdout?.on('data', (chunk: Buffer) => {
            stdoutBuf += chunk.toString();
            const lines = stdoutBuf.split('\n');
            stdoutBuf = lines.pop() ?? '';
            for (const line of lines) {
                console.log(`[backend] ${line}`);
                const m = line.match(/^LISTENING:(\d+)/);
                if (m && !resolved) {
                    resolved = true;
                    localApiPort = parseInt(m[1], 10);
                    console.log(`[backend] API on port ${localApiPort}`);
                    resolve(localApiPort);
                }
            }
        });
        localBackend.stderr?.on('data', (chunk: Buffer) => {
            process.stderr.write(`[backend] ${chunk}`);
        });
        localBackend.on('error', (err) => {
            if (!resolved) reject(err);
            else console.error('[backend] error:', err);
        });
        localBackend.on('exit', (code, signal) => {
            console.log(`[backend] exited code=${code} signal=${signal}`);
            localBackend = null;
            localApiPort = null;
        });

        // Timeout after 60s — give it plenty of time on crowded systems
        setTimeout(() => {
            if (!resolved) reject(new Error('Timed out waiting for hn-local to start'));
        }, 60_000);
    });
}

function stopLocalBackend() {
    if (localBackend) {
        console.log('[backend] Sending SIGTERM');
        localBackend.kill('SIGTERM');
        localBackend = null;
    }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-local-api-url', () =>
    localApiPort ? `http://localhost:${localApiPort}` : null
);

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
    win = new BrowserWindow({
        width: 1440,
        height: 900,
        show: false,
        frame: false,
        backgroundColor: '#0f172a', // Prevents white flashes
        icon: path.join(process.env.VITE_PUBLIC!, 'hn.ico'),
        webPreferences: {
            webviewTag: true,
            preload: path.join(__dirname, 'preload.mjs'),
            webSecurity: false,
        },
    });

    // Window control IPC
    ipcMain.on('window-minimize', () => win?.minimize());
    ipcMain.on('window-close', () => win?.close());
    ipcMain.on('window-maximize', () => {
        if (win?.isMaximized()) win.unmaximize();
        else win?.maximize();
    });
    ipcMain.handle('window-is-maximized', () => win?.isMaximized() ?? false);

    // Wait for the renderer to be ready before showing to avoid white flashes
    win.once('ready-to-show', () => {
        if (win) {
            // v4.26: Deferred Maximization Fix for Linux
            // 1. Show the window in its normal state first
            win.show();
            win.focus();

            // 2. Explicitly ensure we are NOT in fullscreen mode (which often triggers overlap)
            win.setFullScreen(false);

            // 3. Defer maximization to allow the OS compositor to register the window properly
            setTimeout(() => {
                if (win && !win.isMaximized()) {
                    win.maximize();
                }
            }, 300);

            // v4.20 Deep Debug: Open DevTools in DETACHED window so they are visible even if win is white
            // if (VITE_DEV_SERVER_URL) {
            //     win.webContents.openDevTools({ mode: 'detach' });
            // }
        }
    });

    win.setMenu(null);

    // Icon
    const iconPath = path.join(process.env.VITE_PUBLIC!, 'hn.ico');
    console.log(`[main] Loading icon from: ${iconPath}`);
    if (fs.existsSync(iconPath)) {
        const appIcon = nativeImage.createFromPath(iconPath);
        if (!appIcon.isEmpty()) {
            win.setIcon(appIcon);
        }
    }

    // Lock window title (prevent Chromium '[WARN:COPY MODE]' override)
    win.setTitle('HN Station');
    win.webContents.on('page-title-updated', (event) => {
        event.preventDefault();
        win?.setTitle('HN Station');
    });

    // Strip security headers so we can embed any site in WebViews
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        delete headers['x-frame-options'];
        delete headers['X-Frame-Options'];
        delete headers['content-security-policy'];
        delete headers['Content-Security-Policy'];
        callback({ cancel: false, responseHeaders: headers });
    });

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'));
    }

    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        console.log(`[Renderer][${level}] ${message} (${sourceId}:${line})`);
    });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    // Start local backend first, then open the window
    try {
        await startLocalBackend();
        console.log('[main] Local backend ready');
    } catch (err) {
        console.error('[main] Failed to start local backend:', err);
        // Continue anyway — the app will fall back to hnstation.dev
    }
    createWindow();
});

app.on('before-quit', () => {
    stopLocalBackend();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        stopLocalBackend();
        app.quit();
        win = null;
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
