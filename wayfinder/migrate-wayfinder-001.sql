-- Wayfinder Migration 001
-- Adds password_resets table (previously created at request-time via runtime DDL)
-- and seeds the required poland-christmas-2026 journey row.
-- Apply via: wrangler d1 execute personal-budget-db --remote --file=./migrate-wayfinder-001.sql

-- ============================================================
-- PASSWORD RESETS - Token store for security-question recovery
-- ============================================================
CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pw_resets_email ON password_resets(email, used);

-- ============================================================
-- SEED: Poland Christmas 2026 journey
-- Deferred FK check allows insert without a real created_by user row.
-- visibility='public' means any authenticated user can attach documents.
-- ============================================================
PRAGMA defer_foreign_keys = ON;

INSERT INTO wayfinder_journeys
  (id, slug, title, tagline, status, visibility, created_by, created_at, updated_at)
VALUES
  (
    'poland-christmas-2026',
    'poland-christmas-2026',
    'Poland: A Christmas Journey 2026',
    'Krakow, Wroclaw & the winter markets',
    'planning',
    'public',
    'system',
    datetime('now'),
    datetime('now')
  )
ON CONFLICT (id) DO NOTHING;

PRAGMA defer_foreign_keys = OFF;
