import {
  verifyPassword, hashPassword, needsRehash, readJson, asTrimmedString,
  json, fail, issueSession, sessionCookies, withCookies, newCsrfToken,
  ERROR_CODES,
  MAX_BODY_AUTH, MAX_EMAIL_LEN, MAX_PASS_LEN
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const limited = await enforceRateLimit(context, 'login', 10, 60);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.');

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    const { password } = body;

    if (!rawEmail || typeof password !== 'string') {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Email and password are required.');
    }

    if (!env.DB || !env.JWT_SECRET) {
      console.error('[login] missing DB or JWT_SECRET binding');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.');
    }

    const cleanEmail = rawEmail.toLowerCase();

    const user = await env.DB.prepare(
      'SELECT id, email, name, password_hash, role, token_version, security_question, security_answer_hash, status, email_verified, pending_email FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    // Timing equalization: perform a hash even when the account does not exist
    // so the response time does not reveal whether the address is registered. (H7)
    if (!user) {
      await hashPassword(password).catch(() => {});
      return fail(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Invalid email or password.');
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) return fail(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Invalid email or password.');

    if (user.status === 'Suspended') {
      return fail(ERROR_CODES.UNAUTHORIZED, 403, 'Account suspended. Please contact support.');
    }

    // Transparent rehash on login: upgrades 310k-era or legacy two-part hashes
    // without requiring the user to reset their password. (C2)
    if (needsRehash(user.password_hash)) {
      try {
        const fresh = await hashPassword(password);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(fresh, user.id).run();
      } catch (rehashErr) {
        console.error('[login] rehash failed (non-fatal):', rehashErr && rehashErr.message);
      }
    }

    const { token, csrf, maxAge } = await issueSession(env, user, Boolean(body.rememberMe));

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
    console.error('[login] handler error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.');
  }
}
