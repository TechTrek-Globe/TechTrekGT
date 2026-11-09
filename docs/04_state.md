# TechTrekGT Platform State and Shared Data Governance

## 1. Shared Cloudflare D1 SQLite Schema Rules and Namespace Governance

The TechTrekGT platform utilizes Cloudflare D1 SQLite databases: the shared `personal-budget-db` (ID: `10f220d4-1c10-49e9-b63e-5d4cb08d599f`), the dedicated Finance OS database `finance-os-db` (ID: `1746a2c8-2653-4136-8301-d217748621fa`), the dedicated Outpost Tracker database `outpost-db` (ID: `c41ad6c7-26f1-4ca8-9af8-82990ccb4566`), and the dedicated Wayfinder Guide database `wayfinder-db` (ID: `f95ad16e-8b63-419e-b828-d749b6fdd8f1`). All applications requiring relational persistence bind their database instance as `env.DB`.

### 1.1 Canonical Shared Users Schema

The users table is the single source of truth for identity, authentication credentials, and session state across the ecosystem:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 100000,
  token_version INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  api_key_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Suspended')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  pending_email TEXT,
  sign_in_count INTEGER NOT NULL DEFAULT 0,
  created_app TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
```

### 1.1.1 First-Time Sign-In Exemption & Subsequent Verification Policy
- First-time access: Upon initial registration (`POST /api/auth/register`), the user is issued active session cookies immediately without upfront email verification (`sign_in_count = 1`). For accounts created without an active session (`sign_in_count = 0`), the first login succeeds and increments `sign_in_count = 1`.
- Subsequent sign-in gating: Any subsequent login attempt (`POST /api/auth/login`) by an unverified account (`email_verified !== 1 && !email_verified_at` with `sign_in_count >= 1`) is rejected with HTTP 403 `EMAIL_VERIFICATION_REQUIRED` (`requiresVerification: true`).
- UI verification flow: The sign-in interface switches dynamically to `mode === 'verify'`, prompting for the 8-digit OTP code or offering code resend with a 60-second cooldown timer. Unauthenticated verification via `POST /api/auth/verify-email` marks `email_verified = 1`, issues session cookies, and transitions the user directly into the dashboard.

### 1.2 Shared Account Lifecycle Tables & Email Routing Infrastructure

- email_verifications: Manages one-time verification tokens for registrations and email change requests. Tokens are stored as SHA-256 HMAC digests with a 24-hour expiration window.
- password_resets: Stores single-use tokens and hashed security answers for multi-step password recovery workflows.
- Workers Email Routing (SEND_EMAIL): Both Wayfinder and Finance OS bind native Cloudflare Workers Email Routing (`send_email: [{ name: "SEND_EMAIL" }]`) with sender `noreply@techtrekgt.com` using `cloudflare:email` `EmailMessage` MIME dispatches, ensuring reliable delivery of verification OTPs, password reset codes, and ledger collaboration invites without external API dependencies.

### 1.3 Domain Schema Ownership and Migration Separation

To prevent cross-app schema collisions and maintain developer velocity, each application maintains full ownership of its domain-specific tables through isolated schema files:

- Finance OS (`finance/finance-schema.sql` and `finance/schema.sql` on dedicated `finance-os-db`, ID: `1746a2c8-2653-4136-8301-d217748621fa`): Manages 23 structured personal accounting and cash-flow tables (`users`, `password_resets`, `email_verifications`, `finance_ledgers`, `ledger_invites`, `ledger_shares`, `finance_ledger_settings`, `finance_accounts`, `finance_people`, `finance_bills`, `finance_transactions`, `finance_line_items`, `finance_funding_goals`, `finance_loans`, `finance_daily_matrix`, `finance_account_statement_rows`, `finance_bill_splits`, `finance_person_allocations`, `finance_account_splits`, `finance_dashboard_widgets`, `finance_categories`, `user_backups`, `user_backup_versions`).
- Outpost Tracker (`outpost/auction-schema.sql` on dedicated `outpost-db`, ID: `c41ad6c7-26f1-4ca8-9af8-82990ccb4566`): Manages 24 commercial resale tables (`users`, `email_verifications`, `password_resets`, `auction_invoices`, `auction_items`, `auction_sales`, `auction_platforms`, `auction_comps`, `market_comps`, `auction_supplies`, `listing_traffic`, `auction_item_analytics`, `outpost_sync_settings`, `outpost_sync_history`, `api_integrations`, `ebay_oauth_tokens`, `ebay_webhook_events`, `ebay_fee_reconciliations`, `ebay_listings_cache`, `ebay_active_listings`, `auction_item_images`, `auction_item_specs`, `auction_item_platform_listings`, `ebay_reconciliation_fee_lines`).
- VineScout (vinescout/vinescout-schema.sql): Manages Amazon Vine analytics tables (vine_items, vine_orders, vine_tax_settings, vine_asin_cache).
- Wayfinder (`wayfinder/schema-wayfinder.sql` on dedicated `wayfinder-db`, ID: `f95ad16e-8b63-419e-b828-d749b6fdd8f1`): Manages 16 normalized identity and travel coordination tables (`users`, `email_verifications`, `password_resets`, `wayfinder_journeys`, `wayfinder_destinations`, `wayfinder_itinerary_items`, `wayfinder_documents`, `wayfinder_extraction_jobs`, `wayfinder_extracted_fields`, `wayfinder_expenses`, `wayfinder_expense_splits`, `wayfinder_expense_settlements`, `wayfinder_audit_events`, `wayfinder_email_inboxes`, `wayfinder_gmail_connections`, `wayfinder_packing_items`, `wayfinder_calendar_tokens`, `wayfinder_agenda_invites`, `wayfinder_agenda_shares`).
- Bourbon Sommelier: Maintains zero tables in D1. Bourbon ingests catalog data via an external Google Sheet CSV feed with edge caching in Cloudflare Cache API (300-second TTL) and static JSON fallbacks.

### 1.4 Namespace Isolation and Indexing Conventions

- Domain Prefixes: Application-specific tables must use explicit domain prefixes (e.g. auction_*, vine_*, wf_*) to avoid naming collisions within the shared SQLite catalog.
- Foreign Key Indexing: All domain tables referencing users(id) must maintain an explicit index on user_id (e.g. idx_auction_items_user_id, idx_vine_items_user_id) to ensure optimal query performance and prevent full-table scans.
- Database-Level Uniqueness Constraints: Critical entity states (such as auction_sales(item_id) and auction_items(sku)) enforce SQLite UNIQUE constraints to eliminate race conditions, duplicate SKU assignment, and collisions between concurrent sync and manual creation operations. Expression indexing on json_extract(auction_items.attributes, '$.order_id') provides fast, deterministic order-level deduplication for multi-order ingestion.

### 1.5 D1 Single-Writer Concurrency Governance

Because Cloudflare D1 operates a single-primary SQLite engine, all write transactions across all applications are serialized on a single coordinator lock. The following rules govern database access:

- Short Write Transactions: Keep write statements bounded and fast. Never execute network fetches, external API calls, or long iterations while holding a transaction.
- Debounced Persistence: High-frequency client mutations must be debounced before writing to D1 (e.g. Finance OS debounces cloud vault backups to 5,000ms).
- Atomic Batch Statements: Use env.DB.batch([...]) for multi-row operations to ensure atomic execution within a single database round-trip.
- Zero Interactive Multi-Statement Transactions: D1 does not support interactive transactions across asynchronous I/O. Use compensating rollback logic in catch blocks for complex multi-step state mutations.

## 2. Shared JWT Claims Architecture

Session authentication across the platform relies on compact JSON Web Tokens (JWT) signed via HMAC-SHA256 (HS256) using WebCrypto:

### 2.1 Claims Payload Schema

The JWT payload is intentionally minimalist and opaque:

```json
{
  "userId": "usr_9f82c1a4e0",
  "exp": 1791196800,
  "tv": 3
}
```

- userId: String matching the user primary key in users(id).
- exp: Numeric UNIX timestamp in seconds defining token expiration.
- tv: Integer representing the token version at time of issuance, matched against users.token_version.

### 2.2 Privacy Preservation Policy

No personal identifiable information (PII) such as email addresses, display names, or role arrays is permitted within the JWT payload. This guarantees that token inspection reveals no private user information. Full user profile details are resolved dynamically at runtime by querying D1 via GET /api/auth/me.

### 2.3 Shared Cryptographic Signing

All Workers verify incoming tokens using the shared secret JWT_SECRET provisioned via Cloudflare secrets. A token issued by Outpost or Finance is cryptographically valid when presented to Landing Gateway or Wayfinder.

## 3. Cookie Transport Policies and Path Scoping

Sessions are transported exclusively via browser cookies configured with defense-in-depth flags:

### 3.1 Standard Cookie Attributes

- auth_token: Holds the primary JWT session token. Attributes: HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000 (30 days).
- csrf_token: Holds the double-submit CSRF defense token. Attributes: Secure; SameSite=Strict; Path=/; Max-Age=2592000 (accessible to client JavaScript for inclusion in X-CSRF-Token request headers).
- reset_session: Temporary single-use cookie issued upon verifying password reset credentials. Attributes: HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900 (15 minutes).

### 3.2 Cookie Path Scoping and Multi-Cookie Resolution

In a multi-application environment hosted on the same origin (techtrekgt.com), cookies can be scoped globally (Path=/) or restricted to subpaths (such as Path=/finance and Path=/api):

- Path Collisions: When different applications set cookies with overlapping paths, browsers transmit multiple Cookie: auth_token=... values in request headers, ordered by path specificity.
- Resilient Multi-Cookie Resolution: All Workers employ the shared getAllTokensFromRequest utility to extract all candidate auth_token values. The Worker iterates through candidate tokens sequentially until it finds a cryptographically valid token whose tv claim matches users.token_version in D1. This prevents spurious 401 errors caused by stale cookies on alternate paths.

### 3.3 Session Transport Requirements

- Browser SPA Clients: All client-side fetch requests must include credentials: 'include'. Direct storage of authentication tokens in localStorage or sessionStorage is strictly prohibited.
- Non-Browser Clients: Automated test runners, CLI tools, and background daemons may authenticate by passing `Authorization: Bearer <token>`.
- Single-Credential Invariant: Requests presenting both an auth_token cookie and an Authorization header are rejected with HTTP 400 to prevent ambiguous authentication states.

## 4. Token Revocation and Invalidation Mechanisms

The platform enforces instantaneous, global session invalidation through database-backed token versioning:

### 4.1 Token Version Invariant (users.token_version)

Every authenticated request verified by requireAuth or withAuth validates that the token claim tv exactly equals users.token_version in D1:

```javascript
// Validation invariant
if (decodedPayload.tv !== userRecord.token_version) {
  return fail('SESSION_EXPIRED', 401, 'Session has expired or been revoked');
}
```

### 4.2 Invalidation Triggers

A single atomic increment of users.token_version instantly revokes all outstanding JWT tokens across all devices and browsers for that user:

- Password Reset: Completing a password recovery increments token_version.
- Password Update: Modifying an account password in profile settings increments token_version.
- Email Change Confirmation: Verifying a new email address increments token_version.
- Account Suspension: Setting status = 'Suspended' increments token_version and blocks future logins.
- Global Logout: Calling POST /api/auth/logout with { all: true } increments token_version.

### 4.3 Stale Credential Purging

Whenever an API handler rejects an incoming request due to token expiration, signature failure, or token version mismatch (HTTP 401), the Worker response must include:

```http
Set-Cookie: auth_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict
```

This clears dead credentials from the user browser immediately, preventing continuous unauthorized background polling.

## 5. Architectural Documentation Governance and Purge State

### 5.1 Legacy Architecture Purge Record

All legacy ARCHITECTURE.md files across the monorepo root and all sub-application directories have been permanently deleted. Generation, search, or reliance on ARCHITECTURE.md is strictly forbidden across the codebase.

### 5.2 Historical Artifact Quarantine

- Incident Archive (docs/archive/incidents/): Contains all resolved historical incident analyses and diagnostic reports with [RESOLVED] headers.
- Document Archive (docs/archive/): Contains legacy implementation plans, compliance audits, and reference guides with [ARCHIVED] headers.

### 5.3 Authoritative Distributed Documentation Standard

The distributed 01-04 documentation suite is the sole architectural and state source of truth across the platform:

- docs/01_identity.md: Application scope, tech stack, and role boundaries.
- docs/02_arch.md: Architecture, folder structure, routing, and data flow.
- docs/03_features.md: Implemented features, API endpoints, and user capabilities.
- docs/04_state.md: Database schema, runtime parameters, auth sessions, and state management.

Every agent MUST inspect root docs/04_state.md and the target app's docs/04_state.md before editing code, and MUST update docs/03_features.md and docs/04_state.md upon task completion.

## 6. Shared D1 Database Extensions (personal-budget-db)

The shared Cloudflare D1 database `personal-budget-db` has been extended with the following tables supporting Wayfinder trip utilities:

- `wayfinder_calendar_tokens`: stores 32-character crypto-random subscription tokens for personalized, secure RFC 5545 iCalendar feed delivery (`GET /api/wayfinder/calendar/feed/:token.ics`), with `poll_count` telemetry and instant user-driven revocation.
- `wayfinder_packing_items`: stores user-curated winter expedition gear and packing checklists, with category groupings, checked states, luggage type flags (`carry-on`, `checked`, `personal`), and weight telemetry in grams.
- `wayfinder_expense_splits`: stores fractional group cost allocations and participant liabilities tied to `wayfinder_expenses`.
- `wayfinder_expense_settlements`: logs settle-up debt reimbursement payments between group members across multiple currencies.



## 7. Wayfinder Shared Agenda Tables & Tenant Isolation (personal-budget-db)

New shared-D1 tables owned by Wayfinder: `wayfinder_agenda_invites` (SHA-256 `token_hash` only) and `wayfinder_agenda_shares`. The default journey `poland-christmas-2026` is relationally owned by `usr-1785511589441-3fvgv`. Unaffiliated accounts resolve to `role: 'none'`, preventing cross-tenant document and expense leaks. Wayfinder writes and validates registration verification codes in `email_verifications`. Admin Dashboard provides complete trip membership governance, platform vs. trip role differentiation, and atomic account deletion cascades (`deleteUserAccount`). Details in wayfinder/docs/04_state.md sections 16.10, 16.11, 16.12, 16.13, and 16.14.

## 8. Finance OS Shared Ledger Tables & Tenant Isolation (personal-budget-db)

Shared-D1 tables owned by Finance OS: `finance_ledgers`, `ledger_invites`, and `ledger_shares`. For backwards compatibility, existing personal ledgers map directly to `user.id = ledger_id`. The `resolveLedgerAccess` middleware resolves caller permissions to `owner`, `admin`, `editor`, `viewer`, or `none`, preventing cross-tenant leaks. Details in finance/docs/04_state.md section 10.

## 9. Cross-App Account Isolation & Cascading Deletion

The shared `users` table serves all TechTrekGT applications. Strict app-level isolation via `GET /api/admin/stats` guarantees zero cross-app visibility:
- Finance accounts: strictly accounts with rows in `user_backups`, `user_backup_versions`, `finance_ledgers`, or `ledger_shares`, or `users.created_app = 'finance'`. Other platform accounts (Wayfinder, Outpost) are completely omitted from Finance Admin and API responses.
- Collaborator Governance: `POST /api/admin/ledger-membership/remove` enables administrators to manage or disconnect collaborator memberships on Finance household ledgers.
- Universal Deletion: `deleteUserAccount` (`POST /api/admin/user-delete` and `DELETE /api/admin/user`) performs atomic cascading cleanups across all domain tables (`ledger_shares`, `ledger_invites`, `user_backups`, `user_backup_versions`, `finance_ledgers`, `email_verifications`, `password_resets`, optional `wayfinder_*` and `auction_*` tables, and `users`).

## 10. Shared D1 Write-Volume Governance & Idempotency State (personal-budget-db)

- Isolate-Scoped DDL Initialization: Runtime schema guards (such as `ensureSyncHistoryTable` in Outpost and `ensureTables` in Finance) cache initialization state in memory (`WeakSet` / module flag) and never execute `ALTER TABLE` statements on request hot paths.
- Differential Upserts Over Destructive Replace: Tables with multiple secondary indexes (`listing_traffic`, `auction_items`, `vine_items`, `vine_asin_cache`) prohibit unconditional `INSERT OR REPLACE` with random UUIDs on recurring sync paths, using deterministic keys and `ON CONFLICT DO UPDATE ... WHERE` diff guards to prevent index write amplification.
- Webhook & Multi-Tab Sync Idempotency: `ebay_webhook_events` deduplicates retries via `ebw_${notificationId}` with `INSERT OR IGNORE`, and `POST /api/ebay/sync-all` enforces a 3-minute cooldown for background auto-polls (`manual: false`).
- Finance OS Cloud Vault Idempotency & Read-Only GET Enforcement (FIX-30): `POST /api/sync/backup` short-circuits with zero D1 writes when `data_byte_length` and `data` match the stored `user_backups` row on automated syncs (`manual !== true`). Client-side `LedgerDataContext` gates initial IndexedDB hydration (`isSeedHydratedRef`), skips auto-pushes when the FNV-1a payload fingerprint (`lastSyncedPayloadHashRef`) is unchanged, and clears `cf_pending_sync:${ledgerId}` on HTTP 409/4xx responses. `GET /api/admin/stats`, `GET /api/finance/ledgers`, and `resolveLedgerAccess` synthesize default personal ledger metadata in memory without executing `ensureLedgerTables` or `INSERT OR IGNORE INTO finance_ledgers` on GET requests.
- Wayfinder Guide D1 Write Remediation & Read-Only GET Enforcement: `expenses.js`, `packing.js`, `calendar.js`, and `agendaAccess.js` guard DDL creation with isolate-scoped singleton promises, eliminate hot-path `ALTER TABLE` statements, and bypass DDL on `GET` requests unless `no such table` is encountered. `GET /api/wayfinder/import-jobs/:doc_id` returns virtual preview objects without inserting into `wayfinder_extraction_jobs` or `wayfinder_extracted_fields`, and `GET /api/wayfinder/calendar/feed/:token.ics` throttles `poll_count` updates to once per 6 hours. `packing.js` deduplicates `apply_preset` items by `(category, name)`, `expenses.js` diffs splits on `PUT` before rewriting `wayfinder_expense_splits`, `email-worker.js` deduplicates inbound emails by confirmation number or `(title, local_date)`, `PackingManager.jsx` debounces item `PUT` requests by 400ms, and `mutationQueue.js` caps offline retry attempts at 5.

## 11. Dedicated Database & Relational Normalization State (`finance-os-db`, `outpost-db`, and `wayfinder-db`)

- **Finance OS Dedicated Database (`finance-os-db`, ID: `1746a2c8-2653-4136-8301-d217748621fa`)**:
  - Bound via `env.DB` in `finance/wrangler.jsonc`.
  - Schema: 23 tables defined in `finance/finance-schema.sql` and `finance/migrations/0012_deep_relational_normalization.sql`.
  - Decomposes statement rows (`finance_account_statement_rows`), bill splits (`finance_bill_splits`), earner allocations (`finance_person_allocations`), account splits (`finance_account_splits`), dashboard widgets (`finance_dashboard_widgets`), and categories (`finance_categories`).
  - Promotes typed scalar columns onto `finance_accounts`, `finance_bills`, `finance_transactions`, and `finance_funding_goals`.
  - Preserves exact client fields using present-keys (`_p`) tracking in `functions/utils/structuredBudgetStore.js`.
- **Outpost Tracker Dedicated Database (`outpost-db`, ID: `c41ad6c7-26f1-4ca8-9af8-82990ccb4566`)**:
  - Bound via `env.DB` in `outpost/wrangler.jsonc`.
  - Schema: 24 tables defined in `outpost/auction-schema.sql` and `outpost/migrations/0011_deep_normalization.sql`.
  - Decomposes item galleries (`auction_item_images`), specifications and features (`auction_item_specs`), platform listing links (`auction_item_platform_listings`), fee reconciliation lines (`ebay_reconciliation_fee_lines`), and active eBay listings (`ebay_active_listings`).
  - Coordinated via `functions/utils/normalizedItemStore.js` with strictly parameterized `?` bindings.
- **Wayfinder Guide Dedicated Database (`wayfinder-db`, ID: `f95ad16e-8b63-419e-b828-d749b6fdd8f1`)**:
  - Bound via `env.DB` in `wayfinder/wrangler.jsonc`.
  - Schema: 16 tables defined in `wayfinder/schema-wayfinder.sql`.
  - Promotes 16 structured booking metadata columns (`supplier`, `confirmation_number`, `booking_reference`, `origin`, `destination`, `room_type`, `seat`, `guests`, `tickets`, `language`, `duration`, `pickup_window`, `bag_restriction`, `mobile_ticket_url`, `activity_details_url`, `import_source`) onto `wayfinder_itinerary_items` and structured audit columns (`target_user_id`, `target_email`, `previous_value`, `new_value`, `metadata_summary`) onto `wayfinder_audit_events`.



