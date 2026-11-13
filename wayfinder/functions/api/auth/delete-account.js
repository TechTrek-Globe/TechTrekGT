// Self-service account deletion endpoint for authenticated users
import { authenticateRequest, buildClearCookieHeader } from '../../utils/auth.js';
import { deleteUserAccount } from '../../utils/deleteAccount.js';

export async function onRequestPost({ request, env, user: passedUser }) {
  let user = passedUser;
  if (!user) {
    const auth = await authenticateRequest(request, env);
    if (!auth.ok) {
      const headers = { 'Content-Type': 'application/json' };
      if (auth.clearCookie) headers['Set-Cookie'] = buildClearCookieHeader();
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers
      });
    }
    user = { ...auth.payload, userId: auth.dbUser?.id || auth.payload.userId };
  }

  if (!user || !user.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildClearCookieHeader()
      }
    });
  }

  try {
    const result = await deleteUserAccount(env.DB, user.userId, user.userId);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error || 'Failed to delete account' }), {
        status: result.status || 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Your account and associated travel data have been permanently deleted.'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildClearCookieHeader()
      }
    });
  } catch (err) {
    console.error('[auth/delete-account] error:', err);
    return new Response(JSON.stringify({ error: 'Server error deleting account' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
