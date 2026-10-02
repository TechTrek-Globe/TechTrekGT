# Incident Report: Deposit Display Regression & Comprehensive Integrity Remediation

> **Incident ID:** INC-2026-10-01-FINANCE  
> **Status:** Remediation Complete & Verified (Tier A, Tier B, Tier C Reviewed)  
> **Target App:** `finance/` (`techtrekgt.com/finance`)  
> **Test Suite:** 278 passed / 0 failed (55 suites)  
> **Date:** 2026-10-01  

---

## 1. Executive Summary

On 2026-10-01, an incident report identified that projected and imported deposits failed to display across several views in the TechTrek Finance application, and subsequent cloud synchronizations generated validation and server errors.

Through a phased diagnostic and characterization methodology, all 15 defects across **Tier A** and **Tier B** were isolated, characterized with unit tests, surgically remediated, and verified without regressions. Furthermore, all **Tier C** exploratory items (C1 through C8) have been audited and documented with concrete architectural recommendations.

---

## 2. Root Cause Analysis

### 2.1 Missing Deposits (P1 - Critical)
* **File & Line:** [`src/components/LedgerView.jsx:781`](file:///e:/TechTrekGT/finance/src/components/LedgerView.jsx#L781) and [`src/context/LedgerDataContext.jsx:966`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx#L966).
* **Commit Introduced:** `da498816` / `56b15e68`.
* **Root Cause Mechanism:**  
  Both call sites invoked `allocateEarnerCredit(p, accountId, year, month, day, budget, undefined/empty, { isLockedDay })`.  
  Inside [`src/utils/ledgerEngine.js:14`](file:///e:/TechTrekGT/finance/src/utils/ledgerEngine.js#L14), lookup `const c = dailyMatrix[key]` always evaluated to `undefined`. Consequently, `allocateEarnerCredit` unconditionally bypassed stored credit matrix cells, falling back to projected deposits or returning `0` on locked days.
* **Fix Applied:** Pass active matrix references (`getDailyMatrix()` / `dailyMatrixRef.current`) into `allocateEarnerCredit` at both call sites (Commit `9898ec99`).

### 2.2 Corrupted and Empty Funding Goals (P2 & P3 - Critical)
* **File & Line:** [`src/context/BudgetMetadataContext.jsx:62-65`](file:///e:/TechTrekGT/finance/src/context/BudgetMetadataContext.jsx#L62-L65) and [`src/context/LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx).
* **Triggering Event:**  
  1. `migrateFundingGoals` contained hardcoded dollar mutations (`1222.61 -> 1378.00`, `689.42 -> 689.00`), silently altering user goals on initialization.
  2. Backup restoration logic previously dropped `fundingGoals` or replaced them with empty arrays when restoring payloads that lacked explicit goal definitions.
* **Fix Applied:** Removed hardcoded mutations (Commit `22518f20`); protected `fundingGoals` from silent deletion during backup restores and scoped all storage markers by `userId` (Commit `a3358b87`).

### 2.3 Cloud Backup Failures (P4 & Remote D1 Schema Mismatch)
* **Error 1 (HTTP 400 - Validation Error):**  
  * Cause: `api.js` injected `budgetData.owner_id = userId` into the payload before calling `/api/sync/backup`. The Cloudflare Worker's `ALLOWED_BUDGET_KEYS` did not include `owner_id`, causing `validateBudgetPayload` to reject backups with HTTP 400.
  * Fix: Strip `owner_id` prior to API dispatch (Commit `22518f20`), and extend schema validation for nullable pay schedules and object category formats (Commit `4c36d4b1`).
* **Error 2 (HTTP 500 - Internal Server Error):**  
  * Cause: Remote D1 SQLite database `personal-budget-db` had not executed migration `0007_backup_data_byte_length.sql`. Queries selecting or writing `data_byte_length` in table `user_backups` threw `no such column: data_byte_length`.
  * Fix: Executed `ALTER TABLE user_backups ADD COLUMN data_byte_length INTEGER` and backfilled lengths directly on remote Cloudflare D1; synced `d1_migrations` table.

---

## 3. Comprehensive Issue Ledger

| ID | Tier | Title | Status | Primary Files Changed | Commit |
|:---|:---:|:---|:---:|:---|:---:|
| **P1** | A | allocateEarnerCredit called without dailyMatrix | Fixed | `LedgerView.jsx`, `LedgerDataContext.jsx` | `9898ec99` |
| **P2** | A | Remove hardcoded funding goal amount mutations | Fixed | `BudgetMetadataContext.jsx` | `22518f20` |
| **P3** | A | User-scoped storage keys & fundingGoals restore protection | Fixed | `LedgerDataContext.jsx`, `indexedDB.js`, `api.js` | `a3358b87` |
| **P4** | A | Strip owner_id & validate sync backup payload | Fixed | `api.js`, `worker.js` | `22518f20`, `4c36d4b1` |
| **P5** | A | Surface backup failure alerts to user in UI | Fixed | `Header.jsx`, `LedgerDataContext.jsx` | `a3358b87` |
| **P6** | A | Clamp import lock to today (effectiveLockEnd = min(maxImport, today)) | Fixed | `LedgerView.jsx`, `LedgerDataContext.jsx` | `9898ec99` |
| **P7** | B | Clamp importer zero-out payday key to daysInMonth | Fixed | `spreadsheet.js` | `ae5b5bd7` |
| **P8** | A | Use effectiveDueDay in LedgerView bill matching | Fixed | `LedgerView.jsx` | `9898ec99` |
| **P9** | B | Exclude archived bills from all expense calculations | Fixed | `BudgetMetadataContext.jsx`, `LedgerDataContext.jsx`, `spreadsheet.js` | `ae5b5bd7` |
| **P10** | B | Single shared credit split; earnerExtra=0 when extra_credit missing | Fixed | `ledgerEngine.js`, `LedgerView.jsx`, `LedgerDataContext.jsx` | `ae5b5bd7` |
| **P11** | A | React correctness: remove render-time state write & fix hook order | Fixed | `LedgerView.jsx` | `9898ec99` |
| **P12** | A | Preserve starting balance on clear; confirm destructive deletes | Fixed | `StorageResetSubPanel.jsx`, `LedgerDataContext.jsx` | `a3358b87` |
| **P13** | A | Offline login bypass removal | Fixed | `AuthContext.jsx` | `a3358b87` |
| **P14** | A | Redact OTP codes and emails from production logs | Fixed | `functions/utils/auth.js` | `a3358b87` |
| **P15** | A | Proactive access token refresh timer (90 min + visibilitychange) | Fixed | `AuthContext.jsx` | `9531cff3` |

---

## 4. Test Suite & Verification Results

* **Baseline Suite (commit `498ecae9`):** 259 passed, 0 failed.
* **Final Suite:** **278 passed, 0 failed** across 55 test suites.
* **New Test Suites Added:**
  * `tests/phase2-issue-session-and-backup-length.test.js` (Auth & backup length validation)
  * `tests/tier-b-characterization.test.js` (Characterization tests for P7, P9, P10, and Option A future credit cleanup)
  * `tests/phase2-budget-payload-validation.test.js` (Strict schema and payload sanity checks)

---

## 5. Tier C Implementations & Integrity Hardening

All exploratory Tier C items have been remediated, verified with targeted unit tests, and integrated into production:

### C1: Bi-Weekly Pay Model Cadence (Completed)
* **Implementation:**  
  Enhanced `getPersonTargetPayDaysForMonth` in [`src/utils/paydayUtils.js`](file:///e:/TechTrekGT/finance/src/utils/paydayUtils.js) to support exact 14-day rolling intervals when an earner specifies an `anchorDate` (or `payAnchorDate`), correctly calculating three-paycheck months (e.g. January 2026: Jan 2, Jan 16, Jan 30). Gracefully falls back to semi-monthly (`payDay1`/`payDay2`) when no anchor is provided.

### C2: `saveExtraMonthly` vs Goal Overflow Precedence (Completed)
* **Implementation:**  
  Updated [`src/components/DashboardView.jsx`](file:///e:/TechTrekGT/finance/src/components/DashboardView.jsx) and [`src/components/settings/AccountsPeoplePanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/AccountsPeoplePanel.jsx) so that accounts governed by active funding goals defer extra monthly savings to dynamic goal overflow, eliminating double deductions and adding clear UI guidance.

### C3: Stored Future Credit Overrides (Completed)
* **Implementation:**  
  Integrated `clearFutureMatrixCredits()` in [`LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx) and the "Reset Future Credits" UI control in [`StorageResetSubPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/datasync/StorageResetSubPanel.jsx). Clears legacy static credit cells beyond today so live Funding Goals calculate dynamic projections while preserving 100% of past actuals.

### C4: Funding Goals Recovery (Completed)
* **Implementation:**  
  Implemented `restoreStandardFundingGoals()` in [`src/context/LedgerDataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/LedgerDataContext.jsx) and wired the "Restore Standard Goals" action in [`StorageResetSubPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/datasync/StorageResetSubPanel.jsx). Rebuilds standard clean goals (Mortgage & Bills Checking) mapped to the user's active household earners with one click.

### C5: Versioned Schema Migration Architecture (Completed)
* **Implementation:**  
  Created [`src/migrations/budgetMigrations.js`](file:///e:/TechTrekGT/finance/src/migrations/budgetMigrations.js) with `CURRENT_BUDGET_SCHEMA_VERSION = 2`. Upgraded `ALLOWED_BUDGET_KEYS` and schema validation in [`src/worker.js`](file:///e:/TechTrekGT/finance/src/worker.js) to accept `schemaVersion`. Budget loads run migrations deterministically without inline hardcoded amount mutations.

### C6: Cloud Backup Consent vs Default-On UX (Completed)
* **Implementation:**  
  Updated [`src/context/BudgetMetadataContext.jsx`](file:///e:/TechTrekGT/finance/src/context/BudgetMetadataContext.jsx) so unconfigured sync toggles (`cf_auto_backup_enabled`, `cf_sync_on_load_enabled`) default to `false` (explicit opt-in consent). Added an informative privacy and consent banner in [`CloudSyncSubPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/datasync/CloudSyncSubPanel.jsx).

### C7: Content Security Policy (CSP) Report-Only Mode (Completed)
* **Implementation:**  
  Updated `addSecurityHeaders` in [`src/worker.js`](file:///e:/TechTrekGT/finance/src/worker.js) to inspect `env.CSP_REPORT_ONLY === 'true'` and `opts.cspReportOnly`. When enabled, emits `Content-Security-Policy-Report-Only` instead of strict blocking CSP.

### C8: Orphaned Invalid Day Keys Pruning (Completed)
* **Implementation:**  
  Implemented `pruneInvalidMatrixDayKeys` in [`src/migrations/budgetMigrations.js`](file:///e:/TechTrekGT/finance/src/migrations/budgetMigrations.js), executed automatically under schema migration v2, and wired a manual "Prune Ghost Keys" action in [`StorageResetSubPanel.jsx`](file:///e:/TechTrekGT/finance/src/components/settings/datasync/StorageResetSubPanel.jsx). Removes non-existent calendar keys (`d > daysInMonth(y, m)`).

---

## 6. Pre-Flight Verification & Deployment Sign-Off

1. **Test Suite:**
   * **286 passed, 0 failed** across 60 test suites (including 8 new tests in `tests/tier-c-fixes.test.js`).
2. **Production Build:**
   * Executed `npm run build`: Zero errors, serialization verified, SSR + client bundles generated.
3. **Live Deployment:**
   * Cloudflare Worker deployment confirmed via `npm run deploy`.
   * **Route:** `techtrekgt.com/finance/*`
   * **Live Version ID:** `52ef7d5b-f735-48e3-899c-a2744caed927`
