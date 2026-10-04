# Landing Hub - State Management and Caching Architecture

## 1. Overview of State Architecture

Landing Hub operates under a strictly bifurcated state architecture. The public frontend is completely stateless, requiring no local storage, IndexedDB, or client-side session state. In contrast, the Central API Gateway maintains transient edge cache state, stateless Single Sign-On (SSO) authentication verification, and targeted persistent OAuth storage.

## 2. Stateless Authentication and Session Verification

The gateway implements stateless authentication verification in [landing/src/gateway/guard.js](file:///e:/TechTrekGT/landing/src/gateway/guard.js) and [landing/src/gateway/auth.js](file:///e:/TechTrekGT/landing/src/gateway/auth.js):

- Shared SSO Token Extraction: Incoming requests carry the auth_token cookie issued by the platform auth endpoints. The helper getTokenFromRequest and getAllTokensFromRequest inspect both Cookie headers and Authorization: Bearer fallback headers.
- Cryptographic Verification: Tokens are verified using WebCrypto HMAC-SHA256 against JWT_SECRET configured in the Worker environment.
- Zero Database Overhead: Authentication validation in the gateway does not query the D1 database on standard requests. It relies entirely on the cryptographically signed JWT payload containing userId, email, and user name.
- Protected Endpoints: All gateway integration routes (eBay comps, catalog, item, finances, listings, Amazon fetch) execute behind requireGatewayAuth, immediately returning HTTP 401 for missing or expired sessions.

## 3. Transient Caching Architecture (GATEWAY_KV)

The gateway leverages Cloudflare Workers KV via the GATEWAY_KV namespace binding declared in [landing/wrangler.jsonc](file:///e:/TechTrekGT/landing/wrangler.jsonc) for high-performance transient caching:

- eBay Client Credentials Token Cache:
  - Cache Key: ebay_access_token
  - TTL Duration: 6600 seconds (110 minutes), providing a safety buffer before eBay's standard 7200-second token expiration.
  - Access Engine: The getCachedEbayToken function in [landing/src/gateway/ebay.js](file:///e:/TechTrekGT/landing/src/gateway/ebay.js) inspects GATEWAY_KV before initiating upstream token requests.
  - Invalidation and Refresh: If the cached token is missing, expired, or corrupted, the worker requests a fresh token via fetchFreshEbayToken and updates GATEWAY_KV with explicit expirationTtl.
- Resilient In-Memory Fallback: If GATEWAY_KV is temporarily unavailable or running in a local development environment without KV provisioning, the gateway falls back gracefully to direct token fetches without throwing fatal runtime errors.

## 4. Persistent Database Storage (Cloudflare D1)

While the gateway is predominantly stateless, persistent credentials require encrypted relational storage in the shared Cloudflare D1 database (personal-budget-db):

- Table ebay_oauth_tokens:
  - Columns: user_id, ebay_user_id, access_token, refresh_token, token_expires_at, refresh_token_expires_at, created_at, updated_at.
  - Encryption at Rest: Sensitive tokens are encrypted using AES-GCM via [landing/src/gateway/tokenCrypto.js](file:///e:/TechTrekGT/landing/src/gateway/tokenCrypto.js) before storage, utilizing TOKEN_ENCRYPTION_KEY (with a fallback to JWT_SECRET and diagnostic warnings if the dedicated key is missing).
  - Lifecycle Updates: Tokens are upserted upon successful OAuth callback execution and deleted upon user-initiated disconnect or RFC 7009 revocation.

## 5. Edge Static Asset Caching

Static frontend assets (HTML, CSS, images, SVGs, web manifest) are managed by Cloudflare Workers Assets:

- Content Delivery: The ASSETS binding in [landing/wrangler.jsonc](file:///e:/TechTrekGT/landing/wrangler.jsonc) serves static files directly from the edge cache nearest to the requesting user.
- Cache Invalidation: Cloudflare automatically computes asset manifest hashes during deployment (wrangler deploy), guaranteeing that updated stylesheets and markup are immediately propagated while preserving long-term edge caching for unchanged assets.
- Clean Separation: Because run_worker_first is enabled, the worker intercepts /api/* requests before static asset evaluation, ensuring zero interference between dynamic API responses and cached static assets.
