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
- **`LedgerDataProvider` (`src/context/LedgerDataContext.jsx`):** Manages historical transactions, imported ledger rows, daily matrix balances, and cash-flow projections.
- **`useBudget()` hook:** Composes metadata and ledger data via memoization for consumer components.

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

## 7. Financial Math Engine & State Calculation Invariants (FIN-AUDIT-003)

- **Sanitization on Ingestion & Migration:**
  - `cleanNum` and `parseMoney` strip non-numeric formatting (currency symbols, commas, trailing whitespace) and convert accounting parentheses into signed numbers before any raw cell or CSV input enters the state tree.
  - Non-numeric or non-finite inputs (`NaN`, `Infinity`, `null`, `undefined`) are safely coerced to zero (or explicit nulls where required by database schemas), completely blocking silent `NaN` poisoning.
- **State Calculation Invariants:**
  - **Running Balance Precision:** `getCalculatedBalanceAsOf`, `getTotalCashOnHand`, and `getTotalMonthEndCashOnHand` accumulate values using `round2` at each step, preventing sub-cent floating-point accumulation drift over 365-day projection horizons.
  - **Negative Zero Normalization:** Any arithmetic yielding `-0` is automatically converted to `0` by `round2` via `Object.is(val, -0) ? 0 : val`, guaranteeing deterministic state serialization.
  - **Credit Allocation Conservation:** `allocateEarnerCredit` enforces that total earner distributions strictly equal the earner's deposit (`earnerReg + earnerExtra === earnerDeposit`), preventing balance phantom surpluses or deficits.
  - **Amortization Schedule Integrity:** `AmortizationView` accumulates interest, principal, and balance reductions with deterministic 2-decimal rounding per monthly period, preventing amortized total interest drift.
- **Zero Drift Storage Mandate:** All balances stored in IndexedDB or sent to Cloudflare D1 via `/api/sync/backup` are guaranteed to be finite 2-decimal numbers.
