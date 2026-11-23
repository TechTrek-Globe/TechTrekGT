# Investigation & Implementation Plan: November Bills/Credits Auto-Load in "Mortgage Checking" (Finance OS)

Date: 2026-11-19  
Status: Investigation Complete - Plan Awaiting User Review  
Target App: `finance/` (Pure JS/JSX, React 19, Vite 6, Cloudflare Workers + D1)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 How Recurring Bills & Credits "Auto-Load"
Finance OS does **not** use a background scheduler, cron job, or `lastGenerated` / `nextDue` auto-posting state machine. Recurring bills and earner credits are computed dynamically on the fly per calendar row in:
- `finance/src/components/LedgerView.jsx` (`matrixData` `useMemo`, lines 992-1201)
- `finance/src/utils/ledgerEngine.js` (`calculateRunningBalanceAsOf`, lines 227-393, and `allocateEarnerCredit`, lines 19-101)
- `finance/src/utils/paydayUtils.js` (`effectiveDueDay`, `isBillDueInMonth`, `isPersonDepositDay`, `getPersonDepositDatesForMonth`)

For any calendar date `isoDate` (`YYYY-MM-DD`) in an account:
1. **Explicit `dailyMatrix` cell (`<accountId>_<YYYY-MM>_<day>_bill_<billId>` or `..._credit_<personId>`):** Takes top priority. Any stored value - including `0` - overrides projection for that exact date (`LedgerView.jsx:1081`, `ledgerEngine.js:65, 344`).
2. **Import Lock Boundary (`isLockedDay`):** When an account is in import mode (`ledgerMode === 'import'`, `Object.keys(importedLedgerRows).length > 0`, or `accTxns.length > 0`), the engine computes:
   - `maxDataDate = max(maxImportDateStr, maxTxnDate)`
   - `effectiveLockEnd = min(maxDataDate, todayStr)` (local `YYYY-MM-DD`)
   - `isLockedDay = Boolean(isImportMode && maxDataDate && isoDate <= effectiveLockEnd)`
   When `isLockedDay === true`, **all scheduled recurring bills (`LedgerView.jsx:1085-1100`, `ledgerEngine.js:346-355`) and scheduled earner credits (`ledgerEngine.js:62`) are suppressed to `$0`** unless an explicit `dailyMatrix` cell exists.
3. **Pay-Period Credit Deduplication (`hasImportedCreditInPayPeriod`):** On unlocked days, `allocateEarnerCredit` (`ledgerEngine.js:78, 107-138`) suppresses scheduled payday projections if any positive `credit_<personId>` (> 0) cell already exists in that pay period's day window in the same month.
4. **Monthly `lineItems` Override (`billId_monthKey`):** On unlocked days, if `lineItems` contains an entry for `${billId}_${monthKey}`, `actualAmount` replaces `bill.amount` on `effectiveDueDay`.

### 1.2 Why November Bills & Credits Did Not Auto-Load in "Mortgage Checking"
There is no traditional "month-rollover scheduler bug" or timezone offset bug preventing November from generating. Instead, two exact code mechanisms explain the missing November entries on `2026-11-19`:

1. **Primary Suspect - Import Lock Boundary (`isLockedDay`) Covering `2026-11-01` through `2026-11-19`:**
   - If "Mortgage checking" has `isImportMode === true` and `maxDataDate >= '2026-11-01'` (either from a November transaction/statement row OR from stale future-dated rows in `importedLedgerRows`, e.g., `2027-*` rows that are never purged on `merge` imports and were only cleaned for `acc-hoa` in Migration V8), then `effectiveLockEnd` resolves to `min(maxDataDate, '2026-11-19')`.
   - Every date `<= effectiveLockEnd` has `isLockedDay === true`, suppressing ALL scheduled bills and credits in November up to that boundary unless recorded in `dailyMatrix`.
   - Notably, if `importedLedgerRows` holds future rows (such as `2027-*`), `todayStr` advances `effectiveLockEnd` automatically each day of the month - silently locking November bills/credits as their dates arrive without any new import!
2. **Secondary Possibility - Previously Generated/Imported & Deleted November Entries:**
   - Clearing/deleting a cell in `LedgerView.jsx` (`StaticMatrixCell:114`, `DraggableMatrixCell:249`, `InlineEdit:95, 120`) calls `handleCellCommit` -> `updateDailyMatrixCell(..., 0)`.
   - This writes `0` (it does **not** delete the key) into `dailyMatrix` for `<accountId>_2026-11_<day>_bill_<billId>` and `<accountId>_2026-11_<day>_credit_<personId>`.
   - Because `0 !== undefined`, those exact November date cells stay `$0` permanently across reloads and cloud restores (`FIX-02` preserves all `dailyMatrix` keys including `0`s).

### 1.3 Additional Code Bugs Found During Audit
1. **D1 Round-Trip Drops `bill.dueMonths` (`finance/functions/utils/structuredBudgetStore.js:280, 537, 944`):**
   - `BILL_KNOWN_KEYS` includes `'dueMonths'` (line 280), preventing it from being preserved in `extra_json`.
   - `buildStructuredWriteStatements` (line 537) reads `b.months ?? [1..12]` instead of `b.dueMonths ?? b.months ?? [1..12]`.
   - `reconstructStructuredBudget` (line 944) restores `months` instead of `dueMonths`.
   - Non-monthly bills (`Annual`, `Semi-Annual`, `Quarterly`, `Custom`) lose their configured `dueMonths` after cloud restore, reverting to defaults (e.g., Jan / Jan+Jul).
2. **`null` Cell Divergence Between `LedgerView.jsx` and `ledgerEngine.js`:**
   - `LedgerView.jsx:1081` checks `if (customBillVal !== undefined)` (treating `null` reconstructed from `__NULL__` in `structuredBudgetStore.js:1082` as `0`, suppressing projection).
   - `ledgerEngine.js:344` checks `if (bVal !== undefined && bVal !== null && bVal !== '')` (ignoring `null` and projecting the bill).
   - This can cause `LedgerView` and `getCalculatedBalanceAsOf` (Dashboard) to disagree.
3. **Unpurged Future `importedLedgerRows` on Merge Imports (`finance/src/utils/spreadsheet.js:789-802`):**
   - Merge imports spread `{ ...(acc.importedLedgerRows || {}), ...incomingRows }`, retaining stale future statement dates that inflate `maxDataDate` and continuously advance `effectiveLockEnd` with `todayStr`.

---

## 2. November vs. December Behavior Assessment

- **If November entries were cleared/deleted in the grid (`dailyMatrix[..._2026-11_...] = 0`):**
  - November keys are `0` and will not re-fire.
  - **December (`2026-12`) will auto-load normally** because override keys are scoped to `2026-11_<day>`.
- **If `maxDataDate` is in November (e.g., `2026-11-19` from a November import):**
  - `effectiveLockEnd` stops at `maxDataDate` (`<= 2026-11-30`).
  - **December (`2026-12`) has `isLockedDay === false` and will auto-load normally.**
- **If `maxDataDate` is in the future (e.g., `2027-*` from stale `importedLedgerRows`):**
  - December projects normally *today* (`2026-11-19`) only because `effectiveLockEnd` is clamped at `todayStr`.
  - **Risk:** Once the calendar reaches December (`2026-12-01` .. `2026-12-31`), `todayStr` will advance past December's due dates and **suppress December's recurring bills and credits too** unless stale future `importedLedgerRows` are pruned.
- **If a bill is non-monthly (`Annual` / `Semi-Annual` / `Quarterly` / `Custom`) and due in Nov/Dec:**
  - `structuredBudgetStore.js` dropping `dueMonths` on D1 restore will prevent it from auto-loading in November or December if those months are not in the fallback defaults.

---

## 3. Recommended Implementation Plan (Pending Approval)

### Step 1: Fix `dueMonths` Preservation in D1 Structured Store
- **File:** `finance/functions/utils/structuredBudgetStore.js`
- **Change:**
  - Line 537: Read `b.dueMonths ?? b.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]` when serializing `due_months`.
  - Line 944: Restore `dueMonths` (and preserve `months` if `p.has('months')`) from `r.due_months` so `paydayUtils.getBillDueMonths()` always receives `bill.dueMonths`.

### Step 2: Unify `null` / `''` Matrix Override Handling Across Engines
- **Files:** `finance/src/components/LedgerView.jsx`, `finance/src/utils/ledgerEngine.js`
- **Change:**
  - Align `LedgerView.jsx:1081` with `ledgerEngine.js:344` (`customBillVal !== undefined && customBillVal !== null && customBillVal !== ''`), or ensure `updateDailyMatrixCell` / `handleSyncDelta` uses `delete_matrix_cell` when clearing to `''` and `0` when explicitly suppressing a cell.
  - Keep `0` as an explicit user-suppression value so cleared recurring cells stay `$0` without leaking into future months.

### Step 3: Guard `importedLedgerRows` Against Future-Dated Stale Lock Inflation
- **Files:** `finance/src/utils/ledgerEngine.js`, `finance/src/components/LedgerView.jsx`, `finance/src/utils/spreadsheet.js`
- **Change:**
  - When computing `maxImportDateStr` for `maxDataDate` (used for the historical lock boundary `effectiveLockEnd`), clamp/ignore `importedLedgerRows` keys greater than `todayStr` (or purge future keys > `todayStr` in `spreadsheet.js` merge/override paths unless explicitly marked) so stale projected statement rows from old spreadsheets never silently lock future months as `todayStr` advances.
  - Surface a subtle indicator in `LedgerView.jsx` when `isLockedDay` is suppressing un-imported recurring bills/credits for the current month (e.g., tooltip/badge explaining that dates `<= effectiveLockEnd` are locked to imported data), and optionally offer a per-month/per-cell "Restore Projected" or "Unlock" inspection aid if desired.

### Step 4: Automated Verification (`node --test`)
- Add targeted unit/regression tests in `finance/tests/`:
  1. `structuredBudgetStore.js` round-trip test verifying `bill.dueMonths` (e.g., `[5, 11]` Semi-Annual and `[11, 12]` Custom) survives `buildStructuredWriteStatements` + `reconstructStructuredBudget`.
  2. `ledgerEngine.js` + `LedgerView` parity test verifying:
     - Deleted November cell (`0`) suppresses only that November date while December projects normally.
     - Stale future `importedLedgerRows` (`2027-*`) do not auto-lock un-imported November/December dates as `todayStr` advances.
     - `null` / `''` cells produce identical balances in `LedgerView` logic and `calculateRunningBalanceAsOf`.
- Run existing test suite (`npm test` / `node --test`) to verify zero regressions across FIX-08, FIX-09, FIX-22, FIX-23, and FIX-31.

### Step 5: Documentation Sync & Build/Deploy Loop
- Update `finance/docs/03_features.md` and `finance/docs/04_state.md` per workspace post-flight rules.
- Execute `npm run build` and `npm run deploy` inside `e:/TechTrekGT/finance/` and verify live deployment.
