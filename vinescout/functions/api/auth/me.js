import { verifyToken, getTokenFromRequest } from '../../utils/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    let userDetails = { id: payload.userId, email: payload.email, name: payload.name };
    if (env.DB) {
      try {
        const dbUser = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(payload.userId).first();
        if (dbUser) userDetails = { id: dbUser.id, email: dbUser.email, name: dbUser.name };
      } catch (_) { /* fallback to JWT payload */ }
    }

    return new Response(JSON.stringify({ success: true, user: userDetails }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[vinescout me] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
