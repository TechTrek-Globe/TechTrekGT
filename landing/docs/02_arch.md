# Landing Hub - Technical Architecture and Infrastructure

## 1. Frontend Architecture and Technology Stack

Landing Hub employs a clean, dependency-free static web architecture engineered for instant initial page loads and zero build-step overhead:

- Core Markup: Semantic HTML5 defined in [landing/index.html](file:///e:/TechTrekGT/landing/index.html). Optimized with responsive viewport meta tags, Apple Web App capabilities, preconnected Google Fonts, high-priority banner images, and structured accessibility landmarks (header, main, section, footer).
- Styling Layer: Vanilla CSS3 declared in [landing/style.css](file:///e:/TechTrekGT/landing/style.css). Employs CSS custom properties for cohesive theming, responsive CSS grid layouts, media queries for mobile-first responsiveness, and GPU-accelerated micro-interactions.
- Client Logic: Vanilla JavaScript for interactive UI enhancements, lightweight DOM telemetry, and service worker registration via [landing/manifest.webmanifest](file:///e:/TechTrekGT/landing/manifest.webmanifest).
- Build Lifecycle: No bundler or compilation step is required for frontend assets. The static assets reside directly in the project root and are deployed straight to the Cloudflare edge.

## 2. Serverless Worker Architecture (src/worker.js)

The backend and routing spine executes as an ECMAScript Module (ESM) Worker in the Cloudflare edge runtime, defined in [landing/src/worker.js](file:///e:/TechTrekGT/landing/src/worker.js) and configured via [landing/wrangler.jsonc](file:///e:/TechTrekGT/landing/wrangler.jsonc):

- Worker Entry Point: Exports a default object with an asynchronous fetch(request, env, ctx) handler.
- Static Asset Configuration: The assets configuration in [landing/wrangler.jsonc](file:///e:/TechTrekGT/landing/wrangler.jsonc) binds ASSETS to directory ./ with run_worker_first: true.
- Run Worker First Mandate: Setting run_worker_first to true guarantees that incoming HTTP requests are first evaluated by the Worker code in [landing/src/worker.js](file:///e:/TechTrekGT/landing/src/worker.js). This allows programmatic route interception for all /api/* paths before falling back to static files.
- Static Asset Fallback: Any request whose path does not start with /api/ is served directly by env.ASSETS.fetch(request), delivering index.html, style.css, images, and manifest files with global edge caching.

## 3. Central API Gateway Routing Engine

Landing Hub acts as the Central API Gateway for the entire platform. Un-prefixed /api/* requests hitting techtrekgt.com are intercepted and dispatched to dedicated gateway handlers:

- /api/ebay/comps (GET, POST): Dispatched to ebayCompsGet and ebayCompsPost in [landing/src/gateway/ebay.js](file:///e:/TechTrekGT/landing/src/gateway/ebay.js). Fetches recently sold comparable sales from the eBay Marketplace Insights API.
- /api/ebay/catalog (GET): Dispatched to ebayCatalogGet in [landing/src/gateway/ebayCatalog.js](file:///e:/TechTrekGT/landing/src/gateway/ebayCatalog.js). Queries eBay Commerce Catalog product summaries.
- /api/ebay/item/* (GET): Dispatched to ebayItemGet in [landing/src/gateway/ebayItem.js](file:///e:/TechTrekGT/landing/src/gateway/ebayItem.js). Retrieves individual item details from the eBay Browse API.
- /api/ebay/oauth/start (GET): Dispatched to ebayOAuthStart in [landing/src/gateway/ebayOAuth.js](file:///e:/TechTrekGT/landing/src/gateway/ebayOAuth.js). Initiates Authorization Code Grant flow.
- /api/ebay/oauth/callback (GET): Dispatched to ebayOAuthCallback in [landing/src/gateway/ebayOAuth.js](file:///e:/TechTrekGT/landing/src/gateway/ebayOAuth.js). Handles eBay authorization redirects and stores encrypted refresh tokens.
- /api/ebay/oauth/status (GET): Dispatched to ebayOAuthStatus in [landing/src/gateway/ebayOAuth.js](file:///e:/TechTrekGT/landing/src/gateway/ebayOAuth.js). Reports current user eBay connection state.
- /api/ebay/oauth/disconnect (DELETE): Dispatched to ebayOAuthDisconnect in [landing/src/gateway/ebayOAuth.js](file:///e:/TechTrekGT/landing/src/gateway/ebayOAuth.js). Revokes upstream eBay tokens and clears stored credentials.
- /api/ebay/webhook (GET, POST): Dispatched to ebayWebhookGet and ebayWebhookPost in [landing/src/gateway/ebayWebhook.js](file:///e:/TechTrekGT/landing/src/gateway/ebayWebhook.js). Verifies eBay challenge tokens and processes marketplace event notifications.
- /api/ebay/finances (GET): Dispatched to ebayFinancesGet in [landing/src/gateway/ebayFinances.js](file:///e:/TechTrekGT/landing/src/gateway/ebayFinances.js). Proxies eBay Finances API requests.
- /api/ebay/listings (GET): Dispatched to ebayListingsGet in [landing/src/gateway/ebayListings.js](file:///e:/TechTrekGT/landing/src/gateway/ebayListings.js). Proxies eBay active listing queries.
- /api/amazon/fetch (POST): Dispatched to amazonFetchPost in [landing/src/gateway/amazon.js](file:///e:/TechTrekGT/landing/src/gateway/amazon.js). Coordinates multi-tier Amazon product metadata extraction.
- /api/health (GET): Public health check endpoint returning JSON status, worker identifier, and millisecond timestamp.

## 4. Ingress Routing and Cloudflare Route Topology

The routing behavior is governed by route patterns declared in [landing/wrangler.jsonc](file:///e:/TechTrekGT/landing/wrangler.jsonc):

- Pattern techtrekgt.com: Captures root domain visits.
- Pattern techtrekgt.com/*: Wildcard pattern capturing all sub-paths not specifically bound to higher-priority satellite workers.
- Route Precedence: More specific Cloudflare route patterns (such as techtrekgt.com/outpost/* or techtrekgt.com/finance/*) take routing precedence over the wildcard pattern, routing those requests directly to their respective application workers.
- Sub-App Gateway Calls: Satellite applications invoke the gateway via absolute URL (https://techtrekgt.com/api/...) with credentials: 'include'.

## 5. Security Perimeter, CORS, and Edge Headers

The worker enforces edge security via the addCorsHeaders function in [landing/src/worker.js](file:///e:/TechTrekGT/landing/src/worker.js):

- HTTPS Enforcement: Automatically redirects insecure http: requests to https: with HTTP 301 status.
- CORS Origin Gating: Restricts cross-origin requests to an explicit allowlist (https://techtrekgt.com, localhost ports for outpost, finance, wayfinder, vinescout, bigworm, and landing).
- Credentialed Sharing: Enforces Access-Control-Allow-Credentials: true and Access-Control-Max-Age: 86400 for browser caching of preflight checks.
- Transport Security: Injects Strict-Transport-Security: max-age=31536000; includeSubDomains on all production responses.
- Browser Hardening Headers: X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, and Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=().
