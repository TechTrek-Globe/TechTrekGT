// Shared D1 chunked binary blob helper for private booking documents.
// Keeps chunk sizes comfortably below Cloudflare D1 row/parameter size ceilings.

import { generateId } from './id.js';

export const MAX_D1_BLOB_SIZE = 10 * 1024 * 1024; // 10 MB per document in D1 chunks
export const CHUNK_RAW_BYTES = 256 * 1024;        // 256 KB raw (~342 KB base64) per chunk

let blobTableReady = false;
let blobTablePromise = null;

/**
 * Isolate-scoped write-path safeguard ensuring wayfinder_document_blobs exists.
 */
export async function ensureDocumentBlobsTable(db) {
  if (!db || blobTableReady) return;
  if (!blobTablePromise) {
    blobTablePromise = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS wayfinder_document_blobs (
          id           TEXT PRIMARY KEY,
          document_id  TEXT NOT NULL,
          user_id      TEXT NOT NULL,
          chunk_index  INTEGER NOT NULL DEFAULT 0,
          total_chunks INTEGER NOT NULL DEFAULT 1,
          mime_type    TEXT NOT NULL DEFAULT 'application/pdf',
          size_bytes   INTEGER NOT NULL DEFAULT 0,
          sha256_hash  TEXT,
          chunk_b64    TEXT NOT NULL,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (document_id) REFERENCES wayfinder_documents(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(document_id, chunk_index)
        )
      `).run();
      await db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_wf_doc_blobs_doc ON wayfinder_document_blobs(document_id, chunk_index)'
      ).run();
      blobTableReady = true;
    })().finally(() => {
      blobTablePromise = null;
    });
  }
  return blobTablePromise;
}

/**
 * Encode a Uint8Array cleanly into Base64 without blowing the JS call stack.
 */
export function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sliceSize = 0x8000;
  const parts = [];
  for (let i = 0; i < arr.length; i += sliceSize) {
    parts.push(String.fromCharCode(...arr.subarray(i, i + sliceSize)));
  }
  return btoa(parts.join(''));
}

/**
 * Decode Base64 (supporting optional data-URL prefix and whitespace) to Uint8Array.
 */
export function base64ToBytes(input) {
  if (!input || typeof input !== 'string') return new Uint8Array(0);
  const commaIdx = input.indexOf(',');
  const clean = (commaIdx !== -1 && input.slice(0, commaIdx).includes(';base64')
    ? input.slice(commaIdx + 1)
    : input
  ).replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compute lowercase SHA-256 hex digest of raw bytes.
 */
export async function sha256HexBytes(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', arr);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate D1 prepared statements to replace and store chunked binary bytes for a document.
 */
export function buildBlobStatements(db, { documentId, userId, bytes, mimeType = 'application/pdf', sha256Hash = null }) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!arr || arr.byteLength === 0) return [];
  if (arr.byteLength > MAX_D1_BLOB_SIZE) {
    throw new Error(`Document exceeds ${MAX_D1_BLOB_SIZE / (1024 * 1024)} MB database storage limit.`);
  }

  const totalChunks = Math.max(1, Math.ceil(arr.byteLength / CHUNK_RAW_BYTES));
  const stmts = [
    db.prepare('DELETE FROM wayfinder_document_blobs WHERE document_id = ?').bind(documentId)
  ];

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_RAW_BYTES;
    const end = Math.min(start + CHUNK_RAW_BYTES, arr.byteLength);
    const slice = arr.subarray(start, end);
    const chunkB64 = bytesToBase64(slice);

    stmts.push(
      db.prepare(
        `INSERT INTO wayfinder_document_blobs
         (id, document_id, user_id, chunk_index, total_chunks, mime_type, size_bytes, sha256_hash, chunk_b64)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        generateId(),
        documentId,
        userId,
        chunkIndex,
        totalChunks,
        mimeType,
        arr.byteLength,
        sha256Hash || null,
        chunkB64
      )
    );
  }

  return stmts;
}

/**
 * Reassemble stored chunks for a document into a single Uint8Array + mimeType.
 */
export async function readDocumentBlob(db, documentId) {
  let res;
  try {
    res = await db.prepare(
      `SELECT chunk_index, total_chunks, mime_type, size_bytes, chunk_b64
       FROM wayfinder_document_blobs
       WHERE document_id = ?
       ORDER BY chunk_index ASC`
    ).bind(documentId).all();
  } catch (err) {
    if (String(err?.message || '').includes('no such table')) {
      return null;
    }
    throw err;
  }

  const rows = res?.results || [];
  if (rows.length === 0) return null;

  const decodedChunks = rows.map(r => base64ToBytes(r.chunk_b64));
  const totalBytes = decodedChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of decodedChunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    bytes: combined,
    mimeType: rows[0].mime_type || 'application/pdf',
    sizeBytes: totalBytes
  };
}

/**
 * Fetch blob metadata without decoding chunk payloads (for HEAD requests).
 */
export async function headDocumentBlob(db, documentId) {
  let row;
  try {
    row = await db.prepare(
      `SELECT COUNT(*) as chunk_count, MAX(mime_type) as mime_type, MAX(size_bytes) as size_bytes
       FROM wayfinder_document_blobs
       WHERE document_id = ?`
    ).bind(documentId).first();
  } catch (err) {
    if (String(err?.message || '').includes('no such table')) {
      return null;
    }
    throw err;
  }

  if (!row || Number(row.chunk_count || 0) === 0) return null;
  return {
    mimeType: row.mime_type || 'application/pdf',
    sizeBytes: Number(row.size_bytes || 0)
  };
}

/**
 * Sanitize filename for HTTP Content-Disposition header.
 */
export function sanitizeHeaderFilename(name) {
  return String(name || 'document.pdf').replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 150);
}
