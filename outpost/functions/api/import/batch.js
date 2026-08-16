import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computeSaleMetrics, computePricingFloors } from '../../utils/auction.js';

/**
 * Handles batch import of spreadsheet data for the authenticated user.
 * Supports strategy: 'replace' (deletes previous auction data for this user) or 'append'.
 *
 * @param {{ request: Request, env: Record<string, any> }} context
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const body = await request.json().catch(() => ({}));
    const { strategy = 'append', invoices = [], items = [], sales = [], comps = [] } = body;

    // Run within a batch
    const statements = [];

    if (strategy === 'replace') {
      statements.push(
        env.DB.prepare('DELETE FROM auction_sales WHERE user_id = ?').bind(userId),
        env.DB.prepare('DELETE FROM auction_comps WHERE user_id = ?').bind(userId),
        env.DB.prepare('DELETE FROM auction_items WHERE user_id = ?').bind(userId),
        env.DB.prepare('DELETE FROM auction_invoices WHERE user_id = ?').bind(userId)
      );
    }

    // Process Invoices
    const invoiceMap = new Map(); // invoice_ref -> id
    for (const inv of invoices) {
      const invId = inv.id || `inv-${crypto.randomUUID()}`;
      const ref = String(inv.invoice_ref || 'Default').trim();
      invoiceMap.set(ref, invId);

      statements.push(
        env.DB.prepare(`
          INSERT INTO auction_invoices (
            id, user_id, invoice_ref, description, base_total, discount, shipping, tax, date_acquired, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            invoice_ref = excluded.invoice_ref,
            description = excluded.description,
            base_total = excluded.base_total,
            discount = excluded.discount,
            shipping = excluded.shipping,
            tax = excluded.tax,
            date_acquired = excluded.date_acquired
        `).bind(
          invId,
          userId,
          ref,
          inv.description || null,
          Number(inv.base_total) || 0,
          Number(inv.discount) || 0,
          Number(inv.shipping) || 0,
          Number(inv.tax) || 0,
          inv.date_acquired || null
        )
      );
    }

    // Process Items
    const itemMap = new Map(); // item_name or id -> id
    for (const itm of items) {
      const itemId = itm.id || `item-${crypto.randomUUID()}`;
      let invId = itm.invoice_id;
      if (!invId && itm.invoice_ref && invoiceMap.has(String(itm.invoice_ref).trim())) {
        invId = invoiceMap.get(String(itm.invoice_ref).trim());
      }
      if (!invId) {
        // Create an ad-hoc invoice if not present
        invId = `inv-${crypto.randomUUID()}`;
        const ref = String(itm.invoice_ref || 'Imported').trim();
        invoiceMap.set(ref, invId);
        statements.push(
          env.DB.prepare(`
            INSERT INTO auction_invoices (id, user_id, invoice_ref, description, base_total, discount, shipping, tax, date_acquired)
            VALUES (?, ?, ?, 'Imported batch', ?, 0, 0, 0, ?)
          `).bind(invId, userId, ref, Number(itm.unit_price) || 0, itm.date_acquired || null)
        );
      }

      itemMap.set(itm.item_name, itemId);
      itemMap.set(itemId, itemId);

      const unitPrice = Number(itm.unit_price) || 0;
      const trueCost = Number(itm.true_total_cost) || unitPrice;
      const feePct = Number(itm.platform_fee_pct) || 0.136;
      const flatFee = Number(itm.platform_flat_fee) || 0.40;
      const estShip = Number(itm.est_shipping_cost) || 6.50;
      const boostPct = Number(itm.boost_pct) || 0;
      const targetMargin = Number(itm.target_margin_pct) || 0.30;
      const floors = computePricingFloors({
        true_total_cost: trueCost,
        est_shipping_cost: estShip,
        platform_fee_pct: feePct,
        platform_flat_fee: flatFee,
        boost_pct: boostPct,
        target_margin_pct: targetMargin
      });
      const minSell = Number(itm.min_sell_price) || floors.min_sell_price;
      const suggestedList = Number(itm.suggested_list_price) || floors.suggested_list_price;

      statements.push(
        env.DB.prepare(`
          INSERT INTO auction_items (
            id, user_id, invoice_id, item_name, category, sport_genre, athlete_person,
            authenticator, cert_number, unit_price, item_base_total, proration_weight,
            prorated_discount, prorated_shipping, prorated_tax, true_total_cost, status,
            platform, platform_fee_pct, platform_flat_fee, est_shipping_cost, boost_pct,
            min_sell_price, suggested_list_price, current_list_price, actual_sell_price,
            target_margin_pct, date_acquired, date_listed, date_sold, days_on_market,
            notes, best_listing_window, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, datetime('now'), datetime('now')
          )
          ON CONFLICT(id) DO UPDATE SET
            item_name = excluded.item_name,
            category = excluded.category,
            sport_genre = excluded.sport_genre,
            athlete_person = excluded.athlete_person,
            authenticator = excluded.authenticator,
            cert_number = excluded.cert_number,
            unit_price = excluded.unit_price,
            true_total_cost = excluded.true_total_cost,
            status = excluded.status,
            current_list_price = excluded.current_list_price,
            updated_at = datetime('now')
        `).bind(
          itemId,
          userId,
          invId,
          itm.item_name,
          itm.category || 'Memorabilia',
          itm.sport_genre || null,
          itm.athlete_person || null,
          itm.authenticator || null,
          itm.cert_number || null,
          unitPrice,
          Number(itm.item_base_total) || unitPrice,
          Number(itm.proration_weight) || 0,
          Number(itm.prorated_discount) || 0,
          Number(itm.prorated_shipping) || 0,
          Number(itm.prorated_tax) || 0,
          trueCost,
          itm.status || 'Available',
          itm.platform || 'eBay',
          feePct,
          flatFee,
          estShip,
          boostPct,
          minSell,
          suggestedList,
          itm.current_list_price !== undefined && itm.current_list_price !== null ? Number(itm.current_list_price) : null,
          itm.actual_sell_price !== undefined && itm.actual_sell_price !== null ? Number(itm.actual_sell_price) : null,
          targetMargin,
          itm.date_acquired || null,
          itm.date_listed || null,
          itm.date_sold || null,
          itm.days_on_market !== undefined ? Number(itm.days_on_market) : null,
          itm.notes || null,
          itm.best_listing_window || null
        )
      );
    }

    // Process Sales
    for (const sale of sales) {
      const saleId = sale.id || `sale-${crypto.randomUUID()}`;
      let itemId = sale.item_id;
      if (!itemId && sale.item_name && itemMap.has(sale.item_name)) {
        itemId = itemMap.get(sale.item_name);
      }
      if (!itemId) continue;

      const gross = Number(sale.gross_sale_price) || 0;
      const buyerShip = Number(sale.buyer_shipping_paid) || 0;
      const actualShip = Number(sale.actual_shipping_cost) || 0;
      const feePct = Number(sale.platform_fee_pct) || 0.136;
      const flatFee = Number(sale.platform_flat_fee) || 0.40;
      const processing = Number(sale.payment_processing_amt) || 0;
      const promoted = Number(sale.promoted_listing_fee) || 0;
      const trueCost = Number(sale.true_total_cost) || 0;

      const metrics = computeSaleMetrics({
        gross_sale_price: gross,
        buyer_shipping_paid: buyerShip,
        actual_shipping_cost: actualShip,
        platform_fee_pct: feePct,
        platform_flat_fee: flatFee,
        payment_processing_amt: processing,
        promoted_listing_fee: promoted,
        true_total_cost: trueCost
      });

      statements.push(
        env.DB.prepare(`
          INSERT INTO auction_sales (
            id, user_id, item_id, sale_date, platform, buyer_handle,
            gross_sale_price, buyer_shipping_paid, actual_shipping_cost,
            platform_fee_pct, platform_flat_fee, platform_fees_amt,
            payment_processing_amt, promoted_listing_fee, net_proceeds,
            true_total_cost, net_profit, roi_pct, days_to_sell, created_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, datetime('now')
          )
          ON CONFLICT(id) DO UPDATE SET
            sale_date = excluded.sale_date,
            gross_sale_price = excluded.gross_sale_price,
            net_proceeds = excluded.net_proceeds,
            net_profit = excluded.net_profit,
            roi_pct = excluded.roi_pct
        `).bind(
          saleId,
          userId,
          itemId,
          sale.sale_date || new Date().toISOString().split('T')[0],
          sale.platform || 'eBay',
          sale.buyer_handle || null,
          gross,
          buyerShip,
          actualShip,
          feePct,
          flatFee,
          metrics.platform_fees_amt,
          processing,
          promoted,
          metrics.net_proceeds,
          trueCost,
          metrics.net_profit,
          metrics.roi_pct,
          sale.days_to_sell !== undefined ? Number(sale.days_to_sell) : null
        )
      );

      // Also set item status to Sold
      statements.push(
        env.DB.prepare(`
          UPDATE auction_items
          SET status = 'Sold', date_sold = ?, actual_sell_price = ?, updated_at = datetime('now')
          WHERE id = ? AND user_id = ?
        `).bind(sale.sale_date || new Date().toISOString().split('T')[0], gross, itemId, userId)
      );
    }

    // Process Comps
    for (const comp of comps) {
      let itemId = comp.item_id;
      if (!itemId && comp.item_name && itemMap.has(comp.item_name)) {
        itemId = itemMap.get(comp.item_name);
      }
      if (!itemId) continue;

      const compId = comp.id || `comp-${crypto.randomUUID()}`;
      const c1 = comp.comp_1 !== undefined && comp.comp_1 !== null ? Number(comp.comp_1) : null;
      const c2 = comp.comp_2 !== undefined && comp.comp_2 !== null ? Number(comp.comp_2) : null;
      const c3 = comp.comp_3 !== undefined && comp.comp_3 !== null ? Number(comp.comp_3) : null;
      const valid = [c1, c2, c3].filter(v => v !== null && !isNaN(v) && v > 0);
      const manualAvg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;

      statements.push(
        env.DB.prepare(`
          INSERT INTO auction_comps (
            id, item_id, user_id, comp_1, comp_2, comp_3, manual_avg, live_avg, ebay_search_url, recommended_list_price, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            comp_1 = excluded.comp_1,
            comp_2 = excluded.comp_2,
            comp_3 = excluded.comp_3,
            manual_avg = excluded.manual_avg,
            recommended_list_price = excluded.recommended_list_price,
            updated_at = datetime('now')
        `).bind(
          compId,
          itemId,
          userId,
          c1,
          c2,
          c3,
          manualAvg,
          comp.live_avg !== undefined && comp.live_avg !== null ? Number(comp.live_avg) : null,
          comp.ebay_search_url || null,
          comp.recommended_list_price !== undefined ? Number(comp.recommended_list_price) : manualAvg
        )
      );
    }

    if (statements.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
        await env.DB.batch(statements.slice(i, i + CHUNK_SIZE));
      }
    }

    return ok({
      success: true,
      imported: {
        invoices: invoices.length,
        items: items.length,
        sales: sales.length,
        comps: comps.length
      }
    });
  });
}
