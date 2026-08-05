/**
 * Resolves an API endpoint path for the /auction sub-site.
 * @param {string} endpoint - e.g. '/api/auth/login'
 * @returns {string}
 */
export function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === '/auction' || pathname.startsWith('/auction/')) {
      if (!cleanEndpoint.startsWith('/auction')) {
        return `/auction${cleanEndpoint}`;
      }
    }
  }
  return cleanEndpoint;
}
