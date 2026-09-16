import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

export async function onRequestGet(context) {
  return withAuth(async () => {
    const { request, env } = context;
    const { email } = await requireAuth(request, env);
    const db = env.DB;
    const adminEmail = env.ADMIN_EMAIL;

    if (!adminEmail) {
      return err('Server misconfiguration: ADMIN_EMAIL not set', 500);
    }

    if (email.toLowerCase() !== adminEmail.toLowerCase()) {
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
