// Global API fetch wrapper with automatic 401 session expiry handling
// Usage: import { apiFetch, setLogoutHandler } from './utils/api.js'

let _onUnauthorized = null;

/**
 * Register the logout callback — call this once on app init.
 * When any API response returns 401, this callback is invoked.
 */
export function setLogoutHandler(fn) {
    _onUnauthorized = fn;
}

/**
 * Drop-in replacement for fetch() that auto-handles 401 responses
 * by clearing localStorage and calling the registered logout handler.
 */
export async function apiFetch(url, options = {}) {
    const res = await fetch(url, options);

    if (res.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        if (_onUnauthorized) {
            _onUnauthorized();
        }
        // Return the response so callers can still inspect it if needed
        return res;
    }

    return res;
}
