-- Migration 0010: Add force_password_reset column to users table (HIGH-6)
-- Flags accounts requiring a password reset before next login
ALTER TABLE users ADD COLUMN force_password_reset INTEGER NOT NULL DEFAULT 0;
