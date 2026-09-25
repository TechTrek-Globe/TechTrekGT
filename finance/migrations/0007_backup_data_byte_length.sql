-- TechTrek D1 migration: user_backups data_byte_length column
--
-- Adds data_byte_length to user_backups to optimize suspicious-shrink guard
-- without reading full backup data blob.

-- 1. Add data_byte_length column to user_backups.
ALTER TABLE user_backups ADD COLUMN data_byte_length INTEGER;

-- 2. Backfill data_byte_length from existing data column length.
UPDATE user_backups
   SET data_byte_length = length(data)
 WHERE data IS NOT NULL;
