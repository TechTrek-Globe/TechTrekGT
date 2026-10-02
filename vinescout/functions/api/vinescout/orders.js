import { verifyToken, getTokenFromRequest } from '../../utils/auth.js';

// GET /api/vinescout/orders
// Query params: page, limit, sort, dir
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const token = getTokenFromRequest(request);
  const payload = token ? await verifyToken(token, env.JWT_SECRET) : null;
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  || '1', 10));
    const limit  = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;
    const sortParam = url.searchParams.get('sort');
    const sort   = sortParam && ['order_date', 'etv', 'created_at'].includes(sortParam)
      ? sortParam : 'order_date';
    const dir    = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';

    const ordersSql = 'SELECT * FROM vine_orders WHERE user_id = ? ORDER BY ' + sort + ' ' + dir + ' LIMIT ? OFFSET ?';
    const [countRow, rows] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as total FROM vine_orders WHERE user_id = ?')
        .bind(payload.userId).first(),
      env.DB.prepare(ordersSql)
        .bind(payload.userId, limit, offset).all()
    ]);

    return new Response(JSON.stringify({
      success: true,
      orders: rows.results || [],
      total:  countRow?.total ?? 0,
      page,
      limit
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[vinescout orders GET] error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
