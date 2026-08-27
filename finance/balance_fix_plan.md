# Root Cause Analysis & Plan: Account Balance Synchronization

**Target Application:** TechTrek Finance (`finance/`)  
**Document Path:** `e:/TechTrekGT/finance/balance_fix_plan.md`  
**Date:** August 27, 2026  
**Status:** Complete Audit - Awaiting User Approval  

---

## 1. Executive Summary & Problem Definition

A critical data divergence exists between the **Dashboard View** and the **Transactions Ledger View** for the same account (`USAA Bills Checking - 7071`) and the same time period (August 27, 2026):

| View Component | UI Element | Account | Displayed Balance | Metric Definition |
|---|---|---|---|---|
| **Dashboard** (`DashboardView.jsx`) | Account Balances Snapshot card | USAA Bills Checking - 7071 | **$236.13** | Current Balance (`currentBalObj.totalEnd`) |
| **Dashboard** (`DashboardView.jsx`) | Account Balances Snapshot card | USAA Bills Checking - 7071 | **$321.13** | Month End Balance (Est) (`endOfMonthObj.totalEnd`) |
| **Transactions Ledger** (`LedgerView.jsx`) | Matrix Table Row (`8/27/2026 [NOW]`) | USAA Bills Checking - 7071 | **$599.13** | Total Beginning Balance (`row.totalBeg`) |
| **Transactions Ledger** (`LedgerView.jsx`) | Matrix Table Row (`8/27/2026 [NOW]`) | USAA Bills Checking - 7071 | **$599.13** | Total Ending Balance (`row.totalEnd`) |

### Balance Discrepancy:
$$\$599.13 - \$236.13 = \$363.00$$

The goal of this audit is to identify the precise architectural and algorithmic causes of this divergence and outline a deterministic step-by-step fix ensuring both views consume an identical, synchronized source of truth.

---

## 2. Architecture & Data Flow Audit

In compliance with workspace rule 0 and `ARCHITECTURE.md`:

### 2.1 Architectural Constraints
- **Pure JavaScript:** React 19, Vite 6, Tailwind CSS 3.4. No TypeScript.
- **Routing:** Custom hand-rolled SPA router in `App.jsx` using `window.history.pushState` and `popstate` listeners. No `react-router-dom`.
- **State Management:** React Context + `useState` / `useReducer` exclusively. No Redux or Zustand. The state tree consists of:
  - `AuthProvider` -> user credentials and session
  - `BudgetMetadataProvider` -> accounts, people/earners, bills, loans, dashboard widgets, theme
  - `LedgerDataProvider` -> `dailyMatrix`, `lineItems`, `transactions`, running balance functions
  - `useBudget()` -> composite hook exposing metadata state/dispatch and ledger state/dispatch
- **Persistence & Cloudflare D1 Backend:**
  - Remote database: Cloudflare D1 (`personal-budget-db`).
  - Worker endpoints: `src/worker.js` routes `/api/sync/backup` and `/api/sync/restore`.
  - State storage: Synchronized as a full JSON snapshot payload inside the `user_backups` table (`id`, `data`, `updated_at`).
  - Local client storage: IndexedDB (`utils/indexedDB.js`) with `localStorage` legacy fallback.

### 2.2 Component Data Consumption Trace
- **Dashboard View (`DashboardView.jsx`):**
  - Consumes `useBudget()`.
  - In `case 'account_cards'` (lines 517-579):
    ```javascript
    const currentBalObj = getCalculatedBalanceAsOf(acc.id, today);
    const currentBalance = currentBalObj.totalEnd;
    const endOfMonthObj = getCalculatedBalanceAsOf(acc.id, new Date(today.getFullYear(), today.getMonth() + 1, 0));
    const actualEnd = endOfMonthObj.totalEnd;
    ```
  - Delegates calculation entirely to `getCalculatedBalanceAsOf(accountId, targetDateObj)` exported by `LedgerDataContext.jsx`.

- **Transactions Ledger View (`LedgerView.jsx`):**
  - Consumes `useBudget()`.
  - **Does NOT use `getCalculatedBalanceAsOf`**.
  - Implements its own completely independent simulation engine inside two local `useMemo` hooks:
    1. Fast-forward loop (`initialRegBeg`, `initialExtraBeg`, lines 611-742): iterates from `startDateObj` to `firstMonthStart` (July 1, 2026).
    2. Continuous matrix generator (`matrixData`, lines 758-1031): iterates day by day from July 1, 2026 to September 30, 2026.
  - Generates `row.totalBeg` and `row.totalEnd` per day directly from local closure variables.

- **Data Sync & D1 Status:**
  - Both views operate on the exact same underlying context data in memory (`budget.accounts`, `budget.people`, `budget.bills`, `dailyMatrix`).
  - The bug is **not** a network failure or a D1 SQL row discrepancy; it is a **simulation logic divergence** between two disconnected client-side calculation loops.

---

## 3. Comprehensive Root Cause Analysis

The $363.00 divergence between Dashboard and Ledger results from 5 distinct discrepancies between `LedgerDataContext.jsx`'s `getCalculatedBalanceAsOf` and `LedgerView.jsx`'s `matrixData`:

### Root Cause 1: Inverted Date Anchor Precedence (`startDate` vs `balanceAsOfDate`)
In `AccountsPeoplePanel.jsx` and `LedgerView.jsx`:
- When an account is created, its `startDate` defaults to `'2026-01-01'`.
- When a user sets a starting balance on a specific day or edits it via inline edit (`InlineEdit`), `balanceAsOfDate` is set to the selected row's date (e.g. in August 2026).

Look at the difference in how each file resolves the simulation anchor:
- **`LedgerDataContext.jsx` line 688 (`getCalculatedBalanceAsOf`):**
  ```javascript
  const startDateStr = acc.startDate || acc.balanceAsOfDate || '2026-01-01';
  ```
  `acc.startDate` is checked **first**! If `acc.startDate` is `'2026-01-01'`, it simulates all days from January 1, 2026 to August 27, 2026.
- **`LedgerView.jsx` line 556 (`effectiveStartDateStr`):**
  ```javascript
  return selectedAccount?.balanceAsOfDate || selectedAccount?.startDate || importedDates[0] || '2024-01-01';
  ```
  `selectedAccount?.balanceAsOfDate` is checked **first**!
- **`spreadsheet.js` line 675 (`getLedgerRunningBalanceAsOfDate`):**
  ```javascript
  const effectiveStartDateStr = targetAcc.balanceAsOfDate || targetAcc.startDate || '2024-01-01';
  ```
  `balanceAsOfDate` is also checked **first**!

**Impact:**  
Because `startDate` takes precedence in `LedgerDataContext.jsx`, `getCalculatedBalanceAsOf` runs 239 days of simulation from January 1 to August 27, repeatedly deducting bills and applying credits across 8 months. Meanwhile, `LedgerView.jsx` anchors the balance directly in August, starting fresh with `$578.37` (Reg) + `$20.76` (Extra) = `$599.13`.

### Root Cause 2: Earner Filtering Desynchronization (`enabledEarners`)
As visible in `image_0c54ff.png`, the toolbar filter displays:
`Earners (2/3)`  
The table columns show only `Jon` and `Gym Credit`. The 3rd household earner is disabled for `USAA Bills Checking - 7071`.

- **In `LedgerView.jsx` (lines 516-522 & 794-819):**
  ```javascript
  const accountPeople = useMemo(() => {
    if (selectedAccountId === 'all') return people;
    if (selectedAccount?.enabledEarners && Array.isArray(selectedAccount.enabledEarners)) {
      return people.filter(p => selectedAccount.enabledEarners.includes(p.id));
    }
    return people;
  }, [people, selectedAccountId, selectedAccount]);
  ```
  `matrixData` credits **only** `accountPeople`.
- **In `LedgerDataContext.jsx` (lines 709 & 728-741):**
  ```javascript
  const people = metadataStateRef.current.people || [];
  ...
  people.forEach(p => {
    ...
  });
  ```
  `getCalculatedBalanceAsOf` loops over **all people**, completely ignoring `acc.enabledEarners`! Any paycheck allocations belonging to disabled earners are injected into the account balance calculation in Dashboard, but excluded in Ledger.

### Root Cause 3: Inconsistency within `LedgerView.jsx` Itself
Even within `LedgerView.jsx`, the code is forked:
- In the fast-forward while loop (`initialRegBeg`, lines 632-661), it loops over `people.forEach(p => ...)` (all earners).
- In the matrix row loop (`matrixData`, lines 794-819), it loops over `accountPeople.forEach(p => ...)` (filtered earners).
Prior months were simulated with all earners, but current months were simulated with filtered earners.

### Root Cause 4: Import Mode & Statement Lock Disregard in Fast-Forward
When an account has imported statement rows (`acc.importedLedgerRows`):
- `LedgerDataContext.jsx` respects `isLockedDay`, locking the daily ending balance to `importedRows[isoDate]` and suppressing scheduled duplicate charges.
- `LedgerView.jsx`'s fast-forward while loop (lines 620-740) **does not check `importedRows` or `isImportMode` at all**. It computes theoretical formulas across past months, ignoring the real statement balance anchors.

### Root Cause 5: Architectural Anti-Pattern: Triplicate Simulation Engines
The root cause is code duplication without a single source of truth. The running ledger simulation logic is copy-pasted across three files with slight differences in each:
1. `finance/src/context/LedgerDataContext.jsx`: `getCalculatedBalanceAsOf`
2. `finance/src/components/LedgerView.jsx`: `initialRegBeg` + `matrixData`
3. `finance/src/utils/spreadsheet.js`: `getLedgerRunningBalanceAsOfDate`

Whenever one implementation was updated (such as adding `enabledEarners` or changing date fallback rules), the other two implementations silently drifted out of sync.

---

## 4. Step-by-Step Implementation Plan

To establish 100% mathematical parity across the Dashboard, Transactions Ledger, Account Transfer Summary, and Spreadsheet Importer:

### Step 1: Create a Unified Running Balance Simulation Engine
In `finance/src/context/LedgerDataContext.jsx`:
1. Extract and standardize the daily simulation math into a single pure utility function:
   `simulateLedgerRunningBalance({ account, targetDate, metadataState, dailyMatrix, options })`
2. Unify the date resolution precedence across the entire application:
   ```javascript
   const effectiveStartDateStr = account.balanceAsOfDate || account.startDate || earliestImportedDate || '2026-01-01';
   ```
   `balanceAsOfDate` must take precedence over `startDate` everywhere.
3. Integrate `enabledEarners`:
   ```javascript
   const activeEarners = (account.enabledEarners && Array.isArray(account.enabledEarners))
     ? people.filter(p => account.enabledEarners.includes(p.id))
     : people;
   ```
4. Respect `account.enableExtraSavings !== false` uniformly for `totalEnd` and `totalBeg`.
5. Update `getCalculatedBalanceAsOf(accountId, targetDateObj)` in `LedgerDataContext.jsx` to wrap this unified engine.

### Step 2: Refactor `LedgerView.jsx` to Use the Shared Simulation Engine
In `finance/src/components/LedgerView.jsx`:
1. Replace the manual, error-prone fast-forward while loop in `initialRegBeg` (lines 611-755) with a call to `getCalculatedBalanceAsOf(selectedAccountId, firstMonthStartMinusOneDay)`.
2. Standardize `effectiveStartDateStr` in `LedgerView.jsx` to match the exact same resolution hierarchy as `LedgerDataContext.jsx`.
3. Align `matrixData` daily row calculation with `simulateLedgerRunningBalance` so both use identical formulas for credits, bills, other adjustments, deficit transfers, and ending balances.

### Step 3: Synchronize `AccountTransferSummary.jsx` and `spreadsheet.js`
1. Ensure `AccountTransferSummary.jsx` passes consistent options to `getCalculatedBalanceAsOf`.
2. Update `getLedgerRunningBalanceAsOfDate` in `finance/src/utils/spreadsheet.js` to share the exact same logic (or re-export the unified calculation engine).

### Step 4: Verification & Regression Testing
1. Verify `USAA Bills Checking - 7071`:
   - Dashboard card "Current Balance" must match Transactions Ledger "Total Beg" / "Total End" on `8/27/2026 [NOW]`.
   - "Month End Balance (Est)" must match the August 31 ending row in Transactions Ledger.
2. Verify "All Accounts Combined" view:
   - Sum of all account cards in Dashboard must match "Total Cash On Hand" in Header KPIs and the "All Accounts" ledger running balance.
3. Execute production build (`npm run build`) in `finance/`.
4. Deploy to Cloudflare Workers (`npm run deploy`) and verify live production endpoints.

---

## 5. Strict Antipilot Auto-Click Halt Directive

**EXECUTION HALTED.**  
In strict accordance with the user instructions:
- Zero `.js` or `.jsx` files have been modified.
- Zero build or deployment commands have been executed.
- Work is halted immediately following the generation of `balance_fix_plan.md`.
- No further action will be taken until the user replies with the exact phrase:
  `Plan approved, proceed with implementation.`
