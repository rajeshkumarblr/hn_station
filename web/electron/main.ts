import { app, BrowserWindow, session, ipcMain, nativeImage, globalShortcut, shell } from 'electron';
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

// ── Logging ──────────────────────────────────────────────────────────────────
const logFile = path.join(app.getPath('userData'), 'app.log');

function logToFile(msg: string) {
    try {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] ${msg}\n`;
        fs.appendFileSync(logFile, formatted);
        console.log(msg);
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
}

// Clear log on startup
try {
    if (fs.existsSync(logFile)) {
        fs.truncateSync(logFile);
    }
} catch (e) {
    console.error('Failed to truncate log file:', e);
}

logToFile(`[main] Log initialized: ${logFile}`);
logToFile(`[main] Version: ${app.getVersion()}`);
logToFile(`[main] App Root: ${process.env.APP_ROOT}`);

// Set App User Model ID early for correct Windows Taskbar grouping/pinning
if (process.platform === 'win32') {
    app.setAppUserModelId('com.hnstation.app');
}

let win: BrowserWindow | null = null;
let localBackend: ChildProcess | null = null;
let localApiPort: number | null = null;

// Set the app name
app.setName('HN Station');

// Fake standard Chrome user agent
app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ── Local backend (hn-local binary) ──────────────────────────────────────────
function getLocalBinaryPath(): string | null {
    const binaryName = process.platform === 'win32' ? 'hn-local.exe' : 'hn-local';

    // Packaged: resources/ next to the app
    const packaged = path.join(process.resourcesPath ?? '', binaryName);
    logToFile(`[backend] Checking packaged path: ${packaged}`);
    if (fs.existsSync(packaged)) return packaged;

    // Dev: resources/ (adjacent to dist-electron)
    const dev = path.join(process.env.APP_ROOT ?? path.join(__dirname, '..'), 'resources', binaryName);
    logToFile(`[backend] Checking dev path: ${dev}`);
    if (fs.existsSync(dev)) return dev;

    return null;
}

function startLocalBackend(): Promise<number> {
    return new Promise((resolve, reject) => {
        const binaryPath = getLocalBinaryPath();
        if (!binaryPath) {
            const err = new Error('hn-local binary not found');
            logToFile(`[backend] ERROR: ${err.message}`);
            reject(err);
            return;
        }

        const dbPath = path.join(app.getPath('userData'), 'hn.db');
        logToFile(`[backend] Starting ${binaryPath} --db ${dbPath}`);

        localBackend = spawn(binaryPath, ['--port', '0', '--db', dbPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: path.dirname(binaryPath)
        });

        let resolved = false;

        let stdoutBuf = '';
        localBackend.stdout?.on('data', (chunk: Buffer) => {
            stdoutBuf += chunk.toString();
            const lines = stdoutBuf.split('\n');
            stdoutBuf = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) logToFile(`[backend][stdout] ${trimmed}`);
                const m = line.match(/^LISTENING:(\d+)/);
                if (m && !resolved) {
                    resolved = true;
                    localApiPort = parseInt(m[1], 10);
                    logToFile(`[backend] API on port ${localApiPort}`);
                    resolve(localApiPort);
                }
            }
        });

        localBackend.stderr?.on('data', (chunk: Buffer) => {
            const trimmed = chunk.toString().trim();
            if (trimmed) logToFile(`[backend][stderr] ${trimmed}`);
        });

        localBackend.on('error', (err) => {
            logToFile(`[backend] Spawn error: ${err.message}`);
            if (!resolved) reject(err);
        });

        localBackend.on('exit', (code, signal) => {
            logToFile(`[backend] exited code=${code} signal=${signal}`);
            localBackend = null;
            localApiPort = null;
        });

        setTimeout(() => {
            if (!resolved) {
                const err = new Error('Timed out waiting for hn-local to start');
                logToFile(`[backend] ERROR: ${err.message}`);
                reject(err);
            }
        }, 60_000);
    });
}

function stopLocalBackend() {
    if (localBackend) {
        logToFile('[backend] Stopping...');
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
        backgroundColor: '#0f172a',
        icon: path.join(process.env.VITE_PUBLIC!, 'hn.ico'),
        webPreferences: {
            webviewTag: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
        },
    });

    ipcMain.on('window-minimize', () => win?.minimize());
    ipcMain.on('window-close', () => win?.close());
    ipcMain.on('window-maximize', () => {
        if (win?.isMaximized()) win.unmaximize();
        else win?.maximize();
    });
    ipcMain.handle('window-is-maximized', () => win?.isMaximized() ?? false);

    win.once('ready-to-show', () => {
        if (win) {
            win.show();
            win.focus();
            win.setFullScreen(false);
            setTimeout(() => {
                if (win && !win.isMaximized()) {
                    win.maximize();
                }
            }, 300);
        }
    });

    win.setMenu(null);

    const iconPath = path.join(process.env.VITE_PUBLIC!, 'hn.ico');
    logToFile(`[main] Loading icon from: ${iconPath}`);
    if (fs.existsSync(iconPath)) {
        const appIcon = nativeImage.createFromPath(iconPath);
        if (!appIcon.isEmpty()) {
            win.setIcon(appIcon);
        }
    }

    win.setTitle('HN Station');
    win.webContents.on('page-title-updated', (event) => {
        event.preventDefault();
        win?.setTitle('HN Station');
    });

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
        logToFile(`[Renderer][${level}] ${message} (${sourceId}:${line})`);
    });

    // globalShortcut must be registered when app is ready
    try {
        globalShortcut.register('CommandOrControl+Shift+L', () => {
            logToFile('[main] Shortcut Ctrl+Shift+L triggered');
            if (fs.existsSync(logFile)) {
                shell.openPath(path.dirname(logFile));
            }
        });
    } catch (e) {
        logToFile(`[main] Failed to register shortcut: ${e}`);
    }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    try {
        await startLocalBackend();
        logToFile('[main] Local backend ready');
    } catch (err: any) {
        logToFile(`[main] CRITICAL: Failed to start local backend: ${err.message}`);
    }
    createWindow();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
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
