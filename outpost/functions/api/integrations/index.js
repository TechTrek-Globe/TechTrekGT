import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { hashSecret, generateIntegrationSecret } from '../../utils/apiIntegrations.js';

/**
 * GET /api/integrations
 * Lists all integrations for the authenticated user.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const { results } = await env.DB.prepare(`
      SELECT id, user_id, label, created_at, revoked_at
      FROM api_integrations
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).bind(userId).all();

    return ok({ integrations: results || [] });
  });
}

/**
 * POST /api/integrations
 * Issues a new integration secret for the authenticated user.
 * Body: { label?: string }
 * Returns: { integration: { id, user_id, label, created_at, secret } }
 * Note: Raw secret is returned ONLY ONCE upon creation.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM api_integrations WHERE user_id = ? AND revoked_at IS NULL'
    ).bind(userId).first();

    if (countRow && Number(countRow.cnt) >= 10) {
      return err('Maximum number of active API integrations (10) reached. Revoke an existing integration before creating a new one.', 429);
    }

    const body = await request.json().catch(() => ({}));
    const label = (body?.label || 'VineScout Integration').trim().slice(0, 100);

    const id = crypto.randomUUID();
    const secret = generateIntegrationSecret();
    const secretHash = await hashSecret(secret);

    await env.DB.prepare(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(id, userId, secretHash, label).run();

    const created = await env.DB.prepare(`
      SELECT id, user_id, label, created_at, revoked_at
      FROM api_integrations
      WHERE id = ? LIMIT 1
    `).bind(id).first();

    return ok({
      integration: {
        ...created,
        secret
      }
    }, 201);
  });
}
