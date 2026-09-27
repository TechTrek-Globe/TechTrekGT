-- Migration 0008: Add is_admin column to users table (CRIT-4)
-- Persisted, immutable role flag tied to user ID
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
