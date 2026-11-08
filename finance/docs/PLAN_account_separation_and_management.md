# Plan: Cross-App Account Separation, Ledger Association, & Account Deletion in Finance OS

## Executive Summary
In TechTrekGT, all applications share a single Cloudflare D1 database (`personal-budget-db`) and a shared `users` table.
When accounts are created in Wayfinder (`jonkempato@gmail.com`, `jonkempato1@gmail.com`) or Outpost, they reside in the shared `users` table. Currently, Finance OS's Admin Panel (`/finance/admin`) queries all rows from `users`, displaying Wayfinder accounts inside Finance OS with "0 Backups" and providing no tools to separate apps, associate users with ledgers, or delete accounts.

This plan establishes:
1. **Cross-App Account Separation:** Dynamic classification separating Finance accounts from Wayfinder and Outpost accounts so Wayfinder accounts do not appear in the primary Finance accounts list.
2. **Account Association:** An administrative capability to associate any platform account into a Finance ledger with specified permissions (`viewer`, `editor`, `admin`), or disconnect them.
3. **Universal Account Deletion:** An administrative account deletion endpoint (`/api/admin/user-delete`) with cascading cleanup across all domain tables (`ledger_shares`, `ledger_invites`, `user_backups`, `user_backup_versions`, `finance_ledgers`, `email_verifications`, `password_resets`, and `users`).

---

## 1. App Classification & Schema Governance

### 1.1 App Origin Tracking
- Add `created_app TEXT DEFAULT NULL` to the `users` table definition in `finance/schema.sql`.
- In `finance/functions/api/auth/register.js`, stamp `created_app = 'finance'` when registering new users.
- For existing records and accounts registered in other apps, derive app affiliation dynamically:
  - **Finance:** User has an active backup in `user_backups`, historical snapshots in `user_backup_versions`, owns a ledger in `finance_ledgers`, has a share in `ledger_shares`, or has `created_app === 'finance'`.
  - **Wayfinder:** User has records in `wayfinder_agenda_shares`, `wayfinder_journeys`, `wayfinder_documents`, `wayfinder_expenses`, `wayfinder_packing_items`, or `created_app === 'wayfinder'`.
  - **Outpost:** User has records in `auction_platforms`, `auction_items`, `auction_sales`, `auction_invoices`, or `created_app === 'outpost'`.
  - **Unaffiliated / General:** User has an account but has not yet been linked to a specific domain entity.

---

## 2. Serverless Backend Architecture (`functions/api/admin/`)

### 2.1 Enriched Administrative Stats (`GET /api/admin/stats`)
Update `finance/functions/api/admin/stats.js` to:
1. Query all users from `users`.
2. Query `user_backups`, `user_backup_versions`, `finance_ledgers`, `ledger_shares`, `ledger_invites`.
3. Query Wayfinder and Outpost presence tables (wrapped in try/catch for schema isolation).
4. Categorize users into:
   - `financeUsers`: Users who own or collaborate on a Finance ledger or have budget backups.
   - `otherUsers`: Users created on Wayfinder, Outpost, or unaffiliated.
5. Query and return active ledgers and their collaborator groups (`ledgers`) for administrative management.

### 2.2 Universal Account Deletion (`POST /api/admin/user-delete` & `DELETE /api/admin/user`)
Create `finance/functions/utils/deleteAccount.js` and `finance/functions/api/admin/user-delete.js`:
- Enforces admin authorization (`caller.role === 'admin'`).
- Executes atomic batch deletion across SQLite tables:
  ```sql
  DELETE FROM ledger_shares WHERE user_id = ?;
  DELETE FROM ledger_invites WHERE (invited_email = ?) OR (accepted_by = ?) OR (invited_by = ?);
  DELETE FROM user_backups WHERE id = ?;
  DELETE FROM user_backup_versions WHERE user_id = ?;
  DELETE FROM finance_ledgers WHERE owner_id = ?;
  DELETE FROM email_verifications WHERE user_id = ? OR email = ?;
  DELETE FROM password_resets WHERE user_id = ? OR email = ?;
  -- Wayfinder & Outpost cleanup statements (swallowed gracefully if tables absent)
  DELETE FROM users WHERE id = ?;
  ```
- If caller deletes their own account, emits `Set-Cookie` header with `Max-Age=0` to clear active session.

### 2.3 Ledger Membership Association (`POST /api/admin/ledger-membership`)
Create `finance/functions/api/admin/ledger-membership.js`:
- Endpoint accepting `{ ledgerId, userId, role }` where role is `viewer | editor | admin | none`.
- If role is `viewer | editor | admin`:
  - Inserts or updates `ledger_shares`:
    ```sql
    INSERT INTO ledger_shares (id, ledger_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ledger_id, user_id) DO UPDATE SET role = excluded.role
    ```
- If role is `none` or `unaffiliated`:
  - Deletes row from `ledger_shares`, disconnecting the user from the ledger.

---

## 3. Frontend Admin Dashboard (`AdminView.jsx`)

### 3.1 Account Separation Tabs
- Tab 1: **Finance Accounts (Default)**
  - Displays exclusively users associated with Finance OS.
  - The accounts created on Wayfinder (`jonkempato@gmail.com`, `jonkempato1@gmail.com`) are excluded from this table.
  - Displays: Name, Email, Status, Role on Ledger, Backups Count, Last Backup, Member Since, Actions (Suspend / Activate, Delete).
- Tab 2: **Other Platform Accounts (Wayfinder / Outpost / Unaffiliated)**
  - Displays accounts originating in other applications or unlinked to Finance.
  - Origin Badges: `[Compass] Wayfinder`, `[Package] Outpost`, `[User] Platform`.
  - Actions:
    - **Associate to Ledger:** Dropdown (`Viewer`, `Editor`, `Admin`) and button `[Link2] Associate` to link the account into the household budget.
    - **Suspend / Activate:** Status toggle.
    - **Delete Account:** `[Trash2]` button with confirmation modal.

### 3.2 Household Ledgers & Collaborator Groups Panel
- Dedicated section showing the household budget, primary owner, and active collaborators.
- Role management dropdowns for each collaborator.
- Disconnect button to un-link collaborators and move them back to Unaffiliated.

### 3.3 Account Deletion Modal / Action Guard
- Confirmation dialog displaying target name and email.
- Prevents accidental deletion; issues critical warning if administrator attempts to delete self.

---

## 4. Verification & Testing Plan

1. **Vitest Unit & Edge Tests (`finance/tests/edge-admin-account-management.test.js`):**
   - Verify that `GET /api/admin/stats` separates Finance users from Wayfinder users.
   - Verify that Wayfinder users do not appear in `financeUsers`.
   - Verify that `POST /api/admin/ledger-membership` links an unaffiliated user into `ledger_shares`.
   - Verify that `POST /api/admin/user-delete` cascades cleanly across `user_backups`, `ledger_shares`, `ledger_invites`, and `users`.
   - Verify that self-deletion clears cookies.
2. **Build & Deployment:**
   - Execute production build: `cd e:\TechTrekGT\finance; npm run build`.
   - Deploy to Cloudflare: `cd e:\TechTrekGT\finance; npm run deploy`.
   - Verify live Cloudflare Worker deployment status.
3. **Documentation Synchronization:**
   - Update `finance/docs/03_features_4.md` and `04_state_4.md`.
   - Update `docs/03_features.md` and `04_state.md`.

---

## 5. User Decision Points
1. Should associating an unaffiliated account default to the Primary Owner's Household Budget, or provide a dropdown if multiple ledgers exist? (Default: Primary Household Budget with dropdown fallback).
2. Should deleting an account from Finance OS also clean up any orphaned records in Wayfinder / Outpost? (Recommended: Yes, universal account deletion to ensure complete GDPR/privacy hygiene and zero orphaned records).

