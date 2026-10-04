# TechTrekGT Platform State and Shared Data Governance

## 1. Shared Cloudflare D1 SQLite Schema Rules and Namespace Governance

The TechTrekGT platform utilizes a shared Cloudflare D1 SQLite database named personal-budget-db (ID: 10f220d4-1c10-49e9-b63e-5d4cb08d599f). All applications requiring relational persistence bind this shared database instance as env.DB.

### 1.1 Canonical Shared Users Schema

The users table is the single source of truth for identity, authentication credentials, and session state across the ecosystem:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 600000,
  token_version INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Suspended')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  pending_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
```

### 1.2 Shared Account Lifecycle Tables

- email_verifications: Manages one-time verification tokens for registrations and email change requests. Tokens are stored as SHA-256 HMAC digests with a 24-hour expiration window.
- password_resets: Stores single-use tokens and hashed security answers for multi-step password recovery workflows.

### 1.3 Domain Schema Ownership and Migration Separation

To prevent cross-app schema collisions and maintain developer velocity, each application maintains full ownership of its domain-specific tables through isolated schema files:

- Finance OS (finance/schema.sql): Manages personal accounting tables (accounts, bills, line_items, loans, household_settings, user_backups, user_backup_versions). Note: Legacy relational tables from earlier revisions have been archived into _bak_* tables.
- Outpost Tracker (outpost/auction-schema.sql): Manages commercial resale tables (invoices, items, sales, platforms, comps, market_comps, supplies, listing_traffic, auction_item_analytics, outpost_sync_settings, api_integrations).
- VineScout (vinescout/vinescout-schema.sql): Manages Amazon Vine analytics tables (vine_items, vine_orders, vine_tax_settings, vine_asin_cache).
- Wayfinder (wayfinder/schema-wayfinder.sql): Manages travel coordination tables (journeys, itinerary_items, documents, import_jobs, budgets).
- Bourbon Sommelier: Maintains zero tables in D1. Bourbon ingests catalog data via an external Google Sheet CSV feed with edge caching in Cloudflare Cache API (300-second TTL) and static JSON fallbacks.

### 1.4 Namespace Isolation and Indexing Conventions

- Domain Prefixes: Application-specific tables must use explicit domain prefixes (e.g. auction_*, vine_*, wf_*) to avoid naming collisions within the shared SQLite catalog.
- Foreign Key Indexing: All domain tables referencing users(id) must maintain an explicit index on user_id (e.g. idx_auction_items_user_id, idx_vine_items_user_id) to ensure optimal query performance and prevent full-table scans.
- Database-Level Uniqueness Constraints: Critical entity states (such as auction_sales(item_id)) enforce SQLite UNIQUE constraints to eliminate race conditions between concurrent sync and manual creation operations.

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
- Non-Browser Clients: Automated test runners, CLI tools, and background daemons may authenticate by passing Authorization: Bearer <token>.
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
