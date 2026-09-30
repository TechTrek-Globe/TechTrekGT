/**
 * Shared typed network-error classifier.
 *
 * A network error means the fetch request never reached the server (DNS
 * failure, CORS block, server offline, DevTools Network set to Offline). In
 * that case no server-side credentials were ever verified, so the caller
 * must never be treated as authenticated.
 *
 * Server-returned errors (non-2xx Response objects with a status code) are
 * NOT network errors and must surface the server's own error message.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isNetworkError(err) {
  if (err instanceof TypeError) {
    return true;
  }
  if (err instanceof Error) {
    const message = err.message || '';
    if (!message) return true;
    return /^(Failed to fetch|NetworkError|fetch failed|Load failed|The network request failed)$/i.test(message)
      || message.includes('NetworkError')
      || message.includes('Failed to fetch')
      || message.includes('fetch failed');
  }
  return false;
}
