# Finance OS - Technical Architecture & Infrastructure

## 1. Frontend Technology Stack

Finance OS is architected as a pure JavaScript single-page application built on modern web standards with zero TypeScript overhead:

- Core Framework: React 19 (^19.0.0) with react-dom (^19.0.0). Built strictly with function components, custom hooks, and React Context. Class components are limited exclusively to error boundaries.
- Build Toolchain: Vite 6 (^6.0.7) configured via [finance/vite.config.js](file:///e:/TechTrekGT/finance/vite.config.js). Integrates @vitejs/plugin-react (^4.3.4) and @cloudflare/vite-plugin (^1.50.0). Base path is strictly scoped to /finance/.
- Styling Framework: Tailwind CSS 3.4 (^3.4.17) with PostCSS (^8.4.49) and Autoprefixer (^10.4.20). Utilizes dynamic CSS custom properties for runtime theme flexibility.
- Auxiliary Visualization & Processing Libraries:
  - Recharts (^2.15.0): Composable charting library utilized in DashboardView for 365-day balance trajectories and cash flow velocity charts.
  - dnd-kit (^6.3.1): Drag-and-drop toolkit (@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities) powering custom dashboard widget reordering.
  - SheetJS (xlsx ^0.18.5): Spreadsheet parser executed in a dedicated Web Worker (spreadsheet.worker.js) to offload heavy CSV/XLSX parsing off the browser UI thread.
  - Lucide React (^0.469.0): Platform-wide SVG iconography system.

## 2. Client-Side Routing & Navigation Model

Finance OS operates without third-party routing libraries such as react-router-dom:

- Custom History Router: Built on window.history.pushState and popstate event listeners in [src/App.jsx](file:///e:/TechTrekGT/finance/src/App.jsx).
- URL Normalization: Automatically strips trailing slashes and routes incoming requests between the public landing view and authenticated finance workspace.
- View Hierarchy & Lazy Loading:
  - dashboard: Main financial summary and widget canvas (DashboardView.jsx)
  - main_budget: Matrix budget and paycheck scheduling view, mapped to /finance/main-budget (MainBudgetView.jsx)
  - ledger: Transaction registry and SheetJS import interface (LedgerView.jsx)
  - amortization: Loan payoff schedules and interest calculators (AmortizationView.jsx)
  - settings: Account definitions, bill intervals, and theme configuration (SettingsView.jsx)
  - admin: Administrative telemetry and account suspension tools (AdminView.jsx)
- Resilience & Error Boundaries: Wrapped in a top-level ErrorBoundary that traps uncaught runtime failures and provides cache-clearing reset mechanisms without crashing the host browser session.

## 3. Cloudflare Worker Entry Point (src/worker.js)

The serverless backend executes as an ECMAScript Module (ESM) Worker inside the Cloudflare edge runtime, defined in [src/worker.js](file:///e:/TechTrekGT/finance/src/worker.js) and configured by [wrangler.jsonc](file:///e:/TechTrekGT/finance/wrangler.jsonc):

- Worker Configuration:
  - Compatibility Date: 2026-08-01 with nodejs_compat flag enabled.
  - Observability: Edge logging enabled.
  - Environment Variables: ENVIRONMENT set to production.
  - Production Secrets: JWT_SECRET (shared SSO signing key), CODE_HMAC_SECRET (HMAC key for OTP verification), SYNC_UNLOCK_CODE (cloud vault passcode), RESEND_API_KEY (transactional email), and TURNSTILE_SECRET_KEY (bot mitigation).
- Static Asset Pipeline:
  - Binding: ASSETS mapped to ./dist/client.
  - Asset Handling: run_worker_first: true ensures API requests and route guards are evaluated before serving static single-page assets.
  - Caching Invariants: Content-hashed assets receive immutable cache headers (Cache-Control: public, max-age=31536000, immutable), while HTML documents enforce no-store headers.
- Security Headers & Content Security Policy (CSP):
  - Injects per-request cryptographic nonces into script elements via Cloudflare HTMLRewriter.
  - Enforces Strict-Transport-Security (HSTS), X-Content-Type-Options: nosniff, X-Frame-Options: DENY, and strict Referrer-Policy.
  - Script source policy: script-src 'self' 'nonce-...' 'strict-dynamic' https://challenges.cloudflare.com.
- CORS Origin Gating:
  - Production Origins: https://techtrekgt.com, http://techtrekgt.com, https://techtrek-budget.pages.dev.
  - Development Origins: localhost and 127.0.0.1 on ports 5173, 3000, and 8787.
  - Emits Vary: Origin and rejects unauthorized cross-origin mutations with HTTP 403 Forbidden.

## 4. Serverless API Routing & Function Architecture

API routes are registered in a centralized dispatch table (ROUTES) mapping HTTP methods and paths to modular handlers residing in [functions/api/](file:///e:/TechTrekGT/finance/functions/api/):

### 4.1 Cloud Vault & Concurrency Sync Endpoints

- POST /api/verify-sync-code: Constant-time validation of SYNC_UNLOCK_CODE with dual IP and per-user rate limiting.
- POST /api/sync/backup: Compare-And-Swap (CAS) cloud backup persistence with JSON payload schema validation, byte tracking, and snapshot versioning.
- GET /api/sync/restore: Retrieves active user budget document with conditional HTTP 304 ETag support.
- GET /api/sync/versions: Lists up to 10 stored historical backup snapshots.
- POST /api/sync/restore-version: Atomic rollback to a selected historical snapshot.

### 4.2 Authentication & Session Lifecycle Endpoints

- POST /api/auth/register: User account creation with Turnstile verification, PBKDF2-SHA256 password hashing (600,000 iterations), and compensating rollback.
- POST /api/auth/login: User authentication with Turnstile check, session issuance, and transparent password rehashing.
- GET /api/auth/me: Restores user session state without cookie clobbering.
- POST /api/auth/refresh: Access token renewal within the valid session window.
- POST /api/auth/logout: Revokes sessions by bumping token_version in D1 and invalidating cached session claims.
- POST /api/auth/forgot-password: Issues single-use OTP reset token via email.
- POST /api/auth/reset-password: Atomic password reset and token version invalidation.
- POST /api/auth/verify-email: Validates email address via 8-digit OTP code.
- POST /api/auth/resend-verification: Reissues email verification code.
- GET /api/auth/security-question: Authenticated security challenge retrieval.
- POST /api/auth/update-profile: Profile updates with compensating rollbacks on unlinked records.
- POST /api/auth/confirm-email-change: Finalizes email updates via OTP confirmation.

### 4.3 Administrative Endpoints

- GET /api/admin/stats: Administrative usage telemetry, user counts, and backup statistics with pagination guards.
- POST /api/admin/user-status: Updates user active or suspended status, automatically invalidating active sessions.
- POST /api/admin/user/:id/status: Parameterized endpoint updating targeted user account standing.

## 5. Database Infrastructure & Persistence Bindings

Finance OS connects to the TechTrekGT shared Cloudflare D1 SQLite database:

- D1 Binding: DB bound to database personal-budget-db (ID: 10f220d4-1c10-49e9-b63e-5d4cb08d599f).
- Durable Object Rate Limiting: Bound to RATE_LIMITER (class RateLimiter) with SQLite storage migration tag v1 for coordinated brute-force defense.
- Client Persistence: Local-first IndexedDB storage keying full budget snapshots per user ID, enabling immediate offline interaction and network reconnection syncing.

## 6. Build & Deployment Lifecycle

- Build Command: npm run build executes check-safe-serialization.js followed by vite build to verify payload safety and produce the static distribution in dist/client.
- Deploy Command: npm run deploy packages the bundle and deploys the Cloudflare Worker via wrangler deploy.
- Testing Suite: Comprehensive automated test runners validating calculation engines, security rules, and CAS restoration round-trips via node --test.
