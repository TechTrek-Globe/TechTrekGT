import { requireAuth, withAuth, err } from '../../../../utils/guard.js';
import {
  ensureImportBatchTables,
  decodeBase64ChunksToBytes,
  sanitizeDownloadFilename
} from '../../../../utils/importBatches.js';

const MIME_MAP = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv'
};

/**
 * GET /api/import/batches/:id/file
 * Reassembles chunked raw file bytes from D1 and streams the original PDF/XLS/CSV
 * with owner verification and safe Content-Disposition headers.
 */
export async function onRequestGet(context) {
  const { request, env, params } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const batchId = params?.id || parts[parts.length - 2] || '';
    if (!batchId || batchId === 'batches') {
      return err('Batch ID is required', 400);
    }

    const forceDownload = url.searchParams.get('download') === '1' || url.searchParams.get('download') === 'true';

    const fetchBatchAndChunks = async () => {
      const batch = await env.DB.prepare(`
        SELECT id, source_type, file_name, mime_type, has_file_blob
        FROM import_batches
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `).bind(batchId, userId).first();

      if (!batch) return { notFound: true };
      if (Number(batch.has_file_blob) !== 1) return { batch, noBlob: true };

      const chunksRes = await env.DB.prepare(`
        SELECT chunk_index, data
        FROM import_batch_file_chunks
        WHERE batch_id = ?
        ORDER BY chunk_index ASC
      `).bind(batchId).all();

      return { batch, chunks: chunksRes?.results || [] };
    };

    let payload;
    try {
      payload = await fetchBatchAndChunks();
    } catch (queryErr) {
      if (String(queryErr?.message || '').includes('no such table')) {
        await ensureImportBatchTables(env.DB);
        payload = await fetchBatchAndChunks();
      } else {
        throw queryErr;
      }
    }

    if (payload.notFound) {
      return err('Import batch not found', 404);
    }
    if (payload.noBlob || !payload.chunks || payload.chunks.length === 0) {
      return err('Archived file content is not available for this import batch', 404);
    }

    const bytes = decodeBase64ChunksToBytes(payload.chunks);
    const sourceType = payload.batch.source_type || 'pdf';
    const contentType = MIME_MAP[sourceType] || payload.batch.mime_type || 'application/octet-stream';
    const ext = ['pdf', 'xlsx', 'xls', 'csv'].includes(sourceType) ? sourceType : 'bin';
    const fileName = sanitizeDownloadFilename(payload.batch.file_name, `import-${batchId}.${ext}`);
    const disposition = (sourceType === 'pdf' && !forceDownload) ? 'inline' : 'attachment';

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `${disposition}; filename="${fileName}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store'
      }
    });
  });
}
