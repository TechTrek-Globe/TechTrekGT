import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { cleanItemName, cleanAthleteName } from '../../utils/auction.js';
import {
  parseImageFromNotes,
  parseUserNote,
  cleanEbaySearchQuery,
  buildEbaySearchUrl,
  normalizeHttps
} from '../../utils/ebayUtils.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

// ============================================================
// GET /api/items/enriched
//   Returns items with comp data pre-joined, paginated.
//   Query params: status, invoice_id, q, page, limit
// ============================================================

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const status         = url.searchParams.get('status') || '';
    const includeSold    = url.searchParams.get('include_sold') === 'true' || url.searchParams.get('include_sold') === '1';
    const category       = url.searchParams.get('category') || '';
    const listingFormat  = url.searchParams.get('listing_format') || '';
    const listingStatus  = url.searchParams.get('listing_status') || '';
    const invoice_id     = url.searchParams.get('invoice_id') || '';
    const q              = url.searchParams.get('q') || '';
    const sortByParam    = url.searchParams.get('sort_by') || 'created_at';
    const sortDirParam   = (url.searchParams.get('sort_dir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const page           = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit          = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const offset         = (page - 1) * limit;

    if (q) {
      const rl = await checkRateLimit(env, `items-search:${payload.userId}`, 60, 60, false);
      if (!rl.allowed) {
        return new Response(JSON.stringify({ error: 'Search rate limit exceeded. Please wait a moment before searching again.' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rl.retryAfter || 60)
          }
        });
      }
    }

    // Allowed sort columns (whitelist against SQL injection)
    const SORT_COLUMN_MAP = {
      'created_at': 'i.created_at',
      'item_name': 'i.item_name',
      'athlete_person': 'i.athlete_person',
      'status': 'i.status',
      'category': 'i.category',
      'true_total_cost': 'i.true_total_cost',
      'min_sell_price': 'i.min_sell_price',
      'suggested_list_price': 'i.suggested_list_price',
      'current_list_price': 'i.current_list_price',
      'target_margin_pct': 'i.target_margin_pct',
      'date_acquired': 'i.date_acquired',
      'date_listed': 'i.date_listed',
      'days_on_market': 'i.days_on_market',
      'sku': 'i.sku',
      'listing_format': 'i.listing_format',
      'listing_status': 'i.listing_status',
      'floor_price': 'i.floor_price',
      'buy_it_now_price': 'i.buy_it_now_price'
    };
    const sortCol = SORT_COLUMN_MAP[sortByParam] || 'i.created_at';
    const STATUS_CASE_SQL = `CASE LOWER(TRIM(i.status))
      WHEN 'listed' THEN 1
      WHEN 'available' THEN 2
      WHEN 'kept for self' THEN 3
      WHEN 'draft' THEN 4
      WHEN 'unsold' THEN 5
      WHEN 'returned' THEN 6
      ELSE 7
    END`;

    let orderByClause;
    if (sortByParam === 'status') {
      orderByClause = `ORDER BY ${STATUS_CASE_SQL} ${sortDirParam}, i.created_at DESC`;
    } else if (sortByParam === 'created_at' && sortDirParam === 'DESC' && (!status || status === 'All')) {
      orderByClause = `ORDER BY ${STATUS_CASE_SQL} ASC, i.created_at DESC`;
    } else {
      orderByClause = `ORDER BY ${sortCol} ${sortDirParam}`;
    }

    // Build dynamic WHERE clauses
    const conditions = ['i.user_id = ?'];
    const bindings   = [payload.userId];

    if (status) {
      if (status === 'active') {
        conditions.push("i.status IN ('Available', 'Listed')");
      } else {
        conditions.push('i.status = ?');
        bindings.push(status);
      }
    } else if (!includeSold) {
      conditions.push("i.status != 'Sold'");
    }
    if (category && category !== 'All') {
      conditions.push('i.category = ?');
      bindings.push(category);
    }
    if (listingFormat && listingFormat !== 'All') {
      conditions.push('i.listing_format = ?');
      bindings.push(listingFormat);
    }
    if (listingStatus && listingStatus !== 'All') {
      conditions.push('i.listing_status = ?');
      bindings.push(listingStatus);
    }
    if (invoice_id) { conditions.push('i.invoice_id = ?'); bindings.push(invoice_id); }
    if (q) {
      conditions.push('(i.item_name LIKE ? OR i.athlete_person LIKE ? OR i.category LIKE ? OR i.cert_number LIKE ? OR i.authenticator LIKE ? OR i.sku LIKE ?)');
      const like = `%${q}%`;
      bindings.push(like, like, like, like, like, like);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = 'SELECT COUNT(*) AS total FROM auction_items i WHERE ' + whereClause;
    const countRow = await env.DB.prepare(countSql).bind(...bindings).first();

    // Dynamic status counts breakdown across active inventory (matching non-status filters)
    const statusConditions = ['i.user_id = ?', "i.status != 'Sold'"];
    const statusBindings = [payload.userId];
    if (category && category !== 'All') {
      statusConditions.push('i.category = ?');
      statusBindings.push(category);
    }
    if (listingFormat && listingFormat !== 'All') {
      statusConditions.push('i.listing_format = ?');
      statusBindings.push(listingFormat);
    }
    if (listingStatus && listingStatus !== 'All') {
      statusConditions.push('i.listing_status = ?');
      statusBindings.push(listingStatus);
    }
    if (invoice_id) {
      statusConditions.push('i.invoice_id = ?');
      statusBindings.push(invoice_id);
    }
    if (q) {
      statusConditions.push('(i.item_name LIKE ? OR i.athlete_person LIKE ? OR i.category LIKE ? OR i.cert_number LIKE ? OR i.authenticator LIKE ? OR i.sku LIKE ?)');
      const like = `%${q}%`;
      statusBindings.push(like, like, like, like, like, like);
    }

    const statusCountsSql = 'SELECT i.status, COUNT(*) AS count FROM auction_items i WHERE ' + statusConditions.join(' AND ') + ' GROUP BY i.status';
    const statusCountsRows = await env.DB.prepare(statusCountsSql).bind(...statusBindings).all();
    const statusCounts = {};
    (statusCountsRows.results || []).forEach(r => {
      if (r.status) statusCounts[r.status] = r.count;
    });

    const rowsSql = 'SELECT '
      + 'i.*, '
      + 'inv.invoice_ref, '
      + 'inv.discount AS inv_discount, '
      + 'inv.shipping AS inv_shipping, '
      + 'inv.tax AS inv_tax, '
      + 'c.id AS comp_id, '
      + 'c.comp_1, '
      + 'c.comp_2, '
      + 'c.comp_3, '
      + 'c.manual_avg, '
      + 'c.live_avg, '
      + 'c.active_comp_1, '
      + 'c.active_comp_2, '
      + 'c.active_comp_3, '
      + 'c.active_avg, '
      + 'c.sold_count, '
      + 'c.ebay_search_url AS comp_ebay_search_url, '
      + 'c.recommended_list_price, '
      + 'c.updated_at AS comp_updated_at, '
      + 's.id AS sale_id, '
      + 's.gross_sale_price, '
      + 's.buyer_shipping_paid, '
      + 's.actual_shipping_cost, '
      + 's.platform_fees_amt, '
      + 's.promoted_listing_fee, '
      + 's.net_proceeds, '
      + 's.net_profit, '
      + 's.buyer_handle, '
      + 's.ebay_order_id, '
      + 's.fee_reconciled_at, '
      + 'r.final_value_fee AS recon_final_value_fee, '
      + 'r.promoted_listing_fee AS recon_promoted_listing_fee, '
      + 'r.shipping_label_cost AS recon_shipping_label_cost '
      + 'FROM auction_items i '
      + 'LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id '
      + 'LEFT JOIN auction_comps c ON i.id = c.item_id AND c.user_id = i.user_id '
      + 'LEFT JOIN auction_sales s ON i.id = s.item_id AND s.user_id = i.user_id '
      + 'LEFT JOIN ebay_fee_reconciliations r ON s.id = r.sale_id AND r.user_id = i.user_id '
      + 'WHERE ' + whereClause + ' '
      + orderByClause + ' '
      + 'LIMIT ? OFFSET ?';
    const rows = await env.DB.prepare(rowsSql).bind(...bindings, limit, offset).all();

    const enrichedItems = (rows.results || []).map(row => {
      const isAmazon = typeof row.invoice_ref === 'string' && row.invoice_ref.startsWith('AMAZON-');
      const userNote = parseUserNote(row.notes);
      const searchUrl = buildEbaySearchUrl(row.item_name, row.athlete_person, row.authenticator);

      // Prefer normalized relational columns first
      let asin = row.asin ? String(row.asin).trim().toUpperCase() : null;
      let orderId = row.order_id ? String(row.order_id).trim() : null;
      let isVineScout = Boolean(row.is_vinescout);
      let etv = row.etv != null ? Number(row.etv) : null;
      let taxCost = row.tax_cost != null ? Number(row.tax_cost) : null;
      let certVerified = Boolean(row.cert_verified);
      let certVerifiedAt = row.cert_verified_at || null;
      let imageUrl = row.image_url ? normalizeHttps(row.image_url) : parseImageFromNotes(row.notes);

      // Fallback: parse attributes JSON if explicit columns were empty
      if (row.attributes && (!asin || !orderId || !imageUrl || !etv)) {
        try {
          const parsed = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
          if (parsed && typeof parsed === 'object') {
            if (!asin && parsed.asin) asin = String(parsed.asin).trim().toUpperCase();
            if (!orderId && parsed.order_id) orderId = String(parsed.order_id).trim();
            if (!isVineScout && (parsed.source === 'amazon_vinescout' || parsed.is_vinescout)) isVineScout = true;
            if (etv == null && parsed.etv != null) etv = Number(parsed.etv);
            if (taxCost == null && parsed.tax_cost != null) taxCost = Number(parsed.tax_cost);
            if (!certVerified && parsed.cert_verified) certVerified = true;
            if (!certVerifiedAt && parsed.cert_verified_at) certVerifiedAt = parsed.cert_verified_at;

            if (!imageUrl) {
              if (parsed.ebay_image_url) {
                imageUrl = normalizeHttps(parsed.ebay_image_url);
              } else if (parsed.image_url) {
                imageUrl = normalizeHttps(parsed.image_url);
              } else if (parsed.image_urls) {
                const imgs = Array.isArray(parsed.image_urls)
                  ? parsed.image_urls
                  : (() => { try { return JSON.parse(parsed.image_urls); } catch (_) { return []; } })();
                if (Array.isArray(imgs) && imgs[0]) imageUrl = normalizeHttps(imgs[0]);
              }
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
        const mInv = row.invoice_ref.match(/AMAZON-(B0[A-Z0-9]{8})/i);
        if (mInv) asin = mInv[1].toUpperCase();
      }

      if (asin || orderId || isAmazon) {
        isVineScout = true;
      }

      return {
        ...row,
        item_name: cleanItemName(row.item_name),
        athlete_person: cleanAthleteName(row.athlete_person),
        ebay_search_url: searchUrl,
        image_url: normalizeHttps(imageUrl),
        user_note: userNote,
        is_amazon: isAmazon,
        is_vinescout: isVineScout,
        asin: asin,
        order_id: orderId,
        etv: etv,
        tax_cost: taxCost,
        cert_verified: certVerified,
        cert_verified_at: certVerifiedAt
      };
    });

    return ok({
      items: enrichedItems,
      pagination: {
        total: countRow?.total || 0,
        page,
        limit,
        pages: Math.ceil((countRow?.total || 0) / limit)
      },
      status_counts: statusCounts
    });
  });
}

