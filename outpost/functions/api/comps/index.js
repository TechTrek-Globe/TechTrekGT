import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computeManualAvg } from '../../utils/auction.js';
import {
  parseImageFromNotes,
  parseUserNote,
  cleanEbaySearchQuery,
  buildEbaySearchUrl
} from '../../utils/ebayUtils.js';

export {
  computeManualAvg,
  cleanEbaySearchQuery,
  buildEbaySearchUrl,
  parseImageFromNotes,
  parseUserNote
};

/**
 * GET /api/comps
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const itemId = url.searchParams.get('item_id');
    const statusFilter = url.searchParams.get('status'); // e.g. 'active' or 'Available,Listed'

    let query = `
      SELECT
        c.id as comp_id,
        c.comp_1,
        c.comp_2,
        c.comp_3,
        c.manual_avg,
        c.live_avg,
        c.active_comp_1,
        c.active_comp_2,
        c.active_comp_3,
        c.active_avg,
        c.sold_count,
        c.ebay_search_url,
        c.recommended_list_price,
        c.updated_at as comp_updated_at,
        i.id as item_id,
        i.item_name,
        i.category,
        i.sport_genre,
        i.athlete_person,
        i.authenticator,
        i.cert_number,
        i.unit_price,
        i.true_total_cost,
        i.min_sell_price,
        i.suggested_list_price,
        i.current_list_price,
        i.target_margin_pct,
        i.status,
        i.platform,
        i.date_acquired,
        i.est_shipping_cost,
        i.platform_fee_pct,
        i.notes,
        inv.invoice_ref
      FROM auction_items i
      LEFT JOIN auction_comps c ON i.id = c.item_id AND c.user_id = i.user_id
      LEFT JOIN auction_invoices inv ON i.invoice_id = inv.id
      WHERE i.user_id = ?
    `;

    const bindings = [userId];

    if (itemId) {
      query += ' AND i.id = ?';
      bindings.push(itemId);
    } else if (statusFilter === 'active') {
      query += " AND i.status IN ('Available', 'Listed')";
    }

    query += ' ORDER BY i.created_at DESC';

    const rows = await env.DB.prepare(query).bind(...bindings).all();
    const results = (rows.results || []).map(row => {
      const isAmazon = typeof row.invoice_ref === 'string' && row.invoice_ref.startsWith('AMAZON-');
      const imageUrl = parseImageFromNotes(row.notes);
      const userNote = parseUserNote(row.notes);
      const searchUrl = buildEbaySearchUrl(row.item_name, row.athlete_person, row.authenticator);
      return {
        ...row,
        ebay_search_url: searchUrl,
        image_url: imageUrl,
        user_note: userNote,
        is_amazon: isAmazon
      };
    });

    return ok({ comps: results });
  });
}

/**
 * POST /api/comps - upsert comp for an item
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const {
      item_id,
      comp_1,
      comp_2,
      comp_3,
      live_avg,
      active_comp_1,
      active_comp_2,
      active_comp_3,
      active_avg,
      sold_count,
      ebay_search_url,
      recommended_list_price,
      apply_to_item = false
    } = body;

    if (!item_id) return err('item_id is required');

    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(item_id, userId).first();

    if (!item) return err('Item not found', 404);

    const toDbNumber = (val) => (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) ? Number(val) : null;
    const toDbInt = (val) => (val !== undefined && val !== null && val !== '' && !isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 0) ? parseInt(val, 10) : 0;

    const manualAvg = computeManualAvg(comp_1, comp_2, comp_3);
    const computedActiveAvg = active_avg !== undefined && active_avg !== null && active_avg !== ''
      ? Number(active_avg)
      : computeManualAvg(active_comp_1, active_comp_2, active_comp_3);

    const recPrice = recommended_list_price !== undefined && recommended_list_price !== null && !isNaN(Number(recommended_list_price))
      ? Number(recommended_list_price)
      : (manualAvg || item.suggested_list_price);

    const searchUrl = ebay_search_url || buildEbaySearchUrl(item.item_name, item.athlete_person, item.authenticator);

    // Check if comp row already exists
    const existingComp = await env.DB.prepare(
      'SELECT id FROM auction_comps WHERE item_id = ? AND user_id = ?'
    ).bind(item_id, userId).first();

    let compId = existingComp?.id;

    if (existingComp) {
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
        searchUrl,
        compId,
        userId
      ).run();
    } else {
      compId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO auction_comps (
          id, item_id, user_id, comp_1, comp_2, comp_3, live_avg, manual_avg,
          active_comp_1, active_comp_2, active_comp_3, active_avg, sold_count,
          recommended_list_price, ebay_search_url, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        compId,
        item_id,
        userId,
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
        searchUrl
      ).run();
    }

    // Optionally apply recommended list price to current_list_price / suggested_list_price of item
    if (apply_to_item && recPrice > 0) {
      await env.DB.prepare(`
        UPDATE auction_items
        SET current_list_price = ?, suggested_list_price = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(recPrice, recPrice, item_id, userId).run();
    }

    const updated = await env.DB.prepare('SELECT * FROM auction_comps WHERE id = ?').bind(compId).first();
    return ok({ comp: updated, message: 'Comp saved successfully' });
  });
}
