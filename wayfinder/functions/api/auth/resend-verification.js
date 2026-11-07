import { checkRateLimit } from '../../utils/rateLimit.js';
import { hmacHex, generateVerificationCode } from '../../utils/auth.js';
import { sendVerificationCodeEmail } from '../../utils/inviteEmail.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `resend-verification:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 3, 300);

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many verification requests. Please wait a few minutes.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter)
      }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { email } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email address is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = await env.DB.prepare(
      'SELECT id, name, email, email_verified, email_verified_at FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    // Neutral success response if user does not exist or is already verified (prevents enumeration)
    if (!user || user.email_verified === 1 || user.email_verified_at) {
      return new Response(JSON.stringify({
        success: true,
        message: 'If an unverified account exists with this email, a new verification code has been sent.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const verificationCode = generateVerificationCode();
    const hmacSecret = env.CODE_HMAC_SECRET || env.JWT_SECRET;
    const codeHash = await hmacHex(hmacSecret, `verify:${cleanEmail}:${verificationCode}`);
    const verificationId = `vfy-${crypto.randomUUID()}`;
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    await env.DB.batch([
      env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE user_id = ? AND used = 0').bind(user.id),
      env.DB.prepare(
        `INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
      ).bind(verificationId, user.id, cleanEmail, codeHash, expiresAt, now)
    ]);

    const emailResult = await sendVerificationCodeEmail(env, {
      to: cleanEmail,
      code: verificationCode,
      name: user.name || ''
    });

    if (!emailResult.sent) {
      console.error(`[resend-verification] Email send failed for ${cleanEmail}:`, emailResult.error);
      return new Response(JSON.stringify({
        error: `Could not send verification email: ${emailResult.error || 'Mail delivery failed'}. Please verify your email configuration.`
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'A new 8-digit verification code has been sent to your email.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[resend-verification] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

