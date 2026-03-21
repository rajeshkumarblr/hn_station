/**
 * Utility to manage the API Base URL across different environments.
 */
import { isElectron } from './env';

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

async function probeService(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const resp = await fetch(`${url}/healthc`, { signal: controller.signal });
        clearTimeout(timeoutId);
        return resp.ok;
    } catch (e) {
        return false;
    }
}

export async function initApiBase(): Promise<void> {
    // 1. Check for local Windows Service (Port 8050)
    // We do this first so the app connects to the background service if available.
    if (typeof window !== 'undefined' && isElectron()) {
        const isSvc = await probeService('http://127.0.0.1:58090');
        if (isSvc) {
            apiBase = 'http://127.0.0.1:58090';
            console.log(`[apiBase] Connected to Windows Service: ${apiBase}`);
            notifyListeners();
            return;
        }
    }

    // 2. Electron Environment (Fallback to spawned process)
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

    // 3. Local Web Dev
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
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
