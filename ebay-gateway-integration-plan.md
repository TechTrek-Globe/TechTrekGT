# eBay API Gateway Integration Plan - Outpost

**Repository:** TechTrekGT
**Status:** DRAFT - Awaiting "Plan approved, proceed with implementation"
**Scope:** Enhance the existing landing-gateway/eBay integration with KV token caching, `live_avg` D1 persistence, expanded eBay API endpoints, and three high-value new features for the Outpost memorabilia tracker.

---

## 1. Current State Audit (As-Built)

### 1.1 Gateway - Phase 1 (COMPLETE)

The Central API Gateway described in `central-api-gateway-plan.md` is **fully implemented and deployed**. The following files are live:

| File | Status | Purpose |
|------|--------|---------|
| `landing/src/worker.js` | Live | Routes `/api/ebay/comps`, `/api/amazon/fetch`, `/api/health` |
| `landing/src/gateway/ebay.js` | Live | OAuth CCF flow + Marketplace Insights + Browse API fallback |
| `landing/src/gateway/guard.js` | Live | Stateless JWT auth, `withGatewayAuth`, `ok`, `err` helpers |
| `landing/src/gateway/auth.js` | Live | WebCrypto JWT verify + cookie extraction (verbatim from outpost) |
| `landing/src/gateway/amazon.js` | Live | Amazon scraper proxy cascade |

**Gateway endpoint routing (live):**

```
GET  /api/ebay/comps?query=...   -> ebayCompsGet (OAuth + Insights + Browse)
POST /api/ebay/comps             -> ebayCompsPost (OAuth + Insights + Browse)
POST /api/amazon/fetch           -> amazonFetchPost
GET  /api/health                 -> inline health check (unauthenticated)
```

### 1.2 eBay OAuth Flow (COMPLETE)

`landing/src/gateway/ebay.js` implements the full eBay OAuth 2.0 Client Credentials Grant:

1. `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` are base64-encoded into a `Basic` `Authorization` header.
2. `POST https://api.ebay.com/identity/v1/oauth2/token` returns an `access_token` (~2hr TTL).
3. Token is used as `Bearer` on calls to Marketplace Insights and Browse APIs.
4. **Current Phase 1 limitation:** A fresh token is fetched on every request (no KV caching). This adds ~200-400ms round-trip latency and burns eBay OAuth rate-limit quota.

### 1.3 Outpost Client Integration (COMPLETE)

`outpost/src/utils/auctionApi.js` exports:

- `fetchLiveComps(query, itemId)` -> POST `https://techtrekgt.com/api/ebay/comps`
- `fetchAmazonProduct(input)` -> POST `https://techtrekgt.com/api/amazon/fetch`

`PricingDrawer.jsx` already calls `fetchLiveComps()` via the gateway (via `QueryEditModal` confirmation flow). On success, it populates `comp_1/2/3` and `recommended_list_price` in draft state. The user then manually clicks Save/Apply to persist via `saveComp()` -> `POST /outpost/api/comps`.

### 1.4 D1 Persistence Path (PARTIAL - Known Gap)

**The `live_avg` field is NOT being persisted to `auction_comps` on auto-fetch.**

Currently when `fetchLiveComps()` returns data:
- `comp_1`, `comp_2`, `comp_3` are hydrated into `PricingDrawer` draft state.
- `recommended_list_price` is hydrated from `res.live_avg`.
- The user must **manually click Save** before `saveComp()` POSTs to the outpost D1.
- `saveComp()` via `POST /outpost/api/comps` writes `comp_1/2/3`, `manual_avg`, `recommended_list_price`, and `ebay_search_url` to `auction_comps` - but **`live_avg` (the raw API average) is not included in the comps upsert payload**.

The `auction_comps` schema has a `live_avg` column that is never being written. This is the most critical data integrity gap from Phase 1.

### 1.5 eBay Scope Limitation (Known Constraint)

The current gateway uses the base `https://api.ebay.com/oauth/api_scope` scope. The **Marketplace Insights API** (`item_sales/search`) requires the application to be approved for the **Sell Marketing** or **Marketplace Insights** permission level in the eBay Developer Program. The Browse API (`item_summary/search`) works with the basic scope but returns active (not sold) listings.

> **If eBay Marketplace Insights is returning empty results,** the application may need to apply for elevated scope access in the eBay Developer Portal under "Sell APIs" -> "Marketplace Insights." The gateway already includes the Browse API fallback for active listings.

---

## 2. Phase 2 Enhancement Targets

Phase 2 covers the three gaps identified in the Phase 1 audit, plus the KV caching improvement and three new eBay API-powered features.

### 2.1 Enhancement 1 - KV Token Cache for eBay OAuth

**Problem:** Every call to `/api/ebay/comps` incurs a full OAuth round-trip (~200-400ms extra latency, quota burn).

**Solution:** Cache the `access_token` in a Cloudflare KV namespace bound to the landing worker. On each request, check KV first; only call the eBay token endpoint if the cached token is absent or within 5 minutes of expiry.

**Scope:** `landing/` only.

**Files to change:**

#### [MODIFY] `landing/src/gateway/ebay.js`
- Replace the current `getEbayAccessToken(env)` function with a `getCachedEbayToken(env)` variant.
- Cache key: `ebay_access_token` in `env.GATEWAY_KV`.
- On cache hit: return cached token directly.
- On cache miss or near-expiry: call eBay token endpoint, store `{ token, expires_at }` JSON in KV with a TTL of 6600 seconds (10 min less than the typical 7200s eBay token lifetime).

```js
// Pseudocode - getCachedEbayToken
async function getCachedEbayToken(env) {
  const CACHE_KEY = 'ebay_access_token';
  const TTL_SECONDS = 6600; // 10 min buffer from eBay's 7200s lifetime

  if (env.GATEWAY_KV) {
    const cached = await env.GATEWAY_KV.get(CACHE_KEY, { type: 'json' });
    if (cached && cached.token && cached.expires_at > Date.now()) {
      return cached.token;
    }
  }

  const token = await fetchFreshEbayToken(env); // renamed internal function

  if (env.GATEWAY_KV) {
    await env.GATEWAY_KV.put(CACHE_KEY, JSON.stringify({
      token,
      expires_at: Date.now() + (TTL_SECONDS * 1000)
    }), { expirationTtl: TTL_SECONDS });
  }

  return token;
}
```

#### [MODIFY] `landing/wrangler.jsonc`
- Add `kv_namespaces` binding: `{ binding: "GATEWAY_KV", id: "<KV_NAMESPACE_ID>" }`.
- KV namespace must be created via: `wrangler kv namespace create "GATEWAY_KV"`.

**Impact:** Eliminates per-request eBay OAuth round-trip. Effectively makes the gateway stateless between requests after the first warm-up call per ~2hr window.

---

### 2.2 Enhancement 2 - `live_avg` Full Comp Persistence

**Problem:** The `live_avg` returned by the eBay API (true market average from sold comps) is never written to the `auction_comps.live_avg` D1 column.

**Solution:** Three-part fix.

**Part A - Gateway response:** No change needed. `ebay.js` already returns `live_avg` in the JSON response body.

**Part B - `PricingDrawer.jsx`:** When `handleConfirmSearch()` receives a successful response from `fetchLiveComps()`, extract `res.live_avg` and store it in draft state. Pass `live_avg: draft.live_avg` to the `saveComp()` call body.

**Part C - `functions/api/comps/index.js`:** Destructure `live_avg` from POST body. Include `live_avg` column in both `UPDATE` and `INSERT` SQL paths.

**Schema impact:** None. `auction_comps.live_avg` column already exists in `auction-schema.sql`.

---

### 2.3 Enhancement 3 - Expanded eBay API Route Namespace

To support the three new features, two additional gateway routes are needed on the landing worker.

**New routes to add to `landing/src/worker.js`:**

| Route | Method | Handler | Purpose |
|-------|--------|---------|---------|
| `GET /api/ebay/catalog` | GET | `ebayCatalog.js` | eBay Catalog API product lookup for auto-fill |
| `GET /api/ebay/item/*` | GET | `ebayItem.js` | Fetch full eBay listing detail by eBay item ID |

**Note on routing:** The landing worker uses exact `pathname ===` matching. For parameterized routes, the check becomes `pathname.startsWith('/api/ebay/item/')` and `pathname.startsWith('/api/ebay/catalog')`.

---

## 3. New Feature Proposals

### Feature A - "Smart Catalog Auto-Fill" via eBay Catalog API

**Concept:** When adding a new item to the Outpost inventory, the user types a partial item name (e.g., "Michael Jordan 1986 Fleer"). A debounced call to the eBay Catalog API fetches structured catalog metadata and pre-fills multiple form fields automatically.

**Fields auto-populated on selection:**
- Canonical item title
- Category and sport/genre
- Athlete/subject name
- Manufacturer/brand and card year (if applicable)
- eBay Catalog EPID (stored in notes for future price alert cross-referencing)

**Why it matters:** Item names are currently typed manually and inconsistently. Inconsistent names degrade eBay search query quality in `cleanEbaySearchQuery()`, resulting in poor comp matches. This feature creates a canonical data foundation that improves every downstream operation: comp fetching, listing copy generation, and cert matching.

**User flow:**

```
User types "Michael Jordan 1986" in "Item Name" field
   |
   | 400ms debounce
   v
GET https://techtrekgt.com/api/ebay/catalog?q=Michael+Jordan+1986
   |
   v
Gateway calls: GET https://api.ebay.com/commerce/catalog/v1_beta/product_summary/search
   |           params: q, fieldGroups=FULL, limit=5
   v
Returns top 5 catalog matches with image, title, aspects (athlete, year, team, etc.)
   |
   v
Outpost renders a dropdown beneath the item name field with 5 suggestions
   |
   v
User selects "1986-87 Fleer Michael Jordan #57 Rookie Card"
   |
   v
Fields auto-populated: item_name, category="Trading Card", sport_genre="Basketball",
athlete_person="Michael Jordan", notes tagged with eBay EPID
```

**New gateway handler: `landing/src/gateway/ebayCatalog.js`**

```js
// GET /api/ebay/catalog?q=<query>&limit=5
const EBAY_CATALOG_URL = 'https://api.ebay.com/commerce/catalog/v1_beta/product_summary/search';

export async function onRequestGet(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    await requireGatewayAuth(request, env);
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q || q.length < 3) return err('q must be at least 3 characters', 400);

    const token = await getCachedEbayToken(env);
    const params = new URLSearchParams({ q, limit: '5', fieldGroups: 'FULL' });

    const res = await fetch(`${EBAY_CATALOG_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    const data = res.ok ? await res.json() : {};
    const products = (data.productSummaries || []).map(p => ({
      epid: p.epid,
      title: p.title,
      image: p.image?.imageUrl || null,
      aspects: p.aspects || {}
    }));

    return ok({ products });
  });
}
```

**New outpost component: `CatalogSearchDropdown.jsx`**

- Inline suggestion list rendered beneath the "Item Name" input in `AddInvoiceModal.jsx` and `EditItemModal.jsx`.
- 400ms debounce on `onChange` before calling `fetchEbayCatalog(query)` via `auctionApi.js`.
- Shows 3-5 results with thumbnail, canonical title, and year/athlete aspects.
- On selection: fires `onSelect(product)` callback that the parent modal uses to populate form fields.
- Clears automatically when the item name is manually edited after selection.

**New `auctionApi.js` export:**

```js
export const fetchEbayCatalog = (q) =>
  fetch(`${getGatewayBase()}/api/ebay/catalog?q=${encodeURIComponent(q)}`, {
    credentials: 'include'
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
```

**Data persistence:** The eBay `epid` is stored in `auction_items.notes` as a tagged fragment: `eBay EPID: 123456789`.

---

### Feature B - "Market Value Alert: Price Drop / Spike Detector"

**Concept:** On user demand (or future cron trigger), re-run eBay comp fetches for all active/listed items and compare the new `live_avg` against the stored baseline in `auction_comps.live_avg`. Surface actionable alerts when the market has moved significantly.

**Alert trigger conditions:**

| Alert Type | Condition |
|-----------|-----------|
| `price_spike` | new `live_avg` >= 15% above stored `live_avg` |
| `price_drop` | new `live_avg` <= -15% below stored `live_avg` |
| `floor_breach` | new `live_avg` falls below item's `min_sell_price` |

**User flow:**

```
User opens Outpost Dashboard
   |
   v
MarketAlertsPanel renders existing active (undismissed) alerts from D1
   |
   v
"Refresh Market Intelligence" button triggers:
   POST /outpost/api/comps/refresh-all
   |
   v
Worker iterates items with status='Available'|'Listed' AND existing live_avg baseline.
For each item (max 3 concurrent, 300ms delay between batches):
   POST https://techtrekgt.com/api/ebay/comps { query }
   Compare new live_avg vs. stored live_avg
   If threshold triggered: INSERT into auction_market_alerts
   UPDATE auction_comps.live_avg to new value
   |
   v
MarketAlertsPanel refreshes and shows color-coded dismissible alert cards
```

**New D1 table: `auction_market_alerts`**

```sql
CREATE TABLE IF NOT EXISTS auction_market_alerts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  alert_type    TEXT NOT NULL CHECK (alert_type IN ('price_spike', 'price_drop', 'floor_breach')),
  previous_avg  REAL NOT NULL,
  current_avg   REAL NOT NULL,
  pct_change    REAL NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  dismissed_at  TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_market_alerts_user_active
  ON auction_market_alerts(user_id, dismissed_at);
```

**New outpost API endpoint: `functions/api/comps/refresh-all.js`**

- `POST /outpost/api/comps/refresh-all` - JWT-guarded
- Fetches items with status `Available` or `Listed` that have an existing `live_avg` baseline.
- Calls gateway `POST /api/ebay/comps` for each item in batches of 3 concurrent requests.
- Computes `pct_change`, writes alerts to `auction_market_alerts`, updates `auction_comps.live_avg`.
- Returns `{ refreshed: N, alerts_created: M }`.

**New outpost API endpoint: `functions/api/comps/alerts.js`**

- `GET /outpost/api/comps/alerts` - returns undismissed alerts for `userId`.
- `PUT /outpost/api/comps/alerts/:id` - sets `dismissed_at` to dismiss an alert.

**New outpost component: `MarketAlertsPanel.jsx`**

- Rendered in `DashboardView.jsx` below existing stats cards.
- Color-coded alert cards: green (price spike), red (price drop), orange (floor breach).
- Dismissible per-card and "Dismiss All" button.
- "Refresh Now" button with loading state and result summary toast.

---

### Feature C - "Authenticated Condition Report Auto-Generator"

**Concept:** For JSA/Beckett/PSA-certified items, provide a one-click "Generate Condition Report" button in `PricingDrawer.jsx` that assembles a pre-formatted, multi-platform condition statement from eBay item detail data combined with the local cert metadata.

**Why it matters:** For certified sports memorabilia, buyers expect standardized condition language referencing the authenticator, cert number, physical observations, and provenance. This eliminates the most time-consuming manual step in the listing workflow for authenticated pieces and produces copy that can be used on eBay, COMC, and MySlabs.

**User flow:**

```
User runs Auto-Fetch Sold Comps in PricingDrawer
Comp results include sold listings with ebay_item_id fields
   |
   v
"Generate Condition Report" button appears (only for certified items where
authenticator is not 'Other', 'Raw', or 'None')
   |
   v
User clicks button:
  GET https://techtrekgt.com/api/ebay/item/<ebay_item_id>
  -> eBay Browse API: GET /buy/browse/v1/item/<itemId>?fieldgroups=PRODUCT,COMPACT
  -> returns: condition, conditionDescription, localizedAspects, shortDescription
   |
   v
conditionReportGenerator.js assembles:
  - Cert header: "[Authenticator] Authenticated | Cert #[number] | [verification URL]"
  - Physical condition: from eBay conditionDescription or standard template
  - Item aspects: card grade, jersey size, year, team (extracted from localizedAspects)
  - Authenticator-specific boilerplate (JSA LOA language, PSA slab language, etc.)
   |
   v
"Condition Report" tab in ListingCopyModal renders the assembled report
One-click copy to clipboard
```

**New gateway handler: `landing/src/gateway/ebayItem.js`**

```js
// GET /api/ebay/item/:itemId
const EBAY_ITEM_URL = 'https://api.ebay.com/buy/browse/v1/item';

export async function onRequestGet(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    await requireGatewayAuth(request, env);
    const url = new URL(request.url);
    const itemId = url.pathname.replace('/api/ebay/item/', '').trim();
    if (!itemId) return err('itemId is required', 400);

    const token = await getCachedEbayToken(env);
    const res = await fetch(
      `${EBAY_ITEM_URL}/${encodeURIComponent(itemId)}?fieldgroups=PRODUCT,COMPACT`,
      { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return err(`eBay item fetch failed (${res.status}): ${text.slice(0, 200)}`, res.status);
    }

    const data = await res.json();
    return ok({
      itemId: data.itemId,
      title: data.title,
      condition: data.condition,
      conditionDescription: data.conditionDescription,
      localizedAspects: data.localizedAspects || [],
      shortDescription: data.shortDescription,
      images: (data.additionalImages || [data.image]).filter(Boolean).map(i => i.imageUrl)
    });
  });
}
```

**New utility: `outpost/src/utils/conditionReportGenerator.js`**

- Pure function `generateConditionReport(item, ebayData)`.
- Inputs: `item` (DB row), `ebayData` (from gateway).
- Outputs: `{ title, certLine, conditionLine, aspectLines[], boilerplate, fullReport }`.
- Uses `getCertVerificationUrl()` from existing `certLookup.js`.
- Authenticator-specific boilerplate templates for JSA, PSA, Beckett, ACOA, SGC, CGC, Fanatics.
- Falls back to a structural skeleton when no eBay data is available (template-only mode).

**UI integration: `ListingCopyModal.jsx` (minimal modification)**

- Add a "Condition Report" tab to the existing tab row (`eBay`, `Facebook`, `COMC`, etc.).
- Tab is only rendered when `isCertified === true` (authenticator is not `Other`/`Raw`/`None`).
- "Fetch from eBay" button calls `getEbayItemDetail(ebay_item_id)` from `auctionApi.js`.
- Falls back to template-only mode when no `ebay_item_id` is available from comp results.

---

## 4. Complete File Change Map

### 4.1 `landing/` Changes

| File | Action | Change Summary |
|------|--------|----------------|
| [`landing/src/gateway/ebay.js`](file:///E:/TechTrekGT/landing/src/gateway/ebay.js) | MODIFY | Replace `getEbayAccessToken` with `getCachedEbayToken`; add KV read/write logic |
| `landing/src/gateway/ebayCatalog.js` | NEW | eBay Catalog API handler for item auto-fill (Feature A) |
| `landing/src/gateway/ebayItem.js` | NEW | eBay Browse item detail handler (Feature C) |
| [`landing/src/worker.js`](file:///E:/TechTrekGT/landing/src/worker.js) | MODIFY | Add routes for `GET /api/ebay/catalog` and `GET /api/ebay/item/*`; import new handlers |
| [`landing/wrangler.jsonc`](file:///E:/TechTrekGT/landing/wrangler.jsonc) | MODIFY | Add `kv_namespaces` binding for `GATEWAY_KV` |

### 4.2 `outpost/` Backend Changes

| File | Action | Change Summary |
|------|--------|----------------|
| [`outpost/functions/api/comps/index.js`](file:///E:/TechTrekGT/outpost/functions/api/comps/index.js) | MODIFY | Accept and persist `live_avg` in POST/UPDATE SQL |
| `outpost/functions/api/comps/refresh-all.js` | NEW | Batch market refresh endpoint (Feature B) |
| `outpost/functions/api/comps/alerts.js` | NEW | GET/PUT market alerts endpoint (Feature B) |
| [`outpost/src/worker.js`](file:///E:/TechTrekGT/outpost/src/worker.js) | MODIFY | Add routes for `/api/comps/refresh-all` and `/api/comps/alerts` |
| [`outpost/auction-schema.sql`](file:///E:/TechTrekGT/outpost/auction-schema.sql) | MODIFY | Append `auction_market_alerts` table migration (Feature B) |

### 4.3 `outpost/` Frontend Changes

| File | Action | Change Summary |
|------|--------|----------------|
| [`outpost/src/utils/auctionApi.js`](file:///E:/TechTrekGT/outpost/src/utils/auctionApi.js) | MODIFY | Add `fetchEbayCatalog(q)`, `getEbayItemDetail(id)`, `refreshMarketAlerts()`, `getMarketAlerts()`, `dismissMarketAlert(id)` |
| `outpost/src/utils/conditionReportGenerator.js` | NEW | Pure utility: assembles condition report from item + eBay data (Feature C) |
| [`outpost/src/components/inventory/PricingDrawer.jsx`](file:///E:/TechTrekGT/outpost/src/components/inventory/PricingDrawer.jsx) | MODIFY | Capture `live_avg` in draft; pass to `saveComp()`; add "Generate Condition Report" button for certified items |
| `outpost/src/components/inventory/CatalogSearchDropdown.jsx` | NEW | Debounced eBay catalog suggestion dropdown (Feature A) |
| `outpost/src/components/MarketAlertsPanel.jsx` | NEW | Market alert cards panel for DashboardView (Feature B) |
| [`outpost/src/components/DashboardView.jsx`](file:///E:/TechTrekGT/outpost/src/components/DashboardView.jsx) | MODIFY | Render `<MarketAlertsPanel />` below existing stats cards |
| [`outpost/src/components/AddInvoiceModal.jsx`](file:///E:/TechTrekGT/outpost/src/components/AddInvoiceModal.jsx) | MODIFY | Wire `<CatalogSearchDropdown />` into item name field (Feature A) |
| [`outpost/src/components/EditItemModal.jsx`](file:///E:/TechTrekGT/outpost/src/components/EditItemModal.jsx) | MODIFY | Wire `<CatalogSearchDropdown />` into item name field (Feature A) |
| [`outpost/src/components/ListingCopyModal.jsx`](file:///E:/TechTrekGT/outpost/src/components/ListingCopyModal.jsx) | MODIFY | Add "Condition Report" tab for certified items; integrate `conditionReportGenerator` (Feature C) |

---

## 5. Secrets and Infrastructure Changes

### 5.1 New KV Namespace Required (Enhancement 1)

```powershell
# Run from E:\TechTrekGT\landing\
wrangler kv namespace create "GATEWAY_KV"
```

Copy the returned namespace ID into `landing/wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "GATEWAY_KV",
    "id": "<PASTE_NAMESPACE_ID_HERE>"
  }
]
```

For local dev: KV is not simulated in `wrangler dev`. The `getCachedEbayToken` function gracefully falls through to a fresh token fetch when `env.GATEWAY_KV` is `undefined`. No `.dev.vars` change needed.

### 5.2 No New eBay Secrets Required

`EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are already set in the landing worker. All new gateway handlers (`ebayCatalog.js`, `ebayItem.js`) reuse the same `getCachedEbayToken()` function and the same eBay app credentials.

### 5.3 eBay Developer Program - Scope Review

| API | Required Scope | Status |
|-----|----------------|--------|
| Browse API - `item_summary/search` | `api_scope` (base) | Working |
| Browse API - `item/:id` | `api_scope` (base) | No change needed |
| Catalog API - `product_summary/search` | `api_scope` (base) | No change needed |
| Marketplace Insights - `item_sales/search` | Elevated scope - "Sell Marketing" | May need eBay Developer Portal application |

> If the Insights API returns empty results, the Browse API fallback is already active. To enable true sold-listing data, apply for elevated access at `https://developer.ebay.com` -> "Your Applications" -> "Request Access."

---

## 6. D1 Schema Migration

Only Feature B requires a schema change.

```sql
-- ============================================================
-- AUCTION MARKET ALERTS (eBay price change notifications)
-- Added: Phase 2 eBay Market Value Alert feature
-- Append to outpost/auction-schema.sql
-- Run: npm run db:migrate:local (local) | npm run db:migrate (production)
-- ============================================================
CREATE TABLE IF NOT EXISTS auction_market_alerts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  alert_type    TEXT NOT NULL CHECK (alert_type IN ('price_spike', 'price_drop', 'floor_breach')),
  previous_avg  REAL NOT NULL,
  current_avg   REAL NOT NULL,
  pct_change    REAL NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  dismissed_at  TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_market_alerts_user_active
  ON auction_market_alerts(user_id, dismissed_at);
```

---

## 7. Implementation Sequence

Execute in this exact order to maintain a working production state at every step:

```
Step 1: KV Namespace Setup
         cd E:\TechTrekGT\landing
         wrangler kv namespace create "GATEWAY_KV"
         -> Copy namespace ID into landing/wrangler.jsonc kv_namespaces

Step 2: KV Token Cache (landing/)
         MODIFY landing/src/gateway/ebay.js (getCachedEbayToken + export helper)
         MODIFY landing/wrangler.jsonc (kv_namespaces binding)
         Deploy: wrangler deploy
         Verify: curl https://techtrekgt.com/api/health -> {"status":"ok"}

Step 3: live_avg Persistence Fix (outpost/)
         MODIFY outpost/functions/api/comps/index.js (live_avg in SQL)
         MODIFY outpost/src/components/inventory/PricingDrawer.jsx (draft + saveComp)
         Build + deploy: npm run deploy

Step 4: Feature A - Smart Catalog Auto-Fill
         NEW    landing/src/gateway/ebayCatalog.js
         MODIFY landing/src/worker.js (add GET /api/ebay/catalog route + import)
         NEW    outpost/src/components/inventory/CatalogSearchDropdown.jsx
         MODIFY outpost/src/utils/auctionApi.js (add fetchEbayCatalog)
         MODIFY outpost/src/components/AddInvoiceModal.jsx
         MODIFY outpost/src/components/EditItemModal.jsx
         Deploy: wrangler deploy (landing), then npm run deploy (outpost)

Step 5: Feature B - Market Value Alert Detector
         MODIFY outpost/auction-schema.sql (append auction_market_alerts table)
         Run:   npm run db:migrate:local then npm run db:migrate (production)
         NEW    outpost/functions/api/comps/refresh-all.js
         NEW    outpost/functions/api/comps/alerts.js
         MODIFY outpost/src/worker.js (add refresh-all + alerts routes)
         NEW    outpost/src/components/MarketAlertsPanel.jsx
         MODIFY outpost/src/components/DashboardView.jsx
         MODIFY outpost/src/utils/auctionApi.js (add refresh + alerts + dismiss exports)
         Build + deploy: npm run deploy

Step 6: Feature C - Authenticated Condition Report Auto-Generator
         NEW    landing/src/gateway/ebayItem.js
         MODIFY landing/src/worker.js (add GET /api/ebay/item/* route + import)
         NEW    outpost/src/utils/conditionReportGenerator.js
         MODIFY outpost/src/utils/auctionApi.js (add getEbayItemDetail)
         MODIFY outpost/src/components/inventory/PricingDrawer.jsx (Generate Report button)
         MODIFY outpost/src/components/ListingCopyModal.jsx (Condition Report tab)
         Deploy: wrangler deploy (landing), then npm run deploy (outpost)

Step 7: End-to-End Smoke Test
         - Login at https://techtrekgt.com/outpost
         - Inventory Hub: expand PricingDrawer for a certified item
         - Auto-Fetch Sold Comps -> Save -> verify live_avg in D1
         - Add Item modal: type "Michael Jordan 1986" -> verify catalog dropdown
         - Dashboard: verify MarketAlertsPanel renders; click "Refresh Now"
         - ListingCopyModal for certified item: verify Condition Report tab
```

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|---------|------------|
| eBay Marketplace Insights requires elevated scope - returns empty | High | Browse API fallback already active in `ebay.js`; apply for scope via eBay Developer Portal |
| KV namespace not provisioned before deploy | High | `getCachedEbayToken` gracefully falls back to live token fetch if `env.GATEWAY_KV` is undefined |
| `live_avg` SQL column write breaks existing comps upsert | Medium | Column already exists in schema; additive-only change to `UPDATE SET` and `INSERT` clauses |
| `auction_market_alerts` migration holds D1 write lock | Low | `CREATE TABLE IF NOT EXISTS` is idempotent; run during low-traffic window |
| eBay Catalog API is `v1_beta` - endpoint stability | Medium | Non-critical path; all catalog calls wrapped in `try/catch`; UI degrades gracefully to manual entry |
| `refresh-all` bulk comp fetch hitting eBay rate limits | Medium | Concurrency cap of 3 + 300ms inter-batch delay; 24hr cooldown enforced server-side per `userId` |
| Condition report quality when no eBay item ID in comp data | Low | Template-only fallback from local item data; "Fetch from eBay" button disabled when no ID available |

---

## 9. Open Questions

> [!IMPORTANT]
> **Q1 - KV Namespace Tier:** KV usage is negligible (~1-2 reads/writes per 2-hour window). No cost concern under the free tier (100k reads/day). Confirm this infrastructure addition is acceptable.

> [!IMPORTANT]
> **Q2 - Market Alert Threshold:** The plan uses 15% as the spike/drop trigger. Should this be a fixed global value, or do you want a configurable `threshold_pct` column on `auction_items` (or in a user settings table)?

> [!IMPORTANT]
> **Q3 - Catalog Auto-Fill Scope:** Should `CatalogSearchDropdown` appear in both `AddInvoiceModal` (new items) and `EditItemModal` (existing items), or only on new items? The edit modal risk: it could overwrite carefully curated item names with a catalog suggestion.

> [!NOTE]
> **Q4 - Condition Report Boilerplate:** `conditionReportGenerator.js` needs authenticator-specific boilerplate text (JSA LOA language, PSA slab notes, Beckett BAS/BGS template). Should these be authored as part of this implementation task, or should the generator produce a structural skeleton that the user customizes inline in `ListingCopyModal`?

> [!NOTE]
> **Q5 - Refresh-All Rate Limit Strategy:** The proposed approach is: concurrency cap of 3, 300ms inter-batch delay, and a 24-hour per-user cooldown. Does this match your expectations for a "Refresh Now" flow?

---

## 10. Verification Plan

### CLI Verification
```powershell
# Gateway health
curl https://techtrekgt.com/api/health
# Expected: { "status": "ok", "worker": "techtrek-landing" }

# Auth guard (no cookie)
curl https://techtrekgt.com/api/ebay/comps?query=test
# Expected: 401 { "error": "Unauthorized: missing token" }
```

### Manual Smoke Tests
1. **KV Caching:** First eBay comp fetch ~600-800ms (OAuth + Insights). Second fetch within 2hr window ~200-300ms faster (KV cache hit - observable in browser Network tab).
2. **live_avg Persistence:** Auto-Fetch Sold Comps + Save -> `SELECT live_avg FROM auction_comps WHERE item_id = '<id>'` in D1 console should be non-null.
3. **Catalog Dropdown:** Open Add Item modal, type "Michael Jordan 1986" -> dropdown appears within 500ms with eBay catalog suggestions.
4. **Market Alerts:** After `live_avg` is populated for at least one item, click "Refresh Now" on Dashboard. If market moved > 15%, alert card should appear in `MarketAlertsPanel`.
5. **Condition Report:** Open `ListingCopyModal` for a JSA/Beckett/PSA-certified item -> "Condition Report" tab appears -> report renders with cert line, condition statement, and aspects.

---

*Generated: 2026-08-24 | TechTrekGT - Outpost eBay API Integration Plan*
*Status: Awaiting "Plan approved, proceed with implementation"*
