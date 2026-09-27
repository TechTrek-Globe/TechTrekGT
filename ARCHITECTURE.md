# TechTrekGT - Architecture Document

## 1. Overview

TechTrekGT is a multi-application platform hosted on `techtrekgt.com`. The repository is a collection of five self-contained projects, each deployed independently as a Cloudflare Worker, sharing a common D1 SQLite database and a single sign-on (SSO) JWT secret. There is no root-level workspace manifest; each project manages its own dependencies, build, and deployment.

**`landing/` is the primary domain root.** It serves `techtrekgt.com` directly as a static Cloudflare Worker. All other apps are independently deployed Workers mounted at sub-paths or sub-domains and are linked from the landing hub.

| Project | Purpose | Route | Stack |
|---------|---------|-------|-------|
| `landing/` | **Primary domain root** - platform hub / marketing page | `techtrekgt.com` *(Main Site)* | Static HTML/CSS/JS |
| `finance/` | Personal budget tracker | `techtrekgt.com/finance/*` | React 19 + Vite + Cloudflare Workers |
| `outpost/` | Resale / auction operations tracker | `techtrekgt.com/outpost/*` | React 19 + Vite + Cloudflare Workers |
| `vinescout/`| Amazon Vine analytics & ETV tax tracker | `techtrekgt.com/vinescout/*` | React 19 + Vite + Cloudflare Workers |
| `wayfinder/` | Poland Christmas 2026 travel guide | `techtrekgt.com/wayfinder/*` | React 19 + Vite + Cloudflare Workers |
| `bigworm/` | Secure remote desktop portal (Guacamole) | `bigworm.techtrekgt.com` *(sub-domain)* | React 19 + Vite + Cloudflare Workers |

---

## 2. Tech Stack Overview

### 2.1 Shared Frontend Stack (finance, outpost, vinescout, wayfinder, bigworm)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 19 | Function components + hooks only |
| Build tool | Vite 6 | Each app has its own `vite.config.js` |
| Styling | Tailwind CSS 3.4 | Utility-first, custom palettes per app (`brand`, `wf-*`, `outpost-*`) |
| Icons | lucide-react | Consistent icon set across all apps |
| Charts | Recharts 2.15 | Used in finance and outpost dashboards |
| Spreadsheets | xlsx | Excel/CSV import/export in finance and outpost |
| Drag & drop | @dnd-kit | Dashboard widget reordering (finance) |
| PDF parsing | pdfjs-dist | Invoice PDF parsing (outpost) |

### 2.2 Shared Backend Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Cloudflare Workers (ESM) | Each app ships a `src/worker.js` entry point |
| Database | Cloudflare D1 (SQLite) | Single shared database: `personal-budget-db` |
| Auth | Custom JWT (HS256) + PBKDF2-SHA256 | WebCrypto-based, 600k iterations |
| Sessions | HttpOnly cookies | `credentials: 'include'` on all fetch calls |
| Deploy | Wrangler 3/4 | `wrangler.jsonc` per project |
| Networking | Cloudflare Tunnel | Used by bigworm to reach Guacamole |
| CORS & Origins | Environment-Gated Origins | Production origins strictly separate from dev localhost/127.0.0.1 |

### 2.3 Landing Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Static HTML5 + CSS3 + vanilla JS | No framework, no build step |
| Styling | Hand-written CSS with custom properties | Dark space theme with amber accents |
| **Gateway Worker** | **Cloudflare Workers ESM** | **`src/worker.js` - programmatic Worker entry point; routes `/api/*` before falling back to static ASSETS** |
| Deployment | Cloudflare Workers + static assets | `run_worker_first: true`; gateway intercepts API routes, ASSETS serves HTML/CSS/JS |

### 2.4 External API Integrations, Lookup Services & Dual Verification Standard

> **Central API Gateway (Phase 1 active):** External third-party API calls for eBay and Amazon have been migrated out of `outpost/` and into the `landing/` Central API Gateway (`src/gateway/`). All gateway endpoints require the shared SSO JWT cookie. Sub-apps call the gateway via absolute URL (`https://techtrekgt.com/api/...`) with `credentials: 'include'`.

| Service | Gateway / App | Endpoint | Purpose |
|---------|-------------|----------|---------|
| **eBay REST API** | `landing` (gateway) | `GET/POST /api/ebay/comps` | Fetches recently sold comp listings via eBay OAuth CCF + Marketplace Insights API (Browse API fallback). Replaces anonymous HTML scraper in outpost. |
| **eBay OAuth, Sync, Automated Sales & Analytics** | `landing` (gateway) + `outpost` (direct) | `GET/POST /api/ebay/oauth/*`, `GET /api/ebay/listings`, `GET /api/ebay/finances`, `GET /api/ebay/analytics`, `POST /api/ebay/webhook`, `POST /api/ebay/sync-item`, `POST /api/ebay/sync-all` | Phase 3/5/6 eBay OAuth ACG authorization, active listing discovery, automated sales data entry (orchestrating Fulfillment API `/sell/fulfillment/v1/order` for buyer/order status and Finances API `/sell/finances/v1/transaction` for exact gross/net/fees with atomic D1 persistence), Sell Analytics API traffic reporting (`auction_item_analytics`), and webhook notification proxy. **Note:** Active listing discovery (`GET /outpost/api/ebay/find-listings`), item resync (`POST /api/ebay/sync-item`), batch sync (`POST /api/ebay/sync-all`), and traffic analytics (`GET /api/ebay/analytics`) call eBay APIs directly from the Outpost Worker via `tokenHelper.js` with D1 caching. Fee reconciliation (`/api/ebay/reconcile`) proxies through the Landing Gateway for `/api/ebay/finances`. |
| **Amazon Scraper** | `landing` (gateway) | `POST /api/amazon/fetch` | Multi-tier Amazon product detail extraction: external scraper proxy (`SCRAPER_API_KEY`) + direct Worker cascade. Replaces `outpost/functions/api/import/amazon-fetch.js`. |
| **Google Places & Maps API** | `wayfinder` | (wayfinder-local) | Live venue details, ratings, photography, neighborhood & hotel lookup queries, coordinate navigation links, and mandatory dual verification. *(Phase 2: migrate to gateway `/api/places/search`)* |
| **Geoapify API** | `wayfinder` | (wayfinder-local) | Primary POI generation, geocoding, and venue coordinate dual verification. *(Phase 2: migrate to gateway `/api/geo/places`)* |
| **National Bank of Poland (NBP) API** | `wayfinder` | (wayfinder-local) | Real-time PLN/USD and PLN/EUR exchange rates via worker proxy. |
| **Amazon VineScout Import & Export** | `outpost` | `POST /api/import/amazon`, `GET /api/export/vinescout-sales`, `GET /api/export/vinescout-inventory` | VScout and Chrome Extension integration endpoints. Authenticates via per-installation hashed secrets in `api_integrations` (with `amazon_api_token` and migration `OUTPOST_SECRET_KEY` fallback). Reads/writes to user-isolated D1 tables. Stays in outpost permanently. |
| **API Integrations Management** | `outpost` | `GET/POST /api/integrations`, `POST /api/integrations/:id/revoke`, `DELETE /api/integrations/:id` | HIGH-2 per-device API integration key issuance and revocation. Generates `op_sec_` secrets, stores deterministic SHA-256 `secret_hash`, and supports instant revocation. |
| **Amazon URL Ingestion** | `outpost` | `POST /api/import/amazon-url` | Takes an Amazon ASIN/URL and routes through the Landing Gateway (`/api/amazon/fetch`) for hydrated data, authenticated via the standard SSO JWT cookie. |
| **Market Comps Engine** | `outpost` | `GET/POST /api/comps/market` | Stores and calculates median/benchmark metrics against verified market comparables (`market_comps`). Replaces legacy pricing models. |
| **SKU & Custom Label Engine** | `outpost` | `POST /api/items/auto-sku`, `POST /api/ebay/push-sku` | Generates unique structured SKUs (`OP-YYMMDD-XXXX`) on creation/backfill and pushes custom labels directly to live eBay store listings via Trading API (`ReviseFixedPriceItem` / `ReviseItem`). |
| **Bi-Directional Sync Engine & VScout Write-Back** | `outpost` | `GET/PUT /api/sync/settings`, `GET/POST /api/sync/vinescout-catalog`, `POST /api/ebay/sync-all` | Phase 7 automated & manual bi-directional sync engine. Reconciles eBay sales via Fulfillment API, stamps sold metadata back to VScout items (`outpost_liquidated`, `sold_at`, `sale_price`, `ebay_order_id`) in `auction_items.attributes`, manages per-user automation preferences in `outpost_sync_settings`, and runs context-level background polling via `InventoryContext` (Option K). |
| **Invoice Ingestion & Re-Proration Engine** | `outpost` | `POST /api/invoices`, `PUT /api/invoices/:id` | HIGH-7 N+1 query elimination. Pre-fetches distinct platform fee rates in a single query via `IN (...)` and executes all item insertions and re-proration updates in batched atomic D1 calls (`env.DB.batch`), eliminating 2N+1 sequential database round-trips. |
| **eBay Batch Sync Concurrency & Campaign Cache Engine** | `outpost` | `POST /api/ebay/sync-all` | HIGH-8 Bounded concurrency and in-memory marketing cache. Replaces serial per-item network awaits with bounded concurrency (`CONCURRENCY_LIMIT = 3`, `DELAY_MS = 100`), and introduces a request-scoped `campaignCache` Map with in-flight Promise deduplication in `fetchSingleEbayListing` to reuse discovered campaign and ad-level promoted rates across items, eliminating redundant Marketing API subrequests and preventing Workers CPU/subrequest limit exhaustion. |
| **Rate Limiting & Brute-Force Defense** | `outpost` | `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/security-question` | MED-1 & MED-2 Dual-layer fail-closed rate limiting and per-account lockout defense. Critical auth endpoints enforce fail-closed 60-second blocks if `RATE_LIMIT_KV` fails, and implement dual-layer checks against both `CF-Connecting-IP` and normalized email accounts (e.g. `login-account:${cleanEmail}` with 10 attempts / 15 min; password recovery / registration with 5 attempts / 15 min), returning HTTP 429 with the stricter `Retry-After` duration to defeat distributed attacks across rotating IPs. |
| **Email Verification at Registration** | `outpost` | `POST /api/auth/register`, `GET/POST /api/auth/verify-email` | MED-3 Registration email verification and token lifecycle. Registration inserts unverified accounts (`email_verified = 0`, `email_verified_at = NULL`) and issues single-use tokens in `email_verifications` without returning active session cookies. Verification validates 24-hour expiration, atomically marks `email_verified = 1`, and issues the authenticated JWT session cookie. Administrative access matching `ADMIN_EMAIL` is gated on verified email status. |
| **CSP Nonce & Script Hardening** | `outpost` | Worker fetch, HTMLRewriter | MED-4 Content-Security-Policy script protection. Eliminates `unsafe-inline` from `script-src`, injects per-request cryptographic nonces (`script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`), and uses `HTMLRewriter` to attach nonces to `<script>` tags and inject `<meta name="csp-nonce">` into HTML responses. |
| **Internal Error & Upstream Message Sanitization** | `outpost`, `landing` | `withAuth`, `worker.fetch`, eBay APIs (`/api/ebay/*`), Amazon Proxy (`/api/amazon/*`) | MED-5 Internal error and third-party response body sanitization. Prevents information disclosure by replacing raw exception messages (`err.message`), database driver internals, and upstream API error bodies (`text.slice(0, 200)`) with generic client-facing messages ("An internal error occurred. Please try again.", "eBay request failed. Please try reconnecting your account.") while logging full error details and stack traces server-side via `console.error`. |


> **Dual-Verification Standard:** All external API POI coordinates, venue geocoding, and address metadata MUST be dual-verified across both Google Places API and Geoapify API (delta distance threshold < 250m) prior to dataset ingestion in `wayfinder/src/data/poland-2026.js`.


---

## 3. Directory Structure

### 3.1 Cross-Cutting Project Layout

Every React project follows the same structural convention:

```
<project>/
├── index.html                    # HTML shell (SPA entry)
├── package.json                  # App-scoped dependencies & scripts
├── vite.config.js                # Vite build config (base path, plugins)
├── tailwind.config.js            # Tailwind theme, custom colors
├── wrangler.jsonc                # Cloudflare Worker config (routes, D1, KV)
├── schema.sql / *-schema.sql     # D1 SQL schema (finance, outpost, wayfinder)
├── src/
│   ├── main.jsx                  # ReactDOM.createRoot entry
│   ├── App.jsx                   # Root component: custom router + provider tree
│   ├── worker.js                 # Cloudflare Worker: API routing + SPA fallback
│   ├── index.css                 # Tailwind directives + global styles
│   ├── components/               # Feature components and views
│   ├── context/                  # React Context providers (auth, data)
│   ├── utils/                    # API helpers, formatters, parsers
│   └── assets/                   # Static images
└── functions/
    ├── api/                      # Route handlers (onRequestGet/Post/Put/Delete)
    │   ├── auth/                 # register, login, logout, me, password reset
    │   └── <domain>/             # Domain-specific endpoints
    └── utils/                    # auth.js (JWT/PBKDF2), rateLimit.js, guards
```

### 3.2 Project-Specific Additions

| Project | Unique Directories | Notes |
|---------|-------------------|-------|
| `finance/` | `src/components/`, `src/components/settings/`, `src/components/settings/datasync/`, `src/context/`, `src/utils/`, `src/assets/` | 4 context providers, modular settings sub-panels (Accounts, Bills, Dashboard, DataSync with dedicated CloudSync, ImportExport, StorageReset, and SyncQueue sub-panels, Security, Debug) |
| `vinescout/` | `functions/api/vinescout/` | Dual-system platform synced via MV3 Chrome Extension |
| `wayfinder/` | `src/components/city/`, `src/data/`, `src/hooks/`, `functions/api/wayfinder/` | 10 city tab sub-components, `data/poland-2026.js` static dataset, `hooks/useExchangeRate.js`, D1 wayfinder APIs |
| `outpost/` | `functions/api/` (largest) | invoices, items, sales, platforms, comps, reports, sync, import |
| `bigworm/` | `guacamole-config/` | `guacamole.properties`, `user-mapping.xml` for Docker Guacamole |

---

## 4. Routing & Navigation Strategy

### 4.1 Custom SPA Router (No React Router)

None of the React apps use `react-router`. Each implements a hand-rolled client-side router in `App.jsx` using `window.history.pushState` + `popstate` listeners. This keeps bundle sizes small and avoids dependency overhead.

**Common pattern (finance / outpost):**

```js
// App.jsx - core pattern
const [pathname, setPathname] = useState(() => window.location.pathname);

useEffect(() => {
  const handlePopState = () => setPathname(window.location.pathname);
  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, []);

const navigateTo = (path) => {
  window.history.pushState({}, '', path);
  setPathname(path);
};
```

**Pathname-to-view mapping (finance example):**

| Pathname | View |
|----------|------|
| `/finance` or `/` | Landing page |
| `/finance/dashboard` | `DashboardView` |
| `/finance/main-budget` or `/finance/bills` | `MainBudgetView` |
| `/finance/ledger` | `LedgerView` |
| `/finance/amortization` | `AmortizationView` |
| `/finance/settings` | `SettingsView` |

Views are conditionally rendered inside `MainContent` based on `activeView`, which is derived directly from `window.location.pathname` in the custom router and passed down to layout and view components.

**Wayfinder route table** (richer, lazy-loaded):

| Pathname | Component | Notes |
|----------|-----------|-------|
| `/wayfinder` | `WayfinderLanding` | Root landing & platform catalog |
| `/wayfinder/poland-christmas-2026` | `PolandLanding` | Flagship expedition landing & route summary |
| `/wayfinder/poland-christmas-2026/itinerary` or `/timeline` | `ItineraryView` | Public 10-day chronological itinerary & timeline |
| `/wayfinder/poland-christmas-2026/route` or `/rail` | `RouteVisualization` | Rail route map & transit timings |
| `/wayfinder/poland-christmas-2026/markets` | `MarketsPage` | Christmas market directory & culinary highlights |
| `/wayfinder/poland-christmas-2026/stays-and-food` | `StaysAndFoodPage` | Neighborhood lodging base zones & food targets (no unbooked hotel listings) |
| `/wayfinder/poland-christmas-2026/practical` | `PracticalPage` | Practical travel, currency, packing & daylight info |
| `/wayfinder/poland-christmas-2026/cities/:cityId/:subPage` | `CityPage` | Per-city guides (overview, history, attractions, markets, restaurants, hotels [neighborhood base overview & Google Maps lookup], lgbtq) |
| `/wayfinder/poland-christmas-2026/private*` | `PrivateHub` | Auth-gated private travel documents & OCR extraction hub |
| any other `/wayfinder/*` | 404 fallback | "Component under construction" |

Wayfinder and Outpost use `React.lazy()` + `<Suspense>` for code-split route components and dynamically load heavy importers (`xlsx`, `pdfjs-dist`) on demand:

```jsx
const CityPage = React.lazy(() => import('./components/CityPage').then(m => ({ default: m.CityPage })));
```

### 4.2 Worker-Level Routing

Each Cloudflare Worker routes requests before serving assets:

```
Request -> URL normalization -> OPTIONS preflight -> API route matching -> SPA fallback
```

- `finance/src/worker.js`: strips `/finance` prefix, routes `/api/auth/*` + sync endpoints, rewrites `/finance/assets/*` and subpath static files (`favicon.svg`, `manifest.webmanifest`), SPA-falls-back all other `/finance/*` to `/`.
- `outpost/src/worker.js`: same pattern with subpath static asset support plus case-insensitive redirect of `/Outpost` and `/auction` to lowercase `/outpost`.
- `wayfinder/src/worker.js`: routes `/api/auth/*` and `/api/wayfinder/*` (journeys, itinerary, documents, import-jobs, budget, exchange-rate).
- `bigworm/src/worker.js`: routes `/api/auth/*`, exchanges JWT for a Guacamole token at `/api/guac-token`, and reverse-proxies `/tunnel/*` to Guacamole after JWT validation.

### 4.3 API URL Resolution

Utilities like `wayfinder/src/utils/api.js` resolve API endpoints relative to the current subpath:

```js
// If on /wayfinder or /wayfinder/*, route to /wayfinder/api/..., else /api/...
export function getApiUrl(endpoint) {
  if (window.location.pathname.startsWith('/wayfinder')) {
    return `/wayfinder${cleanEndpoint}`;
  }
  return cleanEndpoint;
}
```

---

## 5. State Management & Data Fetching

### 5.1 General Approach

All apps use **React Context + useState/useReducer**. There is no Redux, Zustand, or external state library. State architectures are per-app:

| App | Providers | Description |
|-----|-----------|-------------|
| `finance` | `AuthProvider`, `BudgetMetadataProvider`, `LedgerDataProvider` | `useBudget()` composes metadata + ledger contexts |
| `outpost` | `AuthProvider`, `InventoryProvider` | Auth context + Unified inventory/pricing/filters context |
| `wayfinder` | `AuthProvider`, `SettingsContext`, `WayfinderContext` | Auth + settings + itinerary/documents/jobs |
| `bigworm` | `AuthProvider` | Single auth context gating GuacamoleView |

### 5.2 Auth Flow (Shared Across Apps)

All four React apps share the same auth design:

1. **Login/register** POST to `/api/auth/login` (or `/register`) with `fetch(..., { credentials: 'include' })`.
2. **HttpOnly cookies** carry the JWT session. No tokens stored in `localStorage`.
3. **Session check** on app load via `/api/auth/me`: conditionally retains existing session and CSRF cookies without rotation during normal validity windows, only reissuing cookies via `issueSession` when approaching expiry (< 25% of TTL remaining), when session claims differ from database state, or when recovering from missing CSRF cookies.
4. **Inactivity timeout**: 15-minute timer, reset on `mousedown` / `keydown` / `mousemove` activity.
5. **Offline fallback** (finance only): if the network fails and email/password are provided, a local-only user session is created, enabling local-first usage.
6. **Session renewal**: POST `/api/auth/refresh` explicitly refreshes the short-lived access token within the active session window (`sexp`) with fresh `auth_token` and `csrf_token` cookies, requiring CSRF token validation and DB `token_version` verification.

**Backend auth utilities** (`functions/utils/auth.js` in each app):

- `hashPassword(password)` - PBKDF2-SHA256, 310,000 iterations (OWASP recommendation), salted with format `salt:iterations:hash`.
- `verifyPassword(password, storedHash)` - strictly validates 3-part `salt:iterations:hash` format; the legacy 100,000-iteration guessing fallback is completely eliminated to prevent silent authentication mismatch.
- `isThreePartHash(storedHash)` - verifies whether a stored hash conforms to the 3-part delimiter format.
- **Forced Password Reset Flow (HIGH-6):** Stored accounts lacking a valid 3-part hash or marked with `force_password_reset = 1` are intercepted at login (`POST /api/auth/login`) with HTTP 403 Forbidden and redirected directly to `/reset-password` (`forcePasswordReset: true, redirectTo: '/reset-password'`) rather than failing silently with credential errors. A migration/audit script (`npm run check:legacy-hashes`) identifies non-compliant hashes, and password reset clears the `force_password_reset` flag to 0.
- `toPublicUser(user, overrides)` - central serializer returning safe client fields only (id, email, name, role-derived isAdmin, emailVerified, pendingEmail, securityQuestion, hasSecurityQuestion), strictly stripping internal credential hashes.
- `verifyToken(token, env)` - HS256 JWT verification via WebCrypto.
- `getTokenFromRequest(request)` - extracts JWT from cookie or `Authorization: Bearer` header.

**SSO:** All four apps share the same `JWT_SECRET` secret and the same `users` table in the shared D1 database, so a login in one app works across all.

### 5.3 Finance State Architecture

```
<App>
  └── <AuthProvider>
      └── <BudgetMetadataProvider>        # accounts, people, bills, loans, fundingGoals, widgets, theme
          └── <LedgerDataProvider>        # dailyMatrix, lineItems, transactions
              └── <MainContent>           # view routing based on activeView
```

`useBudget()` (composes both with `useMemo` for stable consumer references):

```js
export function useBudget() {
  const metadata = useBudgetMetadata();
  const ledger = useLedgerData();
  return useMemo(() => ({ ...metadata, ...ledger }), [metadata, ledger]);
}
```

**Multi-Account, Multi-Earner Distribution & Mathematical Reconciliation Engine:**

The finance platform supports flexible earner frequencies (`semi-monthly: 24/yr`, `monthly: 12/yr`, `bi-weekly: 26/yr`, `weekly: 52/yr`, `annual: 1/yr`) with normalized mathematical reconciliation across accounts:
- **`fundingGoals` Collection:** Explicit funding goals per contributor and account with custom frequencies (`getAnnualAmount`, `getMonthlyAmount`, `getAmountPerPaycheck`).
- **Surplus Auto-Overflow:** Unspent funding exceeding projected bill shares automatically flows to Extra Savings using account `overflowSplits` (e.g. 50/50 splits between partners or 100% single earner).
- **Mathematical Reconciliation:** Dashboard and transfer matrices calculate normalized per-paycheck and monthly amounts across different pay schedules (e.g. Semi-Monthly Jon + Monthly Ronnie each funding $1,600/mo across Mortgage & HOA accounts).

**Persistence layers (finance):**

| Layer | Technology | Purpose |
|-------|-----------|---------|
| IndexedDB | `utils/indexedDB.js` | Primary local persistence (get/set budget data) |
| localStorage | Legacy key `personal_budget_app_data_v1` | Migration fallback for older data |
| Cloudflare D1 | `user_backups` & `user_backup_versions` | Cloud vault backup with optimistic concurrency (`baseVersion`), epoch ms timestamps (`updated_at_ms`), 10-snapshot version history (`user_backup_versions`), size sanity check (10% threshold), and UI conflict resolution prompt via `/api/sync/backup`, `/api/sync/restore`, `/api/sync/versions`, and `/api/sync/restore-version` |
| API | Auth endpoints | User accounts, password reset, profile |

**Daily Matrix Key Architecture (Flat Key-Value Store):**

The `dailyMatrix` is a normalized dictionary mapping composite string keys to numeric amounts and text descriptions:
- Earner Deposits: `{accountId}_{monthKey}_{day}_credit_{personId}`
- Extra Savings Allocations: `{accountId}_{monthKey}_{day}_extra_credit_{personId}`
- Bill Deductions: `{accountId}_{monthKey}_{day}_bill_{billId}`
- Unmatched Debits & Credits (Consolidated Other): `{accountId}_{monthKey}_{day}_other_amount` + `{accountId}_{monthKey}_{day}_other_desc`

> **Consolidated Other Standard:** Unmatched items and direct "Other" adjustments are consolidated into a single "Other" column displaying positive (credits) and negative (debits) amounts with an associated "Other Description" column.

### 5.4 Data Fetching Patterns

- **Direct `fetch`** with `credentials: 'include'` for all authenticated API calls.
- **Context-level fetch functions** (e.g., `WayfinderContext.fetchItinerary()`, `fetchDocuments()`, `fetchJobs()`) that populate provider state.
- **Cloud sync** (finance): `SYNC_UNLOCK_CODE` passcode guard protects `/api/sync/backup` and `/api/sync/restore`. Passcode verification endpoint `/api/verify-sync-code` requires an active authenticated session (JWT + CSRF) and enforces dual rate limiting (per-IP 5/300s and per-account 5/300s keyed on `auth.user.id`) to throttle distributed brute force. Polling endpoints (`/api/sync/restore`, `/api/sync/versions`) support conditional requests via `ETag` and `If-None-Match` (returning HTTP 304 Not Modified to eliminate full payload transfers on unmutated data). User authentication leverages a 60s short-TTL cache layer (Cloudflare KV / Cache API / in-memory) with write-through cache invalidation to eliminate redundant D1 user queries. Backups measure payload size via byte-accurate `TextEncoder` and track `data_byte_length` in D1 to optimize shrink checks. Admin analytics (`/api/admin/stats`) enforces rate limiting (30/60s) and bounds queries with `LIMIT 1000`.
- **Spreadsheet reconciliation** (finance): Row-by-row merge engine with comment matching and automated account reconciliation via `matching_key` / bank document matching keys on `bills`.

### 5.5 Outpost Bi-Directional Synchronization Architecture (Phase 7)

The resale platform implements a bi-directional sync engine across eBay sales reconciliation and Vine Scout (VScout) inventory ingestion:
- **Application-Wide Polling Engine (Option K):** Sync settings and background polling loops are promoted to `InventoryContext.jsx`. The client-side polling interval runs app-wide regardless of active view (Inventory Hub, Sales Log, Dashboard, Settings), keeping the Cloudflare Worker purely stateless.
- **eBay Sales Reconciliation:** On-demand ("Sync eBay" in Command Bar and Sales Log) and background auto-sync trigger `POST /api/ebay/sync-all`. The Worker calls the eBay Fulfillment API (`/sell/fulfillment/v1/order`) and Finances API (`/sell/finances/v1/transaction`) with active OAuth tokens (`sell.fulfillment` / `sell.finances`). When completed/sold, items are marked `Sold`, sales records are created/updated in `auction_sales`, fees are reconciled, and `last_ebay_sync_at` is stamped in `outpost_sync_settings`.
- **VScout Ingestion & Outbound Sale Write-Back:** Amazon Vine items ingested via `POST /api/import/amazon` store ASIN, order ID, ETV, and metadata in `auction_items.attributes` (JSON blob). When an eBay sale is reconciled, the engine stamps sold details (`outpost_liquidated: 1`, `sale_price`, `sold_at`, `ebay_order_id`) directly into the item's attributes via `POST /api/sync/vinescout-catalog`.
- **Sync Configuration & Persistence:** Per-user automation preferences (`ebay_auto_sync`, `ebay_sync_interval_m`, `vscout_auto_sync`, `vscout_sync_interval_m`) are stored in D1 table `outpost_sync_settings` and configured via the Settings View Integrations tab (`GET/PUT /api/sync/settings`).

### 5.6 Outpost Per-Installation API Integration Secrets (HIGH-2)

Outpost uses per-device / per-installation integration secrets to authenticate automated clients (e.g. VineScout Chrome Extension) and prevent cross-tenant data pollution:
- **`api_integrations` Table:** Stores `id`, `user_id`, `secret_hash` (deterministic SHA-256 hex digest), `label`, `created_at`, and `revoked_at`.
- **Hashed Token Resolution:** `resolveIntegrationUserId(token, env)` computes SHA-256 of incoming `Authorization: Bearer <secret>` or `X-VineScout-Auth: <secret>` and queries `SELECT id, user_id, revoked_at FROM api_integrations WHERE secret_hash = ?`.
- **Revocation Guard:** If `revoked_at IS NOT NULL`, the secret is immediately rejected with 401 and never falls back.
- **Migration Fallback:** Legacy `users.amazon_api_token` and `env.OUTPOST_SECRET_KEY` (oldest user) remain as backward-compatibility fallbacks during migration, allowing zero-downtime transition to per-installation secrets.
- **Management Endpoints & CLI:** `GET /api/integrations` (list), `POST /api/integrations` (issue `op_sec_` key), `POST /api/integrations/:id/revoke` and `DELETE /api/integrations/:id` (revoke), plus admin CLI `scripts/manage-integrations.js`.

### 5.7 eBay OAuth Token Encryption Key Isolation (HIGH-3)

Outpost and the Landing Gateway isolate token encryption keys to ensure stored third-party OAuth credentials are never compromised by a session JWT secret leak:
- **Dedicated Secret Binding:** `env.TOKEN_ENCRYPTION_KEY` is provisioned separately from `JWT_SECRET` via `wrangler secret put` in both `techtrek-outpost` and `techtrek-landing`.
- **Key Derivation & Dedicated Salt:** AES-256-GCM cryptographic keys are derived via PBKDF2 (100,000 iterations, SHA-256) using `TOKEN_ENCRYPTION_KEY` and dedicated salt `techtrekgt-token-encryption-v2` (`NEW_SALT`). Random 12-byte initialization vectors (`crypto.getRandomValues(new Uint8Array(12))`) are prepended to ciphertexts as `${ivB64}.${cipherB64}`.
- **Transition Fallback Window:** `decryptToken(encrypted, tokenEncryptionKey, fallbackSecret)` attempts decryption using `TOKEN_ENCRYPTION_KEY` and `NEW_SALT` first. If decryption fails and a fallback secret is provided, it attempts legacy decryption with `OLD_SALT` (`techtrekgt-ebay-token-v1`), ensuring zero downtime during data migrations.
- **Call-Site Token Resolution:** `getEbayUserToken` in `outpost/functions/utils/ebayAuth.js`, `outpost/functions/api/ebay/tokenHelper.js`, and `landing/src/gateway/ebayOAuth.js` exclusively resolves `env.TOKEN_ENCRYPTION_KEY` for reading and writing tokens in `ebay_oauth_tokens`.
- **One-Time Data Migration:** Automated migration script `scripts/migrate-ebay-tokens.js` (`npm run migrate:ebay-tokens -- --remote`) re-encrypts all stored `access_token` and `refresh_token` rows in Cloudflare D1 and verifies decryption against `TOKEN_ENCRYPTION_KEY`.

### 5.8 Hashed Storage of Amazon/VineScout Bearer Tokens (HIGH-4)

Outpost remediates bearer token storage by hashing extension credentials and enforcing single-reveal UX:
- **Hashed Column Storage:** Replaced plaintext storage in `users.amazon_api_token` with `users.amazon_api_token_hash TEXT`, storing only deterministic 64-character SHA-256 lowercase hex digests (`crypto.subtle.digest('SHA-256', ...)`).
- **Single-Use Return Semantics:** `GET /api/import/amazon-token` and `POST /api/import/amazon-token` generate a 40-character hex bearer token, hash it, store the hash in D1, and return the raw token string to the client exactly once. Subsequent `GET` requests return `{ token: null, hasToken: true }`, ensuring raw credentials cannot be extracted from the database or API.
- **Hashed Lookup Site:** `resolveIntegrationUserId` in `outpost/functions/utils/apiIntegrations.js` hashes incoming `Authorization: Bearer <token>` or `X-VineScout-Auth` headers via SHA-256 and queries `SELECT id FROM users WHERE amazon_api_token_hash = ? LIMIT 1`. Raw tokens are never compared or stored in plaintext.
- **Force-Rotation Migration:** Database migration `scripts/migrate-amazon-tokens.js` (`npm run migrate:amazon-tokens -- --remote`) ensures the `amazon_api_token_hash` column exists, force-rotates all legacy plaintext tokens, writes their SHA-256 hashes, sets `amazon_api_token = NULL`, and emits rotation notifications for affected integration users.

### 5.9 JWT Expiry Alignment with Remember-Me Cookie Duration (HIGH-5)

Outpost and shared auth utilities align the JWT `payload.exp` claim with the cookie `Max-Age` header:
- **Configurable Token TTL:** `createToken(payload, secret, expiresInSeconds = 7200)` accepts an explicit lifetime parameter defaulting to 2 hours.
- **Login and Registration Duration Sync:** `login.js` and `register.js` compute `maxAge = body.rememberMe ? 30 * 24 * 3600 : 7200` and pass this value to both `createToken(payload, env.JWT_SECRET, maxAge)` and `buildAuthCookie(token, maxAge)`. Sessions with "Remember me" enabled remain valid for the full 30 days without premature 2-hour exp expiration.
- **Profile Update Preservation:** `update-profile.js` reissues session tokens using the existing `remainingSeconds = Math.max(payload.exp - Math.floor(Date.now() / 1000), 3600)` lifetime, preventing profile changes from truncating long-lived sessions.

### 5.10 Outpost eBay Batch Sync Bounded Concurrency & Campaign Cache (HIGH-8)

Outpost hardens the bulk inventory synchronization pipeline (`POST /api/ebay/sync-all` and `fetchSingleEbayListing`) against Cloudflare Workers CPU/duration limits and subrequest quotas:
- **Bounded Concurrency Pattern:** Replaced fully serial `for (const item of items)` loop in `sync-all.js` with bounded concurrency (`CONCURRENCY_LIMIT = 3`, `DELAY_MS = 100`, `Promise.all`), matching the pattern established in `runMarketRefresh`. Up to 3 item tasks run concurrently, pausing briefly between batches to prevent rate limits.
- **In-Memory Request-Scoped Campaign Cache:** `sync-all.js` hoists a `campaignCache = new Map()` passed directly into `fetchSingleEbayListing(env, accessToken, listingId, campaignCache)`.
- **In-Flight Promise Deduplication:** To prevent redundant network calls across concurrent tasks in the same batch, `campaignCache` stores in-flight promises for both the marketing campaign list (`__campaigns__`) and campaign ad discovery (`camp.campaignId`). All concurrent workers await the single shared promise.
- **Cross-Item Rate & Ad Reuse:** Once a campaign's ad-level rate or default funding strategy rate is fetched, subsequent items mapped to that campaign immediately reuse the cached rate without triggering duplicate calls to `/sell/marketing/v1/ad_campaign` or `/sell/marketing/v1/ad_campaign/:id/ad`.
- **Zero Hallucination / Identical Output:** Concurrency and caching optimizations alter only network dispatch and caching topology; all pricing floors, fee tiers, status transitions, and VScout write-backs produce identical outputs to serial execution.

---


## 6. Component Architecture

### 6.1 Smart vs. Dumb Components

The codebase follows a pragmatic split:

**Smart (container) components** - live in `components/`, consume context hooks, orchestrate data and view state:

| App | Smart Components |
|-----|-----------------|
| finance | `DashboardView`, `MainBudgetView`, `LedgerView`, `AmortizationView`, `SettingsView`, `LandingPage`, `AuthPage` |
| outpost | `DashboardView`, `InventoryHubView`, `SalesLogView`, `SettingsView` |
| wayfinder | `CityPage`, `MarketsPage`, `StaysAndFoodPage`, `PracticalPage`, `PrivateHub`, `PolandLanding` |
| bigworm | `AuthPage`, `GuacamoleView` |

**Dumb / presentational (or focused) components** - render UI from props:

| App | Components |
|-----|-----------|
| finance | `AccountLedgerView`, `AccountTransferSummary`, `InlineEdit`, `NoYearCalendarPicker`, `SpreadsheetImporter` |
| wayfinder | `AttractionCard`, `MustSeeCard`, `UrgentBookingAlert`, `WinterExclusive`, `Formatters`, `CurrencyConverterModal` |
| outpost | `EditItemModal`, `AddInvoiceModal`, `LogSaleModal`, `ListingCopyModal`, `TaxReportModal`, `FinanceSyncModal` |

**Shared layout components:**

- `AppLayout` (finance, outpost) - shell with navigation and header.
- `Layout` (wayfinder) - global shell with footer/header.
- `AuthPage` / `AuthModal` - authentication entry points.

### 6.2 Modal Pattern

Modals are controlled at the view level:

- `SettingsModal` (finance) - rendered conditionally when `isSettingsOpen` from `useBudget()`.
- `AuthModal` (finance) - rendered inside `MainContent` for inline auth.
- Outpost modals - each feature has its own modal component (AddInvoice, LogSale, SpreadsheetImporter, etc.) toggled by view state.

### 6.3 Error Handling

- **ErrorBoundary** class components in finance and outpost wrap the app tree. They capture render errors, display a readable error panel, and offer "Reload Page" / "Reset App Cache & Reload" actions.
- API calls use `try/catch` and return error objects or throw with user-friendly messages.

### 6.4 Styling System

- **Tailwind utility classes** are the primary styling mechanism. No component library (no shadcn, MUI, etc.).
- **Custom palettes** per app via `tailwind.config.js`:
  - finance: `brand` color scale, dark mode via `darkMode: 'class'`.
  - wayfinder: `wf-*` colors (navy/blue/amber/cream/cranberry) with glassmorphism and gradient text helpers.
  - outpost: `outpost-*` palette, glass-card utilities.
- **Global CSS** in `src/index.css` defines keyframes, reusable component classes, and scrollbar styling.
- **Landing** uses pure CSS custom properties (`:root` variables) with no Tailwind.

---

## 7. Middleware Pattern: Cloudflare Worker API Layer

All apps implement the same request-handling chain in `src/worker.js`:

```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. HTTPS redirect (skip localhost)
    // 2. OPTIONS preflight -> 204 with CORS headers
    // 3. Security headers on every response:
    //    - CSP (default-src 'self', no inline scripts)
    //    - HSTS, X-Content-Type-Options, X-Frame-Options
    //    - Referrer-Policy, Permissions-Policy
    // 4. CORS: allow techtrekgt.com, localhost dev ports
    // 5. Route matching:
    //    /api/auth/*          -> auth handlers (public)
    //    /api/<domain>/*      -> domain handlers (JWT-guarded)
    //    /assets/*            -> static asset rewrite
    //    <subpath>/*          -> SPA index.html fallback
    // 6. Error handling -> JSON { error: message } with 500
  }
}
```

### 7.1 Endpoint Organization

API handlers follow a Pages-Functions-style export convention:

```js
// functions/api/auth/login.js
export async function onRequestPost({ request, env, ctx }) { ... }
export async function onRequestGet({ request, env, ctx }) { ... }
```

This convention is consistent across all four React projects.

### 7.2 API Error Contract (Phase 2 Stage 6)

All API failure responses follow a strict machine-readable JSON schema generated by `fail(code, status, message, requestId)`:

```json
{
  "error": "Human readable description",
  "code": "MACHINE_READABLE_CODE",
  "requestId": "optional-request-id"
}
```

Standard error codes are declared identically in `src/utils/errorCodes.js` and `functions/utils/errorCodes.js`:
- `INVALID_CREDENTIALS`: Returned on authentication failure (never distinguishing unknown user from wrong password per Rule H7).
- `RESET_CODE_INVALID`: Returned on password reset failures (never distinguishing missing code, expired code, max attempts, or wrong security answer per Rule H7).
- `SESSION_EXPIRED`: Returned when session token_version does not match the database.
- `UNAUTHORIZED`: Returned when an unauthenticated request attempts to access protected endpoints.
- `FORBIDDEN`: Returned when an authenticated user attempts an unauthorized operation (e.g. non-admin accessing admin routes, cross-user sync version restoration).
- `CSRF_INVALID`: Returned on state-changing requests when the double-submit CSRF cookie/header verification fails.
- `RATE_LIMITED`: Returned (HTTP 429) when rate limits are exceeded.
- `VALIDATION_ERROR`: Returned on invalid, malformed, or missing request parameters.
- `NOT_FOUND`: Returned when the requested resource or API route does not exist.
- `CONFLICT`: Returned on unique constraint collisions (e.g., duplicate registration email).
- `SYNC_CONFLICT`: Returned (HTTP 409) when cloud sync detects a newer version than client baseVersion.
- `SYNC_SUSPICIOUS`: Returned (HTTP 409) when cloud backup payload is suspiciously smaller than stored backup (<10%) without force flag.
- `SERVICE_UNAVAILABLE`: Returned (HTTP 503) when required backend bindings (D1 or secrets) are missing.
- `INTERNAL_ERROR`: Returned (HTTP 500) on unhandled server-side exceptions.

---

## 8. Database Architecture

### 8.1 Shared D1 Database

All apps (finance, outpost, wayfinder, bigworm) point at the same `personal-budget-db` D1 database:

```json
// wrangler.jsonc (all apps)
"d1_databases": [{
  "binding": "DB",
  "database_name": "personal-budget-db",
  "database_id": "10f220d4-1c10-49e9-b63e-5d4cb08d599f"
}]
```

### 8.2 Schema Ownership

| Schema File | App | Tables |
|------------|-----|--------|
| `finance/schema.sql` | finance + shared | `users`, `_bak_households`, `_bak_household_members`, `accounts`, `_bak_people`, `bills`, `_bak_bill_splits`, `line_items`, `loans`, `household_settings`, `user_backups`, `user_backup_versions`, `password_resets` |
| `outpost/auction-schema.sql` | outpost | invoices, items, sales, platforms, comps, `market_comps`, supplies, `listing_traffic`, `auction_item_analytics`, `outpost_sync_settings`, `api_integrations`, `email_verifications` |
| `vinescout/vinescout-schema.sql` | vinescout | `vine_items`, `vine_orders`, `vine_tax_settings`, `vine_asin_cache` |
| `wayfinder/schema-wayfinder.sql` | wayfinder | journeys, itinerary items, documents, import jobs, budgets |

### 8.3 Key Design Points

- **Shared `users` table**: the auth system is common, so registration in one app enables login across all.
- **Outpost Email Verification & Sensitive Action Gating (MED-3)**: Registration in Outpost creates unverified accounts (`email_verified = 0`, `email_verified_at = NULL`) and issues single-use tokens in `email_verifications` without issuing active session cookies. Verification via `GET/POST /api/auth/verify-email` checks a 24-hour expiration window, atomically sets `email_verified = 1` and `email_verified_at = ISO timestamp`, and issues the session cookie (`auth_token`). Administrative access matching `ADMIN_EMAIL` is strictly gated on email verification.
- **Outpost Nonce-Based CSP & Script Hardening (MED-4)**: Outpost enforces strict nonce-based Content-Security-Policy (`script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`) with `'unsafe-inline'` completely removed from `script-src`. Each request generates a 16-byte base64url nonce via WebCrypto; `HTMLRewriter` stamps the nonce attribute onto HTML `<script>` tags and injects `<meta name="csp-nonce">` into `<head>`, protecting against inline XSS while allowing modular Vite-bundled assets and Cloudflare challenge scripts.
- **Internal Error & Upstream Response Sanitization (MED-5)**: Prevents raw exception messages, database driver internals, and truncated third-party API response bodies (`text.slice(0, 200)`) from leaking to API callers. In `withAuth` and `worker.fetch`, internal exceptions return generic client messages (`An internal error occurred. Please try again.`) with 500 status while logging full errors with stack traces to `console.error`. Upstream eBay and Amazon integration endpoints log full upstream error bodies server-side while returning generic summary messages (e.g. `eBay request failed. Please try reconnecting your account.`) with preserved upstream HTTP status codes (401, 403, 500, 502).
- **Phase 2 Stage 2 Sync Concurrency & Versioning**: Cloud backup sync in `handleSyncBackup` executes atomic compare-and-swap (CAS) via conditional SQL upsert guarded with `WHERE (? = 1 OR user_backups.updated_at_ms IS NULL OR user_backups.updated_at_ms <= ?)` and batches version snapshot insertion, version table pruning (last 10 versions), and backup upsert in a single `env.DB.batch([...])` transaction, preventing concurrent tab/device data overwrites with deterministic 409 `SYNC_CONFLICT` responses.
- **Phase 2 Stage 3 Household Simplification (Option B)**: The legacy relational household model has been simplified to per-user architecture. Migration `0004_drop_households.sql` reversibly archived `households`, `household_members`, `people`, and `bill_splits` into `_bak_*` tables, and purged the orphaned `default_vault` row. User registration issues a single `INSERT INTO users`. `householdId` claims and client context properties have been purged across auth utilities, tokens, endpoints, and `AuthContext`.
- **Phase 2 Stage 4 Schema & Data Integrity**: Migration `0005_backfill_user_created_at.sql` backfills missing creation timestamps with the sentinel timestamp `'1970-01-01T00:00:00.000Z'`. The `users.status` column is fully settable via `POST /api/admin/user/:id/status` (`Active` or `Suspended`) by admins, with immediate session revocation (`token_version` bump) and 403 enforcement across `login` and `authenticate`.
- **Phase 2 Stage 5 Email Verification & Security**: Migration `0006_email_verification.sql` added `email_verified` (DEFAULT 0) and `pending_email` columns to `users`, backfilled existing users with `email_verified = 1`, and created `email_verifications` table and indices (`idx_email_verifications_user`, `idx_email_verifications_email`). 8-digit verification codes are hashed with HMAC (`verify:${email}:${code}`) to prevent token leakage from database exposure. Registration issues unverified accounts (`email_verified = 0`) with non-blocking email dispatch. Endpoints `POST /api/auth/verify-email` (5/60s rate limit) and `POST /api/auth/resend-verification` (3/600s rate limit) allow verification with a visible 60s cooldown timer and persistent UI banner. Secure dual-notification email change flow (`update-profile.js` and `POST /api/auth/confirm-email-change`) writes to `pending_email`, notifies old and new addresses, and upon code verification atomically updates `email`, clears `pending_email`, sets `email_verified = 1`, and bumps `token_version` to revoke all prior sessions.
- **Phase 2 Stage 6 Uniform API Error Contract**: Uniform error taxonomy across client (`src/utils/errorCodes.js`) and Workers backend (`functions/utils/errorCodes.js`), strictly enforcing the `fail(code, status, message, requestId)` signature with guaranteed `{ error, code }` shape. Preserves information-hiding guarantees for credential guessing and password reset enumeration (Rule H7). Replaced client-side string error matching in `api.js` with exact `ERROR_CODES` matching.
- **Phase 2 Stage 7 Routing Cleanup**: Canonical mount redirect 301 from bare `/` to `/finance` reflecting the asset build path. Removed client-controllable `x-forwarded-proto` header evaluation in HTTP-to-HTTPS redirect logic. Scoped outpost sub-site routing rewrite strictly to production.
- **Phase 2 Stage 8 Rate Limit Hardening**: Documented `RATE_LIMIT_KV` as dev-only fallback. In production, requests without `CF-Connecting-IP` or when neither `RATE_LIMITER` nor `RATE_LIMIT_KV` is bound fail closed with 503 `SERVICE_UNAVAILABLE`. Handler for `POST /api/auth/reset-password` protected with dedicated 10 requests per 60s per-IP rate limiting. Non-production environments allow unbound execution with explicit dev mode logging.
- **Phase 2 Stage 9 Request ID Threading & Observability**: Every Worker invocation generates a unique `requestId` (`crypto.randomUUID()`) threaded through execution context, error logs, and error responses. Structured metric events (`auth.register.success`, `auth.register.duplicate`, `auth.login.success`, `auth.login.invalid_credentials`, `auth.login.rehash`, `auth.forgot.sent`, `auth.forgot.throttled`, `auth.reset.success`, `auth.reset.bad_code`, `sync.backup.success`, `sync.backup.conflict`, `sync.backup.suspicious`, `sync.restore.success`, `sync.restore.not_found`) emitted as low-cardinality JSON log lines for observability.
- **Phase 2 Stage 10 Static Asset Caching**: `addSecurityHeaders` applies `Cache-Control: public, max-age=31536000, immutable` for content-hashed static assets under `/finance/assets/` and assets matching content-hashed filename patterns. Non-hashed static assets (e.g. `/finance/favicon.svg`) receive `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`. HTML responses strictly retain `Cache-Control: no-store, must-revalidate` (with nonce injection), and API JSON responses strictly retain `Cache-Control: no-store`.
- **Phase 2 Stage 11 Cloud Vault Passcode Security & Per-Account Rate Limiting**: Hardened `POST /api/verify-sync-code` by enforcing authentication (`authenticate(context, { requireCsrf: true })`) prior to passcode evaluation, returning 401 UNAUTHORIZED on unauthenticated calls. Added per-account rate limiting (5 requests / 300s) keyed on `auth.user.id` alongside existing per-IP rate limiting, stopping distributed brute force attacks against individual user accounts across varying source IPs.
- **Phase 2 Stage 12 Cookie Path Scoping & Origin Isolation**: Scoped `auth_token` and `csrf_token` cookies in `sessionCookies` and `clearedCookies` to `Path=/finance` and `Path=/api` (rather than root `Path=/`). Prevents automatic cookie transmission to unrelated origin applications (such as `/outpost` and `/auction`), preventing cross-app CSRF leakage via `document.cookie` if an unrelated sub-app suffers stored XSS. `clearedCookies` invalidates `/finance`, `/api`, and legacy `/` cookies. Documented that true cross-app security isolation under the Same-Origin Policy requires moving independent apps to separate subdomains (e.g. `finance.techtrekgt.com`, `outpost.techtrekgt.com`), tracked as a long-term architectural follow-up.
- **Phase 2 Stage 13 Explicit Environment Binding & Security Header Gating**: Bound `ENVIRONMENT = "production"` in `wrangler.jsonc` (`vars`). In `worker.fetch`, `isProduction` is derived strictly from `env?.ENVIRONMENT === 'production'`, eliminating silent header loss when `cf-ray` is missing on production traffic. `addSecurityHeaders` gates CSP and HSTS on `isProduction && !isLocalhost`. A missing `ENVIRONMENT` binding on traffic containing `cf-ray` triggers a loud runtime warning in console logs.
- **Phase 2 Stage 14 PBKDF2 Iteration Hardening & Decoupled Sanity Ceiling**: Decoupled PBKDF2 target iterations from the verification cap. Raised `PBKDF2_ITERATIONS` to 600,000 (benchmarked at ~221ms in Cloudflare Workers workerd runtime) in alignment with OWASP recommendations for PBKDF2-HMAC-SHA256, leaving ample headroom for D1 operations and rehash-on-login execution (~256ms total). Set `PBKDF2_MAX_SUPPORTED = 2,000,000` as a fail-closed sanity ceiling against malicious or corrupted stored records. Existing accounts transparently migrate to 600,000 iterations upon their next successful login via `needsRehash` without downtime or required password resets.
- **Phase 2 Stage 15 Dual-Layer Account-Keyed Rate Limiting**: Added account-keyed rate limiting across `login` (`login-account:<cleanEmail>`, 10 / 300s), `forgot-password` (`forgot-account:<cleanEmail>`, 5 / 600s), `register` (`register-account:<cleanEmail>`, 5 / 300s), and `verify-sync-code` (`sync-code-account:<userId>`, 5 / 300s). First-gate IP limiting runs before body parsing to fail fast; second-gate account limiting runs after parsing and email normalization before DB reads or password hashing, blocking distributed credential stuffing attacks across rotating source IPs. All account rate limit breaches return uniform 429 `RATE_LIMITED` responses with `Retry-After` headers and threaded `requestId`.
- **Phase 2 Stage 16 Cloudflare Turnstile Server-Side Verification**: Documented that CSP allowlisting of `challenges.cloudflare.com` supports Turnstile widgets and Cloudflare edge WAF Managed Challenges. Implemented server-side token validation on `POST /api/auth/login` and `POST /api/auth/register` via `verifyTurnstile()` in `functions/utils/auth.js` calling `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `env.TURNSTILE_SECRET_KEY`. Validation runs immediately after body parsing before account rate limiting, database lookups, or PBKDF2 hashing, returning 400 `VALIDATION_ERROR` on missing or failed tokens when `TURNSTILE_SECRET_KEY` is configured. When unset, verification is skipped gracefully for development and automated test environments.
- **Phase 2 Stage 17 Sync Blob Bandwidth Optimization & Unambiguous Session Issuance**: Migration `0007_backup_data_byte_length.sql` added `data_byte_length INTEGER` to `user_backups` and backfilled existing backup records with `length(data)`. In `handleSyncBackup`, the initial version and size inspection query was optimized to select only `updated_at, updated_at_ms, data_byte_length` rather than the full multi-megabyte `data` column, evaluating the 10% suspicious-shrink guard directly against `data_byte_length` integer. Full `data` is fetched strictly when required to return `serverData` in conflict responses (409 `SYNC_CONFLICT`). Additionally, `issueSession(env, user, options = {})` was refactored to an explicit options object signature (`{ rememberMe: boolean }`), removing legacy positional argument inference (`arg3, arg4`) across `login.js`, `register.js`, and `me.js`.
- **Resale/shop tables** (outpost) live in the same database, avoiding cross-database joins.
- **`nodejs_compat` compatibility flag** enables Node APIs inside workers (e.g., crypto, path).
- **KV usage**: `RATE_LIMIT_KV` in bigworm, `GATEWAY_KV` for API token caching in the landing gateway. Finance and outpost have commented-out KV placeholders.

### 8.4 Scalability Constraints & Write-Lock Risks

The decision to run all four apps against a single Cloudflare D1 (SQLite) instance introduces several production constraints that must be understood before scaling:

| Constraint | Impact |
|-----------|--------|
| **Single-writer model** | D1 is a single-primary SQLite database. Only one write transaction can commit at a time across the entire database, regardless of which app issues it. Concurrent writes from finance, outpost, wayfinder, and bigworm serialize on the same write lock. |
| **Cross-app write contention** | A heavy write burst in one app (e.g., outpost batch imports, finance ledger sync) can delay writes in every other app sharing the database. |
| **Read amplification** | All reads from all apps hit the same D1 instance. Under sustained load, read latency can degrade for every app simultaneously. |
| **No horizontal write scaling** | D1 does not support sharding or multiple primaries. Scaling writes requires migrating to a different storage model (e.g., per-app D1 instances, or a relational database with write replicas). |
| **Schema coupling** | All apps share one schema namespace. A migration for one app (e.g., adding a column to `users`) affects all apps and must be coordinated. |
| **Single point of failure** | A D1 outage or degradation impacts all four apps at once, not just one. |

**Current mitigation (as implemented):**

- The shared `users` table is the only true cross-app dependency; each app's domain tables are logically separate.
- Finance uses IndexedDB as its primary local persistence, with D1 only for auth and cloud vault backup/restore, reducing its write pressure on the shared instance.
- Finance auto-cloud backup is debounced to 5 seconds (5,000ms) on any metadata or ledger cell mutation, with automated bidirectional cloud sync on authenticated load and login to keep multiple devices synchronized seamlessly.
- Bigworm's D1 usage is limited to auth; its operational state lives in Guacamole and KV.

**Future roadmap (not yet implemented):**

- Split domain data into per-app D1 databases, keeping only the shared `users`/auth tables in a single instance.
- Introduce a queue or write-batching layer for high-volume imports (outpost batch import, finance ledger sync).
- Evaluate Cloudflare D1's read replicas or migrate write-heavy workloads to a horizontally scalable store.

---

## 9. Deployment Topology

### 9.1 Routes

| App | Wrangler Route | Worker Name |
|-----|---------------|-------------|
| landing | `techtrekgt.com` + `techtrekgt.com/*` | `techtrek-landing` |
| finance | `techtrekgt.com/finance` + `techtrekgt.com/finance/*` | `techtrek-budget` |
| outpost | `techtrekgt.com/outpost*` + case variants | `techtrek-outpost` |
| vinescout | `techtrekgt.com/vinescout` + `techtrekgt.com/vinescout/*` | `techtrek-vinescout` |
| wayfinder | `techtrekgt.com/wayfinder` + `techtrekgt.com/wayfinder/*` | `techtrek-wayfinder` |
| bigworm | `bigworm.techtrekgt.com` (custom domain) | `techtrek-bigworm` |

### 9.2 Deployment Scripts

Each React app follows:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "npm run build && wrangler dev",
  "deploy": "npm run build && wrangler deploy"
}
```

### 9.3 Build Output

- Vite builds into `dist/client` (configured via `outDir` in `vite.config.js`).
- Wrangler serves this directory via the `ASSETS` binding with `run_worker_first: true` and `not_found_handling: "single-page-application"` to prevent edge static asset interception of worker API routes.
- `finance` and `outpost` use the `@cloudflare/vite-plugin`; `wayfinder` and `bigworm` use plain Vite with outDir set to `dist/client`.

### 9.4 Secrets

Set via `wrangler secret put`:

| Secret | Apps | Purpose |
|--------|------|---------|
| `JWT_SECRET` | all five apps (incl. landing gateway) | Shared SSO signing key |
| `TOKEN_ENCRYPTION_KEY` | `landing` (gateway), `outpost` | Isolated AES-256-GCM encryption key for stored eBay OAuth tokens (PBKDF2 salt `techtrekgt-token-encryption-v2`) |
| `EBAY_CLIENT_ID` | `landing` (gateway), `outpost` | eBay Developer App ID (OAuth Client ID) |
| `EBAY_CLIENT_SECRET` | `landing` (gateway), `outpost` | eBay Developer Cert ID (OAuth Client Secret) |
| `EBAY_RUNAME` | `landing` (gateway), `outpost` | eBay RuName (redirect URI name) for token refresh |
| `SCRAPER_API_KEY` | `landing` (gateway) | Optional Amazon scraper proxy key (moved from outpost) |
| `AMAZON_SCRAPER_URL` | `landing` (gateway) | Optional custom Amazon scraper proxy URL (moved from outpost) |
| `GUACAMOLE_INTERNAL_URL` | bigworm | Internal Guacamole URL |
| `GUAC_USERNAME` / `GUAC_PASSWORD` | bigworm | Guacamole credentials |
| `SYNC_UNLOCK_CODE` | finance | Cloud vault backup passcode |

---

## 10. CI/CD & Automation

### 10.1 Current State: Manual Deployments

**There is no CI/CD pipeline in this repository.** Deployments are performed manually by a developer running `npm run deploy` from each project directory. There is no `.github/` directory, no GitHub Actions workflows, no GitLab CI, and no Jenkins configuration anywhere in the workspace.

The manual deployment flow for each React app is:

```powershell
cd <project>
npm run build        # Vite build -> dist/client
wrangler deploy      # Upload worker + assets to Cloudflare
```

The `landing/` app is deployed the same way via `wrangler deploy` (static assets only, no build step).

### 10.2 Risks of Manual Deployments

| Risk | Impact |
|------|--------|
| No automated build verification | A broken build can be deployed if the developer does not run `npm run build` locally first. |
| No automated tests in the pipeline | Regressions are not caught before reaching production. |
| No rollback automation | Reverting a bad deploy requires manual `wrangler rollback` or re-deploying a previous build. |
| No environment promotion | There is no staging environment; all deploys target production directly. |
| No deployment history | No audit trail of who deployed what and when, beyond Cloudflare's own logs. |

### 10.3 Future Roadmap (Not Yet Implemented)

- Add a GitHub Actions workflow per project (or a matrix workflow) that runs `npm ci`, `npm run build`, and any future test suite on every push and pull request.
- Gate production deploys behind a successful build + test run, triggered on tags or manual approval.
- Introduce a staging worker (e.g., `techtrek-budget-staging`) deployed from a `develop` branch.
- Add `wrangler rollback` documentation and a rollback script for rapid incident response.

---

## 11. Testing Strategy

### 11.1 Current State: No Automated Tests

**There is no automated test infrastructure in this repository.** None of the five projects define a `test` script in their `package.json`, and none include any testing framework (no Vitest, Jest, Playwright, Cypress, Mocha, or Testing Library). No `.test.js`, `.test.jsx`, `.spec.js`, or `.spec.jsx` files exist anywhere in the workspace.

| Project | Test Script | Testing Framework | Test Files |
|---------|-------------|-------------------|------------|
| `finance/` | None | None | None |
| `outpost/` | None | None | None |
| `wayfinder/` | None | None | None |
| `bigworm/` | None | None | None |
| `landing/` | None | None | None |

### 11.2 Verification Today

The only verification performed today is manual:

- **Build verification**: `npm run build` must succeed before `wrangler deploy`.
- **Manual QA**: developers manually exercise the UI and API endpoints in the browser and via `curl`.
- **ErrorBoundary**: finance and outpost render a user-facing error panel on uncaught render errors, which surfaces issues during manual testing.

### 11.3 Future Roadmap (Not Yet Implemented)

- **Unit tests**: Add Vitest (natural fit with the Vite toolchain) for pure logic modules: `utils/formatters.js`, `utils/paydayUtils.js`, `utils/spreadsheetParser.js`, `utils/listingCopyGenerator.js`, and the auth utilities in `functions/utils/auth.js`.
- **Component tests**: Add React Testing Library + jsdom for the smart view components and context providers.
- **Integration tests**: Test the Cloudflare Worker request routing in `src/worker.js` using `wrangler dev` or Miniflare against a local D1 instance.
- **E2E tests**: Add Playwright for critical user journeys (login, dashboard load, ledger entry, outpost invoice import).
- **CI integration**: Wire the test suite into the CI/CD pipeline described in section 10.

---

## 12. Observability & Logging

### 12.1 Current State

Observability is minimal and relies on Cloudflare's built-in platform telemetry rather than custom instrumentation:

| Capability | Status | Details |
|-----------|--------|---------|
| Worker request logs | Enabled | All workers set `"observability": { "enabled": true }` in `wrangler.jsonc`, which enables Cloudflare's Workers Logs (request/response, status codes, exceptions). |
| D1 query logs | Partial | D1 queries appear in Cloudflare's Workers Logs when invoked from a worker, formatted with category tags (e.g. `[SYNC:D1_PUSH]`, `[SYNC:D1_PULL]`). |
| Error surfacing | Client-side only | `ErrorBoundary` components in finance and outpost display errors to the user; worker errors return JSON `{ error: message }` with a 500 status. |
| Client-side categorized debugging | Enabled (`finance`) | Full-spectrum granular categorized debugging system (`src/utils/logger.js`, `DebugConsolePanel.jsx`) with 6 toggleable categories (Sync, Transactions, Matrix, Accounts & Ledgers, Navigation & State, Spreadsheet Import), master toggles, live stream console, and payload inspector. |
| Structured logging | Implemented in Finance | Centralized categorized logger (`logSync`, `logTransaction`, `logMatrix`, `logLedger`, `logState`, `logImport`) with deep payload sanitization, pub/sub subscribers, and localStorage persistence (`trekledger_debug_categories`). |
| Alerting | Not implemented | No automated alerts on worker failures, D1 errors, or elevated error rates. |
| Metrics dashboards | Not implemented | No Grafana, Datadog, or Cloudflare Analytics custom dashboards configured. |

### 12.2 How Failures Are Detected Today

- **Worker exceptions**: Surface in Cloudflare's Workers Logs dashboard (per-worker, per-request).
- **D1 errors**: Surface as 500 responses with JSON error bodies; visible in Workers Logs alongside the request.
- **Client-side render errors**: Caught by `ErrorBoundary` and shown to the user, but not reported to any backend or logging service.
- **Manual monitoring**: A developer must proactively open the Cloudflare dashboard to inspect logs; there is no push-based alerting.

### 12.3 Future Roadmap (Not Yet Implemented)

- Add structured logging to `src/worker.js` with a correlation ID per request (e.g., `X-Request-Id`) and consistent `console.log`/`console.error` payloads.
- Add a `/api/health` endpoint per worker that checks D1 connectivity and returns status for uptime monitoring.
- Configure Cloudflare Workers Logs push to a log sink (e.g., Workers Logpush to R2 or an external service) for retention and analysis.
- Add alerting via Cloudflare's alerting rules or an external uptime monitor (e.g., UptimeRobot, Pingdom) on the `/api/health` endpoints.
- Add client-side error reporting (e.g., a lightweight beacon to a worker endpoint) so `ErrorBoundary` failures are captured centrally.

---

## 13. Security Model

| Control | Implementation |
|---------|---------------|
| Password hashing | PBKDF2-SHA256, 310k iterations, per-user salt |
| Session transport | HttpOnly cookies, `credentials: 'include'` |
| CSP | `default-src 'self'`; no inline scripts; style-src allows `'unsafe-inline'` for Tailwind |
| HSTS | Enabled on non-localhost responses |
| Frame protection | `X-Frame-Options: DENY` |
| CORS | Whitelist: `https://techtrekgt.com`, localhost dev ports |
| Rate limiting | KV-backed (bigworm); placeholder in finance/outpost |
| HTTPS redirect | Every worker forces HTTPS except localhost |
| Permissions-Policy | Blocks camera, microphone, geolocation, payment |

---

## 14. Development Workflow

### 14.1 Local Environment Setup

Each project reads local secrets from a `.dev.vars` file (git-ignored) that is loaded by Wrangler during `wrangler dev`. The `.dev.vars` file must never be committed to source control. Template files (`.dev.vars.example`) are committed for reference.

**Setup steps per project:**

1. Copy the committed template to a local `.dev.vars` file:
   ```powershell
   cd <project>
   copy .dev.vars.example .dev.vars
   ```
2. Edit `.dev.vars` and set real values. The `JWT_SECRET` must match the value used by the other apps so the shared SSO cookie works across all of them during local development.
3. Run `npm run dev` (or `wrangler dev` for the worker).

**Local secrets by project:**

| Project | `.dev.vars.example` | Required Keys |
|---------|---------------------|---------------|
| `finance/` | `.dev.vars.example` | `JWT_SECRET`, `CODE_HMAC_SECRET`, `SYNC_UNLOCK_CODE` |
| `outpost/` | `.dev.vars.example` | `JWT_SECRET`, `SYNC_UNLOCK_CODE` |
| `wayfinder/` | `.dev.vars.example` | `JWT_SECRET`, `GEOAPIFY_API_KEY`, `GOOGLE_MAPS_API_KEY` |
| `bigworm/` | `.dev.vars.example` | `JWT_SECRET`, `GUACAMOLE_INTERNAL_URL`, `GUAC_USERNAME`, `GUAC_PASSWORD` |

> Note: The `outpost/.dev.vars.example` explicitly instructs copying the `JWT_SECRET` from the finance `.dev.vars` so the shared auth cookie works across both apps. `CODE_HMAC_SECRET` is a dedicated secret for transient OTP code HMAC generation and verification in `finance/`.

### 14.2 Standard Workflow

1. **Local dev**: Run from each project directory. Dev ports as defined in `vite.config.js` (or `wrangler dev` for landing):

   | App | Command | Local URL |
   |-----|---------|----------|
   | `landing/` | `wrangler dev` | `http://localhost:8787` |
   | `finance/` | `npm run dev` | `http://localhost:3000` |
   | `outpost/` | `npm run dev` | `http://localhost:3001` |
   | `wayfinder/` | `npm run dev` | `http://localhost:5174` |
   | `vinescout/` | `npm run dev` | `http://localhost:5175` |
   | `bigworm/` | `npm run dev` | `http://localhost:5173` |

2. **Local database**: `wrangler d1 execute personal-budget-db --local` (or `npm run db:migrate:local` in outpost).
3. **Production deploy**: `npm run deploy` (build + wrangler deploy). Landing uses `wrangler deploy` directly.
4. **Database migration**: `npm run db:migrate` in outpost; other apps use `wrangler d1 execute --file=./schema.sql`.

---

## 15. Cross-Cutting Conventions

- **No TypeScript**: all source is plain JavaScript (JSX) with occasional `// @ts-nocheck` directives.
- **No CSS-in-JS**: no styled-components or inline `style` props in React components.
- **No router library**: hand-rolled history-based navigation.
- **No state library**: React Context + hooks only.
- **Deployment**: Cloudflare Workers + D1 + static assets via Wrangler.
- **API convention**: Pages-Functions-style `onRequest{Verb}` handlers in `functions/api/`.
- **Auth convention**: shared JWT secret + HttpOnly cookie sessions across all four apps.