import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, getEbayApiBase } from './tokenHelper.js';

/**
 * GET /api/ebay/active-listings
 *
 * Fast on-demand fetch of active eBay seller listings directly from
 * the eBay Sell Inventory API (without requiring inventory fuzzy matching).
 * Used by interactive listing selectors (e.g. EbayListingIdModal, ListingMatchReviewModal).
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    try {
      const accessToken = await getEbayUserToken(env, payload.userId);
      const base = getEbayApiBase(env);

      const url = new URL(request.url);
      const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '100', 10));
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const invRes = await fetch(`${base}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!invRes.ok) {
        const text = await invRes.text().catch(() => '');
        if (invRes.status === 401) return err('eBay token rejected. Disconnect and reconnect your eBay account.', 401);
        if (invRes.status === 403) return err('eBay Sell Inventory API requires sell.inventory.readonly scope approval.', 403);
        return err(`eBay Inventory API error (${invRes.status}): ${text.slice(0, 200)}`, invRes.status);
      }

      const invData = await invRes.json();
      const inventoryItems = invData.inventoryItems || [];

      const listings = [];
      for (const inv of inventoryItems) {
        try {
          const offerRes = await fetch(
            `${base}/sell/inventory/v1/offer?sku=${encodeURIComponent(inv.sku)}&limit=1`,
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          if (offerRes.ok) {
            const offerData = await offerRes.json();
            const offer = offerData.offers?.[0];
            listings.push({
              sku: inv.sku,
              listing_id: offer?.listingId || null,
              title: inv.product?.title || '',
              condition: inv.condition,
              price: parseFloat(offer?.pricingSummary?.price?.value || '0'),
              quantity: inv.availability?.shipToLocationAvailability?.quantity || 0,
              status: offer?.status || 'UNKNOWN',
              listing_url: offer?.listingId ? `https://www.ebay.com/itm/${offer.listingId}` : null
            });
          } else {
            listings.push({
              sku: inv.sku,
              listing_id: null,
              title: inv.product?.title || '',
              condition: inv.condition,
              price: 0,
              quantity: inv.availability?.shipToLocationAvailability?.quantity || 0,
              status: 'UNPUBLISHED',
              listing_url: null
            });
          }
        } catch (_) {
          listings.push({ sku: inv.sku, listing_id: null, title: inv.product?.title || '', price: 0 });
        }
      }

      return ok({
        listings,
        total: invData.total || listings.length,
        limit,
        offset
      });
    } catch (e) {
      const msg = e.message || 'Unknown error';
      if (msg.includes('not connected') || msg.includes('refresh token has expired')) return err(msg, 401);
      return err(`Failed to fetch active eBay listings: ${msg}`, 500);
    }
  });
}
