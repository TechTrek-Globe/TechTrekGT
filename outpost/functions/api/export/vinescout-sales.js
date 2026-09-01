export async function onRequestGet({ request, env }) {
  try {
    const rawAuth = request.headers.get('X-VineScout-Auth') ||
      (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

    if (!rawAuth) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing auth token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let isAuthorized = false;
    if (env.OUTPOST_SECRET_KEY && rawAuth === env.OUTPOST_SECRET_KEY) {
      isAuthorized = true;
    } else if (env.DB) {
      const user = await env.DB.prepare(
        `SELECT id FROM users WHERE amazon_api_token = ? LIMIT 1`
      ).bind(rawAuth).first();
      if (user) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const query = `
      SELECT 
        i.sku,
        json_extract(i.attributes, '$.asin') as asin,
        s.gross_sale_price as sale_price, 
        s.sale_date 
      FROM auction_sales s
      JOIN auction_items i ON s.item_id = i.id
      WHERE i.sku IS NOT NULL OR json_extract(i.attributes, '$.asin') IS NOT NULL
    `;

    const { results } = await env.DB.prepare(query).all();

    return new Response(JSON.stringify({ success: true, data: results || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VINESCOUT_EXPORT] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
