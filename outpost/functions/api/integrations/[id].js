import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

function extractId(request, params) {
  if (params?.id) return params.id;
  const match = new URL(request.url).pathname.match(/\/api\/integrations\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * POST /api/integrations/:id/revoke or POST /api/integrations/revoke
 * Revokes an integration secret by marking revoked_at with timestamp.
 */
export async function onRequestPost(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const auth = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    let id = extractId(request, params);
    if (id === 'revoke') {
      const body = await request.json().catch(() => ({}));
      id = body?.id;
    }

    if (!id) return err('Integration ID required', 400);

    const authUser = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(auth.userId).first();
    const isAdmin = authUser?.is_admin === 1;
    const existing = isAdmin
      ? await env.DB.prepare('SELECT id, user_id, label, revoked_at FROM api_integrations WHERE id = ?').bind(id).first()
      : await env.DB.prepare('SELECT id, user_id, label, revoked_at FROM api_integrations WHERE id = ? AND user_id = ?').bind(id, auth.userId).first();

    if (!existing) return err('Integration not found', 404);

    if (existing.revoked_at) {
      return ok({ id, revoked: true, revoked_at: existing.revoked_at, message: 'Already revoked' });
    }

    await env.DB.prepare(
      "UPDATE api_integrations SET revoked_at = datetime('now') WHERE id = ?"
    ).bind(id).run();

    const updated = await env.DB.prepare(
      'SELECT id, user_id, label, created_at, revoked_at FROM api_integrations WHERE id = ?'
    ).bind(id).first();

    return ok({ id, revoked: true, revoked_at: updated?.revoked_at });
  });
}

/**
 * DELETE /api/integrations/:id
 * Revokes an integration secret.
 */
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const auth = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const id = extractId(request, params);
    if (!id) return err('Integration ID required', 400);

    const authUser = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(auth.userId).first();
    const isAdmin = authUser?.is_admin === 1;
    const existing = isAdmin
      ? await env.DB.prepare('SELECT id, user_id, label, revoked_at FROM api_integrations WHERE id = ?').bind(id).first()
      : await env.DB.prepare('SELECT id, user_id, label, revoked_at FROM api_integrations WHERE id = ? AND user_id = ?').bind(id, auth.userId).first();

    if (!existing) return err('Integration not found', 404);

    await env.DB.prepare(
      "UPDATE api_integrations SET revoked_at = datetime('now') WHERE id = ?"
    ).bind(id).run();

    return ok({ id, revoked: true, message: 'Integration revoked successfully' });
  });
}
