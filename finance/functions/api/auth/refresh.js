import {
  authenticate,
  createToken,
  newCsrfToken,
  sessionCookies,
  withCookies,
  json,
  fail,
  ACCESS_TOKEN_TTL,
  ERROR_CODES
} from '../../utils/auth.js';

export async function onRequestPost(context) {
  try {
    // Requires a valid, non-expired auth_token cookie or Bearer token.
    // requireCsrf: true enforces double-submit CSRF for cookie-based session renewal.
    // Confirms token_version still matches the DB.
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { payload, user } = auth;

    const now = Math.floor(Date.now() / 1000);
    const sexp = typeof payload.sexp === 'number'
      ? payload.sexp
      : (typeof payload.exp === 'number' ? payload.exp : 0);

    if (sexp <= now) {
      return fail(ERROR_CODES.SESSION_EXPIRED, 401, 'Session expired. Please sign in again.');
    }

    // Issues a new access token with the same sexp (session expiry) as before if still valid,
    // i.e. does NOT extend sexp further, only refreshes the short-lived access token inside
    // the existing session window.
    const { token } = await createToken(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'user',
        tv: Number(user.token_version || 0),
        sid: payload.sid || crypto.randomUUID()
      },
      context.env?.JWT_SECRET,
      ACCESS_TOKEN_TTL,
      sexp
    );

    const csrf = newCsrfToken();
    const remainingSessionSeconds = Math.max(1, sexp - now);

    return withCookies(
      json({
        success: true,
        csrfToken: csrf
      }),
      sessionCookies(token, csrf, remainingSessionSeconds)
    );
  } catch (err) {
    console.error('[refresh] handler error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred.', context.requestId);
  }
}
