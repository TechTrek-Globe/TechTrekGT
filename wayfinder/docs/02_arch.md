# Wayfinder Guide - Technical Architecture and Infrastructure

## 1. Frontend Technology Stack

Wayfinder is built as a single-page web application using modern pure JavaScript without TypeScript compilation:

- Core Framework: React 19 (^19.0.0) with react-dom (^19.0.0), utilizing functional components, custom hooks, and React Context for local state.
- Build Toolchain: Vite 6 (^6.0.7) configured in [wayfinder/vite.config.js](file:///e:/TechTrekGT/wayfinder/vite.config.js). Uses @vitejs/plugin-react (^4.3.4), base path /wayfinder/, and outputs to dist/client.
- Styling Framework: Tailwind CSS 3.4 (^3.4.17) with PostCSS (^8.5.1) and Autoprefixer (^10.4.20). Configured with custom brand color palettes, dark mode defaults, and glassmorphic utility classes in [wayfinder/tailwind.config.js](file:///e:/TechTrekGT/wayfinder/tailwind.config.js).
- Iconography: lucide-react (^0.474.0) for consistent travel, navigational, culinary, and utility icons.

## 2. Client-Side Routing and Navigation Architecture

Wayfinder implements custom client-side history routing in [wayfinder/src/App.jsx](file:///e:/TechTrekGT/wayfinder/src/App.jsx), completely independent of third-party routing libraries:

- Route Synchronization: Listens to window.history.pushState and popstate events, matching browser URL paths against recognized view routes.
- Base Path Normalization: Automatically strips the /wayfinder base prefix to determine internal view state.
- Simplified Entry Funnel: Root `/wayfinder` route directly renders PolandLanding, eliminating unnecessary gateway intermediary clicks.
- Global Navigation Architecture:
  - Mobile Bottom Tab Bar: Persistent 5-slot thumb-zone navigation [wayfinder/src/components/BottomTabBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx) providing one-tap access to Cities, Schedule, Practical, Currency (Money), and Hub (Documents).
  - Slim Desktop Header: Clean, distraction-free top navigation in [wayfinder/src/components/Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx) featuring Launch Pad, Practical Guide, live Currency Converter, and Private Hub / Auth.
- View Hierarchy & Route Redirects:
  - Primary Journey Hub: Poland overview, interactive route rail map, and city cards in [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx).
  - City Pages: Dedicated city drill-downs in [wayfinder/src/components/CityPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/CityPage.jsx) featuring a 5-tab streamlined navigation strip (Overview, Markets, Sights, Food, Stays, Safe Spaces) with city history surfaced via an interactive card in [wayfinder/src/components/city/CityOverviewTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityOverviewTab.jsx).
  - Retired Standalone Routes: `/markets`, `/stays-and-food`, and `/route` automatically redirect to `/wayfinder/poland-christmas-2026`, preserving bookmarks while consolidating duplicate content into city tabs.
  - Practical Guide: Dedicated logistics, train tickets, packing, and emergency advice in [wayfinder/src/components/PracticalPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PracticalPage.jsx).
  - Private Operations Hub & Schedule: Unified portal at `/private` in [wayfinder/src/components/PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx). Unauthenticated visitors view the public 10-day itinerary with an option to sign in; authenticated users access document storage, OCR extraction, and overlaid booking confirmations. Aliases `/itinerary` and `/timeline` redirect here.

## 3. Serverless Worker Architecture (src/worker.js)

Wayfinder executes on the Cloudflare edge runtime as an ESM Worker defined in [wayfinder/src/worker.js](file:///e:/TechTrekGT/wayfinder/src/worker.js) and configured via [wayfinder/wrangler.jsonc](file:///e:/TechTrekGT/wayfinder/wrangler.jsonc):

- Worker Configuration: Compatibility date 2026-08-01 with nodejs_compat flag and edge observability logging enabled.
- Assets Pipeline: ASSETS binding pointed to ./dist/client with not_found_handling: "single-page-application" and run_worker_first: true.
- Subpath Prefix Stripping: Incoming requests matching /wayfinder/api/* have the /wayfinder prefix stripped to /api/* to match standard serverless handlers.
- Route Matching Pipeline:
  - Public Auth Routes: /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/register, /api/auth/forgot-password, /api/auth/reset-password, /api/auth/security-question.
  - Public Utility Routes: /api/wayfinder/exchange-rate provides live NBP Polish zloty exchange rate data without requiring authentication.
  - Protected API Routes: All requests to /api/wayfinder/journeys, /api/wayfinder/itinerary, /api/wayfinder/documents, /api/wayfinder/import-jobs, and /api/wayfinder/budget execute behind requireAuth, verifying the shared SSO JWT token.
- Static Asset Fallback: All non-API paths rewrite their subpath and serve static assets from env.ASSETS.fetch, injecting edge security headers.

## 4. Dedicated Relational Database and KV Bindings

Wayfinder integrates with its dedicated data layer configured in [wayfinder/wrangler.jsonc](file:///e:/TechTrekGT/wayfinder/wrangler.jsonc):

- Dedicated Cloudflare D1 Database: Bound as env.DB pointing to wayfinder-db (database id: f95ad16e-8b63-419e-b828-d749b6fdd8f1). Stores identity and authentication tables alongside all 16 normalized Wayfinder tables declared in [wayfinder/schema-wayfinder.sql](file:///e:/TechTrekGT/wayfinder/schema-wayfinder.sql), completely decoupled from personal-budget-db.
- Rate Limiting KV: Bound as env.RATE_LIMIT_KV to protect authentication endpoints from brute-force credential stuffing.

## 5. Security Perimeter, CORS, and Content Security Policy (CSP)

The worker enforces edge security on every response via addSecurityHeaders in [wayfinder/src/worker.js](file:///e:/TechTrekGT/wayfinder/src/worker.js):

- CORS Origin Validation: Restricts origins to https://techtrekgt.com and local development hosts (localhost:5174).
- Transport Security: Strict-Transport-Security: max-age=31536000; includeSubDomains.
- Content Security Policy (CSP): Explicitly permits frame embedding for OpenStreetMap (openstreetmap.org), YouTube video guides (youtube.com, youtube-nocookie.com), Google Fonts, and Cloudflare Turnstile challenges (challenges.cloudflare.com).
- Frame and XSS Defenses: X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, and strict Permissions-Policy.
