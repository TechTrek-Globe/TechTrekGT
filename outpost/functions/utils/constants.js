/**
 * constants.js - SINGLE SOURCE OF TRUTH for every tunable default in Outpost.
 *
 * WHY THIS FILE LIVES HERE (and not in src/):
 *   Cloudflare Workers (`functions/**`) cannot import from `src/**`, but the
 *   Vite client bundle happily imports from `functions/utils/**`. So a module
 *   under functions/utils is the only location BOTH sides can resolve. This is
 *   therefore a real single source, not a generated copy: there is no build
 *   step, no sync script, and no second file to drift.
 *
 * RULES FOR THIS FILE:
 *   - Pure ESM. No `env`, no `cloudflare:*`, no Node built-ins, no DOM.
 *   - Every value carries the rationale for its number.
 *   - Never inline one of these numbers anywhere else in the codebase.
 */

// ---------------------------------------------------------------------------
// PLATFORM FEES
// ---------------------------------------------------------------------------

/**
 * Default marketplace take rate as a FRACTION (0.136 = 13.6%).
 * Rationale: eBay's most common sports/memorabilia final value fee band sits in
 * the 13.5-13.6% range and $0.40/order. 13.6% is the rate the platform seed
 * (DEFAULT_PLATFORMS) and the majority of write paths already assumed; the
 * 13.25% and 13.5% variants were drift, not business decisions.
 * Category-specific rates live in utils/ebayFeeSchedule.js, NOT here.
 */
export const DEFAULT_PLATFORM_FEE_PCT = 0.136;

/**
 * Default per-order flat fee in dollars ($0.40).
 * Rationale: eBay charges $0.30 below $10 and $0.40 at or above; $0.40 is the
 * dominant case for this inventory and matches the seeded platform row.
 */
export const DEFAULT_PLATFORM_FLAT_FEE = 0.40;

/**
 * Default outbound shipping estimate in dollars ($6.50).
 * Rationale: USPS Ground Advantage / eBay standard label rate for a 1-2 lb
 * parcel with tracking, rounded up to cover the common padded-mailer case.
 */
export const DEFAULT_EST_SHIPPING_COST = 6.50;

// ---------------------------------------------------------------------------
// MARGIN
// ---------------------------------------------------------------------------

/**
 * Default target margin as a FRACTION (0.15 = 15% markup over break-even).
 * Rationale: thin but real margin for a clearance-oriented resale business.
 * This single value replaces the previous 0.15 / 0.20 / '30%' split.
 */
export const DEFAULT_TARGET_MARGIN_PCT = 0.15;

// ---------------------------------------------------------------------------
// MATCHING / ENRICHMENT
// ---------------------------------------------------------------------------

/**
 * Minimum combined score for a listing-to-item match to be surfaced at all.
 * Rationale: below this, fuzzy title similarity produces noise, not candidates.
 */
export const FUZZY_MATCH_THRESHOLD = 0.35;

/**
 * Score at or above which a match is flagged high-confidence (auto-accepted
 * in bulk flows). Rationale: ~0.8 combined title/athlete/SKU overlap is the
 * point where a wrong match costs more than a missed match.
 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.80;

/**
 * Maximum number of per-listing enrichment (GetItem) calls in a single sync.
 * Rationale: each call is one eBay API request; 30 keeps a full inventory sync
 * inside the caller's latency budget without tripping daily call limits.
 */
export const MAX_SINGLE_ENRICH = 30;

// ---------------------------------------------------------------------------
// BATCHING / RATE LIMITS
// ---------------------------------------------------------------------------

/**
 * Statements per D1 `batch()` / per chunked write loop.
 * Rationale: D1 caps bound parameters and statement size per request; 50 rows
 * of ~30 columns stays comfortably under both limits.
 */
export const CHUNK_SIZE = 50;

/**
 * Maximum simultaneous outbound eBay/comps requests per refresh.
 * Rationale: 3 concurrent calls with a 300ms stagger stays under eBay's
 * app-level burst guidance while still refreshing a full inventory quickly.
 */
export const CONCURRENCY_LIMIT = 3;

/**
 * Fixed stagger between outbound calls when draining the concurrency pool.
 * Rationale: spreads CONCURRENCY_LIMIT calls per window instead of bursting.
 */
export const REQUEST_STAGGER_MS = 300;

// ---------------------------------------------------------------------------
// CACHE TTLs
// ---------------------------------------------------------------------------

/**
 * Active-listing cache lifetime in minutes.
 * Rationale: eBay listing state changes on the order of minutes; 15 min keeps
 * the grid responsive without showing stale "Listed" rows.
 */
export const LISTINGS_CACHE_TTL_MINUTES = 15;

/**
 * Analytics (impressions/clicks/conversion) cache lifetime in hours.
 * Rationale: eBay reporting data settles slowly; refreshing more often than
 * this returns the same numbers at 2x the API cost.
 */
export const ANALYTICS_CACHE_TTL_HOURS = 12;

// ---------------------------------------------------------------------------
// ITEM STATUS ENUM (T-11 items 4-5: single source of truth)
// ---------------------------------------------------------------------------

/**
 * The complete, permitted set of auction_items.status values.
 *
 * DECISION ON 'delist_pending' (T-11 item 4): it is INCLUDED rather than
 * renamed. Two facts force this: the eBay gateway webhook writes the literal
 * string 'delist_pending' straight into D1, and InventoryHubView filters on it
 * to render DelistPendingAlert. Renaming it would require changing the
 * gateway, the alert filter, and every historical row. It is the one
 * snake_case member of the enum and is documented as such here.
 *
 * Casing: every other member is Title Case. normalizeItemStatus accepts any
 * casing and returns the canonical form, so a client sending 'sold' or 'SOLD'
 * writes 'Sold' rather than creating a value no filter matches.
 */
export const ITEM_STATUSES = Object.freeze([
  'Available',
  'Listed',
  'Sold',
  'Unsold',
  'Kept for Self',
  'Returned',
  'Draft',
  'delist_pending'
]);

/**
 * Normalizes a client-supplied status to its canonical enum member.
 *
 * @param {any} value
 * @returns {string|null} canonical status, or null when not permitted
 */
export function normalizeItemStatus(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  // Collapse internal whitespace so 'Kept for  Self' resolves too.
  const collapsed = raw.replace(/\s+/g, ' ');
  return ITEM_STATUSES.find(s => s.toLowerCase() === collapsed) || null;
}

/**
 * Builds the 400 response body used when a status is rejected, naming the
 * permitted set so the caller does not have to guess.
 *
 * @param {any} value
 * @returns {{ error: string, permitted_statuses: string[] }}
 */
export function invalidStatusError(value) {
  return {
    error: `Invalid status "${value}". Permitted values: ${ITEM_STATUSES.join(', ')}.`,
    permitted_statuses: [...ITEM_STATUSES]
  };
}

// ---------------------------------------------------------------------------
// DEPLOYMENT HOSTS (T-10 item 9: no hardcoded hostnames)
// ---------------------------------------------------------------------------

/**
 * Fallback gateway origin. Overridden per environment by GATEWAY_BASE_URL;
 * a staging deployment MUST set that variable or it will call production.
 */
export const FALLBACK_GATEWAY_ORIGIN = 'https://techtrekgt.com';

/**
 * Local wrangler dev origin, used only when the request host is localhost.
 */
export const LOCAL_DEV_ORIGIN = 'http://localhost:8787';