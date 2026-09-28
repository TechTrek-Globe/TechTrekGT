import { requireAuth, withAuth, ok, err, isValidPrefixedId } from '../../utils/guard.js';
import { computePricingFloors, computeSaleMetrics, daysBetween, validateNonNegativeMoney, round2, markItemSold } from '../../utils/auction.js';

// ============================================================
// GET    /api/items/:id  - get single item
// PUT    /api/items/:id  - update item fields
// DELETE /api/items/:id  - delete item (guard: no sales)
// ============================================================

function getItemId(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const candidate = parts[parts.length - 1] || null;
  return isValidPrefixedId(candidate, 'item') ? candidate : null;
}

export const CLIENT_SETTABLE_ATTR_KEYS = Object.freeze([
  'asin',
  'order_id',
  'etv',
  'tax_cost',
  'cert_verified',
  'is_vinescout',
  'cert_verified_at'
]);

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getItemId(new URL(request.url));
    if (!id) return err('Item ID required', 400);

    const item = await env.DB.prepare(`
      SELECT
        i.*,
        inv.invoice_ref,
        inv.discount AS inv_discount,
        inv.shipping AS inv_shipping,
        inv.tax      AS inv_tax,
        c.comp_1,
        c.comp_2,
        c.comp_3,
        c.manual_avg,
        c.live_avg,
        c.active_comp_1,
        c.active_comp_2,
        c.active_comp_3,
        c.active_avg,
        c.sold_count,
        c.ebay_search_url AS comp_ebay_search_url,
        c.recommended_list_price,
        c.updated_at      AS comp_updated_at
      FROM auction_items i
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      LEFT JOIN auction_comps c ON i.id = c.item_id AND c.user_id = i.user_id
      WHERE i.id = ? AND i.user_id = ?
    `).bind(id, payload.userId).first();

    if (!item) return err('Item not found', 404);
    return ok({ item });
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getItemId(new URL(request.url));
    if (!id) return err('Item ID required', 400);

    const item = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();
    if (!item) return err('Item not found', 404);

    const body = await request.json();

    try {
      if (body.unit_price !== undefined) {
        validateNonNegativeMoney(body.unit_price, 'unit_price');
      }
      if (body.est_shipping_cost !== undefined) {
        validateNonNegativeMoney(body.est_shipping_cost, 'est_shipping_cost');
      }
      if (body.platform_fee_pct !== undefined) {
        validateNonNegativeMoney(body.platform_fee_pct, 'platform_fee_pct');
      }
      if (body.platform_flat_fee !== undefined) {
        validateNonNegativeMoney(body.platform_flat_fee, 'platform_flat_fee');
      }
      if (body.boost_pct !== undefined) {
        validateNonNegativeMoney(body.boost_pct, 'boost_pct');
      }
      if (body.target_margin_pct !== undefined) {
        validateNonNegativeMoney(body.target_margin_pct, 'target_margin_pct');
      }
      if (body.current_list_price !== undefined) {
        validateNonNegativeMoney(body.current_list_price, 'current_list_price');
      }
      if (body.actual_sell_price !== undefined) {
        validateNonNegativeMoney(body.actual_sell_price, 'actual_sell_price');
      }
      if (body.ebay_promoted_rate !== undefined) {
        validateNonNegativeMoney(body.ebay_promoted_rate, 'ebay_promoted_rate');
      }
      if (body.floor_price !== undefined) {
        validateNonNegativeMoney(body.floor_price, 'floor_price');
      }
      if (body.buy_it_now_price !== undefined) {
        validateNonNegativeMoney(body.buy_it_now_price, 'buy_it_now_price');
      }
      if (body.buyer_shipping_cost !== undefined) {
        validateNonNegativeMoney(body.buyer_shipping_cost, 'buyer_shipping_cost');
      }
      if (body.etv !== undefined) {
        validateNonNegativeMoney(body.etv, 'etv');
      }
      if (body.tax_cost !== undefined) {
        validateNonNegativeMoney(body.tax_cost, 'tax_cost');
      }
    } catch (e) {
      return err(e.message, 400);
    }

    const round2Nullable = (val) => (val != null && val !== '' && !isNaN(Number(val))) ? round2(val) : null;

    // Merge only provided fields
    const updated = {
      item_name:          body.item_name         ?? item.item_name,
      category:           body.category          ?? item.category,
      sport_genre:        body.sport_genre        ?? item.sport_genre,
      athlete_person:     body.athlete_person     ?? item.athlete_person,
      authenticator:      body.authenticator      ?? item.authenticator,
      cert_number:        body.cert_number        ?? item.cert_number,
      unit_price:         body.unit_price != null ? round2Nullable(body.unit_price) : round2Nullable(item.unit_price),
      true_total_cost:    body.true_total_cost != null ? round2Nullable(body.true_total_cost) : (body.unit_price != null ? round2Nullable(parseFloat(body.unit_price) - (item.prorated_discount || 0) + (item.prorated_shipping || 0) + (item.prorated_tax || 0)) : round2Nullable(item.true_total_cost)),
      status:             body.status             ?? item.status,
      platform:           body.platform           ?? item.platform,
      platform_fee_pct:   body.platform_fee_pct   ?? item.platform_fee_pct,
      platform_flat_fee:  body.platform_flat_fee  ?? item.platform_flat_fee,
      est_shipping_cost:  body.est_shipping_cost != null ? round2Nullable(body.est_shipping_cost) : round2Nullable(item.est_shipping_cost),
      boost_pct:          body.boost_pct          ?? item.boost_pct,
      target_margin_pct:  body.target_margin_pct  ?? item.target_margin_pct,
      current_list_price: body.current_list_price != null ? round2Nullable(body.current_list_price) : round2Nullable(item.current_list_price),
      actual_sell_price:  body.actual_sell_price  != null ? round2Nullable(body.actual_sell_price) : round2Nullable(item.actual_sell_price),
      date_acquired:      body.date_acquired      !== undefined ? body.date_acquired : item.date_acquired,
      date_listed:        body.date_listed        ?? item.date_listed,
      date_sold:          body.date_sold          ?? item.date_sold,
      notes:              body.notes              ?? item.notes,
      best_listing_window: body.best_listing_window ?? item.best_listing_window,
      // Phase 3: eBay cross-listing fields
      ebay_listing_id:            body.ebay_listing_id            !== undefined ? (body.ebay_listing_id || null) : item.ebay_listing_id,
      cert_verification_url:      body.cert_verification_url      !== undefined ? (body.cert_verification_url || null) : item.cert_verification_url,
      other_platform_listing_ids: body.other_platform_listing_ids !== undefined ? (body.other_platform_listing_ids || null) : item.other_platform_listing_ids,
      ebay_promoted_rate:         body.ebay_promoted_rate         != null ? parseFloat(body.ebay_promoted_rate) : item.ebay_promoted_rate,
      // Phase 4: Inventory & Pricing Rebuild fields
      sku:                        body.sku                        !== undefined ? (body.sku || null) : item.sku,
      listing_format:             body.listing_format             !== undefined ? (body.listing_format || null) : item.listing_format,
      listing_status:             body.listing_status             !== undefined ? (body.listing_status || null) : item.listing_status,
      quantity:                   body.quantity                   != null ? parseInt(body.quantity, 10) : (item.quantity ?? 1),
      purchase_date:              body.purchase_date              !== undefined ? (body.purchase_date || null) : item.purchase_date,
      floor_price:                body.floor_price                !== undefined ? (body.floor_price !== '' && body.floor_price != null ? round2(body.floor_price) : null) : round2(item.floor_price),
      buy_it_now_price:           body.buy_it_now_price           !== undefined ? (body.buy_it_now_price !== '' && body.buy_it_now_price != null ? round2(body.buy_it_now_price) : null) : round2(item.buy_it_now_price),
      buyer_shipping_cost:        body.buyer_shipping_cost        !== undefined ? (body.buyer_shipping_cost !== '' && body.buyer_shipping_cost != null ? round2(body.buyer_shipping_cost) : 0) : (round2(item.buyer_shipping_cost) ?? 0)
    };

    // If platform changed, auto-lookup fees from auction_platforms
    if (body.platform && body.platform !== item.platform && !body.platform_fee_pct) {
      const plat = await env.DB.prepare(
        'SELECT fee_pct, flat_fee FROM auction_platforms WHERE user_id = ? AND name = ?'
      ).bind(payload.userId, body.platform).first();
      if (plat) {
        updated.platform_fee_pct  = plat.fee_pct;
        updated.platform_flat_fee = plat.flat_fee;
      }
    }

    // Ensure boost_pct mirrors ebay_promoted_rate if set
    if (updated.ebay_promoted_rate != null && updated.ebay_promoted_rate > 0) {
      updated.boost_pct = updated.ebay_promoted_rate / 100;
    } else if (body.ebay_promoted_rate === 0 || body.ebay_promoted_rate === '0') {
      updated.boost_pct = 0;
    }

    // Recompute pricing floors whenever fee or shipping changes
    const pricing = computePricingFloors({
      true_total_cost:   updated.true_total_cost != null ? updated.true_total_cost : item.true_total_cost,
      est_shipping_cost: updated.est_shipping_cost,
      platform_flat_fee: updated.platform_flat_fee,
      platform_fee_pct:  updated.platform_fee_pct,
      boost_pct:         updated.boost_pct,
      target_margin_pct: updated.target_margin_pct
    });

    // Auto-populate date_listed if status changed to Listed and not already set
    if (updated.status === 'Listed' && !updated.date_listed) {
      updated.date_listed = new Date().toISOString().split('T')[0];
    }
    // Auto-populate date_sold if status changed to Sold and not already set
    if (updated.status === 'Sold' && !updated.date_sold) {
      updated.date_sold = new Date().toISOString().split('T')[0];
    }

    // Compute days on market if status changed to Sold (MED-11: clamped to >= 0 by daysBetween)
    let days_on_market = item.days_on_market;
    if (updated.status === 'Sold') {
      const from = updated.date_listed || item.date_listed || item.date_acquired;
      const to = updated.date_sold || new Date().toISOString().split('T')[0];
      days_on_market = daysBetween(from, to) ?? 0;
    }

    // Determine actual_sell_price if marking as Sold and no actual_sell_price provided
    if (updated.status === 'Sold' && (updated.actual_sell_price == null || updated.actual_sell_price === 0)) {
      updated.actual_sell_price = item.actual_sell_price || item.current_list_price || item.suggested_list_price || pricing.suggested_list_price || updated.true_total_cost || 0;
    }

    // Extract & merge attributes JSON for VineScout / Amazon Vine integration
    let existingAttrs = {};
    if (item.attributes) {
      try {
        existingAttrs = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : (item.attributes || {});
      } catch (_) {}
    }

    let nextAttrs = { ...existingAttrs };
    if (body.asin !== undefined) {
      nextAttrs.asin = body.asin ? String(body.asin).trim().toUpperCase() : null;
    }
    if (body.order_id !== undefined) {
      nextAttrs.order_id = body.order_id ? String(body.order_id).trim() : null;
    }
    if (body.is_vinescout !== undefined) {
      nextAttrs.is_vinescout = Boolean(body.is_vinescout);
      if (body.is_vinescout) {
        nextAttrs.source = 'amazon_vinescout';
      }
    }
    if (body.etv !== undefined) {
      nextAttrs.etv = body.etv !== '' && body.etv != null ? parseFloat(body.etv) : null;
    }
    if (body.tax_cost !== undefined) {
      nextAttrs.tax_cost = body.tax_cost !== '' && body.tax_cost != null ? parseFloat(body.tax_cost) : null;
    }
    if (body.cert_verified !== undefined) {
      nextAttrs.cert_verified = Boolean(body.cert_verified);
      if (body.cert_verified && !nextAttrs.cert_verified_at) {
        nextAttrs.cert_verified_at = new Date().toISOString();
      } else if (!body.cert_verified) {
        nextAttrs.cert_verified_at = null;
      }
    }
    if (body.attributes !== undefined) {
      if (!body.attributes || typeof body.attributes !== 'object' || Array.isArray(body.attributes)) {
        return err('Invalid attributes object', 400);
      }
      const disallowedKeys = Object.keys(body.attributes).filter(
        key => !CLIENT_SETTABLE_ATTR_KEYS.includes(key)
      );
      if (disallowedKeys.length > 0) {
        return err(`Disallowed attribute key(s): ${disallowedKeys.join(', ')}`, 400);
      }
      for (const [key, val] of Object.entries(body.attributes)) {
        if (key === 'asin') {
          nextAttrs.asin = val ? String(val).trim().toUpperCase() : null;
        } else if (key === 'order_id') {
          nextAttrs.order_id = val ? String(val).trim() : null;
        } else if (key === 'is_vinescout') {
          nextAttrs.is_vinescout = Boolean(val);
          if (nextAttrs.is_vinescout) {
            nextAttrs.source = 'amazon_vinescout';
          }
        } else if (key === 'etv') {
          nextAttrs.etv = validateNonNegativeMoney(val, 'etv');
        } else if (key === 'tax_cost') {
          nextAttrs.tax_cost = validateNonNegativeMoney(val, 'tax_cost');
        } else if (key === 'cert_verified') {
          nextAttrs.cert_verified = Boolean(val);
          if (nextAttrs.cert_verified && !nextAttrs.cert_verified_at) {
            nextAttrs.cert_verified_at = new Date().toISOString();
          } else if (!nextAttrs.cert_verified) {
            nextAttrs.cert_verified_at = null;
          }
        } else if (key === 'cert_verified_at') {
          nextAttrs.cert_verified_at = val ? String(val) : null;
        } else {
          nextAttrs[key] = val;
        }
      }
    }

    const attributesJson = JSON.stringify(nextAttrs);

    await env.DB.prepare(`
      UPDATE auction_items SET
        item_name = ?, category = ?, sport_genre = ?, athlete_person = ?,
        authenticator = ?, cert_number = ?,
        unit_price = ?, true_total_cost = ?,
        status = ?, platform = ?, platform_fee_pct = ?, platform_flat_fee = ?,
        est_shipping_cost = ?, boost_pct = ?, target_margin_pct = ?,
        min_sell_price = ?, suggested_list_price = ?,
        current_list_price = ?, actual_sell_price = ?,
        date_acquired = ?, date_listed = ?, date_sold = ?, days_on_market = ?,
        notes = ?, best_listing_window = ?,
        ebay_listing_id = ?, cert_verification_url = ?,
        other_platform_listing_ids = ?, ebay_promoted_rate = ?,
        sku = ?, listing_format = ?, listing_status = ?,
        quantity = ?, purchase_date = ?, floor_price = ?, buy_it_now_price = ?,
        buyer_shipping_cost = ?, attributes = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      updated.item_name, updated.category, updated.sport_genre, updated.athlete_person,
      updated.authenticator, updated.cert_number,
      updated.unit_price, updated.true_total_cost,
      updated.status, updated.platform, updated.platform_fee_pct, updated.platform_flat_fee,
      updated.est_shipping_cost, updated.boost_pct, updated.target_margin_pct,
      pricing.min_sell_price, pricing.suggested_list_price,
      updated.current_list_price, updated.actual_sell_price,
      updated.date_acquired, updated.date_listed, updated.date_sold, days_on_market,
      updated.notes, updated.best_listing_window,
      updated.ebay_listing_id, updated.cert_verification_url,
      updated.other_platform_listing_ids, updated.ebay_promoted_rate,
      updated.sku, updated.listing_format, updated.listing_status,
      updated.quantity, updated.purchase_date, updated.floor_price, updated.buy_it_now_price,
      updated.buyer_shipping_cost, attributesJson,
      id, payload.userId
    ).run();

    // Auto-sync Sold Tracker (auction_sales table)
    if (updated.status === 'Sold') {
      const saleDate = updated.date_sold || new Date().toISOString().split('T')[0];
      const grossPrice = Number(updated.actual_sell_price) || 0;
      const platformName = updated.platform || item.platform || 'eBay';
      const shippingCost = Number(updated.est_shipping_cost ?? item.est_shipping_cost ?? 0);
      const feePct = Number(updated.platform_fee_pct ?? item.platform_fee_pct ?? 0.135);
      const flatFee = Number(updated.platform_flat_fee ?? item.platform_flat_fee ?? 0.40);
      const daysToSell = days_on_market ?? 0;

      const saleMetrics = computeSaleMetrics({
        gross_sale_price: grossPrice,
        buyer_shipping_paid: 0,
        actual_shipping_cost: shippingCost,
        platform_fee_pct: feePct,
        platform_flat_fee: flatFee,
        payment_processing_amt: 0,
        promoted_listing_fee: 0,
        true_total_cost: updated.true_total_cost || item.true_total_cost || 0
      });

      await markItemSold(env, payload.userId, { ...item, ...updated, id }, {
        sale_date: saleDate,
        platform: platformName,
        gross_sale_price: grossPrice,
        actual_shipping_cost: shippingCost,
        platform_fee_pct: feePct,
        platform_flat_fee: flatFee,
        platform_fees_amt: saleMetrics.platform_fees_amt,
        net_proceeds: saleMetrics.net_proceeds,
        true_total_cost: updated.true_total_cost || item.true_total_cost || 0,
        net_profit: saleMetrics.net_profit,
        roi_pct: saleMetrics.roi_pct,
        days_to_sell: daysToSell
      });
    } else if (item.status === 'Sold' && updated.status !== 'Sold') {
      // Reverted away from Sold - remove corresponding sale record to keep Sold Tracker clean
      await env.DB.prepare(
        'DELETE FROM auction_sales WHERE item_id = ? AND user_id = ?'
      ).bind(id, payload.userId).run();
    }

    return ok({
      success: true,
      item: {
        ...item,
        ...updated,
        min_sell_price: pricing.min_sell_price,
        suggested_list_price: pricing.suggested_list_price,
        days_on_market
      },
      ...updated,
      min_sell_price: pricing.min_sell_price,
      suggested_list_price: pricing.suggested_list_price,
      days_on_market
    });
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getItemId(new URL(request.url));
    if (!id) return err('Item ID required', 400);

    const item = await env.DB.prepare(
      'SELECT id FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();
    if (!item) return err('Item not found', 404);

    // Guard: cannot delete if a sale references this item
    const saleCheck = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM auction_sales WHERE item_id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();
    if (saleCheck && saleCheck.cnt > 0) {
      return err('Cannot delete an item that has recorded sales. Set status to "Returned" instead.', 409);
    }

    await env.DB.prepare('DELETE FROM auction_comps WHERE item_id = ? AND user_id = ?').bind(id, payload.userId).run();
    await env.DB.prepare('DELETE FROM auction_items WHERE id = ? AND user_id = ?').bind(id, payload.userId).run();

    return ok({ success: true });
  });
}
