import { requireAuth, withAuth, ok, err } from '../../../utils/guard.js';
import { ensureImportBatchTables } from '../../../utils/importBatches.js';

/**
 * GET /api/import/batches/:id
 * Returns import batch metadata alongside linked invoices and items for the authenticated user.
 */
export async function onRequestGet(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const batchId = params?.id || parts[parts.length - 1] || '';
    if (!batchId || batchId === 'batches') {
      return err('Batch ID is required', 400);
    }

    const runQuery = async () => {
      const batch = await env.DB.prepare(`
        SELECT
          id, source_type, file_name, mime_type, file_size, file_sha256,
          strategy, invoice_count, item_count, sale_count, comp_count,
          total_cost_basis, has_file_blob, status, created_at
        FROM import_batches
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `).bind(batchId, userId).first();

      if (!batch) return null;

      const [invRes, itemRes] = await env.DB.batch([
        env.DB.prepare(`
          SELECT
            id, invoice_ref, description, base_total, discount, shipping, tax, date_acquired, created_at
          FROM auction_invoices
          WHERE user_id = ? AND import_batch_id = ?
          ORDER BY created_at ASC
        `).bind(userId, batchId),
        env.DB.prepare(`
          SELECT
            id, invoice_id, sku, item_name, category, unit_price, true_total_cost,
            status, platform, current_list_price, actual_sell_price,
            is_vinescout, attributes, date_acquired, created_at
          FROM auction_items
          WHERE user_id = ? AND import_batch_id = ?
          ORDER BY created_at ASC
        `).bind(userId, batchId)
      ]);

      return {
        batch,
        invoices: invRes?.results || [],
        items: itemRes?.results || []
      };
    };

    let result;
    try {
      result = await runQuery();
    } catch (queryErr) {
      if (String(queryErr?.message || '').includes('no such table')) {
        await ensureImportBatchTables(env.DB);
        result = await runQuery();
      } else {
        throw queryErr;
      }
    }

    if (!result) {
      return err('Import batch not found', 404);
    }

    const normalizedItems = result.items.map(it => {
      let isVine = Number(it.is_vinescout) === 1;
      if (!isVine && it.attributes) {
        try {
          const parsed = typeof it.attributes === 'string' ? JSON.parse(it.attributes) : it.attributes;
          if (parsed?.source === 'amazon_vinescout' || parsed?.is_vinescout === true || parsed?.vine_program === true) {
            isVine = true;
          }
        } catch (_) {}
      }
      return {
        id: it.id,
        invoice_id: it.invoice_id,
        sku: it.sku,
        item_name: it.item_name,
        category: it.category,
        unit_price: it.unit_price,
        true_total_cost: it.true_total_cost,
        status: it.status,
        platform: it.platform,
        current_list_price: it.current_list_price,
        actual_sell_price: it.actual_sell_price,
        is_vinescout: isVine,
        date_acquired: it.date_acquired,
        created_at: it.created_at
      };
    });

    return ok({
      batch: result.batch,
      invoices: result.invoices,
      items: normalizedItems
    });
  });
}
