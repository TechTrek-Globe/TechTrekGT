import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computeItemProration, computePricingFloors } from '../../utils/auction.js';

// ============================================================
// GET    /api/invoices/:id  - get single invoice with items
// PUT    /api/invoices/:id  - update invoice + re-prorate all items
// DELETE /api/invoices/:id  - delete invoice (cascades to items)
// ============================================================

function getInvoiceId(url) {
  // pathname: /api/invoices/<id>
  const parts = url.pathname.split('/');
  return parts[parts.length - 1] || null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getInvoiceId(new URL(request.url));
    if (!id) return err('Invoice ID required', 400);

    const invoice = await env.DB.prepare(
      'SELECT * FROM auction_invoices WHERE (id = ? OR invoice_ref = ?) AND user_id = ?'
    ).bind(id, id, payload.userId).first();

    if (!invoice) return err('Invoice not found', 404);

    const items = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE invoice_id = ? AND user_id = ? ORDER BY created_at ASC'
    ).bind(invoice.id, payload.userId).all();

    return ok({ invoice, items: items.results || [] });
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const id = getInvoiceId(url);
    if (!id) return err('Invoice ID required', 400);

    const invoice = await env.DB.prepare(
      'SELECT * FROM auction_invoices WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();
    if (!invoice) return err('Invoice not found', 404);

    const body = await request.json();
    const { invoice_ref, description, discount, shipping, tax, date_acquired } = body;

    const newDiscount  = discount  ?? invoice.discount;
    const newShipping  = shipping  ?? invoice.shipping;
    const newTax       = tax       ?? invoice.tax;
    const newRef       = invoice_ref ?? invoice.invoice_ref;
    const newDesc      = description ?? invoice.description;
    const newDateAcq   = date_acquired ?? invoice.date_acquired;

    await env.DB.prepare(`
      UPDATE auction_invoices
      SET invoice_ref = ?, description = ?, discount = ?, shipping = ?, tax = ?, date_acquired = ?
      WHERE id = ? AND user_id = ?
    `).bind(newRef, newDesc, newDiscount, newShipping, newTax, newDateAcq, id, payload.userId).run();

    // Re-prorate all items under this invoice
    const existing = await env.DB.prepare(
      'SELECT * FROM auction_items WHERE invoice_id = ? AND user_id = ?'
    ).bind(id, payload.userId).all();

    const updatedInvoice = { ...invoice, discount: newDiscount, shipping: newShipping, tax: newTax };

    for (const item of (existing.results || [])) {
      const proration = computeItemProration({ unit_price: item.unit_price }, updatedInvoice);
      const pricing   = computePricingFloors({
        true_total_cost:  proration.true_total_cost,
        est_shipping_cost: item.est_shipping_cost || 0,
        platform_flat_fee: item.platform_flat_fee || 0,
        platform_fee_pct:  item.platform_fee_pct  || 0,
        boost_pct:         item.boost_pct         || 0,
        target_margin_pct: item.target_margin_pct || 0
      });

      await env.DB.prepare(`
        UPDATE auction_items
        SET proration_weight = ?, prorated_discount = ?, prorated_shipping = ?,
            prorated_tax = ?, true_total_cost = ?,
            min_sell_price = ?, suggested_list_price = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(
        proration.proration_weight, proration.prorated_discount,
        proration.prorated_shipping, proration.prorated_tax, proration.true_total_cost,
        pricing.min_sell_price, pricing.suggested_list_price,
        item.id, payload.userId
      ).run();
    }

    return ok({ success: true, message: `Invoice updated and ${existing.results?.length || 0} items re-prorated.` });
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const id = getInvoiceId(new URL(request.url));
    if (!id) return err('Invoice ID required', 400);

    const invoice = await env.DB.prepare(
      'SELECT id FROM auction_invoices WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).first();
    if (!invoice) return err('Invoice not found', 404);

    // Check if any items in this invoice have sales
    const soldCheck = await env.DB.prepare(`
      SELECT COUNT(*) AS cnt FROM auction_sales s
      JOIN auction_items i ON i.id = s.item_id
      WHERE i.invoice_id = ? AND s.user_id = ?
    `).bind(id, payload.userId).first();

    if (soldCheck && soldCheck.cnt > 0) {
      return err('Cannot delete an invoice that has recorded sales. Archive items instead.', 409);
    }

    // Delete items first, then invoice (FK cascade may not fire in D1)
    await env.DB.prepare('DELETE FROM auction_items WHERE invoice_id = ? AND user_id = ?').bind(id, payload.userId).run();
    await env.DB.prepare('DELETE FROM auction_invoices WHERE id = ? AND user_id = ?').bind(id, payload.userId).run();

    return ok({ success: true });
  });
}
