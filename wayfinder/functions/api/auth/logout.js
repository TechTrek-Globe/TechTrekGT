import { authenticateRequest, buildClearCookieHeader } from '../../utils/auth.js';

export async function onRequestPost(context = {}) {
  const { request, env } = context;

  if (request && env?.DB) {
    let revokeAll = false;
    try {
      const body = await request.clone().json();
      revokeAll = Boolean(body && body.all === true);
    } catch {
      // Optional JSON body; plain POST /api/auth/logout clears current cookie
    }

    if (revokeAll) {
      const auth = await authenticateRequest(request, env);
      if (auth.ok && auth.dbUser?.id) {
        await env.DB.prepare(
          'UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
        ).bind(auth.dbUser.id).run();
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildClearCookieHeader()
    }
  });
}
