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
    if (electronAPI?.getLocalApiUrl) {
        try {
            const url = await electronAPI.getLocalApiUrl();
            if (url) {
                _cachedBase = url as string;
                console.log('[api] Using local backend:', _cachedBase);
                finish(_cachedBase);
                return _cachedBase;
            }
        } catch {
            // Fall through to web fallback
        }
    }

    // Web / dev fallback: VITE_API_URL or same-origin
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
