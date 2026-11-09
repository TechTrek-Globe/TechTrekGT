# Implementation Plan: Deep Relational Normalization (Phase 2) for Finance OS (`finance-os-db`) and Outpost Tracker (`outpost-db`)

## Executive Summary & Architectural Objectives

Following the provisioning of dedicated Cloudflare D1 SQLite databases for **Finance OS (`finance-os-db` - `1746a2c8-2653-4136-8301-d217748621fa`)** and **Outpost Tracker (`outpost-db` - `c41ad6c7-26f1-4ca8-9af8-82990ccb4566`)**, live D1 column byte-size telemetry revealed several remaining high-volume JSON blobs embedded inside relational rows.

This implementation plan eliminates opaque nested JSON maps, parallel JSON arrays, and duplicated `extra_json` payloads across both databases while strictly preserving:
- **Zero-Regression API Contracts**: The JSON shapes returned to the React 19 frontends (`/api/sync/restore` in Finance OS; `/api/items/enriched`, `/api/sales`, `/api/ebay/analytics` in Outpost) remain 100% identical.
- **Strict SQL Parameterization (`FIN-AUDIT-001`)**: Every SQLite query uses `db.prepare(sql).bind(...)` with `?` positional parameters.
- **Pure JavaScript (ESM)**: Zero TypeScript files or compilation steps.

---

## Part 1: Finance OS (`finance-os-db`) Relational Normalization Plan

### 1.1 Diagnostic Findings in `finance-os-db`
1. **`finance_accounts.extra_json` (`69,242 bytes` on `acc-1785514227145-uymt`)**:
   - Currently, `importedLedgerRows` (a date-keyed map of bank statement balance snapshots `{ regBeg, extraBeg, totalBeg, regEnd, extraEnd, totalEnd, bankBalance }`) accounts for **68,789 bytes** inside `finance_accounts.extra_json`.
   - Scalar fields (`startingBalance`, `extraStartingBalance`, `balanceAsOfDate`, `startDate`, `ledgerMode`, `isArchived`) are also stored inside `extra_json` rather than typed SQL columns.
2. **Embedded Split & Allocation Maps (`splits_json`, `account_allocations`, `saveExtraSplits`, `overflowSplits`)**:
   - `finance_bills.splits_json`, `finance_people.account_allocations`, and account split maps are stored as serialized JSON objects rather than relational junction tables.
3. **Settings Arrays (`dashboard_widgets_json`, `custom_categories_json`)**:
   - Stored as JSON text arrays on `finance_ledger_settings`.
4. **Full-Item Duplication in `extra_json`**:
   - Currently, [`structuredBudgetStore.js`](file:///e:/TechTrekGT/finance/functions/utils/structuredBudgetStore.js) writes `JSON.stringify(item)` into `extra_json` on `finance_accounts`, `finance_people`, `finance_bills`, `finance_transactions`, `finance_line_items`, `finance_funding_goals`, and `finance_loans`, duplicating all column values.

---

### 1.2 Target Schema Additions (`finance/finance-schema.sql` & `finance/schema.sql`)

```sql
-- 1. Promote explicit scalar columns on finance_accounts, finance_bills, finance_transactions, finance_funding_goals
-- (In finance-schema.sql & schema.sql CREATE TABLE definitions)
-- finance_accounts: add starting_balance REAL, extra_starting_balance REAL, balance_as_of_date TEXT, start_date TEXT, ledger_mode TEXT, is_archived INTEGER
-- finance_bills: add bank_match_names TEXT
-- finance_transactions: add person_id TEXT, is_other INTEGER
-- finance_funding_goals: add contributor_id TEXT, frequency TEXT, amount_per_pay REAL
-- finance_line_items: add updated_at INTEGER

-- 2. Normalized Bank Statement Comparison Rows (replaces 69 KB importedLedgerRows JSON blob)
CREATE TABLE IF NOT EXISTS finance_account_statement_rows (
  ledger_id     TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  date_key      TEXT NOT NULL,
  reg_beg       REAL,
  extra_beg     REAL,
  total_beg     REAL,
  reg_end       REAL,
  extra_end     REAL,
  total_end     REAL,
  bank_balance  REAL,
  extra_json    TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, account_id, date_key)
);
CREATE INDEX IF NOT EXISTS idx_finance_stmt_rows_acct
  ON finance_account_statement_rows(ledger_id, account_id);

-- 3. Normalized Bill Splits Junction Table (replaces finance_bills.splits_json)
CREATE TABLE IF NOT EXISTS finance_bill_splits (
  ledger_id   TEXT NOT NULL,
  bill_id     TEXT NOT NULL,
  person_id   TEXT NOT NULL,
  percentage  REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (ledger_id, bill_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_bill_splits_ledger
  ON finance_bill_splits(ledger_id, bill_id);

-- 4. Normalized Earner Account Allocations Junction Table (replaces finance_people.account_allocations)
CREATE TABLE IF NOT EXISTS finance_person_allocations (
  ledger_id         TEXT NOT NULL,
  person_id         TEXT NOT NULL,
  account_id        TEXT NOT NULL,
  allocation_value  REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (ledger_id, person_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_person_alloc_ledger
  ON finance_person_allocations(ledger_id, person_id);

-- 5. Normalized Account Savings & Overflow Splits Junction Table
CREATE TABLE IF NOT EXISTS finance_account_splits (
  ledger_id   TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  split_type  TEXT NOT NULL CHECK(split_type IN ('save_extra', 'overflow')),
  person_id   TEXT NOT NULL,
  percentage  REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (ledger_id, account_id, split_type, person_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_acct_splits_ledger
  ON finance_account_splits(ledger_id, account_id);

-- 6. Normalized Dashboard Widgets Table (replaces dashboard_widgets_json)
CREATE TABLE IF NOT EXISTS finance_dashboard_widgets (
  ledger_id    TEXT NOT NULL,
  id           TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT DEFAULT '',
  category     TEXT DEFAULT '',
  visible      INTEGER NOT NULL DEFAULT 1,
  width        TEXT DEFAULT 'full',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  extra_json   TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_widgets_ledger
  ON finance_dashboard_widgets(ledger_id, sort_order);

-- 7. Normalized Custom Categories Table (replaces custom_categories_json)
CREATE TABLE IF NOT EXISTS finance_categories (
  ledger_id    TEXT NOT NULL,
  id           TEXT NOT NULL,
  name         TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  extra_json   TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_categories_ledger
  ON finance_categories(ledger_id, sort_order);
```

---

### 1.3 Backend Refactoring Steps in Finance OS
1. **Delta-Only `extra_json` Helper (`extractUnknownFields`) in [finance/functions/utils/structuredBudgetStore.js](file:///e:/TechTrekGT/finance/functions/utils/structuredBudgetStore.js)**:
   - Implement `extractUnknownFields(item, knownKeysSet)` so that `extra_json` stores **only** unrecognized/custom extension properties (or `'{}'` when all properties are mapped to explicit SQL columns).
   - For `finance_accounts`, excluding `importedLedgerRows`, `saveExtraSplits`, `overflowSplits`, `startingBalance`, `extraStartingBalance`, `balanceAsOfDate`, `startDate`, and `ledgerMode` from `extra_json` reduces `acc-1785514227145-uymt`'s `extra_json` from **69,242 bytes** to **`< 50 bytes`**.
2. **Decompose Nested Maps & Arrays in `buildStructuredWriteStatements`**:
   - Decompose `acc.importedLedgerRows` into `finance_account_statement_rows` (`DELETE FROM finance_account_statement_rows WHERE ledger_id = ?` + parameterized `INSERT` per date row).
   - Decompose `acc.saveExtraSplits` and `acc.overflowSplits` into `finance_account_splits`.
   - Decompose `bill.splits` into `finance_bill_splits`.
   - Decompose `person.accountAllocations` into `finance_person_allocations`.
   - Decompose `payload.dashboardWidgets` into `finance_dashboard_widgets` and `payload.categories` into `finance_categories`.
3. **Reconstruct in `readStructuredBudget`**:
   - Query the normalized tables in parallel via `Promise.all([...])` using positional `?` bindings (`WHERE ledger_id = ?`) and reassemble the exact client objects (`acc.importedLedgerRows`, `acc.saveExtraSplits`, `acc.overflowSplits`, `bill.splits`, `person.accountAllocations`, `dashboardWidgets`, `categories`), merging any remaining keys from `extra_json`.
4. **Update Cascading Deletion in [finance/functions/utils/deleteAccount.js](file:///e:/TechTrekGT/finance/functions/utils/deleteAccount.js)**:
   - Add `DELETE` statements for `finance_account_statement_rows`, `finance_bill_splits`, `finance_person_allocations`, `finance_account_splits`, `finance_dashboard_widgets`, and `finance_categories` (`WHERE ledger_id = ?`).

---

### 1.4 Finance OS Wrangler CLI Commands (PowerShell)

```powershell
Set-Location -Path "e:\TechTrekGT\finance"

# 1. Apply updated normalized schema to local finance-os-db
npx wrangler d1 execute finance-os-db --local --file=./finance-schema.sql

# 2. Apply updated normalized schema to remote finance-os-db
npx wrangler d1 execute finance-os-db --remote --file=./finance-schema.sql
```

---

## Part 2: Outpost Tracker (`outpost-db`) Relational Normalization Plan

### 2.1 Diagnostic Findings in `outpost-db`
1. **`auction_item_analytics` Parallel Time-Series JSON Blobs ([outpost/auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql#L371-L396))**:
   - Contains 7 JSON text columns (`dates_json`, `impressions_json`, `promoted_impressions_json`, `page_views_json`, `ctr_json`, `conversion_json`, `raw_response`) that duplicate the per-day rows already stored in [`listing_traffic`](file:///e:/TechTrekGT/outpost/auction-schema.sql#L486-L514).
2. **`auction_items.attributes` & `other_platform_listing_ids` ([outpost/auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql#L335-L421))**:
   - Multi-image gallery arrays (`image_urls` / `images`), eBay Item Specifics (`specs` / `aspects` key-value map), feature bullet arrays (`features`), and cross-platform listing IDs (`other_platform_listing_ids`) are stored as JSON text blobs on `auction_items`.
3. **`auction_sales.net_profit_formula` ([outpost/auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql#L426))**:
   - Stores a serialized JSON calculation object duplicating numeric columns already present on `auction_sales`.
4. **`ebay_fee_reconciliations.finances_api_raw` & `ebay_webhook_events.raw_payload` ([outpost/auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql#L288-L325))**:
   - Stores raw eBay Finances API transaction arrays and raw webhook JSON blobs without normalizing individual fee line items.

---

### 2.2 Target Schema Additions (`outpost/auction-schema.sql` & `outpost/migrations/0011_deep_normalization.sql`)

```sql
-- ============================================================
-- MIGRATION 0011: DEEP RELATIONAL NORMALIZATION (outpost-db)
-- ============================================================

-- 1. Normalized Multi-Image Gallery per Inventory Item
-- Replaces attributes.image_urls / attributes.images JSON array
CREATE TABLE IF NOT EXISTS auction_item_images (
  item_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  image_url    TEXT NOT NULL,
  is_primary   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, sort_order),
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_item_images_user ON auction_item_images(user_id, item_id);

-- 2. Normalized Item Specifics / Aspects & Bullet Features per Inventory Item
-- Replaces attributes.specs and attributes.features JSON blobs
CREATE TABLE IF NOT EXISTS auction_item_specs (
  item_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  spec_type    TEXT NOT NULL DEFAULT 'aspect' CHECK(spec_type IN ('aspect', 'feature', 'included')),
  spec_key     TEXT NOT NULL,
  spec_value   TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, spec_type, spec_key),
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_item_specs_item ON auction_item_specs(item_id, spec_type, sort_order);

-- 3. Normalized Cross-Platform Listing Identifiers
-- Replaces auction_items.other_platform_listing_ids JSON blob
CREATE TABLE IF NOT EXISTS auction_item_platform_listings (
  item_id              TEXT NOT NULL,
  user_id              TEXT NOT NULL,
  platform_name        TEXT NOT NULL,
  external_listing_id  TEXT NOT NULL,
  listing_url          TEXT,
  status               TEXT NOT NULL DEFAULT 'Listed',
  synced_at            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, platform_name),
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_item_plat_listings_ext
  ON auction_item_platform_listings(platform_name, external_listing_id);

-- 4. Normalized eBay Order Fee Breakdown Lines
-- Replaces opaque ebay_fee_reconciliations.finances_api_raw JSON array
CREATE TABLE IF NOT EXISTS ebay_reconciliation_fee_lines (
  id                 TEXT PRIMARY KEY,
  reconciliation_id  TEXT NOT NULL,
  sale_id            TEXT NOT NULL,
  user_id            TEXT NOT NULL,
  ebay_order_id      TEXT NOT NULL,
  transaction_type   TEXT NOT NULL, -- 'SALE', 'SHIPPING_LABEL', 'NON_SALE_CHARGE', 'REFUND'
  fee_type           TEXT NOT NULL, -- 'FINAL_VALUE_FEE', 'AD_FEE', 'REGULATORY_OPERATING_FEE', 'SHIPPING_LABEL', etc.
  amount             REAL NOT NULL DEFAULT 0.0,
  description        TEXT,
  occurred_at        TEXT,
  FOREIGN KEY (reconciliation_id) REFERENCES ebay_fee_reconciliations(id) ON DELETE CASCADE,
  FOREIGN KEY (sale_id) REFERENCES auction_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recon_fee_lines_recon ON ebay_reconciliation_fee_lines(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_recon_fee_lines_order ON ebay_reconciliation_fee_lines(ebay_order_id);
```

---

### 2.3 Backend Refactoring Steps in Outpost Tracker
1. **Normalize Item Images & Specs on Ingestion & Update**:
   - Create helper utility `outpost/functions/utils/normalizedItemStore.js` with strict `?` positional bindings (`FIN-AUDIT-001`):
     - `buildItemMediaAndSpecsStatements(db, userId, itemId, attributesObj, otherPlatformIds)`: Writes `image_urls` / `images` into `auction_item_images`, `specs` / `features` into `auction_item_specs`, and `other_platform_listing_ids` into `auction_item_platform_listings`.
     - Strips redundant keys from `auction_items.attributes` so `attributes` remains lightweight or `{}`.
   - Wire into:
     - [outpost/functions/api/import/amazon.js](file:///e:/TechTrekGT/outpost/functions/api/import/amazon.js) and [outpost/functions/api/import/amazon-url.js](file:///e:/TechTrekGT/outpost/functions/api/import/amazon-url.js)
     - [outpost/functions/api/items/index.js](file:///e:/TechTrekGT/outpost/functions/api/items/index.js) and [outpost/functions/api/items/[id].js](file:///e:/TechTrekGT/outpost/functions/api/items/[id].js)
     - [outpost/functions/api/sync/vinescout-catalog.js](file:///e:/TechTrekGT/outpost/functions/api/sync/vinescout-catalog.js)
2. **Eliminate Parallel JSON Arrays in `auction_item_analytics` ([outpost/functions/api/ebay/analytics.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js))**:
   - Serve all daily time-series arrays (`dates`, `impressions`, `promoted_impressions`, `page_views`, `ctr`, `conversion`) exclusively from the normalized `listing_traffic` table (`WHERE item_id = ? AND traffic_date >= ? AND traffic_date <= ? ORDER BY traffic_date ASC`).
   - Stop writing redundant `dates_json`, `impressions_json`, `promoted_impressions_json`, `page_views_json`, `ctr_json`, `conversion_json`, and `raw_response` blobs to `auction_item_analytics`.
3. **Normalize eBay Finances Fee Lines ([outpost/functions/api/ebay/reconcile.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/reconcile.js) & `sync-all.js`)**:
   - When persisting `ebay_fee_reconciliations`, write discrete fee line items (`FINAL_VALUE_FEE`, `AD_FEE`, `SHIPPING_LABEL`, `REGULATORY_OPERATING_FEE`) into `ebay_reconciliation_fee_lines` using `env.DB.batch([...])` and set `finances_api_raw = NULL` to prevent unbounded raw JSON bloat.
4. **Backfill Migration Script**:
   - Execute a one-off migration script to populate `auction_item_images`, `auction_item_specs`, and `ebay_reconciliation_fee_lines` from existing rows in `outpost-db`, and null out the legacy JSON array columns in `auction_item_analytics`.

---

### 2.4 Outpost Tracker Wrangler CLI Commands (PowerShell)

```powershell
Set-Location -Path "e:\TechTrekGT\outpost"

# 1. Apply Migration 0011 to local outpost-db
npx wrangler d1 execute outpost-db --local --file=./migrations/0011_deep_normalization.sql

# 2. Apply Migration 0011 to remote outpost-db
npx wrangler d1 execute outpost-db --remote --file=./migrations/0011_deep_normalization.sql
```

---

## 3. Execution & Verification Sequence (Upon Approval)

1. **Finance OS (`finance-os-db`)**:
   - Update `finance/finance-schema.sql` and `finance/schema.sql` with the 6 new normalized tables (`finance_account_statement_rows`, `finance_bill_splits`, `finance_person_allocations`, `finance_account_splits`, `finance_dashboard_widgets`, `finance_categories`) and explicit scalar columns.
   - Refactor `finance/functions/utils/structuredBudgetStore.js` and `finance/functions/utils/deleteAccount.js` to decompose and reconstruct all nested maps/arrays and store delta-only `extra_json`.
   - Execute schema and data backfill against local and remote `finance-os-db` and verify `finance_accounts.extra_json` drops from 69 KB to `< 50 bytes`.
   - Run `npm test` and `npm run test:unit`, synchronize `finance/docs/*` and root `docs/*`, and run `npm run build` & `npm run deploy`.
2. **Outpost Tracker (`outpost-db`)**:
   - Create `outpost/migrations/0011_deep_normalization.sql` and update `outpost/auction-schema.sql`.
   - Create `outpost/functions/utils/normalizedItemStore.js` and update item/analytics/reconciliation handlers to use `auction_item_images`, `auction_item_specs`, `auction_item_platform_listings`, `ebay_reconciliation_fee_lines`, and `listing_traffic`.
   - Execute schema and backfill against local and remote `outpost-db`.
   - Run Outpost tests (`npm test`), synchronize `outpost/docs/*` and root `docs/*`, and run `npm run build` & `npm run deploy`.

