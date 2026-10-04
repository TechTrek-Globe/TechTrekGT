# [ARCHIVED] Central API Gateway - Architecture & Implementation Plan

**Repository:** TechTrekGT  
**Status:** DRAFT - Awaiting approval  
**Scope:** Migrate external third-party API calls (eBay scraper, Amazon scraper, Google Places, Geoapify) out of sub-app workers and into a new gateway layer hosted by the `landing/` Cloudflare Worker.

---

## 1. Current State Audit

### 1.1 Landing Worker - Current State

The `landing/` app is a **purely static Cloudflare Worker** (no `src/worker.js` exists today). Its `wrangler.jsonc` uses the bare `assets` binding with a `directory: "./"` pointing at `index.html` and `style.css`. There is no JavaScript Worker entry point - just static file serving at the root `techtrekgt.com`.

```
landing/
  index.html
  style.css
  public/
  wrangler.jsonc          <-- assets only, no "main" field
  package.json            <-- no build script, no dev script; only wrangler deploy
```

**Critical implication:** To host an API Gateway, `landing/` must be promoted from a static-assets-only Worker to a **programmatic Worker with a `main` entry point** (`src/worker.js`). The `wrangler.jsonc` must gain a `"main"` field and the assets binding must switch from bare-directory mode to the structured `ASSETS` binding with `run_worker_first: true`.

### 1.2 Outpost Worker - Current State

`outpost/src/worker.js` is a full 279-line programmatic Worker that:
- Normalizes `/outpost/api/*` prefixes to `/api/*`
- Routes all `/api/*` requests via explicit `if/else if` chains to imported handlers
- Falls back to the `ASSETS` binding for SPA HTML

**External API calls currently in Outpost:**

| Endpoint | File | External Service | Secrets Used |
|----------|------|-----------------|--------------|
| `POST /api/comps/live` | `functions/api/comps/live.js` | `www.ebay.com` (HTML scrape) | None - direct anonymous scrape |
| `GET /api/comps/live` | same | `www.ebay.com` (HTML scrape) | None - direct anonymous scrape |
| `POST /api/import/amazon-fetch` | `functions/api/import/amazon-fetch.js` | `www.amazon.com` (HTML scrape) | `SCRAPER_API_KEY` (optional), `AMAZON_SCRAPER_URL` (optional) |

**Note on `POST /api/import/amazon`:** This is the VineScout Chrome Extension endpoint. It uses a Bearer API token from D1 `users.amazon_api_token` (not an SSO JWT cookie) and only writes to D1 - it calls no external API. This endpoint **must NOT be migrated** to the gateway; it stays in outpost permanently.

**Note on `api/comps/live`:** The eBay scrape is anonymous - no API key. Migration value: (a) centralizing User-Agent/scraping logic, (b) enabling future rate limiting or caching at the gateway level.

### 1.3 Wayfinder Worker - Out of Scope (Phase 1)

`wayfinder/src/worker.js` handles Google Places and Geoapify calls. These are listed in `ARCHITECTURE.md` section 2.4 as wayfinder-specific. `/api/places/` is a **Phase 2** goal documented in section 6 of this plan.

### 1.4 Shared Auth System

All apps share one `JWT_SECRET` and one `users` table in `personal-budget-db`. The `requireAuth` / `verifyToken` / `getTokenFromRequest` utilities are duplicated in each app's `functions/utils/auth.js` and `guard.js`. The landing gateway must carry its own copy of these utilities to validate the SSO cookie without calling back into another sub-app.

---

## 2. Target Architecture

```
Browser (any sub-app)
   |
   |  fetch('/api/ebay/comps', { credentials: 'include' })
   |  fetch('/api/amazon/fetch', { credentials: 'include' })
   v
techtrekgt.com  (landing/ Cloudflare Worker - techtrek-landing)
   |
   |  1. URL matches /api/ebay/* or /api/amazon/* or /api/places/*
   |  2. Validate JWT from HttpOnly cookie (env.JWT_SECRET)
   |  3. Call external API using env.SCRAPER_API_KEY / etc.
   |  4. Return structured JSON to browser
   |
   +---> External Services (eBay, Amazon, Google Places, Geoapify)

techtrekgt.com/outpost/*  (techtrek-outpost Worker)
   |
   |  D1-backed domain endpoints remain here:
   |  /api/auth/*, /api/invoices/*, /api/items/*, /api/sales/*
   |  /api/platforms/*, /api/comps/*, /api/import/amazon
   |  /api/import/batch, /api/import/amazon-token
   |  /api/sync/finance, /api/supplies/*, /api/reports/tax, /api/dashboard
   |
   |  External-API endpoints RETIRED from outpost:
   |  - /api/comps/live          -> gateway /api/ebay/comps
   |  - /api/import/amazon-fetch -> gateway /api/amazon/fetch
```

### 2.1 Gateway URL Namespace

| Gateway Endpoint | Method | Replaces | External Service |
|----------------|--------|----------|-----------------|
| `/api/ebay/comps` | GET, POST | `outpost /api/comps/live` | `www.ebay.com` (HTML scrape) |
| `/api/amazon/fetch` | POST | `outpost /api/import/amazon-fetch` | `www.amazon.com` + optional scraper proxy |
| `/api/places/search` | GET | *(new - Phase 2)* | Google Places API |
| `/api/geo/places` | GET | *(new - Phase 2)* | Geoapify API |
| `/api/health` | GET | *(new)* | Internal health check (no auth) |

### 2.2 Request Flow (Sequence)

```
Outpost client browser at /outpost/*
   |
   |  POST https://techtrekgt.com/api/ebay/comps
   |  Headers: Cookie: auth_token=<JWT>
   |  Body: { "query": "Michael Jordan card PSA 10", "itemId": "item-abc123" }
   |
   v
landing/src/worker.js  (techtrek-landing Worker)
   |
   |  pathname = '/api/ebay/comps'
   |  1. OPTIONS preflight -> 204
   |  2. Match '/api/ebay/comps' POST route
   |  3. requireGatewayAuth(request, env)
   |     - reads auth_token cookie
   |     - verifies HS256 JWT with env.JWT_SECRET
   |     - returns { userId, email }
   |  4. call fetchEbaySoldComps(query) [logic moved from comps/live.js]
   |  5. return JSON { success, live_avg, items, ... }
   |
   v
Outpost client receives raw eBay data
   |
   |  [If Option A selected] Second call to outpost D1 persistence:
   |  POST /outpost/api/comps { itemId, live_avg, comp_1, ... }
```

### 2.3 CORS Strategy

```
Allowed Origins:
  https://techtrekgt.com
  http://localhost:3001   (outpost dev)
  http://localhost:5174   (wayfinder dev)
  http://localhost:3000   (finance dev)
  http://localhost:5173   (bigworm dev)
  http://localhost:8787   (landing dev)
```

`Access-Control-Allow-Credentials: true` is mandatory because all gateway calls use `credentials: 'include'`.

---

## 3. File Change Map

### 3.1 `landing/` - Files to CREATE

```
landing/
  src/
    worker.js                   [NEW] Gateway Worker entry point
    gateway/
      auth.js                   [NEW] verifyToken + getTokenFromRequest
                                        (verbatim from outpost/functions/utils/auth.js)
      guard.js                  [NEW] requireGatewayAuth (stateless JWT-only; no D1)
      ebay.js                   [NEW] cleanEbaySearchQuery, fetchEbaySoldComps,
                                        fallbackCompsResponse, onRequestGet, onRequestPost
                                        (extracted from outpost/functions/api/comps/live.js)
      amazon.js                 [NEW] onRequestPost Amazon fetch handler
                                        (extracted from outpost/functions/api/import/amazon-fetch.js)
  .dev.vars.example             [NEW] JWT_SECRET, SCRAPER_API_KEY, AMAZON_SCRAPER_URL
```

### 3.2 `landing/` - Files to MODIFY

```
landing/
  wrangler.jsonc  [MODIFY] Add "main": "src/worker.js"
                           Upgrade assets binding to ASSETS + run_worker_first: true
                           Add compatibility_flags: ["nodejs_compat"]
                           Add observability: { enabled: true }

  package.json    [MODIFY] Change "type" to "module" (ESM required for Worker imports)
                           Add "dev": "wrangler dev" script
```

### 3.3 `outpost/` - Files to MODIFY

```
outpost/src/worker.js
  [MODIFY] Remove imports: compsLiveGetHandler, compsLivePostHandler, amazonFetchHandler
  [MODIFY] Remove routing blocks for: /api/comps/live, /api/import/amazon-fetch

outpost/src/utils/auctionApi.js
  [MODIFY] fetchLiveComps() calls gateway URL: https://techtrekgt.com/api/ebay/comps
  [ADD]    fetchAmazonProduct() helper calling: https://techtrekgt.com/api/amazon/fetch

outpost/functions/api/comps/live.js       [DELETE or STUB - see Q3]
outpost/functions/api/import/amazon-fetch.js  [DELETE or STUB - see Q3]
```

### 3.4 `outpost/` - Files Unchanged

```
outpost/functions/api/import/amazon.js        VineScout Bearer-token endpoint (D1 only)
outpost/functions/api/import/amazon-token.js  Manages users.amazon_api_token column
outpost/functions/api/import/batch.js         Bulk spreadsheet import
outpost/functions/api/comps/index.js          D1 comps CRUD
outpost/functions/api/comps/[id].js           D1 comps CRUD
outpost/wrangler.jsonc                        No changes needed
```

---

## 4. Detailed Routing Code Design

### 4.1 `landing/wrangler.jsonc` - Required Changes

**Before (current):**
```json
{
  "name": "techtrek-landing",
  "compatibility_date": "2026-08-01",
  "assets": { "directory": "./" },
  "routes": [ ... ]
}
```

**After:**
```json
{
  "name": "techtrek-landing",
  "main": "src/worker.js",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "assets": {
    "directory": "./",
    "binding": "ASSETS",
    "not_found_handling": "none",
    "run_worker_first": true
  },
  "routes": [ ... same routes unchanged ... ]
}
```

> **Decision Q1:** Add D1 binding for future-proofing, or keep gateway stateless (omit D1)? JWT payload already contains `userId` - no D1 lookup needed for Phase 1 auth. Recommendation: omit D1 in Phase 1.

### 4.2 `landing/src/worker.js` - Gateway Routing Logic (Pseudocode)

```js
import { onRequestGet as ebayCompsGet, onRequestPost as ebayCompsPost }
  from './gateway/ebay.js';
import { onRequestPost as amazonFetchPost }
  from './gateway/amazon.js';

const ALLOWED_ORIGINS = [
  'https://techtrekgt.com',
  'http://localhost:3001', 'http://localhost:3000',
  'http://localhost:5174', 'http://localhost:5173', 'http://localhost:8787'
];

function addCorsHeaders(response, origin, isLocalhost) {
  const newHeaders = new Headers(response.headers);
  const allowedOrigin = (isLocalhost || ALLOWED_ORIGINS.includes(origin))
    ? (origin || 'https://techtrekgt.com')
    : 'https://techtrekgt.com';
  newHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  if (!isLocalhost) {
    newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers: newHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = request.headers.get('Origin') || '';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    // 1. HTTPS redirect
    if (!isLocalhost && url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // 2. OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }), origin, isLocalhost);
    }

    // 3. Gateway API route matching (before ASSETS fallback)
    if (pathname.startsWith('/api/')) {
      const context = { request, env, ctx };
      let response;
      try {
        if (pathname === '/api/ebay/comps' && request.method === 'GET') {
          response = await ebayCompsGet(context);
        } else if (pathname === '/api/ebay/comps' && request.method === 'POST') {
          response = await ebayCompsPost(context);
        } else if (pathname === '/api/amazon/fetch' && request.method === 'POST') {
          response = await amazonFetchPost(context);
        } else if (pathname === '/api/health') {
          response = new Response(
            JSON.stringify({ status: 'ok', worker: 'techtrek-landing' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          response = new Response(
            JSON.stringify({ error: 'Gateway endpoint not found' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gateway error';
        response = new Response(
          JSON.stringify({ error: msg }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return addCorsHeaders(response, origin, isLocalhost);
    }

    // 4. Static asset fallback for landing HTML/CSS/JS
    return env.ASSETS.fetch(request);
  }
};
```

### 4.3 `landing/src/gateway/guard.js` - Gateway Auth (Pseudocode)

```js
// Stateless JWT-only auth guard - no D1 required.
// Validates the shared SSO HttpOnly cookie.
import { verifyToken, getTokenFromRequest } from './auth.js';

export async function requireGatewayAuth(request, env) {
  if (!env.JWT_SECRET) {
    throw new Response(
      JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Response(
      JSON.stringify({ error: 'Unauthorized: missing token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload || !payload.userId) {
    throw new Response(
      JSON.stringify({ error: 'Unauthorized: invalid or expired token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return payload;
}

export async function withGatewayAuth(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'An internal error occurred.';
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export function ok(data, status = 200) {
  return new Response(JSON.stringify(data),
    { status, headers: { 'Content-Type': 'application/json' } });
}

export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } });
}
```

### 4.4 `landing/src/gateway/ebay.js` - eBay Handler

Exact extraction from `outpost/functions/api/comps/live.js` with:
- `requireAuth` replaced by `requireGatewayAuth` from `./guard.js`
- The D1 write block in `onRequestPost` (writes to `auction_comps` table) **removed** from the gateway
- Raw eBay comp data returned only; caller handles persistence (Option A)
- All five extraction strategies move verbatim: `cleanEbaySearchQuery`, JSON-LD parse, embedded-state parse, `s-item` list parse, broad class scan, `soldContext` scan

### 4.5 `landing/src/gateway/amazon.js` - Amazon Handler

Exact extraction from `outpost/functions/api/import/amazon-fetch.js` with:
- `requireAuth` replaced by `requireGatewayAuth` from `./guard.js`
- `SCRAPER_API_KEY` and `AMAZON_SCRAPER_URL` read from `env` (landing's `.dev.vars`)
- All multi-tier fetch logic moves verbatim (Scraper API proxy, direct Worker cascade)

### 4.6 `outpost/src/utils/auctionApi.js` - Client URL Update

```js
// Gateway base URL resolution
function getGatewayBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8787';
  }
  return 'https://techtrekgt.com';
}

// BEFORE: apiFetch('/api/comps/live', ...)
// AFTER:
export const fetchLiveComps = (query, itemId = null) =>
  fetch(`${getGatewayBase()}/api/ebay/comps`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, itemId })
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });

// NEW:
export const fetchAmazonProduct = (input) =>
  fetch(`${getGatewayBase()}/api/amazon/fetch`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input })
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
```

---

## 5. Secrets Management

### 5.1 Secrets to ADD to `landing/`

| Secret | Purpose | Source |
|--------|---------|--------|
| `JWT_SECRET` | Validate shared SSO JWT cookie | Same value as all other apps |
| `SCRAPER_API_KEY` | Optional Amazon Scraper API key | Move from outpost |
| `AMAZON_SCRAPER_URL` | Optional custom scraper proxy URL | Move from outpost |

### 5.2 Secrets to REMOVE from `outpost/` (post-verification)

- `SCRAPER_API_KEY` - `wrangler secret delete SCRAPER_API_KEY` + remove from `.dev.vars`
- `AMAZON_SCRAPER_URL` - `wrangler secret delete AMAZON_SCRAPER_URL` + remove from `.dev.vars`
- `JWT_SECRET` remains in outpost (needed for `/api/auth/*` endpoints)

### 5.3 `landing/.dev.vars.example` Content

```bash
# Landing API Gateway - local development secrets
# JWT_SECRET must match the value used in finance, outpost, wayfinder, bigworm
JWT_SECRET=your_shared_jwt_secret_here

# Optional: Amazon scraper proxy (leave blank to use direct Worker fetch)
SCRAPER_API_KEY=
AMAZON_SCRAPER_URL=

# Phase 2 placeholders
# GOOGLE_MAPS_API_KEY=
# GEOAPIFY_API_KEY=
```

### 5.4 Production Secret Deployment

```powershell
# Run from E:\TechTrekGT\landing\
wrangler secret put JWT_SECRET
wrangler secret put SCRAPER_API_KEY   # if applicable
```

---

## 6. Phase 2 - Google Places & Geoapify Gateway (Future)

Out of scope for Phase 1.

| Gateway Endpoint | Replaces | New Handler |
|----------------|----------|-------------|
| `GET /api/places/search?query=...` | wayfinder Places calls | `landing/src/gateway/places.js` |
| `GET /api/geo/places?category=...` | wayfinder Geoapify calls | `landing/src/gateway/geoapify.js` |

Requires: adding `GOOGLE_MAPS_API_KEY` and `GEOAPIFY_API_KEY` to landing secrets; removing from wayfinder after verification.

---

## 7. Deployment Sequence

Execute in this strict order to avoid a broken-window state:

```
Step 1: Set secrets in landing gateway
         cd E:\TechTrekGT\landing
         wrangler secret put JWT_SECRET
         wrangler secret put SCRAPER_API_KEY   (if applicable)

Step 2: Deploy landing gateway Worker
         wrangler deploy

Step 3: Verify gateway health and auth
         curl https://techtrekgt.com/api/health
         Expected: { "status": "ok", "worker": "techtrek-landing" }

Step 4: Deploy outpost with client URL updates AND route removals
         cd E:\TechTrekGT\outpost
         npm run deploy

Step 5: Smoke-test in production
         - Open https://techtrekgt.com/outpost
         - Trigger a live eBay comp fetch in Inventory Hub
         - Confirm Network tab shows request to techtrekgt.com/api/ebay/comps
         - Confirm result data matches previous behavior

Step 6: After verification, remove retired secrets from outpost
         cd E:\TechTrekGT\outpost
         wrangler secret delete SCRAPER_API_KEY
```

---

## 8. Open Questions (Decisions Required Before Implementation)

> [!IMPORTANT]
> **Q1 - D1 Binding in Landing:** Omit D1 (stateless JWT-only, recommended for Phase 1) or include for future-proofing?

> [!IMPORTANT]
> **Q2 - eBay Result Persistence:** Current `comps/live` POST writes to `auction_comps` when `itemId` is provided.
> - **Option A (Recommended):** Gateway returns raw data only. Outpost client makes a second call to `/outpost/api/comps` POST to persist. Clean separation.
> - **Option B:** Gateway binds D1 and writes `auction_comps` directly. One round-trip fewer but couples landing to outpost schema.

> [!IMPORTANT]
> **Q3 - Fate of Retired Outpost Handler Files:**
> - **Delete** `comps/live.js` and `amazon-fetch.js` entirely (recommended - clean removal).
> - **Replace with 410 Gone stubs** for a short transition window.

> [!IMPORTANT]
> **Q4 - `amazon-token` Stays in Outpost:** `GET/POST /api/import/amazon-token` is D1-only (no external API). Stays in outpost. Confirm agreement.

> [!NOTE]
> **Q5 - Local Dev Port:** Plan uses `http://localhost:8787` as landing gateway base in dev mode. Confirm no conflict when running outpost (3001) and landing (8787) simultaneously.

---

## 9. Risk Assessment

| Risk | Severity | Mitigation |
|------|---------|-----------|
| Landing static assets break after adding Worker entry point | High | `run_worker_first: true` + `ASSETS` binding; smoke-test landing page HTML immediately after Step 2 |
| Browser CORS rejection on cross-origin gateway calls | High | Explicit `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true`; all dev ports in allowed list |
| `JWT_SECRET` mismatch causes 401s for valid outpost sessions | High | Verify with `/api/health` + auth test in Step 3 before deploying outpost client changes |
| D1 comp persistence breaks (eBay `itemId` write path) | Medium | Implement Option A two-call pattern before removing old outpost `comps/live` route |
| eBay bot-detection block (same risk as today) | Low | Same scraping logic and User-Agent headers; no behavior change |
| Gateway cold-start latency on first eBay/Amazon fetch | Low | Root domain Worker stays warm at `techtrekgt.com`; acceptable tradeoff |

---

*Generated: 2026-08-24 | Status: Awaiting "Plan approved, proceed with implementation"*
