import { contextBridge, ipcRenderer } from 'electron';

// Expose window control actions and local API URL to React renderer
contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    // Local backend port — set once on startup, null if binary not found
    getLocalApiUrl: () => ipcRenderer.invoke('get-local-api-url'),
});
