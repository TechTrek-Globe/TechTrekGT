import { requireGatewayAuth, withGatewayAuth, ok, err } from './guard.js';

/**
 * GET  /api/ebay/comps?query=...
 * POST /api/ebay/comps  { query: "...", itemId: "..." }
 *
 * Fetches recently sold eBay listings for a search query using the official
 * eBay Marketplace Insights API (item_sales/search) with OAuth Client Credentials.
 *
 * Required env secrets:
 *   EBAY_CLIENT_ID     - eBay Developer App ID (OAuth Client ID)
 *   EBAY_CLIENT_SECRET - eBay Developer Cert ID (OAuth Client Secret)
 * Optional bindings:
 *   GATEWAY_KV         - KV namespace for token caching (~2hr TTL)
 *
 * Returns structured comp data compatible with the outpost auction_comps schema.
 *
 * Option A persistence: the gateway returns raw data only. The outpost client
 * is responsible for a second call to POST /outpost/api/comps to persist to D1.
 */

function getCleanCredential(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '').trim();
}

export function isEbaySandbox(env) {
  const clientId = getCleanCredential(env.EBAY_CLIENT_ID);
  return (
    (env.EBAY_ENV && env.EBAY_ENV.toLowerCase() === 'sandbox') ||
    clientId.toUpperCase().includes('-SBX-') ||
    clientId.toUpperCase().includes('SANDBOX')
  );
}

export function getEbayEndpoints(env) {
  const sandbox = isEbaySandbox(env);
  const base = sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  return {
    isSandbox: sandbox,
    oauthUrl: `${base}/identity/v1/oauth2/token`,
    insightsUrl: `${base}/buy/marketplace_insights/v1_beta/item_sales/search`,
    browseUrl: `${base}/buy/browse/v1/item_summary/search`,
    catalogUrl: `${base}/commerce/catalog/v1_beta/product_summary/search`,
    itemUrl: `${base}/buy/browse/v1/item`
  };
}

const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope';

const EBAY_TOKEN_KV_KEY = 'ebay_access_token';
const EBAY_TOKEN_TTL_SECONDS = 6600; // 10 min buffer from eBay's 7200s lifetime

/**
 * Fetches a fresh eBay OAuth token via Client Credentials Grant.
 */
async function fetchFreshEbayToken(env) {
  const clientId = getCleanCredential(env.EBAY_CLIENT_ID);
  const clientSecret = getCleanCredential(env.EBAY_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    throw new Error('Missing eBay credentials: EBAY_CLIENT_ID and EBAY_CLIENT_SECRET required');
  }

  const { oauthUrl, isSandbox } = getEbayEndpoints(env);
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(oauthUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`eBay OAuth failed (${response.status}) [target: ${isSandbox ? 'sandbox' : 'production'}]: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('eBay OAuth response missing access_token');
  }

  return data.access_token;
}

/**
 * Returns a valid eBay access token, reading from GATEWAY_KV cache when available.
 * Falls back gracefully to a fresh token fetch when KV is not bound (local dev).
 * Exported for reuse by ebayCatalog.js and ebayItem.js.
 */
export async function getCachedEbayToken(env) {
  if (env.GATEWAY_KV) {
    try {
      const cached = await env.GATEWAY_KV.get(EBAY_TOKEN_KV_KEY, { type: 'json' });
      if (cached && cached.token && cached.expires_at > Date.now()) {
        return cached.token;
      }
    } catch (_) {
      // KV read failure - fall through to fresh fetch
    }
  }

  const token = await fetchFreshEbayToken(env);

  if (env.GATEWAY_KV) {
    try {
      await env.GATEWAY_KV.put(
        EBAY_TOKEN_KV_KEY,
        JSON.stringify({ token, expires_at: Date.now() + EBAY_TOKEN_TTL_SECONDS * 1000 }),
        { expirationTtl: EBAY_TOKEN_TTL_SECONDS }
      );
    } catch (_) {
      // KV write failure - non-fatal, token still returned
    }
  }

  return token;
}

function relaxQuery(q) {
  if (!q) return '';
  let text = q
    .replace(/\b(?:gem\s+mint|mint|rookie\s+card|rc|auto\s+patch|patch\s+auto|authenticated|graded|authentic)\b/gi, '')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 5) {
    return words.slice(0, 5).join(' ');
  }
  return text !== q && words.length >= 2 ? text : '';
}

/**
 * Direct eBay completed & sold search scraper for real sold comps.
 */
async function fetchEbaySoldHtmlScrape(query) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });

  if (!res.ok) {
    console.warn(`[ebay gateway] HTML scrape HTTP ${res.status}`);
    return [];
  }

  const html = await res.text();
  const items = [];

  // Match each s-item block
  const itemBlocks = html.split(/class="s-item\s/);
  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];

    // Extract title
    const titleMatch = block.match(/class="s-item__title"[^>]*>(?:<span[^>]*>)?([^<]+)/i);
    const title = titleMatch ? titleMatch[1].replace(/^(?:New Listing|Shop on eBay)\s*/i, '').trim() : '';
    if (!title || /Shop on eBay/i.test(title)) continue;

    // Extract price
    const priceMatch = block.match(/class="s-item__price"[^>]*>(?:<span[^>]*>)?\$([0-9.,]+)/i);
    const priceVal = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
    if (!priceVal || priceVal <= 0 || priceVal > 100000) continue;

    // Extract sold date (e.g. "Sold Aug 3, 2026")
    const dateMatch = block.match(/class="s-item__caption"[^>]*>(?:<span[^>]*>)?(?:Sold\s+)?([^<]+)/i) ||
                      block.match(/class="s-item__ended-date"[^>]*>([^<]+)/i);
    const soldDate = dateMatch ? dateMatch[1].trim() : null;

    // Extract link
    const linkMatch = block.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^\s"?]+)/i);
    const itemUrl = linkMatch ? linkMatch[1] : null;

    // Extract eBay item ID
    const idMatch = itemUrl ? itemUrl.match(/\/itm\/(\d+)/) : null;
    const ebayItemId = idMatch ? idMatch[1] : null;

    // Extract image
    const imgMatch = block.match(/src="(https:\/\/i\.ebayimg\.com\/[^\s"]+)"/i) ||
                     block.match(/data-src="(https:\/\/i\.ebayimg\.com\/[^\s"]+)"/i);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    // Condition
    const condMatch = block.match(/class="SECONDARY_INFO"[^>]*>([^<]+)/i);
    const condition = condMatch ? condMatch[1].trim() : 'Pre-Owned';

    items.push({
      type: 'sold',
      title,
      price: priceVal,
      price_formatted: `$${priceVal.toFixed(2)}`,
      condition,
      ebay_item_id: ebayItemId,
      sold_date: soldDate,
      image_url: imageUrl,
      item_url: itemUrl || (ebayItemId ? `https://www.ebay.com/itm/${ebayItemId}` : null)
    });
  }

  return items;
}

/**
 * Searches eBay Marketplace Insights for recently sold listings AND Browse API for active listings.
 * Returns structured sold comps and active comps with attached listing details (image, title, date, url).
 */
async function fetchEbaySoldComps(query, env) {
  const accessToken = await getCachedEbayToken(env);
  const endpoints = getEbayEndpoints(env);
  const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&_sop=13`;

  let soldItems = [];
  let soldPrices = [];

  let activeItems = [];
  let activePrices = [];

  const executeInsightsQuery = async (searchQ) => {
    const insightsParams = new URLSearchParams({
      q: searchQ,
      limit: '20',
      sort: '-lastSoldDate'
    });
    const insightsRes = await fetch(`${endpoints.insightsUrl}?${insightsParams}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json'
      }
    });
    if (insightsRes.ok) {
      const insightsData = await insightsRes.json();
      const itemSummaries = insightsData.itemSales || insightsData.itemSummaries || [];
      for (const item of itemSummaries) {
        const priceObj = item.lastSoldPrice || item.price || {};
        const priceVal = parseFloat(priceObj.value || '0');
        if (!isNaN(priceVal) && priceVal > 0 && priceVal < 100000) {
          soldPrices.push(priceVal);
          soldItems.push({
            type: 'sold',
            title: item.title || searchQ,
            price: priceVal,
            price_formatted: `$${priceVal.toFixed(2)}`,
            condition: item.condition || 'Pre-Owned',
            ebay_item_id: item.itemId || null,
            sold_date: item.lastSoldDate || null,
            image_url: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
            item_url: item.itemWebUrl || (item.itemId ? `https://www.ebay.com/itm/${item.itemId}` : null)
          });
        }
      }
    }
  };

  const executeBrowseQuery = async (searchQ) => {
    const browseParams = new URLSearchParams({
      q: searchQ,
      limit: '20',
      sort: 'price',
      filter: 'buyingOptions:{FIXED_PRICE}'
    });
    const browseRes = await fetch(`${endpoints.browseUrl}?${browseParams}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json'
      }
    });
    if (browseRes.ok) {
      const browseData = await browseRes.json();
      const summaries = browseData.itemSummaries || [];
      for (const item of summaries) {
        const priceObj = item.price || {};
        const priceVal = parseFloat(priceObj.value || '0');
        if (!isNaN(priceVal) && priceVal > 0 && priceVal < 100000) {
          activePrices.push(priceVal);
          activeItems.push({
            type: 'active',
            title: item.title || searchQ,
            price: priceVal,
            price_formatted: `$${priceVal.toFixed(2)}`,
            condition: item.condition || 'Active Listing',
            ebay_item_id: item.itemId || null,
            sold_date: null,
            image_url: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
            item_url: item.itemWebUrl || (item.itemId ? `https://www.ebay.com/itm/${item.itemId}` : null)
          });
        }
      }
    }
  };

  const relaxed = relaxQuery(query);

  // Run Sold (Insights) and Active (Browse) searches in parallel
  await Promise.all([
    (async () => {
      try {
        await executeInsightsQuery(query);
      } catch (e) {
        console.warn('[ebay gateway] Insights pass 1 error:', e.message);
      }
      if (soldPrices.length === 0 && relaxed) {
        try {
          await executeInsightsQuery(relaxed);
        } catch (e) {
          console.warn('[ebay gateway] Insights pass 2 error:', e.message);
        }
      }
    })(),
    (async () => {
      try {
        await executeBrowseQuery(query);
      } catch (e) {
        console.warn('[ebay gateway] Browse pass 1 error:', e.message);
      }
      if (activePrices.length === 0 && relaxed) {
        try {
          await executeBrowseQuery(relaxed);
        } catch (e) {
          console.warn('[ebay gateway] Browse pass 2 error:', e.message);
        }
      }
    })()
  ]);

  // If Insights API returned 0 sold items, execute direct eBay completed/sold search
  if (soldItems.length === 0) {
    try {
      const scrapedSold = await fetchEbaySoldHtmlScrape(query);
      for (const item of scrapedSold) {
        soldPrices.push(item.price);
        soldItems.push(item);
      }
      if (soldItems.length === 0 && relaxed) {
        const scrapedRelaxed = await fetchEbaySoldHtmlScrape(relaxed);
        for (const item of scrapedRelaxed) {
          soldPrices.push(item.price);
          soldItems.push(item);
        }
      }
    } catch (e) {
      console.warn('[ebay gateway] Sold HTML scrape error:', e.message);
    }
  }

  // Sort sold items and active items by price
  soldItems.sort((a, b) => a.price - b.price);
  activeItems.sort((a, b) => a.price - b.price);

  // Calculate sold statistics (STRICTLY from real sold transactions)
  let comp_1 = null, comp_2 = null, comp_3 = null;
  let comp_1_item = null, comp_2_item = null, comp_3_item = null;
  let sold_avg = null, median = null;

  if (soldItems.length > 0) {
    comp_1_item = soldItems[0];
    comp_1 = comp_1_item.price;

    const midIdx = Math.floor(soldItems.length / 2);
    comp_2_item = soldItems[midIdx];
    comp_2 = comp_2_item.price;

    comp_3_item = soldItems[soldItems.length - 1];
    comp_3 = comp_3_item.price;

    const sum = soldPrices.reduce((a, b) => a + b, 0);
    sold_avg = parseFloat((sum / soldPrices.length).toFixed(2));
    median = comp_2;
  }

  // Calculate active statistics (STRICTLY from live competitor listings)
  let active_comp_1 = null, active_comp_2 = null, active_comp_3 = null;
  let active_comp_1_item = null, active_comp_2_item = null, active_comp_3_item = null;
  let active_avg = null;

  if (activeItems.length > 0) {
    active_comp_1_item = activeItems[0];
    active_comp_1 = active_comp_1_item.price;

    const midIdx = Math.floor(activeItems.length / 2);
    active_comp_2_item = activeItems[midIdx];
    active_comp_2 = active_comp_2_item.price;

    active_comp_3_item = activeItems[activeItems.length - 1];
    active_comp_3 = active_comp_3_item.price;

    const sum = activePrices.reduce((a, b) => a + b, 0);
    active_avg = parseFloat((sum / activePrices.length).toFixed(2));
  }

  // Determine recommended asking price (prioritizes sold average, falls back to active average)
  const recommended_list_price = sold_avg || active_avg || comp_2 || active_comp_2 || null;

  return {
    success: true,
    query,
    count: soldItems.length + activeItems.length,
    sold_count: soldItems.length,
    active_count: activeItems.length,
    source: 'ebay_api',
    comp_1,
    comp_2,
    comp_3,
    comp_1_item,
    comp_2_item,
    comp_3_item,
    active_comp_1,
    active_comp_2,
    active_comp_3,
    active_comp_1_item,
    active_comp_2_item,
    active_comp_3_item,
    sold_comps: soldItems,
    active_comps: activeItems,
    items: [...soldItems, ...activeItems],
    live_avg: sold_avg || active_avg,
    sold_avg,
    active_avg,
    median,
    recommended_list_price,
    min_comp: comp_1 || active_comp_1,
    max_comp: comp_3 || active_comp_3,
    ebay_search_url: ebaySearchUrl,
    notice: (soldItems.length === 0 && activeItems.length === 0)
      ? 'No live listings found on eBay for this query. Try adjusting item type or click the eBay link.'
      : undefined
  };
}

// --- Route Handlers ---

export async function onRequestGet(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    await requireGatewayAuth(request, env);

    const url = new URL(request.url);
    const query = (url.searchParams.get('query') || '').trim();
    if (!query) return err('query parameter is required', 400);

    const results = await fetchEbaySoldComps(query, env);
    return ok(results);
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    await requireGatewayAuth(request, env);

    const body = await request.json().catch(() => ({}));
    const query = (body.query || '').trim();

    if (!query) return err('query is required', 400);

    // itemId is passed through for client-side use (Option A: outpost persists to D1)
    const results = await fetchEbaySoldComps(query, env);

    // Include itemId in response so the outpost client can issue its own D1 write
    if (body.itemId) {
      results.itemId = body.itemId;
    }

    return ok(results);
  });
}
