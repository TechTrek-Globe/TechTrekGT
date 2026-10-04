# Outpost Tracker - Technical Architecture & Infrastructure

## 1. Frontend Technology Stack

Outpost Tracker is constructed as a high-performance single-page web application executing pure JavaScript without TypeScript compilation overhead:

- Core Framework: React 19 (^19.0.0) with react-dom (^19.0.0). Built entirely using modern function components, React Context, and standard hooks. Error boundaries are encapsulated in resilient class components.
- Build Toolchain: Vite 6 (^6.0.7) configured via [outpost/vite.config.js](file:///e:/TechTrekGT/outpost/vite.config.js). Uses @vitejs/plugin-react (^4.3.4) and @cloudflare/vite-plugin (^1.50.0). Base path is strictly scoped to /outpost/.
- Code Splitting & Manual Chunking:
  - vendor-icons: lucide-react (^0.469.0)
  - vendor-react: react, react-dom, and scheduler
  - xlsx: SheetJS spreadsheet parsing engine (^0.18.5)
  - pdfjs: PDF.js document processing engine (pdfjs-dist ^6.2.108)
- Styling Framework: Tailwind CSS 3.4 (^3.4.17) with PostCSS (^8.4.49) and Autoprefixer (^10.4.20). Integrates root-level RGB custom property tokens supporting arbitrary alpha modifiers.
- Resilient Module Loading: Implements lazyWithRetry wrapper with session-debounced automatic reloading to recover gracefully from network chunk load errors or Vite preload failures.

## 2. Client-Side Routing & Navigation Model

Outpost Tracker operates using a custom client-side history router in [outpost/src/App.jsx](file:///e:/TechTrekGT/outpost/src/App.jsx), avoiding external routing dependencies:

- Custom History Router: Synchronizes browser location with window.history.pushState and popstate event listeners.
- Route Alias Normalization: Transparently maps both /outpost/* and legacy /auction/* subpaths to uniform internal views.
- View Hierarchy & Lazy Loading:
  - dashboard: High-level financial KPIs, sales trends, and inventory summary (DashboardView.jsx)
  - inventory: Consolidated inventory registry, SKU management, and pricing controls (InventoryHubView.jsx)
  - sales: Transaction logs, net profit calculations, and inline editable grid (SalesLogView.jsx)
  - settings: Integration credentials, sync toggles, and user preferences (SettingsView.jsx)
  - admin: Administrative platform metrics and user access controls (AdminView.jsx)
  - reset-password: Password recovery form handler
  - verify-email: Automated token validation endpoint for account verification
- Error Handling & Recovery: Protected by an ErrorBoundary component that logs errors and enables user-initiated cache resets to clear stale local storage data.

## 3. Cloudflare Worker Entry Point (src/worker.js)

The serverless backend executes as an ESM Worker in the Cloudflare edge runtime, defined in [outpost/src/worker.js](file:///e:/TechTrekGT/outpost/src/worker.js) and configured by [outpost/wrangler.jsonc](file:///e:/TechTrekGT/outpost/wrangler.jsonc):

- Worker Configuration:
  - Compatibility Date: 2026-08-01 with nodejs_compat flag enabled.
  - Observability: Cloudflare edge observability logging enabled.
  - Environment Variables: ADMIN_EMAIL configured for administrator authorization checks.
- Static Asset Pipeline:
  - Binding: ASSETS mapped to ./dist/client.
  - Asset Handling: run_worker_first: true ensures API endpoints, CORS validations, and authentication checks execute before falling back to static client bundles.
  - Caching Rules: Content-hashed assets receive long-term immutable cache headers, while HTML files enforce no-cache, no-store headers.
- Route Compilation & Collision Prevention:
  - compileRoute: Decomposes routes into static segments and dynamic parameters (:param).
  - sortRoutes: Sorts static segments before dynamic segments to guarantee deterministic priority.
  - assertNoShadowedRoutes: Validates the compiled route table at module startup, halting deployment if route shadowing or parameter collisions occur.
- Security Headers & Content Security Policy (CSP):
  - Injects per-request cryptographic nonces into script elements and HTML head meta tags via Cloudflare HTMLRewriter.
  - Configures Strict-Transport-Security (HSTS), X-Content-Type-Options: nosniff, X-Frame-Options: DENY, and strict Referrer-Policy.
  - Explicitly allowlists external image domains required for product previews: *.ebayimg.com, i.ebayimg.com, *.ebaystatic.com, *.media-amazon.com, and images-na.ssl-images-amazon.com.
- CORS Origin Gating:
  - Production Origins: https://techtrekgt.com, https://techtrek-outpost.pages.dev.
  - Development Origins: http://localhost:3001, http://127.0.0.1:3001.

## 4. Serverless API Routing & Function Architecture

Outpost manages over 50 serverless endpoints organized into modular handler files inside [outpost/functions/api/](file:///e:/TechTrekGT/outpost/functions/api/):

### 4.1 Authentication & Profile Handlers
- POST /api/auth/register: User account creation with password hashing.
- POST /api/auth/login: User credential validation and JWT session issuance.
- POST /api/auth/forgot-password: Initiates email-based password recovery.
- POST /api/auth/reset-password: Completes password resets and revokes stale token versions.
- POST /api/auth/security-question: Security challenge verification.
- POST /api/auth/update-profile: Updates user profile and credentials.
- GET /api/auth/me: Validates active session and returns user profile.
- GET /api/auth/verify-email: Renders or inspects email verification status.
- POST /api/auth/verify-email: Consumes OTP verification tokens.
- POST /api/auth/logout: Revokes session credentials.

### 4.2 Invoices & Procurement Handlers
- GET /api/invoices: Paginated list of vendor invoices and procurement batches.
- POST /api/invoices: Creates invoice headers and associated item manifests.
- GET /api/invoices/:id: Retrieves invoice details and attached items.
- PUT /api/invoices/:id: Updates invoice metadata.
- DELETE /api/invoices/:id: Purges invoices with atomic cascading item cleanup.

### 4.3 Items & Inventory Handlers
- GET /api/items: Paginated list of inventory items with filtering and search.
- POST /api/items: Creates standalone inventory items.
- GET /api/items/:id: Retrieves full item record and historical audit log.
- PUT /api/items/:id: Updates item status, pricing, condition, or SKU.
- DELETE /api/items/:id: Removes item record and clears platform associations.
- GET /api/items/enriched: Fast fuzzy search endpoint powering the Global Command Palette.
- POST /api/items/auto-sku: Generates collision-free internal SKUs.
- GET /api/items/image-preview: Fetches external product imagery for visual verification.

### 4.4 Sales & Performance Handlers
- GET /api/sales: Sales log entries with net proceeds and profit calculations.
- POST /api/sales: Records item sales, fee structures, and updates item status.
- GET /api/sales/:id: Retrieves specific sale breakdown.
- PUT /api/sales/:id: Updates sale metrics via inline table editing.
- DELETE /api/sales/:id: Removes sale record and reverts item status via compensating rollback.

### 4.5 Platforms & Comps Handlers
- GET /api/platforms: Registered selling channels and commission schedules.
- POST /api/platforms: Adds new marketplace configurations.
- PUT /api/platforms/:id: Updates fee rates and platform attributes.
- DELETE /api/platforms/:id: Removes unused platform presets.
- GET /api/comps: Internal pricing comp registry.
- POST /api/comps: Adds comp benchmarks.
- GET /api/comps/market: Queries external market pricing benchmarks.
- POST /api/comps/market: Stores market price evaluations.
- PUT /api/comps/market/:id: Updates comp observations.
- DELETE /api/comps/market/:id: Removes stale market benchmarks.

### 4.6 Import, Batch & Sync Handlers
- POST /api/import/batch: Batch spreadsheet ingestion with transactional staging.
- POST /api/import/amazon: Ingests Amazon order data via Bearer token or secret.
- POST /api/import/amazon-url: Parses single Amazon product or order URLs.
- GET /api/import/amazon-token: Retrieves active Amazon session tokens.
- POST /api/import/amazon-token: Updates stored Amazon session tokens.
- GET /api/sync/finance: Exports resale cash flow metrics to Finance OS.
- POST /api/sync/finance: Pushes reconciled revenue figures to Finance OS.
- GET /api/reports/tax: Generates Schedule C profit and loss reports.
- GET /api/market-alerts: Retrieves automated pricing and margin alerts.
- POST /api/market-alerts/refresh-all: Re-evaluates active inventory against comp thresholds.
- PUT /api/market-alerts/:id: Updates alert acknowledgment or threshold settings.

### 4.7 eBay Operations & Analytics Handlers
- GET /api/ebay/oauth-status: Validates eBay token expiration and scopes.
- GET /api/ebay/find-listings: Searches eBay active listings.
- GET /api/ebay/active-listings: Pulls active store listings from eBay Inventory API.
- POST /api/ebay/sync-item: Syncs single item price and quantity to eBay.
- POST /api/ebay/sync-all: Triggers store-wide synchronization.
- GET /api/ebay/match-sold-vinescout: Identifies sold marketplace listings.
- POST /api/ebay/match-sold-vinescout: Reconciles marketplace sales against internal inventory.
- POST /api/ebay/push-sku: Updates eBay listing custom label with internal SKU.
- GET /api/ebay/analytics: Pulls eBay Analytics API traffic reports.
- POST /api/ebay/analytics/ingest-traffic: Ingests traffic metrics into local analytics tables.
- POST /api/ebay/reconcile: Cross-references active inventory against eBay listings.
- GET /api/ebay/webhook: Verifies eBay webhook notification subscriptions.
- POST /api/ebay/webhook: Ingests real-time marketplace event notifications.

### 4.8 API Integrations & Export Handlers
- GET /api/integrations: Lists active external API integration credentials.
- POST /api/integrations: Issues new scoped integration API keys.
- POST /api/integrations/:id/revoke: Revokes API access credentials with immediate invalidation.
- DELETE /api/integrations/:id: Removes revoked integration keys.
- GET /api/export/vinescout-sales: Exports sales data for external analytics.
- GET /api/export/vinescout-inventory: Exports inventory catalogs.
- GET /api/sync/vinescout-catalog: Pulls catalog items for synchronization.
- POST /api/sync/vinescout-catalog: Pushes catalog updates.
- GET /api/sync/settings: Retrieves synchronization intervals and flags.
- PUT /api/sync/settings: Updates synchronization configuration.

## 5. Database Infrastructure & Persistence Bindings

Outpost Tracker shares the platform-wide Cloudflare D1 SQLite database:

- D1 Database Binding: DB mapped to personal-budget-db (ID: 10f220d4-1c10-49e9-b63e-5d4cb08d599f).
- Durable Object: Bound to RATE_LIMIT_DO (class RateLimitCounter) with migration tag v1-rate-limit-do for distributed rate limiting.
- Cloudflare KV: Bound to RATE_LIMIT_KV (ID: 12a9495ec88b45cdb492f1a63786066c).
- Schema Migrations: Database structure defined in auction-schema.sql, executed via wrangler d1 execute personal-budget-db --file=./auction-schema.sql.

## 6. Build & Deployment Lifecycle

- Build Command: npm run build executes vite build to compile static assets into dist/client.
- Deploy Command: npm run deploy executes npm run build followed by wrangler deploy.
- Integration Testing: Validates API endpoints, token hashing, and route compilation via node --test tests/*.test.js.
