# Finance OS - Delta Sync Architecture Plan
> **Status:** APPROVED & REVISED WITH FIXES  
> **Created:** 2026-11-09  
> **Last Updated:** 2026-11-09 (Post-Review Amendments Applied)  
> **Supersedes:** `cas-sync-runaway-fix-plan.md`  
> **Fix Label:** FIX-31 (Delta Sync)  
> **Target DB:** `finance-os-db`

---

> [!CAUTION]
> **DO NOT modify source code until the user explicitly responds: "Plan approved".**  
> This plan will be implemented in full after approval.

---

## 1. The Core Problem - Full Snapshot Rewrite on Every Change

The user's feedback identifies the actual root cause: the sync architecture is wrong by design.

### What Happens Today When You Edit One Matrix Cell

```
User edits one expense cell (e.g. account_2026-10_15_other_amount)
  → updateDailyMatrixCell() fires
  → dailyMatrix state updated, matrixVersion increments
  → 5-second debounce starts
  → pushCloudBackup({ auto: true }) fires
  → pushCloudBackupOptimistic() serializes THE ENTIRE budget object
  → POST /api/sync/backup  (full JSON payload - potentially hundreds of KB)
  → Server: validateBudgetPayloadDetailed() runs on full payload
  → Server: SELECT is_identical check
  → Server: buildStructuredWriteStatements() runs:
      DELETE FROM finance_daily_matrix WHERE ledger_id = ?       ← wipes all rows
      INSERT INTO finance_daily_matrix ... (every cell)          ← re-inserts all rows
      DELETE FROM finance_transactions WHERE ledger_id = ?       ← wipes all rows
      INSERT INTO finance_transactions ... (every transaction)   ← re-inserts all
      DELETE FROM finance_accounts WHERE ledger_id = ?           ← wipes all rows
      INSERT INTO finance_accounts ... (every account)           ← re-inserts all
      DELETE FROM finance_account_statement_rows WHERE ledger_id = ?
      INSERT INTO finance_account_statement_rows ... (every statement row)
      DELETE FROM finance_bills WHERE ledger_id = ?
      INSERT INTO finance_bills ...
      DELETE FROM finance_bill_splits WHERE ledger_id = ?
      INSERT INTO finance_bill_splits ...
      DELETE FROM finance_people WHERE ledger_id = ?
      INSERT INTO finance_people ...
      DELETE FROM finance_person_allocations WHERE ledger_id = ?
      INSERT INTO finance_person_allocations ...
      DELETE FROM finance_line_items WHERE ledger_id = ?
      INSERT INTO finance_line_items ...
      DELETE FROM finance_funding_goals WHERE ledger_id = ?
      INSERT INTO finance_funding_goals ...
      DELETE FROM finance_loans WHERE ledger_id = ?
      INSERT INTO finance_loans ...
      DELETE FROM finance_dashboard_widgets WHERE ledger_id = ?
      INSERT INTO finance_dashboard_widgets ...
      DELETE FROM finance_categories WHERE ledger_id = ?
      INSERT INTO finance_categories ...
      UPSERT finance_ledger_settings
      UPSERT user_backups (the full JSON blob again)
```

**Result for a typical Finance OS user:** One cell edit → ~500-1,500 D1 row writes.  
**With daily use and the auto-backup firing every 5 seconds of inactivity:** Tens of thousands of row writes per session.

### Write Amplification by Table

For a realistic Finance OS dataset:

| Table | Typical Row Count | Rows Written Per Sync |
|---|---|---|
| `finance_daily_matrix` | 2,000-10,000 (365 days × N accounts × M fields) | ALL (delete + insert all) |
| `finance_transactions` | 100-2,000 | ALL |
| `finance_account_statement_rows` | 200-1,000 | ALL |
| `finance_accounts` | 2-5 | ALL |
| `finance_bills` | 10-30 | ALL |
| `finance_bill_splits` | 20-60 | ALL |
| `finance_people` | 2-4 | ALL |
| `finance_person_allocations` | 4-8 | ALL |
| `finance_line_items` | 50-500 | ALL |
| `finance_funding_goals` | 2-10 | ALL |
| `finance_loans` | 0-5 | ALL |
| `user_backups` | 1 | 1 (the full blob) |
| `finance_ledger_settings` | 1 | 1 |

**A single cell edit causes 500-12,000+ D1 row writes.**  
**A session with 20 edits causes 10,000-240,000+ row writes.**

---

## 2. The Target Architecture - Granular Delta Sync

### Design Principle

> **Write only what changed, only when it changed, only once.**

Each mutation type (cell edit, transaction add/update, bill add/update, etc.) triggers a **targeted D1 write** to only the rows that were actually modified. The full-snapshot `POST /api/sync/backup` is preserved for:
- Manual backup-now requests (`manual: true`)
- Cloud restore (`GET /api/sync/restore`)
- First-login cloud pull
- Conflict resolution

### New Data Flow for a Cell Edit

```
User edits one expense cell
  → updateDailyMatrixCell(accountId, monthKey, day, field, value)
  → Single targeted write queued: { type: 'matrix_cell', key, value }
  → 400ms debounce (matches existing IndexedDB debounce cadence)
  → POST /api/sync/delta
      { mutations: [{ op: 'upsert_matrix_cell', ledgerId, key, numValue, strValue }] }
  → Server:
      INSERT INTO finance_daily_matrix (ledger_id, account_id, month_key, day_num, field_key, num_value, str_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ledger_id, field_key) DO UPDATE SET num_value = excluded.num_value, str_value = excluded.str_value
  → 1 D1 row write. Done.
```

---

## 3. Implementation Scope

This is a **three-layer change** touching: client mutation hooks, a new delta endpoint, and the existing snapshot endpoint (kept intact for backup/restore).

### Layer 1 - `finance_daily_matrix` Unique Key Constraint (Schema Migration)

**File:** `finance/finance-schema.sql` + new migration file  

The `finance_daily_matrix` table has a **5-column composite PK**: `PRIMARY KEY (ledger_id, account_id, month_key, day_num, field_key)`. However, `parseMatrixCompositeKey` in `structuredBudgetStore.js` always falls back to defaults (`account_id='default'`, `month_key='0000-00'`, `day_num=0`) because client keys use underscore delimiters while the parser splits on hyphens. The full cell identity lives in `field_key` alone.

SQLite's `ON CONFLICT(col1, col2)` requires those exact columns to form a UNIQUE constraint or PK. The 5-column PK does not satisfy a 2-column `ON CONFLICT(ledger_id, field_key)`. We need a dedicated unique index on `(ledger_id, field_key)` to enable delta upserts.

**Migration SQL (new file: `finance/migrations/0013_delta_sync_constraints.sql`):**
```sql
-- Required: enables ON CONFLICT(ledger_id, field_key) for delta upserts.
-- Safe: field_key stores the full composite raw key (e.g. "acc-1699000000000_2026-11_15_other_amount"),
-- so (ledger_id, field_key) is effectively unique even though the 5-column PK also exists.
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_daily_matrix_ledger_field
  ON finance_daily_matrix(ledger_id, field_key);
```

> [!NOTE]
> `finance_accounts`, `finance_bills`, `finance_people`, `finance_transactions`, `finance_line_items`, etc. already have `PRIMARY KEY (ledger_id, id)` via their DDL. `ON CONFLICT(ledger_id, id)` works natively against the PK - no additional indexes needed for those tables. Only `finance_daily_matrix` requires a new index because its PK has 5 columns but the delta upsert targets 2.

---

### Layer 2 - New Worker Endpoint: `POST /api/sync/delta`

**File:** `finance/src/worker.js`

A new lightweight handler `handleSyncDelta` processes an array of typed mutation operations, each producing **exactly one D1 statement**.

#### Mutation Op Types

```js
// --- Active Phase 1 Ops (Wired to Client & Daily Matrix) ---
// Matrix cell upsert (1 D1 write)
{ op: 'upsert_matrix_cell', ledgerId, key, numValue, strValue }

// Matrix cell delete (1 D1 write)  
{ op: 'delete_matrix_cell', ledgerId, key }

// --- Future Stub Ops (Reserved for Phase 2 - not wired on client yet) ---
// Transaction upsert
{ op: 'upsert_transaction', ledgerId, tx: { id, accountId, date, description, amount, ... } }

// Transaction delete
{ op: 'delete_transaction', ledgerId, txId }

// Line item upsert
{ op: 'upsert_line_item', ledgerId, li: { id, billId, monthKey, actualAmount, isPaid, ... } }

// Account upsert
{ op: 'upsert_account', ledgerId, account: { id, startingBalance, ... } }

// Bill upsert
{ op: 'upsert_bill', ledgerId, bill: { id, accountId, name, amount, ... } }

// user_backups blob update (timestamp/fingerprint only, no full data)
{ op: 'touch_backup', ledgerId, dataByteLength, dataHash, nowMs }
```

#### Handler Logic (`handleSyncDelta`)

```js
import { parseMatrixCompositeKey } from '../functions/utils/structuredBudgetStore.js';

const MAX_BODY_DELTA = 64 * 1024; // 64 KB limit for delta payloads

async function handleSyncDelta(context) {
  const { request, env } = context;
  const auth = await authenticate(context, { requireCsrf: true });
  if (auth.error) return auth.error;

  const { ledger, role } = await resolveLedgerAccess(env, targetLedgerId, auth.user);
  if (!ledger || !canEdit(role)) return fail(FORBIDDEN, 403, ...);

  const body = await readJson(request, MAX_BODY_DELTA);
  const mutations = body?.mutations;
  if (!Array.isArray(mutations) || mutations.length === 0 || mutations.length > 50) {
    return fail(VALIDATION_ERROR, 400, 'mutations must be a non-empty array of at most 50 ops');
  }

  const stmts = [];
  for (const mut of mutations) {
    switch (mut.op) {
      case 'upsert_matrix_cell': {
        // Use the SAME key parser as the snapshot path for data consistency
        const { accountId, monthKey, dayNum } = parseMatrixCompositeKey(mut.key);
        const numValue = typeof mut.numValue === 'number' && Number.isFinite(mut.numValue) ? mut.numValue : null;
        const strValue = typeof mut.strValue === 'string' ? mut.strValue : (mut.numValue === null ? '__NULL__' : null);
        stmts.push(env.DB.prepare(
          `INSERT INTO finance_daily_matrix (ledger_id, account_id, month_key, day_num, field_key, num_value, str_value)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ledger_id, field_key) DO UPDATE SET
             num_value = excluded.num_value,
             str_value = excluded.str_value`
        ).bind(targetLedgerId, accountId, monthKey, dayNum, mut.key, numValue, strValue));
        break;
      }
      case 'delete_matrix_cell': {
        stmts.push(env.DB.prepare(
          `DELETE FROM finance_daily_matrix WHERE ledger_id = ? AND field_key = ?`
        ).bind(targetLedgerId, mut.key));
        break;
      }
      // --- Future stub ops (not wired on client yet, reserved for Phase 2) ---
      case 'upsert_transaction': {
        stmts.push(env.DB.prepare(
          `INSERT INTO finance_transactions (ledger_id, id, account_id, date, description, amount, type, category, status, matched_bill_id, person_id, is_other, notes, sort_order, extra_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ledger_id, id) DO UPDATE SET
             date = excluded.date, description = excluded.description, amount = excluded.amount,
             type = excluded.type, category = excluded.category, status = excluded.status,
             matched_bill_id = excluded.matched_bill_id, notes = excluded.notes,
             extra_json = excluded.extra_json`
        ).bind(...));
        break;
      }
      // ... other future stub op types (upsert_line_item, upsert_account, upsert_bill, etc.)
    }
  }

  if (stmts.length === 0) return json({ success: true, unchanged: true });
  await env.DB.batch(stmts);
  return json({ success: true, ops: stmts.length });
}
```

> [!NOTE]
> The `upsert_transaction`, `delete_transaction`, `upsert_line_item`, `upsert_account`, and `upsert_bill` op types are defined in the handler as **future-proofing stubs**. In Phase 1, only `upsert_matrix_cell` and `delete_matrix_cell` are wired on the client. Transactions, line items, and structural data continue using the snapshot path.

**Route registration (in ROUTES table):**
```js
'POST /api/sync/delta': handleSyncDelta,
```

---

### Layer 3 - Client Delta Queue (`src/utils/deltaQueue.js`) - NEW FILE

This new module accumulates mutations and flushes them in a debounced batch to `POST /api/sync/delta`. It is completely separate from the existing snapshot sync path.

#### Design

```js
// src/utils/deltaQueue.js
// Accumulates granular mutations and flushes them to POST /api/sync/delta
// - Deduplicates: a second edit to the same cell overwrites the first pending op
// - Debounced: flushes after 400ms of inactivity (matches IndexedDB auto-save cadence)
// - Max-wait cap: forces flush after 2s even if edits continue (prevents indefinite deferral)
// - Batched: sends up to 50 ops per request
// - Falls back to the existing snapshot sync on network failure
// - Flushes via sendBeacon on page visibility change / unload

const pendingOps = new Map(); // key → op object (Map preserves insertion order, deduplicates by key)
let flushTimer = null;
let firstEnqueueTime = null;
const MAX_FLUSH_DELAY = 2000; // 2s ceiling so rapid edits don't indefinitely defer
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

// Track connectivity state and auto-flush on reconnect
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { isOnline = true; if (pendingOps.size > 0) flushDeltaQueue(); });
  window.addEventListener('offline', () => { isOnline = false; });
}

export function enqueueDelta(op) {
  // Use op.key (for matrix cells) or `${op.op}:${op.tx?.id}` etc. as dedup key
  const dedupKey = getDedupKey(op);
  if (pendingOps.size === 0) firstEnqueueTime = Date.now();
  pendingOps.set(dedupKey, op);  // Later op for same entity overwrites earlier pending op

  clearTimeout(flushTimer);
  // Debounce 400ms, but cap total wait at MAX_FLUSH_DELAY
  const elapsed = Date.now() - firstEnqueueTime;
  const delay = Math.max(0, Math.min(400, MAX_FLUSH_DELAY - elapsed));
  flushTimer = setTimeout(flushDeltaQueue, delay);
}

export async function flushDeltaQueue(passcode, ledgerId, userId) {
  if (pendingOps.size === 0) return;
  if (!isOnline) return; // Will retry on next enqueueDelta call or 'online' event

  firstEnqueueTime = null; // Reset max-wait tracking

  const batch = [...pendingOps.values()].slice(0, 50);
  // Optimistic clear - restore on failure
  const snapshot = new Map(pendingOps);
  batch.forEach(op => pendingOps.delete(getDedupKey(op)));

  try {
    const res = await apiFetch('/api/sync/delta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ledgerId, mutations: batch })
    });
    if (!res.ok) {
      // Restore on failure - merge snapshot back (don't overwrite newer ops)
      for (const [k, v] of snapshot) {
        if (!pendingOps.has(k)) pendingOps.set(k, v);
      }
    }
  } catch {
    // Network error - restore snapshot
    for (const [k, v] of snapshot) {
      if (!pendingOps.has(k)) pendingOps.set(k, v);
    }
  }
}

// Flush pending deltas on page hide/unload using sendBeacon (survives page close)
export function initDeltaQueueLifecycle(getLedgerId) {
  if (typeof document === 'undefined') return;

  const beaconFlush = () => {
    if (pendingOps.size === 0) return;
    const batch = [...pendingOps.values()].slice(0, 50);
    const ledgerId = getLedgerId();
    if (!ledgerId) return;
    // sendBeacon is fire-and-forget; survives page unload unlike fetch
    navigator.sendBeacon(
      '/api/sync/delta',
      new Blob([JSON.stringify({ ledgerId, mutations: batch })], { type: 'application/json' })
    );
    pendingOps.clear();
    firstEnqueueTime = null;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') beaconFlush();
  });
  window.addEventListener('beforeunload', beaconFlush);
}
```

> [!NOTE]
> `sendBeacon` bypasses the CSRF header check. The delta endpoint must accept requests without `X-CSRF-Token` when the method is detected as beacon (or add the CSRF token to the beacon payload body for server-side validation). Alternatively, `initDeltaQueueLifecycle` can call `flushDeltaQueue` synchronously and rely on the browser's keep-alive behavior for `fetch` with `keepalive: true`.

---

### Layer 4 - Wire Delta Queue into Mutation Functions

**File:** `finance/src/context/LedgerDataContext.jsx`

Each matrix mutation function that currently just updates local state will also call `enqueueDelta` with a typed op. The op is a lightweight descriptor - no full payload cloning. **Only `finance_daily_matrix` mutations are delta-synced in Phase 1.** Line items, transactions, and structural data continue using the snapshot path.

#### `updateDailyMatrixCell` (line 1203)

```js
// AFTER the existing state update (lines 1232-1234), ADD:
enqueueDelta({
  op: 'upsert_matrix_cell',
  ledgerId: activeLedgerId || currentUserId,
  key,          // already computed: `${accountId}_${monthKey}_${day}_${field}`
  numValue: isTextField ? null : (cleanValue === '' ? null : cleanValue),
  strValue: isTextField ? cleanValue : null
});
```

**What does NOT change:** The existing IndexedDB auto-save (500ms debounce) is untouched. The delta queue flush (400ms debounce) is an independent, additive path.

#### `updateDailyMatrixCells` (line 1237) - batch cell edit

```js
// AFTER the existing state update, ADD:
for (const [k, v] of Object.entries(updates)) {
  enqueueDelta({ op: 'upsert_matrix_cell', ledgerId: activeLedgerId || currentUserId, key: k, numValue: ..., strValue: ... });
}
// (These will naturally batch in the delta queue's Map since all enqueued within same tick)
```

#### `moveDailyMatrixCell` (line 1260) - drag-and-drop cell relocation

```js
// AFTER the existing state update (inside the `if (hasChanges)` block at line 1322), ADD:
// Delta-sync each cell mutation produced by the move operation
const movedOps = [];
movedOps.push({ op: 'upsert_matrix_cell', ledgerId: activeLedgerId || currentUserId, key: sourceKey, numValue: 0, strValue: null });
movedOps.push({ op: 'upsert_matrix_cell', ledgerId: activeLedgerId || currentUserId, key: targetKey, numValue: cleanValue, strValue: null });
if (sourceDescKey) {
  movedOps.push({ op: 'upsert_matrix_cell', ledgerId: activeLedgerId || currentUserId, key: sourceDescKey, numValue: null, strValue: '' });
}
if (targetDescKey) {
  movedOps.push({ op: 'upsert_matrix_cell', ledgerId: activeLedgerId || currentUserId, key: targetDescKey, numValue: null, strValue: sourceDesc });
}
movedOps.forEach(op => enqueueDelta(op));
```

#### `upsertLineItem`, `BudgetMetadataContext` mutations, and transactions

These mutations change line items, structural metadata (accounts, bills, people), or transactions. They are **not delta-synced** in Phase 1:

- **Line items:** `upsertLineItem` updates `lineItems` state, which flows into `budgetForUI` → triggers the existing snapshot auto-backup (5-second debounce). Delta-syncing would cause a dual-write since the snapshot still fires. Line items are low-frequency (tens per month), so the snapshot path is appropriate.
- **Structural metadata:** `addAccount`, `updateAccount`, `addBill`, etc. change `metadataState` → `budgetForUI` → snapshot. These are infrequent and the entire metadata is small (20-60 rows total).
- **Transactions:** Added/updated via import or manual entry. Flow through `budgetForUI` → snapshot.

> [!IMPORTANT]
> The key insight: `dailyMatrix` is the dominant source of write amplification. A full daily matrix for a multi-account Finance OS user can have **5,000-10,000 entries**. The delta queue eliminates the matrix re-write entirely. All other data (line items, transactions, structural metadata: typically 200-500 rows total) continues using the snapshot path, which is acceptable because `budgetForUI` changes trigger the snapshot and these mutations are infrequent.

---

### Layer 5 - Rethink the Auto-Backup `useEffect`

**File:** `finance/src/context/LedgerDataContext.jsx`

With delta sync handling all matrix cell mutations, the auto-backup `useEffect` no longer needs to fire on `matrixVersion` changes. It should only trigger on **structural metadata changes** (accounts, bills, people, funding goals, loans, theme) and **data changes to line items and transactions** (which still flow through `budgetForUI`).

**Change dependency array:**
```js
// BEFORE:
}, [budgetForUI, matrixVersion, isDbLoaded, isAutoCloudBackupEnabled, isAuthenticated,
    syncPasscode, pushCloudBackup, currentUserId, activeLedgerId, syncConflict]);

// AFTER:
// budgetForUI covers metadataState + lineItems + transactions (not matrixVersion)
// matrixVersion is REMOVED - matrix changes go through delta queue, not snapshot
// lineItems and transactions remain in budgetForUI, so their changes still trigger snapshot sync
}, [budgetForUI, isDbLoaded, isAutoCloudBackupEnabled, isAuthenticated,
    syncPasscode, pushCloudBackup, currentUserId, activeLedgerId, syncConflict]);
```

This immediately eliminates the write storm caused by matrix edits triggering full snapshot re-syncs. Each cell edit now costs exactly **1 D1 write** via the delta endpoint.

---

### Layer 6 - `localStorage` Pending Queue Reduction

**File:** `finance/src/utils/api.js`

The existing `savePendingSync` stores the **entire budget blob** in `localStorage` as a fallback queue. This is:
- Up to hundreds of KB of data written to localStorage on every push attempt
- Completely unnecessary for delta ops (which carry only the changed record)

The delta queue module (`deltaQueue.js`) uses its **in-memory `Map`** as the pending queue. If the browser closes before a flush, the `sendBeacon`-based lifecycle hook (`initDeltaQueueLifecycle`) fires on `visibilitychange` / `beforeunload` to flush pending ops. This minimizes the loss window to near-zero. If `sendBeacon` fails (e.g., worker is down), the fallback behavior is:
1. The IndexedDB auto-save (500ms debounce) has already persisted the change locally.
2. On next session, the cloud restore will show the last successfully synced state.
3. The auto-backup snapshot (triggered by structural changes) will catch up any delta ops that were lost.

For the snapshot sync path (`pushCloudBackupOptimistic`), the existing `savePendingSync` logic is preserved as-is. No localStorage changes required for the delta path.

---

## 4. Files Changed - Complete List

| File | Change Type | Description |
|---|---|---|
| `finance/migrations/0013_delta_sync_constraints.sql` | **NEW** | Unique index on `finance_daily_matrix(ledger_id, field_key)` only (transactions/line_items PKs already suffice) |
| `finance/src/worker.js` | **MODIFY** | Add `handleSyncDelta` handler with `parseMatrixCompositeKey` import; register `POST /api/sync/delta` route; define `MAX_BODY_DELTA` |
| `finance/src/utils/deltaQueue.js` | **NEW** | In-memory deduplicated delta op queue with 400ms debounce, 2s max-wait cap, online/offline listeners, `sendBeacon` lifecycle hooks |
| `finance/functions/utils/structuredBudgetStore.js` | **MODIFY** | Export `parseMatrixCompositeKey` (currently module-private) |
| `finance/src/context/LedgerDataContext.jsx` | **MODIFY** | Wire `enqueueDelta` into `updateDailyMatrixCell`, `updateDailyMatrixCells`, `moveDailyMatrixCell`; remove `matrixVersion` from snapshot auto-backup dep array; call `initDeltaQueueLifecycle`; apply FIX-31 session ref resets |
| `finance/finance-schema.sql` | **MODIFY** | Add unique index DDL for `finance_daily_matrix` |
| `finance/docs/03_features.md` | **UPDATE** | Document delta sync architecture under new FIX-31 section |
| `finance/docs/04_state.md` | **UPDATE** | Update Section 4 (Cloud Sync) with delta endpoint, queue design, and lifecycle hooks |

---

## 5. Write Volume After This Change

| Mutation | Before | After |
|---|---|---|
| Edit one matrix cell | 500-12,000 D1 writes | **1 D1 write** |
| Edit 10 cells rapidly | 500-12,000 D1 writes (last one wins, one sync) | **1-10 D1 writes** (deduplicated per key) |
| Drag-move a cell (with desc) | 500-12,000 D1 writes | **2-4 D1 writes** (source zero + target set + desc cells) |
| Add a transaction | 500-12,000 D1 writes | **~200-500 D1 writes** (snapshot, but no matrix re-write) |
| Upsert a line item | 500-12,000 D1 writes | **~200-500 D1 writes** (snapshot via budgetForUI, no matrix re-write) |
| Update a bill (structural) | 500-12,000 D1 writes | **~30-60 D1 writes** (snapshot, infrequent) |
| Sign in and view balance | 500-12,000 D1 writes | **0 D1 writes** (hash guard blocks snapshot; no delta fired) |
| Manual backup ("Save Now") | 500-12,000 D1 writes | 500-12,000 D1 writes (intentional - full snapshot) |

---

## 6. What Stays Unchanged

- The `POST /api/sync/backup` snapshot endpoint is **fully preserved** for manual backups, cloud restore, and conflict resolution. It still writes all tables including `finance_daily_matrix` - but now only triggers on non-matrix changes.
- `GET /api/sync/restore` reconstruction from structured tables is **fully preserved**.
- IndexedDB auto-save (500ms debounce) is **untouched** - it retains `matrixVersion` in its own dep array.
- The CAS version control (`baseVersion`, `storedVersion`, 409 conflict detection) is **preserved** on the snapshot path.
- `user_backups` blob is **still updated** on every snapshot sync (manual backup), ensuring point-in-time restore works.
- All existing FIX-29/FIX-30 session guards (`isSeedHydratedRef`, `lastSyncedPayloadHashRef`, conflict dedup) are **kept as secondary defenses**.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Delta and snapshot out of sync (delta writes a cell, snapshot later overwrites with stale data) | Snapshot only triggers on structural/line-item/transaction changes (no `matrixVersion` in dep array). Matrix cells are delta-only. Snapshot still includes dailyMatrix in its payload, but this only fires on non-matrix changes. |
| Delta queue lost on page close before flush | `sendBeacon` lifecycle hook fires on `visibilitychange`/`beforeunload`, minimizing loss window. If beacon fails, IndexedDB has the data locally. Next snapshot (triggered by any non-matrix change) will catch up. |
| `finance_daily_matrix` unique constraint breaks existing snapshot `DELETE + INSERT` pattern | The snapshot path uses `DELETE WHERE ledger_id = ?` first, then `INSERT`. The new unique index does not block this pattern. It only enables `ON CONFLICT DO UPDATE` for delta upserts. |
| Delta endpoint auth or CSRF failure | Same `requireCsrf: true` guard as snapshot. If delta fails, ops stay in in-memory queue and retry on next `enqueueDelta` call or `online` event. `sendBeacon` bypasses CSRF headers - see NOTE in Layer 3 for mitigation options. |
| Shared ledger collaboration: delta writes from two users simultaneously | `ON CONFLICT DO UPDATE` is last-write-wins per cell key. This is correct behavior - same as the snapshot CAS model for cell-level granularity. |
| `parseMatrixCompositeKey` produces fallback values for client keys | Delta handler imports and calls the same `parseMatrixCompositeKey` from `structuredBudgetStore.js`, ensuring account_id/month_key/day_num values are identical between delta and snapshot writes. |
| Rapid continuous edits defer flush indefinitely | 2-second max-wait cap forces flush even if edits continue without pause. |

---

## 8. Build & Deploy Sequence (Post-Approval)

1. Export `parseMatrixCompositeKey` from `structuredBudgetStore.js` (add `export` keyword)
2. Apply migration `0013_delta_sync_constraints.sql` via `wrangler d1 execute finance-os-db --file=...`
3. Implement all code changes (worker handler, deltaQueue.js, LedgerDataContext wiring)
4. Call `initDeltaQueueLifecycle` from LedgerDataContext's initialization
5. `cd finance && npm run build` - must exit zero errors
6. `npm run deploy`
7. Smoke test: edit one cell, verify only 1 D1 write in Cloudflare D1 metrics
8. Smoke test: drag-move a cell, verify 2-4 D1 writes
9. Smoke test: upsert a line item, verify snapshot fires (not delta)

---

*Plan revised with all 6 audit findings and 3 optimizations incorporated. Ready for execution.*

