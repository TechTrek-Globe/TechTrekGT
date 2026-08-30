import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, fetchEbayActiveSellerListings } from './tokenHelper.js';

/**
 * GET /api/ebay/active-listings
 *
 * Fast on-demand fetch of active eBay seller listings supporting both
 * traditional web/app listings (eBay Trading API) and REST Inventory listings (Sell Inventory API).
 * Used by interactive listing selectors (e.g. EbayListingIdModal, ListingMatchReviewModal, EditItemModal).
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    try {
      const accessToken = await getEbayUserToken(env, payload.userId);
      const listings = await fetchEbayActiveSellerListings(env, accessToken);

      return ok({
        listings,
        total: listings.length
      });
    } catch (e) {
      const msg = e.message || 'Unknown error';
      if (msg.includes('not connected') || msg.includes('refresh token has expired')) return err(msg, 401);
      return err(`Failed to fetch active eBay listings: ${msg}`, 500);
    }
  });
}

