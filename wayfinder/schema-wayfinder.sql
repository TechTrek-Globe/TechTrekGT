-- TechTrek Wayfinder - Dedicated Cloudflare D1 Schema (wayfinder-db)
-- Self-contained 16-table normalized schema for Wayfinder Guide.

-- ============================================================
-- 1. CORE IDENTITY & AUTHENTICATION TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  salt                  TEXT DEFAULT '',
  iterations            INTEGER NOT NULL DEFAULT 100000,
  name                  TEXT NOT NULL DEFAULT '',
  security_question     TEXT,
  security_answer_hash  TEXT,
  role                  TEXT NOT NULL DEFAULT 'user',
  token_version         INTEGER NOT NULL DEFAULT 1,
  is_admin              INTEGER NOT NULL DEFAULT 0,
  api_key_enabled       INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Suspended')),
  email_verified        INTEGER NOT NULL DEFAULT 0,
  email_verified_at     TEXT,
  pending_email         TEXT,
  sign_in_count         INTEGER NOT NULL DEFAULT 0,
  created_app           TEXT DEFAULT 'wayfinder',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS email_verifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  email       TEXT NOT NULL COLLATE NOCASE,
  token       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id, used);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email, used, created_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  email       TEXT NOT NULL COLLATE NOCASE,
  token       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_email_token ON password_resets(email, token);
CREATE INDEX IF NOT EXISTS idx_password_resets_email_used ON password_resets(email, used, created_at);

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
  start_date      TEXT,
  end_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'planning',
  visibility      TEXT NOT NULL DEFAULT 'private',
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
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
  id                   TEXT PRIMARY KEY,
  journey_id           TEXT NOT NULL,
  destination_id       TEXT,
  user_id              TEXT NOT NULL,
  item_type            TEXT NOT NULL,
  title                TEXT NOT NULL,
  provider             TEXT,
  supplier             TEXT,
  confirmation_number  TEXT,
  booking_reference    TEXT,
  status               TEXT NOT NULL DEFAULT 'planned',
  verification_status  TEXT NOT NULL DEFAULT 'unverified',
  local_date           TEXT,
  local_time           TEXT,
  end_date             TEXT,
  end_time             TEXT,
  timezone             TEXT,
  location             TEXT,
  location_address     TEXT,
  origin               TEXT,
  destination          TEXT,
  room_type            TEXT,
  seat                 TEXT,
  guests               TEXT,
  tickets              TEXT,
  language             TEXT,
  duration             TEXT,
  pickup_window        TEXT,
  bag_restriction      TEXT,
  mobile_ticket_url    TEXT,
  activity_details_url TEXT,
  import_source        TEXT DEFAULT 'manual',
  notes                TEXT,
  source_document_id   TEXT,
  purchase_site        TEXT,
  payment_method       TEXT,
  visibility           TEXT NOT NULL DEFAULT 'private',
  has_conflict         INTEGER NOT NULL DEFAULT 0,
  conflict_notes       TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
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
-- DOCUMENT BLOBS - Authenticated chunked binary storage in D1
-- Replaces unauthenticated static PDFs and handles payloads > 1MB safely
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_document_blobs (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 1,
  mime_type    TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  sha256_hash  TEXT,
  chunk_b64    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES wayfinder_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_wf_doc_blobs_doc ON wayfinder_document_blobs(document_id, chunk_index);

-- ============================================================
-- EXTRACTION JOBS - Processing state per document
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_extraction_jobs (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL UNIQUE,
  user_id         TEXT,
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
  paid_by_name        TEXT,
  paid_by_user_id     TEXT,
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
  purchase_site       TEXT,
  payment_method      TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id)           REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)              REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (itinerary_item_id)    REFERENCES wayfinder_itinerary_items(id),
  FOREIGN KEY (document_id)          REFERENCES wayfinder_documents(id)
);

-- ============================================================
-- EXPENSE SPLITS - Shared cost allocations
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_expense_splits (
  id              TEXT PRIMARY KEY,
  expense_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  user_name       TEXT,
  amount_owed     REAL NOT NULL,
  percentage      REAL,
  is_settled      INTEGER NOT NULL DEFAULT 0,
  settled_at      TEXT,
  settle_method   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (expense_id) REFERENCES wayfinder_expenses(id) ON DELETE CASCADE
);

-- ============================================================
-- AUDIT EVENTS - Immutable audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_audit_events (
  id               TEXT PRIMARY KEY,
  user_id          TEXT,
  journey_id       TEXT,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  action           TEXT NOT NULL,
  target_user_id   TEXT,
  target_email     TEXT,
  previous_value   TEXT,
  new_value        TEXT,
  metadata_summary TEXT,
  details          TEXT,
  ip_address       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_wf_journeys_slug      ON wayfinder_journeys(slug);
CREATE INDEX IF NOT EXISTS idx_wf_journeys_creator   ON wayfinder_journeys(created_by);
CREATE INDEX IF NOT EXISTS idx_wf_dest_journey       ON wayfinder_destinations(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_items_journey      ON wayfinder_itinerary_items(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_items_journey_type ON wayfinder_itinerary_items(journey_id, item_type);
CREATE INDEX IF NOT EXISTS idx_wf_items_source_doc   ON wayfinder_itinerary_items(source_document_id);
CREATE INDEX IF NOT EXISTS idx_wf_items_user         ON wayfinder_itinerary_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_items_date         ON wayfinder_itinerary_items(local_date);
CREATE INDEX IF NOT EXISTS idx_wf_items_confirmation ON wayfinder_itinerary_items(confirmation_number);
CREATE INDEX IF NOT EXISTS idx_wf_docs_user          ON wayfinder_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_docs_user_deleted  ON wayfinder_documents(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_wf_docs_journey       ON wayfinder_documents(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_docs_hash          ON wayfinder_documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_wf_jobs_user          ON wayfinder_extraction_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_fields_job         ON wayfinder_extracted_fields(extraction_job_id);
CREATE INDEX IF NOT EXISTS idx_wf_fields_doc         ON wayfinder_extracted_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_wf_expenses_journey   ON wayfinder_expenses(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_expenses_doc       ON wayfinder_expenses(document_id);
CREATE INDEX IF NOT EXISTS idx_wf_splits_expense     ON wayfinder_expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_wf_splits_user        ON wayfinder_expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_audit_user         ON wayfinder_audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_audit_entity       ON wayfinder_audit_events(entity_type, entity_id);

-- ============================================================
-- EMAIL INBOXES - Unique per-user/per-journey forwarding addresses
-- Format: TT<token>.<journey_slug>@techtrekgt.com
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_email_inboxes (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  journey_id      TEXT NOT NULL,
  inbox_token     TEXT NOT NULL,        -- short random token used in address local-part
  email_address   TEXT NOT NULL UNIQUE, -- full address e.g. TT412312.poland2026@techtrekgt.com
  is_active       INTEGER NOT NULL DEFAULT 1,
  emails_received INTEGER NOT NULL DEFAULT 0,
  last_received_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  UNIQUE(user_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_wf_inboxes_email   ON wayfinder_email_inboxes(email_address);
CREATE INDEX IF NOT EXISTS idx_wf_inboxes_user    ON wayfinder_email_inboxes(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_inboxes_journey ON wayfinder_email_inboxes(journey_id);

-- ============================================================
-- GMAIL CONNECTIONS - Encrypted OAuth tokens per user/journey
-- Trip-date-scoped: sync only pulls emails within journey dates
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_gmail_connections (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  journey_id              TEXT NOT NULL,
  gmail_address           TEXT NOT NULL,  -- confirmed Gmail account email
  encrypted_access_token  TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expiry_at         TEXT NOT NULL,  -- ISO timestamp when access token expires
  scopes                  TEXT NOT NULL,  -- space-delimited granted scopes
  last_sync_at            TEXT,
  last_sync_count         INTEGER NOT NULL DEFAULT 0,
  sync_cursor             TEXT,           -- pageToken for incremental Gmail list pagination
  is_active               INTEGER NOT NULL DEFAULT 1,
  revoked_at              TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  UNIQUE(user_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_wf_gmail_user    ON wayfinder_gmail_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_gmail_journey ON wayfinder_gmail_connections(journey_id);

-- ============================================================
-- PACKING ITEMS - Personal & Group Winter Packing Checklist
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_packing_items (
  id              TEXT PRIMARY KEY,
  journey_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'clothing', -- clothing, footwear, gear, electronics, documents, toiletries, gifts
  name            TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  weight_grams    INTEGER DEFAULT 0,
  is_packed       INTEGER NOT NULL DEFAULT 0,
  is_shared       INTEGER NOT NULL DEFAULT 0,       -- 0: personal item, 1: group item
  assigned_to     TEXT,                             -- member name/identifier for shared gear
  bag_type        TEXT NOT NULL DEFAULT 'checked',  -- checked, carryon, personal
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id)  REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wf_packing_journey ON wayfinder_packing_items(journey_id);
CREATE INDEX IF NOT EXISTS idx_wf_packing_user    ON wayfinder_packing_items(user_id);

-- ============================================================
-- CALENDAR SUBSCRIPTION TOKENS - Secure Token-Based iCal Feeds
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_calendar_tokens (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  journey_id      TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,             -- 32-char crypto random token
  feed_name       TEXT NOT NULL DEFAULT 'Poland 2026 Schedule',
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_polled_at  TEXT,
  poll_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  UNIQUE(user_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_wf_cal_token ON wayfinder_calendar_tokens(token);
CREATE INDEX IF NOT EXISTS idx_wf_cal_user  ON wayfinder_calendar_tokens(user_id);

-- ============================================================
-- EXPENSE SETTLEMENTS - Log of Debt Settle-Up Payments
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_expense_settlements (
  id              TEXT PRIMARY KEY,
  journey_id      TEXT NOT NULL,
  expense_id      TEXT,
  split_id        TEXT,
  from_user_id    TEXT NOT NULL,
  from_user_name  TEXT NOT NULL,
  to_user_id      TEXT NOT NULL,
  to_user_name    TEXT NOT NULL,
  amount          REAL NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'PLN',
  settled_date    TEXT NOT NULL DEFAULT (date('now')),
  method          TEXT NOT NULL DEFAULT 'cash', -- cash, revolut, blik, transfer, other
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wf_settle_journey ON wayfinder_expense_settlements(journey_id);

-- ============================================================
-- SHARED AGENDA COLLABORATION (invites + shares)
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_agenda_invites (
  id            TEXT PRIMARY KEY,
  agenda_id     TEXT NOT NULL,
  invited_email TEXT NOT NULL COLLATE NOCASE,
  role          TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  token_hash    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  invited_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  accepted_at   TEXT,
  accepted_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_invites_agenda ON wayfinder_agenda_invites(agenda_id);
CREATE INDEX IF NOT EXISTS idx_wf_invites_email ON wayfinder_agenda_invites(invited_email);

CREATE TABLE IF NOT EXISTS wayfinder_agenda_shares (
  id         TEXT PRIMARY KEY,
  agenda_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  invite_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agenda_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wf_shares_user ON wayfinder_agenda_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_shares_agenda ON wayfinder_agenda_shares(agenda_id);

-- ============================================================
-- BOOKMARKS - User-saved POI bookmarks per journey
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_bookmarks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  journey_id  TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  item_type   TEXT NOT NULL DEFAULT 'poi',
  city        TEXT,
  title       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  UNIQUE(user_id, journey_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_wf_bookmarks_user_journey ON wayfinder_bookmarks(user_id, journey_id);
