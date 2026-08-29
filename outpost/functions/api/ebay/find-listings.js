import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/ebay/find-listings
 *
 * Fetches active eBay seller listings from the landing gateway (Sell Inventory API),
 * then fuzzy-matches them against internal auction_items that:
 *   - Have status = 'Listed'
 *   - Have ebay_listing_id IS NULL (not yet mapped)
 *
 * Returns a list of { ebay_listing, matched_item, confidence } for user review.
 * Confidence >= 0.80 is highlighted as high-confidence auto-match.
 *
 * No writes are performed here. The frontend's ListingMatchReviewModal
 * sends a PATCH to /api/items/:id to confirm individual matches.
 */

/**
 * Simple token-overlap fuzzy score: proportion of title tokens from the eBay listing
 * that appear in the item name + athlete string.
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

    const gatewayBase = env.GATEWAY_URL || 'https://techtrekgt.com';

    // Fetch all active eBay listings from the landing gateway
    let ebayListings = [];
    try {
      const listRes = await fetch(`${gatewayBase}/api/ebay/listings?limit=200`, {
        headers: {
          Cookie: request.headers.get('Cookie') || '',
          Origin: 'https://techtrekgt.com'
        }
      });
      if (!listRes.ok) {
        const data = await listRes.json().catch(() => ({}));
        return err(data.error || `Gateway listings error ${listRes.status}`, listRes.status);
      }
      const listData = await listRes.json();
      ebayListings = (listData.data?.listings || listData.listings || []).filter(l => l.listing_id);
    } catch (e) {
      return err(`Failed to fetch eBay listings: ${e.message}`, 502);
    }

    if (ebayListings.length === 0) {
      return ok({ matches: [], ebay_listing_count: 0 });
    }

    // Fetch all unmapped 'Listed' items for this user
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

    // Build match candidates
    const matches = [];
    for (const listing of ebayListings) {
      const candidates = internalItems.map(item => ({
        item,
        score: fuzzyScore(listing.title, item.item_name, item.athlete_person)
      })).filter(c => c.score >= 0.40);

      if (candidates.length === 0) continue;

      // Sort by score descending, take best
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
        // Additional candidates for user to switch to if best is wrong
        alternatives: candidates.slice(1, 3).map(c => ({
          id: c.item.id,
          item_name: c.item.item_name,
          athlete_person: c.item.athlete_person,
          confidence: parseFloat(c.score.toFixed(2))
        }))
      });
    }

    // Sort: high confidence first
    matches.sort((a, b) => b.confidence - a.confidence);

    return ok({
      matches,
      ebay_listing_count: ebayListings.length,
      internal_item_count: internalItems.length,
      match_count: matches.length
    });
  });
}
