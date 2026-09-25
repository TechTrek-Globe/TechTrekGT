# PHASE-2-PLAN.md
# Phase 2: Correctness, Data Model, and Reliability

Spec for the Antigravity agent. Read alongside `AGENTS.md` (security rules, always in force)
and `docs/SECURITY-FIXES.md` (Phase 1 information-hiding decisions that must not be undone).

Branch: `fix/flow-correctness`

All file paths are relative to `finance/`. All line numbers refer to the state of the
repository as of the Stage 0 audit. Re-read the target file before editing.

---

## Repository state at Phase 2 start

- Worker entry point: `src/worker.js`
- Auth handlers: `functions/api/auth/*.js`
- Admin handler: `functions/api/admin/stats.js`
- Auth/crypto utility: `functions/utils/auth.js`
- Rate limit utility: `functions/utils/rateLimit.js`
- Client state: `src/context/` (AuthContext, BudgetMetadataContext, LedgerDataContext, BudgetContext)
- Client sync: `src/utils/api.js`, `src/components/settings/datasync/CloudSyncSubPanel.jsx`
- Schema: `schema.sql`
- Migrations: `migrations/0001_add_user_status.sql`, `migrations/0002_security_hardening.sql`

---

## Stage 0 - Survey and plan

*Already complete. This document is its output.*

Key findings that drive subsequent stages:

1. `/api/auth/me` is called exactly once per page load (mount only). No polling. KV cache is
   not justified for Stage 1.4.
2. `people`, `households`, and `household_members` tables: no live handler reads `people` or
   `households`. `household_members` is read in `login.js:57-60` and `me.js:20-23` solely
   to populate `householdId` in the JWT and response body. No client component consumes
   `householdId` from context.
3. `user_backups` is keyed on `userId` in every live write (`src/worker.js:165`). The schema
   `DEFAULT 'default_vault'` is a dead default from before Phase 1. Any row with
   `id = 'default_vault'` is orphaned.
4. The auto-sync logic in `LedgerDataContext.jsx:324-368` silently overwrites local data with
   cloud data if `cloudTime >= localTime`, with no user prompt. This is the highest-severity
   data-loss vector.
5. `fail()` signature is `fail(status, message)` - no machine-readable code. One client
   string match in `src/utils/api.js:82` branches on human-readable error text.
6. Two SPA mounts (`/` and `/finance`) with no canonical redirect between them.

---

## Stage 1 - Regressions from Phase 1

These four issues were introduced by the Phase 1 hardening pass. Fix them before anything
else to give this branch a clean baseline.

### 1.1 - `created_at` not written explicitly at registration

**File:** `functions/api/auth/register.js:61`

The INSERT column list does not include `created_at`. The schema `DEFAULT (datetime('now'))`
compensates today, but if the default were removed `created_at NOT NULL` would throw. Stage
4.1 requires backfilling `created_at` for old rows, so explicit writes are needed for a
consistent format.

Fix: add `created_at` to the `INSERT INTO users` column list with `datetime('now')` as the
explicit value.

Test: a new registration row must have a non-null `created_at` regardless of whether the
DDL default is present.

### 1.2 - `status` not written explicitly at registration

**File:** `functions/api/auth/register.js:61`

Same pattern. `status NOT NULL DEFAULT 'Active'` is in the DDL but absent from the INSERT.
`functions/api/admin/stats.js:34` compensates with `u.status || 'Active'`.

Fix: add `status = 'Active'` explicitly to the INSERT.

Test: a new registration row must have `status = 'Active'`.

### 1.3 - Token race in `/api/auth/me`

**File:** `functions/api/auth/me.js:16-23`

The handler issues a new session token at line 16-18 (`issueSession`), then queries
`household_members` at line 20. Two concurrent GET `/me` requests issue two tokens with
distinct `sid` values from the same stale `token_version`.

Fix: run the `household_members` query first (or skip it if Stage 3 removes the tables),
then call `issueSession` once with the resolved `householdId`. Return a single response.

Test: simulate two concurrent GET `/me` requests against the same user. Both must succeed.
The token issued by the second must be valid. Neither may race-produce an invalid state.

### 1.4 - Dead `csrf2` variable in `register.js`

**File:** `functions/api/auth/register.js:72`

```js
const csrf2 = newCsrfToken();   // generated, never used, never returned
```

`issueSession` already returns `csrf` at line 71. Remove line 72.

Test: register a new account; response contains exactly one `csrfToken` field, usable for a
subsequent POST.

### 1.4b - No KV cache on `/api/auth/me` (documentation only)

Per Stage 0 finding: `/me` fires once on page mount. No polling exists. Document the
per-request D1 read as accepted cost. No code change needed.

---

## Stage 2 - Stop losing user data

The current sync flow in `src/context/LedgerDataContext.jsx:324-395` silently overwrites
whichever copy is older. No conflict prompt, no version tracking, no recovery path.

### 2.1 - Server: optimistic concurrency on `/api/sync/backup`

**File:** `src/worker.js:147-172` (`handleSyncBackup`)

Add `baseVersion` (integer epoch ms of the stored row's `updated_at_ms`) and optional
`force` (boolean) to the request body.

Logic:
```
if baseVersion is absent AND force is not true:
    return 400 { code: 'VALIDATION_ERROR', error: 'baseVersion is required' }
if baseVersion is present:
    read current row from user_backups
    if row exists AND row.updated_at_ms > baseVersion:
        return 409 {
          code: 'SYNC_CONFLICT',
          conflict: true,
          serverData: <stored payload>,
          serverVersion: row.updated_at_ms
        }
proceed with upsert, set updated_at_ms = Date.now()
return 200 { success: true, version: <new updated_at_ms> }
```

Requires `updated_at_ms INTEGER` column (see Stage 4.4).

### 2.2 - Server: version history table

New migration adds:

```sql
CREATE TABLE IF NOT EXISTS user_backup_versions (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  saved_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_backup_versions_user
  ON user_backup_versions(user_id, saved_at DESC);
```

On every successful backup write, INSERT a snapshot into `user_backup_versions` before the
upsert, then DELETE rows for this user beyond the 10 most recent (order by `saved_at ASC`).

New endpoints in `src/worker.js` ROUTES:
- `GET /api/sync/versions` - authenticated, returns `[{ id, savedAt }]` for calling user,
  newest first, max 10.
- `POST /api/sync/restore-version` - authenticated, body `{ versionId }`. Verify the
  version row belongs to the calling user; return 403 if not. Copy version `data` into
  `user_backups` and return the payload.

Test (cross-user): user A cannot list or restore user B's versions. 403 is returned.

### 2.3 - Server: size sanity check

Before accepting a backup body, read the stored payload byte length. If the incoming
payload is less than 10% of the stored backup size and `force` is not set:
```
return 409 { code: 'SYNC_SUSPICIOUS', suspicious: true }
```
With `force: true`, accept regardless of size ratio.

### 2.4 - Client: conflict resolution UI

**Files:** `src/context/LedgerDataContext.jsx`, `src/components/settings/datasync/CloudSyncSubPanel.jsx`

Replace silent timestamp-comparison sync in `LedgerDataContext.jsx:324-368`:
1. Pull cloud data on authenticated load (as now, but include `baseVersion` header/body in
   every push).
2. If server returns 409 `conflict: true`, do NOT auto-resolve. Surface a prompt: "Your
   budget changed on another device. Keep local or use cloud?" Show timestamps for both.
3. "Keep local" - call backup with `force: true`.
4. "Use cloud" - call `restoreFromBackup` with the 409 response's `serverData`.
5. Store the `version` returned from successful backup responses in component state.
   Pass it as `baseVersion` on all subsequent pushes.

### 2.5 - Tests

Before implementation, write these tests:
- Push with stale `baseVersion` returns 409, stored row untouched.
- Push with current `baseVersion` succeeds.
- Push with no `baseVersion` and no `force` is rejected with 400.
- Restore of a prior version returns exactly the stored payload.
- Version table prunes to 10, oldest pruned first.
- Payload at 5% of stored size is rejected (SYNC_SUSPICIOUS).
- Same payload with `force: true` is accepted.
- Cross-user version access returns 403.

---

## Stage 3 - Household model decision

Gate: produce analysis, get decision, then implement.

### Option A - Keep tables, build sharing on top

Files touched:
- `schema.sql`, new migration `migrations/0003_household_sharing.sql`
- New handlers: `POST /api/household/invite`, `POST /api/household/accept`,
  `GET /api/household/members`, `DELETE /api/household/members/:memberId`
- `src/worker.js` ROUTES - 4 new entries
- `user_backups` re-keyed on `household_id` (migration must map every existing row through
  `household_members`; users with no membership row get a new household, not skipped)
- Every new endpoint must authorize against caller's own household; foreign `householdId`
  returns 403. Test proving cross-household access returns 403.

Cost: medium-high. Requires reconciling the DB `people` table (populated at registration,
never read) with the client JSON blob `people` array (the actual live data). The two stores
are already diverged for any user who edited earners in the UI.

### Option B - Drop household tables, simplify to per-user

Files touched:
- New migration `migrations/0003_drop_households.sql`:
  - RENAME (not DROP) `households` -> `_bak_households`, `household_members` ->
    `_bak_household_members`, `people` -> `_bak_people`, `bill_splits` -> `_bak_bill_splits`
    (reversible; verify production row counts for `bill_splits` before including it).
  - If any `user_backups` rows have `id = 'default_vault'`, map them to the owning `user_id`
    via old `household_members` before the rename.
- `functions/api/auth/register.js` - remove 3 extra INSERTs (households, household_members,
  people). Registration becomes a single `INSERT INTO users`.
- `functions/api/auth/login.js:57-60` - remove `household_members` query; `householdId = null`.
- `functions/api/auth/me.js:20-23` - remove `household_members` query; `householdId = null`.
- `functions/api/auth/update-profile.js:103` - remove `householdId: payload.householdId`.
- `functions/utils/auth.js:445` - remove `householdId` from JWT claims in `issueSession`.
- `src/context/AuthContext.jsx` - remove `householdId` state (line 13), all 8 setter calls
  (lines 25, 46, 125, 140, 142, 171, 186, 188), and context value (line 277).

Cost: low. The client does not use `householdId` for any functional purpose. Changes are
subtractive. Migration is reversible.

### Recommendation

**Option B.** The `people` and `households` tables are written at registration and never
read by any live handler. All live earner data is in the JSON blob in `user_backups`. The
two stores are already diverged. Option A bridges a gap that does not currently exist and
introduces sharing infrastructure the application does not yet need. Option B removes dead
code and simplifies the system.

### What happens if two users share a household today

They cannot. Registration always creates a new household per user. There is no invite or
accept flow. The concern is hypothetical.

---

## Stage 4 - Schema and data integrity

### 4.1 - Backfill `created_at`

Migration:
```sql
-- Sentinel '1970-01-01T00:00:00.000Z' means real creation time unknown.
-- Do not mistake it for real data.
UPDATE users
   SET created_at = '1970-01-01T00:00:00.000Z'
 WHERE created_at IS NULL OR created_at = '';
```

The explicit INSERT fix is in Stage 1.1.

### 4.2 - `status` column

Recommendation: make it settable. Add `POST /api/admin/user/:id/status` accepting
`{ status: 'Active' | 'Suspended' }`, authorized against `user.role === 'admin'`.
The admin list view already displays `status`; this makes it accurate.

Do not leave a column that can only ever display "Active."

Registration must write `status = 'Active'` explicitly (Stage 1.2).

### 4.3 - `people.account_allocations` type

Skip entirely if Stage 3 chose Option B (table is renamed). If Option A: verify
`account_allocations` is valid JSON in every production row before any migration touches it.

### 4.4 - Migrate `user_backups.updated_at` to epoch milliseconds

Current: `updated_at TEXT NOT NULL DEFAULT (datetime('now'))` - SQLite datetime string.

Migration:
```sql
ALTER TABLE user_backups ADD COLUMN updated_at_ms INTEGER;

UPDATE user_backups
   SET updated_at_ms = CAST(strftime('%s', updated_at) AS INTEGER) * 1000
 WHERE updated_at IS NOT NULL;
```

At API boundary: compute ISO-8601 string from `updated_at_ms` for the `updatedAt` response
field. Do not store ISO-8601 strings in the new column.

Verify: `LedgerDataContext.jsx:339` does `new Date(cloudData.updatedAt).getTime()`. The
server must return `updatedAt` as ISO-8601. Stored format is INTEGER only.

---

## Stage 5 - Email verification

### 5.1 - Resend button cooldown (UI only)

**File:** `src/components/AuthPage.jsx` (or `AuthModal.jsx` - locate the reset flow)

Add a visible 60-second countdown on the resend button so the cooldown is apparent before
it is hit. Server response stays generic (changing it would reintroduce H7 enumeration).

### 5.2 - Email verification on registration

Add `email_verified INTEGER NOT NULL DEFAULT 0` to `users`.

Migration:
```sql
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
UPDATE users SET email_verified = 1 WHERE email_verified = 0;
```

New table:
```sql
CREATE TABLE IF NOT EXISTS email_verifications (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  token      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Token pattern (reuse exactly from `forgot-password.js`):
- 8-digit code via `randomInt`.
- HMAC: `hmacHex(env.JWT_SECRET, 'verify:' + email + ':' + code)`.
- Send via new `sendVerificationEmail` helper in `functions/utils/auth.js`.

New endpoints:
- `POST /api/auth/verify-email` - authenticated, body `{ code }`. Sets `email_verified = 1`
  and marks token `used = 1`. Rate limited: 5 per 60s.
- `POST /api/auth/resend-verification` - authenticated, rate limited: 3 per 600s.

Unverified users can still use the app. Show a persistent banner in the UI, not a hard block.

### 5.3 - Email change flow

**File:** `functions/api/auth/update-profile.js:34-50`

Add `pending_email TEXT` column to `users`.

When an email change is requested:
1. Write new address to `pending_email` (not `email`).
2. Send verification email to new address.
3. Send notification email to old address (user's only warning of an unauthorized change).

New endpoint `POST /api/auth/confirm-email-change` - authenticated, body `{ code }`:
1. Copy `pending_email` -> `email`, clear `pending_email`.
2. Set `email_verified = 1`.
3. Increment `token_version` (invalidates existing sessions for the old address).
Rate limited: 5 per 60s.

---

## Stage 6 - API error contract

### 6.1 - Machine-readable error codes

Two new files with identical content:
- `src/utils/errorCodes.js` (imported by client)
- `functions/utils/errorCodes.js` (imported by handlers)

```js
export const ERROR_CODES = {
  INVALID_CREDENTIALS:  'INVALID_CREDENTIALS',
  RESET_CODE_INVALID:   'RESET_CODE_INVALID',
  SESSION_EXPIRED:      'SESSION_EXPIRED',
  UNAUTHORIZED:         'UNAUTHORIZED',
  CSRF_INVALID:         'CSRF_INVALID',
  RATE_LIMITED:         'RATE_LIMITED',
  VALIDATION_ERROR:     'VALIDATION_ERROR',
  NOT_FOUND:            'NOT_FOUND',
  CONFLICT:             'CONFLICT',
  SYNC_CONFLICT:        'SYNC_CONFLICT',
  SYNC_SUSPICIOUS:      'SYNC_SUSPICIOUS',
  SERVICE_UNAVAILABLE:  'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR:       'INTERNAL_ERROR',
};
```

### 6.2 - Change `fail()` signature

**File:** `functions/utils/auth.js:47`

Change from `fail(status, message)` to `fail(code, status, message)`:
```js
export function fail(code, status, message) {
  return json({ error: message, code }, status);
}
```

A call site physically cannot omit the code. Update every call site.

### 6.3 - Information-hiding audit

Before updating call sites, map every `fail()` call to its Phase 1 rule:

| Call site | Current message | Required code | Rule |
|-----------|----------------|---------------|------|
| `login.js:40, 44` | `'Invalid email or password.'` | `INVALID_CREDENTIALS` | H7 |
| `reset-password.js:45, 49, 54, 80` | `GENERIC_BAD` variable | `RESET_CODE_INVALID` | H7 |
| `auth.js:427` | `'Session expired...'` | `SESSION_EXPIRED` | - |
| `auth.js:407, 410, 422` | `'Unauthorized'` | `UNAUTHORIZED` | - |
| `auth.js:413` | `'Invalid or missing CSRF token'` | `CSRF_INVALID` | - |
| `rateLimit.js:67` | `'Too many requests...'` | `RATE_LIMITED` | - |

If any new code would let a client distinguish two cases that Phase 1 generic strings
deliberately merged (unknown email vs wrong password; bad code vs wrong security answer),
collapse it. This is the one stage that can silently undo a Phase 1 fix.

### 6.4 - Client: migrate string match to code

**File:** `src/utils/api.js:82`

```js
// Before
if (data?.error && (data.error.includes('Session expired') || data.error.includes('Unauthorized'))) {

// After
if (data?.code && (data.code === ERROR_CODES.SESSION_EXPIRED || data.code === ERROR_CODES.UNAUTHORIZED)) {
```

Search every client file for `.error.includes(`, `.error ===`, `.error.startsWith(` and
rewrite against `data.code`. List any that cannot be converted.

---

## Stage 7 - Routing cleanup

### 7.1 - Canonical SPA mount with redirect

**File:** `src/worker.js`

Check `dist/client/index.html` for the asset `<script src=...>` path before adding a
redirect. If it starts with `/finance/assets/`, canonical mount is `/finance` and bare `/`
should 301 to `/finance`. If it starts with `/assets/`, both mounts are equivalent and no
redirect is needed.

Only add the 301 for the non-canonical mount. State which is canonical in a comment.

### 7.2 - HTTP to HTTPS redirect cleanup

**File:** `src/worker.js:249`

Remove only the `x-forwarded-proto` condition (client-controllable header). Keep the
`url.protocol === 'http:'` check. Cloudflare delivers to Workers over HTTPS internally;
the `x-forwarded-proto` branch is dead code in production.

If unable to confirm Cloudflare behavior: leave the protocol check in place and only remove
the `x-forwarded-proto` condition.

### 7.3 - Outpost redirect scope

**File:** `src/worker.js:262-268`

The Outpost/auction redirect applies to any host. Scope it to production only:
```js
if (isProduction && /^\/(outpost|auction)($|\/|\?)/i.test(url.pathname)) {
```

---

## Stage 8 - Rate limit hardening

### 8.1 - KV namespace not bound

`wrangler.jsonc` has `kv_namespaces` entirely commented out. `RATE_LIMIT_KV` is not bound
in production. The Durable Object handles all real rate limiting. The KV path in
`rateLimit.js:33-51` is an unreachable dead path in production.

Decision: document as development-only fallback. Do not remove the KV code path (useful for
`wrangler dev` without DO). If true production fallback is desired, create the namespace and
uncomment the block in `wrangler.jsonc`.

### 8.2 - `CF-Connecting-IP` fallback key

**File:** `functions/utils/rateLimit.js:57`

```js
const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
```

If the header is never absent in production, change the fallback to a hard error:
```js
const ip = context.request.headers.get('CF-Connecting-IP');
if (!ip && isProduction) {
  console.error('[rateLimit] CF-Connecting-IP absent');
  return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable.');
}
const effectiveIp = ip || 'dev-unknown';
```

Determine empirically first. Document the finding in a comment.

### 8.3 - Missing rate limit on `reset-password`

`functions/api/auth/reset-password.js` has no `enforceRateLimit` call. The per-code attempt
counter in `password_resets.attempts` provides a 5-attempt hard stop per code, but no
per-IP throttle exists.

Add at the top of the handler:
```js
const limited = await enforceRateLimit(context, 'reset', 10, 60);
if (limited) return limited;
```

### 8.4 - Rate limits for new Stage 5 endpoints

| Endpoint | Prefix | Max | Window |
|----------|--------|-----|--------|
| `POST /api/auth/verify-email` | `verify-email` | 5 | 60s |
| `POST /api/auth/resend-verification` | `resend-verify` | 3 | 600s |
| `POST /api/auth/confirm-email-change` | `confirm-email` | 5 | 60s |

---

## Stage 9 - Observability and close out

### 9.1 - Request ID threading

Generate at the top of `fetch()` in `src/worker.js`:
```js
const requestId = crypto.randomUUID();
const context = { request, env, ctx, requestId };
```

Thread through handler context. Every `console.error` includes `requestId`.

Include in error responses from `fail()`:
```js
export function fail(code, status, message, requestId) {
  return json({ error: message, code, ...(requestId ? { requestId } : {}) }, status);
}
```

Do not include `requestId` in successful responses.

### 9.2 - Structured event counters

Emit via `console.log(JSON.stringify({ type: 'metric', event, requestId, ts: Date.now() }))`.

Required events:
- `auth.register.success`, `auth.register.duplicate`
- `auth.login.success`, `auth.login.invalid_credentials`, `auth.login.rehash`
- `auth.forgot.sent`, `auth.forgot.throttled`
- `auth.reset.success`, `auth.reset.bad_code`
- `sync.backup.success`, `sync.backup.conflict`, `sync.backup.suspicious`
- `sync.restore.success`, `sync.restore.not_found`

Keep cardinality low. No user IDs, email addresses, or payload contents as dimensions.

### 9.3 - Final checklist

- [ ] Full test suite green.
- [ ] `npm run build` succeeds with zero errors.
- [ ] Browser walkthrough: register, see verification banner, login, trigger sync conflict
      prompt, complete password reset end-to-end.
- [ ] All new endpoints registered in `src/worker.js` ROUTES table.
- [ ] All new migrations numbered sequentially, idempotent (`CREATE TABLE IF NOT EXISTS`).
- [ ] `ARCHITECTURE.md` updated: new tables, endpoints, email verification flow, sync
      concurrency model, Stage 3 decision outcome.
- [ ] PR description: user-facing changes first, technical summary, manual steps, rollback
      procedure. No em dashes. No marketing tone.

### 9.4 - Manual production steps (run in order)

1. Run migration `0003_*` remotely: `npx wrangler d1 migrations apply personal-budget-db --remote`
2. If Stage 5: confirm `RESEND_API_KEY` and `MAIL_FROM` are set in Worker secrets.
3. If Stage 3 Option B: confirm `_bak_*` tables exist and are populated before declaring
   the migration complete. Do not drop them.
4. Deploy new worker: `npm run deploy`
5. Admin role promotion (if not yet done):
   `UPDATE users SET role = 'admin' WHERE email = 'your-address@techtrekgt.com';`
6. If binding `RATE_LIMIT_KV`: create namespace, paste ID, redeploy.

---

## Cross-stage constraints

- No stage may undo a Phase 1 control. If a proposed change conflicts with `AGENTS.md` or
  `docs/SECURITY-FIXES.md`, stop and flag it.
- Stage 6 is the only stage that can silently undo Phase 1 information-hiding. Audit the
  error code mapping before committing.
- Stages 1 and 2 are independent of Stage 3. Ship them as their own PR. Do not block the
  data-loss fix on the data-model decision.
- Every new authenticated endpoint must authorize against the calling user's own data.
  Tests must prove cross-user access returns 403.
- Every new `useEffect` with listeners or timers must return a cleanup function.
- Schema changes go in numbered migration files only. No ad-hoc `ALTER TABLE` in handlers.
