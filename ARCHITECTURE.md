# TechTrekGT - Architecture Document

## 1. Overview

TechTrekGT is a multi-application platform hosted on `techtrekgt.com`. The repository is a collection of five self-contained projects, each deployed independently as a Cloudflare Worker, sharing a common D1 SQLite database and a single sign-on (SSO) JWT secret. There is no root-level workspace manifest; each project manages its own dependencies, build, and deployment.

**`landing/` is the primary domain root.** It serves `techtrekgt.com` directly as a static Cloudflare Worker. All other apps are independently deployed Workers mounted at sub-paths or sub-domains and are linked from the landing hub.

| Project | Purpose | Route | Stack |
|---------|---------|-------|-------|
| `landing/` | **Primary domain root** - platform hub / marketing page | `techtrekgt.com` *(Main Site)* | Static HTML/CSS/JS |
| `finance/` | Personal budget tracker | `techtrekgt.com/finance/*` | React 19 + Vite + Cloudflare Workers |
| `outpost/` | Resale / auction operations tracker | `techtrekgt.com/outpost/*` | React 19 + Vite + Cloudflare Workers |
| `wayfinder/` | Poland Christmas 2026 travel guide | `techtrekgt.com/wayfinder/*` | React 19 + Vite + Cloudflare Workers |
| `bigworm/` | Secure remote desktop portal (Guacamole) | `bigworm.techtrekgt.com` *(sub-domain)* | React 19 + Vite + Cloudflare Workers |

---

## 2. Tech Stack Overview

### 2.1 Shared Frontend Stack (finance, outpost, wayfinder, bigworm)

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
| Auth | Custom JWT (HS256) + PBKDF2-SHA256 | WebCrypto-based, 310k iterations |
| Sessions | HttpOnly cookies | `credentials: 'include'` on all fetch calls |
| Deploy | Wrangler 3/4 | `wrangler.jsonc` per project |
| Networking | Cloudflare Tunnel | Used by bigworm to reach Guacamole |

### 2.3 Landing Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Static HTML5 + CSS3 + vanilla JS | No framework, no build step |
| Styling | Hand-written CSS with custom properties | Dark space theme with amber accents |
| Deployment | Cloudflare Workers static assets | Served at the `techtrekgt.com` root |

### 2.4 External API Integrations, Lookup Services & Dual Verification Standard

| Service | Primary App | Purpose |
|---------|-------------|---------|
| **Google Places & Maps API** | `wayfinder` | Live venue details, ratings, photography, neighborhood & hotel lookup queries, coordinate navigation links, and mandatory dual verification |
| **Geoapify API** | `wayfinder` | Primary POI generation, geocoding, and venue coordinate dual verification |
| **National Bank of Poland (NBP) API** | `wayfinder` | Real-time PLN/USD and PLN/EUR exchange rates via worker proxy |

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
| `finance/` | `src/components/`, `src/context/`, `src/utils/`, `src/assets/` | 4 context providers, 13 components |
| `wayfinder/` | `src/components/city/`, `src/data/`, `src/hooks/`, `functions/api/wayfinder/` | 10 city tab sub-components, `data/poland-2026.js` static dataset, `hooks/useExchangeRate.js`, D1 wayfinder APIs |
| `outpost/` | `functions/api/` (largest) | invoices, items, sales, platforms, comps, supplies, reports, sync, import |
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
| `/wayfinder/poland-christmas-2026/route` or `/rail` | `RouteVisualization` | Rail route map & transit timings |
| `/wayfinder/poland-christmas-2026/markets` | `MarketsPage` | Christmas market directory & culinary highlights |
| `/wayfinder/poland-christmas-2026/stays-and-food` | `StaysAndFoodPage` | Neighborhood lodging base zones & food targets (no unbooked hotel listings) |
| `/wayfinder/poland-christmas-2026/practical` | `PracticalPage` | Practical travel, currency, packing & daylight info |
| `/wayfinder/poland-christmas-2026/cities/:cityId/:subPage` | `CityPage` | Per-city guides (overview, history, attractions, markets, restaurants, hotels [neighborhood base overview & Google Maps lookup], lgbtq) |
| `/wayfinder/poland-christmas-2026/private*` | `PrivateHub` | Auth-gated itinerary (including private booked hotels) & travel documents |
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

- `finance/src/worker.js`: strips `/finance` prefix, routes `/api/auth/*` + sync endpoints, rewrites `/finance/assets/*`, SPA-falls-back all other `/finance/*` to `/`.
- `outpost/src/worker.js`: same pattern plus case-insensitive redirect of `/Outpost` and `/auction` to lowercase `/outpost`.
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
| `outpost` | `AuthProvider` | Single auth context; views fetch their own data via API |
| `wayfinder` | `AuthProvider`, `SettingsContext`, `WayfinderContext` | Auth + settings + itinerary/documents/jobs |
| `bigworm` | `AuthProvider` | Single auth context gating GuacamoleView |

### 5.2 Auth Flow (Shared Across Apps)

All four React apps share the same auth design:

1. **Login/register** POST to `/api/auth/login` (or `/register`) with `fetch(..., { credentials: 'include' })`.
2. **HttpOnly cookies** carry the JWT session. No tokens stored in `localStorage`.
3. **Session check** on app load via `/api/auth/me`.
4. **Inactivity timeout**: 15-minute timer, reset on `mousedown` / `keydown` / `mousemove` activity.
5. **Offline fallback** (finance only): if the network fails and email/password are provided, a local-only user session is created, enabling local-first usage.

**Backend auth utilities** (`functions/utils/auth.js` in each app):

- `hashPassword(password)` - PBKDF2-SHA256, 310k iterations, salted.
- `verifyPassword(password, storedHash)` - supports legacy 2-part and current 3-part hash formats.
- `verifyToken(token, env)` - HS256 JWT verification via WebCrypto.
- `getTokenFromRequest(request)` - extracts JWT from cookie or `Authorization: Bearer` header.

**SSO:** All four apps share the same `JWT_SECRET` secret and the same `users` table in the shared D1 database, so a login in one app works across all.

### 5.3 Finance State Architecture

```
<App>
  └── <AuthProvider>
      └── <BudgetMetadataProvider>        # accounts, people, bills, loans, widgets, theme
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

**Persistence layers (finance):**

| Layer | Technology | Purpose |
|-------|-----------|---------|
| IndexedDB | `utils/indexedDB.js` | Primary local persistence (get/set budget data) |
| localStorage | Legacy key `personal_budget_app_data_v1` | Migration fallback for older data |
| Cloudflare D1 | `user_backups` table | Cloud vault backup/restore via `/api/sync/backup` and `/api/sync/restore` |
| API | Auth endpoints | User accounts, password reset, profile |

### 5.4 Data Fetching Patterns

- **Direct `fetch`** with `credentials: 'include'` for all authenticated API calls.
- **Context-level fetch functions** (e.g., `WayfinderContext.fetchItinerary()`, `fetchDocuments()`, `fetchJobs()`) that populate provider state.
- **Custom hooks** for async data: `wayfinder/src/hooks/useExchangeRate.js`.
- **Cloud sync** (finance): `SYNC_UNLOCK_CODE` passcode guard protects `/api/sync/backup` and `/api/sync/restore`.
- **Batch import** (outpost): `/api/import/batch` for Excel/CSV payloads.
- **Spreadsheet reconciliation** (finance): Row-by-row merge engine with comment matching and automated account reconciliation via `matching_key` / bank document matching keys on `bills`.

---

## 6. Component Architecture

### 6.1 Smart vs. Dumb Components

The codebase follows a pragmatic split:

**Smart (container) components** - live in `components/`, consume context hooks, orchestrate data and view state:

| App | Smart Components |
|-----|-----------------|
| finance | `DashboardView`, `MainBudgetView`, `LedgerView`, `AmortizationView`, `SettingsView`, `LandingPage`, `AuthPage` |
| outpost | `DashboardView`, `InventoryView`, `SalesLogView`, `PricingIntelligenceView`, `SettingsView` |
| wayfinder | `CityPage`, `MarketsPage`, `StaysAndFoodPage`, `PracticalPage`, `PrivateHub`, `PolandLanding` |
| bigworm | `AuthPage`, `GuacamoleView` |

**Dumb / presentational (or focused) components** - render UI from props:

| App | Components |
|-----|-----------|
| finance | `AccountLedgerView`, `AccountTransferSummary`, `InlineEdit`, `NoYearCalendarPicker`, `SpreadsheetImporter` |
| wayfinder | `AttractionCard`, `MustSeeCard`, `UrgentBookingAlert`, `WinterExclusive`, `Formatters`, `CurrencyConverterModal` |
| outpost | `AddInvoiceModal`, `LogSaleModal`, `ListingCopyModal`, `TaxReportModal`, `SuppliesTrackerModal`, `FinanceSyncModal`, `CardShowCalculatorModal` |

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
| `finance/schema.sql` | finance + shared | `users`, `households`, `household_members`, `accounts`, `people`, `bills`, `bill_splits`, `line_items`, `loans`, `household_settings`, `user_backups` |
| `outpost/auction-schema.sql` | outpost | invoices, items, sales, platforms, comps, supplies, etc. |
| `wayfinder/schema-wayfinder.sql` | wayfinder | journeys, itinerary items, documents, import jobs, budgets |

### 8.3 Key Design Points

- **Shared `users` table**: the auth system is common, so registration in one app enables login across all.
- **Resale/shop tables** (outpost) live in the same database, avoiding cross-database joins.
- **`nodejs_compat` compatibility flag** enables Node APIs inside workers (e.g., crypto, path).
- **KV** is used for rate limiting in bigworm (`RATE_LIMIT_KV`); finance and outpost have commented-out KV placeholders.

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
- Finance auto-cloud backup is debounced to 45 seconds (45,000ms) with a financial data checksum guard to prevent rapid write locking on the shared D1 instance during continuous cell editing.
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
- Wrangler serves this directory via the `ASSETS` binding with `not_found_handling: "single-page-application"` for SPA routing.
- `finance` and `outpost` use the `@cloudflare/vite-plugin`; `wayfinder` and `bigworm` use plain Vite with outDir set to `dist/client`.

### 9.4 Secrets

Set via `wrangler secret put`:

| Secret | Apps | Purpose |
|--------|------|---------|
| `JWT_SECRET` | all four React apps | Shared SSO signing key |
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
| D1 query logs | Partial | D1 queries appear in Cloudflare's Workers Logs when invoked from a worker, but there is no dedicated D1 dashboard or custom query logging. |
| Error surfacing | Client-side only | `ErrorBoundary` components in finance and outpost display errors to the user; worker errors return JSON `{ error: message }` with a 500 status. |
| Client-side debug logging | Enabled (`finance`) | In-app real-time debug console in Settings with toggle, filtering, export, and execution telemetry for spreadsheet/CSV parsing and reconciliation. |
| Structured logging | Not implemented | No `console.log`/`console.error` instrumentation strategy, no log correlation IDs, no request tracing. |
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
| `finance/` | (uses local `.dev.vars`; no committed example) | `JWT_SECRET`, `SYNC_UNLOCK_CODE` |
| `outpost/` | `.dev.vars.example` | `JWT_SECRET`, `SYNC_UNLOCK_CODE` |
| `wayfinder/` | `.dev.vars.example` | `JWT_SECRET`, `GEOAPIFY_API_KEY`, `GOOGLE_MAPS_API_KEY` |
| `bigworm/` | `.dev.vars.example` | `JWT_SECRET`, `GUACAMOLE_INTERNAL_URL`, `GUAC_USERNAME`, `GUAC_PASSWORD` |

> Note: `finance/` has a local `.dev.vars` but no committed `.dev.vars.example`. The `outpost/.dev.vars.example` explicitly instructs copying the `JWT_SECRET` from the finance `.dev.vars` so the shared auth cookie works across both apps.

### 14.2 Standard Workflow

1. **Local dev**: Run from each project directory. Dev ports as defined in `vite.config.js` (or `wrangler dev` for landing):

   | App | Command | Local URL |
   |-----|---------|----------|
   | `landing/` | `wrangler dev` | `http://localhost:8787` |
   | `finance/` | `npm run dev` | `http://localhost:3000` |
   | `outpost/` | `npm run dev` | `http://localhost:3001` |
   | `wayfinder/` | `npm run dev` | `http://localhost:5174` |
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