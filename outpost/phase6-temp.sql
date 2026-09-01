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
