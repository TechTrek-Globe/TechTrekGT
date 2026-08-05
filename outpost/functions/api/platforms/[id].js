import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

function extractId(request, params) {
  if (params?.id) return params.id;
  const match = new URL(request.url).pathname.match(/\/api\/platforms\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * PUT /api/platforms/:id
 */
export async function onRequestPut(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    const id = extractId(request, params);
    if (!id) return err('Platform ID required');

    const existing = await env.DB.prepare(
      'SELECT * FROM auction_platforms WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!existing) return err('Platform not found', 404);

    const body = await request.json().catch(() => ({}));
    const {
      name = existing.name,
      fee_pct = existing.fee_pct,
      flat_fee = existing.flat_fee,
      notes = existing.notes,
      is_default = existing.is_default
    } = body;

    if (is_default && !existing.is_default) {
      await env.DB.prepare('UPDATE auction_platforms SET is_default = 0 WHERE user_id = ?').bind(userId).run();
    }

    await env.DB.prepare(`
      UPDATE auction_platforms
      SET name = ?, fee_pct = ?, flat_fee = ?, notes = ?, is_default = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      name.trim(),
      Number(fee_pct) || 0,
      Number(flat_fee) || 0,
      (notes || '').trim(),
      is_default ? 1 : 0,
      id,
      userId
    ).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM auction_platforms WHERE id = ?'
    ).bind(id).first();

    return ok({ platform: updated });
  });
}

/**
 * DELETE /api/platforms/:id
 */
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    const id = extractId(request, params);
    if (!id) return err('Platform ID required');

    const existing = await env.DB.prepare(
      'SELECT * FROM auction_platforms WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!existing) return err('Platform not found', 404);

    await env.DB.prepare('DELETE FROM auction_platforms WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return ok({ success: true, id });
  });
}
