// GET    /api/wayfinder/documents?journey_id=
// POST   /api/wayfinder/documents/register - register document metadata (file stored client-side pending R2)
// DELETE /api/wayfinder/documents/:id

import { generateId } from '../../utils/id.js';
import { resolveAgendaAccess, canEdit, canManage, canViewSensitive } from '../../utils/agendaAccess.js';
import {
  MAX_D1_BLOB_SIZE,
  ensureDocumentBlobsTable,
  base64ToBytes,
  sha256HexBytes,
  buildBlobStatements,
  readDocumentBlob,
  headDocumentBlob,
  sanitizeHeaderFilename
} from '../../utils/documentBlobs.js';

function normalizeDocumentMime(mimeType, filename) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const lowerName = (filename || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.heic')) return 'image/heic';
  return mimeType || '';
}

async function authorizeDocumentAccess(env, doc, user, requireWrite = false) {
  if (!doc) return { ok: false, status: 404, error: 'Document not found' };
  if (doc.journey_id) {
    const access = await resolveAgendaAccess(env, doc.journey_id, user);
    const allowed = requireWrite
      ? (doc.user_id === user.userId || canManage(access.role) || canEdit(access.role))
      : canViewSensitive(access.role);
    if (!allowed) return { ok: false, status: 403, error: 'Forbidden' };
    return { ok: true, access };
  }
  if (doc.user_id !== user.userId) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, access: null };
}

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
  const subpath2 = docIdx !== -1 ? (parts[docIdx + 2] || null) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);

    // Authenticated private document binary retrieval (GET / HEAD /api/wayfinder/documents/:id/file)
    if ((method === 'GET' || method === 'HEAD') && subpath && subpath2 === 'file') {
      const doc = await env.DB.prepare(
        'SELECT * FROM wayfinder_documents WHERE id = ? AND deleted_at IS NULL'
      ).bind(subpath).first();
      const authz = await authorizeDocumentAccess(env, doc, user, false);
      if (!authz.ok) return json({ error: authz.error }, authz.status);

      const safeFilename = sanitizeHeaderFilename(doc.safe_display_name || doc.original_filename || 'document.pdf');
      if (method === 'HEAD') {
        const meta = await headDocumentBlob(env.DB, doc.id);
        if (!meta) return json({ error: 'Document binary not available' }, 404);
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': meta.mimeType,
            'Content-Length': String(meta.sizeBytes),
            'Content-Disposition': `inline; filename="${safeFilename}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          }
        });
      }

      const blob = await readDocumentBlob(env.DB, doc.id);
      if (!blob) return json({ error: 'Document binary not available' }, 404);
      return new Response(blob.bytes, {
        status: 200,
        headers: {
          'Content-Type': blob.mimeType,
          'Content-Length': String(blob.bytes.byteLength),
          'Content-Disposition': `inline; filename="${safeFilename}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        }
      });
    }

    // Attach or replace binary content on an existing document (POST / PUT /api/wayfinder/documents/:id/file)
    if ((method === 'POST' || method === 'PUT') && subpath && subpath !== 'register' && subpath2 === 'file') {
      const doc = await env.DB.prepare(
        'SELECT * FROM wayfinder_documents WHERE id = ? AND deleted_at IS NULL'
      ).bind(subpath).first();
      const authz = await authorizeDocumentAccess(env, doc, user, true);
      if (!authz.ok) return json({ error: authz.error }, authz.status);

      let attachBytes = null;
      let attachMime = doc.mime_type;
      let attachName = doc.original_filename;
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData().catch(() => null);
        const file = formData?.get('file');
        if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function') {
          attachBytes = new Uint8Array(await file.arrayBuffer());
          attachName = file.name || attachName;
          attachMime = file.type || attachMime;
        }
      } else {
        const body = await request.json().catch(() => ({}));
        const b64 = body.base64 || body.content_b64;
        if (b64) attachBytes = base64ToBytes(b64);
        attachMime = body.mime_type || body.type || attachMime;
        attachName = body.original_filename || body.filename || attachName;
      }

      attachMime = normalizeDocumentMime(attachMime, attachName);
      if (!attachBytes || attachBytes.byteLength === 0) {
        return json({ error: 'Binary file payload is required' }, 400);
      }
      if (!ALLOWED_MIME.has(attachMime)) {
        return json({ error: `Unsupported file type: ${attachMime}` }, 422);
      }
      if (attachBytes.byteLength > MAX_D1_BLOB_SIZE) {
        return json({ error: 'File exceeds 10 MB server storage limit' }, 422);
      }

      const fileHash = await sha256HexBytes(attachBytes);
      await ensureDocumentBlobsTable(env.DB);
      const blobStmts = buildBlobStatements(env.DB, {
        documentId: doc.id,
        userId: user.userId,
        bytes: attachBytes,
        mimeType: attachMime,
        sha256Hash: fileHash
      });

      await env.DB.batch([
        env.DB.prepare(
          `UPDATE wayfinder_documents
           SET mime_type = ?, file_size_bytes = ?, file_hash = COALESCE(?, file_hash), storage_status = 'd1_blob'
           WHERE id = ?`
        ).bind(attachMime, attachBytes.byteLength, fileHash, doc.id),
        ...blobStmts
      ]);

      return json({
        success: true,
        document_id: doc.id,
        file_url: `/api/wayfinder/documents/${doc.id}/file`,
        storage_status: 'd1_blob',
        file_size_bytes: attachBytes.byteLength
      });
    }

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
      let fileBytes = null;

      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData().catch(() => null);
        if (formData) {
          const file = formData.get('file');
          if (file && typeof file === 'object') {
            original_filename = file.name || 'uploaded_document';
            mime_type = file.type || 'application/pdf';
            file_size_bytes = file.size || 0;
            if (typeof file.arrayBuffer === 'function') {
              const buf = await file.arrayBuffer();
              if (buf && buf.byteLength > 0) {
                fileBytes = new Uint8Array(buf);
                file_size_bytes = fileBytes.byteLength;
              }
            }
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
        const rawB64 = body.base64 || body.content_b64;
        if (rawB64 && typeof rawB64 === 'string') {
          fileBytes = base64ToBytes(rawB64);
          if (fileBytes.byteLength > 0) {
            file_size_bytes = fileBytes.byteLength;
          }
        }
      }

      // Infer or normalize MIME type if missing or generic on mobile/iOS
      mime_type = normalizeDocumentMime(mime_type, original_filename);

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
      if (fileBytes && fileBytes.byteLength > MAX_D1_BLOB_SIZE) {
        return json({ error: 'File exceeds 10 MB server storage limit' }, 422);
      }
      if (!file_hash && fileBytes && fileBytes.byteLength > 0) {
        file_hash = await sha256HexBytes(fileBytes);
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
      const hasBlob = Boolean(fileBytes && fileBytes.byteLength > 0);
      const storageStatus = hasBlob ? 'd1_blob' : 'pending_r2';
      if (hasBlob) {
        await ensureDocumentBlobsTable(env.DB);
      }
      const blobStmts = hasBlob
        ? buildBlobStatements(env.DB, {
            documentId: id,
            userId: user.userId,
            bytes: fileBytes,
            mimeType: mime_type,
            sha256Hash: file_hash
          })
        : [];

      // Batch document creation, extraction job placeholder, audit event, and binary chunks atomically
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO wayfinder_documents
           (id, user_id, journey_id, original_filename, safe_display_name, mime_type,
            file_size_bytes, file_hash, storage_status, processing_status, security_scan_status)
           VALUES (?,?,?,?,?,?,?,?,?,'pending','pending')`
        ).bind(id, user.userId, journey_id || null, original_filename, safeName,
               mime_type, file_size_bytes || null, file_hash || null, storageStatus),
        env.DB.prepare(
          'INSERT INTO wayfinder_extraction_jobs (id, document_id, user_id, status) VALUES (?,?,?,?)'
        ).bind(jobId, id, user.userId, 'pending'),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId, user.userId, journey_id || null, 'document', id, 'register'),
        ...blobStmts
      ]);

      return json({
        document_id: id,
        extraction_job_id: jobId,
        safe_display_name: safeName,
        filename: safeName,
        storage_status: storageStatus,
        file_url: hasBlob ? `/api/wayfinder/documents/${id}/file` : null,
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

      // 5.5 Delete stored binary chunks (ensure table exists before batch DELETE)
      await ensureDocumentBlobsTable(env.DB);
      batchStmts.push(
        env.DB.prepare('DELETE FROM wayfinder_document_blobs WHERE document_id = ?').bind(docId)
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
    has_blob:            doc.storage_status === 'd1_blob',
    file_url:            doc.storage_status === 'd1_blob' ? `/api/wayfinder/documents/${doc.id}/file` : null,
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
