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
  const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=25`;

  let html = '';

  try {
    const response = await fetch(ebaySearchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      return fallbackCompsResponse(query, ebaySearchUrl, `HTTP ${response.status}`);
    }

    html = await response.text();
  } catch (e) {
    return fallbackCompsResponse(query, ebaySearchUrl, `fetch error: ${e.message}`);
  }

  const prices = [];
  const items = [];

  // --- Strategy 1: JSON-LD structured data ---
  if (prices.length === 0) {
    const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let jm;
    while ((jm = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(jm[1]);
        const entries = Array.isArray(data) ? data : (data['@graph'] || [data]);
        for (const entry of entries) {
          const offers = entry.offers || entry.Offers;
          const offerList = Array.isArray(offers) ? offers : (offers ? [offers] : []);
          for (const offer of offerList) {
            const price = parseFloat(offer.price || offer.Price || '');
            if (!isNaN(price) && price > 0 && price < 100000) {
              prices.push(price);
              items.push({ title: entry.name || query, price, price_formatted: `$${price.toFixed(2)}` });
            }
          }
        }
      } catch (_) { /* not valid JSON */ }
      if (prices.length >= 15) break;
    }
  }

  // --- Strategy 2: Embedded window/state JSON price objects ---
  if (prices.length === 0) {
    const embeddedPriceRegex = /"(?:soldPrice|price|soldAmount)":\s*\{\s*"value"\s*:\s*"([\d.]+)"/g;
    let m;
    while ((m = embeddedPriceRegex.exec(html)) !== null && prices.length < 15) {
      const val = parseFloat(m[1]);
      if (!isNaN(val) && val > 1 && val < 100000) {
        prices.push(val);
        items.push({ title: query, price: val, price_formatted: `$${val.toFixed(2)}` });
      }
    }
  }

  // --- Strategy 3: Parse s-item list blocks ---
  if (prices.length === 0) {
    const itemBlockRegex = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let blockMatch;
    while ((blockMatch = itemBlockRegex.exec(html)) !== null && items.length < 15) {
      const block = blockMatch[1];
      if (block.includes('s-item__title--tag') || block.includes('Shop on eBay')) continue;

      const titleMatch = block.match(/<span[^>]*role="heading"[^>]*>([^<]+)<\/span>/i)
        || block.match(/<div[^>]*class="[^"]*s-item__title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
      const title = titleMatch ? titleMatch[1].replace(/<!--.*?-->/g, '').trim() : '';

      const priceMatch = block.match(/<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
        || block.match(/<span[^>]*class="[^"]*POSITIVE[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (!priceMatch) continue;

      const rawPrice = priceMatch[1].replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '').trim();
      const numMatch = rawPrice.match(/\$([\d,]+\.?\d*)/);
      if (numMatch) {
        const numVal = parseFloat(numMatch[1].replace(/,/g, ''));
        if (!isNaN(numVal) && numVal > 0 && numVal < 100000) {
          prices.push(numVal);
          items.push({ title: title || query, price: numVal, price_formatted: `$${numVal.toFixed(2)}` });
        }
      }
    }
  }

  // --- Strategy 4: Broad price class scan ---
  if (prices.length === 0) {
    const altPriceRegex = /class="[^"]*(?:s-item__price|POSITIVE|sold-price|notranslate)[^"]*"[^>]*>\s*\$?([\d,]+\.?\d*)/gi;
    let m;
    while ((m = altPriceRegex.exec(html)) !== null && prices.length < 10) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 1 && val < 100000) {
        prices.push(val);
        items.push({ title: query, price: val, price_formatted: `$${val.toFixed(2)}` });
      }
    }
  }

  // --- Strategy 5: Dollar-amount scan near 'sold' keywords ---
  if (prices.length === 0 && html.includes('ebay.com') && html.length > 5000) {
    const soldContextRegex = /(?:sold|Sold|SOLD)[^$]{0,200}\$([\d,]+\.?\d*)/g;
    let m;
    while ((m = soldContextRegex.exec(html)) !== null && prices.length < 10) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 1 && val < 100000) {
        prices.push(val);
        items.push({ title: query, price: val, price_formatted: `$${val.toFixed(2)}` });
      }
    }
  }

  // --- Build response ---
  if (prices.length > 0) {
    const sorted = [...prices].sort((a, b) => a - b);
    const sum = prices.reduce((acc, p) => acc + p, 0);
    const live_avg = parseFloat((sum / prices.length).toFixed(2));
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0
      ? sorted[mid]
      : parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));

    return {
      success: true,
      query,
      count: prices.length,
      comp_1: sorted[0] || null,
      comp_2: sorted[Math.floor(sorted.length / 2)] || null,
      comp_3: sorted[sorted.length - 1] || null,
      live_avg,
      median,
      min_comp: sorted[0],
      max_comp: sorted[sorted.length - 1],
      ebay_search_url: ebaySearchUrl,
      items
    };
  }

  // Diagnostic snippet - first 500 chars to identify bot blocks or empty HTML
  const htmlSnippet = html.length > 0
    ? html.substring(0, 500).replace(/[\r\n]+/g, ' ')
    : '(empty response)';

  return fallbackCompsResponse(query, ebaySearchUrl, null, htmlSnippet);
}

function fallbackCompsResponse(query, ebaySearchUrl, errorHint = null, htmlSnippet = null) {
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
    notice: 'Direct automated lookup returned 0 live matches. Click eBay Comps \u2197 to view sold listings on eBay.',
    ...(errorHint ? { _debug_error: errorHint } : {}),
    ...(htmlSnippet ? { _debug_html_snippet: htmlSnippet } : {})
  };
}
