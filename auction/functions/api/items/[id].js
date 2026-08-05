import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computePricingFloors } from '../../utils/auction.js';

// ============================================================
// GET    /api/items/:id  - get single item
// PUT    /api/items/:id  - update item fields
// DELETE /api/items/:id  - delete item (guard: no sales)
// ============================================================

function getItemId(url) {
  const parts = url.pathname.split('/');
  return parts[parts.length - 1] || null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getItemId(new URL(request.url));
    if (!id) return err('Item ID required', 400);

    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();

    if (!item) return err('Item not found', 404);
    return ok({ item });
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getItemId(new URL(request.url));
    if (!id) return err('Item ID required', 400);

    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();
    if (!item) return err('Item not found', 404);

    const body = await request.json();

    // Merge only provided fields
    const updated = {
      item_name:          body.item_name         ?? item.item_name,
      category:           body.category          ?? item.category,
      sport_genre:        body.sport_genre        ?? item.sport_genre,
      athlete_person:     body.athlete_person     ?? item.athlete_person,
      authenticator:      body.authenticator      ?? item.authenticator,
      cert_number:        body.cert_number        ?? item.cert_number,
      status:             body.status             ?? item.status,
      platform:           body.platform           ?? item.platform,
      platform_fee_pct:   body.platform_fee_pct   ?? item.platform_fee_pct,
      platform_flat_fee:  body.platform_flat_fee  ?? item.platform_flat_fee,
      est_shipping_cost:  body.est_shipping_cost  ?? item.est_shipping_cost,
      boost_pct:          body.boost_pct          ?? item.boost_pct,
      target_margin_pct:  body.target_margin_pct  ?? item.target_margin_pct,
      current_list_price: body.current_list_price ?? item.current_list_price,
      actual_sell_price:  body.actual_sell_price  ?? item.actual_sell_price,
      date_listed:        body.date_listed        ?? item.date_listed,
      date_sold:          body.date_sold          ?? item.date_sold,
      notes:              body.notes              ?? item.notes,
      best_listing_window: body.best_listing_window ?? item.best_listing_window,
    };

    // If platform changed, auto-lookup fees from auction_platforms
    if (body.platform && body.platform !== item.platform && !body.platform_fee_pct) {
      const plat = await env.DB.prepare(
        'SELECT fee_pct, flat_fee FROM auction_platforms WHERE user_id = ? AND name = ?'
      ).bind(payload.userId, body.platform).first();
      if (plat) {
        updated.platform_fee_pct  = plat.fee_pct;
        updated.platform_flat_fee = plat.flat_fee;
      }
    }

    // Recompute pricing floors whenever fee or shipping changes
    const pricing = computePricingFloors({
      true_total_cost:   item.true_total_cost,
      est_shipping_cost: updated.est_shipping_cost,
      platform_flat_fee: updated.platform_flat_fee,
      platform_fee_pct:  updated.platform_fee_pct,
      boost_pct:         updated.boost_pct,
      target_margin_pct: updated.target_margin_pct
    });

    // Compute days on market if status changed to Sold
    let days_on_market = item.days_on_market;
    if (updated.status === 'Sold' && updated.date_listed && updated.date_sold) {
      const from = new Date(updated.date_listed).getTime();
      const to   = new Date(updated.date_sold).getTime();
      days_on_market = Math.floor((to - from) / (1000 * 60 * 60 * 24));
    }

    await env.DB.prepare(`
      UPDATE auction_items SET
        item_name = ?, category = ?, sport_genre = ?, athlete_person = ?,
        authenticator = ?, cert_number = ?,
        status = ?, platform = ?, platform_fee_pct = ?, platform_flat_fee = ?,
        est_shipping_cost = ?, boost_pct = ?, target_margin_pct = ?,
        min_sell_price = ?, suggested_list_price = ?,
        current_list_price = ?, actual_sell_price = ?,
        date_listed = ?, date_sold = ?, days_on_market = ?,
        notes = ?, best_listing_window = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      updated.item_name, updated.category, updated.sport_genre, updated.athlete_person,
      updated.authenticator, updated.cert_number,
      updated.status, updated.platform, updated.platform_fee_pct, updated.platform_flat_fee,
      updated.est_shipping_cost, updated.boost_pct, updated.target_margin_pct,
      pricing.min_sell_price, pricing.suggested_list_price,
      updated.current_list_price, updated.actual_sell_price,
      updated.date_listed, updated.date_sold, days_on_market,
      updated.notes, updated.best_listing_window,
      id, payload.userId
    ).run();

    return ok({
      success: true,
      min_sell_price: pricing.min_sell_price,
      suggested_list_price: pricing.suggested_list_price,
      days_on_market
    });
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getItemId(new URL(request.url));
    if (!id) return err('Item ID required', 400);

    const item = await env.DB.prepare(
      'SELECT id FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();
    if (!item) return err('Item not found', 404);

    // Guard: cannot delete if a sale references this item
    const saleCheck = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM auction_sales WHERE item_id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();
    if (saleCheck && saleCheck.cnt > 0) {
      return err('Cannot delete an item that has recorded sales. Set status to "Returned" instead.', 409);
    }

    await env.DB.prepare('DELETE FROM auction_comps WHERE item_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM auction_items WHERE id = ? AND user_id = ?').bind(id, payload.userId).run();

    return ok({ success: true });
  });
}
