# Outpost Tracker - Security & Data Isolation Audit Plan

**Audit Date:** 2026-09-15
**Status:** AWAITING USER APPROVAL
**Audited By:** Antigravity Security Review
**Scope:** `e:/TechTrekGT/outpost/`

---

## Executive Summary

A full static code audit was performed across all Cloudflare Worker API handlers, authentication utilities, CORS configuration, and D1 query patterns in the Outpost Tracker. The root cause of the reported data leakage has been identified.

**Root Cause of Data Leakage:** The VineScout Chrome Extension import endpoint (`POST /api/import/amazon`) uses a **fallback user resolution mechanism** that, when the Bearer token lookup fails, queries for the first user in the database with no authentication check (`SELECT id FROM users LIMIT 1`). Items imported via this path are attributed to an arbitrary user - most likely the first account ever registered - regardless of which account's token was actually used.

The audit also identified three additional security issues across authentication and data isolation layers. All findings are documented below with precise file references and concrete remediation steps.

---

## Audit Findings

### CRITICAL-1: VineScout Import Fallback Creates Cross-Tenant Data Pollution

**Severity:** CRITICAL
**File:** [`functions/api/import/amazon.js`](file:///e:/TechTrekGT/outpost/functions/api/import/amazon.js#L57-L65)
**This is the likely cause of the reported data leakage.**

**Finding:** The `POST /api/import/amazon` endpoint uses a three-tier user resolution chain. Tier 3 - the final fallback - executes `SELECT id FROM users LIMIT 1` with no authentication check. If the Bearer token sent by the Chrome Extension does not match any `amazon_api_token` in the `users` table AND the `OUTPOST_SECRET_KEY` env var is not set, any item submitted reaches this fallback and is silently written to the first registered user's account.

```js
// functions/api/import/amazon.js - Lines 57-65 (CRITICAL)
if (!userId) {
  // Fallback: if only 1 user exists in DB, use that user
  const fallbackUser = await env.DB.prepare(`SELECT id AS userId FROM users LIMIT 1`).first();
  if (fallbackUser && fallbackUser.userId) {
    userId = fallbackUser.userId;
  } else {
    return err('Unauthorized: invalid API token or secret', 401);
  }
}
```

**Problem:** The comment says "if only 1 user exists" but the query has no such constraint. The DB returns the first user ordered by SQLite rowid, not the authenticated user. A multi-user environment routes unauthenticated or mismatched imports to the wrong account silently.

**Also Noted:** The `UPDATE auction_items` path in the `existingItem` branch (Lines 159-177) does NOT include `AND user_id = ?` in its WHERE clause:

```js
WHERE id = ?  // Missing: AND user_id = ?
```

This means if a token collision caused an item to resolve to a different userId, an update could modify another user's item record.

**Remediation:**
1. Delete the entire fallback block (lines 57-65). If neither a valid `amazon_api_token` nor a valid `OUTPOST_SECRET_KEY` matches, return `401` immediately - no fallback.
2. Add `AND user_id = ?` to the UPDATE WHERE clause in the `existingItem` update path and bind `userId`.

---

### HIGH-1: `auction_comps` DELETE Does Not Enforce User Ownership

**Severity:** HIGH (IDOR)
**File:** [`functions/api/items/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/items/%5Bid%5D.js#L358)

**Finding:** In `onRequestDelete`, the `DELETE FROM auction_comps` statement only filters on `item_id`, not on `user_id`:

```js
// Line 358 - Missing user_id guard
await env.DB.prepare('DELETE FROM auction_comps WHERE item_id = ?').bind(id).run();
```

While the item itself is correctly guarded, the comps cascade delete lacks a user ownership filter. The fix is a one-token change.

**Remediation:**

```diff
-  await env.DB.prepare('DELETE FROM auction_comps WHERE item_id = ?').bind(id).run();
+  await env.DB.prepare('DELETE FROM auction_comps WHERE item_id = ? AND user_id = ?').bind(id, payload.userId).run();
```

---

### HIGH-2: `SameSite=Lax` on Auth Cookie Should Be `SameSite=Strict`

**Severity:** HIGH (CSRF Risk)
**File:** [`functions/utils/auth.js`](file:///e:/TechTrekGT/outpost/functions/utils/auth.js#L169)

**Finding:** The `buildAuthCookie()` helper sets `SameSite=Lax` on the `auth_token` cookie. The `forgot-password.js` and `reset-password.js` handlers correctly use `SameSite=Strict` on their session cookies. The main `auth_token` should match.

**Remediation:**

```diff
-  'SameSite=Lax',
+  'SameSite=Strict',
```

> [!IMPORTANT]
> **Open Question Q1:** Since all apps share `techtrekgt.com`, `Strict` should be safe for in-app navigation. However, navigating to `/outpost` from an external source (email link, bookmark manager) will lose the cookie and force re-login. Is this acceptable?

---

### MEDIUM-1: Rate Limiting Degrades Silently When RATE_LIMIT_KV Is Unbound

**Severity:** MEDIUM (Brute Force)
**File:** [`functions/utils/rateLimit.js`](file:///e:/TechTrekGT/outpost/functions/utils/rateLimit.js#L3)

**Finding:** The `checkRateLimit` function silently returns `{ allowed: true }` if the KV binding is absent, with no log or alert. The KV namespace is currently bound correctly in `wrangler.jsonc`, but silent degradation is dangerous during any future reconfiguration.

**Remediation:**

```diff
-  if (!kv) return { allowed: true }; // graceful degradation if KV not bound
+  if (!kv) {
+    console.warn('[rateLimit] RATE_LIMIT_KV not bound - rate limiting disabled. Check wrangler config.');
+    return { allowed: true };
+  }
```

---

### LOW-1: Email Verification Not Implemented

**Severity:** LOW (Informational)
**File:** [`functions/api/auth/register.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/register.js)

**Finding:** The registration flow creates an account and immediately issues a JWT without verifying email ownership. The app uses a security question/answer pattern for password reset only.

**Remediation Options:**
- **(Recommended) Accept current posture:** Since this is a single-user / private-team app, email verification is not a critical gap.
- **(Optional future work):** Add a `pending_email_verification` flow using a time-limited token stored in D1.

> [!NOTE]
> **Open Question Q3:** Do you want to implement email verification as future work, or is the current security-question model sufficient?

---

## Confirmed Secure: No Findings Required

The following areas were audited and confirmed correctly implemented:

### Data Isolation - All Core CRUD Endpoints

| Endpoint | Isolation Guard |
|---|---|
| `GET /api/items` | `WHERE i.user_id = ?` |
| `GET /api/items/enriched` | `WHERE i.user_id = ?` |
| `GET /api/items/:id` | `WHERE id = ? AND user_id = ?` |
| `PUT /api/items/:id` | Pre-fetch + UPDATE both `WHERE id = ? AND user_id = ?` |
| `DELETE /api/items/:id` | Pre-fetch + DELETE both `WHERE id = ? AND user_id = ?` |
| `GET /api/invoices` | `WHERE i.user_id = ?` |
| `GET /api/invoices/:id` | `WHERE (id = ? OR invoice_ref = ?) AND user_id = ?` |
| `PUT /api/invoices/:id` | `WHERE id = ? AND user_id = ?` |
| `DELETE /api/invoices/:id` | `WHERE id = ? AND user_id = ?` |
| `GET /api/sales` | `WHERE s.user_id = ?` |
| `POST /api/sales` | Item pre-fetch `WHERE id = ? AND user_id = ?` |
| `GET /api/sales/:id` | `WHERE s.id = ? AND s.user_id = ?` |
| `PUT /api/sales/:id` | `WHERE id = ? AND user_id = ?` |
| `DELETE /api/sales/:id` | `WHERE id = ? AND user_id = ?` |
| `GET /api/dashboard` | All 9 D1 batch queries bind `userId` |
| `GET /api/sync/settings` | `WHERE user_id = ?` |
| `PUT /api/sync/settings` | UPSERT with `user_id` |
| `GET /api/market-alerts` | `WHERE a.user_id = ?` |
| `PUT /api/market-alerts/:id` | `WHERE id = ? AND user_id = ?` |
| `POST /api/import/batch` | All DELETE and INSERT operations bind `userId` |

### SQL Injection - Fully Parameterized

Every D1 query uses `.prepare(...).bind(...)`. No string concatenation of user-supplied values in SQL was found. The `enriched.js` sort column is whitelisted via `SORT_COLUMN_MAP` before interpolation.

### JWT Verification - Correct

`verifyToken()` uses WebCrypto `subtle.verify` with constant-time HMAC comparison. Validates signature and expiry. `requireAuth()` enforces `payload.userId` presence.

### CORS Policy - Correctly Enforced

Strict origin allowlist in `addSecurityHeaders()`: `https://techtrekgt.com`, `https://techtrek-outpost.pages.dev`, localhost dev ports. `Access-Control-Allow-Credentials: true` is set. Origin is read from the request.

### CSP / Security Headers - Correct

HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, Referrer-Policy, and Permissions-Policy are all applied on every response.

### Password Reset - Correctly Hardened

Reset session ID issued as `Path=/api/auth/reset-password; SameSite=Strict; HttpOnly; Secure` cookie - never in the response body. Previous sessions invalidated. 15-min server-side expiry enforced. Security answer PBKDF2-hashed.

### Authentication Rate Limiting - Present

Login (10 req/min), register (5 req/min), forgot-password (5 req/10min), reset-password (5 req/10min) - all rate-limited via `RATE_LIMIT_KV` which is correctly bound.

### HttpOnly Cookie Enforcement - Correct

`buildAuthCookie()` always sets `HttpOnly; Secure; Path=/`. Reads cookie-first, Bearer header as fallback for the Chrome Extension.

---

## Proposed Changes Summary

### Component: [`functions/api/import/amazon.js`](file:///e:/TechTrekGT/outpost/functions/api/import/amazon.js)

**Fix CRITICAL-1a:** Delete lines 57-65 (unauthenticated fallback block) and collapse to a single `return err('Unauthorized: invalid API token or secret', 401)`.

**Fix CRITICAL-1b:** In the `existingItem` UPDATE at line ~177, add `AND user_id = ?` to the WHERE clause and bind `userId` as the last parameter.

---

### Component: [`functions/api/items/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/items/%5Bid%5D.js)

**Fix HIGH-1:** Line 358 - add `AND user_id = ?` to `auction_comps` delete.

---

### Component: [`functions/utils/auth.js`](file:///e:/TechTrekGT/outpost/functions/utils/auth.js)

**Fix HIGH-2:** Line 169 - change `SameSite=Lax` to `SameSite=Strict`.

---

### Component: [`functions/utils/rateLimit.js`](file:///e:/TechTrekGT/outpost/functions/utils/rateLimit.js)

**Fix MEDIUM-1:** Line 3 - expand silent return to include `console.warn`.

---

## Open Questions

> [!IMPORTANT]
> **Q1 - SameSite=Strict:** Acceptable to force re-login when navigating from external domains/bookmarks?

> [!IMPORTANT]
> **Q2 - VineScout Extension Token:** After removing the fallback, existing extensions with a mismatched or stale `amazon_api_token` will receive 401. How do you want to handle that? (Users can re-fetch their token from the Outpost Settings page via `GET /api/import/amazon-token`.)

> [!NOTE]
> **Q3 - Email Verification:** Future work item or accept current security-question model?

---

## Verification Plan

### After Each Fix

1. `cd e:/TechTrekGT/outpost && npm run build`
2. `npm run deploy`

### Manual Verification Checklist

- [ ] Sign in as Account A. Verify only Account A's items appear in Inventory Hub.
- [ ] Trigger a VineScout Chrome Extension import. Confirm item appears under the correct account.
- [ ] Sign in as Account B. Confirm Account B cannot see Account A's items.
- [ ] Attempt `GET /api/items/:id` with Account B's JWT and Account A's item ID. Expect 404.
- [ ] Attempt `POST /api/import/amazon` with an invalid Bearer token. Expect immediate 401 (no fallback).
- [ ] Verify reset-password flow works end-to-end.

---

## Priority Order for Execution

| Priority | Severity | Finding | Location |
|---|---|---|---|
| 1 | CRITICAL | Remove unauthenticated fallback user lookup | `import/amazon.js` Lines 57-65 |
| 2 | CRITICAL | Add `user_id` guard to `existingItem` UPDATE | `import/amazon.js` Line ~177 |
| 3 | HIGH | Add `user_id` to comps cascade DELETE | `items/[id].js` Line 358 |
| 4 | HIGH | Change `SameSite=Lax` to `SameSite=Strict` | `utils/auth.js` Line 169 |
| 5 | MEDIUM | Add KV unavailability warning | `utils/rateLimit.js` Line 3 |
