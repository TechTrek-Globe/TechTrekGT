import { onRequestPost as handleAmazonImport } from '../import/amazon.js';

/**
 * POST /api/sync/item
 * Direct alias for Outpost outgoing sync endpoint from VScout extension.
 */
export async function onRequestPost(context) {
  return handleAmazonImport(context);
}
