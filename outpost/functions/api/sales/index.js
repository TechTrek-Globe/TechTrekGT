import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computeSaleMetrics, daysBetween, validateNonNegativeMoney } from '../../utils/auction.js';

// ============================================================
// GET  /api/sales - list all sales with aggregates & item joins
// POST /api/sales - record a new sale and mark item as Sold
// ============================================================

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') || '';
    const q = url.searchParams.get('q') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;

    const conditions = ['s.user_id = ?'];
    const bindings = [payload.userId];

    if (platform) {
      conditions.push('s.platform = ?');
      bindings.push(platform);
    }
    if (q) {
      conditions.push('(i.item_name LIKE ? OR i.athlete_person LIKE ? OR s.buyer_handle LIKE ?)');
      const like = `%${q}%`;
      bindings.push(like, like, like);
    }

    const whereClause = conditions.join(' AND ');

    // Aggregate statistics across all matching sales
    const aggRow = await env.DB.prepare(`
      SELECT
        COUNT(s.id) AS total_count,
        COALESCE(SUM(s.gross_sale_price), 0) AS total_gross,
        COALESCE(SUM(s.net_proceeds), 0) AS total_net_proceeds,
        COALESCE(SUM(s.true_total_cost), 0) AS total_cost,
        COALESCE(SUM(s.net_profit), 0) AS total_net_profit,
        COALESCE(AVG(s.days_to_sell), 0) AS avg_days_to_sell
      FROM auction_sales s
      JOIN auction_items i ON i.id = s.item_id
      WHERE ${whereClause}
    `).bind(...bindings).first();

    const count = aggRow?.total_count || 0;
    const totalCost = aggRow?.total_cost || 0;
    const totalProfit = aggRow?.total_net_profit || 0;
    const blendedRoi = totalCost > 0 ? totalProfit / totalCost : 0;

    const rows = await env.DB.prepare(`
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
        i.ebay_listing_id,
        i.attributes,
        i.notes,
        i.sku,
        inv.invoice_ref,
        inv.base_total AS invoice_subtotal,
        inv.shipping AS invoice_shipping,
        inv.tax AS invoice_tax,
        inv.discount AS invoice_discount,
        fr.total_ebay_fees,
        fr.reconciled_net_profit,
        fr.fee_delta,
        fr.promoted_listing_active,
        fr.reconciled_at AS fee_reconciled_at
      FROM auction_sales s
      JOIN auction_items i ON i.id = s.item_id
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      LEFT JOIN ebay_fee_reconciliations fr ON fr.sale_id = s.id
      WHERE ${whereClause}
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    return ok({
      sales: rows.results || [],
      summary: {
        total_count: count,
        total_gross: aggRow?.total_gross || 0,
        total_net_proceeds: aggRow?.total_net_proceeds || 0,
        total_cost: totalCost,
        total_net_profit: totalProfit,
        blended_roi: blendedRoi,
        avg_days_to_sell: Math.round(aggRow?.avg_days_to_sell || 0)
      },
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    });
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json();
    const {
      item_id,
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
      net_proceeds,
      net_earnings,
      ebay_order_id
    } = body;

    if (!item_id) return err('item_id is required');
    if (!sale_date) return err('sale_date is required');
    if (!platform) return err('platform is required');

    let vGrossSalePrice;
    let bShippingPaid;
    let aShippingCost;
    let pProcessingAmt;
    let pListingFee;
    let feePct;
    let flatFee;
    let directNetProceeds;

    try {
      vGrossSalePrice = validateNonNegativeMoney(gross_sale_price, 'gross_sale_price');
      if (vGrossSalePrice === null) {
        return err('Valid gross_sale_price is required', 400);
      }
      bShippingPaid = validateNonNegativeMoney(buyer_shipping_paid, 'buyer_shipping_paid') ?? 0;
      aShippingCost = validateNonNegativeMoney(actual_shipping_cost, 'actual_shipping_cost') ?? 0;
      pProcessingAmt = validateNonNegativeMoney(payment_processing_amt, 'payment_processing_amt') ?? 0;
      pListingFee = validateNonNegativeMoney(promoted_listing_fee, 'promoted_listing_fee') ?? 0;
      if (platform_fee_pct !== undefined) {
        feePct = validateNonNegativeMoney(platform_fee_pct, 'platform_fee_pct');
      }
      if (platform_flat_fee !== undefined) {
        flatFee = validateNonNegativeMoney(platform_flat_fee, 'platform_flat_fee');
      }
      if (body.shipping_fee !== undefined) {
        validateNonNegativeMoney(body.shipping_fee, 'shipping_fee');
      }
      if (net_proceeds !== undefined) {
        directNetProceeds = validateNonNegativeMoney(net_proceeds, 'net_proceeds');
      } else if (net_earnings !== undefined) {
        directNetProceeds = validateNonNegativeMoney(net_earnings, 'net_earnings');
      }
    } catch (e) {
      return err(e.message, 400);
    }

    // Retrieve the item to get true_total_cost & dates
    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(item_id, payload.userId).first();

    if (!item) return err('Item not found', 404);

    // Platform fees defaults if not explicitly passed
    if (feePct == null || flatFee == null) {
      const plat = await env.DB.prepare(
        'SELECT fee_pct, flat_fee FROM auction_platforms WHERE user_id = ? AND name = ?'
      ).bind(payload.userId, platform).first();
      feePct = feePct ?? (plat?.fee_pct || 0);
      flatFee = flatFee ?? (plat?.flat_fee || 0);
    }

    const metrics = computeSaleMetrics({
      gross_sale_price: vGrossSalePrice,
      buyer_shipping_paid: bShippingPaid,
      actual_shipping_cost: aShippingCost,
      platform_fee_pct: feePct,
      platform_flat_fee: flatFee,
      payment_processing_amt: pProcessingAmt,
      promoted_listing_fee: pListingFee,
      net_proceeds: directNetProceeds,
      true_total_cost: item.true_total_cost
    });

    const startDate = item.date_listed || item.date_acquired;
    const daysToSell = daysBetween(startDate, sale_date) ?? 0;

    const existingSale = await env.DB.prepare(
      'SELECT id FROM auction_sales WHERE item_id = ? AND user_id = ?'
    ).bind(item_id, payload.userId).first();

    let saleId = existingSale?.id || `sale-${crypto.randomUUID()}`;

    try {
      if (existingSale) {
        await env.DB.prepare(`
          UPDATE auction_sales SET
            sale_date = ?,
            platform = ?,
            buyer_handle = COALESCE(?, buyer_handle),
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
            days_to_sell = ?,
            ebay_order_id = COALESCE(?, ebay_order_id)
          WHERE id = ? AND user_id = ?
        `).bind(
          sale_date, platform, buyer_handle || null,
          vGrossSalePrice, bShippingPaid, aShippingCost,
          feePct, flatFee, metrics.platform_fees_amt,
          pProcessingAmt, pListingFee,
          metrics.net_proceeds, item.true_total_cost, metrics.net_profit, metrics.roi_pct,
          daysToSell >= 0 ? daysToSell : 0,
          ebay_order_id || null,
          existingSale.id, payload.userId
        ).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO auction_sales (
            id, user_id, item_id, sale_date, platform, buyer_handle,
            gross_sale_price, buyer_shipping_paid, actual_shipping_cost,
            platform_fee_pct, platform_flat_fee, platform_fees_amt,
            payment_processing_amt, promoted_listing_fee,
            net_proceeds, true_total_cost, net_profit, roi_pct,
            days_to_sell, ebay_order_id
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?
          )
          ON CONFLICT(item_id) DO UPDATE SET
            sale_date = excluded.sale_date,
            platform = excluded.platform,
            buyer_handle = COALESCE(excluded.buyer_handle, auction_sales.buyer_handle),
            gross_sale_price = excluded.gross_sale_price,
            buyer_shipping_paid = excluded.buyer_shipping_paid,
            actual_shipping_cost = excluded.actual_shipping_cost,
            platform_fee_pct = excluded.platform_fee_pct,
            platform_flat_fee = excluded.platform_flat_fee,
            platform_fees_amt = excluded.platform_fees_amt,
            payment_processing_amt = excluded.payment_processing_amt,
            promoted_listing_fee = excluded.promoted_listing_fee,
            net_proceeds = excluded.net_proceeds,
            true_total_cost = excluded.true_total_cost,
            net_profit = excluded.net_profit,
            roi_pct = excluded.roi_pct,
            days_to_sell = excluded.days_to_sell,
            ebay_order_id = COALESCE(excluded.ebay_order_id, auction_sales.ebay_order_id)
        `).bind(
          saleId, payload.userId, item_id, sale_date, platform, buyer_handle || null,
          vGrossSalePrice, bShippingPaid, aShippingCost,
          feePct, flatFee, metrics.platform_fees_amt,
          pProcessingAmt, pListingFee,
          metrics.net_proceeds, item.true_total_cost, metrics.net_profit, metrics.roi_pct,
          daysToSell >= 0 ? daysToSell : 0,
          ebay_order_id || null
        ).run();
      }
    } catch (saleErr) {
      console.warn('[sales/index] Sale insert conflict, updating existing row:', saleErr);
      await env.DB.prepare(`
        UPDATE auction_sales SET
          sale_date = ?,
          platform = ?,
          buyer_handle = COALESCE(?, buyer_handle),
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
          days_to_sell = ?,
          ebay_order_id = COALESCE(?, ebay_order_id)
        WHERE item_id = ? AND user_id = ?
      `).bind(
        sale_date, platform, buyer_handle || null,
        vGrossSalePrice, bShippingPaid, aShippingCost,
        feePct, flatFee, metrics.platform_fees_amt,
        pProcessingAmt, pListingFee,
        metrics.net_proceeds, item.true_total_cost, metrics.net_profit, metrics.roi_pct,
        daysToSell >= 0 ? daysToSell : 0,
        ebay_order_id || null,
        item_id, payload.userId
      ).run();
    }

    if (!existingSale) {
      const persisted = await env.DB.prepare(
        'SELECT id FROM auction_sales WHERE item_id = ? AND user_id = ?'
      ).bind(item_id, payload.userId).first();
      if (persisted?.id) saleId = persisted.id;
    }

    // Update item status to Sold with sale metadata
    await env.DB.prepare(`
      UPDATE auction_items SET
        status = 'Sold',
        actual_sell_price = ?,
        date_sold = ?,
        days_on_market = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      gross_sale_price,
      sale_date,
      daysToSell >= 0 ? daysToSell : 0,
      item_id,
      payload.userId
    ).run();

    return ok({
      success: true,
      sale: {
        id: saleId,
        item_id,
        sale_date,
        platform,
        gross_sale_price,
        net_profit: metrics.net_profit,
        roi_pct: metrics.roi_pct,
        net_proceeds: metrics.net_proceeds,
        days_to_sell: daysToSell >= 0 ? daysToSell : 0
      }
    }, 201);
  });
}
