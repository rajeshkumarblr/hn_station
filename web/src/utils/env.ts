/**
 * Runtime environment detection for HN Station.
 * Helps toggle features between the full Desktop app and the Web Preview.
 */

// We detect Electron by checking for the electronAPI exposed via preload script
export function isElectron(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export function isWebPreview(): boolean {
    return !isElectron();
}
