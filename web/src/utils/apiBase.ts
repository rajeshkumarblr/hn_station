/**
 * Utility to manage the API Base URL across different environments.
 */


let apiBase = '';
const listeners: ((url: string) => void)[] = [];

function notifyListeners() {
    listeners.forEach(cb => cb(apiBase));
}

export function getApiBase(): string {
    return apiBase;
}

export function subscribeApiBase(callback: (url: string) => void): () => void {
    listeners.push(callback);
    callback(apiBase);
    return () => {
        const idx = listeners.indexOf(callback);
        if (idx !== -1) listeners.splice(idx, 1);
    };
}



export async function initApiBase(): Promise<void> {
    // 1. Electron Environment (Spawned process)
    // We check this first because if we are in Electron, we want to talk to the backend we just started.
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
        try {
            const url = await (window as any).electronAPI.getLocalApiUrl();
            if (url) {
                apiBase = url;
                console.log(`[apiBase] Resolved Electron Spawned API: ${apiBase}`);
                notifyListeners();
                return;
            }
        } catch (e) {
            console.error('[apiBase] Failed to fetch Electron API URL:', e);
        }
    }

    // 2. Local Web Dev (Fallback for non-Electron localhost testing)
    if (typeof window !== 'undefined' && !apiBase && window.location.hostname === 'localhost') {
        apiBase = 'http://localhost:8080';
        console.log(`[apiBase] Resolved Local Web API: ${apiBase}`);
        notifyListeners();
        return;
    }

    // 4. Production (AKS)
    apiBase = ''; // Relative paths
    console.log(`[apiBase] Resolved Production API (Relative)`);
    notifyListeners();
}
