/**
 * Resolves the API base URL at runtime:
 *  - In Electron local mode: reads the local backend port via IPC (hn-local binary)
 *  - In web/dev mode: uses VITE_API_URL env var or falls back to same-origin ('')
 */

let _cachedBase: string | null = null;

export async function resolveApiBase(): Promise<string> {
    if (_cachedBase !== null) return _cachedBase;

    // In Electron, ask the main process for the local backend URL
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.getLocalApiUrl) {
        try {
            const url = await electronAPI.getLocalApiUrl();
            if (url) {
                _cachedBase = url as string;
                console.log('[api] Using local backend:', _cachedBase);
                return _cachedBase;
            }
        } catch {
            // Fall through to web fallback
        }
    }

    // Web / dev fallback: VITE_API_URL or same-origin
    _cachedBase = String(import.meta.env.VITE_API_URL ?? '');
    return _cachedBase;
}

/** Synchronous getter — returns cached value or '' before resolution completes */
export function getApiBase(): string {
    if (_cachedBase !== null) return _cachedBase;
    return (import.meta.env.VITE_API_URL as string | undefined) ?? '';
}

/** Call this once at app startup to eagerly resolve and cache the base URL */
export function initApiBase(): Promise<string> {
    return resolveApiBase();
}
