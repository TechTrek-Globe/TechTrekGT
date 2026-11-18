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
    const prepStatus     = url.searchParams.get('prep_status') || '';
    const invoice_id     = url.searchParams.get('invoice_id') || '';
    const q              = url.searchParams.get('q') || '';
    const sortByParam    = url.searchParams.get('sort_by') || 'created_at';
    const sortDirParam   = (url.searchParams.get('sort_dir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const page           = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit          = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const offset         = (page - 1) * limit;

    if (q) {
      const rl = await checkRateLimit(env.RATE_LIMIT_KV, `items-search:${payload.userId}`, 60, 60, true, env.RATE_LIMIT_DO);
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
      'buy_it_now_price': 'i.buy_it_now_price',
      'item_condition': 'i.item_condition',
      'prep_status': 'i.prep_status',
      'framing_status': 'i.framing_status',
      'storage_location': 'i.storage_location',
      'source_vendor': 'i.source_vendor',
      'net_profit': 'COALESCE(s.net_profit, (COALESCE(i.current_list_price, i.suggested_list_price, 0) - i.true_total_cost))',
      'margin': 'COALESCE(i.target_margin_pct, 0)',
      'days_in_inventory': 'COALESCE(i.days_on_market, 0)'
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
    } else if (sortByParam === 'net_profit') {
      orderByClause = `ORDER BY COALESCE(s.net_profit, (COALESCE(i.current_list_price, i.suggested_list_price, 0) - i.true_total_cost)) ${sortDirParam}, i.created_at DESC`;
    } else if (sortByParam === 'margin') {
      orderByClause = `ORDER BY COALESCE(i.target_margin_pct, 0) ${sortDirParam}, i.created_at DESC`;
    } else if (sortByParam === 'days_in_inventory') {
      orderByClause = `ORDER BY COALESCE(i.days_on_market, 0) ${sortDirParam}, i.created_at DESC`;
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
    if (prepStatus && prepStatus !== 'All') {
      conditions.push('i.prep_status = ?');
      bindings.push(prepStatus);
    }
    if (invoice_id) { conditions.push('i.invoice_id = ?'); bindings.push(invoice_id); }
    if (q) {
      conditions.push('(i.item_name LIKE ? OR i.athlete_person LIKE ? OR i.category LIKE ? OR i.item_subtype LIKE ? OR i.cert_number LIKE ? OR i.authenticator LIKE ? OR i.sku LIKE ? OR i.storage_location LIKE ? OR i.source_vendor LIKE ?)');
      const like = `%${q}%`;
      bindings.push(like, like, like, like, like, like, like, like, like);
    }

    const whereClause = conditions.join(' AND ');

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
    if (prepStatus && prepStatus !== 'All') {
      statusConditions.push('i.prep_status = ?');
      statusBindings.push(prepStatus);
    }
    if (invoice_id) {
      statusConditions.push('i.invoice_id = ?');
      statusBindings.push(invoice_id);
    }
    if (q) {
      statusConditions.push('(i.item_name LIKE ? OR i.athlete_person LIKE ? OR i.category LIKE ? OR i.item_subtype LIKE ? OR i.cert_number LIKE ? OR i.authenticator LIKE ? OR i.sku LIKE ? OR i.storage_location LIKE ? OR i.source_vendor LIKE ?)');
      const like = `%${q}%`;
      statusBindings.push(like, like, like, like, like, like, like, like, like);
    }

    const statusCountsSql = 'SELECT i.status, COUNT(*) AS count FROM auction_items i WHERE ' + statusConditions.join(' AND ') + ' GROUP BY i.status';

    const rowsSql = 'SELECT '
      + 'i.*, '
      + 'inv.invoice_ref, '
      + "json_object('inv_discount', inv.discount, 'inv_shipping', inv.shipping, 'inv_tax', inv.tax) AS _inv_json, "
      + "json_object('comp_id', c.id, 'comp_1', c.comp_1, 'comp_2', c.comp_2, 'comp_3', c.comp_3, 'manual_avg', c.manual_avg, 'live_avg', c.live_avg, 'active_comp_1', c.active_comp_1, 'active_comp_2', c.active_comp_2, 'active_comp_3', c.active_comp_3, 'active_avg', c.active_avg, 'sold_count', c.sold_count, 'comp_ebay_search_url', c.ebay_search_url, 'recommended_list_price', c.recommended_list_price, 'comp_updated_at', c.updated_at) AS _comp_json, "
      + "json_object('sale_id', s.id, 'gross_sale_price', s.gross_sale_price, 'buyer_shipping_paid', s.buyer_shipping_paid, 'actual_shipping_cost', s.actual_shipping_cost, 'platform_fees_amt', s.platform_fees_amt, 'promoted_listing_fee', s.promoted_listing_fee, 'net_proceeds', s.net_proceeds, 'net_profit', s.net_profit, 'buyer_handle', s.buyer_handle, 'ebay_order_id', s.ebay_order_id, 'fee_reconciled_at', s.fee_reconciled_at) AS _sale_json, "
      + "json_object('recon_final_value_fee', r.final_value_fee, 'recon_promoted_listing_fee', r.promoted_listing_fee, 'recon_shipping_label_cost', r.shipping_label_cost) AS _recon_json "
      + 'FROM auction_items i '
      + 'LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id '
      + 'LEFT JOIN auction_comps c ON i.id = c.item_id AND c.user_id = i.user_id '
      + 'LEFT JOIN auction_sales s ON i.id = s.item_id AND s.user_id = i.user_id '
      + 'LEFT JOIN ebay_fee_reconciliations r ON s.id = r.sale_id AND r.user_id = i.user_id '
      + 'WHERE ' + whereClause + ' '
      + orderByClause + ' '
      + 'LIMIT ? OFFSET ?';

    // OPT-A: Batch D1 queries into a single round trip.
    // If includeSold or explicit 'Sold' filter is requested, query count explicitly.
    // Otherwise, derive total directly from status_counts, eliminating countSql completely.
    const needsExplicitCount = includeSold || status === 'Sold';
    const countSql = 'SELECT COUNT(*) AS total FROM auction_items i WHERE ' + whereClause;

    let total = 0;
    const statusCounts = {};
    let rows = { results: [] };

    if (typeof env.DB.batch === 'function') {
      const batchStmts = [
        env.DB.prepare(statusCountsSql).bind(...statusBindings),
        env.DB.prepare(rowsSql).bind(...bindings, limit, offset)
      ];
      if (needsExplicitCount) {
        batchStmts.unshift(env.DB.prepare(countSql).bind(...bindings));
      }

      const batchResults = await env.DB.batch(batchStmts);

      if (batchResults && batchResults[0] && Array.isArray(batchResults[0].results)) {
        if (needsExplicitCount) {
          total = Number(batchResults[0].results[0]?.total || 0);
          (batchResults[1].results || []).forEach(r => {
            if (r.status) statusCounts[r.status] = r.count;
          });
          rows = batchResults[2] || { results: [] };
        } else {
          (batchResults[0].results || []).forEach(r => {
            if (r.status) statusCounts[r.status] = r.count;
          });
          rows = batchResults[1] || { results: [] };
          if (status === 'active') {
            total = (statusCounts['Available'] || 0) + (statusCounts['Listed'] || 0);
          } else if (status) {
            total = statusCounts[status] || 0;
          } else {
            total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
          }
        }
      } else {
        // Fallback when batch execution does not return row sets (e.g. test harness mockDb)
        if (needsExplicitCount) {
          const countRow = await env.DB.prepare(countSql).bind(...bindings).first();
          total = Number(countRow?.total || 0);
        }
        const statusCountsRows = await env.DB.prepare(statusCountsSql).bind(...statusBindings).all();
        (statusCountsRows.results || []).forEach(r => {
          if (r.status) statusCounts[r.status] = r.count;
        });
        if (!needsExplicitCount) {
          if (status === 'active') {
            total = (statusCounts['Available'] || 0) + (statusCounts['Listed'] || 0);
          } else if (status) {
            total = statusCounts[status] || 0;
          } else {
            total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
          }
        }
        rows = await env.DB.prepare(rowsSql).bind(...bindings, limit, offset).all();
      }
    } else {
      if (needsExplicitCount) {
        const countRow = await env.DB.prepare(countSql).bind(...bindings).first();
        total = Number(countRow?.total || 0);
      }
      const statusCountsRows = await env.DB.prepare(statusCountsSql).bind(...statusBindings).all();
      (statusCountsRows.results || []).forEach(r => {
        if (r.status) statusCounts[r.status] = r.count;
      });
      if (!needsExplicitCount) {
        if (status === 'active') {
          total = (statusCounts['Available'] || 0) + (statusCounts['Listed'] || 0);
        } else if (status) {
          total = statusCounts[status] || 0;
        } else {
          total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
        }
      }
      rows = await env.DB.prepare(rowsSql).bind(...bindings, limit, offset).all();
    }

    const parseJoinedJson = (raw) => {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) {
        return {};
      }
    };

    const enrichedItems = (rows.results || []).map(rawRow => {
      const { _inv_json, _comp_json, _sale_json, _recon_json, ...baseRow } = rawRow;
      const row = {
        ...baseRow,
        ...parseJoinedJson(_inv_json),
        ...parseJoinedJson(_comp_json),
        ...parseJoinedJson(_sale_json),
        ...parseJoinedJson(_recon_json)
      };
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

      let parsedAttrs = {};
      if (row.attributes) {
        try {
          parsedAttrs = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
        } catch (_) {}
      }

      // Fallback: parse attributes JSON if explicit columns were empty
      if (parsedAttrs && typeof parsedAttrs === 'object') {
        if (!asin && parsedAttrs.asin) asin = String(parsedAttrs.asin).trim().toUpperCase();
        if (!orderId && parsedAttrs.order_id) orderId = String(parsedAttrs.order_id).trim();
        if (!isVineScout && (parsedAttrs.source === 'amazon_vinescout' || parsedAttrs.is_vinescout)) isVineScout = true;
        if (etv == null && parsedAttrs.etv != null) etv = Number(parsedAttrs.etv);
        if (taxCost == null && parsedAttrs.tax_cost != null) taxCost = Number(parsedAttrs.tax_cost);
        if (!certVerified && parsedAttrs.cert_verified) certVerified = true;
        if (!certVerifiedAt && parsedAttrs.cert_verified_at) certVerifiedAt = parsedAttrs.cert_verified_at;

        if (!imageUrl) {
          if (parsedAttrs.ebay_image_url) {
            imageUrl = normalizeHttps(parsedAttrs.ebay_image_url);
          } else if (parsedAttrs.image_url) {
            imageUrl = normalizeHttps(parsedAttrs.image_url);
          } else if (parsedAttrs.image_urls) {
            const imgs = Array.isArray(parsedAttrs.image_urls)
              ? parsedAttrs.image_urls
              : (() => { try { return JSON.parse(parsedAttrs.image_urls); } catch (_) { return []; } })();
            if (Array.isArray(imgs) && imgs[0]) imageUrl = normalizeHttps(imgs[0]);
          }
        }
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
        ...parsedAttrs,
        ...row,
        item_name: cleanItemName(row.item_name),
        athlete_person: cleanAthleteName(row.athlete_person || parsedAttrs.athlete_person),
        sport_genre: row.sport_genre || parsedAttrs.sport_genre || null,
        authenticator: row.authenticator || parsedAttrs.authenticator || null,
        cert_number: row.cert_number || parsedAttrs.cert_number || null,
        brand: row.brand || parsedAttrs.brand || null,
        team_or_band: row.team_or_band || parsedAttrs.team_or_band || null,
        inscription: row.inscription || parsedAttrs.inscription || null,
        size: row.size || parsedAttrs.size || null,
        is_wearable: Boolean(row.is_wearable ?? parsedAttrs.is_wearable),
        is_custom_jersey: Boolean(row.is_custom_jersey ?? parsedAttrs.is_custom_jersey),
        is_pickguard_guitar: Boolean(row.is_pickguard_guitar ?? parsedAttrs.is_pickguard_guitar),
        target_net: row.target_net ?? parsedAttrs.target_net ?? null,
        condition_header: row.condition_header || parsedAttrs.condition_header || null,
        condition_subheader: row.condition_subheader || parsedAttrs.condition_subheader || null,
        features: row.features || parsedAttrs.features || null,
        specs: row.specs || parsedAttrs.specs || null,
        included_in_sale: row.included_in_sale || parsedAttrs.included_in_sale || null,
        item_subtype: row.item_subtype || null,
        color: parsedAttrs.color || parsedAttrs.colorway || null,
        item_condition: row.item_condition || parsedAttrs.condition || null,
        condition: row.item_condition || parsedAttrs.condition || null,
        condition_notes: row.condition_notes || null,
        auth_type: row.auth_type || parsedAttrs.auth_type || null,
        prep_status: row.prep_status || 'Ready',
        framing_status: row.framing_status || null,
        source_vendor: row.source_vendor || null,
        storage_location: row.storage_location || null,
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

    // Dynamic portfolio KPIs aggregation
    const kpisSql = 'SELECT '
      + 'COUNT(*) AS active_count, '
      + 'COALESCE(SUM(i.true_total_cost), 0) AS total_landed_cost, '
      + 'COALESCE(SUM(COALESCE(i.current_list_price, i.suggested_list_price, 0)), 0) AS total_list_value '
      + 'FROM auction_items i '
      + 'WHERE i.user_id = ? AND i.status IN (\'Available\', \'Listed\', \'Draft\')';

    let kpisData = { active_count: 0, total_landed_cost: 0, total_list_value: 0 };
    try {
      const kpisRow = await env.DB.prepare(kpisSql).bind(payload.userId).first();
      if (kpisRow) {
        kpisData = {
          active_count: Number(kpisRow.active_count || 0),
          total_landed_cost: Math.round(((Number(kpisRow.total_landed_cost) || 0) + 1e-9) * 100) / 100,
          total_list_value: Math.round(((Number(kpisRow.total_list_value) || 0) + 1e-9) * 100) / 100
        };
      }
    } catch (_) {}

    return ok({
      items: enrichedItems,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      status_counts: statusCounts,
      kpis: kpisData
    });
  });
}

