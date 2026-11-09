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
- **Last 10 Manual Syncs & Ongoing Single Sync Architecture (FIX-27):** Background auto-sync pushes with `{ auto: true }`, updating only the single active record in `user_backups` without generating historical snapshot rows. Explicit user clicks on "Save Manual Backup Now" pass `{ manual: true, force: true }`, inserting an entry into `user_backup_versions` and pruning older rows to retain strictly the last 10 manual backups. On restore (`restoreFromBackup`), context sets `schemaVersion = CURRENT_BUDGET_SCHEMA_VERSION`, guaranteeing that legacy migration passes do not execute destructively against restored data.
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
- **Sync Reconcile & Classification Hardening (FIX-29):** `POST /api/sync/backup` treats a push as a snapshot only when `manual: true` is explicit (unflagged or `auto: true` update `user_backups` only). `pushCloudBackup` in `LedgerDataContext.jsx` forwards `auto`, `manual` and `force`; `flushPendingCloudSync` sends `auto: true`. Login reconcile is single-flight per user (`reconcileUserIdRef`, `reconcileInFlightRef`), uses a content fingerprint to silently adopt identical cloud data, stamps `tt_budget_last_modified:${userId}` with the server version after pushes, suppresses dirty marking during restore/resolution (`suppressDirtyUntilRef`), and dedupes conflicts (`autoConflictPendingRef`, `conflictResolvedAtRef` 10s window). All refs purge on `techtrek:user-logout`.
- **Version Snapshot History (FIX-27):** Separates single ongoing background sync (`user_backups`) from historical rollback snapshots (`user_backup_versions`). Automated background syncs update the ongoing record only, while explicit manual backups record up to 10 historical rollback snapshots for point-in-time recovery without auto-save noise.

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
  - Async import lifecycle cleanup safety in `SpreadsheetImporter.jsx`: `processFile` guarantees `setIsDragging(false)` and resets `setStage(STAGE.IDLE)` within a structured `finally` block on parsing interruption or error.
  - Clean ESM import hoisting: Top-level static import hoisting in `App.jsx` and `indexedDB.js` eliminates mid-file static import statements (BUG-009).
  - Dynamic chunk preload and CSP nonce propagation (FIX-CHUNK-CSP): Cloudflare Worker `HTMLRewriter` injects runtime cryptographic nonces into `<meta property="csp-nonce">` in `index.html`, allowing Vite's `__vitePreload` helper to attach nonces to dynamic module preload links under CSP `'strict-dynamic'`. `lazyWithRetry` in `App.jsx` and `vite:preloadError` in `main.jsx` prevent chunk drift crashes on deployment transitions.
- **Continuous Validation Suite:**
  - `npm run test:unit`: Executes 10 test suites covering financial math, hostile payload sanitization, CAS concurrency, 10-snapshot retention, auth invalidation, and D1 parameterization via Vitest.
  - `npm run test`: Executes 520 regression tests via Node 24 test runner.
  - `npm run test:all`: Executes the complete test battery.

---

## 9. Transactions Grid State Mutation & Rollback Governance (FIX-GRID)

- **Atomic Pre-Mutation Snapshotting:** In `LedgerDataContext.jsx`, `moveDailyMatrixCell` snapshots prior values of `sourceKey`, `targetKey`, and paired description keys (`other_desc`, `other_credit_desc`) before applying in-memory mutations.
- **Compensating In-Memory Rollback:** If an unhandled error or rejected transaction occurs during cell relocation, the `catch` block restores the pre-mutation snapshot atomically, triggers `setDailyMatrix`, and increments `matrixVersion` to heal the React component tree and IndexedDB cache.
- **Deterministic Currency Invariant:** All matrix mutations (`updateDailyMatrixCell`, `moveDailyMatrixCell`, `InlineEdit.onCommit`, `handleCellCommit`) normalize values through `round2(val)` with `Number.EPSILON` boundary preservation and `-0` elimination prior to ref assignment and reactive state propagation.
- **Linked Metadata Lifecycle:** Clearing an `other_amount` or `other_credit_amount` cell to `$0.00` automatically resets its corresponding description cell (`other_desc`, `other_credit_desc`) to an empty string, preventing orphaned note metadata.
- **Droppable Highlight Lifecycle Guard:** In `DroppableCellTd`, `isCellOver` strictly requires active pointer dragging and field family compatibility (`Boolean(active && isOver && isValidField)`). `DragOverlay` uses `dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}` for a spring-easing visual confirmation on drop, preventing stale or orphaned drop target highlight classes (e.g., green/rose rectangular backgrounds) from persisting in the DOM post-drop.
- **Same-Key No-Op Guard (FIN-AUDIT-004):** In `moveDailyMatrixCell`, after `sourceKey` and `targetKey` are derived from `resolvedTargetField`, an early `if (sourceKey === targetKey) return;` guard exits before any snapshot or ref mutation. Prevents phantom state writes in edge-case same-field, same-date, same-column drops that bypass the `handleDragEnd` guard.
- **Drag Cancel Audit Logging:** `handleDragCancel` (wired to `<DndContext onDragCancel>`) calls `logTransaction('UI_DRAG_CANCEL', ...)` on Escape-key or pointer-lost cancellations, maintaining a complete audit trail of all initiated drag interactions and providing a clean hook for future optimistic rollback on cancel.

---

## 10. Shared Ledger Collaboration & Tenant Isolation State Architecture

Finance OS implements multi-tenant ledger collaboration and access gating ported directly from the Wayfinder platform standard:

### 10.1 Cloudflare D1 Relational Collaboration Schema

```sql
CREATE TABLE IF NOT EXISTS finance_ledgers (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT 'Household Budget',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_finance_ledgers_owner ON finance_ledgers(owner_id);

CREATE TABLE IF NOT EXISTS ledger_invites (
  id            TEXT PRIMARY KEY,
  ledger_id     TEXT NOT NULL,
  invited_email TEXT NOT NULL COLLATE NOCASE,
  role          TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  token_hash    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  invited_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  accepted_at   TEXT,
  accepted_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ledger_invites_ledger ON ledger_invites(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_invites_email  ON ledger_invites(invited_email);

CREATE TABLE IF NOT EXISTS ledger_shares (
  id         TEXT PRIMARY KEY,
  ledger_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  invite_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ledger_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_shares_user   ON ledger_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_shares_ledger ON ledger_shares(ledger_id);
```

### 10.2 Backward Compatibility Invariant
For every existing user, their personal ledger ID is identical to their user ID (`user.id = ledger_id`), aligning directly with `user_backups.id = user.id`. This guarantees 100% backward compatibility for all existing single-user backup records with zero migrations or data restructuring.

### 10.3 Dynamic Tenant Access Resolver
- **Resolver Function:** `resolveLedgerAccess(env, ledgerId, user)` evaluates caller permissions against target ledger:
  - Caller matching `ledger.owner_id` or `ledgerId === user.id` yields `role: 'owner'`.
  - Active `ledger_shares` row yields caller role (`'admin'`, `'editor'`, or `'viewer'`).
  - Platform administrator (`user.role === 'admin'`) yields `role: 'admin'`.
  - Unaffiliated callers yield `role: 'none'`, failing closed with HTTP 403 Forbidden.
- **Backend Sync Hardening:** All `/api/sync/*` endpoints resolve access dynamically against `targetLedgerId` before executing queries.

### 10.4 Client-Side Collaboration State (`LedgerDataContext.jsx`)
- **Active Ledger State:**
  - `activeLedgerId`: ID of currently active ledger (initialized from `sessionStorage` or defaulting to `currentUserId`).
  - `ledgerRole`: Derived access role (`'owner'`, `'admin'`, `'editor'`, `'viewer'`, or `'none'`).
  - `ledgerPermissions`: `{ read, edit, manageShares, isOwner, role }`.
  - `availableLedgers`: List of owned and shared ledgers populated by `GET /api/finance/ledgers`.
  - `isShareModalOpen`: Boolean controlling `ShareLedgerModal.jsx` presentation.
- **Client Read-Only Mutation Guards:**
  - When `ledgerRole === 'viewer'`, mutations in `updateDailyMatrixCell`, `updateDailyMatrixCells`, `moveDailyMatrixCell`, and `pushCloudBackup` exit early without altering refs or queuing sync backups.
- **Tenant Isolation Gate:**
  - When `ledgerRole === 'none'`, `App.jsx` restricts access and renders `NoAccessPanel` instead of exposing private budget views.
- **Session Purge Lifecycle:**
  - On `techtrek:user-logout` window events, `LedgerDataContext` resets `activeLedgerId`, sets `ledgerRole` to `'owner'`, empties `availableLedgers`, closes modals, and removes `finance_active_ledger_id` from `sessionStorage`.

---

## 11. Cross-App Account Isolation & Administration State

### 11.1 Dynamic App Filtering (`GET /api/admin/stats`) & Dedicated D1 Database (`finance-os-db`)
- Finance OS operates on its dedicated Cloudflare D1 database `finance-os-db` (ID: `1746a2c8-2653-4136-8301-d217748621fa`), initialized via `finance/finance-schema.sql` and `finance/migrations/0012_deep_relational_normalization.sql` across 23 structured relational tables:
  - Identity & Auth: `users`, `password_resets`, `email_verifications`
  - Collaboration: `finance_ledgers`, `ledger_invites`, `ledger_shares`
  - Domain Tables: `finance_ledger_settings`, `finance_accounts`, `finance_people`, `finance_bills`, `finance_transactions`, `finance_line_items`, `finance_funding_goals`, `finance_loans`, `finance_daily_matrix`
  - Normalized Tables (Migration 0012): `finance_account_statement_rows`, `finance_bill_splits`, `finance_person_allocations`, `finance_account_splits`, `finance_dashboard_widgets`, `finance_categories`
  - Snapshots & Version History: `user_backups`, `user_backup_versions`
- **Deep Relational Normalization (Phase 2):**
  - Statement row comparison maps (`importedLedgerRows`) are fully normalized into `finance_account_statement_rows` (`PRIMARY KEY (ledger_id, account_id, date_key)`), shrinking `finance_accounts.extra_json` from 69 KB down to < 300 bytes (99.6% reduction).
  - Explicit scalar columns (`starting_balance`, `extra_starting_balance`, `balance_as_of_date`, `start_date`, `ledger_mode`, `is_archived`) are promoted directly to SQL columns on `finance_accounts`.
  - Splits and allocations (`splits_json`, `account_allocations`, `saveExtraSplits`, `overflowSplits`) are decomposed into discrete junction tables (`finance_bill_splits`, `finance_person_allocations`, `finance_account_splits`).
  - Settings arrays (`dashboard_widgets_json`, `custom_categories_json`) are normalized into `finance_dashboard_widgets` and `finance_categories`.
  - Delta-only storage with `_p` (present keys set) in `structuredBudgetStore.js` ensures 100% key-for-key idempotency and zero full-item duplication in `extra_json`.
- Accounts in `finance-os-db` are strictly filtered so Finance OS has zero awareness of other platforms:
  - A user is recognized as a Finance user only if they have active rows in `user_backups`, `user_backup_versions`, `finance_ledgers`, or `ledger_shares`, or if their `users.created_app` is `'finance'` or role is `'admin'`.
  - Accounts belonging exclusively to other platforms (such as Wayfinder or Outpost) are completely omitted from API responses and never rendered in the UI.
- `totalUsers` and `users` reflect strictly Finance-scoped accounts.

### 11.2 Collaborator Membership Governance (`/api/admin/ledger-membership`)
- Administrators can manage collaborator permissions (`viewer`, `editor`, `admin`) on Finance household ledgers (`finance_ledgers`), or disconnect collaborators via `POST /api/admin/ledger-membership/remove`.

### 11.3 Universal Cascading Account Deletion (`deleteUserAccount`)
- Executed by administrative endpoints `POST /api/admin/user-delete` and `DELETE /api/admin/user`.
- Checks `sqlite_master` for table existence and executes atomic cascading cleanup across all dependent records:
  - `ledger_shares` (both as collaborator and owner)
  - `ledger_invites` (both invited email and invited_by)
  - `user_backups` and `user_backup_versions`
  - `finance_ledgers`
  - `email_verifications` and `password_resets`
  - `wayfinder_*` and `auction_*` tables (if present)
  - `users` (primary record)
- If the calling administrator deletes their own account, session cookies are cleared automatically.




