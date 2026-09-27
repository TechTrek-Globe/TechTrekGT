import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

export async function onRequestGet(context) {
  return withAuth(async () => {
    const { request, env } = context;
    const { userId } = await requireAuth(request, env);
    const db = env.DB;

    if (!db) {
      return err('Database binding unavailable', 500);
    }

    const userRecord = await db.prepare('SELECT is_admin FROM users WHERE id = ?').bind(userId).first();
    if (!userRecord || Number(userRecord.is_admin) !== 1) {
      return err('Forbidden: Admin access only', 403);
    }

    const res = await db.prepare(`
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.status,
        u.created_at, 
        COUNT(i.id) as item_count 
      FROM users u 
      LEFT JOIN auction_items i ON u.id = i.user_id 
      GROUP BY u.id
      ORDER BY u.created_at ASC
    `).all();

    const users = res.results || [];
    const total_users = users.length;
    const total_items = users.reduce((acc, user) => acc + (user.item_count || 0), 0);
    const active_users = users.filter(u => u.status === 'Active').length;
    const locked_users = users.filter(u => u.status === 'Locked').length;

    return ok({
      total_users,
      total_items,
      active_users,
      locked_users,
      users
    });
  });
}
