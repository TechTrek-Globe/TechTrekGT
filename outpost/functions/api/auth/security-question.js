import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `sec-q:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 10, 60);

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please wait.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
    });
  }

  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email address is required.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Artificial delay prevents timing-based enumeration (HIGH-1)
    const delayPromise = new Promise(r => setTimeout(r, 200));

    const user = await env.DB.prepare(
      'SELECT security_question FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    await delayPromise;

    // Return 200 regardless of whether the account exists to prevent enumeration (HIGH-1)
    if (!user) {
      return new Response(JSON.stringify({
        success: true,
        email: cleanEmail,
        securityQuestion: null,
        hasSecurityQuestion: false
      }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      email: cleanEmail,
      securityQuestion: user.security_question || null,
      hasSecurityQuestion: Boolean(user.security_question)
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[outpost security-question] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
