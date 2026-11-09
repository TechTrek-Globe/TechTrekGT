# Wayfinder Guide: Dedicated Cloudflare D1 Database (`wayfinder-db`) & Relational Normalization Plan

## 1. Executive Summary & Architectural Objectives

This implementation plan transitions the **Wayfinder Guide** (`e:/TechTrekGT/wayfinder`) from the shared `personal-budget-db` instance (`10f220d4-1c10-49e9-b63e-5d4cb08d599f`) to its own dedicated Cloudflare D1 SQLite database (`wayfinder-db`). Following the precedent established by Finance OS (`finance-os-db`) and Outpost Tracker (`outpost-db`), this migration accomplishes two primary objectives:

1. **Database Isolation & Quota Independence**: Decouples Wayfinder's read/write workloads and single-writer SQLite coordinator lock from `personal-budget-db`, enabling independent quota telemetry and zero cross-application write contention.
2. **Relational Normalization of Semi-Structured Blobs**: Audits and normalizes existing Wayfinder tables that currently pack multi-attribute structured booking metadata or JSON payloads into unstructured `TEXT` columns (`wayfinder_itinerary_items.notes` and `wayfinder_audit_events.details`), while establishing a self-contained 16-table schema in `wayfinder/schema-wayfinder.sql` (including core identity tables `users`, `email_verifications`, and `password_resets`).

---

## 2. Step 1: Database Creation (Wrangler CLI)

To provision the new dedicated Cloudflare D1 database for Wayfinder using Windows PowerShell:

```powershell
Set-Location -Path "e:\TechTrekGT\wayfinder"
npx wrangler d1 create wayfinder-db
```

### Expected Output & Identifier Capture
Wrangler will provision the edge SQLite database and output a configuration block containing the new `database_id` UUID:
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "wayfinder-db",
      "database_id": "f95ad16e-8b63-419e-b828-d749b6fdd8f1"
    }
  ]
}
```
Record `<NEW_WAYFINDER_DATABASE_UUID>` for use in Step 2 and documentation synchronization.

---

## 3. Step 2: Configuration Update (`wayfinder/wrangler.jsonc`)

Note: The Wayfinder workspace uses `e:/TechTrekGT/wayfinder/wrangler.jsonc` as its active Wrangler configuration file. We will update the `d1_databases` array in `e:/TechTrekGT/wayfinder/wrangler.jsonc` so `database_name` points to `"wayfinder-db"` and `database_id` points to the newly generated UUID, while strictly preserving `"binding": "DB"` so all worker handlers referencing `env.DB` continue to operate without modification.

### Target Configuration Delta (`e:/TechTrekGT/wayfinder/wrangler.jsonc`)

```jsonc
  // Dedicated Wayfinder D1 database (isolated from personal-budget-db)
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "wayfinder-db",
      "database_id": "f95ad16e-8b63-419e-b828-d749b6fdd8f1"
    }
  ],
```

*(If a legacy `wrangler.toml` reference is requested by external tooling, `wrangler.jsonc` is the authoritative Wrangler v3 configuration file in `e:/TechTrekGT/wayfinder/`).*

---

## 4. Step 3: Schema Audit, Relational Normalization & Initialization

### 4.1 Audit of Existing Wayfinder Schema (`e:/TechTrekGT/wayfinder/schema-wayfinder.sql`)

An audit of `wayfinder/schema-wayfinder.sql` and all backend handlers in `wayfinder/functions/api/wayfinder/` identified four structural areas requiring normalization and schema completion:

1. **Missing Core Identity & Auth Tables in `schema-wayfinder.sql`**:
   - Previously, `schema-wayfinder.sql` assumed `users`, `email_verifications`, and `password_resets` were inherited from `personal-budget-db`.
   - In a dedicated `wayfinder-db` instance, `login.js`, `register.js`, `me.js`, `verify-email.js`, `resend-verification.js`, `forgot-password.js`, `reset-password.js`, `security-question.js`, `delete-account.js`, `admin.js`, and `agenda-shares.js` query `users`, `email_verifications`, and `password_resets` directly on `env.DB`.
   - **Action**: Add canonical `CREATE TABLE IF NOT EXISTS` definitions and indexes for `users`, `email_verifications`, and `password_resets` to `wayfinder/schema-wayfinder.sql`.

2. **Packed Key-Value Blob in `wayfinder_itinerary_items.notes`**:
   - **Current State**: Inbound email parsing (`email-worker.js`) and document approval (`import-jobs.js`) pack up to 12 structured booking attributes into a newline-delimited key-value blob inside `wayfinder_itinerary_items.notes`:
     - `Confirmation: <code_or_pnr>`
     - `Booking Reference: <ref>`
     - `Supplier: <operator>`
     - `Tickets: <ticket_summary>`
     - `Language: <tour_language>`
     - `Duration: <duration_text>`
     - `Pickup Window: <window>`
     - `Bag Restrictions: <restriction>`
     - `Mobile Tickets: <url>`
     - `Activity Details: <url>`
     - `Source: email-forward`
   - **Downstream Impact of Blob Packing**:
     - `itinerary.js` (`sanitizeItem`) executes runtime regex matching (`item.notes?.match(/confirmation:\s*([A-Za-z0-9]+)/i)`) on every row read.
     - `email-worker.js` executes `WHERE journey_id = ? AND user_id = ? AND notes LIKE '%Confirmation: ...%'` full-scan string matching for idempotency deduplication instead of an indexed column lookup.
     - `import-jobs.js` (`generateInitialFields`) regex-parses `notes` to recover confirmation numbers and costs.
     - `PrivateBookingCard.jsx` (`parseBookingMetadata`) splits `notes` line-by-line on the client to reconstruct `confirmation_number`, `supplier`, `pickup_window`, `bag_restriction`, `tickets`, `duration`, `mobile_ticket_url`, and `activity_details_url`.
   - **Normalization Design**: Promote these structured booking fields to first-class, typed scalar columns on `wayfinder_itinerary_items`:
     - `confirmation_number TEXT` (indexed via `idx_wf_items_confirmation` for fast deterministic deduplication)
     - `booking_reference TEXT`
     - `supplier TEXT`
     - `tickets TEXT`
     - `language TEXT`
     - `duration TEXT`
     - `pickup_window TEXT`
     - `bag_restriction TEXT`
     - `mobile_ticket_url TEXT`
     - `activity_details_url TEXT`
     - `room_type TEXT`
     - `guests TEXT`
     - `origin TEXT`
     - `destination TEXT`
     - `seat TEXT`
     - `import_source TEXT` (e.g., `'email-forward'`, `'document-upload'`, `'manual'`)

3. **JSON Blob in `wayfinder_audit_events.details`**:
   - **Current State**: `documents.js`, `email-worker.js`, `admin.js`, and `deleteAccount.js` serialize structured audit context (`old_title`, `new_title`, `filename`, `purged_expenses`, `from`, `subject`, `assignedRole`, `targetEmail`) as a raw `JSON.stringify(...)` blob into `wayfinder_audit_events.details`.
   - **Normalization Design**:
     - Add typed contextual columns to `wayfinder_audit_events`: `target_user_id TEXT`, `target_email TEXT`, `previous_value TEXT`, `new_value TEXT`, and `metadata_summary TEXT` (while retaining `details TEXT` as nullable for backwards compatibility).

4. **Schema Drift & Duplicate Definition in `wayfinder/schema-wayfinder.sql`**:
   - `wayfinder_expense_splits` was defined twice in `schema-wayfinder.sql` (lines 186 and 336), with the second definition missing `settle_method TEXT`.
   - `wayfinder_expense_settlements` in `schema-wayfinder.sql` (line 357) was missing `expense_id TEXT` and `split_id TEXT` columns that `expenses.js` actively inserts and queries.
   - `wayfinder_extraction_jobs` in `deleteAccount.js` (line 52) runs `DELETE FROM wayfinder_extraction_jobs WHERE user_id = ?`, or via `document_id IN (SELECT id FROM wayfinder_documents WHERE user_id = ?)`. Adding `user_id TEXT` to `wayfinder_extraction_jobs` (and keeping the subquery fallback) ensures zero column errors on cascading account deletion.

### 4.2 Complete Normalized SQLite Schema (`wayfinder/schema-wayfinder.sql`)

The updated `wayfinder/schema-wayfinder.sql` will initialize all 16 tables cleanly:

```sql
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
-- 2. JOURNEYS & DESTINATIONS
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
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

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
-- 3. NORMALIZED ITINERARY ITEMS
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
-- 4. DOCUMENTS, EXTRACTION JOBS & EXTRACTED FIELDS
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_documents (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  journey_id           TEXT,
  original_filename    TEXT NOT NULL,
  safe_display_name    TEXT NOT NULL,
  mime_type            TEXT NOT NULL,
  file_size_bytes      INTEGER,
  file_hash            TEXT,
  storage_key          TEXT,
  storage_status       TEXT NOT NULL DEFAULT 'pending_r2',
  upload_date          TEXT NOT NULL DEFAULT (datetime('now')),
  processing_status    TEXT NOT NULL DEFAULT 'pending',
  detected_provider    TEXT,
  detected_doc_type    TEXT,
  security_scan_status TEXT NOT NULL DEFAULT 'pending',
  extraction_version   INTEGER NOT NULL DEFAULT 0,
  retention_status     TEXT NOT NULL DEFAULT 'active',
  deleted_at           TEXT,
  deleted_by           TEXT,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id)
);

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
-- 5. EXPENSES, SPLITS & SETTLEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_expenses (
  id                    TEXT PRIMARY KEY,
  journey_id            TEXT NOT NULL,
  itinerary_item_id     TEXT,
  document_id           TEXT,
  user_id               TEXT NOT NULL,
  paid_by_name          TEXT,
  paid_by_user_id       TEXT,
  category              TEXT NOT NULL DEFAULT 'other',
  description           TEXT NOT NULL,
  amount_original       REAL,
  currency_original     TEXT DEFAULT 'PLN',
  amount_usd            REAL,
  exchange_rate         REAL,
  exchange_rate_date    TEXT,
  exchange_rate_source  TEXT,
  is_converted          INTEGER NOT NULL DEFAULT 0,
  is_refundable         INTEGER NOT NULL DEFAULT 0,
  refund_status         TEXT NOT NULL DEFAULT 'na',
  cancellation_deadline TEXT,
  paid_status           TEXT NOT NULL DEFAULT 'paid',
  verification_status   TEXT NOT NULL DEFAULT 'unverified',
  purchase_site         TEXT,
  payment_method        TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id)        REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)           REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (itinerary_item_id) REFERENCES wayfinder_itinerary_items(id),
  FOREIGN KEY (document_id)       REFERENCES wayfinder_documents(id)
);

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
  FOREIGN KEY (expense_id) REFERENCES wayfinder_expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE
);

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
  method          TEXT NOT NULL DEFAULT 'cash',
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE
);

-- ============================================================
-- 6. NORMALIZED AUDIT EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_audit_events (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
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
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- 7. EMAIL INBOXES, PACKING, CALENDAR & COLLABORATION
-- ============================================================
CREATE TABLE IF NOT EXISTS wayfinder_email_inboxes (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  journey_id       TEXT NOT NULL,
  inbox_token      TEXT NOT NULL,
  email_address    TEXT NOT NULL UNIQUE,
  is_active        INTEGER NOT NULL DEFAULT 1,
  emails_received  INTEGER NOT NULL DEFAULT 0,
  last_received_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  UNIQUE(user_id, journey_id)
);

CREATE TABLE IF NOT EXISTS wayfinder_gmail_connections (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  journey_id              TEXT NOT NULL,
  gmail_address           TEXT NOT NULL,
  encrypted_access_token  TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expiry_at         TEXT NOT NULL,
  scopes                  TEXT NOT NULL,
  last_sync_at            TEXT,
  last_sync_count         INTEGER NOT NULL DEFAULT 0,
  sync_cursor             TEXT,
  is_active               INTEGER NOT NULL DEFAULT 1,
  revoked_at              TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  UNIQUE(user_id, journey_id)
);

CREATE TABLE IF NOT EXISTS wayfinder_packing_items (
  id              TEXT PRIMARY KEY,
  journey_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'clothing',
  name            TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  weight_grams    INTEGER DEFAULT 0,
  is_packed       INTEGER NOT NULL DEFAULT 0,
  is_shared       INTEGER NOT NULL DEFAULT 0,
  assigned_to     TEXT,
  bag_type        TEXT NOT NULL DEFAULT 'checked',
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (journey_id)  REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wayfinder_calendar_tokens (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  journey_id      TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  feed_name       TEXT NOT NULL DEFAULT 'Poland 2026 Schedule',
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_polled_at  TEXT,
  poll_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  UNIQUE(user_id, journey_id)
);

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

CREATE TABLE IF NOT EXISTS wayfinder_agenda_shares (
  id         TEXT PRIMARY KEY,
  agenda_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  invite_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agenda_id, user_id)
);
```

Plus all corresponding performance indexes (`idx_wf_items_confirmation`, `idx_wf_items_journey`, `idx_wf_items_user`, `idx_wf_items_date`, `idx_wf_docs_user`, `idx_wf_docs_journey`, `idx_wf_docs_hash`, `idx_wf_fields_job`, `idx_wf_expenses_journey`, `idx_wf_splits_expense`, `idx_wf_splits_user`, `idx_wf_settle_journey`, `idx_wf_inboxes_email`, `idx_wf_inboxes_user`, `idx_wf_inboxes_journey`, `idx_wf_packing_journey`, `idx_wf_packing_user`, `idx_wf_cal_token`, `idx_wf_cal_user`, `idx_wf_invites_agenda`, `idx_wf_invites_email`, `idx_wf_shares_user`, `idx_wf_shares_agenda`).

### 4.3 Wrangler CLI Commands to Initialize Local & Remote Schemas

Using Windows PowerShell inside `e:\TechTrekGT\wayfinder`:

```powershell
# 1. Initialize Local D1 SQLite Database
Set-Location -Path "e:\TechTrekGT\wayfinder"
npx wrangler d1 execute wayfinder-db --local --file=schema-wayfinder.sql

# 2. Initialize Remote Production D1 SQLite Database
npx wrangler d1 execute wayfinder-db --remote --file=schema-wayfinder.sql
```

### 4.4 Data Migration Strategy from `personal-budget-db` to `wayfinder-db`

To preserve existing Wayfinder users (`users`), the Poland 2026 journey (`wayfinder_journeys`, `wayfinder_destinations`), collaborator shares (`wayfinder_agenda_shares`, `wayfinder_agenda_invites`), confirmed bookings (`wayfinder_itinerary_items`, `wayfinder_documents`, `wayfinder_extraction_jobs`, `wayfinder_extracted_fields`), expenses (`wayfinder_expenses`, `wayfinder_expense_splits`, `wayfinder_expense_settlements`), packing checklist (`wayfinder_packing_items`), calendar tokens (`wayfinder_calendar_tokens`), and forwarding inboxes (`wayfinder_email_inboxes`):

1. Export existing rows from `personal-budget-db` via `npx wrangler d1 execute personal-budget-db --remote --command="SELECT ..."` (or a one-time Node.js migration script in `scratch/`), backfilling the newly normalized scalar columns (`confirmation_number`, `booking_reference`, `supplier`, `tickets`, `language`, `duration`, `pickup_window`, `bag_restriction`, `mobile_ticket_url`, `activity_details_url`, `room_type`, `guests`, `import_source`) from `wayfinder_itinerary_items.notes` and `wayfinder_extracted_fields`.
2. Execute the parameterized/idempotent `INSERT OR IGNORE` / `INSERT OR REPLACE` seed statements against `wayfinder-db` (`--local` and `--remote`).
3. Verify row counts across all 16 tables in `wayfinder-db`.

---

## 5. Step 4: Codebase Audit, Hardcoded References & Backend Refactoring

### 5.1 Hardcoded `personal-budget-db` References to Update

A workspace search across `e:/TechTrekGT/wayfinder` and `e:/TechTrekGT/docs` identified the following files referencing `personal-budget-db` for Wayfinder:

1. [`wayfinder/wrangler.jsonc`](file:///e:/TechTrekGT/wayfinder/wrangler.jsonc#L28-L35):
   - Update `database_name` from `"personal-budget-db"` to `"wayfinder-db"` and `database_id` to the new UUID.
2. [`wayfinder/schema-wayfinder.sql`](file:///e:/TechTrekGT/wayfinder/schema-wayfinder.sql#L1-L4):
   - Update header comments and schema definitions to reflect the standalone `wayfinder-db` database.
3. [`wayfinder/src/components/DocumentCenter.jsx`](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx#L840):
   - Line 840: Update UI copy from `"Document metadata and extraction job successfully registered in personal-budget-db D1 database."` to `"Document metadata and extraction job successfully registered in wayfinder-db D1 database."`
4. [`wayfinder/docs/02_arch.md`](file:///e:/TechTrekGT/wayfinder/docs/02_arch.md#L44-L47) & [`wayfinder/docs/03_features.md`](file:///e:/TechTrekGT/wayfinder/docs/03_features.md#L680) & [`wayfinder/docs/04_state.md`](file:///e:/TechTrekGT/wayfinder/docs/04_state.md#L39):
   - Synchronize documentation to reflect dedicated `wayfinder-db` and the normalized 16-table schema.
5. [`docs/02_arch.md`](file:///e:/TechTrekGT/docs/02_arch.md#L65), [`docs/03_features.md`](file:///e:/TechTrekGT/docs/03_features.md#L170), and [`docs/04_state.md`](file:///e:/TechTrekGT/docs/04_state.md#L5):
   - Synchronize root monorepo documentation to list `wayfinder-db` alongside `finance-os-db` and `outpost-db`.

### 5.2 Backend Worker Refactoring for Normalized Columns

All SQL queries will strictly use positional `?` parameter bindings in Pure JavaScript (ESM):

1. [`wayfinder/functions/api/wayfinder/email-worker.js`](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-worker.js):
   - **Idempotency Query**: Update the duplicate check to query the indexed `confirmation_number` and `import_source` columns directly (`WHERE journey_id = ? AND user_id = ? AND (confirmation_number = ? OR notes LIKE ?)`), avoiding full-table substring scans while preserving backwards compatibility.
   - **Normalized Insert**: Populate `supplier`, `confirmation_number`, `booking_reference`, `tickets`, `language`, `duration`, `pickup_window`, `bag_restriction`, `mobile_ticket_url`, `activity_details_url`, and `import_source = 'email-forward'` directly into `wayfinder_itinerary_items` (and `user_id` into `wayfinder_extraction_jobs`), while storing clean narrative text in `notes`.
   - **Audit Event**: Populate `metadata_summary` on `wayfinder_audit_events`.

2. [`wayfinder/functions/api/wayfinder/import-jobs.js`](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js):
   - **Approval Handler (`action === 'approve'`)**: Extract `confirmation_number`, `booking_reference`, `supplier`, `room_type`, `seat`, `guests`, `tickets`, `language`, `duration`, `pickup_window`, `bag_restriction`, `mobile_ticket_url`, `activity_details_url`, `origin`, and `destination` from `fieldMap` and write them directly into the normalized columns of `wayfinder_itinerary_items` on both `INSERT` and `UPDATE`, with `import_source = 'document-upload'`.
   - **Virtual Field Hydration (`generateInitialFields`)**: Read `linkedItem.confirmation_number`, `linkedItem.room_type`, `linkedItem.guests`, and `linkedItem.supplier` directly from the normalized columns before falling back to regex extraction on `notes`.

3. [`wayfinder/functions/api/wayfinder/itinerary.js`](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/itinerary.js):
   - **`sanitizeItem(item)`**: Return all normalized columns directly (`confirmation_number: item.confirmation_number || item.notes?.match(/confirmation:\s*([A-Za-z0-9]+)/i)?.[1] || null`, plus `booking_reference`, `supplier`, `room_type`, `seat`, `guests`, `tickets`, `language`, `duration`, `pickup_window`, `bag_restriction`, `mobile_ticket_url`, `activity_details_url`, `origin`, `destination`, `purchase_site`, `payment_method`, `import_source`).
   - **`POST /api/wayfinder/itinerary`**: Accept optional normalized booking fields in request body and bind them positionally (`?`) into `wayfinder_itinerary_items`.

4. [`wayfinder/functions/api/wayfinder/accommodations.js`](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/accommodations.js):
   - Read `item.confirmation_number`, `item.room_type`, `item.seat`, and `item.guests` directly from `wayfinder_itinerary_items` columns alongside `docFields` overrides.

5. [`wayfinder/functions/api/wayfinder/documents.js`](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js), [`wayfinder/functions/api/wayfinder/admin.js`](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/admin.js), and [`wayfinder/functions/utils/deleteAccount.js`](file:///e:/TechTrekGT/wayfinder/functions/utils/deleteAccount.js):
   - Populate `user_id` when inserting into `wayfinder_extraction_jobs` in `documents.js` and `import-jobs.js`.
   - Populate normalized columns (`target_user_id`, `target_email`, `previous_value`, `new_value`, `metadata_summary`) on `wayfinder_audit_events`.
   - Ensure `deleteAccount.js` cleanly purges `wayfinder_extraction_jobs` by both `user_id = ?` and `document_id IN (SELECT id FROM wayfinder_documents WHERE user_id = ?)`.

6. [`wayfinder/src/components/itinerary/PrivateBookingCard.jsx`](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx) & [`wayfinder/src/components/DocumentCenter.jsx`](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx):
   - `parseBookingMetadata(item)` already checks `item?.confirmation_number`, `item?.supplier`, `item?.pickup_window`, `item?.bag_restriction`, `item?.tickets`, `item?.duration`, `item?.mobile_ticket_url`, and `item?.activity_details_url` first before falling back to `notes` parsing. We will also include `item?.booking_reference` and `item?.import_source === 'email-forward'` in `DocumentCenter.jsx` (`importedItems` filter) so items with clean narrative `notes` are always recognized as synced confirmations.

---

## 6. Verification, Build & Deployment Plan (Post-Approval)

Once approved, execution will follow the mandatory workspace build, verification, and deploy loop:
1. Provision `wayfinder-db` via `npx wrangler d1 create wayfinder-db` and update `wayfinder/wrangler.jsonc`.
2. Update `wayfinder/schema-wayfinder.sql` and apply it to both `--local` and `--remote` `wayfinder-db` instances.
3. Migrate existing Wayfinder records from `personal-budget-db` into `wayfinder-db` with normalized column population.
4. Apply the surgical backend and frontend code edits across `wayfinder/functions/` and `wayfinder/src/`.
5. Run existing verification suites (`node scripts/verify-import-parser.mjs`, `node scripts/verify-tenant-isolation.mjs`, `node scripts/verify-email-verification.mjs`).
6. Execute `npm run build` and `npm run deploy` in `e:\TechTrekGT\wayfinder`.
7. Synchronize `wayfinder/docs/02_arch.md`, `wayfinder/docs/03_features.md`, `wayfinder/docs/04_state.md`, and root `docs/02_arch.md`, `docs/03_features.md`, `docs/04_state.md`.

