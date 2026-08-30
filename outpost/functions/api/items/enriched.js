import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { cleanItemName, cleanAthleteName } from '../../utils/auction.js';

/**
 * Parses the "Image: <url>" fragment out of the notes column.
 * AmazonItemModal stores notes as pipe-delimited: "Order ID: ... | ASIN: ... | Image: https://..."
 */
function parseImageFromNotes(notes) {
  if (!notes) return null;
  const match = String(notes).match(/\bImage:\s*(https?:\/\/[^\s|]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Parses a clean user-facing note by stripping the auto-injected Amazon meta tokens.
 */
function parseUserNote(notes) {
  if (!notes) return null;
  let cleaned = String(notes)
    .replace(/Order ID:\s*[\d-]+\s*\|?\s*/gi, '')
    .replace(/ASIN:\s*[A-Z0-9]{10}\s*\|?\s*/gi, '')
    .replace(/Image:\s*https?:\/\/[^\s|]+\s*\|?\s*/gi, '')
    .replace(/Imported from Amazon\s*/gi, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();
  return cleaned || null;
}

function cleanEbaySearchQuery(itemName, athlete, authenticator) {
  let text = String(itemName || '').trim();
  if (!text) return '';

  // 1. Normalize unicode quotes, dashes, spaces
  text = text.replace(/[\u2018\u2019\u201B\u2032]/g, "'");
  text = text.replace(/[\u201C\u201D\u2033]/g, '"');
  text = text.replace(/[\u2013\u2014\u2015]/g, '-');

  // 2. Normalize year ranges (e.g. 2021/22 or 2021-2022 -> 2021-22)
  text = text.replace(/\b(19\d{2}|20\d{2})\/(2\d|\d{2})\b/g, '$1-$2');
  text = text.replace(/\b(19\d{2}|20\d{2})-(?:19|20)(\d{2})\b/g, '$1-$2');

  // 3. Strip invoice, order, auction, lot, SKU, ASIN prefixes and item numbers
  text = text.replace(/^(?:item|lot|inv|sku|asin|order|po|ref|id|auction|part)\s*#?\s*[:\-\s]*\w+\s*[:\-\s]*/gi, '');
  text = text.replace(/^\s*#\s*\d{4,14}\s*[:\-\s]*/g, '');
  text = text.replace(/^\s*\d{5,14}\s*[:\-\s]+/g, '');

  // 4. Strip promotional and auction noise phrases / buzzwords
  const noisePatterns = [
    /\b(?:l[@o]{2}k|look|must\s+see|wow|rare|super\s+rare|grail|invest!?|fire!?|holy\s+grail)\b/gi,
    /\b(?:free\s+ship(?:ping)?|fast\s+ship(?:ping)?|ships?\s+(?:fast|asap|today|same\s+day)|same\s+day\s+shipping)\b/gi,
    /\b(?:read\s+desc(?:ription)?|check\s+pics|see\s+pics|see\s+photos|look\s+at\s+pics)\b/gi,
    /\b(?:no\s+reserve|nr|obo|or\s+best\s+offer|estate\s+sale|consignment|wholesale|liquidation)\b/gi,
    /\b(?:brand\s+new(?:\s+in\s+box|\s+sealed)?|bnib|nib|nwt|nwot|factory\s+sealed|sealed\s+box)\b/gi,
    /\b(?:great\s+condition|very\s+nice|excellent\s+condition|awesome|authentic\s+original)\b/gi,
    /\b(?:pristine\s+auction|whatnot|mercari|ebay\s+store)\b/gi,
  ];
  for (const np of noisePatterns) {
    text = text.replace(np, ' ');
  }

  // 5. Normalize "Last, First" in title (e.g. "Mahomes, Patrick" -> "Patrick Mahomes")
  text = text.replace(/\b([A-Z][a-z]+),\s+([A-Z][a-z]+)\b/g, '$2 $1');

  // 6. Normalize athlete name
  if (athlete && athlete.trim()) {
    let cleanAthlete = athlete.trim();
    if (cleanAthlete.includes(',')) {
      const parts = cleanAthlete.split(',').map(p => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        cleanAthlete = `${parts[1]} ${parts[0]}`;
      }
    }
    cleanAthlete = cleanAthlete.replace(/^\d{5,12}\s+/, '').trim();

    const athleteLower = cleanAthlete.toLowerCase();
    if (athleteLower && !text.toLowerCase().includes(athleteLower)) {
      const athleteParts = athleteLower.split(/\s+/).filter(Boolean);
      if (!athleteParts.every(p => text.toLowerCase().includes(p))) {
        text = `${cleanAthlete} ${text}`;
      }
    }
  }

  // 7. Normalize authenticator
  if (authenticator && authenticator.trim() && !['other', 'none', 'unknown', 'n/a'].includes(authenticator.trim().toLowerCase())) {
    const cleanAuth = authenticator.replace(/#.*$/, '').trim();
    const authLower = cleanAuth.toLowerCase();
    if (authLower && !text.toLowerCase().includes(authLower)) {
      text = `${text} ${cleanAuth}`;
    }
  }

  // 8. Clean unwanted special characters but preserve serial numbers (/25), card numbers (#15), hyphens
  text = text.replace(/(?<!\d)\/|\/(?!\d)/g, ' ');
  text = text.replace(/[^\w\s\-\.#/]/g, ' ');
  text = text.replace(/(?<=\s)#(?=\s|$)/g, '');
  text = text.replace(/(?<=\s)-(?=\s|$)/g, '');

  // 9. Deduplicate tokens and limit word count to top 12 most relevant keywords
  const rawWords = text.split(/\s+/).filter(Boolean);
  const uniqueWords = [];
  const seen = new Set();
  for (const w of rawWords) {
    const wClean = w.replace(/^[.,\-]+|[.,\-]+$/g, '');
    if (!wClean) continue;
    const wLower = wClean.toLowerCase();
    if (!seen.has(wLower)) {
      seen.add(wLower);
      uniqueWords.push(wClean);
    }
    if (uniqueWords.length >= 12) break;
  }

  return uniqueWords.join(' ');
}

function buildEbaySearchUrl(itemName, athlete, authenticator) {
  const query = cleanEbaySearchQuery(itemName, athlete, authenticator);
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
}

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
      ORDER BY ${sortCol} ${sortDirParam}
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    const enrichedItems = (rows.results || []).map(row => {
      const isAmazon = typeof row.invoice_ref === 'string' && row.invoice_ref.startsWith('AMAZON-');
      const imageUrl = parseImageFromNotes(row.notes);
      const userNote = parseUserNote(row.notes);
      const searchUrl = buildEbaySearchUrl(row.item_name, row.athlete_person, row.authenticator);

      return {
        ...row,
        item_name: cleanItemName(row.item_name),
        athlete_person: cleanAthleteName(row.athlete_person),
        ebay_search_url: searchUrl,
        image_url: imageUrl,
        user_note: userNote,
        is_amazon: isAmazon
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

