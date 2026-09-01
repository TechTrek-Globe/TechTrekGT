export async function onRequestGet({ request, env }) {
  try {
    const authHeader = request.headers.get('X-VineScout-Auth');
    
    if (!authHeader || authHeader !== env.OUTPOST_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const query = `
      SELECT 
        i.sku, 
        s.gross_sale_price as sale_price, 
        s.sale_date 
      FROM auction_sales s
      JOIN auction_items i ON s.item_id = i.id
      WHERE i.sku IS NOT NULL
    `;

    const { results } = await env.DB.prepare(query).all();

    return new Response(JSON.stringify({ success: true, data: results }), {
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
