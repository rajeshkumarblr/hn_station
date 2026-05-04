import { app as m, ipcMain as g, shell as S, globalShortcut as I, BrowserWindow as v, session as _, nativeImage as A, Menu as x } from "electron";
import d from "node:path";
import { fileURLToPath as j } from "node:url";
import { spawn as O } from "node:child_process";
import u from "node:fs";
import "node:http";
import F from "node:os";
const w = d.dirname(j(import.meta.url));
process.env.APP_ROOT = d.join(w, "..");
const R = process.env.VITE_DEV_SERVER_URL, J = d.join(process.env.APP_ROOT, "dist-electron"), E = d.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = R ? d.join(process.env.APP_ROOT, "public") : E;
const k = d.join(m.getPath("userData"), "app.log");
function l(a) {
  try {
    const c = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${a}
`;
    u.appendFileSync(k, c), console.log(a);
  } catch (i) {
    console.error("Failed to write to log file:", i);
  }
}
try {
  u.existsSync(k) && u.truncateSync(k);
} catch (a) {
  console.error("Failed to truncate log file:", a);
}
l(`[main] Log initialized: ${k}`);
l(`[main] Version: ${m.getVersion()}`);
l(`[main] App Root: ${process.env.APP_ROOT}`);
const B = "C:\\Users\\rajes\\hn-station-debug.log";
function b(a) {
  try {
    u.appendFileSync(B, `[DEBUG ${(/* @__PURE__ */ new Date()).toISOString()}] ${a}
`);
  } catch {
  }
}
b(`Main process starting v0.9.1. __dirname=${w}`);
b(`APP_PATH=${m.getAppPath()}`);
process.platform === "win32" && m.setAppUserModelId("com.hnstation.app");
let e = null, h = null, y = null;
m.setName("HN Station");
const U = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
m.userAgentFallback = U;
const D = [
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
  const a = _.defaultSession;
  a.webRequest.onBeforeRequest(
    { urls: D },
    (i, c) => {
      l(`[adblock] Blocked: ${i.url}`), c({ cancel: !0 });
    }
  ), a.webRequest.onBeforeSendHeaders((i, c) => {
    const { requestHeaders: n } = i, s = new URL(i.url);
    s.hostname === "127.0.0.1" || s.hostname === "localhost" || (delete n.Cookie, delete n.cookie), c({ cancel: !1, requestHeaders: n });
  }), a.webRequest.onHeadersReceived((i, c) => {
    const n = i.responseHeaders || {}, s = new URL(i.url);
    s.hostname === "127.0.0.1" || s.hostname === "localhost" || (delete n["Set-Cookie"], delete n["set-cookie"]), c({ cancel: !1, responseHeaders: n });
  });
}
function z() {
  const a = process.platform === "win32" ? "hn-local.exe" : "hn-local", i = d.join(process.resourcesPath ?? "", a);
  if (l(`[backend] Checking packaged path: ${i}`), u.existsSync(i)) return i;
  const c = d.join(process.env.APP_ROOT ?? d.join(w, ".."), "resources", a);
  return l(`[backend] Checking dev path: ${c}`), u.existsSync(c) ? c : null;
}
function H() {
  return new Promise((a, i) => {
    var t, o;
    const c = z();
    if (!c) {
      const p = new Error("hn-local binary not found");
      l(`[backend] ERROR: ${p.message}`), i(p);
      return;
    }
    const n = process.platform === "win32" ? d.join(m.getPath("userData"), "hn.db") : d.join(F.homedir(), ".hn-station", "hn.db");
    l(`[backend] Starting ${c} --db ${n}`), h = O(c, ["--port", "0", "--db", n], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: d.dirname(c)
    });
    let s = !1, r = "";
    (t = h.stdout) == null || t.on("data", (p) => {
      r += p.toString();
      const f = r.split(`
`);
      r = f.pop() ?? "";
      for (const P of f) {
        const $ = P.trim();
        $ && l(`[backend][stdout] ${$}`);
        const T = P.match(/^LISTENING:(\d+)/);
        T && !s && (s = !0, y = parseInt(T[1], 10), l(`[backend] API on port ${y}`), a(y));
      }
    }), (o = h.stderr) == null || o.on("data", (p) => {
      const f = p.toString().trim();
      f && l(`[backend][stderr] ${f}`);
    }), h.on("error", (p) => {
      l(`[backend] Spawn error: ${p.message}`), s || i(p);
    }), h.on("exit", (p, f) => {
      l(`[backend] exited code=${p} signal=${f}`), h = null, y = null;
    }), setTimeout(() => {
      if (!s) {
        const p = new Error("Timed out waiting for hn-local to start");
        l(`[backend] ERROR: ${p.message}`), i(p);
      }
    }, 6e4);
  });
}
function L() {
  h && (l("[backend] Stopping..."), h.kill("SIGTERM"), h = null);
}
g.handle(
  "get-local-api-url",
  () => y ? `http://127.0.0.1:${y}` : null
);
g.on("open-external", (a, i) => {
  S.openExternal(i);
});
function C() {
  e = new v({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    icon: d.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: (() => {
        const n = d.join(w, "preload.js"), s = d.join(w, "preload.mjs"), r = u.existsSync(n) ? n : s;
        return b(`[preload] checking: js=${n} exists=${u.existsSync(n)}`), b(`[preload] checking: mjs=${s} exists=${u.existsSync(s)}`), b(`[preload] final choice: ${r} packaged=${m.isPackaged}`), r;
      })(),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      // Critical: some antiviruses block the sandbox bridge
      webSecurity: !1
    }
  }), b("BrowserWindow created. Preload applied."), g.on("window-minimize", () => e == null ? void 0 : e.minimize()), g.on("window-close", () => e == null ? void 0 : e.close()), g.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), g.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), g.on("open-external", (n, s) => {
    s && S.openExternal(s);
  }), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const a = d.join(process.env.VITE_PUBLIC, "hn.ico");
  if (l(`[main] Loading icon from: ${a}`), u.existsSync(a)) {
    const n = A.createFromPath(a);
    n.isEmpty() || e.setIcon(n);
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (n) => {
    n.preventDefault(), e == null || e.setTitle("HN Station");
  }), _.defaultSession.webRequest.onHeadersReceived((n, s) => {
    const r = { ...n.responseHeaders };
    delete r["x-frame-options"], delete r["X-Frame-Options"], delete r["content-security-policy"], delete r["Content-Security-Policy"], s({ cancel: !1, responseHeaders: r });
  }), R ? e.loadURL(R) : e.loadFile(d.join(E, "index.html")), e.webContents.on("console-message", (n, s, r, t, o) => {
    l(`[Renderer][${s}] ${r} (${o}:${t})`);
  });
  try {
    I.register("CommandOrControl+Shift+L", () => {
      l("[main] Shortcut Ctrl+Shift+L triggered"), u.existsSync(k) && S.openPath(d.dirname(k));
    });
  } catch (n) {
    l(`[main] Failed to register shortcut: ${n}`);
  }
  const i = [
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
  ], c = x.buildFromTemplate(i);
  x.setApplicationMenu(c), m.on("web-contents-created", (n, s) => {
    s.on("before-input-event", (r, t) => {
      if (t.type === "keyDown") {
        const o = t.key.toLowerCase();
        (t.control && (o === "w" || o === "tab" || o === "r" || o === " " || o === "0" || o === "d") || t.alt && o === "d" || o === "f5") && (e && !e.isDestroyed() && e.webContents.send("global-shortcut", {
          key: t.key,
          code: t.code,
          ctrlKey: t.control,
          shiftKey: t.shift,
          altKey: t.alt,
          metaKey: t.meta
        }), t.control && (o === "w" || o === "r") && r.preventDefault());
      }
    }), s.on("context-menu", (r, t) => {
      const o = [];
      t.linkURL && (o.push({
        label: "Open link in external browser",
        click: () => S.openExternal(t.linkURL)
      }), o.push({
        label: "Copy link address",
        click: () => s.copy()
        // This actually copies selection, but we want link
      }), o[o.length - 1].click = () => {
        import("electron").then(({ clipboard: f }) => {
          f.writeText(t.linkURL);
        });
      }, o.push({ type: "separator" })), t.hasImageContents && (o.push({
        label: "Copy image",
        click: () => s.copyImageAt(t.x, t.y)
      }), o.push({ type: "separator" })), t.editFlags.canCopy && o.push({ role: "copy" }), t.editFlags.canPaste && o.push({ role: "paste" }), t.editFlags.canCut && o.push({ role: "cut" }), t.editFlags.canSelectAll && o.push({ role: "selectall" }), o.length > 0 && o.push({ type: "separator" }), o.push({
        label: "Inspect Element",
        click: () => s.inspectElement(t.x, t.y)
      }), x.buildFromTemplate(o).popup();
    });
  });
}
m.whenReady().then(async () => {
  M();
  try {
    await H(), l("[main] Local backend ready");
  } catch (a) {
    l(`[main] CRITICAL: Failed to start backend: ${a.message}`);
  }
  C();
});
m.on("will-quit", () => {
  I.unregisterAll();
});
m.on("before-quit", () => {
  L();
});
m.on("window-all-closed", () => {
  process.platform !== "darwin" && (L(), m.quit(), e = null);
});
m.on("activate", () => {
  v.getAllWindows().length === 0 && C();
});
export {
  J as MAIN_DIST,
  E as RENDERER_DIST,
  R as VITE_DEV_SERVER_URL
};
