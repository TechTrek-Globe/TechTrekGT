import { hashPassword, verifyPassword } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipRlKey = `reset:${ip}`;
  const ipLimit = await checkRateLimit(env.RATE_LIMIT_KV, ipRlKey, 5, 600, true, env.RATE_LIMIT_DO);

  try {
    const body = await request.json().catch(() => ({}));
    const { email, newPassword, token: bodyToken, resetToken: bodyResetToken, securityAnswer } = body;

    if (!email || !newPassword) {
      if (!ipLimit.allowed) {
        return new Response(JSON.stringify({ error: 'Too many password reset attempts. Please wait.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipLimit.retryAfter) }
        });
      }
      return new Response(JSON.stringify({ error: 'Email and new password are required.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const accountRlKey = `reset-account:${cleanEmail}`;
    const accountLimit = await checkRateLimit(env.RATE_LIMIT_KV, accountRlKey, 5, 900, true, env.RATE_LIMIT_DO);

    if (!ipLimit.allowed || !accountLimit.allowed) {
      const retryAfter = Math.max(
        !ipLimit.allowed ? (ipLimit.retryAfter || 60) : 0,
        !accountLimit.allowed ? (accountLimit.retryAfter || 60) : 0
      );
      return new Response(JSON.stringify({ error: 'Too many password reset attempts. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
      });
    }

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'New password must be at least 8 characters long.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return new Response(JSON.stringify({ error: 'New password must contain at least one uppercase letter and one number.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (newPassword.length > 128) {
      return new Response(JSON.stringify({ error: 'Password exceeds maximum allowed length.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Read the reset token from body or from HttpOnly cookie
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionMatch = cookieHeader.match(/(?:^|;\s*)reset_session=([^;]+)/);
    const token = (bodyToken || bodyResetToken || (sessionMatch ? sessionMatch[1].trim() : '')).trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Password reset token is required.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const resetRecord = await env.DB.prepare(
      'SELECT * FROM password_resets WHERE token = ? AND email = ? AND used = 0'
    ).bind(token, cleanEmail).first();

    if (!resetRecord) {
      return new Response(JSON.stringify({ error: 'Invalid or expired password reset token. Please restart the reset flow.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (resetRecord.expires_at < Date.now()) {
      await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(resetRecord.id).run();
      return new Response(JSON.stringify({ error: 'Password reset token has expired. Please request a new one.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = await env.DB.prepare(
      'SELECT id, password_hash, security_answer_hash FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User account not found.' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Optional security answer check if provided
    if (securityAnswer && user.security_answer_hash) {
      const isAnswerValid = await verifyPassword(securityAnswer.trim().toLowerCase(), user.security_answer_hash);
      if (!isAnswerValid) {
        return new Response(JSON.stringify({ error: 'Incorrect security answer. Please try again.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const newPasswordHash = await hashPassword(newPassword);
    try {
      await env.DB.prepare('UPDATE users SET password_hash = ?, force_password_reset = 0 WHERE id = ?').bind(newPasswordHash, user.id).run();
    } catch (_) {
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newPasswordHash, user.id).run();
    }
    await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(resetRecord.id).run();
    await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').bind(cleanEmail).run();

    // Clear the reset_session cookie
    const clearCookie = [
      'reset_session=',
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/api/auth/reset-password',
      'Max-Age=0'
    ].join('; ');

    return new Response(JSON.stringify({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookie
      }
    });

  } catch (err) {
    if (ipLimit && !ipLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many password reset attempts. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipLimit.retryAfter) }
      });
    }
    console.error('[outpost reset-password] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
