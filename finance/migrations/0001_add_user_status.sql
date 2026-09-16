-- Migration 0001: Add status column to users table
-- Adds account status tracking. Default 'Active' for all existing rows.
-- Applied via: wrangler d1 migrations apply personal-budget-db --local  (local)
--              wrangler d1 migrations apply personal-budget-db --remote  (production)
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Active';
