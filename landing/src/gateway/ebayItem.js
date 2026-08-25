import { requireGatewayAuth, withGatewayAuth, ok, err } from './guard.js';
import { getCachedEbayToken } from './ebay.js';

/**
 * GET /api/ebay/item/:itemId
 *
 * Calls the eBay Browse API (buy/browse/v1/item/<itemId>)
 * Returns condition and descriptive metadata.
 */
const EBAY_ITEM_URL = 'https://api.ebay.com/buy/browse/v1/item';

export async function onRequestGet(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    await requireGatewayAuth(request, env);
    
    const url = new URL(request.url);
    // e.g. /api/ebay/item/v1|123456789|0
    const itemId = url.pathname.replace('/api/ebay/item/', '').trim();
    if (!itemId) return err('itemId is required', 400);

    const token = await getCachedEbayToken(env);
    
    const res = await fetch(`${EBAY_ITEM_URL}/${encodeURIComponent(itemId)}?fieldgroups=PRODUCT,COMPACT`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return err(`eBay item fetch failed (${res.status}): ${text.slice(0, 200)}`, res.status);
    }

    const data = await res.json();
    
    return ok({
      itemId: data.itemId,
      title: data.title,
      condition: data.condition,
      conditionDescription: data.conditionDescription,
      localizedAspects: data.localizedAspects || [],
      shortDescription: data.shortDescription,
      images: (data.additionalImages || [data.image]).filter(Boolean).map(i => i.imageUrl)
    });
  });
}
