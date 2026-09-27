-- Migration 0009: Add amazon_api_token_hash column to users table (HIGH-4)
-- Stores SHA-256 hash of VineScout/Amazon integration bearer tokens
ALTER TABLE users ADD COLUMN amazon_api_token_hash TEXT;
