import { requireGatewayAuth, withGatewayAuth, ok, err } from './guard.js';
import { getCachedEbayToken, getEbayEndpoints } from './ebay.js';

/**
 * GET /api/ebay/item/:itemId
 *
 * Calls the eBay Browse API (buy/browse/v1/item/<itemId>)
 * Returns condition and descriptive metadata.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    await requireGatewayAuth(request, env);
    
    const url = new URL(request.url);
    // e.g. /api/ebay/item/v1|123456789|0
    const rawParam = url.pathname.replace('/api/ebay/item/', '').trim();
    if (!rawParam) return err('itemId is required', 400);

    const numericMatch = rawParam.match(/(?:itm\/|item=|\b)(\d{12})\b/);
    const legacyId = numericMatch ? numericMatch[1] : (/^\d+$/.test(rawParam) ? rawParam : null);

    const token = await getCachedEbayToken(env);
    const endpoints = getEbayEndpoints(env);

    const targetUrl = legacyId
      ? `${endpoints.browseUrl.replace('/item_summary/search', '/item')}/get_item_by_legacy_id?legacy_item_id=${legacyId}&fieldgroups=PRODUCT,COMPACT`
      : `${endpoints.itemUrl}/${encodeURIComponent(rawParam)}?fieldgroups=PRODUCT,COMPACT`;

    const res = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[ebayItem] eBay item fetch failed (${res.status}):`, text);
      return err('Failed to fetch eBay item details. Please try again.', res.status);
    }

    const data = await res.json();
    const priceVal = data.price ? parseFloat(data.price.value) : null;
    const cleanImageUrl = data.image?.imageUrl || data.thumbnailImages?.[0]?.imageUrl || (data.additionalImages?.[0]?.imageUrl) || null;
    const finalItemId = legacyId || data.legacyItemId || data.itemId;

    return ok({
      itemId: finalItemId,
      title: data.title,
      price: priceVal,
      price_formatted: priceVal != null ? `$${priceVal.toFixed(2)}` : null,
      image_url: cleanImageUrl,
      item_url: data.itemWebUrl || (finalItemId ? `https://www.ebay.com/itm/${finalItemId}` : null),
      condition: data.condition,
      conditionDescription: data.conditionDescription,
      localizedAspects: data.localizedAspects || [],
      shortDescription: data.shortDescription,
      images: (data.additionalImages || [data.image]).filter(Boolean).map(i => i.imageUrl)
    });
  });
}
