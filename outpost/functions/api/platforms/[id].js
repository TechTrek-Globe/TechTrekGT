import { requireAuth, withAuth, ok, err, isValidPrefixedId } from '../../utils/guard.js';
import { validateNonNegativeMoney } from '../../utils/auction.js';

function extractId(request, params) {
  let candidate = null;
  if (params?.id) {
    candidate = params.id;
  } else {
    const match = new URL(request.url).pathname.match(/\/api\/platforms\/([^/]+)/);
    candidate = match ? match[1] : null;
  }
  return isValidPrefixedId(candidate, 'plat', { allowPureUuid: true }) ? candidate : null;
}

/**
 * PUT /api/platforms/:id
 */
export async function onRequestPut(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    const id = extractId(request, params);
    if (!id) return err('Platform ID required', 400);

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

    let parsedFeePct = existing.fee_pct;
    let parsedFlatFee = existing.flat_fee;

    try {
      if (body.fee_pct !== undefined) {
        parsedFeePct = validateNonNegativeMoney(body.fee_pct, 'fee_pct') ?? existing.fee_pct;
      }
      if (body.flat_fee !== undefined) {
        parsedFlatFee = validateNonNegativeMoney(body.flat_fee, 'flat_fee') ?? existing.flat_fee;
      }
    } catch (e) {
      return err(e.message, 400);
    }

    const updateStmt = env.DB.prepare(`
      UPDATE auction_platforms
      SET name = ?, fee_pct = ?, flat_fee = ?, notes = ?, is_default = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      name.trim(),
      parsedFeePct,
      parsedFlatFee,
      (notes || '').trim(),
      is_default ? 1 : 0,
      id,
      userId
    );

    if (is_default && !existing.is_default) {
      const unsetStmt = env.DB.prepare('UPDATE auction_platforms SET is_default = 0 WHERE user_id = ?').bind(userId);
      if (typeof env.DB.batch === 'function') {
        await env.DB.batch([unsetStmt, updateStmt]);
      } else {
        await unsetStmt.run();
        await updateStmt.run();
      }
    } else {
      await updateStmt.run();
    }

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
    if (!id) return err('Platform ID required', 400);

    const existing = await env.DB.prepare(
      'SELECT * FROM auction_platforms WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!existing) return err('Platform not found', 404);

    await env.DB.prepare('DELETE FROM auction_platforms WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return ok({ success: true, id });
  });
}
