/**
 * Runtime environment detection for HN Station.
 * Helps toggle features between the full Desktop app and the Web Preview.
 */

// We detect Electron by checking for the electronAPI exposed via preload script
// or fallback to checking the userAgent string.
export function isElectron(): boolean {
    if (typeof window === 'undefined') return false;
    // Build-time check
    if ((import.meta as any).env?.VITE_ELECTRON === 'true') return true;
    // Runtime fallback check
    return !!(window as any).electronAPI || navigator.userAgent.includes('Electron');
}

export function isWebPreview(): boolean {
    return !isElectron();
}
