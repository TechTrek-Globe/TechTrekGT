import { verifyToken, getTokenFromRequest } from './auth.js';

/**
 * Stateless JWT gateway guard - no D1 required.
 * Validates the shared SSO HttpOnly cookie (auth_token) using JWT_SECRET from env.
 * Returns { userId, email, name } on success, throws a Response on failure.
 */
export async function requireGatewayAuth(request, env) {
  if (!env.JWT_SECRET) {
    throw new Response(
      JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Response(
      JSON.stringify({ error: 'Unauthorized: missing token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload || !payload.userId) {
    throw new Response(
      JSON.stringify({ error: 'Unauthorized: invalid or expired token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return payload;
}

/**
 * Wraps a gateway handler that may throw a Response directly (auth errors).
 */
export async function withGatewayAuth(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[gateway] unexpected error:', err && err.stack ? err.stack : err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/** Standard JSON success response. */
export function ok(data, status = 200) {
  return new Response(JSON.stringify(data),
    { status, headers: { 'Content-Type': 'application/json' } });
}

/** Standard JSON error response. */
export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } });
}
