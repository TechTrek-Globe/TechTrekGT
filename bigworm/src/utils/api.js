/**
 * Returns the base URL for API calls.
 * In production, all calls go to the same origin (bigworm.techtrekgt.com).
 * In local dev (wrangler dev), the worker runs on the same port.
 */
export function getApiUrl(path) {
  return path;
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
