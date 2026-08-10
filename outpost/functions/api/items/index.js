import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { cleanItemName, cleanAthleteName } from '../../utils/auction.js';

// ============================================================
// GET /api/items  - list all items for authenticated user
//   Query params:
//   - status: filter by status (Available, Listed, Sold, etc.)
//   - invoice_id: filter by invoice
//   - q: search item_name or athlete_person
//   - page: page number (default 1)
//   - limit: page size (default 50, max 200)
// ============================================================

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const status     = url.searchParams.get('status') || '';
    const invoice_id = url.searchParams.get('invoice_id') || '';
    const q          = url.searchParams.get('q') || '';
    const page       = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit      = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const offset     = (page - 1) * limit;

    // Build dynamic WHERE clauses
    const conditions = ['i.user_id = ?'];
    const bindings   = [payload.userId];

    if (status) { conditions.push('i.status = ?'); bindings.push(status); }
    if (invoice_id) { conditions.push('i.invoice_id = ?'); bindings.push(invoice_id); }
    if (q) {
      conditions.push('(i.item_name LIKE ? OR i.athlete_person LIKE ? OR i.category LIKE ?)');
      const like = `%${q}%`;
      bindings.push(like, like, like);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM auction_items i WHERE ${whereClause}`
    ).bind(...bindings).first();

    const rows = await env.DB.prepare(`
      SELECT
        i.*,
        inv.invoice_ref,
        inv.discount AS inv_discount,
        inv.shipping AS inv_shipping,
        inv.tax      AS inv_tax
      FROM auction_items i
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      WHERE ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    const cleanedItems = (rows.results || []).map(row => ({
      ...row,
      item_name: cleanItemName(row.item_name),
      athlete_person: cleanAthleteName(row.athlete_person)
    }));

    return ok({
      items: cleanedItems,
      pagination: {
        total: countRow?.total || 0,
        page,
        limit,
        pages: Math.ceil((countRow?.total || 0) / limit)
      }
    });
  });
}
