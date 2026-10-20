# Finance OS - Architectural, Security, Data-Flow & Operational Audit

## 1. Executive Summary & Architecture Health

An exhaustive, multi-tier architectural, security, data-flow, and operational audit was executed across the TechTrekGT - Finance OS application codebase (`e:/TechTrekGT/finance`). The audit cross-examined the complete client React 19 tree, Cloudflare Workers edge runtime (`src/worker.js`, `functions/api/*`), Web Workers (`spreadsheet.worker.js`), custom SPA routing, IndexedDB storage engine, and Cloudflare D1 SQLite relational layer (`personal-budget-db`).

### High-Level Verdict: CONDITIONAL PASS / PRODUCTION BLOCKERS IDENTIFIED

- System Reliability: High client-side calculation robustness across core matrix routines, but degraded by test suite temporal decay and an ESLint `no-useless-assignment` error that breaks the automated build and linting gates.
- Security Baseline: Solid defense-in-depth architecture. Enforces HttpOnly; Secure; SameSite=Strict dual-cookie scoping (`/finance`, `/api`), Turnstile bot verification, PBKDF2-SHA256 password hashing (600,000 iterations), positional SQLite parameterization (zero string interpolation), and atomic token version revocation. However, KV cache resolution omits the centralized `GATEWAY_KV` binding in `auth.js`.
- Financial Precision (FIN-AUDIT-003): Core mathematical routines in `formatters.js` and `ledgerEngine.js` properly enforce `Number.EPSILON` boundary preservation and negative zero normalization. However, 18 distinct call sites across `LedgerView.jsx`, `spreadsheetParser.js`, `spreadsheet.js`, `importer.js`, and `AmortizationView.jsx` bypass `round2()` in favor of raw `Math.round(x * 100) / 100` or raw floating-point calculations, risking sub-cent accumulation drift and negative zero (`-0`) state serialization.
- Cloud Vault & Concurrency Sync: Robust CAS optimistic locking via `baseVersion`, UTF-8 byte tracking, and suspicious shrink (<10%) defense. However, historical snapshot retention in `src/worker.js` is prematurely pruned at `LIMIT 4` instead of the 10-snapshot invariant mandated by `docs/02_arch.md`.
- Deployment Readiness: BLOCKED until the ESLint migration regression, the time-decayed test assertion, and the 10-version snapshot limit are corrected.

---

## 2. Critical Flaws & Functional Bugs Matrix

| ID | Dimension | File & Line Reference | Mechanism / Root Cause | Operational Impact |
| --- | --- | --- | --- | --- |
| BUG-001 | Build / Linting | `finance/src/migrations/budgetMigrations.js:543` | `currentVersion = 8;` is assigned after the final migration step and never subsequently read, triggering ESLint `no-useless-assignment`. | Fatal build-gate failure. `npm run lint` fails with exit code 1, violating the zero-error build mandate. |
| BUG-002 | Regression Testing | `finance/tests/fix-02-no-auto-delete-credits.test.js:103-113` | Test uses dynamic `new Date()` against a static fixture (`incident-household.json`) with dates ending 2026-10-18. Once system clock passes 2026-10-18, `cellIso > todayIso` evaluates to `false`, causing `oldPruneLogic` to prune 0 keys and triggering an assertion failure. | Fatal test runner failure. `npm test` fails with exit code 1 due to temporal test decay. |
| BUG-003 | CAS Disaster Recovery | `finance/src/worker.js:674, 811` | `handleSyncBackup` and `handleSyncVersions` prune and query historical snapshots with `LIMIT 4` instead of `LIMIT 10`. | Violates architectural invariant and `docs/02_arch.md`. Point-in-time recovery is truncated, discarding 6 recoverable backup snapshots. |
| BUG-004 | Financial Precision | `finance/src/components/LedgerView.jsx:898, 922, 923, 927` | Computes `totalBeg`, `regBeg`, `extraBeg`, and `otherAmt` via raw `Math.round(x * 100) / 100` rather than `round2()`. | Violates FIN-AUDIT-003. Fails `Number.EPSILON` boundary preservation on half-cent boundaries and allows `-0` to leak into ledger table cells. |
| BUG-005 | Financial Precision | `finance/src/utils/spreadsheetParser.js:421, 503, 504, 517, 518, 523, 933, 994, 1075, 1076, 1089, 1090, 1095` | Raw `Math.round(x * 100) / 100` calls used in sheet cell parsing, starting balances, and statement row conversions. | Violates FIN-AUDIT-003. Ingestion calculations produce sub-cent floating drift prior to committing data to client state. |
| BUG-006 | Financial Precision | `finance/src/utils/spreadsheet.js:166, 167, 232, 233, 288, 289, 766` | Raw `Math.round(x * 100) / 100` used when calculating initial account balances and transaction balance checkpoints. | Violates FIN-AUDIT-003. Truncation errors on imported statement starting values. |
| BUG-007 | Financial Precision | `finance/src/components/AmortizationView.jsx:90-93, 128-134` | Unrounded IEEE 754 division and multiplication for monthly equivalent payments, scheduled period payments, and principal/interest splits. | Cumulative multi-year interest and principal numbers drift by pennies over 360-month schedules. |
| BUG-008 | Security / Edge KV | `finance/functions/utils/auth.js:574, 611, 643` | User session caching checks `env?.USER_CACHE \|\| env?.RATE_LIMIT_KV`, omitting `env?.GATEWAY_KV`. | Violates FIN-AUDIT-002. Edge gateway caching fails to resolve sessions from the platform's primary `GATEWAY_KV` namespace, causing unnecessary D1 read queries. |
| BUG-009 | Code Standards / ESM | `finance/src/App.jsx:204` & `finance/src/utils/indexedDB.js:71` | Mid-file `import { logState }` statements placed below top-level component and constant declarations. | Violates ESM clean-syntax rules. Risks static analysis and tree-shaking anomalies. |
| BUG-010 | State Synchronicity | `finance/src/components/SpreadsheetImporter.jsx:418-457` | `processFile` sets `stage = PARSING` and resets to `IDLE` in `catch`, but lacks a structured `finally` block. | Violates FIN-AUDIT-004. An unhandled exception during file reading leaves the UI permanently locked in the loading spinner state. |
| BUG-011 | Admin Telemetry | `finance/functions/api/admin/stats.js:31-33` | Hardcodes `backupCount: 1` per user based strictly on `user_backups`, ignoring `user_backup_versions`. | Telemetry reports inaccurate backup metrics for users who maintain manual point-in-time snapshots. |

---

## 3. Source-to-Sink Taint Map

| Input Source | Execution/Storage Sink | Sanitization Status | Risk Rating | Remediation |
| --- | --- | --- | --- | --- |
| HTTP Request Cookie (`auth_token`) | `authenticate()` -> `verifyToken()` -> WebCrypto HMAC-SHA256 | Sanitized via base64url decode and crypto signature verification. | Low | Maintain existing fail-closed token validation and cookie clearing on 401/403. |
| HTTP Request Header (`X-CSRF-Token`) | `csrfOk()` -> `constantTimeStringEqual()` | Sanitized via SHA-256 constant-time digest comparison. | Low | Compliant with FIN-AUDIT-002 double-submit cookie protocol. |
| HTTP Request Body (`/api/sync/backup`) | `handleSyncBackup()` -> `validateBudgetPayloadDetailed()` -> Cloudflare D1 SQLite | Sanitized: deep schema inspection, key whitelist (`ALLOWED_BUDGET_KEYS`), string length, and array count caps. | Low | Compliant with FIN-AUDIT-001. All queries use `db.prepare().bind()`. |
| Uploaded Excel / CSV (`SpreadsheetImporter`) | `spreadsheet.worker.js` -> `parseSpreadsheet()` / `parseGenericFlat()` -> React State | Sanitized via SheetJS cell type coercion, `cleanNum()`, `cleanText()`, and file size clamp (15MB). | Medium | Replace raw `Math.round` calls in `spreadsheetParser.js` with `round2()`. |
| Client Storage (`IndexedDB` / `localStorage`) | `getBudgetData()` -> `runBudgetMigrations()` -> React State Tree | Sanitized via `healDailyMatrix()` and versioned migrations. Scoped strictly by `userId`. | Low | Compliant with FIN-AUDIT-004. Strict user partition via `current_budget:${userId}`. |
| Route Parameters (`/api/admin/user/:id/status`) | `adminUserStatusHandler()` -> Cloudflare D1 SQLite | Sanitized: Positional parameter binding `WHERE id = ?`. Status clamped to `'Active'` or `'Suspended'`. | Low | Compliant with FIN-AUDIT-001 positional binding. |

---

## 4. Edge Resiliency & Synchronization Assessment

### 4.1 Cloud Vault CAS Concurrency & Integrity

- Optimistic Lock Protocol: Backups enforce `baseVersion` timestamp checks (`storedVersion <= baseVersion`). Stale writes are rejected with HTTP 409 `SYNC_CONFLICT` along with the active server state.
- UTF-8 Accurate Payload Sizing: Payload lengths are measured via `new TextEncoder().encode(dataStr).length`, avoiding Unicode multi-byte length discrepancies.
- Shrink Defense (<10%): Incoming payloads smaller than 10% of stored backups return HTTP 409 `SYNC_SUSPICIOUS` unless `force: true` is supplied.
- Snapshot Rollback Invariant: The database schema defines `user_backup_versions` for point-in-time rollbacks. `handleSyncBackup` and `handleSyncVersions` currently enforce `LIMIT 4`, which contradicts the system specification of 10-snapshot retention. Updating to `LIMIT 10` restores full compliance.
- Compensating Rollback: In multi-step mutations (`handleSyncBackup`, `register`, `update-profile`), catch blocks surgically execute compensating statements (e.g. `DELETE FROM user_backup_versions WHERE id = ?`) to eliminate orphaned state.

### 4.2 Client State Isolation & Session Purging (FIN-AUDIT-004)

- Sign-Out Purge: `BudgetMetadataContext` and `LedgerDataContext` subscribe to `techtrek:user-logout` window events. Upon firing, in-memory budget metadata, transaction histories, daily matrix projections, and tracking refs are immediately reset to default starters.
- User-Scoped Keys: IndexedDB records are keyed as `current_budget:${userId}`, offline sync queues as `cf_pending_sync:${userId}`, and cloud version markers as `tt_budget_cloud_version:${userId}`.
- Async Mutation Cleanup: Async UI handlers (`SecuritySettingsPanel`, `CloudSyncSubPanel`, `StorageResetSubPanel`, `AdminView`, `AuthPage`) wrap state resets inside `finally {}` blocks.

### 4.3 Edge Runtime Compute Limits

- PBKDF2 Iteration Budget: PBKDF2 password derivation is calibrated at 600,000 iterations (~220ms CPU time in workerd). This operates comfortably within Cloudflare Workers Paid limits (30,000ms), but leaves little margin under Workers Free (50ms).
- Subrequest and D1 Batching: Multi-statement mutations in `register.js`, `reset-password.js`, and `confirm-email-change.js` use `env.DB.batch([...])`, executing within a single coordinator round-trip.

---

## 5. Concrete Remediation & Refactoring Directives

### Directive 1: Fix ESLint `no-useless-assignment` in `budgetMigrations.js` (BUG-001)

Remove the dead assignment `currentVersion = 8;` at the end of `runBudgetMigrations`.

```diff
--- a/finance/src/migrations/budgetMigrations.js
+++ b/finance/src/migrations/budgetMigrations.js
@@ -539,7 +539,6 @@ export function runBudgetMigrations(budget) {
     migrationDetails.v8 = {
       healedHoaBankStatementCount: healCount
     };
-    currentVersion = 8;
   }
 
   return { budget: migrated, wasMigrated, details: migrationDetails };
```

### Directive 2: Fix Temporal Test Decay in `fix-02-no-auto-delete-credits.test.js` (BUG-002)

Pin the reference date in `oldPruneLogic` or pin `todayIso` to a fixed baseline date (e.g., `2026-10-01`) so that synthetic fixture dates in October 2026 are reliably detected as future keys regardless of the execution date.

```diff
--- a/finance/tests/fix-02-no-auto-delete-credits.test.js
+++ b/finance/tests/fix-02-no-auto-delete-credits.test.js
@@ -14,8 +14,8 @@ const __dirname = path.dirname(__filename);
 // -------------------------------------------------------------------------
 // The pruning logic that was removed from restoreFromBackup (for comparison)
 // -------------------------------------------------------------------------
-function oldPruneLogic(matrix) {
-  const today = new Date();
+function oldPruneLogic(matrix, referenceDate = new Date('2026-10-01T00:00:00Z')) {
+  const today = referenceDate;
   const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
   const creditKeyPattern = /^(.+)_(\d{4}-\d{2})_(\d{1,2})_(?:extra_)?credit_(.+)$/;
   const result = { ...matrix };
```

### Directive 3: Align Historical Backup Retention to 10 Snapshots in `worker.js` (BUG-003)

Update `LIMIT 4` to `LIMIT 10` in `handleSyncBackup` and `handleSyncVersions`.

```diff
--- a/finance/src/worker.js
+++ b/finance/src/worker.js
@@ -663,7 +663,7 @@ async function handleSyncBackup(context) {
       );
 
-      // Keep only the last 4 manual syncs
+      // Keep only the last 10 manual syncs
       queries.push(
         env.DB.prepare(
           `DELETE FROM user_backup_versions
@@ -671,7 +671,7 @@ async function handleSyncBackup(context) {
              AND id NOT IN (
                SELECT id FROM user_backup_versions
                 WHERE user_id = ?
                 ORDER BY saved_at DESC, rowid DESC
-                LIMIT 4
+                LIMIT 10
              )`
         ).bind(userId, userId)
       );
@@ -808,7 +808,7 @@ async function handleSyncVersions(context) {
       `SELECT id, saved_at FROM user_backup_versions
        WHERE user_id = ?
        ORDER BY saved_at DESC, rowid DESC
-       LIMIT 4`
+       LIMIT 10`
     ).bind(userId).all();
```

### Directive 4: Eliminate Raw `Math.round` Calls in `LedgerView.jsx` (BUG-004)

Import `round2` and replace unshielded `Math.round(... * 100) / 100` calls.

```diff
--- a/finance/src/components/LedgerView.jsx
+++ b/finance/src/components/LedgerView.jsx
@@ -895,7 +895,7 @@ export function LedgerView({ onNavigateView }) {
         }
         const totalEnd = round2(regEnding + (showExtraColumns ? extraEnding : 0));
         const isHistoricalLock = isLockedDay;
-        const totalBeg = Math.round((runningRegBeg + (showExtraColumns ? runningExtraBeg : 0)) * 100) / 100;
+        const totalBeg = round2(runningRegBeg + (showExtraColumns ? runningExtraBeg : 0));
 
         const isStartRow = (
           dateObj.getFullYear() === startDateObj.getFullYear() &&
@@ -919,8 +919,8 @@ export function LedgerView({ onNavigateView }) {
           isPayday,
           isToday,
           totalBeg,
-          regBeg: Math.round(runningRegBeg * 100) / 100,
-          extraBeg: Math.round(runningExtraBeg * 100) / 100,
+          regBeg: round2(runningRegBeg),
+          extraBeg: round2(runningExtraBeg),
           personCredits,
           totalRegCredits,
           billValues,
-          otherAmt: Math.round(otherAmt * 100) / 100,
+          otherAmt: round2(otherAmt),
           otherDesc: customOtherDesc,
           regEnding,
           extraEnding,
```

### Directive 5: Include `GATEWAY_KV` Binding in `auth.js` User Cache (BUG-008)

Include `env?.GATEWAY_KV` in the cache retrieval, storage, and invalidation cascade.

```diff
--- a/finance/functions/utils/auth.js
+++ b/finance/functions/utils/auth.js
@@ -572,7 +572,7 @@ export async function getCachedUser(userId, env) {
   const key = `user-session:${userId}`;
 
   // 1. Try KV binding if present
-  const kv = env?.USER_CACHE || env?.RATE_LIMIT_KV;
+  const kv = env?.GATEWAY_KV || env?.USER_CACHE || env?.RATE_LIMIT_KV;
   if (kv && typeof kv.get === 'function') {
     try {
       const val = await kv.get(key, 'json');
@@ -609,7 +609,7 @@ export async function setCachedUser(userId, userData, env, ttlSeconds = USER_CA
   const safeData = toCachedUser(userData);
 
   // 1. KV if bound
-  const kv = env?.USER_CACHE || env?.RATE_LIMIT_KV;
+  const kv = env?.GATEWAY_KV || env?.USER_CACHE || env?.RATE_LIMIT_KV;
   if (kv && typeof kv.put === 'function') {
     try {
       await kv.put(key, JSON.stringify(safeData), { expirationTtl: Math.max(ttlSeconds, 60) });
@@ -641,7 +641,7 @@ export async function invalidateCachedUser(userId, env) {
   if (!userId) return;
   const key = `user-session:${userId}`;
 
-  const kv = env?.USER_CACHE || env?.RATE_LIMIT_KV;
+  const kv = env?.GATEWAY_KV || env?.USER_CACHE || env?.RATE_LIMIT_KV;
   if (kv && typeof kv.delete === 'function') {
     try {
       await kv.delete(key);
```

### Directive 6: Clean Mid-File Imports in `App.jsx` and `indexedDB.js` (BUG-009)

Relocate `logState` imports to the top of both files.

```diff
--- a/finance/src/App.jsx
+++ b/finance/src/App.jsx
@@ -6,6 +6,7 @@ import { useBudgetMetadataState } from './context/BudgetContext';
 import { AppLayout } from './components/AppLayout';
 import { LandingPage } from './components/LandingPage';
+import { logState } from './utils/logger';
 
 const SettingsModal = React.lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
@@ -201,8 +202,6 @@ function MainContent({ pathname, navigateTo, onNavigateHome }) {
   );
 }
 
-import { logState } from './utils/logger';
-
 function getRouteFromPathname(pathname) {
   const path = (pathname || '').toLowerCase().replace(/\/$/, '');
```

```diff
--- a/finance/src/utils/indexedDB.js
+++ b/finance/src/utils/indexedDB.js
@@ -6,6 +6,7 @@
  */
 
+import { logState } from './logger.js';
+
 const DB_NAME = 'TechTrekFinanceDB';
 const DB_VERSION = 1;
 const STORE_NAME = 'app_state';
@@ -68,8 +69,6 @@ export function openDB() {
   });
 }
 
-import { logState } from './logger.js';
-
 /**
  * Loads the application budget state from IndexedDB.
```

### Directive 7: Add `finally` Block to `SpreadsheetImporter.jsx` `processFile` (BUG-010)

Ensure loading stage clears reliably on success or failure.

```diff
--- a/finance/src/components/SpreadsheetImporter.jsx
+++ b/finance/src/components/SpreadsheetImporter.jsx
@@ -455,6 +455,8 @@ export function SpreadsheetImporter({
       setParseError(err.message || 'Failed to parse file.');
       setStage(STAGE.IDLE);
+    } finally {
+      setIsDragging(false);
     }
   }, [budget.accounts, targetAccountId, selectedTargetAccountId]);
```

---

## 6. Prioritized Implementation Plan

### Phase 1: Critical (Build Gates & Test Suite Fixes)

1. **ESLint Dead Assignment Removal**: Surgically remove line 543 in `src/migrations/budgetMigrations.js`. Validate with `npm run lint`.
2. **Deterministic Test Clock Pinning**: Update `tests/fix-02-no-auto-delete-credits.test.js` to accept a fixed reference date in `oldPruneLogic`. Validate with `npm test`.

### Phase 2: High (Architectural Invariants & Precision Hardening)

1. **10-Snapshot Retention Alignment**: Modify `src/worker.js` lines 674 and 811 to enforce `LIMIT 10` for `user_backup_versions`.
2. **Ledger Math Precision (FIN-AUDIT-003)**: Replace raw `Math.round` operations in `LedgerView.jsx:898, 922, 923, 927` with `round2()`.
3. **Spreadsheet Ingestion Precision (FIN-AUDIT-003)**: Replace raw `Math.round` statements in `spreadsheetParser.js`, `spreadsheet.js`, `importer.js`, and `SpreadsheetImporter.jsx` with `round2()`.
4. **Amortization Calculation Shielding**: Ensure all intermediate principal, payment, and interest accumulators in `AmortizationView.jsx` use `round2()`.
5. **Gateway KV Binding Support (FIN-AUDIT-002)**: Add `env?.GATEWAY_KV` to the KV cache lookup in `functions/utils/auth.js`.

### Phase 3: Medium (Code Hygiene & Resiliency)

1. **ESM Import Hoisting**: Move mid-file `import { logState }` in `src/App.jsx` and `src/utils/indexedDB.js` to the top-level import block.
2. **Spreadsheet Importer Lifecycle Safety**: Wrap file processing state resets in `SpreadsheetImporter.jsx` inside a `finally {}` block.
3. **Admin Telemetry Version Counting**: Query `user_backup_versions` in `functions/api/admin/stats.js` to report accurate multi-snapshot counts.

### Phase 4: Low (Maintenance & Cleanup)

1. **Dormant Variable Pruning**: Clean up unused variables identified across `CloudSyncSubPanel.jsx`, `LedgerDataContext.jsx`, `importer.js`, and `spreadsheet.js`.
2. **Documentation Sync**: Update `finance/docs/03_features.md` and `finance/docs/04_state.md` to reflect the 10-snapshot retention rule and precision hardening.

---
*Plan created. Waiting for user review.*
