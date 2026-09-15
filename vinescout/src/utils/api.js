// Resolves API URLs relative to the /vinescout subpath.
// In production: /vinescout/api/...
// In local dev: same (Vite proxies via wrangler dev)
const BASE = '/vinescout';

export function getApiUrl(endpoint) {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${BASE}${clean}`;
}

// Authenticated fetch wrapper: always sends credentials (HttpOnly cookie)
export async function apiFetch(endpoint, options = {}) {
  const url = getApiUrl(endpoint);
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw Object.assign(new Error(err.error || `HTTP ${res.status}`), { status: res.status });
  }

  return res.json();
}
