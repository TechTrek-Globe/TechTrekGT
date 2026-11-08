# D1 Runaway Write Audit & Remediation Plan: Finance OS (`personal-budget-db`)

**Database**: `personal-budget-db` (`10f220d4-1c10-49e9-b63e-5d4cb08d599f`)  
**Incident Metric**: 90.45k rows written / 100k daily free tier limit across 16.75k queries in 24 hours.  
**Target Application**: Finance OS (`e:/TechTrekGT/finance`)  
**Stack Constraints**: Pure JavaScript (React 19, Vite 6, Cloudflare Workers ESM, strictly no TypeScript), positional `?` SQL bindings (`FIN-AUDIT-001`), zero-touch formatting on adjacent code.

---

## 1. Surgical Trace of All Finance OS D1 Write Queries

Every `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, and `env.DB.batch` operation across `finance/src/worker.js` and `finance/functions/` has been traced:

| # | File & Function | Endpoint / Trigger | SQL Write Operation(s) | Write Amplification Risk |
| :--- | :--- | :--- | :--- | :--- |
| **1** | [`worker.js`](file:///e:/TechTrekGT/finance/src/worker.js#L571-L761) `handleSyncBackup` | `POST /api/sync/backup` | `env.DB.batch`:<br>1. `INSERT INTO user_backups (id, data, data_byte_length, updated_at, updated_at_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ...`<br>2. *(If `manual === true`)* `INSERT INTO user_backup_versions ...` + `DELETE FROM user_backup_versions WHERE user_id = ? AND id NOT IN (... LIMIT 10)`<br>3. *(On CAS conflict with `versionId`)* `DELETE FROM user_backup_versions WHERE id = ?` | **CRITICAL**: Invoked automatically by client sync loops, initial hydration false-dirty triggers, and stuck offline sync queue flushes. Also lacks a server-side payload equality guard, rewriting the entire JSON blob + index rows even when `excluded.data === user_backups.data`. |
| **2** | [`ledgerAccess.js`](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js#L9-L53) `ensureLedgerTables` | Called on **every** `/api/sync/*`, `/api/finance/ledgers*`, `/api/admin/stats`, `/api/admin/ledger-membership`, and `/api/auth/register` request when `tablesReady === false` | `db.batch` executing **8 DDL statements** (`3x CREATE TABLE IF NOT EXISTS` + `5x CREATE INDEX IF NOT EXISTS`) on every cold Worker isolate. | **HIGH**: Schema DDL execution on the hot request path across cold Worker isolates. |
| **3** | [`ledgerAccess.js`](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js#L99-L107) `resolveLedgerAccess` | Called on every `GET /api/sync/restore`, `POST /api/sync/backup`, `GET /api/sync/versions`, `POST /api/sync/restore-version`, and `DELETE /api/sync/versions` | `INSERT OR IGNORE INTO finance_ledgers (id, owner_id, name) VALUES (?, ?, ?)` when `targetId === uid` and no row is found. | **MEDIUM**: Write-on-read behavior during `GET /api/sync/restore` and `GET /api/sync/versions`. |
| **4** | [`stats.js`](file:///e:/TechTrekGT/finance/functions/api/admin/stats.js#L81-L90) `onRequestGet` | `GET /api/admin/stats` | Unconditional bulk write on every GET poll:<br>`INSERT OR IGNORE INTO finance_ledgers (id, owner_id, name) SELECT u.id, u.id, ... FROM users u WHERE u.id IN (...)` | **HIGH**: Executes a multi-subquery `INSERT OR IGNORE` table scan and write on every admin dashboard read/refresh. |
| **5** | [`worker.js`](file:///e:/TechTrekGT/finance/src/worker.js#L951-L1009) `handleSyncDeleteVersion` | `DELETE /api/sync/versions` | `DELETE FROM user_backup_versions WHERE id = ? AND user_id = ?` | **LOW**: Manual user action in Cloud Sync modal. |
| **6** | [`ledger-shares.js`](file:///e:/TechTrekGT/finance/functions/api/finance/ledger-shares.js#L50-L430) `handleLedgerShares` | `GET / POST / PATCH / DELETE /api/finance/ledgers*` | `UPDATE ledger_invites`, `INSERT INTO ledger_shares`, `INSERT OR IGNORE INTO finance_ledgers`, `INSERT INTO user_backups`, `DELETE FROM finance_ledgers/user_backups` | **LOW**: Triggered on explicit ledger creation, sharing, or invite acceptance (except `GET /api/finance/ledgers` which calls `ensureLedgerTables` and `INSERT OR IGNORE INTO finance_ledgers` at line 203). |
| **7** | [`login.js`](file:///e:/TechTrekGT/finance/functions/api/auth/login.js#L80-L92) `onRequestPost` | `POST /api/auth/login` | `UPDATE users SET last_login = ?, sign_in_count = COALESCE(sign_in_count, 0) + 1 WHERE id = ?` | **LOW**: Fires only on explicit interactive login form submission. |
| **8** | [`logout.js`](file:///e:/TechTrekGT/finance/functions/api/auth/logout.js#L16-L20) `onRequestPost` | `POST /api/auth/logout` | `UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?` | **LOW**: Fires only on explicit interactive logout. |
| **9** | [`register.js`](file:///e:/TechTrekGT/finance/functions/api/auth/register.js), [`verify-email.js`](file:///e:/TechTrekGT/finance/functions/api/auth/verify-email.js), [`forgot-password.js`](file:///e:/TechTrekGT/finance/functions/api/auth/forgot-password.js), [`reset-password.js`](file:///e:/TechTrekGT/finance/functions/api/auth/reset-password.js), [`update-profile.js`](file:///e:/TechTrekGT/finance/functions/api/auth/update-profile.js), [`confirm-email-change.js`](file:///e:/TechTrekGT/finance/functions/api/auth/confirm-email-change.js) | Explicit Auth Flows | `INSERT INTO users`, `UPDATE users`, `INSERT OR IGNORE INTO finance_ledgers` | **LOW**: One-off user account lifecycle actions. |

---

## 2. Root Cause Audit Across All 4 Investigative Scopes

### Scope 1: Client-to-Cloud Sync Loops (IndexedDB to D1) - **PRIMARY ROOT CAUSE FOUND**

Three compounding defects in [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx) and [`api.js`](file:///e:/TechTrekGT/finance/src/utils/api.js) create continuous `POST /api/sync/backup` write storms and CAS (`tt_budget_cloud_version:${userId}`) timestamp mismatches:

#### Defect 1A: Initial Seed Hydration False-Dirty Trigger on Every Mount / Reload
* **Location**: [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L119-L129) and [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L785-L819).
* **Mechanism**:
  1. When `BudgetMetadataProvider` finishes reading IndexedDB, it sets `isDbLoaded = true` and `initialLedgerSeed = { dailyMatrix, lineItems, transactions }` ([`BudgetMetadataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/BudgetMetadataContext.jsx#L280-L289)).
  2. On the **first render pass** where `isDbLoaded` becomes `true`, two `useEffect` hooks in `LedgerDataProvider` fire in the same commit:
     - Effect 1 ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L119-L129)) hydrates `dailyMatrix`, `matrixVersion`, `lineItems`, and `transactions` from `initialLedgerSeed` via `setState` calls (which schedule a **second render**).
     - Effect 2 ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L789-L793)) checks `if (isInitialMountRef.current)`, immediately flips `isInitialMountRef.current = false`, captures the **pre-hydrated empty state** in `lastSeenDataRef.current`, and returns.
  3. On the **second render pass** (when `dailyMatrix`, `matrixVersion`, `lineItems`, and `transactions` actually populate from `initialLedgerSeed`), `isInitialMountRef.current` is already `false`!
  4. Line 796 evaluates `dataChanged = true` (`lastSeenDataRef.current.ui !== budgetForUI || lastSeenDataRef.current.mv !== matrixVersion`), sets `autoPushPendingRef.current = true`, **overwrites `localStorage.setItem('tt_budget_last_modified:${uid}', String(Date.now()))`**, and starts a 5-second timer to execute `pushCloudBackup(syncPasscode, { auto: true })`.
  5. **Compounding Reconcile Push**: Because step 4 just stamped `tt_budget_last_modified:${uid} = Date.now()`, when the initial login reconcile `useEffect` ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L679-L779)) completes its `GET /api/sync/restore`, it compares `localTime > savedCloudVersion` (line 761). Since `localTime` was just falsified to `Date.now()`, `localTime > savedCloudVersion` evaluates to `true`, triggering an **immediate** `pushCloudBackup` at line 763, followed 5 seconds later by the debounced auto-backup push at line 811!
  6. Thus, **every single page load, tab open, or refresh unconditionally stamps local data as modified and fires 1 to 2 `POST /api/sync/backup` D1 writes**, even with zero user interaction.

#### Defect 1B: Stuck Offline Sync Queue (`cf_pending_sync:${userId}`) + Unconditional Force Flush
* **Location**: [`api.js`](file:///e:/TechTrekGT/finance/src/utils/api.js#L194-L315) (`pushCloudBackupOptimistic`), [`api.js`](file:///e:/TechTrekGT/finance/src/utils/api.js#L350-L413) (`flushPendingCloudSync`), and [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L770-L778).
* **Mechanism**:
  1. In [`pushCloudBackupOptimistic`](file:///e:/TechTrekGT/finance/src/utils/api.js#L203), `savePendingSync(budgetData, passcode || '', userId)` writes the entire serialized budget into `localStorage` (`cf_pending_sync:${userId}`) **before** calling `fetch('/api/sync/backup')`.
  2. `clearPendingSync(userId)` is **only** called on `res.ok && data.success` ([`api.js`](file:///e:/TechTrekGT/finance/src/utils/api.js#L294)).
  3. If the server returns **`409 Conflict`** (due to a multi-tab/multi-device CAS mismatch or Defect 1A), `400`, or `403`, `clearPendingSync(userId)` is **never called**. The rejected payload remains permanently trapped in `cf_pending_sync:${userId}`.
  4. In [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L771-L776), the login reconcile `finally` block **unconditionally calls `await flushPendingCloudSync(syncPasscode, currentUserId)`**—even when reconcile just pulled newer data from the cloud or hit a `409 Conflict`!
  5. Worse still, inside [`flushPendingCloudSync`](file:///e:/TechTrekGT/finance/src/utils/api.js#L372-L380):
     - If `tt_budget_cloud_version:${userId}` is present, it sends `expectedVersion: Number(savedVerStr)`, which hits `409 Conflict` again and leaves the item stuck in `cf_pending_sync:${userId}` to retry on every page load and `online` event.
     - If `tt_budget_cloud_version:${userId}` is missing or `0`, line 378 sets `bodyObj.force = true`, silently **force-overwriting** D1 `user_backups` with stale offline queue data!

#### Defect 1C: Zero Client or Server Payload Idempotency Guard
* **Location**: [`worker.js`](file:///e:/TechTrekGT/finance/src/worker.js#L622-L711) and [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L330-L380).
* **Mechanism**:
  - Neither `pushCloudBackup` on the client nor `handleSyncBackup` on the Worker checks whether the serialized budget JSON (`dataStr`) is identical to the currently stored `user_backups.data`.
  - Even when the payload is byte-for-byte identical, `handleSyncBackup` executes `env.DB.batch` (`INSERT INTO user_backups ... ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at_ms = excluded.updated_at_ms`), advancing `updated_at_ms` in D1 and invalidating other open tabs' `tt_budget_cloud_version:${userId}` timestamps.

---

### Scope 2: Web Worker Offloading (`spreadsheet.worker.js`) - **CONFIRMED CLEAN**
* **Files Audited**: [`spreadsheet.worker.js`](file:///e:/TechTrekGT/finance/src/workers/spreadsheet.worker.js#L1-L41), [`spreadsheetWorkerClient.js`](file:///e:/TechTrekGT/finance/src/utils/spreadsheetWorkerClient.js#L1-L148), and [`SpreadsheetImporter.jsx`](file:///e:/TechTrekGT/finance/src/components/SpreadsheetImporter.jsx#L1-L800).
* **Findings**:
  - `spreadsheet.worker.js` is a pure, stateless request-response message handler supporting 4 commands (`INSPECT_WORKBOOK`, `PARSE_SINGLE_SHEET`, `PARSE_SPREADSHEET`, `PARSE_GENERIC_FLAT`).
  - It is only invoked when a user explicitly drops or selects a file in `SpreadsheetImporter.jsx`, and the worker instance is terminated when `SpreadsheetImporter` unmounts (`terminateSpreadsheetWorker()`).
  - It does not poll, loop, or mutate React Context state in the background.

---

### Scope 3: Auth & Session Token Churn - **CONFIRMED CLEAN (WITH ADMIN / LEDGER GET WRITE SIDE-EFFECTS IDENTIFIED)**
* **Files Audited**: [`auth.js`](file:///e:/TechTrekGT/finance/functions/utils/auth.js#L1-L1085), [`me.js`](file:///e:/TechTrekGT/finance/functions/api/auth/me.js), [`refresh.js`](file:///e:/TechTrekGT/finance/functions/api/auth/refresh.js), [`login.js`](file:///e:/TechTrekGT/finance/functions/api/auth/login.js), [`logout.js`](file:///e:/TechTrekGT/finance/functions/api/auth/logout.js), [`AuthContext.jsx`](file:///e:/TechTrekGT/finance/src/context/AuthContext.jsx#L1-L437).
* **Findings**:
  - [`getAllTokensFromRequest`](file:///e:/TechTrekGT/finance/functions/utils/auth.js#L430-L469) parses `Authorization` and duplicate `Cookie` (`tt_auth`) headers purely in memory and performs **zero** D1 queries.
  - [`authenticate`](file:///e:/TechTrekGT/finance/functions/utils/auth.js#L504-L607) is strictly read-only (`SELECT ... FROM users WHERE id = ?`) and caches the user profile across KV, Cloudflare Cache API (`caches.default`), and an isolate-local `Map` for `USER_CACHE_TTL_SEC = 60` seconds.
  - `GET /api/auth/me` and `POST /api/auth/refresh` issue JWTs via WebCrypto without writing to D1. `token_version` is only incremented on explicit `POST /api/auth/logout` or password reset.
  - **Write-on-GET Side-Effects Found in Adjacent Middleware**:
    1. [`ensureLedgerTables`](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js#L9-L53) runs an 8-statement DDL `db.batch` on every cold Worker isolate across sync, ledger, and admin routes.
    2. [`resolveLedgerAccess`](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js#L99-L107) runs `INSERT OR IGNORE INTO finance_ledgers` on read-only `GET /api/sync/restore` and `GET /api/sync/versions` requests.
    3. [`GET /api/admin/stats`](file:///e:/TechTrekGT/finance/functions/api/admin/stats.js#L81-L90) runs an unconditional bulk `INSERT OR IGNORE INTO finance_ledgers SELECT ...` on every GET request.

---

### Scope 4: UI Synchronicity & Contexts (`BudgetMetadataContext` & `LedgerDataContext`) - **ISSUES FOUND**

* **Files Audited**: [`BudgetMetadataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/BudgetMetadataContext.jsx#L1-L800), [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L1-L1600), [`DataSyncPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/DataSyncPanel.jsx#L1-L131).
* **Findings**:
  1. **Stale Closures in `pushCloudBackup` & `moveDailyMatrixCell`**:
     - [`pushCloudBackup`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L330-L380) declares dependencies `[setLastCloudSyncTime, currentUserId]`, omitting `activeLedgerId`, `ledgerRole`, and `ledgerPermissions`. When a user switches ledgers or has their role resolved to `'viewer'`, `pushCloudBackup` executes with stale `activeLedgerId` and `ledgerRole` closure values!
     - [`moveDailyMatrixCell`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L1232-L1268) declares `useCallback(..., [])`, omitting `[ledgerRole, ledgerPermissions]`.
  2. **`restoreFromBackup` Does Not Clear `autoPushPendingRef` or Update `lastSeenDataRef`**:
     - In [`restoreFromBackup`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L432-L446), `suppressDirtyUntilRef.current = Date.now() + 1500` is set, and state setters are called.
     - However, in the auto-backup `useEffect` ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L796-L800)), `lastSeenDataRef.current` is updated *before* checking `if (Date.now() < suppressDirtyUntilRef.current) return;`, and **`autoPushPendingRef.current` is never reset to `false`** when a cloud restore happens. If `autoPushPendingRef.current` was `true` before the restore, the next dependency change after 1500ms pushes the restored cloud backup right back to D1.
  3. **`switchLedger` Does Not Sync `cloudVersion`**:
     - In [`switchLedger`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L555-L572), calling `restoreFromBackup(data.budget)` when switching to a shared ledger does not update `cloudVersion` / `cloudVersionRef.current` or `tt_budget_cloud_version:${newLedgerId}`, guaranteeing a `409 Conflict` or stale CAS check on the next edit.
  4. **`pushCloudBackupOptimistic` Pending Queue Key Mismatch on Shared Ledgers**:
     - In [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L370), on `409 Conflict`, `mKey` is read from `tt_budget_last_modified:${currentUserId}` instead of `targetLid`.
  5. **`DataSyncPanel.jsx` Unscoped Polling**:
     - In [`DataSyncPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/DataSyncPanel.jsx#L37-L45), a 5-second `setInterval` calls `getPendingSync()` without passing `currentUserId`, reading `cf_pending_sync:legacy` instead of `cf_pending_sync:${currentUserId}`.
  6. **`finally {}` Loading Flag Audit**:
     - `BudgetMetadataContext.jsx`: `initLocalStorageOrIndexedDB` properly sets `setIsDbLoaded(true)` in `finally {}` (line 288).
     - `LedgerDataContext.jsx`: `fetchAvailableLedgers` (`setIsLoadingLedgers(false)` at line 513), `switchLedger` (`setIsLoadingLedgers(false)` at line 570), `pullCloudBackup` (`setIsSyncing(false)` at line 424), `pushCloudBackup` (`setIsSyncing(false)` at line 378), and the login reconcile effect (`setIsSyncing(false)` at line 777) all reset loading flags inside `finally {}` blocks.

---

## 3. Phased Remediation Strategy

### Phase 1: Client Sync & React Context Hardening ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx))

1. **Eliminate Initial Seed Hydration False-Dirty Trigger**:
   - Introduce `isSeedHydratedRef = useRef(false)`.
   - In the seed hydration `useEffect` ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L119-L129)), mark `isSeedHydratedRef.current = true` only after `initialLedgerSeed` has been applied (or immediately if `isDbLoaded && !initialLedgerSeed`), and set `suppressDirtyUntilRef.current = Date.now() + 1500`.
   - In the auto-backup `useEffect` ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L785-L819)), wait until `isDbLoaded && isSeedHydratedRef.current` before initializing `isInitialMountRef.current = false` and capturing `lastSeenDataRef.current = { ui: budgetForUI, mv: matrixVersion }`.
   - Ensure initial hydration **never** stamps `tt_budget_last_modified:${uid}` or schedules an automatic cloud backup on page load.

2. **Reset Pending Auto-Push & Sync Version on Cloud Restore / Ledger Switch**:
   - In [`restoreFromBackup`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L432-L446), explicitly set `autoPushPendingRef.current = false` and `suppressDirtyUntilRef.current = Date.now() + 2000`.
   - In the auto-backup `useEffect` ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L796-L802)), if `Date.now() < suppressDirtyUntilRef.current`, update `lastSeenDataRef.current = { ui: budgetForUI, mv: matrixVersion }`, set `autoPushPendingRef.current = false`, and return early without stamping `tt_budget_last_modified:${uid}`.
   - In [`switchLedger`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L555-L572), update `cloudVersion` and `tt_budget_cloud_version:${newLedgerId}` using `data.version` from `/api/sync/restore`.

3. **Fix React `useCallback` Dependency Arrays**:
   - Update [`pushCloudBackup`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L380) dependencies to `[setLastCloudSyncTime, currentUserId, activeLedgerId, ledgerRole, ledgerPermissions]`.
   - Update [`moveDailyMatrixCell`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L1268) dependencies to `[ledgerRole, ledgerPermissions]`.
   - In `pushCloudBackup` conflict handling (line 370), scope `mKey` to `targetLid` (`tt_budget_last_modified:${targetLid}`).

4. **Client-Side Payload Fingerprint Guard (Idempotency)**:
   - Maintain `lastSyncedPayloadHashRef = useRef(null)` in `LedgerDataContext.jsx`.
   - Compute a lightweight deterministic string fingerprint (length + DJB2/FNV-1a hash of the serialized `dailyMatrix`, `lineItems`, `transactions`, and metadata) before executing `pushCloudBackup` when `options.auto === true`.
   - If the fingerprint matches `lastSyncedPayloadHashRef.current`, skip the network request and D1 write entirely. Update `lastSyncedPayloadHashRef.current` on every successful push or pull.

5. **Guard Login Reconcile `finally` Block**:
   - In the login reconcile `useEffect` ([`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L770-L778)), only call `flushPendingCloudSync` if reconcile did not just restore newer cloud state or enter a `409 Conflict` state.

---

### Phase 2: Offline Sync Queue & CAS Hardening ([`api.js`](file:///e:/TechTrekGT/finance/src/utils/api.js) & [`DataSyncPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/DataSyncPanel.jsx))

1. **Prevent Stuck `409 Conflict` Payloads in `cf_pending_sync:${userId}`**:
   - In [`pushCloudBackupOptimistic`](file:///e:/TechTrekGT/finance/src/utils/api.js#L194-L315):
     - Scope `savePendingSync` and `clearPendingSync` to `targetLid = ledgerId || userId`.
     - If the server responds with `res.status === 409` (CAS version conflict) or `400`/`403` (permanent client/permission rejection), **call `clearPendingSync(targetLid)`** so the rejected payload is not endlessly retried by background queue flushes (conflict resolution is handled via the `syncConflict` UI state and `tt_budget_last_modified:${targetLid}`).
     - Only retain `cf_pending_sync:${targetLid}` when `!navigator.onLine`, a network/fetch exception occurs, or the server returns a transient error (`5xx` or `429`).

2. **Eliminate Blind `force: true` Overwrites in `flushPendingCloudSync`**:
   - In [`flushPendingCloudSync`](file:///e:/TechTrekGT/finance/src/utils/api.js#L350-L413):
     - Never set `bodyObj.force = true` automatically when `savedVerStr` is missing.
     - If `flushPendingCloudSync` receives a `409 Conflict` or `403 Forbidden`, call `clearPendingSync(userId)` immediately so background `online` / reconcile triggers cannot loop indefinitely.

3. **Fix User-Scoped Queue Check in `DataSyncPanel.jsx`**:
   - In [`DataSyncPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/DataSyncPanel.jsx#L37-L45), pass `currentUserId` into `getPendingSync(currentUserId)` and include `currentUserId` in the `useEffect` dependency array.

---

### Phase 3: Worker Endpoint Idempotency & Write-on-GET Elimination ([`worker.js`](file:///e:/TechTrekGT/finance/src/worker.js), [`ledgerAccess.js`](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js), [`stats.js`](file:///e:/TechTrekGT/finance/functions/api/admin/stats.js))

1. **Server-Side No-Op Write Suppression in `POST /api/sync/backup` ([`worker.js`](file:///e:/TechTrekGT/finance/src/worker.js#L622-L725))**:
   - During the pre-check query in `handleSyncBackup`:
     ```sql
     SELECT updated_at, updated_at_ms, data_byte_length,
            CASE WHEN data_byte_length = ? AND data = ? THEN 1 ELSE 0 END AS is_identical
     FROM user_backups WHERE id = ?
     ```
   - Using positional bindings `[dataByteLength, dataStr, targetLedgerId]`, SQLite short-circuits the `data = ?` comparison unless `data_byte_length` matches, avoiding unnecessary large-string comparisons in JS while keeping memory overhead near zero.
   - If `existing?.is_identical === 1 && !isManual`:
     - Return `200 OK` immediately with `{ success: true, unchanged: true, timestamp: existing.updated_at, version: existing.updated_at_ms, byteLength: existing.data_byte_length }` and execute **zero `env.DB.batch` writes**.

2. **Remove Unconditional Cold-Isolate DDL Batch & Read-Path Writes ([`ledgerAccess.js`](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js))**:
   - `finance_ledgers`, `ledger_invites`, and `ledger_shares` are already provisioned in [`schema.sql`](file:///e:/TechTrekGT/finance/schema.sql#L140-L185).
   - Remove the unconditional `await ensureLedgerTables(env.DB)` call from the hot request path; retain `ensureLedgerTables` only as a lazy recovery helper if a query throws a `no such table` error.
   - In [`resolveLedgerAccess`](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js#L99-L107), when `targetId === uid` and no row exists in `finance_ledgers`, return the virtual owner access object `{ allowed: true, role: 'owner', permissions: ['read', 'write', 'delete', 'manage'], ledger: { id: uid, owner_id: uid, name: 'Personal Ledger' } }` in memory **without executing `INSERT OR IGNORE INTO finance_ledgers` on every read/sync call**.
   - Similarly, in [`ledger-shares.js`](file:///e:/TechTrekGT/finance/functions/api/finance/ledger-shares.js#L201-L212) (`GET /api/finance/ledgers`), construct the default personal ledger entry in memory if not yet persisted in `finance_ledgers` instead of writing on GET.

3. **Remove Write-on-GET in `GET /api/admin/stats` ([`stats.js`](file:///e:/TechTrekGT/finance/functions/api/admin/stats.js#L81-L90))**:
   - Delete the `INSERT OR IGNORE INTO finance_ledgers ... SELECT u.id ...` write statement from `GET /api/admin/stats`.
   - Synthesize default personal ledger rows in memory for finance users who have a `user_backups` record but do not yet have an explicit row in `finance_ledgers`.

---

## 4. Verification & Post-Flight Checklist

Once approved, implementation will follow this exact sequence:
1. Apply surgical deltas to [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx), [`api.js`](file:///e:/TechTrekGT/finance/src/utils/api.js), [`DataSyncPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/DataSyncPanel.jsx), [`worker.js`](file:///e:/TechTrekGT/finance/src/worker.js), [`ledgerAccess.js`](file:///e:/TechTrekGT/finance/functions/utils/ledgerAccess.js), [`ledger-shares.js`](file:///e:/TechTrekGT/finance/functions/api/finance/ledger-shares.js), and [`stats.js`](file:///e:/TechTrekGT/finance/functions/api/admin/stats.js).
2. Update [`finance/docs/03_features.md`](file:///e:/TechTrekGT/finance/docs/03_features.md), [`finance/docs/04_state.md`](file:///e:/TechTrekGT/finance/docs/04_state.md), and root [`docs/04_state.md`](file:///e:/TechTrekGT/docs/04_state.md) per the mandatory post-flight documentation rule.
3. Run `npm run build` and `npm run deploy` inside `e:/TechTrekGT/finance` and verify the live Cloudflare Worker deployment.
