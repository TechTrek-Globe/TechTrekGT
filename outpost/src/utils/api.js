/**
 * Resolves an API endpoint path for the /outpost sub-site.
 * @param {string} endpoint - e.g. '/api/auth/login'
 * @returns {string}
 */
export function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === '/outpost' || pathname.startsWith('/outpost/')) {
      if (!cleanEndpoint.startsWith('/outpost')) {
        return `/outpost${cleanEndpoint}`;
      }
    }
  }
  return cleanEndpoint;
}
