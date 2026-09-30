import { verifyToken, getAllTokensFromRequest } from '../../utils/auth.js';

export async function onRequestPost(context = {}) {
  const { request, env } = context;

  // If logout-all is requested and environment is available, increment token_version (T-14 / SEC-020)
  if (request && env && env.DB && env.JWT_SECRET) {
    try {
      const url = new URL(request.url);
      const isLogoutAll = url.pathname.endsWith('/logout-all') || url.searchParams.get('all') === 'true';
      let bodyAll = false;
      try {
        const body = await request.clone().json().catch(() => ({}));
        bodyAll = body?.all === true;
      } catch (_) {}

      if (isLogoutAll || bodyAll) {
        let tokens = [];
        try {
          tokens = getAllTokensFromRequest(request);
        } catch (_) {}

        for (const token of tokens) {
          const payload = await verifyToken(token, env.JWT_SECRET);
          if (payload && payload.userId) {
            await env.DB.prepare(
              'UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
            ).bind(payload.userId).run();
            break;
          }
        }
      }
    } catch (e) {
      console.error('[logout] token invalidation error:', e);
    }
  }

  const cookieOptions = [
    'auth_token=',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0'
  ].join('; ');

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookieOptions
    }
  });
}
