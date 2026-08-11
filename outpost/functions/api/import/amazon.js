import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computePricingFloors, computeItemProration } from '../../utils/auction.js';

/**
 * POST /api/import/amazon
 *
 * Called by the VineScout chrome extension or any trusted client.
 * Auth: Bearer token stored in auction_users.amazon_api_token
 *
 * Body:
 * {
 *   asin:        string   (required)
 *   title:       string   (required - product name)
 *   category?:   string
 *   vine_value?: number   (ETV / fair market value from Vine)
 *   tax_value?:  number   (tax Vine charged)
 *   image_url?:  string
 *   page_url?:   string
 *   notes?:      string
 * }
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return err('Database binding unavailable', 500);

  // --- Auth via Bearer API token ---
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return err('Unauthorized: missing Bearer token', 401);
  }

  const userRow = await env.DB.prepare(
    `SELECT id AS userId, email FROM users WHERE amazon_api_token = ? LIMIT 1`
  ).bind(token).first();

  if (!userRow) {
    return err('Unauthorized: invalid API token', 401);
  }

  const { userId } = userRow;

  // --- Parse body ---
  const body = await request.json().catch(() => ({}));
  const {
    asin, title, category = 'Other',
    vine_value, tax_value, image_url, page_url, notes
  } = body;

  if (!asin || !asin.trim()) return err('asin is required');
  if (!title || !title.trim()) return err('title is required');

  const unitPrice = Number(vine_value) || 0;
  const taxAmt    = Number(tax_value)  || 0;
  const today     = new Date().toISOString().split('T')[0];
  const invoiceRef = `AMAZON-${asin.toUpperCase().trim()}-${today}`;

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
    `VineScout import - ASIN ${asin.toUpperCase()}`,
    unitPrice, taxAmt, today
  ).run();

  // Compute proration + pricing
  const proration = computeItemProration(
    { unit_price: unitPrice },
    { base_total: unitPrice, discount: 0, shipping: 0, tax: taxAmt }
  );
  const pricing = computePricingFloors({
    true_total_cost: proration.true_total_cost,
    est_shipping_cost: 0,
    platform_flat_fee: plat.flat_fee || 0,
    platform_fee_pct:  plat.fee_pct  || 0,
    boost_pct: 0,
    target_margin_pct: 0.20
  });

  // Create item
  const itemId = `item-${crypto.randomUUID()}`;
  const itemNotes = [
    `ASIN: ${asin.toUpperCase()}`,
    page_url ? `URL: ${page_url}` : null,
    image_url ? `Image: ${image_url}` : null,
    notes || 'Imported via VineScout'
  ].filter(Boolean).join(' | ');

  await env.DB.prepare(`
    INSERT INTO auction_items (
      id, user_id, invoice_id, item_name, category, athlete_person,
      authenticator, cert_number, unit_price, item_base_total,
      proration_weight, prorated_discount, prorated_shipping, prorated_tax, true_total_cost,
      status, platform, platform_fee_pct, platform_flat_fee,
      est_shipping_cost, boost_pct, min_sell_price, suggested_list_price,
      current_list_price, target_margin_pct, date_acquired, notes
    ) VALUES (
      ?,?,?,?,?,?,
      ?,?,?,?,
      ?,?,?,?,?,
      ?,?,?,?,
      ?,?,?,?,
      ?,?,?,?
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
    null, 0.20, today, itemNotes
  ).run();

  return ok({ success: true, item_id: itemId, invoice_ref: invoiceRef }, 201);
}
