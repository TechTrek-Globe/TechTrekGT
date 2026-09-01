import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computePricingFloors, computeItemProration } from '../../utils/auction.js';
import { generateSku } from '../utils/sku.js';

/**
 * POST /api/import/amazon
 *
 * Called by the VineScout chrome extension or any trusted client.
 * Auth: Bearer token stored in users.amazon_api_token
 *
 * Body:
 * {
 *   asin:         string   (required)
 *   title:        string   (required - product name)
 *   category?:    string
 *   vine_value?:  number   (ETV / fair market value from Vine)
 *   tax_value?:   number   (tax Vine charged)
 *   order_id?:    string   (Amazon order ID e.g. 123-4567890-1234567)
 *   image_urls?:  string[] (array of image URLs - preferred over legacy image_url)
 *   image_url?:   string   (legacy single image URL - still accepted)
 *   page_url?:    string   (Amazon product page URL)
 *   specs?:       object   (product specs: brand, model, dimensions, weight, etc.)
 *   condition?:   string   (item condition label e.g. 'New')
 *   notes?:       string   (optional free text note)
 * }
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return err('Database binding unavailable', 500);

  // --- Auth via Webhook Secret or Bearer API token ---
  const vineScoutAuth = request.headers.get('X-VineScout-Auth');
  const expectedSecret = env.OUTPOST_SECRET_KEY;

  let userId;

  if (vineScoutAuth && expectedSecret && vineScoutAuth === expectedSecret) {
    userId = 1;
  } else {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      return err('Unauthorized: missing Bearer token or valid X-VineScout-Auth', 401);
    }

    const userRow = await env.DB.prepare(
      `SELECT id AS userId, email FROM users WHERE amazon_api_token = ? LIMIT 1`
    ).bind(token).first();

    if (!userRow) {
      return err('Unauthorized: invalid API token', 401);
    }

    userId = userRow.userId;
  }

  // --- Parse body ---
  const body = await request.json().catch(() => ({}));
  const {
    asin, title, category = 'Other',
    vine_value, tax_value,
    order_id,
    image_urls, image_url,
    page_url,
    specs,
    condition = 'New',
    notes
  } = body;

  if (!asin || !asin.trim()) return err('asin is required');
  if (!title || !title.trim()) return err('title is required');

  const cleanAsin   = asin.toUpperCase().trim();
  const unitPrice   = Number(vine_value) || 0;
  const taxAmt      = Number(tax_value)  || 0;
  const today       = new Date().toISOString().split('T')[0];
  const invoiceRef  = `AMAZON-${cleanAsin}-${today}`;

  // Resolve image URL array - prefer image_urls array, fall back to legacy image_url string
  const resolvedImageUrls = Array.isArray(image_urls) && image_urls.length > 0
    ? image_urls
    : (image_url ? [image_url] : []);

  // Build structured attributes JSON blob
  const attributes = JSON.stringify({
    source:        'amazon_vinescout',
    asin:          cleanAsin,
    amazon_url:    page_url || `https://www.amazon.com/dp/${cleanAsin}`,
    image_urls:    resolvedImageUrls,
    specs:         (specs && typeof specs === 'object') ? specs : {},
    etv:           unitPrice,
    tax_charged:   taxAmt,
    order_id:      order_id || null,
    vine_program:  true,
    condition:     condition || 'New',
    condition_note: ''
  });

  // Fetch user default platform
  const plat = await env.DB.prepare(
    `SELECT fee_pct, flat_fee, name FROM auction_platforms WHERE user_id = ? AND is_default = 1 LIMIT 1`
  ).bind(userId).first() || { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40 };

  // Create invoice
  const invoiceId = `inv-${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO auction_invoices
      (id, user_id, invoice_ref, description, base_total, discount, shipping, tax, date_acquired)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).bind(
    invoiceId, userId, invoiceRef,
    `VineScout import - ASIN ${cleanAsin}`,
    unitPrice, taxAmt, today
  ).run();

  // Compute proration + pricing
  const proration = computeItemProration(
    { unit_price: unitPrice },
    { base_total: unitPrice, discount: 0, shipping: 0, tax: taxAmt }
  );
  const pricing = computePricingFloors({
    true_total_cost:    proration.true_total_cost,
    est_shipping_cost:  0,
    platform_flat_fee:  plat.flat_fee || 0,
    platform_fee_pct:   plat.fee_pct  || 0,
    boost_pct:          0,
    target_margin_pct:  0.20
  });

  // Build legacy notes string (kept for backward compat with existing comps parser)
  const itemNotes = [
    order_id    ? `Order ID: ${order_id}` : null,
    `ASIN: ${cleanAsin}`,
    page_url    ? `URL: ${page_url}` : null,
    resolvedImageUrls.length > 0 ? `Image: ${resolvedImageUrls[0]}` : null,
    notes || 'Imported via VineScout'
  ].filter(Boolean).join(' | ');

  // Create item - includes new attributes column and auto-generated SKU
  const itemId = `item-${crypto.randomUUID()}`;
  const itemSku = generateSku(new Date());

  await env.DB.prepare(`
    INSERT INTO auction_items (
      id, user_id, invoice_id, item_name, category, athlete_person,
      authenticator, cert_number, unit_price, item_base_total,
      proration_weight, prorated_discount, prorated_shipping, prorated_tax, true_total_cost,
      status, platform, platform_fee_pct, platform_flat_fee,
      est_shipping_cost, boost_pct, min_sell_price, suggested_list_price,
      current_list_price, target_margin_pct, date_acquired, notes, attributes, sku
    ) VALUES (
      ?,?,?,?,?,?,
      ?,?,?,?,
      ?,?,?,?,?,
      ?,?,?,?,
      ?,?,?,?,
      ?,?,?,?,?,?
    )
  `).bind(
    itemId, userId, invoiceId,
    title.trim(), category, null,
    null, null, unitPrice, unitPrice,
    proration.proration_weight, proration.prorated_discount,
    proration.prorated_shipping, proration.prorated_tax,
    proration.true_total_cost,
    'Available', plat.name, plat.fee_pct, plat.flat_fee,
    0, 0,
    pricing.min_sell_price, pricing.suggested_list_price,
    null, 0.20, today, itemNotes, attributes, itemSku
  ).run();

  return ok({ success: true, item_id: itemId, sku: itemSku, invoice_ref: invoiceRef }, 201);
}
