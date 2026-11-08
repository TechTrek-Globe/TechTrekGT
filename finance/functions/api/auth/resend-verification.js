import {
  authenticate, readJson, asTrimmedString, json, fail,
  issueOneTimeCode, ONE_TIME_CODE_TTL_MS, sendVerificationEmail,
  EMAIL_REGEX, MAX_BODY_AUTH, MAX_EMAIL_LEN, ERROR_CODES
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env, requestId } = context;

  const limited = await enforceRateLimit(context, 'resend-verify', 3, 600);
  if (limited) return limited;

  try {
    let targetUser = null;
    let auth = null;
    try {
      auth = await authenticate(context, { requireCsrf: true });
    } catch {
      auth = null;
    }

    if (auth && auth.user && !auth.error) {
      targetUser = auth.user;
    } else {
      const body = await readJson(request, MAX_BODY_AUTH);
      const rawEmail = asTrimmedString(body?.email, MAX_EMAIL_LEN);
      if (!rawEmail) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Email address is required.', requestId);
      }
      const cleanEmail = rawEmail.toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid email address format.', requestId);
      }

      if (!env.DB) {
        return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.', requestId);
      }

      targetUser = await env.DB.prepare(
        'SELECT id, email, name, email_verified, email_verified_at FROM users WHERE email = ?'
      ).bind(cleanEmail).first();
    }

    // Neutral success response if user does not exist or is already verified (prevents enumeration)
    if (!targetUser || Number(targetUser.email_verified) === 1 || Boolean(targetUser.email_verified_at)) {
      return json({
        success: true,
        message: 'If an unverified account exists with this email, a new verification code has been sent.'
      });
    }

    if (!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET) {
      console.error('[resend-verification] missing DB, JWT_SECRET, or CODE_HMAC_SECRET binding', requestId ? { requestId } : '');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.', requestId);
    }

    // Mark previous unused codes as used
    try {
      await env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE user_id = ? AND used = 0').bind(targetUser.id).run();
    } catch {}

    const { code: verificationCode } = await issueOneTimeCode(env, {
      table: 'email_verifications',
      userId: targetUser.id,
      email: targetUser.email,
      purpose: 'verify',
      ttlMs: ONE_TIME_CODE_TTL_MS
    });

    const emailSent = await sendVerificationEmail(env, targetUser.email, verificationCode, 'verify').catch(() => false);

    return json({
      success: true,
      emailSent: Boolean(emailSent),
      message: emailSent
        ? 'A new 8-digit verification code has been sent to your email.'
        : 'A new 8-digit verification code was generated, but delivery failed (destination address not verified in Cloudflare Email Routing).'
    });
  } catch (err) {
    console.error('[resend-verification] error:', requestId ? { requestId } : '', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.', requestId);
  }
}
