import { app as c, ipcMain as g, globalShortcut as T, BrowserWindow as k, nativeImage as x, session as A, shell as _ } from "electron";
import s from "node:path";
import { fileURLToPath as O } from "node:url";
import { spawn as L } from "node:child_process";
import p from "node:fs";
import C from "node:http";
import j from "node:os";
const y = s.dirname(O(import.meta.url));
process.env.APP_ROOT = s.join(y, "..");
const w = process.env.VITE_DEV_SERVER_URL, z = s.join(process.env.APP_ROOT, "dist-electron"), I = s.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = w ? s.join(process.env.APP_ROOT, "public") : I;
const u = s.join(c.getPath("userData"), "app.log");
function o(n) {
  try {
    const i = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`;
    p.appendFileSync(u, i), console.log(n);
  } catch (t) {
    console.error("Failed to write to log file:", t);
  }
}
try {
  p.existsSync(u) && p.truncateSync(u);
} catch (n) {
  console.error("Failed to truncate log file:", n);
}
o(`[main] Log initialized: ${u}`);
o(`[main] Version: ${c.getVersion()}`);
o(`[main] App Root: ${process.env.APP_ROOT}`);
process.platform === "win32" && c.setAppUserModelId("com.hnstation.app");
let e = null, l = null, m = null;
c.setName("HN Station");
const F = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
c.userAgentFallback = `${F} Electron/${process.versions.electron}`;
function M() {
  const n = process.platform === "win32" ? "hn-local.exe" : "hn-local", t = s.join(process.resourcesPath ?? "", n);
  if (o(`[backend] Checking packaged path: ${t}`), p.existsSync(t)) return t;
  const i = s.join(process.env.APP_ROOT ?? s.join(y, ".."), "resources", n);
  return o(`[backend] Checking dev path: ${i}`), p.existsSync(i) ? i : null;
}
function N() {
  return new Promise((n, t) => {
    var S, P;
    const i = M();
    if (!i) {
      const a = new Error("hn-local binary not found");
      o(`[backend] ERROR: ${a.message}`), t(a);
      return;
    }
    const r = process.platform === "win32" ? s.join(process.env.PROGRAMDATA || "C:\\ProgramData", "HNStation", "hn.db") : s.join(j.homedir(), ".hn-station", "hn.db");
    o(`[backend] Starting ${i} --db ${r}`), l = L(i, ["--port", "0", "--db", r], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: s.dirname(i)
    });
    let f = !1, h = "";
    (S = l.stdout) == null || S.on("data", (a) => {
      h += a.toString();
      const d = h.split(`
`);
      h = d.pop() ?? "";
      for (const R of d) {
        const b = R.trim();
        b && o(`[backend][stdout] ${b}`);
        const $ = R.match(/^LISTENING:(\d+)/);
        $ && !f && (f = !0, m = parseInt($[1], 10), o(`[backend] API on port ${m}`), n(m));
      }
    }), (P = l.stderr) == null || P.on("data", (a) => {
      const d = a.toString().trim();
      d && o(`[backend][stderr] ${d}`);
    }), l.on("error", (a) => {
      o(`[backend] Spawn error: ${a.message}`), f || t(a);
    }), l.on("exit", (a, d) => {
      o(`[backend] exited code=${a} signal=${d}`), l = null, m = null;
    }), setTimeout(() => {
      if (!f) {
        const a = new Error("Timed out waiting for hn-local to start");
        o(`[backend] ERROR: ${a.message}`), t(a);
      }
    }, 6e4);
  });
}
function V(n) {
  return new Promise((t) => {
    const i = C.get(`http://127.0.0.1:${n}/healthc`, (r) => {
      t(r.statusCode === 200), r.resume();
    });
    i.on("error", (r) => {
      o(`[main] Port ${n} check error: ${r.message}`), t(!1);
    }), i.setTimeout(1e3, () => {
      i.destroy(), t(!1);
    });
  });
}
function v() {
  l && (o("[backend] Stopping..."), l.kill("SIGTERM"), l = null);
}
g.handle(
  "get-local-api-url",
  () => m ? `http://127.0.0.1:${m}` : null
);
function E() {
  e = new k({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    icon: s.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: s.join(z, "preload.js"),
      webSecurity: !1
    }
  }), g.on("window-minimize", () => e == null ? void 0 : e.minimize()), g.on("window-close", () => e == null ? void 0 : e.close()), g.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), g.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const n = s.join(process.env.VITE_PUBLIC, "hn.ico");
  if (o(`[main] Loading icon from: ${n}`), p.existsSync(n)) {
    const t = x.createFromPath(n);
    t.isEmpty() || e.setIcon(t);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (t) => {
    t.preventDefault(), e == null || e.setTitle("HN Station");
  }), A.defaultSession.webRequest.onHeadersReceived((t, i) => {
    const r = { ...t.responseHeaders };
    delete r["x-frame-options"], delete r["X-Frame-Options"], delete r["content-security-policy"], delete r["Content-Security-Policy"], i({ cancel: !1, responseHeaders: r });
  }), w ? e.loadURL(w) : e.loadFile(s.join(I, "index.html")), e.webContents.on("console-message", (t, i, r, f, h) => {
    o(`[Renderer][${i}] ${r} (${h}:${f})`);
  });
  try {
    T.register("CommandOrControl+Shift+L", () => {
      o("[main] Shortcut Ctrl+Shift+L triggered"), p.existsSync(u) && _.openPath(s.dirname(u));
    });
  } catch (t) {
    o(`[main] Failed to register shortcut: ${t}`);
  }
}
c.whenReady().then(async () => {
  try {
    await V(8050) ? (o("[main] Windows Service detected on port 8050. Skipping local spawn."), m = 8050) : (await N(), o("[main] Local backend ready"));
  } catch (n) {
    o(`[main] CRITICAL: Failed to start/detect backend: ${n.message}`);
  }
  E();
});
c.on("will-quit", () => {
  T.unregisterAll();
});
c.on("before-quit", () => {
  v();
});
c.on("window-all-closed", () => {
  process.platform !== "darwin" && (v(), c.quit(), e = null);
});
c.on("activate", () => {
  k.getAllWindows().length === 0 && E();
});
export {
  z as MAIN_DIST,
  I as RENDERER_DIST,
  w as VITE_DEV_SERVER_URL
};
