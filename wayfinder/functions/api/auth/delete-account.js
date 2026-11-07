// Self-service account deletion endpoint for authenticated users
import { verifyToken, getTokenFromRequest } from '../../utils/auth.js';
import { deleteUserAccount } from '../../utils/deleteAccount.js';

export async function onRequestPost({ request, env, user: passedUser }) {
  let user = passedUser;
  if (!user) {
    const token = getTokenFromRequest(request);
    user = await verifyToken(token, env.JWT_SECRET);
  }

  if (!user || !user.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
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

    const cookieOptions = [
      'auth_token=',
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/',
      'Max-Age=0'
    ].join('; ');

    return new Response(JSON.stringify({
      success: true,
      message: 'Your account and associated travel data have been permanently deleted.'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieOptions
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
