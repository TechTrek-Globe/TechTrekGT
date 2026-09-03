export async function onRequestGet({ request, env }) {
  try {
    const rawAuth = request.headers.get('X-VineScout-Auth') ||
      (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

    if (!rawAuth) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing auth token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let isAuthorized = false;
    if (env.OUTPOST_SECRET_KEY && rawAuth === env.OUTPOST_SECRET_KEY) {
      isAuthorized = true;
    } else if (env.DB) {
      const user = await env.DB.prepare(
        `SELECT id FROM users WHERE amazon_api_token = ? LIMIT 1`
      ).bind(rawAuth).first();
      if (user) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const query = `
      SELECT 
        i.id,
        i.item_name,
        i.sku,
        i.status,
        i.platform,
        i.platform_fee_pct,
        i.platform_flat_fee,
        i.est_shipping_cost,
        i.current_list_price,
        i.suggested_list_price,
        i.min_sell_price,
        i.boost_pct,
        i.target_margin_pct,
        i.ebay_listing_id,
        i.notes,
        i.attributes,
        v.invoice_ref
      FROM auction_items i
      LEFT JOIN auction_invoices v ON i.invoice_id = v.id
      WHERE i.status != 'Sold'
    `;

    const { results } = await env.DB.prepare(query).all();

    const inventoryList = (results || []).map(row => {
      let asin = null;
      let orderId = null;
      let isVine = false;

      if (row.attributes) {
        try {
          const parsed = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
          if (parsed && typeof parsed === 'object') {
            if (parsed.asin) asin = String(parsed.asin).trim().toUpperCase();
            if (parsed.order_id) orderId = String(parsed.order_id).trim();
            if (parsed.source === 'amazon_vinescout' || parsed.is_vinescout) isVine = true;
          }
        } catch (_) {}
      }

      if (row.notes) {
        if (!asin) {
          const mAsin = row.notes.match(/\b(B0[A-Z0-9]{8})\b/i);
          if (mAsin) asin = mAsin[1].toUpperCase();
        }
        if (!orderId) {
          const mOrder = row.notes.match(/\b(\d{3}-\d{7}-\d{7})\b/);
          if (mOrder) orderId = mOrder[1];
        }
      }

      if (!asin && row.invoice_ref) {
        const mInv = row.invoice_ref.match(/AMAZON-(B0[A-Z0-9]{8})/i);
        if (mInv) asin = mInv[1].toUpperCase();
      }

      if (asin || orderId || (row.invoice_ref && row.invoice_ref.startsWith('AMAZON-'))) {
        isVine = true;
      }

      if (!isVine) return null;

      const isListed = Boolean(row.status === 'Listed' || (row.current_list_price && row.current_list_price > 0) || row.ebay_listing_id);

      return {
        id: row.id,
        sku: row.sku || null,
        asin: asin || null,
        orderId: orderId || null,
        title: row.item_name || '',
        status: row.status || 'Available',
        isListed: isListed,
        platform: row.platform || 'eBay',
        feePct: (row.platform_fee_pct !== null && row.platform_fee_pct !== undefined) ? (parseFloat(row.platform_fee_pct) > 1 ? parseFloat(row.platform_fee_pct) : parseFloat(row.platform_fee_pct) * 100) : 13.6,
        flatFee: (row.platform_flat_fee !== null && row.platform_flat_fee !== undefined) ? parseFloat(row.platform_flat_fee) : 0.40,
        shippingCost: (row.est_shipping_cost !== null && row.est_shipping_cost !== undefined) ? parseFloat(row.est_shipping_cost) : 0,
        boostPct: (row.boost_pct !== null && row.boost_pct !== undefined) ? parseFloat(row.boost_pct) : 0,
        currentListPrice: (row.current_list_price !== null && row.current_list_price !== undefined) ? parseFloat(row.current_list_price) : null,
        suggestedListPrice: (row.suggested_list_price !== null && row.suggested_list_price !== undefined) ? parseFloat(row.suggested_list_price) : null,
        minSellPrice: (row.min_sell_price !== null && row.min_sell_price !== undefined) ? parseFloat(row.min_sell_price) : null,
        ebayListingId: row.ebay_listing_id || null
      };
    }).filter(Boolean);

    return new Response(JSON.stringify({ success: true, data: inventoryList }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VINESCOUT_INVENTORY_EXPORT] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
