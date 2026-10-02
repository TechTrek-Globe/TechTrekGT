import { requireAuth, withAuth, ok, err, isValidPrefixedId } from '../../utils/guard.js';
import { validateNonNegativeMoney, validatePercentage, validateSignedMoney } from '../../utils/auction.js';
import { normalizeSaleInput, upsertSale } from '../../utils/sales.js';

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
    // Left undefined so normalizeSaleInput derives net_proceeds from the (possibly
    // changed) gross/percentages. Seeding this with existing.net_proceeds made a
    // partial PUT keep the OLD net proceeds next to a NEW gross price, so the row
    // was internally inconsistent and roi_pct stopped tracking the sale price.
    let directNetProceeds;

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
        // T-10 item 7: reject out-of-range percentages at the API boundary.
        platform_fee_pct = validatePercentage(body.platform_fee_pct, 'platform_fee_pct') ?? 0;
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
        directNetProceeds = validateSignedMoney(body.net_proceeds, 'net_proceeds');
      } else if (body.net_earnings !== undefined) {
        directNetProceeds = validateSignedMoney(body.net_earnings, 'net_earnings');
      }
    } catch (e) {
      return err(e.message, 400);
    }

    // T-08: normalize + upsert, same path as every other sale entry point. Fields
    // omitted from the body fall back to the stored sale values below, so a
    // partial PUT still produces the same row as the equivalent full create.
    const record = normalizeSaleInput({
      item_id: existing.item_id,
      sale_date,
      platform,
      buyer_handle,
      gross_sale_price,
      buyer_shipping_paid,
      actual_shipping_cost,
      platform_fee_pct,
      platform_flat_fee,
      payment_processing_amt,
      promoted_listing_fee,
      net_proceeds: directNetProceeds,
      true_total_cost: item.true_total_cost
    }, item);

    await upsertSale(env, payload.userId, record);

    try {
      // Update item actual_sell_price & date_sold
      await env.DB.prepare(`
        UPDATE auction_items SET
          actual_sell_price = ?,
          date_sold = ?,
          days_on_market = ?,
          updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(
        record.gross_sale_price,
        record.sale_date,
        record.days_to_sell ?? null,
        existing.item_id,
        payload.userId
      ).run();
    } catch (itemErr) {
      console.error('[sales] Failed to update item on sale edit, rolling back sale:', itemErr);
      await upsertSale(env, payload.userId, normalizeSaleInput({
        ...existing,
        item_id: existing.item_id
      }, item)).catch(() => {});
      return err('Failed to update associated item. Sale update rolled back.', 500);
    }

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

    // Delete linked fee reconciliations, delete sale, and revert item status atomically
    const deleteReconStmt = env.DB.prepare(
      'DELETE FROM ebay_fee_reconciliations WHERE sale_id = ? AND user_id = ?'
    ).bind(id, payload.userId);

    const deleteSaleStmt = env.DB.prepare(
      'DELETE FROM auction_sales WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId);

    const revertItemStmt = env.DB.prepare(`
      UPDATE auction_items SET
        status = CASE WHEN date_listed IS NOT NULL AND date_listed != '' THEN 'Listed' ELSE 'Available' END,
        actual_sell_price = NULL,
        date_sold = NULL,
        days_on_market = NULL,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(existing.item_id, payload.userId);

    try {
      if (typeof env.DB.batch === 'function') {
        await env.DB.batch([deleteReconStmt, deleteSaleStmt, revertItemStmt]);
      } else {
        await deleteReconStmt.run();
        await deleteSaleStmt.run();
        await revertItemStmt.run();
      }
    } catch (delErr) {
      console.error('[sales] Failed to delete sale and revert item status:', delErr);
      return err('Failed to delete sale. Database state preserved.', 500);
    }

    return ok({ success: true, message: 'Sale deleted and item status reverted' });
  });
}
