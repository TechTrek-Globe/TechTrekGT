import {
  authenticate, json, fail, issueSession, sessionCookies, withCookies, newCsrfToken, ERROR_CODES
} from '../../utils/auth.js';

export async function onRequestGet(context) {
  try {
    // authenticate performs DB-backed token_version check. No silent fallback
    // to stale JWT claims on DB error - the request fails with 401 instead. (H6 / M10)
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const { payload, user } = auth;

    // Sliding refresh - bounded by the absolute session expiry embedded in the token. (H6)
    const now = Math.floor(Date.now() / 1000);
    const sexp = typeof payload.sexp === 'number' && payload.sexp > now ? payload.sexp : now + 7200;

    const { token, csrf, maxAge } = await issueSession(
      context.env, user, sexp - now > 2 * 60 * 60
    );

    return withCookies(
      json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.role === 'admin',
          emailVerified: Boolean(user.email_verified),
          pendingEmail: user.pending_email || null,
          securityQuestion: user.security_question || null,
          hasSecurityQuestion: Boolean(user.security_question && user.security_answer_hash)
        },
        householdId: null,
        csrfToken: csrf
      }),
      sessionCookies(token, csrf, maxAge)
    );

  } catch (err) {
    console.error('[me] handler error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred.');
  }
}
