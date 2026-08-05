import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/supplies - List all supply expenses for the current user
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const rows = await env.DB.prepare(
      'SELECT * FROM auction_supplies WHERE user_id = ? ORDER BY purchase_date DESC, created_at DESC'
    ).bind(userId).all();

    return ok({ supplies: rows.results || [] });
  });
}

/**
 * POST /api/supplies - Create a new supply expense record
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const {
      name,
      category = 'Packaging',
      purchase_date,
      cost = 0,
      quantity = 1,
      notes = ''
    } = body;

    if (!name || !name.trim()) {
      return err('Supply item name is required', 400);
    }

    const numCost = Math.max(0, parseFloat(cost) || 0);
    const numQty = Math.max(1, parseInt(quantity, 10) || 1);
    const unitCost = numQty > 0 ? numCost / numQty : numCost;
    const purchaseDate = purchase_date || new Date().toISOString().split('T')[0];
    const id = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO auction_supplies (id, user_id, name, category, purchase_date, cost, quantity, unit_cost, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      userId,
      name.trim(),
      category.trim(),
      purchaseDate,
      numCost,
      numQty,
      unitCost,
      notes ? notes.trim() : null
    ).run();

    const created = await env.DB.prepare(
      'SELECT * FROM auction_supplies WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    return ok({ supply: created }, 201);
  });
}
