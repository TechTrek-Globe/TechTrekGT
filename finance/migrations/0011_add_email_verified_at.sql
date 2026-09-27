-- Migration 0011: Add email_verified_at column to users table (MED-3)
-- Records the timestamp when an account successfully verifies email ownership
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
