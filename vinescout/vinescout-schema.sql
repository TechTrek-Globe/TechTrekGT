-- VScout Web Platform -- D1 Schema
-- Migration for personal-budget-db (shared TechTrekGT D1 instance)
-- Run: npm run db:migrate:local (local) | npm run db:migrate (production)
-- All migrations are strictly additive (CREATE TABLE IF NOT EXISTS).
-- No DROP TABLE, no TRUNCATE. ALTER TABLE ADD COLUMN if extending existing tables.

-- ============================================================
-- VINE ITEMS - Core scraped Vine item catalog
-- Natural unique key: (user_id, asin) - enforces idempotent upserts
-- from the extension cloud bridge. Worker uses INSERT OR REPLACE.
-- ============================================================
CREATE TABLE IF NOT EXISTS vine_items (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  asin                TEXT NOT NULL,
  title               TEXT NOT NULL,
  etv                 REAL NOT NULL DEFAULT 0.0,
  order_id            TEXT,
  date_added          TEXT,
  vine_category       TEXT,
  -- Known values: 'REGULAR' | 'LAST_CHANCE' | 'RFY' | 'AFA'
  category            TEXT,
  marketplace         TEXT NOT NULL DEFAULT 'amazon.com',
  image_url           TEXT,
  review_written      INTEGER NOT NULL DEFAULT 0,
  rating              REAL,
  review_id           TEXT,
  review_date         TEXT,
  -- Outpost write-back columns (stamped by outpost bi-directional sync engine)
  outpost_item_id     TEXT,
  outpost_liquidated  INTEGER NOT NULL DEFAULT 0,
  sale_price          REAL,
  sold_at             TEXT,
  ebay_order_id       TEXT,
  -- JSON blob for extensibility (specs, dimensions, condition, etc.)
  attributes          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vine_items_user_asin  ON vine_items(user_id, asin);
CREATE INDEX        IF NOT EXISTS idx_vine_items_user        ON vine_items(user_id);
CREATE INDEX        IF NOT EXISTS idx_vine_items_date        ON vine_items(user_id, date_added);
CREATE INDEX        IF NOT EXISTS idx_vine_items_category    ON vine_items(user_id, vine_category);
CREATE INDEX        IF NOT EXISTS idx_vine_items_reviewed    ON vine_items(user_id, review_written);

-- ============================================================
-- VINE ORDERS - Amazon order history scraped from order pages
-- One row per order_id per user. Soft-links to vine_items via item_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS vine_orders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  order_id    TEXT NOT NULL,
  asin        TEXT,
  item_id     TEXT,
  -- Soft reference to vine_items.id; no FK constraint (items may not exist yet)
  order_date  TEXT,
  marketplace TEXT NOT NULL DEFAULT 'amazon.com',
  status      TEXT,
  -- Known values: 'Shipped' | 'Delivered' | 'Returned' | 'Pending'
  etv         REAL,
  attributes  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vine_orders_user_order ON vine_orders(user_id, order_id);
CREATE INDEX        IF NOT EXISTS idx_vine_orders_user       ON vine_orders(user_id);
CREATE INDEX        IF NOT EXISTS idx_vine_orders_date       ON vine_orders(user_id, order_date);

-- ============================================================
-- VINE TAX SETTINGS - Per-user tax configuration mirror
-- Pushed from the extension popup.js tax reconciliation engine.
-- Source of truth for web app tax calculations.
-- ============================================================
CREATE TABLE IF NOT EXISTS vine_tax_settings (
  user_id              TEXT PRIMARY KEY,
  filing_status        TEXT NOT NULL DEFAULT 'single',
  -- Values: 'single' | 'married_jointly' | 'married_separately' | 'head_of_household'
  state_code           TEXT,
  state_tax_type       TEXT,
  -- Values: 'flat' | 'bracket' | 'none'
  state_tax_rate       REAL,
  se_deduction_pct     REAL NOT NULL DEFAULT 0.5,
  -- Self-employment deduction: 50% of SE tax (IRS standard)
  se_tax_rate          REAL NOT NULL DEFAULT 0.153,
  -- 15.3% (12.4% SS + 2.9% Medicare)
  use_qbi_deduction    INTEGER NOT NULL DEFAULT 1,
  -- Qualified Business Income deduction (20% of net SE income)
  custom_brackets_json TEXT,
  -- JSON array for custom state bracket overrides when state_tax_type = 'bracket'
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- VINE ASIN CACHE - Shared ASIN metadata cache
-- Populated by the extension and/or the Amazon gateway.
-- Avoids redundant scraping for the same ASIN across users.
-- NOT user-scoped (global cache keyed on asin).
-- ============================================================
CREATE TABLE IF NOT EXISTS vine_asin_cache (
  asin       TEXT PRIMARY KEY,
  title      TEXT,
  category   TEXT,
  image_url  TEXT,
  brand      TEXT,
  attributes TEXT,
  -- JSON blob: dimensions, weight, model_number, bullet_points
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  source     TEXT NOT NULL DEFAULT 'extension'
  -- Values: 'extension' | 'amazon_gateway' | 'manual'
);

CREATE INDEX IF NOT EXISTS idx_vine_asin_cache_fetched ON vine_asin_cache(fetched_at);
CREATE INDEX IF NOT EXISTS idx_vine_asin_cache_source  ON vine_asin_cache(source);
