import { authenticate, json, fail, ERROR_CODES, toPublicUser } from '../../utils/auth.js';

/**
 * GET /api/auth/security-question - now authenticated.
 *
 * The previous unauthenticated POST version handed any caller the security
 * question for any email address, which was both account enumeration and a
 * head start on the answer. The question is no longer exposed publicly; it
 * is delivered in the reset email instead (fix H7).
 */
export async function onRequestGet(context) {
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const { user } = auth;
    const publicUser = toPublicUser(user);
    return json({
      success: true,
      email: publicUser.email,
      securityQuestion: publicUser.securityQuestion,
      hasSecurityQuestion: publicUser.hasSecurityQuestion
    });
  } catch (err) {
    console.error('[security-question] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred.');
  }
}
