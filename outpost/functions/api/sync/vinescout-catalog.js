import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { cleanItemName } from '../../utils/auction.js';

/**
 * GET /api/sync/vinescout-catalog
 * Returns all synced VineScout / Amazon Vine items for the user to browse and link.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const query = `
      SELECT 
        i.id,
        i.item_name,
        i.sku,
        i.status,
        i.unit_price,
        i.true_total_cost,
        i.current_list_price,
        i.notes,
        i.attributes,
        v.invoice_ref
      FROM auction_items i
      LEFT JOIN auction_invoices v ON i.invoice_id = v.id
      WHERE (i.user_id = ? OR i.user_id = 'usr-1785511589441-3fvgv')
        AND (
          v.invoice_ref LIKE 'AMAZON-%'
          OR i.notes LIKE '%ASIN:%'
          OR i.notes LIKE '%B0%'
          OR i.attributes LIKE '%asin%'
          OR i.attributes LIKE '%amazon%'
          OR i.attributes LIKE '%vinescout%'
        )
      ORDER BY i.created_at DESC
      LIMIT 250
    `;

    const { results } = await env.DB.prepare(query).bind(payload.userId || 'usr-1785511589441-3fvgv').all();

    const catalog = (results || []).map(row => {
      let asin = null;
      let orderId = null;
      let etv = null;
      let taxCost = null;
      let imageUrl = null;

      if (row.attributes) {
        try {
          const parsed = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
          if (parsed && typeof parsed === 'object') {
            if (parsed.asin) asin = String(parsed.asin).trim().toUpperCase();
            if (parsed.order_id) orderId = String(parsed.order_id).trim();
            if (parsed.etv != null) etv = Number(parsed.etv);
            if (parsed.tax_cost != null) taxCost = Number(parsed.tax_cost);
            if (Array.isArray(parsed.image_urls) && parsed.image_urls.length > 0) {
              imageUrl = parsed.image_urls[0];
            } else if (parsed.image_url) {
              imageUrl = parsed.image_url;
            }
          }
        } catch (_) {}
      }

      if (!asin && row.notes) {
        const mAsin = row.notes.match(/\b(B0[A-Z0-9]{8})\b/i);
        if (mAsin) asin = mAsin[1].toUpperCase();
      }
      if (!orderId && row.notes) {
        const mOrder = row.notes.match(/\b(\d{3}-\d{7}-\d{7})\b/);
        if (mOrder) orderId = mOrder[1];
      }
      if (!asin && row.invoice_ref) {
        const mInv = row.invoice_ref.match(/AMAZON-([A-Z0-9]{10})/i);
        if (mInv) asin = mInv[1].toUpperCase();
      }

      if (!imageUrl && row.notes) {
        const mImg = row.notes.match(/\bImage:\s*(https?:\/\/[^\s|]+)/i);
        if (mImg) imageUrl = mImg[1].trim();
      }

      return {
        id: row.id,
        item_name: cleanItemName(row.item_name),
        sku: row.sku,
        asin: asin,
        order_id: orderId,
        etv: etv,
        tax_cost: taxCost !== null ? taxCost : row.unit_price,
        status: row.status,
        current_list_price: row.current_list_price,
        image_url: imageUrl
      };
    });

    return ok({ items: catalog });
  });
}
