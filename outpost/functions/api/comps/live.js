import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/comps/live?query=...
 * POST /api/comps/live { query: "...", itemId: "..." }
 *
 * Scrapes/extracts recent eBay completed & sold transactions for an item,
 * calculates the statistical average/median comps, and returns structured data.
 */

function cleanEbaySearchQuery(queryText) {
  let text = String(queryText || '').trim();

  // Strip leading Item #, Lot #, or standalone 5-12 digit numbers
  text = text.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-–—:]\s*|\s+)?/gi, '');
  text = text.replace(/^\d{5,12}\s*[-–—:]\s*/g, '');
  text = text.replace(/^\d{5,12}\s+/g, '');

  // Strip standalone non-year 5-12 digit numbers anywhere in text (e.g. internal lot IDs like "5261 894")
  text = text.replace(/\b(?!(?:19|20)\d{2})\d{5,12}\b/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  // Clean special characters except word characters, spaces, and hyphens
  text = text.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();

  return text;
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

    // If itemId provided, pull item_name, athlete_person, authenticator to build ultra-clean query
    if (itemId && env.DB) {
      const itemRow = await env.DB.prepare(
        'SELECT item_name, athlete_person, authenticator FROM auction_items WHERE id = ? AND user_id = ?'
      ).bind(itemId, userId).first();

      if (itemRow) {
        let nameText = cleanEbaySearchQuery(itemRow.item_name);
        if (itemRow.athlete_person && !nameText.toLowerCase().includes(itemRow.athlete_person.toLowerCase())) {
          const cleanAthlete = cleanEbaySearchQuery(itemRow.athlete_person);
          if (cleanAthlete) nameText = `${cleanAthlete} ${nameText}`;
        }
        if (itemRow.authenticator && itemRow.authenticator.toLowerCase() !== 'other' && !nameText.toLowerCase().includes(itemRow.authenticator.toLowerCase())) {
          const cleanAuth = itemRow.authenticator.replace(/#.*$/, '').trim();
          if (cleanAuth) nameText = `${nameText} ${cleanAuth}`;
        }
        query = cleanEbaySearchQuery(nameText);
      }
    }

    query = cleanEbaySearchQuery(query);

    if (!query) {
      return err('Search query is required', 400);
    }

    const results = await fetchEbaySoldComps(query);

    // If itemId provided, automatically persist live avg & comps into auction_comps
    if (itemId && env.DB && results.live_avg > 0) {
      const compId = `comp-${crypto.randomUUID()}`;
      await env.DB.prepare(`
        INSERT INTO auction_comps (
          id, item_id, user_id, comp_1, comp_2, comp_3,
          manual_avg, live_avg, ebay_search_url, recommended_list_price, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(item_id) DO UPDATE SET
          comp_1 = COALESCE(excluded.comp_1, auction_comps.comp_1),
          comp_2 = COALESCE(excluded.comp_2, auction_comps.comp_2),
          comp_3 = COALESCE(excluded.comp_3, auction_comps.comp_3),
          live_avg = excluded.live_avg,
          ebay_search_url = excluded.ebay_search_url,
          recommended_list_price = excluded.recommended_list_price,
          updated_at = datetime('now')
      `).bind(
        compId,
        itemId,
        userId,
        results.comp_1 || null,
        results.comp_2 || null,
        results.comp_3 || null,
        results.live_avg,
        results.live_avg,
        results.ebay_search_url,
        results.live_avg
      ).run();
    }

    return ok(results);
  });
}

/**
 * Fetches completed/sold listings from eBay and parses pricing data
 * @param {string} rawQuery
 */
async function fetchEbaySoldComps(rawQuery) {
  const query = cleanEbaySearchQuery(rawQuery);
  const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=25`;

  try {
    const response = await fetch(ebaySearchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      return fallbackCompsResponse(query, ebaySearchUrl);
    }

    const html = await response.text();
    const prices = [];
    const items = [];

    // Extract sold items using regex over eBay HTML structure
    // Matches s-item blocks: titles and prices
    const itemBlockRegex = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let blockMatch;

    while ((blockMatch = itemBlockRegex.exec(html)) !== null && items.length < 15) {
      const block = blockMatch[1];
      if (block.includes('s-item__title--tag') || block.includes('Shop on eBay')) continue;

      // Extract Title
      const titleMatch = block.match(/<span[^>]*role="heading"[^>]*>([^<]+)<\/span>/i) ||
                         block.match(/<div[^>]*class="[^"]*s-item__title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
      const title = titleMatch ? titleMatch[1].replace(/<!--.*?-->/g, '').trim() : '';

      // Extract Sold Price (e.g., "$45.00" or "$120.50 to $150.00")
      const priceMatch = block.match(/<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (!priceMatch) continue;

      const rawPrice = priceMatch[1].replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '').trim();
      const numMatch = rawPrice.match(/\$([\d,]+\.?\d*)/);
      if (numMatch) {
        const numVal = parseFloat(numMatch[1].replace(/,/g, ''));
        if (!isNaN(numVal) && numVal > 0) {
          prices.push(numVal);
          items.push({
            title: title || query,
            price: numVal,
            price_formatted: `$${numVal.toFixed(2)}`
          });
        }
      }
    }

    if (prices.length === 0) {
      // Fallback parser looking directly for positive sold price spans
      const altPriceRegex = /\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g;
      let m;
      while ((m = altPriceRegex.exec(html)) !== null && prices.length < 6) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (val > 5 && val < 50000) {
          prices.push(val);
        }
      }
    }

    if (prices.length > 0) {
      const sorted = [...prices].sort((a, b) => a - b);
      const sum = prices.reduce((acc, p) => acc + p, 0);
      const live_avg = parseFloat((sum / prices.length).toFixed(2));
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));

      return {
        success: true,
        query,
        count: prices.length,
        comp_1: prices[0] || null,
        comp_2: prices[1] || null,
        comp_3: prices[2] || null,
        live_avg,
        median,
        min_comp: sorted[0],
        max_comp: sorted[sorted.length - 1],
        ebay_search_url: ebaySearchUrl,
        items
      };
    }

    return fallbackCompsResponse(query, ebaySearchUrl);
  } catch (err) {
    return fallbackCompsResponse(query, ebaySearchUrl);
  }
}

function fallbackCompsResponse(query, ebaySearchUrl) {
  return {
    success: true,
    query,
    count: 0,
    comp_1: null,
    comp_2: null,
    comp_3: null,
    live_avg: null,
    median: null,
    ebay_search_url: ebaySearchUrl,
    items: [],
    notice: 'Live lookup generated search link. Direct HTML scraping restricted by marketplace origin.'
  };
}
