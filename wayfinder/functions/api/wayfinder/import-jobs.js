// POST /api/wayfinder/import-jobs/:doc_id/fields - save extracted fields from client-side extraction
// POST /api/wayfinder/import-jobs/:doc_id/approve - approve and create itinerary item
// GET  /api/wayfinder/import-jobs/:doc_id - get extraction job + fields

import { generateId } from '../../utils/id.js';

// Fields that always require user confirmation before approval
const CRITICAL_FIELDS = new Set([
  'departure_date', 'arrival_date', 'check_in_date', 'check_out_date',
  'start_date', 'departure_time', 'arrival_time', 'start_time',
  'origin_airport', 'destination_airport', 'confirmation_number',
  'traveler_name', 'total_cost', 'meeting_point', 'cancellation_deadline',
]);

export async function handleImportJobs(context, url, method) {
  const { env, user, request } = context;
  const parts = url.pathname.split('/').filter(Boolean);
  const jobIdx = parts.indexOf('import-jobs');
  const docId = jobIdx !== -1 ? (parts[jobIdx + 1] || null) : null;
  const action = jobIdx !== -1 ? (parts[jobIdx + 2] || null) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);

    // --- GET all jobs for user when no docId is specified ---
    if (method === 'GET' && !docId) {
      const jobs = await env.DB.prepare(
        `SELECT j.*, d.safe_display_name, d.detected_provider, d.detected_doc_type, d.upload_date, d.journey_id
         FROM wayfinder_extraction_jobs j
         JOIN wayfinder_documents d ON j.document_id = d.id
         WHERE d.user_id = ? AND d.deleted_at IS NULL
         ORDER BY j.created_at DESC`
      ).bind(user.userId).all();
      return json({ jobs: jobs.results });
    }

    if (!docId) return json({ error: 'document id required' }, 400);

    // Verify document ownership
    const doc = await env.DB.prepare(
      'SELECT * FROM wayfinder_documents WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    ).bind(docId, user.userId).first();
    if (!doc) return json({ error: 'Document not found' }, 404);

    const job = await env.DB.prepare(
      'SELECT * FROM wayfinder_extraction_jobs WHERE document_id = ?'
    ).bind(docId).first();
    if (!job) return json({ error: 'Extraction job not found' }, 404);

    // --- GET: retrieve job + fields ---
    if (method === 'GET') {
      const fields = await env.DB.prepare(
        'SELECT * FROM wayfinder_extracted_fields WHERE document_id = ? ORDER BY field_name'
      ).bind(docId).all();
      return json({ job, fields: fields.results });
    }

    // --- POST fields: save client-side extraction results ---
    if (method === 'POST' && action === 'fields') {
      const body = await request.json().catch(() => ({}));
      const { fields = [], provider, doc_type, raw_text_length } = body;

      if (!Array.isArray(fields)) return json({ error: 'fields must be array' }, 400);

      // Treat all text from document as untrusted input - sanitize before storing
      const sanitized = fields.map(f => ({
        ...f,
        extracted_value: sanitizeText(f.extracted_value),
        display_value:   sanitizeText(f.display_value || f.extracted_value),
      }));

      // Delete existing fields and re-insert
      await env.DB.prepare('DELETE FROM wayfinder_extracted_fields WHERE document_id = ?').bind(docId).run();

      const stmts = sanitized.map(f => {
        const id = generateId();
        const isCritical = CRITICAL_FIELDS.has(f.field_name);
        const isSensitive = f.field_name?.includes('passport') || f.field_name?.includes('payment') ? 1 : 0;
        // Sensitive fields blocked
        if (isSensitive) return null;
        return env.DB.prepare(
          `INSERT INTO wayfinder_extracted_fields
           (id, extraction_job_id, document_id, field_name, extracted_value, display_value,
            confidence, source_page, visibility_class, is_sensitive, requires_confirm)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          id, job.id, docId, f.field_name, f.extracted_value || null,
          f.display_value || f.extracted_value || null,
          f.confidence || 'low',
          f.source_page || null,
          'private', isSensitive,
          (isCritical && (f.confidence === 'low' || f.confidence === 'medium')) ? 1 : 0,
        );
      }).filter(Boolean);

      if (stmts.length > 0) {
        await env.DB.batch(stmts);
      }

      // Update job status and document metadata
      await env.DB.prepare(
        `UPDATE wayfinder_extraction_jobs
         SET status = 'ready_for_review', completed_at = ?
         WHERE document_id = ?`
      ).bind(new Date().toISOString(), docId).run();

      await env.DB.prepare(
        `UPDATE wayfinder_documents
         SET detected_provider = ?, detected_doc_type = ?, processing_status = 'needs_review'
         WHERE id = ?`
      ).bind(provider || null, doc_type || null, docId).run();

      return json({ success: true, fields_saved: stmts.length });
    }

    // --- POST approve: user approves extraction, create itinerary item ---
    if (method === 'POST' && action === 'approve') {
      const body = await request.json().catch(() => ({}));
      const journey_id = body.journey_id || body.journeyId;
      const { field_overrides = {} } = body;

      if (!journey_id) return json({ error: 'journey_id required' }, 400);

      // Verify no low-confidence critical fields are unconfirmed
      const unconfirmed = await env.DB.prepare(
        `SELECT field_name FROM wayfinder_extracted_fields
         WHERE document_id = ? AND requires_confirm = 1 AND verification_status = 'unverified'`
      ).bind(docId).all();

      if (unconfirmed.results.length > 0) {
        return json({
          error: 'Unconfirmed critical fields',
          fields: unconfirmed.results.map(f => f.field_name),
          message: 'Please review and confirm low-confidence critical fields before approving.',
        }, 422);
      }

      // Apply user overrides to extracted fields
      for (const [fieldName, value] of Object.entries(field_overrides)) {
        await env.DB.prepare(
          `UPDATE wayfinder_extracted_fields
           SET user_value = ?, verification_status = 'user_verified'
           WHERE document_id = ? AND field_name = ?`
        ).bind(sanitizeText(String(value)), docId, fieldName).run();
      }

      // Build itinerary item from fields
      const allFields = await env.DB.prepare(
        'SELECT * FROM wayfinder_extracted_fields WHERE document_id = ?'
      ).bind(docId).all();

      const fieldMap = {};
      for (const f of allFields.results) {
        fieldMap[f.field_name] = f.user_value || f.extracted_value;
      }

      const docType = doc.detected_doc_type || 'other';
      const itemType = mapDocTypeToItemType(docType);
      const title = buildTitle(docType, fieldMap, doc.safe_display_name);

      const itemId = generateId();
      await env.DB.prepare(
        `INSERT INTO wayfinder_itinerary_items
         (id, journey_id, user_id, item_type, title, provider, local_date, local_time,
          end_date, end_time, location, source_document_id, status, verification_status, visibility)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'confirmed','user_verified','private')`
      ).bind(
        itemId, journey_id, user.userId, itemType, title,
        fieldMap.airline || fieldMap.hotel_name || fieldMap.carrier || fieldMap.supplier || doc.detected_provider || null,
        fieldMap.departure_date || fieldMap.check_in_date || fieldMap.start_date || null,
        fieldMap.departure_time || fieldMap.check_in_time || fieldMap.start_time || null,
        fieldMap.arrival_date || fieldMap.check_out_date || fieldMap.end_date || null,
        fieldMap.arrival_time || fieldMap.check_out_time || fieldMap.end_time || null,
        fieldMap.destination_airport || fieldMap.hotel_address || fieldMap.meeting_point || null,
        docId,
      ).run();

      // Mark job as approved
      await env.DB.prepare(
        `UPDATE wayfinder_extraction_jobs
         SET status = 'approved', reviewed_at = ?, reviewed_by = ?, review_decision = 'approved'
         WHERE document_id = ?`
      ).bind(new Date().toISOString(), user.userId, docId).run();

      await env.DB.prepare(
        `UPDATE wayfinder_documents SET processing_status = 'imported' WHERE id = ?`
      ).bind(docId).run();

      await auditEvent(env, user.userId, journey_id, 'document', docId, 'approve');
      await auditEvent(env, user.userId, journey_id, 'itinerary_item', itemId, 'create_from_import');

      return json({ success: true, itinerary_item_id: itemId });
    }

    // --- POST reject ---
    if (method === 'POST' && action === 'reject') {
      await env.DB.prepare(
        `UPDATE wayfinder_extraction_jobs
         SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, review_decision = 'rejected'
         WHERE document_id = ?`
      ).bind(new Date().toISOString(), user.userId, docId).run();

      await env.DB.prepare(
        `UPDATE wayfinder_documents SET processing_status = 'rejected' WHERE id = ?`
      ).bind(docId).run();

      await auditEvent(env, user.userId, null, 'document', docId, 'reject');
      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[import-jobs] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function sanitizeText(val) {
  if (!val) return null;
  // Treat document content as untrusted - strip HTML, limit length
  return String(val).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').substring(0, 2000);
}

function mapDocTypeToItemType(docType) {
  const map = {
    flight: 'flight', hotel: 'hotel', rail: 'rail', rail_ticket: 'rail',
    tour: 'tour', viator: 'tour', getyourguide: 'tour',
    transfer: 'transfer', rental_car: 'rental_car', restaurant: 'restaurant',
    insurance: 'custom', cruise: 'custom',
  };
  return map[docType?.toLowerCase()] || 'custom';
}

function buildTitle(docType, fields, fallback) {
  if (docType === 'flight' && fields.origin_airport && fields.destination_airport) {
    return `Flight: ${fields.origin_airport} to ${fields.destination_airport}`;
  }
  if (docType === 'hotel' && fields.hotel_name) {
    return `Hotel: ${fields.hotel_name}`;
  }
  if ((docType === 'rail' || docType === 'rail_ticket') && fields.origin_station && fields.destination_station) {
    return `Train: ${fields.origin_station} to ${fields.destination_station}`;
  }
  if (fields.activity_title) return fields.activity_title;
  if (fields.experience_title) return fields.experience_title;
  return fallback || 'Imported booking';
}

async function auditEvent(env, userId, journeyId, entityType, entityId, action) {
  try {
    const id = generateId();
    await env.DB.prepare(
      'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
    ).bind(id, userId, journeyId || null, entityType, entityId, action).run();
  } catch (e) {
    console.error('[audit] failed:', e);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
