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

    const url = new URL(request.url);
    const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(200, limitParam);
    const offset = (page - 1) * limit;

    const userAgg = await db.prepare(`
      SELECT 
        COUNT(*) AS total_users,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN status = 'Locked' THEN 1 ELSE 0 END) AS locked_users
      FROM users
    `).first();

    const itemAgg = await db.prepare('SELECT COUNT(*) AS total_items FROM auction_items').first();

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
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const users = res.results || [];
    const total_users = Number(userAgg?.total_users || 0);
    const total_items = Number(itemAgg?.total_items || 0);
    const active_users = Number(userAgg?.active_users || 0);
    const locked_users = Number(userAgg?.locked_users || 0);

    return ok({
      total_users,
      total_items,
      active_users,
      locked_users,
      users,
      pagination: {
        total: total_users,
        page,
        limit,
        pages: Math.ceil(total_users / limit)
      }
    });
  });
}
