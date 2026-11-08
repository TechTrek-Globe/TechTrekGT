import { authenticate, readJson, json, fail, MAX_BODY_AUTH, ERROR_CODES, invalidateCachedUser } from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';
import { deleteUserAccount } from '../../utils/deleteAccount.js';

export async function handleUserDelete(context) {
  const { request, env, requestId } = context;

  const limited = await enforceRateLimit(context, 'admin-delete', 20, 60);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: request.method !== 'GET' });
    if (auth.error) return auth.error;
    const { user: caller } = auth;

    if (String(caller.role || 'user') !== 'admin') {
      return fail(ERROR_CODES.FORBIDDEN, 403, 'Forbidden: Administrator privileges required', requestId);
    }

    if (!env?.DB) {
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Database binding not available', requestId);
    }

    let targetUserId;
    if (request.method === 'POST') {
      const body = await readJson(request, MAX_BODY_AUTH);
      targetUserId = body?.userId;
    } else {
      const url = new URL(request.url);
      targetUserId = url.searchParams.get('userId') || url.searchParams.get('user_id');
    }

    if (!targetUserId || typeof targetUserId !== 'string') {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'User ID is required', requestId);
    }

    const result = await deleteUserAccount(env.DB, targetUserId, caller.id);
    if (!result.ok) {
      return fail(ERROR_CODES.INTERNAL_ERROR, result.status || 500, result.error || 'Failed to delete user account', requestId);
    }

    if (invalidateCachedUser) {
      invalidateCachedUser(targetUserId);
    }

    const isSelf = result.isSelf;
    const extraHeaders = isSelf ? {
      'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
    } : {};

    return new Response(JSON.stringify({
      success: true,
      userId: targetUserId,
      isSelf,
      message: isSelf
        ? 'Your administrator account has been permanently deleted.'
        : `Account for ${result.email} has been permanently deleted.`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...extraHeaders }
    });
  } catch (err) {
    console.error('[admin/user-delete] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to delete user account', requestId);
  }
}

