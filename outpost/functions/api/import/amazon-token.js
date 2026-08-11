import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET  /api/import/amazon-token  - get (or create) the user's API token
 * POST /api/import/amazon-token  - rotate (regenerate) the user's API token
 *
 * Requires standard JWT cookie auth.
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const row = await env.DB.prepare(
      `SELECT amazon_api_token FROM users WHERE id = ? LIMIT 1`
    ).bind(userId).first();

    // If no token yet, generate one
    if (!row?.amazon_api_token) {
      const newToken = generateToken();
      await env.DB.prepare(
        `UPDATE users SET amazon_api_token = ? WHERE id = ?`
      ).bind(newToken, userId).run();
      return ok({ token: newToken });
    }

    return ok({ token: row.amazon_api_token });
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const newToken = generateToken();
    await env.DB.prepare(
      `UPDATE users SET amazon_api_token = ? WHERE id = ?`
    ).bind(newToken, userId).run();

    return ok({ token: newToken, rotated: true });
  });
}

/** Generates a 40-character hex API token using WebCrypto. */
function generateToken() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
