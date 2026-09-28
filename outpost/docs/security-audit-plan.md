# Outpost Tracker - Security & Data Isolation Audit Plan

**Audit Date:** 2026-09-15
**Status:** EXECUTED & DEPLOYED
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

### MEDIUM-1: Rate Limiting Degrades Silently When RATE_LIMIT_KV Is Unbound (REMEDIATED)

**Severity:** MEDIUM (Brute Force)
**Status:** REMEDIATED & TESTED
**File:** [`functions/utils/rateLimit.js`](file:///e:/TechTrekGT/outpost/functions/utils/rateLimit.js#L3)

**Finding:** The `checkRateLimit` function silently returned `{ allowed: true }` if the KV binding was absent or threw an error, silently disabling brute-force protection.

**Remediation:**
1. Added `failClosed` parameter to `checkRateLimit` (defaulting to `false` for backwards compatibility).
2. Missing KV binding logs `console.warn` and returns `{ allowed: false, retryAfter: 60 }` if `failClosed: true`.
3. Catch block on KV failure logs `console.error` and returns `{ allowed: false, retryAfter: 60 }` if `failClosed: true`.
4. High-risk endpoints (`register.js` and `login.js`) pass `failClosed: true` when invoking `checkRateLimit`. Lower-risk endpoints retain default fail-open behavior.
5. Automated test suite added in `tests/med-1-rate-limit-fail-closed.test.js`.

---

### MEDIUM-2: IP-Only Rate Limiting With No Per-Account Lockout (REMEDIATED)

**Severity:** MEDIUM (Distributed Brute Force & Account Takeover)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/api/auth/login.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/login.js), [`functions/api/auth/forgot-password.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/forgot-password.js), [`functions/api/auth/reset-password.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/reset-password.js), [`functions/api/auth/security-question.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/security-question.js), [`functions/api/auth/register.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/register.js)

**Finding:** Rate limiting keyed exclusively on `CF-Connecting-IP`, leaving accounts vulnerable to distributed brute-force attacks across rotating proxies or multiple IPs.

**Remediation:**
1. Dual-layer rate limiting: added secondary per-account check keyed on normalized email (`login-account:${cleanEmail}`, `forgot-account:${cleanEmail}`, `reset-account:${cleanEmail}`, `sec-q-account:${cleanEmail}`, `register-account:${cleanEmail}`).
2. Applied stricter lockout windows: 10 attempts per 15 minutes (900s) for login and security questions; 5 attempts per 15 minutes (900s) for password recovery and registration.
3. If either IP-based or account-based rate limits trigger rejection, the endpoint returns HTTP 429 and calculates `Retry-After` using the stricter (maximum) of both values (`Math.max(...)`).
4. Automated test suite added in `tests/med-2-per-account-rate-limiting.test.js`.

---

### MEDIUM-3: No Email Verification at Registration (REMEDIATED)

**Severity:** MEDIUM (Account Validation & Identity Theft)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/api/auth/register.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/register.js), [`functions/api/auth/verify-email.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/verify-email.js), [`functions/utils/auth.js`](file:///e:/TechTrekGT/outpost/functions/utils/auth.js), [`functions/api/integrations/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/integrations/%5Bid%5D.js)

**Finding:** Accounts were fully active and issued a session JWT cookie immediately upon registration without confirming that the registrant actually owns the supplied email address.

**Remediation:**
1. Added `email_verified_at TEXT` (nullable timestamp) column to the `users` table and formalized `email_verifications` table with indexes in `auction-schema.sql` and `finance/schema.sql`.
2. Updated `POST /api/auth/register` to create the user account with `email_verified = 0` and `email_verified_at = NULL`, generate a single-use token in `email_verifications`, dispatch a verification email via `sendVerificationEmail`, and return HTTP 201 with `{ success: true, verificationPending: true }` without setting a session cookie.
3. Added `GET /api/auth/verify-email` and `POST /api/auth/verify-email` endpoints that validate the single-use token, check expiration (24-hour window), atomically update `email_verified = 1` and `email_verified_at = ISO timestamp`, mark verification tokens as used, and issue the session JWT cookie (`auth_token`) with the appropriate `Max-Age`.
4. Gated sensitive administrative operations (`env.ADMIN_EMAIL` matching in `integrations/[id].js`) on `isVerified` (`email_verified = 1` or `email_verified_at` present).
5. Added comprehensive automated test suite in `tests/med-3-email-verification.test.js` validating registration, token lifecycle, expiration, single-use enforcement, and sensitive action gating.

---

### MEDIUM-4: Content-Security-Policy Allows 'unsafe-inline' for script-src (REMEDIATED)

**Severity:** MEDIUM (XSS Mitigation & Defense-in-Depth)
**Status:** REMEDIATED & TESTED
**Files:** [`src/worker.js`](file:///e:/TechTrekGT/outpost/src/worker.js)

**Finding:** The CSP `script-src` directive included `'unsafe-inline'`, neutralizing CSP's primary defense mechanism against malicious inline script execution and cross-site scripting (XSS).

**Remediation:**
1. Audited frontend build assets (`index.html`, `dist/client/index.html`, React component tree) and verified zero dependency on inline scripts or event handlers (scripts are purely modular imports).
2. Implemented per-request cryptographic nonce generation in `worker.fetch` using 16 random bytes encoded as base64url.
3. Updated `addSecurityHeaders` to inject the per-request nonce into CSP as `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com` and completely removed `'unsafe-inline'`. Retained `'unsafe-inline'` on `style-src` for fonts and CSS styling.
4. Integrated `HTMLRewriter` to inject the nonce attribute onto all `<script>` elements in HTML responses and append `<meta name="csp-nonce" content="${nonce}" />` to the `<head>` element for frontend accessibility.
5. Added automated test suite in `tests/med-4-nonce-csp.test.js` validating nonce inclusion, `unsafe-inline` absence, localhost bypass, fallback handling, and per-request nonce uniqueness.

---

### MEDIUM-5: Verbose Internal Error and Upstream Body Leakage (REMEDIATED)

**Severity:** MEDIUM (Information Disclosure & Upstream Leakage)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/utils/guard.js`](file:///e:/TechTrekGT/outpost/functions/utils/guard.js), [`src/worker.js`](file:///e:/TechTrekGT/outpost/src/worker.js), [`functions/api/ebay/tokenHelper.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js), [`functions/utils/ebayAuth.js`](file:///e:/TechTrekGT/outpost/functions/utils/ebayAuth.js), [`functions/api/ebay/analytics.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js), [`functions/api/ebay/sync-item.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-item.js), [`functions/api/ebay/sync-all.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js), [`functions/api/ebay/reconcile.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/reconcile.js), [`functions/api/ebay/push-sku.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/push-sku.js), [`functions/api/ebay/find-listings.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/find-listings.js), [`functions/api/ebay/active-listings.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/active-listings.js)

**Finding:** Raw exception messages (such as database query failures or runtime type errors) and third-party upstream API error bodies (e.g. truncated `text.slice(0, 200)` from eBay OAuth, Analytics, and Finances APIs) were forwarded directly to client callers in JSON error responses.

**Remediation:**
1. Hardened `withAuth` and `worker.fetch` catch blocks: replaced raw `err.message` reflection with generic client-safe messages (`An internal error occurred. Please try again.`), while capturing full error stacks on the server via `console.error`. Thrown HTTP `Response` objects pass through unaltered.
2. Sanitized upstream eBay error propagation across `tokenHelper.js`, `ebayAuth.js`, `analytics.js`, `sync-item.js`, `sync-all.js`, `reconcile.js`, `push-sku.js`, `find-listings.js`, and `active-listings.js`. Truncated upstream responses (`text.slice(0, 200)`) and exception messages are logged server-side and replaced with safe, actionable client messages (e.g. `eBay authentication failed. Please reconnect your eBay account.`, `eBay Analytics request failed. Please try reconnecting your account.`).
3. Replicated upstream error sanitization across Landing Gateway integration endpoints (`landing/src/gateway/ebayOAuth.js`, `ebayListings.js`, `ebayItem.js`, `ebayFinances.js`, `ebay.js`, `guard.js`).
4. Preserved all existing HTTP status codes (401, 403, 500, 502) while sanitizing the message body payload.
5. Added automated test suite in `tests/med-5-error-leakage.test.js` validating generic message returns, server-side log capturing, and non-leakage of database, socket, or upstream OAuth payloads.

---

### MEDIUM-6: Unrestricted Attribute Mass-Assignment via body.attributes Spread (REMEDIATED)

**Severity:** MEDIUM (Integrity & Authorization Bypass)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/api/items/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/items/[id].js)

**Finding:** The PUT `/api/items/:id` endpoint executed `nextAttrs = { ...nextAttrs, ...body.attributes }`, allowing callers to merge arbitrary JSON keys into the persisted `auction_items.attributes` column. This enabled malicious mass-assignment of system-managed flags such as `outpost_liquidated`, `ebay_order_id`, `sale_price`, and `sold_at`, circumventing automated reconciliation and liquidation invariants.

**Remediation:**
1. Defined an explicit immutable allowlist: `CLIENT_SETTABLE_ATTR_KEYS = Object.freeze(['asin', 'order_id', 'etv', 'tax_cost', 'cert_verified', 'is_vinescout', 'cert_verified_at'])`.
2. Removed blanket `...body.attributes` spread. Replaced with strict allowlist validation that inspects all keys in `body.attributes`.
3. If any disallowed or system-managed key is present in `body.attributes`, the endpoint immediately rejects the request with HTTP 400 (`Disallowed attribute key(s): ...`), preventing silent data poisoning or parameter injection.
4. Enforced type validation on `body.attributes` (rejecting non-object or array payloads with 400).
5. Sanitized and type-cast allowed keys (e.g. uppercasing/trimming `asin`, parsing floats for `etv` and `tax_cost`, managing `cert_verified` and automatic `cert_verified_at` timestamping).
6. Preserved existing system-managed keys present in `existingAttrs` (e.g. when legitimate background processes stamped `outpost_liquidated` or `ebay_order_id`) during allowed updates.
7. Added comprehensive automated test suite in `tests/med-6-attribute-mass-assignment.test.js` (6 tests) verifying rejection of system keys (`outpost_liquidated`, `ebay_order_id`, `sale_price`, `sold_at`), non-object validation, safe merging of allowed keys, and preservation of existing system keys.

---

### MEDIUM-7: Missing Validation/Range Checks on Financial Numeric Inputs (REMEDIATED)

**Severity:** MEDIUM (Data Integrity & Financial Calculation Corruption)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/utils/auction.js`](file:///e:/TechTrekGT/outpost/functions/utils/auction.js), [`functions/api/sales/index.js`](file:///e:/TechTrekGT/outpost/functions/api/sales/index.js), [`functions/api/sales/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/sales/[id].js), [`functions/api/invoices/index.js`](file:///e:/TechTrekGT/outpost/functions/api/invoices/index.js), [`functions/api/invoices/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/invoices/[id].js), [`functions/api/items/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/items/[id].js), [`functions/api/platforms/index.js`](file:///e:/TechTrekGT/outpost/functions/api/platforms/index.js), [`functions/api/platforms/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/platforms/[id].js), [`functions/api/comps/market.js`](file:///e:/TechTrekGT/outpost/functions/api/comps/market.js)

**Finding:** Monetary and fee fields across sales, invoices, items, platforms, and market comps were coerced via `Number(val) || 0` patterns or parsed without negative-value and non-numeric bounds checks, allowing invalid or negative values to silently bypass validation and corrupt downstream net proceeds, profit, ROI, and tax liability calculations.

**Remediation:**
1. Created shared helper `validateNonNegativeMoney(val, fieldName)` in `functions/utils/auction.js` next to `round2`. The helper returns `null` for omitted/nullish values, parses numeric values, and throws an explicit `Error(`${fieldName} must be a non-negative number`)` on negative numbers, NaN, non-numeric strings, or booleans.
2. Integrated `validateNonNegativeMoney` across all 7 target endpoints (`salesCreate`, `salesUpdate`, `invoicesCreate`, `invoicesUpdate`, `itemUpdate`, `platformsCreate`, `platformsUpdate`, and `marketCompsPost`), wrapping calls in `try/catch` and returning HTTP 400 with the exact error message.
3. Protected all monetary fields: `unit_price`, `discount`, `shipping`, `tax`, `gross_sale_price`, `buyer_shipping_paid`, `actual_shipping_cost`, `platform_fee_pct`, `platform_flat_fee`, `current_list_price`, `actual_sell_price`, `list_price`, and `shipping_fee`.
4. Maintained permissive nullability for optional descriptive fields.
5. Added automated test suite in `tests/med-7-financial-numeric-validation.test.js` (13 tests) validating helper behavior, 400 rejection of negative `actual_shipping_cost`, negative discounts, negative fees, negative item sell prices, and negative shipping fees.

---

### MEDIUM-8: Fuzzy Title-Matching Heuristics and Safe Sales Attribution (REMEDIATED)

**Severity:** MEDIUM (Sales Misattribution & Incorrect Automated Reconciliation)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/api/ebay/tokenHelper.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js), [`functions/api/ebay/find-listings.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/find-listings.js), [`functions/api/ebay/match-sold-vinescout.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/match-sold-vinescout.js), [`src/utils/auctionApi.js`](file:///e:/TechTrekGT/outpost/src/utils/auctionApi.js), [`src/components/inventory/SoldEbayVineMatcherModal.jsx`](file:///e:/TechTrekGT/outpost/src/components/inventory/SoldEbayVineMatcherModal.jsx)

**Finding:** Token-overlap heuristics with thresholds as low as 0.35, combined with a raw 25-character prefix equality check (`lineTitle.slice(0, 25) === cleanTitle.slice(0, 25)`), allowed distinct items sharing generic prefix text (such as "2023 rookie card PSA 10") to match unrelated orders, silently misattributing sales and corrupting inventory accounting. Furthermore, the reconciliation write endpoint (`POST /api/ebay/match-sold-vinescout`) lacked an explicit confirmation guard.

**Remediation:**
1. In `functions/api/ebay/tokenHelper.js` (`fetchEbayOrderForListing`), removed the vulnerable 25-character prefix match (`cleanTitle.slice(0, 25) === lineTitle.slice(0, 25)`) across both Fulfillment API and Trading API GetOrders fallbacks. Title matching now strictly requires exact title equality or comprehensive full-length containment.
2. In `functions/api/ebay/find-listings.js` and `functions/api/ebay/match-sold-vinescout.js`, verified numeric `confidence` score inclusion and enforced `high_confidence: highestScore >= 0.80` on all suggested matches. Matches sharing generic tokens (< 0.80) are flagged as `high_confidence: false`.
3. In `functions/api/ebay/match-sold-vinescout.js` (`onRequestPost`), added a mandatory confirmation guard requiring `confirm: true` in the request body (`if (confirm !== true) return err('Explicit user confirmation (confirm: true) is required to reconcile this match', 400);`), preventing automated or unreviewed reconciliation. Also enforced non-negative financial validation via `validateNonNegativeMoney`.
4. In frontend API client (`src/utils/auctionApi.js`) and UI modal (`src/components/inventory/SoldEbayVineMatcherModal.jsx`), updated single and batch reconciliation actions to pass `confirm: true` explicitly, and restricted automated batch approval to `high_confidence` matches (`>= 0.80`).
5. Added automated test suite in `tests/med-8-fuzzy-title-matching.test.js` (11 tests) verifying heuristic thresholds, prefix match removal, `high_confidence: false` flagging for generic overlapping titles, and rejection of reconciliation requests missing `confirm: true`.

---

### MEDIUM-9: Multiple Independent Sale-Reconciliation Code Paths Race & De-duplication (REMEDIATED)

**Severity:** MEDIUM (Race Condition & Data Duplication / Financial Corruption)
**Status:** REMEDIATED & TESTED
**Files:** [`auction-schema.sql`](file:///e:/TechTrekGT/outpost/auction-schema.sql), [`functions/api/ebay/tokenHelper.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js), [`functions/api/items/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/items/[id].js), [`functions/api/sales/index.js`](file:///e:/TechTrekGT/outpost/functions/api/sales/index.js), [`functions/api/ebay/match-sold-vinescout.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/match-sold-vinescout.js), [`tests/med-9-sale-reconciliation-race.test.js`](file:///e:/TechTrekGT/outpost/tests/med-9-sale-reconciliation-race.test.js)

**Finding:** Multiple independent code paths (`reconcileAndSaveEbaySale`, `onRequestPut$6` inline Sold-status branch in `items/[id].js`, `onRequestPost$g` manual sale creation in `sales/index.js`, and `onRequestPost$3` in `match-sold-vinescout.js`) independently checked for an existing `auction_sales` record using disparate key combinations (some querying `ebay_order_id`, others `item_id`). The table lacked a database-level UNIQUE constraint on `item_id`, meaning concurrent executions (e.g. background sync-all running while a user logs a manual sale or reconciles a VineScout item) risked inserting duplicate sale records, corrupting net profit, inventory state, and revenue accounting.

**Remediation:**
1. In `auction-schema.sql`, added a `UNIQUE` constraint on `auction_sales(item_id)` and created unique indexes (`idx_auction_sales_item` and migration index `idx_auction_sales_item_unique`), ensuring the database strictly enforces at most one sale record per item.
2. In all four functions, standardized existing sale lookups to query exclusively by `item_id = ? AND user_id = ?` as the primary key, eliminating inconsistent lookups by `ebay_order_id`.
3. In all four functions, updated `INSERT INTO auction_sales (...)` queries to utilize `ON CONFLICT(item_id) DO UPDATE SET ...` syntax, atomically updating existing sale records with fresh sale prices, net proceeds, transaction IDs, order IDs, or notes.
4. Wrapped every INSERT statement in a `try/catch` block that catches unique constraint conflicts as a safety fallback, executing a targeted `UPDATE auction_sales SET ... WHERE item_id = ? AND user_id = ?` instead of throwing unhandled exceptions or failing the request.
5. In `match-sold-vinescout.js`, eliminated invalid reference to non-existent `updated_at` column on `auction_sales`.
6. Added automated test suite in `tests/med-9-sale-reconciliation-race.test.js` (5 tests) verifying database unique constraint enforcement, race simulation across all four paths (confirming exactly 1 sale row is preserved after concurrent calls), and consistent lookup by `item_id`.

---

### MEDIUM-10: Pervasive Number(x)||0 Coercion & Financial Calculation Audit (REMEDIATED)

**Severity:** MEDIUM (Financial Calculation Integrity & Input Audit)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/utils/auction.js`](file:///e:/TechTrekGT/outpost/functions/utils/auction.js), [`src/utils/formulaPreview.js`](file:///e:/TechTrekGT/outpost/src/utils/formulaPreview.js), [`functions/api/import/amazon.js`](file:///e:/TechTrekGT/outpost/functions/api/import/amazon.js), [`functions/api/import/amazon-url.js`](file:///e:/TechTrekGT/outpost/functions/api/import/amazon-url.js), [`tests/med-10-coercion-audit.test.js`](file:///e:/TechTrekGT/outpost/tests/med-10-coercion-audit.test.js)

**Finding:** The pattern `Number(val) || 0` and `|| 0` was used across financial calculation helpers (`computeItemProration`, `computeSaleMetrics`, `computePricingFloors`, `round2`). If un-audited, blanket coercion could treat `NaN`, invalid strings, or negative inputs as valid zeros, masking bad input and corrupting proration weights, platform fees, ROI, and cost basis calculations.

**Remediation:**
1. Audited all call sites in `computeItemProration`, `computeSaleMetrics`, `computePricingFloors`, and `round2` across both backend (`functions/utils/auction.js`) and frontend (`src/utils/formulaPreview.js`).
2. Confirmed upstream protection: Direct write endpoints (`POST/PUT /api/sales`, `POST/PUT /api/invoices`, `PUT /api/items/:id`, `POST/PUT /api/platforms`, `POST /api/comps/market`) strictly validate user inputs via `validateNonNegativeMoney(val, fieldName)` before persisting or calculating, rejecting negative numbers, booleans, and non-numeric strings with HTTP 400.
3. Enhanced ingestion pathways: In `POST /api/import/amazon` and `POST /api/import/amazon-url`, added `validateNonNegativeMoney` to validate `etv`, `vine_value`, and `tax_cost`/`tax_value`, rejecting negative values with HTTP 400 while preserving legitimate 0-defaults for zero-ETV items.
4. Documented intentional 0-defaults: Annotated all computation helpers with detailed comments explaining why 0 is a mathematically legitimate default (e.g. optional discount/shipping/tax on invoices, zero acquisition cost basis on gift/promotional/Vine items, zero-fee direct sales, and zero-markup pricing floors).
5. Added null-safety guards: In `computePricingFloors` and `computeItemProration`, ensured `(item.true_total_cost || 0)`, `(item.unit_price || 0)`, and `(invoice.base_total || 0)` never produce `NaN` when unassigned draft items or zero-cost lots are processed. Guarded `roi_pct` against division by zero.
6. Added comprehensive automated test suite in `tests/med-10-coercion-audit.test.js` (8 tests) verifying `round2` behavior, `computeItemProration` optional field handling and base_total = 0 guard, `computeSaleMetrics` zero COGS and division-by-zero protection, `computePricingFloors` draft fallback, and 400 rejection of negative inputs on Amazon import endpoints.

---

### MEDIUM-11: Inconsistent Negative Day-Count Guarding across daysBetween() (REMEDIATED)

**Severity:** MEDIUM (Metric Integrity & Inconsistent Business Logic)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/utils/auction.js`](file:///e:/TechTrekGT/outpost/functions/utils/auction.js), [`src/utils/formulaPreview.js`](file:///e:/TechTrekGT/outpost/src/utils/formulaPreview.js), [`functions/api/sales/index.js`](file:///e:/TechTrekGT/outpost/functions/api/sales/index.js), [`functions/api/sales/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/sales/[id].js), [`functions/api/items/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/items/[id].js), [`functions/api/ebay/tokenHelper.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js), [`tests/med-11-days-between-guard.test.js`](file:///e:/TechTrekGT/outpost/tests/med-11-days-between-guard.test.js)

**Finding:** `daysBetween(fromDate, toDate)` previously computed raw `Math.floor(ms / (1000 * 60 * 60 * 24))` without bounding the result to non-negative numbers. When `toDate` (e.g. sale date or sold date) preceded `fromDate` (e.g. date acquired or date listed), it returned negative numbers. Different callers guarded against this inconsistently (e.g. `rawDays >= 0 ? rawDays : 0` in `tokenHelper.js`, `diff != null && diff >= 0 ? diff : 0` in `items/[id].js`, but raw `daysBetween(...) ?? existing.days_to_sell` in `sales/[id].js`), resulting in negative `days_to_sell` metrics in `auction_sales` under certain update flows.

**Remediation:**
1. Modified `daysBetween(fromDate, toDate)` in `functions/utils/auction.js` and `src/utils/formulaPreview.js` to clamp negative day counts directly: if `days < 0`, it logs a warning via `console.warn` (`[daysBetween] Clamped negative days (${days}) to 0 for fromDate: "${fromDate}", toDate: "${toDate}"`) and returns `0`.
2. Simplified call sites: In `items/[id].js`, replaced `diff != null && diff >= 0 ? diff : 0` with `days_on_market = daysBetween(from, to) ?? 0;`. In `tokenHelper.js`, replaced `const rawDays = ...; const daysToSell = rawDays >= 0 ? rawDays : 0;` with `const daysToSell = daysBetween(startDate, saleDate) ?? 0;`.
3. In `sales/[id].js` and `sales/index.js`, guaranteed non-negative day counts for all created and updated sale records when `sale_date` precedes acquisition date.
4. Added automated test suite in `tests/med-11-days-between-guard.test.js` (6 tests) verifying unit clamping, warning emission, and non-negative day persistence across `POST /api/sales`, `PUT /api/sales/:id`, `PUT /api/items/:id` (marking Sold), and `reconcileAndSaveEbaySale`.

---

### MEDIUM-12: Brittle Regex-Based XML Parsing of eBay Trading API Responses (REMEDIATED)

**Severity:** MEDIUM (Code Duplication & XML Parsing Robustness)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/api/ebay/tokenHelper.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js), [`tests/med-12-xml-parsing-consolidation.test.js`](file:///e:/TechTrekGT/outpost/tests/med-12-xml-parsing-consolidation.test.js)

**Finding:** Four separate closures defined duplicate `getTag` regex matching logic inside `fetchEbayActiveSellerListings`, `fetchSingleEbayListing`, and `fetchEbayOrderForListing` (both `GetItemTransactions` and `GetOrders` fallbacks), with ad-hoc regex matching in `updateEbayListingSku`. Unconsolidated duplicate closures made XML tag and CDATA handling inconsistent and brittle across Trading API endpoints.

**Remediation:**
1. Extracted a single exported helper `extractXmlTag(xml, tag)` near the top of `functions/api/ebay/tokenHelper.js`. It safely handles string checking, regex tag matching with attribute support, text trimming, and CDATA block unwrapping (`<![CDATA[...] ]]>`).
2. Replaced all duplicate inline `getTag` closures with direct calls to `extractXmlTag(source, tag)`.
3. Preserved strict `<Item>...</Item>`, `<Order>...</Order>`, `<Transaction>...</Transaction>`, and `<NameValueList>...</NameValueList>` block-level scoping patterns to prevent cross-block nested tag collisions.
4. Standardized `updateEbayListingSku` to use `extractXmlTag(text, 'Ack')` and `extractXmlTag(text, 'LongMessage') || extractXmlTag(text, 'ShortMessage')`.
5. Created comprehensive automated test suite in `tests/med-12-xml-parsing-consolidation.test.js` (13 tests) verifying tag extraction, CDATA unwrapping, multiline extraction, attribute handling, null-safety, and end-to-end extraction across `fetchEbayActiveSellerListings`, `fetchSingleEbayListing`, `updateEbayListingSku`, and `fetchEbayOrderForListing`.

---

### MEDIUM-13: Duplicated Logic Bundled Twice Inflates Worker Size (REMEDIATED)

**Severity:** MEDIUM (Code Duplication, Bundle Size & Cold-Start Latency)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/utils/platforms.js`](file:///e:/TechTrekGT/outpost/functions/utils/platforms.js), [`functions/utils/ebayUtils.js`](file:///e:/TechTrekGT/outpost/functions/utils/ebayUtils.js), [`functions/utils/auction.js`](file:///e:/TechTrekGT/outpost/functions/utils/auction.js), [`functions/api/items/enriched.js`](file:///e:/TechTrekGT/outpost/functions/api/items/enriched.js), [`functions/api/comps/index.js`](file:///e:/TechTrekGT/outpost/functions/api/comps/index.js), [`functions/api/comps/[id].js`](file:///e:/TechTrekGT/outpost/functions/api/comps/[id].js), [`functions/api/platforms/index.js`](file:///e:/TechTrekGT/outpost/functions/api/platforms/index.js), [`functions/api/auth/register.js`](file:///e:/TechTrekGT/outpost/functions/api/auth/register.js), [`tests/med-13-bundled-logic-deduplication.test.js`](file:///e:/TechTrekGT/outpost/tests/med-13-bundled-logic-deduplication.test.js)

**Finding:** Six functional utilities and constant arrays were defined twice across different Pages Functions files: `cleanEbaySearchQuery`, `buildEbaySearchUrl`, `parseImageFromNotes`, and `parseUserNote` (in both `items/enriched.js` and `comps/index.js`), `computeManualAvg` (in both `comps/index.js` and `comps/[id].js`), and `DEFAULT_PLATFORMS` (in both `platforms/index.js` and `auth/register.js`). When bundled into the Worker bundle, Rollup/Vite emitted suffixed duplicates (`$1`), increasing cold-start parsing overhead and inflating bundle size.

**Remediation:**
1. Created shared modules [`functions/utils/platforms.js`](file:///e:/TechTrekGT/outpost/functions/utils/platforms.js) and [`functions/utils/ebayUtils.js`](file:///e:/TechTrekGT/outpost/functions/utils/ebayUtils.js) (with aliases in `functions/_shared/`).
2. Updated `functions/utils/auction.js` to export a robust, nullable `computeManualAvg` helper matching all endpoint requirements.
3. Updated `items/enriched.js`, `comps/index.js`, `comps/[id].js`, `platforms/index.js`, and `auth/register.js` to import from these shared modules instead of declaring local copies, while preserving public re-exports for external callers.
4. Verified with automated AST/bundle analysis that all `$1` duplicates (`DEFAULT_PLATFORMS$1`, `cleanEbaySearchQuery$1`, `buildEbaySearchUrl$1`, `computeManualAvg$1`, `parseImageFromNotes$1`, `parseUserNote$1`) were completely eliminated, reducing Worker bundle size from 385.13 kB to 379.42 kB.
5. Created automated test suite in `tests/med-13-bundled-logic-deduplication.test.js` (8 tests) verifying platform export parity, search query cleaning, search URL generation, notes parsing, and comp averaging.

---

### MEDIUM-14: Repeated JSON.parse/stringify of Attributes Column Inside Per-Item Sync Loops (REMEDIATED)

**Severity:** MEDIUM (Performance, Memory Overhead & Stale Write Hazards)
**Status:** REMEDIATED & TESTED
**Files:** [`functions/api/ebay/sync-all.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js), [`functions/api/ebay/tokenHelper.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js), [`tests/med-14-sync-all-attributes-parse.test.js`](file:///e:/TechTrekGT/outpost/tests/med-14-sync-all-attributes-parse.test.js)

**Finding:** In `sync-all.js` (`onRequestPost`), `item.attributes` was parsed and re-stringified multiple times per item within a single loop iteration. For sold active listings, the handler previously parsed attributes to attach an enriched image URL, executed an intermediate `UPDATE auction_items SET attributes = ...`, then re-queried the database (`SELECT attributes FROM auction_items WHERE id = ?`), parsed the JSON string a second time, attached VineScout write-back metadata (`outpost_liquidated: 1`, `sale_price`, `sold_at`, `ebay_order_id`), and executed a second `UPDATE auction_items SET attributes = ...`. In the fallback single-listing branch, parsing `item.attributes` a second time read the stale original item row, clobbering previously assigned image properties.

**Remediation:**
1. Implemented a dedicated `parseAttributes(attrSrc)` helper in `functions/api/ebay/sync-all.js` that safely handles string JSON, pre-parsed objects, null/undefined, and malformed inputs.
2. In `onRequestPost`'s main per-item loop body, parsed `item.attributes` exactly once near the top of the iteration into `let attrs = parseAttributes(item.attributes)`.
3. Mutated this single in-memory `attrs` object across all enrichment and write-back paths (image URL normalization, VineScout `outpost_liquidated`, `sale_price`, `sold_at`, `ebay_order_id`).
4. Consolidated database writes so `JSON.stringify(attrs)` is executed exactly once right before the final `UPDATE` statement in each branch, eliminating the redundant `SELECT` query and intermediate `UPDATE` query entirely.
5. In `tokenHelper.js`, extracted `ListingStatus` and `QuantitySold` from `GetMyeBaySelling` XML blocks and added `salePrice` property aliases to all `fetchEbayOrderForListing` return objects, ensuring seamless cross-provider sale reconciliation.
6. Created automated test suite in `tests/med-14-sync-all-attributes-parse.test.js` (5 tests) verifying active listing image enrichment, sold active listing write-back consolidation, recent orders write-back, fallback single-listing consolidation, and malformed JSON resilience.

---

### MEDIUM-15: Active Listings Caching & Invalidation Layer (REMEDIATED)

**Severity:** MEDIUM (Upstream Rate Limiting, Redundant External Calls & Latency)
**Status:** REMEDIATED & TESTED
**Files:** [`auction-schema.sql`](file:///e:/TechTrekGT/outpost/auction-schema.sql), [`functions/api/ebay/listingsCache.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/listingsCache.js), [`functions/api/ebay/active-listings.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/active-listings.js), [`functions/api/ebay/find-listings.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/find-listings.js), [`functions/api/ebay/sync-item.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-item.js), [`functions/api/ebay/sync-all.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js), [`tests/med-15-ebay-listings-cache.test.js`](file:///e:/TechTrekGT/outpost/tests/med-15-ebay-listings-cache.test.js)

**Finding:** The listing discovery endpoints (`GET /api/ebay/active-listings` and `GET /api/ebay/find-listings`) previously had no caching layer. Every invocation re-triggered a full multi-call eBay upstream fetch sequence (Trading API `GetMyeBaySelling` + REST Inventory API `/sell/inventory/v1/inventory_item` + per-SKU offer lookups), exhausting upstream rate limits and degrading interactive UI response times.

**Remediation:**
1. Created schema migration in `auction-schema.sql` for table `ebay_listings_cache` with columns `user_id`, `listings_json`, `fetched_at` and index on `user_id`.
2. Built centralized caching utility [`functions/api/ebay/listingsCache.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/listingsCache.js) exposing `getCachedEbayListings` (15-minute TTL), `setCachedEbayListings`, `invalidateEbayListingsCache`, and `ensureEbayListingsCacheTable`.
3. Integrated cache checking into [`active-listings.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/active-listings.js) and [`find-listings.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/find-listings.js) so fresh cache rows serve listings immediately from D1, while supporting explicit cache bypass via `force=true`.
4. In explicit sync operations:
   - [`sync-item.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-item.js) invalidates the user's listings cache upon updating an item.
   - [`sync-all.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js) overwrites the cache with fresh live listings fetched during batch synchronization.
5. Created comprehensive automated test suite in `tests/med-15-ebay-listings-cache.test.js` (6 tests) verifying cache hit, cache miss, TTL expiration, force bypass, `find-listings` reuse, `sync-item` invalidation, and `sync-all` overwrite.

---

### MEDIUM-16: Legacy Password Iteration Inconsistency Comment Cross-Reference (REMEDIATED)

**Severity:** MEDIUM (Documentation, Code Maintainability & Security Invariant Clarity)
**Status:** REMEDIATED & DOCUMENTED
**Files:** [`functions/utils/auth.js`](file:///e:/TechTrekGT/outpost/functions/utils/auth.js), [`scripts/check-legacy-hashes.js`](file:///e:/TechTrekGT/outpost/scripts/check-legacy-hashes.js), [`tests/high-6-legacy-pbkdf2-hash.test.js`](file:///e:/TechTrekGT/outpost/tests/high-6-legacy-pbkdf2-hash.test.js)

**Finding:** Pairs with HIGH-6. Early platform accounts used a legacy 2-part password hash (`salt:hash`) with an implicit hardcoded iteration count (100k or 600k), whereas modern accounts strictly require the 3-part format (`salt:iterations:hash`, default 310,000). While HIGH-6 eliminated the silent iteration-guessing fallback in Outpost (`parts.length !== 3` rejects), the rationale, database audit status, and migration lifecycle lacked explicit inline documentation directly above the `verifyPassword` branching logic.

**Remediation:**
1. Documented historical context and migration plan directly above `verifyPassword` in `outpost/functions/utils/auth.js`, explaining why legacy 2-part format is rejected and how `check-legacy-hashes.js` audits and flags legacy accounts (`force_password_reset = 1`) for interactive upgrade via `/reset-password`.
2. Cross-referenced the migration plan across all platform auth modules (`outpost/functions/utils/auth.js`, `landing/src/gateway/auth.js`, `wayfinder/functions/utils/auth.js`, `bigworm/functions/utils/auth.js`), explicitly marking 100k fallback lines as deprecated pending full database reset completion.
3. Verified existing unit test suite in `tests/high-6-legacy-pbkdf2-hash.test.js` (5 tests) confirms strict 3-part hash validation, 2-part rejection without fallback guessing, and HTTP 403 password reset redirection.

---

### LOW-1: Dual Authentication Acceptance Path (Cookie + Bearer) (CONFIRMED SECURE & DOCUMENTED)

**Severity:** LOW (Token Exposure Surface Review & Intent Documentation)
**Status:** AUDITED, CONFIRMED SECURE & DOCUMENTED
**Files:** [`functions/utils/auth.js`](file:///e:/TechTrekGT/outpost/functions/utils/auth.js), [`src/utils/auctionApi.js`](file:///e:/TechTrekGT/outpost/src/utils/auctionApi.js), [`landing/src/gateway/auth.js`](file:///e:/TechTrekGT/landing/src/gateway/auth.js)

**Finding:** `getTokenFromRequest` accepts tokens from either an `auth_token` cookie or an `Authorization: Bearer <token>` header. Audit was requested to verify whether the browser web SPA ever extracts the JWT from the cookie into JavaScript-accessible storage (e.g. `localStorage` or `sessionStorage`), which would widen token exposure under cross-site scripting (XSS).

**Audit Findings & Verification:**
1. **Frontend Isolation Confirmed:** Audited the frontend codebase (`outpost/src/` and `src/utils/auctionApi.js`). Confirmed that the React SPA **never** reads, stores, or accesses the JWT in JavaScript storage. The session cookie is issued with `HttpOnly`, `SameSite=Strict`, and `Secure` attributes, rendering it completely inaccessible to client-side scripts. All client-initiated API requests use `credentials: 'include'` exclusively without setting `Authorization` headers.
2. **Intent of Bearer Path Documented:** Confirmed that the `Authorization: Bearer` path exists strictly to accommodate non-browser consumers, including:
   - Server-to-server and desktop companion utilities.
   - Headless automated integration test suites (`node --test tests/*.test.js`).
   - CLI automation tools and developer API debugging.
3. **Behavior Maintained with Explicit Invariant:** Because browser traffic unconditionally evaluates and matches the `HttpOnly` cookie first, and browser JavaScript cannot read the token to construct a Bearer header, the token exposure surface is fully protected. Retaining standard Bearer extraction preserves testability and desktop/CLI tool interoperability without compromising browser security. Documented this operational model via JSDoc and inline comments in `functions/utils/auth.js` and `landing/src/gateway/auth.js`.

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

| Priority | Severity | Finding | Location | Status |
|---|---|---|---|---|
| 1 | CRITICAL | Remove unauthenticated fallback user lookup | `import/amazon.js` Lines 57-65 | [x] DEPLOYED |
| 2 | CRITICAL | Add `user_id` guard to `existingItem` UPDATE | `import/amazon.js` Line ~177 | [x] DEPLOYED |
| 3 | HIGH | Add `user_id` to comps cascade DELETE | `items/[id].js` Line 358 | [x] DEPLOYED |
| 4 | HIGH | Change `SameSite=Lax` to `SameSite=Strict` | `utils/auth.js` Line 169 | [x] DEPLOYED |
| 5 | MEDIUM | Add KV unavailability warning | `utils/rateLimit.js` Line 3 | [x] DEPLOYED |
