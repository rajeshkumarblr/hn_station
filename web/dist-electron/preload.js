import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  // Local backend port — set once on startup, null if binary not found
  getLocalApiUrl: () => ipcRenderer.invoke("get-local-api-url"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  getPlatform: () => ipcRenderer.invoke("get-platform"),
  hackSummarize: (url) => ipcRenderer.invoke("hack-summarize", url),
  onGlobalShortcut: (callback) => {
    ipcRenderer.on("global-shortcut", (_event, data) => callback(data));
  }
});
