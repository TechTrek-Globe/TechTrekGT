import { verifyToken, getTokenFromRequest } from '../../utils/auth.js';

// POST /api/vinescout/sync
// Accepts batches of items from the extension cloud bridge.
// Uses INSERT OR REPLACE with (user_id, asin) as natural unique key.
// Hard limit: 500 items per request to prevent D1 write-lock contention.
export async function onRequestPost(context) {
  const { request, env } = context;

  const token = getTokenFromRequest(request);
  const payload = token ? await verifyToken(token, env.JWT_SECRET) : null;
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, updated: 0 }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hard limit: 500 items per POST (D1 write-lock protection)
    if (items.length > 500) {
      return new Response(JSON.stringify({ error: 'Batch size exceeds maximum of 500 items. Use chunked pushes.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = payload.userId;
    const now    = new Date().toISOString();
    const errors = [];
    const statements = [];

    for (const item of items) {
      if (!item || typeof item.asin !== 'string' || !item.asin.trim()) continue;
      const asin = item.asin.trim();
      const id = crypto.randomUUID();

      statements.push(
        env.DB.prepare(`
          INSERT INTO vine_items (
            id, user_id, asin, title, etv, order_id, date_added,
            vine_category, category, marketplace, image_url,
            review_written, rating, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, asin) DO UPDATE SET
            title          = excluded.title,
            etv            = excluded.etv,
            order_id       = COALESCE(excluded.order_id, order_id),
            date_added     = COALESCE(excluded.date_added, date_added),
            vine_category  = excluded.vine_category,
            category       = excluded.category,
            marketplace    = excluded.marketplace,
            image_url      = COALESCE(excluded.image_url, image_url),
            review_written = excluded.review_written,
            rating         = excluded.rating,
            updated_at     = excluded.updated_at
          WHERE vine_items.title IS NOT excluded.title
             OR vine_items.etv IS NOT excluded.etv
             OR (excluded.order_id IS NOT NULL AND vine_items.order_id IS NOT excluded.order_id)
             OR (excluded.date_added IS NOT NULL AND vine_items.date_added IS NOT excluded.date_added)
             OR vine_items.vine_category IS NOT excluded.vine_category
             OR vine_items.category IS NOT excluded.category
             OR vine_items.marketplace IS NOT excluded.marketplace
             OR (excluded.image_url IS NOT NULL AND vine_items.image_url IS NOT excluded.image_url)
             OR vine_items.review_written IS NOT excluded.review_written
             OR vine_items.rating IS NOT excluded.rating
        `).bind(
          id,
          userId,
          asin,
          String(item.title || '').slice(0, 500),
          parseFloat(item.etv) || 0,
          item.order_id ? String(item.order_id) : null,
          item.date_added || null,
          String(item.vine_category || 'REGULAR'),
          item.category ? String(item.category) : null,
          String(item.marketplace || 'amazon.com'),
          item.image_url ? String(item.image_url).slice(0, 1000) : null,
          item.review_written ? 1 : 0,
          item.rating !== undefined && item.rating !== null ? parseFloat(item.rating) : null,
          now
        )
      );

      if (item.image_url || item.category) {
        statements.push(
          env.DB.prepare(`
            INSERT INTO vine_asin_cache (asin, title, category, image_url, fetched_at, source)
            VALUES (?, ?, ?, ?, ?, 'extension')
            ON CONFLICT(asin) DO UPDATE SET
              title      = COALESCE(excluded.title, title),
              category   = COALESCE(excluded.category, category),
              image_url  = COALESCE(excluded.image_url, image_url),
              fetched_at = excluded.fetched_at
            WHERE (excluded.title IS NOT NULL AND vine_asin_cache.title IS NOT excluded.title)
               OR (excluded.category IS NOT NULL AND vine_asin_cache.category IS NOT excluded.category)
               OR (excluded.image_url IS NOT NULL AND vine_asin_cache.image_url IS NOT excluded.image_url)
          `).bind(
            asin,
            String(item.title || '').slice(0, 500),
            item.category ? String(item.category) : null,
            item.image_url ? String(item.image_url).slice(0, 1000) : null,
            now
          )
        );
      }
    }

    // Execute in batch chunks (D1 batch limit is 100-128 statements per call)
    const BATCH_CHUNK = 80;
    for (let i = 0; i < statements.length; i += BATCH_CHUNK) {
      const chunk = statements.slice(i, i + BATCH_CHUNK);
      await env.DB.batch(chunk);
    }

    return new Response(JSON.stringify({ success: true, inserted: items.length, updated: 0, errors }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[vinescout sync POST] error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
