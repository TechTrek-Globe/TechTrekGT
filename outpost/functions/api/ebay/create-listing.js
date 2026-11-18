import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, createEbayListing, reviseEbayListing } from './tokenHelper.js';
import { generateAiListingDetails } from '../ai/generate-ebay-details.js';
import { generateEbayListingHtml } from '../../../src/utils/ebayTemplate.js';
import { generateEbayCopy } from '../../../src/utils/listingCopyGenerator.js';

/**
 * POST /api/ebay/create-listing
 *
 * 1-Click "Create / Publish on eBay" Engine.
 * Creates an active fixed-price listing directly on eBay using the user's OAuth access token
 * and Trading API (AddFixedPriceItem). Integrates Gemini AI to generate context-aware
 * listing cards, combines with Outpost's dark-theme HTML template, maps item specifics,
 * and atomically persists the newly generated eBay ItemID back to Cloudflare D1.
 *
 * Headers:
 *   Cookie: auth_token=...
 *
 * Body (JSON):
 *   item_id: string (required) - auction_items.id
 *   price?: number|string - list price in USD (defaults to current_list_price or min_sell_price)
 *   title?: string - custom title (max 80 chars, defaults to optimized eBay title)
 *   description_html?: string - custom HTML description (if omitted, generated via Gemini AI + template)
 *   use_ai?: boolean - whether to invoke Gemini AI for Condition & Key Details cards (default true)
 *   shipping_cost?: number - buyer shipping charge
 *   free_shipping?: boolean - whether shipping is free
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  return withAuth(async () => {
    // 1. Authenticate user session
    const payload = await requireAuth(request, env);
    const userId = payload.userId;

    const body = await request.json().catch(() => ({}));
    const itemId = String(body.item_id || body.id || '').trim();
    if (!itemId) {
      return err('item_id is required', 400);
    }

    // 2. Fetch inventory item from D1
    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(itemId, userId).first();

    if (!item) {
      return err('Item not found in inventory', 404);
    }

    // 3. Resolve eBay OAuth access token
    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, userId);
    } catch (tokenErr) {
      const status = tokenErr.statusCode || 400;
      return err(tokenErr.message || 'eBay account is not connected. Please connect eBay in Settings.', status);
    }

    // 4. Resolve Listing Price (must be > 0)
    const rawPrice = body.price != null ? body.price : (item.current_list_price || item.suggested_list_price || item.min_sell_price || item.unit_price);
    const listingPrice = Number(rawPrice);
    if (!listingPrice || isNaN(listingPrice) || listingPrice <= 0) {
      return err('A valid listing price greater than $0.00 is required to list on eBay.', 400);
    }

    // 5. Parse item attributes if JSON
    let attrs = {};
    if (typeof item.attributes === 'string') {
      try {
        attrs = JSON.parse(item.attributes);
      } catch (_) {}
    } else if (item.attributes && typeof item.attributes === 'object') {
      attrs = item.attributes;
    }

    // 6. Resolve HTML Description & Title
    let descriptionHtml = String(body.description_html || '').trim();
    const useAi = body.use_ai !== false;

    // If description not provided, generate via Gemini AI + HTML template
    if (!descriptionHtml) {
      let aiMiddleSection = '';
      const effectiveCondition = item.item_condition || item.condition || attrs.condition || '';
      if (useAi) {
        try {
          const aiRes = await generateAiListingDetails(env, {
            title: body.title || item.item_name,
            brand: item.brand || attrs.brand || '',
            productType: item.category || attrs.product_type || '',
            itemSubtype: item.item_subtype || '',
            color: attrs.color || attrs.colorway || '',
            condition: effectiveCondition,
            conditionHeader: effectiveCondition.toLowerCase().includes('new') ? 'BRAND NEW IN ORIGINAL UNOPENED BOX' : '',
            conditionSubheader: item.condition_notes || attrs.condition_subheader || '',
            authType: item.auth_type || '',
            framingStatus: item.framing_status || '',
            frameDimensions: attrs.frame_dimensions || '',
            inkColor: attrs.ink_color || '',
            dimensions: attrs.dimensions || '',
            notes: item.condition_notes || item.notes || '',
            specs: attrs.specs || '',
            features: attrs.features || ''
          });
          if (aiRes?.html) {
            aiMiddleSection = aiRes.html;
          }
        } catch (aiErr) {
          console.warn('[create-listing] Gemini AI generation warning (falling back to static template):', aiErr.message || aiErr);
        }
      }

      descriptionHtml = generateEbayListingHtml({
        ...item,
        ...attrs,
        title: body.title || item.item_name,
        aiGeneratedMiddleSection: aiMiddleSection
      });
    }

    // 7. Resolve Optimized eBay Title (<= 80 chars)
    let listingTitle = String(body.title || '').trim();
    if (!listingTitle) {
      const generatedCopy = generateEbayCopy(item, {
        ...attrs,
        brand: item.brand,
        category: item.category,
        title: item.item_name
      });
      listingTitle = generatedCopy?.title || item.item_name || 'Authentic Item';
    }

    if (listingTitle.length > 80) {
      const truncated = listingTitle.substring(0, 80);
      const lastSpace = truncated.lastIndexOf(' ');
      listingTitle = (lastSpace > 40 ? truncated.substring(0, lastSpace) : truncated).trim();
    }

    // 8. Shipping details
    const isFreeShipping = body.free_shipping !== undefined
      ? Boolean(body.free_shipping)
      : (item.buyer_shipping_cost === 0 || item.est_shipping_cost === 0);

    const buyerShippingCost = body.shipping_cost !== undefined
      ? Number(body.shipping_cost)
      : (item.buyer_shipping_cost != null ? item.buyer_shipping_cost : 0);

    // 9. Revise existing active listing when ebay_listing_id is present (fallback to AddFixedPriceItem if ended)
    const listingPayload = {
      title: listingTitle,
      descriptionHtml,
      price: listingPrice,
      sku: item.sku,
      condition: item.item_condition || item.condition || attrs.condition,
      category: item.category,
      categoryId: body.category_id || item.category_id || attrs.category_id,
      imageUrl: item.image_url || attrs.ebay_image_url || attrs.image_url,
      pictureUrls: attrs.image_urls || attrs.picture_urls,
      brand: (attrs.is_custom_jersey || attrs.is_pickguard_guitar) ? 'Unbranded' : (item.brand || attrs.brand),
      productType: item.item_subtype || item.category || attrs.product_type,
      sport: item.sport_genre || attrs.sport,
      athlete: item.athlete_person || attrs.athlete,
      team: attrs.team_or_band || '',
      size: attrs.is_wearable ? (attrs.size || '') : '',
      authenticator: item.authenticator || attrs.authenticator,
      authType: item.auth_type || '',
      certNumber: item.cert_number || attrs.cert_number,
      framingStatus: item.framing_status || '',
      color: attrs.color || attrs.colorway || attrs.instrument_finish || '',
      inkColor: attrs.ink_color || '',
      cardYear: attrs.card_year || '',
      cardNumber: attrs.card_number || '',
      cardGrade: attrs.card_grade || '',
      isFreeShipping,
      buyerShippingCost,
      specs: attrs.specs
    };

    const existingEbayId = item.ebay_listing_id ? String(item.ebay_listing_id).trim() : '';
    const forceNew = body.force_new === true;

    let listingResult = null;
    try {
      if (existingEbayId && !forceNew) {
        try {
          listingResult = await reviseEbayListing(env, accessToken, existingEbayId, listingPayload);
        } catch (revErr) {
          const code = String(revErr?.ebayErrorCode || '');
          const msg = String(revErr?.message || '');
          const isEndedOrMissing =
            ['291', '17', '21916734', '21919028'].includes(code) ||
            /has ended|listing has ended|cannot be revised|does not exist|invalid item id|cannot find|closed/i.test(msg);
          if (!isEndedOrMissing) {
            throw revErr;
          }
          console.warn(`[create-listing] Existing listing #${existingEbayId} ended/unavailable; publishing fresh listing:`, msg);
          listingResult = await createEbayListing(env, accessToken, listingPayload);
          listingResult.action = 'republished';
        }
      } else {
        listingResult = await createEbayListing(env, accessToken, listingPayload);
      }
    } catch (ebayErr) {
      console.error('[create-listing] eBay API creation/revision failed:', ebayErr);
      return err(ebayErr.message || 'Failed to publish listing on eBay.', 502);
    }

    const newEbayId = listingResult.listing_id;
    const ebayUrl = listingResult.ebay_url;

    // 10. Atomically update D1: auction_items, ebay_active_listings, auction_item_platform_listings
    try {
      await env.DB.batch([
        // Update auction_items
        env.DB.prepare(`
          UPDATE auction_items SET
            ebay_listing_id = ?,
            status = 'Listed',
            platform = 'eBay',
            current_list_price = ?,
            date_listed = COALESCE(date_listed, date('now')),
            updated_at = datetime('now')
          WHERE id = ? AND user_id = ?
        `).bind(newEbayId, listingPrice, itemId, userId),

        // Upsert into ebay_active_listings cache
        env.DB.prepare(`
          INSERT INTO ebay_active_listings (
            ebay_listing_id, user_id, sku, title, price, quantity,
            quantity_sold, buyer_shipping_cost, is_free_shipping,
            condition, status, image_url, listing_url, synced_at
          ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, 'Active', ?, ?, datetime('now'))
          ON CONFLICT(ebay_listing_id) DO UPDATE SET
            title = excluded.title,
            price = excluded.price,
            status = excluded.status,
            synced_at = datetime('now')
        `).bind(
          newEbayId,
          userId,
          item.sku || null,
          listingTitle,
          listingPrice,
          buyerShippingCost,
          isFreeShipping ? 1 : 0,
          item.condition || 'Active',
          item.image_url || null,
          ebayUrl
        ),

        // Upsert into auction_item_platform_listings
        env.DB.prepare(`
          INSERT INTO auction_item_platform_listings (
            item_id, user_id, platform_name, external_listing_id,
            listing_url, status, synced_at
          ) VALUES (?, ?, 'eBay', ?, ?, 'Listed', datetime('now'))
          ON CONFLICT(item_id, platform_name) DO UPDATE SET
            external_listing_id = excluded.external_listing_id,
            listing_url = excluded.listing_url,
            status = excluded.status,
            synced_at = datetime('now')
        `).bind(
          itemId,
          userId,
          newEbayId,
          ebayUrl
        )
      ]);
    } catch (dbErr) {
      console.error('[create-listing] D1 persistence error after eBay listing created:', dbErr);
      // Even if secondary DB cache fails, the listing is live on eBay
      return ok({
        success: true,
        listing_id: newEbayId,
        ebay_url: ebayUrl,
        warning: 'Listing was created on eBay, but local database sync encountered an error. Run Sync to refresh.'
      });
    }

    const updatedItem = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(itemId, userId).first();

    return ok({
      success: true,
      action: listingResult.action || 'created',
      listing_id: newEbayId,
      ebay_url: ebayUrl,
      price: listingResult.price || listingPrice.toFixed(2),
      title: listingResult.title || listingTitle,
      item: updatedItem
    });
  });
}
