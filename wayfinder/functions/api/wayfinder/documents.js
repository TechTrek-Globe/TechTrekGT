// GET    /api/wayfinder/documents?journey_id=
// POST   /api/wayfinder/documents/register - register document metadata (file stored client-side pending R2)
// DELETE /api/wayfinder/documents/:id

import { generateId } from '../../utils/id.js';
import { resolveAgendaAccess, canEdit, canManage, canViewSensitive } from '../../utils/agendaAccess.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME  = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
  'applications/vnd.pdf',
  'text/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
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
        // Documents are restricted to owner, share admin and platform admin
        const access = await resolveAgendaAccess(env, journeyId, user);
        const j = access.journey;
        if (!j) return json({ error: 'Journey not found' }, 404);
        if (!canViewSensitive(access.role)) return json({ error: 'Forbidden' }, 403);
        docs = await env.DB.prepare(
          'SELECT * FROM wayfinder_documents WHERE (journey_id = ? OR journey_id = ?) AND deleted_at IS NULL ORDER BY upload_date DESC'
        ).bind(journeyId, j.id).all();
      } else {
        docs = await env.DB.prepare(
          `SELECT * FROM wayfinder_documents 
           WHERE deleted_at IS NULL 
             AND (user_id = ?
                  OR journey_id IN (SELECT id FROM wayfinder_journeys WHERE created_by = ?)
                  OR journey_id IN (SELECT agenda_id FROM wayfinder_agenda_shares WHERE user_id = ? AND role = 'admin'))
           ORDER BY upload_date DESC`
        ).bind(user.userId, user.userId, user.userId).all();
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

      // Infer or normalize MIME type if missing or generic on mobile/iOS
      if (!mime_type || mime_type === 'application/octet-stream') {
        const lowerName = (original_filename || '').toLowerCase();
        if (lowerName.endsWith('.pdf')) mime_type = 'application/pdf';
        else if (lowerName.endsWith('.png')) mime_type = 'image/png';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mime_type = 'image/jpeg';
        else if (lowerName.endsWith('.webp')) mime_type = 'image/webp';
        else if (lowerName.endsWith('.heic')) mime_type = 'image/heic';
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

      // Journey ownership / collaborator / public visibility check
      if (journey_id) {
        const access = await resolveAgendaAccess(env, journey_id, user);
        const j = access.journey;
        if (!j) return json({ error: 'Journey not found' }, 404);
        if (!canViewSensitive(access.role)) {
          return json({ error: 'Forbidden' }, 403);
        }
        journey_id = j.id;
      }

      const id = generateId();
      const safeName = sanitizeFilename(original_filename);
      const jobId = generateId();
      const auditId = generateId();

      // Batch document creation, extraction job placeholder, and audit event atomically
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO wayfinder_documents
           (id, user_id, journey_id, original_filename, safe_display_name, mime_type,
            file_size_bytes, file_hash, storage_status, processing_status, security_scan_status)
           VALUES (?,?,?,?,?,?,?,?,'pending_r2','pending','pending')`
        ).bind(id, user.userId, journey_id || null, original_filename, safeName,
               mime_type, file_size_bytes || null, file_hash || null),
        env.DB.prepare(
          'INSERT INTO wayfinder_extraction_jobs (id, document_id, user_id, status) VALUES (?,?,?,?)'
        ).bind(jobId, id, user.userId, 'pending'),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId, user.userId, journey_id || null, 'document', id, 'register')
      ]);

      return json({
        document_id: id,
        extraction_job_id: jobId,
        safe_display_name: safeName,
        filename: safeName,
        storage_note: 'R2 storage not yet configured - document metadata registered. File extraction available client-side.',
      }, 201);
    }

    if ((method === 'PUT' || method === 'PATCH') && subpath && subpath !== 'register') {
      const docId = subpath;
      const body = await request.json().catch(() => ({}));
      const newTitle = (body.safe_display_name || body.title || body.filename || '').trim();

      if (!newTitle) {
        return json({ error: 'Title or safe_display_name is required' }, 400);
      }

      // Check existence & permissions
      const doc = await env.DB.prepare(
        'SELECT * FROM wayfinder_documents WHERE id = ? AND deleted_at IS NULL'
      ).bind(docId).first();

      if (!doc) return json({ error: 'Document not found' }, 404);

      if (doc.journey_id) {
        const access = await resolveAgendaAccess(env, doc.journey_id, user);
        const allowed = doc.user_id === user.userId || canViewSensitive(access.role);
        if (!allowed) return json({ error: 'Permission denied' }, 403);
      } else if (doc.user_id !== user.userId) {
        return json({ error: 'Permission denied' }, 403);
      }

      const auditId = generateId();
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE wayfinder_documents SET safe_display_name = ? WHERE id = ?'
        ).bind(newTitle, docId),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, previous_value, new_value, metadata_summary, details) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).bind(
          auditId,
          user.userId,
          doc.journey_id || null,
          'document',
          docId,
          'rename',
          doc.safe_display_name || null,
          newTitle,
          `old_title=${doc.safe_display_name}; new_title=${newTitle}`,
          JSON.stringify({ old_title: doc.safe_display_name, new_title: newTitle })
        )
      ]);

      const updated = { ...doc, safe_display_name: newTitle };
      return json({ success: true, document: safeDoc(updated) });
    }

    if (method === 'DELETE' && subpath && subpath !== 'register') {
      const docId = subpath;
      // Allow deletion by document owner or manager on the journey
      const doc = await env.DB.prepare(
        'SELECT * FROM wayfinder_documents WHERE id = ? AND deleted_at IS NULL'
      ).bind(docId).first();

      if (!doc) return json({ error: 'Document not found' }, 404);

      if (doc.journey_id) {
        const access = await resolveAgendaAccess(env, doc.journey_id, user);
        const allowed = doc.user_id === user.userId || canManage(access.role);
        if (!allowed) return json({ error: 'Permission denied' }, 403);
      } else if (doc.user_id !== user.userId) {
        return json({ error: 'Permission denied' }, 403);
      }

      const now = new Date().toISOString();
      const auditId = generateId();

      const batchStmts = [];

      // 1. Delete linked expense splits via subquery
      batchStmts.push(
        env.DB.prepare(
          'DELETE FROM wayfinder_expense_splits WHERE expense_id IN (SELECT id FROM wayfinder_expenses WHERE document_id = ?)'
        ).bind(docId)
      );

      // 2. Delete linked expenses
      batchStmts.push(
        env.DB.prepare('DELETE FROM wayfinder_expenses WHERE document_id = ?').bind(docId)
      );

      // 3. Delete linked itinerary items
      batchStmts.push(
        env.DB.prepare('DELETE FROM wayfinder_itinerary_items WHERE source_document_id = ?').bind(docId)
      );

      // 4. Delete extracted fields
      batchStmts.push(
        env.DB.prepare('DELETE FROM wayfinder_extracted_fields WHERE document_id = ?').bind(docId)
      );

      // 5. Delete extraction jobs
      batchStmts.push(
        env.DB.prepare('DELETE FROM wayfinder_extraction_jobs WHERE document_id = ?').bind(docId)
      );

      // 6. Delete document record completely to allow clean re-import without hash conflict
      batchStmts.push(
        env.DB.prepare('DELETE FROM wayfinder_documents WHERE id = ?').bind(docId)
      );

      // 7. Audit event
      batchStmts.push(
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, previous_value, metadata_summary, details) VALUES (?,?,?,?,?,?,?,?,?)'
        ).bind(
          auditId, 
          user.userId, 
          doc.journey_id || null, 
          'document', 
          docId, 
          'delete_cascade',
          doc.safe_display_name || doc.original_filename || null,
          `filename=${doc.original_filename}; purged_doc_id=${docId}`,
          JSON.stringify({
            filename: doc.original_filename,
            safe_name: doc.safe_display_name,
            document_id: docId
          })
        )
      );

      const batchResults = await env.DB.batch(batchStmts);
      const purgedExpenses = batchResults[1]?.meta?.changes || 0;

      return json({ 
        success: true, 
        deleted_document_id: docId,
        purged_expenses: purgedExpenses,
        message: 'Document and linked bookings removed. Ready for re-import.'
      });
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
