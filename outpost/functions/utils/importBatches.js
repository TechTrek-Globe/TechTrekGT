export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const BASE64_CHUNK_CHARS = 524288;

const ALLOWED_SOURCE_TYPES = new Set(['pdf', 'xlsx', 'xls', 'csv', 'manual_batch', 'legacy_batch']);

const SOURCE_TO_MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv'
};

const MIME_TO_SOURCE = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'application/csv': 'csv'
};

const initializedDbs = new WeakSet();

/**
 * Isolate-scoped fallback initialization for import_batches tables.
 * Called on write paths or when a query encounters "no such table".
 *
 * @param {D1Database} db
 */
export async function ensureImportBatchTables(db) {
  if (!db || initializedDbs.has(db)) return;
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS import_batches (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        source_type      TEXT NOT NULL DEFAULT 'xlsx',
        file_name        TEXT,
        mime_type        TEXT,
        file_size        INTEGER NOT NULL DEFAULT 0,
        file_sha256      TEXT,
        strategy         TEXT NOT NULL DEFAULT 'append',
        invoice_count    INTEGER NOT NULL DEFAULT 0,
        item_count       INTEGER NOT NULL DEFAULT 0,
        sale_count       INTEGER NOT NULL DEFAULT 0,
        comp_count       INTEGER NOT NULL DEFAULT 0,
        total_cost_basis REAL NOT NULL DEFAULT 0.0,
        has_file_blob    INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'completed',
        created_at       TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_import_batches_user_created
        ON import_batches(user_id, created_at DESC)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS import_batch_file_chunks (
        batch_id    TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data        TEXT NOT NULL,
        PRIMARY KEY (batch_id, chunk_index)
      )
    `)
  ]);
  initializedDbs.add(db);
}

/**
 * Infers source_type from explicit value, filename extension, or mime type.
 *
 * @param {object|null|undefined} fileMeta
 * @returns {'pdf'|'xlsx'|'xls'|'csv'|'manual_batch'}
 */
export function resolveSourceType(fileMeta) {
  if (!fileMeta || typeof fileMeta !== 'object') return 'manual_batch';
  const rawSource = typeof fileMeta.source_type === 'string' ? fileMeta.source_type.trim().toLowerCase() : '';
  if (ALLOWED_SOURCE_TYPES.has(rawSource) && rawSource !== 'legacy_batch') {
    return rawSource;
  }
  const fileName = typeof fileMeta.name === 'string' ? fileMeta.name.trim().toLowerCase() : '';
  if (fileName.endsWith('.pdf')) return 'pdf';
  if (fileName.endsWith('.xlsx')) return 'xlsx';
  if (fileName.endsWith('.xls')) return 'xls';
  if (fileName.endsWith('.csv')) return 'csv';

  const mime = typeof fileMeta.mime_type === 'string' ? fileMeta.mime_type.trim().toLowerCase() : '';
  if (MIME_TO_SOURCE[mime]) return MIME_TO_SOURCE[mime];
  return 'manual_batch';
}

/**
 * Validates and chunks an optional uploaded file payload for D1 storage.
 * Oversized or omitted payloads fall back gracefully to metadata-only (hasFileBlob: false).
 *
 * @param {object|null|undefined} fileMeta
 */
export function prepareImportFileArchive(fileMeta) {
  if (!fileMeta || typeof fileMeta !== 'object') {
    return {
      sourceType: 'manual_batch',
      fileName: null,
      mimeType: null,
      fileSize: 0,
      fileSha256: null,
      hasFileBlob: false,
      chunks: []
    };
  }

  const sourceType = resolveSourceType(fileMeta);
  const rawName = typeof fileMeta.name === 'string' ? fileMeta.name.trim() : '';
  const fileName = rawName ? rawName.slice(0, 255) : null;
  const rawMime = typeof fileMeta.mime_type === 'string' ? fileMeta.mime_type.trim().toLowerCase() : '';
  const mimeType = SOURCE_TO_MIME[sourceType] || (rawMime || null);
  const fileSha256 = typeof fileMeta.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(fileMeta.sha256.trim())
    ? fileMeta.sha256.trim().toLowerCase()
    : null;

  let declaredSize = Number(fileMeta.size);
  if (!Number.isFinite(declaredSize) || declaredSize < 0) declaredSize = 0;

  let chunks = [];
  let hasFileBlob = false;
  let actualSize = Math.floor(declaredSize);

  if (typeof fileMeta.content_base64 === 'string' && fileMeta.content_base64.trim().length > 0) {
    let b64 = fileMeta.content_base64.trim();
    const commaIdx = b64.indexOf(',');
    if (b64.startsWith('data:') && commaIdx !== -1) {
      b64 = b64.slice(commaIdx + 1).trim();
    }
    b64 = b64.replace(/\s+/g, '');

    if (b64.length > 0 && b64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
      const padding = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
      const decodedBytes = Math.floor((b64.length * 3) / 4) - padding;
      if (decodedBytes > 0 && decodedBytes <= MAX_IMPORT_FILE_BYTES) {
        actualSize = decodedBytes;
        hasFileBlob = true;
        for (let offset = 0; offset < b64.length; offset += BASE64_CHUNK_CHARS) {
          chunks.push(b64.slice(offset, offset + BASE64_CHUNK_CHARS));
        }
      }
    }
  }

  return {
    sourceType,
    fileName,
    mimeType,
    fileSize: actualSize,
    fileSha256,
    hasFileBlob,
    chunks
  };
}

/**
 * Reassembles ordered base64 chunks into raw bytes.
 *
 * @param {Array<{ data: string }>} chunkRows
 * @returns {Uint8Array}
 */
export function decodeBase64ChunksToBytes(chunkRows) {
  const fullBase64 = (chunkRows || []).map(row => row.data || '').join('');
  if (!fullBase64) return new Uint8Array(0);
  const binaryString = atob(fullBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Sanitizes a filename for safe inclusion in Content-Disposition headers.
 *
 * @param {string|null|undefined} name
 * @param {string} fallback
 * @returns {string}
 */
export function sanitizeDownloadFilename(name, fallback = 'import-file') {
  const raw = typeof name === 'string' ? name.trim() : '';
  const cleaned = raw
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/[\r\n\t\x00-\x1f]/g, '')
    .slice(0, 180);
  return cleaned || fallback;
}
