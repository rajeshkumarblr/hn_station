// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => import_electron.ipcRenderer.send("window-minimize"),
  maximize: () => import_electron.ipcRenderer.send("window-maximize"),
  close: () => import_electron.ipcRenderer.send("window-close"),
  isMaximized: () => import_electron.ipcRenderer.invoke("window-is-maximized"),
  // Local backend port — set once on startup, null if binary not found
  getLocalApiUrl: () => import_electron.ipcRenderer.invoke("get-local-api-url")
});
