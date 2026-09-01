# Outpost Tracker - Architectural Expansion Plan
## Amazon Ingestion, Market Comps Engine, Profit Ledger & eBay Traffic Pipeline

**Created:** 2026-09-01  
**Status:** Awaiting User Approval  
**Target App:** `outpost/` (techtrekgt.com/outpost)  
**Stack Lock:** React 19 / Vite 6 / Tailwind 3.4 / Cloudflare Workers ESM / D1 SQLite / Pure JS (zero TypeScript)

---

## Background

The existing Outpost Tracker (Phase 3-5) provides eBay OAuth sync, fee reconciliation, active listing discovery, and a basic analytics ingestion table (`auction_item_analytics`). The current `auction_comps` table stores only three scalar comp slots (comp_1/comp_2/comp_3) with no individual comp metadata (title, URL, condition, shipping). The Amazon import handler (`functions/api/import/amazon.js`) writes Amazon product data into the generic `notes` TEXT column as a pipe-delimited string rather than a structured JSON column.

This plan formalizes four architectural pillars:

1. **Amazon Item Ingestion** - structured `attributes` JSON column + dual ingestion paths (URL parse + VineScout webhook)
2. **Sales Ledger & Profit Tracking** - explicit ETV-as-COGS mapping and net profit formula
3. **Market Comps Engine** - a new `market_comps` table replacing the scalar slot system
4. **eBay Traffic Pipeline** - a new `listing_traffic` table for time-series Analytics API datapoints

All database changes are additive (`ALTER TABLE` and `CREATE TABLE IF NOT EXISTS`). No existing tables are dropped or modified destructively.

---

## Open Questions

> [!IMPORTANT]
> **Q1 - Amazon URL Parse Depth:** For the URL ingestion path, should the server call the existing Landing Gateway (`POST /api/amazon/fetch` via `SCRAPER_API_KEY`) to hydrate full product specs and image URLs, or should the Outpost endpoint accept only the ASIN extracted from the URL and defer product detail lookup to VineScout?
>
> **Recommendation:** Call the Landing Gateway. The Outpost Worker sends the ASIN to `https://techtrekgt.com/api/amazon/fetch` with the shared SSO cookie. This avoids duplicating scraper logic. If the gateway returns partial data, still create the item with what is available.

> [!IMPORTANT]
> **Q2 - Comp Source Scope:** Should `market_comps` ingest ONLY eBay Browse API results, or should it also support manual comp entry from the UI (the current comp_1/comp_2/comp_3 workflow)?
>
> **Recommendation:** Support both. Rows have a `source` column (`'ebay_browse'`, `'ebay_sold'`, `'manual'`). The existing three-slot manual UI saves rows with `source = 'manual'`. The API-fetched comps save rows with `source = 'ebay_browse'` or `'ebay_sold'`. Both feed the median calculation engine.

> [!WARNING]
> **Q3 - Legacy `auction_comps` Migration Strategy:** The existing `auction_comps` table (with comp_1/comp_2/comp_3 scalar slots) will be superseded by `market_comps`. The plan proposes keeping `auction_comps` intact (no DROP) and writing new comp data to `market_comps`. The legacy table remains as a read fallback until a UI migration pass is complete. Confirm this approach before execution.

> [!IMPORTANT]
> **Q4 - `listing_traffic` vs. `auction_item_analytics`:** The existing `auction_item_analytics` table stores aggregate 30-day windows with JSON arrays for time-series. The proposed `listing_traffic` table stores individual daily datapoints (one row per listing per day). Should both tables coexist (analytics table for aggregate dashboards, traffic table for per-day trend charts), or should `listing_traffic` fully replace `auction_item_analytics`?
>
> **Recommendation:** Coexist. `auction_item_analytics` keeps serving the existing Analytics panel aggregate view. `listing_traffic` is the new append-only time-series store for trend sparklines and daily drill-downs.

---

## Proposed Changes

---

### PILLAR 1: Amazon Item Ingestion

#### 1A. Schema Migration - `auction_items.attributes` Column

The single most impactful structural change is adding a `TEXT` column to `auction_items` to store a structured JSON object. SQLite's `json_extract()` and `json_patch()` functions allow querying and updating individual keys without a schema change per field.

**File:** auction-schema.sql - `PHASE 6` section appended

```sql
-- P6-1: Structured attributes JSON column on auction_items
ALTER TABLE auction_items ADD COLUMN attributes TEXT;
```

**`attributes` JSON schema** (stored as a TEXT value, validated in the Worker):

```json
{
  "source":        "amazon_vinescout | amazon_url | manual",
  "asin":          "B0XXXXXXXX",
  "amazon_url":    "https://www.amazon.com/dp/B0XXXXXXXX",
  "image_urls":    ["https://m.media-amazon.com/images/..."],
  "specs":         { "brand": "...", "model": "...", "dimensions": "...", "weight": "..." },
  "etv":           29.99,
  "tax_charged":   2.70,
  "order_id":      "123-4567890-1234567",
  "vine_program":  true,
  "condition":     "New",
  "condition_note": ""
}
```

All existing Amazon items (identified by `invoice_ref LIKE 'AMAZON-%'`) retain their current `notes` blob. The new `attributes` column will be `NULL` for those rows until a backfill migration script is run (optional, post-approval).

#### 1B. Dual Ingestion Paths

**Path A - VineScout Webhook (existing endpoint, expanded schema)**

- **Endpoint:** `POST /api/import/amazon` (no route change - stays in `outpost/`)
- **Auth:** Bearer API token via `users.amazon_api_token`
- **File to modify:** `functions/api/import/amazon.js`

**Expanded accepted body:**

```json
{
  "asin":         "B0XXXXXXXX",
  "title":        "Instant Pot Duo 7-in-1",
  "category":     "Kitchen",
  "vine_value":   29.99,
  "tax_value":    2.70,
  "order_id":     "123-4567890-1234567",
  "image_urls":   ["https://m.media-amazon.com/images/..."],
  "page_url":     "https://www.amazon.com/dp/B0XXXXXXXX",
  "specs":        { "brand": "Instant Pot", "model": "Duo 7-in-1" },
  "condition":    "New",
  "notes":        "Optional free text from user"
}
```

**Changes:**
- Accept `image_urls` (array) in addition to legacy `image_url` (string).
- Accept `specs` (object), `order_id`, `condition`.
- Build and write the `attributes` JSON blob to `auction_items.attributes` on INSERT.
- Keep backward-compatible: all new fields are optional; existing extension versions without them continue working.

**Path B - Amazon URL Parse**

- **New endpoint:** `POST /api/import/amazon-url`
- **Auth:** Standard SSO JWT cookie (same as all other Outpost API routes)
- **New file:** `functions/api/import/amazon-url.js`

**Flow:**
1. Accept `{ url: "https://www.amazon.com/dp/B0XXXXXXXX" }` from the Outpost UI.
2. Extract ASIN via regex: `/\/dp\/([A-Z0-9]{10})/i`.
3. Call the Landing Gateway: `POST https://techtrekgt.com/api/amazon/fetch` with `{ asin }` and forwarded SSO cookie.
4. Receive hydrated product data (title, category, image URLs, specs).
5. Prompt user for ETV/tax via a UI modal (the gateway cannot infer Vine ETV).
6. Write `auction_invoices` + `auction_items` + `attributes` JSON, returning `item_id`.

**New file:** `functions/api/import/amazon-url.js` [NEW]

---

### PILLAR 2: Sales Ledger & Profit Tracking

#### 2A. ETV-as-COGS Mapping

The existing `auction_items.true_total_cost` already represents the total landed cost (unit_price + prorated_tax + prorated_shipping). For Amazon Vine items:

- `vine_value` (ETV) maps directly to `unit_price`.
- `tax_value` maps directly to `prorated_tax`.
- Both are already inserted correctly in the existing handler.

**No schema change required for COGS.** The `true_total_cost` column IS the COGS.

The plan formalizes this as a documented invariant and adds a computed column alias to the sales query in `functions/api/sales/`:

```
COGS = auction_items.true_total_cost
     = unit_price + prorated_tax + prorated_shipping
     = ETV + Vine-charged tax + 0 (Vine ships free)
```

#### 2B. Net Profit Formula (Documented & Enforced)

The existing `auction_sales.net_profit` column stores a computed value. The formula must be locked to:

```
Net Profit = gross_sale_price
           - platform_fees_amt         (eBay Final Value Fee)
           - actual_shipping_cost      (label cost)
           - true_total_cost           (COGS / ETV)
           - payment_processing_amt    (eBay payment processing)
           - promoted_listing_fee      (if applicable)
```

The `ebay_fee_reconciliations` table (Phase 3) already stores the reconciled net profit after actual eBay Finances API fees are pulled. This plan adds a `net_profit_formula` TEXT column to `auction_sales` as a human-readable audit trace:

**Schema Migration:**

```sql
-- P6-2: Net profit formula audit column on auction_sales
ALTER TABLE auction_sales ADD COLUMN net_profit_formula TEXT;
ALTER TABLE auction_sales ADD COLUMN cogs_source TEXT DEFAULT 'manual';
-- cogs_source values: 'amazon_vine', 'amazon_url', 'manual', 'invoice'
```

**`net_profit_formula` example value (stored as JSON string for auditability):**

```json
{
  "gross_sale_price":       45.00,
  "platform_fees_amt":      6.12,
  "actual_shipping_cost":   4.50,
  "cogs":                   29.99,
  "payment_processing_amt": 0.49,
  "promoted_listing_fee":   0.00,
  "net_profit":             3.90
}
```

#### 2C. Dashboard Profit Widget

The existing `functions/api/dashboard.js` already exposes aggregated profit metrics. A new `avg_cogs` field will be added to the dashboard aggregate query using `AVG(i.true_total_cost)` joined on `auction_sales`.

**File to modify:** `functions/api/dashboard.js` - minor additive SELECT change only.

---

### PILLAR 3: Market Comps Engine

#### 3A. New `market_comps` Table

This replaces the scalar slot system (comp_1/comp_2/comp_3) with a proper normalized table. Each row is one comparable item observation.

**Schema Migration:**

```sql
-- P6-3: Market Comps Engine - normalized comp observations table
CREATE TABLE IF NOT EXISTS market_comps (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,

  -- Comp identification
  source          TEXT NOT NULL DEFAULT 'manual',
  -- 'ebay_browse'  = active eBay listing from Browse API
  -- 'ebay_sold'    = completed/sold eBay listing
  -- 'manual'       = user-entered via UI

  -- Pricing data
  comp_title      TEXT,
  list_price      REAL,
  shipping_fee    REAL NOT NULL DEFAULT 0.0,
  landed_cost     REAL,
  -- landed_cost = list_price + shipping_fee (computed on insert)

  -- Condition classification
  condition_id    TEXT,
  -- eBay condition IDs: 1000=New, 1500=New other, 2500=Seller refurb,
  -- 3000=Used, 7000=For parts. 7000 is EXCLUDED from median calc.
  condition_label TEXT,

  -- Comp metadata
  ebay_item_id    TEXT,
  comp_url        TEXT,
  observed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- Date the comp was fetched or manually entered

  is_valid        INTEGER NOT NULL DEFAULT 1,
  -- 0 = invalid: condition_id = 7000, price outlier, or manually flagged

  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_comps_item    ON market_comps(item_id, is_valid);
CREATE INDEX IF NOT EXISTS idx_market_comps_user    ON market_comps(user_id);
CREATE INDEX IF NOT EXISTS idx_market_comps_source  ON market_comps(item_id, source, observed_at);
```

#### 3B. Validity Filter Rules (Strict)

A comp row is marked `is_valid = 0` (excluded from median calculations) when ANY of the following are true:

| Rule | Condition |
|------|-----------|
| Parts/Not Working | `condition_id = '7000'` |
| Zero or negative price | `list_price <= 0` |
| Extreme outlier | `list_price > (median * 3.0)` or `list_price < (median * 0.2)` |
| Manually flagged | User explicitly sets `is_valid = 0` in the UI |

**eBay Condition IDs excluded by default:**

```js
const EXCLUDED_CONDITION_IDS = new Set(['7000']); // For Parts / Not Working
```

The landing gateway `GET /api/ebay/comps` must pass `conditionIds` to the Browse API filter to pre-exclude condition 7000. The Outpost handler performs a second-pass validation on the Worker before writing to D1.

#### 3C. Median Benchmark Price Calculation

The `recommended_list_price` on `auction_comps` (existing) will be supplemented by a computed `median_comp_price` derived from `market_comps`:

**Calculation logic (runs in Worker, not SQL):**

```js
// Worker pseudo-code
const validComps  = rows.filter(r => r.is_valid === 1 && r.landed_cost > 0);
const soldComps   = validComps.filter(r => r.source === 'ebay_sold');
const activeComps = validComps.filter(r => r.source === 'ebay_browse');

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

const soldMedian   = soldComps.length   ? median(soldComps.map(r => r.landed_cost))   : null;
const activeMedian = activeComps.length ? median(activeComps.map(r => r.landed_cost)) : null;

// Benchmark: prefer sold median; fall back to active if no sold data
const benchmarkPrice = soldMedian ?? activeMedian ?? null;
```

The benchmark is written back to `auction_comps.recommended_list_price` (existing column) and returned in the API response alongside the individual comp rows.

#### 3D. New API Endpoints for Market Comps

**New file:** `functions/api/comps/market.js` [NEW]

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`    | `/api/comps/market?item_id=X` | Return all `market_comps` rows for an item + computed medians |
| `POST`   | `/api/comps/market` | Insert one or many comp rows (from UI manual entry or gateway batch) |
| `PUT`    | `/api/comps/market/:id` | Update `is_valid` flag or `notes` on a specific comp row |
| `DELETE` | `/api/comps/market/:id` | Delete a single comp row |

The existing `functions/api/comps/index.js` and `functions/api/comps/[id].js` remain unchanged (legacy scalar slot endpoints, kept for backward compatibility until UI migration pass).

---

### PILLAR 4: eBay Performance & Traffic Pipeline

#### 4A. New `listing_traffic` Table

The existing `auction_item_analytics` table stores one aggregate row per listing per fetch (30-day window with JSON arrays). The new `listing_traffic` table stores individual **daily datapoints** for time-series charting and trend analysis.

**Schema Migration:**

```sql
-- P6-4: Per-day listing traffic datapoints (eBay Sell Analytics API)
CREATE TABLE IF NOT EXISTS listing_traffic (
  id                    TEXT PRIMARY KEY,
  item_id               TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  ebay_listing_id       TEXT NOT NULL,

  -- Date of the datapoint (Pacific Time, YYYYMMDD)
  traffic_date          TEXT NOT NULL,

  -- eBay Analytics API metric values
  impressions_total     INTEGER DEFAULT 0,
  -- LISTING_IMPRESSION_TOTAL
  impressions_search    INTEGER DEFAULT 0,
  -- LISTING_IMPRESSION_SEARCH_RESULTS_PAGE
  page_views_total      INTEGER DEFAULT 0,
  -- LISTING_VIEWS_TOTAL
  click_through_rate    REAL DEFAULT 0.0,
  -- CLICK_THROUGH_RATE
  sales_conversion_rate REAL DEFAULT 0.0,
  -- SALES_CONVERSION_RATE

  fetched_at            TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (item_id)   REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,

  -- One row per listing per day
  UNIQUE(ebay_listing_id, traffic_date)
);

CREATE INDEX IF NOT EXISTS idx_traffic_item_date  ON listing_traffic(item_id, traffic_date);
CREATE INDEX IF NOT EXISTS idx_traffic_ebay_date  ON listing_traffic(ebay_listing_id, traffic_date);
CREATE INDEX IF NOT EXISTS idx_traffic_user       ON listing_traffic(user_id);
```

#### 4B. eBay Analytics API Protocol (Enforced in Worker)

Per the mandatory protocol in `outpost/docs/ebay-apis-reference.md` Section 4:

**Rule 1 - Filter Nesting:**
The `date_range` MUST be nested inside the `filter` query parameter:
```
GET /sell/analytics/v1/traffic_report
  ?filter=marketplace_ids:{EBAY_US},listing_ids:{ID1|ID2},date_range:[20260801..20260831]
  &metric_keys=LISTING_IMPRESSION_TOTAL,LISTING_IMPRESSION_SEARCH_RESULTS_PAGE,
               LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE
  &dimension=DAY
```

**Rule 2 - Pacific Time Boundaries:**
All date calculations use `America/Los_Angeles`. The request date range must end at T-1 (yesterday Pacific). Using `Intl.DateTimeFormat` with the LA timezone in the Worker:

```js
// Worker utility (no external libs needed)
function getPacificDateBoundaries(lagDays = 1) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const todayParts = fmt.formatToParts(now);
  const ptYear  = todayParts.find(p => p.type === 'year').value;
  const ptMonth = todayParts.find(p => p.type === 'month').value;
  const ptDay   = todayParts.find(p => p.type === 'day').value;
  const ptToday = new Date(`${ptYear}-${ptMonth}-${ptDay}T12:00:00-08:00`);
  const endDate = new Date(ptToday);
  endDate.setDate(endDate.getDate() - lagDays);
  const format = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 29); // 30-day window
  return { start: format(startDate), end: format(endDate) };
}
```

**Rule 3 - Error 50018 Prevention:**
The Worker validates that `end_date <= yesterday_pacific` before dispatching the request. If the computed end date is today or in the future, the request is rejected with a 400 response before hitting eBay.

#### 4C. Traffic Ingestion Worker Handler

**File to modify:** `functions/api/ebay/analytics.js`

The existing `analytics.js` handler fetches aggregate data and writes to `auction_item_analytics`. A new `ingestDailyTraffic()` function will be added to the same file to:

1. Fetch the eBay Analytics API `traffic_report` response with `dimension=DAY`.
2. Parse the `dimensionalDataPoints` array - each entry contains one day's metrics.
3. `INSERT OR REPLACE` into `listing_traffic` (one row per `ebay_listing_id` + `traffic_date`).
4. Return the number of rows upserted.

The existing aggregate write to `auction_item_analytics` is preserved and runs in the same handler call (no regression).

**New route:** `POST /api/ebay/analytics/ingest-traffic` triggers daily ingestion for all active listings.

---

### PILLAR 5: D1 SQLite Migrations

All changes are non-destructive and append-only. The migration file is appended to the existing `auction-schema.sql` under a `PHASE 6` section header.

#### Migration File Changes

**File:** `auction-schema.sql` - append PHASE 6 section

```sql
-- ============================================================
-- PHASE 6 MIGRATIONS - Amazon Ingestion, Market Comps & Traffic
-- Added: 2026-09-XX
-- All migrations are additive (CREATE IF NOT EXISTS + ALTER ADD COLUMN).
-- Run: npm run db:migrate:local (local) | npm run db:migrate (production)
-- ============================================================

-- P6-1: Structured attributes JSON column on auction_items
ALTER TABLE auction_items ADD COLUMN attributes TEXT;

-- P6-2: Net profit audit columns on auction_sales
ALTER TABLE auction_sales ADD COLUMN net_profit_formula TEXT;
ALTER TABLE auction_sales ADD COLUMN cogs_source TEXT DEFAULT 'manual';

-- P6-3: Market Comps Engine
CREATE TABLE IF NOT EXISTS market_comps (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual',
  comp_title      TEXT,
  list_price      REAL,
  shipping_fee    REAL NOT NULL DEFAULT 0.0,
  landed_cost     REAL,
  condition_id    TEXT,
  condition_label TEXT,
  ebay_item_id    TEXT,
  comp_url        TEXT,
  observed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  is_valid        INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_market_comps_item   ON market_comps(item_id, is_valid);
CREATE INDEX IF NOT EXISTS idx_market_comps_user   ON market_comps(user_id);
CREATE INDEX IF NOT EXISTS idx_market_comps_source ON market_comps(item_id, source, observed_at);

-- P6-4: Per-day listing traffic time-series
CREATE TABLE IF NOT EXISTS listing_traffic (
  id                    TEXT PRIMARY KEY,
  item_id               TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  ebay_listing_id       TEXT NOT NULL,
  traffic_date          TEXT NOT NULL,
  impressions_total     INTEGER DEFAULT 0,
  impressions_search    INTEGER DEFAULT 0,
  page_views_total      INTEGER DEFAULT 0,
  click_through_rate    REAL DEFAULT 0.0,
  sales_conversion_rate REAL DEFAULT 0.0,
  fetched_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(ebay_listing_id, traffic_date)
);
CREATE INDEX IF NOT EXISTS idx_traffic_item_date ON listing_traffic(item_id, traffic_date);
CREATE INDEX IF NOT EXISTS idx_traffic_ebay_date ON listing_traffic(ebay_listing_id, traffic_date);
CREATE INDEX IF NOT EXISTS idx_traffic_user      ON listing_traffic(user_id);
```

> [!CAUTION]
> SQLite (D1) does not support transactional DDL for `ALTER TABLE` in the same batch as `CREATE TABLE`. Execute `ALTER TABLE` statements individually, not inside a multi-statement batch. The existing `npm run db:migrate` and `npm run db:migrate:local` scripts handle this correctly via sequential Wrangler D1 execute calls.

#### D1 Data Type Compliance Table

| Column Type | D1 Type | Rationale |
|-------------|---------|-----------|
| All prices / fees / rates | `REAL` | Floating point; never INTEGER for monetary values |
| All IDs (primary/foreign keys) | `TEXT` | UUID strings; D1 has no native UUID type |
| All timestamps | `TEXT` | ISO-8601 strings; `datetime('now')` returns TEXT |
| All counts / boolean flags | `INTEGER` | Whole numbers; booleans represented as 0 / 1 |
| JSON blobs (attributes, formula) | `TEXT` | SQLite stores JSON as TEXT; query via `json_extract()` |

---

## File Change Summary

### [MODIFY] Files

| File | Change |
|------|--------|
| `outpost/auction-schema.sql` | Append PHASE 6 migration block (P6-1 through P6-4) |
| `outpost/functions/api/import/amazon.js` | Accept expanded body fields; write `attributes` JSON blob to `auction_items` |
| `outpost/functions/api/ebay/analytics.js` | Add `ingestDailyTraffic()` function + new route handler for `listing_traffic` |
| `outpost/functions/api/dashboard.js` | Add `avg_cogs` field to dashboard aggregate query |
| `outpost/src/worker.js` | Register three new API routes (amazon-url, comps/market, analytics/ingest-traffic) |

### [NEW] Files

| File | Purpose |
|------|---------|
| `outpost/functions/api/import/amazon-url.js` | URL-based Amazon ingestion; calls Landing Gateway; JWT-cookie-authed |
| `outpost/functions/api/comps/market.js` | CRUD + median engine for `market_comps` table |

### [UNCHANGED] Files

| File | Reason |
|------|--------|
| `outpost/functions/api/comps/index.js` | Legacy scalar comps endpoint preserved for backward compat |
| `outpost/functions/api/comps/[id].js` | Legacy; no change |
| `outpost/functions/api/ebay/tokenHelper.js` | Existing token refresh logic reused as-is |
| All auth, sales, invoices, items, platforms, supplies handlers | No structural change needed |

---

## Worker Route Additions

The following routes must be registered in `outpost/src/worker.js`:

```js
// Existing routes (no change):
// POST   /outpost/api/import/amazon        -> import/amazon.js
// GET|POST /outpost/api/comps              -> comps/index.js

// New routes to add:
// POST   /outpost/api/import/amazon-url    -> import/amazon-url.js
// GET|POST /outpost/api/comps/market       -> comps/market.js
// PUT|DELETE /outpost/api/comps/market/:id -> comps/market.js
// POST   /outpost/api/ebay/analytics/ingest-traffic -> ebay/analytics.js (new export)
```

> [!NOTE]
> No new Worker bindings or secrets are required for Pillars 1-3. Pillar 4 (analytics) reuses the existing `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, and `EBAY_RUNAME` secrets already provisioned.

---

## ARCHITECTURE.md Sync Requirements

Upon execution approval, `ARCHITECTURE.md` will be updated:
- **Section 2.4** - Add `POST /api/import/amazon-url` to the Amazon VineScout Import row.
- **Section 8.2** - Add `market_comps` and `listing_traffic` to the outpost schema ownership table.

---

## Verification Plan

### Automated (Build + Deploy)

```powershell
cd E:\TechTrekGT\outpost
npm run build   # Must complete with zero Vite/ESM errors
npm run deploy  # Must deploy successfully to Cloudflare
```

### Manual DB Verification

```powershell
# Run Phase 6 migrations locally first
wrangler d1 execute personal-budget-db --local --command "ALTER TABLE auction_items ADD COLUMN attributes TEXT;"
wrangler d1 execute personal-budget-db --local --command "ALTER TABLE auction_sales ADD COLUMN net_profit_formula TEXT;"
wrangler d1 execute personal-budget-db --local --command "ALTER TABLE auction_sales ADD COLUMN cogs_source TEXT DEFAULT 'manual';"
wrangler d1 execute personal-budget-db --local --file ./auction-schema.sql

# Confirm new tables exist
wrangler d1 execute personal-budget-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('market_comps','listing_traffic');"
```

### API Smoke Tests

1. **VineScout import (expanded body):** `POST /api/import/amazon` with `image_urls` array and `specs` object. Verify `attributes` column populated via `GET /api/items/:id`.
2. **URL import:** `POST /api/import/amazon-url` with a valid Amazon product URL. Verify ASIN extraction, Gateway call, and item creation.
3. **Market comps write + validity filter:** `POST /api/comps/market` with two `source=manual` rows and one row with `condition_id=7000`. `GET /api/comps/market?item_id=X` must return all three rows; the `condition_id=7000` row must have `is_valid=0` and must be excluded from the returned `median_comp_price`.
4. **Traffic ingestion:** `POST /api/ebay/analytics/ingest-traffic` for an item with a live eBay listing ID. Verify rows appear in `listing_traffic` with `traffic_date` values bounded to yesterday Pacific (T-1). Confirm error 50018 guard rejects requests where the computed end date is today.

---

*Plan created. Waiting for user review.*
