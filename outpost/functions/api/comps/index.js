import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

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
  // Remove known auto-injected fragments
  let cleaned = String(notes)
    .replace(/Order ID:\s*[\d-]+\s*\|?\s*/gi, '')
    .replace(/ASIN:\s*[A-Z0-9]{10}\s*\|?\s*/gi, '')
    .replace(/Image:\s*https?:\/\/[^\s|]+\s*\|?\s*/gi, '')
    .replace(/Imported from Amazon\s*/gi, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();
  return cleaned || null;
}

function computeManualAvg(comp1, comp2, comp3) {
  const vals = [comp1, comp2, comp3].filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 100) / 100;
}

export function cleanEbaySearchQuery(itemName, athlete, authenticator) {
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

/**
 * GET /api/comps
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const itemId = url.searchParams.get('item_id');
    const statusFilter = url.searchParams.get('status'); // e.g. 'active' or 'Available,Listed'

    let query = `
      SELECT
        c.id as comp_id,
        c.comp_1,
        c.comp_2,
        c.comp_3,
        c.manual_avg,
        c.live_avg,
        c.ebay_search_url,
        c.recommended_list_price,
        c.updated_at as comp_updated_at,
        i.id as item_id,
        i.item_name,
        i.category,
        i.sport_genre,
        i.athlete_person,
        i.authenticator,
        i.cert_number,
        i.unit_price,
        i.true_total_cost,
        i.min_sell_price,
        i.suggested_list_price,
        i.current_list_price,
        i.target_margin_pct,
        i.status,
        i.platform,
        i.date_acquired,
        i.est_shipping_cost,
        i.platform_fee_pct,
        i.notes,
        inv.invoice_ref
      FROM auction_items i
      LEFT JOIN auction_comps c ON i.id = c.item_id AND c.user_id = i.user_id
      LEFT JOIN auction_invoices inv ON i.invoice_id = inv.id
      WHERE i.user_id = ?
    `;

    const bindings = [userId];

    if (itemId) {
      query += ' AND i.id = ?';
      bindings.push(itemId);
    } else if (statusFilter === 'active') {
      query += " AND i.status IN ('Available', 'Listed')";
    }

    query += ' ORDER BY i.created_at DESC';

    const rows = await env.DB.prepare(query).bind(...bindings).all();
    const results = (rows.results || []).map(row => {
      const isAmazon = typeof row.invoice_ref === 'string' && row.invoice_ref.startsWith('AMAZON-');
      const imageUrl = parseImageFromNotes(row.notes);
      const userNote = parseUserNote(row.notes);
      const searchUrl = buildEbaySearchUrl(row.item_name, row.athlete_person, row.authenticator);
      return {
        ...row,
        ebay_search_url: searchUrl,
        image_url: imageUrl,
        user_note: userNote,
        is_amazon: isAmazon
      };
    });

    return ok({ comps: results });
  });
}

/**
 * POST /api/comps - upsert comp for an item
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const {
      item_id,
      comp_1,
      comp_2,
      comp_3,
      live_avg,
      ebay_search_url,
      recommended_list_price,
      apply_to_item = false
    } = body;

    if (!item_id) return err('item_id is required');

    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(item_id, userId).first();

    if (!item) return err('Item not found', 404);

    const manualAvg = computeManualAvg(comp_1, comp_2, comp_3);
    const recPrice = recommended_list_price !== undefined && recommended_list_price !== null && !isNaN(Number(recommended_list_price))
      ? Number(recommended_list_price)
      : (manualAvg || item.suggested_list_price);

    const searchUrl = ebay_search_url || buildEbaySearchUrl(item.item_name, item.athlete_person, item.authenticator);

    // Check if comp row already exists
    const existingComp = await env.DB.prepare(
      'SELECT id FROM auction_comps WHERE item_id = ? AND user_id = ?'
    ).bind(item_id, userId).first();

    let compId = existingComp?.id;

    if (existingComp) {
      await env.DB.prepare(`
        UPDATE auction_comps
        SET comp_1 = ?, comp_2 = ?, comp_3 = ?, live_avg = ?, manual_avg = ?, recommended_list_price = ?, ebay_search_url = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(
        comp_1 !== undefined ? (comp_1 === '' ? null : Number(comp_1)) : null,
        comp_2 !== undefined ? (comp_2 === '' ? null : Number(comp_2)) : null,
        comp_3 !== undefined ? (comp_3 === '' ? null : Number(comp_3)) : null,
        live_avg !== undefined ? (live_avg === '' ? null : Number(live_avg)) : null,
        manualAvg,
        recPrice,
        searchUrl,
        compId,
        userId
      ).run();
    } else {
      compId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO auction_comps (id, item_id, user_id, comp_1, comp_2, comp_3, live_avg, manual_avg, recommended_list_price, ebay_search_url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        compId,
        item_id,
        userId,
        comp_1 !== undefined ? (comp_1 === '' ? null : Number(comp_1)) : null,
        comp_2 !== undefined ? (comp_2 === '' ? null : Number(comp_2)) : null,
        comp_3 !== undefined ? (comp_3 === '' ? null : Number(comp_3)) : null,
        live_avg !== undefined ? (live_avg === '' ? null : Number(live_avg)) : null,
        manualAvg,
        recPrice,
        searchUrl
      ).run();
    }

    // Optionally apply recommended list price to current_list_price / suggested_list_price of item
    if (apply_to_item && recPrice > 0) {
      await env.DB.prepare(`
        UPDATE auction_items
        SET current_list_price = ?, suggested_list_price = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(recPrice, recPrice, item_id, userId).run();
    }

    const updated = await env.DB.prepare('SELECT * FROM auction_comps WHERE id = ?').bind(compId).first();
    return ok({ comp: updated, message: 'Comp saved successfully' });
  });
}
