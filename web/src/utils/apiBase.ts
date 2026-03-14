/**
 * Utility to manage the API Base URL across different environments.
 */

export function getApiBase(): string {
    // In Electron, we connect to the local Go server which typically runs on 8080
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
        return 'http://localhost:8080';
    }

    // In Web mode (AKS), the API is served from the same origin but we might 
    // want to allow an environment variable or default to empty (relative)
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        // Local dev might have API on another port
        return 'http://localhost:8080';
    }

    // Default to relative (works for AKS with ingress)
    return '';
}

export function subscribeApiBase(callback: (url: string) => void): () => void {
    // Immediate call
    callback(getApiBase());

    // In the future, if we allow dynamic switching, we can implement a real listener
    return () => { };
}

/**
 * Standard initialization for API base. 
 * In this implementation, it's just a placeholder as getApiBase is deterministic.
 */
export function initApiBase(): void {
    getApiBase();
}
