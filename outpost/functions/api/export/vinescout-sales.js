import { resolveIntegrationUserId } from '../../utils/apiIntegrations.js';
import { getAllTokensFromRequest } from '../../utils/auth.js';

export async function onRequestGet({ request, env }) {
  try {
    let rawAuth = (request.headers.get('X-VineScout-Auth') ||
      (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')).trim();

    if (!rawAuth) {
      const tokens = getAllTokensFromRequest(request);
      if (tokens.length > 0) rawAuth = tokens[0];
    }

    if (!rawAuth) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing auth token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = await resolveIntegrationUserId(rawAuth, env);

    if (!userId) {
      console.warn('[VINESCOUT_SALES_EXPORT] Auth failed. Token prefix:', rawAuth.substring(0, 12), 'length:', rawAuth.length);
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const query = `
      SELECT 
        s.id as sale_id,
        s.platform,
        s.gross_sale_price,
        s.net_proceeds,
        s.true_total_cost,
        s.net_profit,
        s.roi_pct,
        s.platform_fees_amt,
        s.actual_shipping_cost,
        s.sale_date,
        i.id as item_id,
        i.item_name,
        i.sku,
        i.notes,
        i.attributes,
        v.invoice_ref
      FROM auction_sales s
      JOIN auction_items i ON s.item_id = i.id
      LEFT JOIN auction_invoices v ON i.invoice_id = v.id
      WHERE s.user_id = ?
    `;

    const { results } = await env.DB.prepare(query).bind(userId).all();

    const salesList = (results || []).map(row => {
      let asin = null;
      let orderId = null;
      let isVine = false;

      // 1. Try attributes JSON
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

      // 2. Try notes parsing (e.g. "ASIN: B0GQ4KD8C5 | Order ID: 111-2222222-3333333")
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

      // 3. Try invoice_ref (e.g. "AMAZON-B0GQ4KD8C5-2026-08-26")
      if (!asin && row.invoice_ref) {
        const mInv = row.invoice_ref.match(/AMAZON-(B0[A-Z0-9]{8})/i);
        if (mInv) asin = mInv[1].toUpperCase();
      }

      if (asin || orderId || (row.invoice_ref && row.invoice_ref.startsWith('AMAZON-'))) {
        isVine = true;
      }

      if (!isVine) return null;

      return {
        sku: row.sku || null,
        asin: asin || null,
        orderId: orderId || null,
        title: row.item_name || '',
        platform: row.platform || 'Outpost',
        salePrice: parseFloat(row.gross_sale_price) || 0,
        netProceeds: (row.net_proceeds !== null && row.net_proceeds !== undefined) ? parseFloat(row.net_proceeds) : null,
        netProfit: (row.net_profit !== null && row.net_profit !== undefined) ? parseFloat(row.net_profit) : null,
        trueCost: (row.true_total_cost !== null && row.true_total_cost !== undefined) ? parseFloat(row.true_total_cost) : null,
        roiPct: (row.roi_pct !== null && row.roi_pct !== undefined) ? parseFloat(row.roi_pct) : null,
        platformFees: (row.platform_fees_amt !== null && row.platform_fees_amt !== undefined) ? parseFloat(row.platform_fees_amt) : 0,
        shippingCost: (row.actual_shipping_cost !== null && row.actual_shipping_cost !== undefined) ? parseFloat(row.actual_shipping_cost) : 0,
        saleDate: row.sale_date || new Date().toISOString().slice(0, 10)
      };
    }).filter(Boolean);

    return new Response(JSON.stringify({ success: true, data: salesList }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VINESCOUT_EXPORT] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
