import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

// ============================================================
// GET /api/platforms  - list platforms for current user
// PUT /api/platforms/:id - update platform fee
// ============================================================

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);
    const rows = await env.DB.prepare(
      'SELECT * FROM auction_platforms WHERE user_id = ? ORDER BY is_default DESC, name ASC'
    ).bind(payload.userId).all();
    return ok({ platforms: rows.results || [] });
  });
}
