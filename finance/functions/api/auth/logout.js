import { json, fail, withCookies, clearedCookies, getTokenFromRequest, getAllTokensFromRequest, verifyToken, invalidateCachedUser } from '../../utils/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // Best-effort: bump token_version to revoke all outstanding sessions. (H6)
    // If DB is unavailable we still clear the cookie and return success.
    let tokens = [];
    try {
      tokens = getAllTokensFromRequest(request);
    } catch {}

    if (tokens.length > 0 && env?.DB && env?.JWT_SECRET) {
      for (const token of tokens) {
        const payload = await verifyToken(token, env.JWT_SECRET);
        if (payload && payload.userId) {
          await env.DB.prepare(
            'UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?'
          ).bind(payload.userId).run().catch((e) => {
            console.error('[logout] token_version bump failed:', e && e.message);
          });
          await invalidateCachedUser(payload.userId, env).catch(() => {});
          break;
        }
      }
    }
  } catch (err) {
    console.error('[logout] error during session revocation:', err && err.message);
  }

  // Always clear both cookies regardless of whether the DB call succeeded.
  return withCookies(json({ success: true }), clearedCookies());
}
