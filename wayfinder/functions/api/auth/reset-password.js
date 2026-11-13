import { hashPassword, hmacHex, buildClearCookieHeader } from '../../utils/auth.js';

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `reset:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 600);

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many password reset attempts. Please wait.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter)
      }
    });
  }

  try {
    const body = await request.json();
    const { email, token, newPassword } = body;

    if (!email || !token || !newPassword) {
      return new Response(JSON.stringify({ error: 'Email, reset token, and new password are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'New password must be at least 8 characters long.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return new Response(JSON.stringify({ error: 'New password must contain at least one uppercase letter and one number.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (newPassword.length > 128) {
      return new Response(JSON.stringify({ error: 'Password exceeds maximum allowed length.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch latest unused reset record for this email so wrong codes increment attempts
    const resetRecord = await env.DB.prepare(
      'SELECT * FROM password_resets WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    ).bind(cleanEmail).first();

    if (!resetRecord) {
      return new Response(JSON.stringify({ error: 'Invalid or expired password reset token.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (resetRecord.expires_at < Date.now()) {
      await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(resetRecord.id).run();
      return new Response(JSON.stringify({ error: 'Password reset token has expired. Please request a new code.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const currentAttempts = Number(resetRecord.attempts || 0);
    if (currentAttempts >= 5) {
      await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(resetRecord.id).run();
      return new Response(JSON.stringify({ error: 'Too many invalid password reset attempts. Please request a new code.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const expectedHash = await hmacHex(cleanToken, env.JWT_SECRET || 'wayfinder-reset-pepper');
    if (!constantTimeEquals(expectedHash, String(resetRecord.token || ''))) {
      const nextAttempts = currentAttempts + 1;
      await env.DB.prepare(
        'UPDATE password_resets SET attempts = ?, used = CASE WHEN ? >= 5 THEN 1 ELSE used END WHERE id = ?'
      ).bind(nextAttempts, nextAttempts, resetRecord.id).run();
      return new Response(JSON.stringify({ error: 'Invalid or expired password reset token.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify user exists
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User account not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Atomically update password, bump token_version to revoke existing sessions, and invalidate reset token
    const newPasswordHash = await hashPassword(newPassword);
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
      ).bind(newPasswordHash, user.id),
      env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(resetRecord.id)
    ]);

    return new Response(JSON.stringify({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildClearCookieHeader()
      }
    });

  } catch (err) {
    console.error('[reset-password] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}