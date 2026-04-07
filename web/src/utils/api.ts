/**
 * Utility for authenticated API requests.
 */
export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
    const token = localStorage.getItem('hn_jwt_token');
    const headers = new Headers(init?.headers || {});
    
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Always include credentials for cookie-based fallback
    return fetch(url, { 
        ...init, 
        headers,
        credentials: 'include' 
    });
}
