import {
  authenticate, readJson, asTrimmedString, json, fail,
  constantTimeStringEqual, hmacHex, MAX_BODY_AUTH, MAX_EMAIL_LEN, ERROR_CODES, invalidateCachedUser,
  issueSession, sessionCookies, withCookies, toPublicUser
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env, requestId } = context;

  const limited = await enforceRateLimit(context, 'verify-email', 5, 60);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.', requestId);

    const cleanCode = asTrimmedString(body.code, 16);
    if (!cleanCode || !/^\d{8}$/.test(cleanCode)) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Please enter a valid 8-digit verification code.', requestId);
    }

    if (!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET) {
      console.error('[verify-email] missing DB, JWT_SECRET, or CODE_HMAC_SECRET binding', requestId ? { requestId } : '');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.', requestId);
    }

    let targetUser = null;
    let isUnauthenticated = false;

    let auth = null;
    try {
      auth = await authenticate(context, { requireCsrf: true });
    } catch {
      auth = null;
    }

    if (auth && auth.user && !auth.error) {
      targetUser = auth.user;
    } else {
      isUnauthenticated = true;
      const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
      if (!rawEmail) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Email address and verification code are required.', requestId);
      }
      const cleanEmail = rawEmail.toLowerCase();
      targetUser = await env.DB.prepare(
        'SELECT id, email, name, role, token_version, status, email_verified, email_verified_at, security_question, security_answer_hash FROM users WHERE email = ?'
      ).bind(cleanEmail).first();

      if (!targetUser) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'No account found for that email address.', requestId);
      }
    }

    if (Number(targetUser.email_verified) === 1 || Boolean(targetUser.email_verified_at)) {
      if (isUnauthenticated) {
        const { token, csrf, maxAge } = await issueSession(env, targetUser, { rememberMe: Boolean(body.rememberMe) });
        return withCookies(
          json({
            success: true,
            message: 'Email is already verified.',
            user: toPublicUser(targetUser),
            csrfToken: csrf
          }),
          sessionCookies(token, csrf, maxAge)
        );
      }
      return json({ success: true, message: 'Email is already verified.' });
    }

    const record = await env.DB.prepare(
      'SELECT id, token, attempts, expires_at FROM email_verifications WHERE user_id = ? AND email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    ).bind(targetUser.id, targetUser.email).first();

    if (!record) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'No pending verification code found. Please request a new one.', requestId);
    }

    if (Date.now() > Number(record.expires_at)) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Verification code has expired. Please request a new code.', requestId);
    }

    if (Number(record.attempts || 0) >= 5) {
      await env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(record.id).run();
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Too many invalid attempts. Please request a new verification code.', requestId);
    }

    const codeHash = await hmacHex(env.CODE_HMAC_SECRET, `verify:${targetUser.email}:${cleanCode}`);
    const isValid = await constantTimeStringEqual(record.token, codeHash);

    if (!isValid) {
      await env.DB.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid verification code.', requestId);
    }

    const verifiedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(record.id),
      env.DB.prepare('UPDATE users SET email_verified = 1, email_verified_at = ? WHERE id = ?').bind(verifiedAt, targetUser.id)
    ]);

    await invalidateCachedUser(targetUser.id, env);

    targetUser.email_verified = 1;
    targetUser.email_verified_at = verifiedAt;

    if (isUnauthenticated) {
      const { token, csrf, maxAge } = await issueSession(env, targetUser, { rememberMe: Boolean(body.rememberMe) });
      return withCookies(
        json({
          success: true,
          message: 'Email verified successfully.',
          user: toPublicUser(targetUser),
          csrfToken: csrf
        }),
        sessionCookies(token, csrf, maxAge)
      );
    }

    return json({
      success: true,
      message: 'Email verified successfully.',
      user: toPublicUser(targetUser)
    });
  } catch (err) {
    console.error('[verify-email] error:', requestId ? { requestId } : '', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.', requestId);
  }
}
