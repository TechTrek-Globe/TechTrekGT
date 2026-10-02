import { verifyToken, getTokenFromRequest, getAllTokensFromRequest } from '../../utils/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    let tokens = [];
    try {
      tokens = getAllTokensFromRequest(request);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let payload = null;
    let dbUser = null;

    for (const t of tokens) {
      const p = await verifyToken(t, env.JWT_SECRET);
      if (p && p.userId) {
        if (env.DB) {
          const u = await env.DB.prepare(
            'SELECT id, email, name, security_question, security_answer_hash, email_verified, email_verified_at, token_version FROM users WHERE id = ?'
          ).bind(p.userId).first();

          if (u) {
            const currentTv = u.token_version ?? 1;
            const tokenTv = p.tv ?? p.token_version ?? 1;
            if (tokenTv < currentTv) {
              continue; // Token invalidated by token version bump (T-14 / SEC-020)
            }
            dbUser = u;
          } else {
            continue; // User does not exist in database; token is invalid
          }
        }
        payload = p;
        break;
      }
    }

    if (!payload || (env.DB && !dbUser)) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
        }
      });
    }

    let userDetails = { id: payload.userId, email: payload.email, name: payload.name };
    if (dbUser) {
      let pendingEmail = null;
      try {
        const pendingRow = await env.DB.prepare(
          "SELECT email, expires_at FROM email_verifications WHERE user_id = ? AND used = 0 AND (change_type = 'email_change' OR email != ?) ORDER BY created_at DESC LIMIT 1"
        ).bind(dbUser.id, dbUser.email).first();

        if (pendingRow && pendingRow.expires_at > Date.now()) {
          pendingEmail = pendingRow.email;
        }
      } catch (_) {}

      userDetails = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        securityQuestion: dbUser.security_question || null,
        hasSecurityQuestion: Boolean(dbUser.security_question && dbUser.security_answer_hash),
        emailVerified: Boolean(dbUser.email_verified || dbUser.email_verified_at),
        emailVerifiedAt: dbUser.email_verified_at || null,
        pendingEmail
      };
    }

    return new Response(JSON.stringify({
      success: true,
      user: userDetails
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[auction me] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
