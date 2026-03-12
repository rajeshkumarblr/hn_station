import { app as l, ipcMain as m, BrowserWindow as R, nativeImage as k, session as x } from "electron";
import n from "node:path";
import { fileURLToPath as _ } from "node:url";
import { spawn as y } from "node:child_process";
import u from "node:fs";
const b = n.dirname(_(import.meta.url));
process.env.APP_ROOT = n.join(b, "..");
const h = process.env.VITE_DEV_SERVER_URL, O = n.join(process.env.APP_ROOT, "dist-electron"), I = n.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = h ? n.join(process.env.APP_ROOT, "public") : I;
process.platform === "win32" && l.setAppUserModelId("com.hnstation.app");
let e = null, a = null, d = null;
l.setName("HN Station");
l.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
function v() {
  const t = process.platform === "win32" ? "hn-local.exe" : "hn-local", o = n.join(process.resourcesPath ?? "", t);
  if (u.existsSync(o)) return o;
  const i = n.join(process.env.APP_ROOT ?? n.join(b, ".."), "resources", t);
  return u.existsSync(i) ? i : null;
}
function L() {
  return new Promise((t, o) => {
    var g, w;
    const i = v();
    if (!i) {
      o(new Error("hn-local binary not found — run: make build-local-linux"));
      return;
    }
    const s = n.join(l.getPath("userData"), "hn.db");
    console.log(`[backend] Starting ${i} --db ${s}`), a = y(i, ["--port", "0", "--db", s], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let c = !1, p = "";
    (g = a.stdout) == null || g.on("data", (r) => {
      p += r.toString();
      const f = p.split(`
`);
      p = f.pop() ?? "";
      for (const P of f) {
        console.log(`[backend] ${P}`);
        const T = P.match(/^LISTENING:(\d+)/);
        T && !c && (c = !0, d = parseInt(T[1], 10), console.log(`[backend] API on port ${d}`), t(d));
      }
    }), (w = a.stderr) == null || w.on("data", (r) => {
      process.stderr.write(`[backend] ${r}`);
    }), a.on("error", (r) => {
      c ? console.error("[backend] error:", r) : o(r);
    }), a.on("exit", (r, f) => {
      console.log(`[backend] exited code=${r} signal=${f}`), a = null, d = null;
    }), setTimeout(() => {
      c || o(new Error("Timed out waiting for hn-local to start"));
    }, 6e4);
  });
}
function S() {
  a && (console.log("[backend] Sending SIGTERM"), a.kill("SIGTERM"), a = null);
}
m.handle(
  "get-local-api-url",
  () => d ? `http://localhost:${d}` : null
);
function E() {
  e = new R({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    // Prevents white flashes
    icon: n.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: n.join(b, "preload.mjs"),
      webSecurity: !1
    }
  }), m.on("window-minimize", () => e == null ? void 0 : e.minimize()), m.on("window-close", () => e == null ? void 0 : e.close()), m.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), m.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const t = n.join(process.env.VITE_PUBLIC, "hn.ico");
  if (console.log(`[main] Loading icon from: ${t}`), u.existsSync(t)) {
    const o = k.createFromPath(t);
    o.isEmpty() || e.setIcon(o);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (o) => {
    o.preventDefault(), e == null || e.setTitle("HN Station");
  }), x.defaultSession.webRequest.onHeadersReceived((o, i) => {
    const s = { ...o.responseHeaders };
    delete s["x-frame-options"], delete s["X-Frame-Options"], delete s["content-security-policy"], delete s["Content-Security-Policy"], i({ cancel: !1, responseHeaders: s });
  }), h ? e.loadURL(h) : e.loadFile(n.join(I, "index.html")), e.webContents.on("console-message", (o, i, s, c, p) => {
    console.log(`[Renderer][${i}] ${s} (${p}:${c})`);
  });
}
l.whenReady().then(async () => {
  try {
    await L(), console.log("[main] Local backend ready");
  } catch (t) {
    console.error("[main] Failed to start local backend:", t);
  }
  E();
});
l.on("before-quit", () => {
  S();
});
l.on("window-all-closed", () => {
  process.platform !== "darwin" && (S(), l.quit(), e = null);
});
l.on("activate", () => {
  R.getAllWindows().length === 0 && E();
});
export {
  O as MAIN_DIST,
  I as RENDERER_DIST,
  h as VITE_DEV_SERVER_URL
};
