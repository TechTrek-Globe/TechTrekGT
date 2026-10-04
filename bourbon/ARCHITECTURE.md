# TechTrekGT: Bourbon Sommelier Architecture

## 1. Overview and Stack

Bourbon is the Sprig Bourbon Sommelier and Unicorn Finder (Brown Water Society) application in the TechTrekGT platform, hosted at `techtrekgt.com/bourbon/*`.

| Layer | Technology | Details |
|---|---|---|
| Frontend | React 19 | Pure JavaScript / JSX functional components and hooks |
| Build Tool | Vite 6 | Vite static build outputting client bundle to `dist/client` |
| Styling | Tailwind CSS 3.4 | Custom theme with amber, brass, and smoke color palettes |
| Icons | lucide-react | Glassware, filter, search, navigation, and badge icons |
| Runtime | Cloudflare Workers (ESM) | `src/worker.js` entry point with Cache API proxy and SPA asset fallback |
| Persistence | External Google Sheet + Static Seed | Sprig Google Sheet CSV feed with local catalog seed fallback |
| Database Binding | Cloudflare D1 (SQLite) | `personal-budget-db` bound via `wrangler.jsonc` for ecosystem alignment |

---

## 2. Isolated Monorepo Package Topology

The TechTrekGT repository operates as a collection of strictly isolated monorepo packages without a shared node_modules directory.

- Independent Package: Bourbon maintains its own isolated `package.json`, its own dedicated `node_modules` folder, and independent lockfiles.
- No Workspace Orchestration: There is no root-level package manifest, and no package manager workspaces (such as npm, yarn, or pnpm workspaces) are configured.
- Execution Boundary: All dependency installations (`npm install`), builds (`npm run build`), linting (`npm run lint`), and deployment triggers (`npm run deploy`) must be executed directly from the `bourbon/` directory.

---

## 3. Data Architecture and Ingestion Model

The Bourbon application does not use Cloudflare D1 for catalog data storage or retrieval.

- Primary Data Ingestion: Catalog data is fetched directly from the Sprig Google Sheet via the public Google Visualization (gviz) CSV endpoint.
- Edge Cache Proxy: If direct client fetches are blocked or throttled, requests fall back to the worker proxy route (`/bourbon/api/bourbon/data`). The worker uses the Cloudflare Cache API (`caches.default`) to cache the CSV payload for 300 seconds (5 minutes), shielding Google Sheets from rate limits.
- Static Seed Resilience: In the event of network disruption or upstream schema changes, client hydration falls back to `catalogSeed.json`, guaranteeing offline and failure-resistant rendering.
- D1 Database Role: Although `bourbon/wrangler.jsonc` defines a `d1_databases` binding for `personal-budget-db` (`env.DB`) to conform with platform baseline configurations, Bourbon defines no D1 tables and executes no SQL transactions during standard runtime operations.

---

## 4. Routing and Gateway Runtime Dependency

### 4.1 Route Mounting and Worker Dispatch

Bourbon is deployed as an independent Cloudflare Worker (`techtrek-bourbon`) configured with the following route patterns:
- `techtrekgt.com/bourbon`
- `techtrekgt.com/bourbon/*`

The worker entry point (`src/worker.js`) performs prefix normalization:
- Strips the leading `/bourbon` path segment.
- Matches normalized routes such as `/api/health` and `/api/bourbon/data`.
- Serves static assets from `env.ASSETS` (`dist/client`) for non-API requests.
- Falls back to `index.html` for single-page client routing.

### 4.2 Strict Runtime Dependency on Landing Hub Worker

The platform utilizes a centralized API routing topology governed by the Landing Hub worker (`techtrek-landing`):
- Landing Routing Scope: The Landing worker is mounted on `techtrekgt.com` and `techtrekgt.com/*`.
- Cloudflare Route Dispatch: Cloudflare Workers dispatch incoming traffic according to route specificity. Requests beginning with `techtrekgt.com/bourbon/*` route to the Bourbon worker. However, requests dispatched to root-level `/api/*` bypass the Bourbon worker completely and hit the Landing Gateway.
- Centralized Gateway Responsibility: The Landing Hub worker acts as the central API proxy for external integrations, including eBay REST services and Amazon scrapers.
- Sub-App Routing Constraint: Any API call originating from Bourbon that targets `/api/*` instead of `/bourbon/api/*` depends strictly on the Landing Hub worker to resolve. If an un-prefixed endpoint is not registered in `landing/src/worker.js`, the Landing Gateway returns a 404 response (`Gateway endpoint not found`). Consequently, Bourbon client requests must preserve the `/bourbon/api/*` namespace for application-level worker endpoints.

---

## 5. Development and Deployment Lifecycle

### 5.1 Local Development

Run from the `bourbon/` directory:
- Development Server: `npm run dev` (starts Vite dev server on `http://localhost:5176`).
- Linter: `npm run lint` (runs oxlint checks).
- Local Worker Preview: `npm run preview`.

### 5.2 Production Build and Deployment

Deployment requires compiling client assets and publishing worker code through Wrangler:
1. Build: `npm run build` compiles React 19 JSX and Tailwind CSS into `dist/client`.
2. Deploy: `npm run deploy` invokes `vite build && wrangler deploy`, uploading worker bundle and static assets to Cloudflare edge locations.
3. Verification: Endpoint health can be verified via `https://techtrekgt.com/bourbon/api/health`.
