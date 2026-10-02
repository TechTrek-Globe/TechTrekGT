import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import {
  getEbayUserToken,
  fetchSingleEbayListing,
  fetchEbayOrderForListing,
  fetchEbayOrderFinances,
  reconcileAndSaveEbaySale,
  normalizeHttps
} from './tokenHelper.js';
import { computePricingFloors } from '../../utils/auction.js';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  DEFAULT_TARGET_MARGIN_PCT
} from '../../utils/constants.js';
import { invalidateEbayListingsCache } from './listingsCache.js';

/**
 * POST /api/ebay/sync-item
 *
 * Synchronizes an inventory item with live data from its linked eBay listing.
 * Automatically updates:
 *   - current_list_price: live price on eBay
 *   - date_listed: eBay listing start date
 *   - status: 'Listed' (if active) or 'Sold' (if completed on eBay)
 *   - platform: 'eBay'
 *   - platform_fee_pct: category-specific standard fee
 *   - platform_flat_fee: flat order fee
 *   - ebay_promoted_rate & boost_pct
 *   - min_sell_price & suggested_list_price (recalculated break-even floor)
 *
 * If the item has sold on eBay (status === 'Sold' or Completed):
 *   - Automatically queries eBay Fulfillment API (/sell/fulfillment/v1/order) for buyer & order data
 *   - Automatically queries eBay Finances API (/sell/finances/v1/transaction) for exact gross & fees
 *   - Automatically saves the sale into auction_sales and ebay_fee_reconciliations in D1
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

    let targetListingId = body.ebay_listing_id || item.ebay_listing_id;
    
    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, payload.userId);
    } catch (e) {
      console.error('[sync-item] eBay authentication failed:', e);
      if (e?.statusCode === 503) return err(e.message, 503);
      return err('eBay authentication failed. Please reconnect your eBay account.', 401);
    }

    // If no eBay listing ID is linked, attempt to discover order or active listing by SKU or Title
    let orderData = null;
    let financeData = null;

    if (!targetListingId) {
      try {
        orderData = await fetchEbayOrderForListing(env, accessToken, null, item.sku, item.item_name);
        if (orderData && orderData.isExactMatch !== false) {
          targetListingId = orderData.matchedLine?.legacyItemId || orderData.matchedLine?.itemId || null;
        }
      } catch (_) {}
    }

    // Hoisted in-memory campaignCache scoped to this sync-item run (LOW-3)
    const campaignCache = new Map();

    let liveListing = null;
    if (targetListingId) {
      liveListing = await fetchSingleEbayListing(env, accessToken, targetListingId, campaignCache);
    }

    // If order was not yet fetched, query using targetListingId / sku / title
    if (!orderData) {
      try {
        orderData = await fetchEbayOrderForListing(
          env,
          accessToken,
          targetListingId,
          item.sku || liveListing?.sku,
          item.item_name || liveListing?.title
        );
      } catch (fetchErr) {
        console.warn('[sync-item] Auto-sale lookup exception:', fetchErr);
      }
    }

    if (!liveListing && orderData && orderData.isExactMatch !== false) {
      const discoveredId = orderData.matchedLine?.legacyItemId || orderData.matchedLine?.itemId;
      if (discoveredId) {
        targetListingId = discoveredId;
        try {
          liveListing = await fetchSingleEbayListing(env, accessToken, targetListingId, campaignCache);
        } catch (_) {}
      }
    }

    if (orderData?.orderId) {
      try {
        financeData = await fetchEbayOrderFinances(env, accessToken, orderData.orderId);
      } catch (finErr) {
        console.warn('[sync-item] Finances lookup exception:', finErr);
      }
    }

    const hasOrder = Boolean(orderData && orderData.isExactMatch !== false && (orderData.orderId || orderData.buyerHandle || (orderData.lineItemCost && orderData.lineItemCost > 0)));
    const qtySold = Number(liveListing?.quantity_sold) || 0;
    const isSold = hasOrder || (qtySold > 0);

    const liveRate = (liveListing?.promoted_rate != null && Number(liveListing.promoted_rate) > 0)
      ? Number(liveListing.promoted_rate)
      : null;

    const userRate = (body.ebay_promoted_rate != null && body.ebay_promoted_rate !== '' && Number(body.ebay_promoted_rate) > 0)
      ? parseFloat(body.ebay_promoted_rate)
      : null;

    const dbRate = (item.ebay_promoted_rate != null && Number(item.ebay_promoted_rate) > 0)
      ? parseFloat(item.ebay_promoted_rate)
      : (item.boost_pct != null && Number(item.boost_pct) > 0 ? parseFloat(item.boost_pct) * 100 : null);

    const promotedRate = liveRate ?? userRate ?? dbRate ?? 0;
    const boostPct = promotedRate > 0 ? promotedRate / 100 : 0;

    const targetCost = item.true_total_cost != null ? item.true_total_cost : (item.unit_price || 0);
    const platformFeePct = liveListing?.platform_fee_pct ?? DEFAULT_PLATFORM_FEE_PCT;
    const platformFlatFee = liveListing?.platform_flat_fee != null ? liveListing.platform_flat_fee : DEFAULT_PLATFORM_FLAT_FEE;

    const buyerShipping = (liveListing?.buyer_shipping_cost != null && liveListing.buyer_shipping_cost > 0)
      ? liveListing.buyer_shipping_cost
      : (liveListing?.is_free_shipping ? 0.00 : (item.buyer_shipping_cost || 0.00));

    const estShippingCost = (item.est_shipping_cost != null && !isNaN(Number(item.est_shipping_cost)))
      ? Number(item.est_shipping_cost)
      : (liveListing?.is_free_shipping ? 4.50 : 0.00);

    const pricing = computePricingFloors({
      true_total_cost: targetCost,
      est_shipping_cost: estShippingCost,
      platform_flat_fee: platformFlatFee,
      platform_fee_pct: platformFeePct,
      boost_pct: boostPct,
      target_margin_pct: item.target_margin_pct ?? DEFAULT_TARGET_MARGIN_PCT
    });

    let newStatus = 'Listed';
    if (isSold) {
      newStatus = 'Sold';
    } else if (['Kept for Self', 'Returned'].includes(item.status)) {
      newStatus = item.status;
    } else if (liveListing?.status === 'Unsold' || liveListing?.raw_status === 'Completed' || liveListing?.raw_status === 'Ended') {
      newStatus = 'Unsold';
    } else if (liveListing?.status === 'Listed' || liveListing?.raw_status === 'Active') {
      newStatus = 'Listed';
    } else {
      newStatus = item.status || 'Available';
    }

    const nextActualSellPrice = isSold ? item.actual_sell_price : (item.status === 'Sold' ? null : item.actual_sell_price);
    const nextDateSold = isSold ? item.date_sold : (item.status === 'Sold' ? null : item.date_sold);
    const nextDaysOnMarket = isSold ? item.days_on_market : (item.status === 'Sold' ? null : item.days_on_market);

    const newPrice = (liveListing?.price && liveListing.price > 0) ? liveListing.price : item.current_list_price;
    const newDateListed = liveListing?.date_listed || item.date_listed || new Date().toISOString().split('T')[0];

    const athlete = item.athlete_person || liveListing?.specifics?.athlete || null;
    const certNumber = item.cert_number || liveListing?.specifics?.cert_number || null;
    const authenticator = item.authenticator || liveListing?.specifics?.authenticator || null;
    const sportGenre = item.sport_genre || liveListing?.specifics?.sport || null;

    let category = item.category;
    if (!category || category === 'Other') {
      const titleOrCat = (item.item_name + ' ' + (liveListing?.title || '') + ' ' + (liveListing?.category_name || '')).toLowerCase();
      if (titleOrCat.includes('card')) category = 'Card';
      else if (titleOrCat.includes('jersey')) category = 'Jersey';
      else if (titleOrCat.includes('box') || titleOrCat.includes('super box')) category = 'Baseball';
      else if (titleOrCat.includes('bat')) category = 'Bat';
      else if (titleOrCat.includes('helmet')) category = 'Helmet';
      else if (titleOrCat.includes('photo')) category = 'Photo';
      else if (titleOrCat.includes('puck')) category = 'Puck';
    }

    // Extract and update image URL in attributes
    let attrs = {};
    if (item.attributes) {
      try {
        attrs = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : (item.attributes || {});
      } catch (_) {}
    }
    const liveImageUrl = normalizeHttps(liveListing?.image_url);
    if (liveImageUrl) {
      attrs.ebay_image_url = liveImageUrl;
    }

    // Clean up phantom sale records if reverting out of Sold state
    if (item.status === 'Sold' && !isSold) {
      await env.DB.prepare(
        'DELETE FROM ebay_fee_reconciliations WHERE user_id = ? AND sale_id IN (SELECT id FROM auction_sales WHERE item_id = ? AND user_id = ?)'
      ).bind(payload.userId, itemId, payload.userId).run().catch(() => {});
      await env.DB.prepare(
        'DELETE FROM auction_sales WHERE item_id = ? AND user_id = ?'
      ).bind(itemId, payload.userId).run().catch(() => {});
    }

    await env.DB.prepare(`
      UPDATE auction_items SET
        ebay_listing_id = COALESCE(?, ebay_listing_id),
        current_list_price = COALESCE(?, current_list_price),
        date_listed = ?,
        status = ?,
        actual_sell_price = ?,
        date_sold = ?,
        days_on_market = ?,
        platform = 'eBay',
        platform_fee_pct = ?,
        platform_flat_fee = ?,
        ebay_promoted_rate = ?,
        boost_pct = ?,
        est_shipping_cost = ?,
        buyer_shipping_cost = ?,
        athlete_person = COALESCE(?, athlete_person),
        cert_number = COALESCE(?, cert_number),
        authenticator = COALESCE(?, authenticator),
        sport_genre = COALESCE(?, sport_genre),
        category = COALESCE(?, category),
        min_sell_price = ?,
        suggested_list_price = ?,
        attributes = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      targetListingId || null,
      newPrice || null,
      newDateListed,
      newStatus,
      nextActualSellPrice,
      nextDateSold,
      nextDaysOnMarket,
      platformFeePct,
      platformFlatFee,
      promotedRate,
      boostPct,
      estShippingCost,
      buyerShipping,
      athlete,
      certNumber,
      authenticator,
      sportGenre,
      category,
      pricing.min_sell_price,
      pricing.suggested_list_price,
      JSON.stringify(attrs),
      itemId,
      payload.userId
    ).run();

    const updatedItem = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(itemId, payload.userId).first();

    // Invalidate active listings cache on explicit single-item sync (MED-15)
    await invalidateEbayListingsCache(env.DB, payload.userId);

    // MED-2: If order was matched solely by title similarity, do NOT auto-reconcile sale.
    // Instead, insert a pending review alert into auction_market_alerts for human confirmation.
    if (orderData && orderData.isExactMatch === false) {
      const alertId = `alt_${crypto.randomUUID()}`;
      const salePrice = orderData.salePrice || orderData.lineItemCost || 0;
      const currentPrice = item.current_list_price || 0;
      const pctChange = currentPrice > 0 ? ((salePrice - currentPrice) / currentPrice) * 100 : 0;

      await env.DB.prepare(`
        INSERT INTO auction_market_alerts (id, user_id, item_id, alert_type, old_value, new_value, percentage_change, is_read, created_at)
        VALUES (?, ?, ?, 'PENDING_SALE_MATCH', ?, ?, ?, 0, datetime('now'))
      `).bind(
        alertId,
        payload.userId,
        itemId,
        currentPrice,
        salePrice,
        pctChange
      ).run();

      return ok({
        success: true,
        is_sold: false,
        pending_review: true,
        alert_id: alertId,
        message: `Suggested sale match found by title similarity (Order #${orderData.orderId || 'N/A'}). Created pending review alert for user confirmation.`,
        item: updatedItem,
        pendingOrder: orderData,
        liveListing
      });
    }

    // If item is sold, automatically reconcile and save sale
    if (isSold) {
      let saleResult;
      try {
        saleResult = await reconcileAndSaveEbaySale(env, payload.userId, updatedItem, orderData, financeData);
      } catch (saleErr) {
        console.error('[sync-item] Failed to record sold item sale:', saleErr);
        await env.DB.prepare(`
          UPDATE auction_items SET
            status = ?,
            actual_sell_price = ?,
            date_sold = ?,
            days_on_market = ?,
            updated_at = datetime('now')
          WHERE id = ? AND user_id = ?
        `).bind(
          item.status,
          item.actual_sell_price,
          item.date_sold,
          item.days_on_market,
          itemId,
          payload.userId
        ).run().catch(() => {});
        return err('Failed to record sold item sale. Item state restored.', 500);
      }

      return ok({
        success: true,
        is_sold: true,
        auto_saved: true,
        message: `Item sold on eBay! Automatically recorded sale${orderData?.orderId ? ` (Order #${orderData.orderId})` : ''} and reconciled net earnings.`,
        item: saleResult.item,
        sale: saleResult.sale,
        reconciliation: saleResult.reconciliation,
        liveListing
      });
    }

    return ok({
      success: true,
      is_sold: false,
      auto_saved: false,
      message: `Item synced with eBay listing #${targetListingId || 'active'}`,
      item: updatedItem,
      liveListing
    });
  });
}
