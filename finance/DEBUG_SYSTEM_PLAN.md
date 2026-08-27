# TechTrekGT Finance: Granular Categorized Debugging System Plan

## 1. Executive Summary & Goals

This plan outlines the architecture, data structures, hook injection points, and user interface for a comprehensive, granular, categorized debugging system across the TechTrekGT Finance application (`finance/`).

Every critical operation across the platform is mapped to a toggleable category:
1. **Sync Operations:** Worker API requests, Cloudflare D1 SQLite push/pull executions, payload serialization, conflict detection, and cloud timestamps.
2. **Transaction Mutations:** Additions, batch deletions, amount modifications (previous vs new values, currency formatting), date modifications (drag-and-drop moves, ledger sorting), and category/account reassignments.
3. **Bill & Income Matrix:** Earner deposit schedules, payday recalculations, due-date adjustments, and recurrence cycles.
4. **Accounts & Ledgers:** Balance recalculations, reconciliation state transitions, bank document matching keys, and ledger adjustments.
5. **Navigation & State:** Custom SPA router pushState and popstate transitions, React Context action dispatches, and local cache reads/writes (IndexedDB and localStorage).
6. **Import & Parser:** Ingestion tracing, sheet detection, column auto-matching, and normalization (maintaining full backwards compatibility).

---

## 2. Category Structure & LocalStorage Schema

### Category Definitions

| Category ID | Display Label | Scope & Operational Traces |
| :--- | :--- | :--- |
| `sync` | **Sync Operations** | Cloudflare Worker API requests (`/api/sync/backup`, `/api/sync/restore`), D1 SQLite read/write operations, payload serialization size/metrics, offline fallback queue management (`cf_pending_sync`), conflict handling (local vs cloud timestamp evaluations), and server timestamp verification. |
| `transactions` | **Transaction Mutations** | Transaction creation, batch clearing (`clearAccountTransactions`), amount edits with diff tracking (previous vs new value), date adjustments (drag-and-drop moves from source date to destination date), account reassignment, and reconciliation conflict resolutions. |
| `matrix` | **Bill & Income Matrix** | Earner deposit recurrence evaluations (bi-weekly, semi-monthly, weekly), payday offset logic, bill due-date updates (`dueDay`, `dueMonths`, `period`), and cell schedule recalculations. |
| `accounts_ledgers` | **Accounts & Ledgers** | Daily matrix running balance calculations (`getCalculatedBalanceAsOf`), derived balance calculations (`getAccountDerivedBalance`, `getTotalCashOnHand`), starting balance edits, ledger adjustments (`other_amount`, `other_credit_amount`), and reconciliation state changes. |
| `nav_state` | **Navigation & State** | Custom SPA router events (`pushState`, `popstate`), view transitions, Context dispatches (`BudgetMetadataContext`, `LedgerDataContext`), and local cache interactions (IndexedDB `getBudgetData`/`saveBudgetData`). |
| `import` | **Import & Parser** | Workbook detection, sheet scanning, column auto-matching, record normalization, and import dry-runs. |

### LocalStorage Key Schema

1. **Master Debug Toggle:**
   - Key: `trekledger_debug_mode`
   - Value: `"true"` | `"false"`
   - Function: When false, all logging short-circuits with zero console or CPU overhead.
2. **Granular Category Toggles:**
   - Key: `trekledger_debug_categories`
   - Value: Serialized JSON object:
     ```json
     {
       "sync": true,
       "transactions": true,
       "matrix": true,
       "accounts_ledgers": true,
       "nav_state": true,
       "import": true
     }
     ```
   - Defaults: When debug mode is first enabled, all categories are active (`true`). Individual toggles can be flipped independently.
   - Fallback and direct keys: The module will also support querying individual category flags (`trekledger_debug_category_<catId>`) for direct console testing if needed.

---

## 3. Central Logger Architecture & API (`src/utils/logger.js`)

A centralized, zero-overhead logging module will be established at `finance/src/utils/logger.js`. The existing `finance/src/utils/debugLogger.js` will re-export from `logger.js` to ensure 100% backwards compatibility with existing code.

### Core API Specification

```javascript
// Category Identifiers
export const DEBUG_CATEGORIES = {
  SYNC: 'sync',
  TRANSACTIONS: 'transactions',
  MATRIX: 'matrix',
  ACCOUNTS_LEDGERS: 'accounts_ledgers',
  NAV_STATE: 'nav_state',
  IMPORT: 'import'
};

// Metadata for UI rendering
export const CATEGORY_METADATA = {
  sync: {
    id: 'sync',
    label: 'Sync Operations',
    description: 'Worker API requests, D1 sync pulls/pushes, serialization, and conflict resolution.',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-950/60',
    borderColor: 'border-cyan-800/60',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
  },
  transactions: {
    id: 'transactions',
    label: 'Transaction Mutations',
    description: 'Additions, deletions, amount diffs, date changes, and account reassignments.',
    color: 'text-amber-400',
    bgColor: 'bg-amber-950/60',
    borderColor: 'border-amber-800/60',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  },
  matrix: {
    id: 'matrix',
    label: 'Bill & Income Matrix',
    description: 'Schedule recalculations, due-date updates, and payday recurrence cycles.',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-950/60',
    borderColor: 'border-emerald-800/60',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  },
  accounts_ledgers: {
    id: 'accounts_ledgers',
    label: 'Accounts & Ledgers',
    description: 'Balance calculations, reconciliation state, and ledger adjustments.',
    color: 'text-purple-400',
    bgColor: 'bg-purple-950/60',
    borderColor: 'border-purple-800/60',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40'
  },
  nav_state: {
    id: 'nav_state',
    label: 'Navigation & State',
    description: 'Custom SPA router events, Context dispatches, and local cache operations.',
    color: 'text-blue-400',
    bgColor: 'bg-blue-950/60',
    borderColor: 'border-blue-800/60',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40'
  },
  import: {
    id: 'import',
    label: 'Import & Parser',
    description: 'Spreadsheet parsing, sheet detection, column matching, and normalization.',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-950/60',
    borderColor: 'border-indigo-800/60',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
  }
};

// Global & Category State Accessors
export function getDebugEnabled(): boolean;
export function setDebugEnabled(enabled: boolean): void;
export function getCategoryStates(): Record<string, boolean>;
export function isCategoryEnabled(category: string): boolean;
export function setCategoryEnabled(category: string, enabled: boolean): void;
export function setAllCategories(enabled: boolean): void;
export function resetCategoryDefaults(): void;

// Real-Time Event Subscription (for in-app Live Console)
export function subscribeToDebugLogs(callback: (event: { type: string, entry?: object, isDebugEnabled?: boolean, categories?: object }) => void): () => void;

// Categorized Log Methods
export function logSync(operation: string, message: string, payload?: any, level?: 'info'|'warn'|'error'): void;
export function logTransaction(operation: string, message: string, payload?: any, level?: 'info'|'warn'|'error'): void;
export function logMatrix(operation: string, message: string, payload?: any, level?: 'info'|'warn'|'error'): void;
export function logLedger(operation: string, message: string, payload?: any, level?: 'info'|'warn'|'error'): void;
export function logState(operation: string, message: string, payload?: any, level?: 'info'|'warn'|'error'): void;
export function logImport(operation: string, message: string, payload?: any, level?: 'info'|'warn'|'error'): void;

// Universal Fallback
export function logDebug(category: string, message: string, payload?: any, level?: 'info'|'warn'|'error'): void;
```

---

## 4. Exact File and Function Hook Injection Map

### 4.1 Sync Operations
- **`src/utils/api.js`**:
  - `pushCloudBackupOptimistic(passcode, budgetData)`: Log payload serialization metrics (byte size, accounts count, bills count, matrix entry count), network offline state if queued, fetch URL and HTTP response code, and returned D1 timestamp.
  - `flushPendingCloudSync(passcode)`: Log detection of queued sync payload, retry attempt, and flush success or failure.
  - `savePendingSync(payload, passcode)`: Log enqueuing of offline sync payload with timestamp.
  - `clearPendingSync()`: Log clearance of offline queue.
- **`src/context/LedgerDataContext.jsx`**:
  - `pushCloudBackup(passcode)`: Log initiation of manual or debounced cloud push.
  - `pullCloudRestore(passcode)`: Log restore request, payload parsing, and state replacement.
  - Auto-pull effect on load (`useEffect` lines 256-292): Log comparison between `localTime` (`tt_budget_last_modified`) and `cloudTime` (`updatedAt`), documenting the conflict resolution decision (e.g. "Cloud backup is newer -> applying restore" or "Local changes are newer -> pushing backup").
  - Debounced auto-backup effect (`useEffect` lines 296-317): Log 5-second debounce trigger for cloud sync push.
  - Background online retry effect (`useEffect` lines 230-244): Log browser `online` event and queue drain trigger.
- **`src/worker.js`**:
  - `handleSyncBackup(context)`: Log D1 SQLite query execution (`INSERT INTO user_backups ... ON CONFLICT`), bound user ID, and payload length.
  - `handleSyncRestore(context)`: Log D1 SQLite read query (`SELECT data, updated_at FROM user_backups ...`) and return status.
  - `handleVerifySyncCode(context)`: Log passcode validation outcome.

### 4.2 Transaction Mutations
- **`src/context/LedgerDataContext.jsx`**:
  - `updateDailyMatrixCell(accountId, monthKey, day, field, value)`: Log value changes with diff tracking:
    - Previous value vs new value
    - Account ID and cell composite key
    - Formatted currency string
    - Cell classification (bill, credit, other expense, ending balance)
  - `moveDailyMatrixCell(accountId, sourceMonthKey, sourceDay, targetMonthKey, targetDay, field, value, extraData)`: Log date change via drag-and-drop:
    - Source date (`sourceMonthKey-sourceDay`) vs target date (`targetMonthKey-targetDay`)
    - Amount moved
    - Associated description transfer (`other_desc` / `other_credit_desc`)
  - `clearAccountTransactions(accountId)`: Log batch deletion:
    - Account ID
    - Number of transactions removed
    - Number of dailyMatrix cells purged
    - Reset of imported ledger history and starting balances
  - `importSpreadsheetSelective(...)`: Log batch transaction insertion:
    - Ingested transaction count
    - Merge strategy applied (`merge` vs `override`)
    - Detected and resolved conflicts
- **`src/components/LedgerView.jsx`**:
  - `handleCellCommit(monthKey, day, field, val, cellAccountId)`: Log UI inline edit commit event, capturing target account, date line, and entered value.
  - `handleDragEnd(event)`: Log drag-and-drop drop completion with source and destination coordinates.
- **`src/context/BudgetMetadataContext.jsx`**:
  - `updateBill(id, updatedData)`: When `accountId` changes, log category/account reassignment (moving bill between checking/savings/credit accounts). When `splits` change, log earner portion reassignment.
- **`src/components/settings/AccountsPeoplePanel.jsx`**:
  - `handleAccFileUpload`: Log parsed spreadsheet transactions, column mapping validation, and row count.
  - Account transaction clear confirmation: Log user-initiated transaction purge.

### 4.3 Bill & Income Matrix
- **`src/context/BudgetMetadataContext.jsx`**:
  - `addBill(billData)`: Log new bill creation with calculated recurrence schedule (`period`, `dueMonths`, `dueDay`, `paymentSource`).
  - `updateBill(id, updatedData)`: Log schedule modifications: changes to dueDay, dueMonths array, recurrence period, or nominal amount.
  - `deleteBill(id)`, `archiveBill(id)`, `unarchiveBill(id)`: Log bill lifecycle transitions and removal from active schedule.
  - `addPerson(personData)`, `updatePerson(id, updatedData)`, `deletePerson(id)`: Log earner pay schedule changes (`payFrequency`, `payDay1`, `payDay2`, `payOffsetDays`, gross/net amounts).
- **`src/utils/paydayUtils.js`**:
  - `getNextBillDueDate(bill, referenceDate)`: Log calculated next due date based on current date and recurrence pattern.
  - `isPersonDepositDay(person, year, month, day)`: Trace deposit match evaluations during matrix date-line generation.
- **`src/components/MainBudgetView.jsx`**:
  - Inline edits on bill name, monthly amount, and due day: Log immediate schedule adjustments made directly in the Bills view table.

### 4.4 Accounts & Ledgers
- **`src/context/LedgerDataContext.jsx`**:
  - `getCalculatedBalanceAsOf(accountId, targetDateObj)`: Log running balance simulation summary:
    - Account ID and starting date/balance
    - Daily accumulation of credits, bills, and other adjustments
    - Split between regular and extra ending balances
    - Final calculated cash on hand
  - `getAccountDerivedBalance(accountId)`: Log balance lookup source priority (most recent `importedLedgerRows` ending balance vs transactions running balance).
  - `upsertLineItem(billId, monthKey, actualAmount)`: Log reconciliation actuals updates for bills in a specific month.
- **`src/context/BudgetMetadataContext.jsx`**:
  - `addAccount(accountData)`, `updateAccount(id, updatedData)`, `deleteAccount(id)`: Log account balance setup (`startingBalance`, `extraStartingBalance`, `ledgerMode`).
- **`src/utils/spreadsheet.js`**:
  - `processSpreadsheetImport`: Log reconciliation matching: debit matched to bill via `matchingKey` / exact name, unmatched debit routed to Other expense, earner deposit matches.

### 4.5 Navigation & State
- **`src/App.jsx`**:
  - `App()` initialization: Log initial route resolution (`getRouteFromPathname`) and starting URL pathname.
  - `handlePopState`: Log browser back/forward navigation event and new pathname.
  - `navigateTo(path)`: Log SPA router `pushState` event, recording previous path vs new path.
  - `MainContent`: Log active view resolution (`getViewFromPathname`) and authentication state redirects.
- **`src/utils/indexedDB.js`**:
  - `getBudgetData()`: Log database read operation on application startup, recording data size and object store status.
  - `saveBudgetData(budgetData)`: Log debounced save operation to IndexedDB with serialized size and record counts.
  - `clearAndRestoreBudgetData(newBudgetData)` & `clearBudgetData()`: Log database reset/restore operations.
- **`src/context/LedgerDataContext.jsx`**:
  - `flushSaveToIndexedDB`: Log emergency write flush triggered by `beforeunload`, `pagehide`, or `visibilitychange` events.

---

## 5. Debug Page UI Toggle Layout Wireframe

The Debug view (`finance/src/components/settings/DebugConsolePanel.jsx`) will be enhanced with a dedicated Category Toggle Matrix and real-time category filters.

```
+---------------------------------------------------------------------------------------------------------+
| [Bug Icon] Granular System Telemetry & Debugger                                                         |
| Real-time execution tracing, network monitors, and state hooks across all subsystems.                   |
|                                                                    [Master Toggle: Active / Idle]       |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
| Category Master Controls:                                                                               |
| [Enable All Categories]     [Disable All Categories]     [Reset Defaults]                               |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
| GRANULAR CATEGORY TOGGLES                                                                               |
|                                                                                                         |
| +-----------------------------------------------+  +--------------------------------------------------+ |
| | [Cloud] Sync Operations             [ TOGGLE ]|  | [Zap] Transaction Mutations            [ TOGGLE ]| |
| | D1 SQLite pushes/pulls, worker API requests,  |  | Add/delete txns, amount diffs, date changes,    | |
| | offline queueing, conflict resolution.        |  | category/account reassignments.                  | |
| | Events: 12 captured                           |  | Events: 34 captured                              | |
| +-----------------------------------------------+  +--------------------------------------------------+ |
|                                                                                                         |
| +-----------------------------------------------+  +--------------------------------------------------+ |
| | [Calendar] Bill & Income Matrix     [ TOGGLE ]|  | [Wallet] Accounts & Ledgers            [ TOGGLE ]| |
| | Recurrence schedules, payday calculations,   |  | Balance recalculations, reconciliation matching, | |
| | due-date updates, schedule recalculations.    |  | starting balances, ledger adjustments.           | |
| | Events: 8 captured                            |  | Events: 21 captured                              | |
| +-----------------------------------------------+  +--------------------------------------------------+ |
|                                                                                                         |
| +-----------------------------------------------+  +--------------------------------------------------+ |
| | [Compass] Navigation & State        [ TOGGLE ]|  | [FileText] Import & Parser             [ TOGGLE ]| |
| | SPA router pushState/popstate, view routing,  |  | Workbook parsing, sheet detection, column        | |
| | context dispatches, IndexedDB read/writes.    |  | matching, record normalization.                  | |
| | Events: 15 captured                           |  | Events: 19 captured                              | |
| +-----------------------------------------------+  +--------------------------------------------------+ |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
| FILTER & EXPORT TOOLBAR:                                                                                |
| [ Search input... ]                                                                                     |
| Category Filter: [ ALL ] [ SYNC ] [ TRANSACTIONS ] [ MATRIX ] [ ACCOUNTS ] [ NAV ] [ IMPORT ]          |
| Level Filter:    [ ALL ] [ INFO ] [ WARN ] [ ERROR ]                                                    |
| Actions:         [ Copy All ] [ Export JSON ] [ Clear Logs ]                                            |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
| LIVE CONSOLE OUTPUT & PAYLOAD INSPECTOR                                                                 |
|                                                                                                         |
| 14:22:01.120 [INFO]  [SYNC]        pushCloudBackup: Payload serialized (14KB, 3 accounts, 11 bills) [Inspect]
| 14:22:01.450 [INFO]  [SYNC]        D1 SQLite Backup response: status 200, updated_at 2026-08-27T18:22:01Z
| 14:22:03.210 [INFO]  [TRANSACTION] Amount diff on acc-checking: $120.00 -> $135.50 (diff: +$15.50) [Inspect]
| 14:22:04.890 [INFO]  [NAV_STATE]   SPA pushState: /finance/dashboard -> /finance/ledger [Inspect]       |
| 14:22:05.105 [INFO]  [MATRIX]      Recurrence check: Earner "Jane" deposit day on 2026-08-28 (acc-1)   |
| 14:22:05.330 [INFO]  [ACCOUNTS]    Running balance simulation: Checking end balance calculated $4,210.50
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

---

## 6. Implementation Sequence (Post-Approval)

1. **Step 1:** Create `finance/src/utils/logger.js` containing category constants, localStorage handlers, subscriber pub/sub, categorized logging functions, and payload sanitization.
2. **Step 2:** Refactor `finance/src/utils/debugLogger.js` to wrap and re-export from `logger.js`.
3. **Step 3:** Inject Sync Operations hooks into `src/utils/api.js`, `src/context/LedgerDataContext.jsx`, and `src/worker.js`.
4. **Step 4:** Inject Transaction Mutations hooks into `src/context/LedgerDataContext.jsx`, `src/components/LedgerView.jsx`, and `src/components/settings/AccountsPeoplePanel.jsx`.
5. **Step 5:** Inject Bill & Income Matrix hooks into `src/context/BudgetMetadataContext.jsx`, `src/utils/paydayUtils.js`, and `src/components/MainBudgetView.jsx`.
6. **Step 6:** Inject Accounts & Ledgers hooks into `src/context/LedgerDataContext.jsx`, `src/context/BudgetMetadataContext.jsx`, and `src/utils/spreadsheet.js`.
7. **Step 7:** Inject Navigation & State hooks into `src/App.jsx`, `src/utils/indexedDB.js`, and `src/context/BudgetMetadataContext.jsx`.
8. **Step 8:** Upgrade `finance/src/components/settings/DebugConsolePanel.jsx` with category toggle cards, master switches, real-time counters, and category filtering.
9. **Step 9:** Execute production build (`npm run build`) in `finance/` to confirm zero errors or unresolved imports.
10. **Step 10:** Deploy to Cloudflare Workers via `npm run deploy` per repository workspace rules.

---

## 7. Auto-Click Halt Directive Confirmation

As mandated by the Antipilot Auto-Click Halt Directive:
- **No application source code files have been modified.**
- **No build or deployment commands have been executed.**
- Execution is now paused awaiting explicit user approval: `"Plan approved, proceed with implementation"`.
