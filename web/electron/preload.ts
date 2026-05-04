import { contextBridge, ipcRenderer } from 'electron';

// Expose window control actions and local API URL to React renderer
contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    // Local backend port — set once on startup, null if binary not found
    getLocalApiUrl: () => ipcRenderer.invoke('get-local-api-url'),
    openExternal: (url: string) => ipcRenderer.send('open-external', url),
    hackSummarize: (url: string) => ipcRenderer.invoke('hack-summarize', url),
    onGlobalShortcut: (callback: (data: any) => void) => {
        ipcRenderer.on('global-shortcut', (_event, data) => callback(data));
    }
});
