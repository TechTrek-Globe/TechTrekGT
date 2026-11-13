import { authenticateRequest, buildClearCookieHeader } from '../../utils/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const auth = await authenticateRequest(request, env);
    if (!auth.ok) {
      const headers = { 'Content-Type': 'application/json' };
      if (auth.clearCookie) {
        headers['Set-Cookie'] = buildClearCookieHeader();
      }
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers
      });
    }

    const dbUser = auth.dbUser;
    const isAdmin = Boolean(dbUser.is_admin === 1 || dbUser.role === 'admin');
    const userDetails = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role || 'user',
      isAdmin,
      apiKeyEnabled: Boolean(dbUser.api_key_enabled === 1 || isAdmin),
      securityQuestion: dbUser.security_question || null,
      hasSecurityQuestion: Boolean(dbUser.security_question && dbUser.security_answer_hash)
    };

    return new Response(JSON.stringify({
      success: true,
      user: userDetails
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
