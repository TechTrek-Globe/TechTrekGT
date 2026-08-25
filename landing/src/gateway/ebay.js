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
 * Searches eBay Marketplace Insights for recently sold listings.
 * Falls back to the Browse API (active listings) if Insights returns no results.
 */
async function fetchEbaySoldComps(query, env) {
  const accessToken = await getCachedEbayToken(env);
  const endpoints = getEbayEndpoints(env);
  const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&_sop=13`;

  let items = [];
  let prices = [];

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
          prices.push(priceVal);
          items.push({
            title: item.title || searchQ,
            price: priceVal,
            price_formatted: `$${priceVal.toFixed(2)}`,
            condition: item.condition || null,
            ebay_item_id: item.itemId || null,
            sold_date: item.lastSoldDate || null,
            image_url: item.image?.imageUrl || null,
            item_url: item.itemWebUrl || null
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
          prices.push(priceVal);
          items.push({
            title: item.title || searchQ,
            price: priceVal,
            price_formatted: `$${priceVal.toFixed(2)}`,
            condition: item.condition || null,
            ebay_item_id: item.itemId || null,
            sold_date: null,
            image_url: item.image?.imageUrl || null,
            item_url: item.itemWebUrl || null
          });
        }
      }
    }
  };

  // --- Pass 1: Insights API (Exact cleaned query) ---
  try {
    await executeInsightsQuery(query);
  } catch (e) {
    console.warn('[ebay gateway] Insights API pass 1 error:', e.message);
  }

  // --- Pass 2: Insights API (Relaxed query if 0 results) ---
  const relaxed = relaxQuery(query);
  if (prices.length === 0 && relaxed) {
    try {
      await executeInsightsQuery(relaxed);
    } catch (e) {
      console.warn('[ebay gateway] Insights API pass 2 error:', e.message);
    }
  }

  // --- Pass 3: Fallback Browse API (Active listings) ---
  if (prices.length === 0) {
    try {
      await executeBrowseQuery(query);
    } catch (e) {
      console.warn('[ebay gateway] Browse API pass 3 error:', e.message);
    }
  }

  // --- Pass 4: Fallback Browse API (Relaxed query) ---
  if (prices.length === 0 && relaxed) {
    try {
      await executeBrowseQuery(relaxed);
    } catch (e) {
      console.warn('[ebay gateway] Browse API pass 4 error:', e.message);
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
      source: 'ebay_api',
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

  return {
    success: true,
    query,
    count: 0,
    source: 'ebay_api',
    comp_1: null,
    comp_2: null,
    comp_3: null,
    live_avg: null,
    median: null,
    ebay_search_url: ebaySearchUrl,
    items: [],
    notice: 'No recent sold listings found for this query. Try refining your search terms or click the eBay link to browse manually.'
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
