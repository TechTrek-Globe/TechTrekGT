# Plan: Shared Ledger Collaboration, Email Invitations, & Tenant Isolation (Finance OS)

Status: PENDING REVIEW. No source code has been modified.
Companion to: Wayfinder's `wayfinder/docs/PLAN_shared_agenda_invites.md` and `wayfinder/docs/PLAN_tenant_isolation_fix.md`.

---

## 0. Pre-Flight Findings & Workspace Context

- **Forbidden Files**: `ARCHITECTURE.md` was NOT searched for or read per mandatory workspace rules. Architectural context was sourced strictly from `docs/01_identity.md`, `docs/02_arch.md`, `docs/03_features.md`, `docs/04_state.md`, `finance/docs/01_identity.md`, `finance/docs/02_arch.md`, `finance/docs/03_features_4.md`, `finance/docs/04_state_4.md`, and code inspection.
- **Runtime Stack**:
  - Pure JavaScript (React 19, Vite 6, Tailwind CSS 3.4). **Zero TypeScript (.ts/.tsx)**.
  - Custom SPA history router (`window.history.pushState` and `popstate` in `src/App.jsx`). **No react-router-dom**.
  - Serverless Worker ESM format (`src/worker.js` and `functions/api/*`) executing on Cloudflare Workers edge runtime.
  - Shared Cloudflare D1 SQLite database `personal-budget-db` bound as `env.DB`.
- **Mandatory Invariants**:
  - **FIN-AUDIT-001**: All D1 SQLite queries strictly use positional `?` parameter binding (`db.prepare(sql).bind(...)`). Zero template literal interpolation. Multi-step mutations include compensating D1 cleanup statements in catch blocks.
  - **FIN-AUDIT-002**: Shared SSO JWT authentication via HttpOnly cookies (`auth_token` and `csrf_token`) and WebCrypto HS256. Zero tokens in `localStorage`. Stale credential purging on 401/403.
  - **FIN-AUDIT-004**: React contexts strictly listen to `techtrek:user-logout` window events to purge active state, caches, and markers.
  - **Windows PowerShell Build & Deploy**: Atomic `npm run build` followed by deployment execution.

---

## 1. Database Schema & Access Model (D1 SQLite)

Append migration tables to `finance/schema.sql` and execute against `personal-budget-db`:

```sql
-- ------------------------------------------------------------------
-- Shared Ledger Collaboration & Tenant Isolation Schema
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_ledgers (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT 'Household Budget',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_finance_ledgers_owner ON finance_ledgers(owner_id);

CREATE TABLE IF NOT EXISTS ledger_invites (
  id            TEXT PRIMARY KEY,
  ledger_id     TEXT NOT NULL,
  invited_email TEXT NOT NULL COLLATE NOCASE,
  role          TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  token_hash    TEXT NOT NULL UNIQUE,       -- SHA-256 hex digest of the raw random token
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  invited_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,              -- datetime('now', '+7 days')
  accepted_at   TEXT,
  accepted_by   TEXT,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ledger_invites_ledger ON ledger_invites(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_invites_email  ON ledger_invites(invited_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_invites_pending
  ON ledger_invites(ledger_id, invited_email) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS ledger_shares (
  id         TEXT PRIMARY KEY,
  ledger_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  invite_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ledger_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invite_id) REFERENCES ledger_invites(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_shares_user   ON ledger_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_shares_ledger ON ledger_shares(ledger_id);
```

### Access Tiers & Permission Matrix

Role resolution returns exactly one of: `owner | admin | editor | viewer | none`.

| Capability / Resource | Owner / Platform Admin | Share Admin | Editor | Viewer | None (Unaffiliated) |
|---|---|---|---|---|---|
| Read Ledger & Balances | **RW** | **RW** | **RW** | **R** | **403 Forbidden** |
| Push Cloud Backup (`/api/sync/backup`) | **RW** | **RW** | **RW** | **403** | **403 Forbidden** |
| Pull Cloud Restore (`/api/sync/restore`) | **R** | **R** | **R** | **R** | **403 Forbidden** |
| Backup Snapshot History (`/api/sync/versions`) | **R** | **R** | **R** | **R** | **403 Forbidden** |
| Restore Historical Snapshot (`/api/sync/restore-version`) | **RW** | **RW** | **RW** | **403** | **403 Forbidden** |
| Delete Historical Snapshot (`/api/sync/delete-version`) | **RW** | **RW** | **403** | **403** | **403 Forbidden** |
| Manage Invitations (`POST`, `DELETE /invites`) | **RW** (Can grant admin) | **RW** (Viewer/Editor only) | **403** | **403** | **403 Forbidden** |
| Manage Collaborators (`PUT`, `DELETE /shares`) | **RW** (All roles) | **RW** (Viewer/Editor only) | **403** | **403** | **403 Forbidden** |
| Access Metadata (`/api/finance/ledgers/:id/access`) | **R** (`role: 'owner'`) | **R** (`role: 'admin'`) | **R** (`role: 'editor'`) | **R** (`role: 'viewer'`) | **200** (`role: 'none'`) |

---

## 2. Backend Architecture & Tenant Isolation

### 2.1 Core Access Resolver (`functions/utils/ledgerAccess.js`)

Create a dedicated utility following the Wayfinder pattern:
- `ensureLedgerTables(db)`: Idempotently creates tables if not present in test environments or D1.
- `sha256Hex(text)`: Computes SHA-256 digest via `crypto.subtle.digest` and returns a lowercase hex string.
- `isPlatformAdmin(env, user)`: Checks `user.isAdmin === true` or queries `users.is_admin = 1` or `role = 'admin'` using positional `?` binding.
- `resolveLedgerAccess(env, ledgerId, user)`:
  1. If `ledgerId` equals `user.id`: user is the primary `owner`.
  2. Query `finance_ledgers WHERE id = ?`:
     - If row exists and `owner_id === user.id`: returns `role: 'owner'`.
  3. Query `ledger_shares WHERE ledger_id = ? AND user_id = ?`:
     - If row exists: returns `role: share.role`.
  4. Check `isPlatformAdmin(env, user)`:
     - If admin: returns `role: 'admin'`.
  5. Otherwise: returns `role: 'none'`.
- Predicate helpers:
  - `canEdit(role)`: `owner | admin | editor`
  - `canManageShares(role)`: `owner | admin`
  - `canRead(role)`: `owner | admin | editor | viewer`
  - `isOwner(role)`: `owner`
- `ledgerPermissions(role)` helper generating server-side derived permission flags:
  ```javascript
  {
    read: canRead(role),
    edit: canEdit(role),
    manageShares: canManageShares(role),
    isOwner: role === 'owner',
    role
  }
  ```

### 2.2 Collaboration & Invite Endpoints (`functions/api/finance/ledger-shares.js`)

Implement modular handler `handleLedgerShares(context, url, method)` with full route dispatch:

1. `POST /api/finance/ledgers/:id/invites`:
   - Requires authenticated session and `canManageShares(role)`.
   - Admin cannot grant `admin` role (strictly owner-only).
   - Validates email format via `EMAIL_REGEX`.
   - Rate limits invite creation via `RATE_LIMITER` / KV (20/hr).
   - Generates 32 cryptographically secure random bytes via `crypto.getRandomValues(new Uint8Array(32))`, base64url encoded.
   - Computes `token_hash = sha256Hex(rawToken)`. Raw token is never stored in D1.
   - Atomically in D1 batch:
     - Revokes any existing pending invite for the same email & ledger.
     - Inserts new record into `ledger_invites` with 7-day expiration (`datetime('now', '+7 days')`).
   - Dispatches email via multi-strategy email helper (`functions/utils/inviteEmail.js`), supporting `SEND_EMAIL` binding and `RESEND_API_KEY` fallback.
   - Returns `{ success: true, inviteId, email, role, token, inviteLink, expiresAt, emailSent, emailError }` (raw token returned so UI can present instant one-click copy link fallback).

2. `GET /api/finance/invites/verify?token=<TOKEN>`:
   - Public endpoint (no auth required).
   - Rate limited per IP (30 req / 60s).
   - Hashes incoming token and queries `ledger_invites` joined with `finance_ledgers` and `users` (inviter).
   - Returns invite status:
     - Valid: `{ valid: true, ledgerId, ledgerTitle, role, invitedEmail, inviterName, expiresAt, accountExists }`.
     - Invalid / Expired / Revoked / Used: `{ valid: false, reason: 'invalid'|'expired'|'revoked'|'used' }` with HTTP 404/410.

3. `POST /api/finance/invites/claim`:
   - Requires active authenticated session (`auth_token` cookie).
   - Validates incoming token is pending and not expired (`expires_at > datetime('now')`).
   - Validates session email matches `invited_email` (case-insensitive).
   - Rejects if caller is already the owner of the ledger (`400 Bad Request`).
   - Executes atomic D1 batch:
     - Statement 1: `UPDATE ledger_invites SET status = 'accepted', accepted_at = datetime('now'), accepted_by = ? WHERE id = ? AND status = 'pending' AND expires_at > datetime('now')`.
     - Statement 2: `INSERT INTO ledger_shares (id, ledger_id, user_id, role, invite_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(ledger_id, user_id) DO UPDATE SET role = CASE WHEN excluded.role = 'admin' THEN 'admin' WHEN excluded.role = 'editor' AND ledger_shares.role != 'admin' THEN 'editor' ELSE ledger_shares.role END`.
   - Inspects `results[0]?.meta?.changes`. If 0 rows updated, fails closed with HTTP 409 Conflict.
   - Includes compensating catch block to handle mutation failure safely.
   - Returns `{ success: true, ledgerId, role }`.

4. `GET /api/finance/ledgers/:id/access`:
   - Authenticated endpoint returning `{ ledgerId, role, permissions: ledgerPermissions(role) }`.
   - Returns HTTP 200 with `role: 'none'` for unlinked users (no 404 leak).

5. `GET /api/finance/ledgers/:id/invites`:
   - Requires `canManageShares(role)`.
   - Returns `{ invites: [...], shares: [...], myRole: role }`.

6. `DELETE /api/finance/ledgers/:id/invites/:inviteId`:
   - Requires `canManageShares(role)`.
   - Sets `status = 'revoked'` on pending invite.

7. `PUT /api/finance/ledgers/:id/shares/:userId` & `DELETE /api/finance/ledgers/:id/shares/:userId`:
   - Requires `canManageShares(role)`.
   - Changing or removing an `admin` collaborator requires `role === 'owner'`.

8. `GET /api/finance/ledgers`:
   - Returns personal ledger plus all accepted shared ledgers for the caller.

### 2.3 Email Dispatch Service (`functions/utils/inviteEmail.js`)

Port the multi-strategy email dispatcher from Wayfinder:
- Standard sender: `env.MAIL_FROM || 'noreply@techtrekgt.com'`.
- Strategy 1: Cloudflare Workers `cloudflare:email` `EmailMessage` with MIME multipart (text + HTML).
- Strategy 2: Cloudflare structured `send({ to, from, subject, text, html })`.
- Strategy 3: Cloudflare object-based send.
- Strategy 4: External `https://api.resend.com/emails` fallback using `env.RESEND_API_KEY`.
- Never throws: returns `{ sent: boolean, error?: string }` so invitation creation succeeds and returns the manual copy link even if SMTP delivery is rejected.

### 2.4 Tenant Isolation Audit Across Sync Endpoints (`src/worker.js`)

Audit all existing `/api/sync/*` handlers to resolve access dynamically against the target `ledgerId`:
- Extract `ledgerId`:
  `const targetLedgerId = body?.ledgerId || url.searchParams.get('ledgerId') || userId;`
- Resolve access via `resolveLedgerAccess(env, targetLedgerId, auth.user)`:
  - `POST /api/sync/backup`: Fails with `403 Forbidden` unless `canEdit(role)`. Binds `targetLedgerId` into `user_backups` and `user_backup_versions`.
  - `GET /api/sync/restore`: Fails with `403 Forbidden` unless `canRead(role)`. Selects from `user_backups WHERE id = ?` binding `targetLedgerId`.
  - `GET /api/sync/versions`: Fails with `403 Forbidden` unless `canRead(role)`. Selects from `user_backup_versions WHERE user_id = ?` binding `targetLedgerId`.
  - `POST /api/sync/restore-version`: Fails with `403 Forbidden` unless `canEdit(role)`.
  - `POST /api/sync/delete-version`: Fails with `403 Forbidden` unless `canManageShares(role)`.

### 2.5 Registration Auto-Linking Support (`functions/api/auth/register.js`)

- Add optional `inviteToken` property to the registration payload.
- If present, verify token validity and ensure `email.toLowerCase() === invite.invited_email.toLowerCase()`.
- Upon successful registration, set `email_verified = 1` and `email_verified_at = datetime('now')` (receiving the invite email proves inbox ownership), issue session cookies, and return the session so the client can immediately claim the invite.

---

## 3. Frontend Flow & Guardrails (React 19 / JSX)

### 3.1 Invitation Claim Flow (`src/components/InviteClaim.jsx`)

Create new route component mounted at `/finance/invite`:
- Captures token from URL search parameter `?token=<TOKEN>` or `sessionStorage` (`finance_pending_invite`).
- Calls `GET /api/finance/invites/verify?token=...` on mount.
- Branches:
  - **Case A (Authenticated User)**:
    - If `user.email` matches `invitedEmail`: displays an invitation card with Ledger Title, Inviter Name, Assigned Role, and an **"Accept & Open Ledger"** button.
    - Clicking Accept invokes `POST /api/finance/invites/claim`, sets `activeLedgerId`, and redirects to `/finance/dashboard`.
    - If email does not match: displays an email mismatch alert explaining that the invite was sent to `<invitedEmail>`, offering a "Switch Account" action that logs out and prompts sign-in.
  - **Case B (Unauthenticated, `accountExists === true`)**:
    - Displays an inline sign-in card with email pre-filled and locked (read-only).
    - Upon successful login, automatically triggers `claim()` and navigates to the shared ledger.
  - **Case C (Unauthenticated, `accountExists === false`)**:
    - Displays an inline registration form with email pre-filled and locked (read-only).
    - Passes `inviteToken` to `register(...)`. Upon account creation and session issuance, automatically claims and navigates to the shared ledger.
  - **Error States**: Explanatory cards for `invalid`, `expired`, `revoked`, and `used` tokens with a button to return to `/finance`.

### 3.2 Share Management Modal (`src/components/ShareLedgerModal.jsx`)

Create modal opened from AppLayout header or Settings:
- Invite Form:
  - Email input and Role selector (`viewer`, `editor`, and `admin` if caller is `owner`).
  - Send button triggering `POST /api/finance/ledgers/:id/invites`.
- One-Click Link Copy Fallback:
  - If email delivery fails or succeeds, displays the generated link in a read-only input with a "Copy link" button and visual confirmation.
- Collaborators List:
  - Lists current collaborators with avatars/names, emails, and active roles.
  - Role dropdown allowing Owner to promote/demote editors/viewers.
  - Trash button to remove collaborator.
- Pending Invites List:
  - Lists pending invitations with expiration dates and a "Revoke" action.

### 3.3 Context Gating & Tenant Isolation (`LedgerDataContext.jsx` & `BudgetMetadataContext.jsx`)

- Manage `activeLedgerId` state (defaults to `currentUserId`).
- Provide `switchLedger(ledgerId)` to switch between personal and shared ledgers.
- Expose `ledgerRole` and `ledgerPermissions` fetched from `GET /api/finance/ledgers/:id/access`.
- **Unaffiliated Gate (`role === 'none'`)**:
  - Render a `NoAccessPanel` inside `MainContent`: explains that the ledger is private or no invite was linked, provides a button to switch to personal ledger or claim an invite.
- **Role-Aware UI Restrictions**:
  - `viewer` (read-only):
    - Disable inline matrix edits (`InlineEdit` disabled).
    - Suppress drag-and-drop handles (`GripVertical`).
    - Disable or hide Add Transaction, Add Bill, and Add Account buttons.
    - Suppress automated background backup pushes (`pushCloudBackup` no-op for viewer).
    - Render a clean "Viewing Shared Ledger (Read-Only)" badge in the top bar.
  - `editor`:
    - Full transaction, bill, and matrix editing capabilities and auto-sync.
    - Share management buttons hidden.
  - `admin` & `owner`:
    - Full editing plus "Share Ledger" button in header.
- **FIN-AUDIT-004 Event Listener**:
  - React contexts listen for `techtrek:user-logout` window event:
    - Purges in-memory budget metadata, accounts, bills, transactions, matrix.
    - Resets `activeLedgerId` to null.
    - Clears `ledgerRole` and `ledgerPermissions`.

### 3.4 Custom SPA Routing Updates (`src/App.jsx`)

- Normalize and recognize `/finance/invite` in `getRouteFromPathname` and `MainContent`:
  - Permit `/finance/invite` to render `InviteClaim` component regardless of `isAuthenticated` state.
  - Preserve redirect and search parameters during login/register transitions.
- Add active ledger selector / switcher to `AppLayout.jsx` top bar when the user belongs to multiple ledgers.

---

## 4. Verification Plan

1. **Automated Unit & Edge Test Suite**:
   - `tests/edge-tenant-isolation.test.js`:
     - Test four account tiers: Owner, Share Admin, Editor, Viewer, and Unaffiliated User.
     - Verify status codes and response bodies across `/api/sync/backup`, `/api/sync/restore`, `/api/sync/versions`, `/api/sync/restore-version`, and `/api/sync/delete-version`.
     - Assert unaffiliated user receives HTTP 403 Forbidden with zero row data.
     - Assert viewer receives HTTP 403 on writes (`POST /api/sync/backup`).
   - `tests/edge-ledger-invites.test.js`:
     - Test invite generation, SHA-256 token hashing, single-use acceptance, expiration rejection, email mismatch rejection, and atomic batch claim.
     - Verify compensating D1 rollback on mutation error.
2. **Regression Validation**:
   - Run `npm run test:unit` in `finance/` to ensure all existing 10 test suites (48 tests) continue to pass with 0 regressions.
3. **Build & Deployment Cycle**:
   - Execute `npm run build` in `finance/` to confirm zero lint errors, proper bundle chunking, and serialization audit passage.
   - Execute `npm run deploy` to Cloudflare Workers and verify live edge URL.

---

## 5. Documentation Synchronization (Post-Implementation)

1. `finance/docs/03_features_4.md`: Document shared ledger collaboration, access tiers matrix, and all new `/api/finance/*` endpoints.
2. `finance/docs/04_state_4.md`: Document `ledger_invites`, `ledger_shares`, and `finance_ledgers` tables, client-side `activeLedgerId`, `ledgerRole`, and `ledgerPermissions` state variables.
3. Root `docs/03_features.md` & `docs/04_state.md`: Document shared D1 catalog schema additions.

---

## 6. Open Decisions for User Review

1. **Ledger Identifier Model**:
   - Proposed: A user's primary personal ledger ID matches their `userId` (`user_backups.id = user.id`), ensuring 100% backward compatibility for all existing user backups with zero data migrations. Shared ledgers reference this `ledger_id`.
   - Alternative: Create distinct UUIDs for all ledgers and migrate existing `user_backups` keys. (Proposed approach is simpler, safer, and zero-downtime).
2. **Viewer Tab Access**:
   - Proposed: Viewers have read-only access to Dashboard, Main Budget, Ledger, and Amortization views, but Backup & Sync settings and Share settings are restricted.
3. **Invite Expiration Window**:
   - Proposed: 7-day expiration window (`datetime('now', '+7 days')`), matching Wayfinder.

