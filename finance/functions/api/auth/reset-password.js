import {
  readJson, asTrimmedString, json, fail, withCookies, clearedCookies,
  MAX_BODY_AUTH, MAX_EMAIL_LEN, validatePassword,
  hmacHex, constantTimeStringEqual, hashPassword, verifyPassword,
  ERROR_CODES, emitMetric, invalidateCachedUser
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

const RESET_MAX_ATTEMPTS = 5;

export async function onRequestPost(context) {
  const { request, env, requestId } = context;
  const limited = await enforceRateLimit(context, 'reset', 10, 60);
  if (limited) return limited;

  const GENERIC_BAD = 'Invalid or expired reset code.';

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.', requestId);

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    const code = asTrimmedString(body.token, 32);
    const newPassword = body.newPassword;
    const securityAnswer = typeof body.securityAnswer === 'string' ? body.securityAnswer.trim() : '';

    if (!rawEmail || !code || typeof newPassword !== 'string') {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Email, reset code, and new password are required.', requestId);
    }

    const pwError = validatePassword(newPassword);
    if (pwError) return fail(ERROR_CODES.VALIDATION_ERROR, 400, pwError, requestId);

    if (!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET) {
      console.error('[reset-password] missing DB, JWT_SECRET, or CODE_HMAC_SECRET binding', requestId ? { requestId } : '');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.', requestId);
    }

    const cleanEmail = rawEmail.toLowerCase();
    const codeHash = await hmacHex(env.CODE_HMAC_SECRET, `reset:${cleanEmail}:${code}`);

    const record = await env.DB.prepare(
      'SELECT id, user_id, expires_at, attempts FROM password_resets WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    ).bind(cleanEmail).first();

    if (!record) {
      emitMetric('auth.reset.bad_code', requestId);
      return fail(ERROR_CODES.RESET_CODE_INVALID, 400, GENERIC_BAD, requestId);
    }

    if (Number(record.expires_at) < Date.now()) {
      await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(record.id).run();
      emitMetric('auth.reset.bad_code', requestId);
      return fail(ERROR_CODES.RESET_CODE_INVALID, 400, GENERIC_BAD, requestId);
    }

    if (Number(record.attempts || 0) >= RESET_MAX_ATTEMPTS) {
      await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(record.id).run();
      emitMetric('auth.reset.bad_code', requestId);
      return fail(ERROR_CODES.RESET_CODE_INVALID, 400, GENERIC_BAD, requestId);
    }

    const stored = await env.DB.prepare(
      'SELECT token FROM password_resets WHERE id = ?'
    ).bind(record.id).first();

    const codeMatches = await constantTimeStringEqual(String(stored?.token || ''), codeHash);

    const user = await env.DB.prepare(
      'SELECT id, password_hash, security_answer_hash FROM users WHERE id = ?'
    ).bind(record.user_id).first();

    let answerMatches = true;
    if (user && user.security_answer_hash) {
      answerMatches = securityAnswer
        ? await verifyPassword(securityAnswer.toLowerCase(), user.security_answer_hash)
        : false;
    }

    if (!codeMatches || !answerMatches || !user) {
      // Single generic failure for a bad code, a bad answer, or a missing
      // user, with a per-account attempt counter (fix H8).
      await env.DB.prepare(
        'UPDATE password_resets SET attempts = COALESCE(attempts, 0) + 1 WHERE id = ?'
      ).bind(record.id).run();
      emitMetric('auth.reset.bad_code', requestId);
      return fail(ERROR_CODES.RESET_CODE_INVALID, 400, GENERIC_BAD, requestId);
    }

    const newPasswordHash = await hashPassword(newPassword);

    // Bumping token_version kills every outstanding session for this account.
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?'
      ).bind(newPasswordHash, user.id),
      env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(record.id),
      env.DB.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').bind(cleanEmail)
    ]);

    await invalidateCachedUser(user.id, env);

    emitMetric('auth.reset.success', requestId);

    return withCookies(
      json({ success: true, message: 'Password reset successfully. Please sign in with your new password.' }),
      clearedCookies()
    );
  } catch (err) {
    console.error('[reset-password] error:', requestId ? { requestId } : '', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.', requestId);
  }
}
