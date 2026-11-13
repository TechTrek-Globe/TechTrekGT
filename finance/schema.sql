-- Cloudflare D1 Database Schema for Finance OS (finance-os-db)

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY,
  email                TEXT UNIQUE NOT NULL,
  password_hash        TEXT NOT NULL,
  name                 TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'Active',
  security_question    TEXT,
  security_answer_hash TEXT,
  role                 TEXT NOT NULL DEFAULT 'user',
  token_version        INTEGER NOT NULL DEFAULT 0,
  email_verified       INTEGER NOT NULL DEFAULT 0,
  email_verified_at    TEXT,
  pending_email        TEXT,
  is_admin             INTEGER NOT NULL DEFAULT 0,
  amazon_api_token_hash TEXT,
  force_password_reset INTEGER NOT NULL DEFAULT 0,
  created_app          TEXT,
  sign_in_count        INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS _bak_households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'My Household',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS _bak_household_members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (household_id) REFERENCES _bak_households(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(household_id, user_id)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'checking',
  save_extra_monthly REAL NOT NULL DEFAULT 0.0,
  enable_extra_savings INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT 'blue',
  notes TEXT,
  FOREIGN KEY (household_id) REFERENCES _bak_households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS _bak_people (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Member',
  pay_frequency TEXT NOT NULL DEFAULT 'bi-weekly',
  pay_day1 TEXT NOT NULL DEFAULT '15',
  pay_day2 TEXT DEFAULT 'last',
  pay_offset_days INTEGER NOT NULL DEFAULT 0,
  account_allocations TEXT DEFAULT '{}',
  gross_per_pay REAL NOT NULL DEFAULT 0.0,
  net_per_pay REAL NOT NULL DEFAULT 0.0,
  color TEXT NOT NULL DEFAULT 'purple',
  FOREIGN KEY (household_id) REFERENCES _bak_households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0.0,
  period TEXT NOT NULL DEFAULT 'Monthly',
  due_day INTEGER NOT NULL DEFAULT 1,
  due_months TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7,8,9,10,11,12]',
  payment_source TEXT NOT NULL DEFAULT 'Auto Pay',
  notes TEXT,
  matching_key TEXT DEFAULT '',
  is_archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (household_id) REFERENCES _bak_households(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS _bak_bill_splits (
  bill_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (bill_id, person_id),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES _bak_people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS line_items (
  bill_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  actual_amount REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (bill_id, month_key),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'New Loan',
  description TEXT,
  principal REAL NOT NULL DEFAULT 0.0,
  annual_interest_rate REAL NOT NULL DEFAULT 0.0,
  term_months INTEGER NOT NULL DEFAULT 0,
  monthly_payment REAL NOT NULL DEFAULT 0.0,
  extra_payment REAL NOT NULL DEFAULT 0.0,
  start_date TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  interest_compounding TEXT NOT NULL DEFAULT 'monthly',
  payment_frequency TEXT NOT NULL DEFAULT 'monthly',
  payment_type TEXT NOT NULL DEFAULT 'amortizing',
  FOREIGN KEY (household_id) REFERENCES _bak_households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS household_settings (
  household_id TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'dark',
  dashboard_widgets TEXT,
  hide_dashboard_header INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (household_id) REFERENCES _bak_households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_backups (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  data_byte_length INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at_ms INTEGER
);

CREATE TABLE IF NOT EXISTS user_backup_versions (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  saved_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  token       TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS email_verifications (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  token      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_household ON accounts(household_id);
CREATE INDEX IF NOT EXISTS idx_bills_account ON bills(account_id);
CREATE INDEX IF NOT EXISTS idx_bills_household ON bills(household_id);
CREATE INDEX IF NOT EXISTS idx_people_household ON _bak_people(household_id);
CREATE INDEX IF NOT EXISTS idx_loans_household ON loans(household_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_email_token ON password_resets(email, token);
CREATE INDEX IF NOT EXISTS idx_backup_versions_user ON user_backup_versions(user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id, used);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email, token);

-- ------------------------------------------------------------------
-- Shared Ledger Collaboration & Tenant Isolation Schema
-- ------------------------------------------------------------------

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
  id         TEXT PRIMARY KEY,
  ledger_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  invite_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ledger_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invite_id) REFERENCES ledger_invites(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_shares_user   ON ledger_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_shares_ledger ON ledger_shares(ledger_id);

-- ------------------------------------------------------------------
-- Structured Finance OS Domain Tables (Keyed by ledger_id)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_ledger_settings (
  ledger_id               TEXT PRIMARY KEY,
  version                 INTEGER NOT NULL DEFAULT 1,
  theme                   TEXT NOT NULL DEFAULT 'dark',
  hide_dashboard_header   INTEGER NOT NULL DEFAULT 0,
  dashboard_widgets_json  TEXT NOT NULL DEFAULT '[]',
  custom_categories_json  TEXT NOT NULL DEFAULT '[]',
  saved_filter_views_json TEXT NOT NULL DEFAULT '[]',
  spending_limits_json    TEXT NOT NULL DEFAULT '{}',
  savings_targets_json    TEXT NOT NULL DEFAULT '{}',
  archived_years_json     TEXT NOT NULL DEFAULT '{}',
  audit_log_json          TEXT NOT NULL DEFAULT '[]',
  extra_meta_json         TEXT NOT NULL DEFAULT '{}',
  data_byte_length        INTEGER NOT NULL DEFAULT 0,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at_ms           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_accounts (
  ledger_id               TEXT NOT NULL,
  id                      TEXT NOT NULL,
  name                    TEXT NOT NULL,
  type                    TEXT NOT NULL DEFAULT 'checking',
  save_extra_monthly      REAL NOT NULL DEFAULT 0.0,
  enable_extra_savings    INTEGER NOT NULL DEFAULT 1,
  color                   TEXT NOT NULL DEFAULT 'blue',
  notes                   TEXT DEFAULT '',
  starting_balance        REAL DEFAULT 0.0,
  extra_starting_balance  REAL DEFAULT 0.0,
  balance_as_of_date      TEXT,
  start_date              TEXT,
  ledger_mode             TEXT DEFAULT 'auto',
  is_archived             INTEGER NOT NULL DEFAULT 0,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  extra_json              TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_ledger ON finance_accounts(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_people (
  ledger_id               TEXT NOT NULL,
  id                      TEXT NOT NULL,
  name                    TEXT NOT NULL,
  role                    TEXT NOT NULL DEFAULT 'Primary',
  pay_frequency           TEXT NOT NULL DEFAULT 'semi-monthly',
  pay_day1                TEXT NOT NULL DEFAULT '15',
  pay_day2                TEXT DEFAULT 'last',
  pay_offset_days         INTEGER NOT NULL DEFAULT 0,
  account_allocations     TEXT NOT NULL DEFAULT '{}',
  gross_per_pay           REAL NOT NULL DEFAULT 0.0,
  net_per_pay             REAL NOT NULL DEFAULT 0.0,
  color                   TEXT NOT NULL DEFAULT 'purple',
  sort_order              INTEGER NOT NULL DEFAULT 0,
  extra_json              TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_people_ledger ON finance_people(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_bills (
  ledger_id               TEXT NOT NULL,
  id                      TEXT NOT NULL,
  account_id              TEXT NOT NULL,
  name                    TEXT NOT NULL,
  amount                  REAL NOT NULL DEFAULT 0.0,
  period                  TEXT NOT NULL DEFAULT 'Monthly',
  due_day                 INTEGER NOT NULL DEFAULT 1,
  due_months              TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7,8,9,10,11,12]',
  payment_source          TEXT NOT NULL DEFAULT 'Auto Pay',
  category                TEXT DEFAULT 'Uncategorized',
  splits_json             TEXT NOT NULL DEFAULT '{}',
  bank_match_names        TEXT DEFAULT '[]',
  notes                   TEXT DEFAULT '',
  matching_key            TEXT DEFAULT '',
  is_archived             INTEGER NOT NULL DEFAULT 0,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  extra_json              TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_bills_ledger ON finance_bills(ledger_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_finance_bills_account ON finance_bills(ledger_id, account_id);

CREATE TABLE IF NOT EXISTS finance_transactions (
  ledger_id               TEXT NOT NULL,
  id                      TEXT NOT NULL,
  account_id              TEXT NOT NULL DEFAULT '',
  date                    TEXT NOT NULL DEFAULT '',
  description             TEXT NOT NULL DEFAULT '',
  amount                  REAL NOT NULL DEFAULT 0.0,
  type                    TEXT NOT NULL DEFAULT 'expense',
  category                TEXT DEFAULT 'Uncategorized',
  status                  TEXT DEFAULT 'cleared',
  matched_bill_id         TEXT,
  person_id               TEXT,
  is_other                INTEGER NOT NULL DEFAULT 0,
  notes                   TEXT DEFAULT '',
  sort_order              INTEGER NOT NULL DEFAULT 0,
  extra_json              TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_tx_ledger_date ON finance_transactions(ledger_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_tx_account ON finance_transactions(ledger_id, account_id);

CREATE TABLE IF NOT EXISTS finance_line_items (
  ledger_id               TEXT NOT NULL,
  id                      TEXT NOT NULL,
  bill_id                 TEXT NOT NULL DEFAULT '',
  month_key               TEXT NOT NULL DEFAULT '',
  actual_amount           REAL,
  is_paid                 INTEGER NOT NULL DEFAULT 0,
  paid_date               TEXT,
  notes                   TEXT DEFAULT '',
  updated_at              INTEGER NOT NULL DEFAULT 0,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  extra_json              TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_line_items_ledger ON finance_line_items(ledger_id, month_key);

CREATE TABLE IF NOT EXISTS finance_funding_goals (
  ledger_id               TEXT NOT NULL,
  id                      TEXT NOT NULL,
  account_id              TEXT DEFAULT '',
  name                    TEXT NOT NULL DEFAULT '',
  target_amount           REAL NOT NULL DEFAULT 0.0,
  current_amount          REAL NOT NULL DEFAULT 0.0,
  monthly_contribution    REAL NOT NULL DEFAULT 0.0,
  target_date             TEXT,
  color                   TEXT DEFAULT 'emerald',
  icon                    TEXT DEFAULT 'Target',
  contributor_id          TEXT,
  frequency               TEXT DEFAULT 'monthly',
  amount_per_pay          REAL DEFAULT 0.0,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  extra_json              TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_goals_ledger ON finance_funding_goals(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_loans (
  ledger_id               TEXT NOT NULL,
  id                      TEXT NOT NULL,
  name                    TEXT NOT NULL DEFAULT 'New Loan',
  description             TEXT DEFAULT '',
  principal               REAL NOT NULL DEFAULT 0.0,
  annual_interest_rate    REAL NOT NULL DEFAULT 0.0,
  term_months             INTEGER NOT NULL DEFAULT 0,
  monthly_payment         REAL NOT NULL DEFAULT 0.0,
  extra_payment           REAL NOT NULL DEFAULT 0.0,
  start_date              TEXT NOT NULL DEFAULT '',
  is_archived             INTEGER NOT NULL DEFAULT 0,
  interest_compounding    TEXT NOT NULL DEFAULT 'monthly',
  payment_frequency       TEXT NOT NULL DEFAULT 'monthly',
  payment_type            TEXT NOT NULL DEFAULT 'amortizing',
  sort_order              INTEGER NOT NULL DEFAULT 0,
  extra_json              TEXT DEFAULT '{}',
  PRIMARY KEY (ledger_id, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_loans_ledger ON finance_loans(ledger_id, sort_order);

CREATE TABLE IF NOT EXISTS finance_daily_matrix (
  ledger_id               TEXT NOT NULL,
  account_id              TEXT NOT NULL,
  month_key               TEXT NOT NULL,
  day_num                 INTEGER NOT NULL,
  field_key               TEXT NOT NULL,
  num_value               REAL,
  str_value               TEXT,
  PRIMARY KEY (ledger_id, account_id, month_key, day_num, field_key)
);
CREATE INDEX IF NOT EXISTS idx_finance_matrix_lookup ON finance_daily_matrix(ledger_id, account_id, month_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_daily_matrix_ledger_field ON finance_daily_matrix(ledger_id, field_key);

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

CREATE TABLE IF NOT EXISTS finance_bill_splits (
  ledger_id   TEXT NOT NULL,
  bill_id     TEXT NOT NULL,
  person_id   TEXT NOT NULL,
  percentage  REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (ledger_id, bill_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_bill_splits_ledger
  ON finance_bill_splits(ledger_id, bill_id);

CREATE TABLE IF NOT EXISTS finance_person_allocations (
  ledger_id         TEXT NOT NULL,
  person_id         TEXT NOT NULL,
  account_id        TEXT NOT NULL,
  allocation_value  REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (ledger_id, person_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_person_alloc_ledger
  ON finance_person_allocations(ledger_id, person_id);

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

