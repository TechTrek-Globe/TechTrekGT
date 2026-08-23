import { verifyPassword, createToken } from '../../utils/auth.js';
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

    // Query household membership
    const member = await env.DB.prepare(
      'SELECT household_id FROM household_members WHERE user_id = ?'
    ).bind(user.id).first();

    const householdId = member ? member.household_id : null;

    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create JWT token
    const token = await createToken({ userId: user.id, email: user.email, householdId, name: user.name }, env.JWT_SECRET);
    
    const maxAge = body.rememberMe ? 30 * 24 * 3600 : 7200;
    const cookieOptions = [
      `auth_token=${token}`,
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${maxAge}`
    ].join('; ');

    return new Response(JSON.stringify({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
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
