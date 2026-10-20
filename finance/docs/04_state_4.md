# Finance OS - State Management & Persistence Architecture

## 1. Overview & Context

Finance OS implements an offline-first state architecture with cloud synchronization. Client state lives in React Contexts backed by IndexedDB, while the cloud backend uses Cloudflare D1 (SQLite) with optimistic concurrency control (Compare-And-Swap) and version history.

---

## 2. Client-Side State Hierarchy

State is partitioned into four primary layers in the component tree:

```text
<AuthProvider>
  └── <BudgetMetadataProvider>
        └── <LedgerDataContext>
              └── <MainContent />
```

- **`AuthProvider` (`src/context/AuthContext.jsx`):** Manages user session state, authentication claims, and CSRF tokens. Backed by HttpOnly `SameSite=Strict` cookies (`auth_token` and `csrf_token`).
- **`BudgetMetadataProvider` (`src/context/BudgetMetadataContext.jsx`):** Manages accounts, people/earners, bills, funding goals, loans, and categories.
- **`LedgerDataProvider` (`src/context/LedgerDataContext.jsx`):** Manages historical transactions, imported ledger rows, daily matrix balances, and cash-flow projections.
- **`useBudget()` hook:** Composes metadata and ledger data via memoization for consumer components.
- **Daily Matrix & Credit Resolution:** `allocateEarnerCredit` supports both account-specific resolution and multi-account aggregation for 'all' accounts view, ensuring stored non-zero credits display their exact values while stored zeros display "$ -".
- **Ending Balance Calculation & Bank Variance Invariant (FIX-08):** In `matrixData`, `getCalculatedBalanceAsOf`, and `getLedgerRunningBalanceAsOfDate`, ending balances strictly follow the ledger math formulas (Reg Beg + Extra Beg = Total Beg; Reg Beg - Bills and Deductions (except Other $) = Reg End; Extra Beg (+/-) Other = Extra End; Reg End + Extra End = Total End; Extra = Extra Payment Goal for account +/- Other $) every day without replacement from stored bank ending values (`reg_ending`, `extra_ending`, `importedLedgerRows`). Stored values are preserved for statement variance checks against Total End (`|totalEnd - bank| > 0.01`).
- **Unified Credit Lock & Pay Period Deduplication (FIX-09):** All three engines (`LedgerView`, `getCalculatedBalanceAsOf`, `getLedgerRunningBalanceAsOfDate`) enforce the exact same lock boundary: `lock end = min(last imported date, today)`. Past locked dates show only stored/imported credits.
- **Bank Import Ending Balance Separation (FIX-10):** Bank imports via `processSpreadsheetImport` never write or overwrite `reg_ending` keys in `dailyMatrix`. Stated bank running balances are stored exclusively in `account.importedLedgerRows` for statement discrepancy tracking. Existing `reg_ending` cells are preserved untouched.
- **Other Description & Comment Preservation (FIX-26):** User-authored comments in the "Other Description" column (`other_desc` and `other_credit_desc`) are strictly protected from overwrite or erasure across both merge and override import paths.
- **Last 4 Manual Syncs & Ongoing Single Sync Architecture (FIX-27):** Background auto-sync pushes with `{ auto: true }`, updating only the single active record in `user_backups` without generating historical snapshot rows. Explicit user clicks on "Save Manual Backup Now" pass `{ manual: true, force: true }`, inserting an entry into `user_backup_versions` and pruning older rows to retain strictly the last 4 manual backups. On restore (`restoreFromBackup`), context sets `schemaVersion = CURRENT_BUDGET_SCHEMA_VERSION`, guaranteeing that legacy migration passes do not execute destructively against restored data.
- **Column Header Hover Tooltip Parity Invariant (FIX-28):** Column header hover tooltips (`ColumnHeaderHoverTooltip.jsx` / `columnTooltipUtils.js`) clamp `asOfDate` to the end of the viewed month when inspecting past months. Unmapped transactions matching generic statement aliases (e.g. "USAA Transfer") are suppressed if another entity owns the active `dailyMatrix` cell on that date. Displayed transaction amounts align directly with non-zero `dailyMatrix` cell overrides for both bills (`_bill_${id}`) and earners (`_credit_${id}`), maintaining 100% agreement with ledger grid numbers.

---

## 3. Storage & Offline-First Strategy

- **IndexedDB Client Cache:** Primary local data store (`TechTrekFinanceDB`). Stores full budget documents keyed by user ID (`current_budget:<userId>`) to isolate multi-account client state.
- **Offline Mutation Queue:** State modifications apply optimistically to local IndexedDB. If network connectivity is unavailable, updates queue locally until reconnected.
- **Cloud Vault Passcode Gate (`/api/verify-sync-code`):** Authenticated gate requiring valid session and constant-time match against `SYNC_UNLOCK_CODE`.

---

## 4. Cloud Sync & Concurrency Control (CAS)

- **Endpoint:** `POST /api/sync/backup`
- **Concurrency Guard:** Optimistic lock via `baseVersion` timestamp. Rejects stale writes with HTTP 409 `SYNC_CONFLICT` if `storedVersion > baseVersion`.
- **Payload Schema Enforcement:** Strict schema validation (`validateBudgetPayloadDetailed`) rejects unknown keys, enforces string length limits, and caps array counts (e.g. max 25,000 transactions, 10,000 line items).
- **Suspicious Shrink Defense:** Rejects incoming payloads smaller than 10% of stored backup size with HTTP 409 `SYNC_SUSPICIOUS` unless `force: true` is passed.
- **Byte-Accurate Size Tracking:** Measures payloads with `TextEncoder` in UTF-8 bytes (`data_byte_length`) to avoid multi-byte Unicode drift.
- **Version Snapshot History (FIX-27):** Separates single ongoing background sync (`user_backups`) from historical rollback snapshots (`user_backup_versions`). Automated background syncs update the ongoing record only, while explicit manual backups record up to 4 historical rollback snapshots for point-in-time recovery without auto-save noise.

---

## 5. Backend Transactional Integrity & Compensating Rollbacks (FIN-AUDIT-001)

All D1 SQLite interactions strictly enforce parameterization and rollback safety:

- **Strict SQL Parameterization:** All queries use `?` placeholders with chained `.bind(...)`. Zero template literal variable interpolations are permitted in any query.
- **Compensating Rollbacks on Mutation Failure:**
  - **`handleSyncBackup`:** If an error occurs during or after backup batch execution, the catch block executes a compensating `DELETE FROM user_backup_versions WHERE id = ?` to prevent orphaned version rows in D1.
  - **`register`:** If an error occurs during verification code generation or session issuance after user insertion, the catch block deletes both the user row and any created verification record, preventing orphaned, locked accounts.
  - **`update-profile`:** If an error occurs during profile updates involving email change requests, any newly issued unlinked `email_verifications` record is rolled back.

---

## 6. Authentication, Authorization & Session Lifecycle Invariants (FIN-AUDIT-002)

- **HttpOnly Cookie Boundaries:** All authentication relies exclusively on `HttpOnly; Secure; SameSite=Strict` cookies (`auth_token` and `csrf_token`) scoped to `/finance` and `/api`. No JWTs or sensitive credentials are ever persisted in `localStorage` or `sessionStorage`.
- **Immediate Credential Purging on 401/403:** Failed token validations (expired signatures, malformed tokens, revoked users, or stale `token_version`) instantly emit `Set-Cookie` headers with `Max-Age=0` across `/finance`, `/api`, and `/`, purging invalid cookies from the browser immediately.
- **Token Version Invalidation Protocol:**
  - Password resets (`/api/auth/reset-password`), profile password changes (`/api/auth/update-profile`), email changes (`/api/auth/confirm-email-change`), administrative suspensions (`/api/admin/user-status`), and user logouts (`/api/auth/logout`) atomically increment `token_version` in Cloudflare D1.
  - In `functions/utils/auth.js`, session caching queries `env?.GATEWAY_KV || env?.USER_CACHE || env?.RATE_LIMIT_KV` and invalidates cached user sessions upon mutation (`invalidateCachedUser`).
  - Any subsequent request carrying an older JWT with `tv !== token_version` is actively denied with HTTP 401 `SESSION_EXPIRED` and purges cookies on the client.
- **Multi-Cookie Resolution & Collision Recovery:** `getAllTokensFromRequest` extracts all candidate `auth_token` cookies to prevent sub-path collision. Mixed-credential requests (Cookie + Bearer) are rejected with HTTP 400.
- **Declarative Route Guarding:** Centralized `requireAuth` middleware uniformly rejects unauthenticated and revoked states without leaking database driver details.
- **Fail-Closed Security Headers:** All responses enforce fail-closed security headers (HSTS and CSP) unless `ENVIRONMENT` is explicitly `'development'` and the request hostname is `localhost` or `127.0.0.1`.

---

## 7. Financial Math Engine & State Calculation Invariants (FIN-AUDIT-003)

- **Standardized Currency Precision (`round2`):**
  - All financial math throughout `LedgerView.jsx`, `spreadsheetParser.js`, `spreadsheet.js`, `importer.js`, `SpreadsheetImporter.jsx`, `AmortizationView.jsx`, and `BudgetMetadataContext.jsx` utilizes `round2(x)` with `Number.EPSILON` half-cent preservation (`Math.round((val + (val >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100`).
  - Raw `Math.round(x * 100) / 100` and unshielded float accumulators have been completely excised.
- **State Calculation Invariants:**
  - **Running Balance Precision:** `getCalculatedBalanceAsOf`, `getTotalCashOnHand`, and `getTotalMonthEndCashOnHand` accumulate values using `round2` at each step, preventing sub-cent floating-point accumulation drift over 365-day projection horizons.
  - **Negative Zero Normalization:** Any arithmetic yielding `-0` is automatically converted to `0` by `round2` via `Object.is(val, -0) ? 0 : val`, guaranteeing deterministic state serialization.
  - **Credit Allocation Conservation:** `allocateEarnerCredit` enforces that total earner distributions strictly equal the earner's deposit (`earnerReg + earnerExtra === earnerDeposit`), preventing balance phantom surpluses or deficits.
  - **Ending Balance Row Calculation Invariant:** Every ledger row strictly maintains the standard formulas without replacement from stored bank ending values.
  - **Amortization Schedule Integrity:** `AmortizationView` accumulates interest, principal, and balance reductions with deterministic 2-decimal rounding per period (`monthlyEquivalentPayment`, `extraPaymentPerPeriod`, `totalPeriodPayment`, `totalMonthlyPayment`, `beginningBalance`, `scheduledPayment`, `interestPortion`, `totalPayment`).

---

## 8. Distributed State Verification & Automated Test Invariants

All persistence and calculation state invariants are verified via an automated test harness:

- **Compare-And-Swap (CAS) Concurrency State:**
  - `POST /api/sync/backup` checks `storedVersion > baseVersion`. Conflicting mutations reject with HTTP 409 `SYNC_CONFLICT` returning active server state.
  - `force: true` allows deliberate administrative or rollback overrides.
  - Payloads <10% of stored backup size trigger HTTP 409 `SYNC_SUSPICIOUS` unless overridden with `force: true`.
  - Byte lengths are tracked strictly in UTF-8 bytes via `TextEncoder` in `user_backups.data_byte_length`.
- **Historical Snapshot Invariant (BUG-003):**
  - Point-in-time recovery maintains up to 10 snapshots in `user_backup_versions` per user (`ORDER BY saved_at DESC, rowid DESC LIMIT 10`).
  - Automated background syncs push `{ auto: true }` and update only the single record in `user_backups` without generating historical snapshot rows.
- **Client Partitioning & Session Purge (FIN-AUDIT-004):**
  - Storage partitions are strictly keyed by `userId`: `current_budget:${userId}` for IndexedDB records, `cf_pending_sync:${userId}` for offline mutation queues, and `tt_budget_cloud_version:${userId}` for version markers.
  - The `techtrek:user-logout` global window event triggers synchronous state purges in `BudgetMetadataContext` and `LedgerDataContext`, unmounting private financial models and clearing storage markers.
- **Continuous Validation Suite:**
  - `npm run test:unit`: Executes 10 test suites covering financial math, hostile payload sanitization, CAS concurrency, 10-snapshot retention, auth invalidation, and D1 parameterization via Vitest.
  - `npm run test`: Executes 511 regression tests via Node 24 test runner.
  - `npm run test:all`: Executes the complete test battery.

