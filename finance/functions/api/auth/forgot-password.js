import {
  readJson, asTrimmedString, json, fail,
  EMAIL_REGEX, MAX_BODY_AUTH, MAX_EMAIL_LEN,
  randomInt, hmacHex, sendResetEmail
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

const GENERIC_RESET_RESPONSE = {
  success: true,
  message: 'If an account exists for that address, a reset code has been sent to it.'
};

export async function onRequestPost(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, 'forgot', 5, 600);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(400, 'Invalid request body.');

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    if (!rawEmail || !EMAIL_REGEX.test(rawEmail.toLowerCase())) {
      // Format errors are safe to report; they reveal nothing about accounts.
      return fail(400, 'Invalid email address format.');
    }
    const cleanEmail = rawEmail.toLowerCase();

    if (!env.DB || !env.JWT_SECRET) {
      console.error('[forgot-password] missing DB or JWT_SECRET binding');
      return fail(503, 'Service unavailable. Please try again later.');
    }

    const user = await env.DB.prepare(
      'SELECT id, email, security_question FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    // Identical response whether or not the account exists (fix H7).
    if (!user) return json(GENERIC_RESET_RESPONSE);

    // Per-account throttle on top of the per-IP limiter (fix H8).
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM password_resets WHERE email = ? AND created_at > ?'
    ).bind(cleanEmail, Date.now() - 60 * 60 * 1000).first();
    if (recent && Number(recent.n) >= 5) return json(GENERIC_RESET_RESPONSE);

    // 8 digits, unbiased, ~26.6 bits.
    let resetCode = '';
    for (let i = 0; i < 8; i++) resetCode += String(randomInt(10));

    // Store only an HMAC of the code so a database leak does not yield
    // usable reset tokens (fix H8).
    const codeHash = await hmacHex(env.JWT_SECRET, `reset:${cleanEmail}:${resetCode}`);
    const resetId = `rst-${crypto.randomUUID()}`;
    const now = Date.now();

    await env.DB.batch([
      env.DB.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').bind(cleanEmail),
      env.DB.prepare(
        'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
      ).bind(resetId, user.id, cleanEmail, codeHash, now + RESET_CODE_TTL_MS, now)
    ]);

    await sendResetEmail(env, user.email, resetCode, user.security_question || null);

    // The code is NEVER included in the response body.
    return json(GENERIC_RESET_RESPONSE);
  } catch (err) {
    console.error('[forgot-password] error:', err && err.message);
    return fail(500, 'An internal error occurred. Please try again.');
  }
}
