import { verifyPassword, createToken, buildAuthCookie, isThreePartHash } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipRlKey = `login:${ip}`;
  const ipLimit = await checkRateLimit(env.RATE_LIMIT_KV, ipRlKey, 10, 60, true, env.RATE_LIMIT_DO);

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      if (!ipLimit.allowed) {
        return new Response(JSON.stringify({ error: 'Too many login attempts. Please wait.' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(ipLimit.retryAfter)
          }
        });
      }
      return new Response(JSON.stringify({ error: 'Email and password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const accountRlKey = `login-account:${cleanEmail}`;
    const accountLimit = await checkRateLimit(env.RATE_LIMIT_KV, accountRlKey, 10, 900, true, env.RATE_LIMIT_DO);

    if (!ipLimit.allowed || !accountLimit.allowed) {
      const retryAfter = Math.max(
        !ipLimit.allowed ? (ipLimit.retryAfter || 60) : 0,
        !accountLimit.allowed ? (accountLimit.retryAfter || 60) : 0
      );
      return new Response(JSON.stringify({ error: 'Too many login attempts. Please wait.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter)
        }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if account has force_password_reset flag or legacy non-3-part hash (HIGH-6)
    const isLegacyHash = !isThreePartHash(user.password_hash);
    if (user.force_password_reset === 1 || isLegacyHash) {
      return new Response(JSON.stringify({
        error: 'Password reset required. Your account security credentials must be updated before signing in.',
        forcePasswordReset: true,
        requiresReset: true,
        redirectTo: '/reset-password',
        email: user.email
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const maxAge = body.rememberMe ? 30 * 24 * 3600 : 7200;

    const token = await createToken(
      { userId: user.id, tv: user.token_version ?? 1 },
      env.JWT_SECRET,
      maxAge
    );

    return new Response(JSON.stringify({
      success: true,
      user: { id: user.id, email: user.email, name: user.name }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildAuthCookie(token, maxAge)
      }
    });

  } catch (err) {
    if (ipLimit && !ipLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many login attempts. Please wait.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(ipLimit.retryAfter)
        }
      });
    }
    console.error('[auction login] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
