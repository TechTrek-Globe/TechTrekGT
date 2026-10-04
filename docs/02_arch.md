# TechTrekGT Platform Architecture and Infrastructure

## 1. Multi-Worker Architecture and Monorepo Package Isolation

TechTrekGT utilizes a multi-worker serverless architecture hosted on the Cloudflare edge runtime. Rather than deploying a monolithic service or relying on complex microservice orchestrators, each application in the ecosystem functions as an independent, fully autonomous package.

### 1.1 Isolated Monorepo Package Model

The repository contains no root-level package.json, no shared node_modules directory, and no workspace orchestration tooling (such as npm, yarn, or pnpm workspaces). Each application directory manages its own build and runtime dependencies in total isolation:

- Autonomous Package Configuration: Every application maintains its own package.json defining exact dependency versions, build scripts, and local configurations.
- Independent Build Tooling: React applications configure their own Vite instances via vite.config.js, avoiding shared bundler configurations.
- Isolated Node Modules: Installing or updating dependencies in one project directory (e.g. outpost/) has zero impact on other project directories (e.g. finance/ or wayfinder/).
- Command Execution Standard: Developers and automation scripts must navigate (cd) into the specific project directory before executing npm, Vite, or Wrangler commands.

### 1.2 Worker Runtime Standard

All backend services execute as Cloudflare Workers using the ES Modules (ESM) export syntax. Each Worker exports a default object implementing the standard fetch handler:

```javascript
export default {
  async fetch(request, env, ctx) {
    // 1. Force HTTPS redirect (excluding localhost)
    // 2. Handle OPTIONS preflight requests for CORS
    // 3. Apply standard security headers
    // 4. Validate session credentials and origin
    // 5. Match and dispatch API routes
    // 6. Fall back to static assets or SPA index.html
  }
};
```

Runtime settings across all Workers include:
- Compatibility Flag: nodejs_compat enabled to support Node.js standard libraries (such as crypto and buffer).
- Compatibility Date: Anchored to modern edge runtimes (2026-08-01 or 2024-09-23).
- Observability: Configured with observability: { enabled: true } to stream request metrics, status codes, and exceptions directly to Cloudflare Workers Logs.

## 2. Central Gateway Routing and Service Communication

The TechTrekGT ecosystem uses a centralized gateway architecture hosted within the Landing Worker ([landing/src/worker.js](file:///e:/TechTrekGT/landing/src/worker.js)) to manage external integrations, shared proxy services, and unified cross-application communication.

### 2.1 Central Gateway Ingress

The Landing Worker executes at the apex domain (techtrekgt.com) with the wildcard route techtrekgt.com/*. By setting run_worker_first: true in [landing/wrangler.jsonc](file:///e:/TechTrekGT/landing/wrangler.jsonc), incoming requests hit the Worker entry point before static assets:

- Un-Prefixed /api/* Routing: Requests matching /api/* are intercepted by the Central Gateway router in [landing/src/gateway/](file:///e:/TechTrekGT/landing/src/gateway/).
- Shared SSO Authentication: Gateway endpoints validate the incoming session cookie (auth_token) against the shared JWT_SECRET.
- Static Asset Resolution: Requests not matching /api/* routes fall back to Cloudflare ASSETS, serving the marketing site and static landing pages.

### 2.2 External Service Proxies

Third-party external API integrations are centralized in the Landing Gateway to eliminate duplicated credentials and centralize rate limit budgets:

- eBay REST API Services: Proxies market comp searches (/api/ebay/comps), manages OAuth authorization handshakes (/api/ebay/oauth/*), verifies webhook cryptographic signatures (/api/ebay/webhook), and coordinates transaction fee lookups (/api/ebay/finances).
- Amazon Scraping Services: Proxies product metadata lookups (/api/amazon/fetch) using multi-tier fallback cascades across external scrapers and direct edge fetching.
- Future Travel API Proxies: Planned migration of Google Places venue queries (/api/places/search) and Geoapify POI lookups (/api/geo/places).

### 2.3 Cross-Service Communication Rules

- Gateway Invocations: Sub-applications invoke gateway endpoints using absolute URLs (https://techtrekgt.com/api/...) with credentials: 'include'.
- Application-Specific Backend API Scoping: Endpoints unique to a satellite application must be scoped under their application subpath (e.g. /finance/api/*, /outpost/api/*, /bourbon/api/*) to avoid collision with the Landing Gateway's un-prefixed /api/* namespace.

## 3. Shared Cloudflare D1 SQLite Database

Applications requiring relational persistence bind a shared Cloudflare D1 SQLite database instance named personal-budget-db (ID: 10f220d4-1c10-49e9-b63e-5d4cb08d599f):

```jsonc
// wrangler.jsonc D1 configuration
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "personal-budget-db",
    "database_id": "10f220d4-1c10-49e9-b63e-5d4cb08d599f"
  }
]
```

### 3.1 Single-Writer Architecture and Concurrency Constraints

Cloudflare D1 is built on a single-primary SQLite engine. While reads can scale across edge replicas, all write transactions serialize on a single primary coordinator. Concurrent writes across different applications contend for the same global database lock.

To maintain performance and prevent lock starvation, the platform enforces strict mitigations:
- Client-Side Primary Storage (Finance OS): Finance OS persists ledger transactions primarily in browser IndexedDB, using D1 strictly for authentication and debounced (5,000ms) cloud vault backups.
- Bounded Batch Concurrency (Outpost): Multi-item synchronization routines bound concurrency to three simultaneous tasks (CONCURRENCY_LIMIT = 3) with brief inter-batch delays (DELAY_MS = 100).
- Static Travel Catalog (Wayfinder): Core travel itineraries and POI data are bundled as static datasets ([wayfinder/src/data/poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js)), eliminating D1 read and write pressure during travel browsing.
- Authentication-Only Access (BigWorm): BigWorm limits D1 queries exclusively to user authentication and session validation.
- Specialized Cache Architecture (Bourbon): While Bourbon binds personal-budget-db for platform alignment, it maintains no tables in D1. Bourbon ingests catalog data directly from a Google Sheet CSV feed, caching responses in Cloudflare Cache API (caches.default) with a 300-second TTL and static JSON fallbacks.

### 3.2 SQL Parameterization Standard

All SQL statements executed against D1 must strictly use parameterized queries:

```javascript
// Correct parameterization standard
const result = await db.prepare(
  'SELECT id, email, status FROM users WHERE id = ? AND status = ?'
).bind(userId, 'Active').first();
```

String interpolation and template literals inside SQL statements are strictly forbidden across the codebase to guarantee total defense against SQL injection vulnerabilities.

### 3.3 Atomic Batching and Compensating Rollback Patterns

- Atomic Batch Execution: Multi-statement operations executing within a single tick use env.DB.batch([...]) to guarantee atomic all-or-nothing execution at the SQLite engine level.
- Compensating Rollback Pattern: Because Cloudflare D1 does not support long-lived interactive multi-statement transactions across asynchronous network boundaries, complex workflows (such as item intake, sale reconciliation, and invoice generation) implement explicit compensating actions inside catch blocks to reverse intermediate mutations if a subsequent step fails.

## 4. Isolated Wrangler Deployment Specifications

Each application maintains an independent Wrangler configuration ([wrangler.jsonc](file:///e:/TechTrekGT/landing/wrangler.jsonc)) defining its routes, asset bindings, environment variables, and deployment settings.

### 4.1 Deployment Specifications Matrix

| Application | Project Directory | Worker Name | Route Binding | Asset Directory |
|-------------|-------------------|-------------|---------------|-----------------|
| Landing Hub | landing/ | techtrek-landing | techtrekgt.com and techtrekgt.com/* | ./public |
| Finance OS | finance/ | techtrek-budget | techtrekgt.com/finance and techtrekgt.com/finance/* | ./dist/client |
| Outpost Tracker | outpost/ | techtrek-outpost | techtrekgt.com/outpost* (plus aliases) | ./dist/client |
| VineScout | vinescout/ | techtrek-vinescout | techtrekgt.com/vinescout and techtrekgt.com/vinescout/* | ./dist/client |
| Wayfinder | wayfinder/ | techtrek-wayfinder | techtrekgt.com/wayfinder and techtrekgt.com/wayfinder/* | ./dist/client |
| BigWorm Portal | bigworm/ | techtrek-bigworm | bigworm.techtrekgt.com | ./dist/client |
| Bourbon Sommelier | bourbon/ | techtrek-bourbon | techtrekgt.com/bourbon and techtrekgt.com/bourbon/* | ./dist/client |

### 4.2 Build and Deployment Lifecycle

Standard React applications follow a two-step compilation and deployment cycle:

1. Static Bundle Compilation: Vite compiles JSX and assets into dist/client via npm run build.
2. Worker Deployment: Cloudflare Wrangler packages the compiled assets alongside src/worker.js and deploys them to the Cloudflare edge network via wrangler deploy.

In all React applications, wrangler.jsonc specifies:
- run_worker_first: true to ensure the Worker handles API requests and security policies before static asset evaluation.
- not_found_handling: "single-page-application" to redirect unmatched client routes to index.html for custom client-side history routing.

### 4.3 Production Secrets Management

Production credentials are provisioned directly to Cloudflare Workers using the Wrangler CLI (wrangler secret put <KEY>):

- JWT_SECRET: Shared SSO signing secret provisioned across all Worker environments.
- TOKEN_ENCRYPTION_KEY: Dedicated AES-256-GCM encryption key for stored OAuth tokens.
- EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_RUNAME: Developer credentials for eBay Sell API access.
- SCRAPER_API_KEY: Optional proxy key for external scraping cascades.
- GUACAMOLE_INTERNAL_URL / GUAC_USERNAME / GUAC_PASSWORD: Internal connection secrets for BigWorm.
- SYNC_UNLOCK_CODE: Dedicated authorization code for cloud vault backup operations.

### 4.4 Local Development Configuration (.dev.vars)

Local development secrets are stored in a .dev.vars file within each project root. These files are strictly git-ignored and never committed to version control. To ensure local SSO functionality across applications running on different localhost ports, all .dev.vars files must share an identical JWT_SECRET value.
