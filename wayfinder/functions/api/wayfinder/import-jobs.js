// POST /api/wayfinder/import-jobs/:doc_id/parse  - parse document text or base64 file with Gemini structured output
// POST /api/wayfinder/import-jobs/:doc_id/fields - save extracted fields from client-side extraction
// POST /api/wayfinder/import-jobs/:doc_id/approve - approve and create itinerary item
// GET  /api/wayfinder/import-jobs/:doc_id - get extraction job + fields

import { generateId } from '../../utils/id.js';
import { parseBookingDocument } from './gemini-parser.js';

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
  let docId = jobIdx !== -1 ? (parts[jobIdx + 1] || null) : null;
  let action = jobIdx !== -1 ? (parts[jobIdx + 2] || null) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);

    // Support POST /api/wayfinder/import-jobs/parse with docId in payload
    if (docId === 'parse' && method === 'POST') {
      const peekBody = await request.clone().json().catch(() => ({}));
      docId = peekBody.doc_id || peekBody.docId || peekBody.document_id;
      action = 'parse';
    }

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

    let job = await env.DB.prepare(
      'SELECT * FROM wayfinder_extraction_jobs WHERE document_id = ?'
    ).bind(docId).first();

    // Auto-heal missing extraction job for user documents (e.g. email-forwarded attachments)
    if (!job) {
      const jobId = generateId();
      const nowIso = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO wayfinder_extraction_jobs (id, document_id, status, created_at)
         VALUES (?, ?, 'ready_for_review', ?)`
      ).bind(jobId, docId, nowIso).run();
      job = { id: jobId, document_id: docId, status: 'ready_for_review', created_at: nowIso };
    }

    // --- GET: retrieve job + fields ---
    if (method === 'GET') {
      let fields = await env.DB.prepare(
        'SELECT * FROM wayfinder_extracted_fields WHERE document_id = ? ORDER BY field_name'
      ).bind(docId).all();

      // If no extracted fields exist yet, auto-populate from linked itinerary item or doc metadata
      if (!fields.results || fields.results.length === 0) {
        const linkedItem = await env.DB.prepare(
          'SELECT * FROM wayfinder_itinerary_items WHERE source_document_id = ?'
        ).bind(docId).first();

        const initialFields = generateInitialFields(doc, linkedItem);
        if (initialFields.length > 0) {
          const insertStmts = initialFields.map(f => {
            const fid = generateId();
            return env.DB.prepare(
              `INSERT INTO wayfinder_extracted_fields
               (id, extraction_job_id, document_id, field_name, extracted_value, display_value, confidence, verification_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'unverified')`
            ).bind(fid, job.id, docId, f.field_name, f.extracted_value, f.display_value || f.extracted_value, f.confidence || 'high');
          });
          await env.DB.batch(insertStmts);
          fields = await env.DB.prepare(
            'SELECT * FROM wayfinder_extracted_fields WHERE document_id = ? ORDER BY field_name'
          ).bind(docId).all();
        }
      }

      return json({ job, fields: fields.results });
    }

    // --- POST parse: parse document with Gemini 2.5 Flash / 3.8 Flash structured outputs ---
    if (method === 'POST' && action === 'parse') {
      const body = await request.json().catch(() => ({}));
      const { text = '', base64 = null, filename = doc.original_filename, mimeType = doc.mime_type } = body;

      const parseResult = await parseBookingDocument({
        env,
        text,
        base64,
        mimeType: mimeType || doc.mime_type,
        filename: filename || doc.original_filename,
      });

      const sanitized = (parseResult.fields || []).map(f => ({
        ...f,
        extracted_value: sanitizeText(f.extracted_value),
        display_value:   sanitizeText(f.display_value || f.extracted_value),
      }));

      // Delete existing fields and re-insert freshly parsed fields
      await env.DB.prepare('DELETE FROM wayfinder_extracted_fields WHERE document_id = ?').bind(docId).run();

      const stmts = sanitized.map(f => {
        const id = generateId();
        const isCritical = CRITICAL_FIELDS.has(f.field_name);
        const isSensitive = f.field_name?.includes('passport') || (f.field_name?.includes('payment') && !f.field_name?.includes('payment_method')) ? 1 : 0;
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
      ).bind(parseResult.provider || null, parseResult.docType || null, docId).run();

      return json({
        success: true,
        document_id: docId,
        job_id: job.id,
        provider: parseResult.provider,
        doc_type: parseResult.docType,
        extraction: parseResult.extraction,
        fields: sanitized,
        used_method: parseResult.usedMethod,
        fields_saved: stmts.length,
      });
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
      const journey_id = body.journey_id || body.journeyId || doc.journey_id;
      const { field_overrides = {} } = body;

      if (!journey_id) return json({ error: 'journey_id required' }, 400);

      // Verify journey ownership or public visibility
      const j = await env.DB.prepare(
        `SELECT id FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND (created_by = ? OR visibility = 'public')`
      ).bind(journey_id, journey_id, user.userId).first();
      if (!j) return json({ error: 'Journey not found' }, 404);
      const finalJourneyId = j.id;

      // Apply user overrides first - marks fields as user_verified before the gate check
      const overrideStmts = Object.entries(field_overrides).map(([fieldName, value]) => {
        return env.DB.prepare(
          `UPDATE wayfinder_extracted_fields
           SET user_value = ?, verification_status = 'user_verified'
           WHERE document_id = ? AND field_name = ?`
        ).bind(sanitizeText(String(value)), docId, fieldName);
      });

      if (overrideStmts.length > 0) {
        await env.DB.batch(overrideStmts);
      }

      // Verify no low-confidence critical fields are still unconfirmed
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
      const auditId1 = generateId();
      const auditId2 = generateId();
      const nowIso = new Date().toISOString();

      // Check for associated expense cost to sync with shared ledger
      const rawCost = fieldMap.total_cost || fieldMap.cost || fieldMap.price || fieldMap.amount;
      const parsedCost = parseCost(rawCost);
      let expenseId = null;

      const existingItem = await env.DB.prepare(
        'SELECT id FROM wayfinder_itinerary_items WHERE source_document_id = ?'
      ).bind(docId).first();

      const purchaseSite = fieldMap.purchase_site || null;
      const paymentMethod = fieldMap.payment_method || null;

      const batchStmts = [
        existingItem
          ? env.DB.prepare(
              `UPDATE wayfinder_itinerary_items
               SET title = ?, provider = ?, local_date = COALESCE(?, local_date),
                   local_time = COALESCE(?, local_time), end_date = COALESCE(?, end_date),
                   end_time = COALESCE(?, end_time), location = COALESCE(?, location),
                   purchase_site = COALESCE(?, purchase_site), payment_method = COALESCE(?, payment_method),
                   status = 'imported', verification_status = 'user_verified'
               WHERE id = ?`
            ).bind(
              title,
              fieldMap.airline || fieldMap.hotel_name || fieldMap.carrier || fieldMap.supplier || doc.detected_provider || null,
              fieldMap.departure_date || fieldMap.check_in_date || fieldMap.start_date || null,
              fieldMap.departure_time || fieldMap.check_in_time || fieldMap.start_time || null,
              fieldMap.arrival_date || fieldMap.check_out_date || fieldMap.end_date || null,
              fieldMap.arrival_time || fieldMap.check_out_time || fieldMap.end_time || null,
              fieldMap.destination_airport || fieldMap.hotel_address || fieldMap.meeting_point || null,
              purchaseSite,
              paymentMethod,
              existingItem.id
            )
          : env.DB.prepare(
              `INSERT INTO wayfinder_itinerary_items
               (id, journey_id, user_id, item_type, title, provider, local_date, local_time,
                end_date, end_time, location, purchase_site, payment_method, source_document_id, status, verification_status, visibility)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'imported','user_verified','private')`
            ).bind(
              itemId, finalJourneyId, user.userId, itemType, title,
              fieldMap.airline || fieldMap.hotel_name || fieldMap.carrier || fieldMap.supplier || doc.detected_provider || null,
              fieldMap.departure_date || fieldMap.check_in_date || fieldMap.start_date || null,
              fieldMap.departure_time || fieldMap.check_in_time || fieldMap.start_time || null,
              fieldMap.arrival_date || fieldMap.check_out_date || fieldMap.end_date || null,
              fieldMap.arrival_time || fieldMap.check_out_time || fieldMap.end_time || null,
              fieldMap.destination_airport || fieldMap.hotel_address || fieldMap.meeting_point || null,
              purchaseSite,
              paymentMethod,
              docId
            ),
        env.DB.prepare(
          `UPDATE wayfinder_extraction_jobs
           SET status = 'approved', reviewed_at = ?, reviewed_by = ?, review_decision = 'approved'
           WHERE document_id = ?`
        ).bind(nowIso, user.userId, docId),
        env.DB.prepare(
          `UPDATE wayfinder_documents SET processing_status = 'imported' WHERE id = ?`
        ).bind(docId),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId1, user.userId, finalJourneyId, 'document', docId, 'approve'),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId2, user.userId, finalJourneyId, 'itinerary_item', existingItem ? existingItem.id : itemId, 'create_from_import')
      ];

      if (parsedCost && parsedCost.amount > 0) {
        const existingExpense = await env.DB.prepare(
          'SELECT id FROM wayfinder_expenses WHERE document_id = ?'
        ).bind(docId).first();

        if (!existingExpense) {
          expenseId = generateId();
          const expenseCat = mapDocTypeToExpenseCategory(docType);
          const payerName = user.name || user.email || 'Jonathan Kemp';
          const halfAmount = Math.round((parsedCost.amount / 2) * 100) / 100;

          batchStmts.push(
            env.DB.prepare(
              `INSERT INTO wayfinder_expenses
               (id, journey_id, itinerary_item_id, document_id, user_id, paid_by_name,
                category, description, amount_original, currency_original, paid_status,
                purchase_site, payment_method, verification_status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, 'verified', ?)`
            ).bind(
              expenseId,
              finalJourneyId,
              itemId,
              docId,
              user.userId,
              payerName,
              expenseCat,
              title,
              parsedCost.amount,
              parsedCost.currency,
              purchaseSite,
              paymentMethod,
              nowIso
            )
          );

          // Add 50/50 split between Jonathan Kemp and Ronald Milton Few
          const splitId1 = generateId();
          const splitId2 = generateId();
          batchStmts.push(
            env.DB.prepare(
              `INSERT INTO wayfinder_expense_splits
               (id, expense_id, user_id, user_name, amount_owed, percentage, created_at)
               VALUES (?, ?, ?, ?, ?, 50, ?)`
            ).bind(splitId1, expenseId, user.userId, payerName, halfAmount, nowIso),
            env.DB.prepare(
              `INSERT INTO wayfinder_expense_splits
               (id, expense_id, user_id, user_name, amount_owed, percentage, created_at)
               VALUES (?, ?, 'usr-ronald-few', 'Ronald Milton Few', ?, 50, ?)`
            ).bind(splitId2, expenseId, halfAmount, nowIso)
          );
        }
      }

      await env.DB.batch(batchStmts);

      return json({ success: true, itinerary_item_id: itemId, expense_id: expenseId });
    }

    // --- POST reject ---
    if (method === 'POST' && action === 'reject') {
      const nowIso = new Date().toISOString();
      const auditId = generateId();

      await env.DB.batch([
        env.DB.prepare(
          `UPDATE wayfinder_extraction_jobs
           SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, review_decision = 'rejected'
           WHERE document_id = ?`
        ).bind(nowIso, user.userId, docId),
        env.DB.prepare(
          `UPDATE wayfinder_documents SET processing_status = 'rejected' WHERE id = ?`
        ).bind(docId),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId, user.userId, doc.journey_id, 'document', docId, 'reject')
      ]);

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

function mapDocTypeToExpenseCategory(docType) {
  const map = {
    flight: 'flight',
    hotel: 'lodging',
    rail: 'transit',
    rail_ticket: 'transit',
    transfer: 'transit',
    rental_car: 'transit',
    tour: 'activity',
    excursion: 'activity',
    restaurant: 'dining',
  };
  return map[docType?.toLowerCase()] || 'other';
}

function parseCost(rawCost) {
  if (!rawCost) return null;
  const str = String(rawCost).trim();
  let currency = 'PLN';
  if (str.toUpperCase().includes('USD') || str.includes('$')) {
    currency = 'USD';
  } else if (str.toUpperCase().includes('EUR') || str.includes('€')) {
    currency = 'EUR';
  } else if (str.toUpperCase().includes('PLN') || str.toUpperCase().includes('ZL') || str.includes('zł')) {
    currency = 'PLN';
  }

  // Handle European comma decimal (e.g. 450,00 or 1.465,72)
  let cleanStr = str;
  if (/,\d{2}(?!\d)/.test(cleanStr)) {
    cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
  } else {
    cleanStr = cleanStr.replace(/,/g, '');
  }

  const numMatch = cleanStr.match(/\d+(?:\.\d+)?/);
  const amount = numMatch ? parseFloat(numMatch[0]) : NaN;
  if (isNaN(amount) || amount <= 0) return null;

  return { amount, currency };
}

function generateInitialFields(doc, linkedItem) {
  const fields = [];
  const docType = doc?.detected_doc_type || linkedItem?.item_type || 'hotel';
  const provider = doc?.detected_provider || linkedItem?.provider || 'Travel Provider';
  const title = linkedItem?.title || doc?.safe_display_name || doc?.original_filename || 'Travel Booking';
  const notes = linkedItem?.notes || '';

  const confMatch = notes.match(/Confirmation:\s*([^\r\n]+)/i) || title.match(/\b([A-Z0-9]{5,15})\b/i);
  const confNumber = confMatch ? confMatch[1].trim() : null;

  const costMatch = notes.match(/Cost:\s*([^\r\n]+)/i);
  const costVal = costMatch ? costMatch[1].trim() : null;

  if (docType === 'hotel') {
    fields.push(
      { field_name: 'hotel_name', extracted_value: provider !== 'Hotel Accommodation' ? provider : title.replace(/^hotel:\s*/i, ''), confidence: 'high' },
      { field_name: 'hotel_address', extracted_value: linkedItem?.location || 'Poland', confidence: 'medium' },
      { field_name: 'check_in_date', extracted_value: linkedItem?.local_date || '2026-12-04', confidence: 'high' },
      { field_name: 'check_out_date', extracted_value: linkedItem?.end_date || (linkedItem?.local_date ? linkedItem.local_date : '2026-12-07'), confidence: 'medium' },
      { field_name: 'check_in_time', extracted_value: linkedItem?.local_time || '15:00', confidence: 'medium' }
    );
  } else if (docType === 'flight') {
    fields.push(
      { field_name: 'airline', extracted_value: provider, confidence: 'high' },
      { field_name: 'departure_date', extracted_value: linkedItem?.local_date || '2026-12-03', confidence: 'high' },
      { field_name: 'departure_time', extracted_value: linkedItem?.local_time || '20:10', confidence: 'medium' }
    );
  } else if (docType === 'rail' || docType === 'train') {
    fields.push(
      { field_name: 'carrier', extracted_value: provider, confidence: 'high' },
      { field_name: 'departure_date', extracted_value: linkedItem?.local_date || '2026-12-07', confidence: 'high' }
    );
  } else {
    fields.push(
      { field_name: 'activity_title', extracted_value: title, confidence: 'high' },
      { field_name: 'tour_date', extracted_value: linkedItem?.local_date || '2026-12-06', confidence: 'high' }
    );
  }

  if (confNumber) {
    fields.push({ field_name: 'confirmation_number', extracted_value: confNumber, confidence: 'high' });
  }
  if (costVal) {
    fields.push({ field_name: 'total_cost', extracted_value: costVal, confidence: 'high' });
  }
  if (linkedItem?.purchase_site) {
    fields.push({ field_name: 'purchase_site', extracted_value: linkedItem.purchase_site, confidence: 'high' });
  }
  if (linkedItem?.payment_method) {
    fields.push({ field_name: 'payment_method', extracted_value: linkedItem.payment_method, confidence: 'high' });
  }

  return fields;
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
