import { app as r, ipcMain as g, globalShortcut as k, BrowserWindow as y, nativeImage as _, session as v, shell as L } from "electron";
import n from "node:path";
import { fileURLToPath as O } from "node:url";
import { spawn as A } from "node:child_process";
import m from "node:fs";
const S = n.dirname(O(import.meta.url));
process.env.APP_ROOT = n.join(S, "..");
const b = process.env.VITE_DEV_SERVER_URL, B = n.join(process.env.APP_ROOT, "dist-electron"), I = n.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = b ? n.join(process.env.APP_ROOT, "public") : I;
const u = n.join(r.getPath("userData"), "app.log");
function o(i) {
  try {
    const a = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${i}
`;
    m.appendFileSync(u, a), console.log(i);
  } catch (t) {
    console.error("Failed to write to log file:", t);
  }
}
try {
  m.existsSync(u) && m.truncateSync(u);
} catch (i) {
  console.error("Failed to truncate log file:", i);
}
o(`[main] Log initialized: ${u}`);
o(`[main] Version: ${r.getVersion()}`);
o(`[main] App Root: ${process.env.APP_ROOT}`);
process.platform === "win32" && r.setAppUserModelId("com.hnstation.app");
let e = null, c = null, f = null;
r.setName("HN Station");
r.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
function C() {
  const i = process.platform === "win32" ? "hn-local.exe" : "hn-local", t = n.join(process.resourcesPath ?? "", i);
  if (o(`[backend] Checking packaged path: ${t}`), m.existsSync(t)) return t;
  const a = n.join(process.env.APP_ROOT ?? n.join(S, ".."), "resources", i);
  return o(`[backend] Checking dev path: ${a}`), m.existsSync(a) ? a : null;
}
function j() {
  return new Promise((i, t) => {
    var w, P;
    const a = C();
    if (!a) {
      const s = new Error("hn-local binary not found");
      o(`[backend] ERROR: ${s.message}`), t(s);
      return;
    }
    const l = n.join(r.getPath("userData"), "hn.db");
    o(`[backend] Starting ${a} --db ${l}`), c = A(a, ["--port", "0", "--db", l], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: n.dirname(a)
    });
    let p = !1, h = "";
    (w = c.stdout) == null || w.on("data", (s) => {
      h += s.toString();
      const d = h.split(`
`);
      h = d.pop() ?? "";
      for (const R of d) {
        const T = R.trim();
        T && o(`[backend][stdout] ${T}`);
        const $ = R.match(/^LISTENING:(\d+)/);
        $ && !p && (p = !0, f = parseInt($[1], 10), o(`[backend] API on port ${f}`), i(f));
      }
    }), (P = c.stderr) == null || P.on("data", (s) => {
      const d = s.toString().trim();
      d && o(`[backend][stderr] ${d}`);
    }), c.on("error", (s) => {
      o(`[backend] Spawn error: ${s.message}`), p || t(s);
    }), c.on("exit", (s, d) => {
      o(`[backend] exited code=${s} signal=${d}`), c = null, f = null;
    }), setTimeout(() => {
      if (!p) {
        const s = new Error("Timed out waiting for hn-local to start");
        o(`[backend] ERROR: ${s.message}`), t(s);
      }
    }, 6e4);
  });
}
function E() {
  c && (o("[backend] Stopping..."), c.kill("SIGTERM"), c = null);
}
g.handle(
  "get-local-api-url",
  () => f ? `http://localhost:${f}` : null
);
function x() {
  e = new y({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    icon: n.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: n.join(S, "preload.js"),
      webSecurity: !1
    }
  }), g.on("window-minimize", () => e == null ? void 0 : e.minimize()), g.on("window-close", () => e == null ? void 0 : e.close()), g.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), g.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const i = n.join(process.env.VITE_PUBLIC, "hn.ico");
  if (o(`[main] Loading icon from: ${i}`), m.existsSync(i)) {
    const t = _.createFromPath(i);
    t.isEmpty() || e.setIcon(t);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (t) => {
    t.preventDefault(), e == null || e.setTitle("HN Station");
  }), v.defaultSession.webRequest.onHeadersReceived((t, a) => {
    const l = { ...t.responseHeaders };
    delete l["x-frame-options"], delete l["X-Frame-Options"], delete l["content-security-policy"], delete l["Content-Security-Policy"], a({ cancel: !1, responseHeaders: l });
  }), b ? e.loadURL(b) : e.loadFile(n.join(I, "index.html")), e.webContents.on("console-message", (t, a, l, p, h) => {
    o(`[Renderer][${a}] ${l} (${h}:${p})`);
  });
  try {
    k.register("CommandOrControl+Shift+L", () => {
      o("[main] Shortcut Ctrl+Shift+L triggered"), m.existsSync(u) && L.openPath(n.dirname(u));
    });
  } catch (t) {
    o(`[main] Failed to register shortcut: ${t}`);
  }
}
r.whenReady().then(async () => {
  try {
    await j(), o("[main] Local backend ready");
  } catch (i) {
    o(`[main] CRITICAL: Failed to start local backend: ${i.message}`);
  }
  x();
});
r.on("will-quit", () => {
  k.unregisterAll();
});
r.on("before-quit", () => {
  E();
});
r.on("window-all-closed", () => {
  process.platform !== "darwin" && (E(), r.quit(), e = null);
});
r.on("activate", () => {
  y.getAllWindows().length === 0 && x();
});
export {
  B as MAIN_DIST,
  I as RENDERER_DIST,
  b as VITE_DEV_SERVER_URL
};
