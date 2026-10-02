-- Prestine Auction Tracker -- D1 Schema
-- Run: npm run db:migrate (remote) or npm run db:migrate:local (local)
-- Adds auction_* tables to the shared personal-budget-db alongside Finance tables.

-- ============================================================
-- AUCTION INVOICES (purchase batches)
-- ============================================================
CREATE TABLE IF NOT EXISTS auction_invoices (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  invoice_ref   TEXT NOT NULL,
  description   TEXT,
  base_total    REAL NOT NULL DEFAULT 0.0,
  discount      REAL NOT NULL DEFAULT 0.0,
  shipping      REAL NOT NULL DEFAULT 0.0,
  tax           REAL NOT NULL DEFAULT 0.0,
  date_acquired TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auction_invoices_user ON auction_invoices(user_id);

-- ============================================================
-- AUCTION ITEMS (signed memorabilia pieces)
-- ============================================================
CREATE TABLE IF NOT EXISTS auction_items (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  invoice_id            TEXT NOT NULL,

  item_name             TEXT NOT NULL,
  category              TEXT,
  sport_genre           TEXT,
  athlete_person        TEXT,
  authenticator         TEXT,
  cert_number           TEXT,

  unit_price            REAL NOT NULL DEFAULT 0.0,
  item_base_total       REAL NOT NULL DEFAULT 0.0,
  proration_weight      REAL NOT NULL DEFAULT 0.0,
  prorated_discount     REAL NOT NULL DEFAULT 0.0,
  prorated_shipping     REAL NOT NULL DEFAULT 0.0,
  prorated_tax          REAL NOT NULL DEFAULT 0.0,
  true_total_cost       REAL NOT NULL DEFAULT 0.0,

  status                TEXT NOT NULL DEFAULT 'Available',
  platform              TEXT,
  platform_fee_pct      REAL NOT NULL DEFAULT 0.0,
  platform_flat_fee     REAL NOT NULL DEFAULT 0.0,
  est_shipping_cost     REAL NOT NULL DEFAULT 0.0,
  buyer_shipping_cost   REAL DEFAULT 0.0,
  boost_pct             REAL NOT NULL DEFAULT 0.0,
  min_sell_price        REAL NOT NULL DEFAULT 0.0,
  suggested_list_price  REAL NOT NULL DEFAULT 0.0,
  current_list_price    REAL,
  actual_sell_price     REAL,
  target_margin_pct     REAL NOT NULL DEFAULT 0.0,

  date_acquired         TEXT,
  date_listed           TEXT,
  date_sold             TEXT,
  days_on_market        INTEGER,

  notes                 TEXT,
  best_listing_window   TEXT,

  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES auction_invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auction_items_user    ON auction_items(user_id);
CREATE INDEX IF NOT EXISTS idx_auction_items_invoice ON auction_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_auction_items_status  ON auction_items(status);

-- ============================================================
-- AUCTION SALES (completed sale records)
-- ============================================================
CREATE TABLE IF NOT EXISTS auction_sales (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  item_id                 TEXT NOT NULL UNIQUE,
  sale_date               TEXT NOT NULL,
  platform                TEXT NOT NULL,
  buyer_handle            TEXT,
  gross_sale_price        REAL NOT NULL DEFAULT 0.0,
  buyer_shipping_paid     REAL NOT NULL DEFAULT 0.0,
  actual_shipping_cost    REAL NOT NULL DEFAULT 0.0,
  platform_fee_pct        REAL NOT NULL DEFAULT 0.0,
  platform_flat_fee       REAL NOT NULL DEFAULT 0.0,
  platform_fees_amt       REAL NOT NULL DEFAULT 0.0,
  payment_processing_amt  REAL NOT NULL DEFAULT 0.0,
  promoted_listing_fee    REAL NOT NULL DEFAULT 0.0,
  net_proceeds            REAL NOT NULL DEFAULT 0.0,
  true_total_cost         REAL NOT NULL DEFAULT 0.0,
  net_profit              REAL NOT NULL DEFAULT 0.0,
  -- UNIT (T-09): roi_pct is a FRACTION, not a percentage. 0.35 means 35% ROI.
  -- Display code (formulaPreview.fmtPct) multiplies by 100 for rendering.
  -- Never store 35.0 here: POST /api/ebay/match-sold-vinescout used to do exactly
  -- that, which rendered as 3500% beside a correct portfolio figure.
  -- Produced exclusively by computeSaleMetrics() in functions/utils/auction.js.
  --
  -- The CHECK enforces DERIVATION, not a range. Deliberately NO lower bound:
  -- roi_pct = net_profit / true_total_cost, and net_profit = net_proceeds - cost,
  -- so any sale whose net proceeds are negative yields roi_pct < -1. That is a
  -- supported case, not a unit error: T-06 pins a $6.00 sale with $6.50 shipping
  -- on a $5.00 item at roi_pct = -1.344, and a worse one reaches -12.5. A
  -- "roi_pct >= -1" guard would reject those legitimate loss sales at INSERT.
  --
  -- A consistency test IS safe, and it is what actually catches a leaked
  -- percentage: net_profit and true_total_cost are unit-unambiguous dollars, so
  -- a row written in percent convention cannot satisfy this unless it also
  -- corrupted those columns. The 0.01 window is deliberately looser than the
  -- 0.0001 needed to absorb the migration's 4-decimal ROUND, because hand-written
  -- admin SQL has historically stored rounded values such as 0.848 for an exact
  -- 0.8483478. It is still ~9900x tighter than the smallest possible unit error
  -- (a leak is 100x the true value, so |leak - true| = 99 * |roi|), which is
  -- orders of magnitude larger than any rounding a human or this codebase
  -- produces. Rows with no positive cost basis are exempt, which keeps every
  -- legitimate zero-cost / $0-ETV Vine flip insertable and updatable.
  roi_pct                 REAL NOT NULL DEFAULT 0.0
                            CHECK (
                              true_total_cost IS NULL
                              OR true_total_cost <= 0
                              OR ABS(roi_pct - (net_profit / true_total_cost)) < 0.01
                            ),
  days_to_sell            INTEGER,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_auction_sales_user ON auction_sales(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_sales_item ON auction_sales(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_sales_item_unique ON auction_sales(item_id);

-- ============================================================
-- AUCTION COMPS (pricing intelligence per item)
-- ============================================================
CREATE TABLE IF NOT EXISTS auction_comps (
  id                     TEXT PRIMARY KEY,
  item_id                TEXT NOT NULL,
  user_id                TEXT NOT NULL,
  comp_1                 REAL,
  comp_2                 REAL,
  comp_3                 REAL,
  manual_avg             REAL,
  live_avg               REAL,
  ebay_search_url        TEXT,
  recommended_list_price REAL,
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_comps_item ON auction_comps(item_id);

-- ============================================================
-- AUCTION PLATFORMS (fee reference table)
-- ============================================================
CREATE TABLE IF NOT EXISTS auction_platforms (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  fee_pct     REAL NOT NULL DEFAULT 0.0,
  flat_fee    REAL NOT NULL DEFAULT 0.0,
  notes       TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- AUCTION SUPPLIES (packaging, mailers, slabs, overhead)
-- ============================================================
CREATE TABLE IF NOT EXISTS auction_supplies (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Packaging',
  purchase_date TEXT NOT NULL,
  cost          REAL NOT NULL DEFAULT 0.0,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_cost     REAL NOT NULL DEFAULT 0.0,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auction_supplies_user ON auction_supplies(user_id);

-- ============================================================
-- PASSWORD RESETS (server-side reset sessions)
-- ============================================================
CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email, used);

-- ============================================================
-- USERS TABLE - additional columns for security Q&A
-- (applied via ALTER TABLE on first migration if not present)
-- ============================================================
-- ALTER TABLE users ADD COLUMN security_question TEXT;
-- ALTER TABLE users ADD COLUMN security_answer_hash TEXT;

-- ============================================================
-- MARKET ALERTS (Feature B)
-- ============================================================
CREATE TABLE IF NOT EXISTS auction_market_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,       -- 'SPIKE' or 'DROP'
  old_value REAL NOT NULL,
  new_value REAL NOT NULL,
  percentage_change REAL NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE
);

-- ============================================================
-- PHASE 3 MIGRATIONS - eBay Real-Time Sync Engine
-- Added: 2026-08-29
-- All migrations are additive (CREATE IF NOT EXISTS + ALTER ADD COLUMN).
-- Run: npm run db:migrate:local (local) | npm run db:migrate (production)
-- ============================================================

-- P3-1: eBay User OAuth Tokens (Authorization Code Grant)
CREATE TABLE IF NOT EXISTS ebay_oauth_tokens (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL UNIQUE,
  access_token       TEXT NOT NULL,
  refresh_token      TEXT NOT NULL,
  access_token_exp   TEXT NOT NULL,
  refresh_token_exp  TEXT NOT NULL,
  scopes             TEXT NOT NULL,
  ebay_user_id       TEXT,
  connected_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_refreshed_at  TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ebay_oauth_user ON ebay_oauth_tokens(user_id);

-- P3-2: eBay Webhook Event Log
CREATE TABLE IF NOT EXISTS ebay_webhook_events (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  ebay_item_id    TEXT,
  ebay_order_id   TEXT,
  raw_payload     TEXT NOT NULL,
  processed       INTEGER NOT NULL DEFAULT 0,
  processed_at    TEXT,
  error_message   TEXT,
  received_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON ebay_webhook_events(processed, received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_item ON ebay_webhook_events(ebay_item_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON ebay_webhook_events(ebay_order_id);

-- P3-3: eBay Fee Reconciliations (Finances API actual charges per sale)
CREATE TABLE IF NOT EXISTS ebay_fee_reconciliations (
  id                      TEXT PRIMARY KEY,
  sale_id                 TEXT NOT NULL,
  user_id                 TEXT NOT NULL,
  ebay_order_id           TEXT NOT NULL,
  ebay_transaction_id     TEXT,
  final_value_fee         REAL NOT NULL DEFAULT 0.0,
  promoted_listing_fee    REAL NOT NULL DEFAULT 0.0,
  shipping_label_cost     REAL NOT NULL DEFAULT 0.0,
  payment_processing_fee  REAL NOT NULL DEFAULT 0.0,
  regulatory_fee          REAL NOT NULL DEFAULT 0.0,
  total_ebay_fees         REAL NOT NULL DEFAULT 0.0,
  estimated_fees          REAL NOT NULL DEFAULT 0.0,
  fee_delta               REAL NOT NULL DEFAULT 0.0,
  reconciled_net_profit   REAL NOT NULL DEFAULT 0.0,
  promoted_listing_rate   REAL,
  promoted_listing_active INTEGER DEFAULT 0,
  finances_api_raw        TEXT,
  reconciled_at           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sale_id) REFERENCES auction_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_recon_sale ON ebay_fee_reconciliations(sale_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_recon_order ON ebay_fee_reconciliations(ebay_order_id);
CREATE INDEX IF NOT EXISTS idx_fee_recon_user ON ebay_fee_reconciliations(user_id);

-- P3-4: auction_items column additions (cross-listing defense + cert mapping)
ALTER TABLE auction_items ADD COLUMN ebay_listing_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_ebay_listing
  ON auction_items(ebay_listing_id) WHERE ebay_listing_id IS NOT NULL;
ALTER TABLE auction_items ADD COLUMN cert_verification_url TEXT;
ALTER TABLE auction_items ADD COLUMN other_platform_listing_ids TEXT;
ALTER TABLE auction_items ADD COLUMN ebay_promoted_rate REAL;

-- P3-5: auction_sales column additions (eBay order tracking + reconciliation flag)
ALTER TABLE auction_sales ADD COLUMN ebay_order_id TEXT;
ALTER TABLE auction_sales ADD COLUMN fee_reconciled_at TEXT;

-- ============================================================
-- PHASE 4 MIGRATIONS - Inventory & Pricing Engine Rebuild
-- Added: 2026-08-30
-- Additive columns for eBay listing details, comps, and pricing
-- ============================================================

-- P4-1: auction_items column additions (SKU, listing metadata, quantity, custom floor/BIN)
ALTER TABLE auction_items ADD COLUMN sku TEXT;
ALTER TABLE auction_items ADD COLUMN listing_format TEXT;
ALTER TABLE auction_items ADD COLUMN listing_status TEXT;
ALTER TABLE auction_items ADD COLUMN quantity INTEGER DEFAULT 1;
ALTER TABLE auction_items ADD COLUMN purchase_date TEXT;
ALTER TABLE auction_items ADD COLUMN floor_price REAL;
ALTER TABLE auction_items ADD COLUMN buy_it_now_price REAL;

-- P4-2: auction_comps column additions (Active comps and sold count)
ALTER TABLE auction_comps ADD COLUMN active_comp_1 REAL;
ALTER TABLE auction_comps ADD COLUMN active_comp_2 REAL;
ALTER TABLE auction_comps ADD COLUMN active_comp_3 REAL;
ALTER TABLE auction_comps ADD COLUMN active_avg REAL;
ALTER TABLE auction_comps ADD COLUMN sold_count INTEGER DEFAULT 0;

-- ============================================================
-- PHASE 5 MIGRATIONS - eBay Sell Analytics & Performance Engine
-- Added: 2026-08-30
-- Listing performance traffic data (impressions, page views, CTR, conversion)
-- ============================================================

-- P5-1: Listing performance analytics (eBay Sell Analytics API traffic data)
CREATE TABLE IF NOT EXISTS auction_item_analytics (
  id                        TEXT PRIMARY KEY,
  item_id                   TEXT NOT NULL,
  user_id                   TEXT NOT NULL,
  ebay_listing_id           TEXT NOT NULL,
  period_start              TEXT NOT NULL,
  period_end                TEXT NOT NULL,
  granularity               TEXT NOT NULL DEFAULT 'DAY',
  range_days                INTEGER NOT NULL DEFAULT 30,
  total_impressions         INTEGER DEFAULT 0,
  promoted_impressions      INTEGER DEFAULT 0,
  organic_impressions       INTEGER DEFAULT 0,
  total_page_views          INTEGER DEFAULT 0,
  click_through_rate        REAL DEFAULT 0.0,
  sales_conversion_rate     REAL DEFAULT 0.0,
  dates_json                TEXT,
  impressions_json          TEXT,
  promoted_impressions_json TEXT,
  page_views_json           TEXT,
  ctr_json                  TEXT,
  conversion_json           TEXT,
  raw_response              TEXT,
  fetched_at                TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analytics_item ON auction_item_analytics(item_id, range_days);
CREATE INDEX IF NOT EXISTS idx_analytics_ebay ON auction_item_analytics(ebay_listing_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON auction_item_analytics(user_id);

-- P5-2: auction_items column additions (snapshot KPI columns for quick access)
ALTER TABLE auction_items ADD COLUMN analytics_fetched_at TEXT;
ALTER TABLE auction_items ADD COLUMN total_impressions_30d INTEGER DEFAULT 0;
ALTER TABLE auction_items ADD COLUMN total_page_views_30d INTEGER DEFAULT 0;
ALTER TABLE auction_items ADD COLUMN avg_ctr_30d REAL DEFAULT 0.0;
ALTER TABLE auction_items ADD COLUMN avg_conversion_30d REAL DEFAULT 0.0;

-- ============================================================
-- PHASE 6 MIGRATIONS - Amazon Ingestion, Market Comps & Traffic
-- Added: 2026-09-01
-- All migrations are additive (CREATE IF NOT EXISTS + ALTER ADD COLUMN).
-- Run: npm run db:migrate:local (local) | npm run db:migrate (production)
-- NOTE: Execute ALTER TABLE statements individually; SQLite D1 does not
--       support transactional DDL mixing ALTER TABLE + CREATE TABLE in one batch.
-- ============================================================

-- P6-1: Structured attributes JSON column on auction_items.
-- Stores Amazon-specific identifiers (ASIN, image_urls, specs, ETV, order_id, condition)
-- as a JSON TEXT blob. Query individual keys via json_extract(attributes, '$.asin').
ALTER TABLE auction_items ADD COLUMN attributes TEXT;

-- P6-2: Net profit audit columns on auction_sales.
-- net_profit_formula stores the full calculation breakdown as a JSON TEXT blob.
-- cogs_source tags the origin of the COGS value for ledger reconciliation.
ALTER TABLE auction_sales ADD COLUMN net_profit_formula TEXT;
ALTER TABLE auction_sales ADD COLUMN cogs_source TEXT DEFAULT 'manual';
-- cogs_source values: 'amazon_vine' | 'amazon_url' | 'manual' | 'invoice'

-- ============================================================
-- P6-3: Market Comps Engine
-- Normalized comp observations table. One row per comparable item.
-- Replaces the scalar comp_1/comp_2/comp_3 slot system in auction_comps
-- (auction_comps is retained as a read fallback; no DROP).
-- ============================================================
CREATE TABLE IF NOT EXISTS market_comps (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,

  -- Source of this comp row
  source          TEXT NOT NULL DEFAULT 'manual',
  -- 'ebay_browse' = active eBay listing from Browse API
  -- 'ebay_sold'   = completed/sold eBay listing
  -- 'manual'      = user-entered via UI

  -- Pricing data
  comp_title      TEXT,
  list_price      REAL,
  shipping_fee    REAL NOT NULL DEFAULT 0.0,
  landed_cost     REAL,
  -- landed_cost = list_price + shipping_fee (computed on insert in Worker)

  -- eBay condition classification
  condition_id    TEXT,
  -- Known IDs: 1000=New, 1500=New other, 2500=Seller refurb, 3000=Used, 7000=For Parts
  -- Rows with condition_id = '7000' are auto-set is_valid = 0
  condition_label TEXT,

  -- Comp metadata
  ebay_item_id    TEXT,
  comp_url        TEXT,
  observed_at     TEXT NOT NULL DEFAULT (datetime('now')),

  -- Validity flag - 0 excluded from median benchmark calculations
  -- Invalid when: condition_id='7000', list_price<=0, extreme outlier, or user-flagged
  is_valid        INTEGER NOT NULL DEFAULT 1,

  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_comps_item   ON market_comps(item_id, is_valid);
CREATE INDEX IF NOT EXISTS idx_market_comps_user   ON market_comps(user_id);
CREATE INDEX IF NOT EXISTS idx_market_comps_source ON market_comps(item_id, source, observed_at);

-- ============================================================
-- P6-4: Per-day listing traffic time-series
-- One row per ebay_listing_id per day (UNIQUE constraint enforces deduplication).
-- Coexists with auction_item_analytics (aggregate 30-day windows).
-- This table is the append-only store for per-day trend charts and drill-downs.
-- ============================================================
CREATE TABLE IF NOT EXISTS listing_traffic (
  id                    TEXT PRIMARY KEY,
  item_id               TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  ebay_listing_id       TEXT NOT NULL,

  -- Date of the datapoint in Pacific Time (YYYYMMDD format, e.g. '20260901')
  traffic_date          TEXT NOT NULL,

  -- eBay Sell Analytics API metric values
  impressions_total     INTEGER DEFAULT 0,
  -- Maps to: LISTING_IMPRESSION_TOTAL (all search + non-search impressions)
  impressions_search    INTEGER DEFAULT 0,
  -- Maps to: LISTING_IMPRESSION_SEARCH_RESULTS_PAGE (search results page only)
  page_views_total      INTEGER DEFAULT 0,
  -- Maps to: LISTING_VIEWS_TOTAL (listing page views / clicks into item)
  click_through_rate    REAL DEFAULT 0.0,
  -- Maps to: CLICK_THROUGH_RATE (page_views / impressions as decimal)
  sales_conversion_rate REAL DEFAULT 0.0,
  -- Maps to: SALES_CONVERSION_RATE (units_sold / page_views as decimal)

  fetched_at            TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  -- Deduplication: one row per listing per calendar day
  UNIQUE(ebay_listing_id, traffic_date)
);

CREATE INDEX IF NOT EXISTS idx_traffic_item_date ON listing_traffic(item_id, traffic_date);
CREATE INDEX IF NOT EXISTS idx_traffic_ebay_date ON listing_traffic(ebay_listing_id, traffic_date);
CREATE INDEX IF NOT EXISTS idx_traffic_user      ON listing_traffic(user_id);

-- ============================================================
-- PHASE 7 MIGRATIONS - Bi-Directional Sync Engine
-- Added: 2026-09-02
-- Additive only (CREATE TABLE IF NOT EXISTS). No DROP or ALTER.
-- Run: npm run db:migrate:local (local) | npm run db:migrate (production)
-- ============================================================

-- P7-1: Per-user sync automation preferences (eBay auto-sync + VScout auto-sync)
CREATE TABLE IF NOT EXISTS outpost_sync_settings (
  user_id                TEXT PRIMARY KEY,
  ebay_auto_sync         INTEGER NOT NULL DEFAULT 0,
  ebay_sync_interval_m   INTEGER NOT NULL DEFAULT 30,
  vscout_auto_sync       INTEGER NOT NULL DEFAULT 0,
  vscout_sync_interval_m INTEGER NOT NULL DEFAULT 60,
  last_ebay_sync_at      TEXT,
  last_vscout_sync_at    TEXT,
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_settings_user ON outpost_sync_settings(user_id);

-- ============================================================
-- HIGH-2 MIGRATION - Per-Installation API Integration Secrets
-- Table: api_integrations
-- Replaces shared OUTPOST_SECRET_KEY with per-user/device hashed secrets
-- ============================================================
CREATE TABLE IF NOT EXISTS api_integrations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  label       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at  TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_integrations_hash ON api_integrations(secret_hash);
CREATE INDEX IF NOT EXISTS idx_api_integrations_user ON api_integrations(user_id);

-- ============================================================
-- EMAIL VERIFICATIONS (MED-3)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verifications (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  token      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  change_type TEXT DEFAULT 'register',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id, used);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token, used);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email, token);

-- ============================================================
-- MED-9 MIGRATION: UNIQUE CONSTRAINT ON AUCTION_SALES(ITEM_ID)
-- Prevents duplicate sale records and reconciliation race conditions
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_sales_item_unique ON auction_sales(item_id);

-- ============================================================
-- MED-15 MIGRATION: EBAY LISTINGS CACHE TABLE
-- Caches active seller listings per user with 15-minute TTL
-- ============================================================
CREATE TABLE IF NOT EXISTS ebay_listings_cache (
  user_id       TEXT PRIMARY KEY,
  listings_json TEXT NOT NULL,
  fetched_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ebay_listings_cache_user ON ebay_listings_cache(user_id);

-- ============================================================
-- LOW-2 MIGRATION: INDEX ON AUCTION_ITEMS(USER_ID, SKU)
-- Optimizes SKU collision detection and uniqueness lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_auction_items_user_sku ON auction_items(user_id, sku);

-- ============================================================
-- T-02 MIGRATION: IMPORT BATCH ID COLUMNS
-- Stamps every row created during batch import so that
-- partial-failure recovery can delete only new rows.
-- ============================================================
ALTER TABLE auction_invoices ADD COLUMN import_batch_id TEXT;
ALTER TABLE auction_items ADD COLUMN import_batch_id TEXT;
ALTER TABLE auction_sales ADD COLUMN import_batch_id TEXT;
ALTER TABLE auction_comps ADD COLUMN import_batch_id TEXT;

-- ============================================================
-- AUDIT-003 MIGRATION: SYNC HISTORY & STATUS TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS outpost_sync_history (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  sync_type       TEXT NOT NULL,
  status          TEXT NOT NULL,
  items_total     INTEGER NOT NULL DEFAULT 0,
  items_synced    INTEGER NOT NULL DEFAULT 0,
  items_failed    INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  details         TEXT,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_history_user ON outpost_sync_history(user_id, started_at DESC);

ALTER TABLE outpost_sync_settings ADD COLUMN last_ebay_sync_status TEXT;
ALTER TABLE outpost_sync_settings ADD COLUMN last_ebay_sync_error TEXT;
ALTER TABLE outpost_sync_settings ADD COLUMN last_vscout_sync_status TEXT;
ALTER TABLE outpost_sync_settings ADD COLUMN last_vscout_sync_error TEXT;
