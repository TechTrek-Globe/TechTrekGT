import { verifyPassword, createToken, buildAuthCookie, isThreePartHash } from '../../utils/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (user.force_password_reset === 1 || !isThreePartHash(user.password_hash)) {
      return new Response(JSON.stringify({
        error: 'Password reset required. Your account security credentials must be updated before logging in.',
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
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const maxAge = body.rememberMe ? 30 * 24 * 3600 : 7200;
    const token = await createToken({ userId: user.id, email: user.email, name: user.name }, env.JWT_SECRET, maxAge);

    return new Response(JSON.stringify({ success: true, user: { id: user.id, email: user.email, name: user.name } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': buildAuthCookie(token, maxAge) }
    });

  } catch (err) {
    console.error('[vinescout login] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
