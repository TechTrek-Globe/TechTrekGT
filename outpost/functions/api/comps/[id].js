import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

function extractId(request, params) {
  if (params?.id) return params.id;
  const match = new URL(request.url).pathname.match(/\/api\/comps\/([^/]+)/);
  return match ? match[1] : null;
}

function computeManualAvg(comp1, comp2, comp3) {
  const vals = [comp1, comp2, comp3].filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 100) / 100;
}

/**
 * GET /api/comps/:id
 */
export async function onRequestGet(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    const id = extractId(request, params);
    if (!id) return err('Comp ID required');

    const comp = await env.DB.prepare(`
      SELECT c.*, i.item_name, i.category, i.athlete_person, i.authenticator, i.cert_number, i.true_total_cost, i.min_sell_price, i.current_list_price
      FROM auction_comps c
      JOIN auction_items i ON c.item_id = i.id
      WHERE c.id = ? AND c.user_id = ?
    `).bind(id, userId).first();

    if (!comp) return err('Comp not found', 404);
    return ok({ comp });
  });
}

/**
 * PUT /api/comps/:id
 */
export async function onRequestPut(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    const id = extractId(request, params);
    if (!id) return err('Comp ID required');

    const existing = await env.DB.prepare(
      'SELECT * FROM auction_comps WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!existing) return err('Comp not found', 404);

    const body = await request.json().catch(() => ({}));
    const {
      comp_1 = existing.comp_1,
      comp_2 = existing.comp_2,
      comp_3 = existing.comp_3,
      live_avg = existing.live_avg,
      active_comp_1 = existing.active_comp_1,
      active_comp_2 = existing.active_comp_2,
      active_comp_3 = existing.active_comp_3,
      active_avg = existing.active_avg,
      sold_count = existing.sold_count,
      recommended_list_price,
      ebay_search_url = existing.ebay_search_url,
      apply_to_item = false
    } = body;

    const manualAvg = computeManualAvg(comp_1, comp_2, comp_3);
    const computedActiveAvg = active_avg !== undefined && active_avg !== null && active_avg !== ''
      ? Number(active_avg)
      : computeManualAvg(active_comp_1, active_comp_2, active_comp_3);

    const recPrice = recommended_list_price !== undefined && recommended_list_price !== null && !isNaN(Number(recommended_list_price))
      ? Number(recommended_list_price)
      : (manualAvg || existing.recommended_list_price);

    const toDbNumber = (val) => (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) ? Number(val) : null;
    const toDbInt = (val) => (val !== undefined && val !== null && val !== '' && !isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 0) ? parseInt(val, 10) : 0;

    await env.DB.prepare(`
      UPDATE auction_comps
      SET comp_1 = ?, comp_2 = ?, comp_3 = ?, live_avg = ?, manual_avg = ?,
          active_comp_1 = ?, active_comp_2 = ?, active_comp_3 = ?, active_avg = ?,
          sold_count = ?,
          recommended_list_price = ?, ebay_search_url = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      toDbNumber(comp_1),
      toDbNumber(comp_2),
      toDbNumber(comp_3),
      toDbNumber(live_avg),
      manualAvg,
      toDbNumber(active_comp_1),
      toDbNumber(active_comp_2),
      toDbNumber(active_comp_3),
      computedActiveAvg,
      toDbInt(sold_count),
      recPrice,
      ebay_search_url,
      id,
      userId
    ).run();

    if (apply_to_item && recPrice > 0) {
      await env.DB.prepare(`
        UPDATE auction_items
        SET current_list_price = ?, suggested_list_price = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(recPrice, recPrice, existing.item_id, userId).run();
    }

    const updated = await env.DB.prepare('SELECT * FROM auction_comps WHERE id = ?').bind(id).first();
    return ok({ comp: updated });
  });
}

/**
 * DELETE /api/comps/:id
 */
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    const id = extractId(request, params);
    if (!id) return err('Comp ID required');

    const existing = await env.DB.prepare(
      'SELECT id FROM auction_comps WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!existing) return err('Comp not found', 404);

    await env.DB.prepare('DELETE FROM auction_comps WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return ok({ success: true, id });
  });
}
