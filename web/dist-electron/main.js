import { app as c, ipcMain as u, shell as x, globalShortcut as T, BrowserWindow as I, nativeImage as A, session as j } from "electron";
import a from "node:path";
import { fileURLToPath as O } from "node:url";
import { spawn as L } from "node:child_process";
import l from "node:fs";
import C from "node:http";
import F from "node:os";
const S = a.dirname(O(import.meta.url));
process.env.APP_ROOT = a.join(S, "..");
const $ = process.env.VITE_DEV_SERVER_URL, X = a.join(process.env.APP_ROOT, "dist-electron"), E = a.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = $ ? a.join(process.env.APP_ROOT, "public") : E;
const g = a.join(c.getPath("userData"), "app.log");
function i(n) {
  try {
    const o = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`;
    l.appendFileSync(g, o), console.log(n);
  } catch (t) {
    console.error("Failed to write to log file:", t);
  }
}
try {
  l.existsSync(g) && l.truncateSync(g);
} catch (n) {
  console.error("Failed to truncate log file:", n);
}
i(`[main] Log initialized: ${g}`);
i(`[main] Version: ${c.getVersion()}`);
i(`[main] App Root: ${process.env.APP_ROOT}`);
const z = "C:\\Users\\rajes\\hn-station-debug.log";
function h(n) {
  try {
    l.appendFileSync(z, `[DEBUG ${(/* @__PURE__ */ new Date()).toISOString()}] ${n}
`);
  } catch {
  }
}
h(`Main process starting v1.8.9. __dirname=${S}`);
h(`APP_PATH=${c.getAppPath()}`);
process.platform === "win32" && c.setAppUserModelId("com.hnstation.app");
let e = null, d = null, m = null;
c.setName("HN Station");
const D = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
c.userAgentFallback = `${D} Electron/${process.versions.electron}`;
function M() {
  const n = process.platform === "win32" ? "hn-local.exe" : "hn-local", t = a.join(process.resourcesPath ?? "", n);
  if (i(`[backend] Checking packaged path: ${t}`), l.existsSync(t)) return t;
  const o = a.join(process.env.APP_ROOT ?? a.join(S, ".."), "resources", n);
  return i(`[backend] Checking dev path: ${o}`), l.existsSync(o) ? o : null;
}
function B() {
  return new Promise((n, t) => {
    var w, b;
    const o = M();
    if (!o) {
      const r = new Error("hn-local binary not found");
      i(`[backend] ERROR: ${r.message}`), t(r);
      return;
    }
    const s = process.platform === "win32" ? a.join(process.env.PROGRAMDATA || "C:\\ProgramData", "HNStation", "hn.db") : a.join(F.homedir(), ".hn-station", "hn.db");
    i(`[backend] Starting ${o} --db ${s}`), d = L(o, ["--port", "0", "--db", s], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: a.dirname(o)
    });
    let f = !1, P = "";
    (w = d.stdout) == null || w.on("data", (r) => {
      P += r.toString();
      const p = P.split(`
`);
      P = p.pop() ?? "";
      for (const R of p) {
        const k = R.trim();
        k && i(`[backend][stdout] ${k}`);
        const y = R.match(/^LISTENING:(\d+)/);
        y && !f && (f = !0, m = parseInt(y[1], 10), i(`[backend] API on port ${m}`), n(m));
      }
    }), (b = d.stderr) == null || b.on("data", (r) => {
      const p = r.toString().trim();
      p && i(`[backend][stderr] ${p}`);
    }), d.on("error", (r) => {
      i(`[backend] Spawn error: ${r.message}`), f || t(r);
    }), d.on("exit", (r, p) => {
      i(`[backend] exited code=${r} signal=${p}`), d = null, m = null;
    }), setTimeout(() => {
      if (!f) {
        const r = new Error("Timed out waiting for hn-local to start");
        i(`[backend] ERROR: ${r.message}`), t(r);
      }
    }, 6e4);
  });
}
function N(n) {
  return new Promise((t) => {
    const o = C.get(`http://127.0.0.1:${n}/healthc`, (s) => {
      t(s.statusCode === 200), s.resume();
    });
    o.on("error", (s) => {
      i(`[main] Port ${n} check error: ${s.message}`), t(!1);
    }), o.setTimeout(1e3, () => {
      o.destroy(), t(!1);
    });
  });
}
function _() {
  d && (i("[backend] Stopping..."), d.kill("SIGTERM"), d = null);
}
u.handle(
  "get-local-api-url",
  () => m ? `http://127.0.0.1:${m}` : null
);
u.on("open-external", (n, t) => {
  x.openExternal(t);
});
function v() {
  e = new I({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    icon: a.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: (() => {
        const t = a.join(S, "preload.js"), o = a.join(S, "preload.mjs"), s = l.existsSync(t) ? t : o;
        return h(`[preload] checking: js=${t} exists=${l.existsSync(t)}`), h(`[preload] checking: mjs=${o} exists=${l.existsSync(o)}`), h(`[preload] final choice: ${s} packaged=${c.isPackaged}`), s;
      })(),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      // Critical: some antiviruses block the sandbox bridge
      webSecurity: !1
    }
  }), h("BrowserWindow created. Preload applied."), u.on("window-minimize", () => e == null ? void 0 : e.minimize()), u.on("window-close", () => e == null ? void 0 : e.close()), u.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), u.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const n = a.join(process.env.VITE_PUBLIC, "hn.ico");
  if (i(`[main] Loading icon from: ${n}`), l.existsSync(n)) {
    const t = A.createFromPath(n);
    t.isEmpty() || e.setIcon(t);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (t) => {
    t.preventDefault(), e == null || e.setTitle("HN Station");
  }), j.defaultSession.webRequest.onHeadersReceived((t, o) => {
    const s = { ...t.responseHeaders };
    delete s["x-frame-options"], delete s["X-Frame-Options"], delete s["content-security-policy"], delete s["Content-Security-Policy"], o({ cancel: !1, responseHeaders: s });
  }), $ ? e.loadURL($) : e.loadFile(a.join(E, "index.html")), e.webContents.on("console-message", (t, o, s, f, P) => {
    i(`[Renderer][${o}] ${s} (${P}:${f})`);
  });
  try {
    T.register("CommandOrControl+Shift+L", () => {
      i("[main] Shortcut Ctrl+Shift+L triggered"), l.existsSync(g) && x.openPath(a.dirname(g));
    });
  } catch (t) {
    i(`[main] Failed to register shortcut: ${t}`);
  }
}
c.whenReady().then(async () => {
  try {
    await N(8050) ? (i("[main] Windows Service detected on port 8050. Skipping local spawn."), m = 8050) : (await B(), i("[main] Local backend ready"));
  } catch (n) {
    i(`[main] CRITICAL: Failed to start/detect backend: ${n.message}`);
  }
  v();
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
  I.getAllWindows().length === 0 && v();
});
export {
  X as MAIN_DIST,
  E as RENDERER_DIST,
  $ as VITE_DEV_SERVER_URL
};
