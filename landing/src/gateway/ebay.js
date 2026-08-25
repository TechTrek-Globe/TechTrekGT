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
 *
 * Returns structured comp data compatible with the outpost auction_comps schema.
 *
 * Option A persistence: the gateway returns raw data only. The outpost client
 * is responsible for a second call to POST /outpost/api/comps to persist to D1.
 */

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_INSIGHTS_URL = 'https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope';

/**
 * Obtains an OAuth 2.0 Application Access Token via Client Credentials Grant.
 * Tokens are valid for ~2 hours. In Phase 1 (stateless, no KV cache) we
 * fetch a fresh token per request. Phase 2 can add KV caching.
 */
async function getEbayAccessToken(env) {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) {
    throw new Error('Missing eBay credentials: EBAY_CLIENT_ID and EBAY_CLIENT_SECRET required');
  }

  const credentials = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);

  const response = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`eBay OAuth failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('eBay OAuth response missing access_token');
  }

  return data.access_token;
}

/**
 * Searches eBay Marketplace Insights for recently sold listings.
 * Falls back to the Browse API (active listings) if Insights returns no results.
 */
async function fetchEbaySoldComps(query, env) {
  const accessToken = await getEbayAccessToken(env);
  const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1&_sop=13`;

  // --- Primary: Marketplace Insights API (sold/completed items) ---
  const insightsParams = new URLSearchParams({
    q: query,
    limit: '20',
    sort: '-lastSoldDate'
  });

  let items = [];
  let prices = [];

  try {
    const insightsRes = await fetch(`${EBAY_INSIGHTS_URL}?${insightsParams}`, {
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
            title: item.title || query,
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
  } catch (e) {
    console.warn('[ebay gateway] Insights API error:', e.message);
  }

  // --- Fallback: Browse API (active listings with price context) ---
  if (prices.length === 0) {
    try {
      const browseParams = new URLSearchParams({
        q: query,
        limit: '20',
        sort: 'price',
        filter: 'buyingOptions:{FIXED_PRICE}'
      });

      const browseRes = await fetch(`${EBAY_BROWSE_URL}?${browseParams}`, {
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
              title: item.title || query,
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
    } catch (e) {
      console.warn('[ebay gateway] Browse API fallback error:', e.message);
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
