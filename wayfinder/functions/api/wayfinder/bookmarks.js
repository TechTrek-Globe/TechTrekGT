// GET    /api/wayfinder/bookmarks?journey_id= - list user's bookmarks for an accessible journey
// POST   /api/wayfinder/bookmarks             - upsert a user bookmark for an accessible journey
// DELETE /api/wayfinder/bookmarks/:itemId     - remove a user bookmark

import { generateId } from '../../utils/id.js';
import { resolveAgendaAccess, isMember } from '../../utils/agendaAccess.js';

let bookmarksTableReady = false;
let bookmarksTablePromise = null;

/**
 * Isolate-scoped write-path safeguard ensuring wayfinder_bookmarks exists.
 */
export async function ensureBookmarksTable(db) {
  if (!db || bookmarksTableReady) return;
  if (!bookmarksTablePromise) {
    bookmarksTablePromise = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS wayfinder_bookmarks (
          id          TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL,
          journey_id  TEXT NOT NULL,
          item_id     TEXT NOT NULL,
          item_type   TEXT NOT NULL DEFAULT 'poi',
          city        TEXT,
          title       TEXT,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
          UNIQUE(user_id, journey_id, item_id)
        )
      `).run();
      await db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_wf_bookmarks_user_journey ON wayfinder_bookmarks(user_id, journey_id)'
      ).run();
      bookmarksTableReady = true;
    })().finally(() => {
      bookmarksTablePromise = null;
    });
  }
  return bookmarksTablePromise;
}

export async function handleBookmarks(context, url, method) {
  const { env, user, request } = context;
  const parts = url.pathname.split('/').filter(Boolean);
  const bIdx = parts.indexOf('bookmarks');
  const rawItemId = bIdx !== -1 && parts[bIdx + 1] ? decodeURIComponent(parts[bIdx + 1]) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);
    if (!user?.userId) return json({ error: 'Unauthorized' }, 401);

    if (method === 'GET') {
      const requestedJourneyId =
        url.searchParams.get('journey_id') ||
        url.searchParams.get('journeyId') ||
        'poland-christmas-2026';

      const access = await resolveAgendaAccess(env, requestedJourneyId, user);
      if (!access.journey || (!isMember(access.role) && access.journey.visibility !== 'public')) {
        return json({ error: 'Journey not found' }, 404);
      }

      const canonicalJourneyId = access.journey.id;
      let rows;
      try {
        rows = await env.DB.prepare(
          `SELECT id, user_id, journey_id, item_id, item_type, city, title, created_at
           FROM wayfinder_bookmarks
           WHERE user_id = ? AND (journey_id = ? OR journey_id = ?)
           ORDER BY created_at DESC`
        ).bind(user.userId, canonicalJourneyId, requestedJourneyId).all();
      } catch (err) {
        if (String(err?.message || '').includes('no such table')) {
          rows = { results: [] };
        } else {
          throw err;
        }
      }

      return json({
        journey_id: canonicalJourneyId,
        bookmarks: rows.results || [],
      });
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json({ error: 'Valid JSON payload required' }, 400);
      }

      const requestedJourneyId = body.journey_id || body.journeyId || 'poland-christmas-2026';
      const itemId = typeof body.item_id === 'string' ? body.item_id.trim() : '';
      if (!itemId) {
        return json({ error: 'item_id is required' }, 400);
      }

      const access = await resolveAgendaAccess(env, requestedJourneyId, user);
      if (!access.journey || (!isMember(access.role) && access.journey.visibility !== 'public')) {
        return json({ error: 'Journey not found' }, 404);
      }

      const canonicalJourneyId = access.journey.id;
      const itemType = typeof body.item_type === 'string' && body.item_type.trim()
        ? body.item_type.trim().slice(0, 40)
        : 'poi';
      const city = typeof body.city === 'string' && body.city.trim() ? body.city.trim().slice(0, 80) : null;
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 160) : null;
      const id = generateId();
      await ensureBookmarksTable(env.DB);

      await env.DB.prepare(
        `INSERT INTO wayfinder_bookmarks (id, user_id, journey_id, item_id, item_type, city, title)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, journey_id, item_id) DO UPDATE SET
           item_type = excluded.item_type,
           city = COALESCE(excluded.city, wayfinder_bookmarks.city),
           title = COALESCE(excluded.title, wayfinder_bookmarks.title)`
      ).bind(id, user.userId, canonicalJourneyId, itemId, itemType, city, title).run();

      const saved = await env.DB.prepare(
        `SELECT id, user_id, journey_id, item_id, item_type, city, title, created_at
         FROM wayfinder_bookmarks
         WHERE user_id = ? AND journey_id = ? AND item_id = ?`
      ).bind(user.userId, canonicalJourneyId, itemId).first();

      return json({ success: true, bookmark: saved }, 201);
    }

    if (method === 'DELETE' && rawItemId) {
      const requestedJourneyId =
        url.searchParams.get('journey_id') ||
        url.searchParams.get('journeyId') ||
        null;

      if (requestedJourneyId) {
        const access = await resolveAgendaAccess(env, requestedJourneyId, user);
        if (!access.journey || (!isMember(access.role) && access.journey.visibility !== 'public')) {
          return json({ error: 'Journey not found' }, 404);
        }
        await ensureBookmarksTable(env.DB);
        await env.DB.prepare(
          `DELETE FROM wayfinder_bookmarks
           WHERE user_id = ? AND item_id = ? AND (journey_id = ? OR journey_id = ?)`
        ).bind(user.userId, rawItemId, access.journey.id, requestedJourneyId).run();
      } else {
        await ensureBookmarksTable(env.DB);
        await env.DB.prepare(
          `DELETE FROM wayfinder_bookmarks
           WHERE user_id = ? AND item_id = ?`
        ).bind(user.userId, rawItemId).run();
      }

      return json({ success: true, removed_item_id: rawItemId });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[bookmarks] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-cache',
    },
  });
}
