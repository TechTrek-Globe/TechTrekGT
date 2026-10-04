# Sprig Bourbon Sommelier - Technical Architecture and Infrastructure

## 1. Frontend Technology Stack

Bourbon Sommelier is built as a single-page web application executing pure JavaScript without TypeScript compilation overhead:

- Core Framework: React 19 (^19.0.0) with react-dom (^19.0.0). Built using functional components, standard hooks (useState, useEffect, useReducer, useMemo, useCallback), and React Context.
- Build Toolchain: Vite 6 (^6.0.7) configured via [bourbon/vite.config.js](file:///e:/TechTrekGT/bourbon/vite.config.js). Uses @vitejs/plugin-react (^4.3.4), scopes the base path to /bourbon/, and compiles static assets to dist/client.
- Styling Framework: Tailwind CSS 3.4 (^3.4.17) with PostCSS (^8.5.1). Incorporates custom amber, brass, and dark oak color tokens in [bourbon/tailwind.config.js](file:///e:/TechTrekGT/bourbon/tailwind.config.js) and custom scrollbar utilities in [bourbon/src/index.css](file:///e:/TechTrekGT/bourbon/src/index.css).
- Iconography: lucide-react (^0.474.0) for glassware, filters, search badges, sliders, and navigation controls.
- Code Quality: oxlint configured via [bourbon/.oxlintrc.json](file:///e:/TechTrekGT/bourbon/.oxlintrc.json) for high-speed JavaScript linting.

## 2. Client-Side Screen Architecture

Bourbon Sommelier implements clean screen-based navigation governed by state in [bourbon/src/context/BourbonContext.jsx](file:///e:/TechTrekGT/bourbon/src/context/BourbonContext.jsx):

- Tab Navigation: Switches between four core views without browser page reloads:
  - Radar Screen: Curated highlight grid showcasing allocated bottles and top unicorn value scores in [bourbon/src/screens/RadarScreen.jsx](file:///e:/TechTrekGT/bourbon/src/screens/RadarScreen.jsx).
  - Explorer Screen: Full tabular catalog with comprehensive sorting, multi-attribute filtering, and pagination in [bourbon/src/screens/ExplorerScreen.jsx](file:///e:/TechTrekGT/bourbon/src/screens/ExplorerScreen.jsx).
  - Search Screen: Instant, fuzzy text search across bottle names, distilleries, mashbills, and tasting notes in [bourbon/src/screens/SearchScreen.jsx](file:///e:/TechTrekGT/bourbon/src/screens/SearchScreen.jsx).
  - Sommelier Screen: Guided interactive recommendation wizard matching budget and flavor preferences in [bourbon/src/screens/SommelierScreen.jsx](file:///e:/TechTrekGT/bourbon/src/screens/SommelierScreen.jsx).
- Modal Architecture: Detailed bottle inspection drawer (BottleDetailModal) presenting mashbill breakdowns, MSRP comparisons, and distillery profiles upon item selection.

## 3. Serverless Edge Worker Architecture (src/worker.js)

Bourbon executes on the Cloudflare edge runtime as an ESM Worker defined in [bourbon/src/worker.js](file:///e:/TechTrekGT/bourbon/src/worker.js) and configured by [bourbon/wrangler.jsonc](file:///e:/TechTrekGT/bourbon/wrangler.jsonc):

- Subpath Route Binding: Configured for techtrekgt.com/bourbon and techtrekgt.com/bourbon/*.
- Assets Pipeline: ASSETS binding pointed to ./dist/client with run_worker_first: true.
- Subpath Prefix Stripping: The worker strips the leading /bourbon path segment to normalize routes before evaluation:
  - /api/bourbon/health and /api/health return JSON health and timestamp telemetry.
  - /api/bourbon/data and /api/data trigger the edge-cached Google Sheet CSV proxy.
- Static Asset Fallback: Requests that do not match API routes fall back to env.ASSETS.fetch, serving the compiled React client bundle from dist/client.

## 4. Edge Cache API Proxy Architecture

To eliminate upstream rate limiting from Google Sheets while maintaining rapid client response times, the worker implements the Cloudflare Cache API:

- Upstream CSV Feed: Points to the public Google Visualization endpoint for the Sprig inventory spreadsheet (sheet ID: 1XfZCAILlqCNuPkpAJ3alZc8XOBMFu4M24dH-mTrhlrA).
- Cache Matching: When /api/bourbon/data is requested, the worker checks caches.default using a GET cache key.
- Edge TTL: If a cache miss occurs, the worker fetches the raw CSV from Google, returning it with Cache-Control: public, max-age=300, s-maxage=300. This caches the CSV payload across Cloudflare global edge data centers for 5 minutes (300 seconds).
- Upstream Shielding: High-volume client traffic hits Cloudflare edge cache replicas rather than hammering Google Sheets servers.

## 5. Strict Runtime Dependency on Landing Hub Gateway

Bourbon operates within the centralized routing topology of TechTrekGT:

- Cloudflare Ingress Precedence: Requests targeting techtrekgt.com/bourbon/* route specifically to the Bourbon Worker.
- Landing Gateway Interception: Requests dispatched to root-level /api/* bypass the Bourbon worker and route directly to the Landing Hub Gateway (techtrek-landing).
- Namespace Isolation Mandate: Any internal API endpoints implemented specifically for Bourbon must be scoped under the /bourbon/api/* namespace. Submitting requests to un-prefixed /api/endpoints will fail with HTTP 404 from the Landing Gateway unless explicitly configured there.

## 6. Shared Database Binding Baseline

To maintain platform configuration symmetry across all repository projects, [bourbon/wrangler.jsonc](file:///e:/TechTrekGT/bourbon/wrangler.jsonc) binds the shared Cloudflare D1 database:

- D1 Binding: Bound as env.DB pointing to personal-budget-db (database id: 10f220d4-1c10-49e9-b63e-5d4cb08d599f).
- Operational Scope: Bourbon does not read or write D1 relational tables during standard runtime operations, as catalog data is sourced entirely via the Google Sheet sync engine and seed data.
