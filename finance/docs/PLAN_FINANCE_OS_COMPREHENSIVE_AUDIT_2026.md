# TechTrekGT Finance OS - Comprehensive Architecture, Security & Feature Audit Plan (2026)

> **Scope:** Read-only architectural, security, financial math, proxy/caching, and UX audit of `e:/TechTrekGT/finance` against canonical specifications (`e:/TechTrekGT/docs/04_state.md` and `finance/docs/01_identity.md` through `04_state.md`).
> **Status:** Plan ready for user review. Zero source, config, or existing documentation files were modified during this audit.

---

## 1. Executive Summary & Verification Baseline

Finance OS is a mature, local-first Cloudflare Workers + D1 + React 19 application with strong security foundations (WebCrypto HS256 JWTs, PBKDF2-SHA256 hashing, `HttpOnly; Secure; SameSite=Strict` cookies, CSRF protection, `toPublicUser` response filtering, Durable Object rate limiting, CSP nonces, and structured 23-table D1 decomposition).

However, the audit identified several high-severity defects across authentication, CAS/delta persistence consistency, financial precision/migrations, outbound fetch timeouts, edge session cache invalidation, and multi-user IndexedDB isolation, along with documentation drift and zero-dependency UX opportunities.

### Read-Only Baseline Check Results (Observed Before Planning)

| Command | Scope | Observed Result |
|---|---|---|
| `npm run check:serialization` | Response serialization security audit (`scripts/check-safe-serialization.js`) | **PASSED** (`toPublicUser` enforced; zero credential tokens leaked) |
| `npm run lint` | `npx eslint src` | **PASSED with warnings** (`0 errors, 213 warnings`, notably missing `useEffect`/`useCallback` deps in `App.jsx:299` and `LedgerDataContext.jsx:1189`, plus unused `ALLOWED_BUDGET_KEYS` import in `BudgetMetadataContext.jsx:23`) |
| `npm run test:unit` | Vitest v5.0.5 (`vitest run`) | **PASSED** (`14 test files, 91 tests passed`) - Note: `docs/04_state_4.md:113` still documents `10` suites |
| `npm test` | `check:serialization` + `node --test` suites | **527 / 528 PASSED, 1 FAILED** (`tests/crit-002-httponly-cookies.test.js:70` cross-repo assertion `wayfinder login must specify HttpOnly` failed looking at `../../wayfinder/functions/api/auth/login.js`) |

*Note on `npm run typecheck`: Skipped per workspace Pure JavaScript rule (`tsc` is disallowed on this React 19 JS/JSX project).*

---

## 2. Architecture & Directory Map vs. Canonical `docs/01-04`

### 2.1 Codebase Inventory (`finance/`)

- **Root Configuration & Schemas (16 files):** `wrangler.jsonc`, `package.json`, `vite.config.js`, `vitest.config.js`, `playwright.config.js`, `eslint.config.js`, `jsconfig.json`, `postcss.config.js`, `tailwind.config.js`, `index.html`, `finance-schema.sql`, `schema.sql`, `.dev.vars`, `.dev.vars.example`, `.env`, `package-lock.json`.
- **Frontend & Edge Entry (`src/`, 62 files recursive):**
  - Entry & Edge (`src/`): `main.jsx`, `App.jsx` (custom `pushState`/`popstate` router + `ErrorBoundary`), `worker.js` (Workers ESM entrypoint, CSP nonces, sync/auth/admin/share router), `RateLimiter.js` (Durable Object), `initialData.js`, `demoPresetData.js`, `index.css`.
  - Contexts (`src/context/`, 4 files): `AuthContext.jsx`, `BudgetContext.jsx`, `BudgetMetadataContext.jsx`, `LedgerDataContext.jsx`.
  - Web Worker (`src/workers/`, 1 file): `spreadsheet.worker.js`.
  - Migrations (`src/migrations/`, 1 file): `budgetMigrations.js` (V1 through V8).
  - Utilities (`src/utils/`, 15 files): `api.js`, `columnTooltipUtils.js`, `debugLogger.js`, `deltaQueue.js`, `errorCodes.js`, `formatters.js`, `importer.js`, `indexedDB.js`, `ledgerEngine.js`, `logger.js`, `networkError.js`, `paydayUtils.js`, `spreadsheet.js`, `spreadsheetParser.js`, `spreadsheetWorkerClient.js`.
  - Components (`src/components/`, 32 files recursive):
    - Core views & modals (21 direct): `AdminView.jsx`, `AmortizationView.jsx`, `AppLayout.jsx`, `AuthModal.jsx`, `AuthPage.jsx`, `BackupSyncView.jsx`, `AccountTransferSummary.jsx`, `ColumnHeaderHoverTooltip.jsx`, `DashboardView.jsx`, `DebugPayloadInspector.jsx`, `InlineEdit.jsx`, `InviteClaim.jsx`, `LandingPage.jsx`, `LedgerView.jsx`, `MainBudgetView.jsx`, `NoYearCalendarPicker.jsx`, `SettingsModal.jsx`, `SettingsView.jsx`, `ShareLedgerModal.jsx`, `SpreadsheetImporter.jsx`, `TurnstileWidget.jsx`.
    - Settings (`src/components/settings/`, 7 direct + 4 in `datasync/`): `AccountsPeoplePanel.jsx`, `BillEditorModal.jsx`, `BillsSplitsPanel.jsx`, `DashboardSettingsPanel.jsx`, `DataSyncPanel.jsx`, `DebugConsolePanel.jsx`, `SecuritySettingsPanel.jsx`, plus `datasync/`: `CloudSyncSubPanel.jsx`, `ImportExportSubPanel.jsx`, `StorageResetSubPanel.jsx`, `SyncQueueSubPanel.jsx`.
- **Cloudflare Functions Modules (`functions/`, 27 files recursive):**
  - `functions/api/auth/` (13 endpoints): `confirm-email-change.js`, `forgot-password.js`, `login.js`, `logout.js`, `me.js`, `refresh.js`, `register.js`, `resend-verification.js`, `reset-password.js`, `security-question.js`, `turnstile-config.js`, `update-profile.js`, `verify-email.js`.
  - `functions/api/admin/` (5 endpoints): `ledger-membership.js`, `stats.js`, `user-delete.js`, `user-status.js`, `user-verify.js`.
  - `functions/api/finance/` (1 endpoint): `ledger-shares.js`.
  - `functions/utils/` (8 modules): `auth.js`, `deleteAccount.js`, `errorCodes.js`, `guard.js`, `inviteEmail.js`, `ledgerAccess.js`, `rateLimit.js`, `structuredBudgetStore.js`.
- **Database Migrations (`migrations/`, 13 SQL files):** `0001_add_user_status.sql` through `0013_delta_sync_constraints.sql`.
- **Scripts (`scripts/`, 2 files):** `backfill-deep-normalization.mjs`, `check-safe-serialization.js`.
- **Tests (`tests/`, 80 files recursive) & Playwright (`e2e/`, 6 files recursive).**
- **Documentation (`docs/`, 16 files recursive):** Core `01_identity.md`, `02_arch.md`, `03_features.md`, `04_state.md`, plus parallel/historical docs `03_features_4.md`, `04_state_4.md`, `FINANCE_OS_AUDIT_AND_ACTION_PLAN.md`, `TEST_SUITE_IMPLEMENTATION_PLAN.md`, `TRANSACTIONS_GRID_INTERACTION_PLAN.md`, `plan-dedicated-finance-d1.md`, 4 `PLAN_*.md` files, and 2 files under `docs/incident/`.

### 2.2 Canonical Specification Drift

1. **Duplicate `_4.md` Canonical Files:** `docs/03_features_4.md` and `docs/04_state_4.md` exist alongside `docs/03_features.md` and `docs/04_state.md`, creating split documentation sources (e.g., `04_state_4.md:113` claims `10` Vitest suites while 14 exist).
2. **KV Binding Spec vs. `wrangler.jsonc` Reality:** `docs/04_state_4.md:72` documents KV-backed session caching in `auth.js` (`GATEWAY_KV` / `USER_CACHE` / `RATE_LIMIT_KV`), whereas `wrangler.jsonc:64-70` has `kv_namespaces` commented out and neither `GATEWAY_KV` nor `USER_CACHE` bound.
3. **Database Schema Sync Drift:** `schema.sql` omits `idx_finance_daily_matrix_ledger_field` (present in `finance-schema.sql` and `migrations/0013_delta_sync_constraints.sql`), and `finance_loans` columns diverge from `LOAN_KNOWN_KEYS` in `structuredBudgetStore.js`.
4. **Partially Stale Prior Action Plan:** `docs/FINANCE_OS_AUDIT_AND_ACTION_PLAN.md` still flags defects already fixed in code (`worker.js` already enforces `LIMIT 10` on `user_backup_versions`, `budgetMigrations.js:543` already removed `currentVersion = 8`, `AmortizationView.jsx` already uses `round2`, and `App.jsx`/`indexedDB.js` already hoisted `logState`).
5. **Worker Coupling to Frontend:** `BudgetMetadataContext.jsx:23` and `LedgerDataContext.jsx:17` import `ALLOWED_BUDGET_KEYS` directly from `../worker.js`.

---

## 3. Pillar 1: Edge Worker, Auth & D1 Persistence

| ID | Finding & Exact Location | Impact | Implementation Risk |
|---|---|---|---|
| **P1-1** | **Unauthenticated OTP Bypass & User Enumeration in `functions/api/auth/verify-email.js` (`lines 38-70`)** | **High** | **Low** |
| **P1-2** | **Non-Atomic CAS Split-Brain in `handleSyncBackup` & Unsynchronized `handleSyncDelta` (`src/worker.js:718-746, 816-849`)** | **High** | **Medium** |
| **P1-3** | **`LOAN_KNOWN_KEYS` Data Loss & Swallowed D1 Read Errors (`functions/utils/structuredBudgetStore.js:299-303, 679-692, 797-802`)** | **High** | **Low** |
| **P1-4** | **JWT Claim Bloat & Divergent Session Cookie Re-Issuance (`functions/utils/auth.js:772-780`, `update-profile.js:130-137`, `confirm-email-change.js:86-93`)** | **Medium** | **Low** |
| **P1-5** | **Unescaped HTML Interpolation in Password Reset Email (`functions/utils/auth.js:915`)** | **Medium** | **Low** |
| **P1-6** | **SQL String Interpolation in Offline D1 Backfill Script (`scripts/backfill-deep-normalization.mjs:81,94,103,111,128,146`)** | **Medium** | **Low** |

### Recommended Remediations

1. **P1-1 (`functions/api/auth/verify-email.js`):** Remove the early branch (`lines 56-68`) that calls `issueSession` / `sessionCookies` for already-verified emails without validating an 8-digit HMAC OTP or checking `targetUser.status`. Replace `'No account found for that email address.'` (`lines 51-53`) with a generic error for unauthenticated callers to stop user enumeration.
2. **P1-2 (`src/worker.js` `handleSyncBackup`, `handleSyncDelta` & `schema.sql`):**
   - Avoid pushing structured `DELETE`/`INSERT` queries into the same `env.DB.batch(queries)` where the `user_backups` CAS `ON CONFLICT ... WHERE` clause can fail (`changes === 0`). Execute and verify the CAS `user_backups` / `user_backup_versions` lock first (or append CAS guards / compensating rollback), then run `buildStructuredWriteStatements` only after winning CAS.
   - In `handleSyncDelta` (`lines 816-849`), advance `user_backups.updated_at_ms` and patch/invalidate `user_backups.data` (or compute ETag across both `user_backups.updated_at_ms` and max `finance_daily_matrix` timestamp) so `handleSyncRestore` (`lines 880-890`) never serves stale `304 Not Modified` responses or stale `409` `serverData`. Enforce strict regex/length validation on `mut.key` and `mut.strValue`. Add `idx_finance_daily_matrix_ledger_field` to `schema.sql`.
3. **P1-3 (`functions/utils/structuredBudgetStore.js`):**
   - Stop dropping `interestCompounding`, `paymentFrequency`, and `paymentType` during loan writes: either add columns to `finance_loans` via migration `0014` or remove those keys from `LOAN_KNOWN_KEYS` so they persist in `extra_json`.
   - Remove `.catch(() => ({ results: [] }))` (`lines 797-802`) in `readStructuredBudget` so transient D1 read errors fail loudly (`500`) instead of reconstructing truncated budgets.
   - Group/chunk bulk matrix/transaction inserts into multi-row prepared statements where safe within D1 bind limits.
4. **P1-4 (`functions/utils/auth.js`, `update-profile.js`, `confirm-email-change.js`):** Align `issueSession` with `e:/TechTrekGT/docs/04_state.md` by limiting JWT claims to `{ userId, exp, tv }` and reusing `issueSession` in `update-profile.js` and `confirm-email-change.js`.
5. **P1-5 (`functions/utils/auth.js`):** Escape `${securityQuestion}` in `sendResetEmail` (`line 915`) using a shared `escapeHtml` helper matching `functions/utils/inviteEmail.js:167`.
6. **P1-6 (`scripts/backfill-deep-normalization.mjs`):** Add strict ID format validation and single-quote SQL escaping before emitting SQL batch statements into temporary Wrangler execution files.

---

## 4. Pillar 2: Parsers, Ingestion & Financial Math

| ID | Finding & Exact Location | Impact | Implementation Risk |
|---|---|---|---|
| **P2-1** | **Hardcoded Household Fixtures (`hoa`, `jon`, `ronnie`) Destroying Matching User Ledgers in V7/V8 (`src/migrations/budgetMigrations.js:672-991`)** | **High** | **Medium** |
| **P2-2** | **Permissive Regex in `round2()`/`isValidMoney()` (`src/utils/formatters.js:14-55`) & Unrounded Parser Math (`src/utils/spreadsheetParser.js:816-1195`)** | **High** | **Low** |
| **P2-3** | **Header Column Shift & Bi-Weekly Cadence Mismatch in `importer.js` (`parseGenericFlat:181-189`, `matchCreditToEarner:817-974`)** | **High** | **Low** |
| **P2-4** | **Running Balance Algorithm Divergence (`src/utils/spreadsheet.js:851-1012` vs. `src/context/LedgerDataContext.jsx:1416-1509`)** | **High** | **Medium** |
| **P2-5** | **UI Floating-Point Drift & Duplicated Balance-Sync Handlers (`LedgerView.jsx`, `DashboardView.jsx`, `MainBudgetView.jsx`, `AccountsPeoplePanel.jsx`, `BillsSplitsPanel.jsx`)** | **Medium** | **Low** |
| **P2-6** | **SheetJS (`xlsx`) Bundled into Main Thread Despite Web Worker (`importer.js:8`, `spreadsheetParser.js:1`, `ImportExportSubPanel.jsx:14`, `budgetMigrations.js:8`)** | **Medium** | **Medium** |

### Recommended Remediations

1. **P2-1 (`src/migrations/budgetMigrations.js`):**
   - Remove automatic V7 `healHoaStartingBalanceAndLock` and V8 `healHoaBankStatementAndPurgeStaleRows` executions (`lines 672-991`) that purge user `transactions`/`dailyMatrix` and inject 43 hardcoded household transactions whenever an account contains `'hoa'` or earner names contain `'jon'`/`'ronnie'`. Move any recovery fixture to an explicit opt-in dev/recovery utility and align conflicting unit tests (`tests/fix-13-no-household-data.test.js` vs `tests/fix-23-*`).
   - Replace raw `Math.round(... * 100) / 100` (`line 241`) and unrounded `parseFloat` / `net1231` sums (`lines 294, 592, 619, 624`) with `round2()`.
2. **P2-2 (`src/utils/formatters.js` & `src/utils/spreadsheetParser.js`):**
   - Fix `round2` and `isValidMoney` (`formatters.js:14-55`) so malformed multi-dot/multi-minus strings (e.g., `"1.2.3"`, `"100-50"`) return `defaultVal`/`false`, and allow valid trailing/leading currency tags without silently returning `0` via `/[a-zA-Z]{2,}/`.
   - In `spreadsheetParser.js`: handle accounting parens and invalid numeric tokens via `round2` on `amount`, `debit`, `credit`, and `parsedBal` (`lines 901-912, 971`); normalize `parseRowDate` (`816`) before comparing `dFirst < dLast` (`858`); stop clobbering existing CSV categories with `'Income / Transfer'` (`942`) or hardcoding `'Insurance (Vehicle)'` rules (`962, 1140-1143`); use `round2`/`safeAdd`/`safeSub` on matrix `rRegBeg + rExtraBeg`, `rTotalEnd - rExtraEnd`, and overdraft `transfer` math (`1034-1078`).
3. **P2-3 (`src/utils/importer.js`):**
   - Stop filtering `h !== ''` inside `parseGenericFlat` (`lines 181-189`) so row cell indices `r[i]` never misalign with columns after blank headers.
   - Inside `matchCreditToEarner`: compute `getBillCost` (`817-821`) and `calcMonthlyPortion` (`903-907`) with `round2()`, and replace `* 2` bi-weekly multipliers in Tiers 2 & 4 (`871, 967`) with consistent `26 / 12` (inverse `12 / 26`) math matching Tier 3 (`934`).
4. **P2-4 (`src/utils/spreadsheet.js` & `src/context/LedgerDataContext.jsx`):**
   - Consolidate `getLedgerRunningBalanceAsOfDate` (`spreadsheet.js:851-1012`) and `getCalculatedBalanceAsOf` (`LedgerDataContext.jsx:1416-1509`) into one canonical `ledgerEngine.js` simulation helper so fallback start date (`'2026-01-01'`), `!b.isArchived` filtering, `lineItems` (`actualAmount`) overrides, bounded date-iteration limits, and backward pre-start reconciliation match identically across importer checks and live ledger balances.
5. **P2-5 (`LedgerView.jsx`, `DashboardView.jsx`, `MainBudgetView.jsx`, `AccountsPeoplePanel.jsx`, `BillsSplitsPanel.jsx`):**
   - Extract starting-balance + `importedLedgerRows` + `dailyMatrix` delta synchronization into a single context helper so `AccountsPeoplePanel.handleAccountTotalBalanceChange` (`lines 97-150`) stops drifting from `LedgerView.handleStartBalanceCommit` (`lines 715-774`).
   - Replace raw `parseFloat` / `Math.round` / unrounded division (`MainBudgetView.jsx:78, 124, 235`, `DashboardView.jsx:387, 396-397, 1015, 1056, 1059, 1065, 1084`, `LedgerView.jsx:764, 769, 1079, 1109-1123, 1448`, `BillsSplitsPanel.jsx:154`) with `round2()`, `safeAdd()`, `safeMul()`, and shared `fmtMoney()`.
6. **P2-6 (SheetJS Main-Bundle Separation):** Split pure utilities (`findMatchingBill`, `matchCreditToEarner`, `normalizeIsoDate`, mapping definitions) into `src/utils/importerHelpers.js` so `budgetMigrations.js` and tooltips stop pulling `xlsx` into the main bundle. Convert `spreadsheetWorkerClient.js` main-thread fallbacks and `ImportExportSubPanel.handleExportExcel` (`line 55`) to lazy `import('xlsx')` / worker messaging.

---

## 5. Pillar 3: External Proxies, Caching & Timeout Guards

*External API Scope Verification: Full-codebase grep confirmed zero external FX or market-data API endpoints or proxies exist in `finance/`. All outbound network calls go to Resend (`https://api.resend.com/emails`), Cloudflare Turnstile (`https://challenges.cloudflare.com/turnstile/v0/siteverify` and client loader `https://challenges.cloudflare.com/turnstile/v0/api.js`), and internal Durable Object RPC (`stub.fetch`).*

| ID | Finding & Exact Location | Impact | Implementation Risk |
|---|---|---|---|
| **P3-1** | **Zero `AbortSignal.timeout()` Guards on Outbound `fetch()` & Durable Object RPC (`functions/utils/auth.js:851,1068`, `inviteEmail.js:104`, `rateLimit.js:18`)** | **High** | **Low** |
| **P3-2** | **Unconfigured KV Binding Forces PoP-Local Session Caching & Cross-PoP Stale Auth (`functions/utils/auth.js:568-657`, `wrangler.jsonc:64-70`)** | **High** | **Low** |
| **P3-3** | **Turnstile Client Loader Lacks `onerror` Handling & Invite Registration Skips Turnstile (`src/components/TurnstileWidget.jsx:55`, `InviteClaim.jsx:145`)** | **Medium** | **Low** |

### Recommended Remediations

1. **P3-1 (`auth.js`, `inviteEmail.js`, `rateLimit.js`):** Add explicit `signal: AbortSignal.timeout(...)` on Resend API POSTs (8,000ms), Turnstile `siteverify` POST (5,000ms), and RateLimiter DO `stub.fetch('https://rl/check', ...)` (2,000ms, preserving fail-closed catch behavior).
2. **P3-2 (`wrangler.jsonc`, `functions/utils/auth.js`):** Provision and bind `USER_CACHE` KV in `wrangler.jsonc` so `invalidateCachedUser` propagates session revocations (`token_version` bumps, suspensions, password resets) globally across Cloudflare PoPs instead of relying on PoP-scoped `caches.default` and isolate-local `memoryUserCache` (`60s` exposure window). Remove `public` cache header semantics from `setCachedUser` (`auth.js:624`) or reduce fallback TTL when KV is absent.
3. **P3-3 (`TurnstileWidget.jsx`, `InviteClaim.jsx`):** Attach `script.onerror` and surface a retryable error banner when Turnstile fails to initialize; mount `<TurnstileWidget />` in `InviteClaim.jsx` account creation.

---

## 6. Pillar 4: Frontend State, Routing & UX Pipeline

| ID | Finding & Exact Location | Impact | Implementation Risk |
|---|---|---|---|
| **P4-1** | **Infinite Loading Spinner Deadlock on Empty IndexedDB (`BudgetMetadataContext.jsx:289-299`, `LedgerDataContext.jsx:740`, `AppLayout.jsx:467-474`)** | **High** | **Low** |
| **P4-2** | **IndexedDB Multi-User Wipe (`store.clear()`), Connection Leaks & `switchLedger` Corruptions (`indexedDB.js:46,118,155-178`, `LedgerDataContext.jsx:54-56,606-632,762`, `App.jsx:67`)** | **High** | **Medium** |
| **P4-3** | **Delta Queue Reordering (`upsert -> delete`), Infinite 4xx Retries & Listener Leaks (`deltaQueue.js:34-138`, `LedgerDataContext.jsx:224-226`)** | **High** | **Low** |
| **P4-4** | **Logout CSRF Order, `403` Suspension Desync, `isAdmin` vs `role` Mismatch & SPA History Drift (`AuthContext.jsx:58,110,385-402`, `api.js:81-88`, `App.jsx`, `AppLayout.jsx`, `InviteClaim.jsx`)** | **High** | **Low** |
| **P4-5** | **Missing UI & Context Read-Only Viewer Enforcement + Cascading Delete Orphans (`BudgetMetadataContext.jsx:436,480,591`, `LedgerDataContext.jsx`, Views & Modals)** | **High** | **Medium** |
| **P4-6** | **Shared Schema Constant Imported From Worker (`BudgetMetadataContext.jsx:23`, `LedgerDataContext.jsx:17`, `src/worker.js:261`)** | **Medium** | **Low** |
| **P4-7** | **Stale Local-Only Copy (`LandingPage.jsx:49,59,73`) & Unvalidated JSON Import (`ImportExportSubPanel.jsx:38-53`)** | **Low** | **Low** |
| **P4-8** | **Zero-Dependency UI/UX Enhancements: Shortcuts, Matrix Windowing, Client Filtering & ETag Caching** | **Medium** | **Low** |

### Recommended Remediations

1. **P4-1 (Empty IndexedDB Recovery):** Do not block authenticated auto-restore on `isDbLoaded` when IndexedDB has no prior record for `currentUserId`; expose `dbLoadError` in `AppLayout.jsx:467-474` with explicit **"Pull from Cloud"** and **"Reset Local Database"** actions.
2. **P4-2 (`indexedDB.js` & `LedgerDataContext.jsx` `switchLedger`):**
   - Scope IndexedDB storage keys to `(userId, ledgerId)` (`budget:<userId>:<ledgerId>`), replace `store.clear()` (`indexedDB.js:162`) with single-key delete, avoid mutating caller `budgetData.owner_id` in place (`118, 155`), and reuse/close a cached `IDBDatabase` connection (`onversionchange`) so `deleteDatabase` (`App.jsx:67`) is never blocked.
   - In `switchLedger` (`LedgerDataContext.jsx:606-632`), use an `AbortController` to cancel superseded switches, fetch shared ledger data *before* flipping `activeLedgerId`, fail cleanly on non-OK HTTP responses without pairing old data to the new ID, and pass `activeLedgerId` (`sessionStorage.finance_active_ledger_id`) consistently on initial mount restore (`line 762`).
3. **P4-3 (`deltaQueue.js` & `LedgerDataContext.jsx`):**
   - Key the delta `Map` purely by `(ledgerId, key)` (not `op`) so last-write-wins ordering handles `upsert -> delete -> upsert` cleanly without replaying stale deletes.
   - Drop permanent `4xx` errors (`400`/`403`/`404`) from `pendingOps` with a user-facing notification instead of infinitely re-enqueuing `snapshot`; retain retries only for network errors, `409`, `429`, and `5xx`.
   - Return cleanup (`removeEventListener`) from the `[activeLedgerId, currentUserId]` listener registration effect (`LedgerDataContext.jsx:224-226`).
4. **P4-4 (`AuthContext.jsx`, `api.js`, `App.jsx`, `AppLayout.jsx`, `InviteClaim.jsx`):**
   - Move `setCsrfToken(null)` and local auth wipe inside `finally` *after* `await apiFetch('/api/auth/logout')` (`AuthContext.jsx:392-398`); fix stale `logout` closure in inactivity timer (`110`); replace raw `window.history.pushState` in `handleSessionExpired` (`58`) with a shared router navigation callback that updates `App.jsx` React `pathname` state; emit `techtrek:session-expired` in `api.js:81-88` on `403` `ACCOUNT_SUSPENDED`.
   - Align Admin UI gating in `App.jsx:243` and `AppLayout.jsx:163` (`user?.role === 'admin' || Boolean(user?.isAdmin)`) with `functions/api/admin/stats.js:16`.
   - Fix `InviteClaim.jsx` (`145` extra 8th arg to `register()`, `119` refresh `availableLedgers` & `switchLedger` after claim, `42` clear invalid `finance_pending_invite` tokens), mount `<AuthProvider>` at top-level `App` (`327`), and add an explicit not-found view in `getViewFromPathname` (`121-131`).
5. **P4-5 (Read-Only Viewer Guards, `addLoan` ID & Cascading Deletes):**
   - Enforce `ledgerRole === 'viewer' || !ledgerPermissions.edit` inside `BudgetMetadataContext` setters and all remaining `LedgerDataContext` mutators (`upsertLineItem`, `clearFutureMatrixCredits`, `pruneGhostMatrixDayKeys`, `clearAccountTransactions`, `importSpreadsheetSelective`, `restoreFromBackup`), and disable/hide mutating controls in `LedgerView`, `DashboardView.handleAssignBill`, `AmortizationView`, `MainBudgetView`, `SpreadsheetImporter`, and `Settings` subpanels.
   - Return the created loan ID from `BudgetMetadataContext.addLoan` (`line 591`) so `AmortizationView.jsx:302-318` never desynchronizes `activeLoanId`.
   - Clean up orphaned IDs in `fundingGoals`, `loans`, `saveExtraSplits`, `overflowSplits`, and `dailyMatrix` inside `deleteAccount` (`436`) and `deletePerson` (`480`).
6. **P4-6 (Shared Constants Module):** Extract `ALLOWED_BUDGET_KEYS` from `src/worker.js:261` into `src/utils/budgetSchema.js` and update `worker.js`, `BudgetMetadataContext.jsx:23`, and `LedgerDataContext.jsx:17`.
7. **P4-7 (`LandingPage.jsx` & `ImportExportSubPanel.jsx`):** Update stale local-only copy (`LandingPage.jsx:49,59,73`) and validate imported JSON backups against `ALLOWED_BUDGET_KEYS` + explicit confirmation prompt in `ImportExportSubPanel.handleLoadBackupFile` (`38-53`).
8. **P4-8 (High-Value Zero-Dependency UI/UX Improvements):**
   - **Keyboard Shortcuts & Modal Accessibility:** Add `Escape` close + focus restoration to `SettingsModal.jsx`, `ShareLedgerModal.jsx`, and `AuthModal.jsx`; add grid cell `Tab`/Arrow navigation and `Ctrl/Cmd+J` (or `T`) "Jump to Today" in `LedgerView.jsx`.
   - **Matrix Windowing & Dashboard Memoization:** Window `monthGroups` rendering in `LedgerView.jsx:1864-1895` (render active month +/- 1-2 months or viewport-windowed `<tbody>` chunks instead of keeping multi-year 365+ rows mounted simultaneously while scrolling up to 2050); wrap `DashboardView.jsx` `case 'split_pairings':` (`912-1091`) in `useMemo`; add full-term pagination/year filter to `AmortizationView.jsx:681` (currently capped at `.slice(0, 36)`).
   - **Client-Side Filtering & ETag Caching:** Add instant text/status filters (deficit days, locked days, payee/bill search) in `LedgerView.jsx` and `BillsSplitsPanel.jsx`; store `/api/sync/restore` & `/api/sync/versions` ETags in `api.js` / `LedgerDataContext` to leverage server `304 Not Modified` responses (`worker.js:883, 956`) and avoid redundant IndexedDB serialization.

---

## 7. Phased Remediation Roadmap

1. **Phase 1 - Security & Persistence Integrity (`Low` Risk, `High` Impact):**
   - Patch `verify-email.js` OTP/status bypass (`P1-1`), add `AbortSignal.timeout()` wrappers (`P3-1`), escape HTML in `sendResetEmail` (`P1-5`), provision `USER_CACHE` KV in `wrangler.jsonc` (`P3-2`), harden `round2()`/`isValidMoney()` (`P2-2`), fix `deltaQueue.js` dedup key & 4xx drop + listener cleanup (`P4-3`), and align `AuthContext`/`apiFetch`/`Admin` gates (`P4-4`).
2. **Phase 2 - Sync CAS, D1 Schema & Math Unification (`Medium` Risk, `High` Impact):**
   - Make `handleSyncBackup` structured writes strictly post-CAS and synchronize `handleSyncDelta` ETag/versioning (`P1-2`); fix `LOAN_KNOWN_KEYS` and `readStructuredBudget` error propagation (`P1-3`); unify running balance calculation in `ledgerEngine.js` (`P2-4`); fix `importer.js` blank headers & bi-weekly math (`P2-3`); isolate V7/V8 `hoa` migrations from normal schema upgrades (`P2-1`).
3. **Phase 3 - Multi-User IndexedDB Isolation, Viewer Enforcement & Bundle Optimization (`Medium` Risk):**
   - Scope IndexedDB by `(userId, ledgerId)` + fix `switchLedger` race/abort handling (`P4-2`) + empty-IDB recovery banner (`P4-1`); enforce `ledgerPermissions.edit` across `BudgetMetadataContext` and UI panels (`P4-5`); extract `budgetSchema.js` and decouple `xlsx` onto `spreadsheet.worker.js` / dynamic `import('xlsx')` (`P2-6`, `P4-6`).
4. **Phase 4 - Zero-Dependency UX & Documentation Sync (`Low` Risk, `Medium` Impact):**
   - Implement `LedgerView` month windowing, modal `Escape`/grid shortcuts, `AmortizationView` full-schedule pagination, client-side ETag `304` caching, and `LandingPage` copy fix (`P4-7`, `P4-8`).
   - Consolidate `docs/03_features_4.md` / `04_state_4.md` into canonical `docs/01-04` and update `schema.sql` and test suite counts.

### Verification Plan (After User Approves Implementation)
1. Re-run `npm run check:serialization`, `npm run lint` (drive warnings toward 0, 0 errors), `npm run test:unit` (add unit tests for `verify-email.js`, `round2("1.2.3")`, `parseGenericFlat` blank headers, `deltaQueue` `upsert -> delete -> upsert`, and `LOAN_KNOWN_KEYS` round-trip), and `npm test` (also inspect cross-repo `wayfinder` failure in `tests/crit-002-httponly-cookies.test.js:70`).
2. Verify Playwright E2E flows (`e2e/session-security.spec.js`, `e2e/network-resilience.spec.js`, `e2e/importer-lifecycle.spec.js`, `e2e/ui-reachability.spec.js`).
3. Execute `npm run build` and `npm run deploy` inside `e:/TechTrekGT/finance` upon user-approved implementation per workspace deployment loop rules.

