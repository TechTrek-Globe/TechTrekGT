import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { cleanItemName, cleanAthleteName } from '../../utils/auction.js';
import {
  parseImageFromNotes,
  parseUserNote,
  cleanEbaySearchQuery,
  buildEbaySearchUrl,
  normalizeHttps
} from '../../utils/ebayUtils.js';

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
    const orderByClause = (sortByParam === 'created_at' && sortDirParam === 'DESC')
      ? "ORDER BY CASE WHEN LOWER(i.status) = 'listed' THEN 0 ELSE 1 END, i.created_at DESC"
      : `ORDER BY ${sortCol} ${sortDirParam}`;

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

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM auction_items i WHERE ${whereClause}`
    ).bind(...bindings).first();

    const rows = await env.DB.prepare(`
      SELECT
        i.*,
        inv.invoice_ref,
        inv.discount  AS inv_discount,
        inv.shipping  AS inv_shipping,
        inv.tax       AS inv_tax,
        c.id          AS comp_id,
        c.comp_1,
        c.comp_2,
        c.comp_3,
        c.manual_avg,
        c.live_avg,
        c.active_comp_1,
        c.active_comp_2,
        c.active_comp_3,
        c.active_avg,
        c.sold_count,
        c.ebay_search_url AS comp_ebay_search_url,
        c.recommended_list_price,
        c.updated_at  AS comp_updated_at
      FROM auction_items i
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      LEFT JOIN auction_comps c ON i.id = c.item_id AND c.user_id = i.user_id
      WHERE ${whereClause}
      ${orderByClause}
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    const enrichedItems = (rows.results || []).map(row => {
      const isAmazon = typeof row.invoice_ref === 'string' && row.invoice_ref.startsWith('AMAZON-');
      // Parse image from notes first (Amazon pipe-delimited: "Image: https://...")
      let imageUrl = parseImageFromNotes(row.notes);
      const userNote = parseUserNote(row.notes);
      const searchUrl = buildEbaySearchUrl(row.item_name, row.athlete_person, row.authenticator);

      let asin = null;
      let orderId = null;
      let isVineScout = false;
      let etv = null;
      let taxCost = null;
      let certVerified = false;
      let certVerifiedAt = null;

      if (row.attributes) {
        try {
          const parsed = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
          if (parsed && typeof parsed === 'object') {
            if (parsed.asin) asin = String(parsed.asin).trim().toUpperCase();
            if (parsed.order_id) orderId = String(parsed.order_id).trim();
            if (parsed.source === 'amazon_vinescout' || parsed.is_vinescout) isVineScout = true;
            if (parsed.etv != null) etv = Number(parsed.etv);
            if (parsed.tax_cost != null) taxCost = Number(parsed.tax_cost);
            if (parsed.cert_verified) certVerified = true;
            if (parsed.cert_verified_at) certVerifiedAt = parsed.cert_verified_at;

            // Fallback: pull image_url from attributes when notes did not yield one
            if (!imageUrl) {
              if (parsed.ebay_image_url) {
                imageUrl = normalizeHttps(parsed.ebay_image_url);
              } else if (parsed.image_url) {
                imageUrl = normalizeHttps(parsed.image_url);
              } else if (parsed.image_urls) {
                // Handle plain array or double-serialized JSON string
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
      }
    });
  });
}

