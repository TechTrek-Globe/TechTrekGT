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
