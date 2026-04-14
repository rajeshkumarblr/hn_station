import { app as c, ipcMain as f, shell as x, globalShortcut as T, BrowserWindow as I, nativeImage as v, session as j } from "electron";
import s from "node:path";
import { fileURLToPath as L } from "node:url";
import { spawn as O } from "node:child_process";
import l from "node:fs";
import "node:http";
import C from "node:os";
const S = s.dirname(L(import.meta.url));
process.env.APP_ROOT = s.join(S, "..");
const $ = process.env.VITE_DEV_SERVER_URL, q = s.join(process.env.APP_ROOT, "dist-electron"), E = s.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = $ ? s.join(process.env.APP_ROOT, "public") : E;
const g = s.join(c.getPath("userData"), "app.log");
function t(n) {
  try {
    const i = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`;
    l.appendFileSync(g, i), console.log(n);
  } catch (o) {
    console.error("Failed to write to log file:", o);
  }
}
try {
  l.existsSync(g) && l.truncateSync(g);
} catch (n) {
  console.error("Failed to truncate log file:", n);
}
t(`[main] Log initialized: ${g}`);
t(`[main] Version: ${c.getVersion()}`);
t(`[main] App Root: ${process.env.APP_ROOT}`);
const F = "C:\\Users\\rajes\\hn-station-debug.log";
function u(n) {
  try {
    l.appendFileSync(F, `[DEBUG ${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`);
  } catch {
  }
}
u(`Main process starting v0.9.0. __dirname=${S}`);
u(`APP_PATH=${c.getAppPath()}`);
process.platform === "win32" && c.setAppUserModelId("com.hnstation.app");
let e = null, d = null, h = null;
c.setName("HN Station");
const z = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
c.userAgentFallback = `${z} Electron/${process.versions.electron}`;
function D() {
  const n = process.platform === "win32" ? "hn-local.exe" : "hn-local", o = s.join(process.resourcesPath ?? "", n);
  if (t(`[backend] Checking packaged path: ${o}`), l.existsSync(o)) return o;
  const i = s.join(process.env.APP_ROOT ?? s.join(S, ".."), "resources", n);
  return t(`[backend] Checking dev path: ${i}`), l.existsSync(i) ? i : null;
}
function M() {
  return new Promise((n, o) => {
    var b, w;
    const i = D();
    if (!i) {
      const a = new Error("hn-local binary not found");
      t(`[backend] ERROR: ${a.message}`), o(a);
      return;
    }
    const r = process.platform === "win32" ? s.join(process.env.PROGRAMDATA || "C:\\ProgramData", "HNStation", "hn.db") : s.join(C.homedir(), ".hn-station", "hn.db");
    t(`[backend] Starting ${i} --db ${r}`), d = O(i, ["--port", "0", "--db", r], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: s.dirname(i)
    });
    let m = !1, P = "";
    (b = d.stdout) == null || b.on("data", (a) => {
      P += a.toString();
      const p = P.split(`
`);
      P = p.pop() ?? "";
      for (const R of p) {
        const y = R.trim();
        y && t(`[backend][stdout] ${y}`);
        const k = R.match(/^LISTENING:(\d+)/);
        k && !m && (m = !0, h = parseInt(k[1], 10), t(`[backend] API on port ${h}`), n(h));
      }
    }), (w = d.stderr) == null || w.on("data", (a) => {
      const p = a.toString().trim();
      p && t(`[backend][stderr] ${p}`);
    }), d.on("error", (a) => {
      t(`[backend] Spawn error: ${a.message}`), m || o(a);
    }), d.on("exit", (a, p) => {
      t(`[backend] exited code=${a} signal=${p}`), d = null, h = null;
    }), setTimeout(() => {
      if (!m) {
        const a = new Error("Timed out waiting for hn-local to start");
        t(`[backend] ERROR: ${a.message}`), o(a);
      }
    }, 6e4);
  });
}
function _() {
  d && (t("[backend] Stopping..."), d.kill("SIGTERM"), d = null);
}
f.handle(
  "get-local-api-url",
  () => h ? `http://127.0.0.1:${h}` : null
);
f.on("open-external", (n, o) => {
  x.openExternal(o);
});
function A() {
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
        const o = s.join(S, "preload.js"), i = s.join(S, "preload.mjs"), r = l.existsSync(o) ? o : i;
        return u(`[preload] checking: js=${o} exists=${l.existsSync(o)}`), u(`[preload] checking: mjs=${i} exists=${l.existsSync(i)}`), u(`[preload] final choice: ${r} packaged=${c.isPackaged}`), r;
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
  if (t(`[main] Loading icon from: ${n}`), l.existsSync(n)) {
    const o = v.createFromPath(n);
    o.isEmpty() || e.setIcon(o);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (o) => {
    o.preventDefault(), e == null || e.setTitle("HN Station");
  }), j.defaultSession.webRequest.onHeadersReceived((o, i) => {
    const r = { ...o.responseHeaders };
    delete r["x-frame-options"], delete r["X-Frame-Options"], delete r["content-security-policy"], delete r["Content-Security-Policy"], i({ cancel: !1, responseHeaders: r });
  }), $ ? e.loadURL($) : e.loadFile(s.join(E, "index.html")), e.webContents.on("console-message", (o, i, r, m, P) => {
    t(`[Renderer][${i}] ${r} (${P}:${m})`);
  });
  try {
    T.register("CommandOrControl+Shift+L", () => {
      t("[main] Shortcut Ctrl+Shift+L triggered"), l.existsSync(g) && x.openPath(s.dirname(g));
    });
  } catch (o) {
    t(`[main] Failed to register shortcut: ${o}`);
  }
}
c.whenReady().then(async () => {
  try {
    await M(), t("[main] Local backend ready");
  } catch (n) {
    t(`[main] CRITICAL: Failed to start backend: ${n.message}`);
  }
  A();
});
c.on("will-quit", () => {
  T.unregisterAll();
});
c.on("before-quit", () => {
  _();
});
c.on("window-all-closed", () => {
  process.platform !== "darwin" && (_(), c.quit(), e = null);
});
c.on("activate", () => {
  I.getAllWindows().length === 0 && A();
});
export {
  q as MAIN_DIST,
  E as RENDERER_DIST,
  $ as VITE_DEV_SERVER_URL
};
