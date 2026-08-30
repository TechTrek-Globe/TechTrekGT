import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/ebay/find-listings
 *
 * Fetches active eBay seller listings directly from eBay's Sell Inventory API,
 * then fuzzy-matches them against internal auction_items in D1 that:
 *   - Have status = 'Listed' or 'Available'
 *   - Have ebay_listing_id IS NULL or empty
 *
 * Returns a list of { ebay_listing, matched_item, confidence } for user review.
 */

function fuzzyScore(ebayTitle, itemName, athletePerson) {
  if (!ebayTitle) return 0;
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const titleTokens = normalize(ebayTitle).split(/\s+/).filter(t => t.length > 2);
  const haystack = normalize(`${itemName} ${athletePerson}`);

  if (titleTokens.length === 0) return 0;
  const matches = titleTokens.filter(t => haystack.includes(t)).length;
  return matches / titleTokens.length;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    // Call Central API Gateway on landing worker (holds eBay credentials & handles token refresh)
    const origin = new URL(request.url).origin;
    const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
    const gatewayUrl = isLocal ? 'http://localhost:8787/api/ebay/listings' : 'https://techtrekgt.com/api/ebay/listings';

    const cookie = request.headers.get('Cookie') || '';
    const authHeader = request.headers.get('Authorization') || '';

    let ebayListings = [];
    try {
      const gatewayRes = await fetch(gatewayUrl, {
        headers: {
          'Cookie': cookie,
          ...(authHeader ? { 'Authorization': authHeader } : {})
        }
      });

      if (!gatewayRes.ok) {
        const errData = await gatewayRes.json().catch(() => ({}));
        const errMsg = errData.error || `eBay Gateway error (${gatewayRes.status})`;
        return err(`eBay connection required: ${errMsg}`, gatewayRes.status === 401 ? 401 : gatewayRes.status);
      }

      const gatewayData = await gatewayRes.json();
      ebayListings = (gatewayData.listings || []).map(item => ({
        listing_id: item.listing_id || item.sku,
        sku: item.sku,
        title: item.title,
        price: item.price || 0,
        condition: item.condition || 'USED',
        status: item.status || 'Active',
        listing_url: item.listing_url || (item.listing_id ? `https://www.ebay.com/itm/${item.listing_id}` : null)
      }));
    } catch (e) {
      return err(`eBay gateway fetch failed: ${e.message}`, 502);
    }

    // Fetch unmapped 'Listed' or 'Available' items for this user from D1
    const rows = await env.DB.prepare(`
      SELECT id, item_name, athlete_person, authenticator, cert_number, category, ebay_listing_id
      FROM auction_items
      WHERE user_id = ?
        AND status IN ('Listed', 'Available')
        AND (ebay_listing_id IS NULL OR ebay_listing_id = '')
      ORDER BY created_at DESC
      LIMIT 500
    `).bind(payload.userId).all();

    const internalItems = rows.results || [];

    // If no eBay listings found on Inventory API, return gracefully
    if (ebayListings.length === 0) {
      return ok({
        matches: [],
        ebay_listing_count: 0,
        internal_item_count: internalItems.length,
        match_count: 0
      });
    }

    // Build match candidates
    const matches = [];
    for (const listing of ebayListings) {
      const candidates = internalItems.map(item => ({
        item,
        score: fuzzyScore(listing.title, item.item_name, item.athlete_person)
      })).filter(c => c.score >= 0.35);

      if (candidates.length === 0) continue;

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];

      matches.push({
        ebay_listing: {
          listing_id: listing.listing_id,
          title: listing.title,
          price: listing.price,
          condition: listing.condition,
          status: listing.status,
          listing_url: listing.listing_url,
          sku: listing.sku
        },
        matched_item: {
          id: best.item.id,
          item_name: best.item.item_name,
          athlete_person: best.item.athlete_person,
          authenticator: best.item.authenticator,
          cert_number: best.item.cert_number,
          category: best.item.category
        },
        confidence: parseFloat(best.score.toFixed(2)),
        high_confidence: best.score >= 0.80,
        alternatives: candidates.slice(1, 3).map(c => ({
          id: c.item.id,
          item_name: c.item.item_name,
          athlete_person: c.item.athlete_person,
          confidence: parseFloat(c.score.toFixed(2))
        }))
      });
    }

    matches.sort((a, b) => b.confidence - a.confidence);

    return ok({
      matches,
      ebay_listing_count: ebayListings.length,
      internal_item_count: internalItems.length,
      match_count: matches.length
    });
  });
}
