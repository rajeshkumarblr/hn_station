/**
 * Resolves the API base URL at runtime:
 *  - In Electron local mode: reads the local backend port via IPC (hn-local binary)
 *  - In web/dev mode: uses VITE_API_URL env var or falls back to same-origin ('')
 */

let _cachedBase: string | null = null;
let _isResolved = false;
const _listeners: ((url: string) => void)[] = [];

export async function resolveApiBase(): Promise<string> {
    if (_isResolved) return _cachedBase!;

    // In Electron, ask the main process for the local backend URL
    const electronAPI = (window as any).electronAPI;
    const isElectron = !!electronAPI;

    if (isElectron) {
        // Strict Electron mode: Poll until we get the port. Do NOT fallback to production.
        console.log('[api] Electron detected, waiting for local backend...');

        let retries = 0;
        const maxRetries = 150; // 30 seconds (150 * 200ms)

        while (retries < maxRetries) {
            try {
                const url = await electronAPI.getLocalApiUrl();
                if (url) {
                    _cachedBase = url as string;
                    console.log('[api] Connected to local backend:', _cachedBase);
                    finish(_cachedBase);
                    return _cachedBase;
                }
            } catch (err) {
                console.error('[api] IPC error:', err);
            }
            retries++;
            // Wait 200ms before retrying
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        console.error('[api] Failed to resolve local backend after 30s');
        _cachedBase = ''; // Fallback to empty (will try to fetch and fail, better than hang)
        finish(_cachedBase);
        return _cachedBase;
    }

    // Web / dev fallback: VITE_API_URL or same-origin
    // Only used when running in a normal browser (non-Electron)
    _cachedBase = String(import.meta.env.VITE_API_URL ?? '');
    finish(_cachedBase);
    return _cachedBase;
}

function finish(url: string) {
    _isResolved = true;
    while (_listeners.length > 0) {
        const l = _listeners.shift();
        if (l) l(url);
    }
}

/** Synchronous getter — returns cached value or '' before resolution completes */
export function getApiBase(): string {
    const isElectron = !!(window as any).electronAPI;
    if (isElectron) {
        // Strict: never return production URL in Electron, even as a fallback
        return _cachedBase ?? '';
    }
    return _cachedBase ?? (import.meta.env.VITE_API_URL as string | undefined) ?? '';
}

export function isApiResolved(): boolean {
    return _isResolved;
}

export function subscribeApiBase(callback: (url: string) => void) {
    if (_isResolved) {
        callback(_cachedBase!);
        return () => { };
    }
    _listeners.push(callback);
    return () => {
        const idx = _listeners.indexOf(callback);
        if (idx > -1) _listeners.splice(idx, 1);
    };
}

/** Call this once at app startup to eagerly resolve and cache the base URL */
export function initApiBase(): Promise<string> {
    return resolveApiBase();
}
