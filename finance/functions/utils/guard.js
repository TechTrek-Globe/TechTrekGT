import { requireAuth, withAuth, authenticate, verifyToken, getTokenFromRequest, getAllTokensFromRequest } from './auth.js';

export { requireAuth, withAuth, authenticate, verifyToken, getTokenFromRequest, getAllTokensFromRequest };

/** Standard JSON success response. */
export function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/** Standard JSON error response. */
export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
