import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

function computeManualAvg(comp1, comp2, comp3) {
  const vals = [comp1, comp2, comp3].filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 100) / 100;
}

export function cleanEbaySearchQuery(itemName, athlete, authenticator) {
  let text = String(itemName || '').trim();

  // Strip leading Item #, Lot #, or standalone 5-12 digit numbers
  text = text.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-–—:]\s*|\s+)?/gi, '');
  text = text.replace(/^\d{5,12}\s*[-–—:]\s*/g, '');
  text = text.replace(/^\d{5,12}\s+/g, '');

  // Strip Amazon-style compatibility clauses that make eBay queries too specific
  text = text.replace(/\bcompatible\s+(?:with\s+)?[\w\s,/&-]*/gi, '');
  text = text.replace(/\bfits?\s+(?:for\s+)?[\w\s,/&-]*/gi, '');
  text = text.replace(/\bfor\s+[A-Z][\w\s,/&-]*/g, '');
  text = text.replace(/\bwith\s+[A-Z][\w\s,/&-]*/g, '');

  // Strip standalone non-year 4-digit+ numbers (model numbers, part numbers)
  text = text.replace(/\b(?!(?:19|20)\d{2})\d{4,}\b/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  // If athlete provided and not in text, prepend athlete
  if (athlete && athlete.trim()) {
    const cleanAthlete = athlete.replace(/^\d{5,12}\s+/, '').trim();
    if (cleanAthlete && !text.toLowerCase().includes(cleanAthlete.toLowerCase())) {
      text = `${cleanAthlete} ${text}`;
    }
  }

  // If authenticator provided and not in text, append authenticator
  if (authenticator && authenticator.trim() && authenticator.toLowerCase() !== 'other') {
    const cleanAuth = authenticator.replace(/#.*$/, '').trim();
    if (cleanAuth && !text.toLowerCase().includes(cleanAuth.toLowerCase())) {
      text = `${text} ${cleanAuth}`;
    }
  }

  // Clean special characters except word characters, spaces, and hyphens
  text = text.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();

  // Limit to first 12 meaningful words
  const words = text.split(' ').filter(w => w.length > 1);
  const uniqueWords = [];
  const seen = new Set();
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueWords.push(w);
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
      const cleanName = cleanEbaySearchQuery(row.item_name);
      // Always compute clean search URL
      const searchUrl = buildEbaySearchUrl(row.item_name, row.athlete_person, row.authenticator);
      return {
        ...row,
        item_name: cleanName,
        ebay_search_url: searchUrl
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
        SET comp_1 = ?, comp_2 = ?, comp_3 = ?, manual_avg = ?, recommended_list_price = ?, ebay_search_url = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(
        comp_1 !== undefined ? (comp_1 === '' ? null : Number(comp_1)) : null,
        comp_2 !== undefined ? (comp_2 === '' ? null : Number(comp_2)) : null,
        comp_3 !== undefined ? (comp_3 === '' ? null : Number(comp_3)) : null,
        manualAvg,
        recPrice,
        searchUrl,
        compId,
        userId
      ).run();
    } else {
      compId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO auction_comps (id, item_id, user_id, comp_1, comp_2, comp_3, manual_avg, recommended_list_price, ebay_search_url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        compId,
        item_id,
        userId,
        comp_1 !== undefined ? (comp_1 === '' ? null : Number(comp_1)) : null,
        comp_2 !== undefined ? (comp_2 === '' ? null : Number(comp_2)) : null,
        comp_3 !== undefined ? (comp_3 === '' ? null : Number(comp_3)) : null,
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
