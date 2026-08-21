import { verifyPassword } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `forgot:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 600);

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many reset attempts. Please wait.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
    });
  }

  // Generic response used for both "no account" and "no security question" to prevent enumeration
  const genericOk = new Response(JSON.stringify({
    success: true,
    message: 'If an account with this email exists and has a security question set, a reset session has been created.'
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const body = await request.json();
    const { email, securityAnswer } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email address is required.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email address format.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Artificial delay prevents timing-based enumeration regardless of path taken
    const delayPromise = new Promise(r => setTimeout(r, 200));

    const user = await env.DB.prepare(
      'SELECT id, email, name, security_question, security_answer_hash FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    // No account or no security answer - return identical generic response (HIGH-1, HIGH-2)
    if (!user || !user.security_answer_hash) {
      await delayPromise;
      return genericOk;
    }

    if (!securityAnswer) {
      return new Response(JSON.stringify({ error: 'Security answer is required.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanAnswer = securityAnswer.trim().toLowerCase();
    const isValidAnswer = await verifyPassword(cleanAnswer, user.security_answer_hash);

    if (!isValidAnswer) {
      await delayPromise;
      return new Response(JSON.stringify({ error: 'Incorrect security answer. Please try again.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Issue a server-side reset session - NEVER return the token in the response body (CRITICAL-1)
    const sessionId = crypto.randomUUID();
    const resetId = `rst-${crypto.randomUUID()}`;
    const now = Date.now();
    const expiresAt = now + (15 * 60 * 1000); // 15-minute window

    // Invalidate any previous unused reset sessions for this email
    await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').bind(cleanEmail).run();

    await env.DB.prepare(
      'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
    ).bind(resetId, user.id, cleanEmail, sessionId, expiresAt, now).run();

    // Return the session ID as an HttpOnly cookie only - never in the response body
    const resetSessionCookie = [
      `reset_session=${sessionId}`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/api/auth/reset-password',
      'Max-Age=900'
    ].join('; ');

    await delayPromise;
    return new Response(JSON.stringify({
      success: true,
      message: 'Security answer verified. You may now set a new password.'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': resetSessionCookie
      }
    });

  } catch (err) {
    console.error('[outpost forgot-password] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
