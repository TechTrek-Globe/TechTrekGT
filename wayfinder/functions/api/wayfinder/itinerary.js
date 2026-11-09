// GET  /api/wayfinder/itinerary?journey_id=&date=&city=
// POST /api/wayfinder/itinerary - create itinerary item (requires review source)
// PUT  /api/wayfinder/itinerary/:id - update
// DELETE /api/wayfinder/itinerary/:id - soft delete

import { generateId } from '../../utils/id.js';
import { resolveAgendaAccess, getCollaboratorIds, canEdit, isMember } from '../../utils/agendaAccess.js';

export async function handleItinerary(context, url, method) {
  const { env, user, request } = context;
  const parts = url.pathname.split('/').filter(Boolean);
  const itIdx = parts.indexOf('itinerary');
  const itemId = itIdx !== -1 ? (parts[itIdx + 1] || null) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);

    if (method === 'GET') {
      const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId');
      if (!journeyId) return json({ error: 'journey_id required' }, 400);

      // Members get the full agenda; unaffiliated users get public items of public journeys only
      const access = await resolveAgendaAccess(env, journeyId, user);
      const journey = access.journey;
      if (!journey || (!isMember(access.role) && journey.visibility !== 'public')) return json({ error: 'Journey not found' }, 404);

      let items;
      if (isMember(access.role)) {
        items = await env.DB.prepare(
          `SELECT * FROM wayfinder_itinerary_items
           WHERE (journey_id = ? OR journey_id = ?)
             AND (notes IS NULL OR notes NOT LIKE '%gmail:%')
           ORDER BY local_date, local_time`
        ).bind(journeyId, journey.id).all();
      } else {
        items = await env.DB.prepare(
          `SELECT * FROM wayfinder_itinerary_items
           WHERE (journey_id = ? OR journey_id = ?)
             AND visibility = 'public'
             AND (notes IS NULL OR notes NOT LIKE '%gmail:%')
           ORDER BY local_date, local_time`
        ).bind(journeyId, journey.id).all();
      }

      // Strip any fields marked SENSITIVE_BLOCKED from response
      const safeItems = items.results.map(sanitizeItem);
      return json({ items: safeItems });
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const journey_id = body.journey_id || body.journeyId;
      const { item_type, title, destination_id, local_date, local_time,
              end_date, end_time, timezone, location, provider, supplier,
              confirmation_number, booking_reference, origin, destination,
              room_type, seat, guests, tickets, language, duration,
              pickup_window, bag_restriction, mobile_ticket_url, activity_details_url,
              purchase_site, payment_method, import_source,
              notes, source_document_id } = body;

      if (!journey_id || !item_type || !title) {
        return json({ error: 'journey_id, item_type, title required' }, 400);
      }

      // Ownership, collaborator share (editor+), or public visibility check
      const access = await resolveAgendaAccess(env, journey_id, user);
      const journey = access.journey;
      if (!journey) return json({ error: 'Journey not found' }, 404);
      if (!canEdit(access.role)) return json({ error: 'You do not have permission to modify this agenda' }, 403);

      const id = generateId();
      const auditId = generateId();
      const finalJourneyId = journey.id;

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO wayfinder_itinerary_items
           (id, journey_id, destination_id, user_id, item_type, title, provider, supplier,
            confirmation_number, booking_reference,
            local_date, local_time, end_date, end_time, timezone, location,
            origin, destination, room_type, seat, guests, tickets, language, duration,
            pickup_window, bag_restriction, mobile_ticket_url, activity_details_url,
            purchase_site, payment_method, import_source,
            notes, source_document_id, status, verification_status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'planned','unverified')`
        ).bind(id, finalJourneyId, destination_id || null, user.userId, item_type, title,
               provider || null, supplier || null,
               confirmation_number || null, booking_reference || null,
               local_date || null, local_time || null,
               end_date || null, end_time || null, timezone || null,
               location || null, origin || null, destination || null,
               room_type || null, seat || null, guests || null,
               tickets || null, language || null, duration || null,
               pickup_window || null, bag_restriction || null,
               mobile_ticket_url || null, activity_details_url || null,
               purchase_site || null, payment_method || null, import_source || 'manual',
               notes || null, source_document_id || null),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId, user.userId, finalJourneyId, 'itinerary_item', id, 'create')
      ]);

      const item = await env.DB.prepare('SELECT * FROM wayfinder_itinerary_items WHERE id = ?').bind(id).first();
      return json({ item: sanitizeItem(item) }, 201);
    }

    if (method === 'DELETE' && itemId) {
      // Verify ownership, or editor+ access on the agenda
      let item = await env.DB.prepare(
        'SELECT * FROM wayfinder_itinerary_items WHERE id = ?'
      ).bind(itemId).first();
      if (item) {
        const access = await resolveAgendaAccess(env, item.journey_id, user);
        const allowed = canEdit(access.role);
        if (!allowed) item = null;
      }
      if (!item) return json({ error: 'Item not found' }, 404);

      const auditId = generateId();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM wayfinder_itinerary_items WHERE id = ?').bind(itemId),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId, user.userId, item.journey_id, 'itinerary_item', itemId, 'delete')
      ]);
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
    id:                   item.id,
    journey_id:           item.journey_id,
    destination_id:       item.destination_id,
    item_type:            item.item_type,
    title:                item.title,
    provider:             item.provider,
    supplier:             item.supplier || null,
    status:               item.status,
    verification_status:  item.verification_status,
    local_date:           item.local_date,
    local_time:           item.local_time,
    end_date:             item.end_date,
    end_time:             item.end_time,
    timezone:             item.timezone,
    location:             item.location,
    location_address:     item.location_address || null,
    origin:               item.origin || null,
    destination:          item.destination || null,
    room_type:            item.room_type || null,
    seat:                 item.seat || null,
    guests:               item.guests || null,
    tickets:              item.tickets || null,
    language:             item.language || null,
    duration:             item.duration || null,
    pickup_window:        item.pickup_window || null,
    bag_restriction:      item.bag_restriction || null,
    mobile_ticket_url:    item.mobile_ticket_url || null,
    activity_details_url: item.activity_details_url || null,
    import_source:        item.import_source || null,
    purchase_site:        item.purchase_site || null,
    payment_method:       item.payment_method || null,
    notes:                item.notes,
    confirmation_number:  item.confirmation_number || item.notes?.match(/confirmation:\s*([A-Za-z0-9]+)/i)?.[1] || null,
    booking_reference:    item.booking_reference || null,
    has_conflict:         item.has_conflict,
    conflict_notes:       item.conflict_notes,
    source_document_id:   item.source_document_id,
    created_at:           item.created_at,
    updated_at:           item.updated_at,
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
