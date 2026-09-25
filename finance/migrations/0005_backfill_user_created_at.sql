-- Migration 0005: Backfill created_at for users (Phase 2 Stage 4.1)
-- Sentinel '1970-01-01T00:00:00.000Z' indicates real creation timestamp unknown.

UPDATE users
   SET created_at = '1970-01-01T00:00:00.000Z'
 WHERE created_at IS NULL OR created_at = '';
