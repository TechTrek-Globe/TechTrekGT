-- TechTrek D1 migration: backup versioning and optimistic concurrency
--
-- Adds updated_at_ms to user_backups and creates user_backup_versions table.

-- 1. Add updated_at_ms column to user_backups for epoch ms timestamping.
ALTER TABLE user_backups ADD COLUMN updated_at_ms INTEGER;

-- 2. Backfill updated_at_ms from updated_at datetime string.
UPDATE user_backups
   SET updated_at_ms = CAST(strftime('%s', updated_at) AS INTEGER) * 1000
 WHERE updated_at IS NOT NULL;

-- 3. Create user_backup_versions history table.
CREATE TABLE IF NOT EXISTS user_backup_versions (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  saved_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Create index for fast retrieval of latest user versions.
CREATE INDEX IF NOT EXISTS idx_backup_versions_user
  ON user_backup_versions(user_id, saved_at DESC);
