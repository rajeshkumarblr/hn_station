import { app as d, ipcMain as g, shell as R, globalShortcut as I, BrowserWindow as C, session as _, nativeImage as A, Menu as x } from "electron";
import l from "node:path";
import { fileURLToPath as F } from "node:url";
import { spawn as j } from "node:child_process";
import u from "node:fs";
import "node:http";
import O from "node:os";
const w = l.dirname(F(import.meta.url));
process.env.APP_ROOT = l.join(w, "..");
const P = process.env.VITE_DEV_SERVER_URL, J = l.join(process.env.APP_ROOT, "dist-electron"), v = l.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = P ? l.join(process.env.APP_ROOT, "public") : v;
const k = l.join(d.getPath("userData"), "app.log");
function r(i) {
  try {
    const c = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${i}
`;
    u.appendFileSync(k, c), console.log(i);
  } catch (s) {
    console.error("Failed to write to log file:", s);
  }
}
try {
  u.existsSync(k) && u.truncateSync(k);
} catch (i) {
  console.error("Failed to truncate log file:", i);
}
r(`[main] Log initialized: ${k}`);
r(`[main] Version: ${d.getVersion()}`);
r(`[main] App Root: ${process.env.APP_ROOT}`);
const B = "C:\\Users\\rajes\\hn-station-debug.log";
function b(i) {
  try {
    u.appendFileSync(B, `[DEBUG ${(/* @__PURE__ */ new Date()).toISOString()}] ${i}
`);
  } catch {
  }
}
b(`Main process starting v0.9.1. __dirname=${w}`);
b(`APP_PATH=${d.getAppPath()}`);
process.platform === "win32" && d.setAppUserModelId("com.hnstation.app");
let e = null, h = null, y = null;
d.setName("HN Station");
const U = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
d.userAgentFallback = U;
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
  const i = _.defaultSession;
  i.webRequest.onBeforeRequest(
    { urls: D },
    (s, c) => {
      r(`[adblock] Blocked: ${s.url}`), c({ cancel: !0 });
    }
  ), i.webRequest.onBeforeSendHeaders((s, c) => {
    const { requestHeaders: m } = s, n = new URL(s.url);
    n.hostname === "127.0.0.1" || n.hostname === "localhost" || (delete m.Cookie, delete m.cookie), c({ cancel: !1, requestHeaders: m });
  }), i.webRequest.onHeadersReceived((s, c) => {
    const m = s.responseHeaders || {}, n = new URL(s.url);
    n.hostname === "127.0.0.1" || n.hostname === "localhost" || (delete m["Set-Cookie"], delete m["set-cookie"]), c({ cancel: !1, responseHeaders: m });
  });
}
function z() {
  const i = process.platform === "win32" ? "hn-local.exe" : "hn-local", s = l.join(process.resourcesPath ?? "", i);
  if (r(`[backend] Checking packaged path: ${s}`), u.existsSync(s)) return s;
  const c = l.join(process.env.APP_ROOT ?? l.join(w, ".."), "resources", i);
  return r(`[backend] Checking dev path: ${c}`), u.existsSync(c) ? c : null;
}
function H() {
  return new Promise((i, s) => {
    var p, t;
    const c = z();
    if (!c) {
      const o = new Error("hn-local binary not found");
      r(`[backend] ERROR: ${o.message}`), s(o);
      return;
    }
    const m = process.platform === "win32" ? l.join(d.getPath("userData"), "hn.db") : l.join(O.homedir(), ".hn-station", "hn.db");
    r(`[backend] Starting ${c} --db ${m}`), h = j(c, ["--port", "0", "--db", m], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: l.dirname(c)
    });
    let n = !1, a = "";
    (p = h.stdout) == null || p.on("data", (o) => {
      a += o.toString();
      const f = a.split(`
`);
      a = f.pop() ?? "";
      for (const S of f) {
        const $ = S.trim();
        $ && r(`[backend][stdout] ${$}`);
        const T = S.match(/^LISTENING:(\d+)/);
        T && !n && (n = !0, y = parseInt(T[1], 10), r(`[backend] API on port ${y}`), i(y));
      }
    }), (t = h.stderr) == null || t.on("data", (o) => {
      const f = o.toString().trim();
      f && r(`[backend][stderr] ${f}`);
    }), h.on("error", (o) => {
      r(`[backend] Spawn error: ${o.message}`), n || s(o);
    }), h.on("exit", (o, f) => {
      r(`[backend] exited code=${o} signal=${f}`), h = null, y = null;
    }), setTimeout(() => {
      if (!n) {
        const o = new Error("Timed out waiting for hn-local to start");
        r(`[backend] ERROR: ${o.message}`), s(o);
      }
    }, 6e4);
  });
}
function E() {
  h && (r("[backend] Stopping..."), h.kill("SIGTERM"), h = null);
}
g.handle(
  "get-local-api-url",
  () => y ? `http://127.0.0.1:${y}` : null
);
g.on("open-external", (i, s) => {
  R.openExternal(s);
});
function L() {
  e = new C({
    width: 1440,
    height: 900,
    show: !1,
    frame: !1,
    backgroundColor: "#0f172a",
    icon: l.join(process.env.VITE_PUBLIC, "hn.ico"),
    webPreferences: {
      webviewTag: !0,
      preload: (() => {
        const n = l.join(w, "preload.js"), a = l.join(w, "preload.mjs"), p = u.existsSync(n) ? n : a;
        return b(`[preload] checking: js=${n} exists=${u.existsSync(n)}`), b(`[preload] checking: mjs=${a} exists=${u.existsSync(a)}`), b(`[preload] final choice: ${p} packaged=${d.isPackaged}`), p;
      })(),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      // Critical: some antiviruses block the sandbox bridge
      webSecurity: !1
    }
  }), b("BrowserWindow created. Preload applied."), g.on("window-minimize", () => e == null ? void 0 : e.minimize()), g.on("window-close", () => e == null ? void 0 : e.close()), g.on("window-maximize", () => {
    e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
  }), g.handle("window-is-maximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), g.on("open-external", (n, a) => {
    a && R.openExternal(a);
  }), e.webContents.setFrameRate(30), e.webContents.setBackgroundThrottling(!0), e.on("blur", () => {
    e == null || e.webContents.setFrameRate(4);
  }), e.on("focus", () => {
    e == null || e.webContents.setFrameRate(30);
  }), e.once("ready-to-show", () => {
    e && (e.show(), e.focus(), e.setFullScreen(!1), setTimeout(() => {
      e && !e.isMaximized() && e.maximize();
    }, 300));
  }), e.setMenu(null);
  const i = l.join(process.env.VITE_PUBLIC, "hn_256.png"), s = u.existsSync(i) ? i : l.join(process.env.VITE_PUBLIC, "hn.ico");
  if (r(`[main] Loading icon from: ${s}`), u.existsSync(s)) {
    const n = A.createFromPath(s);
    n.isEmpty() || (e.setIcon(n), process.platform === "darwin" && d.dock && d.dock.setIcon(n));
  }
  e.setTitle("HN Station"), e.webContents.on("page-title-updated", (n) => {
    n.preventDefault(), e == null || e.setTitle("HN Station");
  }), _.defaultSession.webRequest.onHeadersReceived((n, a) => {
    const p = { ...n.responseHeaders };
    delete p["x-frame-options"], delete p["X-Frame-Options"], delete p["content-security-policy"], delete p["Content-Security-Policy"], a({ cancel: !1, responseHeaders: p });
  }), P ? e.loadURL(P) : e.loadFile(l.join(v, "index.html")), e.webContents.on("console-message", (n, a, p, t, o) => {
    r(`[Renderer][${a}] ${p} (${o}:${t})`);
  });
  try {
    I.register("CommandOrControl+Shift+L", () => {
      r("[main] Shortcut Ctrl+Shift+L triggered"), u.existsSync(k) && R.openPath(l.dirname(k));
    });
  } catch (n) {
    r(`[main] Failed to register shortcut: ${n}`);
  }
  const c = [
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
  ], m = x.buildFromTemplate(c);
  x.setApplicationMenu(m), d.on("web-contents-created", (n, a) => {
    a.setFrameRate(30), a.setBackgroundThrottling(!0), a.on("before-input-event", (p, t) => {
      if (t.type === "keyDown") {
        const o = t.key.toLowerCase();
        (t.control && (o === "w" || o === "tab" || o === "r" || o === " " || o === "0" || o === "d") || t.alt && o === "d" || o === "f5") && (e && !e.isDestroyed() && e.webContents.send("global-shortcut", {
          key: t.key,
          code: t.code,
          ctrlKey: t.control,
          shiftKey: t.shift,
          altKey: t.alt,
          metaKey: t.meta
        }), t.control && (o === "w" || o === "r") && p.preventDefault());
      }
    }), a.on("context-menu", (p, t) => {
      const o = [];
      t.linkURL && (o.push({
        label: "Open link in external browser",
        click: () => R.openExternal(t.linkURL)
      }), o.push({
        label: "Copy link address",
        click: () => a.copy()
        // This actually copies selection, but we want link
      }), o[o.length - 1].click = () => {
        import("electron").then(({ clipboard: S }) => {
          S.writeText(t.linkURL);
        });
      }, o.push({ type: "separator" })), t.hasImageContents && (o.push({
        label: "Copy image",
        click: () => a.copyImageAt(t.x, t.y)
      }), o.push({ type: "separator" })), t.editFlags.canCopy && o.push({ role: "copy" }), t.editFlags.canPaste && o.push({ role: "paste" }), t.editFlags.canCut && o.push({ role: "cut" }), t.editFlags.canSelectAll && o.push({ role: "selectall" }), o.length > 0 && o.push({ type: "separator" }), o.push({
        label: "Inspect Element",
        click: () => a.inspectElement(t.x, t.y)
      }), x.buildFromTemplate(o).popup();
    });
  });
}
d.whenReady().then(async () => {
  M();
  try {
    await H(), r("[main] Local backend ready");
  } catch (i) {
    r(`[main] CRITICAL: Failed to start backend: ${i.message}`);
  }
  L();
});
d.on("will-quit", () => {
  I.unregisterAll();
});
d.on("before-quit", () => {
  E();
});
d.on("window-all-closed", () => {
  process.platform !== "darwin" && (E(), d.quit(), e = null);
});
d.on("activate", () => {
  C.getAllWindows().length === 0 && L();
});
export {
  J as MAIN_DIST,
  v as RENDERER_DIST,
  P as VITE_DEV_SERVER_URL
};
