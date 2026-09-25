-- Migration 0006: Email verification and pending email change (Phase 2 Stage 5)
-- Adds email_verified and pending_email columns to users table
-- Backfills existing active users with email_verified = 1
-- Creates email_verifications table for HMAC-secured verification codes

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pending_email TEXT;

UPDATE users SET email_verified = 1 WHERE email_verified = 0;

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

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id, used);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email, token);
