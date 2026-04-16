import { app as r, ipcMain as f, shell as x, globalShortcut as T, BrowserWindow as I, nativeImage as j, session as A } from "electron";
import s from "node:path";
import { fileURLToPath as L } from "node:url";
import { spawn as O } from "node:child_process";
import l from "node:fs";
import "node:http";
import C from "node:os";
const S = s.dirname(L(import.meta.url));
process.env.APP_ROOT = s.join(S, "..");
const $ = process.env.VITE_DEV_SERVER_URL, G = s.join(process.env.APP_ROOT, "dist-electron"), E = s.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = $ ? s.join(process.env.APP_ROOT, "public") : E;
const g = s.join(r.getPath("userData"), "app.log");
function o(n) {
  try {
    const i = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`;
    l.appendFileSync(g, i), console.log(n);
  } catch (t) {
    console.error("Failed to write to log file:", t);
  }
}
try {
  l.existsSync(g) && l.truncateSync(g);
} catch (n) {
  console.error("Failed to truncate log file:", n);
}
o(`[main] Log initialized: ${g}`);
o(`[main] Version: ${r.getVersion()}`);
o(`[main] App Root: ${process.env.APP_ROOT}`);
const F = "C:\\Users\\rajes\\hn-station-debug.log";
function u(n) {
  try {
    l.appendFileSync(F, `[DEBUG ${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`);
  } catch {
  }
}
u(`Main process starting v0.9.3. __dirname=${S}`);
u(`APP_PATH=${r.getAppPath()}`);
process.platform === "win32" && r.setAppUserModelId("com.hnstation.app");
let e = null, d = null, h = null;
r.setName("HN Station");
const z = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
r.userAgentFallback = `${z} Electron/${process.versions.electron}`;
function B() {
  const n = process.platform === "win32" ? "hn-local.exe" : "hn-local", t = s.join(process.resourcesPath ?? "", n);
  if (o(`[backend] Checking packaged path: ${t}`), l.existsSync(t)) return t;
  const i = s.join(process.env.APP_ROOT ?? s.join(S, ".."), "resources", n);
  return o(`[backend] Checking dev path: ${i}`), l.existsSync(i) ? i : null;
}
function D() {
  return new Promise((n, t) => {
    var b, w;
    const i = B();
    if (!i) {
      const a = new Error("hn-local binary not found");
      o(`[backend] ERROR: ${a.message}`), t(a);
      return;
    }
    const c = process.platform === "win32" ? s.join(r.getPath("userData"), "hn.db") : s.join(C.homedir(), ".hn-station", "hn.db");
    o(`[backend] Starting ${i} --db ${c}`), d = O(i, ["--port", "0", "--db", c], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: s.dirname(i)
    });
    let m = !1, P = "";
    (b = d.stdout) == null || b.on("data", (a) => {
      P += a.toString();
      const p = P.split(`
`);
      P = p.pop() ?? "";
      for (const y of p) {
        const R = y.trim();
        R && o(`[backend][stdout] ${R}`);
        const k = y.match(/^LISTENING:(\d+)/);
        k && !m && (m = !0, h = parseInt(k[1], 10), o(`[backend] API on port ${h}`), n(h));
      }
    }), (w = d.stderr) == null || w.on("data", (a) => {
      const p = a.toString().trim();
      p && o(`[backend][stderr] ${p}`);
    }), d.on("error", (a) => {
      o(`[backend] Spawn error: ${a.message}`), m || t(a);
    }), d.on("exit", (a, p) => {
      o(`[backend] exited code=${a} signal=${p}`), d = null, h = null;
    }), setTimeout(() => {
      if (!m) {
        const a = new Error("Timed out waiting for hn-local to start");
        o(`[backend] ERROR: ${a.message}`), t(a);
      }
    }, 6e4);
  });
}
function _() {
  d && (o("[backend] Stopping..."), d.kill("SIGTERM"), d = null);
}
f.handle(
  "get-local-api-url",
  () => h ? `http://127.0.0.1:${h}` : null
);
f.on("open-external", (n, t) => {
  x.openExternal(t);
});
function v() {
  e = new I({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    icon: s.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: (() => {
        const t = s.join(S, "preload.js"), i = s.join(S, "preload.mjs"), c = l.existsSync(t) ? t : i;
        return u(`[preload] checking: js=${t} exists=${l.existsSync(t)}`), u(`[preload] checking: mjs=${i} exists=${l.existsSync(i)}`), u(`[preload] final choice: ${c} packaged=${r.isPackaged}`), c;
      })(),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      // Critical: some antiviruses block the sandbox bridge
      webSecurity: !1
    }
  }), u("BrowserWindow created. Preload applied."), f.on("window-minimize", () => e == null ? void 0 : e.minimize()), f.on("window-close", () => e == null ? void 0 : e.close()), f.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), f.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const n = s.join(process.env.VITE_PUBLIC, "hn.ico");
  if (o(`[main] Loading icon from: ${n}`), l.existsSync(n)) {
    const t = j.createFromPath(n);
    t.isEmpty() || e.setIcon(t);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (t) => {
    t.preventDefault(), e == null || e.setTitle("HN Station");
  }), A.defaultSession.webRequest.onHeadersReceived((t, i) => {
    const c = { ...t.responseHeaders };
    delete c["x-frame-options"], delete c["X-Frame-Options"], delete c["content-security-policy"], delete c["Content-Security-Policy"], i({ cancel: !1, responseHeaders: c });
  }), $ ? e.loadURL($) : e.loadFile(s.join(E, "index.html")), e.webContents.on("console-message", (t, i, c, m, P) => {
    o(`[Renderer][${i}] ${c} (${P}:${m})`);
  });
  try {
    T.register("CommandOrControl+Shift+L", () => {
      o("[main] Shortcut Ctrl+Shift+L triggered"), l.existsSync(g) && x.openPath(s.dirname(g));
    });
  } catch (t) {
    o(`[main] Failed to register shortcut: ${t}`);
  }
}
r.whenReady().then(async () => {
  try {
    await D(), o("[main] Local backend ready");
  } catch (n) {
    o(`[main] CRITICAL: Failed to start backend: ${n.message}`);
  }
  v();
});
r.on("will-quit", () => {
  T.unregisterAll();
});
r.on("before-quit", () => {
  _();
});
r.on("window-all-closed", () => {
  process.platform !== "darwin" && (_(), r.quit(), e = null);
});
r.on("activate", () => {
  I.getAllWindows().length === 0 && v();
});
export {
  G as MAIN_DIST,
  E as RENDERER_DIST,
  $ as VITE_DEV_SERVER_URL
};
