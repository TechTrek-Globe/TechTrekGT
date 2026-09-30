import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipRlKey = `sec-q:${ip}`;
  const ipLimit = await checkRateLimit(env.RATE_LIMIT_KV, ipRlKey, 10, 60, true, env.RATE_LIMIT_DO);

  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      if (!ipLimit.allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please wait.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipLimit.retryAfter) }
        });
      }
      return new Response(JSON.stringify({ error: 'Email address is required.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const accountRlKey = `sec-q-account:${cleanEmail}`;
    const accountLimit = await checkRateLimit(env.RATE_LIMIT_KV, accountRlKey, 10, 900, true, env.RATE_LIMIT_DO);

    if (!ipLimit.allowed || !accountLimit.allowed) {
      const retryAfter = Math.max(
        !ipLimit.allowed ? (ipLimit.retryAfter || 60) : 0,
        !accountLimit.allowed ? (accountLimit.retryAfter || 60) : 0
      );
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
      });
    }

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
    if (ipLimit && !ipLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipLimit.retryAfter) }
      });
    }
    console.error('[outpost security-question] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
