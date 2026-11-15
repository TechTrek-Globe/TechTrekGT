import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { ensureImportBatchTables } from '../../utils/importBatches.js';

/**
 * GET /api/import/batches
 * Lists paginated historical import batches for the authenticated user,
 * including linked invoice references and archived file availability.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10) || 25));
    const offset = (page - 1) * limit;

    const countSql = 'SELECT COUNT(*) AS total FROM import_batches WHERE user_id = ?';
    const listSql = `
      SELECT
        b.id,
        b.source_type,
        b.file_name,
        b.mime_type,
        b.file_size,
        b.file_sha256,
        b.strategy,
        b.invoice_count,
        b.item_count,
        b.sale_count,
        b.comp_count,
        b.total_cost_basis,
        b.has_file_blob,
        b.status,
        b.created_at,
        (
          SELECT GROUP_CONCAT(ref_name, ', ')
          FROM (
            SELECT DISTINCT inv.invoice_ref AS ref_name
            FROM auction_invoices inv
            WHERE inv.user_id = b.user_id AND inv.import_batch_id = b.id
            ORDER BY inv.created_at ASC
            LIMIT 8
          )
        ) AS invoice_refs
      FROM import_batches b
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const runQuery = async () => {
      if (typeof env.DB.batch === 'function') {
        const res = await env.DB.batch([
          env.DB.prepare(countSql).bind(userId),
          env.DB.prepare(listSql).bind(userId, limit, offset)
        ]);
        if (res && res[0] && Array.isArray(res[0].results)) {
          return {
            total: Number(res[0].results[0]?.total || 0),
            batches: res[1]?.results || []
          };
        }
      }
      const countRow = await env.DB.prepare(countSql).bind(userId).first();
      const rows = await env.DB.prepare(listSql).bind(userId, limit, offset).all();
      return {
        total: Number(countRow?.total || 0),
        batches: rows?.results || []
      };
    };

    let data;
    try {
      data = await runQuery();
    } catch (queryErr) {
      if (String(queryErr?.message || '').includes('no such table')) {
        await ensureImportBatchTables(env.DB);
        data = await runQuery();
      } else {
        throw queryErr;
      }
    }

    const totalPages = Math.max(1, Math.ceil(data.total / limit));
    return ok({
      batches: data.batches,
      pagination: {
        page,
        limit,
        total: data.total,
        totalPages
      }
    });
  });
}
