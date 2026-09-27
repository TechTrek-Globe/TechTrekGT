import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computeItemProration, computePricingFloors } from '../../utils/auction.js';
import { generateSku } from '../utils/sku.js';

// ============================================================
// GET /api/invoices  - list all invoices for authenticated user
// POST /api/invoices - create invoice + line items
// ============================================================

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const rows = await env.DB.prepare(`
      SELECT
        i.id, i.invoice_ref, i.description, i.base_total,
        i.discount, i.shipping, i.tax, i.date_acquired, i.created_at,
        COUNT(it.id) AS item_count,
        SUM(it.true_total_cost) AS total_landed_cost
      FROM auction_invoices i
      LEFT JOIN auction_items it ON it.invoice_id = i.id
      WHERE i.user_id = ?
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `).bind(payload.userId).all();

    return ok({ invoices: rows.results || [] });
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json();
    const { invoice_ref, description, discount, shipping, tax, date_acquired, items } = body;

    if (!invoice_ref) return err('invoice_ref is required');
    if (!Array.isArray(items) || items.length === 0) return err('At least one item is required');

    // Validate each item has a name and unit_price
    for (const it of items) {
      if (!it.item_name || !it.item_name.trim()) return err('Each item must have a name');
      if (typeof it.unit_price !== 'number' || it.unit_price <= 0) return err(`Item "${it.item_name}" must have a positive unit_price`);
    }

    // Compute invoice base_total from item unit prices
    const base_total = items.reduce((sum, it) => sum + (it.unit_price || 0), 0);
    const invDiscount = discount || 0;
    const invShipping = shipping || 0;
    const invTax      = tax || 0;

    const invoiceId = `inv-${crypto.randomUUID()}`;
    const invoicePayload = {
      base_total,
      discount: invDiscount,
      shipping: invShipping,
      tax: invTax
    };

    // Insert invoice
    await env.DB.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, description, base_total, discount, shipping, tax, date_acquired)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      invoiceId, payload.userId, invoice_ref.trim(),
      description || null, base_total,
      invDiscount, invShipping, invTax,
      date_acquired || null
    ).run();

    // Collect distinct platforms needing fee lookup
    const platformMap = new Map();
    const neededPlatforms = [...new Set(
      items
        .filter(it => it.platform && !it.platform_fee_pct)
        .map(it => it.platform.trim())
        .filter(Boolean)
    )];

    if (neededPlatforms.length > 0) {
      const placeholders = neededPlatforms.map(() => '?').join(', ');
      const platRows = await env.DB.prepare(
        `SELECT name, fee_pct, flat_fee FROM auction_platforms WHERE user_id = ? AND name IN (${placeholders})`
      ).bind(payload.userId, ...neededPlatforms).all();

      for (const plat of (platRows.results || [])) {
        platformMap.set(plat.name, plat);
      }
    }

    // Insert each item with proration computed
    const insertedItems = [];
    const insertStatements = [];

    for (const it of items) {
      const itemId = `item-${crypto.randomUUID()}`;
      const proration = computeItemProration({ unit_price: it.unit_price }, invoicePayload);

      // Fetch platform fee defaults if platform name provided
      let feePct = it.platform_fee_pct || 0;
      let flatFee = it.platform_flat_fee || 0;
      if (it.platform && (!it.platform_fee_pct)) {
        const plat = platformMap.get(it.platform.trim()) || platformMap.get(it.platform);
        if (plat) { feePct = plat.fee_pct; flatFee = plat.flat_fee; }
      }

      const boostPct        = it.boost_pct || 0;
      const estShipping     = it.est_shipping_cost || 0;
      const targetMarginPct = it.target_margin_pct || 0;

      const pricing = computePricingFloors({
        true_total_cost:  proration.true_total_cost,
        est_shipping_cost: estShipping,
        platform_flat_fee: flatFee,
        platform_fee_pct:  feePct,
        boost_pct:         boostPct,
        target_margin_pct: targetMarginPct
      });

      const itemSku = (it.sku && String(it.sku).trim()) ? String(it.sku).trim() : generateSku(date_acquired || new Date());

      insertStatements.push(
        env.DB.prepare(`
          INSERT INTO auction_items (
            id, user_id, invoice_id, item_name, category, sport_genre, athlete_person,
            authenticator, cert_number, unit_price, item_base_total,
            proration_weight, prorated_discount, prorated_shipping, prorated_tax, true_total_cost,
            status, platform, platform_fee_pct, platform_flat_fee,
            est_shipping_cost, boost_pct, min_sell_price, suggested_list_price,
            current_list_price, target_margin_pct,
            date_acquired, date_listed, notes, best_listing_window, sku
          ) VALUES (
            ?,?,?,?,?,?,?,
            ?,?,?,?,
            ?,?,?,?,?,
            ?,?,?,?,
            ?,?,?,?,
            ?,?,
            ?,?,?,?,?
          )
        `).bind(
          itemId, payload.userId, invoiceId,
          it.item_name.trim(),
          it.category || null, it.sport_genre || null, it.athlete_person || null,
          it.authenticator || null, it.cert_number || null,
          it.unit_price, it.unit_price,
          proration.proration_weight, proration.prorated_discount,
          proration.prorated_shipping, proration.prorated_tax, proration.true_total_cost,
          it.status || 'Available',
          it.platform || null, feePct, flatFee,
          estShipping, boostPct, pricing.min_sell_price, pricing.suggested_list_price,
          it.current_list_price || null, targetMarginPct,
          date_acquired || null, it.date_listed || null,
          it.notes || null, it.best_listing_window || null,
          itemSku
        )
      );

      insertedItems.push({
        id: itemId,
        item_name: it.item_name.trim(),
        sku: itemSku,
        unit_price: it.unit_price,
        ...proration,
        min_sell_price: pricing.min_sell_price,
        suggested_list_price: pricing.suggested_list_price,
        status: it.status || 'Available'
      });
    }

    if (insertStatements.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < insertStatements.length; i += CHUNK_SIZE) {
        await env.DB.batch(insertStatements.slice(i, i + CHUNK_SIZE));
      }
    }

    return ok({
      success: true,
      invoice: { id: invoiceId, invoice_ref, base_total, discount: invDiscount, shipping: invShipping, tax: invTax },
      items: insertedItems
    }, 201);
  });
}
