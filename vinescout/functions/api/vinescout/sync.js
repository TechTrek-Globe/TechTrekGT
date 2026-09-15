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
    let inserted = 0;
    let updated  = 0;
    const errors = [];

    // Process items in series (D1 single-writer constraint)
    for (const item of items) {
      if (!item || typeof item.asin !== 'string' || !item.asin.trim()) continue;

      const id = crypto.randomUUID();
      try {
        // Check if the item already exists for upsert tracking
        const existing = await env.DB.prepare(
          'SELECT id FROM vine_items WHERE user_id = ? AND asin = ?'
        ).bind(userId, item.asin.trim()).first();

        await env.DB.prepare(`
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
        `).bind(
          id,
          userId,
          item.asin.trim(),
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
        ).run();

        if (existing) updated++; else inserted++;

        // Update vine_asin_cache (best-effort, non-fatal)
        if (item.image_url || item.category) {
          await env.DB.prepare(`
            INSERT INTO vine_asin_cache (asin, title, category, image_url, fetched_at, source)
            VALUES (?, ?, ?, ?, ?, 'extension')
            ON CONFLICT(asin) DO UPDATE SET
              title      = COALESCE(excluded.title, title),
              category   = COALESCE(excluded.category, category),
              image_url  = COALESCE(excluded.image_url, image_url),
              fetched_at = excluded.fetched_at
          `).bind(
            item.asin.trim(),
            String(item.title || '').slice(0, 500),
            item.category ? String(item.category) : null,
            item.image_url ? String(item.image_url).slice(0, 1000) : null,
            now
          ).run().catch(() => {}); // Non-fatal
        }

      } catch (err) {
        errors.push(`ASIN ${item.asin}: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, inserted, updated, errors }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[vinescout sync POST] error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
