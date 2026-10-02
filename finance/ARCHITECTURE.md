# TechTrekGT - Finance OS Architecture

## 1. Overview & Stack

Finance OS is the personal budget tracking application in the TechTrekGT platform, hosted at `techtrekgt.com/finance/*`.

| Layer | Technology | Details |
|---|---|---|
| Frontend | React 19 | Pure JavaScript / JSX, custom functional components + hooks |
| Build Tool | Vite 6 | `@cloudflare/vite-plugin` outputting client assets and SSR worker bundle |
| Styling | Tailwind CSS 3.4 | Custom `brand` palette, dark mode via `.dark` class |
| Icons & Visuals | lucide-react, Recharts 2.15 | UI icons and dashboard charts |
| Runtime | Cloudflare Workers (ESM) | `src/worker.js` entry point with Pages Functions style route handlers |
| Persistence | Cloudflare D1 (SQLite) | Shared `personal-budget-db` database + client IndexedDB for offline-first caching |
| Auth & Crypto | WebCrypto (HS256 JWT + PBKDF2) | Shared SSO JWT secret, HttpOnly strict cookies, double-submit CSRF protection |

---

## 2. Routing & Worker Dispatch

- **Canonical Mount:** `/finance` is the canonical mount path. Bare `/` redirects with HTTP 301 to `/finance`.
- **Client Router:** Hand-rolled custom SPA router in `App.jsx` using `window.history.pushState` and `popstate` listeners. No `react-router-dom`.
- **Worker Routing:** `src/worker.js` maps API routes before falling back to static client assets via the Cloudflare `ASSETS` binding. Sub-path API requests (`/finance/api/*`) are normalized to `/api/*`.
- **Static Asset Caching & Security Headers:** `addSecurityHeaders` applies `Cache-Control: public, max-age=31536000, immutable` for content-hashed static assets under `/finance/assets/` (and matching hash patterns `*-[hash].ext` / `*.[hash].ext`). Non-hashed static assets (e.g. `/finance/favicon.svg`) receive `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`. HTML responses strictly receive `Cache-Control: no-store, must-revalidate` (with nonce injection), and API JSON responses strictly receive `Cache-Control: no-store`.
- **Explicit Environment Binding & Security Headers (`env.ENVIRONMENT`):** Production status is determined explicitly via `env?.ENVIRONMENT === 'production'` configured in `wrangler.jsonc` (`vars: { ENVIRONMENT: "production" }`). CSP (`Content-Security-Policy`) and HSTS (`Strict-Transport-Security`) headers gate strictly on `isProduction && !isLocalhost`, ensuring they remain active in production regardless of whether the `cf-ray` header is present. If `cf-ray` is observed while `env.ENVIRONMENT` is undefined, a loud log warning alerts operators to the missing environment configuration. Localhost requests bypass CSP/HSTS even in production.
- **Environment-Gated CORS & Allowed Origins:** Allowed origins are split into `PRODUCTION_ORIGINS` (`https://techtrekgt.com`, `http://techtrekgt.com`, `https://techtrek-budget.pages.dev`) and `DEV_ORIGINS` (localhost and 127.0.0.1 ports 3000, 5173, 8787). The effective allowlist is computed dynamically as `PRODUCTION_ORIGINS.concat(isProduction ? [] : DEV_ORIGINS)`. In production, requests from localhost origins are strictly denied CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`) and non-GET mutations, preventing potential token/credential exposure, while local development retains full access. `ALLOWED_ORIGINS` is exported as the full concatenated list for backward compatibility.

---

## 3. Authentication & CSRF Architecture

### 3.1 Cookie & Session Model
- **`auth_token`:** HttpOnly, Secure, `SameSite=Strict`, scoped to `Path=/finance` and `Path=/api`. Carries HS256 JWT containing `userId`, `email`, `name`, `role`, `tv` (token_version), `iat`, `exp`, and `sexp` (absolute session expiry).
- **`csrf_token`:** Secure, `SameSite=Strict`, scoped to `Path=/finance` and `Path=/api`. Double-submit CSRF token read from cookie and submitted via `X-CSRF-Token` header on state-changing requests.
- **Cookie Path Scoping & App Isolation:** Cookies are explicitly scoped to `Path=/finance` and `Path=/api` (rather than root `Path=/`) to prevent automatic transmission to unrelated origin sub-sites (such as `/outpost` and `/auction`) and keep `document.cookie` inaccessible to scripts in other app paths. Cleared cookies evict both scoped paths and legacy `Path=/`. *Architectural Note:* True cross-app isolation cannot be achieved via cookie Path scoping alone under the Same-Origin Policy; migrating unrelated apps to separate subdomains (e.g. `finance.techtrekgt.com`, `outpost.techtrekgt.com`) is tracked as a long-term architectural follow-up.
- **Inactivity Timeout:** 15-minute client-side activity listener (`mousedown`, `keydown`, `scroll`, `touchstart`, `click`).

### 3.2 `/api/auth/me` Handler (`onRequestGet`)
The `/api/auth/me` endpoint restores user session state on app boot and background sync. To prevent multi-tab desynchronization and CSRF token clobbering, cookie reissuance is conditional:

1. **Common Case (No Cookie Rotation):**
   - When the session is valid, well within its expiration window, user claims match the database, and a valid `csrf_token` cookie is present:
   - Returns the user JSON payload immediately.
   - Does **NOT** call `issueSession()`.
   - Does **NOT** emit `Set-Cookie` headers.
   - Echoes the existing CSRF token read via `readCookie(request, 'csrf_token')`.
2. **Refresh Conditions:**
   `issueSession()` is called and new cookies are issued via `Set-Cookie` only when one of the following occurs:
   - **Approaching Expiry:** Remaining token time (`exp - now` or `sexp - now`) is within the refresh threshold (< 25% of `ACCESS_TOKEN_TTL`, i.e., < 30 minutes remaining of 2 hours).
   - **Claims Mismatch:** Session-relevant fields in the database (`role`, `token_version`, `email`, `name`) differ from what is encoded in the current token payload.
   - **Partial Cookie Loss:** A valid `auth_token` cookie exists but no valid `csrf_token` cookie is present.

### 3.3 `/api/auth/refresh` Handler (`onRequestPost`)
Dedicated endpoint for active session renewal without requiring incidental user actions:
- **Authentication & CSRF:** Requires a valid, non-expired `auth_token` (Cookie or Bearer) and verifies `X-CSRF-Token` header for cookie authentication (`requireCsrf: true`).
- **Database Verification:** Validates that the user account exists, is not suspended, and `token_version` still matches the database.
- **Session Bounding:** Generates a new access token with `exp = Math.min(now + ACCESS_TOKEN_TTL, sexp)`. Does **NOT** extend `sexp` (absolute session expiry window is preserved).
- **Cookie Rotation:** Issues fresh `auth_token` and `csrf_token` cookies with `Max-Age = sexp - now` and returns `{ success: true, csrfToken }`.
- **Frontend Contract:** Frontend clients MUST call `/api/auth/refresh` periodically comfortably inside `ACCESS_TOKEN_TTL` (e.g., every 90 minutes) for "remember me" sessions to span `SESSION_TTL_REMEMBER` (30 days).

### 3.4 One-Time Code Generation & Cryptographic Key Separation (`env.CODE_HMAC_SECRET`)
To eliminate cryptographic key reuse between session signing and transient one-time code verification (REM-09):
- **Session Tokens:** Signed and verified exclusively using `env.JWT_SECRET` (HS256 JWT via `createToken` / `verifyToken`).
- **One-Time Codes (OTP):** Generated and verified exclusively using a dedicated `env.CODE_HMAC_SECRET` binding via HMAC-SHA256 (`hmacHex`).
- **Unified One-Time Code Issuance (`issueOneTimeCode`):** All code-issuance flows (`register`, `forgot-password`, `update-profile`, `resend-verification`) delegate to the shared `issueOneTimeCode(env, options)` helper in `functions/utils/auth.js`. The helper generates unbiased 8-digit codes via rejection sampling (`randomInt`), computes namespaced HMAC hashes (`${purpose}:${email}:${code}`), atomically invalidates prior unused records in `email_verifications` or `password_resets`, and inserts the new record.
- **Unified Transactional Email Delivery (`sendTransactionalEmail`):** Out-of-band email dispatch (`sendResetEmail`, `sendVerificationEmail`, `sendEmailChangeNotification`) delegates to the shared `sendTransactionalEmail(env, { to, subject, bodyLines, logPrefix, devFallbackMessage })` helper in `functions/utils/auth.js`. The helper centralizes configuration verification (`RESEND_API_KEY` / `MAIL_FROM`), dev-mode logging with preserved system prefixes (`[forgot-password]`, `[email-verify]`, `[email-change-notice]`), Resend API POST dispatch, and uniform error handling.
- **Centralized TTL Constants:** Expiration windows are defined in `functions/utils/auth.js` by single authoritative constants: `ONE_TIME_CODE_TTL_MS = 24 * 60 * 60 * 1000` (24 hours for email verification and email change) and `RESET_CODE_TTL_MS = 15 * 60 * 1000` (15 minutes for password resets), eliminating drift across duplicate module declarations.
- **Protected Handlers:** `register`, `forgot-password`, `reset-password`, `update-profile`, `verify-email`, `resend-verification`, and `confirm-email-change`.
- **Fail-Closed Startup Check:** Each handler checks `!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET` at invocation time, immediately returning HTTP 503 `SERVICE_UNAVAILABLE` if `CODE_HMAC_SECRET` is missing.
- **Forward-Only Rotation:** Existing in-flight reset and verification codes issued prior to rotation fail verification safely without runtime crashes, prompting users to request a fresh code.

### 3.5 PBKDF2 Iteration Hardening & Decoupled Sanity Ceiling
- **Decoupled Architecture:** `PBKDF2_ITERATIONS` (new hash target) and `PBKDF2_MAX_SUPPORTED` (verification safety ceiling) are decoupled. `PBKDF2_MAX_SUPPORTED` is fixed at 2,000,000 as a fail-closed sanity ceiling against corrupted or malicious database records triggering CPU exhaustion.
- **OWASP-Validated Target:** `PBKDF2_ITERATIONS` is set to 600,000 (meeting OWASP's current recommendation for PBKDF2-HMAC-SHA256). In live Cloudflare Workers runtime (workerd) benchmarks, 600,000 iterations executes in ~221ms (compared to ~36ms at 100k, ~107ms at 300k, ~360ms at 1M, and ~724ms at 2M), fitting comfortably within Workers CPU budgets and keeping interactive response times snappy.
- **Zero-Downtime Transparent Migration:** Existing accounts stored with legacy 2-part or 100k/310k iteration hashes are verified at their stored cost. Upon successful authentication, `needsRehash` triggers an automatic, transparent background upgrade to 600,000 iterations in D1 without user disruption.

### 3.6 Dual-Layer Account-Keyed Rate Limiting & Cloudflare Proxy IP Extraction (HIGH-001 / FUNC-002)
- **Standardized Client IP Extraction (`getClientIp`):** IP extraction is standardized via `getClientIp(request, env)` in `functions/utils/rateLimit.js` and re-exported from `src/RateLimiter.js`. To ensure rate limiting accurately tracks individual clients behind Cloudflare edge proxies without grouping them under proxy IPs, `getClientIp` prioritizes `CF-Connecting-IP`. In Cloudflare production environments (`cf-ray` present or `ENVIRONMENT === 'production'`), spoofable reverse proxy headers (`X-Forwarded-For`, `X-Real-IP`, `X-Client-IP`) are strictly rejected if `CF-Connecting-IP` is absent to eliminate IP spoofing vulnerabilities. In local development environments, it falls back to standard reverse proxy headers (`X-Forwarded-For`, `X-Real-IP`, `X-Client-IP`) or socket connection properties, defaulting to `dev-unknown`.
- **Defense-in-Depth Against Distributed Attacks:** To defend against distributed credential stuffing and account enumeration across rotating or botnet IP addresses, critical authentication endpoints enforce a dual-layer rate limiting strategy:
  1. **IP-Level Limiting (First Gate):** Evaluated immediately at handler entry (`enforceRateLimit(context, '<endpoint>', max, window)`), extracting client IP via `getClientIp` and rejecting requests prior to body parsing or DB access.
  2. **Account-Level Limiting (Second Gate):** Evaluated immediately after request body parsing and email normalization (`cleanEmail`), before password verification or database lookups.
- **Prefix Isolation & Limits:**
  - `POST /api/auth/login`: IP limit `login:<ip>` (10 / 60s); Account limit `login-account:<cleanEmail>` (10 / 300s).
  - `POST /api/auth/forgot-password`: IP limit `forgot:<ip>` (5 / 600s); Account limit `forgot-account:<cleanEmail>` (5 / 600s).
  - `POST /api/auth/register`: IP limit `register:<ip>` (5 / 60s); Account limit `register-account:<cleanEmail>` (5 / 300s).
  - `POST /api/verify-sync-code`: IP limit `sync-code:<ip>` (5 / 300s); Account limit `sync-code-account:<userId>` (5 / 300s).
- **Uniform Error Taxonomy:** Both IP and account-keyed limits return identical HTTP 429 responses with `code: 'RATE_LIMITED'`, `Retry-After` header, and threaded `requestId`.

### 3.7 Cloudflare Turnstile Bot Protection & Server-Side Verification
- **CSP Allowlisting:** `challenges.cloudflare.com` is allowlisted in `buildCsp()` across `script-src`, `connect-src`, `img-src`, `frame-src`, and `child-src` to permit Turnstile challenges, iframe widgets, and Cloudflare WAF Managed Challenges.
- **Server-Side Validation:** When `env.TURNSTILE_SECRET_KEY` is provisioned, `POST /api/auth/login` and `POST /api/auth/register` execute server-side verification via `verifyTurnstile()` in `functions/utils/auth.js` against `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
- **Pre-Execution Gating:** Turnstile verification runs immediately after body parsing, prior to account-keyed rate limiting, database queries, and password hashing, protecting server compute from automated bot abuse. Requests with missing or invalid tokens are rejected with 400 `VALIDATION_ERROR`. When `TURNSTILE_SECRET_KEY` is unset, verification is skipped gracefully for development and test environments.

### 3.8 Centralized Public User Serialization & Safe Field Filtering (`toPublicUser`)
- **Credential Leak Prevention:** To eliminate accidental exposure of internal or cryptographic fields (`password_hash`, `security_answer_hash`, `token_version`), all user-facing JSON responses must serialize user records through the centralized `toPublicUser(user, overrides)` helper in `functions/utils/auth.js`.
- **Client-Safe Field Allowlist:** `toPublicUser` constructs a strictly filtered object containing only: `id`, `email`, `name`, `isAdmin` (role-derived boolean), `emailVerified`, `pendingEmail`, `securityQuestion`, and `hasSecurityQuestion`. Sensitive credentials and internal tokens are discarded even if explicitly passed in overrides.
- **Internal Database Scope:** `authenticate()` retains only client-safe fields and validation attributes (`status`, `token_version`) on internal user objects and strictly excludes `password_hash` and `security_answer_hash`. Handlers requiring credentials (`update-profile.js`, `reset-password.js`) query them directly from D1 on demand. Handlers never serialize raw `user` objects directly.
- **Enforced Route Modules:** `login.js`, `register.js`, `me.js`, `update-profile.js`, `confirm-email-change.js`, and `security-question.js` all serialize public responses via `toPublicUser`.
- **Automated CI/Build Guardrail:** A pre-build lint rule (`scripts/check-safe-serialization.js`) automatically validates all handler source files, failing the build and test suites if `password_hash` or `security_answer_hash` appears inside any `json(...)` or `Response` construction.

### 3.9 Unambiguous Session Issuance Signature (`issueSession(env, user, options = {})`)
- **Explicit Options Signature:** `issueSession(env, user, options = {})` enforces an explicit options object contract (`{ rememberMe: boolean }`) rather than positional argument inference (`arg3, arg4`), eliminating silent coercion and signature drift across login, registration, and session refresh flows.
- **Enforced Call Sites:** `login.js`, `register.js`, and `me.js` pass `{ rememberMe: Boolean(...) }` explicitly.

### 3.10 Authenticated User Session Cache (REM-17)
- **Short-TTL Cache Layer:** To eliminate redundant D1 SELECT queries on frequent polling endpoints (`/me`, `/security-question`, `/sync/restore`, `/sync/versions`), `authenticate()` incorporates a 60-second TTL cache layer keyed on `userId`.
- **Cached Field Allowlist:** Stores strictly non-sensitive validation attributes (`id`, `email`, `name`, `role`, `status`, `token_version`, `email_verified`, `pending_email`, `security_question`, `hasSecurityQuestion`). Sensitive credential hashes (`password_hash`, `security_answer_hash`) are strictly excluded from the cache.
- **Multi-Tier Resolution:** Cache resolution probes Cloudflare KV (`USER_CACHE` / `RATE_LIMIT_KV`), Cloudflare Cache API (`caches.default`), and in-memory Map fallback.
- **Immediate Write Invalidation:** Cache entries are invalidated immediately via `invalidateCachedUser(userId, env)` on any write modifying user status, credentials, or session versions (`admin/user-status.js`, `auth/logout.js`, `auth/confirm-email-change.js`, `auth/reset-password.js`, `auth/update-profile.js`, and `auth/verify-email.js`).

### 3.11 Admin Statistics Bounded Queries & Rate Limiting (REM-19)
- **Rate Limit Enforcement:** `GET /api/admin/stats` enforces rate limiting via `enforceRateLimit(context, 'admin-stats', 30, 60)`, rejecting excessive admin analytics requests with HTTP 429.
- **Explicit Query Bounds:** `user_backups` query includes an explicit `LIMIT 1000` ceiling, matching the `users` query limit to ensure memory consumption and execution duration remain bounded as user count expands.

### 3.12 Distinct Error Taxonomy for Suspended Accounts (REM-21)
- **Distinct Error Code (`ACCOUNT_SUSPENDED`):** Suspended users receive HTTP 403 with `code: 'ACCOUNT_SUSPENDED'`, strictly distinct from unauthenticated responses (HTTP 401 `UNAUTHORIZED`) or session timeouts (HTTP 401 `SESSION_EXPIRED`).
- **Enforced Handlers:** `authenticate()` in `functions/utils/auth.js` and login in `functions/api/auth/login.js`.
- **Frontend Separation:** Prevents client-side routers from misinterpreting administrative suspension as an expired session or prompting users with misleading login forms.

### 3.13 Accepted Registration Enumeration Tradeoff
- **Accepted Tradeoff:** `POST /api/auth/register` returns HTTP 409 Conflict with a neutral message (`That email address cannot be registered.`) when attempting to register an existing email, rather than returning a generic 201 response.
- **Architectural Rationale:** Unlike login and password reset (which use generic, non-revealing responses), registration immediately issues an active authenticated session and HttpOnly cookies on HTTP 201. Emitting a generic 201 without issuing a session would desynchronize frontend SPA session initialization (`AuthContext.jsx`), require degrading registration UX to an asynchronous multi-step email verification loop, or risk security flaws.
- **Enumeration Defense-in-Depth:** Account enumeration via registration is mitigated by mandatory Cloudflare Turnstile bot verification before DB execution, IP-level rate limiting (5 / 60s), and account-level rate limiting on `cleanEmail` (5 / 300s).

---

## 4. State Management & Data Sync

- **Provider Tree:**
  `<AuthProvider>` -> `<BudgetMetadataProvider>` -> `<LedgerDataProvider>` -> `<MainContent>`
- **Composite Hook:** `useBudget()` composes metadata and ledger contexts via `useMemo`.
- **Cloud Sync:** Atomic CAS upsert in D1 with 10-version snapshot history (`user_backup_versions`), baseVersion optimistic concurrency checks, and 10% suspicious payload threshold guards.
- **Suspicious Shrink Optimization (`data_byte_length`):** The `user_backups` table tracks `data_byte_length INTEGER` alongside `data`. The `handleSyncBackup` handler queries only `updated_at, updated_at_ms, data_byte_length` for version checks and size comparisons, avoiding fetching and transmitting the multi-megabyte `data` column blob on routine saves. Full `data` is queried strictly on conflict branches (`storedVersion > baseVersion` and concurrent write collisions) to populate `serverData`. Migration `0007_backup_data_byte_length.sql` backfills `data_byte_length` across stored backup records.
- **Byte-Accurate Sync Payload Measurement via TextEncoder (REM-20):** In `handleSyncBackup` and `handleSyncRestoreVersion`, payload size is computed using `new TextEncoder().encode(dataStr).length` rather than UTF-16 unit count (`dataStr.length`). `data_byte_length` and suspicious shrink comparison (10% threshold) operate on exact UTF-8 byte counts, preventing edge-case size discrepancies with multi-byte Unicode or emoji characters.
- **ETag & Conditional 304 Polling Support (REM-18):**
  - `/api/sync/restore` generates ETag `"backup-${version}"` derived from `updated_at_ms`. When incoming `If-None-Match` matches, the worker returns HTTP 304 Not Modified with no response body, skipping JSON serialization and data transfer entirely.
  - `/api/sync/versions` generates ETag `"versions-${latestSavedAt}-${count}"`. On matching `If-None-Match`, returns HTTP 304 Not Modified.
  - Both endpoints set `Cache-Control: no-store` so sensitive personal financial data is never cached by intermediaries or shared browser caches while permitting client-side conditional polling.
- **Cloud Sync Payload Schema Validation & Security Guardrails (`validateBudgetPayload`):**
  - **Fail-Closed Top-Level Key Rejection:** `validateBudgetPayload` strictly enforces an allowlist of known top-level budget keys (`accounts`, `people`, `bills`, `transactions`, `lineItems`, `fundingGoals`, `loans`, `loan`, `dailyMatrix`, `dashboardWidgets`, `theme`, `hideDashboardHeader`, `categories`). Unknown top-level keys are rejected immediately with HTTP 400 `VALIDATION_ERROR` ("Invalid backup payload.") before any database queries execute. The decision to reject unknown keys (rather than silently strip them) eliminates arbitrary data injection, prevents silent data corruption, and provides immediate, deterministic client feedback.
  - **Strict Type Checking:** Validates that arrays are true arrays, numbers are finite (`Number.isFinite`), booleans are booleans, and objects are plain non-array objects across all top-level and nested item attributes.
  - **Nested Collection & Pathological Shape Bounds:** Imposes strict collection count ceilings (`MAX_TRANSACTIONS = 25000`, `MAX_LINE_ITEMS = 10000`, `MAX_BILLS = 1000`, `MAX_ACCOUNTS = 200`, `MAX_FUNDING_GOALS = 500`, `MAX_DAILY_MATRIX_KEYS = 25000`, `MAX_LOANS = 100`, `MAX_DASHBOARD_WIDGETS = 100`, `MAX_CATEGORIES = 500`) to prevent pathological payload shapes and CPU denial-of-service within the 2MB body limit.
  - **String Length Limits:** Enforces length boundaries on every string field (`MAX_ID_LEN = 128`, `MAX_NAME_LEN = 255`, `MAX_TEXT_LEN = 2000`, `MAX_SHORT_STR_LEN = 100`), preventing payload bloat and stored XSS vectors if string values are rendered unescaped on downstream client devices.
- **Cloud Vault Passcode Gate (`/api/verify-sync-code`):**
  - **Authenticated Gate:** Requires a valid authenticated session (`authenticate` with `requireCsrf: true`). Unauthenticated requests are rejected with 401 UNAUTHORIZED before any passcode comparison runs.
  - **Dual Rate Limiting:** Enforces both per-IP rate limiting (5 attempts / 300s) and per-account rate limiting (5 attempts / 300s keyed on `auth.user.id`) to stop distributed brute force attacks against individual accounts.
  - **Constant-Time Verification:** Uses `constantTimeStringEqual` against `SYNC_UNLOCK_CODE`. Fails closed with 503 SERVICE_UNAVAILABLE if `SYNC_UNLOCK_CODE` is unconfigured.
