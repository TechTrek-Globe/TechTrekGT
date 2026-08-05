import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * PUT /api/supplies/:id - Update an existing supply record
 */
export async function onRequestPut(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const supplyId = params.id;
    const body = await request.json().catch(() => ({}));
    const {
      name,
      category,
      purchase_date,
      cost,
      quantity,
      notes
    } = body;

    const existing = await env.DB.prepare(
      'SELECT * FROM auction_supplies WHERE id = ? AND user_id = ?'
    ).bind(supplyId, userId).first();

    if (!existing) return err('Supply record not found', 404);

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedCategory = category !== undefined ? category.trim() : existing.category;
    const updatedDate = purchase_date !== undefined ? purchase_date : existing.purchase_date;
    const updatedCost = cost !== undefined ? Math.max(0, parseFloat(cost) || 0) : existing.cost;
    const updatedQty = quantity !== undefined ? Math.max(1, parseInt(quantity, 10) || 1) : existing.quantity;
    const updatedUnitCost = updatedQty > 0 ? updatedCost / updatedQty : updatedCost;
    const updatedNotes = notes !== undefined ? (notes ? notes.trim() : null) : existing.notes;

    await env.DB.prepare(
      `UPDATE auction_supplies
       SET name = ?, category = ?, purchase_date = ?, cost = ?, quantity = ?, unit_cost = ?, notes = ?
       WHERE id = ? AND user_id = ?`
    ).bind(
      updatedName,
      updatedCategory,
      updatedDate,
      updatedCost,
      updatedQty,
      updatedUnitCost,
      updatedNotes,
      supplyId,
      userId
    ).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM auction_supplies WHERE id = ? AND user_id = ?'
    ).bind(supplyId, userId).first();

    return ok({ supply: updated });
  });
}

/**
 * DELETE /api/supplies/:id - Delete a supply record
 */
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const supplyId = params.id;
    const existing = await env.DB.prepare(
      'SELECT id FROM auction_supplies WHERE id = ? AND user_id = ?'
    ).bind(supplyId, userId).first();

    if (!existing) return err('Supply record not found', 404);

    await env.DB.prepare(
      'DELETE FROM auction_supplies WHERE id = ? AND user_id = ?'
    ).bind(supplyId, userId).run();

    return ok({ message: 'Supply record deleted successfully' });
  });
}
