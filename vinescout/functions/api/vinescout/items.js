import { verifyToken, getTokenFromRequest } from '../../utils/auth.js';

// GET /api/vinescout/items
// Query params: page, limit, category, reviewed, sort, dir, search
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
    const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit    = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const offset   = (page - 1) * limit;
    const category = url.searchParams.get('category') || null;
    const reviewed = url.searchParams.get('reviewed');
    const sortParam = url.searchParams.get('sort');
    const sort     = sortParam && ['date_added', 'etv', 'title', 'created_at'].includes(sortParam)
      ? sortParam : 'date_added';
    const dir      = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
    const search   = url.searchParams.get('search') || null;

    const conditions = ['user_id = ?'];
    const bindings   = [payload.userId];

    if (category) { conditions.push('vine_category = ?'); bindings.push(category); }
    if (reviewed !== null && reviewed !== '') {
      conditions.push('review_written = ?');
      bindings.push(reviewed === '1' || reviewed === 'true' ? 1 : 0);
    }
    if (search) {
      conditions.push('title LIKE ?');
      bindings.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    const [countRow, rows] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as total FROM vine_items WHERE ${where}`)
        .bind(...bindings).first(),
      env.DB.prepare(`SELECT * FROM vine_items WHERE ${where} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`)
        .bind(...bindings, limit, offset).all()
    ]);

    return new Response(JSON.stringify({
      success: true,
      items:   rows.results || [],
      total:   countRow?.total ?? 0,
      page,
      limit
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[vinescout items GET] error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
