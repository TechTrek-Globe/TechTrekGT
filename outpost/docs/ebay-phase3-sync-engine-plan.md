# eBay Phase 3: Real-Time Sync Engine - Implementation Plan

**Repository:** TechTrekGT / `outpost/`
**Status:** DRAFT - Awaiting "Plan approved" before any source code changes
**Scope:** Webhook listener, User OAuth lifecycle, Finances API fee reconciliation, cross-listing defense, and cert/listing metadata mapping
**Predecessor:** `ebay-gateway-integration-plan.md` (Phase 2 - COMPLETE)
**Created:** 2026-08-29

---

## 0. Pre-Flight Audit: What Is Already Live

Before describing what is NEW, this section establishes the precise as-built baseline so the Phase 3 plan introduces zero duplication.

### 0.1 Landing Gateway (techtrek-landing Worker) - LIVE

| File | Status | Capability |
|------|--------|------------|
| `landing/src/gateway/ebay.js` | Live | OAuth CCF, KV token cache (`GATEWAY_KV`), Insights + Browse API 4-pass comp strategy |
| `landing/src/gateway/ebayCatalog.js` | Live | `GET /api/ebay/catalog` - eBay Catalog product search |
| `landing/src/gateway/ebayItem.js` | Live | `GET /api/ebay/item/:id` - eBay Browse item detail |
| `landing/src/gateway/amazon.js` | Live | Amazon scraper proxy |
| `landing/src/gateway/guard.js` | Live | `requireGatewayAuth`, `withGatewayAuth`, `ok`, `err` helpers |
| `landing/src/gateway/auth.js` | Live | WebCrypto JWT verify, cookie extraction |
| `landing/src/worker.js` | Live | Routes all `/api/*` - comps, catalog, item, amazon, health |

**Existing landing worker secrets:** `JWT_SECRET`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `SCRAPER_API_KEY`, `AMAZON_SCRAPER_URL`

**Existing KV binding:** `GATEWAY_KV` (token cache, ~2hr TTL window)

### 0.2 Outpost Backend (techtrek-outpost Worker) - LIVE

| Handler | Route | Status |
|---------|-------|--------|
| `functions/api/comps/index.js` | `GET/POST /api/comps` | Live |
| `functions/api/market-alerts.js` | `GET/POST/PUT /api/market-alerts` | Live |
| `functions/api/sales/index.js` | `GET/POST /api/sales` | Live |
| `functions/api/items/index.js` | `GET/POST/PUT /api/items` | Live |
| `functions/api/invoices/index.js` | `GET/POST/PUT /api/invoices` | Live |
| `functions/api/platforms/index.js` | `GET/POST/PUT /api/platforms` | Live |
| `functions/api/supplies/index.js` | `GET/POST/PUT /api/supplies` | Live |
| `functions/api/reports/index.js` | `GET /api/reports` | Live |
| `functions/api/sync/index.js` | `GET/POST /api/sync` | Live |
| `functions/api/dashboard.js` | `GET /api/dashboard` | Live |

### 0.3 Current D1 Schema - `auction-schema.sql` - LIVE

Key tables relevant to this plan:

| Table | Purpose | Relevant Columns |
|-------|---------|-----------------|
| `auction_items` | Core inventory | `status`, `platform`, `cert_number`, `authenticator`, `notes`, `current_list_price` |
| `auction_sales` | Sale records | `gross_sale_price`, `platform_fees_amt`, `promoted_listing_fee`, `net_proceeds`, `net_profit` |
| `auction_comps` | Pricing intel | `live_avg`, `recommended_list_price`, `ebay_search_url` |
| `auction_market_alerts` | Price movement alerts | `alert_type`, `old_value`, `new_value`, `is_read` |

### 0.4 Critical Gap Assessment

The current system has these gaps that Phase 3 resolves:

| Gap | Impact | Phase 3 Solution |
|-----|--------|-----------------|
| No user-level eBay OAuth (Authorization Code Grant) | Cannot call Finances API, cannot receive Webhooks on behalf of user | New: `ebay_oauth_tokens` D1 table + OAuth ACG flow |
| No Webhook listener | Sales are manually logged only; no real-time `ITEM_SOLD` / `ORDER_PAYMENT_STATUS` push | New: `POST /api/ebay/webhook` endpoint in landing gateway |
| `auction_sales` stores estimated fees only | `net_profit` is approximate; no reconciliation against actual eBay charge ledger | New: `ebay_fee_reconciliations` table + Finances API pull |
| No cross-listing protection | An eBay sale can result in double-selling on other platforms | New: `delist_pending` status + `ebay_listing_id` field on `auction_items` |
| Cert numbers and eBay listing IDs not formally linked | Cannot programmatically match a JSA/Beckett cert to its active eBay listing | New: `ebay_listing_id` + `cert_verification_url` columns on `auction_items` |

---

## 1. Architecture Overview

```
+---------------------------------------------------------------------+
|  eBay Platform                                                       |
|  +---------------------+   +------------------------------------+   |
|  |  Notification        |   |  eBay REST APIs                    |   |
|  |  Delivery Service   |   |  - Sell Finances API               |   |
|  |  (Webhook Push)     |   |  - Order Management API            |   |
|  |  ITEM_SOLD          |   |  - Sell Inventory API (listing IDs)|   |
|  |  ORDER_PAYMENT_*    |   |                                    |   |
|  +----------+----------+   +------------------+-----------------+   |
|             |                                 |                     |
+-------------|-------------------------------- |---------------------+
              | POST /api/ebay/webhook          | Bearer (user token)
              v                                 v
+---------------------------------------------------------------------+
|  techtrek-landing Worker  (Central API Gateway)                     |
|                                                                     |
|  /api/ebay/webhook  <--- New: HMAC-SHA256 signature validation      |
|  /api/ebay/oauth/*  <--- New: ACG redirect + callback + token mgmt  |
|  /api/ebay/finances <--- New: Finances API proxy (user token)       |
|  /api/ebay/orders   <--- New: Order Management API proxy            |
|  /api/ebay/listings <--- New: Active listing ID lookup              |
|                                                                     |
|  GATEWAY_KV:                                                        |
|    ebay_access_token -> CCF app token (existing)                    |
|    webhook_challenge_<token> -> ephemeral challenge (new)           |
|                                                                     |
+------------------------------+--------------------------------------+
                               | D1 reads/writes (user OAuth tokens)
                               v
+---------------------------------------------------------------------+
|  Cloudflare D1: personal-budget-db                                  |
|                                                                     |
|  [NEW] ebay_oauth_tokens        <- user ACG tokens + refresh cycle  |
|  [NEW] ebay_webhook_events      <- raw webhook event log            |
|  [NEW] ebay_fee_reconciliations <- per-sale Finances API actuals    |
|                                                                     |
|  [MODIFIED] auction_items       <- ebay_listing_id, cert_ver_url,  |
|                                    delist_pending status flag       |
|  [MODIFIED] auction_sales       <- ebay_order_id, fee_reconciled_at|
+------------------------------+--------------------------------------+
                               |
                               v
+---------------------------------------------------------------------+
|  techtrek-outpost Worker                                            |
|                                                                     |
|  /api/ebay/reconcile  <--- New: trigger Finances API pull per sale  |
|  /api/ebay/find-listings <-- New: find active eBay listing IDs      |
|  (existing routes unchanged)                                        |
+------------------------------+--------------------------------------+
                               |
                               v
+---------------------------------------------------------------------+
|  Outpost React Frontend                                             |
|                                                                     |
|  [NEW] EbayConnectBanner.jsx       <- OAuth ACG connect/disconnect  |
|  [NEW] EbayListingIdModal.jsx      <- map listing IDs to items      |
|  [NEW] FeeReconciliationPanel.jsx  <- actual vs estimated fee diff  |
|  [MODIFIED] SalesLogView.jsx       <- show reconciled net profit    |
|  [MODIFIED] InventoryHubView.jsx   <- delist_pending badge          |
+---------------------------------------------------------------------+
```

---

## 2. eBay OAuth: Authorization Code Grant (ACG)

### 2.1 Why ACG Is Required

The existing CCF (Client Credentials Flow) in `ebay.js` produces an **application-level** token. It can read public eBay data but cannot:
- Read the user's **Finances API** (actual fee ledger)
- Read or update the user's **Order Management** records
- Subscribe to **Webhooks** on behalf of the user

For these operations, a **user-level token** from the Authorization Code Grant flow is required. The user must explicitly grant permission through the eBay OAuth consent screen.

### 2.2 Required eBay OAuth Scopes

```
https://api.ebay.com/oauth/api_scope                         (base)
https://api.ebay.com/oauth/api_scope/sell.finances           (Finances API)
https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly (Order Management)
https://api.ebay.com/oauth/api_scope/sell.inventory.readonly  (active listing IDs)
```

> **IMPORTANT: eBay Developer Program Approval Required**
> The `sell.finances` scope requires the developer application to be approved for Finances API access. Apply at `https://developer.ebay.com` under "My Account" -> "Application Access Requests." This is separate from the CCF scopes and may take 1-5 business days.

### 2.3 ACG OAuth Flow

```
User (in Outpost)       Outpost Worker           Landing Gateway          eBay
     |                        |                         |                  |
     |  Click "Connect eBay"  |                         |                  |
     |----------------------->|                         |                  |
     |                        |  GET /api/ebay/oauth/start                 |
     |                        |------------------------>|                  |
     |                        |                         |  Build auth URL  |
     |  Redirect 302          |<------------------------|  + PKCE state    |
     |<-----------------------|                         |                  |
     |  GET https://auth.ebay.com/oauth2/authorize?...  |                  |
     |--------------------------------------------------------------------->
     |                                                                      |
     |  User grants permission                                              |
     |<---------------------------------------------------------------------
     |  GET /api/ebay/oauth/callback?code=...&state=... |                  |
     |----------------------------------------------------->               |
     |                        |<------------------------|                  |
     |                        |                         |  POST /token     |
     |                        |                         |----------------->|
     |                        |                         |<-----------------|
     |                        |                         |  Store in D1     |
     |  Redirect /outpost/settings?ebay=connected        |                  |
     |<----------------------------------------------------                |
```

### 2.4 D1 Schema: `ebay_oauth_tokens`

```sql
-- ============================================================
-- EBAY USER OAUTH TOKENS (Authorization Code Grant)
-- ============================================================
CREATE TABLE IF NOT EXISTS ebay_oauth_tokens (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL UNIQUE,        -- FK to users.id (one token set per user)
  access_token       TEXT NOT NULL,               -- current Bearer token (encrypted at rest)
  refresh_token      TEXT NOT NULL,               -- long-lived refresh token (encrypted at rest)
  access_token_exp   TEXT NOT NULL,               -- ISO timestamp: when access_token expires
  refresh_token_exp  TEXT NOT NULL,               -- ISO timestamp: when refresh_token expires (18 months)
  scopes             TEXT NOT NULL,               -- space-separated granted scopes
  ebay_user_id       TEXT,                        -- eBay account username/ID (from /identity call)
  connected_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_refreshed_at  TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ebay_oauth_user ON ebay_oauth_tokens(user_id);
```

> **CAUTION: Token Encryption Requirement**
> Access and refresh tokens must NEVER be stored in plain text in D1. Before any INSERT or UPDATE, the token values must be encrypted using the `JWT_SECRET` as key material via the Web Crypto API (`AES-GCM`, 256-bit key derived via `PBKDF2`). The encrypted payload is stored as a base64 string. A dedicated `tokenCrypto.js` module handles this transparently.

### 2.5 Gateway Handler: `landing/src/gateway/ebayOAuth.js`

Three exported handlers:

```
GET    /api/ebay/oauth/start       -> Build eBay authorization URL, store PKCE state in KV, redirect
GET    /api/ebay/oauth/callback    -> Exchange code for tokens, encrypt + store in D1, redirect to /outpost/settings
GET    /api/ebay/oauth/status      -> Return { connected: bool, ebay_user_id, scopes, expires_at }
DELETE /api/ebay/oauth/disconnect  -> Revoke token, DELETE from D1
```

**PKCE State validation:**
- On `/start`: generate cryptographically random `state` + `code_verifier` + `code_challenge` (SHA-256).
- Store `{ code_verifier, userId }` in `GATEWAY_KV` under key `oauth_state_<state>` with 10-minute TTL.
- On `/callback`: validate `state` param against KV; retrieve `code_verifier`; delete KV key immediately.

**Token Refresh Logic (auto-refresh):**
```js
// getEbayUserToken(env, userId) - called by Finances/Order/Listing handlers
// 1. Read from D1 for userId
// 2. If access_token_exp > now + 5min: decrypt and return immediately
// 3. If refresh_token_exp < now: throw "eBay token expired - user must reconnect"
// 4. Otherwise: POST /identity/v1/oauth2/token with grant_type=refresh_token
// 5. Encrypt new access_token, UPDATE D1 row, return fresh token
```

---

## 3. Webhook Listener

### 3.1 eBay Notification Service - How It Works

eBay's Notification Service delivers HTTP POST callbacks to a registered endpoint when specific events occur. Events relevant to Outpost:

| Event Topic | Payload Key | Meaning |
|-------------|-------------|---------|
| `MARKETPLACE_ACCOUNT_DELETION` | - | Mandatory: user requests account deletion |
| `ITEM_SOLD` | `ItemID`, `TransactionID` | A BIN/auction item was purchased |
| `ORDER_PAYMENT_STATUS` | `OrderID`, `PaymentStatus` | Payment marked PAID |
| `AUCTION_CLOSED` | `ItemID` | Auction ended (won/no-sale) |

**Endpoint registration:** Done via the eBay Developer Portal (Notification API) pointing to `https://techtrekgt.com/api/ebay/webhook`.

### 3.2 Security: HMAC-SHA256 Signature Validation

Every eBay Notification POST includes the header `X-EBAY-SIGNATURE`. This is an HMAC-SHA256 digest of the raw request body, signed with the eBay-assigned Notification Secret.

**Validation flow in the webhook handler:**

```js
// 1. Read raw body as ArrayBuffer (do NOT parse as JSON first - signature is over raw bytes)
const rawBody = await request.arrayBuffer();

// 2. Extract signature from header
const signature = request.headers.get('X-EBAY-SIGNATURE');

// 3. Compute HMAC-SHA256 over rawBody using env.EBAY_NOTIFICATION_SECRET
const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(env.EBAY_NOTIFICATION_SECRET),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['verify']
);

const isValid = await crypto.subtle.verify(
  'HMAC',
  key,
  base64ToArrayBuffer(signature),
  rawBody
);

if (!isValid) return new Response('Forbidden', { status: 403 });
```

> **WARNING: Webhook Challenge Handshake**
> When registering a webhook endpoint, eBay first sends a `GET` request with a `challenge_code` query parameter. The handler must respond with `SHA-256(challenge_code + notificationSecret + endpoint_url)` formatted as a specific JSON body. The `GET /api/ebay/webhook` route handles this challenge response before any other logic.

### 3.3 D1 Schema: `ebay_webhook_events`

```sql
-- ============================================================
-- EBAY WEBHOOK EVENTS (raw inbound event log)
-- ============================================================
CREATE TABLE IF NOT EXISTS ebay_webhook_events (
  id              TEXT PRIMARY KEY,               -- crypto.randomUUID()
  event_type      TEXT NOT NULL,                  -- 'ITEM_SOLD', 'ORDER_PAYMENT_STATUS', etc.
  ebay_item_id    TEXT,                           -- extracted from payload
  ebay_order_id   TEXT,                           -- extracted from payload
  raw_payload     TEXT NOT NULL,                  -- full JSON payload (TEXT, not BLOB)
  processed       INTEGER NOT NULL DEFAULT 0,     -- 0=pending, 1=processed, 2=error
  processed_at    TEXT,
  error_message   TEXT,
  received_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON ebay_webhook_events(processed, received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_item ON ebay_webhook_events(ebay_item_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON ebay_webhook_events(ebay_order_id);
```

### 3.4 Gateway Handler: `landing/src/gateway/ebayWebhook.js`

**Exported handlers:**

```
GET  /api/ebay/webhook  -> Challenge handshake (unauthenticated - eBay calls this)
POST /api/ebay/webhook  -> HMAC validation + event dispatch
```

**Event dispatch logic (POST handler):**

```
1. Validate HMAC-SHA256 signature -> 403 if invalid
2. Parse raw body as JSON
3. Extract event_type from payload
4. INSERT into ebay_webhook_events with processed=0
5. ctx.waitUntil(dispatchWebhookEvent(event, env)) - async background process
6. Return 200 immediately to eBay (within 3s SLA)

dispatchWebhookEvent(event, env):
  - ITEM_SOLD:
      a. Look up auction_items WHERE ebay_listing_id = event.ItemID
      b. If found: UPDATE auction_items SET status='delist_pending', updated_at=now()
      c. Mark webhook_event processed=1
  - ORDER_PAYMENT_STATUS (PAID):
      a. Look up auction_items WHERE ebay_listing_id = event.ItemID
      b. If found and delist_pending: UPDATE status='Sold'
      c. Auto-create record in auction_sales (draft) with gross_sale_price from event
      d. Mark webhook_event processed=1
  - MARKETPLACE_ACCOUNT_DELETION:
      a. DELETE FROM ebay_oauth_tokens WHERE ebay_user_id = event.UserId
      b. Mark webhook_event processed=1
```

> **IMPORTANT: Landing Worker D1 Binding Required**
> The landing gateway currently has NO D1 binding. To give the webhook handler D1 write access, `landing/wrangler.jsonc` must be updated to add the shared `personal-budget-db` D1 binding. This is a mandatory pre-requisite in the implementation sequence.

### 3.5 New Secrets Required

| Secret Name | Set In | Purpose |
|-------------|--------|---------|
| `EBAY_NOTIFICATION_SECRET` | `landing` worker | HMAC-SHA256 signing key for webhook validation |
| `EBAY_REDIRECT_URI` | `landing` worker | `https://techtrekgt.com/api/ebay/oauth/callback` |

```powershell
# From E:\TechTrekGT\landing\
wrangler secret put EBAY_NOTIFICATION_SECRET
wrangler secret put EBAY_REDIRECT_URI
```

---

## 4. True Fee Reconciliation: eBay Finances API

### 4.1 What the Finances API Provides

After an eBay sale is paid, the Sell Finances API (`/sell/finances/v1/transaction`) returns the actual charge ledger entries. This is the ground truth for net profit.

**Key fee categories returned:**

| Fee Type | Finances API `transactionType` | Description |
|----------|-------------------------------|-------------|
| Final Value Fee | `NON_SALE_CHARGE` with `feeType=FINAL_VALUE_FEE` | Percentage of sale + shipping |
| Promoted Listings | `NON_SALE_CHARGE` with `feeType=AD_FEE` | Promoted Listings Standard ad rate charge |
| Shipping Label | `SHIPPING_LABEL` | eBay-generated postage cost |
| Payment Processing | Embedded in `SALE` record | Managed Payments processing cut |
| Regulatory Fee | `REGULATORY_FEE` | State-specific collection fees |

### 4.2 D1 Schema: `ebay_fee_reconciliations`

```sql
-- ============================================================
-- EBAY FEE RECONCILIATIONS (Finances API actual charges per sale)
-- ============================================================
CREATE TABLE IF NOT EXISTS ebay_fee_reconciliations (
  id                      TEXT PRIMARY KEY,
  sale_id                 TEXT NOT NULL,             -- FK to auction_sales.id
  user_id                 TEXT NOT NULL,
  ebay_order_id           TEXT NOT NULL,             -- eBay order reference
  ebay_transaction_id     TEXT,                      -- Finances API transaction ID

  -- Actual eBay-charged amounts (all in USD)
  final_value_fee         REAL NOT NULL DEFAULT 0.0,
  promoted_listing_fee    REAL NOT NULL DEFAULT 0.0,
  shipping_label_cost     REAL NOT NULL DEFAULT 0.0,
  payment_processing_fee  REAL NOT NULL DEFAULT 0.0,
  regulatory_fee          REAL NOT NULL DEFAULT 0.0,
  total_ebay_fees         REAL NOT NULL DEFAULT 0.0, -- sum of above

  -- Reconciliation delta (actual vs estimated)
  estimated_fees          REAL NOT NULL DEFAULT 0.0, -- from auction_sales.platform_fees_amt
  fee_delta               REAL NOT NULL DEFAULT 0.0, -- total_ebay_fees - estimated_fees
  reconciled_net_profit   REAL NOT NULL DEFAULT 0.0, -- gross - true_cost - total_ebay_fees - shipping_label

  -- Promoted Listings metadata
  promoted_listing_rate   REAL,                      -- ad rate % at time of sale (e.g., 3.5)
  promoted_listing_active INTEGER DEFAULT 0,         -- 1 if item was promoted when sold

  -- Audit
  finances_api_raw        TEXT,                      -- raw JSON from Finances API (audit log)
  reconciled_at           TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (sale_id) REFERENCES auction_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_recon_sale ON ebay_fee_reconciliations(sale_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_recon_order ON ebay_fee_reconciliations(ebay_order_id);
CREATE INDEX IF NOT EXISTS idx_fee_recon_user ON ebay_fee_reconciliations(user_id);
```

### 4.3 Gateway Handler: `landing/src/gateway/ebayFinances.js`

**Exported handler:**

```
GET /api/ebay/finances?order_id=<ebayOrderId>
```

- Requires user-level OAuth token (calls `getEbayUserToken(env, userId)`).
- Calls `GET https://api.ebay.com/sell/finances/v1/transaction?orderId=<order_id>`.
- Parses `transactions` array and aggregates fee amounts by `transactionType`.
- Returns normalized `{ final_value_fee, promoted_listing_fee, shipping_label_cost, ... }`.

### 4.4 Outpost Backend Handler: `functions/api/ebay/reconcile.js`

**Route:** `POST /outpost/api/ebay/reconcile`

**Payload:** `{ sale_id: "...", ebay_order_id: "..." }`

**Flow:**
```
1. JWT guard: requireAuth
2. SELECT auction_sales WHERE id=sale_id AND user_id=userId
3. Fetch user OAuth token from D1 via ebay_oauth_tokens
4. Call GET https://techtrekgt.com/api/ebay/finances?order_id=ebay_order_id (gateway proxy)
5. Parse returned fee breakdown
6. INSERT INTO ebay_fee_reconciliations (all fee columns + reconciled_net_profit)
7. UPDATE auction_sales SET fee_reconciled_at=now() WHERE id=sale_id
8. Return { reconciled: true, fee_delta, reconciled_net_profit }
```

### 4.5 Modified `auction_sales` Schema (Additive Migrations)

```sql
-- Append to auction-schema.sql migration block
ALTER TABLE auction_sales ADD COLUMN ebay_order_id TEXT;
ALTER TABLE auction_sales ADD COLUMN fee_reconciled_at TEXT;  -- NULL = not yet reconciled
```

---

## 5. Cross-Listing Defense & Metadata

### 5.1 The Double-Selling Problem

When an item sells on eBay, the identical item may still be listed on other platforms (COMC, MySlabs, Facebook Marketplace, PWCC, etc.). If the eBay webhook fires and the other listings are not immediately de-listed, the item can sell twice.

**Defense strategy:** A `delist_pending` status acts as an intermediate state between `Listed` and `Sold`. The webhook handler sets it immediately on `ITEM_SOLD`, surfacing a high-priority alert in the Outpost UI.

### 5.2 Modified `auction_items` Schema (Additive)

```sql
-- Append to auction-schema.sql migration block
ALTER TABLE auction_items ADD COLUMN ebay_listing_id TEXT;
-- Unique index: one active eBay listing ID per item (nullable for non-eBay items)
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_ebay_listing
  ON auction_items(ebay_listing_id) WHERE ebay_listing_id IS NOT NULL;

ALTER TABLE auction_items ADD COLUMN cert_verification_url TEXT;
-- Stores the authenticator's public verification URL (e.g., JSA cert lookup URL, Beckett BAS URL)

ALTER TABLE auction_items ADD COLUMN other_platform_listing_ids TEXT;
-- JSON array of { platform: "COMC", listing_id: "...", listed_at: "...", url: "..." }
-- Used by cross-listing defense to know which platforms need manual de-listing.

ALTER TABLE auction_items ADD COLUMN ebay_promoted_rate REAL;
-- Promoted Listings ad rate % (e.g., 3.5 = 3.5%).
-- Used for estimated fee pre-calculation before Finances API reconciliation.
```

**Status flow with `delist_pending`:**

```
Available --[Listed on eBay]--> Listed
                                   |
                        [ITEM_SOLD webhook fires]
                                   |
                                   v
                           delist_pending  <-- HIGH ALERT in UI
                                   |
                   [User manually de-lists other platforms]
                   [OR ORDER_PAYMENT_STATUS=PAID webhook fires]
                                   |
                                   v
                                 Sold --> Finances API reconcile trigger
```

**Full valid `status` enum (existing + new):**

| Status | Meaning |
|--------|---------|
| `Available` | In inventory, not listed anywhere |
| `Listed` | Active on at least one platform |
| `delist_pending` | **NEW** - Sold on eBay; other platform listings may still be active |
| `Sold` | Fully sold and all listings removed |
| `Held` | Reserved / pending authentication or grading |
| `Returned` | Buyer returned; back in inventory |

### 5.3 Gateway Handler: `landing/src/gateway/ebayListings.js`

```
GET /api/ebay/listings            -> List all active seller listings (Sell Inventory API)
GET /api/ebay/listings/:id        -> Fetch single listing detail by eBay listing ID
```

Both require user-level OAuth token.

---

## 6. Cert Number to Listing ID Mapping

### 6.1 Problem Statement

Currently, `auction_items.cert_number` stores authenticator cert numbers (e.g., `JSA #BB12345`, `Beckett BAS #9876543`), but there is no structured link to the active eBay `listing_id`. This makes it impossible to:
- Quickly verify a cert when a listing is queried
- Auto-generate condition reports for the specific active listing
- Match an incoming webhook event to the correct internal item

### 6.2 Mapping Mechanism

The `ebay_listing_id` column on `auction_items` is the primary linkage. Created in two ways:

**Manual mapping (UI):**
- `EbayListingIdModal.jsx`: A lightweight modal with a single text input that the user opens from the `InventoryHubView` item row. Saves `ebay_listing_id` to `auction_items` via `PATCH /outpost/api/items/:id`.

**Semi-automatic mapping (via Listings Gateway):**
- User clicks "Find Active Listings" in `EbayConnectBanner.jsx`.
- Outpost calls `GET /outpost/api/ebay/find-listings`.
- Backend calls gateway `GET /api/ebay/listings` (user token), retrieves all active listings.
- Backend attempts fuzzy title match against `auction_items` rows with `status='Listed'` AND `ebay_listing_id IS NULL`.
- Returns `[ { item_id, item_name, ebay_listing_id, ebay_title, match_confidence } ]` for user confirmation.
- User confirms matches in `ListingMatchReviewModal` before mapping is saved.

**`cert_verification_url` population:**
When `authenticator` + `cert_number` are present on an item, the outpost backend derives the verification URL using existing `certLookup.js` logic and stores it permanently in `cert_verification_url`.

---

## 7. Complete File Change Map

### 7.1 Infrastructure Changes (Execute FIRST)

| Action | Detail |
|--------|--------|
| `landing/wrangler.jsonc` MODIFY | Add D1 binding: `personal-budget-db` to landing worker |
| New secrets: `EBAY_NOTIFICATION_SECRET`, `EBAY_REDIRECT_URI` | `wrangler secret put` from `landing/` |

> **CAUTION:** Adding the D1 binding to the landing worker means the landing gateway can now write to the shared database. The webhook handler MUST validate HMAC-SHA256 before executing any D1 write to prevent unauthorized mutations.

### 7.2 `landing/` New and Modified Files

| File | Action | Summary |
|------|--------|---------|
| `landing/wrangler.jsonc` | MODIFY | Add `d1_databases` binding for `personal-budget-db` |
| `landing/src/gateway/tokenCrypto.js` | NEW | AES-GCM encrypt/decrypt for OAuth tokens using `JWT_SECRET` |
| `landing/src/gateway/ebayOAuth.js` | NEW | ACG start, callback, status, disconnect handlers |
| `landing/src/gateway/ebayWebhook.js` | NEW | HMAC validation, challenge handshake, event dispatch |
| `landing/src/gateway/ebayFinances.js` | NEW | Finances API proxy (user token required) |
| `landing/src/gateway/ebayListings.js` | NEW | Active listing ID lookup (Sell Inventory API, user token) |
| `landing/src/gateway/ebayOrders.js` | NEW | Order Management API proxy (fulfillment data) |
| `landing/src/worker.js` | MODIFY | Add routes for `/api/ebay/oauth/*`, `/api/ebay/webhook`, `/api/ebay/finances`, `/api/ebay/listings*`, `/api/ebay/orders` |

### 7.3 `outpost/` Backend New and Modified Files

| File | Action | Summary |
|------|--------|---------|
| `outpost/auction-schema.sql` | MODIFY | Append 3 new tables + 4 ALTER TABLE migrations (Sections 2.4, 3.3, 4.2, 5.2, 4.5) |
| `outpost/functions/api/ebay/reconcile.js` | NEW | `POST /api/ebay/reconcile` - trigger Finances API pull per sale |
| `outpost/functions/api/ebay/find-listings.js` | NEW | `GET /api/ebay/find-listings` - active listing ID discovery + fuzzy match |
| `outpost/functions/api/ebay/oauth-status.js` | NEW | `GET /api/ebay/oauth-status` - proxy status check to gateway |
| `outpost/functions/api/items/index.js` | MODIFY | Accept `ebay_listing_id`, `cert_verification_url`, `other_platform_listing_ids`, `ebay_promoted_rate` in PATCH handler |
| `outpost/functions/api/sales/index.js` | MODIFY | Accept `ebay_order_id` in POST; JOIN `ebay_fee_reconciliations` on GET for reconciled profit |
| `outpost/src/worker.js` | MODIFY | Add routes for `/api/ebay/reconcile`, `/api/ebay/find-listings`, `/api/ebay/oauth-status` |

### 7.4 `outpost/` Frontend New and Modified Files

| File | Action | Summary |
|------|--------|---------|
| `outpost/src/utils/auctionApi.js` | MODIFY | Add `getEbayOAuthStatus()`, `reconcileSaleFees(saleId, orderId)`, `findEbayListings()`, `saveEbayListingId(itemId, listingId)` |
| `outpost/src/components/EbayConnectBanner.jsx` | NEW | OAuth connect/disconnect UI, connection status badge, "Find Active Listings" trigger |
| `outpost/src/components/EbayListingIdModal.jsx` | NEW | Modal for manual `ebay_listing_id` entry per item; shows cert verification URL if present |
| `outpost/src/components/FeeReconciliationPanel.jsx` | NEW | Per-sale panel showing actual eBay fees vs estimated; "Reconcile Now" button |
| `outpost/src/components/ListingMatchReviewModal.jsx` | NEW | Review/confirm fuzzy-matched listings before saving `ebay_listing_id` |
| `outpost/src/components/DelistPendingAlert.jsx` | NEW | High-priority dismissible alert card for `status='delist_pending'` items |
| `outpost/src/components/InventoryHubView.jsx` | MODIFY | Show `delist_pending` badge; add "Set eBay Listing ID" button per item row; render `<DelistPendingAlert>` at top |
| `outpost/src/components/SalesLogView.jsx` | MODIFY | Add "Reconcile Fees" button; show `reconciled_net_profit` from `ebay_fee_reconciliations` if present |
| `outpost/src/components/SettingsView.jsx` | MODIFY | Render `<EbayConnectBanner>` in new "eBay Integration" sub-panel |

---

## 8. D1 Migration Sequence

All migrations are additive-only (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`). They are idempotent if run multiple times.

```sql
-- ============================================================
-- PHASE 3 MIGRATIONS - Append to outpost/auction-schema.sql
-- Run AFTER all Phase 2 migrations have been applied.
-- ============================================================

-- Migration P3-1: eBay User OAuth Tokens
CREATE TABLE IF NOT EXISTS ebay_oauth_tokens (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL UNIQUE,
  access_token       TEXT NOT NULL,
  refresh_token      TEXT NOT NULL,
  access_token_exp   TEXT NOT NULL,
  refresh_token_exp  TEXT NOT NULL,
  scopes             TEXT NOT NULL,
  ebay_user_id       TEXT,
  connected_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_refreshed_at  TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ebay_oauth_user ON ebay_oauth_tokens(user_id);

-- Migration P3-2: eBay Webhook Event Log
CREATE TABLE IF NOT EXISTS ebay_webhook_events (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  ebay_item_id    TEXT,
  ebay_order_id   TEXT,
  raw_payload     TEXT NOT NULL,
  processed       INTEGER NOT NULL DEFAULT 0,
  processed_at    TEXT,
  error_message   TEXT,
  received_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON ebay_webhook_events(processed, received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_item ON ebay_webhook_events(ebay_item_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON ebay_webhook_events(ebay_order_id);

-- Migration P3-3: eBay Fee Reconciliations
CREATE TABLE IF NOT EXISTS ebay_fee_reconciliations (
  id                      TEXT PRIMARY KEY,
  sale_id                 TEXT NOT NULL,
  user_id                 TEXT NOT NULL,
  ebay_order_id           TEXT NOT NULL,
  ebay_transaction_id     TEXT,
  final_value_fee         REAL NOT NULL DEFAULT 0.0,
  promoted_listing_fee    REAL NOT NULL DEFAULT 0.0,
  shipping_label_cost     REAL NOT NULL DEFAULT 0.0,
  payment_processing_fee  REAL NOT NULL DEFAULT 0.0,
  regulatory_fee          REAL NOT NULL DEFAULT 0.0,
  total_ebay_fees         REAL NOT NULL DEFAULT 0.0,
  estimated_fees          REAL NOT NULL DEFAULT 0.0,
  fee_delta               REAL NOT NULL DEFAULT 0.0,
  reconciled_net_profit   REAL NOT NULL DEFAULT 0.0,
  promoted_listing_rate   REAL,
  promoted_listing_active INTEGER DEFAULT 0,
  finances_api_raw        TEXT,
  reconciled_at           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sale_id) REFERENCES auction_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_recon_sale ON ebay_fee_reconciliations(sale_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_recon_order ON ebay_fee_reconciliations(ebay_order_id);
CREATE INDEX IF NOT EXISTS idx_fee_recon_user ON ebay_fee_reconciliations(user_id);

-- Migration P3-4: auction_items column additions
ALTER TABLE auction_items ADD COLUMN ebay_listing_id TEXT;
ALTER TABLE auction_items ADD COLUMN cert_verification_url TEXT;
ALTER TABLE auction_items ADD COLUMN other_platform_listing_ids TEXT;
ALTER TABLE auction_items ADD COLUMN ebay_promoted_rate REAL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_ebay_listing
  ON auction_items(ebay_listing_id) WHERE ebay_listing_id IS NOT NULL;

-- Migration P3-5: auction_sales column additions
ALTER TABLE auction_sales ADD COLUMN ebay_order_id TEXT;
ALTER TABLE auction_sales ADD COLUMN fee_reconciled_at TEXT;
```

---

## 9. Secrets & Infrastructure Checklist

| Item | Location | Action Required |
|------|----------|----------------|
| `EBAY_NOTIFICATION_SECRET` | `landing` worker | `wrangler secret put EBAY_NOTIFICATION_SECRET` |
| `EBAY_REDIRECT_URI` | `landing` worker | `wrangler secret put EBAY_REDIRECT_URI` |
| D1 binding on landing worker | `landing/wrangler.jsonc` | Add `d1_databases` block (same DB ID as outpost) |
| eBay Developer Portal: Finances API access | eBay Dashboard | Apply for `sell.finances` scope approval |
| eBay Developer Portal: Notification endpoint | eBay Dashboard | Register `https://techtrekgt.com/api/ebay/webhook` |
| eBay Developer Portal: OAuth redirect URI | eBay Dashboard | Add `https://techtrekgt.com/api/ebay/oauth/callback` to allowed redirect URIs |

---

## 10. Implementation Sequence

Execute strictly in this order to maintain a deployable state at every step:

```
Step 0: Pre-Conditions (Manual - Developer Portal)
  - Apply for eBay Finances API scope (async - may take days; non-blocking)
  - Register webhook endpoint in eBay Developer Portal (challenge handshake first)
  - Add redirect URI to eBay OAuth allowed list in Developer Portal

Step 1: Infrastructure (landing/)
  - Add d1_databases binding to landing/wrangler.jsonc
  - wrangler secret put EBAY_NOTIFICATION_SECRET
  - wrangler secret put EBAY_REDIRECT_URI
  - Deploy: cd landing && wrangler deploy
  - Verify: curl https://techtrekgt.com/api/health -> { status: "ok" }

Step 2: D1 Schema Migrations (outpost/)
  - Append P3-1 through P3-5 migrations to outpost/auction-schema.sql
  - Local: npm run db:migrate:local
  - Production: npm run db:migrate
  - Verify: SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ebay%'

Step 3: Token Crypto Module (landing/)
  - NEW landing/src/gateway/tokenCrypto.js (AES-GCM encrypt/decrypt)
  - Deploy: wrangler deploy

Step 4: eBay OAuth ACG Flow (landing/ + outpost/)
  - NEW landing/src/gateway/ebayOAuth.js
  - MODIFY landing/src/worker.js (add /api/ebay/oauth/* routes)
  - NEW outpost/functions/api/ebay/oauth-status.js
  - MODIFY outpost/src/worker.js
  - NEW outpost/src/components/EbayConnectBanner.jsx
  - MODIFY outpost/src/components/SettingsView.jsx
  - MODIFY outpost/src/utils/auctionApi.js
  - Deploy: wrangler deploy (landing) then npm run deploy (outpost)
  - Verify: Navigate to /outpost/settings, complete OAuth flow, confirm "Connected" status badge

Step 5: Webhook Listener (landing/)
  - NEW landing/src/gateway/ebayWebhook.js
  - MODIFY landing/src/worker.js (add /api/ebay/webhook GET + POST routes)
  - Deploy: wrangler deploy
  - Verify: Trigger eBay Developer Portal challenge handshake -> confirm 200 response
  - Verify: Send test ITEM_SOLD payload -> confirm row in ebay_webhook_events

Step 6: Cross-Listing Defense (outpost/)
  - MODIFY outpost/functions/api/items/index.js (new columns in PATCH)
  - NEW outpost/src/components/EbayListingIdModal.jsx
  - NEW outpost/src/components/DelistPendingAlert.jsx
  - MODIFY outpost/src/components/InventoryHubView.jsx
  - MODIFY outpost/src/utils/auctionApi.js (saveEbayListingId)
  - Deploy: npm run deploy
  - Verify: Set ebay_listing_id on test item; fire test ITEM_SOLD webhook; confirm status='delist_pending' in D1 and alert visible in UI

Step 7: Active Listing Discovery (landing/ + outpost/)
  - NEW landing/src/gateway/ebayListings.js
  - MODIFY landing/src/worker.js (add /api/ebay/listings* routes)
  - NEW outpost/functions/api/ebay/find-listings.js
  - MODIFY outpost/src/worker.js
  - NEW outpost/src/components/ListingMatchReviewModal.jsx
  - MODIFY outpost/src/components/EbayConnectBanner.jsx ("Find Active Listings")
  - MODIFY outpost/src/utils/auctionApi.js (findEbayListings)
  - Deploy: wrangler deploy (landing), npm run deploy (outpost)

Step 8: Finances API Fee Reconciliation (landing/ + outpost/)
  - NEW landing/src/gateway/ebayFinances.js
  - MODIFY landing/src/worker.js (add /api/ebay/finances route)
  - NEW outpost/functions/api/ebay/reconcile.js
  - MODIFY outpost/functions/api/sales/index.js
  - MODIFY outpost/src/worker.js
  - NEW outpost/src/components/FeeReconciliationPanel.jsx
  - MODIFY outpost/src/components/SalesLogView.jsx
  - MODIFY outpost/src/utils/auctionApi.js (reconcileSaleFees)
  - Deploy: wrangler deploy (landing), npm run deploy (outpost)
  - Verify: Log test sale with ebay_order_id, click "Reconcile Now", confirm fee row created

Step 9: End-to-End Smoke Test
  - Full OAuth connect/disconnect cycle
  - ITEM_SOLD webhook -> delist_pending status -> UI alert visible
  - Listing ID auto-discovery and confirmation modal
  - Finances API reconcile on a real sale (requires Finances API approval)
  - cert_verification_url shown in EbayListingIdModal
```

---

## 11. Risk Assessment

| Risk | Severity | Mitigation |
|------|---------|------------|
| `sell.finances` eBay scope approval delayed | High | Steps 1-7 are fully unblocked; reconciliation UI is built with graceful disabled state when scope not approved |
| Landing gateway now writes to D1 - potential auth bypass | High | Webhook handler validates HMAC-SHA256 before any D1 write; OAuth callback validates PKCE state from KV; no D1 write occurs without verified identity |
| D1 write lock contention from webhook event inserts | Medium | Single-row writes; background dispatch is async via `waitUntil`; contention risk minimal |
| OAuth refresh token expiry (18 months) | Medium | `refresh_token_exp` surfaced in UI; warning banner when < 30 days remain; user must re-connect |
| eBay sends duplicate webhook events | Low | Idempotency guard: check `processed=1` by `ebay_item_id + event_type` before dispatching |
| Token encryption key rotation (JWT_SECRET change) | Medium | Document: before rotating `JWT_SECRET`, all users must disconnect and reconnect eBay account |
| Fuzzy listing match wrong result | Medium | Match confidence threshold set at 80%+; mismatches below threshold flagged "Needs Manual Confirmation" - never auto-saved |
| eBay webhook payload schema changes | Low | Raw payload stored in `ebay_webhook_events.raw_payload`; dispatch logic uses fallback field paths |

---

## 12. Open Questions

> **Q1 - Token Encryption Strategy:** The plan uses AES-GCM with a key derived from `JWT_SECRET` + PBKDF2. This means the same secret secures both session JWTs and OAuth token encryption. Would you prefer a separate `EBAY_TOKEN_ENCRYPTION_KEY` Wrangler secret so the two concerns are isolated?

> **Q2 - Webhook in outpost vs landing:** Currently the plan routes the webhook to the landing gateway (which will now have D1 access). An alternative is to route it to the outpost worker directly (it already has D1). Landing keeps the API gateway pattern clean; outpost avoids adding D1 to a stateless gateway. Which do you prefer?

> **Q3 - Promoted Listings Rate Source:** The `ebay_promoted_rate` stored on `auction_items` - should this be manually entered by the user, or auto-fetched from the Sell Inventory API when a `listing_id` is mapped? Automatic is more accurate but requires the `sell.inventory.readonly` scope.

> **Q4 - `other_platform_listing_ids` as JSON vs separate table:** The plan stores cross-platform listing IDs as a JSON TEXT column for simplicity. An alternative is a dedicated `auction_item_platform_listings` table for queryability. Which do you prefer?

> **Q5 - Finances API Reconciliation Trigger:** Should reconciliation be: (a) manually triggered per sale, (b) automatically triggered on `ORDER_PAYMENT_STATUS=PAID` webhook, or (c) both? Option (c) is most robust.

> **Q6 - `delist_pending` Resolution:** After de-listing from other platforms, how should the user mark an item fully Sold? (a) Auto when `ORDER_PAYMENT_STATUS=PAID` webhook arrives, (b) manually via a button in `DelistPendingAlert`, or (c) both?

---

## 13. Verification Plan

### CLI Verification
```powershell
# Webhook challenge handshake (unauthenticated GET)
curl "https://techtrekgt.com/api/ebay/webhook?challenge_code=test123"
# Expected: { "challengeResponse": "<sha256_hash>" }

# OAuth status (requires valid SSO cookie)
curl -b "session=<jwt_cookie>" https://techtrekgt.com/api/ebay/oauth/status
# Expected: { "connected": false } before ACG, or { "connected": true, "ebay_user_id": "..." }

# Reconcile endpoint (requires SSO cookie + eBay OAuth connected)
curl -X POST -b "session=<jwt_cookie>" \
  -H "Content-Type: application/json" \
  -d '{"sale_id":"<id>","ebay_order_id":"<order_id>"}' \
  https://techtrekgt.com/outpost/api/ebay/reconcile
# Expected: { "reconciled": true, "fee_delta": <number>, "reconciled_net_profit": <number> }
```

### D1 Verification
```powershell
# Confirm new tables
wrangler d1 execute personal-budget-db --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ebay%'"
# Expected: ebay_oauth_tokens, ebay_webhook_events, ebay_fee_reconciliations

# Confirm auction_items new columns
wrangler d1 execute personal-budget-db --command="PRAGMA table_info(auction_items)"
# Expected: ebay_listing_id, cert_verification_url, other_platform_listing_ids, ebay_promoted_rate

# Confirm auction_sales new columns
wrangler d1 execute personal-budget-db --command="PRAGMA table_info(auction_sales)"
# Expected: ebay_order_id, fee_reconciled_at
```

### Manual Smoke Tests
1. **OAuth Connect:** `/outpost/settings` -> eBay Integration panel -> complete OAuth consent -> status shows "Connected as [username]"
2. **Webhook Challenge:** Trigger from eBay Developer Portal; confirm valid `challengeResponse` JSON
3. **ITEM_SOLD Webhook:** Send test payload; confirm `status='delist_pending'` in D1 and `DelistPendingAlert` visible in UI
4. **Listing Discovery:** Click "Find Active Listings"; confirm `ListingMatchReviewModal` opens with matched items
5. **Fee Reconciliation:** Log sale with `ebay_order_id`; click "Reconcile Now"; confirm `ebay_fee_reconciliations` row created; confirm `reconciled_net_profit` displayed in UI

---

*Generated: 2026-08-29 | TechTrekGT - Outpost eBay Phase 3 Sync Engine Plan*
*Status: DRAFT - Awaiting "Plan approved" before any source code is modified*
