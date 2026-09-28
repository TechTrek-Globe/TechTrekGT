import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, fetchEbayActiveSellerListings } from './tokenHelper.js';
import { getCachedEbayListings, setCachedEbayListings } from './listingsCache.js';

/**
 * GET /api/ebay/active-listings
 *
 * Fast on-demand fetch of active eBay seller listings supporting both
 * traditional web/app listings (eBay Trading API) and REST Inventory listings (Sell Inventory API).
 * Used by interactive listing selectors (e.g. EbayListingIdModal, ListingMatchReviewModal, EditItemModal).
 *
 * Implements a 15-minute cache (MED-15) backed by D1 `ebay_listings_cache` to eliminate
 * redundant multi-call upstream eBay fetches.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true' || url.searchParams.get('refresh') === 'true';

    try {
      if (!force) {
        const cached = await getCachedEbayListings(env.DB, payload.userId, 15);
        if (cached) {
          return ok({
            listings: cached.listings,
            total: cached.listings.length,
            cached: true,
            fetched_at: cached.fetched_at
          });
        }
      }

      const accessToken = await getEbayUserToken(env, payload.userId);
      const listings = await fetchEbayActiveSellerListings(env, accessToken);

      await setCachedEbayListings(env.DB, payload.userId, listings);

      return ok({
        listings,
        total: listings.length,
        cached: false,
        fetched_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('[active-listings] Failed to fetch active eBay listings:', e);
      const msg = e.message || '';
      if (msg.includes('not connected') || msg.includes('expired')) {
        return err('eBay account not connected or session expired. Please connect your eBay account.', 401);
      }
      return err('Failed to fetch active eBay listings. Please try again.', 500);
    }
  });
}

