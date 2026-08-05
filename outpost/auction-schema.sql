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
  item_id                 TEXT NOT NULL,
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
  roi_pct                 REAL NOT NULL DEFAULT 0.0,
  days_to_sell            INTEGER,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_auction_sales_user ON auction_sales(user_id);
CREATE INDEX IF NOT EXISTS idx_auction_sales_item ON auction_sales(item_id);

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
