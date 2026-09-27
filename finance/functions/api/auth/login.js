import {
  verifyPassword, hashPassword, needsRehash, readJson, asTrimmedString,
  json, fail, issueSession, sessionCookies, withCookies, newCsrfToken,
  verifyTurnstile, ERROR_CODES, emitMetric, toPublicUser, isThreePartHash,
  MAX_BODY_AUTH, MAX_EMAIL_LEN, MAX_PASS_LEN
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env, requestId } = context;

  const limited = await enforceRateLimit(context, 'login', 10, 60);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.', requestId);

    // Turnstile bot verification (cross-reference: CSP challenges.cloudflare.com)
    // Runs before account rate limiting, DB lookups, or password hashing.
    const turnstileToken = body.turnstileToken || body['cf-turnstile-response'];
    const ip = request.headers?.get('CF-Connecting-IP');
    const turnstileCheck = await verifyTurnstile(turnstileToken, env, ip, requestId);
    if (!turnstileCheck.success) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Security verification failed. Please try again.', requestId);
    }

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    const { password } = body;

    if (!rawEmail || typeof password !== 'string') {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Email and password are required.', requestId);
    }

    if (!env.DB || !env.JWT_SECRET) {
      console.error('[login] missing DB or JWT_SECRET binding', requestId ? { requestId } : '');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.', requestId);
    }

    const cleanEmail = rawEmail.toLowerCase();

    const accountLimited = await enforceRateLimit(context, 'login-account', 10, 300, cleanEmail);
    if (accountLimited) return accountLimited;

    const user = await env.DB.prepare(
      'SELECT id, email, name, password_hash, role, token_version, security_question, security_answer_hash, status, email_verified, pending_email, force_password_reset FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    // Timing equalization: perform a hash even when the account does not exist
    // so the response time does not reveal whether the address is registered. (H7)
    if (!user) {
      await hashPassword(password).catch(() => {});
      emitMetric('auth.login.invalid_credentials', requestId);
      return fail(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Invalid email or password.', requestId);
    }

    // Forced password reset check (HIGH-6):
    // Accounts marked with force_password_reset or legacy non-3-part hashes must reset password.
    if (user.force_password_reset === 1 || !isThreePartHash(user.password_hash)) {
      emitMetric('auth.login.force_password_reset', requestId);
      return json({
        error: 'Password reset required. Your account security credentials must be updated before logging in.',
        code: 'PASSWORD_RESET_REQUIRED',
        forcePasswordReset: true,
        requiresReset: true,
        redirectTo: '/reset-password',
        email: user.email,
        ...(requestId ? { requestId } : {})
      }, 403);
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      emitMetric('auth.login.invalid_credentials', requestId);
      return fail(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Invalid email or password.', requestId);
    }

    if (user.status === 'Suspended') {
      // REM-21: Distinct code so frontend distinguishes suspended accounts from unauthenticated sessions
      return fail(ERROR_CODES.ACCOUNT_SUSPENDED, 403, 'Account suspended. Please contact support.', requestId);
    }

    // Transparent rehash on login: upgrades 310k-era or legacy two-part hashes
    // without requiring the user to reset their password. (C2)
    if (needsRehash(user.password_hash)) {
      try {
        const fresh = await hashPassword(password);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(fresh, user.id).run();
        emitMetric('auth.login.rehash', requestId);
      } catch (rehashErr) {
        console.error('[login] rehash failed (non-fatal):', requestId ? { requestId } : '', rehashErr && rehashErr.message);
      }
    }

    const { token, csrf, maxAge } = await issueSession(env, user, { rememberMe: Boolean(body.rememberMe) });
    emitMetric('auth.login.success', requestId);

    return withCookies(
      json({
        success: true,
        user: toPublicUser(user),
        householdId: null,
        csrfToken: csrf
      }),
      sessionCookies(token, csrf, maxAge)
    );

  } catch (err) {
    console.error('[login] handler error:', requestId ? { requestId } : '', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.', requestId);
  }
}
