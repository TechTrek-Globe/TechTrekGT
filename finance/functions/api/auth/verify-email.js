import {
  authenticate, readJson, asTrimmedString, json, fail,
  constantTimeStringEqual, hmacHex, MAX_BODY_AUTH, ERROR_CODES
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const limited = await enforceRateLimit(context, 'verify-email', 5, 60);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { user } = auth;

    if (user.email_verified === 1) {
      return json({ success: true, message: 'Email is already verified.' });
    }

    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.');

    const cleanCode = asTrimmedString(body.code, 16);
    if (!cleanCode || !/^\d{8}$/.test(cleanCode)) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Please provide the valid 8-digit verification code.');
    }

    if (!env.DB || !env.JWT_SECRET) {
      console.error('[verify-email] missing DB or JWT_SECRET binding');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.');
    }

    const record = await env.DB.prepare(
      'SELECT id, token, attempts, expires_at FROM email_verifications WHERE user_id = ? AND email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    ).bind(user.id, user.email).first();

    if (!record) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'No pending verification code found. Please request a new one.');
    }

    if (Date.now() > record.expires_at) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Verification code has expired. Please request a new code.');
    }

    if (Number(record.attempts || 0) >= 5) {
      await env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(record.id).run();
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Too many invalid attempts. Please request a new verification code.');
    }

    const codeHash = await hmacHex(env.JWT_SECRET, `verify:${user.email}:${cleanCode}`);
    const isValid = await constantTimeStringEqual(record.token, codeHash);

    if (!isValid) {
      await env.DB.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid verification code.');
    }

    await env.DB.batch([
      env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(record.id),
      env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(user.id)
    ]);

    return json({ success: true, message: 'Email verified successfully.' });
  } catch (err) {
    console.error('[verify-email] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.');
  }
}
