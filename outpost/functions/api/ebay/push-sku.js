import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, updateEbayListingSku } from './tokenHelper.js';
import { generateSku, generateUniqueSku } from '../utils/sku.js';

/**
 * POST /api/ebay/push-sku
 *
 * Pushes Outpost SKU / Custom Label directly to active eBay listings.
 *
 * Body Options:
 *   - { item_id: string, sku?: string } - Push a single item's SKU to eBay
 *   - { all: true } - Push all linked items with valid SKUs to eBay
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));

    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, payload.userId);
    } catch (e) {
      console.error('[push-sku] eBay authentication failed:', e);
      return err('eBay authentication failed. Please reconnect your eBay account.', 401);
    }

    // 1. Single Item Push
    if (body.item_id) {
      const item = await env.DB.prepare(
        'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
      ).bind(body.item_id, payload.userId).first();

      if (!item) return err('Item not found', 404);
      if (!item.ebay_listing_id) return err('Item is not linked to an eBay Listing ID', 400);

      // If SKU was passed in body or missing in DB, resolve and persist it
      let targetSku = (body.sku || item.sku || '').trim();
      if (!targetSku) {
        targetSku = await generateUniqueSku(env.DB, payload.userId, item.date_acquired || new Date(), 5);
        await env.DB.prepare(
          'UPDATE auction_items SET sku = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?'
        ).bind(targetSku, item.id, payload.userId).run();
      }

      try {
        const result = await updateEbayListingSku(env, accessToken, item.ebay_listing_id, targetSku);
        return ok({
          success: true,
          item_id: item.id,
          ebay_listing_id: item.ebay_listing_id,
          sku: targetSku,
          message: result.message
        });
      } catch (pushErr) {
        console.error('[push-sku] Failed to push SKU to eBay:', pushErr);
        return err('Failed to push SKU to eBay. Please verify your listing and try again.', 502);
      }
    }

    // 2. Bulk Push for All Linked Items
    if (body.all) {
      const rows = await env.DB.prepare(
        `SELECT id, item_name, ebay_listing_id, sku, date_acquired
         FROM auction_items
         WHERE user_id = ? AND ebay_listing_id IS NOT NULL AND status IN ('Listed', 'Available', 'Draft')`
      ).bind(payload.userId).all();

      const items = rows.results || [];
      if (items.length === 0) {
        return ok({ success: true, count: 0, message: 'No linked active eBay listings found' });
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      const seenSkus = new Set();
      for (const it of items) {
        let currentSku = (it.sku || '').trim();
        if (!currentSku) {
          currentSku = await generateUniqueSku(env.DB, payload.userId, it.date_acquired || new Date(), 5, seenSkus);
          await env.DB.prepare(
            'UPDATE auction_items SET sku = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?'
          ).bind(currentSku, it.id, payload.userId).run();
        } else {
          seenSkus.add(currentSku);
        }

        try {
          await updateEbayListingSku(env, accessToken, it.ebay_listing_id, currentSku);
          results.push({ id: it.id, listing_id: it.ebay_listing_id, sku: currentSku, status: 'success' });
          successCount++;
        } catch (e) {
          console.error(`[push-sku] Failed to push SKU for item ${it.id}:`, e);
          results.push({ id: it.id, listing_id: it.ebay_listing_id, sku: currentSku, status: 'failed', error: 'Failed to update eBay listing SKU.' });
          failCount++;
        }
      }

      return ok({
        success: true,
        total: items.length,
        synced: successCount,
        failed: failCount,
        results,
        message: `Pushed ${successCount} SKUs to eBay (${failCount} errors)`
      });
    }

    return err('Provide either item_id or all:true in request body', 400);
  });
}
