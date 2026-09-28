import { requireAuth, withAuth, ok, err, isValidPrefixedId } from '../../utils/guard.js';
import { computeSaleMetrics, daysBetween, validateNonNegativeMoney } from '../../utils/auction.js';

// ============================================================
// GET    /api/sales/:id - retrieve single sale with item info
// PUT    /api/sales/:id - update sale metrics and sync item
// DELETE /api/sales/:id - remove sale and revert item status
// ============================================================

function getSaleId(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const candidate = parts[parts.length - 1] || null;
  return isValidPrefixedId(candidate, 'sale') ? candidate : null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getSaleId(new URL(request.url));
    if (!id) return err('Sale ID required', 400);

    const sale = await env.DB.prepare(`
      SELECT
        s.*,
        i.item_name,
        i.category,
        i.athlete_person,
        i.authenticator,
        i.cert_number,
        i.unit_price,
        i.proration_weight,
        i.prorated_shipping,
        i.prorated_tax,
        i.prorated_discount,
        i.item_base_total,
        i.date_acquired,
        i.date_listed,
        inv.invoice_ref,
        inv.base_total AS invoice_subtotal,
        inv.shipping AS invoice_shipping,
        inv.tax AS invoice_tax,
        inv.discount AS invoice_discount
      FROM auction_sales s
      JOIN auction_items i ON i.id = s.item_id
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      WHERE s.id = ? AND s.user_id = ?
    `).bind(id, payload.userId).first();

    if (!sale) return err('Sale not found', 404);
    return ok({ sale });
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getSaleId(new URL(request.url));
    if (!id) return err('Sale ID required', 400);

    const existing = await env.DB.prepare(
      'SELECT * FROM auction_sales WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();

    if (!existing) return err('Sale not found', 404);

    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(existing.item_id, payload.userId).first();

    if (!item) return err('Associated item not found', 404);

    const body = await request.json();

    const sale_date = body.sale_date ?? existing.sale_date;
    const platform = body.platform ?? existing.platform;
    const buyer_handle = body.buyer_handle !== undefined ? body.buyer_handle : existing.buyer_handle;

    let gross_sale_price = existing.gross_sale_price;
    let buyer_shipping_paid = existing.buyer_shipping_paid;
    let actual_shipping_cost = existing.actual_shipping_cost;
    let platform_fee_pct = existing.platform_fee_pct;
    let platform_flat_fee = existing.platform_flat_fee;
    let payment_processing_amt = existing.payment_processing_amt;
    let promoted_listing_fee = existing.promoted_listing_fee;
    let directNetProceeds = existing.net_proceeds;

    try {
      if (body.gross_sale_price !== undefined) {
        gross_sale_price = validateNonNegativeMoney(body.gross_sale_price, 'gross_sale_price') ?? existing.gross_sale_price;
      }
      if (body.buyer_shipping_paid !== undefined) {
        buyer_shipping_paid = validateNonNegativeMoney(body.buyer_shipping_paid, 'buyer_shipping_paid') ?? 0;
      }
      if (body.actual_shipping_cost !== undefined) {
        actual_shipping_cost = validateNonNegativeMoney(body.actual_shipping_cost, 'actual_shipping_cost') ?? 0;
      }
      if (body.platform_fee_pct !== undefined) {
        platform_fee_pct = validateNonNegativeMoney(body.platform_fee_pct, 'platform_fee_pct') ?? 0;
      }
      if (body.platform_flat_fee !== undefined) {
        platform_flat_fee = validateNonNegativeMoney(body.platform_flat_fee, 'platform_flat_fee') ?? 0;
      }
      if (body.payment_processing_amt !== undefined) {
        payment_processing_amt = validateNonNegativeMoney(body.payment_processing_amt, 'payment_processing_amt') ?? 0;
      }
      if (body.promoted_listing_fee !== undefined) {
        promoted_listing_fee = validateNonNegativeMoney(body.promoted_listing_fee, 'promoted_listing_fee') ?? 0;
      }
      if (body.shipping_fee !== undefined) {
        validateNonNegativeMoney(body.shipping_fee, 'shipping_fee');
      }
      if (body.net_proceeds !== undefined) {
        directNetProceeds = validateNonNegativeMoney(body.net_proceeds, 'net_proceeds');
      } else if (body.net_earnings !== undefined) {
        directNetProceeds = validateNonNegativeMoney(body.net_earnings, 'net_earnings');
      }
    } catch (e) {
      return err(e.message, 400);
    }

    const metrics = computeSaleMetrics({
      gross_sale_price,
      buyer_shipping_paid,
      actual_shipping_cost,
      platform_fee_pct,
      platform_flat_fee,
      payment_processing_amt,
      promoted_listing_fee,
      net_proceeds: directNetProceeds,
      true_total_cost: item.true_total_cost
    });

    const startDate = item.date_listed || item.date_acquired;
    const daysToSell = daysBetween(startDate, sale_date) ?? existing.days_to_sell;

    await env.DB.prepare(`
      UPDATE auction_sales SET
        sale_date = ?,
        platform = ?,
        buyer_handle = ?,
        gross_sale_price = ?,
        buyer_shipping_paid = ?,
        actual_shipping_cost = ?,
        platform_fee_pct = ?,
        platform_flat_fee = ?,
        platform_fees_amt = ?,
        payment_processing_amt = ?,
        promoted_listing_fee = ?,
        net_proceeds = ?,
        true_total_cost = ?,
        net_profit = ?,
        roi_pct = ?,
        days_to_sell = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      sale_date,
      platform,
      buyer_handle || null,
      gross_sale_price,
      buyer_shipping_paid,
      actual_shipping_cost,
      platform_fee_pct,
      platform_flat_fee,
      metrics.platform_fees_amt,
      payment_processing_amt,
      promoted_listing_fee,
      metrics.net_proceeds,
      item.true_total_cost,
      metrics.net_profit,
      metrics.roi_pct,
      daysToSell >= 0 ? daysToSell : 0,
      id,
      payload.userId
    ).run();

    // Update item actual_sell_price & date_sold
    await env.DB.prepare(`
      UPDATE auction_items SET
        actual_sell_price = ?,
        date_sold = ?,
        days_on_market = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      gross_sale_price,
      sale_date,
      daysToSell >= 0 ? daysToSell : 0,
      existing.item_id,
      payload.userId
    ).run();

    return ok({ success: true, message: 'Sale updated successfully' });
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getSaleId(new URL(request.url));
    if (!id) return err('Sale ID required', 400);

    const existing = await env.DB.prepare(
      'SELECT id, item_id FROM auction_sales WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();

    if (!existing) return err('Sale not found', 404);

    // Delete sale
    await env.DB.prepare(
      'DELETE FROM auction_sales WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).run();

    // Revert item back to Listed or Available
    await env.DB.prepare(`
      UPDATE auction_items SET
        status = CASE WHEN date_listed IS NOT NULL AND date_listed != '' THEN 'Listed' ELSE 'Available' END,
        actual_sell_price = NULL,
        date_sold = NULL,
        days_on_market = NULL,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(existing.item_id, payload.userId).run();

    return ok({ success: true, message: 'Sale deleted and item status reverted' });
  });
}
