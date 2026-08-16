// GET    /api/wayfinder/documents?journey_id=
// POST   /api/wayfinder/documents/register - register document metadata (file stored client-side pending R2)
// DELETE /api/wayfinder/documents/:id

import { generateId } from '../../utils/id.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME  = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export async function handleDocuments(context, url, method) {
  const { env, user, request } = context;
  const parts = url.pathname.split('/').filter(Boolean);
  const docIdx = parts.indexOf('documents');
  const subpath = docIdx !== -1 ? (parts[docIdx + 1] || null) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);

    if (method === 'GET') {
      const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId');
      let docs;
      if (journeyId) {
        // Verify journey ownership
        const j = await env.DB.prepare(
          'SELECT id FROM wayfinder_journeys WHERE id = ? AND created_by = ?'
        ).bind(journeyId, user.userId).first();
        if (!j) return json({ error: 'Journey not found' }, 404);
        docs = await env.DB.prepare(
          'SELECT * FROM wayfinder_documents WHERE user_id = ? AND journey_id = ? AND deleted_at IS NULL ORDER BY upload_date DESC'
        ).bind(user.userId, journeyId).all();
      } else {
        docs = await env.DB.prepare(
          'SELECT * FROM wayfinder_documents WHERE user_id = ? AND deleted_at IS NULL ORDER BY upload_date DESC'
        ).bind(user.userId).all();
      }
      return json({ documents: docs.results.map(safeDoc) });
    }

    if (method === 'POST' && (subpath === 'register' || subpath === null)) {
      let original_filename = null;
      let mime_type = null;
      let file_size_bytes = null;
      let file_hash = null;
      let journey_id = null;

      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData().catch(() => null);
        if (formData) {
          const file = formData.get('file');
          if (file && typeof file === 'object') {
            original_filename = file.name || 'uploaded_document';
            mime_type = file.type || 'application/pdf';
            file_size_bytes = file.size || 0;
          }
          journey_id = formData.get('journey_id') || formData.get('journeyId');
        }
      } else {
        const body = await request.json().catch(() => ({}));
        original_filename = body.original_filename || body.filename;
        mime_type = body.mime_type || body.type;
        file_size_bytes = body.file_size_bytes || body.size;
        file_hash = body.file_hash || body.hash;
        journey_id = body.journey_id || body.journeyId;
      }

      if (!original_filename || !mime_type) {
        return json({ error: 'original_filename and mime_type are required' }, 400);
      }

      // Server-side validation
      if (!ALLOWED_MIME.has(mime_type)) {
        return json({ error: `Unsupported file type: ${mime_type}` }, 422);
      }
      if (file_size_bytes && file_size_bytes > MAX_FILE_SIZE) {
        return json({ error: 'File exceeds 20 MB limit' }, 422);
      }

      // Duplicate check by hash
      if (file_hash) {
        const existing = await env.DB.prepare(
          'SELECT id, safe_display_name FROM wayfinder_documents WHERE user_id = ? AND file_hash = ? AND deleted_at IS NULL'
        ).bind(user.userId, file_hash).first();
        if (existing) {
          return json({
            duplicate: true,
            existing_id: existing.id,
            existing_name: existing.safe_display_name,
            message: 'A document with this content already exists.',
          }, 409);
        }
      }

      // Journey ownership check
      if (journey_id) {
        const j = await env.DB.prepare(
          'SELECT id FROM wayfinder_journeys WHERE id = ? AND created_by = ?'
        ).bind(journey_id, user.userId).first();
        if (!j) return json({ error: 'Journey not found' }, 404);
      }

      const id = generateId();
      const safeName = sanitizeFilename(original_filename);

      await env.DB.prepare(
        `INSERT INTO wayfinder_documents
         (id, user_id, journey_id, original_filename, safe_display_name, mime_type,
          file_size_bytes, file_hash, storage_status, processing_status, security_scan_status)
         VALUES (?,?,?,?,?,?,?,?,'pending_r2','pending','pending')`
      ).bind(id, user.userId, journey_id || null, original_filename, safeName,
             mime_type, file_size_bytes || null, file_hash || null).run();

      // Create extraction job placeholder
      const jobId = generateId();
      await env.DB.prepare(
        'INSERT INTO wayfinder_extraction_jobs (id, document_id, status) VALUES (?,?,?)'
      ).bind(jobId, id, 'pending').run();

      await auditEvent(env, user.userId, journey_id, 'document', id, 'register');

      return json({
        document_id: id,
        extraction_job_id: jobId,
        safe_display_name: safeName,
        filename: safeName,
        storage_note: 'R2 storage not yet configured - document metadata registered. File extraction available client-side.',
      }, 201);
    }

    if (method === 'DELETE' && subpath && subpath !== 'register') {
      const docId = subpath;
      const doc = await env.DB.prepare(
        'SELECT * FROM wayfinder_documents WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      ).bind(docId, user.userId).first();
      if (!doc) return json({ error: 'Document not found' }, 404);

      const now = new Date().toISOString();
      await env.DB.prepare(
        'UPDATE wayfinder_documents SET deleted_at = ?, deleted_by = ?, retention_status = ? WHERE id = ?'
      ).bind(now, user.userId, 'deleted', docId).run();

      await auditEvent(env, user.userId, doc.journey_id, 'document', docId, 'delete');
      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[documents] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function safeDoc(doc) {
  return {
    id:                  doc.id,
    journey_id:          doc.journey_id,
    safe_display_name:   doc.safe_display_name,
    filename:            doc.safe_display_name,
    original_filename:   doc.original_filename,
    mime_type:           doc.mime_type,
    file_size_bytes:     doc.file_size_bytes,
    file_size:           doc.file_size_bytes,
    upload_date:         doc.upload_date,
    uploaded_at:         doc.upload_date,
    processing_status:   doc.processing_status,
    detected_provider:   doc.detected_provider,
    detected_doc_type:   doc.detected_doc_type,
    security_scan_status:doc.security_scan_status,
    storage_status:      doc.storage_status,
    retention_status:    doc.retention_status,
  };
}

function sanitizeFilename(name) {
  // Remove path traversal, control chars; keep alphanumeric, dash, underscore, dot
  return name.replace(/[^a-zA-Z0-9._\- ]/g, '_').substring(0, 200);
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
