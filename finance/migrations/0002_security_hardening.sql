-- TechTrek D1 migration: security hardening
-- Run BEFORE deploying the hardened worker.
--
-- Local only (Stage 2):
--   npx wrangler d1 migrations apply personal-budget-db --local
--
-- Production (manual, after Stage 6 sign-off):
--   npx wrangler d1 migrations apply personal-budget-db --remote
--
-- BEFORE running remotely, uncomment step 5 and set the real admin email.

-- 0. Create password_resets table if it does not already exist.
--    The table was missing from schema.sql and was never formally migrated.
CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  token       TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 1. Role column. Admin access is now read from the database instead of being
--    granted by a self-asserted email claim in the JWT.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- 2. Token version. Incrementing this revokes every outstanding session for
--    the user (password change, password reset, email change, logout).
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

-- 3. Per-code attempt counter for password resets.
ALTER TABLE password_resets ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

-- 4. Indexes the new queries rely on.
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_password_resets_email_used ON password_resets (email, used, created_at);
CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members (user_id);

-- 5. Promote the real administrator. Replace the address, and do NOT rely on
--    ADMIN_EMAIL any more; the env var is no longer used for authorization.
-- UPDATE users SET role = 'admin' WHERE email = 'you@techtrekgt.com';

-- 6. Invalidate every password hash written at 310,000 iterations. Those were
--    never actually persisted successfully on Workers (the derive threw), but
--    if any exist from a local wrangler dev session they can never be verified
--    in production. Force those accounts through password reset.
UPDATE users
   SET token_version = token_version + 1
 WHERE password_hash LIKE '%:310000:%';

-- 7. Burn any reset codes issued by the old handler. They were returned in
--    plaintext HTTP responses and must be considered compromised.
UPDATE password_resets SET used = 1 WHERE used = 0;

-- 8. Force re-authentication for all existing sessions, since the old tokens
--    carry no token_version claim.
UPDATE users SET token_version = token_version + 1;
