# TechTrekGT Wayfinder Guide: Architectural & Feature Audit Plan

- **Audit Scope**: `e:/TechTrekGT/wayfinder/` (Read-Only Audit)
- **Target Stack**: Pure JavaScript (JSX/ESM), React 19, Vite 6 (`base: '/wayfinder/'`), Tailwind CSS 3.4, Custom `pushState`/`popstate` SPA Router, React Context + Standard Hooks, Cloudflare Workers ESM (`nodejs_compat`) + D1 (`wayfinder-db`) + KV (`RATE_LIMIT_KV`)
- **Governance Baseline**: Grounded in `e:/TechTrekGT/docs/02_arch.md`, `e:/TechTrekGT/docs/04_state.md`, and `wayfinder/docs/01_identity.md` through `04_state.md`

---

## Executive Summary

The TechTrekGT Wayfinder application has a strong core foundation: modular Cloudflare Worker routing (`src/worker.js`), strict `agendaAccess.js` tenant isolation helpers, widespread use of parameterized D1 SQLite queries (`?` + `.bind()`), 140 coordinate-backed POIs across 5 Polish cities in `src/data/poland-2026.js`, zero missing or unused city images across all 161 `/Poland-2026/images/` files on disk, an iOS-compatible IndexedDB vault (`src/utils/documentStorage.js`), and a custom `mutationQueue.js` offline replay mechanism.

However, the audit identified several high-severity security, privacy, correctness, and contract drift gaps:
1. **Unauthenticated Exposure of Private Confirmation PDFs & PII**: Three real booking confirmation PDFs live inside `public/Poland-2026/docs/` (served publicly via `env.ASSETS` without auth), and personal PNRs (`GUDI3J`, `GYG7VKK692WY`, `WN 71563945`), traveler names (`Ronald Milton Few`, `Jonathan Kemp`), and mock fixtures are hardcoded across `src/data/poland-2026.js`, `DocumentCenter.jsx`, `DocumentViewerModal.jsx`, `PrivateBookingCard.jsx`, `CityHotelsTab.jsx`, `ExpenseLedger.jsx`, `email-worker.js`, `gemini-parser.js`, and `import-jobs.js`.
2. **SSO & Revocation Drift**: JWT issuance (`login.js`, `register.js`) omits `users.token_version` (`tv`), `requireAuth` and `me.js` omit D1 `token_version` and `status` checks, `verifyAdminCaller`/`isPlatformAdmin` trust JWT role flags without D1 verification, `reset-password.js`/`logout.js` never bump `token_version`, `getTokenFromRequest` omits multi-cookie resolution, and cookie clearing mixes `SameSite=Lax` vs `SameSite=Strict`.
3. **External Proxy & Geo Verification Gaps**: `exchange-rate.js` proxies `open.er-api.com` instead of the documented NBP Web API (`api.nbp.pl`), lacks caching, and returns HTTP `500` on upstream errors; `weather.js` lacks `AbortSignal.timeout`, truncates days 29-31 in archive fetches, and uses an unbounded `Map`; zero POIs in `poland-2026.js` carry Geoapify + Google Places dual-verification provenance metadata and no verification tooling exists in `wayfinder/scripts/`.
4. **Frontend React & Offline Edge Cases**: Three city tabs (`CityAttractionsTab.jsx`, `CityFoodTab.jsx`, `CityMarketsTab.jsx`) invoke hooks conditionally after `if (...) return null;`, `App.jsx` performs `window.history.replaceState` during render and drops URL hashes from `currentPath`, `replayQueue` drops offline mutations on HTTP `401`, and `PackingManager.jsx` discards pending debounced edits on unmount.

---

## Findings & Recommendations by Domain (Ranked by Impact & Implementation Risk)

Every recommendation below is ranked using:
- **Impact**: `Critical` | `High` | `Medium` | `Low`
- **Implementation Risk**: `Low` (isolated change, easily reversible) | `Medium` (cross-module or schema coordination) | `High` (touches auth session lifecycle, data migration, or parser behavior)

---

### Domain 1: Edge Worker, Auth & D1 Persistence

#### 1.1 Enforce `users.token_version`, Account Status & Admin DB Verification on Every Privileged Request
- **Rank**: Impact: `Critical` | Risk: `Medium`
- **Observed Evidence**:
  - `functions/api/auth/login.js` (`login.js:87-91`) and `register.js` (`register.js:171`) sign JWTs without the `tv: user.token_version` claim (`register.js:111` also inserts `token_version = 0` while `schema-wayfinder.sql` defaults `token_version` to `1`).
  - `login.js:42` does not reject `user.status === 'Suspended'`.
  - `src/worker.js:84-101` (`requireAuth`) and `functions/api/auth/me.js:36` do not compare JWT `tv` against `users.token_version` or verify `users.status !== 'Suspended'`; `me.js` also falls back to JWT claims if the D1 lookup returns null/errors.
  - `functions/api/auth/logout.js:1-18` ignores `{ all: true }` and never increments `token_version`; `functions/api/auth/reset-password.js` never increments `token_version`.
  - `functions/api/wayfinder/admin.js:17` (`verifyAdminCaller`) and `functions/utils/agendaAccess.js:50` (`isPlatformAdmin`) immediately return `true` if `user.isAdmin === true || user.role === 'admin'` inside the JWT without verifying current `users.role`/`is_admin`/`status` in D1.
- **Recommendation**:
  1. Standardize `register.js` to insert `token_version = 1` and sign `tv: user.token_version ?? 1` in both `login.js` and `register.js`.
  2. Reject `status === 'Suspended'` at login (`403`) and inside `requireAuth` (checking `SELECT id, status, role, is_admin, token_version FROM users WHERE id = ?` in D1 when authenticating protected or admin routes, or caching revocation check carefully per request).
  3. Update `reset-password.js` to increment `token_version = COALESCE(token_version, 1) + 1` atomically in `env.DB.batch()`, and support `logout.js` `{ all: true }` incrementing `token_version`.
  4. Remove JWT-only early return in `verifyAdminCaller` and `isPlatformAdmin`; always confirm active admin privileges and non-suspended status from D1 `users`.

#### 1.2 Align Cookie Clearing (`SameSite=Strict`), Multi-Cookie Resolution & Single-Credential Invariant
- **Rank**: Impact: `High` | Risk: `Low`
- **Observed Evidence**:
  - `src/worker.js:90` and `functions/api/auth/me.js:21` clear `auth_token` with `SameSite=Lax`, conflicting with the canonical `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` specification.
  - `functions/utils/auth.js:175-193` (`getTokenFromRequest`) reads only the first `auth_token` match via regex instead of checking all `auth_token` cookies (multi-cookie mismatch across `/`, `/wayfinder`) and does not reject simultaneous Cookie + `Authorization: Bearer` headers.
  - `src/worker.js` does not attach `corsHeaders` or `addSecurityHeaders` to API JSON responses (only to OPTIONS preflight and `env.ASSETS` asset responses), and `src/worker.js:167-171` catches/ignores `requireAuth` failure on `GET /api/wayfinder/expenses` instead of rejecting unauthenticated callers or cleanly enforcing an explicit policy.
- **Recommendation**:
  1. Create a shared cookie helper (`buildAuthCookieHeader` / `buildClearCookieHeader`) using `HttpOnly; Secure; SameSite=Strict; Path=/` (matching local dev vs production cleanly) and apply it across `login.js`, `register.js`, `logout.js`, `me.js`, `delete-account.js`, and `src/worker.js`.
  2. Implement `getAllTokensFromRequest(request)` and enforce single-credential validation (rejecting requests providing conflicting Cookie + Bearer tokens unless explicitly exempted).
  3. Wrap all Worker responses (including API JSON and 401/403/500 responses) with `addSecurityHeaders()` + strict origin-validated `corsHeaders` + `Vary: Origin`.

#### 1.3 Fix D1 Transaction Atomicity, FK Constraints, Bind Limits & Schema Drift
- **Rank**: Impact: `High` | Risk: `Medium`
- **Observed Evidence**:
  - `functions/api/auth/reset-password.js:64-100` stores raw hex reset tokens (rather than SHA-256/HMAC hashes), skips `attempts` limit checks, and runs two separate non-atomic `.run()` statements to update `password_hash` and mark `used = 1`.
  - `functions/utils/deleteAccount.js:68` writes `user_id = 'system'` into `wayfinder_audit_events`, which has `FOREIGN KEY (user_id) REFERENCES users(id)` in `schema-wayfinder.sql:294`; line 57 deletes only `visibility = 'private'` itinerary rows.
  - `functions/api/wayfinder/import-jobs.js` executes `UPDATE wayfinder_extraction_jobs` and `UPDATE wayfinder_documents` outside the `env.DB.batch()` statement list used for `wayfinder_extracted_fields`.
  - `functions/api/wayfinder/accommodations.js:68`, `expenses.js:149`, and `packing.js:213` build `IN (?, ...)` queries dynamically without chunking at D1's 100 bind-parameter ceiling.
  - `functions/api/wayfinder/expenses.js` inserts raw `journeyId` (slug) in `POST` paths (`205`, `385`, `455`) while `GET`/`PUT`/`DELETE` paths (`225`, `245`, `251`, `505`, `627`) query `journey_id = ?` with `journey.id`.
  - `functions/api/wayfinder/agenda-shares.js:68` and `journeys.js:8` invoke DDL `ensureShareTables(env.DB)` on every `GET` request, increasing latency and write contention.
  - `schema-wayfinder.sql` defines `wayfinder_calendar_tokens.token`, whereas `wayfinder/docs/04_state.md` documents `feed_token`.
- **Recommendation**:
  1. Hash password reset tokens (`hmacHex`/`sha256Hex`) before storage, enforce `attempts < 5` throttling, and combine `users.password_hash`, `token_version` increment, and `password_resets.used = 1` into one `env.DB.batch()`.
  2. Fix `deleteAccount.js` by inserting `NULL` (after making `wayfinder_audit_events.user_id` nullable or auditing under `admin` / nullable system actor) and explicitly scrubbing/reassigning owned non-private rows consistently.
  3. Consolidate `import-jobs.js` field writes + job/document status updates into one `env.DB.batch()`.
  4. Introduce a `chunkArray(ids, 80)` helper for all D1 `IN (...)` queries.
  5. Canonicalize `journey.id` across `expenses.js` (resolve `journey` first and consistently store/query `journey.id`).
  6. Remove hot-path `CREATE TABLE IF NOT EXISTS` DDL calls from `GET` endpoints in `agenda-shares.js` and `journeys.js`; move schema initialization exclusively to migrations (`schema-wayfinder.sql`).

#### 1.4 Complete Missing REST Methods & Sanitize Error Propagation
- **Rank**: Impact: `Medium` | Risk: `Low`
- **Observed Evidence**:
  - `functions/api/wayfinder/itinerary.js` only implements `GET`, `POST`, and `DELETE`; inline editing (`PUT`/`PATCH`) of itinerary times, notes, or locations is missing.
  - `expenses.js:641`, `packing.js:469`, and `calendar.js:702` return raw `err.message` strings in 500 JSON responses, leaking internal D1/SQLite errors.
  - `documents.js:65-75` does not stream/hash `multipart/form-data` uploads when computing `file_hash` (SHA-256 deduplication is bypassed for multipart uploads).
- **Recommendation**:
  1. Add `PUT /api/wayfinder/itinerary/:id` with `canEdit(role)` validation, allowlisted editable fields, and `itinerary_updated` audit events.
  2. Replace raw `err.message` HTTP 500 bodies with generic client-safe messages while logging full diagnostics server-side (`console.error` with request ID).
  3. Compute SHA-256 `file_hash` from uploaded file bytes on both JSON and `multipart/form-data` paths in `documents.js`.

---

### Domain 2: Email Ingestion & Parser Pipeline

#### 2.1 Remove Hardcoded Personal Bookings & Mock Parsers Across Backend & Client
- **Rank**: Impact: `Critical` | Risk: `Medium`
- **Observed Evidence**:
  - `functions/api/wayfinder/email-worker.js`: `parseGetYourGuideEmail` hardcodes `'Mr.Shuttle'`, `localTime = '06:30'`, `'GYG7VKK692WY'`, `visitor_id=H2Z77FVCVCDZ2HHK7HDV52IYZU3RF8IL`, bag notice, `'2026-12-06'`, and `284.76 USD`; lines `788`, `808`, `813` hardcode `'Jonathan Kemp'` and `'usr-ronald-few'` / `'Ronald Milton Few'`.
  - `functions/api/wayfinder/gemini-parser.js:952-1075`: `heuristicParseDocument` embeds personal confirmation codes, dates, and prices.
  - `functions/api/wayfinder/import-jobs.js:514`: hardcodes `'usr-ronald-few'` as fallback payer/participant.
  - `src/components/DocumentCenter.jsx`: `simulateExtraction(file)` (`14-158`) generates hardcoded fake/personal hotel, train, flight, restaurant, and tour fields and runs automatically whenever Gemini parsing fails (`411-414`); `displayDocuments` (`616-637`) injects personal Delta & GetYourGuide documents whenever a user has zero uploaded documents.
- **Recommendation**:
  1. Strip all hardcoded personal confirmations, names, UUIDs, and static itinerary mock rows from `email-worker.js`, `gemini-parser.js`, `import-jobs.js`, and `DocumentCenter.jsx`.
  2. Rewrite `parseGetYourGuideEmail` to extract booking reference, tour title, date/time, supplier, amount, and meeting point dynamically from MIME email text/HTML with regex/DOM heuristics, flagging uncertain fields as `confidence: 'low'` and status `needs_review`.
  3. On `parseDocument` failure in `DocumentCenter.jsx`, surface an explicit `needs_review` empty/partial form rather than fabricating fake bookings via `simulateExtraction`.

#### 2.2 Fix UTF-8 Polish Diacritic Corruption, LF MIME Streams & Multi-Attachment Handling in `email-worker.js`
- **Rank**: Impact: `High` | Risk: `Low`
- **Observed Evidence**:
  - `email-worker.js` uses `atob` (`decodeBase64Url`) and `String.fromCharCode(parseInt(hex, 16))` (`decodeQP`), corrupting multi-byte UTF-8 Polish characters (`ł`, `ż`, `ó`, `ą`, `ę`, `ś`, `ć`, `ń`).
  - Header/body separation uses `indexOf('\r\n\r\n')`, which fails on Unix/LF-normalized streams (`\n\n`).
  - Only `attachments[0]` metadata is saved (`sizeBytes: bodyBlock.length`, i.e., base64 length rather than decoded byte length), and attachment binary content is discarded before `parseBookingDocument` can inspect attached PDF confirmations.
- **Recommendation**:
  1. Decode Base64 and Quoted-Printable payloads into `Uint8Array` bytes first, then decode using `new TextDecoder(charset || 'utf-8', { fatal: false })` (respecting MIME `Content-Type; charset=...` headers).
  2. Split MIME headers using `/\r?\n\r?\n/` so both CRLF and LF email relays parse reliably.
  3. Iterate all PDF/image/ICS attachments, decode raw bytes accurately to compute SHA-256 `file_hash` and true byte length, and pass PDF attachment bytes/extracted text directly into `parseBookingDocument()`.

#### 2.3 Harden Deduplication (`Message-ID` + Multi-Leg PNR Safety) & Failure Recovery
- **Rank**: Impact: `High` | Risk: `Medium`
- **Observed Evidence**:
  - `email-worker.js:618-635` deduplicates only by `confirmation_number` OR `(title, local_date)` without checking RFC 5322 `Message-ID` or payload SHA-256. Multi-leg airline or rail PNRs (e.g., outbound + return flights sharing one confirmation code) risk overwriting or dropping secondary legs.
  - `email-worker.js:824` silently swallows top-level inbound email processing exceptions without recording a failed extraction/audit record or dead-letter notification.
- **Recommendation**:
  1. Store normalized `Message-ID` + attachment/body SHA-256 hash in `wayfinder_documents.file_hash` / `wayfinder_audit_events` for exact idempotency against retried Cloudflare email deliveries.
  2. Key itinerary item upsert/dedupe on composite `(journey_id, confirmation_number, local_date, local_time, title)` so multi-leg PNRs create distinct timeline segments.
  3. On unhandled `handleInboundEmail` failure, persist a `failed` document/import job + `wayfinder_audit_events` row scoped to `inbox.user_id` so travelers see failed forwardings in Document Center and can retry.

#### 2.4 Isolate Gemini Credentials & Modernize Model Resolution in `gemini-parser.js`
- **Rank**: Impact: `Medium` | Risk: `Low`
- **Observed Evidence**:
  - `gemini-parser.js:1186,1241` falls back to `env.GOOGLE_MAPS_API_KEY` as a Gemini API key, risking unintended Google Maps key quota exhaustion or 403 restriction failures when Maps keys are HTTP-referrer/API-restricted.
  - Line `1193` targets `gemini-3.5-flash` statically without configurable fallback or `AbortSignal.timeout`.
- **Recommendation**:
  1. Restrict Gemini API resolution strictly to `env.GEMINI_API_KEY` (or explicit `env.GOOGLE_AI_API_KEY`) and remove `env.GOOGLE_MAPS_API_KEY` fallback.
  2. Make model selection configurable via `env.GEMINI_MODEL` (defaulting to current GA Flash model) with an `AbortSignal.timeout(20000)` guard and clean fallback to deterministic heuristic extraction (`needs_review`).

---

### Domain 3: Geospatial Verification & External Proxies

#### 3.1 Implement Automated Geoapify + Google Places Dual-Verification Pipeline (`< 250m` Delta)
- **Rank**: Impact: `High` | Risk: `Low`
- **Observed Evidence**:
  - While all 140 POIs (`50` `mustSee`, `13` `markets`, `37` `restaurantsDetailed`, `28` `drinksDetailed`, `12` `cafesDetailed`) across all 5 cities in `poland-2026.js` contain valid coordinates (`lat`/`lng` within Poland bounds), addresses, and local image paths, **0 POIs** store dual-verification provenance (`geoapifyId`, `googlePlaceId`, `coordDeltaMeters`, `verifiedAt`).
  - Zero scripts in `wayfinder/scripts/` or Worker endpoints query `api.geoapify.com` or `places.googleapis.com` to enforce the `< 250m` dual-verification rule.
  - Each city still contains a legacy `city.restaurants` array with inconsistent formats (`krakow.restaurants` is 4 objects missing coords/images; `wroclaw`/`poznan`/`torun`/`gdansk` `restaurants` are string arrays).
- **Recommendation**:
  1. Add a read-only/offline Node.js verification script (`scripts/verify-pois-dual-geo.mjs`) using `GEOAPIFY_API_KEY` and `GOOGLE_MAPS_API_KEY` from `.dev.vars` to cross-verify every POI in `poland-2026.js`, calculate Haversine coordinate delta (`< 250m`), verify venue status, and write/validate provenance metadata (`verification: { geoapifyId, googlePlaceId, deltaMeters, verifiedAt }`) inside `poland-2026.js`.
  2. Deprecate and consolidate `city.restaurants` into `restaurantsDetailed` (migrating any unique entries through dual verification) and update `CityPage.jsx:385` tab visibility checks to inspect `restaurantsDetailed`/`drinksDetailed`/`cafesDetailed`.

#### 3.2 Migrate FX Proxy to National Bank of Poland (`api.nbp.pl`), Add Caching & Unify Rates
- **Rank**: Impact: `High` | Risk: `Low`
- **Observed Evidence**:
  - `functions/api/wayfinder/exchange-rate.js` calls `https://open.er-api.com/v6/latest/USD` instead of the documented NBP Web API (`https://api.nbp.pl/api/exchangerates/tables/A/?format=json`), has no Cloudflare Cache API (`caches.default`) or isolate cache, and returns HTTP `500` on upstream failure instead of cached/fallback HTTP `200`.
  - Default FX rates diverge across the codebase: `exchange-rate.js` and `useExchangeRate.js` use `usdToPln: 3.73`, while `src/utils/expenseLedger.js` uses `DEFAULT_EXCHANGE_RATES` (`USD: 4.0, EUR: 4.3, GBP: 5.15`), and `ExpenseLedger.jsx` never passes live rates into `calculateSettleUp()` or `convertCurrency()`.
  - `CurrencyConverterModal.jsx:118,158` hardcodes `"USD"` labels even when `SettingsContext.currency` is `EUR`, `GBP`, or `PLN`.
- **Recommendation**:
  1. Refactor `exchange-rate.js` to fetch official mid-rates from `api.nbp.pl` (`Table A` JSON) with `AbortSignal.timeout(5000)`, compute `PLN`, `USD`, `EUR`, and `GBP` cross-rates cleanly, cache in `caches.default` (TTL 6 hours, `stale-while-revalidate`), and return HTTP `200` with `source: 'fallback'` / `stale: true` if upstream fails.
  2. Pass live rates from `useExchangeRate()` into `ExpenseLedger.jsx` calculations (`convertCurrency`/`calculateSettleUp`), remove hardcoded `USD` labels in `CurrencyConverterModal.jsx` in favor of `activeCurrency.baseCode`, and unify static fallback defaults via one shared constant.

#### 3.3 Harden Weather Proxy Timeout, Cache Bounds & Date Edge Cases
- **Rank**: Impact: `Medium` | Risk: `Low`
- **Observed Evidence**:
  - `functions/api/wayfinder/weather.js:154,244` makes external `fetch()` calls to Open-Meteo without `AbortSignal.timeout`.
  - `weather.js:46` uses an unbounded module-level `memoryCache = new Map()`, allowing arbitrary `lat`/`lng`/`date` query parameters to grow isolate memory without eviction.
  - `weather.js:145` evaluates `new Date(dateParam + 'T12:00:00Z')` without regex validation (`Invalid Date` yields `NaN` comparisons).
  - `weather.js:238` clamps archive queries with `Math.min(28, targetDay + 2)`, truncating days 29-31 in historical climate lookups.
- **Recommendation**:
  1. Validate `dateParam` (`YYYY-MM-DD`) and quantize `lat`/`lng` to 2 decimal places (`~1.1 km` grid) before caching/fetching; enforce a bounded LRU/FIFO cap (e.g., 100 entries) plus Cloudflare `caches.default`.
  2. Add `signal: AbortSignal.timeout(5000)` to both forecast and archive `fetch()` calls, gracefully returning the existing static winter climate fallback on timeout.
  3. Compute month-end calendar days dynamically (`new Date(Date.UTC(year, month, 0)).getUTCDate()`) instead of hardcoding `28`.

#### 3.4 Remove Private Flight Confirmation Overlays from Public `poland-2026.js`
- **Rank**: Impact: `Critical` | Risk: `Low`
- **Observed Evidence**:
  - `src/data/poland-2026.js:5288-5317` exports `confirmedFlightEvents` containing live PNR `"GUDI3J"`, traveler full names (`Ronald Milton Few`, `Jonathan Kemp`), and `"Poland_Delta.pdf"`, while `flightArrival` (`poland-2026.js:24-25`) embeds `"documentPath": "/Poland-2026/docs/Poland_Delta.pdf"`. Because `poland-2026.js` is bundled into public JS assets, this private data is shipped unauthenticated to every visitor.
- **Recommendation**:
  1. Delete `confirmedFlightEvents` and `documentFilename`/`documentPath` from `src/data/poland-2026.js`, keeping only generic public airport arrival guidance (`Kraków Airport (KRK)` + `SKA1` commuter rail timing).
  2. Serve private confirmed flight overlays exclusively from authenticated D1 `wayfinder_itinerary_items` via `/api/wayfinder/itinerary`.

---

### Domain 4: Frontend State, Routing & Asset Pipeline

#### 4.1 Eliminate Public Static Booking PDFs & Standardize Asset Hierarchy
- **Rank**: Impact: `Critical` | Risk: `Medium`
- **Observed Evidence**:
  - `public/Poland-2026/docs/` contains `GetYourGuide_Ticket_GYG7VKK692WY.pdf`, `Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`, and `Poland_Delta.pdf`. Vite copies these directly into `dist/client/Poland-2026/docs/`, making private tickets, confirmation codes, and passenger details accessible without authentication.
  - `DocumentCenter.jsx`, `DocumentViewerModal.jsx`, `PrivateBookingCard.jsx`, and `CityHotelsTab.jsx` contain hardcoded filename/PNR matching against these static `/Poland-2026/docs/*.pdf` URLs.
  - `public/Poland-2026/images/general/markets/poland-market.png` (referenced in `src/components/WayfinderLanding.jsx:4`) uses a `general` parent directory instead of a city name under the strict `public/Poland-2026/images/[city_name]/[category]/` rule.
- **Recommendation**:
  1. Remove `public/Poland-2026/docs/` from public static assets immediately; migrate private PDFs into authenticated storage (D1 chunked blob / R2 bucket bound to `techtrek-wayfinder`, gated by `requireAuth` + `resolveAgendaAccess` + `canViewSensitive(role)` on `/api/wayfinder/documents/:id/file`) while retaining client-side IndexedDB caching (`documentStorage.js`) for offline access.
  2. Remove all static `/Poland-2026/docs/` fallback branches from `DocumentCenter.jsx`, `DocumentViewerModal.jsx`, `PrivateBookingCard.jsx`, and `CityHotelsTab.jsx`, and remove the SPA fallback route in `App.jsx:158-174` once private file streaming is active.
  3. Relocate `public/Poland-2026/images/general/markets/poland-market.png` into the appropriate `[city]/markets/` folder (or a designated journey cover path if approved in Wayfinder asset rules) and update its reference.
  4. Revoke created blob URLs (`URL.revokeObjectURL`) cleanly on modal close / component unmount in `DocumentCenter.jsx` and `DocumentViewerModal.jsx`.

#### 4.2 Fix React Rules of Hooks Violations in City Sub-Tabs
- **Rank**: Impact: `High` | Risk: `Low`
- **Observed Evidence**:
  - `CityAttractionsTab.jsx:8-10` returns `null` if `!city.mustSee?.length` **before** calling `useState`, `useMemo`, and `React.useEffect`.
  - `CityFoodTab.jsx:19-21` calls `React.useEffect` **after** `if (!hasDetailed && ...) return null;`.
  - `CityMarketsTab.jsx:14-16` calls `React.useEffect` **after** `if (!city.markets?.length) return null;`.
- **Recommendation**:
  - Move all `useState`, `useMemo`, and `useEffect` calls to the top of `CityAttractionsTab.jsx`, `CityFoodTab.jsx`, and `CityMarketsTab.jsx` before any conditional early return.
  - Also standardize `CityPage.jsx:17` `activeMarketTab` state initialization (`0` vs `'all'`) so hash deep-linking in `CityMarketsTab.jsx:25` aligns consistently.

#### 4.3 Resolve Auth/Context Race Conditions, Dynamic Participants & 401 Cleanup
- **Rank**: Impact: `High` | Risk: `Medium`
- **Observed Evidence**:
  - `src/utils/api.js:28-38` (`apiFetch`) forces `'Content-Type': 'application/json'` even when `options.body instanceof FormData`, lacks `AbortSignal` passthrough, and has no centralized HTTP `401`/`403` handler to notify `AuthContext` when `token_version` or session expires.
  - `WayfinderContext.jsx`: triggers `fetchItinerary()` and `fetchAccommodations()` even when `agendaAccess.role === 'none'` (producing guaranteed 403s); does not attach `AbortController` to cancel stale fetches across fast login/logout flips; misses an automatic `refreshAgendaAccess()` call when `InviteClaim.jsx` completes `POST /api/wayfinder/invites/claim` (leading to a stale `"No Shared Agendas Linked"` notice until manual reload).
  - `PackingManager.jsx:173` performs a raw `fetch()` missing `credentials: 'include'`.
  - `AuthContext.jsx:181` redirects to `/wayfinder` on inactivity logout even when the user is viewing a public city guide page.
  - `ExpenseLedger.jsx:217-225,271` hardcodes two travelers (`currentUserId`/`usr-ronald-few`/`Ronald Milton Few` and `.includes('jon')` fallback) instead of reading collaborators from the agenda shares endpoint.
- **Recommendation**:
  1. Refactor `apiFetch` in `src/utils/api.js` to skip setting `Content-Type` when `options.body instanceof FormData`, route all authenticated app calls through `apiFetch`, and dispatch a `wayfinder:auth-expired` event on `401` (clearing `AuthContext` state cleanly and preserving current public route or opening `AuthModal` cleanly on protected routes).
  2. Guard `WayfinderContext.jsx` effects with `AbortController` + `agendaAccess.permissions.itinerary` before fetching private itinerary/accommodations, and invoke `refreshAgendaAccess()` directly inside `InviteClaim.jsx` upon successful invite claim before navigating to `/private`.
  3. Add a collaborator directory helper (`GET /api/wayfinder/agendas/:id/members` returning member `user_id` and `name` for `isMember(role)`) so `ExpenseLedger.jsx` and `PersonBreakdownPanel.jsx` dynamically support any shared agenda group without hardcoded user IDs or names.
  4. On inactivity timeout (`AuthContext.jsx`), clear auth state and open `AuthModal` only if on `/private` or `/admin`, leaving public city pages intact.

#### 4.4 Centralize Custom `pushState`/`popstate` Router & Eliminate Render Side Effects
- **Rank**: Impact: `Medium` | Risk: `Low`
- **Observed Evidence**:
  - `App.jsx` captures `window.location.pathname + window.location.search` without `window.location.hash` (leaving `currentPath.includes('#')` at line 27 non-functional), and executes `window.history.replaceState(...)` synchronously inside `renderRoute()` (lines 74, 86, 107, 124, 147, 166, 208, 229).
  - Fourteen+ components reimplement local `pushRoute(e, path)` wrappers (`Layout.jsx`, `BottomTabBar.jsx`, `ProtectedRoute.jsx`, `PrivateHub.jsx`, `PolandLanding.jsx`, `CityPage.jsx`, `ItineraryView.jsx`, etc.).
  - `ItineraryView.jsx:124-137` reads `?day=` on `popstate`, but does not reset `selectedDay` to `'all'` when `?day=` is absent.
  - `PrivateHub.jsx:123` renders 4-6 toolbar buttons with `shrink-0` on one row without `overflow-x-auto`, risking horizontal overflow on `375px` mobile viewports.
  - `Layout.jsx:83` checks `currentPath.startsWith('/wayfinder/poland-christmas-2026')` when deciding whether `#journey-sequence` is on the current page, matching city/practical sub-routes incorrectly.
- **Recommendation**:
  1. Extract a single pure-JS `src/utils/router.js` (`navigate(path, { replace })`, `getCurrentRoute()`, `isMainLandingPath(pathname)`) preserving `pathname + search + hash` in `App.jsx` state and moving all canonical alias redirects from `renderRoute()` into a `useEffect(..., [currentPath])`.
  2. Fix `ItineraryView.jsx` URL sync so clearing `?day=` resets `selectedDay` to `'all'`, and make `PrivateHub.jsx` sub-toolbar gracefully scrollable (`overflow-x-auto no-scrollbar max-w-full`).

---

### Domain 5: Lightweight UX, Filtering & Offline Resilience

#### 5.1 Prevent Silent Mutation Loss in Offline Queue & Debounced Timers
- **Rank**: Impact: `High` | Risk: `Medium`
- **Observed Evidence**:
  - `src/utils/mutationQueue.js:167-172` removes queued IndexedDB mutations on **any** HTTP `4xx` response including `401 Unauthorized`. If a traveler's session expires while offline in Poland, reconnecting silently deletes their pending packing/expense edits.
  - `PackingManager.jsx:48-55` clears pending `400ms` debounced `PUT` timers (`pendingPutTimersRef`) on unmount without flushing pending patches to `resilientFetch`, losing recent toggle/quantity edits when switching tabs rapidly.
  - `OfflineSyncBadge.jsx:69` hides all UI when online with `pendingCount === 0` and provides no surfacing for dropped/failed replay items.
  - `WayfinderContext.jsx:149-150` immediately triggers remote `fetchDocuments()`/`fetchJobs()` even when `resilientFetch` returns synthetic HTTP `202 { queued: true }`.
- **Recommendation**:
  1. In `mutationQueue.js`, treat HTTP `401` as a recoverable pause trigger (halt replay loop, emit `wayfinder:auth-expired` to prompt sign-in, and preserve queued items); move non-401 terminal `4xx` failures into an explicit `"Needs Attention"` state surfaced by `OfflineSyncBadge.jsx` rather than deleting silently.
  2. Add a unmount/visibilitychange flush helper in `PackingManager.jsx` so any pending `pendingPutPayloadsRef` patches immediately dispatch via `resilientFetch` before clearing timers.
  3. Check `data?.queued` after `resilientFetch` calls in `WayfinderContext.jsx` so offline optimistic state updates aren't overwritten by failing remote GETs.

#### 5.2 Add Zero-Dependency Search, Unified Bookmarks & Filter Ergonomics
- **Rank**: Impact: `Medium` | Risk: `Low`
- **Observed Evidence**:
  - `CityAttractionsTab.jsx`, `CityFoodTab.jsx`, and `CityMarketsTab.jsx` lack keyword search and `"Saved Only"` filtering; `ItineraryView.jsx` has city and day pills (`filteredDays`) but no activity/booking keyword search or item-type filter (`flight` / `rail` / `hotel` / `market`); `DocumentCenter.jsx` and `ExpenseLedger.jsx` lack search inputs.
  - `CityPage.jsx:23` saves bookmarked POIs exclusively to `localStorage('wayfinder_saved_items')`, isolated from `ItineraryView.jsx` and D1 `wayfinder_itinerary_items`.
  - `CityAttractionsTab.jsx:72` renders leftover placeholder copy: `"Curated Golden Component template"`.
- **Recommendation**:
  1. Add a lightweight reusable client search/filter hook/bar (pure React `useMemo` + `<input type="search">`) across City Sights, Food & Drink, Itinerary timeline, Documents, and Expense Ledger, plus a `"Saved Only"` toggle on city tabs and item-type chips in `ItineraryView.jsx`.
  2. Synchronize authenticated bookmarks (`toggleItinerary`) with `POST`/`DELETE /api/wayfinder/itinerary` (falling back to `localStorage` only for guest visitors).
  3. Remove the placeholder text `"Curated Golden Component template"` in `CityAttractionsTab.jsx:72`.

#### 5.3 Add Zero-Dependency Keyboard Shortcuts & Offline Read-Cache (SWR)
- **Rank**: Impact: `Medium` | Risk: `Low`
- **Observed Evidence**:
  - Global keyboard accessibility is minimal (`Escape` handlers exist in `CurrencyConverterModal.jsx`, `DocumentCenter.jsx`, `DocumentViewerModal.jsx`, `PersonBreakdownPanel.jsx`, `WeatherWidget.jsx`, and `RouteVisualization.jsx`, while `AuthModal.jsx`, `SettingsModal.jsx`, `ShareAgendaModal.jsx`, and `CalendarSubscribeModal.jsx` lack `Escape` close support and no navigation/search shortcuts exist).
  - `WayfinderContext.jsx` holds fetched `itinerary`, `accommodations`, `documents`, and `expenses` only in React memory; opening `/private` while completely offline in a train tunnel displays empty lists instead of last-known synced data.
- **Recommendation**:
  1. Add a lightweight `useEscapeKey` hook consistently to all modals (`AuthModal`, `SettingsModal`, `ShareAgendaModal`, `CalendarSubscribeModal`) and add input-safe keyboard shortcuts inside Wayfinder views (`/` focuses active view search, `[` / `]` or `j` / `k` step between Day 1-10 in `ItineraryView.jsx`, `?` toggles a compact shortcuts popover), ignoring keystrokes inside `input`/`textarea`/`select`.
  2. Persist a non-sensitive read-through SWR cache of user-scoped itinerary/packing/expense summaries in IndexedDB (`WayfinderDocumentDB`) keyed by `userId` (cleared immediately on logout or 401 revocation) so travelers maintain read/check-off access offline between cities.

---

## Phased Execution Roadmap

### Phase 1: Critical Security, Privacy & Auth Revocation (Do First)
1. Purge `public/Poland-2026/docs/*.pdf` from static assets; serve private documents via authenticated `/api/wayfinder/documents/:id/file` + IndexedDB.
2. Remove `confirmedFlightEvents`, personal PNRs (`GUDI3J`, `GYG7VKK692WY`, `WN 71563945`), passenger names (`Ronald Milton Few`, `Jonathan Kemp`), and `simulateExtraction`/`displayDocuments` fallbacks across `poland-2026.js`, `DocumentCenter.jsx`, `DocumentViewerModal.jsx`, `PrivateBookingCard.jsx`, `CityHotelsTab.jsx`, `RouteVisualization.jsx`, `ExpenseLedger.jsx`, `email-worker.js`, `gemini-parser.js`, and `import-jobs.js`.
3. Enforce `token_version` (`tv` claim), `status !== 'Suspended'`, D1-backed admin verification, `SameSite=Strict` clear-cookies, `getAllTokensFromRequest`, `password_resets` token hashing + batching, and global `401` handling in `apiFetch` / `AuthContext`.

### Phase 2: Backend Ingestion, Geo Dual-Verification & Proxy Compliance
1. Refactor `exchange-rate.js` to official NBP API (`api.nbp.pl`) + Cache API + graceful `200` fallback, and harden `weather.js` (`AbortSignal.timeout`, bounded cache, full month-end calculation).
2. Fix `email-worker.js` UTF-8 Polish decoding (`TextDecoder`), `\r?\n\r?\n` splitting, PDF attachment pass-through, `Message-ID` + multi-leg dedupe, and failed-email audit/recovery.
3. Add `scripts/verify-pois-dual-geo.mjs` using Geoapify + Google Places (`< 250m` delta) to stamp provenance on all POIs in `poland-2026.js`, retire `city.restaurants`, and relocate `poland-market.png` into the standard `[city]/[category]/` folder.
4. Fix `deleteAccount.js` FK audit constraint, `import-jobs.js` batch atomicity, `expenses.js` `journey.id` canonicalization, `IN (...)` chunking, and remove DDL from `GET` endpoints.

### Phase 3: Frontend Stability, Offline Durability & UX Polish
1. Fix Rules of Hooks ordering in `CityAttractionsTab.jsx`, `CityFoodTab.jsx`, and `CityMarketsTab.jsx`, fix `CityPage` `activeMarketTab`, clean up `URL.createObjectURL` leaks, and fix `PrivateHub.jsx` mobile toolbar scrolling.
2. Centralize `src/utils/router.js` (including `#hash` tracking and moving `replaceState` redirects into `useEffect`), fix `InviteClaim.jsx` + `WayfinderContext.jsx` role refresh race, and add `PUT /api/wayfinder/itinerary/:id`.
3. Harden `mutationQueue.js` `401` pause behavior + `PackingManager.jsx` unmount flush + dynamic agenda members in `ExpenseLedger.jsx`.
4. Add search inputs, item-type filters, `useEscapeKey` + input-safe shortcuts, synced bookmarks, and user-scoped offline IndexedDB read cache.

---

## Verification Plan (Post-Approval)

- **Existing Suite**: Run `node scripts/verify-email-verification.mjs`, `node scripts/verify-tenant-isolation.mjs`, and `node scripts/verify-import-parser.mjs`, expanding tests to cover `token_version` revocation, `Suspended` status rejection, UTF-8 Polish email MIME decoding, multi-leg PNR deduplication, and `deleteAccount` FK safety.
- **Asset & Geo Integrity**: Run the new `scripts/verify-pois-dual-geo.mjs` script plus an automated check asserting zero `/Poland-2026/docs/` static assets in `dist/client/` and 100% `public/Poland-2026/images/[city]/[category]/` compliance.
- **Build & Runtime Check**: Execute `npm run build` inside `e:/TechTrekGT/wayfinder/` (verifying zero Vite warnings/errors and clean `dist/client/` output) before deploying when implementation changes are approved.
