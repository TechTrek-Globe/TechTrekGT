import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * POST /api/ebay/reconcile
 *
 * Fetches actual eBay fee data from the Finances API (via landing gateway)
 * and inserts/updates an ebay_fee_reconciliations row.
 *
 * Body: { sale_id, ebay_order_id }
 *
 * Flow:
 *   1. Validate JWT + fetch auction_sales row
 *   2. Call gateway GET /api/ebay/finances?order_id=<ebayOrderId>
 *   3. Parse fee breakdown
 *   4. UPSERT ebay_fee_reconciliations
 *   5. UPDATE auction_sales.fee_reconciled_at
 *   6. Return { reconciled, fee_delta, reconciled_net_profit }
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const { sale_id, ebay_order_id } = body;

    if (!sale_id) return err('sale_id is required', 400);
    if (!ebay_order_id) return err('ebay_order_id is required', 400);

    // Verify sale ownership
    const sale = await env.DB.prepare(
      'SELECT * FROM auction_sales WHERE id = ? AND user_id = ?'
    ).bind(sale_id, payload.userId).first();

    if (!sale) return err('Sale not found', 404);

    const gatewayBase = env.GATEWAY_URL || 'https://techtrekgt.com';

    // Call Finances API via landing gateway
    const finRes = await fetch(
      `${gatewayBase}/api/ebay/finances?order_id=${encodeURIComponent(ebay_order_id)}`,
      {
        headers: {
          Cookie: request.headers.get('Cookie') || '',
          Origin: 'https://techtrekgt.com'
        }
      }
    );

    const finJson = await finRes.json().catch(() => ({}));

    if (!finRes.ok) {
      const msg = finJson.error || `Finances API error ${finRes.status}`;
      // 403 = scope not approved - return a structured pending response
      if (finRes.status === 403) {
        return ok({
          reconciled: false,
          pending_scope_approval: true,
          message: msg
        });
      }
      return err(msg, finRes.status);
    }

    const fees = finJson.data || finJson;
    const estimatedFees = parseFloat(sale.platform_fees_amt || 0);
    const actualFees = parseFloat(fees.total_ebay_fees || 0);
    const feeDelta = parseFloat((actualFees - estimatedFees).toFixed(4));

    // Reconciled net profit = gross - shipping - true_cost - actual_fees
    const gross = parseFloat(sale.gross_sale_price || 0);
    const shipping = parseFloat(sale.actual_shipping_cost || 0);
    const trueCost = parseFloat(sale.true_total_cost || 0);
    const reconciledNetProfit = parseFloat((gross - shipping - trueCost - actualFees).toFixed(4));

    const reconId = `recon-${crypto.randomUUID()}`;

    await env.DB.prepare(`
      INSERT INTO ebay_fee_reconciliations (
        id, sale_id, user_id, ebay_order_id,
        final_value_fee, promoted_listing_fee, shipping_label_cost,
        payment_processing_fee, regulatory_fee,
        total_ebay_fees, estimated_fees, fee_delta, reconciled_net_profit,
        promoted_listing_rate, promoted_listing_active, finances_api_raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sale_id) DO UPDATE SET
        ebay_order_id          = excluded.ebay_order_id,
        final_value_fee        = excluded.final_value_fee,
        promoted_listing_fee   = excluded.promoted_listing_fee,
        shipping_label_cost    = excluded.shipping_label_cost,
        payment_processing_fee = excluded.payment_processing_fee,
        regulatory_fee         = excluded.regulatory_fee,
        total_ebay_fees        = excluded.total_ebay_fees,
        estimated_fees         = excluded.estimated_fees,
        fee_delta              = excluded.fee_delta,
        reconciled_net_profit  = excluded.reconciled_net_profit,
        promoted_listing_rate  = excluded.promoted_listing_rate,
        promoted_listing_active = excluded.promoted_listing_active,
        finances_api_raw       = excluded.finances_api_raw,
        reconciled_at          = datetime('now')
    `).bind(
      reconId, sale_id, payload.userId, ebay_order_id,
      fees.final_value_fee || 0,
      fees.promoted_listing_fee || 0,
      fees.shipping_label_cost || 0,
      fees.payment_processing_fee || 0,
      fees.regulatory_fee || 0,
      actualFees, estimatedFees, feeDelta, reconciledNetProfit,
      fees.promoted_listing_rate || null,
      fees.promoted_listing_active ? 1 : 0,
      JSON.stringify(fees.raw || []).slice(0, 65535)
    ).run();

    // Stamp the sale row
    await env.DB.prepare(
      'UPDATE auction_sales SET fee_reconciled_at = datetime(\'now\'), ebay_order_id = ? WHERE id = ?'
    ).bind(ebay_order_id, sale_id).run();

    return ok({
      reconciled: true,
      sale_id,
      ebay_order_id,
      fee_breakdown: {
        final_value_fee: fees.final_value_fee,
        promoted_listing_fee: fees.promoted_listing_fee,
        shipping_label_cost: fees.shipping_label_cost,
        payment_processing_fee: fees.payment_processing_fee,
        regulatory_fee: fees.regulatory_fee,
        total_ebay_fees: actualFees
      },
      estimated_fees: estimatedFees,
      fee_delta: feeDelta,
      reconciled_net_profit: reconciledNetProfit,
      promoted_listing_active: fees.promoted_listing_active,
      promoted_listing_rate: fees.promoted_listing_rate
    });
  });
}
