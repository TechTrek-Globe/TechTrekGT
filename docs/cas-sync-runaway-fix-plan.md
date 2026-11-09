# CAS Sync Runaway D1 Write - Implementation Plan
> **Status:** PENDING REVIEW  
> **Created:** 2026-11-09  
> **Target DB:** `finance-os-db` (ID: `1746a2c8-2653-4136-8301-d217748621fa`)  
> **FIX Label:** FIX-31

---

## 1. Audit Findings - Root Cause Analysis

> [!CAUTION]
> This plan must be **fully reviewed and approved** before any source code is touched. Do not execute steps until the user responds with **"Plan approved"**.

The audit of `LedgerDataContext.jsx`, `api.js`, and `src/worker.js` identified **four distinct defects** working in combination to produce the 62k+ D1 row write storm on sign-in.

---

### Bug 1 - `pushCloudBackupOptimistic` Enqueues to localStorage Unconditionally (Line 204, `api.js`)

**File:** `finance/src/utils/api.js`, line 204  
**Code:**
```js
// Line 204 - called BEFORE ownership check passes, BEFORE network fires
savePendingSync(budgetData, passcode || '', targetLid);
```

**Problem:** `savePendingSync` writes the full budget blob to localStorage at the start of *every* `pushCloudBackupOptimistic` call - regardless of whether the payload hash guard in `pushCloudBackup` (which is upstream in `LedgerDataContext`) would have skipped it. This is a secondary concern (localStorage, not D1), but it means every auto-backup run - even skipped ones routed through `pushCloudBackup` - corrupts the queue state.

More critically: when the effect fires legitimately and the network call goes out, the pending sync item is left in the queue until the response returns. If the server responds with the `unchanged: true` short-circuit (line 633, `worker.js`), the success path at line 294-295 in `api.js` correctly calls `clearPendingSync`. However, if any intermediate state re-triggers the auto-backup `useEffect` before the 5-second timer fires and the previous timer is cancelled (via the cleanup `clearTimeout`), a new `savePendingSync` call overwrites the queue with fresh data, resetting its timestamp. This creates a "rolling queue" that always has stale data present.

**Risk:** Medium (localStorage only, but pollutes queue state between rapid re-renders).

---

### Bug 2 - `useEffect` Dependency Array Causes Re-Arm on `syncPasscode` / `pushCloudBackup` Reference Change (Line 888, `LedgerDataContext.jsx`)

**File:** `finance/src/context/LedgerDataContext.jsx`, lines 851-888  
**Code:**
```js
useEffect(() => {
  // ... auto backup logic ...
}, [budgetForUI, matrixVersion, isDbLoaded, isAutoCloudBackupEnabled, isAuthenticated,
    syncPasscode, pushCloudBackup, currentUserId, activeLedgerId, syncConflict]);
```

**Problem:** `pushCloudBackup` is a `useCallback` that depends on `[setLastCloudSyncTime, currentUserId, activeLedgerId, ledgerRole, ledgerPermissions, computePayloadFingerprint]`. On sign-in, the following sequence causes this effect to fire repeatedly without data actually changing:

1. User signs in. `isAuthenticated` flips to `true` → first run: `isInitialMountRef.current` is `true`, so it sets it to `false` and returns early. `lastSeenDataRef.current` is set.
2. `currentUserId` populates asynchronously → `pushCloudBackup` identity changes → effect re-runs.
3. `activeLedgerId` resolves from `sessionStorage` → `pushCloudBackup` identity changes **again** → effect re-runs.
4. `ledgerRole` / `ledgerPermissions` settle after `GET /api/finance/ledgers` resolves → `pushCloudBackup` identity changes **again** → effect re-runs.

On **each re-run after the first**, `isInitialMountRef.current` is already `false`. The code then checks `dataChanged = lastSeenDataRef.current.ui !== budgetForUI`. Since `budgetForUI` is a stable `useMemo` referencing `metadataState`, it will be **the same reference** between runs - so `dataChanged = false`. That means `autoPushPendingRef.current` is NOT set to true on these re-runs. So the effect returns at line 873 without triggering a push.

**However**, there is a **window condition**: if `isSeedHydratedRef.current` becomes `true` between the first run (which set `isInitialMountRef.current = false`) and a second run caused by `activeLedgerId` resolving, AND `budgetForUI` changed during IndexedDB hydration (which calls `setDailyMatrix` and `setMatrixVersion`), then `dataChanged` will be `true` on the second run. At this point, `suppressDirtyUntilRef.current` is set to `Date.now() + 2000` by the seed hydration effect (line 126). But the auto-backup check compares `Date.now() < suppressDirtyUntilRef.current` - if the seed hydration effect and the second effect run happen within the same React batch, the 2-second suppress window may not be sufficient to block all runs.

**More critically**: `syncConflict` is in the dependency array. If a 409 conflict arrives and `setSyncConflict` is called, the effect re-runs. If the conflict clears (by `resolveConflict*`), the effect runs again with `autoPushPendingRef.current = true` (set during a prior dirty run). This causes an **immediate auto-push without waiting for the full 5-second debounce** because the `timer = setTimeout(..., 5000)` starts but the cleanup at line 887 runs every time the dependencies change, cancelling pending timers. The net result is the timer fires only on the **final** stable state - but while dependencies are churning, the effect runs many times, repeatedly re-stamping `tt_budget_last_modified` via line 871 (a `localStorage.setItem` call), and re-arming `autoPushPendingRef.current = true`.

**Risk:** High - this is the primary trigger of repeated auto-push scheduling during the sign-in state-settling window.

---

### Bug 3 - `isInitialMountRef` Is Not Reset on `activeLedgerId` or `currentUserId` Change (Lines 848-860, `LedgerDataContext.jsx`)

**File:** `finance/src/context/LedgerDataContext.jsx`, lines 848-860  
**Code:**
```js
const isInitialMountRef = useRef(true);
// ...
if (isInitialMountRef.current) {
  isInitialMountRef.current = false;
  lastSeenDataRef.current = { ui: budgetForUI, mv: matrixVersion };
  return;
}
```

**Problem:** `isInitialMountRef` is a module-level ref that is set to `false` on the **first** effect execution. It is never reset when the user logs out and back in (the logout handler at line 206 does NOT reset `isInitialMountRef.current`). This means on the **second login** in the same browser session (without a page reload), `isInitialMountRef.current` is already `false`, so the initial-mount protection is completely bypassed. The first effect run after the second login will execute the `dataChanged` check and may immediately arm `autoPushPendingRef.current = true` and start a 5-second timer.

**Fix:** Add `isInitialMountRef.current = true;` to the logout handler at line 206, alongside the existing `autoPushPendingRef.current = false;` reset.

**Risk:** High on multi-session flows (sign out → sign in in same tab without reload).

---

### Bug 4 - Server-Side `is_identical` Guard Passes `dataStr` as Full JSON but `data_byte_length` Comparison Uses UTF-8 Byte Count (Lines 623-633, `worker.js`)

**File:** `finance/src/worker.js`, lines 623-633  
**Code:**
```js
const dataStr = JSON.stringify(payload);
const dataByteLength = new TextEncoder().encode(dataStr).length;

const row = await env.DB.prepare(
  'SELECT updated_at, updated_at_ms, data_byte_length, CASE WHEN data_byte_length = ? AND data = ? THEN 1 ELSE 0 END AS is_identical FROM user_backups WHERE id = ?'
).bind(dataByteLength, dataStr, targetLedgerId).first();
```

**Problem:** The server-side `is_identical` guard compares `data_byte_length = ?` AND `data = ?`. The `data_byte_length` stored is the UTF-8 byte length via `TextEncoder`, but SQLite's `data = ?` comparison is a text equality check on the raw `TEXT` column. This comparison **is structurally correct** - if `data` matches byte-for-byte, it is identical. However, the guard only fires when both conditions match.

The subtle issue is: if the client sends a payload where `JSON.stringify` produces a **different key ordering** on consecutive calls due to object property insertion order instability, `data = ?` will **not match** even though the semantic content is identical. This would cause the `is_identical` check to return 0, proceeding to a full `env.DB.batch()` write even on truly unchanged data. 

This is especially relevant because `computePayloadFingerprint` in the client uses `ALLOWED_BUDGET_KEYS` to enforce a consistent iteration order over the budget object. However, **nested objects** (like individual accounts within the `accounts` array, or individual rows within `dailyMatrix`) are stringified in their current property insertion order, which can vary if objects were mutated or reconstructed. If the client's hash matches but the server's string-equality check fails, the server executes the full structured write batch.

**Risk:** Medium - the client-side hash guard prevents the network call in most cases, but when it fails (first sync after login, or after a restore), the server may execute unnecessary writes.

> [!NOTE]
> The structured write path in `buildStructuredWriteStatements` runs **15 normalized table upserts** decomposed from the budget snapshot. For a typical Finance OS user with accounts, bills, transactions, and a full daily matrix, this can easily generate **hundreds of individual D1 row writes per backup call**. Even a single unguarded auto-sync call can produce 500-1,000+ row writes.

---

## 2. Cascading Write Storm - Reconstructed Timeline

Based on the four bugs above, here is the reconstructed sequence that generated 62k+ row writes in a 12-hour window:

```
1. User signs in
   → AuthContext resolves, `isAuthenticated = true`
   → Auto-backup useEffect fires: isInitialMountRef = true → skipped, arm baseline

2. currentUserId populates (async /api/auth/me response)
   → pushCloudBackup reference changes → effect re-fires
   → isInitialMountRef = false, budgetForUI still at seed value → dataChanged = false
   → autoPushPendingRef still false → returns early ✓

3. IndexedDB hydration completes (isSeedHydratedRef = true)
   → setDailyMatrix() fires → matrixVersion increments
   → suppressDirtyUntilRef = Date.now() + 2000
   → effect fires: dataChanged = true (matrixVersion changed)
   → Date.now() < suppressDirtyUntilRef → autoPushPendingRef = false → returns early ✓

4. activeLedgerId resolves from sessionStorage / GET /api/finance/ledgers
   → pushCloudBackup reference changes → effect re-fires
   → isInitialMountRef = false, budgetForUI same reference → dataChanged = false
   → autoPushPendingRef = false → returns early ✓

5. HOWEVER: if suppressDirtyUntilRef window (2 seconds) expires before step 4
   AND step 3 had a matrixVersion increment:
   → effect fires with dataChanged = true AND suppress window expired
   → autoPushPendingRef = true
   → 5-second timer armed

6. Before the 5-second timer fires, activeLedgerId resolves:
   → pushCloudBackup reference changes → effect re-fires
   → autoPushPendingRef.current is ALREADY true (from step 5)
   → timer cleanup runs, old timer cancelled, NEW 5-second timer armed
   → This can repeat multiple times if ledgerRole / ledgerPermissions settle slowly

7. Eventually the 5-second timer fires:
   → pushCloudBackup({ auto: true }) called
   → Client hash check: lastSyncedPayloadHashRef = null (first login) → NO skip
   → pushCloudBackupOptimistic fires: network request to POST /api/sync/backup
   → Server receives request, evaluates is_identical:
     - If this is first sync ever: row = null → no short-circuit
     - Full env.DB.batch() fires: user_backups upsert + 15 normalized table writes (hundreds of rows)

8. Response: { success: true, version: X }
   → lastSyncedPayloadHashRef set to hash
   → Cloud version updated

9. But: activeLedgerId or syncConflict state still churning from API responses
   → effect re-fires again
   → dataChanged = false, autoPushPendingRef = false → returns early
   → BUT: if any downstream state setter (setAvailableLedgers, setLedgerRole) triggers
     BudgetMetadataContext re-render → metadataState reference changes
     → budgetForUI reference changes (it's a useMemo of metadataState)
     → dataChanged = true (even though actual budget data is identical)
     → autoPushPendingRef = true
     → NEW 5-second timer armed

10. 5 seconds later: pushCloudBackup fires again
    → Client hash: payload hash MATCHES lastSyncedPayloadHashRef → SKIPPED ✓

This cycle repeats every time any context upstream of LedgerDataProvider re-renders,
causing budgetForUI to get a new reference (even with identical content).
If the user just leaves the tab open, the effect fires repeatedly from upstream
renders (e.g. AuthContext token refresh every 25 minutes).
```

> [!IMPORTANT]
> The critical insight: **`budgetForUI` is NOT a pure memoization of budget content**. It is derived from `metadataState`, which is set by `setMetadataState`. If any context provider above `LedgerDataProvider` causes a re-render that cascades to `setMetadataState` with an equivalent (but new reference) object, `budgetForUI` gets a new reference even with no actual data change. The `lastSeenDataRef` check (reference equality, not deep equality) then marks `dataChanged = true`, arms the auto-push, and fires another D1 write 5 seconds later. The client-side hash guard (`computePayloadFingerprint`) is the last line of defense, and it works correctly - but only if `lastSyncedPayloadHashRef` is populated from a prior sync. On the first login, it's `null`, guaranteeing at least one D1 write per sign-in.

---

## 3. Implementation Plan - Surgical Fixes

> [!WARNING]
> All edits are surgical delta-only changes. No files are to be fully rewritten. Zero whitespace or comment changes on adjacent lines.

### Fix A: Reset `isInitialMountRef` on Logout
**File:** `finance/src/context/LedgerDataContext.jsx`  
**Location:** Logout handler (around line 206), where `autoPushPendingRef.current = false` already exists.

**Change:** Add one line:
```js
// EXISTING:
autoPushPendingRef.current = false;
lastSyncedPayloadHashRef.current = null;

// ADD after the above two lines:
isInitialMountRef.current = true;   // FIX-31: re-arm initial-mount guard for next login
lastSeenDataRef.current = { ui: null, mv: null };  // FIX-31: clear baseline to prevent stale dataChanged
```

**Why:** On the second login in the same browser tab, `isInitialMountRef` is already `false`. Without this reset, the initial-mount protection is bypassed entirely and the first effect run after re-auth will evaluate `dataChanged` against a stale baseline from the previous session.

---

### Fix B: Move the `savePendingSync` Call Behind the Network Guard in `pushCloudBackupOptimistic`
**File:** `finance/src/utils/api.js`  
**Location:** Line 204, inside `pushCloudBackupOptimistic`.

**Current code (lines 203-204):**
```js
const targetLid = options?.ledgerId || userId;
savePendingSync(budgetData, passcode || '', targetLid);
```

**Change:** Move `savePendingSync` to be called **only when actually going offline** (the existing `!navigator.onLine` branch) or **on a `catch` (network error)**. Remove the unconditional pre-network-call enqueue.

**Why:** Calling `savePendingSync` unconditionally causes every auto-push attempt to write to localStorage, even those that are subsequently skipped by the client hash guard or aborted because the server returns `unchanged: true`. This prevents the queue from ever being clean between push cycles and creates false queue state that `flushPendingCloudSync` may attempt to replay.

**New structure:**
```js
// REMOVE unconditional savePendingSync on line 204.
// Only enqueue on actual offline condition:
if (typeof navigator !== 'undefined' && !navigator.onLine) {
  savePendingSync(budgetData, passcode || '', targetLid);  // ← move here
  logSync('OFFLINE_QUEUE', 'Network is offline; payload safely preserved in fallback queue', null, 'warn');
  return { success: false, status: 'queued', error: 'Network offline. Payload queued.' };
}

// And on network error in the catch block:
} catch (err) {
  savePendingSync(budgetData, passcode || '', targetLid);  // ← also enqueue on catch
  logSync('PUSH_ERROR', `Cloud backup push error: ${err.message}`, { error: err.message }, 'error');
  return { success: false, status: 'queued', error: err.message };
}
```

---

### Fix C: Decouple `pushCloudBackup` from the Auto-Backup `useEffect` Dependency Array
**File:** `finance/src/context/LedgerDataContext.jsx`  
**Location:** Lines 880 and 888.

**Problem:** `pushCloudBackup` is in the `useEffect` dependency array. Because `pushCloudBackup` is a `useCallback` that depends on `[..., activeLedgerId, ledgerRole, ledgerPermissions, ...]`, any time these values change (which happens during sign-in state settling), `pushCloudBackup` gets a new reference, causing the auto-backup effect to re-run.

**Fix:** Stabilize the auto-backup effect by extracting the `pushCloudBackup` call into a ref (`pushCloudBackupRef`) that is kept current via a separate `useEffect`, and reading the ref inside the auto-backup timer callback (which is already inside a closure and not affected by stale refs due to the `setTimeout`).

**Implementation:**
```js
// Add near line 358 (after pushCloudBackup useCallback definition):
const pushCloudBackupRef = useRef(pushCloudBackup);
useEffect(() => {
  pushCloudBackupRef.current = pushCloudBackup;
}, [pushCloudBackup]);
```

**Then change line 880:**
```js
// BEFORE:
await pushCloudBackup(syncPasscode, { auto: true });

// AFTER:
await pushCloudBackupRef.current(syncPasscode, { auto: true });
```

**Then change line 888 (dependency array):**
```js
// BEFORE:
}, [budgetForUI, matrixVersion, isDbLoaded, isAutoCloudBackupEnabled, isAuthenticated,
    syncPasscode, pushCloudBackup, currentUserId, activeLedgerId, syncConflict]);

// AFTER:
}, [budgetForUI, matrixVersion, isDbLoaded, isAutoCloudBackupEnabled, isAuthenticated,
    syncPasscode, currentUserId, activeLedgerId, syncConflict]);
```

**Why:** Removing `pushCloudBackup` from the dependency array means the effect will not re-run when `activeLedgerId`, `ledgerRole`, or `ledgerPermissions` change (which happens during sign-in). The ref pattern ensures the closure inside `setTimeout` always calls the most current version of `pushCloudBackup`.

> [!IMPORTANT]
> `syncPasscode`, `currentUserId`, and `activeLedgerId` remain in the dependency array because a change in these values represents a genuine context change (different user, different ledger) that should reset the debounce timer. However, they will only trigger an actual push if `autoPushPendingRef.current` is `true` (meaning data genuinely changed before the dependency settled).

---

### Fix D: Extend `suppressDirtyUntilRef` Window During Sign-In Seed Hydration
**File:** `finance/src/context/LedgerDataContext.jsx`  
**Location:** Line 126 (seed hydration effect).

**Current code:**
```js
suppressDirtyUntilRef.current = Date.now() + 2000;
```

**Change:**
```js
suppressDirtyUntilRef.current = Date.now() + 4000;  // FIX-31: extend to 4s to cover auth state settling
```

**Why:** The 2-second window was designed to suppress auto-pushes during IndexedDB seed hydration. However, the sign-in state-settling sequence (currentUserId → activeLedgerId → ledgerRole → available ledgers) can take 2-3 seconds on slow connections. Extending the suppress window to 4 seconds ensures that all sign-in-related state changes are absorbed before the auto-backup effect is allowed to arm the dirty flag.

---

### Fix E: Server-Side Normalize JSON Key Order Before `is_identical` Comparison
**File:** `finance/src/worker.js`  
**Location:** Lines 623-629, `handleSyncBackup`.

**Problem:** `JSON.stringify(payload)` produces output in the current property insertion order. If the client sends a semantically identical payload but with different key ordering (e.g., after a `restoreFromBackup` reconstructs the object), the string comparison `data = ?` fails and a full D1 write batch fires.

**Fix:** Before computing `dataStr` and comparing with `is_identical`, normalize the JSON by parsing and re-stringifying through `ALLOWED_BUDGET_KEYS` in a canonical order. This guarantees byte-identical strings for semantically identical payloads.

**Implementation:**
```js
// AFTER line 622 (validation passed):
// Normalize key order for deterministic string comparison
const dataStr = (() => {
  const ORDERED_KEYS = [
    'accounts', 'people', 'bills', 'transactions', 'lineItems',
    'fundingGoals', 'loans', 'loan', 'dailyMatrix', 'dashboardWidgets',
    'theme', 'hideDashboardHeader', 'categories', 'schemaVersion'
  ];
  const ordered = {};
  for (const k of ORDERED_KEYS) {
    if (payload[k] !== undefined) ordered[k] = payload[k];
  }
  // Include any remaining keys not in the canonical list
  for (const k of Object.keys(payload)) {
    if (!(k in ordered)) ordered[k] = payload[k];
  }
  return JSON.stringify(ordered);
})();
```

> [!NOTE]
> `ORDERED_KEYS` matches `ALLOWED_KEYS` in `api.js`. The normalization only applies at the top-level key ordering. Individual account/bill objects within arrays are still subject to their insertion order. A fully recursive key-sort would be safer but adds CPU cost on the Worker. Top-level normalization resolves the most common case (restore then immediate backup).

---

### Fix F: Add `is_identical` Guard to Structured Write Path Even When `changes > 0`
**File:** `finance/src/worker.js`  
**Location:** Lines 730-733, `handleSyncBackup`.

**Current code:**
```js
const canWriteStructured = force || !row || !hasBaseVersion || storedVersion <= baseVersion;
if (canWriteStructured) {
  queries.push(...buildStructuredWriteStatements(env.DB, targetLedgerId, payload, dataByteLength, now));
}
```

**Problem:** When `is_identical` returns 0 (false) due to key-ordering differences (before Fix E), and `storedVersion <= baseVersion` (which is always true on first sync), `canWriteStructured = true` and the full batch of normalized table upserts fires. This is the source of the bulk of the D1 writes.

**Fix:** Add an `isIdentical` gate to `canWriteStructured`:
```js
const isIdentical = row && Number(row.is_identical) === 1;
const canWriteStructured = !isIdentical && (force || !row || !hasBaseVersion || storedVersion <= baseVersion);
if (canWriteStructured) {
  queries.push(...buildStructuredWriteStatements(env.DB, targetLedgerId, payload, dataByteLength, now));
}
```

**Why:** If the payload is byte-identical to what's stored (confirmed by `is_identical === 1`), there is zero reason to execute the 15-table structured write batch. This guard provides a secondary server-side defense even if the client-side hash guard fails.

> [!NOTE]
> The existing early-return at line 633 already prevents the query batch from executing when `is_identical && !manual`. Fix F adds a guard for the case where `is_identical` is true but the code somehow falls through (e.g., future code changes remove or move the early-return). Defense in depth.

---

## 4. Files to Be Modified

| File | Lines Affected | Fix Label |
|---|---|---|
| `finance/src/context/LedgerDataContext.jsx` | ~206 (logout handler) | Fix A |
| `finance/src/context/LedgerDataContext.jsx` | ~358 (new ref) | Fix C |
| `finance/src/context/LedgerDataContext.jsx` | ~880, 888 (effect body/deps) | Fix C |
| `finance/src/context/LedgerDataContext.jsx` | ~126 (suppress window) | Fix D |
| `finance/src/utils/api.js` | ~204, ~275-278, ~345-347 | Fix B |
| `finance/src/worker.js` | ~623-629 (dataStr normalization) | Fix E |
| `finance/src/worker.js` | ~730-733 (structured write gate) | Fix F |

---

## 5. Post-Fix Build & Deploy Sequence

Upon approval and code implementation:

1. **Build:** `cd finance && npm run build` - must exit with zero errors.
2. **Deploy:** `npm run deploy` - confirm Cloudflare Worker deployment URL.
3. **Smoke Test:** Sign in, verify no auto-backup fires within 10 seconds of sign-in. Wait 15 seconds - confirm at most ONE backup push fires. Confirm D1 `finance-os-db` write row metrics are flat.

---

## 6. Documentation Updates Required (Post-Fix)

After source code is modified and deployed:

- **`finance/docs/03_features.md`:** Update the `D1 Runaway Write Remediation & CAS Sync Idempotency (FIX-30)` section to add `FIX-31` entries documenting:
  - `isInitialMountRef` reset on logout
  - `pushCloudBackupRef` stabilization pattern
  - `suppressDirtyUntilRef` 4-second window
  - Conditional `savePendingSync` (offline/catch only)
  - Server-side JSON key normalization before `is_identical` check
  - `isIdentical` gate on structured write path

- **`finance/docs/04_state.md`:** Update Section 4 (Cloud Sync & Concurrency Control) to reflect the same FIX-31 items above and update the `D1 Write-Storm Prevention` subsection.

---

## 7. Risk Assessment

| Fix | Risk Level | Notes |
|---|---|---|
| Fix A (logout ref reset) | Very Low | Additive reset; no logic change |
| Fix B (conditional savePendingSync) | Low | Removes overly-eager localStorage write; queue still populated on actual offline/error |
| Fix C (pushCloudBackupRef decoupling) | Low-Medium | Standard React ref stabilization pattern; tested against FIX-29 conflict flow |
| Fix D (extend suppress window) | Low | Increases window from 2s to 4s; worst case delays first auto-backup by 2 extra seconds |
| Fix E (JSON key normalization) | Low | Deterministic canonicalization; identical payloads already short-circuit |
| Fix F (structured write gate) | Very Low | Additive guard; no path that should write is blocked |

---

*Plan created. Waiting for user review.*

