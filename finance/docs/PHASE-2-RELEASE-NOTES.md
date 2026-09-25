# TechTrek Finance - Phase 2 Implementation & Production Release Notes

## 1. User-Facing Changes

- **Cloud Sync Conflict & Safety Dialogs:**
  - Automatic detection when another device has saved changes to the cloud. Instead of overwriting or losing changes, a prompt allows users to either keep local changes or update from cloud data.
  - Data loss guard prevents accidental overwrites when an incoming backup payload is suspiciously smaller than stored data (<10% of size).
  - Version history panel in Settings allowing users to review and restore up to 10 prior cloud snapshots.

- **Email Verification & Account Security:**
  - Unverified account warning banner in navigation bar for newly registered accounts with non-blocking access.
  - Verification modal with 8-digit code input and 60-second cooldown timer on code resends.
  - Secure email change flow in profile settings requiring 8-digit verification of the new address and automated notification sent to the prior address.

- **Account Status Feedback & Immediate Revocation:**
  - Clear user messaging when an account has been suspended by an administrator.
  - Immediate termination of all active sessions upon password reset, email change, or suspension.

- **Routing & Navigation Reliability:**
  - Direct access to `/` or `/finance` routes consistently to the canonical finance application dashboard.
  - Preserved deep links and responsive authentication modal transitions.

---

## 2. Technical Summary

### Stage 1: Phase 1 Regression & Correctness Fixes
- Added `created_at` timestamp and explicit `Active` status on user registration.
- Switched `/api/auth/me` to direct database queries to eliminate stale cached states.
- Cleaned duplicate `csrfToken` returns in registration responses.
- Enforced atomic concurrency locking for multi-tab requests.

### Stage 2: Sync Concurrency & Versioning
- Re-keyed backup payloads with monotonic `baseVersion` timestamp checks.
- Created `user_backup_versions` table maintaining a FIFO rolling window of 10 snapshots per user.
- Endpoint `POST /api/sync/restore-version` restricted to caller's own versions (cross-user attempts return HTTP 403).
- Added size sanity checks returning 409 `SYNC_SUSPICIOUS` unless overridden with `force: true`.

### Stage 3: Architecture Simplification (Option B)
- Migration `0004_drop_households.sql` archived legacy relational tables (`households`, `household_members`, `people`, `bill_splits`) into `_bak_*` tables.
- Purged orphaned `default_vault` records from `user_backups`.
- Eliminated `householdId` context states, claims, and queries across client and server.

### Stage 4: Schema & Data Integrity
- Migration `0005_backfill_user_created_at.sql` populated missing timestamps with `'1970-01-01T00:00:00.000Z'`.
- Implemented `POST /api/admin/user/:id/status` with admin role gating and automatic `token_version` bumps for immediate revocation upon suspension.

### Stage 5: Email Verification Flow
- Migration `0006_email_verification.sql` added `email_verified` (DEFAULT 0) and `pending_email` to `users`, backfilled legacy users to 1, and created `email_verifications` table.
- Codes generated using 8-digit HMAC digests (`verify:${email}:${code}`) to prevent token exposure in database dumps.
- Added endpoints: `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, and `POST /api/auth/confirm-email-change`.

### Stage 6: Uniform API Error Contract
- Created shared dictionary `ERROR_CODES` in `src/utils/errorCodes.js` and `functions/utils/errorCodes.js`.
- Standardized `fail(code, status, message, requestId)` returning `{ error, code, ...(requestId ? { requestId } : {}) }`.
- Preserved Rule H7 information-hiding guarantees for credential verification and password resets.
- Migrated client `api.js` string matching to machine-readable error codes.

### Stage 7: Routing Cleanup
- Standardized canonical mount path at `/finance` with 301 redirect from bare `/`.
- Removed untrusted `x-forwarded-proto` client header inspection from HTTPS redirects.
- Scoped sub-site `/outpost` rewrites to production environments.

### Stage 8: Rate Limit Hardening
- Documented `RATE_LIMIT_KV` as development-only fallback while `RATE_LIMITER` Durable Object serves production.
- Added production requirement for `CF-Connecting-IP` failing closed with 503 `SERVICE_UNAVAILABLE` when missing.
- Added dedicated per-IP throttle on `POST /api/auth/reset-password` (10 per 60s).

### Stage 9: Observability & Closeout
- Generated unique `requestId` (`crypto.randomUUID()`) threaded through Worker context, logs, and error responses.
- Implemented `emitMetric(event, requestId)` emitting low-cardinality JSON metric logs for registration, login, password reset, and backup/restore events.

---

## 3. Manual Production Steps (Run in Order)

1. **Verify D1 Remote Migrations:**
   Ensure migrations 0004 through 0006 are applied on Cloudflare D1:
   ```powershell
   npx wrangler d1 migrations apply personal-budget-db --remote
   ```
2. **Configure Email Service Secrets (if utilizing live mail delivery):**
   Set Resend API credentials for email dispatch:
   ```powershell
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put MAIL_FROM
   ```
3. **Verify Archived Tables:**
   Verify `_bak_households`, `_bak_household_members`, and `_bak_people` exist in the database and contain historical rows.
4. **Deploy Application Bundle:**
   ```powershell
   npm run build
   npx wrangler deploy
   ```
5. **Verify Live Deployment:**
   Confirm HTTP 401 returns machine-readable error code:
   ```powershell
   curl -s https://techtrekgt.com/finance/api/auth/me
   # Expected: {"error":"Unauthorized","code":"UNAUTHORIZED"}
   ```

---

## 4. Rollback Procedure

In the event of a critical issue during production deployment:

1. **Worker Rollback:**
   Redeploy the prior known stable version ID via Cloudflare Dashboard or rollback command:
   ```powershell
   npx wrangler rollback [PREVIOUS_VERSION_ID]
   ```
2. **Database Reversibility:**
   - Household tables are preserved in `_bak_*` tables with all historical relations intact.
   - New columns `email_verified` and `pending_email` default safely; existing accounts retain `email_verified = 1`.
   - To restore household schema, execute reverse copy from `_bak_*` tables into primary table names.
