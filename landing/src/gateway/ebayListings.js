import { requireGatewayAuth, withGatewayAuth, ok, err } from './guard.js';
import { getEbayUserToken } from './ebayOAuth.js';
import { getEbayEndpoints } from './ebay.js';

/**
 * GET /api/ebay/listings          - List all active seller listings (Sell Inventory API)
 * GET /api/ebay/listings/:id      - Get a single listing by eBay listing ID
 *
 * Requires: user-level eBay OAuth token (sell.inventory.readonly scope)
 * Required bindings: DB (for user token lookup)
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    const { userId } = await requireGatewayAuth(request, env);

    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, userId);
    } catch (e) {
      return err(`eBay auth: ${e.message}`, 401);
    }

    const { isSandbox } = getEbayEndpoints(env);
    const base = isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route: GET /api/ebay/listings/:id  (single listing)
    const listingIdMatch = pathname.match(/\/api\/ebay\/listings\/(.+)$/);
    if (listingIdMatch) {
      const listingId = listingIdMatch[1];
      const itemUrl = `${base}/buy/browse/v1/item/v1|${encodeURIComponent(listingId)}|0?fieldgroups=PRODUCT,COMPACT`;

      const res = await fetch(itemUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return err(`eBay listing fetch failed (${res.status}): ${text.slice(0, 200)}`, res.status);
      }

      const data = await res.json();
      return ok({
        listing_id: listingId,
        title: data.title,
        price: parseFloat(data.price?.value || '0'),
        condition: data.condition,
        status: data.buyingOptions,
        image_url: data.image?.imageUrl || null,
        item_url: data.itemWebUrl || null
      });
    }

    // Route: GET /api/ebay/listings  (all active listings via Sell Inventory API)
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '100'));
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const inventoryUrl = `${base}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;
    const res = await fetch(inventoryUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 403) {
        return err('eBay Sell Inventory API access requires sell.inventory.readonly scope approval.', 403);
      }
      return err(`eBay Inventory API error (${res.status}): ${text.slice(0, 200)}`, res.status);
    }

    const data = await res.json();
    const items = (data.inventoryItems || []).map(inv => ({
      sku: inv.sku,
      title: inv.product?.title || '',
      condition: inv.condition,
      quantity: inv.availability?.shipToLocationAvailability?.quantity || 0,
      aspects: inv.product?.aspects || {}
    }));

    // Fetch active offer prices for these SKUs (Sell Inventory Offer API)
    const listings = [];
    for (const item of items) {
      try {
        const offerRes = await fetch(
          `${base}/sell/inventory/v1/offer?sku=${encodeURIComponent(item.sku)}&limit=1`,
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );
        if (offerRes.ok) {
          const offerData = await offerRes.json();
          const offer = offerData.offers?.[0];
          listings.push({
            sku: item.sku,
            listing_id: offer?.listingId || null,
            title: item.title,
            condition: item.condition,
            price: parseFloat(offer?.pricingSummary?.price?.value || '0'),
            quantity: item.quantity,
            status: offer?.status || 'UNKNOWN',
            listing_url: offer?.listingId
              ? `https://www.ebay.com/itm/${offer.listingId}`
              : null
          });
        } else {
          listings.push({ sku: item.sku, listing_id: null, title: item.title, condition: item.condition, quantity: item.quantity });
        }
      } catch (_) {
        listings.push({ sku: item.sku, listing_id: null, title: item.title });
      }
    }

    return ok({
      listings,
      total: data.total || items.length,
      limit,
      offset
    });
  });
}
