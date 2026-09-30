import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computeSaleMetrics } from '../../utils/auction.js';
import { getEbayUserToken, fetchEbayOrderFinances, buildFinancesSummary } from './tokenHelper.js';

/**
 * POST /api/ebay/reconcile
 *
 * Fetches actual eBay fee data via direct Finances API call using tokenHelper
 * and inserts/updates an ebay_fee_reconciliations row in D1.
 *
 * Body: { sale_id, ebay_order_id }
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

    // Retrieve eBay access token directly via tokenHelper (eliminates server-to-server gateway loopback)
    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, payload.userId);
    } catch (e) {
      console.error('[reconcile] eBay authentication failed:', e);
      if (e?.statusCode === 503) return err(e.message, 503);
      const msg = e.message || '';
      if (msg.includes('not connected') || msg.includes('expired')) {
        return err('eBay account not connected or session expired. Please connect your eBay account.', 401);
      }
      return err('eBay authentication failed. Please try reconnecting your account.', 401);
    }

    let finData;
    try {
      finData = await fetchEbayOrderFinances(env, accessToken, ebay_order_id);
    } catch (e) {
      console.error('[reconcile] eBay finances fetch failed:', e);
      return err('Failed to retrieve fee data from eBay Finances API. Please try again.', 502);
    }

    if (!finData || !finData.finances_available) {
      if (finData?.pending_scope_approval) {
        return ok({
          reconciled: false,
          pending_scope_approval: true,
          message: 'eBay Finances API access requires sell.finances scope approval on developer.ebay.com.'
        });
      }
      return err(finData?.error || 'Failed to retrieve fee data from eBay Finances API', 502);
    }

    const finalValueFee = finData.final_value_fee || 0;
    const promotedListingFee = finData.promoted_listing_fee || 0;
    const shippingLabelCost = finData.shipping_label_cost || 0;
    const paymentProcessingFee = finData.payment_processing_fee || 0;
    const regulatoryFee = finData.regulatory_fee || 0;
    const promotedListingRate = finData.promoted_listing_rate ?? null;
    const promotedListingActive = finData.promoted_listing_active || false;
    const transactions = finData.raw || [];

    const actualFees = parseFloat((finalValueFee + promotedListingFee + shippingLabelCost + paymentProcessingFee + regulatoryFee).toFixed(2));
    const estimatedFees = parseFloat(sale.platform_fees_amt || 0);
    const feeDelta = parseFloat((actualFees - estimatedFees).toFixed(4));

    // Reconciled net profit = gross - shipping - true_cost - actual_fees
    const gross = parseFloat(sale.gross_sale_price || finData.gross_sale_amount || 0);
    const shipping = parseFloat(sale.actual_shipping_cost || shippingLabelCost || 0);
    const trueCost = parseFloat(sale.true_total_cost || 0);
    const buyerShipping = parseFloat(sale.buyer_shipping_paid || 0);
    const netProceeds = parseFloat((gross + buyerShipping - actualFees).toFixed(2));

    // T-09 item 2: roi_pct comes only from computeSaleMetrics, as a FRACTION.
    // The previous inline `ROUND(? / true_total_cost, 4)` was already a fraction
    // but lived outside the single metrics path, which is how the units drifted
    // in the first place. net_proceeds is passed explicitly, so the metrics
    // derive net_profit and roi_pct from the same reconciled inputs.
    const reconciledMetrics = computeSaleMetrics({
      gross_sale_price: gross,
      buyer_shipping_paid: buyerShipping,
      actual_shipping_cost: shipping,
      platform_fee_pct: 0,
      platform_flat_fee: 0,
      payment_processing_amt: paymentProcessingFee,
      promoted_listing_fee: promotedListingFee,
      net_proceeds: netProceeds,
      true_total_cost: trueCost
    });
    const reconciledNetProfit = reconciledMetrics.net_profit;
    const reconciledRoi = reconciledMetrics.roi_pct;

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
      finalValueFee,
      promotedListingFee,
      shippingLabelCost,
      paymentProcessingFee,
      regulatoryFee,
      actualFees, estimatedFees, feeDelta, reconciledNetProfit,
      promotedListingRate,
      promotedListingActive ? 1 : 0,
      buildFinancesSummary(transactions)
    ).run();

    // Stamp the sale row with reconciled fees, net proceeds, and profit
    await env.DB.prepare(`
      UPDATE auction_sales SET
        fee_reconciled_at = datetime('now'),
        ebay_order_id = ?,
        platform_fees_amt = ?,
        payment_processing_amt = ?,
        promoted_listing_fee = ?,
        actual_shipping_cost = CASE WHEN ? > 0 THEN ? ELSE actual_shipping_cost END,
        net_proceeds = ?,
        net_profit = ?,
        roi_pct = CASE WHEN true_total_cost > 0 THEN ? ELSE roi_pct END
      WHERE id = ? AND user_id = ?
    `).bind(
      ebay_order_id,
      parseFloat((finalValueFee + regulatoryFee).toFixed(2)),
      paymentProcessingFee,
      promotedListingFee,
      shippingLabelCost, shippingLabelCost,
      netProceeds,
      reconciledNetProfit,
      // T-09: the fraction from computeSaleMetrics. The CASE still preserves the
      // stored value when cost is 0, since ROI is undefined there.
      reconciledRoi,
      sale_id,
      payload.userId
    ).run();

    return ok({
      reconciled: true,
      sale_id,
      ebay_order_id,
      fee_breakdown: {
        final_value_fee: finalValueFee,
        promoted_listing_fee: promotedListingFee,
        shipping_label_cost: shippingLabelCost,
        payment_processing_fee: paymentProcessingFee,
        regulatory_fee: regulatoryFee,
        total_ebay_fees: actualFees
      },
      estimated_fees: estimatedFees,
      fee_delta: feeDelta,
      reconciled_net_profit: reconciledNetProfit,
      promoted_listing_active: promotedListingActive,
      promoted_listing_rate: promotedListingRate
    });
  });
}
