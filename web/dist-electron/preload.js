import { contextBridge as o, ipcRenderer as e } from "electron";
o.exposeInMainWorld("electronAPI", {
  minimize: () => e.send("window-minimize"),
  maximize: () => e.send("window-maximize"),
  close: () => e.send("window-close"),
  isMaximized: () => e.invoke("window-is-maximized"),
  // Local backend port — set once on startup, null if binary not found
  getLocalApiUrl: () => e.invoke("get-local-api-url"),
  openExternal: (i) => e.send("open-external", i),
  hackSummarize: (i) => e.invoke("hack-summarize", i),
  onGlobalShortcut: (i) => {
    e.on("global-shortcut", (m, n) => i(n));
  }
});
