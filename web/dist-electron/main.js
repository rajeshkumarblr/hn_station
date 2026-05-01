import { app, ipcMain, shell, globalShortcut, BrowserWindow, nativeImage, session, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import "node:http";
import os from "node:os";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
const logFile = path.join(app.getPath("userData"), "app.log");
function logToFile(msg) {
  try {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const formatted = `[${timestamp}] ${msg}
`;
    fs.appendFileSync(logFile, formatted);
    console.log(msg);
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
}
try {
  if (fs.existsSync(logFile)) {
    fs.truncateSync(logFile);
  }
} catch (e) {
  console.error("Failed to truncate log file:", e);
}
logToFile(`[main] Log initialized: ${logFile}`);
logToFile(`[main] Version: ${app.getVersion()}`);
logToFile(`[main] App Root: ${process.env.APP_ROOT}`);
const debugLog = "C:\\Users\\rajes\\hn-station-debug.log";
function debug(msg) {
  try {
    fs.appendFileSync(debugLog, `[DEBUG ${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`);
  } catch (e) {
  }
}
debug(`Main process starting v0.9.1. __dirname=${__dirname$1}`);
debug(`APP_PATH=${app.getAppPath()}`);
if (process.platform === "win32") {
  app.setAppUserModelId("com.hnstation.app");
}
let win = null;
let localBackend = null;
let localApiPort = null;
app.setName("HN Station");
const originalUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
app.userAgentFallback = `${originalUA} Electron/${process.versions.electron}`;
function getLocalBinaryPath() {
  const binaryName = process.platform === "win32" ? "hn-local.exe" : "hn-local";
  const packaged = path.join(process.resourcesPath ?? "", binaryName);
  logToFile(`[backend] Checking packaged path: ${packaged}`);
  if (fs.existsSync(packaged)) return packaged;
  const dev = path.join(process.env.APP_ROOT ?? path.join(__dirname$1, ".."), "resources", binaryName);
  logToFile(`[backend] Checking dev path: ${dev}`);
  if (fs.existsSync(dev)) return dev;
  return null;
}
function startLocalBackend() {
  return new Promise((resolve, reject) => {
    var _a, _b;
    const binaryPath = getLocalBinaryPath();
    if (!binaryPath) {
      const err = new Error("hn-local binary not found");
      logToFile(`[backend] ERROR: ${err.message}`);
      reject(err);
      return;
    }
    const dbPath = process.platform === "win32" ? path.join(app.getPath("userData"), "hn.db") : path.join(os.homedir(), ".hn-station", "hn.db");
    logToFile(`[backend] Starting ${binaryPath} --db ${dbPath}`);
    localBackend = spawn(binaryPath, ["--port", "0", "--db", dbPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: path.dirname(binaryPath)
    });
    let resolved = false;
    let stdoutBuf = "";
    (_a = localBackend.stdout) == null ? void 0 : _a.on("data", (chunk) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
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
    (_b = localBackend.stderr) == null ? void 0 : _b.on("data", (chunk) => {
      const trimmed = chunk.toString().trim();
      if (trimmed) logToFile(`[backend][stderr] ${trimmed}`);
    });
    localBackend.on("error", (err) => {
      logToFile(`[backend] Spawn error: ${err.message}`);
      if (!resolved) reject(err);
    });
    localBackend.on("exit", (code, signal) => {
      logToFile(`[backend] exited code=${code} signal=${signal}`);
      localBackend = null;
      localApiPort = null;
    });
    setTimeout(() => {
      if (!resolved) {
        const err = new Error("Timed out waiting for hn-local to start");
        logToFile(`[backend] ERROR: ${err.message}`);
        reject(err);
      }
    }, 6e4);
  });
}
function stopLocalBackend() {
  if (localBackend) {
    logToFile("[backend] Stopping...");
    localBackend.kill("SIGTERM");
    localBackend = null;
  }
}
ipcMain.handle(
  "get-local-api-url",
  () => localApiPort ? `http://127.0.0.1:${localApiPort}` : null
);
ipcMain.on("open-external", (_, url) => {
  shell.openExternal(url);
});
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    frame: false,
    backgroundColor: "#0f172a",
    icon: path.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: true,
      preload: (() => {
        const jsPath = path.join(__dirname$1, "preload.js");
        const mjsPath = path.join(__dirname$1, "preload.mjs");
        const p = fs.existsSync(jsPath) ? jsPath : mjsPath;
        debug(`[preload] checking: js=${jsPath} exists=${fs.existsSync(jsPath)}`);
        debug(`[preload] checking: mjs=${mjsPath} exists=${fs.existsSync(mjsPath)}`);
        debug(`[preload] final choice: ${p} packaged=${app.isPackaged}`);
        return p;
      })(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Critical: some antiviruses block the sandbox bridge
      webSecurity: false
    }
  });
  debug(`BrowserWindow created. Preload applied.`);
  ipcMain.on("window-minimize", () => win == null ? void 0 : win.minimize());
  ipcMain.on("window-close", () => win == null ? void 0 : win.close());
  ipcMain.on("window-maximize", () => {
    if (win == null ? void 0 : win.isMaximized()) win.unmaximize();
    else win == null ? void 0 : win.maximize();
  });
  ipcMain.handle("window-is-maximized", () => (win == null ? void 0 : win.isMaximized()) ?? false);
  ipcMain.on("open-external", (_, url) => {
    if (url) shell.openExternal(url);
  });
  win.once("ready-to-show", () => {
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
  const iconPath = path.join(process.env.VITE_PUBLIC, "hn.ico");
  logToFile(`[main] Loading icon from: ${iconPath}`);
  if (fs.existsSync(iconPath)) {
    const appIcon = nativeImage.createFromPath(iconPath);
    if (!appIcon.isEmpty()) {
      win.setIcon(appIcon);
    }
  }
  win.setTitle("HN Station");
  win.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    win == null ? void 0 : win.setTitle("HN Station");
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    delete headers["x-frame-options"];
    delete headers["X-Frame-Options"];
    delete headers["content-security-policy"];
    delete headers["Content-Security-Policy"];
    callback({ cancel: false, responseHeaders: headers });
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logToFile(`[Renderer][${level}] ${message} (${sourceId}:${line})`);
  });
  try {
    globalShortcut.register("CommandOrControl+Shift+L", () => {
      logToFile("[main] Shortcut Ctrl+Shift+L triggered");
      if (fs.existsSync(logFile)) {
        shell.openPath(path.dirname(logFile));
      }
    });
  } catch (e) {
    logToFile(`[main] Failed to register shortcut: ${e}`);
  }
  const template = [
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectall" }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
app.whenReady().then(async () => {
  try {
    await startLocalBackend();
    logToFile("[main] Local backend ready");
  } catch (err) {
    logToFile(`[main] CRITICAL: Failed to start backend: ${err.message}`);
  }
  createWindow();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
app.on("before-quit", () => {
  stopLocalBackend();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopLocalBackend();
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
