import {
  authenticate, json, fail,
  randomInt, hmacHex, sendVerificationEmail
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

const VERIFY_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function onRequestPost(context) {
  const { env } = context;

  const limited = await enforceRateLimit(context, 'resend-verify', 3, 600);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { user } = auth;

    if (user.email_verified === 1) {
      return json({ success: true, message: 'Email is already verified.' });
    }

    if (!env.DB || !env.JWT_SECRET) {
      console.error('[resend-verification] missing DB or JWT_SECRET binding');
      return fail(503, 'Service unavailable. Please try again later.');
    }

    let verificationCode = '';
    for (let i = 0; i < 8; i++) verificationCode += String(randomInt(10));

    const codeHash = await hmacHex(env.JWT_SECRET, `verify:${user.email}:${verificationCode}`);
    const verificationId = `vfy-${crypto.randomUUID()}`;
    const now = Date.now();

    await env.DB.batch([
      env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE user_id = ? AND email = ? AND used = 0').bind(user.id, user.email),
      env.DB.prepare(
        'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
      ).bind(verificationId, user.id, user.email, codeHash, now + VERIFY_CODE_TTL_MS, now)
    ]);

    await sendVerificationEmail(env, user.email, verificationCode, 'verify').catch(() => {});

    return json({ success: true, message: 'Verification code sent.' });
  } catch (err) {
    console.error('[resend-verification] error:', err && err.message);
    return fail(500, 'An internal error occurred. Please try again.');
  }
}
