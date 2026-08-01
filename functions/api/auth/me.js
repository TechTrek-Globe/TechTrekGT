import { verifyToken, getTokenFromRequest } from '../../utils/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const payload = await verifyToken(token, env.JWT_SECRET);

    if (!payload) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user: { id: payload.userId, email: payload.email, name: payload.name },
      householdId: payload.householdId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[me] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
