# TechTrekGT Platform-Level Features and Shared Services

## 1. Unified Single Sign-On (SSO) Authentication

The TechTrekGT platform implements a centralized authentication and session management architecture shared across all applications in the ecosystem. This eliminates fragmented credentials, synchronizes user permissions, and provides transparent session roaming.

### 1.1 WebCrypto PBKDF2 Password Hashing

User credentials are protected using hardware-accelerated WebCrypto PBKDF2-HMAC-SHA256 hashing:

- Standard Iteration Baseline: 600,000 iterations in production environments, matching modern OWASP security baselines for serverless runtimes.
- Per-User Cryptographic Salt: A unique 16-byte random salt is generated via crypto.getRandomValues() for every account.
- Transparent Rehash on Login: Accounts created under earlier iteration standards (such as 100,000 or 310,000 iterations) are evaluated upon login. If the stored iteration count is below 600,000, the system automatically rehashes the password and updates D1 during successful authentication without user disruption.
- Fail-Closed Sanity Ceiling: A hard upper bound of 2,000,000 iterations is enforced. Any attempt to verify hashes specifying iterations above this ceiling is rejected immediately to protect Worker CPU quotas from denial-of-service attempts.

### 1.2 Opaque JWT Session Token Issuance

Authentication sessions are represented as compact JSON Web Tokens (JWT) signed using HMAC-SHA256 (HS256) via the WebCrypto API:

- Minimalist Payload Schema: Tokens contain strictly opaque identity claims: { userId, exp, tv }.
- Personal Data Protection: Zero personally identifiable information (no email addresses, real names, or privilege strings) is stored in the token payload.
- Shared Secret Signing: All Workers sign and verify tokens using the shared JWT_SECRET provisioned in Cloudflare Workers secrets.
- Token Expiration: Sessions carry a default 30-day lifetime (exp), supporting persistent logins for background e-commerce synchronizations and multi-device workflows.

### 1.3 Standardized Session Hydration (/api/auth/me)

Applications hydrate user state on initial page load by querying the GET /api/auth/me endpoint:

- Signature and Validity Verification: The endpoint verifies the JWT signature and expiration.
- Database Token Version Check: Compares the token version claim (tv) against the current token_version in the D1 users table.
- Profile Resolution: Returns fresh profile attributes (id, email, is_admin, status, email_verified, email_verified_at) retrieved directly from D1.
- Graceful Invalidation: If the token is invalid, expired, or revoked, the endpoint returns HTTP 401 and emits a Set-Cookie header with Max-Age=0 to purge the invalid browser cookie.

### 1.4 Account Lifecycle Management

- User Registration (POST /api/auth/register): Creates new records in the shared users table, hashes passwords, and generates email verification records.
- Email Verification (POST /api/auth/verify-email): Consumes single-use 8-digit verification codes hashed with HMAC (verify:${email}:${code}). Validates a 24-hour expiration window before setting email_verified = 1.
- Password Recovery Workflow: Three-step recovery pipeline: requesting an email token, verifying the token alongside a security answer, and establishing a new password. Completing a password reset automatically increments users.token_version, revoking all existing sessions.
- Email Change Workflow: Dual-notification model. Updates record pending email addresses in email_verifications, dispatches verification tokens to the new address, and sends security advisories to the old address. Confirmation updates the primary email, resets verification status, and bumps token_version.

### 1.5 Dual-Layer Rate Limiting and Abuse Prevention

Public authentication endpoints enforce dual-layer rate limiting:

- First-Gate IP Limiting: Evaluates the client IP from CF-Connecting-IP before reading or parsing the request payload, failing fast against volumetric floods.
- Second-Gate Account Limiting: Evaluates normalized email identifiers (e.g. login-account:<cleanEmail>) after parsing, enforcing a 10-attempt threshold per 15-minute window to defeat distributed brute-force attacks across rotating proxies.
- Cloudflare Turnstile Verification: Edge-level bot challenge validation runs on public login and registration routes prior to database lookups or expensive PBKDF2 operations.

## 2. Central API Gateway Endpoints

The Central API Gateway is hosted within the Landing Worker ([landing/src/worker.js](file:///e:/TechTrekGT/landing/src/worker.js)) under the directory [landing/src/gateway/](file:///e:/TechTrekGT/landing/src/gateway/). It serves as the single egress and ingress hub for shared external integrations.

### 2.1 eBay REST API Comps Engine (/api/ebay/comps)

- Routes: GET /api/ebay/comps and POST /api/ebay/comps.
- Purpose: Fetches recently sold comparable items from eBay to calculate real-time resale market pricing.
- Mechanism: Queries the eBay Marketplace Insights API with automatic fallback to the eBay Browse API. Authenticates using eBay Client Credentials Grant (CCF) with in-memory edge token caching.
- Protection: Requires a valid SSO authentication cookie.

### 2.2 eBay OAuth Authorization Services (/api/ebay/oauth/*)

- Routes: GET /api/ebay/oauth/authorize, GET /api/ebay/oauth/callback, POST /api/ebay/oauth/refresh, DELETE /api/ebay/oauth/disconnect.
- Purpose: Manages the eBay OAuth 2.0 Authorization Code Grant (ACG) lifecycle for user accounts.
- Security: Stores refresh tokens in D1 encrypted with AES-256-GCM using the isolated TOKEN_ENCRYPTION_KEY secret.
- Token Revocation: The disconnect endpoint invokes eBay RFC 7009 token revocation (POST /identity/v1/oauth2/token/revoke) before removing the database row in ebay_oauth_tokens.

### 2.3 eBay Webhook Notification Gateway (/api/ebay/webhook)

- Route: POST /api/ebay/webhook (and GET challenge handshake).
- Purpose: Receives real-time asynchronous notifications from eBay regarding sold items, payment statuses, and account closures.
- Signature Verification: Enforces strict HMAC-SHA256 signature verification on incoming X-EBAY-SIGNATURE headers using EBAY_WEBHOOK_SECRET. Requests with invalid or missing signatures are rejected with HTTP 401.
- Challenge Processing: Processes GET challenge requests by generating the required SHA-256 handshake token (SHA-256(challengeCode + secret + endpointUrl)).

### 2.4 eBay Finances Proxy (/api/ebay/finances)

- Route: GET /api/ebay/finances.
- Purpose: Proxies transaction and fee inquiries to eBay Finances API (/sell/finances/v1/transaction), allowing Outpost to reconcile net proceeds, gross sales, and shipping label costs without exposing seller credentials.

### 2.5 Amazon Scraper Proxy (/api/amazon/fetch)

- Route: POST /api/amazon/fetch.
- Purpose: Extracts Amazon product titles, ASINs, pricing, bullet points, and high-resolution images.
- Multi-Tier Cascade: Attempts extraction via dedicated scraper proxy services (SCRAPER_API_KEY) with direct edge fetch fallbacks.

## 3. Standardized API Error Taxonomy and Contract

To ensure consistent error handling across all frontend applications, the platform enforces a uniform API error contract generated by the shared fail(code, status, message, requestId) helper:

```json
{
  "error": "Human-readable diagnostic description",
  "code": "STANDARDIZED_ERROR_CODE",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 3.1 Error Code Registry

The standardized error codes are maintained consistently across client and worker utilities:

- INVALID_CREDENTIALS: User authentication failure. Emits generic text without indicating whether the email or password was incorrect.
- RESET_CODE_INVALID: Password recovery validation failure. Emits uniform text without leaking token expiration or existence states.
- SESSION_EXPIRED: Token version mismatch against D1 or expired session duration.
- UNAUTHORIZED: Missing or malformed session cookie on a protected endpoint.
- FORBIDDEN: Authenticated caller lacks permissions for the requested resource (e.g. non-admin accessing system statistics).
- CSRF_INVALID: Double-submit CSRF cookie and header comparison failure.
- RATE_LIMITED: Request rate limit exceeded. Returns HTTP 429 with a Retry-After response header.
- VALIDATION_ERROR: Missing, malformed, or invalid request payload parameters.
- NOT_FOUND: Requested entity, resource ID, or route does not exist.
- CONFLICT: Database uniqueness violation (such as duplicate account email registration).
- SYNC_CONFLICT: Version collision in cloud backup synchronization.
- SYNC_SUSPICIOUS: An unforced cloud backup payload is suspiciously smaller (>10% drop) than the existing server backup.
- SERVICE_UNAVAILABLE: Required infrastructure bindings (D1 or environment secrets) are unavailable.
- INTERNAL_ERROR: Uncaught server-side exception.

### 3.2 Information Disclosure Protections

All Workers implement strict response sanitization:
- Internal Exception Masking: Unhandled exceptions return generic messages (An internal error occurred. Please try again.) with HTTP 500. Detailed error messages and stack traces are logged exclusively to server-side console logs.
- Upstream Error Masking: Errors returned by third-party APIs (eBay, Amazon) are sanitized before transmission to the client, preventing internal API tokens or upstream infrastructure details from leaking.

## 4. Observability and Request Tracing

### 4.1 Request Correlation Identifiers

Every incoming request handled by a Worker generates a unique correlation identifier using crypto.randomUUID():
- Contextual Propagation: The identifier is attached to the execution context and threaded through all database queries and external proxy requests.
- Header Injection: Responses include the X-Correlation-Id header for end-to-end client-server tracing.
- Error Telemetry: All 5xx error response bodies include the requestId to facilitate rapid log lookups.

### 4.2 Structured Logging

All Workers emit low-cardinality structured JSON log events for key lifecycle and security actions (e.g. auth.login.success, auth.login.invalid_credentials, auth.register.duplicate, sync.backup.success), enabling real-time filtering and analysis in Cloudflare Workers Logs.
