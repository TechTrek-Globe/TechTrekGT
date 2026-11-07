# Plan: Fix Private Hub Tenant Isolation Leak (Wayfinder)

Status: COMPLETED AND VERIFIED. Deployed to production.
Companion to: `docs/PLAN_shared_agenda_invites.md` (shares/invites already implemented).

## 0. Pre-flight
- Read: root `docs/04_state.md`, wayfinder `docs/01_identity.md`, `02_arch.md`, `03_features.md`, `04_state.md`, the invites plan. `ARCHITECTURE.md` was not read (forbidden by workspace rules).
- Audited: `functions/utils/agendaAccess.js`, all handlers in `functions/api/wayfinder/*`, `PrivateHub.jsx`, `App.jsx`, `Layout.jsx`, `BottomTabBar.jsx`, `WayfinderContext.jsx`.
- Note: the repo already has `wayfinder_agenda_shares`, `resolveAgendaAccess(env, ref, user)` and `GET /agendas/:id/access`. The bug is in how handlers use the result, not a missing resolver.

## 1. Root causes (confirmed by code reading)

| # | Location | Defect | Effect |
|---|---|---|---|
| R1 | `documents.js` L32/L106, `expenses.js` L117, `budget.js` L17, `accommodations.js` L39, `itinerary.js` L25/L63 | Gate is `!access.role && journey.visibility !== 'public'`. If the Poland journey row has `visibility='public'` (to be verified read-only in D1), a user with `role = null` passes. | Unaffiliated users get documents, expenses, budget, hotels. |
| R2 | Same handlers, SQL | Queries add `OR journey_id = 'poland-christmas-2026'` regardless of the resolved journey. | Hardcoded trip rows returned to any caller who reaches the query. |
| R3 | `expenses.js` L169/L230 and similar write paths | Write checks are `if (access.role && !canEdit(...))`. A `null` role skips the check. | Unaffiliated user on a public journey can write expenses, settlements, itinerary items. |
| R4 | `agendaAccess.js` `resolveAgendaAccess` | Any user who has ever sent an invite on the agenda (`invited_by = user`) is treated as `owner`. | Privilege escalation path; invite creation must already require manage rights, but a demoted admin or removed share keeps owner. |
| R5 | `packing.js` L196-206 | Scope is `user_id = ? OR is_shared = 1`, with no membership check on GET. | Unaffiliated user reads any `is_shared=1` packing row for the journey. |
| R6 | `import-jobs.js` L245-250 | Approve verifies `created_by = ? OR slug/id = 'poland-christmas-2026'`. | Any authenticated user can approve a doc into the Poland journey. |
| R7 | `email-inboxes.js` L38/L56 | `created_by = ? OR visibility = 'public'`. | Any user can create/read an inbox bound to the public journey. |
| R8 | `calendar.js` | Private feed scoped by `user_id = ?` only. | Safe for unaffiliated users, but collaborators (viewer/editor) never see owner items, and token minting must verify membership. Verify only. |
| R9 | `PrivateHub.jsx` L30-35 | `agendaRole` is `null` for unaffiliated users, but `null` is treated like "no restriction": tabs, `ItineraryView`, `ExpenseLedger`, `DocumentCenter` are rendered for any `isAuthenticated`. `isDocs` branch renders `DocumentCenter` on `isAuthenticated` alone; `isExpenses` renders `ExpenseLedger` with no check. | UI unlocks on `user !== null`. |
| R10 | `WayfinderContext.jsx` L170-182 | Fetches itinerary, documents, jobs for any authenticated user, before role is known. | Private data requested (and cached to IndexedDB) for non-members. |
| R11 | `documents.js` L36-41, `import-jobs.js` L37-53 | Share-scoped list queries ignore role and any pending/removed state. Collaborators of every role see all document and extraction data. | Collaborator sees private documents and raw OCR fields. |

## 2. Access model (decision required, see section 8)

Role resolution returns exactly one of `owner | admin | editor | viewer | none`.

| Module | owner / platform admin | share admin | editor | viewer | none (unaffiliated) |
|---|---|---|---|---|---|
| Itinerary (private items) | RW | RW | RW | R | public items only (`visibility='public'`) |
| Accommodations | RW | RW | R | R | static public list only |
| Packing | RW | RW | RW (own and shared) | R (shared only) | 403 |
| Documents (vault) | RW | R, upload; delete per `canManage` | **403** (proposed) | **403** | 403 |
| Expenses and budget | RW | RW | **403** (proposed) | **403** | 403 |
| Import jobs and email inboxes | RW | RW | 403 | 403 | 403 |
| Share management | owner: all, admin: viewer/editor only | same | 403 | 403 | 403 |

Proposed default: documents and expenses are owner and platform admin only, plus share `admin`. Editors and viewers see itinerary, packing and hotels. This follows the task's "block non-owner/non-admin collaborators with 403". The alternative (editors may read expenses) is listed in section 8.

## 3. Backend changes (surgical)

### 3.1 `functions/utils/agendaAccess.js`
- Add `canViewSensitive(role)`: `owner | admin`. Add `requireRole(access, predicate)` helper returning a 403 `Response` or `null`.
- `resolveAgendaAccess`: return `role: 'none'` instead of `null` when no owner, share or platform-admin match. Keep the `{ journey, role }` shape, and keep `null` only when the journey is not found. Update callers that test `access.role` truthiness (all listed below).
- Remove the `invited_by` implicit-owner branch (R4). Owner is strictly `journeys.created_by = user.userId`. Check if the seeded owner row is `created_by = 'system'` or the owner's id; if `'system'`, add an explicit migration of `created_by` to the owner's user id (read-only check first, then a one-off `UPDATE ... WHERE id = ?`, reviewed with the user).
- Platform admin stays `isPlatformAdmin(env, user)`. This is not a bypass: it is the documented admin tier.
- All queries remain positional `?`.

### 3.2 Handlers: replace `!access.role && visibility !== 'public'` pattern
For each handler, fix the gate and drop the hardcoded `OR journey_id = 'poland-christmas-2026'` (use only `journey.id` and the requested ref, bound with `?`).

| File | Change |
|---|---|
| `documents.js` | GET with `journey_id`: 403 unless `canViewSensitive`. GET without `journey_id`: own docs only (`user_id = ?`), remove the share subquery for non-admin roles. POST: require `canEdit` and `canViewSensitive`; `role==='none'` returns 403 (R3). PATCH/DELETE: owner of doc or `canManage`, never `none`. |
| `expenses.js` | After resolve: `role === 'none'` or not `canViewSensitive` returns 403 for every verb. Remove `OR journey_id = 'poland-christmas-2026'` in expenses and settlements queries. Write paths use the strict predicate (no `access.role &&` short circuit). |
| `budget.js` | Same gate as expenses. |
| `accommodations.js` | `none` returns the existing `staticList` fallback (no D1 rows, no document join). Members get rows. Remove the hardcoded OR. |
| `itinerary.js` | `none` keeps the public-only branch. Members get the full branch. Write paths: `canEdit` required, `none` returns 403 (R3). Remove hardcoded OR. DELETE of own item by `none` removed. |
| `packing.js` | `none` returns 403 on every verb. Viewers: GET only, shared items. |
| `import-jobs.js` | All routes: resolve access against the doc's journey; require `canViewSensitive`. Approve: replace `slug = 'poland-christmas-2026'` clause with `resolveAgendaAccess` + `canManage` (R6). Remove the hardcoded `usr-ronald-few` split fallback only if confirmed unrelated to auth (leave and flag otherwise). |
| `email-inboxes.js` | Replace `created_by = ? OR visibility = 'public'` with `resolveAgendaAccess` + `canManage` (R7). |
| `calendar.js` | Token create/delete require membership (`role !== 'none'`). Feed unchanged. |
| `journeys.js` | Keep public listing, but exclude private metadata. Add `accessRole` per journey from the resolver (see 3.3). |
| `agenda-shares.js` | `GET .../access` returns `{ agendaId, slug, role }` with `role: 'none'` for unaffiliated users (200, not 404). No other behavior change. |

### 3.3 Access payload
`GET /api/wayfinder/agendas/:id/access` response: `{ agendaId, slug, role: 'owner'|'admin'|'editor'|'viewer'|'none', permissions: { itinerary, documents, expenses, packing, share } }`. `permissions` are derived server-side from section 2 so the UI never re-derives policy.

### 3.4 Data hygiene (read-only first)
- `wrangler d1 execute personal-budget-db --remote --command "SELECT id, slug, visibility, created_by FROM wayfinder_journeys"` to confirm R1 and owner id. No writes without your OK.
- Check whether any document/expense rows have `journey_id = 'poland-christmas-2026'` but different `user_id` (cross-tenant rows). Report only.

## 4. Frontend changes (React 19, JSX)

1. `PrivateHub.jsx`: track `accessRole` and `permissions` plus a `roleLoaded` flag.
   - Not authenticated: existing sign-in prompts (unchanged).
   - Authenticated, role loading: spinner, no child mounts.
   - `role === 'none'`: render a new `NoAccessPanel` (inside `PrivateHub.jsx`, no new file unless large) with title "No shared agendas linked", text explaining the account has no invite, CTA to the public Poland guide (`/wayfinder/poland-christmas-2026`), and an "I have an invite link" hint pointing to `/wayfinder/invite/<token>` (existing `InviteClaim`). `ItineraryView`, `ExpenseLedger`, `DocumentCenter`, `PackingManager` are not mounted.
   - Tabs: render Expenses and Documents tab links only if `permissions.expenses` / `permissions.documents`. Packing tab only if `permissions.packing`.
   - Deep links (`/private/expenses`, `/private/documents`, `/private/packing`, aliases in `App.jsx`) to a forbidden tab: `replaceState` to `/private` and show a small "Not available for your role" notice. Unmounted, not hidden by CSS.
2. `WayfinderContext.jsx`: gate the authenticated fetch effect on an `accessRole` exposed from a small shared hook. Fetch documents and jobs only when `permissions.documents`; itinerary/accommodations when role is a member; on `none` or logout clear state. Also clear persisted offline copies for the signed-out or role-changed user (check `documentStorage.js`, `mutationQueue.js` for stale keys, and scope keys by `user.userId`).
3. `Layout.jsx` and `BottomTabBar.jsx`: Private Hub nav link remains (it leads to the gate screen). Documents/Expenses bottom-bar items hidden when permission is false (needs role from the same hook; role is fetched once and shared through context).
4. Add `useAgendaAccess()` to `WayfinderContext` (single fetch of `/access`, re-run on auth change), replacing the local fetch in `PrivateHub.jsx`.
5. Pure JS only, `credentials: 'include'`, `getApiUrl` for all calls, custom pushState routing unchanged.

## 5. Verification plan
- Add `scripts/verify-tenant-isolation.mjs` (Node, outside app bundle) that uses test cookies for four accounts against local `wrangler dev`: owner, platform admin, invited viewer, random registered user. Asserts per the section 2 matrix on each endpoint (status codes and empty bodies). Random user must get 403/empty on documents, expenses, budget, packing, import-jobs, and only public itinerary items.
- Manual UI: random account sees the gate panel and cannot reach `/private/expenses` or `/private/documents`; viewer sees no Expenses/Documents tabs; owner unchanged.
- Confirm no response body from a 403 includes row data, and that no SQL string interpolates user input (only the existing `IN (${placeholders})` of `?`).
- Build: `cd wayfinder; npm run build` then `npm run deploy` (per workspace rules), then verify the live Worker URL.

## 6. Docs to update after implementation
- `wayfinder/docs/03_features.md`: access matrix, `none` role, gate panel, `permissions` payload.
- `wayfinder/docs/04_state.md`: `accessRole`/`permissions` state, offline cache scoping.
- `wayfinder/docs/PLAN_shared_agenda_invites.md`: note the superseded owner-by-inviter rule.
- Root `docs/03_features.md` and `docs/04_state.md`: only if `created_by` migration or shared D1 behavior changes.

## 7. Risks
- Existing collaborators who previously saw documents and expenses lose access (intended, per section 2).
- Changing `role` from `null` to `'none'` affects every `access.role &&` check; each call site is listed above and must be updated together.
- Static `staticList` fallback in accommodations must contain only public data (to verify).

## 8. Decisions needed from you
1. Documents and Expenses: owner, platform admin and share `admin` only (proposed), or also `editor` (read)?
2. Should share `admin` get Documents and Expenses (proposed yes), or owner and platform admin only?
3. If the Poland journey row has `created_by = 'system'`, may I reassign it to your user id (one-off D1 update)?
4. Keep Poland itinerary "public items" visible to unaffiliated users (proposed yes, matches the public guide)?

