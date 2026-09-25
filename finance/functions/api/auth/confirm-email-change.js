import {
  authenticate, readJson, asTrimmedString, json, fail, withCookies, sessionCookies,
  newCsrfToken, createToken, constantTimeStringEqual, hmacHex,
  MAX_BODY_AUTH, ACCESS_TOKEN_TTL, SESSION_TTL_DEFAULT, ERROR_CODES
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const limited = await enforceRateLimit(context, 'confirm-email', 5, 60);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { payload, user } = auth;

    if (!user.pending_email) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'No pending email change request found.');
    }

    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.');

    const cleanCode = asTrimmedString(body.code, 16);
    if (!cleanCode || !/^\d{8}$/.test(cleanCode)) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Please provide the valid 8-digit confirmation code.');
    }

    if (!env.DB || !env.JWT_SECRET) {
      console.error('[confirm-email-change] missing DB or JWT_SECRET binding');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.');
    }

    const newEmail = user.pending_email.toLowerCase();

    const record = await env.DB.prepare(
      'SELECT id, token, attempts, expires_at FROM email_verifications WHERE user_id = ? AND email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    ).bind(user.id, newEmail).first();

    if (!record) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'No active verification code found for this email address.');
    }

    if (Date.now() > record.expires_at) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Confirmation code has expired. Please request a new email change.');
    }

    if (Number(record.attempts || 0) >= 5) {
      await env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(record.id).run();
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Too many invalid attempts. Please request a new confirmation code.');
    }

    const codeHash = await hmacHex(env.JWT_SECRET, `verify:${newEmail}:${cleanCode}`);
    const isValid = await constantTimeStringEqual(record.token, codeHash);

    if (!isValid) {
      await env.DB.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid confirmation code.');
    }

    const conflict = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    ).bind(newEmail, user.id).first();

    if (conflict) {
      await env.DB.prepare('UPDATE users SET pending_email = NULL WHERE id = ?').bind(user.id).run();
      return fail(ERROR_CODES.CONFLICT, 409, 'That email address is already in use by another account.');
    }

    const newTokenVersion = Number(user.token_version || 0) + 1;

    await env.DB.batch([
      env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(record.id),
      env.DB.prepare(
        'UPDATE users SET email = pending_email, pending_email = NULL, email_verified = 1, token_version = ? WHERE id = ?'
      ).bind(newTokenVersion, user.id)
    ]);

    const now = Math.floor(Date.now() / 1000);
    const sexp = typeof payload.sexp === 'number' && payload.sexp > now ? payload.sexp : now + SESSION_TTL_DEFAULT;
    const { token } = await createToken(
      {
        userId: user.id,
        email: newEmail,
        name: user.name,
        tv: newTokenVersion,
        sid: payload.sid || crypto.randomUUID()
      },
      env.JWT_SECRET,
      ACCESS_TOKEN_TTL,
      sexp
    );
    const csrf = newCsrfToken();

    return withCookies(
      json({
        success: true,
        message: 'Email address updated successfully.',
        user: {
          id: user.id,
          email: newEmail,
          name: user.name,
          isAdmin: user.role === 'admin',
          emailVerified: true,
          pendingEmail: null,
          securityQuestion: user.security_question || null,
          hasSecurityQuestion: Boolean(user.security_question && user.security_answer_hash)
        },
        csrfToken: csrf
      }),
      sessionCookies(token, csrf, sexp - now)
    );
  } catch (err) {
    console.error('[confirm-email-change] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.');
  }
}
