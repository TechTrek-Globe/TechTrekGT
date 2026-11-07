import { checkRateLimit } from '../../utils/rateLimit.js';
import { hmacHex, constantTimeStringEqual } from '../../utils/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `verify-email:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 60);

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many verification attempts. Please wait.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter)
      }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { email, code } = body;

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and 8-digit verification code are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    if (!/^\d{8}$/.test(cleanCode)) {
      return new Response(JSON.stringify({ error: 'Please enter a valid 8-digit verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const record = await env.DB.prepare(
      `SELECT id, user_id, email, token, expires_at, used, attempts
       FROM email_verifications
       WHERE email = ? AND used = 0
       ORDER BY created_at DESC LIMIT 1`
    ).bind(cleanEmail).first();

    if (!record) {
      return new Response(JSON.stringify({ error: 'No pending verification code found. Please request a new code.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (Date.now() > Number(record.expires_at)) {
      return new Response(JSON.stringify({ error: 'Verification code has expired. Please request a new code.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (Number(record.attempts || 0) >= 5) {
      await env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(record.id).run();
      return new Response(JSON.stringify({ error: 'Too many invalid attempts. Please request a new code.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const hmacSecret = env.CODE_HMAC_SECRET || env.JWT_SECRET;
    if (!hmacSecret) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing HMAC secret' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const expectedHash = await hmacHex(hmacSecret, `verify:${cleanEmail}:${cleanCode}`);
    const isValid = constantTimeStringEqual(record.token, expectedHash);

    if (!isValid) {
      await env.DB.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
      return new Response(JSON.stringify({ error: 'Invalid verification code. Please check and try again.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mark verification used and verify user record
    await env.DB.batch([
      env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(record.id),
      env.DB.prepare("UPDATE users SET email_verified = 1, email_verified_at = datetime('now') WHERE id = ?").bind(record.user_id)
    ]);

    return new Response(JSON.stringify({
      success: true,
      message: 'Email verified successfully! You can now sign in.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[verify-email] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

