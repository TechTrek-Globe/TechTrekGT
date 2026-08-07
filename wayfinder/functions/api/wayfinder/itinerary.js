// GET  /api/wayfinder/itinerary?journey_id=&date=&city=
// POST /api/wayfinder/itinerary - create itinerary item (requires review source)
// PUT  /api/wayfinder/itinerary/:id - update
// DELETE /api/wayfinder/itinerary/:id - soft delete

import { generateId } from '../../utils/id.js';

export async function handleItinerary(context, url, method) {
  const { env, user, request } = context;
  const parts  = url.pathname.split('/').filter(Boolean);
  const itemId = parts[4] || null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);

    if (method === 'GET') {
      const journeyId = url.searchParams.get('journey_id');
      if (!journeyId) return json({ error: 'journey_id required' }, 400);

      // Verify ownership
      const journey = await env.DB.prepare(
        'SELECT id FROM wayfinder_journeys WHERE id = ? AND created_by = ?'
      ).bind(journeyId, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);

      const items = await env.DB.prepare(
        `SELECT * FROM wayfinder_itinerary_items
         WHERE journey_id = ? AND user_id = ?
         ORDER BY local_date, local_time`
      ).bind(journeyId, user.userId).all();

      // Strip any fields marked SENSITIVE_BLOCKED from response
      const safeItems = items.results.map(sanitizeItem);
      return json({ items: safeItems });
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { journey_id, item_type, title, destination_id, local_date, local_time,
              end_date, end_time, timezone, location, provider, notes, source_document_id } = body;

      if (!journey_id || !item_type || !title) {
        return json({ error: 'journey_id, item_type, title required' }, 400);
      }

      // Ownership check
      const journey = await env.DB.prepare(
        'SELECT id FROM wayfinder_journeys WHERE id = ? AND created_by = ?'
      ).bind(journey_id, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);

      const id = generateId();
      await env.DB.prepare(
        `INSERT INTO wayfinder_itinerary_items
         (id, journey_id, destination_id, user_id, item_type, title, provider,
          local_date, local_time, end_date, end_time, timezone, location, notes,
          source_document_id, status, verification_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'planned','unverified')`
      ).bind(id, journey_id, destination_id || null, user.userId, item_type, title,
             provider || null, local_date || null, local_time || null,
             end_date || null, end_time || null, timezone || null,
             location || null, notes || null, source_document_id || null).run();

      await auditEvent(env, user.userId, journey_id, 'itinerary_item', id, 'create');

      const item = await env.DB.prepare('SELECT * FROM wayfinder_itinerary_items WHERE id = ?').bind(id).first();
      return json({ item: sanitizeItem(item) }, 201);
    }

    if (method === 'DELETE' && itemId) {
      // Verify ownership
      const item = await env.DB.prepare(
        'SELECT * FROM wayfinder_itinerary_items WHERE id = ? AND user_id = ?'
      ).bind(itemId, user.userId).first();
      if (!item) return json({ error: 'Item not found' }, 404);

      await env.DB.prepare('DELETE FROM wayfinder_itinerary_items WHERE id = ?').bind(itemId).run();
      await auditEvent(env, user.userId, item.journey_id, 'itinerary_item', itemId, 'delete');
      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[itinerary] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function sanitizeItem(item) {
  // Do not return raw sensitive fields - they are stored in extracted_fields table
  if (!item) return null;
  return {
    id:                  item.id,
    journey_id:          item.journey_id,
    destination_id:      item.destination_id,
    item_type:           item.item_type,
    title:               item.title,
    provider:            item.provider,
    status:              item.status,
    verification_status: item.verification_status,
    local_date:          item.local_date,
    local_time:          item.local_time,
    end_date:            item.end_date,
    end_time:            item.end_time,
    timezone:            item.timezone,
    location:            item.location,
    notes:               item.notes,
    has_conflict:        item.has_conflict,
    conflict_notes:      item.conflict_notes,
    source_document_id:  item.source_document_id,
    created_at:          item.created_at,
    updated_at:          item.updated_at,
  };
}

async function auditEvent(env, userId, journeyId, entityType, entityId, action) {
  try {
    const id = generateId();
    await env.DB.prepare(
      'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
    ).bind(id, userId, journeyId, entityType, entityId, action).run();
  } catch (e) {
    console.error('[audit] failed to write event:', e);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
