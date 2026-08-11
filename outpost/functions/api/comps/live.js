import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/comps/live?query=...
 * POST /api/comps/live { query: "...", itemId: "..." }
 *
 * Scrapes/extracts recent eBay completed & sold transactions for an item,
 * calculates the statistical average/median comps, and returns structured data.
 */

function cleanEbaySearchQuery(rawText) {
  if (!rawText) return '';
  let text = String(rawText).trim();

  // Strip leading Item #, Lot #, or standalone 5-12 digit numbers
  text = text.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-–—:]\s*|\s+)?/gi, '');
  text = text.replace(/^\d{5,12}\s*[-–—:]\s*/g, '');

  // Strip Amazon-style compatibility clauses that make eBay queries too specific
  text = text.replace(/\bcompatible\s+(?:with\s+)?[\w\s,/&-]*/gi, '');
  text = text.replace(/\bfits?\s+(?:for\s+)?[\w\s,/&-]*/gi, '');
  text = text.replace(/\bfor\s+[A-Z][\w\s,/&-]*/g, '');
  text = text.replace(/\bwith\s+[A-Z][\w\s,/&-]*/g, '');
  text = text.replace(/\bw\/\s*[A-Z][\w\s,/&-]*/g, '');

  // Strip long hyphenated spec strings
  text = text.replace(/\b\w+-\w+\b/g, m => m); 

  // Strip standalone non-year 4-digit+ numbers
  text = text.replace(/\b(?!(?:19|20)\d{2})\d{4,}\b/g, '');

  // Clean special characters
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

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    await requireAuth(request, env);

    const url = new URL(request.url);
    const rawQuery = url.searchParams.get('query') || '';
    if (!rawQuery.trim()) {
      return err('Search query parameter is required', 400);
    }

    const results = await fetchEbaySoldComps(rawQuery.trim());
    return ok(results);
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    const body = await request.json().catch(() => ({}));
    let query = (body.query || '').trim();
    const itemId = body.itemId || null;

    if (itemId && env.DB) {
      const itemRow = await env.DB.prepare(
        'SELECT item_name, athlete_person, authenticator FROM auction_items WHERE id = ? AND user_id = ?'
      ).bind(itemId, userId).first();

      if (itemRow) {
        let parts = [];
        const cleanAthlete = itemRow.athlete_person ? cleanEbaySearchQuery(itemRow.athlete_person) : '';
        const cleanName    = itemRow.item_name ? cleanEbaySearchQuery(itemRow.item_name) : '';

        if (cleanAthlete) parts.push(cleanAthlete);
        if (cleanName) {
          if (cleanAthlete && cleanName.toLowerCase().includes(cleanAthlete.toLowerCase())) {
            parts = [cleanName];
          } else {
            parts.push(cleanName);
          }
        }
        if (itemRow.authenticator && itemRow.authenticator.toLowerCase() !== 'other' && itemRow.authenticator.toLowerCase() !== 'unlabeled') {
          const cleanAuth = itemRow.authenticator.replace(/#.*$/, '').trim();
          if (cleanAuth && !parts.join(' ').toLowerCase().includes(cleanAuth.toLowerCase())) {
            parts.push(cleanAuth);
          }
        }
        query = parts.join(' ');
      }
    }

    const cleanedQuery = cleanEbaySearchQuery(query);
    if (!cleanedQuery) return err('Search query is required', 400);

    const results = await fetchEbaySoldComps(cleanedQuery);

    if (itemId && env.DB && results.live_avg > 0) {
      const compId = `comp-${crypto.randomUUID()}`;
      await env.DB.prepare(`
        INSERT INTO auction_comps (id, item_id, user_id, comp_1, comp_2, comp_3, manual_avg, live_avg, ebay_search_url, recommended_list_price, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(item_id) DO UPDATE SET
          comp_1 = excluded.comp_1, comp_2 = excluded.comp_2, comp_3 = excluded.comp_3,
          live_avg = excluded.live_avg, ebay_search_url = excluded.ebay_search_url,
          recommended_list_price = excluded.live_avg, updated_at = datetime('now')
      `).bind(compId, itemId, userId, results.comp_1 || null, results.comp_2 || null, results.comp_3 || null, results.live_avg, results.live_avg, results.ebay_search_url, results.live_avg).run();
    }

    return ok(results);
  });
}

async function fetchEbaySoldComps(query) {
  const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=48`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  try {
    const response = await fetch(ebaySearchUrl, { headers });
    if (!response.ok) return fallbackCompsResponse(query, ebaySearchUrl, "HTTP Error");

    const html = await response.text();
    const prices = [];

    // Multi-strategy extraction: Look for price elements in various DOM structures
    const strategies = [
      /<span class="s-item__price">\s*\$([\d,]+\.?\d*)/g,
      /class="s-item__price"[^>]*>\s*<span[^>]*>\$([\d,]+\.?\d*)/g,
      /price-value">\$([\d,]+\.?\d*)/g,
      /s-item__price">\s*<span[^>]*>.*?\$([\d,]+\.?\d*)/g,
      /data-price="\$([\d,]+\.?\d*)/g
    ];

    for (const regex of strategies) {
      let match;
      while ((match = regex.exec(html)) !== null) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (val > 0 && val < 100000) prices.push(val);
      }
      if (prices.length >= 10) break;
    }

    if (prices.length > 0) {
      const sorted = [...prices].sort((a, b) => a - b);
      const live_avg = parseFloat((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2));
      
      return {
        success: true,
        query,
        count: prices.length,
        comp_1: sorted[0],
        comp_2: sorted[Math.floor(sorted.length / 2)],
        comp_3: sorted[sorted.length - 1],
        live_avg,
        median: sorted[Math.floor(sorted.length / 2)],
        ebay_search_url: ebaySearchUrl,
        items: prices.map(p => ({ price: p, price_formatted: `$${p.toFixed(2)}` }))
      };
    }
    return fallbackCompsResponse(query, ebaySearchUrl, "No matches found");
  } catch (e) {
    return fallbackCompsResponse(query, ebaySearchUrl, e.message);
  }
}

function fallbackCompsResponse(query, ebaySearchUrl, reason) {
  return {
    success: false,
    query,
    count: 0,
    comp_1: null,
    comp_2: null,
    comp_3: null,
    live_avg: null,
    median: null,
    ebay_search_url: ebaySearchUrl,
    items: [],
    notice: `Lookup failed: ${reason}. Check live data manually.`
  };
}
