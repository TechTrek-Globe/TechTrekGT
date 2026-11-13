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
 * Standard API fetch wrapper ensuring credentials: 'include' for HttpOnly cookies
 * and notifying AuthContext when an authenticated endpoint rejects credentials.
 * @param {string} endpoint
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
  const url = getApiUrl(endpoint);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const extraHeaders = { ...(options.headers || {}) };
  if (isFormData) {
    delete extraHeaders['Content-Type'];
    delete extraHeaders['content-type'];
  }

  const headers = isFormData
    ? extraHeaders
    : { 'Content-Type': 'application/json', ...extraHeaders };

  const res = await fetch(url, {
    ...options,
    credentials: options.credentials || 'include',
    headers,
  });

  if (typeof window !== 'undefined') {
    const lowerUrl = String(url).toLowerCase();
    const isAuthCredentialSubmit = lowerUrl.includes('/api/auth/login') || lowerUrl.includes('/api/auth/register');
    if ((res.status === 401 && !isAuthCredentialSubmit) || (res.status === 403 && lowerUrl.includes('/api/auth/'))) {
      window.dispatchEvent(new CustomEvent('wayfinder:auth-expired', {
        detail: { status: res.status, url }
      }));
    }
  }

  return res;
}
