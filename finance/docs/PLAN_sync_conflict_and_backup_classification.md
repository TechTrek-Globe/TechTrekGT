# PLAN: Sync Conflict Thrash and Backup Classification Fix

Status: PLANNED (no source edited)
Scope: finance app only. Files: `src/context/LedgerDataContext.jsx`, `src/utils/api.js`, `src/worker.js`, docs.

Note: `01_identity_4.md` and `02_arch_4.md` do not exist on disk. Only `03_features_4.md` and `04_state_4.md` do. The non-suffixed `01_identity.md` and `02_arch.md` are assumed to be the sources of truth for those two.

---

## 1. Root Cause Analysis

### Bug 2 (backup spam): the intent flags are lost, and the worker defaults to manual

| # | Location | Defect |
|---|----------|--------|
| 2a | `LedgerDataContext.jsx` `pushCloudBackup` (L299-305) | Calls `pushCloudBackupOptimistic(..., { baseVersion, force })` and drops `options.auto` and `options.manual`. The auto-backup debounce (L657) passes `{ auto: true }` and the Settings button (CloudSyncSubPanel L117) passes `{ manual: true, force: true }`. Neither flag reaches the API client, so `api.js` never sets `requestBody.auto` or `requestBody.manual`. |
| 2b | `worker.js` L648 | `isManual = body.manual === true \|\| (body.manual === undefined && !body.auto)`. A request with no flags is treated as manual. Because of 2a, every auto push, and every offline-queue flush, writes a row to `user_backup_versions`. |
| 2c | `api.js` `flushPendingCloudSync` (L369-374) | Sends `{ budget, baseVersion }` with no `auto` flag, so flushes on login and on the `online` event also become "manual" snapshots. |
| 2d | `LedgerDataContext.jsx` manual button | `force: true` is also dropped, so the manual flow falls back to a CAS push that can 409 instead of forcing. |

Net effect: the 10-row retention window fills with auto-sync noise and evicts real manual snapshots.

### Bug 1 (modal thrash): several overlapping triggers and a bad timestamp comparison

| # | Location | Defect |
|---|----------|--------|
| 1a | Reconcile effect (L544-638) and reset effect (L498-542) | The reset effect sets `hasAutoPulledRef.current = false` when `currentUserId` changes. After login, `isAuthenticated` and `isDbLoaded` can be true before `currentUserId` settles. The reconcile effect runs once, then the user-id change resets the guard and it runs again, so the same conflict is evaluated twice. Its deps (`pushCloudBackup`, `restoreFromBackup`) change identity when `currentUserId` changes, which re-triggers it too. |
| 1b | Debounce effect (L652) | Writes an unscoped `tt_budget_last_modified` (no `:${userId}` suffix) on every data change, including hydration and `restoreFromBackup`. The reconcile effect reads the scoped `tt_budget_last_modified:${uid}`. The two keys never agree, so `localTime` is stale or wrong. |
| 1c | `pushCloudBackup` success (L314) | Stamps `mKey = Date.now()` (client clock). `vKey` is the server `now`. With clock skew, `localTime > savedCloudVersion` even when nothing changed locally, so the "both changed" branch (L591) fires. |
| 1d | Branch at L624-631 | `cloudTime !== localTime && savedCloudVersion === 0` is true on every fresh login when local data exists, because `localTime` is client time and `cloudTime` is server time. It never compares content, so identical data still prompts. |
| 1e | `pushCloudBackup` 409 handling (L318-326) | Any 409 from any caller calls `setSyncConflict`, including silent auto-pushes. Each data change re-arms the debounce while the modal is open, so the modal is re-set repeatedly. There is no in-flight lock, no dedupe, and no suppression window. |
| 1f | Initial flush (L486-488) | `flushPendingCloudSync` runs on auth before reconcile finishes. It pushes with a stale `baseVersion`, which can bump the cloud version and cause a second reconcile conflict. |
| 1g | Debounce skip (L647-650) | `isInitialMountRef` skips only the first trigger. Hydration and restore changes afterwards still arm a 5s auto-push. |

---

## 2. Proposed Fix (minimal surgical deltas)

### 2.1 `src/context/LedgerDataContext.jsx`

1. **Forward intent flags (2a, 2d).** In `pushCloudBackup`, pass `auto: options.auto` and `manual: options.manual` into `pushCloudBackupOptimistic`.
2. **Single-flight reconcile (1a, 1f).**
   - Add `reconcileInFlightRef` (boolean) and `reconcileUserIdRef` (string).
   - The reconcile effect returns early unless `currentUserId` is truthy and `reconcileUserIdRef.current !== currentUserId`. After the guard passes, set `reconcileUserIdRef.current = currentUserId` before the async work.
   - Reset both refs only in the `techtrek:user-logout` handler, not on user-id transitions.
   - Wrap the async body in `try/finally`, clearing `reconcileInFlightRef` in `finally` (FIN-AUDIT-004).
   - Stabilise deps: read `pushCloudBackup`, `restoreFromBackup` and `syncPasscode` via refs so identity changes do not re-run the effect.
3. **Flush ordering (1f).** Gate the login flush (L486) on `reconcileUserIdRef.current === currentUserId`, so the queue only drains after reconcile completes. The `online` event flush stays as is.
4. **Single scoped modified-time marker (1b).** Change L652 to write `tt_budget_last_modified:${uid}` (scoped, via `currentUserId || getCurrentUserId()`). Skip the write while `suppressDirtyRef` is true (set during hydration or restore, cleared in a `setTimeout 0` or `finally`).
5. **Server-aligned timestamps (1c).** After a successful push, set `mKey` to `result.version` (the server version), not `Date.now()`. A push then leaves `localTime === savedCloudVersion` (clean).
6. **Content-fingerprint check before prompting (1d).**
   - Add a small helper that computes a stable fingerprint over the `ALLOWED_BUDGET_KEYS` of local vs `cloudData.budget`. Options: JSON string compare of the projected payload, or a cheap hash of it. No new dependency.
   - If the fingerprints are equal, silently adopt `cloudTime` (set `cloudVersion`, `vKey` and `mKey`) and do NOT open the modal. This applies to both the `savedCloudVersion === 0` branch and the "both changed" branch.
7. **Conflict dedupe (1e).**
   - `pushCloudBackup` only calls `setSyncConflict` when `!options.auto` and no conflict is already open for the same `serverVersion`.
   - For auto-pushes that hit a 409, set `autoConflictPendingRef` and skip further auto-pushes until a reconcile or user resolution clears it. The prompt is still surfaced once, via the functional update `setSyncConflict(prev => prev && prev.serverVersion === sv ? prev : {...})`.
   - Add a post-resolution suppression window of about 10 seconds (`conflictResolvedAtRef`) so the debounce cannot immediately re-open the modal.
8. **Debounce guard (1g).** Skip arming the auto-push timer when `syncConflict` is open, when reconcile is in flight, or when `suppressDirtyRef` is true.
9. **Resolve handlers.** Reset in-flight and suppress refs in `finally` blocks in `resolveConflictKeepLocal` and `resolveConflictUseCloud`. Also reset them on `techtrek:user-logout`. Do not persist any new state across users.

### 2.2 `src/utils/api.js`

1. `flushPendingCloudSync`: add `bodyObj.auto = true` so queued flushes are never classified as manual.
2. Leave the `manual` and `auto` serialisation in `pushCloudBackupOptimistic` as is (already correct).
3. Keep the `tt_budget_cloud_version:${userId}` scoping. No change.

### 2.3 `src/worker.js` `handleSyncBackup`

1. **Explicit-only manual flag.** Change L648 to `const isManual = body.manual === true;`. Absent, `false`, or `auto: true` all mean "update `user_backups` only".
2. Keep the `body.auto` read for logging and metrics only (optional `emitMetric('sync.backup.auto')`).
3. Keep CAS, shrink defense (<10%), UTF-8 byte tracking and 10-row retention unchanged.
4. **Compensating cleanup (FIN-AUDIT-001).** The catch block already deletes `versionId`. Also guard the `changes === 0` path so it only issues the `DELETE ... WHERE id = ?` when `versionId` is non-null (currently it binds `null` for auto pushes).
5. **Defensive retention dedupe (optional, flagged for review).** A manual push whose `data` is byte-identical to the newest snapshot would skip the insert (`WHERE NOT EXISTS (SELECT 1 FROM user_backup_versions WHERE user_id = ? AND data = ?)` bound positionally). This is the only logic change beyond the requested flag fix, so it needs your approval.

### 2.4 One-time data cleanup (needs your decision)

Existing spam rows in `user_backup_versions` cannot be told apart from true manual snapshots (the schema has no `kind` column). Options are listed in section 5.

---

## 3. FIN-AUDIT-001 / 004 Verification Checklist

Run after the edits:

1. `grep` in `src/worker.js` and `functions/**` for ``prepare(`...${`` and for `.prepare(` followed by string concatenation. Expectation: zero hits. Every `db.prepare(sql).bind(...)` uses positional `?`. Handler review so far shows `handleSyncBackup`, `handleSyncRestore`, `handleSyncVersions` and `handleSyncRestoreVersion` already compliant.
2. Multi-step mutation in `handleSyncBackup`: confirm the catch performs the compensating `DELETE FROM user_backup_versions WHERE id = ?` and is skipped when `versionId` is null.
3. Frontend: every new async path (reconcile, resolve handlers, manual push button in `CloudSyncSubPanel.jsx` L113-125) resets loading state in `finally`. Check `handlePushCloudBackup` and add `finally` if missing.
4. `techtrek:user-logout` handler purges all new refs (`reconcileInFlightRef`, `reconcileUserIdRef`, `autoConflictPendingRef`, `suppressDirtyRef`, `conflictResolvedAtRef`) and clears `syncConflict`.
5. Confirm all version and modified markers are `...:${userId}` scoped, and the unscoped `tt_budget_last_modified` write is gone.
6. No em dashes in edited code, comments or docs.

---

## 4. Tests

Existing suites to keep green: `tests/edge-cas-vault-retention.test.js`, `tests/edge-cas-concurrency.test.js`, `tests/edge-d1-parameterization.test.js`, `tests/phase2-issue-session-and-backup-length.test.js`.

New or updated cases:

- Worker: POST with no `manual` or `auto` flag creates no `user_backup_versions` row; `manual: true` creates exactly one; `auto: true` creates none; retention stays at 10 after 15 manual pushes.
- Worker: a 409 on an auto push issues no cleanup against a null id.
- API client: `flushPendingCloudSync` body contains `auto: true`.
- Context logic (extract fingerprint helper so it is unit-testable): identical local and cloud content yields no conflict; divergent content with `savedCloudVersion === 0` yields exactly one conflict; double reconcile for one user yields one network call.

Commands (from `e:\TechTrekGT\finance`): `npm run test`, `npm run test:unit`.

---

## 5. Open Questions for You

1. **Existing spam rows:** (a) leave as is, they age out after 10 new manual saves; (b) one-time SQL cleanup of `user_backup_versions` per user (destructive); (c) add a `kind` column migration (`manual` or `auto`) and only prune `auto` rows. Recommended: (a), as the worker fix stops new spam immediately.
2. **Byte-identical manual dedupe (section 2.3 item 5):** include or skip?
3. **Silent adopt on matching fingerprint:** OK to treat identical content as "no conflict" even when versions differ?

---

## 6. Post-Flight (after approval and implementation)

1. `npm run build`, then `npm run deploy` in `e:\TechTrekGT\finance`, and verify the live Worker URL.
2. Update `finance/docs/03_features.md` and `finance/docs/04_state.md` (single-flight reconcile, explicit-manual-only classification, fingerprint check, conflict dedupe). Update the `_4` copies if you maintain them. Root `docs/04_state.md` needs a note only if the D1 schema changes (option 1c).
