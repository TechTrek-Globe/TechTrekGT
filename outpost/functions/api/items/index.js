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
    const prepStatus = url.searchParams.get('prep_status') || '';
    const invoice_id = url.searchParams.get('invoice_id') || '';
    const q          = url.searchParams.get('q') || '';
    const page       = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit      = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const offset     = (page - 1) * limit;

    // Build dynamic WHERE clauses
    const conditions = ['i.user_id = ?'];
    const bindings   = [payload.userId];

    if (status) { conditions.push('i.status = ?'); bindings.push(status); }
    if (prepStatus) { conditions.push('i.prep_status = ?'); bindings.push(prepStatus); }
    if (invoice_id) { conditions.push('i.invoice_id = ?'); bindings.push(invoice_id); }
    if (q) {
      conditions.push('(i.item_name LIKE ? OR i.athlete_person LIKE ? OR i.category LIKE ? OR i.item_subtype LIKE ? OR i.sku LIKE ? OR i.storage_location LIKE ?)');
      const like = `%${q}%`;
      bindings.push(like, like, like, like, like, like);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = 'SELECT COUNT(*) AS total FROM auction_items i WHERE ' + whereClause;
    const countRow = await env.DB.prepare(countSql).bind(...bindings).first();

    const orderClause = (!status || status === 'All')
      ? `ORDER BY CASE LOWER(TRIM(i.status))
          WHEN 'listed' THEN 1
          WHEN 'available' THEN 2
          WHEN 'kept for self' THEN 3
          WHEN 'draft' THEN 4
          WHEN 'unsold' THEN 5
          WHEN 'returned' THEN 6
          ELSE 7
        END ASC, i.created_at DESC`
      : 'ORDER BY i.created_at DESC';

    const rowsSql = 'SELECT i.*, inv.invoice_ref, '
      + "json_object('inv_discount', inv.discount, 'inv_shipping', inv.shipping, 'inv_tax', inv.tax) AS _inv_json, "
      + "json_object('sale_id', s.id, 'buyer_handle', s.buyer_handle, 'gross_sale_price', s.gross_sale_price, 'buyer_shipping_paid', s.buyer_shipping_paid, 'actual_shipping_cost', s.actual_shipping_cost, 'platform_fees_amt', s.platform_fees_amt, 'promoted_listing_fee', s.promoted_listing_fee, 'net_proceeds', s.net_proceeds, 'net_profit', s.net_profit, 'ebay_order_id', s.ebay_order_id, 'fee_reconciled_at', s.fee_reconciled_at) AS _sale_json, "
      + "json_object('recon_final_value_fee', r.final_value_fee, 'recon_promoted_listing_fee', r.promoted_listing_fee, 'recon_shipping_label_cost', r.shipping_label_cost) AS _recon_json "
      + 'FROM auction_items i '
      + 'LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id '
      + 'LEFT JOIN auction_sales s ON i.id = s.item_id AND s.user_id = i.user_id '
      + 'LEFT JOIN ebay_fee_reconciliations r ON s.id = r.sale_id AND r.user_id = i.user_id '
      + 'WHERE ' + whereClause + ' '
      + orderClause + ' '
      + 'LIMIT ? OFFSET ?';
    const rows = await env.DB.prepare(rowsSql).bind(...bindings, limit, offset).all();

    const parseJsonSafe = (raw) => {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try { const p = JSON.parse(raw); return p && typeof p === 'object' ? p : {}; } catch (_) { return {}; }
    };

    const cleanedItems = (rows.results || []).map(rawRow => {
      const { _inv_json, _sale_json, _recon_json, ...row } = rawRow;
      return {
        ...row,
        ...parseJsonSafe(_inv_json),
        ...parseJsonSafe(_sale_json),
        ...parseJsonSafe(_recon_json),
        item_name: cleanItemName(row.item_name),
        athlete_person: cleanAthleteName(row.athlete_person)
      };
    });

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
