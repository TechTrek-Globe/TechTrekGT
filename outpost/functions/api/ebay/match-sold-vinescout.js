import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import {
  getEbayUserToken,
  fetchEbayRecentOrders,
  fetchEbayOrderFinances,
  calculateEbayCategoryFees,
  reconcileAndSaveEbaySale
} from './tokenHelper.js';

/**
 * Calculates a token-based similarity score between two strings.
 */
function calculateSimilarity(strA, strB) {
  if (!strA || !strB) return 0;
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const tokensA = normalize(strA).split(/\s+/).filter(t => t.length > 2);
  const haystackB = normalize(strB);

  if (tokensA.length === 0) return 0;
  let matches = 0;
  for (const token of tokensA) {
    if (haystackB.includes(token)) matches++;
  }
  return matches / tokensA.length;
}

/**
 * GET /api/ebay/match-sold-vinescout
 * Discovers recent sold orders from eBay and fuzzy matches them against Vine Scout items.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    let ebayOrders = [];
    try {
      const accessToken = await getEbayUserToken(env, payload.userId);
      ebayOrders = await fetchEbayRecentOrders(env, accessToken, 100);
    } catch (e) {
      console.warn('[match-sold-vinescout] eBay recent orders error:', e);
      // Return empty eBay orders if eBay is not connected or token expired
    }

    // 1. Fetch all Vine Scout inventory items
    const vscoutQuery = `
      SELECT 
        i.id,
        i.item_name,
        i.sku,
        i.status,
        i.unit_price,
        i.true_total_cost,
        i.current_list_price,
        i.ebay_listing_id,
        i.notes,
        i.attributes,
        inv.invoice_ref
      FROM auction_items i
      LEFT JOIN auction_invoices inv ON i.invoice_id = inv.id
      WHERE i.user_id = ?
        AND (
          inv.invoice_ref LIKE 'AMAZON-%'
          OR i.notes LIKE '%ASIN:%'
          OR i.notes LIKE '%B0%'
          OR i.attributes LIKE '%asin%'
          OR i.attributes LIKE '%amazon%'
          OR i.attributes LIKE '%vinescout%'
        )
      ORDER BY i.created_at DESC
      LIMIT 300
    `;
    const vscoutRows = (await env.DB.prepare(vscoutQuery).bind(payload.userId).all())?.results || [];

    // 2. Fetch all recorded sales to map existing links
    const salesRows = (await env.DB.prepare(`
      SELECT id, item_id, ebay_order_id, sale_date, gross_sale_price, platform
      FROM auction_sales
      WHERE user_id = ?
    `).bind(payload.userId).all())?.results || [];

    const salesByOrderId = new Map();
    const salesByItemId = new Map();
    for (const s of salesRows) {
      if (s.ebay_order_id) salesByOrderId.set(String(s.ebay_order_id).trim(), s);
      if (s.item_id) salesByItemId.set(String(s.item_id).trim(), s);
    }

    // 3. Format Vine Scout items
    const parsedVScoutItems = vscoutRows.map(row => {
      let asin = null;
      let orderId = null;
      let etv = null;
      let taxCost = null;
      let imageUrl = null;
      let liquidated = false;
      let linkedEbayOrderId = null;

      if (row.attributes) {
        try {
          const attrs = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
          if (attrs && typeof attrs === 'object') {
            if (attrs.asin) asin = String(attrs.asin).trim().toUpperCase();
            if (attrs.order_id) orderId = String(attrs.order_id).trim();
            if (attrs.etv != null) etv = Number(attrs.etv);
            if (attrs.tax_cost != null) taxCost = Number(attrs.tax_cost);
            if (attrs.image_url) imageUrl = attrs.image_url;
            else if (Array.isArray(attrs.image_urls) && attrs.image_urls[0]) imageUrl = attrs.image_urls[0];
            else if (attrs.ebay_image_url) imageUrl = attrs.ebay_image_url;

            if (attrs.outpost_liquidated) liquidated = true;
            if (attrs.ebay_order_id) linkedEbayOrderId = String(attrs.ebay_order_id);
          }
        } catch (_) {}
      }

      // Fallback ASIN extraction from notes
      if (!asin && row.notes) {
        const m = row.notes.match(/(?:ASIN:\s*|dp\/)(B[0-9A-Z]{9})/i);
        if (m && m[1]) asin = m[1].toUpperCase();
      }

      const existingSale = salesByItemId.get(row.id);
      const isSold = row.status === 'Sold' || liquidated || Boolean(existingSale);

      return {
        id: row.id,
        item_name: row.item_name,
        sku: row.sku,
        status: row.status,
        unit_price: row.unit_price,
        true_total_cost: row.true_total_cost,
        current_list_price: row.current_list_price,
        ebay_listing_id: row.ebay_listing_id,
        asin,
        amazon_order_id: orderId,
        etv,
        tax_cost,
        image_url: imageUrl,
        is_sold: isSold,
        sale_id: existingSale?.id || null,
        linked_ebay_order_id: linkedEbayOrderId || existingSale?.ebay_order_id || null
      };
    });

    // 4. Flatten all sold line items from eBay Fulfillment orders
    const soldLineItems = [];
    for (const order of ebayOrders) {
      const orderId = String(order.orderId || '').trim();
      const creationDate = order.creationDate || null;
      const saleDate = creationDate ? creationDate.split('T')[0] : '';
      const buyerHandle = order.buyer?.username || '';
      const paymentStatus = order.orderPaymentStatus || order.orderFulfillmentStatus || 'PAID';

      for (const line of (order.lineItems || [])) {
        const lineItemId = String(line.lineItemId || '').trim();
        const legacyItemId = String(line.legacyItemId || '').trim();
        const title = line.title || '';
        const sku = String(line.sku || '').trim();
        const lineItemCost = parseFloat(line.lineItemCost?.value || '0');
        const deliveryCost = parseFloat(line.deliveryCost?.shippingCost?.value || order.pricingSummary?.deliveryCost?.value || '0');
        const imageUrl = line.image?.imageUrl || null;

        const existingSale = salesByOrderId.get(orderId);
        const isMatched = Boolean(existingSale);

        soldLineItems.push({
          order_id: orderId,
          line_item_id: lineItemId,
          legacy_item_id: legacyItemId,
          title,
          sku,
          price: lineItemCost,
          delivery_cost: deliveryCost,
          sale_date: saleDate,
          buyer_handle: buyerHandle,
          payment_status: paymentStatus,
          image_url: imageUrl,
          is_matched: isMatched,
          matched_sale_id: existingSale?.id || null,
          matched_item_id: existingSale?.item_id || null
        });
      }
    }

    // 5. Build Suggested Matches & Categorize
    const suggestedMatches = [];
    const alreadyMatched = [];
    const matchedOrderIds = new Set();
    const matchedItemIds = new Set();

    // Identify already matched pairs
    for (const line of soldLineItems) {
      if (line.is_matched && line.matched_item_id) {
        const matchedItem = parsedVScoutItems.find(it => it.id === line.matched_item_id);
        alreadyMatched.push({
          ebay_order: line,
          vinescout_item: matchedItem || { id: line.matched_item_id, item_name: 'Matched Item' }
        });
        matchedOrderIds.add(line.order_id);
        matchedItemIds.add(line.matched_item_id);
      }
    }

    // Also check Vine Scout items that already have linked_ebay_order_id
    for (const it of parsedVScoutItems) {
      if (it.linked_ebay_order_id && !matchedItemIds.has(it.id)) {
        const matchingLine = soldLineItems.find(l => l.order_id === it.linked_ebay_order_id);
        if (matchingLine && !matchedOrderIds.has(matchingLine.order_id)) {
          alreadyMatched.push({
            ebay_order: matchingLine,
            vinescout_item: it
          });
          matchedOrderIds.add(matchingLine.order_id);
          matchedItemIds.add(it.id);
        }
      }
    }

    // Find suggested matches for unmatched eBay lines
    const unmatchedSoldEbay = soldLineItems.filter(l => !matchedOrderIds.has(l.order_id));
    const availableVScoutItems = parsedVScoutItems.filter(it => !matchedItemIds.has(it.id));

    for (const ebayItem of unmatchedSoldEbay) {
      let bestMatch = null;
      let highestScore = 0;
      let matchReason = '';

      for (const vItem of availableVScoutItems) {
        // Tier 1: Exact ASIN or Listing ID match
        const asinInSku = vItem.asin && ebayItem.sku.toUpperCase().includes(vItem.asin);
        const asinInTitle = vItem.asin && ebayItem.title.toUpperCase().includes(vItem.asin);
        const listingMatch = vItem.ebay_listing_id && (vItem.ebay_listing_id === ebayItem.legacy_item_id);

        if (listingMatch) {
          bestMatch = vItem;
          highestScore = 1.0;
          matchReason = 'eBay Listing ID Exact Match';
          break;
        }

        if (asinInSku) {
          bestMatch = vItem;
          highestScore = 1.0;
          matchReason = `ASIN Exact Match in SKU (${vItem.asin})`;
          break;
        }

        if (asinInTitle) {
          bestMatch = vItem;
          highestScore = 0.98;
          matchReason = `ASIN Exact Match in Title (${vItem.asin})`;
          break;
        }

        // Tier 2: Token-based keyword fuzzy matching
        const forwardScore = calculateSimilarity(ebayItem.title, vItem.item_name);
        const reverseScore = calculateSimilarity(vItem.item_name, ebayItem.title);
        const combinedScore = (forwardScore * 0.6) + (reverseScore * 0.4);

        if (combinedScore > highestScore && combinedScore >= 0.35) {
          highestScore = combinedScore;
          bestMatch = vItem;
          matchReason = `Title Similarity (${Math.round(combinedScore * 100)}%)`;
        }
      }

      if (bestMatch && highestScore >= 0.35) {
        suggestedMatches.push({
          confidence: parseFloat(highestScore.toFixed(2)),
          match_reason: matchReason,
          ebay_order: ebayItem,
          vinescout_item: bestMatch
        });
      }
    }

    // Sort suggested matches by confidence descending
    suggestedMatches.sort((a, b) => b.confidence - a.confidence);

    return ok({
      suggested_matches: suggestedMatches,
      unmatched_sold_ebay: unmatchedSoldEbay,
      unmatched_vinescout_items: availableVScoutItems,
      already_matched: alreadyMatched,
      counts: {
        suggested: suggestedMatches.length,
        unmatched_ebay: unmatchedSoldEbay.length,
        unmatched_vscout: availableVScoutItems.length,
        already_matched: alreadyMatched.length
      }
    });
  });
}

/**
 * POST /api/ebay/match-sold-vinescout
 * Reconciles an eBay sold order with a specific Vine Scout inventory item.
 * Updates item status to 'Sold', updates attributes with outpost_liquidated: 1,
 * creates/updates the auction_sales record with landed COGS, and reconciles fees.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const {
      item_id,
      ebay_order_id,
      ebay_listing_id,
      sale_price,
      sale_date,
      buyer_handle,
      buyer_shipping_paid = 0,
      actual_shipping_cost = 0
    } = body;

    if (!item_id) return err('item_id is required', 400);
    if (!ebay_order_id) return err('ebay_order_id is required', 400);

    // 1. Fetch Vine Scout item
    const item = await env.DB.prepare(`
      SELECT * FROM auction_items WHERE id = ? AND user_id = ?
    `).bind(item_id, payload.userId).first();

    if (!item) return err('Item not found or does not belong to this account', 404);

    const price = parseFloat(sale_price) || parseFloat(item.current_list_price) || 0;
    const finalSaleDate = sale_date || new Date().toISOString().split('T')[0];
    const buyer = buyerHandle || '';

    // 2. Update auction_items status and attributes
    let attrs = {};
    if (item.attributes) {
      try {
        attrs = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
      } catch (_) {}
    }

    attrs.outpost_liquidated = 1;
    attrs.sale_price = price;
    attrs.sold_at = finalSaleDate;
    attrs.ebay_order_id = String(ebay_order_id);
    if (buyer) attrs.buyer_handle = buyer;

    await env.DB.prepare(`
      UPDATE auction_items
      SET status = 'Sold',
          ebay_listing_id = COALESCE(?, ebay_listing_id),
          attributes = ?,
          updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      ebay_listing_id ? String(ebay_listing_id) : null,
      JSON.stringify(attrs),
      item.id,
      payload.userId
    ).run();

    // 3. Compute Net Proceeds & Profit
    const feeStructure = calculateEbayCategoryFees(item.category_id, item.category, price);
    const platformFeeAmt = parseFloat(((price * feeStructure.fee_pct) + feeStructure.flat_fee).toFixed(2));
    const bShip = parseFloat(buyer_shipping_paid) || 0;
    const aShip = parseFloat(actual_shipping_cost) || 0;
    const netProceeds = parseFloat((price + bShip - aShip - platformFeeAmt).toFixed(2));
    const landedCost = parseFloat(item.true_total_cost) || 0;
    const netProfit = parseFloat((netProceeds - landedCost).toFixed(2));
    const roiPct = landedCost > 0 ? parseFloat(((netProfit / landedCost) * 100).toFixed(2)) : 0;

    // 4. Create or Update auction_sales record
    const existingSale = await env.DB.prepare(`
      SELECT id FROM auction_sales WHERE (ebay_order_id = ? OR item_id = ?) AND user_id = ?
    `).bind(String(ebay_order_id), item.id, payload.userId).first();

    let saleId = existingSale?.id || `sale-${crypto.randomUUID()}`;

    if (existingSale) {
      await env.DB.prepare(`
        UPDATE auction_sales
        SET item_id = ?,
            item_name = ?,
            platform = 'eBay',
            ebay_order_id = ?,
            sale_date = ?,
            buyer_handle = ?,
            gross_sale_price = ?,
            buyer_shipping_paid = ?,
            actual_shipping_cost = ?,
            platform_fee_pct = ?,
            platform_flat_fee = ?,
            platform_fees_amt = ?,
            net_proceeds = ?,
            true_total_cost = ?,
            net_profit = ?,
            roi_pct = ?,
            updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(
        item.id,
        item.item_name,
        String(ebay_order_id),
        finalSaleDate,
        buyer,
        price,
        bShip,
        aShip,
        feeStructure.fee_pct,
        feeStructure.flat_fee,
        platformFeeAmt,
        netProceeds,
        landedCost,
        netProfit,
        roiPct,
        saleId,
        payload.userId
      ).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO auction_sales (
          id, user_id, item_id, item_name, platform, ebay_order_id,
          sale_date, buyer_handle, gross_sale_price, buyer_shipping_paid,
          actual_shipping_cost, platform_fee_pct, platform_flat_fee,
          platform_fees_amt, net_proceeds, true_total_cost, net_profit, roi_pct
        ) VALUES (
          ?, ?, ?, ?, 'eBay', ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `).bind(
        saleId,
        payload.userId,
        item.id,
        item.item_name,
        String(ebay_order_id),
        finalSaleDate,
        buyer,
        price,
        bShip,
        aShip,
        feeStructure.fee_pct,
        feeStructure.flat_fee,
        platformFeeAmt,
        netProceeds,
        landedCost,
        netProfit,
        roiPct
      ).run();
    }

    // 5. Asynchronous Finances / Fee Reconciliation
    try {
      const accessToken = await getEbayUserToken(env, payload.userId).catch(() => null);
      if (accessToken) {
        const finances = await fetchEbayOrderFinances(env, accessToken, ebay_order_id).catch(() => null);
        if (finances?.finances_available) {
          const orderData = {
            orderId: ebay_order_id,
            saleDate: finalSaleDate,
            buyerHandle: buyer,
            lineItemCost: price,
            deliveryCost: bShip,
            actualShippingCost: aShip
          };
          await reconcileAndSaveEbaySale(env, payload.userId, item, orderData, finances).catch(() => {});
        }
      }
    } catch (reconErr) {
      console.warn('[match-sold-vinescout] Fee reconciliation background error:', reconErr);
    }

    return ok({
      success: true,
      sale_id: saleId,
      item_id: item.id,
      ebay_order_id: String(ebay_order_id),
      net_profit: netProfit,
      roi_pct: roiPct
    });
  });
}
