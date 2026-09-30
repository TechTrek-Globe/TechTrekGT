import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computePricingFloors, computeItemProration, validateNonNegativeMoney } from '../../utils/auction.js';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  DEFAULT_TARGET_MARGIN_PCT
} from '../../utils/constants.js';

/**
 * POST /api/import/amazon-url
 *
 * URL-based Amazon product ingestion. Authenticated via standard SSO JWT cookie.
 * Designed for use from the Outpost UI (not VineScout extension).
 *
 * Body:
 * {
 *   url:        string  (required) - any Amazon product URL containing /dp/ASIN or /gp/product/ASIN
 *   vine_value: number  (required) - ETV / fair market value (cannot be inferred from scraper)
 *   tax_value?: number  - tax charged by Vine
 *   category?:  string  - override category returned by gateway
 *   notes?:     string  - optional free text
 * }
 *
 * Flow:
 *   1. Validate + extract ASIN from URL
 *   2. Call Landing Gateway POST /api/amazon/fetch to hydrate title, images, specs
 *   3. Create auction_invoice + auction_item with attributes JSON blob
 *   4. Return item_id and invoice_ref
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const { url, vine_value, tax_value, category: categoryOverride, notes } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return err('url is required', 400);
    }
    if (vine_value === undefined || vine_value === null || isNaN(Number(vine_value))) {
      return err('vine_value (ETV) is required', 400);
    }

    // --- Extract ASIN ---
    // Handles: /dp/ASIN, /gp/product/ASIN, /d/ASIN, query param ?asin=ASIN
    const asinMatch = url.match(/\/(?:dp|gp\/product|d)\/([A-Z0-9]{10})/i)
      || url.match(/[?&]asin=([A-Z0-9]{10})/i);

    if (!asinMatch) {
      return err('Could not extract a valid ASIN from the provided URL. Ensure the URL contains /dp/XXXXXXXXXX.', 400);
    }

    const cleanAsin  = asinMatch[1].toUpperCase();
    let unitPrice = 0;
    let taxAmt = 0;
    try {
      unitPrice = validateNonNegativeMoney(vine_value, 'vine_value') ?? 0;
      taxAmt    = validateNonNegativeMoney(tax_value, 'tax_value') ?? 0;
    } catch (e) {
      return err(e.message, 400);
    }
    // MED-10: $0 vine_value (ETV) and $0 tax_value are legitimate defaults for zero-ETV items.
    // Upstream validation guarantees non-negative bounds.
    const today      = new Date().toISOString().split('T')[0];
    const invoiceRef = `AMAZON-${cleanAsin}-${today}`;

    // --- Call Landing Gateway to hydrate product details ---
    let gatewayTitle    = cleanAsin; // fallback if gateway fails
    let gatewayCategory = categoryOverride || 'Other';
    let gatewayImages   = [];
    let gatewaySpecs    = {};

    try {
      const reqUrl       = new URL(request.url);
      const gatewayBase  = reqUrl.hostname === 'localhost' || reqUrl.hostname === '127.0.0.1'
        ? `${reqUrl.protocol}//${reqUrl.hostname}:8787`
        : 'https://techtrekgt.com';

      const gatewayRes = await fetch(`${gatewayBase}/api/amazon/fetch`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie':        request.headers.get('Cookie') || ''
        },
        body: JSON.stringify({ asin: cleanAsin })
      });

      if (gatewayRes.ok) {
        const gwData = await gatewayRes.json().catch(() => ({}));
        if (gwData.title)    gatewayTitle    = gwData.title;
        if (gwData.category) gatewayCategory = categoryOverride || gwData.category || 'Other';
        if (Array.isArray(gwData.images) && gwData.images.length > 0) {
          gatewayImages = gwData.images;
        } else if (gwData.image_url) {
          gatewayImages = [gwData.image_url];
        }
        if (gwData.specs && typeof gwData.specs === 'object') {
          gatewaySpecs = gwData.specs;
        }
      } else {
        console.warn(`[amazon-url] Gateway returned ${gatewayRes.status} for ASIN ${cleanAsin}. Continuing with minimal data.`);
      }
    } catch (e) {
      console.warn(`[amazon-url] Gateway call failed: ${e.message}. Continuing with minimal data.`);
    }

    // --- Build attributes JSON blob ---
    const attributes = JSON.stringify({
      source:         'amazon_url',
      asin:           cleanAsin,
      amazon_url:     `https://www.amazon.com/dp/${cleanAsin}`,
      image_urls:     gatewayImages,
      specs:          gatewaySpecs,
      etv:            unitPrice,
      tax_charged:    taxAmt,
      order_id:       null,
      vine_program:   false,
      condition:      'New',
      condition_note: ''
    });

    // --- Fetch user default platform ---
    const plat = await env.DB.prepare(
      `SELECT fee_pct, flat_fee, name FROM auction_platforms WHERE user_id = ? AND is_default = 1 LIMIT 1`
    ).bind(userId).first() || { name: 'eBay', fee_pct: DEFAULT_PLATFORM_FEE_PCT, flat_fee: DEFAULT_PLATFORM_FLAT_FEE };

    // --- Create invoice ---
    const invoiceId = `inv-${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO auction_invoices
        (id, user_id, invoice_ref, description, base_total, discount, shipping, tax, date_acquired)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).bind(
      invoiceId, userId, invoiceRef,
      `Amazon URL import - ASIN ${cleanAsin}`,
      unitPrice, taxAmt, today
    ).run();

    // --- Compute proration + pricing ---
    const proration = computeItemProration(
      { unit_price: unitPrice },
      { base_total: unitPrice, discount: 0, shipping: 0, tax: taxAmt }
    );
    const pricing = computePricingFloors({
      true_total_cost:   proration.true_total_cost,
      est_shipping_cost: 0,
      platform_flat_fee: plat.flat_fee || 0,
      platform_fee_pct:  plat.fee_pct  || 0,
      boost_pct:         0,
      target_margin_pct: DEFAULT_TARGET_MARGIN_PCT
    });

    // --- Build legacy notes string (backward compat with comps parser) ---
    const itemNotes = [
      `ASIN: ${cleanAsin}`,
      `URL: https://www.amazon.com/dp/${cleanAsin}`,
      gatewayImages.length > 0 ? `Image: ${gatewayImages[0]}` : null,
      notes || 'Imported via Amazon URL'
    ].filter(Boolean).join(' | ');

    // --- Create item ---
    const itemId = `item-${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, category, athlete_person,
        authenticator, cert_number, unit_price, item_base_total,
        proration_weight, prorated_discount, prorated_shipping, prorated_tax, true_total_cost,
        status, platform, platform_fee_pct, platform_flat_fee,
        est_shipping_cost, boost_pct, min_sell_price, suggested_list_price,
        current_list_price, target_margin_pct, date_acquired, notes, attributes
      ) VALUES (
        ?,?,?,?,?,?,
        ?,?,?,?,
        ?,?,?,?,?,
        ?,?,?,?,
        ?,?,?,?,
        ?,?,?,?,?
      )
    `).bind(
      itemId, userId, invoiceId,
      gatewayTitle.trim(), gatewayCategory, null,
      null, null, unitPrice, unitPrice,
      proration.proration_weight, proration.prorated_discount,
      proration.prorated_shipping, proration.prorated_tax,
      proration.true_total_cost,
      'Available', plat.name, plat.fee_pct, plat.flat_fee,
      0, 0,
      pricing.min_sell_price, pricing.suggested_list_price,
      null, DEFAULT_TARGET_MARGIN_PCT, today, itemNotes, attributes
    ).run();

    return ok({
      success:     true,
      item_id:     itemId,
      invoice_ref: invoiceRef,
      asin:        cleanAsin,
      title:       gatewayTitle,
      category:    gatewayCategory,
      etv:         unitPrice
    }, 201);
  });
}
