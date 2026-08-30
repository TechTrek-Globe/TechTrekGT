import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, fetchEbayActiveSellerListings, calculateEbayCategoryFees } from './tokenHelper.js';
import { computePricingFloors } from '../../utils/auction.js';

/**
 * POST /api/ebay/sync-all
 *
 * Batch synchronizes all inventory items mapped to an eBay listing.
 * Pulls all active seller listings and updates prices, dates, category fees, shipping, and statuses across the catalog.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const rows = await env.DB.prepare(`
      SELECT * FROM auction_items
      WHERE user_id = ? AND ebay_listing_id IS NOT NULL AND ebay_listing_id != ''
    `).bind(payload.userId).all();

    const items = rows.results || [];
    if (items.length === 0) {
      return ok({
        success: true,
        message: 'No linked eBay items found in inventory.',
        total_linked: 0,
        updated_count: 0
      });
    }

    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, payload.userId);
    } catch (e) {
      return err(`eBay authentication failed: ${e.message}`, 401);
    }

    const liveListings = await fetchEbayActiveSellerListings(env, accessToken);
    const listingMap = new Map();
    liveListings.forEach(l => {
      if (l.listing_id) listingMap.set(String(l.listing_id), l);
      if (l.sku) listingMap.set(String(l.sku), l);
    });

    let updatedCount = 0;

    for (const item of items) {
      const match = listingMap.get(String(item.ebay_listing_id));
      if (match) {
        const targetCost = item.true_total_cost != null ? item.true_total_cost : (item.unit_price || 0);
        const boostPct = item.ebay_promoted_rate > 0 ? item.ebay_promoted_rate / 100 : (item.boost_pct || 0);

        const feeStructure = calculateEbayCategoryFees(match.category_id, match.category_name || match.title, match.price || 0);
        const platformFeePct = feeStructure.fee_pct;
        const platformFlatFee = feeStructure.flat_fee;

        let estShippingCost = item.est_shipping_cost || 0;
        if (match.is_free_shipping === false) {
          estShippingCost = 0.00;
        } else if (match.is_free_shipping === true && (!estShippingCost || estShippingCost === 0)) {
          estShippingCost = 4.50;
        }

        const pricing = computePricingFloors({
          true_total_cost: targetCost,
          est_shipping_cost: estShippingCost,
          platform_flat_fee: platformFlatFee,
          platform_fee_pct: platformFeePct,
          boost_pct: boostPct,
          target_margin_pct: item.target_margin_pct || 0.20
        });

        const newPrice = match.price > 0 ? match.price : item.current_list_price;
        const newStatus = match.status === 'Completed' ? 'Sold' : 'Listed';

        await env.DB.prepare(`
          UPDATE auction_items SET
            current_list_price = ?,
            status = ?,
            platform = 'eBay',
            platform_fee_pct = ?,
            platform_flat_fee = ?,
            est_shipping_cost = ?,
            min_sell_price = ?,
            suggested_list_price = ?,
            updated_at = datetime('now')
          WHERE id = ? AND user_id = ?
        `).bind(
          newPrice,
          newStatus,
          platformFeePct,
          platformFlatFee,
          estShippingCost,
          pricing.min_sell_price,
          pricing.suggested_list_price,
          item.id,
          payload.userId
        ).run();

        updatedCount++;
      }
    }

    // Stamp last_refreshed_at on success
    await env.DB.prepare(
      `UPDATE ebay_oauth_tokens SET last_refreshed_at = datetime('now') WHERE user_id = ?`
    ).bind(payload.userId).run().catch(() => {});

    return ok({
      success: true,
      message: `Successfully synchronized ${updatedCount} of ${items.length} linked items with eBay.`,
      total_linked: items.length,
      updated_count: updatedCount
    });
  });
}
