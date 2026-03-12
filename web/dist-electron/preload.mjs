"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => electron.ipcRenderer.send("window-minimize"),
  maximize: () => electron.ipcRenderer.send("window-maximize"),
  close: () => electron.ipcRenderer.send("window-close"),
  isMaximized: () => electron.ipcRenderer.invoke("window-is-maximized"),
  // Local backend port — set once on startup, null if binary not found
  getLocalApiUrl: () => electron.ipcRenderer.invoke("get-local-api-url")
});
