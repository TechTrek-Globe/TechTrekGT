/**
 * functions/utils/d1Batch.js - Chunked D1 statement batch executor.
 *
 * Executes an array of D1 prepared statements in chunks to stay well within
 * Cloudflare D1 batch limits (default 80 statements per chunk).
 *
 * @param {object} db - Cloudflare D1 database binding
 * @param {Array<object>} statements - Array of prepared statements
 * @param {number} [chunkSize=80] - Maximum statements per batch
 * @returns {Promise<Array<any>>} - Aggregated results
 */
export async function chunkedBatch(db, statements, chunkSize = 80) {
  if (!db || !Array.isArray(statements) || statements.length === 0) {
    return [];
  }

  if (typeof db.batch !== 'function') {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  const results = [];
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    const chunkResults = await db.batch(chunk);
    if (Array.isArray(chunkResults)) {
      results.push(...chunkResults);
    }
  }
  return results;
}

