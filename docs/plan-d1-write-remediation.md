# Cloudflare D1 Runaway Write Remediation Plan (`personal-budget-db`)

**Target Database**: `personal-budget-db` (`10f220d4-1c10-49e9-b63e-5d4cb08d599f`)  
**Incident Metrics**: 90.45k rows written / 100k daily free tier limit across 16.75k queries in 24 hours.  
**Stack Compliance**: Pure JavaScript (ESM/JSX, zero TypeScript), positional `?` SQLite parameter bindings, Cloudflare Workers + D1 + KV/DO.

---

## 1. Executive Summary & Root Cause Audit

A full-monorepo surgical trace of all `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `CREATE TABLE`, `ALTER TABLE`, and `DB.batch` operations revealed that the **90.45k rows written** and **16.75k queries** are driven by four compounding write amplifiers rather than a single runaway loop.

In Cloudflare D1 (SQLite), `rows_written` counts **every table row inserted, updated, or deleted PLUS every secondary index entry modified**.

### Primary Write Amplifiers Identified

| Rank | Component / File | Root Cause Mechanism | Write Impact |
| :--- | :--- | :--- | :--- |
| **1. CRITICAL** | [analytics.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js#L413-L726) (`ingestListingTraffic`) & [sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js#L458-L463) | `POST /api/ebay/sync-all` unconditionally invokes `ingestListingTraffic(env, payload.userId, null, null, 30)` on **every sync run** without checking `analytics_fetched_at` freshness. Inside `ingestListingTraffic`, it loops over all linked listings (and a 0-baseline loop for non-returned listings) and executes `INSERT OR REPLACE INTO listing_traffic` for all 30 days using a **newly generated primary key** (`'lt-' + crypto.randomUUID()`). In SQLite, `INSERT OR REPLACE` with a new `PRIMARY KEY` on conflict over `UNIQUE(ebay_listing_id, traffic_date)` deletes the existing row, inserts a new row, and rewrites **4 indexes** (`PRIMARY KEY`, `UNIQUE`, `idx_traffic_item_date`, `idx_traffic_ebay_date`, `idx_traffic_user`). It also runs `UPDATE auction_items SET analytics_fetched_at = ...` per item. | **~1,200 - 1,500 SQL statements** and **~4,800 - 7,500 D1 rows written** per single `sync-all` execution (for ~40-50 linked listings). Over 12-15 background syncs/day, this alone burns **60k - 85k row writes/day**. |
| **2. HIGH** | [analytics.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js#L765-L963) (`onRequestGet`) | Every `GET /api/ebay/analytics` request: (a) unconditionally runs `DELETE FROM auction_item_analytics WHERE item_id = ? AND user_id = ?` (line 766); (b) on cache hit (`rangeDays === 30`), unconditionally runs `UPDATE auction_items SET analytics_fetched_at = ?` (line 958); and (c) when a user views 60d/90d while eBay is at HTTP 429 quota and 30d rows already exist (`rows.length > 0`), the fallback `INSERT OR IGNORE` (line 835) is skipped (`if (rows.length > 0)` returns early at line 829), leaving `coversDateRange` (`30 >= 60`) permanently `false` and triggering `ingestListingTraffic` + `recordSyncRun` on every subsequent 60d/90d view. | Unnecessary `UPDATE` + `DELETE` + `outpost_sync_history` inserts on every Performance tab open or range toggle. |
| **3. HIGH** | [sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js#L117-L505) & [find-listings.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/find-listings.js#L59) | (a) Line 328: Loops over every active eBay listing and executes `UPDATE auction_items SET current_list_price = ?, status = ?, ... updated_at = datetime('now')` **unconditionally** even when zero fields changed. `auction_items` has 7 indexes, so each no-op `UPDATE` writes multiple index rows. (b) Line 117: Calls `setCachedEbayListings` (`INSERT OR REPLACE INTO ebay_listings_cache`) on every sync. (c) Line 500 & `find-listings.js` line 59: Unconditionally executes `UPDATE ebay_oauth_tokens SET last_refreshed_at = datetime('now')` even when the token was not refreshed. | **~40 - 60 unconditional `UPDATE` statements** (~250+ index/row writes) per sync run even when 0 prices or statuses changed. |
| **4. HIGH** | [syncLogger.js](file:///e:/TechTrekGT/outpost/functions/utils/syncLogger.js#L15-L44) (`ensureSyncHistoryTable`) | Called on **every** `GET /api/sync/settings`, `PUT /api/sync/settings`, `getEbayAnalyticsQuota`, and `recordSyncRun` with **no in-memory isolate flag**. Each call fires **6 sequential DDL queries**: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and **4 `ALTER TABLE outpost_sync_settings ADD COLUMN ...`** statements that throw duplicate-column errors on every single invocation. | **6 wasted D1 round-trips per call** (hundreds of queries/day across polling, settings loads, and analytics checks). |
| **5. MEDIUM** | [InventoryContext.jsx](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx#L291-L315) & [EditItemModal.jsx](file:///e:/TechTrekGT/outpost/src/components/EditItemModal.jsx#L303) | (a) `InventoryContext.jsx` runs `setInterval(handleSyncEbay, ms)` and `setInterval(handleSyncVScout, ms)` across every open browser tab without checking `document.visibilityState === 'visible'` or coordinating via `last_ebay_sync_at`. (b) `EditItemModal.jsx` calls `fetchActiveListings()` (`GET /api/ebay/active-listings`) on **every modal open**, even for already-linked or sold items. | Multiplies background sync frequency by the number of open browser tabs/devices. |
| **6. MEDIUM** | [vinescout/sync.js](file:///e:/TechTrekGT/vinescout/functions/api/vinescout/sync.js#L62-L120) & [webhook.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/webhook.js#L448-L464) | (a) `POST /api/vinescout/sync` executes 2 unconditional `ON CONFLICT DO UPDATE` statements per item (`vine_items` and `vine_asin_cache`, up to 500 items = 1,000 statements/batch) without `WHERE` change-detection guards. (b) `POST /api/ebay/webhook` generates a random `crypto.randomUUID()` for `ebay_webhook_events.id` without deduplicating on eBay's `notification.notificationId`, writing 2 statements (`INSERT` + `UPDATE processed = 1`) on every retry. | Up to **1,000+ row writes per VineScout batch sync** even when 0 items changed; duplicate writes on webhook retries. |

### Verification of Other Audited Subsystems (Confirmed Clean)
* **Auth & Integration Middleware**: [`requireAuth`](file:///e:/TechTrekGT/outpost/functions/utils/guard.js#L26-L71) and [`resolveIntegrationUserId`](file:///e:/TechTrekGT/outpost/functions/utils/apiIntegrations.js#L13-L61) execute read-only `SELECT` queries during normal operation.
* **Rate Limiting**: [`checkRateLimit`](file:///e:/TechTrekGT/outpost/functions/utils/rateLimit.js#L51-L97) uses `RATE_LIMIT_DO` and `RATE_LIMIT_KV` (zero D1 writes). *Minor fix identified*: [vinescout-sales.js](file:///e:/TechTrekGT/outpost/functions/api/export/vinescout-sales.js#L12) and [vinescout-inventory.js](file:///e:/TechTrekGT/outpost/functions/api/export/vinescout-inventory.js#L12) omit the 6th argument (`env?.RATE_LIMIT_DO`), falling back to KV `put` instead of the Durable Object.
* **OAuth Token Helper**: [`getEbayUserToken`](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js#L56-L154) only writes to `ebay_oauth_tokens` when `access_token` is within 5 minutes of expiry (~every 2 hours).

---

## 2. Phased Remediation Strategy

### Phase 1: Eliminate Analytics Traffic Write Amplification
**Files**:
* [outpost/functions/api/ebay/analytics.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js)
* [outpost/functions/api/ebay/sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js)

**Changes**:
1. **Gate Store-Wide Traffic Ingestion in `sync-all.js` ([sync-all.js:458-463](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js#L458-L463))**:
   * Before calling `ingestListingTraffic(env, payload.userId, null, null, 30)`, query D1 for the most recent successful analytics ingestion timestamp (or check `MIN(analytics_fetched_at)` across active linked items / `outpost_sync_history` where `provider = 'ebay_analytics' AND status = 'success'`).
   * Only run store-wide `ingestListingTraffic` inside `sync-all` if the last successful store-wide analytics ingestion was more than `ANALYTICS_CACHE_TTL_HOURS` (12 hours) ago (unless `?force_analytics=1` is explicitly passed).
   * Filter the item candidate query in `ingestListingTraffic` ([analytics.js:433](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js#L433)) so bulk store-wide runs (`!targetListingId`) only query active/listed items (`status NOT IN ('Sold', 'Returned / Refunded')`) or items that have not had analytics fetched within the TTL window.
2. **Replace Destructive `INSERT OR REPLACE` with Differential Upsert in `ingestListingTraffic` ([analytics.js:638-708](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js#L638-L708))**:
   * Pre-fetch existing rows from `listing_traffic` for the target `user_id` and date range `[startYMD..endYMD]` into an in-memory `Map` keyed by `${ebay_listing_id}:${traffic_date}`.
   * For each day in `[startYMD..endYMD]`:
     * If an existing row in the `Map` already has the exact same metrics (`impressions_total`, `impressions_search`, `page_views_total`, `click_through_rate`, `sales_conversion_rate`, `transactions_count`), **skip the statement completely** (zero D1 query, zero rows written).
     * For new or changed rows, use a deterministic ID (`lt-${recListingId}-${ymd}`) and `INSERT INTO listing_traffic (...) VALUES (...) ON CONFLICT(ebay_listing_id, traffic_date) DO UPDATE SET ... WHERE listing_traffic.impressions_total != excluded.impressions_total OR listing_traffic.page_views_total != excluded.page_views_total OR listing_traffic.transactions_count != excluded.transactions_count`.
   * For the 0-baseline loop (listings omitted by eBay, lines 685-708): only insert a 0-metric row if no row exists in the pre-fetched `Map` for that `(ebay_listing_id, ymd)` pair, using `INSERT OR IGNORE INTO listing_traffic`.
3. **Remove Unconditional Writes on `GET /api/ebay/analytics` ([analytics.js:765-963](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js#L765-L963))**:
   * Remove the unconditional `DELETE FROM auction_item_analytics WHERE item_id = ? AND user_id = ?` on every GET request (line 766). Legacy table cleanup is already handled or no longer needed on every read.
   * Remove the unconditional `UPDATE auction_items SET analytics_fetched_at = ?` at line 958 when serving cached data (`ingestListingTraffic` already updates `analytics_fetched_at` when fresh data is actually fetched).
   * Fix the 429 partial-range fallback (lines 829-858): when `ingestRes.status === 429` and `rows.length < rangeDays` (e.g., user has 30 days cached and clicks 60d or 90d while eBay is rate-limited), backfill the missing days in `[startYMD..endYMD]` with `INSERT OR IGNORE` (or synthesize the zero-padded dates in memory for the response without writing fake rows to D1) so subsequent 60d/90d views do not repeatedly re-trigger `ingestListingTraffic` and `recordSyncRun`.

---

### Phase 2: Isolate DDL Guards & Dirty-Checking in Sync Loops
**Files**:
* [outpost/functions/utils/syncLogger.js](file:///e:/TechTrekGT/outpost/functions/utils/syncLogger.js)
* [outpost/functions/api/ebay/sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js)
* [outpost/functions/api/ebay/find-listings.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/find-listings.js)
* [outpost/functions/api/ebay/listingsCache.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/listingsCache.js)

**Changes**:
1. **In-Memory Isolate Guard for `ensureSyncHistoryTable` ([syncLogger.js:15-44](file:///e:/TechTrekGT/outpost/functions/utils/syncLogger.js#L15-L44))**:
   * Add a module-scoped `let syncHistoryTableReady = false;` flag in `syncLogger.js`.
   * Return immediately if `syncHistoryTableReady === true`.
   * Remove the 4 `ALTER TABLE outpost_sync_settings ADD COLUMN ...` statements from the runtime hot path (those columns are already defined in [auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql#L194-L209)), leaving only the `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` executed at most once per Worker isolate lifecycle.
   * Add a pruning guard in `recordSyncRun` ([syncLogger.js:76-97](file:///e:/TechTrekGT/outpost/functions/utils/syncLogger.js#L76-L97)) or keep `outpost_sync_history` bounded so it does not grow indefinitely.
2. **Dirty-Checking Before `UPDATE auction_items` in `sync-all.js` ([sync-all.js:141-348](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js#L141-L348))**:
   * Expand the initial `SELECT` on `auction_items` (line 141) to include `platform_fee_pct, platform_flat_fee, promoted_rate_pct, est_shipping_cost, min_sell_price, suggested_list_price`.
   * Before executing the active-listing `UPDATE auction_items` at line 328, compare the computed values (`newPrice`, `newStatus`, `ebayId`, `skuToSave`, `platformFeePct`, `platformFlatFee`, `promotedRate`, `estShippingCost`, `pricing.min_sell_price`, `pricing.suggested_list_price`, and serialized `attrs`) against the existing item record in memory.
   * **Skip the `UPDATE` query entirely** if no column value has changed.
3. **Remove Redundant `ebay_oauth_tokens` Touch ([sync-all.js:500](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js#L500) & [find-listings.js:59](file:///e:/TechTrekGT/outpost/functions/api/ebay/find-listings.js#L59))**:
   * Delete the redundant `UPDATE ebay_oauth_tokens SET last_refreshed_at = datetime('now') WHERE user_id = ?` at the end of `sync-all.js` and `find-listings.js`. `tokenHelper.js` already updates `last_refreshed_at` whenever an actual OAuth token refresh occurs.
4. **Deduplicate `setCachedEbayListings` Writes ([listingsCache.js:23-39](file:///e:/TechTrekGT/outpost/functions/api/ebay/listingsCache.js#L23-L39))**:
   * In `setCachedEbayListings(db, userId, listings)`, use `INSERT INTO ebay_listings_cache (user_id, listings_json, fetched_at, item_count) VALUES (?, ?, datetime('now'), ?) ON CONFLICT(user_id) DO UPDATE SET listings_json = excluded.listings_json, fetched_at = excluded.fetched_at, item_count = excluded.item_count` instead of `INSERT OR REPLACE`, and optionally skip or offload to `RATE_LIMIT_KV` when available.

---

### Phase 3: Server-Side Sync Cooldown & Webhook Deduplication
**Files**:
* [outpost/functions/api/ebay/sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js)
* [outpost/functions/api/ebay/webhook.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/webhook.js)
* [vinescout/functions/api/vinescout/sync.js](file:///e:/TechTrekGT/vinescout/functions/api/vinescout/sync.js)
* [outpost/functions/api/export/vinescout-sales.js](file:///e:/TechTrekGT/outpost/functions/api/export/vinescout-sales.js)
* [outpost/functions/api/export/vinescout-inventory.js](file:///e:/TechTrekGT/outpost/functions/api/export/vinescout-inventory.js)

**Changes**:
1. **Server-Side Cooldown Guard in `POST /api/ebay/sync-all` ([sync-all.js:28-50](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js#L28-L50))**:
   * When triggered by background auto-polling (e.g., body/query does not contain `manual: true` or `force: true`), check `outpost_sync_settings.last_ebay_sync_at` for `payload.userId`.
   * If `last_ebay_sync_at` is within the last **3 minutes** (e.g., another open browser tab just completed a sync), return `{ success: true, skipped: true, reason: 'cooldown' }` immediately with **0 D1 writes** and **0 eBay API calls**.
2. **Idempotent Webhook Deduplication in `POST /api/ebay/webhook` ([webhook.js:435-465](file:///e:/TechTrekGT/outpost/functions/api/ebay/webhook.js#L435-L465))**:
   * Extract a deterministic notification ID from the payload (`payload?.notification?.notificationId || payload?.metadata?.notificationId`) or derive a deterministic key from `eventType + ':' + (ebayItemId || '') + ':' + (ebayOrderId || '') + ':' + (payload?.notification?.eventDate || '')`.
   * Check if `ebay_webhook_events` already has a row with `id = deterministicId` (or use `INSERT OR IGNORE INTO ebay_webhook_events`). If the event was already processed (`changes === 0`), return `200 OK` `{ received: true, duplicate: true }` immediately without re-running `dispatchWebhookEvent` or updating `auction_items`.
3. **Differential Upsert Guard in `POST /api/vinescout/sync` ([vinescout/sync.js:62-120](file:///e:/TechTrekGT/vinescout/functions/api/vinescout/sync.js#L62-L120))**:
   * Add a `WHERE` clause to the `ON CONFLICT(user_id, asin) DO UPDATE` on `vine_items` and `ON CONFLICT(asin) DO UPDATE` on `vine_asin_cache` so SQLite only performs a row/index write when at least one field (`title`, `etv`, `order_date`, `status`, `category`, `image_url`, etc.) actually differs from the stored value (`WHERE vine_items.title IS NOT excluded.title OR vine_items.etv IS NOT excluded.etv OR vine_items.status IS NOT excluded.status ...`).
4. **Pass `RATE_LIMIT_DO` to Export Endpoints ([vinescout-sales.js:12](file:///e:/TechTrekGT/outpost/functions/api/export/vinescout-sales.js#L12) & [vinescout-inventory.js:12](file:///e:/TechTrekGT/outpost/functions/api/export/vinescout-inventory.js#L12))**:
   * Pass `env?.RATE_LIMIT_DO` as the 6th parameter to `checkRateLimit(...)` so rate-limit state is handled in-memory by the Durable Object rather than writing to KV on every call.

---

### Phase 4: Client-Side Polling Visibility & Lazy Fetching Guards
**Files**:
* [outpost/src/context/InventoryContext.jsx](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx)
* [outpost/src/components/EditItemModal.jsx](file:///e:/TechTrekGT/outpost/src/components/EditItemModal.jsx)

**Changes**:
1. **Tab Visibility & Timestamp Check in `InventoryContext.jsx` ([InventoryContext.jsx:171-315](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx#L171-L315))**:
   * Distinguish between manual user-initiated sync (`handleSyncEbay({ manual: true })`) and interval-driven auto-sync (`handleSyncEbay({ manual: false })`).
   * Inside the `setInterval` callback (line 299 and line 311), skip firing `handleSyncEbay` / `handleSyncVScout` when `document.visibilityState === 'hidden'`.
   * Pass `{ manual: false }` in the `POST /api/ebay/sync-all` request body during interval auto-syncs so the backend 3-minute multi-tab cooldown guard (Phase 3.1) can deduplicate concurrent tabs while still allowing manual "Sync eBay" button clicks (`{ manual: true }`) to execute immediately.
2. **Conditional `fetchActiveListings` in `EditItemModal.jsx` ([EditItemModal.jsx:301-304](file:///e:/TechTrekGT/outpost/src/components/EditItemModal.jsx#L301-L304))**:
   * Only auto-fetch `fetchActiveListings()` on modal mount if the item is not `'Sold'` and not `'Returned / Refunded'`, avoiding unnecessary `/api/ebay/active-listings` calls when viewing historical sold items.

---

## 3. Expected Impact & Verification Plan

| Metric | Before Remediation | After Remediation |
| :--- | :--- | :--- |
| **Rows written per routine 30-min `sync-all` (no item changes)** | ~4,800 - 7,500 rows | **2 - 4 rows** (`outpost_sync_settings` + `outpost_sync_history` only) |
| **Rows written per `ingestListingTraffic` (once every 12h)** | ~4,800 - 7,500 rows (rewrites all 30 days) | **~40 - 150 rows** (only writes today/yesterday where views/impressions changed) |
| **DDL queries per `/api/sync/settings` or quota check** | 6 queries (4 failing `ALTER TABLE`s) | **0 queries** after initial isolate warm-up |
| **Rows written on cached `GET /api/ebay/analytics`** | 2+ rows (`DELETE` + `UPDATE`) | **0 rows** |
| **Rows written per unchanged 250-item VineScout sync** | ~500 - 1,500 rows | **0 rows** (filtered by `ON CONFLICT ... WHERE` diff check) |
| **Projected Daily D1 Rows Written** | 90,450+ / day (90.5% of free tier) | **< 1,500 / day (< 1.5% of free tier)** |

### Post-Approval Execution Steps
1. Apply surgical deltas across the target files in `outpost/` and `vinescout/`.
2. Run unit and integration test suites to verify zero regressions in sync, analytics, and webhook flows.
3. Update local and root documentation (`outpost/docs/03_features.md`, `outpost/docs/04_state.md`, `docs/03_features.md`, `docs/04_state.md`).
4. Build and deploy `outpost` (`npm run build` && `npm run deploy`) and `vinescout` (`npm run build` && `npm run deploy`) to Cloudflare Workers.

