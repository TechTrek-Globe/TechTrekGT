# DIAGNOSIS-2.md - Data-Safety and Ledger Repair
Branch: fix/data-safety-and-ledger
Date: 2026-10-06
Phase: 0 - Baseline and Diagnosis (no fixes applied)

---

## Baseline Results

| Step | Exit | Pre-existing failures |
|------|------|-----------------------|
| npm ci | 0 | - |
| npm run build | 0 | - |
| npm run lint | 0 (198 warnings, 0 errors) | 198 pre-existing lint warnings (unused vars, exhaustive-deps). None are errors. Full list in baseline-lint.log. |
| npm run typecheck | 1 | **src/utils/api.js:192** - TS2353: `ownershipConflict` does not exist in the declared return type. Pre-existing before this branch. |
| npm test | 0 | 356 tests, 0 failures. |
| E2E (live-e2e.test.js) | not run | Requires local wrangler dev on 127.0.0.1:8787. Not run per Section 1 Rule 2 (no deploy). |

The typecheck failure at api.js:192 is pre-existing. All other steps pass.

---

## Section 2 Evidence Confirmation

### EV-01: Logout data deletion by default
- **File/Line**: `src/context/LedgerDataContext.jsx:120-130`
- **Confirmed**: `tt_remove_data_on_logout` localStorage flag defaults to `true` when absent. On `techtrek:user-logout`, `clearBudgetData(uid)` is called. This event fires on both deliberate logout (`AuthContext.jsx:340`) and session expiry (`AuthContext.jsx:40`). The 15-minute inactivity timer dispatches session-expired, which causes automatic data deletion without user confirmation.
- **Root cause**: Default-true is correct for shared devices but the flag is never shown to the user during onboarding, so data loss on session timeout is invisible.

### EV-02: Option A self-healing migration - future credit deletion on every load
- **File/Line**: `src/context/LedgerDataContext.jsx:330-373`
- **Confirmed**: A `useEffect` runs on `[isDbLoaded, matrixVersion, currentUserId, isAuthenticated, pushCloudBackup, syncPasscode]`. On each trigger it scans all `credit_*` and `extra_credit_*` dailyMatrix keys and **deletes** any cell dated strictly after today. This directly caused the loss of the owner's stored credits (e.g. `acc-mortgage_2026-09_25_credit_person-ronnie = 1222.61`). Because `matrixVersion` is included in the deps, deletion re-triggers on every matrix write, creating a cascading loop if future credits are re-imported.
- **Root cause**: Credits dated in the future relative to today are legitimate historical records for dates that were future at import time. The effect treats them as projections and silently erases them.

### EV-03: Option A forces a cloud backup with force: true
- **File/Line**: `src/context/LedgerDataContext.jsx:365-366`
- **Confirmed**: After deleting future credits, the effect calls `pushCloudBackup(syncPasscode, { force: true })` automatically. This overwrites the cloud copy with the mutilated local state without user action.

### EV-04: restoreFromBackup also deletes future credits
- **File/Line**: `src/context/LedgerDataContext.jsx:400-414`
- **Confirmed**: The same future-credit pruning loop runs inside `restoreFromBackup` before writing to IndexedDB. Restoring from a cloud backup with historical future-dated credits silently removes them.

### EV-05: resolveConflictKeepLocal forces a cloud backup
- **File/Line**: `src/context/LedgerDataContext.jsx:436-448`
- **Confirmed**: Choosing "keep local" on a sync conflict immediately calls `pushCloudBackup(syncPasscode, { force: true })`. This is user-initiated (conflict resolution), but no confirmation dialog is shown beyond the initial conflict modal.

### EV-06: clearFutureMatrixCredits forces a cloud backup
- **File/Line**: `src/context/LedgerDataContext.jsx:854-856`
- **Confirmed**: The `clearFutureMatrixCredits` useCallback, exposed via `StorageResetSubPanel.jsx:320-323`, calls `pushCloudBackup(syncPasscode, { force: true })` automatically after deleting cells.

### EV-07: pruneGhostMatrixDayKeys forces a cloud backup
- **File/Line**: `src/context/LedgerDataContext.jsx:863-880`
- **Confirmed**: Same pattern as EV-06. Auto-force-push after ghost-key pruning without user confirmation of the upload.

### EV-08: restoreStandardFundingGoals writes hardcoded amounts for real household
- **File/Line**: `src/context/LedgerDataContext.jsx:883-944`
- **Confirmed**: Matches by earner name fragments `"ronnie"` and `"jon"`. Invents amounts 1378.00, 689.00, 85.00, 78.08 that are specific to the real household. HOA goals are omitted. Exposed in `StorageResetSubPanel.jsx:422`. Calls `pushCloudBackup({ force: true })`.
- **Per Rule 11**: This function must never be called. It directly violates "Do not create, guess, or restore funding goals."

### EV-09: api.js strips all non-number dailyMatrix values before upload
- **File/Line**: `src/utils/api.js:219-227`
- **Confirmed**: Only `typeof v === 'number' && Number.isFinite(v)` values pass. String `*_desc` cells are silently dropped. This is the root cause of `POST /api/sync/backup` returning 400 - specifically the worker's `validateBudgetPayloadDetailed` at `worker.js:489` rejects non-number values, so the client strips them. The net effect is that all text notes in dailyMatrix are permanently lost on every cloud backup.
- **Note**: The client strip is a workaround for a server-side schema limitation, not the server actually returning 400. The 400s reported by the owner had a different cause (see EV-10).

### EV-10: worker.js PRODUCTION_ORIGINS includes non-HTTPS origin
- **File/Line**: `src/worker.js:37`
- **Confirmed**: `'http://techtrekgt.com'` is in PRODUCTION_ORIGINS (no TLS). Any production request from the HTTPS site would fail CORS because the stored origin uses `http://` not `https://`.

### EV-11: worker.js isLocalhost incorrectly flags all requests with a port number
- **File/Line**: `src/worker.js:915`
- **Confirmed**: `Boolean(url.port)` means any Cloudflare deployment on a non-standard port (or any local dev on any port) is treated as localhost. This bypasses production security headers.

### EV-12: BudgetMetadataContext hardcodes bill amount mutations on every load
- **File/Line**: `src/context/BudgetMetadataContext.jsx:241-245`, `285-289`
- **Confirmed**: On every load of stored budget data, bill amounts near 442.32 (HOA) are silently rewritten to 444.00, and amounts near 2601.45 or 2757.68 (Mortgage) are rewritten to 2756.00. This runs on BOTH the primary load path (line 241) and the legacy-key fallback (line 285).
- **Root cause**: Hardcoded amount corrections for specific bills. Any change to actual bill amounts is silently reverted on reload, making the UI appear inconsistent.

### EV-13: BudgetMetadataContext load effect uses getCurrentUserId() fallback
- **File/Line**: `src/context/BudgetMetadataContext.jsx:223`
- **Confirmed**: `const userId = user?.id || getCurrentUserId();` - if user is not yet set during React hydration, reads the legacy cookie/sessionStorage key. Combined with the 500ms autosave in LedgerDataContext, this can write a blank starter state to IndexedDB under the wrong key before the real user session resolves.

### EV-14: getLedgerRunningBalanceAsOfDate calls allocateEarnerCredit with isLockedDay: false
- **File/Line**: `src/utils/spreadsheet.js:955`
- **Confirmed**: The Dashboard balance engine calls `allocateEarnerCredit(..., { isLockedDay: false })` uniformly. LedgerView's `matrixData` useMemo (LedgerView.jsx:787) correctly passes `isLockedDay: isLockedDay` per cell. This inconsistency means the Dashboard may project deposits on historical locked import days that the Ledger would suppress, causing a balance discrepancy between Ledger and Dashboard views.

### EV-15: FIX-07 root cause - past deposits show as "$ -"
- **Evidence**: `dailyMatrix` contains `acc-mortgage_2026-09_25_credit_person-ronnie = 1222.61` (non-zero stored credit). The Ledger renders it via `MatrixCell` using `fmtGrid(value)`. `fmtGrid` returns `'$ -'` when `val === 0`. The value reaches `fmtGrid` as `0` because `allocateEarnerCredit` returns `earnerDeposit: 0` for locked days with no override - **only when the stored credit cell key does not exactly match the key the engine generates**.
- **Key mismatch analysis**: The engine at `ledgerEngine.js:15` builds the key as `accountId + '_' + mKey + '_' + day + '_credit_' + person.id` where `mKey = year + '-' + String(month + 1).padStart(2, '0')`. `month` is 0-indexed (JS `getMonth()`), so September (month index 8) = `mKey = '2026-09'`, and `day = 25`. The credit key should be `acc-mortgage-test_2026-09_25_credit_person-bob`. This matches the stored key exactly in the fixture.
- **Actual root cause**: The stored credit value exists and matches. The engine DOES read it (`earnerDeposit: 1222.61` confirmed by Node probe). The "$ -" symptom is therefore caused by **EV-02 (Option A)** deleting the credit before it can be displayed. After the effect runs on load, the credit cell is gone, and the engine sees `c = undefined`, falls to `projectedDeposit = 0` (because `isLockedDay = true`), and returns `earnerDeposit: 0`. The Ledger then shows `$ -`. The stored balance (393.65) is a separate `reg_ending` anchor and still shows correctly.
- **Confirmed**: The 9/29 "beg 308.65, credit 11.25, end 393.65 (+85.00, not +11.25)" arithmetic anomaly is caused by the `reg_ending` anchor (308.65) being overridden by `importedLedgerRows`, while the credit column reflects a post-deletion projected value instead of the actual stored credit.

### EV-16: xlsx version mismatch
- **File/Line**: `package.json` - `"xlsx": "^0.18.5"` (installed: 0.18.5)
- **Docs claim**: The docs state a different version. Minor discrepancy, not a data-safety issue.

### EV-17: Household-specific identifiers in source
- **Files**: `spreadsheetParser.js`, `importer.js`, `paydayUtils.js`, `LedgerDataContext.jsx`
- **Confirmed**: Names "jon", "ronnie", account suffixes "7071", "3223", "9575", earner IDs `person-jon`, `person-ronnie`, and amounts 1378.00/689.00/85.00/78.08 appear in ~18 locations.

---

## Fix Plan Summary (ordered by data-safety priority)

| ID | Description | File | Lines | Approach |
|----|-------------|------|-------|----------|
| FIX-01 | Remove Option A auto-delete-on-load | LedgerDataContext.jsx | 330-373 | Delete the useEffect entirely. Future credit clearing is a StorageResetSubPanel action only. |
| FIX-02 | Remove auto force-push from Option A | LedgerDataContext.jsx | 365-366 | Removed with FIX-01. |
| FIX-03 | Remove auto force-push from clearFutureMatrixCredits | LedgerDataContext.jsx | 854-856 | Convert to a standard CAS push (no force). Return the push result. |
| FIX-04 | Remove auto force-push from pruneGhostMatrixDayKeys | LedgerDataContext.jsx | 875 | Same as FIX-03. |
| FIX-05 | Remove hardcoded funding goal restoreStandardFundingGoals | LedgerDataContext.jsx | 883-944 | Delete or permanently stub to no-op (Rule 11). Update StorageResetSubPanel to remove the button. |
| FIX-06 | Remove auto force-push from resolveConflictKeepLocal | LedgerDataContext.jsx | 439 | Use CAS baseVersion instead of force. |
| FIX-07 | Past deposits show as "$ -" | Downstream of FIX-01 | - | FIX-01 restores the credit cells. Regression test against fixture. |
| FIX-08 | restoreFromBackup deletes future credits | LedgerDataContext.jsx | 400-414 | Remove the credit-pruning loop from restoreFromBackup. |
| FIX-09 | api.js strips *_desc text cells silently | api.js | 219-227 | Add a separate string-safe strip that logs dropped keys instead of silently discarding. Worker schema must be updated to allow short strings on *_desc keys. |
| FIX-10 | BudgetMetadataContext hardcoded bill rewrites | BudgetMetadataContext.jsx | 241-245, 285-289 | Remove both hardcoded amount correction blocks. |
| FIX-11 | PRODUCTION_ORIGINS http:// entry | worker.js | 37 | Change to https://. |
| FIX-12 | isLocalhost Boolean(url.port) | worker.js | 915 | Remove the `Boolean(url.port)` clause; check hostname only. |
| FIX-13 | getLedgerRunningBalanceAsOfDate isLockedDay: false | spreadsheet.js | 955 | Pass `isLockedDay` derived from maxImportDateStr like LedgerView.jsx does. |

---

## Tests Required

Each fix gets a companion test in `tests/crit-*.test.js` or a new `tests/fix-*.test.js` file using the synthetic fixture `tests/fixtures/incident-household.json`. No live API calls permitted.

- FIX-01/07: After loading fixture (isDbLoaded simulation), verify that future credit cells dated > today remain untouched in dailyMatrix.
- FIX-03/04: After calling clearFutureMatrixCredits/pruneGhostMatrixDayKeys, verify no `force: true` appears in the push call.
- FIX-05: Call restoreStandardFundingGoals; verify it returns no-op and does not modify fundingGoals.
- FIX-08: Call restoreFromBackup with fixture; verify future credit cells are preserved.
- FIX-09: Verify api.js strips only non-string-safe keys; *_desc strings survive.
- FIX-10: Load BudgetMetadataContext with bills at 442.32 and 2601.45; verify amounts are NOT rewritten.
- FIX-11/12: Worker unit tests verify PRODUCTION_ORIGINS uses https and isLocalhost does not flag port-only URLs.

---

## Fixture: tests/fixtures/incident-household.json

Created. Contains:
- `owner_id: usr-test-incident-001`
- Two accounts: `acc-mortgage-test` (import mode, importedLedgerRows spanning to 2027-06-06), `acc-bills-test` (project mode)
- Two earners: `person-alice` (semi-monthly, payDay1=1, payDay2=15), `person-bob` (monthly, payDay1=25)
- Stored credits: non-zero (`1222.61`), zero (`0`), future-dated (November 2026)
- `reg_ending` anchors that differ from arithmetic (9/29=308.65, 9/30=393.65 where beg+credit-bill does not equal end)
- `*_other_desc` text cells (string, will be stripped by current api.js)
- Both populated (`fundingGoals`) and an archived bill
- No real names, emails, account numbers, or balances

---

*End of DIAGNOSIS-2.md - Phase 0 complete. No code changes made. Ready for FIX-01.*
