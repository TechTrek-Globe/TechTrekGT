import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, fetchSingleEbayListing, normalizeHttps } from '../ebay/tokenHelper.js';

/**
 * GET /api/items/image-preview
 * Resolves a high-quality product photo (either Amazon or eBay) on demand.
 * 
 * Query parameters:
 * - id: Outpost Item ID (optional)
 * - ebay_listing_id: eBay 12-digit listing ID (optional)
 * - asin: Amazon ASIN (optional)
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const itemId = url.searchParams.get('id') || url.searchParams.get('itemId') || '';
    let listingId = url.searchParams.get('ebay_listing_id') || url.searchParams.get('listingId') || '';
    let asin = url.searchParams.get('asin') || '';

    let item = null;
    let attrs = {};

    // 1. Check local DB if itemId is provided
    if (itemId) {
      item = await env.DB.prepare(
        `SELECT id, item_name, ebay_listing_id, notes, attributes FROM auction_items WHERE id = ? AND user_id = ?`
      ).bind(itemId, payload.userId).first();

      if (item) {
        if (!listingId && item.ebay_listing_id) {
          listingId = item.ebay_listing_id;
        }

        if (item.attributes) {
          try {
            const parsed = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
            attrs = (parsed && typeof parsed === 'object') ? parsed : {};
          } catch (_) {
            attrs = {};
          }
        }

        if (!asin && attrs.asin) {
          asin = attrs.asin;
        }

        // Fast path 1: attributes already has an eBay image URL
        if (attrs.ebay_image_url) {
          const normEbay = normalizeHttps(attrs.ebay_image_url);
          if (normEbay) return ok({ success: true, imageUrl: normEbay, source: 'eBay' });
        }

        // Fast path 2: attributes already has an Amazon image URL
        if (attrs.image_url) {
          const normAmz = normalizeHttps(attrs.image_url);
          if (normAmz) return ok({ success: true, imageUrl: normAmz, source: 'Amazon' });
        }
        // Handle image_urls as a JS array or as a double-serialized JSON string
        const resolvedImageUrls = Array.isArray(attrs.image_urls)
          ? attrs.image_urls
          : (typeof attrs.image_urls === 'string' ? (() => { try { return JSON.parse(attrs.image_urls); } catch (_) { return []; } })() : []);
        if (resolvedImageUrls.length > 0 && resolvedImageUrls[0]) {
          const normArr = normalizeHttps(resolvedImageUrls[0]);
          if (normArr) return ok({ success: true, imageUrl: normArr, source: 'Amazon' });
        }

        // Fast path 3: check notes for embedded image URL
        if (item.notes) {
          const m = String(item.notes).match(/Image:\s*(https?:\/\/[^\s\n\r|]+)/i) ||
                    String(item.notes).match(/(https?:\/\/(?:m\.media-amazon\.com|i\.ebayimg\.com)[^\s\n\r|]+)/i);
          if (m && m[1]) {
            const isEbay = m[1].includes('ebayimg');
            const normNotes = normalizeHttps(m[1]);
            if (normNotes) return ok({ success: true, imageUrl: normNotes, source: isEbay ? 'eBay' : 'Amazon' });
          }
        }
      }
    }

    // 2. Try pulling live from eBay if listingId is present
    if (listingId && /^\d+$/.test(String(listingId).trim())) {
      try {
        const accessToken = await getEbayUserToken(env, payload.userId);
        if (accessToken) {
          const singleDetail = await fetchSingleEbayListing(env, accessToken, listingId);
          const normSingle = normalizeHttps(singleDetail?.image_url);
          if (normSingle) {
            // Cache back to attributes in DB so future hovers are instant
            if (item) {
              attrs.ebay_image_url = normSingle;
              await env.DB.prepare(
                `UPDATE auction_items SET attributes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
              ).bind(JSON.stringify(attrs), item.id, payload.userId).run().catch(() => {});
            }
            return ok({ success: true, imageUrl: normSingle, source: 'eBay' });
          }
        }
      } catch (ebayErr) {
        console.warn(`[image-preview] eBay image fetch failed for #${listingId}:`, ebayErr);
      }
    }

    // 3. Try pulling live from Amazon Gateway if ASIN is present
    if (asin && /^B[0-9A-Z]{9}$/i.test(String(asin).trim())) {
      const cleanAsin = String(asin).trim().toUpperCase();
      try {
        const reqUrl = new URL(request.url);
        const gatewayBase = reqUrl.hostname === 'localhost' || reqUrl.hostname === '127.0.0.1'
          ? `${reqUrl.protocol}//${reqUrl.hostname}:8787`
          : 'https://techtrekgt.com';

        const gwRes = await fetch(`${gatewayBase}/api/amazon/fetch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('Cookie') || ''
          },
          body: JSON.stringify({ input: cleanAsin })
        });

        if (gwRes.ok) {
          const gwData = await gwRes.json().catch(() => ({}));
          // Gateway returns `image` (singular), fallback to images[0] and image_url
          const rawImg = gwData.image || (Array.isArray(gwData.images) && gwData.images[0]) || gwData.image_url || null;
          const img = normalizeHttps(rawImg);
          if (img) {
            if (item) {
              attrs.image_url = img;
              await env.DB.prepare(
                `UPDATE auction_items SET attributes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
              ).bind(JSON.stringify(attrs), item.id, payload.userId).run().catch(() => {});
            }
            return ok({ success: true, imageUrl: img, source: 'Amazon' });
          }
        }
      } catch (amzErr) {
        console.warn(`[image-preview] Amazon fetch failed for ASIN ${cleanAsin}:`, amzErr);
      }
    }

    return ok({ success: false, imageUrl: null });
  });
}
