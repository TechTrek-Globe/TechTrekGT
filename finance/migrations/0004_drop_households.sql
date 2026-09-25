-- Migration 0004: Reversible archive of unused household tables (Phase 2 Stage 3 Option B)
-- Renames relational household tables to _bak_* tables in dependency order
-- Purges dead orphaned 'default_vault' row from user_backups

ALTER TABLE bill_splits RENAME TO _bak_bill_splits;
ALTER TABLE people RENAME TO _bak_people;
ALTER TABLE household_members RENAME TO _bak_household_members;
ALTER TABLE households RENAME TO _bak_households;

DELETE FROM user_backups WHERE id = 'default_vault';
