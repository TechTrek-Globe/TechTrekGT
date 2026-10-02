import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { cleanItemName, daysBetween, validateNonNegativeMoney, markItemSold } from '../../utils/auction.js';

/**
 * GET /api/sync/vinescout-catalog
 * Returns all synced VineScout / Amazon Vine items for the user to browse and link.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const query = `
      SELECT 
        i.id,
        i.item_name,
        i.sku,
        i.status,
        i.unit_price,
        i.true_total_cost,
        i.current_list_price,
        i.notes,
        i.attributes,
        v.invoice_ref
      FROM auction_items i
      LEFT JOIN auction_invoices v ON i.invoice_id = v.id
      WHERE i.user_id = ?
        AND (
          v.invoice_ref LIKE 'AMAZON-%'
          OR i.notes LIKE '%ASIN:%'
          OR i.notes LIKE '%B0%'
          OR i.attributes LIKE '%asin%'
          OR i.attributes LIKE '%amazon%'
          OR i.attributes LIKE '%vinescout%'
        )
      ORDER BY i.created_at DESC
      LIMIT 250
    `;

    const { results } = await env.DB.prepare(query).bind(payload.userId).all();

    const catalog = (results || []).map(row => {
      let asin = null;
      let orderId = null;
      let etv = null;
      let taxCost = null;
      let imageUrl = null;

      if (row.attributes) {
        try {
          const parsed = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
          if (parsed && typeof parsed === 'object') {
            if (parsed.asin) asin = String(parsed.asin).trim().toUpperCase();
            if (parsed.order_id) orderId = String(parsed.order_id).trim();
            if (parsed.etv != null) etv = Number(parsed.etv);
            if (parsed.tax_cost != null) taxCost = Number(parsed.tax_cost);
            if (Array.isArray(parsed.image_urls) && parsed.image_urls.length > 0) {
              imageUrl = parsed.image_urls[0];
            } else if (parsed.image_url) {
              imageUrl = parsed.image_url;
            }
          }
        } catch (_) {}
      }

      if (!asin && row.notes) {
        const mAsin = row.notes.match(/\b(B0[A-Z0-9]{8})\b/i);
        if (mAsin) asin = mAsin[1].toUpperCase();
      }
      if (!orderId && row.notes) {
        const mOrder = row.notes.match(/\b(\d{3}-\d{7}-\d{7})\b/);
        if (mOrder) orderId = mOrder[1];
      }
      if (!asin && row.invoice_ref) {
        const mInv = row.invoice_ref.match(/AMAZON-([A-Z0-9]{10})/i);
        if (mInv) asin = mInv[1].toUpperCase();
      }

      if (!imageUrl && row.notes) {
        const mImg = row.notes.match(/\bImage:\s*(https?:\/\/[^\s|]+)/i);
        if (mImg) imageUrl = mImg[1].trim();
      }

      return {
        id: row.id,
        item_name: cleanItemName(row.item_name),
        sku: row.sku,
        asin: asin,
        order_id: orderId,
        etv: etv,
        tax_cost: taxCost !== null ? taxCost : row.unit_price,
        status: row.status,
        current_list_price: row.current_list_price,
        image_url: imageUrl
      };
    });

    return ok({ items: catalog });
  });
}

/**
 * POST /api/sync/vinescout-catalog
 * Body: { item_id, sale_price, sale_date, ebay_order_id }
 * Writes eBay sale metadata back into auction_items.attributes for VScout-sourced items.
 * Called server-side by sync-all.js and optionally by the browser after a manual sale log.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { item_id, sale_price, sale_date, ebay_order_id } = body;
    if (!item_id) return err('item_id is required', 400);

    let parsedSalePrice = null;
    if (sale_price != null) {
      try {
        parsedSalePrice = validateNonNegativeMoney(sale_price, 'sale_price');
      } catch (e) {
        return err(e.message, 400);
      }
    }

    const row = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(item_id, userId).first();

    if (!row) return err('Item not found or does not belong to this account', 404);

    let attrs = {};
    if (row.attributes) {
      try {
        attrs = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
      } catch (_) {}
    }

    // Verify item is VScout-sourced before writing back
    if (!attrs.asin && !attrs.order_id) {
      return err('Item does not appear to be VScout-sourced (no ASIN or order_id in attributes)', 400);
    }

    if (parsedSalePrice == null) {
      try {
        parsedSalePrice = validateNonNegativeMoney(row.actual_sell_price ?? row.current_list_price ?? 0, 'actual_sell_price');
      } catch (_) {
        parsedSalePrice = 0;
      }
    }

    const finalSaleDate = sale_date ? String(sale_date) : (row.date_sold || new Date().toISOString().split('T')[0]);
    const daysOnMarket = daysBetween(row.date_listed || row.date_acquired, finalSaleDate) ?? 0;

    // Merge sale metadata
    attrs.outpost_liquidated = 1;
    if (sale_price != null) {
      try {
        attrs.sale_price = validateNonNegativeMoney(sale_price, 'sale_price');
      } catch (e) {
        return err(e.message, 400);
      }
    } else if (parsedSalePrice != null) {
      attrs.sale_price = parsedSalePrice;
    }
    if (finalSaleDate) attrs.sold_at = String(finalSaleDate);
    if (ebay_order_id) attrs.ebay_order_id = String(ebay_order_id);

    await env.DB.prepare(`
      UPDATE auction_items SET
        status = 'Sold',
        actual_sell_price = ?,
        date_sold = ?,
        days_on_market = ?,
        attributes = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      parsedSalePrice,
      finalSaleDate,
      daysOnMarket,
      JSON.stringify(attrs),
      item_id,
      userId
    ).run();

    try {
      await markItemSold(env, userId, row, {
        sale_date: finalSaleDate,
        gross_sale_price: parsedSalePrice,
        ebay_order_id: ebay_order_id ? String(ebay_order_id) : null,
        days_to_sell: daysOnMarket
      });
    } catch (saleErr) {
      console.error('[vinescout-catalog] Failed to record sale in Sold Tracker, reverting item:', saleErr);
      await env.DB.prepare(`
        UPDATE auction_items SET
          status = ?,
          actual_sell_price = ?,
          date_sold = ?,
          days_on_market = ?,
          attributes = ?,
          updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(
        row.status,
        row.actual_sell_price,
        row.date_sold,
        row.days_on_market,
        row.attributes,
        item_id,
        userId
      ).run().catch(() => {});
      return err('Failed to record sale in Sold Tracker. Item state restored.', 500);
    }

    return ok({ success: true, item_id });
  });
}
