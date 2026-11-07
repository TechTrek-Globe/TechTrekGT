const accommodationByJourney = {
  'poland-christmas-2026': [
    {
      id: 'wroclaw-altus-palace-2026',
      docType: 'hotel',
      title: 'Altus Palace Wrocław',
      hotel_name: 'Altus Palace Wrocław',
      location: 'Wrocław, Poland',
      guest_name: 'Jon',
      check_in_date: '2026-12-07',
      check_in_time: '15:00',
      check_out_date: '2026-12-09',
      website_url: 'https://www.hotelaltuspalace.pl',
      phone: '+48 717475000',
      email: 'info@hotelaltuspalace.pl'
    }
  ]
};

import { resolveAgendaAccess, getCollaboratorIds, isMember, canViewSensitive } from '../../utils/agendaAccess.js';

export async function handleAccommodations(context, url, method) {
  const { env, user } = context;
  if (!user?.userId) return json({ error: 'Unauthorized' }, 401);
  if (method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId');
  if (!journeyId) return json({ error: 'journey_id required' }, 400);

  const staticList = accommodationByJourney[journeyId] || [];

  if (!env?.DB) {
    return json({ accommodations: staticList });
  }

  try {
    const access = await resolveAgendaAccess(env, journeyId, user);
    const journey = access.journey;
    if (!journey || !isMember(access.role)) {
      return json({ accommodations: [] });
    }
    const sensitive = canViewSensitive(access.role);

    const items = await env.DB.prepare(
      `SELECT i.*, d.original_filename, d.safe_display_name, d.mime_type
       FROM wayfinder_itinerary_items i
       LEFT JOIN wayfinder_documents d ON i.source_document_id = d.id
       WHERE (i.journey_id = ? OR i.journey_id = ?)
         AND i.item_type IN ('hotel', 'accommodation', 'lodging')
         AND (i.notes IS NULL OR i.notes NOT LIKE '%gmail:%')
       ORDER BY i.local_date ASC`
    ).bind(journeyId, journey.id).all();

    if (!items?.results || items.results.length === 0) {
      return json({ accommodations: staticList });
    }

    const docIds = items.results
      .map(r => r.source_document_id)
      .filter(Boolean);

    const fieldsMap = new Map();
    if (docIds.length > 0) {
      const placeholders = docIds.map(() => '?').join(',');
      const fields = await env.DB.prepare(
        `SELECT document_id, field_name, display_value, user_value
         FROM wayfinder_extracted_fields
         WHERE document_id IN (${placeholders})`
      ).bind(...docIds).all();

      (fields?.results || []).forEach(f => {
        if (!fieldsMap.has(f.document_id)) {
          fieldsMap.set(f.document_id, {});
        }
        fieldsMap.get(f.document_id)[f.field_name] = f.user_value || f.display_value;
      });
    }

    const dynamicAccommodations = items.results.map(item => {
      const docFields = fieldsMap.get(item.source_document_id) || {};
      const matchingStatic = staticList.find(s =>
        (s.hotel_name && (item.title || '').toLowerCase().includes(s.hotel_name.toLowerCase())) ||
        (s.title && (item.title || '').toLowerCase().includes(s.title.toLowerCase()))
      );

      return {
        id: item.id,
        docType: 'hotel',
        item_type: 'hotel',
        title: item.title,
        hotel_name: docFields.hotel_name || item.title,
        location: docFields.hotel_address || docFields.location || item.location,
        check_in_date: docFields.check_in_date || docFields.start_date || item.local_date,
        check_in_time: docFields.check_in_time || docFields.start_time || item.local_time || '15:00',
        check_out_date: docFields.check_out_date || docFields.end_date || item.end_date,
        check_out_time: docFields.check_out_time || docFields.end_time || item.end_time || '12:00',
        confirmation_number: docFields.confirmation_number || item.confirmation_number,
        room_type: docFields.room_type || docFields.seat,
        guests: docFields.guests,
        total_cost: sensitive ? docFields.total_cost : null,
        currency: sensitive ? docFields.currency : null,
        notes: item.notes || docFields.notes,
        source_document_id: sensitive ? item.source_document_id : null,
        filename: sensitive ? (item.original_filename || item.safe_display_name) : null,
        safe_display_name: sensitive ? item.safe_display_name : null,
        mime_type: sensitive ? item.mime_type : null,
        website_url: matchingStatic?.website_url,
        phone: matchingStatic?.phone,
        email: matchingStatic?.email
      };
    });

    return json({ accommodations: dynamicAccommodations });
  } catch (err) {
    console.error('Failed to load accommodations from D1:', err);
    return json({ accommodations: staticList });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store'
    }
  });
}