import { authenticate, readJson, json, fail, MAX_BODY_AUTH } from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const limited = await enforceRateLimit(context, 'admin-status', 30, 60);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { user: caller } = auth;

    if (String(caller.role || 'user') !== 'admin') {
      return fail(403, 'Forbidden');
    }

    if (!env?.DB) {
      return fail(503, 'Database binding not available');
    }

    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body || typeof body !== 'object') {
      return fail(400, 'Invalid request body');
    }

    const targetUserId = context.params?.id || body.userId;
    if (!targetUserId || typeof targetUserId !== 'string') {
      return fail(400, 'User ID is required');
    }

    const { status } = body;
    if (status !== 'Active' && status !== 'Suspended') {
      return fail(400, 'Invalid status value. Allowed values: Active, Suspended');
    }

    if (targetUserId === caller.id && status === 'Suspended') {
      return fail(400, 'Cannot suspend your own account');
    }

    const targetUser = await env.DB.prepare(
      'SELECT id, email, status, token_version FROM users WHERE id = ?'
    ).bind(targetUserId).first();

    if (!targetUser) {
      return fail(404, 'User not found');
    }

    // When suspending a user, bump token_version to immediately revoke all active sessions.
    const currentTv = Number(targetUser.token_version || 0);
    const newTv = status === 'Suspended' ? currentTv + 1 : currentTv;

    await env.DB.prepare(
      'UPDATE users SET status = ?, token_version = ? WHERE id = ?'
    ).bind(status, newTv, targetUserId).run();

    return json({
      success: true,
      message: `User status updated to ${status}.`,
      userId: targetUserId,
      status
    });

  } catch (err) {
    console.error('[admin/user-status] error:', err && err.message);
    return fail(500, 'Failed to update user status');
  }
}
