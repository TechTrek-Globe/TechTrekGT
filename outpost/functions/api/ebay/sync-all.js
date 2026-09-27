import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import {
  getEbayUserToken,
  fetchEbayActiveSellerListings,
  fetchEbayRecentOrders,
  fetchSingleEbayListing,
  calculateEbayCategoryFees,
  fetchEbayOrderForListing,
  fetchEbayOrderFinances,
  reconcileAndSaveEbaySale,
  normalizeHttps
} from './tokenHelper.js';
import { computePricingFloors } from '../../utils/auction.js';

/**
 * POST /api/ebay/sync-all
 *
 * Batch synchronizes all inventory items mapped to an eBay listing or SKU.
 * Pulls recent Fulfillment API orders to automatically identify and reconcile sold items,
 * and synchronizes active seller listings for live prices, shipping, category fees, and ad rates.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const rows = await env.DB.prepare(`
      SELECT * FROM auction_items
      WHERE user_id = ? AND ((ebay_listing_id IS NOT NULL AND ebay_listing_id != '') OR (sku IS NOT NULL AND sku != ''))
    `).bind(payload.userId).all();

    const items = rows.results || [];
    if (items.length === 0) {
      return ok({
        success: true,
        message: 'No linked eBay items found in inventory.',
        total_linked: 0,
        updated_count: 0,
        sold_recorded_count: 0
      });
    }

    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, payload.userId);
    } catch (e) {
      console.error('[sync-all] eBay authentication failed:', e);
      return err('eBay authentication failed. Please reconnect your eBay account.', 401);
    }

    // Fetch active listings and recent orders in parallel
    const [liveListings, recentOrders] = await Promise.all([
      fetchEbayActiveSellerListings(env, accessToken),
      fetchEbayRecentOrders(env, accessToken, 100)
    ]);

    const listingMap = new Map();
    liveListings.forEach(l => {
      if (l.listing_id) listingMap.set(String(l.listing_id).trim(), l);
      if (l.sku) listingMap.set(String(l.sku).trim().toLowerCase(), l);
    });

    // Map recent orders by legacyItemId, itemId, and SKU
    const ordersByListingId = new Map();
    const ordersBySku = new Map();
    for (const order of recentOrders) {
      const lineItems = order.lineItems || [];
      for (const li of lineItems) {
        const orderData = {
          orderId: order.orderId,
          legacyOrderId: order.legacyOrderId || null,
          creationDate: order.creationDate || null,
          saleDate: order.creationDate ? order.creationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          buyerHandle: order.buyer?.username || '',
          orderStatus: order.orderPaymentStatus || order.orderFulfillmentStatus || 'PAID',
          salePrice: parseFloat(li.lineItemCost?.value || '0'),
          lineItemCost: parseFloat(li.lineItemCost?.value || '0'),
          deliveryCost: parseFloat(li.deliveryCost?.shippingCost?.value || order.pricingSummary?.deliveryCost?.value || '0'),
          matchedLine: li,
          rawOrder: order,
          source: 'fulfillment_api'
        };
        if (li.legacyItemId) ordersByListingId.set(String(li.legacyItemId).trim(), orderData);
        if (li.itemId) ordersByListingId.set(String(li.itemId).trim(), orderData);
        if (li.sku) ordersBySku.set(String(li.sku).trim().toLowerCase(), orderData);
      }
    }

    let updatedCount = 0;
    let soldRecordedCount = 0;
    let singleEnrichCount = 0;
    const MAX_SINGLE_ENRICH = 30;

    // Hoisted in-memory campaignCache scoped to this sync-all run (HIGH-8)
    const campaignCache = new Map();

    // Concurrency control: max 3 at a time with short delay between batches
    const CONCURRENCY_LIMIT = 3;
    let activePromises = [];
    const DELAY_MS = 100;

    for (const item of items) {
      const p = (async () => {
        const cleanListingId = item.ebay_listing_id ? String(item.ebay_listing_id).trim() : null;
        const cleanSku = item.sku ? String(item.sku).trim().toLowerCase() : null;

        // 1. Check if item has a sold order in recent orders
        const matchedOrder = (cleanListingId && ordersByListingId.get(cleanListingId)) ||
                             (cleanSku && ordersBySku.get(cleanSku)) || null;

        if (matchedOrder) {
          if (item.status !== 'Sold') {
            try {
              let financeData = null;
              if (matchedOrder.orderId) {
                financeData = await fetchEbayOrderFinances(env, accessToken, matchedOrder.orderId);
              }
              await reconcileAndSaveEbaySale(env, payload.userId, item, matchedOrder, financeData);
              soldRecordedCount++;
              updatedCount++;

              // P7: VScout write-back - stamp sold metadata on Vine-sourced items
              try {
                let attrs = {};
                const attrSrc = item.attributes;
                if (attrSrc) {
                  attrs = typeof attrSrc === 'string' ? JSON.parse(attrSrc) : attrSrc;
                }
                if (attrs.asin || attrs.order_id) {
                  attrs.outpost_liquidated = 1;
                  if (matchedOrder.salePrice != null) attrs.sale_price = matchedOrder.salePrice;
                  attrs.sold_at = matchedOrder.creationDate || new Date().toISOString();
                  if (matchedOrder.orderId) attrs.ebay_order_id = matchedOrder.orderId;
                  await env.DB.prepare(
                    `UPDATE auction_items SET attributes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
                  ).bind(JSON.stringify(attrs), item.id, payload.userId).run();
                }
              } catch (wbErr) {
                console.warn(`[sync-all] VScout write-back exception for item ${item.id}:`, wbErr);
              }
            } catch (soldErr) {
              console.warn(`[sync-all] Order reconciliation exception for item ${item.id}:`, soldErr);
            }
          }
          return;
        }

        // 2. Check active seller listings
        const match = (cleanListingId && listingMap.get(cleanListingId)) ||
                      (cleanSku && listingMap.get(cleanSku)) || null;
        if (match) {
          let promotedRate = item.ebay_promoted_rate != null && item.ebay_promoted_rate !== ''
            ? parseFloat(item.ebay_promoted_rate)
            : 0;
          let singleDetail = null;

          // If promoted rate is 0 or missing, enrich via fetchSingleEbayListing (capped at 30 to respect rate limits)
          if ((promotedRate === 0 || isNaN(promotedRate)) && singleEnrichCount < MAX_SINGLE_ENRICH && item.ebay_listing_id) {
            singleEnrichCount++;
            try {
              singleDetail = await fetchSingleEbayListing(env, accessToken, item.ebay_listing_id, campaignCache);
              if (singleDetail?.promoted_rate != null && singleDetail.promoted_rate > 0) {
                promotedRate = singleDetail.promoted_rate;
              }
            } catch (_) {}
          }

          const targetCost = item.true_total_cost != null ? item.true_total_cost : (item.unit_price || 0);
          const boostPct = promotedRate > 0 ? promotedRate / 100 : 0;

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

          const isSold = match.status === 'Completed' || match.status === 'Sold' || (match.quantity_sold != null && match.quantity_sold > 0);
          const newPrice = match.price > 0 ? match.price : item.current_list_price;
          const newStatus = isSold ? 'Sold' : 'Listed';

          let rawImg = match.image_url || (singleDetail ? singleDetail.image_url : null);
          if (!rawImg && singleEnrichCount < MAX_SINGLE_ENRICH && cleanListingId) {
            singleEnrichCount++;
            try {
              singleDetail = await fetchSingleEbayListing(env, accessToken, cleanListingId, campaignCache);
              if (singleDetail?.image_url) {
                rawImg = singleDetail.image_url;
              }
            } catch (_) {}
          }
          const ebayImg = normalizeHttps(rawImg);

          let attrs = {};
          if (item.attributes) {
            try {
              attrs = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : (item.attributes || {});
            } catch (_) {}
          }
          if (ebayImg) {
            attrs.ebay_image_url = ebayImg;
          }

          await env.DB.prepare(`
            UPDATE auction_items SET
              current_list_price = ?,
              status = ?,
              platform = 'eBay',
              platform_fee_pct = ?,
              platform_flat_fee = ?,
              ebay_promoted_rate = ?,
              boost_pct = ?,
              est_shipping_cost = ?,
              min_sell_price = ?,
              suggested_list_price = ?,
              attributes = ?,
              updated_at = datetime('now')
            WHERE id = ? AND user_id = ?
          `).bind(
            newPrice,
            newStatus,
            platformFeePct,
            platformFlatFee,
            promotedRate,
            boostPct,
            estShippingCost,
            pricing.min_sell_price,
            pricing.suggested_list_price,
            JSON.stringify(attrs),
            item.id,
            payload.userId
          ).run();

          updatedCount++;

          // If item sold, auto-record the sale
          if (isSold) {
            try {
              const updatedRow = await env.DB.prepare(
                'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
              ).bind(item.id, payload.userId).first();

              const orderData = await fetchEbayOrderForListing(env, accessToken, item.ebay_listing_id, item.sku || match.sku);
              let financeData = null;
              if (orderData?.orderId) {
                financeData = await fetchEbayOrderFinances(env, accessToken, orderData.orderId);
              }
              await reconcileAndSaveEbaySale(env, payload.userId, updatedRow || item, orderData, financeData);
              soldRecordedCount++;

              // P7: VScout write-back - stamp sold metadata on Vine-sourced items
              try {
                let attrs = {};
                const attrSrc = (updatedRow || item).attributes;
                if (attrSrc) {
                  attrs = typeof attrSrc === 'string' ? JSON.parse(attrSrc) : attrSrc;
                }
                if (attrs.asin || attrs.order_id) {
                  attrs.outpost_liquidated = 1;
                  if (orderData?.salePrice != null) attrs.sale_price = orderData.salePrice;
                  attrs.sold_at = orderData?.createdDate || new Date().toISOString();
                  if (orderData?.orderId) attrs.ebay_order_id = orderData.orderId;
                  await env.DB.prepare(
                    `UPDATE auction_items SET attributes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
                  ).bind(JSON.stringify(attrs), item.id, payload.userId).run();
                }
              } catch (wbErr) {
                console.warn(`[sync-all] VScout write-back exception for item ${item.id}:`, wbErr);
              }
            } catch (soldErr) {
              console.warn(`[sync-all] Auto-sale record exception for item ${item.id}:`, soldErr);
            }
          }
        } else if (item.status === 'Listed' && cleanListingId && singleEnrichCount < MAX_SINGLE_ENRICH) {
          // 3. Fallback: item was listed, not in active listings and not in top 100 recent orders
          singleEnrichCount++;
          try {
            const singleDetail = await fetchSingleEbayListing(env, accessToken, cleanListingId, campaignCache);
            if (singleDetail) {
              if (singleDetail.image_url) {
                try {
                  let sAttrs = {};
                  const sAttrSrc = item.attributes;
                  if (sAttrSrc) {
                    sAttrs = typeof sAttrSrc === 'string' ? JSON.parse(sAttrSrc) : sAttrSrc;
                  }
                  sAttrs.ebay_image_url = singleDetail.image_url;
                  await env.DB.prepare(
                    `UPDATE auction_items SET attributes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
                  ).bind(JSON.stringify(sAttrs), item.id, payload.userId).run();
                } catch (_) {}
              }
              if (singleDetail.status === 'Sold' || singleDetail.quantity_sold > 0) {
                const orderData = await fetchEbayOrderForListing(env, accessToken, cleanListingId, item.sku);
                let financeData = null;
                if (orderData?.orderId) {
                  financeData = await fetchEbayOrderFinances(env, accessToken, orderData.orderId);
                }
                await reconcileAndSaveEbaySale(env, payload.userId, item, orderData, financeData);
                soldRecordedCount++;
                updatedCount++;

                // P7: VScout write-back
                try {
                  let attrs = {};
                  const attrSrc = item.attributes;
                  if (attrSrc) {
                    attrs = typeof attrSrc === 'string' ? JSON.parse(attrSrc) : attrSrc;
                  }
                  if (attrs.asin || attrs.order_id) {
                    attrs.outpost_liquidated = 1;
                    if (orderData?.salePrice != null) attrs.sale_price = orderData.salePrice;
                    attrs.sold_at = orderData?.createdDate || new Date().toISOString();
                    if (orderData?.orderId) attrs.ebay_order_id = orderData.orderId;
                    await env.DB.prepare(
                      `UPDATE auction_items SET attributes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
                    ).bind(JSON.stringify(attrs), item.id, payload.userId).run();
                  }
                } catch (wbErr) {
                  console.warn(`[sync-all] VScout write-back exception for item ${item.id}:`, wbErr);
                }
              }
            }
          } catch (singleErr) {
            console.warn(`[sync-all] Single fallback exception for item ${item.id}:`, singleErr);
          }
        }
      })();

      activePromises.push(p);

      if (activePromises.length >= CONCURRENCY_LIMIT) {
        await Promise.all(activePromises);
        activePromises = [];
        if (DELAY_MS > 0) {
          await new Promise(r => setTimeout(r, DELAY_MS));
        }
      }
    }

    if (activePromises.length > 0) {
      await Promise.all(activePromises);
    }

    // Stamp last_refreshed_at on success
    await env.DB.prepare(
      `UPDATE ebay_oauth_tokens SET last_refreshed_at = datetime('now') WHERE user_id = ?`
    ).bind(payload.userId).run().catch(() => {});

    // P7: Stamp last_ebay_sync_at in outpost_sync_settings (upsert preserves existing prefs)
    await env.DB.prepare(`
      INSERT OR REPLACE INTO outpost_sync_settings
        (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_ebay_sync_at, updated_at)
      VALUES (
        ?,
        COALESCE((SELECT ebay_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
        COALESCE((SELECT ebay_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 30),
        COALESCE((SELECT vscout_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
        COALESCE((SELECT vscout_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 60),
        datetime('now'),
        datetime('now')
      )
    `).bind(payload.userId, payload.userId, payload.userId, payload.userId, payload.userId).run().catch(() => {});

    return ok({
      success: true,
      message: `Successfully synchronized ${updatedCount} of ${items.length} linked items with eBay${soldRecordedCount > 0 ? ` (${soldRecordedCount} sales automatically recorded)` : ''}.`,
      total_linked: items.length,
      updated_count: updatedCount,
      sold_recorded_count: soldRecordedCount
    });
  });
}
