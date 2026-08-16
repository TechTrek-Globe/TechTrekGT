-- Cloudflare D1 Database Schema for Personal Budget OS

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'My Household',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS household_members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
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
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS people (
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
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
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
  is_archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bill_splits (
  bill_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (bill_id, person_id),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
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
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS household_settings (
  household_id TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'dark',
  dashboard_widgets TEXT,
  hide_dashboard_header INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_backups (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
