# Implementation Plan: Dedicated Cloudflare D1 Database & Structured Table Architecture for Finance OS (`finance-os-db`)

## Executive Summary & Problem Statement

Finance OS (`e:/TechTrekGT/finance/`) currently binds the shared Cloudflare D1 SQLite database `personal-budget-db` (`10f220d4-1c10-49e9-b63e-5d4cb08d599f`) via the `env.DB` Worker binding. Additionally, the current storage architecture persists the entire household budget (`accounts`, `people`, `bills`, `transactions`, `lineItems`, `fundingGoals`, `loans`, `dailyMatrix`, `dashboardWidgets`, and preferences) as a single opaque JSON string blob inside `user_backups.data` and `user_backup_versions.data`, while legacy relational tables in `schema.sql` (`_bak_households`, `_bak_people`, `_bak_bill_splits`, etc.) remain unused or uninitialized on a fresh D1 instance (showing 0 tables in the Cloudflare dashboard).

This implementation plan transitions Finance OS to:
1. **Dedicated D1 Database (`finance-os-db`)**: Decouples Finance OS from `personal-budget-db` to isolate single-writer SQLite lock contention and track D1 read/write quota metrics independently.
2. **Structured Relational Table Architecture (`finance-schema.sql`)**: Replaces opaque monolithic JSON blob storage with normalized, indexed SQLite tables (`finance_accounts`, `finance_people`, `finance_bills`, `finance_transactions`, `finance_line_items`, `finance_funding_goals`, `finance_loans`, `finance_daily_matrix`, `finance_ledger_settings`, alongside auth and collaboration tables `users`, `email_verifications`, `password_resets`, `finance_ledgers`, `ledger_invites`, `ledger_shares`, `user_backups`, and `user_backup_versions`).
3. **Zero-Regression Worker Refactor (`FIN-AUDIT-001`)**: Refactors the Cloudflare Worker sync/restore/version handlers to read and write structured relational rows using atomic `env.DB.batch([...])` statements and strict `?` positional parameter binding (`FIN-AUDIT-001`), while preserving the exact JSON request/response contract expected by the React 19 / IndexedDB client and all automated test suites.

---

## 1. Database Creation (Windows PowerShell)

Execute the following Cloudflare Wrangler CLI commands in Windows PowerShell from the `finance` workspace directory to provision the dedicated `finance-os-db` database:

```powershell
Set-Location -Path "e:\TechTrekGT\finance"
npx wrangler d1 create finance-os-db
```

### Expected CLI Output & UUID Capture
Wrangler will provision the remote D1 database on Cloudflare edge and output the binding block containing the newly generated `database_id` UUID:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "finance-os-db",
      "database_id": "1746a2c8-2653-4136-8301-d217748621fa"
    }
  ]
}
```

Record `1746a2c8-2653-4136-8301-d217748621fa` from the PowerShell output for Step 2.

---

## 2. Configuration Update (`wrangler.jsonc` / `wrangler.toml`)

> **Configuration File Note**: In [finance/](file:///e:/TechTrekGT/finance/), the active Wrangler configuration file on disk is [finance/wrangler.jsonc](file:///e:/TechTrekGT/finance/wrangler.jsonc) (referenced in the prompt as `wrangler.toml`). Both the exact `wrangler.jsonc` delta and the equivalent `wrangler.toml` `[[d1_databases]]` syntax are provided below. The binding name (`"binding": "DB"`) remains strictly unchanged so `env.DB` continues to function across all Worker routes without binding rewrites.

### 2.1 Exact Update to [finance/wrangler.jsonc](file:///e:/TechTrekGT/finance/wrangler.jsonc#L43-L49)

```diff
   "d1_databases": [
     {
       "binding": "DB",
-      "database_name": "personal-budget-db",
-      "database_id": "10f220d4-1c10-49e9-b63e-5d4cb08d599f"
+      "database_name": "finance-os-db",
+      "database_id": "1746a2c8-2653-4136-8301-d217748621fa"
     }
   ],
```

*(Equivalent `wrangler.toml` syntax for `[[d1_databases]]`)*:
```toml
[[d1_databases]]
binding = "DB"
database_name = "finance-os-db"
database_id = "1746a2c8-2653-4136-8301-d217748621fa"
```

### 2.2 NPM Migration Scripts Update in [finance/package.json](file:///e:/TechTrekGT/finance/package.json#L6-L21)
Add explicit D1 schema execution scripts targeting `finance-os-db` and `finance-schema.sql`:

```diff
     "preview": "npm run build && wrangler dev",
     "deploy": "npm run build && wrangler deploy",
+    "db:migrate": "wrangler d1 execute finance-os-db --remote --file=./finance-schema.sql",
+    "db:migrate:local": "wrangler d1 execute finance-os-db --local --file=./finance-schema.sql",
     "check:serialization": "node scripts/check-safe-serialization.js",
```

---

## 3. Architecture Shift: Structured Table Implementation (`finance-schema.sql`)

### 3.1 Current Finance OS Data Model Analysis
Currently, Finance OS operates with:
1. **Authentication & Account Lifecycle Tables**:
   - `users`: Primary user credentials, PBKDF2 hash (`saltHex:iterations:hashHex`), security question/answer hash, `token_version`, `role`, `is_admin`, `status`, `email_verified`, `email_verified_at`, `pending_email`, `sign_in_count`, `force_password_reset`, `created_app`, `created_at`.
   - `email_verifications`: HMAC-SHA256 8-digit OTP tokens (`verify:${email}:${code}`), `expires_at`, `used`, `attempts`.
   - `password_resets`: HMAC-SHA256 reset tokens (`reset:${email}:${code}`), `expires_at`, `used`, `attempts`.
2. **Multi-Tenant Collaboration Tables**:
   - `finance_ledgers`: Ledger registry (`id` matching `owner_id` for personal ledgers, `name`, `updated_at_ms`, `schema_version`).
   - `ledger_invites`: SHA-256 `token_hash` email invitations with roles (`viewer`, `editor`, `admin`) and 7-day expiration.
   - `ledger_shares`: Active user-to-ledger permission mappings (`UNIQUE(ledger_id, user_id)`).
3. **CAS Sync & Historical Version Payloads (Previously Opaque Blobs)**:
   - Previously, `POST /api/sync/backup` serialized the entire client budget state (`ALLOWED_BUDGET_KEYS` in [finance/src/worker.js](file:///e:/TechTrekGT/finance/src/worker.js#L253-L268)) into a single JSON string in `user_backups.data` and `user_backup_versions.data`.
   - Meanwhile, [finance/schema.sql](file:///e:/TechTrekGT/finance/schema.sql#L24-L129) contained legacy `_bak_households`, `_bak_people`, `_bak_bill_splits`, and incomplete `accounts`/`bills`/`loans` tables that lacked `ledger_id` scoping, lacked modern fields (`startingBalance`, `extraStartingBalance`, `importedLedgerRows`, `bankMatchNames`, `splits`, `fundingGoals`, `transactions`, `dailyMatrix`), and were never queried by `worker.js`.

### 3.2 Structured Relational Schema Design ([finance/finance-schema.sql](file:///e:/TechTrekGT/finance/finance-schema.sql))
To transition from opaque blobs to structured table management while maintaining 100% compatibility with CAS concurrency (`baseVersion` / `updated_at_ms`), payload shrink guards, and 10-version manual backup history:

- **Ledger Metadata & CAS Control (`finance_ledger_settings` & `user_backups`)**:
  - Stores ledger-level settings (`theme`, `hide_dashboard_header`, `dashboard_widgets_json`, `categories_json`, `loan_json`, `schema_version`), CAS concurrency version (`updated_at_ms`), and payload byte length (`data_byte_length`, `payload_hash`).
  - `user_backups` is retained as a synchronized fast-path CAS metadata & fallback mirror table so existing CAS version checks, ETag generation (`"backup-${version}"`), and legacy tests remain 100% compatible.
- **Discrete Normalized Domain Tables (All Scoped by `ledger_id` with Indexed Foreign Keys)**:
  1. `finance_accounts`: `(ledger_id, id)` PK - stores `name`, `type`, `starting_balance`, `extra_starting_balance`, `save_extra_monthly`, `enable_extra_savings`, `is_archived`, `color`, `notes`, `ledger_mode`, `overflow_splits_json`, `save_extra_splits_json`, `imported_ledger_rows_json`, `sort_order`.
  2. `finance_people`: `(ledger_id, id)` PK - stores earner `name`, `role`, `pay_frequency`, `pay_day1`, `pay_day2`, `pay_offset_days`, `gross_per_pay`, `net_per_pay`, `account_allocations_json`, `color`, `notes`, `is_archived`, `sort_order`.
  3. `finance_bills`: `(ledger_id, id)` PK - stores `account_id`, `name`, `amount`, `period`, `due_day`, `months_json`, `payment_source`, `notes`, `matching_key`, `bank_match_names`, `splits_json`, `is_archived`, `sort_order`.
  4. `finance_transactions`: `(ledger_id, id)` PK - stores `account_id`, `date`, `amount`, `description`, `notes`, `category`, `person_id`, `bill_id`, `is_other`, `type`, `status`, `sort_order`. Indexed on `(ledger_id, date)` and `(ledger_id, account_id)`.
  5. `finance_line_items`: `(ledger_id, bill_id, month_key)` PK - stores `actual_amount`, `updated_at`.
  6. `finance_funding_goals`: `(ledger_id, id)` PK - stores `contributor_id`, `account_id`, `name`, `amount_per_pay`, `amount`, `frequency`, `sort_order`.
  7. `finance_loans`: `(ledger_id, id)` PK - stores `account_id`, `name`, `description`, `principal`, `annual_interest_rate`, `term_months`, `monthly_payment`, `extra_payment`, `start_date`, `is_archived`, `sort_order`.
  8. `finance_daily_matrix`: `(ledger_id, matrix_key)` PK - stores individual matrix overrides (`num_value` REAL for numeric cells, `str_value` TEXT for `_desc` cells).
  9. `user_backup_versions`: Stores the last 10 manual point-in-time recovery snapshots (`id`, `user_id`, `data`, `saved_at`) for atomic rollback to the structured tables on `POST /api/sync/restore-version`.

### 3.3 Complete `finance/finance-schema.sql` Specification

```sql
-- ============================================================================
-- TechTrekGT Finance OS - Dedicated Cloudflare D1 Schema (finance-os-db)
-- ============================================================================
-- Enforces FIN-AUDIT-001 (Positional Parameterization) & Multi-Tenant Isolation

-- 1. Core Identity & Authentication Tables
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  name                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Suspended', 'Locked')),
  security_question     TEXT,
  security_answer_hash  TEXT,
  role                  TEXT NOT NULL DEFAULT 'user',
  token_version         INTEGER NOT NULL DEFAULT 0,
  email_verified        INTEGER NOT NULL DEFAULT 0,
  email_verified_at     TEXT,
  pending_email         TEXT,
  is_admin              INTEGER NOT NULL DEFAULT 0,
  amazon_api_token_hash TEXT,
  force_password_reset  INTEGER NOT NULL DEFAULT 0,
  created_app           TEXT DEFAULT 'finance',
  sign_in_count         INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

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
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email, token);

-- 2. Shared Ledger Collaboration & Tenant Isolation Tables
CREATE TABLE IF NOT EXISTS finance_ledgers (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT 'Household Budget',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_finance_ledgers_owner ON finance_ledgers(owner_id);

CREATE TABLE IF NOT EXISTS ledger_invites (
  id            TEXT PRIMARY KEY,
  ledger_id     TEXT NOT NULL,
  invited_email TEXT NOT NULL COLLATE NOCASE,
  role          TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  token_hash    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  invited_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  accepted_at   TEXT,
  accepted_by   TEXT,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ledger_invites_ledger ON ledger_invites(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_invites_email  ON ledger_invites(invited_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_invites_pending
  ON ledger_invites(ledger_id, invited_email) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS ledger_shares (
  id          TEXT PRIMARY KEY,
  ledger_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  invite_id   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ledger_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invite_id) REFERENCES ledger_invites(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_shares_user   ON ledger_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_shares_ledger ON ledger_shares(ledger_id);

-- 3. Structured Finance OS Domain Tables (Normalized per Ledger)
CREATE TABLE IF NOT EXISTS finance_ledger_settings (
  ledger_id               TEXT PRIMARY KEY,
  schema_version          INTEGER NOT NULL DEFAULT 8,
  theme                   TEXT NOT NULL DEFAULT 'dark',
  hide_dashboard_header   INTEGER NOT NULL DEFAULT 0,
  dashboard_widgets_json  TEXT,
  categories_json         TEXT,
  loan_json               TEXT,
  data_byte_length        INTEGER NOT NULL DEFAULT 0,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at_ms           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_accounts (
  ledger_id                 TEXT NOT NULL,
  id                        TEXT NOT NULL,
  name                      TEXT NOT NULL,
  type                      TEXT NOT NULL DEFAULT 'checking',
  starting_balance          REAL NOT NULL DEFAULT 0.0,
  extra_starting_balance    REAL NOT NULL DEFAULT 0.0,
  save_extra_monthly        REAL NOT NULL DEFAULT 0.0,
  enable_extra_savings      INTEGER NOT NULL DEFAULT 1,
  is_archived               INTEGER NOT NULL DEFAULT 0,
  color                     TEXT NOT NULL DEFAULT 'blue',
  notes                     TEXT DEFAULT '',
  ledger_mode               TEXT DEFAULT 'manual',
  overflow_splits_json      TEXT,
  save_extra_splits_json    TEXT,
  imported_ledger_rows_json TEXT,
  extra_json                TEXT,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_ledger ON finance_accounts(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_people (
  ledger_id                 TEXT NOT NULL,
  id                        TEXT NOT NULL,
  name                      TEXT NOT NULL,
  role                      TEXT NOT NULL DEFAULT 'Member',
  pay_frequency             TEXT NOT NULL DEFAULT 'bi-weekly',
  pay_day1                  TEXT DEFAULT '15',
  pay_day2                  TEXT DEFAULT 'last',
  pay_offset_days           INTEGER NOT NULL DEFAULT 0,
  gross_per_pay             REAL NOT NULL DEFAULT 0.0,
  net_per_pay               REAL NOT NULL DEFAULT 0.0,
  account_allocations_json  TEXT DEFAULT '{}',
  color                     TEXT NOT NULL DEFAULT 'purple',
  notes                     TEXT DEFAULT '',
  is_archived               INTEGER NOT NULL DEFAULT 0,
  extra_json                TEXT,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_people_ledger ON finance_people(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_bills (
  ledger_id         TEXT NOT NULL,
  id                TEXT NOT NULL,
  account_id        TEXT NOT NULL DEFAULT '',
  name              TEXT NOT NULL,
  amount            REAL NOT NULL DEFAULT 0.0,
  period            TEXT NOT NULL DEFAULT 'Monthly',
  due_day            TEXT NOT NULL DEFAULT '1',
  months_json       TEXT DEFAULT '[1,2,3,4,5,6,7,8,9,10,11,12]',
  payment_source    TEXT NOT NULL DEFAULT 'Auto Pay',
  notes             TEXT DEFAULT '',
  matching_key      TEXT DEFAULT '',
  bank_match_names  TEXT DEFAULT '',
  splits_json       TEXT DEFAULT '{}',
  is_archived       INTEGER NOT NULL DEFAULT 0,
  extra_json        TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_bills_ledger ON finance_bills(ledger_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_finance_bills_account ON finance_bills(ledger_id, account_id);

CREATE TABLE IF NOT EXISTS finance_transactions (
  ledger_id    TEXT NOT NULL,
  id           TEXT NOT NULL,
  account_id   TEXT DEFAULT '',
  date         TEXT DEFAULT '',
  amount       REAL NOT NULL DEFAULT 0.0,
  description  TEXT DEFAULT '',
  notes        TEXT DEFAULT '',
  category     TEXT DEFAULT '',
  person_id    TEXT,
  bill_id      TEXT,
  is_other     INTEGER DEFAULT 0,
  type         TEXT DEFAULT '',
  status       TEXT DEFAULT '',
  extra_json   TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_txns_ledger ON finance_transactions(ledger_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_finance_txns_date   ON finance_transactions(ledger_id, date);
CREATE INDEX IF NOT EXISTS idx_finance_txns_acct   ON finance_transactions(ledger_id, account_id);

CREATE TABLE IF NOT EXISTS finance_line_items (
  ledger_id      TEXT NOT NULL,
  bill_id        TEXT NOT NULL,
  month_key      TEXT NOT NULL,
  actual_amount  REAL,
  updated_at     INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ledger_id, bill_id, month_key)
);
CREATE INDEX IF NOT EXISTS idx_finance_line_items_ledger ON finance_line_items(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_funding_goals (
  ledger_id       TEXT NOT NULL,
  id              TEXT NOT NULL,
  contributor_id  TEXT DEFAULT '',
  account_id      TEXT DEFAULT '',
  name            TEXT NOT NULL DEFAULT 'Funding Goal',
  amount_per_pay  REAL,
  amount          REAL,
  frequency       TEXT,
  extra_json      TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_goals_ledger ON finance_funding_goals(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_loans (
  ledger_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  account_id            TEXT DEFAULT '',
  name                  TEXT NOT NULL DEFAULT 'New Loan',
  description           TEXT DEFAULT '',
  principal             REAL NOT NULL DEFAULT 0.0,
  annual_interest_rate  REAL NOT NULL DEFAULT 0.0,
  term_months           INTEGER NOT NULL DEFAULT 0,
  monthly_payment       REAL NOT NULL DEFAULT 0.0,
  extra_payment         REAL NOT NULL DEFAULT 0.0,
  start_date            TEXT DEFAULT '',
  is_archived           INTEGER NOT NULL DEFAULT 0,
  extra_json            TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_loans_ledger ON finance_loans(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_daily_matrix (
  ledger_id   TEXT NOT NULL,
  matrix_key  TEXT NOT NULL,
  num_value   REAL,
  str_value   TEXT,
  PRIMARY KEY (ledger_id, matrix_key)
);
CREATE INDEX IF NOT EXISTS idx_finance_matrix_ledger ON finance_daily_matrix(ledger_id);

-- 4. CAS Concurrency Coordinator & Manual Snapshot History Tables
CREATE TABLE IF NOT EXISTS user_backups (
  id               TEXT PRIMARY KEY,
  data             TEXT NOT NULL,
  data_byte_length INTEGER,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at_ms    INTEGER
);

CREATE TABLE IF NOT EXISTS user_backup_versions (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  data      TEXT NOT NULL,
  saved_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_backup_versions_user ON user_backup_versions(user_id, saved_at DESC);
```

### 3.4 Wrangler CLI Commands to Initialize `finance-os-db` (Local & Remote)

Execute the following PowerShell commands from `e:\TechTrekGT\finance` to initialize the structured tables on both the **local** development database and the **remote** production Cloudflare D1 database:

```powershell
# 1. Navigate to the Finance OS project directory
Set-Location -Path "e:\TechTrekGT\finance"

# 2. Initialize the LOCAL D1 database (used by wrangler dev)
npx wrangler d1 execute finance-os-db --local --file=./finance-schema.sql

# 3. Verify local tables exist (should list all 17 structured tables)
npx wrangler d1 execute finance-os-db --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' ORDER BY name;"

# 4. Initialize the REMOTE Cloudflare D1 database (production edge)
npx wrangler d1 execute finance-os-db --remote --file=./finance-schema.sql

# 5. Verify remote tables exist on Cloudflare D1
npx wrangler d1 execute finance-os-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' ORDER BY name;"
```

### 3.5 Optional Data Migration & Backfill from `personal-budget-db` to `finance-os-db`
If existing Finance user accounts and backups in `personal-budget-db` need to be migrated into `finance-os-db` and decomposed into the new structured tables:

```powershell
Set-Location -Path "e:\TechTrekGT\finance"

# 1. Export Finance-owned tables from shared personal-budget-db
npx wrangler d1 export personal-budget-db --remote --output=./backups/finance-migration-export.sql `
  --table=users `
  --table=email_verifications `
  --table=password_resets `
  --table=finance_ledgers `
  --table=ledger_invites `
  --table=ledger_shares `
  --table=user_backups `
  --table=user_backup_versions

# 2. Import into finance-os-db
npx wrangler d1 execute finance-os-db --remote --file=./backups/finance-migration-export.sql
```
*(Furthermore, on the first `GET /api/sync/restore` or `POST /api/sync/backup`, the Worker's structured storage adapter will automatically hydrate from `user_backups` if `finance_ledger_settings` is not yet populated for that `ledger_id`, guaranteeing zero data loss during transition).*

---

## 4. Codebase Audit & Refactoring Plan

### 4.1 Audit of Hardcoded `personal-budget-db` References
A complete search across `e:/TechTrekGT/finance/` and root `e:/TechTrekGT/docs/` identified all occurrences of `personal-budget-db` and its UUID `10f220d4-1c10-49e9-b63e-5d4cb08d599f`:

| File Path | Line(s) | Current Reference | Planned Update |
| :--- | :--- | :--- | :--- |
| [finance/wrangler.jsonc](file:///e:/TechTrekGT/finance/wrangler.jsonc#L43-L49) | 46-47 | `"database_name": "personal-budget-db"`, `"database_id": "10f220d4-1c10-49e9-b63e-5d4cb08d599f"` | Update to `"database_name": "finance-os-db"` and `"database_id": "<NEW_FINANCE_OS_DATABASE_UUID>"`. Keep `"binding": "DB"`. |
| [finance/schema.sql](file:///e:/TechTrekGT/finance/schema.sql) | 1-227 | Legacy `_bak_*` tables and incomplete schema | Synchronize with [finance/finance-schema.sql](file:///e:/TechTrekGT/finance/finance-schema.sql) so `tests/helpers/mockD1.js` and all Vitest suites use the exact structured schema. |
| [finance/migrations/0002_security_hardening.sql](file:///e:/TechTrekGT/finance/migrations/0002_security_hardening.sql#L5-L8) | 5, 8 | `-- npx wrangler d1 migrations apply personal-budget-db` | Update comment to `finance-os-db`. |
| [finance/docs/02_arch.md](file:///e:/TechTrekGT/finance/docs/02_arch.md#L89-L94) | 89-94 | `D1 Binding: DB bound to database personal-budget-db` | Update Section 5 to document dedicated `finance-os-db` and structured relational schema (`finance-schema.sql`). |
| [finance/docs/03_features.md](file:///e:/TechTrekGT/finance/docs/03_features.md#L10) | 10, 145 | References `user_backups` / D1 sync | Document structured relational table persistence (`finance_accounts`, `finance_bills`, `finance_transactions`, `finance_daily_matrix`, etc.) on `finance-os-db`. |
| [finance/docs/04_state.md](file:///e:/TechTrekGT/finance/docs/04_state.md#L235) | 235 | `Accounts in the shared D1 database (personal-budget-db)` | Update to document dedicated `finance-os-db` and complete structured table definitions. |
| [finance/docs/03_features_4.md](file:///e:/TechTrekGT/finance/docs/03_features_4.md) & [finance/docs/04_state_4.md](file:///e:/TechTrekGT/finance/docs/04_state_4.md) | 206 | `Accounts in the shared D1 database (personal-budget-db)` | Synchronize with `03_features.md` and `04_state.md`. |
| [docs/02_arch.md](file:///e:/TechTrekGT/docs/02_arch.md#L63-L76) | 63-76 | Lists `personal-budget-db` for Finance | Update Section 3 to list `finance-os-db` for Finance OS alongside `outpost-db` for Outpost. |
| [docs/03_features.md](file:///e:/TechTrekGT/docs/03_features.md#L163-L170) | 163-170 | Lists shared D1 isolation | Document Finance OS dedicated `finance-os-db` database isolation. |
| [docs/04_state.md](file:///e:/TechTrekGT/docs/04_state.md#L5-L50) | 5, 50, 194, 205 | Lists `finance/schema.sql` on `personal-budget-db` | Update Sections 1, 1.3, 8, and 10 to document `finance/finance-schema.sql` on dedicated `finance-os-db`. |

### 4.2 Backend Refactoring Steps (Cloudflare Worker Structured Table Persistence)

To transition the Cloudflare Worker from opaque JSON blob storage to structured relational tables while adhering strictly to **`FIN-AUDIT-001` (positional `?` parameter binding)** and preserving all CAS/ETag/Conflict semantics:

#### Step 4.2.1: Create Structured Ledger Storage Utility (`finance/functions/utils/structuredBudgetStore.js`)
Create a pure JavaScript ESM module `structuredBudgetStore.js` that maps validated budget objects to and from the normalized D1 tables using `env.DB.prepare(sql).bind(...)`:

1. **`ensureStructuredFinanceTables(db)`**:
   - Isolate-scoped singleton guard (matching `ensureLedgerTables` in [ledgerAccess.js](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js#L9-L53)) that ensures `finance_ledger_settings`, `finance_accounts`, `finance_people`, `finance_bills`, `finance_transactions`, `finance_line_items`, `finance_funding_goals`, `finance_loans`, and `finance_daily_matrix` exist before write operations.
2. **`buildStructuredWriteStatements(db, ledgerId, payload, dataByteLength, nowMs)`**:
   - Generates an array of parameterized `db.prepare(...)` statements to be executed atomically inside `env.DB.batch(queries)` in `handleSyncBackup` and `handleSyncRestoreVersion`:
     - Upserts `finance_ledger_settings` (`ledger_id`, `schema_version`, `theme`, `hide_dashboard_header`, `dashboard_widgets_json`, `categories_json`, `loan_json`, `data_byte_length`, `updated_at_ms`).
     - Replaces ledger-scoped rows in `finance_accounts`, `finance_people`, `finance_bills`, `finance_transactions`, `finance_line_items`, `finance_funding_goals`, `finance_loans`, and `finance_daily_matrix` using positional `?` bindings (`DELETE FROM finance_<table_name> WHERE ledger_id = ?` followed by parameterized `INSERT INTO finance_<table_name> (...) VALUES (?, ...)` statements within the same atomic `env.DB.batch()`).
     - Preserves any extra/custom properties on items via `extra_json` so round-trip restoration (`GET /api/sync/restore`) is 100% lossless across all client fields.
3. **`readStructuredBudget(db, ledgerId)`**:
   - Executes parallel/batched parameterized `SELECT` queries against `finance_ledger_settings`, `finance_accounts`, `finance_people`, `finance_bills`, `finance_transactions`, `finance_line_items`, `finance_funding_goals`, `finance_loans`, and `finance_daily_matrix` (`WHERE ledger_id = ? ORDER BY sort_order ASC`).
   - Reconstructs the exact canonical budget object (`accounts`, `people`, `bills`, `transactions`, `lineItems`, `fundingGoals`, `loans`, `loan`, `dailyMatrix`, `dashboardWidgets`, `theme`, `hideDashboardHeader`, `categories`, `schemaVersion`).
   - **Seamless Fallback**: If `finance_ledger_settings` has no row for `ledgerId` (e.g., a pre-existing row seeded directly into `user_backups` during a test or legacy migration), transparently falls back to parsing `user_backups.data`, ensuring zero breakage across all 50+ existing unit/edge test files.

#### Step 4.2.2: Refactor Sync & Restore Handlers in [finance/src/worker.js](file:///e:/TechTrekGT/finance/src/worker.js#L571-L988)
1. **`handleSyncBackup` (`POST /api/sync/backup`)**:
   - Retains `resolveLedgerAccess(env, targetLedgerId, auth.user)` and `validateBudgetPayloadDetailed(payload)`.
   - Checks CAS `baseVersion`, identical payload no-op guard (`FIX-30`), and suspicious shrink guard (<10%).
   - Atomically executes `env.DB.batch(queries)` containing:
     - Optional manual snapshot insert + `LIMIT 10` pruning in `user_backup_versions` (when `body.manual === true`).
     - CAS coordinator upsert in `user_backups` (`WHERE (? = 1 OR user_backups.updated_at_ms IS NULL OR user_backups.updated_at_ms <= ?)`).
     - Structured table statements from `buildStructuredWriteStatements(env.DB, targetLedgerId, payload, dataByteLength, now)` when the CAS guard succeeds.
   - Retains compensating rollback in `catch` block (`DELETE FROM user_backup_versions WHERE id = ?`).
2. **`handleSyncRestore` (`GET /api/sync/restore`)**:
   - Checks ETag (`"backup-${version}"`) for fast HTTP 304 responses.
   - Calls `readStructuredBudget(env.DB, targetLedgerId)` to assemble the budget directly from the structured relational tables (with automatic fallback to `user_backups.data` if relational rows are not yet populated).
3. **`handleSyncRestoreVersion` (`POST /api/sync/restore-version`)**:
   - Reads the historical snapshot from `user_backup_versions WHERE id = ?`, parses and validates the snapshot, and writes it into both `user_backups` and all structured `finance_*` tables via `buildStructuredWriteStatements`.

#### Step 4.2.3: Update Cascading Account Deletion in [finance/functions/utils/deleteAccount.js](file:///e:/TechTrekGT/finance/functions/utils/deleteAccount.js#L43-L53)
Update `deleteUserAccount` to include cascading cleanup across all new structured domain tables using positional `?` bindings:
```javascript
addIfTable('finance_daily_matrix', 'DELETE FROM finance_daily_matrix WHERE ledger_id = ?', targetUserId);
addIfTable('finance_transactions', 'DELETE FROM finance_transactions WHERE ledger_id = ?', targetUserId);
addIfTable('finance_line_items', 'DELETE FROM finance_line_items WHERE ledger_id = ?', targetUserId);
addIfTable('finance_funding_goals', 'DELETE FROM finance_funding_goals WHERE ledger_id = ?', targetUserId);
addIfTable('finance_loans', 'DELETE FROM finance_loans WHERE ledger_id = ?', targetUserId);
addIfTable('finance_bills', 'DELETE FROM finance_bills WHERE ledger_id = ?', targetUserId);
addIfTable('finance_people', 'DELETE FROM finance_people WHERE ledger_id = ?', targetUserId);
addIfTable('finance_accounts', 'DELETE FROM finance_accounts WHERE ledger_id = ?', targetUserId);
addIfTable('finance_ledger_settings', 'DELETE FROM finance_ledger_settings WHERE ledger_id = ?', targetUserId);
```

---

## 5. Verification & Post-Approval Execution Sequence

Once the user responds with `Plan approved`, execution will proceed in this exact sequence:
1. Run `npx wrangler d1 create finance-os-db` in `e:\TechTrekGT\finance` and capture the new `database_id`.
2. Create `finance/finance-schema.sql` and synchronize `finance/schema.sql`.
3. Update `finance/wrangler.jsonc` and `finance/package.json` with `finance-os-db` and the new UUID.
4. Initialize `finance-os-db` locally (`--local`) and remotely (`--remote`) using `npx wrangler d1 execute finance-os-db --file=./finance-schema.sql`, and migrate existing Finance records from `personal-budget-db`.
5. Implement `finance/functions/utils/structuredBudgetStore.js`, refactor `finance/src/worker.js` and `finance/functions/utils/deleteAccount.js` to read/write the structured relational tables, and add dedicated unit/edge tests verifying relational table population and round-trip restoration.
6. Run `npm test` and `npm run test:unit` in `e:\TechTrekGT\finance` to verify 100% test pass rate.
7. Update `finance/docs/02_arch.md`, `finance/docs/03_features.md`, `finance/docs/04_state.md` (plus `03_features_4.md` / `04_state_4.md`) and root `docs/02_arch.md`, `docs/03_features.md`, `docs/04_state.md`.
8. Run `npm run build` and `npm run deploy` in `e:\TechTrekGT\finance` to verify a zero-error build and live Cloudflare Worker deployment.

