import { app, ipcMain, BrowserWindow, nativeImage, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win = null;
let localBackend = null;
let localApiPort = null;
app.setName("HN Station");
app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
function getLocalBinaryPath() {
  const binaryName = process.platform === "win32" ? "hn-local.exe" : "hn-local";
  const packaged = path.join(process.resourcesPath ?? "", binaryName);
  if (fs.existsSync(packaged)) return packaged;
  const dev = path.join(process.env.APP_ROOT ?? path.join(__dirname$1, ".."), "resources", binaryName);
  if (fs.existsSync(dev)) return dev;
  return null;
}
function startLocalBackend() {
  return new Promise((resolve, reject) => {
    var _a, _b;
    const binaryPath = getLocalBinaryPath();
    if (!binaryPath) {
      reject(new Error("hn-local binary not found — run: make build-local-linux"));
      return;
    }
    const dbPath = path.join(app.getPath("userData"), "hn.db");
    console.log(`[backend] Starting ${binaryPath} --db ${dbPath}`);
    localBackend = spawn(binaryPath, ["--port", "0", "--db", dbPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let resolved = false;
    let stdoutBuf = "";
    (_a = localBackend.stdout) == null ? void 0 : _a.on("data", (chunk) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
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
    (_b = localBackend.stderr) == null ? void 0 : _b.on("data", (chunk) => {
      process.stderr.write(`[backend] ${chunk}`);
    });
    localBackend.on("error", (err) => {
      if (!resolved) reject(err);
      else console.error("[backend] error:", err);
    });
    localBackend.on("exit", (code, signal) => {
      console.log(`[backend] exited code=${code} signal=${signal}`);
      localBackend = null;
      localApiPort = null;
    });
    setTimeout(() => {
      if (!resolved) reject(new Error("Timed out waiting for hn-local to start"));
    }, 6e4);
  });
}
function stopLocalBackend() {
  if (localBackend) {
    console.log("[backend] Sending SIGTERM");
    localBackend.kill("SIGTERM");
    localBackend = null;
  }
}
ipcMain.handle(
  "get-local-api-url",
  () => localApiPort ? `http://localhost:${localApiPort}` : null
);
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    frame: false,
    backgroundColor: "#0f172a",
    // Prevents white flashes
    icon: path.join(process.env.VITE_PUBLIC, process.platform === "win32" ? "hn.ico" : "hn_256.png"),
    webPreferences: {
      webviewTag: true,
      preload: path.join(__dirname$1, "preload.mjs"),
      webSecurity: false
    }
  });
  ipcMain.on("window-minimize", () => win == null ? void 0 : win.minimize());
  ipcMain.on("window-close", () => win == null ? void 0 : win.close());
  ipcMain.on("window-maximize", () => {
    if (win == null ? void 0 : win.isMaximized()) win.unmaximize();
    else win == null ? void 0 : win.maximize();
  });
  ipcMain.handle("window-is-maximized", () => (win == null ? void 0 : win.isMaximized()) ?? false);
  win.once("ready-to-show", () => {
    if (win) {
      win.maximize();
      win.show();
      win.focus();
      if (VITE_DEV_SERVER_URL) {
        win.webContents.openDevTools({ mode: "detach" });
      }
    }
  });
  win.setMenu(null);
  const iconPath = path.join(process.env.VITE_PUBLIC, process.platform === "win32" ? "hn.ico" : "hn_256.png");
  const appIcon = nativeImage.createFromPath(iconPath);
  if (!appIcon.isEmpty()) win.setIcon(appIcon);
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
    console.log(`[Renderer][${level}] ${message} (${sourceId}:${line})`);
  });
}
app.whenReady().then(async () => {
  try {
    await startLocalBackend();
    console.log("[main] Local backend ready");
  } catch (err) {
    console.error("[main] Failed to start local backend:", err);
  }
  createWindow();
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
