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
- View Hierarchy:
  - Landing Hub: Poland overview, interactive country map, and destination links in [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx).
  - City Pages: Dedicated city drill-downs with multi-tab layouts (Overview, Attractions, Food, Markets, Hotels, History, LGBTQ+ Safe Spaces) in [wayfinder/src/components/CityPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/CityPage.jsx).
  - Route Map: Visual travel itinerary connecting the six cities with rail durations in [wayfinder/src/components/RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx).
  - Markets Overview: Comprehensive comparison of all Christmas markets in [wayfinder/src/components/MarketsPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/MarketsPage.jsx).
  - Stays and Dining: Unified overview of culinary highlights and accommodations in [wayfinder/src/components/StaysAndFoodPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/StaysAndFoodPage.jsx).
  - Practical Guide: Rail navigation, emergency numbers, tipping customs, and weather advice in [wayfinder/src/components/PracticalPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PracticalPage.jsx).
  - Private Hub: Authenticated portal for private travel itineraries, booking documents, and budget logs in [wayfinder/src/components/PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx).

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

## 4. Shared Relational Database and KV Bindings

Wayfinder integrates with the platform-wide data layer configured in [wayfinder/wrangler.jsonc](file:///e:/TechTrekGT/wayfinder/wrangler.jsonc):

- Shared Cloudflare D1 Database: Bound as env.DB pointing to personal-budget-db (database id: 10f220d4-1c10-49e9-b63e-5d4cb08d599f). Stores shared user accounts alongside Wayfinder-specific tables declared in [wayfinder/schema-wayfinder.sql](file:///e:/TechTrekGT/wayfinder/schema-wayfinder.sql).
- Rate Limiting KV: Bound as env.RATE_LIMIT_KV to protect authentication endpoints from brute-force credential stuffing.

## 5. Security Perimeter, CORS, and Content Security Policy (CSP)

The worker enforces edge security on every response via addSecurityHeaders in [wayfinder/src/worker.js](file:///e:/TechTrekGT/wayfinder/src/worker.js):

- CORS Origin Validation: Restricts origins to https://techtrekgt.com and local development hosts (localhost:5174).
- Transport Security: Strict-Transport-Security: max-age=31536000; includeSubDomains.
- Content Security Policy (CSP): Explicitly permits frame embedding for OpenStreetMap (openstreetmap.org), YouTube video guides (youtube.com, youtube-nocookie.com), Google Fonts, and Cloudflare Turnstile challenges (challenges.cloudflare.com).
- Frame and XSS Defenses: X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, and strict Permissions-Policy.
