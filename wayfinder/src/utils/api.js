/**
 * Resolves an API endpoint path relative to the current subpath context.
 * If running on /wayfinder or /wayfinder/*, routes to /wayfinder/api/...
 * Otherwise routes to /api/...
 * 
 * @param {string} endpoint - e.g. '/api/auth/login' or '/api/wayfinder/journeys'
 * @returns {string}
 */
export function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === '/wayfinder' || pathname.startsWith('/wayfinder/')) {
      if (!cleanEndpoint.startsWith('/wayfinder')) {
        return `/wayfinder${cleanEndpoint}`;
      }
    }
  }
  return cleanEndpoint;
}

/**
 * Standard API fetch wrapper ensuring credentials: 'include' for HttpOnly cookies.
 * @param {string} endpoint
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
  const url = getApiUrl(endpoint);
  const extraHeaders = options.headers || {};
  return fetch(url, {
    ...options,
    credentials: options.credentials || 'include',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });
}
