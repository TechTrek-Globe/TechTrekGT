/**
 * Centralized active eBay listings cache manager (MED-15).
 * Caches multi-call active listings results in D1 to prevent expensive
 * re-fetches (Trading API + REST Inventory API + per-SKU offers).
 */

import { LISTINGS_CACHE_TTL_MINUTES } from '../../utils/constants.js';

// T-10 item 2: one cache TTL definition. Re-exported here so existing importers
// of this module keep working.
export { LISTINGS_CACHE_TTL_MINUTES };

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
 * Checks normalized ebay_active_listings table first, with fallback to ebay_listings_cache.
 *
 * @param {object} db - Cloudflare D1 database binding
 * @param {string} userId - User identifier
 * @param {number} [ttlMinutes=15] - Cache validity window in minutes
 * @returns {Promise<{ listings: Array, fetched_at: string } | null>}
 */
export async function getCachedEbayListings(db, userId, ttlMinutes = LISTINGS_CACHE_TTL_MINUTES) {
  if (!db || !userId) return null;
  const ttlMs = ttlMinutes * 60 * 1000;
  const nowMs = Date.now();

  try {
    // 1. Check cache validity and TTL from ebay_listings_cache
    const cacheRow = await db.prepare(`
      SELECT listings_json, fetched_at
      FROM ebay_listings_cache
      WHERE user_id = ?
    `).bind(userId).first();

    if (!cacheRow || !cacheRow.fetched_at) return null;

    const rawTime = String(cacheRow.fetched_at).trim();
    const isoStr = rawTime.endsWith('Z') ? rawTime : (rawTime.replace(' ', 'T') + 'Z');
    const fetchedMs = new Date(isoStr).getTime();
    if (isNaN(fetchedMs)) return null;

    if (nowMs - fetchedMs >= ttlMs) {
      return null; // Expired
    }

    // 2. Cache is valid: try reading from normalized ebay_active_listings table first
    try {
      const rows = await db.prepare(`
        SELECT *
        FROM ebay_active_listings
        WHERE user_id = ?
        ORDER BY synced_at DESC
      `).bind(userId).all();

      const results = rows?.results || [];
      if (results.length > 0) {
        return {
          listings: results.map(r => ({
            listing_id: r.ebay_listing_id,
            sku: r.sku,
            title: r.title,
            price: r.price,
            quantity: r.quantity,
            quantity_sold: r.quantity_sold,
            buyer_shipping_cost: r.buyer_shipping_cost,
            is_free_shipping: Boolean(r.is_free_shipping),
            condition: r.condition,
            status: r.status,
            image_url: r.image_url,
            listing_url: r.listing_url
          })),
          fetched_at: cacheRow.fetched_at
        };
      }
    } catch (_) {}

    // 3. Fallback to legacy listings_json if normalized table returned no rows
    if (cacheRow.listings_json) {
      const listings = JSON.parse(cacheRow.listings_json);
      if (Array.isArray(listings)) {
        return {
          listings,
          fetched_at: cacheRow.fetched_at
        };
      }
    }
  } catch (err) {
    console.warn('[listingsCache] Error reading cache:', err);
  }
  return null;
}

/**
 * Stores active eBay listings for a user in the normalized table and cache table.
 *
 * @param {object} db - Cloudflare D1 database binding
 * @param {string} userId - User identifier
 * @param {Array} listings - Active eBay listings array
 * @returns {Promise<void>}
 */
export async function setCachedEbayListings(db, userId, listings) {
  if (!db || !userId || !Array.isArray(listings)) return;
  const nowIso = new Date().toISOString();

  // 1. Dual-write to normalized ebay_active_listings table
  try {
    const stmts = [];
    for (const l of listings) {
      const listingId = String(l.listing_id || l.ebay_listing_id || '').trim();
      if (!listingId) continue;
      stmts.push(db.prepare(`
        INSERT INTO ebay_active_listings (
          ebay_listing_id, user_id, sku, title, price, quantity, quantity_sold,
          buyer_shipping_cost, is_free_shipping, condition, status, image_url,
          listing_url, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ebay_listing_id) DO UPDATE SET
          user_id = excluded.user_id,
          sku = excluded.sku,
          title = excluded.title,
          price = excluded.price,
          quantity = excluded.quantity,
          quantity_sold = excluded.quantity_sold,
          buyer_shipping_cost = excluded.buyer_shipping_cost,
          is_free_shipping = excluded.is_free_shipping,
          condition = excluded.condition,
          status = excluded.status,
          image_url = excluded.image_url,
          listing_url = excluded.listing_url,
          synced_at = excluded.synced_at
      `).bind(
        listingId,
        userId,
        l.sku || null,
        l.title || '',
        Number(l.price || 0),
        Number(l.quantity || 1),
        Number(l.quantity_sold || 0),
        Number(l.buyer_shipping_cost || 0),
        l.is_free_shipping ? 1 : 0,
        l.condition || null,
        l.status || 'Active',
        l.image_url || null,
        l.listing_url || null,
        nowIso
      ));
    }

    const activeIds = listings.map(l => String(l.listing_id || l.ebay_listing_id || '').trim()).filter(Boolean);
    if (activeIds.length > 0) {
      const placeholders = activeIds.map(() => '?').join(',');
      const pruneSql = 'DELETE FROM ebay_active_listings WHERE user_id = ? AND ebay_listing_id NOT IN (' + placeholders + ')';
      stmts.push(db.prepare(pruneSql).bind(userId, ...activeIds));
    }

    if (stmts.length > 0) {
      if (typeof db.batch === 'function') {
        await db.batch(stmts);
      } else {
        for (const s of stmts) {
          await s.run();
        }
      }
    }
  } catch (err) {
    console.warn('[listingsCache] Normalized write attempt info:', err.message);
  }

  // 2. Dual-write to ebay_listings_cache for backward compatibility
  try {
    const json = JSON.stringify(listings);
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
 * Invalidates the cached active eBay listings for a user across both tables.
 *
 * @param {object} db - Cloudflare D1 database binding
 * @param {string} userId - User identifier
 * @returns {Promise<void>}
 */
export async function invalidateEbayListingsCache(db, userId) {
  if (!db || !userId) return;
  try {
    await db.prepare('DELETE FROM ebay_active_listings WHERE user_id = ?').bind(userId).run();
  } catch (_) {}
  try {
    await db.prepare('DELETE FROM ebay_listings_cache WHERE user_id = ?').bind(userId).run();
  } catch (err) {
    console.warn('[listingsCache] Error invalidating ebay_listings_cache:', err);
  }
}
