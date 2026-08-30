import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, getEbayApiBase } from './tokenHelper.js';

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

    let ebayListings = [];
    try {
      const accessToken = await getEbayUserToken(env, payload.userId);
      const base = getEbayApiBase(env);

      // Fetch all inventory items from eBay Sell Inventory API
      const invRes = await fetch(`${base}/sell/inventory/v1/inventory_item?limit=100&offset=0`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!invRes.ok) {
        const text = await invRes.text().catch(() => '');
        if (invRes.status === 401) return err('eBay token rejected. Disconnect and reconnect your eBay account in Settings.', 401);
        if (invRes.status === 403) return err('eBay Sell Inventory API requires sell.inventory.readonly scope approval at developer.ebay.com.', 403);
        return err(`eBay Inventory API error (${invRes.status}): ${text.slice(0, 200)}`, invRes.status);
      }

      const invData = await invRes.json();
      const inventoryItems = invData.inventoryItems || [];

      // Fetch active offer price for each SKU
      for (const inv of inventoryItems) {
        try {
          const offerRes = await fetch(
            `${base}/sell/inventory/v1/offer?sku=${encodeURIComponent(inv.sku)}&limit=1`,
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          if (offerRes.ok) {
            const offerData = await offerRes.json();
            const offer = offerData.offers?.[0];
            ebayListings.push({
              sku: inv.sku,
              listing_id: offer?.listingId || null,
              title: inv.product?.title || '',
              condition: inv.condition,
              price: parseFloat(offer?.pricingSummary?.price?.value || '0'),
              status: offer?.status || 'UNKNOWN',
              listing_url: offer?.listingId ? `https://www.ebay.com/itm/${offer.listingId}` : null
            });
          } else {
            ebayListings.push({ sku: inv.sku, listing_id: null, title: inv.product?.title || '', condition: inv.condition });
          }
        } catch (_) {
          ebayListings.push({ sku: inv.sku, listing_id: null, title: inv.product?.title || '' });
        }
      }

      // Stamp last_refreshed_at on success
      await env.DB.prepare(
        `UPDATE ebay_oauth_tokens SET last_refreshed_at = datetime('now') WHERE user_id = ?`
      ).bind(payload.userId).run().catch(() => {});

    } catch (e) {
      const msg = e.message || 'Unknown error';
      if (msg.includes('not connected') || msg.includes('refresh token has expired')) return err(msg, 401);
      if (msg.includes('EBAY_CLIENT_ID') || msg.includes('Cannot refresh token')) return err(msg, 500);
      return err(`eBay sync failed: ${msg}`, 502);
    }

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

    if (ebayListings.length === 0) {
      return ok({
        matches: [],
        ebay_listing_count: 0,
        internal_item_count: internalItems.length,
        match_count: 0
      });
    }

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

    const matchedItemIds = new Set(matches.map(m => m.matched_item.id));
    const matchedListingIds = new Set(matches.map(m => m.ebay_listing.listing_id || m.ebay_listing.sku));

    const unmatchedItems = internalItems.filter(item => !matchedItemIds.has(item.id));
    const unmatchedEbayListings = ebayListings.filter(l => !matchedListingIds.has(l.listing_id || l.sku));

    return ok({
      matches,
      ebay_listings: ebayListings,
      unmatched_items: unmatchedItems,
      unmatched_ebay_listings: unmatchedEbayListings,
      all_internal_items: internalItems,
      ebay_listing_count: ebayListings.length,
      internal_item_count: internalItems.length,
      match_count: matches.length
    });
  });
}
