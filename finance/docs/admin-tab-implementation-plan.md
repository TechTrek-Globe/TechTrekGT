# Finance OS - Security Audit & Admin Tab Implementation Plan

## Overview

This document covers two related deliverables:

1. **Part 1 - Security Audit:** A comprehensive audit of the Finance OS backend for data isolation, authentication flow, and injection protection.
2. **Part 2 - Admin Tab:** A new, strictly gated Admin dashboard visible only to the configured admin email, backed by a new API endpoint and a D1 schema migration.

---

## Part 1: Security & Data Isolation Audit Findings

### 1.1 Authentication Flow - PASS

The auth flow is correctly implemented across the stack:

| Control | Implementation | Status |
|---|---|---|
| Password hashing | PBKDF2-SHA256, 310k iterations, per-user salt, 3-part `salt:iters:hash` format | PASS |
| JWT creation | HS256 via WebCrypto `crypto.subtle`, 2-hour expiry embedded in payload | PASS |
| Cookie issuance | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=...` | PASS |
| Session check | `GET /api/auth/me` verifies token + queries DB on every app mount | PASS |
| Token extraction | `getTokenFromRequest()` prefers `Cookie: auth_token=...`, falls back to `Authorization: Bearer` | PASS |
| Inactivity timeout | 15-minute client-side timer; resets on `mousedown`, `keydown`, `scroll`, `touchstart`, `click` | PASS |
| Logout | Clears `sessionStorage`, calls `POST /api/auth/logout`, resets client state | PASS |
| Rate limiting | Login: 10 req/min/IP. Register: 5 req/min/IP. Uses `RATE_LIMIT_KV` binding. | NOTE: KV binding is commented out in `wrangler.jsonc` - rate limiting is silently bypassed in production. |

> [!WARNING]
> **Rate Limit KV Misconfiguration:** The `kv_namespaces` binding for `RATE_LIMIT_KV` is commented out in [`wrangler.jsonc`](file:///e:/TechTrekGT/finance/wrangler.jsonc#L35-L41). The `checkRateLimit()` function in `rateLimit.js` must handle a `null` KV gracefully (it likely does, returning `allowed: true`), meaning rate limiting is currently disabled in production. Low-risk for a single-user system but should be noted.

### 1.2 User-Level Data Isolation - PASS WITH CRITICAL NOTE

#### Cloud Sync (D1 `user_backups` table)

The `handleSyncBackup` and `handleSyncRestore` handlers in [`worker.js`](file:///e:/TechTrekGT/finance/src/worker.js#L120-L214) both:
1. Extract the JWT from the cookie via `getTokenFromRequest()`.
2. Verify the token against `env.JWT_SECRET` via `verifyToken()`.
3. Extract `userId` from the verified payload.
4. Scope all D1 reads/writes using `WHERE id = ?` bound to `userId`.

This is **correct** - a user cannot write another user's backup.

> [!CAUTION]
> **`user_backups` Schema Flaw - Shared Default Vault:** The `handleSyncRestore` query at worker.js:190 is:
> ```sql
> SELECT data, updated_at FROM user_backups
> WHERE id = ? OR id = 'default_vault'
> ORDER BY (CASE WHEN id = ? THEN 0 ELSE 1 END) LIMIT 1
> ```
> This query falls back to a `default_vault` row if a user has no personal backup. If a `default_vault` row exists in the database containing real financial data, **every authenticated user can read it.** The fix is simple: remove the `OR id = 'default_vault'` clause and return 404 cleanly.

#### Financial Data (accounts, bills, people, loans)

All financial data is IndexedDB-local; there are no D1 domain endpoints for accounts/bills/people/loans in Finance OS. The cloud vault backup is a single JSON blob scoped to `userId`. Isolation is enforced at the blob level with no row-level exposure.

### 1.3 Security Headers - PASS

The `addSecurityHeaders()` function in [`worker.js`](file:///e:/TechTrekGT/finance/src/worker.js#L34-L86) applies correctly on every response:

| Header | Value | Status |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | PASS |
| `Content-Security-Policy` | `default-src 'self'` with explicit allowlists | PASS |
| `X-Content-Type-Options` | `nosniff` | PASS |
| `X-Frame-Options` | `DENY` | PASS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | PASS |
| `Permissions-Policy` | Blocks camera, microphone, geolocation, payment | PASS |
| CORS | Allowlist: `techtrekgt.com`, `techtrek-budget.pages.dev`, `localhost:3000` | PASS |

### 1.4 SQL Injection Protection - PASS

All D1 queries use `.prepare('...').bind(value)` parameterized statements exclusively. No string interpolation is used in any SQL query. The `bind()` API uses driver-level parameterization, eliminating SQL injection risk entirely.

### 1.5 CSRF Protection - PASS

The application uses `SameSite=Lax` cookies, which block cookies on cross-origin POST requests (the primary CSRF vector). No explicit CSRF token is implemented; this is acceptable for a JSON-only API with `SameSite=Lax`.

### 1.6 `schema.sql` - Status Column Already Present

The `users` table in [`schema.sql:8`](file:///e:/TechTrekGT/finance/schema.sql#L3-L10) **already includes** `status TEXT NOT NULL DEFAULT 'Active'`. A D1 migration is still required to add this column to the live production database if it was created before this line was added to the schema file.

---

## Part 2: Admin Tab - Implementation Plan

### 2.1 Architecture Decision: Dual-Layer Gating

Admin access uses two independent security gates:

1. **Backend gate (authoritative):** `GET /api/admin/stats` verifies the JWT, extracts `email` from the payload, and compares it using constant-time comparison against `env.ADMIN_EMAIL`. Returns `403 Forbidden` on any mismatch.
2. **Frontend gate (UX only):** The Admin tab and nav item are conditionally rendered only when `user.email === import.meta.env.VITE_ADMIN_EMAIL`. This is convenience, not a security boundary.

### 2.2 Environment Variables

| Variable | Where Set | Purpose |
|---|---|---|
| `ADMIN_EMAIL` | `finance/.dev.vars` + `wrangler secret put ADMIN_EMAIL` | Worker-side admin gate (never exposed to client) |
| `VITE_ADMIN_EMAIL` | `finance/.dev.vars` + `wrangler.jsonc [vars]` | Vite-exposed frontend gate (baked into JS bundle) |

> [!IMPORTANT]
> `VITE_ADMIN_EMAIL` will be visible in the compiled JavaScript bundle. This is intentional and acceptable - it only controls UI visibility; the real security gate is `ADMIN_EMAIL` on the backend.

### 2.3 D1 Migration

**Finding:** The `status` column already exists in `schema.sql`. The migration adds it only to the live production D1 database.

**Migration file to create:** `finance/migrations/0001_add_user_status.sql`

```sql
-- Migration 0001: Add status column to users table
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Active';
```

**Apply commands:**
```powershell
# Apply locally (from e:\TechTrekGT\finance)
wrangler d1 migrations apply personal-budget-db --local

# Apply to production
wrangler d1 migrations apply personal-budget-db --remote

# Verify column exists
wrangler d1 execute personal-budget-db --remote --command "PRAGMA table_info(users);"
```

> [!NOTE]
> SQLite does not support `ADD COLUMN IF NOT EXISTS`. Wrangler's migration runner tracks which migrations have been applied via an internal `d1_migrations` metadata table, so re-running is safe.

### 2.4 Proposed File Changes

---

#### [NEW] `finance/migrations/0001_add_user_status.sql`

SQLite migration to add `status TEXT DEFAULT 'Active'` column to `users` table.

---

#### [NEW] `finance/functions/api/admin/stats.js`

Pages Functions handler (`onRequestGet`):
- Imports `getTokenFromRequest`, `verifyToken` from `../../utils/auth.js`
- Runs JWT verification; returns `401` if missing/invalid
- Compares `payload.email` to `env.ADMIN_EMAIL` via constant-time comparison using `timingSafeStringEqual()` (extracted from `worker.js` into `functions/utils/auth.js`, or re-implemented inline)
- Returns `403` if email does not match
- Runs two D1 queries:
  - `SELECT id, email, name, status, created_at FROM users ORDER BY created_at ASC`
  - `SELECT id, updated_at FROM user_backups`
- Joins in JS to compute `backupCount` (1 or 0) and `lastBackupAt` per user
- Returns JSON: `{ totalUsers: N, users: [...] }`

**Response shape:**
```json
{
  "totalUsers": 3,
  "users": [
    {
      "id": "usr-...",
      "email": "admin@example.com",
      "name": "Jon",
      "status": "Active",
      "createdAt": "2026-01-15T12:00:00.000Z",
      "backupCount": 1,
      "lastBackupAt": "2026-09-14T09:23:00.000Z"
    }
  ]
}
```

---

#### [MODIFY] `finance/src/worker.js`

Minimal addition:
- Add import: `import { onRequestGet as adminStatsHandler } from '../functions/api/admin/stats.js';`
- Add route in the `if/else` chain (before the catch-all `/api/` 404):
  ```js
  } else if (apiPath === '/api/admin/stats' && request.method === 'GET') {
    response = await adminStatsHandler(context);
  }
  ```

---

#### [NEW] `finance/src/components/AdminView.jsx`

React component:
- Imports `useAuth` from `../context/AuthContext`
- Imports `getApiUrl` from `../utils/api`
- On mount, fetches `GET /api/admin/stats` with `credentials: 'include'`
- Handles 403 gracefully (renders "Access Denied" panel)
- Renders:
  - Summary card: Total Users count
  - Table columns: Name, Email, Status (badge: green Active / red Locked), Backups, Last Backup, Joined
- Uses Tailwind classes consistent with `LedgerView.jsx` / `DashboardView.jsx` (dark/light aware)
- Uses `Shield` icon from `lucide-react` in the page header

---

#### [MODIFY] `finance/src/App.jsx`

Two targeted changes:
1. Add `if (path === '/finance/admin') return 'admin';` to `getViewFromPathname()`
2. Add `const AdminView = React.lazy(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));`
3. In `MainContent` render block, add:
   ```jsx
   {activeView === 'admin' && user?.email === import.meta.env.VITE_ADMIN_EMAIL && <AdminView />}
   ```
   (where `user` is destructured from `useAuth()` at the top of `MainContent`)

---

#### [MODIFY] `finance/src/components/AppLayout.jsx`

- Import `useAuth` from `../context/AuthContext`
- Inside `AppLayout`, destructure `user` from `useAuth()`
- Pass `isAdmin` prop (bool) down to `SidebarContent`
- In `SidebarContent`, compute the rendered nav items dynamically:
  ```js
  const visibleNavItems = isAdmin
    ? [...NAV_ITEMS, { id: 'admin', label: 'Admin', icon: Shield, color: 'text-amber-400' }]
    : NAV_ITEMS;
  ```
- Render `visibleNavItems.map(...)` instead of `NAV_ITEMS.map(...)`
- Import `Shield` from `lucide-react`

---

#### [MODIFY] `finance/.dev.vars`

Add two lines:
```
ADMIN_EMAIL=<your-admin-email@domain.com>
VITE_ADMIN_EMAIL=<your-admin-email@domain.com>
```

---

#### [MODIFY] `finance/wrangler.jsonc`

Add `vars` block for the non-secret `VITE_ADMIN_EMAIL`:
```jsonc
"vars": {
  "VITE_ADMIN_EMAIL": "<your-admin-email@domain.com>"
}
```

> [!NOTE]
> `ADMIN_EMAIL` (backend secret) must be set via `wrangler secret put ADMIN_EMAIL` and is never added to `wrangler.jsonc`.

---

### 2.5 Verification Plan

#### Security Tests
1. Log in as non-admin - Admin tab must not appear in sidebar.
2. As non-admin, call `GET /finance/api/admin/stats` directly - must return `403`.
3. Log in as admin - Admin tab appears, dashboard loads with user list.
4. Set `ADMIN_EMAIL` to a wrong value in `.dev.vars`, restart `wrangler dev` - Admin tab disappears for all users.

#### Build Verification
```powershell
cd e:\TechTrekGT\finance
npm run build   # must produce 0 errors
```

#### Migration Verification
```powershell
wrangler d1 migrations apply personal-budget-db --local
wrangler d1 execute personal-budget-db --local --command "PRAGMA table_info(users);"
```

#### Deploy
```powershell
npm run deploy
wrangler secret put ADMIN_EMAIL   # enter email when prompted
```

---

## Open Questions

> [!IMPORTANT]
> **Please answer before approving.** These decisions affect scope and implementation details.

1. **`default_vault` fix** - Should I also fix the data isolation gap in `handleSyncRestore` (remove the `OR id = 'default_vault'` fallback from the restore query) as part of this work? It closes a real isolation hole but could disrupt existing default vault data if any exists.

2. **Rate Limit KV** - Should I uncomment and configure the `RATE_LIMIT_KV` binding as part of this task? It requires running `wrangler kv:namespace create RATE_LIMIT_KV` and adding the namespace ID to `wrangler.jsonc`.

3. **`VITE_ADMIN_EMAIL` in production** - Confirm the plan: add `VITE_ADMIN_EMAIL` to `wrangler.jsonc [vars]` so it is baked in at deploy time. This value will be visible in the built JS bundle (intentional - frontend gating is UX-only).

4. **Status values** - Beyond `'Active'` and `'Locked'`, are additional status values needed (e.g., `'Suspended'`, `'Pending'`)? This affects badge rendering in the Admin UI.

5. **Status toggle (CRUD)** - Should the Admin dashboard support toggling a user's status (Active/Locked) via a `PUT /api/admin/users/:id/status` endpoint? Or is this view-only for now?
