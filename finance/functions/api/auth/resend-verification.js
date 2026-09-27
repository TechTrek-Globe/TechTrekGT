import {
  authenticate, json, fail,
  issueOneTimeCode, ONE_TIME_CODE_TTL_MS, sendVerificationEmail, ERROR_CODES
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

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

    if (!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET) {
      console.error('[resend-verification] missing DB, JWT_SECRET, or CODE_HMAC_SECRET binding');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.');
    }

    const { code: verificationCode } = await issueOneTimeCode(env, {
      table: 'email_verifications',
      userId: user.id,
      email: user.email,
      purpose: 'verify',
      ttlMs: ONE_TIME_CODE_TTL_MS
    });

    await sendVerificationEmail(env, user.email, verificationCode, 'verify').catch(() => {});

    return json({ success: true, message: 'Verification code sent.' });
  } catch (err) {
    console.error('[resend-verification] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.');
  }
}
