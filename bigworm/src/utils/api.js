/**
 * Returns the base URL for API calls.
 * In production, all calls go to the same origin (bigworm.techtrekgt.com).
 * In local dev (wrangler dev), the worker runs on the same port.
 */
export function getApiUrl(path) {
  return path;
}
