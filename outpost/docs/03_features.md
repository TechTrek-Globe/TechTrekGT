# Outpost Features Documentation

## Global Command Palette (Cmd+K / Ctrl+K) [ACTION ID: HIGH-001 / NAV-001]

The Global Command Palette provides keyboard-first rapid navigation and fuzzy search across Outpost routes, operational tools, and inventory items by SKU.

### Key Capabilities
1. **Keyboard-Driven Invocation**:
   - Shortcut: `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux).
   - Global event listener in `src/components/AppLayout.jsx` with input guards ensuring standard text input (typing 'k') never triggers the palette.
   - Interactive trigger buttons in desktop sidebar and mobile header for point-and-click accessibility.
2. **Fuzzy Search & Routing**:
   - Instant filtering across primary views: Dashboard, Inventory & Pricing, Sales Log, Settings, and Admin Controls.
   - Quick launcher for platform utilities: Finance Sync, Tax / Schedule C Report, Sync eBay Store, and TechTrekGT Launch Pad.
3. **Dynamic Remote SKU Search**:
   - Debounced (250ms) query against `GET /api/items/enriched?q=<query>&limit=8`.
   - In-flight request cancellation via `AbortController` and client-side memory caching to eliminate duplicate API requests.
   - Server-side rate limiting on `GET /api/items/enriched` when `q` is provided.
   - Selecting a SKU result navigates to `Inventory & Pricing` and sets the active search filter to the selected SKU/title.
4. **Developer-Tool Aesthetics & Accessibility**:
   - Backdrop blur (`backdrop-blur-md bg-slate-950/80`) with VS Code / Spotlight styling.
   - Full keyboard navigation: `↑` and `↓` arrow keys with auto-scroll into view, and `Enter` to execute.
   - `aria-modal="true"`, `role="dialog"`, auto-focus on search input upon opening, Tab focus trapping, and `Escape` dismissal.
   - Responsive full-screen width layout on mobile viewports.

## CSS Variables & Dynamic Design System [ACTION ID: HIGH-002 / UI-001]

The brand color palette has been refactored from hardcoded hex constants into root CSS custom properties with full opacity modifier support in Tailwind CSS.

### Key Capabilities
1. **Root CSS Custom Properties (`src/index.css`)**:
   - The brand amber palette (`50` through `900`) is declared under `:root` as space-separated RGB channel values (`--color-brand-50` through `--color-brand-900`).
   - Global design system tokens can be updated dynamically or overridden for alternate color profiles and theme switching.
2. **Tailwind Opacity Support (`tailwind.config.js`)**:
   - Palette colors are mapped using standard Tailwind `<alpha-value>` interpolation: `rgb(var(--color-brand-<shade>) / <alpha-value>)`.
   - Enables full utility class alpha modifiers across the entire application (e.g. `bg-brand-500/10`, `text-brand-400/90`, `border-brand-500/20`).
3. **Consolidated Design Utilities**:
   - Core utility classes (`.text-gradient-amber`, `.glow-amber`, `.glow-amber-sm`, `.bg-grid-pattern`, `.glass-card`, `.hover-border-amber`, and scrollbar styles) directly consume the `--color-brand-*` CSS custom properties, ensuring cohesive visual styling.

## Inline Grid Editing for Data Tables [ACTION ID: MED-001 / INT-001]

Spreadsheet-like inline grid editing enables rapid data entry directly within tabular views without requiring modal dialogues.

### Key Capabilities
1. **Interactive Triggering & Cell Transformation**:
   - Double-clicking or pressing `Enter` on focused editable cells transforms the cell into an active input field.
   - Smooth layout transition matches exact cell height (22px) and bounds to prevent layout shifts.
   - Pressing `Escape` cancels edits and reverts to previous values without saving.
   - Pressing `Enter` or blurring commits changes.
2. **Keyboard Navigation & Flow**:
   - Focusable cells via `tabIndex={0}` and `role="gridcell"`.
   - Pressing `Tab` while editing commits the current value and naturally advances focus to the adjacent editable cell across rows and columns.
3. **Optimistic UI Updates & Loading Telemetry**:
   - Local state updates immediately upon commit, automatically recalculating financial metrics (`net_proceeds`, `net_profit`, `roi_pct`) via `computeSaleMetrics` and updating summary cards.
   - Subtle animated `Loader2` spinner indicates in-flight network requests.
   - Reverts state and surfaces an error alert if the server update (`PUT /api/sales/:id`) fails.
4. **Validation & Mobile Fallback**:
   - Validates numeric inputs against bounds (non-negative numbers).
   - Viewport threshold check (`< 640px`) disables inline editing on small mobile devices, seamlessly delegating to the comprehensive edit modal.

## Backend Data Integrity and Error Handling Audit [ACTION ID: AUDIT-001]

Comprehensive audit and hardening of all serverless API mutation routes (`functions/api/**/*.js`) in Outpost to eliminate orphaned records, unhandled exceptions, and silent failures from incomplete Cloudflare D1 multi-step operations.

### Key Capabilities
1. **Compensating Rollback Handlers**:
   - Multi-step database operations that cannot be batched in a single atomic SQL call are protected by dedicated try/catch compensating logic.
   - If secondary inserts or external updates fail, compensating rollback SQL is executed (e.g., purging newly created records, rolling back item statuses from `'Sold'` to previous states, restoring pre-proration invoice state, or purging partial batches).
2. **Atomic Batch Mutations (`env.DB.batch`)**:
   - Replaced fragile sequential D1 queries with atomic `env.DB.batch(...)` calls for cascading operations:
     - `DELETE /api/sales/:id`: Atomically purges linked `ebay_fee_reconciliations`, deletes `auction_sales`, and reverts item status back to `'Listed'` or `'Available'`.
     - `DELETE /api/items/:id`: Atomically deletes associated `auction_comps` and the `auction_items` record.
     - `DELETE /api/invoices/:id`: Atomically deletes comps, items, and invoice records.
     - `POST /api/platforms` & `PUT /api/platforms/:id`: Atomically unsets default platform flags when setting a new default.
     - Password reset token invalidation and verification.
3. **Orphaned State Prevention in Batch & External Ingestion**:
   - `outpost/functions/api/import/batch.js`: Failure during replacement strategy now triggers `cleanupBatch`, which purges imported items/invoices and reverts any orphaned sold items back to `'Available'`, returning HTTP 500 instead of silent 200.
   - `outpost/functions/api/ebay/reconcile.js`: Injects compensating deletion and field restoration if reconciliation persistence fails.
   - `outpost/functions/api/sync/vinescout-catalog.js` & `outpost/functions/api/ebay/match-sold-vinescout.js`: Injects snapshot rollback of `auction_items` status and attributes if sales creation fails.
   - `outpost/functions/api/import/amazon.js` & `outpost/functions/api/import/amazon-url.js`: Deletes created `auction_invoices` if downstream item creation fails.
   - `outpost/functions/api/auth/register.js`: Purges created user and default platform rows if verification token generation fails.
4. **Standardized Error Handling & Response Sanitization**:
   - All failure paths return standardized JSON payloads `{ error: '...' }` with appropriate HTTP status codes (400, 401, 403, 404, 500) rather than hanging or returning 200 OK with empty/null bodies.
   - Internal error details and database driver exceptions are sanitized to avoid sensitive system leakage.

## Authentication and Security State Lifecycle Audit [ACTION ID: AUDIT-002]

Comprehensive audit and hardening of all authentication guards, JWT validation paths, and API integration key lifecycles to eliminate desynchronized security states and ensure immediate invalidation across clients and Cloudflare D1.

### Key Capabilities
1. **Immediate Invalidation & Client-Side Cookie Scrubbing (`requireAuth`)**:
   - Outdated `token_version` (incremented on password reset or logout-all) or expired tokens trigger explicit HTTP 401 Unauthorized responses.
   - 401 responses emit `Set-Cookie: auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` to immediately purge dead credentials from the client and prevent endless invalid background retries.
2. **Strict User Existence & Version Validation in Integration Resolvers (`resolveIntegrationUserId`)**:
   - Validates presented JWT session tokens against D1 user records, strictly enforcing `token_version` checks before granting access to integration endpoints (`/api/export/vinescout-sales`, `/api/export/vinescout-inventory`, `/api/import/amazon`).
   - Validates that API integration secrets (`api_integrations`) are not marked revoked (`revoked_at IS NULL`) and that the associated user exists.
   - Manually revoking an integration key in D1 immediately rejects subsequent requests with HTTP 401.
3. **Dead Credential Purging for Upstream Integrations**:
   - When eBay refresh tokens expire (`refreshExp < now`), the dead record is immediately purged from `ebay_oauth_tokens` across `ebayAuth.js` and `tokenHelper.js`, and `GET /api/ebay/oauth-status` returns `{ connected: false }`.
   - On HTTP 400/401 token refresh failures in `tokenHelper.js`, invalid credentials are automatically scrubbed from D1 to prevent persistent false "Connected" UI states.

## External API Synchronization & Webhook Resilience Audit [ACTION ID: AUDIT-003]

Comprehensive resilience hardening of all outbound platform integrations (eBay Trading/REST/Finances/Marketing APIs and Amazon scraping gateway) and inbound webhook ingestion to eliminate timeout risks, silent sync failures, and unhandled worker crashes.

### Key Capabilities
1. **Strict Fetch Timeouts (`fetchWithTimeout`)**:
   - Outbound external requests across eBay APIs, OAuth token refresh, and Amazon URL ingestion enforce a strict 15-second timeout via `AbortSignal.timeout` (or `AbortController` fallback).
   - Timeout errors are caught and transformed into structured `TimeoutError` exceptions (`statusCode: 504`, `isTimeout: true`) rather than crashing worker isolates or hanging indefinitely.
2. **Rate Limit (HTTP 429) & Transient Network Protection**:
   - Rate limiting and transient network errors on token refresh preserve stored credentials, preventing false token purges.
   - eBay Analytics and Listing sync endpoints catch 429 status codes, cleanly surfacing back-off instructions to the user.
3. **Conditional Sync Timestamping & Failure Tracking (`outpost_sync_history`)**:
   - Replaced unconditional updates to `last_ebay_sync_at` in `/api/ebay/sync-all`. The timestamp is updated ONLY upon complete, verified success.
   - Partial sync runs preserve previous successful sync timestamps, document `last_ebay_sync_status = 'partial'`, and record item-level failure breakdowns in `outpost_sync_history`.
   - Hard failures mark `last_ebay_sync_status = 'failed'` and record the exact error message.
4. **Resilient Webhook Ingestion & Malformed Payload Rejection**:
   - Webhook ingestion (`functions/api/ebay/webhook.js`) safely rejects unparseable raw bodies and unrecognized payload structures with HTTP 400 Bad Request without crashing the worker isolate.
   - Validated payloads are dispatched safely with fallback event logging (`processed = 2`) on processing errors.
5. **UI Sync State & Error Surfacing**:
   - `SettingsView.jsx` and `InventoryContext.jsx` consume `last_ebay_sync_status` and `last_ebay_sync_error`.
   - Renders distinctive failure and partial warning badges with specific error diagnostics, ensuring users are accurately informed rather than leaving UI components in stuck loading states.

## Frontend State and UI Consistency Audit [ACTION ID: AUDIT-004]

Audit and refactor of React context providers, hooks, and component lifecycles to eliminate stale data caching, false-positive success messages, and infinite rendering loops.

### Key Capabilities
1. **Centralized API Error Invariant (`auctionApi.js`)**:
   - `apiFetch` throws an Error whenever an API payload contains `{ success: false }`, even if the HTTP response code was 200 OK.
   - Prevents all caller components from assuming successful transactions or displaying false-positive toast confirmations.
2. **Race Condition Elimination with Request Latching**:
   - Monotonic request counters (`fetchRequestIdRef = useRef(0)`) implemented in `InventoryContext`, `SalesLogView`, and `CatalogSearchDropdown`.
   - Out-of-order responses from delayed network flights are dropped, ensuring newer search and filter queries always win.
3. **Session Cache Purging on Authentication Changes**:
   - Keyed `InventoryProvider` (`<InventoryProvider key={user?.id}>`) in `App.jsx` ensures complete teardown and re-initialization of inventory, platform, and sync state whenever authentication identity changes.
   - `AuthContext.jsx` registration workflow gates `setIsAuthenticated(true)` on `!data.verificationPending`.
4. **Guaranteed Loading State Recovery**:
   - All async mutation triggers (`isSubmitting`, `saving`, `isProcessing`, `finding`, `syncing`) implement guaranteed cleanup paths within `finally {}` blocks.
   - Disconnected network calls or server rejections reliably restore buttons to interactive states.
5. **Non-Blocking Error Presentation**:
   - Removed all browser `alert()` popups in favor of accessible, non-blocking component error states and warning alerts (`SettingsView`, `InventoryHubView`, `SalesLogView`, `QuickEditDrawer`, `PricingCard`, `ListingCopyModal`, `DelistPendingAlert`).
6. **Resilient Dependent Views (`DashboardView`)**:
   - Initial data fetch failures replace empty $0.00 zero-value skeleton widgets with an explicit connection error state and a manual retry button.

## Core eBay Sell APIs Reference & Protocol Matrix

The Outpost and Landing ecosystems integrate with the Core 6 eBay Sell API families for real-time inventory management, order fulfillment, payout reconciliation, listing traffic telemetry, and ad campaign margin calculations.

### 1. API Family Reference Matrix

| API Area | Primary Function | Ingestion & Processing Scope | Primary Endpoints & Scopes |
| :--- | :--- | :--- | :--- |
| Inventory API | Listings and stock | Pull stock levels, manage inventory records (aspects, condition, images), push custom HTML templates, publish fixed-price or auction offers, sync local SKUs. | /sell/inventory/v1/inventory_item, /sell/inventory/v1/offer. Scopes: sell.inventory, sell.inventory.readonly |
| Fulfillment API | Post-sale logistics | Ingest buyer shipping addresses, order lines, and payment statuses. Upload tracking numbers and fulfillments. Reconcile sold listings with Outpost sales records. | /sell/fulfillment/v1/order, /sell/fulfillment/v1/order/{id}/shipping_fulfillment. Scopes: sell.fulfillment, sell.fulfillment.readonly |
| Finances API | Revenue and costs | Ingest fee breakdowns (Final Value Fees, fixed order fees, regulatory operating fees), fetch shipping label costs, reconcile payouts and dispute deductions against COGS. | /sell/finances/v1/transaction, /sell/finances/v1/payout. Scopes: sell.finances, sell.finances.readonly |
| Analytics API | Performance metrics | Pull traffic reports (impressions, total views, click-through rates, conversion rates), monitor seller standards and customer service metrics. | /sell/analytics/v1/traffic_report, /sell/analytics/v1/customer_service_metric. Scope: sell.analytics.readonly |
| Account API | Store foundation | Ingest seller fulfillment policies (shipping services, handling time), return policies, and payment preferences. | /sell/account/v1/fulfillment_policy, /sell/account/v1/return_policy, /sell/account/v1/payment_policy. Scopes: sell.account, sell.account.readonly |
| Marketing API | Promoted listings | Query active Promoted Listings Standard ad rates and campaign IDs. Feed real-time ad fee rates into the Outpost Live Fee Engine to calculate net margins. | /sell/marketing/v1/ad_campaign, /sell/marketing/v1/ad_campaign/{id}/ad. Scopes: sell.marketing, sell.marketing.readonly |

### 2. Analytics API Critical Query Constraints
- Filter Nesting: The date_range MUST be passed inside the filter parameter: filter=marketplace_ids:{EBAY_US},listing_ids:{ID},date_range:[YYYYMMDD..YYYYMMDD].
- Pacific Time and Lag: Query date boundaries strictly in Pacific Time (America/Los_Angeles) with a 1-day reporting lag (ending yesterday T-1). Queries referencing current or future dates trigger eBay error 50018.
- Valid Metric Keys: Supported metric keys include LISTING_IMPRESSION_TOTAL, LISTING_IMPRESSION_SEARCH_RESULTS_PAGE, LISTING_VIEWS_TOTAL, CLICK_THROUGH_RATE, and SALES_CONVERSION_RATE.

### 3. eBay API Protocol and Auth Resolution
1. Prior to calling eBay Sell APIs, confirm the user token row in ebay_oauth_tokens contains the required scope.
2. Ensure token refresh requests catch HTTP 429 and transient timeouts without purging valid credentials.
3. On hard expiration (refreshExp < now) or explicit revocation, immediately clean dead credentials from D1 and set connected: false.
