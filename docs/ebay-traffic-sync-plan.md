# Implementation Plan: Outpost eBay Performance & Traffic Synchronization Rework

## 1. Problem Statement & Root Cause Diagnosis

In Outpost Tracker under "Performance & Traffic" for eBay listing #336705067081 (SKU OP-260701-9EUB), three distinct data synchronization and display anomalies occur:

### 1.1 Zero Page Views, CTR, and Conversion Rate (Issue 1)
- **Symptom:** Total Impressions reports 106, but Listing Page Views flatlines at 0, Click-Through Rate (CTR) flatlines at 0.00%, and Sales Conversion Rate flatlines at 0.00%.
- **Root Cause:**
  1. The response parsers in `outpost/functions/api/ebay/analytics.js` (`getVal`, `parseEbayDailyTraffic`, `parseEbayRangeTotals`, `ingestListingTraffic`) strictly and exclusively match the literal string key `'LISTING_VIEWS_TOTAL'` in `metricKeyMap`.
  2. If eBay's REST response returns alternate or granular view keys (such as `TOTAL_LISTING_VIEWS`, `LISTING_PAGE_VIEW_TOTAL`, `TOTAL_PAGE_VIEWS`, `LISTING_VIEWS`, `PAGE_VIEWS`, or granular sources `LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE`, `LISTING_VIEWS_SOURCE_DIRECT`, `LISTING_VIEWS_SOURCE_STORE`, `LISTING_VIEWS_SOURCE_OTHER_EBAY`, `LISTING_VIEWS_SOURCE_OFF_EBAY`), the parser yields `undefined` and defaults to `0`.
  3. The parser assumes `metricValues[idx]` is always an object with property `.value`. If eBay or a proxy returns a primitive number, `metricValues[idx].value` resolves to `undefined`, and `parseFloat(undefined)` produces `NaN`, defaulting to `0`.
  4. Header metric key lookups are case-sensitive and fail on lowercase or whitespace variants.
  5. Because page views evaluate to 0, mathematical fallbacks for CTR (`(views / impressions) * 100`) and Conversion Rate (`(orders / views) * 100`) produce 0.00%.

### 1.2 Identical 106 Impressions & 60-Day Date Hole between 30d and 90d (Issue 2)
- **Symptom:** Toggling between "30 Days" and "90 Days" leaves Total Impressions identical at 106 (0 Ad, 106 Org). Selecting "90 Days" triggers a "Partial Traffic Data" warning claiming eBay reported no activity for 60 dates (2026-07-26 through 2026-09-23).
- **Root Cause:**
  1. In `outpost/functions/api/ebay/analytics.js` (`onRequestGet`), the database cache check for freshness is:
     ```javascript
     if (forceRefresh || rows.length === 0) {
       needsIngestion = true;
     } else {
       if (Date.now() - newestFetchedAt > analyticsCacheTtlMs) {
         needsIngestion = true;
       }
     }
     ```
  2. When the user opens the modal for the default 30-day view, D1 is populated with 30 daily records (e.g., 2026-09-24 through 2026-10-23).
  3. When the user toggles to "90 Days", `startYMD` becomes 20260726 (T-90). The query `SELECT * FROM listing_traffic WHERE traffic_date >= startYMD AND traffic_date <= endYMD` returns the existing 30 rows because `20260924 >= 20260726`.
  4. Consequently, `rows.length` is 30, so `rows.length === 0` is false! `forceRefresh` is false. `newestFetchedAt` is only minutes old.
  5. `needsIngestion` evaluates to `false`. The worker NEVER fetches from eBay for the 90-day window!
  6. The worker then compares the 30 cached rows against the 90 `expectedDates`. The 60 older dates (2026-07-26 through 2026-09-23) are missing from `rowsByDate`, so all 60 are flagged as `missing_dates`.
  7. The 30 rows are summed (still totaling 106 impressions), and the UI displays identical metrics with the 60 missing dates alert.
  8. In addition, `outpost/src/components/EditItemModal.jsx` lacks a monotonic request ID counter (`fetchRequestIdRef = useRef(0)`), violating AUDIT-004 and exposing the component to out-of-order response race conditions when clicking between 30d, 60d, and 90d.

### 1.3 Seller Hub Discrepancy & Listing vs Account Scope (Issue 3)
- **Symptom:** Seller Hub displays 212,815 impressions, 289 views, 2 orders at `ebay.com/sh/performance/traffic?listing_id=336705067081`, whereas Outpost displays 106 impressions.
- **Root Cause:**
  1. In eBay Seller Hub, the "Review your traffic: Overall traffic" summary banner reports store-wide, account-level performance across all listings, not filtered by the query parameter `?listing_id=...`.
  2. In Outpost's `ingestListingTraffic`, when called for a single item modal, the code attempted to batch up to 200 listings from `auction_items` (`idListParam = allListingIds.join('|')`) instead of scoping strictly to the requested item's `listingId`.
  3. When an item modal is opened or refreshed, the API query MUST explicitly scope to `listing_ids:{${listingId}}`. Only store-wide sync operations (`POST /api/ebay/sync-all`) should batch multiple listings.
  4. The UI and tooltips must clearly explain that Outpost displays single-listing telemetry for eBay Item #336705067081, distinct from store-wide Seller Hub totals.

---

## 2. Proposed Architectural Changes & Deltas

### 2.1 Backend: `outpost/functions/api/ebay/analytics.js`

1. **Resilient Multi-Key Metric Extractor**:
   - Create a helper `extractMetricValue(metricKeyMap, metricValues, candidateKeys)` that:
     - Normalizes keys to uppercase and strips underscores/spaces for resilient matching.
     - Searches candidate key aliases (e.g., `LISTING_VIEWS_TOTAL`, `TOTAL_LISTING_VIEWS`, `LISTING_PAGE_VIEW_TOTAL`, `TOTAL_PAGE_VIEWS`, `LISTING_VIEWS`, `PAGE_VIEWS`).
     - Safely extracts values whether `metricValues[idx]` is `{ value: '...' }`, `{ value: 123 }`, `{ val: ... }`, or a primitive number/string.
     - Sums granular source view keys (`LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE`, `LISTING_VIEWS_SOURCE_DIRECT`, `LISTING_VIEWS_SOURCE_STORE`, `LISTING_VIEWS_SOURCE_OTHER_EBAY`, `LISTING_VIEWS_SOURCE_OFF_EBAY`) if the aggregate view key is missing or returns 0.
     - Supports impression fallbacks: `LISTING_IMPRESSION_TOTAL`, `TOTAL_IMPRESSION_TOTAL`, `TOTAL_IMPRESSIONS`, and sum of search + store impressions.
   - Refactor `parseEbayDailyTraffic`, `parseEbayRangeTotals`, and `ingestListingTraffic` to use this unified extractor.

2. **Single-Listing API Query Scoping**:
   - In `ingestListingTraffic(env, userId, itemId, listingId, rangeDays = 30)`:
     - When `listingId` is provided (item modal context), strictly scope the query filter:
       `filter=marketplace_ids:{EBAY_US},listing_ids:{${listingId}},date_range:[${startYMD}..${endYMD}]`.
     - When `listingId` is null or empty (store sync context), batch up to 200 listings from D1.
     - Ensure URL encoding uses `encodeURIComponent` on filter values while maintaining `dimension=LISTING`.
     - Enforce 15-second timeout via `fetchWithTimeout(..., 15000)` (AUDIT-003).

3. **Cache Range Coverage Fix in `onRequestGet`**:
   - Calculate `startYMD` (T-rangeDays) and `endYMD` (T-1).
   - Query existing rows from `listing_traffic`:
     ```sql
     SELECT * FROM listing_traffic
     WHERE item_id = ? AND user_id = ? AND traffic_date >= ? AND traffic_date <= ?
     ORDER BY traffic_date ASC
     ```
   - Update `needsIngestion` logic:
     ```javascript
     let needsIngestion = false;
     if (forceRefresh || rows.length === 0) {
       needsIngestion = true;
     } else {
       const oldestRowDate = String(rows[0].traffic_date);
       const newestFetchedAt = rows.reduce((max, r) => {
         const t = r.fetched_at ? new Date(r.fetched_at).getTime() : 0;
         return t > max ? t : max;
       }, 0);
       const analyticsCacheTtlMs = ANALYTICS_CACHE_TTL_HOURS * 60 * 60 * 1000;

       // If cache is expired OR cached rows do not cover the requested start date:
       const dateListedYmd = item.date_listed ? item.date_listed.replace(/-/g, '') : null;
       const expectedStartDate = (dateListedYmd && dateListedYmd > startYMD) ? dateListedYmd : startYMD;
       const coversDateRange = oldestRowDate <= expectedStartDate;

       if (!coversDateRange || (Date.now() - newestFetchedAt > analyticsCacheTtlMs)) {
         needsIngestion = true;
       }
     }
     ```
   - If `needsIngestion` is true, call `ingestListingTraffic` with `rangeDays`, re-query D1 rows, and return the complete dataset with `data_complete = true` (zero missing dates).

4. **Mathematical Ratio Fallbacks**:
   - Calculate CTR: If eBay's `rawCtr` is 0 or missing, calculate `(totalPageViews / totalImpressions) * 100` when impressions > 0.
   - Calculate Conversion: If eBay's `rawConv` is 0 or missing, calculate `(unitsSold / totalPageViews) * 100` when views > 0.

---

### 2.2 Frontend: `outpost/src/components/EditItemModal.jsx`

1. **Monotonic Request Latching (AUDIT-004)**:
   - Add `fetchRequestIdRef = useRef(0)`.
   - In `handleFetchAnalytics(range = 30, force = false)`:
     ```javascript
     const requestId = ++fetchRequestIdRef.current;
     setLoadingAnalytics(true);
     setAnalyticsError('');
     try {
       const data = await fetchEbayItemAnalytics(item.id, range, force);
       if (requestId !== fetchRequestIdRef.current) return; // Drop stale out-of-order response
       ...
     } finally {
       if (requestId === fetchRequestIdRef.current) {
         setLoadingAnalytics(false);
       }
     }
     ```
2. **Tab Navigation & Range Tracking**:
   - Pass monotonic fetch triggers when range buttons (30d, 60d, 90d) or "Force Refresh" are clicked.

---

### 2.3 Frontend: `outpost/src/components/edit/EditTabPerformance.jsx`

1. **Scope Clarification & Visual Indicators**:
   - In the header, display explicit scope badge: `Single Listing Telemetry: eBay #${item.ebay_listing_id}`.
   - Update `InfoTooltip` on the header to clarify: "Metrics reflect traffic specifically for this item listing (#...), ending yesterday (T-1 Pacific Time). Store-wide Seller Hub totals include all other inventory across your account."
2. **Missing Dates Banner Safety**:
   - Suppress the "Partial Traffic Data" warning when all active listing dates are present in D1.

---

### 2.4 Testing: `outpost/tests/t07-ebay-analytics-real-traffic.test.js`

1. **Unit Tests**:
   - Test metric parser with alternative view keys (`TOTAL_LISTING_VIEWS`, `LISTING_PAGE_VIEW_TOTAL`, granular `LISTING_VIEWS_SOURCE_*`).
   - Test parser with primitive number values in `metricValues`.
   - Test cache coverage expansion: when 30 days are cached and 90 days are queried, verify `needsIngestion` triggers and ingests the 90-day window.
   - Test single-listing query scoping in `ingestListingTraffic`.

---

### 2.5 Documentation Synchronization

1. **`outpost/docs/03_features.md`**: Update Section `PERF-001` / `TRAFFIC-001` to document multi-key view parsing, cache range expansion, and single-listing API query isolation.
2. **`outpost/docs/04_state.md`**: Update Performance & Traffic state notes regarding `listing_traffic` range coverage and monotonic request latching.

---

## 3. Pre-Flight Invariant Checklist

- [x] OS: Windows 11 Home (PowerShell exclusively).
- [x] Language: Pure JavaScript (JSX/ESM). Absolutely NO TypeScript.
- [x] Routing: Custom SPA history router in `App.jsx`. No react-router-dom.
- [x] State: React Context + hooks (`useState`, `useRef`, `useCallback`). No Redux/Zustand.
- [x] Timeouts: Enforce 15-second timeout via `fetchWithTimeout(..., 15000)` (AUDIT-003).
- [x] Race Conditions: Enforce monotonic request tracking via `fetchRequestIdRef` (AUDIT-004).
- [x] Timezone: America/Los_Angeles (Pacific Time) with mandatory T-1 lag to prevent error 50018.
- [x] Typography: Zero em dashes. Standard hyphens (-) or colons (:) exclusively.
- [x] Stop Directive: Plan written to disk. Halt immediately for user review without modifying source code.
