import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computePricingFloors, round2 } from '../../utils/auction.js';
import { chunkedBatch } from '../../utils/d1Batch.js';
import { getEbayUserToken, updateEbayListingPrice } from '../ebay/tokenHelper.js';

/**
 * POST /api/items/reprice-apply
 *
 * Applies batch markdown price revisions to items in Cloudflare D1.
 * Validates break-even floor protection on the server to prevent any negative-margin sale price.
 * Optionally synchronizes price revisions to active eBay listings via the eBay Trading API.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const candidateList = Array.isArray(body.items) ? body.items : [];

    if (candidateList.length === 0) {
      return err('No items provided for repricing', 400);
    }
    if (candidateList.length > 100) {
      return err('Cannot reprice more than 100 items per batch', 400);
    }

    // Try to resolve eBay access token if eBay syncing is requested
    let ebayAccessToken = null;
    try {
      ebayAccessToken = await getEbayUserToken(env, payload.userId);
    } catch (_) {
      // eBay not connected or expired - eBay sync will be skipped
    }

    const statements = [];
    const results = [];
    let updatedCount = 0;

    for (const entry of candidateList) {
      const itemId = String(entry.id || '').trim();
      if (!itemId) continue;

      const targetPrice = Number(entry.suggested_price);
      if (isNaN(targetPrice) || targetPrice <= 0) {
        results.push({ id: itemId, success: false, error: 'Invalid suggested price' });
        continue;
      }

      // 1. Fetch item from D1 to verify ownership & lock status
      const item = await env.DB.prepare(`
        SELECT id, user_id, current_list_price, original_list_price, true_total_cost,
               est_shipping_cost, platform_flat_fee, platform_fee_pct, boost_pct,
               ebay_promoted_rate, reprice_locked, ebay_listing_id, status
        FROM auction_items
        WHERE id = ? AND user_id = ?
      `).bind(itemId, payload.userId).first();

      if (!item) {
        results.push({ id: itemId, success: false, error: 'Item not found' });
        continue;
      }

      if (item.status !== 'Listed') {
        results.push({ id: itemId, success: false, error: 'Item is not actively listed' });
        continue;
      }

      if (item.reprice_locked) {
        results.push({ id: itemId, success: false, error: 'Item is locked against repricing' });
        continue;
      }

      // 2. Strict Server-Side Break-Even Floor Verification
      const floorCalc = computePricingFloors({
        true_total_cost: Number(item.true_total_cost || 0),
        est_shipping_cost: Number(item.est_shipping_cost || 0),
        platform_flat_fee: Number(item.platform_flat_fee || 0),
        platform_fee_pct: Number(item.platform_fee_pct || 0),
        boost_pct: Number(item.boost_pct ?? item.ebay_promoted_rate ?? 0),
        target_margin_pct: 0
      });
      const breakEvenFloor = floorCalc.min_sell_price ?? 0;

      // Ensure price is at or above break-even floor
      const safePrice = round2(Math.max(targetPrice, breakEvenFloor));
      const oldPrice = Number(item.current_list_price || 0);

      // 3. Prepare D1 update statement
      const originalPrice = item.original_list_price != null ? item.original_list_price : oldPrice;
      const repriceTier = entry.tier || null;

      statements.push(
        env.DB.prepare(`
          UPDATE auction_items SET
            current_list_price = ?,
            original_list_price = COALESCE(original_list_price, ?),
            last_repriced_at = datetime('now'),
            reprice_tier = ?,
            updated_at = datetime('now')
          WHERE id = ? AND user_id = ?
        `).bind(safePrice, originalPrice, repriceTier, itemId, payload.userId)
      );

      // 4. Optional eBay Sync
      let ebaySyncStatus = 'skipped';
      let ebayMessage = null;

      const shouldSyncEbay = Boolean(entry.sync_ebay !== false && item.ebay_listing_id && ebayAccessToken);
      if (shouldSyncEbay) {
        try {
          const ebayResult = await updateEbayListingPrice(env, ebayAccessToken, item.ebay_listing_id, safePrice);
          ebaySyncStatus = 'success';
          ebayMessage = ebayResult.message;
        } catch (ebayErr) {
          ebaySyncStatus = 'failed';
          ebayMessage = ebayErr.message || 'Failed to update eBay price';
          console.warn(`[reprice-apply] eBay price revision failed for item ${itemId} (listing ${item.ebay_listing_id}):`, ebayErr.message);
        }
      }

      results.push({
        id: itemId,
        success: true,
        old_price: oldPrice,
        new_price: safePrice,
        break_even_floor: breakEvenFloor,
        tier: repriceTier,
        ebay_listing_id: item.ebay_listing_id || null,
        ebay_sync_status: ebaySyncStatus,
        ebay_message: ebayMessage
      });
      updatedCount++;
    }

    // 5. Execute D1 updates in chunked batch
    if (statements.length > 0) {
      await chunkedBatch(env.DB, statements, 80);
    }

    return ok({
      success: true,
      updated_count: updatedCount,
      results
    });
  });
}
