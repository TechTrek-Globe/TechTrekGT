import { authenticate, readJson, json, fail, MAX_BODY_AUTH, ERROR_CODES, invalidateCachedUser } from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env, requestId } = context;

  const limited = await enforceRateLimit(context, 'admin-verify', 30, 60);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { user: caller } = auth;

    if (String(caller.role || 'user') !== 'admin') {
      return fail(ERROR_CODES.FORBIDDEN, 403, 'Forbidden', requestId);
    }

    if (!env?.DB) {
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Database binding not available', requestId);
    }

    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body || typeof body !== 'object') {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body', requestId);
    }

    const targetUserId = body.userId;
    if (!targetUserId || typeof targetUserId !== 'string') {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'User ID is required', requestId);
    }

    const targetUser = await env.DB.prepare(
      'SELECT id, email, status, email_verified FROM users WHERE id = ?'
    ).bind(targetUserId).first();

    if (!targetUser) {
      return fail(ERROR_CODES.NOT_FOUND, 404, 'User not found', requestId);
    }

    await env.DB.prepare(
      "UPDATE users SET email_verified = 1, email_verified_at = datetime('now') WHERE id = ?"
    ).bind(targetUserId).run();

    await invalidateCachedUser(targetUserId, env);

    return json({
      success: true,
      message: `User ${targetUser.email} has been verified.`
    });
  } catch (err) {
    console.error('[admin/user-verify] error:', requestId ? { requestId } : '', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.', requestId);
  }
}

