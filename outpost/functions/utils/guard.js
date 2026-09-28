import { verifyToken, getTokenFromRequest } from './auth.js';

/**
 * Verifies the auth_token cookie and returns the decoded payload.
 * Returns { userId, email, name } on success, or throws a 401 Response.
 * @param {Request} request
 * @param {Record<string, any>} env
 * @returns {Promise<{ userId: string, email: string, name: string }>}
 */
export async function requireAuth(request, env) {
  if (!env.JWT_SECRET) {
    throw new Response(JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Response(JSON.stringify({ error: 'Unauthorized: missing token' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload || !payload.userId) {
    throw new Response(JSON.stringify({ error: 'Unauthorized: invalid or expired token' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  return payload;
}

/**
 * Wraps a handler that may throw a Response directly (for auth errors).
 * @param {() => Promise<Response>} fn
 * @returns {Promise<Response>}
 */
export async function withAuth(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[withAuth] unexpected error:', err && err.stack ? err.stack : err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

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

/**
 * Validates that an ID matches an expected resource prefix (e.g. "inv-", "item-", "sale-")
 * or optionally conforms to a standard UUID format.
 * Prevents downstream database lookups on malformed or unvalidated trailing path segments.
 *
 * @param {any} id - Candidate ID string extracted from URL path segment or params
 * @param {string|string[]} prefix - Expected prefix (e.g. 'inv' or 'inv-') or array of allowed prefixes
 * @param {object} [options]
 * @param {boolean} [options.allowPureUuid=false] - Whether to also accept 36-char standard UUIDs
 * @returns {boolean}
 */
export function isValidPrefixedId(id, prefix, options = {}) {
  if (typeof id !== 'string') return false;
  const cleanId = id.trim();
  if (!cleanId) return false;

  const { allowPureUuid = false } = options;

  if (prefix) {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix];
    for (const p of prefixes) {
      if (typeof p !== 'string' || !p) continue;
      const cleanPrefix = p.replace(/-+$/, '');
      const prefixedRegex = new RegExp(`^${cleanPrefix}-[a-zA-Z0-9_-]+$`, 'i');
      if (prefixedRegex.test(cleanId)) return true;
    }
  }

  if (allowPureUuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(cleanId)) return true;
  }

  return false;
}
