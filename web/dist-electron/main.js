import { app as d, ipcMain as f, shell as P, globalShortcut as I, BrowserWindow as _, session as v, nativeImage as j, Menu as T } from "electron";
import r from "node:path";
import { fileURLToPath as C } from "node:url";
import { spawn as O } from "node:child_process";
import m from "node:fs";
import "node:http";
import B from "node:os";
const S = r.dirname(C(import.meta.url));
process.env.APP_ROOT = r.join(S, "..");
const k = process.env.VITE_DEV_SERVER_URL, J = r.join(process.env.APP_ROOT, "dist-electron"), E = r.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = k ? r.join(process.env.APP_ROOT, "public") : E;
const b = r.join(d.getPath("userData"), "app.log");
function a(n) {
  try {
    const i = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`;
    m.appendFileSync(b, i), console.log(n);
  } catch (t) {
    console.error("Failed to write to log file:", t);
  }
}
try {
  m.existsSync(b) && m.truncateSync(b);
} catch (n) {
  console.error("Failed to truncate log file:", n);
}
a(`[main] Log initialized: ${b}`);
a(`[main] Version: ${d.getVersion()}`);
a(`[main] App Root: ${process.env.APP_ROOT}`);
const z = "C:\\Users\\rajes\\hn-station-debug.log";
function g(n) {
  try {
    m.appendFileSync(z, `[DEBUG ${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`);
  } catch {
  }
}
g(`Main process starting v0.9.1. __dirname=${S}`);
g(`APP_PATH=${d.getAppPath()}`);
process.platform === "win32" && d.setAppUserModelId("com.hnstation.app");
let e = null, p = null, h = null;
d.setName("HN Station");
const F = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
d.userAgentFallback = `${F} Electron/${process.versions.electron}`;
const H = [
  "*://*.doubleclick.net/*",
  "*://*.google-analytics.com/*",
  "*://*.googlesyndication.com/*",
  "*://*.googleadservices.com/*",
  "*://*.googletagmanager.com/*",
  "*://*.taboola.com/*",
  "*://*.outbrain.com/*",
  "*://*.zedo.com/*",
  "*://*.carbonads.net/*",
  "*://*.adnxs.com/*",
  "*://*.ads-twitter.com/*",
  "*://*.amazon-adsystem.com/*",
  "*://*.adroll.com/*",
  "*://*.adservice.google.com/*",
  "*://*.adservice.google.ad/*",
  "*://*.adform.net/*",
  "*://*.adsafeprotected.com/*",
  "*://*.servedby-buysellads.com/*",
  "*://*.pubmatic.com/*",
  "*://*.rubiconproject.com/*",
  "*://*.openx.net/*"
];
function M() {
  const n = v.defaultSession;
  n.webRequest.onBeforeRequest(
    { urls: H },
    (t, i) => {
      a(`[adblock] Blocked: ${t.url}`), i({ cancel: !0 });
    }
  ), n.webRequest.onBeforeSendHeaders((t, i) => {
    const { requestHeaders: o } = t, s = new URL(t.url);
    s.hostname !== "127.0.0.1" && s.hostname !== "localhost" && (delete o.Cookie, delete o.cookie), i({ cancel: !1, requestHeaders: o });
  }), n.webRequest.onHeadersReceived((t, i) => {
    const o = t.responseHeaders || {}, s = new URL(t.url);
    s.hostname !== "127.0.0.1" && s.hostname !== "localhost" && (delete o["Set-Cookie"], delete o["set-cookie"]), i({ cancel: !1, responseHeaders: o });
  });
}
function U() {
  const n = process.platform === "win32" ? "hn-local.exe" : "hn-local", t = r.join(process.resourcesPath ?? "", n);
  if (a(`[backend] Checking packaged path: ${t}`), m.existsSync(t)) return t;
  const i = r.join(process.env.APP_ROOT ?? r.join(S, ".."), "resources", n);
  return a(`[backend] Checking dev path: ${i}`), m.existsSync(i) ? i : null;
}
function D() {
  return new Promise((n, t) => {
    var w, $;
    const i = U();
    if (!i) {
      const l = new Error("hn-local binary not found");
      a(`[backend] ERROR: ${l.message}`), t(l);
      return;
    }
    const o = process.platform === "win32" ? r.join(d.getPath("userData"), "hn.db") : r.join(B.homedir(), ".hn-station", "hn.db");
    a(`[backend] Starting ${i} --db ${o}`), p = O(i, ["--port", "0", "--db", o], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: r.dirname(i)
    });
    let s = !1, c = "";
    (w = p.stdout) == null || w.on("data", (l) => {
      c += l.toString();
      const u = c.split(`
`);
      c = u.pop() ?? "";
      for (const y of u) {
        const R = y.trim();
        R && a(`[backend][stdout] ${R}`);
        const x = y.match(/^LISTENING:(\d+)/);
        x && !s && (s = !0, h = parseInt(x[1], 10), a(`[backend] API on port ${h}`), n(h));
      }
    }), ($ = p.stderr) == null || $.on("data", (l) => {
      const u = l.toString().trim();
      u && a(`[backend][stderr] ${u}`);
    }), p.on("error", (l) => {
      a(`[backend] Spawn error: ${l.message}`), s || t(l);
    }), p.on("exit", (l, u) => {
      a(`[backend] exited code=${l} signal=${u}`), p = null, h = null;
    }), setTimeout(() => {
      if (!s) {
        const l = new Error("Timed out waiting for hn-local to start");
        a(`[backend] ERROR: ${l.message}`), t(l);
      }
    }, 6e4);
  });
}
function A() {
  p && (a("[backend] Stopping..."), p.kill("SIGTERM"), p = null);
}
f.handle(
  "get-local-api-url",
  () => h ? `http://127.0.0.1:${h}` : null
);
f.on("open-external", (n, t) => {
  P.openExternal(t);
});
function L() {
  e = new _({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    icon: r.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: (() => {
        const o = r.join(S, "preload.js"), s = r.join(S, "preload.mjs"), c = m.existsSync(o) ? o : s;
        return g(`[preload] checking: js=${o} exists=${m.existsSync(o)}`), g(`[preload] checking: mjs=${s} exists=${m.existsSync(s)}`), g(`[preload] final choice: ${c} packaged=${d.isPackaged}`), c;
      })(),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      // Critical: some antiviruses block the sandbox bridge
      webSecurity: !1
    }
  }), g("BrowserWindow created. Preload applied."), f.on("window-minimize", () => e == null ? void 0 : e.minimize()), f.on("window-close", () => e == null ? void 0 : e.close()), f.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), f.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), f.on("open-external", (o, s) => {
    s && P.openExternal(s);
  }), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const n = r.join(process.env.VITE_PUBLIC, "hn.ico");
  if (a(`[main] Loading icon from: ${n}`), m.existsSync(n)) {
    const o = j.createFromPath(n);
    o.isEmpty() || e.setIcon(o);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (o) => {
    o.preventDefault(), e == null || e.setTitle("HN Station");
  }), v.defaultSession.webRequest.onHeadersReceived((o, s) => {
    const c = { ...o.responseHeaders };
    delete c["x-frame-options"], delete c["X-Frame-Options"], delete c["content-security-policy"], delete c["Content-Security-Policy"], s({ cancel: !1, responseHeaders: c });
  }), k ? e.loadURL(k) : e.loadFile(r.join(E, "index.html")), e.webContents.on("console-message", (o, s, c, w, $) => {
    a(`[Renderer][${s}] ${c} (${$}:${w})`);
  });
  try {
    I.register("CommandOrControl+Shift+L", () => {
      a("[main] Shortcut Ctrl+Shift+L triggered"), m.existsSync(b) && P.openPath(r.dirname(b));
    });
  } catch (o) {
    a(`[main] Failed to register shortcut: ${o}`);
  }
  const t = [
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
  ], i = T.buildFromTemplate(t);
  T.setApplicationMenu(i);
}
d.whenReady().then(async () => {
  M();
  try {
    await D(), a("[main] Local backend ready");
  } catch (n) {
    a(`[main] CRITICAL: Failed to start backend: ${n.message}`);
  }
  L();
});
d.on("will-quit", () => {
  I.unregisterAll();
});
d.on("before-quit", () => {
  A();
});
d.on("window-all-closed", () => {
  process.platform !== "darwin" && (A(), d.quit(), e = null);
});
d.on("activate", () => {
  _.getAllWindows().length === 0 && L();
});
export {
  J as MAIN_DIST,
  E as RENDERER_DIST,
  k as VITE_DEV_SERVER_URL
};
