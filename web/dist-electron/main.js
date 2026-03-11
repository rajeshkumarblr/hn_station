import { app as r, ipcMain as m, BrowserWindow as R, nativeImage as S, session as k } from "electron";
import o from "node:path";
import { fileURLToPath as v } from "node:url";
import { spawn as x } from "node:child_process";
import T from "node:fs";
const b = o.dirname(v(import.meta.url));
process.env.APP_ROOT = o.join(b, "..");
const h = process.env.VITE_DEV_SERVER_URL, M = o.join(process.env.APP_ROOT, "dist-electron"), _ = o.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = h ? o.join(process.env.APP_ROOT, "public") : _;
let e = null, i = null, d = null;
r.setName("HN Station");
r.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
function y() {
  const a = process.platform === "win32" ? "hn-local.exe" : "hn-local", s = o.join(process.resourcesPath ?? "", a);
  if (T.existsSync(s)) return s;
  const t = o.join(process.env.APP_ROOT ?? o.join(b, ".."), "resources", a);
  return T.existsSync(t) ? t : null;
}
function L() {
  return new Promise((a, s) => {
    var u, w;
    const t = y();
    if (!t) {
      s(new Error("hn-local binary not found — run: make build-local-linux"));
      return;
    }
    const c = o.join(r.getPath("userData"), "hn.db");
    console.log(`[backend] Starting ${t} --db ${c}`), i = x(t, ["--port", "0", "--db", c], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let n = !1, p = "";
    (u = i.stdout) == null || u.on("data", (l) => {
      p += l.toString();
      const f = p.split(`
`);
      p = f.pop() ?? "";
      for (const g of f) {
        console.log(`[backend] ${g}`);
        const P = g.match(/^LISTENING:(\d+)/);
        P && !n && (n = !0, d = parseInt(P[1], 10), console.log(`[backend] API on port ${d}`), a(d));
      }
    }), (w = i.stderr) == null || w.on("data", (l) => {
      process.stderr.write(`[backend] ${l}`);
    }), i.on("error", (l) => {
      n ? console.error("[backend] error:", l) : s(l);
    }), i.on("exit", (l, f) => {
      console.log(`[backend] exited code=${l} signal=${f}`), i = null, d = null;
    }), setTimeout(() => {
      n || s(new Error("Timed out waiting for hn-local to start"));
    }, 6e4);
  });
}
function E() {
  i && (console.log("[backend] Sending SIGTERM"), i.kill("SIGTERM"), i = null);
}
m.handle(
  "get-local-api-url",
  () => d ? `http://localhost:${d}` : null
);
function I() {
  e = new R({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    // Prevents white flashes
    icon: o.join(process.env.VITE_PUBLIC, process.platform === "win32" ? "hn.ico" : "hn_256.png"),
    webPreferences: {
      webviewTag: !0,
      preload: o.join(b, "preload.mjs"),
      webSecurity: !1
    }
  }), m.on("window-minimize", () => e == null ? void 0 : e.minimize()), m.on("window-close", () => e == null ? void 0 : e.close()), m.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), m.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300), h && e.webContents.openDevTools({ mode: "detach" }));
  }), e.setMenu(null);
  const a = o.join(process.env.VITE_PUBLIC, process.platform === "win32" ? "hn.ico" : "hn_256.png"), s = S.createFromPath(a);
  s.isEmpty() || e.setIcon(s), e.setTitle("HN Station"), e.webContents.on("page-title-updated", (t) => {
    t.preventDefault(), e == null || e.setTitle("HN Station");
  }), k.defaultSession.webRequest.onHeadersReceived((t, c) => {
    const n = { ...t.responseHeaders };
    delete n["x-frame-options"], delete n["X-Frame-Options"], delete n["content-security-policy"], delete n["Content-Security-Policy"], c({ cancel: !1, responseHeaders: n });
  }), h ? e.loadURL(h) : e.loadFile(o.join(_, "index.html")), e.webContents.on("console-message", (t, c, n, p, u) => {
    console.log(`[Renderer][${c}] ${n} (${u}:${p})`);
  });
}
r.whenReady().then(async () => {
  try {
    await L(), console.log("[main] Local backend ready");
  } catch (a) {
    console.error("[main] Failed to start local backend:", a);
  }
  I();
});
r.on("before-quit", () => {
  E();
});
r.on("window-all-closed", () => {
  process.platform !== "darwin" && (E(), r.quit(), e = null);
});
r.on("activate", () => {
  R.getAllWindows().length === 0 && I();
});
export {
  M as MAIN_DIST,
  _ as RENDERER_DIST,
  h as VITE_DEV_SERVER_URL
};
