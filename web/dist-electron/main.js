import { app as c, ipcMain as f, shell as w, globalShortcut as E, BrowserWindow as I, nativeImage as j, session as L, Menu as T } from "electron";
import i from "node:path";
import { fileURLToPath as O } from "node:url";
import { spawn as C } from "node:child_process";
import p from "node:fs";
import "node:http";
import F from "node:os";
const P = i.dirname(O(import.meta.url));
process.env.APP_ROOT = i.join(P, "..");
const y = process.env.VITE_DEV_SERVER_URL, K = i.join(process.env.APP_ROOT, "dist-electron"), _ = i.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = y ? i.join(process.env.APP_ROOT, "public") : _;
const b = i.join(c.getPath("userData"), "app.log");
function o(t) {
  try {
    const d = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${t}
`;
    p.appendFileSync(b, d), console.log(t);
  } catch (a) {
    console.error("Failed to write to log file:", a);
  }
}
try {
  p.existsSync(b) && p.truncateSync(b);
} catch (t) {
  console.error("Failed to truncate log file:", t);
}
o(`[main] Log initialized: ${b}`);
o(`[main] Version: ${c.getVersion()}`);
o(`[main] App Root: ${process.env.APP_ROOT}`);
const M = "C:\\Users\\rajes\\hn-station-debug.log";
function h(t) {
  try {
    p.appendFileSync(M, `[DEBUG ${(/* @__PURE__ */ new Date()).toISOString()}] ${t}
`);
  } catch {
  }
}
h(`Main process starting v0.9.3. __dirname=${P}`);
h(`APP_PATH=${c.getAppPath()}`);
process.platform === "win32" && c.setAppUserModelId("com.hnstation.app");
let e = null, m = null, g = null;
c.setName("HN Station");
const z = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
c.userAgentFallback = `${z} Electron/${process.versions.electron}`;
function B() {
  const t = process.platform === "win32" ? "hn-local.exe" : "hn-local", a = i.join(process.resourcesPath ?? "", t);
  if (o(`[backend] Checking packaged path: ${a}`), p.existsSync(a)) return a;
  const d = i.join(process.env.APP_ROOT ?? i.join(P, ".."), "resources", t);
  return o(`[backend] Checking dev path: ${d}`), p.existsSync(d) ? d : null;
}
function D() {
  return new Promise((t, a) => {
    var S, $;
    const d = B();
    if (!d) {
      const l = new Error("hn-local binary not found");
      o(`[backend] ERROR: ${l.message}`), a(l);
      return;
    }
    const n = process.platform === "win32" ? i.join(c.getPath("userData"), "hn.db") : i.join(F.homedir(), ".hn-station", "hn.db");
    o(`[backend] Starting ${d} --db ${n}`), m = C(d, ["--port", "0", "--db", n], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: i.dirname(d)
    });
    let s = !1, r = "";
    (S = m.stdout) == null || S.on("data", (l) => {
      r += l.toString();
      const u = r.split(`
`);
      r = u.pop() ?? "";
      for (const x of u) {
        const R = x.trim();
        R && o(`[backend][stdout] ${R}`);
        const k = x.match(/^LISTENING:(\d+)/);
        k && !s && (s = !0, g = parseInt(k[1], 10), o(`[backend] API on port ${g}`), t(g));
      }
    }), ($ = m.stderr) == null || $.on("data", (l) => {
      const u = l.toString().trim();
      u && o(`[backend][stderr] ${u}`);
    }), m.on("error", (l) => {
      o(`[backend] Spawn error: ${l.message}`), s || a(l);
    }), m.on("exit", (l, u) => {
      o(`[backend] exited code=${l} signal=${u}`), m = null, g = null;
    }), setTimeout(() => {
      if (!s) {
        const l = new Error("Timed out waiting for hn-local to start");
        o(`[backend] ERROR: ${l.message}`), a(l);
      }
    }, 6e4);
  });
}
function v() {
  m && (o("[backend] Stopping..."), m.kill("SIGTERM"), m = null);
}
f.handle(
  "get-local-api-url",
  () => g ? `http://127.0.0.1:${g}` : null
);
f.on("open-external", (t, a) => {
  w.openExternal(a);
});
function A() {
  e = new I({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    icon: i.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: (() => {
        const n = i.join(P, "preload.js"), s = i.join(P, "preload.mjs"), r = p.existsSync(n) ? n : s;
        return h(`[preload] checking: js=${n} exists=${p.existsSync(n)}`), h(`[preload] checking: mjs=${s} exists=${p.existsSync(s)}`), h(`[preload] final choice: ${r} packaged=${c.isPackaged}`), r;
      })(),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      // Critical: some antiviruses block the sandbox bridge
      webSecurity: !1
    }
  }), h("BrowserWindow created. Preload applied."), f.on("window-minimize", () => e == null ? void 0 : e.minimize()), f.on("window-close", () => e == null ? void 0 : e.close()), f.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), f.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), f.on("open-external", (n, s) => {
    s && w.openExternal(s);
  }), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const t = i.join(process.env.VITE_PUBLIC, "hn.ico");
  if (o(`[main] Loading icon from: ${t}`), p.existsSync(t)) {
    const n = j.createFromPath(t);
    n.isEmpty() || e.setIcon(n);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (n) => {
    n.preventDefault(), e == null || e.setTitle("HN Station");
  }), L.defaultSession.webRequest.onHeadersReceived((n, s) => {
    const r = { ...n.responseHeaders };
    delete r["x-frame-options"], delete r["X-Frame-Options"], delete r["content-security-policy"], delete r["Content-Security-Policy"], s({ cancel: !1, responseHeaders: r });
  }), y ? e.loadURL(y) : e.loadFile(i.join(_, "index.html")), e.webContents.on("console-message", (n, s, r, S, $) => {
    o(`[Renderer][${s}] ${r} (${$}:${S})`);
  });
  try {
    E.register("CommandOrControl+Shift+L", () => {
      o("[main] Shortcut Ctrl+Shift+L triggered"), p.existsSync(b) && w.openPath(i.dirname(b));
    });
  } catch (n) {
    o(`[main] Failed to register shortcut: ${n}`);
  }
  const a = [
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
  ], d = T.buildFromTemplate(a);
  T.setApplicationMenu(d);
}
c.whenReady().then(async () => {
  try {
    await D(), o("[main] Local backend ready");
  } catch (t) {
    o(`[main] CRITICAL: Failed to start backend: ${t.message}`);
  }
  A();
});
c.on("will-quit", () => {
  E.unregisterAll();
});
c.on("before-quit", () => {
  v();
});
c.on("window-all-closed", () => {
  process.platform !== "darwin" && (v(), c.quit(), e = null);
});
c.on("activate", () => {
  I.getAllWindows().length === 0 && A();
});
export {
  K as MAIN_DIST,
  _ as RENDERER_DIST,
  y as VITE_DEV_SERVER_URL
};
