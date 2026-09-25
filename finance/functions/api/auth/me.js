import {
  authenticate, json, fail, issueSession, sessionCookies, withCookies, readCookie, ACCESS_TOKEN_TTL, ERROR_CODES, toPublicUser
} from '../../utils/auth.js';

export async function onRequestGet(context) {
  try {
    // authenticate performs DB-backed token_version check. No silent fallback
    // to stale JWT claims on DB error - the request fails with 401 instead. (H6 / M10)
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const { payload, user } = auth;

    const now = Math.floor(Date.now() / 1000);
    const REFRESH_THRESHOLD = Math.floor(ACCESS_TOKEN_TTL * 0.25);

    const sexp = typeof payload.sexp === 'number' ? payload.sexp : (typeof payload.exp === 'number' ? payload.exp : 0);
    const isExpiringSoon = (sexp - now <= REFRESH_THRESHOLD) ||
                           (typeof payload.exp === 'number' && (payload.exp - now <= REFRESH_THRESHOLD));

    const sessionFieldsDiffer =
      Number(user.token_version || 0) !== Number(payload.tv || 0) ||
      (payload.role !== undefined && payload.role !== (user.role || 'user')) ||
      (payload.email !== undefined && payload.email !== user.email) ||
      (payload.name !== undefined && payload.name !== user.name);

    const existingCsrf = readCookie(context.request, 'csrf_token');
    const hasValidCsrf = Boolean(existingCsrf && typeof existingCsrf === 'string' && existingCsrf.trim().length > 0);

    const userData = toPublicUser(user);

    // Only issue a new session and rotate cookies when needed:
    // 1. Session or access token is within refresh threshold (< 25% of TTL remaining)
    // 2. User claims differ from the database (role, name, email, token_version)
    // 3. CSRF cookie is missing or invalid (recovering from partial cookie loss)
    const needsRefresh = isExpiringSoon || sessionFieldsDiffer || !hasValidCsrf;

    if (!needsRefresh) {
      return json({
        success: true,
        user: userData,
        householdId: null,
        csrfToken: existingCsrf
      });
    }

    const isRememberMe = (typeof payload.iat === 'number' && typeof payload.sexp === 'number' && (payload.sexp - payload.iat > ACCESS_TOKEN_TTL)) ||
                         (sexp - now > ACCESS_TOKEN_TTL);

    const { token, csrf, maxAge } = await issueSession(
      context.env, user, { rememberMe: isRememberMe }
    );

    return withCookies(
      json({
        success: true,
        user: userData,
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
