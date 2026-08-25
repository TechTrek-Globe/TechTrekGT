import { requireGatewayAuth, withGatewayAuth, ok, err } from './guard.js';
import { getCachedEbayToken } from './ebay.js';

/**
 * GET /api/ebay/catalog?q=<query>
 *
 * Calls the eBay Catalog API (v1_beta/product_summary/search)
 * Returns structured catalog metadata and pre-fills.
 */
const EBAY_CATALOG_URL = 'https://api.ebay.com/commerce/catalog/v1_beta/product_summary/search';

export async function onRequestGet(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    await requireGatewayAuth(request, env);
    
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q || q.length < 3) return err('q must be at least 3 characters', 400);

    const token = await getCachedEbayToken(env);
    const params = new URLSearchParams({ q, limit: '5', fieldGroups: 'FULL' });

    const res = await fetch(`${EBAY_CATALOG_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    const data = res.ok ? await res.json() : {};
    
    // Default to empty products list if not successful or no products found
    const products = (data.productSummaries || []).map(p => ({
      epid: p.epid,
      title: p.title,
      image: p.image?.imageUrl || null,
      aspects: p.aspects || [] // eBay Catalog API often returns an array of {name, values[]}
    }));

    return ok({ products });
  });
}
