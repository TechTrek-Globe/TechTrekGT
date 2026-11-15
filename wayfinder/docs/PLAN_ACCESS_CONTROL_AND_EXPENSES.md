# TechTrekGT Wayfinder - 3-Tier Access Control Audit, Mobile Hub Fix & User-Tailored Expenses Plan

- **Target Trip**: `poland-christmas-2026`
- **Affected Collaborator**: `ronfew02@gmail.com` (`users.id`: `usr-7cfbdbd4-f1f2-4853-915c-2addcdd58fa8`, `name`: `"Ronnie Few"`, `wayfinder_agenda_shares.role`: `"editor"`)
- **Agenda Owner**: `jgk1865@gmail.com` (`users.id`: `usr-1785511589441-3fvgv`, `name`: `"Jon Kemp"`, `role`: `"admin"`, `is_admin`: `1`)
- **Stack**: Pure JS/JSX (React 19, Vite 6, Tailwind CSS 3.4, custom `pushState`/`popstate` routing, React Context + hooks), Cloudflare Workers ESM + D1 (`wayfinder-db`, positional `?` bindings), cookie-based SSO (`credentials: 'include'`).

---

## 1. Root-Cause Diagnosis

### A. Auth & Membership Are Working (No Cookie, Gateway, or Case-Sensitivity Failure)
- `landing/src/worker.js` handles only `/api/ebay/*`, `/api/amazon/fetch`, and `/api/health`. Wayfinder serves `/wayfinder/*` and `/wayfinder/api/*` (and `/api/*`) directly through its own Worker.
- `src/context/AuthContext.jsx` hydrates session state via `/api/auth/me` (`functions/api/auth/me.js`) using `credentials: 'include'`, returning `{ user: { id, email, name, role, isAdmin, ... } }`.
- Live `wayfinder-db` D1 confirms `ronfew02@gmail.com` is present in `users` (`id: "usr-7cfbdbd4-f1f2-4853-915c-2addcdd58fa8"`) and has an active share row in `wayfinder_agenda_shares` (`id: "5fc12832-9468-4421-a715-b12564f6069b"`, `agenda_id: "poland-christmas-2026"`, `role: "editor"`). Email casing matches (`email COLLATE NOCASE` in `schema-wayfinder.sql`).

### B. Why an Authenticated `editor` Is Blocked from Private Hub Features
1. **Backend Role Matrix Excludes `editor` from Sensitive Data (`functions/utils/agendaAccess.js:174-189`)**:
   - `canEdit('editor')` returns `true` and `isMember('editor')` returns `true`, **but `canViewSensitive(role)` returns `role === 'owner' || role === 'admin'`**.
   - Because `agendaPermissions(role)` sets `documents: canViewSensitive(role)` and `expenses: canViewSensitive(role)`, an `editor` receives `{ itinerary: true, packing: true, documents: false, expenses: false, share: false, edit: true }`.
2. **Backend Endpoints Reject `editor` or Filter SQL by `role = 'admin'`**:
   - `functions/api/wayfinder/documents.js` (`lines 29-37, 183, 284, 355`) blocks `editor` reads and metadata updates with `403`, while the fallback SQL query at `line 193` hardcodes `wayfinder_agenda_shares WHERE user_id = ? AND role = 'admin'`.
   - `functions/api/wayfinder/expenses.js` (`line 146`) rejects `GET` requests via `!canViewSensitive(access.role)` (`403`), creating an inconsistency because mutation routes (`lines 200, 261, 292`) already permit `canEdit(access.role)`.
   - `functions/api/wayfinder/budget.js` (`line 20`) rejects `GET` aggregate budget via `!canViewSensitive(access.role)` (`403`).
   - `functions/api/wayfinder/accommodations.js` (`lines 42, 100-106`) scrubs `total_cost`, `currency`, `source_document_id`, `filename`, `safe_display_name`, and `mime_type` to `null` when `!canViewSensitive(access.role)`.
   - `functions/api/wayfinder/import-jobs.js` (`lines 43, 58`) restricts job/document visibility SQL to `wayfinder_agenda_shares WHERE user_id = ? AND role = 'admin'`, even though `approve` (`line 285`) already checks `canEdit(jAccess.role)`.
   - `functions/api/wayfinder/email-inboxes.js` (`lines 41, 44, 59, 63`) restricts `GET` and `POST` strictly to `canManage(inboxAccess.role)` (`owner`/`admin`) and `WHERE user_id = ? AND journey_id = ?`, yet `BookingImportChannels.jsx` calls `/api/wayfinder/email-inboxes` on mount.
   - `functions/api/wayfinder/packing.js` (`lines 225, 256, 300, 319, 340, 345`) mixes `scopeIds` / `is_shared = 1` with strict `user_id = ?` filters on `clear_packed` and `toggle_all`. All 39 existing rows on `poland-christmas-2026` are owned by `usr-1785511589441-3fvgv`, and `PackingManager.jsx` receives no `agendaRole` prop to gate read-only `viewer` controls.
3. **Frontend Context & Guards Strip Data and Hide Hub Tabs**:
   - `src/context/WayfinderContext.jsx` (`lines 317-323`) skips `fetchDocuments()` and `fetchJobs()` and resets `documents` and `jobs` to `[]` whenever `agendaAccess.permissions.documents` is `false`.
   - `src/components/PrivateHub.jsx` (`lines 72-86, 153-172, 200-204`) hides the **Expenses** (`line 153`) and **Documents** (`line 163`) tabs and redirects deep links back to `/wayfinder/poland-christmas-2026/private` with `"That section is not available for your role on this agenda."`
4. **Mobile Navigation Dead-End (`BottomTabBar.jsx`) & Missing Mobile Account Identity (`Layout.jsx` / `SettingsModal.jsx`)**:
   - In `src/components/BottomTabBar.jsx` (`line 43`), `const hubPath = agendaAccess.permissions.documents ? '${BASE}/private/documents' : '${BASE}/private';`.
   - Whenever `permissions.documents` is `false`, tapping the mobile **Hub** tab routes to `${BASE}/private` - which `isSchedule` (`line 40`) treats as the **Schedule** tab, while `TabItem` (`line 104`) only highlights **Hub** for `isDocs || isPacking || isExpenses`. Thus an `editor` tapping **Hub** on mobile is bounced to Schedule with no access to Documents or Expenses.
   - `src/components/Layout.jsx` (`lines 291-321`) omits mobile Sign Out and clear active collaborator identity display for non-admins, and `src/components/SettingsModal.jsx` has no Sign Out button.

### C. Why Expenses Are Not Tailored to Ronnie's User Record
1. **Live D1 Expense Rows Use a Placeholder `user_id` Instead of Ronnie's Account ID**:
   - In `wayfinder-db`, Jon Kemp entered Ronnie's share using a synthetic ID `"usr-ronald-few"` (`"Ronald Milton Few"`) instead of Ronnie's real `users.id` (`"usr-7cfbdbd4-f1f2-4853-915c-2addcdd58fa8"`, `"Ronnie Few"`):
     - `wayfinder_expenses`: `exp-delta-flight-dl9208` has `paid_by_user_id: "usr-ronald-few"`, `paid_by_name: "Ronald Milton Few"`, `amount_original: 1980`, `currency_original: "USD"`.
     - `wayfinder_expense_splits`: Ronnie's split rows reference `user_id: "usr-ronald-few"`, `user_name: "Ronald Milton Few"` alongside `usr-1785511589441-3fvgv`.
     - `wayfinder_expense_settlements`: `stl-1793458722857-dfr0n` has `from_user_id: "usr-1785511589441-3fvgv"`, `to_user_id: "usr-ronald-few"`, `to_user_name: "Ronald Milton Few"`, `amount: 990`, `currency: "USD"`.
   - Because `src/components/budget/ExpenseLedger.jsx` (`lines 233, 296-298`) matches balances by `currentUserId` (`user?.id || user?.userId || 'self'`), Ronnie's personal summary evaluates to `{ paid: 0, owed: 0, net: 0 }`, and collaborator pickers treat `usr-ronald-few` as separate from Ronnie's authenticated session.
2. **Hardcoded `'jon'` String Check (`src/components/budget/PersonBreakdownPanel.jsx:297, 338`)**:
   - Line 297 computes: `const isCurrentUser = person.id === currentUserId || person.name?.toLowerCase().includes('jon');`
   - Line 338 renders: `{isCurrentUser ? 'Trip Organizer • Primary Payer' : 'Expedition Co-Traveler'}`.
   - When `ronfew02@gmail.com` logs in, **Jon Kemp** still matches `.includes('jon')`, falsely marking Jon as `"You"` / active user instead of Ronnie.

---

## 2. 3-Tier Permission Matrix (Current vs. Target)

| Surface / Capability | Public / None (Current -> Target) | Viewer (Current -> Target) | Editor (Current -> Target) | Owner / Share Admin / Platform Admin (Current -> Target) |
| :--- | :--- | :--- | :--- | :--- |
| **Agenda Access Resolution (`/agendas/:id/access`)** | `role: 'none'` -> Same | `viewer`, `itinerary/packing` only -> Same | `editor`, `documents: false`, `expenses: false` -> **`documents: true`, `expenses: true`, `edit: true`, `share: false`** | `owner` / `admin`, all `true` -> Same |
| **Mobile `BottomTabBar` Hub Tab** | Redirected to Sign In -> Same | Routes to `/private`, highlights `Schedule` -> **Routes to `/private/packing` (activates `Hub`)** | Routes to `/private`, highlights `Schedule` -> **Routes to `/private/documents` (activates `Hub`)** | Routes to `/private/documents` -> Same |
| **Private Hub Sub-Nav Tabs (`PrivateHub.jsx`)** | Locked (`Sign In` prompt) -> Same | Itinerary + Packing -> Itinerary + Packing (read-only notice for Expenses/Docs deep links) | Itinerary + Packing only (Expenses/Docs hidden & redirected) -> **Itinerary + Documents + Expenses + Packing (all active)** | Itinerary + Documents + Expenses + Packing + Share -> Same |
| **Itinerary CRUD (`itinerary.js`)** | `401` / `403` -> Same | Read (`GET`) -> Same | Read + Create/Update/Delete -> Same | Full CRUD -> Same |
| **Accommodations + Costs & Vouchers (`accommodations.js`)** | `401` / `403` -> Same | Read venue/dates only (`cost`/`doc` scrubbed to `null`) -> Same | Scrubbed (`cost`/`doc` = `null`) -> **Full cost, currency & linked voucher document fields** | Full fields -> Same |
| **Document Vault & Binary View/Upload/Rename (`documents.js`)** | `401` / `403` -> Same | `403` (Hidden) -> Same | `403` (Hidden; `WayfinderContext` sets `[]`) -> **Full View, Download, Upload, Rename (`DELETE` limited to uploader `doc.user_id === user.userId` or `owner`/`admin`)** | Full CRUD + Delete any doc -> Same |
| **Import Jobs List / Parse / Approve (`import-jobs.js`)** | `401` / `403` -> Same | `403` -> Same | `GET` SQL returns empty (`role = 'admin'` filter) -> **Read, Parse & Approve shared trip import jobs** | Full Manage + Approve -> Same |
| **Expenses, Splits, Settlements & Budget (`expenses.js`, `budget.js`)** | `401` / `403` -> Same | `403` (Hidden) -> Same | `GET` returns `403` (even though `POST`/`PUT`/`DELETE` check `canEdit`) -> **Full Trip Read + Edit + User-Tailored "My Share" Summary & Filter** | Full Read + Edit + User-Tailored Summary -> Same |
| **Packing Checklist (`packing.js`, `PackingManager.jsx`)** | `401` / `403` -> Same | Read + can hit mutation endpoints without UI role lock -> **Read-only on shared items (UI disables mutations via `agendaRole`) + personal items** | Read + Edit (`clear_packed`/`toggle_all` restricted by `user_id = ?`) -> **Full Read + Shared-Item Check/Edit across trip + Personal Items** | Full Read + Edit -> Same |
| **Inbound Email Inboxes (`email-inboxes.js`, `BookingImportChannels.jsx`)** | `401` / `403` -> Same | `403` -> Same (UI skips fetch unless `canManage`) | Mount fetch returns `403` -> **UI hides/gates management (`permissions.share`) so zero `403` noise; read-only forwarding note optional** | Create / View / Revoke Inbox -> Same |
| **Share Agenda & Invite Management (`agenda-shares.js`, `ShareAgendaModal`)** | `401` / `403` -> Same | `403` (Hidden) -> Same | `403` (Hidden) -> Same (`owner` / `admin` only) | Full Invite / Role Change / Revoke -> Same |
| **Mobile Header & Settings Account Controls (`Layout.jsx`, `SettingsModal.jsx`)** | Sign In button -> Same | Minimal header, no mobile Sign Out -> **Signed-in identity badge + Sign Out action on mobile & `SettingsModal`** | Minimal header, no mobile Sign Out -> **Signed-in identity badge + Sign Out action on mobile & `SettingsModal`** | Desktop admin controls -> **Consistent across mobile & desktop** |

---

## 3. Expense Attribution & Personal Tailoring Design

1. **Unify Existing D1 Records (`usr-ronald-few` -> `usr-7cfbdbd4-f1f2-4853-915c-2addcdd58fa8`)**:
   - Remap all existing references to `"usr-ronald-few"` (`"Ronald Milton Few"`) in `poland-christmas-2026` to Ronnie's verified D1 user record (`"usr-7cfbdbd4-f1f2-4853-915c-2addcdd58fa8"`, `"Ronnie Few"`):
     - `wayfinder_expenses`: update `paid_by_user_id` and `paid_by_name`.
     - `wayfinder_expense_splits`: update `user_id` and `user_name`.
     - `wayfinder_expense_settlements`: update `to_user_id` / `from_user_id` and `to_user_name`.
2. **Prevent Future Placeholder ID Drift (`email-worker.js` & `expenses.js`)**:
   - Ensure expense auto-creation (`email-worker.js` via `getAgendaMembers`) and expense participant selection always bind to real collaborator `users.id` values from `getAgendaMembers`.
3. **Tailored Collaborator View Without Losing Whole-Trip Visibility (`ExpenseLedger.jsx`, `PersonBreakdownPanel.jsx`, `expenseLedger.js`)**:
   - Fix `PersonBreakdownPanel.jsx` (`lines 297, 338`) to remove `|| person.name?.toLowerCase().includes('jon')`. Derive `"You"` strictly from `person.id === currentUserId`, and determine organizer status from agenda ownership (`created_by` / `owner` role) rather than conflating organizer with current user.
   - Enhance `ExpenseLedger.jsx` summary header and list controls so every collaborator (`Owner`, `Editor`) sees:
     - **Personal Balance Card ("My Trip Ledger - <User Name>")**: total paid by `currentUserId`, total `currentUserId` split share owed, net balance, and direct settlement status (`who owes whom` relative to `currentUserId`).
     - **Non-destructive Scope Filter (`All Trip Expenses` | `My Expenses & Splits` | `Paid by Me`)**: preserves complete visibility into all trip costs (`All Trip Expenses` remains accessible at one tap) while giving Ronnie an immediate tailored view of his own flights, hotel splits, and settlements.

---

## 4. File-by-File Surgical Remediation Plan

### Phase 1 - Backend Authorization & D1 Collaborator Alignment
1. **`e:/TechTrekGT/wayfinder/functions/utils/agendaAccess.js`** (`lines 174-189`)
   - Update `canViewSensitive(role)` (or introduce `canAccessFinancialsAndDocs(role)` / keep `canViewSensitive(role)` strictly aligned to `owner | admin | editor`) so `'editor'` evaluates to `true` for `documents`, `expenses`, `budget`, `import-jobs`, and sensitive `accommodations` fields, while `'viewer'` remains `false`.
   - Keep `canManage(role)` strictly `role === 'owner' || role === 'admin'` so agenda sharing, invite revocation, role changes, and cross-user document deletion stay Owner/Admin-only.
2. **`e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js`** (`lines 29-37, 183, 193, 284, 355, 397`)
   - Ensure read, download, upload/register (`POST`), and metadata rename (`PUT`/`PATCH`) allow `canEdit(access.role)` / `canViewSensitive(access.role)` (`owner`, `admin`, `editor`).
   - Update the fallback SQL query (`line 193`) from `role = 'admin'` to `role IN ('admin', 'editor')` so shared documents attached to the journey appear for `editor`.
   - Preserve `DELETE` protection (`line 397`): `doc.user_id === user.userId || canManage(access.role)` so an editor can delete their own uploads but cannot delete the owner's uploaded vouchers.
3. **`e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js`** (`lines 43, 58, 285`)
   - Update SQL share filters (`lines 43, 58`) from `role = 'admin'` to `role IN ('admin', 'editor')`, and verify `GET`, parse, and approve handlers use `canViewSensitive(access.role)` / `canEdit(access.role)` consistently.
4. **`e:/TechTrekGT/wayfinder/functions/api/wayfinder/expenses.js`** (`lines 146, 200, 261, 292`) & **`e:/TechTrekGT/wayfinder/functions/api/wayfinder/budget.js`** (`line 20`)
   - Verify `canViewSensitive(access.role)` unlocks `GET /api/wayfinder/expenses` and `GET /api/wayfinder/budget` for `editor` while keeping `viewer` blocked (`403`).
   - Confirm `POST`/`PUT`/`DELETE` expense and settlement endpoints continue enforcing `canEdit(access.role)`.
5. **`e:/TechTrekGT/wayfinder/functions/api/wayfinder/accommodations.js`** (`lines 42, 100-106`)
   - Verify `sensitive = canViewSensitive(access.role)` exposes `total_cost`, `currency`, `source_document_id`, `filename`, `safe_display_name`, and `mime_type` to `editor` while scrubbing them to `null` for `viewer`.
6. **`e:/TechTrekGT/wayfinder/functions/api/wayfinder/packing.js`** (`lines 225, 256, 300, 319, 340, 345`) & **`e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-inboxes.js`** (`lines 41, 44, 59, 63`)
   - In `packing.js`, allow `canEdit(access.role)` to read and update shared trip packing items (`is_shared = 1`) consistently (including `toggle_all` / `clear_packed` scoped appropriately to editable shared/personal rows), while blocking `viewer` mutations with `403`.
   - In `email-inboxes.js`, keep `POST`/`DELETE` restricted to `canManage(inboxAccess.role)`, and either gate UI fetches by `permissions.share` or allow `GET` to return read-only journey alias metadata for `canViewSensitive` without exposing mutation rights.
7. **Live D1 Data Migration (`wayfinder-db`, positional/safe SQL update on `poland-christmas-2026`)**
   - Remap `"usr-ronald-few"` (`"Ronald Milton Few"`) to `"usr-7cfbdbd4-f1f2-4853-915c-2addcdd58fa8"` (`"Ronnie Few"`) across `wayfinder_expenses`, `wayfinder_expense_splits`, and `wayfinder_expense_settlements` (and audit `email-worker.js` collaborator matching so newly ingested receipts use real `getAgendaMembers` IDs).

### Phase 2 - Frontend Navigation, Private Hub & Expense UI Updates
8. **`e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx`** (`lines 38-44, 99-108`)
   - Keep `hubPath` routing to `${BASE}/private/documents` when `permissions.documents` is `true` (`owner`, `admin`, `editor`), and fall back to `${BASE}/private/packing` when `!permissions.documents && permissions.packing` (`viewer`) instead of `${BASE}/private`, preventing `Hub` from silently aliasing to `Schedule`.
9. **`e:/TechTrekGT/wayfinder/src/components/Layout.jsx`** (`lines 291-321`) & **`e:/TechTrekGT/wayfinder/src/components/SettingsModal.jsx`**
   - Expose authenticated user identity (name/email/role badge) and a clear **Sign Out** button on mobile navigation and inside `SettingsModal.jsx` for all roles (not only desktop/admins).
10. **`e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx`** (`lines 72-86, 153-172, 200-220`) & **`e:/TechTrekGT/wayfinder/src/context/WayfinderContext.jsx`** (`lines 312-324`)
    - Pass `agendaRole` (and `agendaPermissions`) down into `<PackingManager agendaRole={agendaRole} />` and `<ExpenseLedger agendaRole={agendaRole} />` alongside `<DocumentCenter />` so UI mutation controls respect `viewer` read-only state while `editor` renders full Hub tabs and hydrated `documents` / `jobs`.
11. **`e:/TechTrekGT/wayfinder/src/components/BookingImportChannels.jsx`**
    - Guard `/api/wayfinder/email-inboxes` fetch/controls with `agendaAccess.permissions.share` (from `WayfinderContext`) so `editor` and `viewer` never trigger unnecessary `403` requests when opening Document Center / Import settings.
12. **`e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx`**
    - Accept `agendaRole` prop and disable shared-list mutations (add/toggle/clear/preset on shared trip items) when `agendaRole === 'viewer'`.
13. **`e:/TechTrekGT/wayfinder/src/components/budget/PersonBreakdownPanel.jsx`** (`lines 297, 338`), **`e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx`** (`lines 233-248, 296-298`), & **`e:/TechTrekGT/wayfinder/src/utils/expenseLedger.js`**
    - Remove hardcoded `.includes('jon')` check in `PersonBreakdownPanel.jsx`; compute `isCurrentUser` strictly via `person.id === currentUserId` and separate `"You"` badge from agenda owner/organizer labeling.
    - Add a user-tailored **"My Expenses & Splits"** filter (`All` | `Mine` | `Paid by Me`) and personal balance summary header in `ExpenseLedger.jsx` backed by `currentUserId` and unified `members` participant matching.

### Phase 3 - Post-Approval Verification, Docs Sync & Deploy
- Run D1 migration and re-verify row counts and user balances for `usr-7cfbdbd4-f1f2-4853-915c-2addcdd58fa8` (`ronfew02@gmail.com`).
- Synchronize documentation per workspace rules (`wayfinder/docs/03_features.md`, `wayfinder/docs/04_state.md`, and `docs/04_state.md` if shared auth/DB contracts change).
- Execute `cd e:/TechTrekGT/wayfinder && npm run build && npm run deploy` and verify live behavior across `Owner`, `Editor` (`ronfew02@gmail.com`), and `Viewer` accounts on mobile viewport and desktop.
