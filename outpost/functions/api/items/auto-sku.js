import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { generateSku } from '../utils/sku.js';

/**
 * POST /api/items/auto-sku
 *
 * Scans all inventory items for the authenticated user and automatically assigns
 * a unique structured SKU (OP-YYMMDD-XXXX) to any item currently missing one.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const rows = await env.DB.prepare(
      `SELECT id, item_name, date_acquired, sku
       FROM auction_items
       WHERE user_id = ? AND (sku IS NULL OR trim(sku) = '')`
    ).bind(payload.userId).all();

    const blankItems = rows.results || [];
    if (blankItems.length === 0) {
      return ok({
        success: true,
        count: 0,
        message: 'All inventory items already have assigned SKUs'
      });
    }

    const statements = [];
    const assigned = [];

    for (const it of blankItems) {
      const newSku = generateSku(it.date_acquired || new Date());
      statements.push(
        env.DB.prepare(
          'UPDATE auction_items SET sku = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?'
        ).bind(newSku, it.id, payload.userId)
      );
      assigned.push({ id: it.id, item_name: it.item_name, sku: newSku });
    }

    // Execute in D1 batch
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    return ok({
      success: true,
      count: assigned.length,
      assigned,
      message: `Successfully auto-assigned SKUs to ${assigned.length} items`
    });
  });
}
