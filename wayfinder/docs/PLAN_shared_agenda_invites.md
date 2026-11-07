# Plan: Shared Agenda Collaboration and Email Invitations (Wayfinder)

Status: PENDING REVIEW. No source code has been modified.

## 0. Findings from pre-flight reads
- Per workspace rules, `ARCHITECTURE.md` files were NOT read. Context comes from `docs/04_state.md`, `docs/02_arch.md` and `wayfinder/docs/*`, plus code inspection.
- "Agenda" maps to a journey (`wayfinder_journeys`, owner column `created_by`) and its `wayfinder_itinerary_items`.
- Worker: `wayfinder/src/worker.js` routes `/api/wayfinder/*` to handlers in `wayfinder/functions/api/wayfinder/`. Auth routes reuse `functions/api/auth/{login,register}.js`.
- Wrangler already has a `SEND_EMAIL` binding (Cloudflare Email Routing), currently used for inbound forwarding in `email-worker.js`.
- Client: hand-rolled routing in `src/App.jsx` (`currentPath` state plus `popstate`). Auth UI: `AuthModal.jsx` and `context/AuthContext.jsx`.
- Shared users table: `users(id, email COLLATE NOCASE, ...)`.

## 1. D1 schema (append to `wayfinder/schema-wayfinder.sql`; `wf_` style prefix kept as `wayfinder_`)
```sql
CREATE TABLE IF NOT EXISTS wayfinder_agenda_invites (
  id            TEXT PRIMARY KEY,
  agenda_id     TEXT NOT NULL,              -- wayfinder_journeys.id
  invited_email TEXT NOT NULL COLLATE NOCASE,
  role          TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  token_hash    TEXT NOT NULL UNIQUE,       -- SHA-256 hex of the raw token; raw token is never stored
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  invited_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,              -- now + 7 days
  accepted_at   TEXT,
  accepted_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_invites_agenda ON wayfinder_agenda_invites(agenda_id);
CREATE INDEX IF NOT EXISTS idx_wf_invites_email  ON wayfinder_agenda_invites(invited_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_invites_pending
  ON wayfinder_agenda_invites(agenda_id, invited_email) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS wayfinder_agenda_shares (
  id         TEXT PRIMARY KEY,
  agenda_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
  invite_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agenda_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wf_shares_user   ON wayfinder_agenda_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_shares_agenda ON wayfinder_agenda_shares(agenda_id);
```
- The task spec lists a `invite_token` column. We store a SHA-256 hash (`token_hash`) instead so a DB leak cannot be used to claim invites. This is a deliberate deviation.
- All queries use `env.DB.prepare(sql).bind(...)` with positional `?`.
- Migration: apply with `wrangler d1 execute personal-budget-db --remote --file=schema-wayfinder.sql` from `wayfinder/`. The statements are idempotent.

## 2. Worker API
New file `functions/api/wayfinder/agenda-shares.js`, exporting `handleAgendaShares(context, url, method)`. It is routed from `worker.js` before the generic `/api/wayfinder/journeys` match.

| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /api/wayfinder/agendas/:id/invites` | Owner/admin share/admin | Validate email and role (only the owner can grant `admin`). Generate 32 random bytes via `crypto.getRandomValues`, base64url-encode them, and store the SHA-256 hash. Insert the row, then send the email. Rate-limit via `RATE_LIMIT_KV`. If a pending invite already exists, revoke it and issue a new one (resend). |
| `GET /api/wayfinder/agendas/:id/invites` | Owner/admin | List invites and shares. |
| `DELETE /api/wayfinder/agendas/:id/invites/:inviteId` | Owner/admin | `UPDATE ... SET status='revoked' WHERE id=? AND agenda_id=? AND status='pending'`. |
| `PATCH` / `DELETE /api/wayfinder/agendas/:id/shares/:userId` | Owner/admin | Change role or remove a collaborator. |
| `GET /api/wayfinder/invites/verify?token=` | Public | Hash the token and look it up. Return `{valid, agendaTitle, role, invitedEmail, inviterEmail, expiresAt, accountExists}` or a generic error (`invalid/expired/revoked/used`). Never reveals other data. Rate-limited. |
| `POST /api/wayfinder/invites/claim` | Session required | Body `{token}`. Rules: invite is pending and not expired. Session email must match `invited_email` (case-insensitive). Atomic `env.DB.batch([...])`: (1) `UPDATE invites SET status='accepted',... WHERE id=? AND status='pending' AND expires_at > datetime('now')`, (2) `INSERT ... ON CONFLICT(agenda_id,user_id) DO UPDATE` shares (keeps the higher role). The batch is verified via `meta.changes`; if the update changed 0 rows, fail with 409. Returns `{agendaId, slug, role}`. |

Authorization helper `getAgendaAccess(db, agendaId, userId)` returns `owner | admin | editor | viewer | null` (owner from `wayfinder_journeys.created_by`, otherwise from shares; platform `is_admin` counts as admin). Existing journey/itinerary handlers are extended so that:
- `GET` lists journeys the user owns or is shared on.
- Writes require `editor` or higher.
- Sharing management requires `admin` or the owner.
- Journey deletion stays owner-only.

Registration (Case C): `register.js` accepts an optional `inviteToken`. If the token is valid and the email matches the invite email, the account is created with `email_verified = 1` (the inbox was proven by receiving the link) and the session cookie is issued. The client then calls `/claim`. If the user edits the email field, the invite is not auto-linked.

## 3. Email dispatch
- New util `functions/utils/inviteEmail.js` builds a MIME message (plain text plus HTML) and sends it via `env.SEND_EMAIL.send(new EmailMessage(from, to, raw))` using the existing `SEND_EMAIL` binding and the existing sender address convention in `email-worker.js`.
- Link format: `https://techtrekgt.com/wayfinder/invite?token=<TOKEN>`.
- Failure handling: if sending fails, return `201` with `emailSent:false` and show a "Copy invite link" fallback in the UI. The invite row is kept.

> [!WARNING]
> Cloudflare's `send_email` binding can only deliver to verified destination addresses unless the account uses a sending-capable email service. Arbitrary invitee addresses may be rejected. See Open Question 1.

## 4. Client
- `App.jsx`: add the `/wayfinder/invite` route branch, which renders new `components/InviteClaim.jsx`. Navigation uses `pushState` and `popstate`.
- `InviteClaim.jsx` calls `verify` on mount, then branches:
  - Case A (signed in): show a card with agenda title, role and inviter, and an Accept button, which calls `/claim` and then navigates to the shared agenda. If the session email differs from the invited email, show a mismatch notice and a "switch account" action.
  - Case B (signed out, `accountExists`): show an inline sign-in form with the email prefilled and read-only. On success, auto-call `/claim`. The token is held in `sessionStorage` (key `wf_pending_invite`) so it survives a reload. It is not an auth token; auth stays in HttpOnly cookies.
  - Case C (signed out, no account): show a register form with the email prefilled and locked. It posts `inviteToken` to `register`. On session issuance, auto-claim and redirect.
  - Error states: invalid, expired, revoked, already used.
- `components/ShareAgendaModal.jsx`: shown to owner/admin from the agenda header (`PrivateHub.jsx`). It contains an email input, a role select, and a pending invites and collaborators list with revoke, resend, change role and remove actions.
- `AuthContext.jsx`: expose `refreshUser` if not already present, so the claim flow can pick up the new session.
- Role-aware UI: viewers get read-only itinerary controls; editors can edit; admins/owner see the Share button. The server enforces all of this regardless.
- Shared agendas are shown in the journey selector with a "Shared (role)" badge.

## 5. Security checklist
- Tokens: 256-bit random, hashed at rest, single-use, 7-day expiry, constant-time-safe lookup via the hashed unique index.
- The `verify` endpoint returns uniform errors and is rate limited.
- Claim requires an authenticated session and an email match. This prevents forwarded-link hijacking.
- Role escalation checks: an `admin` cannot grant above their own role, and only the owner can grant `admin`.
- HttpOnly cookie auth only; no tokens in localStorage.
- Audit: write events to the existing `wayfinder_audit_events` (invite created, revoked, accepted, role changed).

## 6. Files touched
- `wayfinder/schema-wayfinder.sql`
- `wayfinder/src/worker.js` (routing)
- `wayfinder/functions/api/wayfinder/agenda-shares.js` (new)
- `wayfinder/functions/api/wayfinder/{journeys,itinerary,accommodations,packing}.js` (access checks)
- `wayfinder/functions/api/auth/register.js` (optional `inviteToken`)
- `wayfinder/functions/utils/inviteEmail.js` (new)
- `wayfinder/src/App.jsx`, `components/InviteClaim.jsx` (new), `components/ShareAgendaModal.jsx` (new), `components/PrivateHub.jsx`, `context/AuthContext.jsx`
- Docs: `wayfinder/docs/03_features.md`, `wayfinder/docs/04_state.md`, and root `docs/03_features.md` and `docs/04_state.md` (the schema is in the shared D1 and the register contract changes)

## 7. Execution order after approval
1. Read all docs again per pre-flight, then apply the schema migration.
2. Implement the access helper and the share/invite API, then email util and register tweak.
3. Build the client modal and the invite route.
4. Update docs.
5. From `wayfinder/` run `npm run build`, fix any errors, then `npm run deploy`, and verify the live deployment.
6. Smoke tests: create, verify, claim (cases A/B/C), revoke, expired and reused token.

## 8. Open questions
1. Email delivery: is `SEND_EMAIL` allowed to send to arbitrary recipients on this account (for example via Cloudflare Email Service or a verified sender domain)? If not, should we use another provider (for example Resend with an API secret)?
2. Should accepted collaborators see all of the owner's private documents and expenses, or only the itinerary, accommodations and packing? The default proposed here is itinerary, accommodations and packing only; documents and expenses stay owner/admin.
3. Is a 7-day expiry acceptable?

