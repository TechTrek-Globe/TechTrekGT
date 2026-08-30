import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, fetchSingleEbayListing } from './tokenHelper.js';
import { computePricingFloors } from '../../utils/auction.js';

/**
 * POST /api/ebay/sync-item
 *
 * Synchronizes an inventory item with live data from its linked eBay listing.
 * Automatically updates:
 *   - current_list_price: live price on eBay
 *   - date_listed: eBay listing start date
 *   - status: 'Listed' (if active) or 'Sold' (if completed on eBay)
 *   - platform: 'eBay'
 *   - platform_fee_pct: 0.135 (13.5% standard fee)
 *   - platform_flat_fee: 0.40 ($0.40 flat order fee)
 *   - ebay_promoted_rate & boost_pct
 *   - min_sell_price & suggested_list_price (recalculated break-even floor)
 *
 * Body:
 *   - item_id: string (required)
 *   - ebay_listing_id: string (optional, defaults to item's current ebay_listing_id)
 *   - ebay_promoted_rate: number|null (optional)
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const itemId = body.item_id;
    if (!itemId) return err('item_id is required', 400);

    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(itemId, payload.userId).first();

    if (!item) return err('Item not found', 404);

    const targetListingId = body.ebay_listing_id || item.ebay_listing_id;
    if (!targetListingId) return err('No eBay Listing ID provided or linked to this item', 400);

    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, payload.userId);
    } catch (e) {
      return err(`eBay authentication failed: ${e.message}`, 401);
    }

    const liveListing = await fetchSingleEbayListing(env, accessToken, targetListingId);
    if (!liveListing) {
      return err(`Could not find active listing details on eBay for Item ID: ${targetListingId}`, 404);
    }

    const promotedRate = body.ebay_promoted_rate != null
      ? parseFloat(body.ebay_promoted_rate)
      : (item.ebay_promoted_rate != null ? parseFloat(item.ebay_promoted_rate) : 0);

    const boostPct = promotedRate > 0 ? promotedRate / 100 : (item.boost_pct || 0);

    const targetCost = item.true_total_cost != null ? item.true_total_cost : (item.unit_price || 0);
    const platformFeePct = liveListing.platform_fee_pct || 0.135;
    const platformFlatFee = liveListing.platform_flat_fee != null ? liveListing.platform_flat_fee : 0.40;

    // Shipping cost logic:
    // If Free Shipping: seller covers shipping (use item est_shipping_cost or default $4.50 standard label)
    // If Buyer Pays Shipping: buyer covers shipping (seller net shipping liability is 0)
    let estShippingCost = item.est_shipping_cost || 0;
    if (liveListing.is_free_shipping === false) {
      estShippingCost = 0.00;
    } else if (liveListing.is_free_shipping === true && (!estShippingCost || estShippingCost === 0)) {
      estShippingCost = 4.50; // Standard domestic shipping floor
    }

    const pricing = computePricingFloors({
      true_total_cost: targetCost,
      est_shipping_cost: estShippingCost,
      platform_flat_fee: platformFlatFee,
      platform_fee_pct: platformFeePct,
      boost_pct: boostPct,
      target_margin_pct: item.target_margin_pct || 0.20
    });

    const newStatus = liveListing.status || 'Listed';
    const newPrice = liveListing.price > 0 ? liveListing.price : item.current_list_price;
    const newDateListed = liveListing.date_listed || item.date_listed || new Date().toISOString().split('T')[0];

    // Auto-enrich item specifics if blank
    const athlete = item.athlete_person || liveListing.specifics?.athlete || null;
    const certNumber = item.cert_number || liveListing.specifics?.cert_number || null;
    const authenticator = item.authenticator || liveListing.specifics?.authenticator || null;
    const sportGenre = item.sport_genre || liveListing.specifics?.sport || null;

    let category = item.category;
    if (!category || category === 'Other') {
      const titleOrCat = (liveListing.title + ' ' + (liveListing.category_name || '')).toLowerCase();
      if (titleOrCat.includes('card')) category = 'Card';
      else if (titleOrCat.includes('jersey')) category = 'Jersey';
      else if (titleOrCat.includes('box') || titleOrCat.includes('super box')) category = 'Baseball';
      else if (titleOrCat.includes('bat')) category = 'Bat';
      else if (titleOrCat.includes('helmet')) category = 'Helmet';
      else if (titleOrCat.includes('photo')) category = 'Photo';
      else if (titleOrCat.includes('puck')) category = 'Puck';
    }

    await env.DB.prepare(`
      UPDATE auction_items SET
        ebay_listing_id = ?,
        current_list_price = ?,
        date_listed = ?,
        status = ?,
        platform = 'eBay',
        platform_fee_pct = ?,
        platform_flat_fee = ?,
        ebay_promoted_rate = ?,
        boost_pct = ?,
        est_shipping_cost = ?,
        athlete_person = COALESCE(?, athlete_person),
        cert_number = COALESCE(?, cert_number),
        authenticator = COALESCE(?, authenticator),
        sport_genre = COALESCE(?, sport_genre),
        category = COALESCE(?, category),
        min_sell_price = ?,
        suggested_list_price = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      liveListing.listing_id,
      newPrice,
      newDateListed,
      newStatus,
      platformFeePct,
      platformFlatFee,
      promotedRate,
      boostPct,
      estShippingCost,
      athlete,
      certNumber,
      authenticator,
      sportGenre,
      category,
      pricing.min_sell_price,
      pricing.suggested_list_price,
      itemId,
      payload.userId
    ).run();

    const updatedItem = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(itemId, payload.userId).first();

    return ok({
      success: true,
      message: `Item synced with eBay listing #${liveListing.listing_id}`,
      item: updatedItem,
      liveListing
    });
  });
}
