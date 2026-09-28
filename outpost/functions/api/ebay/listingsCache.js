/**
 * Centralized active eBay listings cache manager (MED-15).
 * Caches multi-call active listings results in D1 to prevent expensive
 * re-fetches (Trading API + REST Inventory API + per-SKU offers).
 */

export const LISTINGS_CACHE_TTL_MINUTES = 15;

/**
 * Ensures the cache table exists in the database.
 * Retained for manual setup / testing; no longer invoked on the hot path (LOW-2).
 *
 * @param {object} db - Cloudflare D1 database binding
 */
export async function ensureEbayListingsCacheTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ebay_listings_cache (
        user_id       TEXT PRIMARY KEY,
        listings_json TEXT NOT NULL,
        fetched_at    TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();
  } catch (_) {}
}

/**
 * Retrieves cached active eBay listings for a user if within TTL.
 *
 * @param {object} db - Cloudflare D1 database binding
 * @param {string} userId - User identifier
 * @param {number} [ttlMinutes=15] - Cache validity window in minutes
 * @returns {Promise<{ listings: Array, fetched_at: string } | null>}
 */
export async function getCachedEbayListings(db, userId, ttlMinutes = LISTINGS_CACHE_TTL_MINUTES) {
  if (!db || !userId) return null;
  try {
    const row = await db.prepare(`
      SELECT listings_json, fetched_at
      FROM ebay_listings_cache
      WHERE user_id = ?
    `).bind(userId).first();

    if (!row || !row.fetched_at || !row.listings_json) return null;

    const rawTime = String(row.fetched_at).trim();
    const isoStr = rawTime.endsWith('Z') ? rawTime : (rawTime.replace(' ', 'T') + 'Z');
    const fetchedMs = new Date(isoStr).getTime();
    if (isNaN(fetchedMs)) return null;

    const nowMs = Date.now();
    const ttlMs = ttlMinutes * 60 * 1000;

    if (nowMs - fetchedMs < ttlMs) {
      const listings = JSON.parse(row.listings_json);
      if (Array.isArray(listings)) {
        return {
          listings,
          fetched_at: row.fetched_at
        };
      }
    }
  } catch (err) {
    console.warn('[listingsCache] Error reading from ebay_listings_cache:', err);
  }
  return null;
}

/**
 * Stores active eBay listings for a user in the cache table.
 *
 * @param {object} db - Cloudflare D1 database binding
 * @param {string} userId - User identifier
 * @param {Array} listings - Active eBay listings array
 * @returns {Promise<void>}
 */
export async function setCachedEbayListings(db, userId, listings) {
  if (!db || !userId || !Array.isArray(listings)) return;
  try {
    const json = JSON.stringify(listings);
    const nowIso = new Date().toISOString();

    await db.prepare(`
      INSERT INTO ebay_listings_cache (user_id, listings_json, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        listings_json = excluded.listings_json,
        fetched_at = excluded.fetched_at
    `).bind(userId, json, nowIso).run();
  } catch (err) {
    console.warn('[listingsCache] Error writing to ebay_listings_cache:', err);
  }
}

/**
 * Invalidates the cached active eBay listings for a user.
 *
 * @param {object} db - Cloudflare D1 database binding
 * @param {string} userId - User identifier
 * @returns {Promise<void>}
 */
export async function invalidateEbayListingsCache(db, userId) {
  if (!db || !userId) return;
  try {
    await db.prepare(`
      DELETE FROM ebay_listings_cache WHERE user_id = ?
    `).bind(userId).run();
  } catch (err) {
    console.warn('[listingsCache] Error invalidating ebay_listings_cache:', err);
  }
}
