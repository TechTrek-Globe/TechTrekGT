import { verifyPassword, createToken, buildAuthCookieHeader } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `login:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 10, 60);

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many login attempts. Please wait.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter)
      }
    });
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Query user record
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Require email verification before issuing session
    const userStatus = user.status || 'Active';
    if (userStatus === 'Suspended' || (userStatus !== 'Active' && userStatus !== 'active')) {
      return new Response(JSON.stringify({
        error: 'This account has been suspended. Please contact an administrator.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (user.email_verified !== 1 && !user.email_verified_at) {
      return new Response(JSON.stringify({
        error: 'Email verification required. Please verify your email before signing in.',
        code: 'EMAIL_VERIFICATION_REQUIRED',
        requiresVerification: true,
        email: user.email
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const householdId = null;

    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const maxAge = body.rememberMe ? 30 * 24 * 3600 : 7200;

    const isAdmin = Boolean(user.is_admin === 1 || user.role === 'admin');
    const apiKeyEnabled = Boolean(user.api_key_enabled === 1 || isAdmin);
    const tokenVersion = Number(user.token_version ?? 1);

    // Create minimal JWT token containing zero PII
    const token = await createToken(
      { userId: user.id, tv: tokenVersion },
      env.JWT_SECRET,
      maxAge
    );

    // Update sign-in telemetry best-effort without blocking authentication
    try {
      await env.DB.prepare('UPDATE users SET sign_in_count = COALESCE(sign_in_count, 0) + 1 WHERE id = ?').bind(user.id).run();
    } catch {
      // Non-fatal if older D1 schema lacks sign_in_count
    }

    const cookieOptions = buildAuthCookieHeader(token, maxAge);

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'user',
        isAdmin,
        apiKeyEnabled
      },
      householdId
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': cookieOptions
      }
    });

  } catch (err) {
    console.error('[login] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
