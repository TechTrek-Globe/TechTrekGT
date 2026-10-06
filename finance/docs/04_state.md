# Finance OS - State Management & Persistence Architecture

## 1. Overview & Context

Finance OS uses an offline-first state architecture with cloud synchronization. Client state lives in React Contexts backed by IndexedDB, while the cloud backend uses Cloudflare D1 (SQLite) with optimistic concurrency control (Compare-And-Swap) and version history.

## 2. Client-Side State Hierarchy

State is partitioned into four primary layers in the component tree:

```
<AuthProvider>
  └── <BudgetMetadataProvider>
        └── <LedgerDataProvider>
              └── <MainContent />
```

- **`AuthProvider` (`src/context/AuthContext.jsx`):** Manages user session state, authentication claims, and CSRF tokens. Backed by HttpOnly `SameSite=Strict` cookies (`auth_token` and `csrf_token`).
- **`BudgetMetadataProvider` (`src/context/BudgetMetadataContext.jsx`):** Manages accounts, people/earners, bills, funding goals, loans, and categories.
- **`LedgerDataProvider` (`src/context/LedgerDataContext.jsx`):** Manages historical transactions, imported ledger rows, daily matrix balances, and cash-flow projections. `dailyMatrixRef.current` is synchronized on render to prevent stale matrix reads following database seeding.
- **`useBudget()` hook:** Composes metadata and ledger data via memoization for consumer components.
- **Daily Matrix & Credit Resolution:** `allocateEarnerCredit` supports both account-specific resolution and multi-account aggregation for 'all' accounts view, ensuring stored non-zero credits display their exact values while stored zeros display "$ -".
- **Ending Balance Calculation & Bank Variance Invariant (FIX-08):** In `matrixData`, `getCalculatedBalanceAsOf`, and `getLedgerRunningBalanceAsOfDate`, ending balances strictly follow `ending = round2(beginning + credits - bills + other)` every day without replacement from stored bank ending values (`reg_ending`, `extra_ending`, `importedLedgerRows`). Stored values are preserved for statement variance checks (`|calculated - bank| > 0.01`).
- **Unified Credit Lock & Pay Period Deduplication (FIX-09):** All three engines (`LedgerView`, `getCalculatedBalanceAsOf`, `getLedgerRunningBalanceAsOfDate`) enforce the exact same lock boundary: `lock end = min(last imported date, today)`. Past locked dates show only stored/imported credits. Imported bank credits land on the bank date. If an imported credit exists within an earner's pay period, the scheduled payday projection is suppressed to eliminate duplicate credits.
- **Bank Import Ending Balance Separation (FIX-10):** Bank imports via `processSpreadsheetImport` never write or overwrite `reg_ending` keys in `dailyMatrix`. Stated bank running balances are stored exclusively in `account.importedLedgerRows` for statement discrepancy tracking. Existing `reg_ending` cells are preserved untouched.
- **Zero Household Data & Generic Ingestion (FIX-13):** No hardcoded household account names, digits, earner IDs, or default balances exist in source code or default state. Generic CSV imports create zero hardcoded accounts or earners. Goals-versus-bills coverage is generic and dynamic.
- **Immutable Stored Bill Amounts (FIX-14):** Bill amounts are preserved exactly as configured and stored. Magic-number rewrites (e.g., 442.32 and 2601.45 / 2757.68) have been removed from context hydration; reloads never mutate stored bill values.

## 3. Storage & Offline-First Strategy

- **IndexedDB Client Cache:** Primary local data store. Stores full budget documents keyed by user ID to isolate multi-account client state.
- **Offline Mutation Queue:** State modifications apply optimistically to local IndexedDB. If network connectivity is unavailable, updates queue locally until reconnected.
- **Cloud Vault Passcode Gate (`/api/verify-sync-code`):** Authenticated gate requiring valid session and constant-time match against `SYNC_UNLOCK_CODE`.

## 4. Cloud Sync & Concurrency Control (CAS)

- **Endpoint:** `POST /api/sync/backup`
- **Concurrency Guard:** Optimistic lock via `baseVersion` timestamp. Rejects stale writes with HTTP 409 `SYNC_CONFLICT` if `storedVersion > baseVersion`.
- **Payload Schema Enforcement:** Strict schema validation (`validateBudgetPayloadDetailed`) rejects unknown keys, enforces string length limits, and caps array counts (e.g. max 25,000 transactions, 10,000 line items).
- **Suspicious Shrink Defense:** Rejects incoming payloads smaller than 10% of stored backup size with HTTP 409 `SYNC_SUSPICIOUS` unless `force: true` is passed.
- **Byte-Accurate Size Tracking:** Measures payloads with `TextEncoder` in UTF-8 bytes (`data_byte_length`) to avoid multi-byte Unicode drift.
- **Version Snapshot History:** Automatically retains up to 10 historical snapshots in `user_backup_versions` for version rollback and auditability.

## 5. Backend Transactional Integrity & Compensating Rollbacks (FIN-AUDIT-001)

All D1 SQLite interactions strictly enforce parameterization and rollback safety:

- **Strict SQL Parameterization:** All queries use `?` placeholders with chained `.bind(...)`. Zero template literal variable interpolations are permitted in any query.
- **Compensating Rollbacks on Mutation Failure:**
  - **`handleSyncBackup`:** If an error occurs during or after backup batch execution, the catch block executes a compensating `DELETE FROM user_backup_versions WHERE id = ?` to prevent orphaned version rows in D1.
  - **`register`:** If an error occurs during verification code generation or session issuance after user insertion, the catch block deletes both the user row and any created verification record, preventing orphaned, locked accounts.
  - **`update-profile`:** If an error occurs during profile updates involving email change requests, any newly issued unlinked `email_verifications` record is rolled back.

## 6. Authentication, Authorization & Session Lifecycle Invariants (FIN-AUDIT-002)

Authentication states strictly reflect backend database authority and maintain zero client-side token storage:

- **HttpOnly Cookie Boundaries:** All authentication relies exclusively on `HttpOnly; Secure; SameSite=Strict` cookies (`auth_token` and `csrf_token`) scoped to `/finance` and `/api`. No JWTs or sensitive credentials are ever persisted in `localStorage` or `sessionStorage`.
- **Immediate Credential Purging on 401/403:** Failed token validations (expired signatures, malformed tokens, revoked users, or stale `token_version`) instantly emit `Set-Cookie` headers with `Max-Age=0` across `/finance`, `/api`, and `/`, purging invalid cookies from the browser immediately.
- **Token Version (`token_version`) Invalidation Protocol:**
  - Password resets (`/api/auth/reset-password`), profile password changes (`/api/auth/update-profile`), email changes (`/api/auth/confirm-email-change`), administrative suspensions (`/api/admin/user-status`), and user logouts (`/api/auth/logout`) atomically increment `token_version` in Cloudflare D1.
  - The in-memory / KV session cache (`user-session:<id>`) is explicitly invalidated (`invalidateCachedUser`).
  - Any subsequent request carrying an older JWT with `tv !== token_version` is actively denied with HTTP 401 `SESSION_EXPIRED` and purges cookies on the client.
- **Multi-Cookie Resolution & Collision Recovery:** `getAllTokensFromRequest` extracts all candidate `auth_token` cookies to prevent sub-path collision (e.g. `/` vs `/finance`). Candidate tokens are evaluated sequentially; requests with conflicting dual credentials (both Cookie and Bearer) are actively rejected with HTTP 400.
- **Declarative Route Guarding (`requireAuth` / `withAuth`):** Centralized `requireAuth` middleware uniformly rejects unauthenticated and revoked states without leaking database driver details, returning standardized JSON error payloads.
- **Fail-Closed Security Headers (FIX-12):** All responses enforce fail-closed security headers (HSTS and CSP) unless `ENVIRONMENT` is explicitly `'development'` and the request hostname is `localhost` or `127.0.0.1`. Requests bearing ports no longer default to localhost classification (`Boolean(url.port)` stripped), and `http://techtrekgt.com` is omitted from `PRODUCTION_ORIGINS` to deny unencrypted HTTP origin access.

## 7. Financial Math Engine & State Calculation Invariants (FIN-AUDIT-003)

- **Sanitization on Ingestion & Migration:**
  - `cleanNum` and `parseMoney` strip non-numeric formatting (currency symbols, commas, trailing whitespace) and convert accounting parentheses into signed numbers before any raw cell or CSV input enters the state tree.
  - Non-numeric or non-finite inputs (`NaN`, `Infinity`, `null`, `undefined`) are safely coerced to zero (or explicit nulls where required by database schemas), completely blocking silent `NaN` poisoning.
- **State Calculation Invariants:**
  - **Running Balance Precision:** `getCalculatedBalanceAsOf`, `getTotalCashOnHand`, and `getTotalMonthEndCashOnHand` accumulate values using `round2` at each step, preventing sub-cent floating-point accumulation drift over 365-day projection horizons.
  - **Negative Zero Normalization:** Any arithmetic yielding `-0` is automatically converted to `0` by `round2` via `Object.is(val, -0) ? 0 : val`, guaranteeing deterministic state serialization.
  - **Credit Allocation Conservation:** `allocateEarnerCredit` enforces that total earner distributions strictly equal the earner's deposit (`earnerReg + earnerExtra === earnerDeposit`), preventing balance phantom surpluses or deficits.
  - **Ending Balance Row Calculation Invariant:** Every ledger row strictly maintains `ending = round2(beginning + credits - bills + other)`. Stored bank statement balances (`reg_ending`, `extra_ending`, `importedLedgerRows`) are preserved purely for statement discrepancy comparisons and never override row cash-flow math.
  - **Bank Import Ending Balance Separation (FIX-10):** Bank imports via `processSpreadsheetImport` never write or overwrite `reg_ending` keys in `dailyMatrix`. Stated bank running balances are stored exclusively in `account.importedLedgerRows` for statement discrepancy tracking. Existing `reg_ending` cells are preserved untouched.
  - **Spreadsheet Ingestion Bounds (FIX-11):** Upgraded `xlsx` to pinned official SheetJS release (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). File size is strictly clamped to `MAX_SPREADSHEET_FILE_SIZE = 15MB` and worksheet row count is capped at `MAX_SPREADSHEET_ROW_COUNT = 50,000` prior to parsing in `spreadsheet.worker.js` and client utilities.
  - **Zero Household Data & Generic Ingestion (FIX-13):** Eliminates hardcoded accounts, digits, earner names/IDs, and default balances. Generic CSV imports instantiate zero hardcoded accounts or people.
  - **Preserved Bill Amounts & Zero Silent Rewrites (FIX-14):** Bill amounts remain immutable across reloads. Silent amount rewrites (442.32 / 2601.45 / 2757.68) have been eliminated.
  - **Amortization Schedule Integrity:** `AmortizationView` accumulates interest, principal, and balance reductions with deterministic 2-decimal rounding per monthly period, preventing amortized total interest drift.
- **Zero Drift Storage Mandate:** All balances stored in IndexedDB or sent to Cloudflare D1 via `/api/sync/backup` are guaranteed to be finite 2-decimal numbers.

## 8. Frontend State Management & UI Synchronization Invariants (FIN-AUDIT-004)

- **Context Lifecycle & Multi-Account Isolation:**
  - **Global Sign-Out Reset:** `BudgetMetadataContext` and `LedgerDataContext` listen to `techtrek:user-logout` window events. Upon sign-out, all in-memory React state (`budget`, `dailyMatrix`, `lineItems`, `transactions`, `syncPasscode`, `isSyncUnlocked`, `syncConflict`, `cloudVersion`) and tracking refs (`hasAutoPulledRef`, `isPendingSaveRef`) are instantly reset to default starter structures.
  - **Strict User-Scoped Storage & Sync Queue:** IndexedDB database access, pending mutation queues (`getPendingSync`, `clearPendingSync`, `flushPendingCloudSync`), and cloud version markers (`tt_budget_cloud_version:${userId}`) are strictly scoped to `userId`, preventing cross-account data contamination across browser sessions.
- **Asynchronous Error Handling & Rollback Safety:**
  - **Preserved Retries on Disk Save Failure:** If a disk commit in `flushSaveToIndexedDB` fails, `isPendingSaveRef.current` is preserved as `true` and the error is surfaced to `saveError` state, allowing subsequent user edits to retry writing without silent data loss.
  - **Resilient Network Parsing:** All network response handlers use safe JSON parsing (`res.json().catch(() => ({}))`) to guard against unformatted 502/504 HTML error gateways crashing component state.
  - **Conflict Resolution Safety:** `resolveConflictKeepLocal` and `resolveConflictUseCloud` wrap version writes and cloud pulls in guarded `try / catch` blocks to prevent unhandled promise rejections from freezing the sync modal.
- **Guaranteed Loading State Resets (`finally` Block Mandate):**
  - All asynchronous mutation workflows (`isSubmitting`, `isProcessing`, `isVerifying`, `isResending`, `isFlushingCache`, `isClearingCredits`, `isPruning`, `isRestoringGoals`) enforce state cleanup inside `finally {}` blocks.
  - Interactive elements and submission buttons never remain permanently disabled or frozen in loading states following network dropouts or backend rejections.
- **Admin & Maintenance Route Synchronization:**
  - `AdminView` user status updates target the canonical POST `/api/admin/user-status` endpoint with structured payloads (`{ userId, status }`), matching backend Cloudflare Worker routing and avoiding 404 route drift.

## 9. Automated Verification & Typecheck Governance
- **Zero-Error Typecheck Validation (WP-01):** `npm run typecheck` (`tsc -p jsconfig.json`) passes cleanly with zero errors. The JSDoc signature for `pushCloudBackupOptimistic` in `src/utils/api.js` explicitly includes `ownershipConflict?: boolean` to maintain type safety across ownership verification branches.
- **Turnstile Bot Verification Active Integration (WP-02):** Full-stack Cloudflare Turnstile token integration is active. `GET /api/auth/turnstile-config` dynamically delivers configuration to `AuthContext`, and `TurnstileWidget` mounts in `AuthModal` and `AuthPage` to transmit user verification tokens during login and registration, preventing lockout when `TURNSTILE_SECRET_KEY` is configured.

