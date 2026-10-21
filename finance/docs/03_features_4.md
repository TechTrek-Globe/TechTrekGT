# Finance OS - Features & API Specification

## 1. Feature Suite

Finance OS is the personal budget tracking, financial projection, and cash-flow management application in TechTrekGT:

- **Daily Matrix & Cash Flow Forecasting:** 365-day running balances, paycheck allocations, split earner credits, and overdraft prevention.
- **Ledger Import & Reconciliation:** Dedicated Web Worker (`spreadsheet.worker.js`) offloads heavy SheetJS (`xlsx`) file parsing off the main browser thread to prevent UI freezing.
- **Budget Metadata Management:** Multi-account checking/savings management, bill scheduling with variable/fixed frequencies, funding goals, and amortized loan tracking.
- **Cloud Vault & Multi-Version Backup (FIX-27):** Dual-tier cloud persistence against Cloudflare D1: an ongoing single sync (`user_backups`) continuously maintained by automated background saves, and up to 10 historical manual backup snapshots in `user_backup_versions` saved when users explicitly trigger manual backups.
- **SSO Authentication & Session Management:** WebCrypto HS256 JWT sessions, PBKDF2-SHA256 password hashing (600,000 iterations), double-submit CSRF protection, and HttpOnly `SameSite=Strict` cookies.
- **Import-Time Review (replaces ledger Bank Diff):** The ledger does not compare against bank data after import (no 'Differs from bank' indicator or toggle). `SpreadsheetImporter` stage `REVIEW_ISSUES` lists, before commit: transactions routed to Other $ (no matching bill or earner), debits matched to a bill from a different account (`importWarnings` returned by `processSpreadsheetImport`), and the first date where the projected ledger running balance differs from the file's bank balance. User chooses Go Back or Import Anyway.
- **Merge Realignment & Persistent Alias Learning (FIX-25):** Merge reconciliation automatically updates date shifts across month boundaries and zeroes prior recorded/scheduled cells within 35 days. Conflict resolution defaults to updating existing entries with imported actual amounts. Manual transaction-to-bill or transaction-to-earner mappings automatically persist the transaction description into `bankMatchNames` for future imports. Interest credits ($0.01, $0.02, etc.) route directly to Other $ without conflict prompts or review warnings. Other $ cells preserve matched descriptions and do not double amounts on re-import.
- **Other Description & Comment Preservation (FIX-26):** User-authored comments in the "Other Description" column (`other_desc` and `other_credit_desc`) are strictly protected from overwrite or erasure across both merge and override import paths. Override mode retains all comments across all accounts (`key.endsWith('_other_desc') || key.endsWith('_other_credit_desc')`) and only purges transaction cells for the targeted account. Excised legacy `matrixNoteShifts` to ensure date-shifted bills never shift or blank manual comments on scheduled due dates (`next[projNoteKey] = ''`). Unmatched credit and debit ingestion preserves prior user comments (`priorUserDesc`) and joins multiple imported bank descriptions with ` | ` without clobbering existing comments. In `importer.js`, `mergeTransactions` preserves existing transaction descriptions (`ex.description || inc.description`).
- **Last 10 Manual Syncs & Full Ledger Cloud Restore (FIX-27):** Automated background syncs pass `auto: true` to continuously update `user_backups` (the single ongoing sync) without writing to `user_backup_versions`. Manual backups pass `manual: true` to insert a snapshot row into `user_backup_versions` and prune older records to retain strictly the last 10 manual syncs. In `api.js`, `ALLOWED_KEYS` includes `schemaVersion` and numeric strings in `dailyMatrix` are preserved via `Number(v)`. In `LedgerDataContext.jsx`, `restoreFromBackup` explicitly sets `schemaVersion` to bypass destructive legacy migrations (V2-V8), completely restoring the entire cloud budget (all accounts, transactions, imported ledger rows, bills, people, funding goals, and complete daily matrix with other descriptions).

---

## 2. Serverless API Routes

All serverless API routes execute in Cloudflare Workers ESM format (`src/worker.js` and `functions/api/*`):

| Endpoint | Method | Auth Required | Description |
| --- | --- | --- | --- |
| `/api/sync/backup` | POST | Yes (CSRF) | CAS cloud backup save: auto-sync updates single ongoing sync; manual saves record up to 10 historical rollback snapshots |
| `/api/sync/restore` | GET | Yes | Retrieves current user backup with conditional 304 ETag support |
| `/api/sync/versions` | GET | Yes | Lists up to 10 stored manual backup versions for the user plus metadata for ongoing single sync |
| `/api/sync/restore-version` | POST | Yes (CSRF) | Restores a specific historical backup version with full ledger state |
| `/api/verify-sync-code` | POST | Yes (CSRF) | Constant-time validation of cloud vault passcode |
| `/api/auth/register` | POST | No | User registration with Turnstile verification and compensating rollback |
| `/api/auth/login` | POST | No | User login with Turnstile verification and transparent password rehashing |
| `/api/auth/turnstile-config` | GET | No | Returns Turnstile active state and public site key |
| `/api/auth/me` | GET | Yes | Restores user session state without cookie clobbering |
| `/api/auth/refresh` | POST | Yes (CSRF) | Renews access tokens within the existing session expiration window |
| `/api/auth/logout` | POST | No | Revokes sessions by bumping `token_version` and clearing cookies |
| `/api/auth/forgot-password` | POST | No | Sends one-time password reset code via email |
| `/api/auth/reset-password` | POST | No | Atomic multi-statement password update and token version revocation |
| `/api/auth/verify-email` | POST | Yes (CSRF) | Verifies email address via 8-digit OTP |
| `/api/auth/resend-verification` | POST | Yes (CSRF) | Resends email verification code |
| `/api/auth/update-profile` | POST | Yes (CSRF) | Updates profile and handles email change requests with compensating rollback |
| `/api/auth/confirm-email-change` | POST | Yes (CSRF) | Confirms pending email change with OTP |
| `/api/auth/security-question` | GET | Yes | Authenticated retrieval of security question |
| `/api/admin/stats` | GET | Yes (Admin) | Administrative statistics query with pagination ceilings and accurate `user_backup_versions` aggregation |
| `/api/admin/user-status` | POST | Yes (Admin) | Updates user active/suspended status with session revocation |

---

## 3. Data Integrity & SQL Parameterization (FIN-AUDIT-001)

- **Strict SQLite Parameterization:** All queries use `db.prepare(sql).bind(...)` with `?` positional parameters. No template literal variable interpolations exist in any API route or utility.
- **Compensating Rollbacks:** In multi-step database mutations, catch blocks surgically execute compensating D1 statements to delete incomplete, orphaned, or unlinked records on downstream failure.
- **Admin Stats Telemetry:** `functions/api/admin/stats.js` queries `user_backup_versions` grouping by `user_id` with positional `?` binding, aggregating both active backups in `user_backups` and historical snapshots in `user_backup_versions` to report exact backup counts per registered user account.

---

## 4. Authentication, Authorization & Session Lifecycle (FIN-AUDIT-002)

- **HttpOnly Cookie Standard:** Authentication strictly utilizes `HttpOnly; Secure; SameSite=Strict` cookies (`auth_token` and `csrf_token`) scoped to `/finance` and `/api`. No tokens are accessible to client JavaScript or stored in `localStorage`.
- **Immediate Credential Purging:** Failed token validations (signature mismatch, expired TTL, revoked session, or suspended account) actively purge invalid credentials via `clearedCookies()` (`Max-Age=0`) alongside explicit HTTP 401/403 responses.
- **Atomic Session Invalidation:** Password resets (`reset-password.js`), profile password updates (`update-profile.js`), email change confirmations (`confirm-email-change.js`), account suspensions (`admin/user-status.js`), and user logouts (`logout.js`) increment `token_version` in D1 and invalidate the session cache (`invalidateCachedUser`), invalidating all existing JWTs for that account immediately.
- **Shared Gateway KV Caching:** In `functions/utils/auth.js`, session caching queries `env?.GATEWAY_KV || env?.USER_CACHE || env?.RATE_LIMIT_KV` to support Cloudflare central gateway cache bindings across micro-frontends without redundant D1 reads.
- **Multi-Cookie Resolution:** Handles browser cookie multi-path collisions by evaluating all candidate `auth_token` cookies in sequence (`getAllTokensFromRequest`), preventing subpath cookie shadowing. Rejects mixed-credential requests (Cookie + Bearer) with HTTP 400.
- **Fail-Closed Security Headers & Origin Strictness:** Fail-closed security posture enforces CSP and HSTS by default across all requests unless `ENVIRONMENT` is explicitly `'development'` and the request hostname is `localhost` or `127.0.0.1`.

---

## 5. Financial Math Engine & Calculation Safety (FIN-AUDIT-003)

- **Universal Deterministic Precision (`round2`):** Raw `Math.round(x * 100) / 100` expressions and unshielded accumulators are replaced with `round2(x)` across all finance components and utilities:
  - `LedgerView.jsx`: Row starting/ending balance shifts, initial account totals, expected bill amounts, row generation, and monthly column totals.
  - `spreadsheetParser.js`: `cleanNum` helper, transaction amount parsing, credit/debit differentials, running balance parsing, and imported statement row begins/ends.
  - `spreadsheet.js`: Account starting balance synchronization, starting balance deltas, and statement balance parsing.
  - `importer.js`: Transaction amounts, running balances, earner allocations, and bill split portions.
  - `SpreadsheetImporter.jsx`: Reconciliation adjustment amounts, bank balance checks, and calculated running balances.
  - `AmortizationView.jsx`: Scheduled period payments, extra payments, monthly equivalents, interest portions, and loan-to-bill matching.
  - `BudgetMetadataContext.jsx`: Goal amount-per-pay normalization.
- **Robust NaN & Non-Finite Defense:** Sanitizes all monetary inputs (`parseMoney`, `validateNonNegativeMoney`, `cleanNum`) against `NaN`, `Infinity`, `-Infinity`, `null`, `undefined`, and empty strings.
- **Cent-Exact Credit Allocation Invariant:** In `allocateEarnerCredit`, regular operating credits and extra savings deposits adhere strictly to the invariant `earnerReg + earnerExtra <= earnerDeposit`, clamping extra savings to prevent over-allocation and ensuring exact penny preservation.
- **Stored Past Credit Resolution & Multi-Account Projection:** In `allocateEarnerCredit`, stored non-zero credits take precedence and display their stored values while stored zeros display "$ -". Supports account-scoped resolution and aggregated "All Accounts" views.

---

## 6. Frontend State Management & UI Synchronization (FIN-AUDIT-004)

- **Guaranteed Loading State Recovery:** In `SpreadsheetImporter.jsx`, `processFile` encapsulates workbook inspection and parsing inside a `try ... catch ... finally` block. A `transitioned` flag tracks whether the parser transitioned to `STAGE.SHEET_SELECT` or `STAGE.SHEET_WIZARD`; if not, the `finally` block guarantees `setStage(STAGE.IDLE)` and resets `setIsDragging(false)`, preventing the UI from ever locking in `STAGE.PARSING`.
- **Multi-Account Context Isolation on Sign-Out:** Implemented the `techtrek:user-logout` global event channel. When a user logs out, all React contexts immediately purge active budget metadata, accounts, earners, bills, daily matrix projections, and historical line items from memory before the new session begins.
- **Strict User Scoping across Local Storage & Sync Queues:** IndexedDB reads and writes, pending mutation queues (`getPendingSync`, `clearPendingSync`, `flushPendingCloudSync`), and cloud version markers are partitioned strictly by `userId`.
- **Clean Module Scoping:** Hoisted mid-file imports in `App.jsx` and `indexedDB.js` to the top-level ESM import header, ensuring compliance with strict JavaScript module standards.

---

## 7. Automated Test Suite Architecture & Reliability Gates

The application enforces a dual-tier, zero-flake automated test architecture written strictly in pure JavaScript ESM (`.js` only, zero TypeScript):

- **Vitest Edge Integration & Unit Suite (`tests/`):**
  - Configured via `vitest.config.js` running in Node 24 with native WebCrypto and in-memory D1 SQLite mocks (`tests/helpers/mockD1.js`, `mockKV.js`).
  - `tests/unit-financial-precision.test.js`: Validates `round2()` half-cent boundary rounding with `Number.EPSILON`, negative zero (`-0`) normalization, 360-month amortizations, and earner credit distribution invariants.
  - `tests/unit-input-sanitization.test.js`: Exercises `parseMoney`, `isValidMoney`, and `validateBudgetPayloadDetailed` against hostile payloads (SQL injection, XSS vectors, IEEE 754 edge numbers, and oversized transaction caps).
  - `tests/unit-user-scoping.test.js`: Validates user-scoped IndexedDB and offline sync queue keys (`current_budget:${userId}`, `cf_pending_sync:${userId}`, `tt_budget_cloud_version:${userId}`).
  - `tests/unit-esm-syntax.test.js`: Statically verifies top-level import hoisting in `App.jsx` and `indexedDB.js` (BUG-009).
  - `tests/edge-cas-concurrency.test.js`: Verifies CAS optimistic locking conflicts (`baseVersion` mismatch), shrink defense (<10%), and UTF-8 multi-byte length accuracy via `TextEncoder`.
  - `tests/edge-cas-vault-retention.test.js`: Validates `LIMIT 10` historical snapshot retention in `user_backup_versions` and auto-sync single record separation (BUG-003).
  - `tests/edge-auth-invalidation.test.js`: Asserts cookie purging (`Max-Age=0`) on 401/403, `token_version` bump invalidation, and `GATEWAY_KV` session cache resolution (BUG-008).
  - `tests/edge-d1-parameterization.test.js`: Asserts positional parameter binding across all D1 queries and compensating rollback execution on mutation errors (FIN-AUDIT-001).
  - `tests/edge-admin-stats.test.js`: Verifies admin authorization and accurate aggregation of `user_backup_versions` counts (BUG-011).
  - `tests/fix-tooltip-ledger-sync.test.js`: Verifies date cutoff boundary clamping, cross-earner alias matching isolation, and `dailyMatrix` amount alignment in column header hover tooltips.

- **Playwright Distributed Browser E2E & Chaos Suite (`e2e/`):**
  - Configured via `playwright.config.js` running against local Vite dev server.
  - `e2e/ui-reachability.spec.js`: Validates interactive SPA navigation across Dashboard, Main Budget, Ledger, Amortization, and Settings views with zero uncaught console errors.
  - `e2e/network-resilience.spec.js`: Simulates offline drops via `page.route()`, asserts user-scoped offline mutation queueing in localStorage, and verifies queue replay upon reconnection.
  - `e2e/importer-lifecycle.spec.js`: Tests `SpreadsheetImporter.jsx` `finally {}` recovery, proving corrupt file uploads reset the UI to `STAGE.IDLE` without freezing the spinner (BUG-010).
  - `e2e/session-security.spec.js`: Validates protected route gating, zero localStorage token storage, and immediate state purging upon `techtrek:user-logout` window events.

---

## 8. Column Header Hover Tooltip Ledger Synchronization & Alias Isolation

- **Viewed Month Clamping:** `tooltipCutoffDate` in `LedgerView.jsx` clamps as-of cutoff to the end of the viewed month when viewing historical months, preventing future-dated activity (e.g. September activity) from leaking into past month views (e.g. August).
- **Matrix Ownership Invariant:** In `getColumnRecentTransactions` (`src/utils/columnTooltipUtils.js`), unmapped transactions matching generic statement aliases (e.g. "USAA Transfer") verify `dailyMatrix` ownership on that date. If another earner or bill owns the recorded matrix cell for that date, generic alias matching is suppressed to prevent cross-column transaction hijacking.
- **Matrix Amount Alignment:** Recent activity transactions synchronize their displayed amounts directly with recorded `dailyMatrix` cell overrides for both bills (`_bill_${id}`) and earners (`_credit_${id}`), ensuring 100% parity with ledger grid cell values.

---

## 9. Transactions Grid Drag-and-Drop Interaction & Precision Stabilization (FIX-GRID)

- **Stabilized Pointer Sensor, Explicit Drag Handle & Click Interception (`MatrixPointerSensor`):** Custom sensor subclassing `@dnd-kit/core` `PointerSensor` enforces primary left-click (`event.isPrimary && event.button === 0`), suppresses drag initiation on interactive form controls (`input`, `textarea`, `select`, `[contenteditable]`, and clear action buttons via `data-no-dnd`), while permitting drag initiation only from the explicit `<button data-drag-handle="true">` wrapper around the `GripVertical` icon. Configured `distance: 8`px threshold to cleanly separate click-to-edit from intentional drags. Post-drag click suppression (`dragEndedAtRef` within 250ms) prevents trailing click events from accidentally opening the inline editor upon drop. `onPointerDown={e => e.stopPropagation()}` on `<InlineEdit>` `<input>` elements prevents text-selection pointer events from arming the drag sensor.
- **Physical Layout Stabilization:** Excised `contentVisibility: 'auto'` from matrix `<tbody>` elements, ensuring stable physical DOM bounding box coordinates across all loaded month groups for 100% reliable cross-month and cross-row drag-and-drop targeting.
- **Decoupled Droppable Subscriptions & Corridor Guard:** Removed per-cell `useDndContext()` subscriptions and dynamic `disabled` toggling from `DroppableCellTd`, eliminating thousands of unnecessary re-renders per drag move. `matrixCollisionDetection` combines direct `pointerWithin` detection with column-scoped `closestCenter` fallbacks, plus a ±45px horizontal corridor guard that returns `[]` when the pointer drifts beyond the active column's X-bounds, preventing accidental cross-column snapping.
- **Cross-Column Earner Credit Drag Fix (FIX-GRID-CC):** `matrixCollisionDetection` now uses a column-scoped `closestCenter` algorithm for `credit_*` fields. When `pointerWithin` returns nothing (pointer is over a non-earner gap column), containers are grouped by earner field. The group whose X-range contains the pointer (with ±20px tolerance) wins and supplies its cells exclusively to `closestCenter`. This prevents the source column's vertically-adjacent rows from out-competing the destination column on centroid distance, enabling reliable cross-column drag targeting (e.g. moving a credit from the "Jon" column to the "Ronnie" column). If the pointer is not within any earner column X-range, `[]` is returned to cleanly cancel drop targeting.
- **Target-Gated Row Selection:** Row click handlers in `<tr>` ignore clicks targeting interactive elements (`button`, `input`, `select`, `textarea`, `[data-drag-handle]`, `[data-matrix-cell]`), preventing row selection toggling when interacting with cell values.
- **Strict Financial Precision & Optimistic Rollback (FIN-AUDIT-003, FIN-AUDIT-004):** All inline edits, cell commits, and date moves enforce `round2(val)` with `Number.EPSILON` boundary protection and `-0` normalization. `moveDailyMatrixCell` snapshots prior cell values and linked descriptions before mutation, guaranteeing atomic rollback on failure.

