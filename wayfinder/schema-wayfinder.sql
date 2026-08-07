-- TechTrek Wayfinder - D1 Schema Extension
-- Extends the shared personal-budget-db with wayfinder-specific tables.
-- Existing tables (users, households, household_members) are inherited.

-- ============================================================
-- JOURNEYS - Top-level trip containers
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_journeys (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  tagline         TEXT,
  description     TEXT,
  hero_image_url  TEXT,
  start_month     TEXT,
  start_year      INTEGER,
  status          TEXT NOT NULL DEFAULT 'planning',
  visibility      TEXT NOT NULL DEFAULT 'private',
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- DESTINATIONS - Cities within a journey
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_destinations (
  id              TEXT PRIMARY KEY,
  journey_id      TEXT NOT NULL,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'Poland',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  stay_type       TEXT NOT NULL DEFAULT 'overnight',
  nights          INTEGER DEFAULT NULL,
  public_summary  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  UNIQUE(journey_id, slug)
);

-- ============================================================
-- ITINERARY ITEMS - All trip events (flights, hotels, rail, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_itinerary_items (
  id                  TEXT PRIMARY KEY,
  journey_id          TEXT NOT NULL,
  destination_id      TEXT,
  user_id             TEXT NOT NULL,
  item_type           TEXT NOT NULL,
  title               TEXT NOT NULL,
  provider            TEXT,
  status              TEXT NOT NULL DEFAULT 'planned',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  local_date          TEXT,
  local_time          TEXT,
  end_date            TEXT,
  end_time            TEXT,
  timezone            TEXT,
  location            TEXT,
  location_address    TEXT,
  notes               TEXT,
  source_document_id  TEXT,
  visibility          TEXT NOT NULL DEFAULT 'private',
  has_conflict        INTEGER NOT NULL DEFAULT 0,
  conflict_notes      TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id)      REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)         REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (destination_id)  REFERENCES wayfinder_destinations(id)
);

-- ============================================================
-- DOCUMENTS - Imported travel documents (PRIVATE PER USER)
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_documents (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  journey_id          TEXT,
  original_filename   TEXT NOT NULL,
  safe_display_name   TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  file_size_bytes     INTEGER,
  file_hash           TEXT,
  storage_key         TEXT,
  storage_status      TEXT NOT NULL DEFAULT 'pending_r2',
  upload_date         TEXT NOT NULL DEFAULT (datetime('now')),
  processing_status   TEXT NOT NULL DEFAULT 'pending',
  detected_provider   TEXT,
  detected_doc_type   TEXT,
  security_scan_status TEXT NOT NULL DEFAULT 'pending',
  extraction_version  INTEGER NOT NULL DEFAULT 0,
  retention_status    TEXT NOT NULL DEFAULT 'active',
  deleted_at          TEXT,
  deleted_by          TEXT,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id)
);

-- ============================================================
-- EXTRACTION JOBS - Processing state per document
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_extraction_jobs (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  raw_text        TEXT,
  page_count      INTEGER,
  started_at      TEXT,
  completed_at    TEXT,
  reviewed_at     TEXT,
  reviewed_by     TEXT,
  review_decision TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES wayfinder_documents(id) ON DELETE CASCADE
);

-- ============================================================
-- EXTRACTED FIELDS - Field-level extraction results
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_extracted_fields (
  id                  TEXT PRIMARY KEY,
  extraction_job_id   TEXT NOT NULL,
  document_id         TEXT NOT NULL,
  field_name          TEXT NOT NULL,
  extracted_value     TEXT,
  display_value       TEXT,
  confidence          TEXT NOT NULL DEFAULT 'low',
  source_page         INTEGER,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  is_editable         INTEGER NOT NULL DEFAULT 1,
  user_value          TEXT,
  visibility_class    TEXT NOT NULL DEFAULT 'private',
  is_sensitive        INTEGER NOT NULL DEFAULT 0,
  requires_confirm    INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (extraction_job_id) REFERENCES wayfinder_extraction_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id)       REFERENCES wayfinder_documents(id) ON DELETE CASCADE
);

-- ============================================================
-- EXPENSES - Cost tracking (extracted from documents or manual)
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_expenses (
  id                  TEXT PRIMARY KEY,
  journey_id          TEXT NOT NULL,
  itinerary_item_id   TEXT,
  document_id         TEXT,
  user_id             TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'other',
  description         TEXT NOT NULL,
  amount_original     REAL,
  currency_original   TEXT,
  amount_usd          REAL,
  exchange_rate       REAL,
  exchange_rate_date  TEXT,
  exchange_rate_source TEXT,
  is_converted        INTEGER NOT NULL DEFAULT 0,
  is_refundable       INTEGER NOT NULL DEFAULT 0,
  refund_status       TEXT NOT NULL DEFAULT 'na',
  cancellation_deadline TEXT,
  paid_status         TEXT NOT NULL DEFAULT 'unknown',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id)           REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)              REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (itinerary_item_id)    REFERENCES wayfinder_itinerary_items(id),
  FOREIGN KEY (document_id)          REFERENCES wayfinder_documents(id)
);

-- ============================================================
-- AUDIT EVENTS - Immutable audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_audit_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  journey_id  TEXT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  details     TEXT,
  ip_address  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_wf_journeys_slug    ON wayfinder_journeys(slug);
CREATE INDEX IF NOT EXISTS idx_wf_journeys_creator ON wayfinder_journeys(created_by);
CREATE INDEX IF NOT EXISTS idx_wf_dest_journey     ON wayfinder_destinations(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_items_journey    ON wayfinder_itinerary_items(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_items_user       ON wayfinder_itinerary_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_items_date       ON wayfinder_itinerary_items(local_date);
CREATE INDEX IF NOT EXISTS idx_wf_docs_user        ON wayfinder_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_docs_journey     ON wayfinder_documents(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_docs_hash        ON wayfinder_documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_wf_fields_job       ON wayfinder_extracted_fields(extraction_job_id);
CREATE INDEX IF NOT EXISTS idx_wf_expenses_journey ON wayfinder_expenses(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_audit_user       ON wayfinder_audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_audit_entity     ON wayfinder_audit_events(entity_type, entity_id);
