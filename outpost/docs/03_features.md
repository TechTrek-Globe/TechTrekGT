# Outpost Features Documentation

## Global Command Palette (Cmd+K / Ctrl+K) [ACTION ID: HIGH-001 / NAV-001]

The Global Command Palette provides keyboard-first rapid navigation and fuzzy search across Outpost routes, operational tools, and inventory items by SKU.

### Command Palette Capabilities

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

### Dynamic Design System Capabilities

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

### Inline Grid Editing Capabilities

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

### Backend Data Integrity Capabilities

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

### Authentication Security Capabilities

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

### External Synchronization Capabilities

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

### Frontend State Consistency Capabilities

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

## Decoupled SKU Generation and Order-Level Idempotent Ingestion [ACTION ID: SYNC-001 / INV-002]

Decoupled internal Outpost SKU generation from Amazon ASIN identifiers to support multiple physical units and distinct orders sharing a single ASIN without inventory record or sales status collapse.

### Decoupled Ingestion Capabilities

1. **Order-Level Deduplication (`POST /api/import/amazon`)**:
   - Ingestion extracts `order_id` (or `orderId`) from the incoming request payload.
   - When `order_id` is present, Outpost checks whether an item with that exact `order_id` already exists in D1 for the user via `json_extract(attributes, '$.order_id')` or legacy notes matching.
   - If an existing record matches the `order_id`: mutable fields (`title`, `etv`, `taxCost`, `images`, `specs`) are updated idempotently and its existing SKU is returned (`is_existing: true`).
   - If no matching `order_id` exists, or if `order_id` is absent: a brand new inventory item and invoice are created with a freshly generated, unique Outpost SKU (`OP-YYMMDD-XXXX`).
2. **ASIN Decoupling**:
   - Incoming items are never collapsed or matched solely on `asin`. Multiple physical orders for the same ASIN maintain independent inventory rows and distinct SKUs.
   - When one unit of a shared ASIN sells on eBay or another marketplace, only that specific unit transitions to `'Sold'`, leaving other units with the same ASIN in `'Available'` status.
3. **Synchronized Export Alignment**:
   - `GET /api/export/vinescout-sales`: Exports `orderId` alongside `sku`, `asin`, `title`, `salePrice`, `netProceeds`, `netProfit`, `saleDate`, and `platform`.
   - `GET /api/export/vinescout-inventory`: Exports `orderId` alongside `sku`, `asin`, `title`, `status`, `isListed`, `platform`, `feePct`, `flatFee`, `shippingCost`, and pricing floors.
4. **Proactive eBay Listing ID & SKU Uniqueness Validation**:
   - Added proactive pre-flight conflict validation and SQLite constraint error handling across `PUT /api/items/:id` and `POST /api/ebay/sync-item`.
   - Rejects attempts to link an `ebay_listing_id` or `sku` already associated with another item with a descriptive HTTP 400 response identifying the conflicting item title, SKU, and status, eliminating generic 500 internal errors.
5. **Live eBay Order & Shipping Cost Ingestion Precision**:
   - Prioritizes `orderData.lineItemCost` from the Fulfillment API over `financeData.gross_sale_amount` in `reconcileAndSaveEbaySale`, preventing double counting of buyer shipping (`buyer_shipping_paid`) when eBay's Finances API basis includes shipping.
   - Dynamically extracts actual shipping label expenses (`SHIPPING_LABEL` transaction type) and Promoted Listing ad fees (`NON_SALE_CHARGE` with feeType `AD_FEE`) from the eBay Finances API, reconciling actual net earnings matching eBay Seller Hub down to the exact penny.

## Realized Sale Accounting Ledger & Pre-Sale Guidance Gating [ACTION ID: FIN-001 / MODAL-002]

Replaced theoretical pre-sale margin projections with an actual realized accounting waterfall in `EditTabFinancials` for completed sales, and suppressed pre-sale pricing recommendations and listing application triggers when an item is in `'Sold'` status.

### Realized Accounting Ledger Capabilities

1. **Realized Financial Accounting Waterfall (`EditTabFinancials.jsx`)**:
   - Detects completed sales (`isSold = form.status === 'Sold' || item?.status === 'Sold'`).
   - Replaces hypothetical pricing estimates with verified transaction figures sourced from linked `auction_sales` and `ebay_fee_reconciliations` records:
     - Item Sale Price ($70.00) and Buyer Shipping Inflow ($6.95), reflecting Total Gross Revenue Collected ($76.95).
     - Actual eBay Final Value Fee ($11.86), Promoted Listings Ad Fee ($2.53), and Seller Shipping Label cost ($6.82).
     - Actual Net Payout Proceeds ($55.74) and Bottom-Line Net Profit ($54.74 after $1.00 COGS), matching eBay Seller Hub earnings to the penny.
   - Updates the top margin badge to display realized net margin percentage and ROI, accompanied by a verified eBay order banner linking directly to the eBay transaction details page (`https://www.ebay.com/sh/fin/transactions?q=orderId:<orderId>`).
2. **Top KPI Strip Mode Switching**:
   - For available or listed items: displays List Price, Break-Even Floor, Net Proceeds, and Net Profit.
   - For sold items: switches to Sold Price, Landed Cost (COGS), Realized Net Proceeds, and Realized Net Profit, hiding the pre-sale break-even floor.
3. **Suppression of Pre-Sale Recommendations & Guidance**:
   - Hides interactive fee and ad sensitivity dials in Pillar 1 when `isSold` is true, locking in finalized fee line items.
   - Suppresses Pillar 3 (Break-Even Floor Price & Safety Buffer) for sold items where break-even guidance is obsolete.
   - Suppresses Pillar 4 (Suggested List Price Models & "Apply Suggested as List Price" buttons) for sold items.
   - Suppresses "Apply to Listing" comps actions (`EditTabComps.jsx`) when an item is sold, preventing inadvertent overwriting of historical sale prices.

## Unified Listing & Financials Modal Architecture [ACTION ID: TAB-001 / MODAL-003]

Consolidated the previously separate "Financials & Profit" and "Listing & eBay Sync" tabs into a unified, single source of truth component (`EditTabFinancials.jsx`). This eliminates duplicated pricing fields, removes redundant fee readout widgets (`LiveFeeReadout`), and provides a context-aware interface that adapts seamlessly between active inventory and completed sales.

### Listing and Financials Modal Capabilities

1. **Single Source of Truth Tab Consolidation**:
   - Replaced duplicate controls across two tabs with a unified primary tab (`EditTabNav`: `id: 'financial'`).
   - Dynamic Tab Label: Renders "Sale & Financials" when `form.status === 'Sold'`, and "Listing & Financials" when available or listed.
   - Streamlines modal navigation from 6 tabs down to 5 (Listing & Financials, Item Details, Market Comps, Performance & Traffic, VineScout / Vine).
2. **Context-Aware Marketplace Connection Hub**:
   - **When Sold**: Displays the verified completed sale banner with direct links to the eBay listing (`ebay.com/itm/:id`) and eBay Seller Hub transaction details (`ebay.com/sh/fin/transactions?q=orderId::orderId`), showing the buyer handle, sale date, listing date, and realized gross sale price.
   - **When Available / Listed**: Displays the eBay Store Listing Connection card (thumbnail, live price, promoted rate) with quick attributes (Platform, Status, Format, Date Listed) or the 2-mode Pairing Hub (Browse Store with auto-suggested match ranking vs manual 12-digit ID / URL entry).
3. **Consolidated Pricing & Outbound Controls (Pre-Sale Only)**:
   - Houses Asking Price, Buy-It-Now Target, Hard Floor Price, Buyer Shipping presets, Outbound Label expense presets, Target Profit Margin %, and Promoted Ad Rate % in one centralized location.
   - Automatically collapsed when an item is in `'Sold'` status, preventing clutter and obsolete pre-sale dials.
4. **End-to-End Accounting Pillars (1 through 4)**:
   - Houses the complete 7-line item waterfall (Pillar 1), fully absorbed Landed Cost COGS (Pillar 2), Break-Even Floor (Pillar 3, pre-sale), and Price Models (Pillar 4, pre-sale).

## eBay Performance & Traffic Ingestion Architecture [ACTION ID: PERF-001 / TRAFFIC-001]

Resolved eBay Sell Analytics API single-listing dimension aggregation to eliminate zero-metric reporting on active and completed listings.

### Telemetry Ingestion Capabilities

1. **Dimension Alignment & Ingestion Resilience (`functions/api/ebay/analytics.js`)**:
   - Fixed dimension parsing mismatch where eBay Analytics filters with `listing_ids` return listing aggregate records (`header.dimensionKeys[0].key = 'LISTING_ID'`) rather than legacy `dimensionalDataPoints`.
   - `parseEbayDailyTraffic` supports both test fixture formats (`dimensionalDataPoints`) and real eBay single-day record responses (`dimensionValues[0].value = YYYYMMDD`).
   - Implemented `parseEbayRangeTotals` to extract ground-truth period totals (total impressions, search impressions, total views, CTR, and conversion rate) directly from multi-day eBay Analytics queries.
2. **Safe Single-Query Range Ingestion & Pre-Listing Zero Fill**:
   - Queries `auction_items.date_listed` to identify listing creation date. All calendar dates prior to listing creation are recorded with 0 impressions and 0 views in `listing_traffic` without executing unnecessary external HTTP requests.
   - Replaced fragile 30-request parallel subrequest bursts with single-query range ingestion: queries eBay Analytics with `dimension=LISTING` for the full date range, extracting exact ground-truth range totals via `parseEbayRangeTotals`.
   - Distributes impressions and page views across active listing dates so daily sums match eBay range totals down to the unit, completely eliminating HTTP 429 rate limit triggers and worker timeout exceptions.
   - Prevents false "Partial Traffic Data" warning banners when all expected calendar dates are accurately recorded in D1 (`data_complete = true`).
3. **Completed Sale Telemetry Preservation (`EditTabPerformance.jsx`)**:
   - Gated traffic metrics for sold items (`form.status === 'Sold' || item?.status === 'Sold'`).
   - Reconciles with verified orders in `auction_sales`: guarantees that an item with recorded sales displays at least 1 page view and accurate conversion rate (`units_sold / page_views * 100`).
   - Replaces missing data alerts with a dedicated **Completed Sale Telemetry** banner, preserving final lifetime impressions, page views, and conversion efficiency.
   - Displays confirmed order counts in the Sales Conversion Rate card subtitle (e.g. `1 Order / Views`).
4. **Interactive Telemetry Tooltips & Metric Explanations (`EditTabPerformance.jsx`)**:
   - Implemented accessible, interactive `InfoTooltip` popovers across all telemetry KPIs, controls, and chart elements with custom alignment (`left`, `center`, `right`) and zero overflow clipping:
     - **Header Toolbar**: Telemetry synchronization cadence (T-1 Pacific Time lag), 12-digit eBay Item ID deep link, and historical reporting window (30/60/90 days).
     - **Completed Sale Banner**: Post-sale telemetry preservation and lifetime traffic significance.
     - **Total Impressions Card**: Search & browse discovery, Promoted Ad vs. Organic breakdown, and title/keyword optimization benchmarks.
     - **Listing Page Views Card**: Shopper engagement definition, photo/pricing appeal, and retail benchmark context.
     - **Click-Through Rate (CTR) Card**: Search appeal ratio, explicit mathematical formula `(Listing Page Views / Total Impressions) x 100`, and 1.5% to 3.5% retail benchmark.
     - **Sales Conversion Rate Card**: Checkout completion efficiency, formula `(Confirmed Orders / Listing Page Views) x 100`, 1.0% to 3.0% retail benchmark, and confirmed orders reconciliation badge.
     - **Daily Search Impressions & Page Views Chart**: Stacked bar visual guide (Promoted Ad vs. Organic) and secondary right-axis page views legend.
     - **CTR & Conversion Efficiency Chart**: Dual engagement vs. purchase polyline visual guide and daily metric legends.
5. **Rate Limit Defense & Controlled Retry Lifecycle (`EditItemModal.jsx` & `EditTabPerformance.jsx`)**:
   - Eliminated infinite client-side auto-fetch loops on the Performance tab by introducing `analyticsAttemptedRef` and gating auto-fetch on `!analyticsError`.
   - Replaces stuck full-screen loading spinners with an informative retry view and cooldown guidance when eBay rate limits are encountered.
   - Provides an interactive "Retry Report" button to allow sellers to re-query once the eBay cooldown window has elapsed.
6. **Store-Wide Single-Call Batching Protocol (`functions/api/ebay/analytics.js` & `functions/api/ebay/sync-all.js`)**:
   - eBay Sell Analytics rate limit quota enforces a strict ceiling of 100 API calls per rolling 24 hours per developer/seller application (resetting daily at 07:00 UTC / midnight Pacific / 3:00 AM EDT).
   - Rather than executing individual external calls per item (which quickly exhausts the daily 100-call quota), `ingestListingTraffic` queries D1 for all linked listings in the user's account (up to 200 listings) and aggregates them into a single pipe-delimited filter: `listing_ids:{id1|id2|...}`.
   - Dispatches exactly 1 API request to `GET /sell/analytics/v1/traffic_report?dimension=LISTING&metric=...&filter=marketplace_ids:{EBAY_US},listing_ids:{...},date_range:[...]`.
   - Distributes impressions and views across active dates and writes daily telemetry rows to `listing_traffic` for every listing in the store simultaneously in chunks of 90 (respecting Cloudflare D1 batch limits).
   - Updates 30-day snapshot columns (`total_impressions_30d`, `total_page_views_30d`, `avg_ctr_30d`, `avg_conversion_30d`, `analytics_fetched_at`) on `auction_items` for every listing.
   - Hooked into `POST /api/ebay/sync-all` so "Sync eBay Store" updates telemetry across all 30+ listings in 1 single API call.
   - Subsequent modal views load directly from local D1 database cache in <50ms with zero external API calls.
7. **Resilient Multi-Key Metric Parsing, Range Coverage Expansion, and Monotonic Request Tracking [ACTION ID: PERF-003 / TRAFFIC-003]**:
   - **Multi-Key Metric Parser (`functions/api/ebay/analytics.js`)**: Handles varying eBay Analytics response formats where page views are reported under `LISTING_VIEWS_TOTAL` or `TOTAL_LISTING_VIEWS`, or broken down across source keys (`LISTING_VIEWS_SOURCE_DIRECT`, `LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE`, `LISTING_VIEWS_SOURCE_STORE`, `LISTING_VIEWS_SOURCE_OTHER`). Aggregates granular sources when totals are not provided. Supports both structured objects (`{ value: ... }`) and primitive numeric values in `metricValues`.
   - **Cache Range Coverage Validation**: Solved the 60-day date hole when transitioning from a 30-day view to a 90-day view. Replaced naive `rows.length === 0` cache check with range coverage check (`oldestRowDate > expectedStartDate`). If existing cache only covers 30 days and the user requests 90 days, ingestion is triggered to fetch the full 90-day window.
   - **Single-Listing Query Scoping**: When an individual listing modal requests traffic, `ingestListingTraffic` scopes the query filter directly to `listing_ids:{listingId}` rather than batching the entire store catalog, preventing unnecessary processing while store-wide batching remains available during store sync (`sync-all.js`).
   - **Listing Scope vs Account Scope UI Clarification (`EditTabPerformance.jsx`)**: Updated UI header badge and informational tooltips to clarify that reported metrics reflect the single listing ID, differentiating them from store-wide aggregate metrics displayed in eBay Seller Hub.
   - **Monotonic Request Tracking (`EditItemModal.jsx`) [AUDIT-004]**: Tracks in-flight analytics requests via `analyticsFetchRequestIdRef` to discard stale out-of-order network responses when toggling between 30d, 60d, and 90d date ranges.

## Inventory Table Pricing Tooltip & Left-Side Action Ergonomics [ACTION ID: UI-005 / GRID-002]

Refactored the pricing and cost breakdown telemetry hover experience within the inventory data grid to prevent interference with inline cell editing and table scanning.

### Inventory Pricing Ergonomics Capabilities

1. **Right-Side Price Hover Decoupling (`InventoryGridRow.jsx`)**:
   - Removed the intrusive `InventoryPricingTooltip` hover popover triggers (`onMouseEnter` / `onMouseLeave`) from the `Current List Price` and `Landed & Floor` table cells on the right side.
   - Eliminates layout obstruction and prevents popovers from obscuring the `Click to edit` inline editor or neighbouring status tags while navigating numbers.
2. **Dedicated Left-Side Action Icon (`InventoryGridRow.jsx`)**:
   - Added a dedicated amber `CircleDollarSign` button to the sticky left `ACTIONS` toolbar, placed at the end of the action button cluster immediately adjacent to the item description boundary.
   - Styled with subtle amber accent borders (`border-amber-500/25 bg-amber-500/20 text-amber-400 hover:text-amber-300`) and `cursor-help`.
   - Displays the complete pricing breakdown on hover (`onMouseEnter={() => onShowTooltip('pricing_details', item, e)}`), and opens the item's financial dials modal on click (`onClick={() => onOpenEditModal(item)}`).
3. **Adaptive Tooltip Viewport Positioning (`InventoryPricingTooltip.jsx`)**:
   - Updated coordinate placement to distinguish left-side triggers from right-side triggers: when triggered from the left side (`rect.left < 400`), anchors the popover cleanly to the right of the icon (`rect.right + 10`) rather than overflowing left offscreen or covering the actions column.
   - Automatically maintains `translateY(-100%)` flip when approaching the bottom of the browser viewport.
4. **Unified Pricing Engine & Mathematical Formulas (`src/utils/pricingMetrics.js` & `InventoryPricingTooltip.jsx`)**:
   - Centralized pricing breakdown and floor cost calculations into pure JavaScript module `pricingMetrics.js` (`getItemFloorMetrics`).
   - True Net Profit: `listPrice - platformFees - adFees - landedCost`.
   - Margin %: `(True Net Profit / listPrice) * 100`.
   - ROI %: `(True Net Profit / landedCost) * 100`.
   - Break-even Floor Price (0% profit): `(landedCost + platformFlatFee + (buyerShipping * platformFeePct)) / (1 - platformFeePct - adFeePct)`.
   - Min Target Margin Floor: `(landedCost + platformFlatFee + (buyerShipping * platformFeePct)) / (1 - platformFeePct - adFeePct - targetMarginPct)`.
   - Fully accounts for buyer-paid shipping platform fee burden (`buyerShipping * platformFeePct`) in floor numerators and enforces `round2` monetary precision across all figures.
5. **Synchronized Sticky Column Geometry (`InventoryDataGrid.jsx` & `userSettings.js`)**:
   - Expanded default and minimum width for the sticky `actions` column from 140px to 195px (`Math.max(195, columnWidths.actions || 195)`).
   - Enforces identical sticky offsets between the table header and body rows, guaranteeing that all 7 operational action buttons remain visible and aligned without horizontal clipping or scroll drift.

## Telemetry Tooltip Clipping Resolution & eBay Sell Analytics Quota Tracking [ACTION ID: PERF-004 / QUOTA-001]

Resolved tooltip clipping in modal KPI cards and introduced real-time quota tracking for the eBay Sell Analytics API (100 calls per 24 hours).

### Tooltip Ergonomics & Quota Tracking Capabilities

1. **Interactive Tooltip Clipping Resolution (`EditTabPerformance.jsx`)**:
   - Solved the layout issue where the top portion of `InfoTooltip` popovers inside KPI metric cards was clipped by the scrollable modal container boundary (`overflow-y-auto`).
   - Defaulted `position = 'bottom'` (`top-full mt-2`) for all 7 KPI cards tooltips (Total Impressions, Search & Ads, Listing Page Views, 30d Total, Click-Through Rate, Sales Conversion Rate, Confirmed Orders Basis), allowing popovers to expand downward cleanly over the chart area.
   - Added constrained maximum dimensions (`max-w-[calc(100vw-2rem)]`, `max-h-[85vh]`, `overflow-y-auto`) and elevated z-index (`z-50 shadow-2xl`) to ensure lengthy benchmark explanations remain readable without clipping on all screen sizes.
2. **Real-Time eBay Sell Analytics Quota Engine (`functions/api/ebay/analytics.js` & `auctionApi.js`)**:
   - eBay Sell Analytics rate limits developer applications to 100 API calls per rolling 24 hours per developer application, resetting daily at midnight Pacific Time (07:00 UTC / 3:00 AM EDT).
   - Ingestion logs every live external HTTP request into `outpost_sync_history` via `recordSyncRun` with `sync_type = 'ebay_analytics'` and status (`success`, `quota_limited`, or `failed`).
   - Added `getPacificDayStartIso(now)` and `getNextPacificResetIso(now)` to dynamically determine exact midnight Pacific Time in UTC ISO format, handling daylight saving (PST/PDT) transitions.
   - Implemented `getEbayAnalyticsQuota(env, userId)` which queries `outpost_sync_history` for `sync_type = 'ebay_analytics'` and `started_at >= pacificStartIso`, calculating `daily_limit` (100), `used`, `remaining` (max 0, 100 - used), `resets_at`, and `resets_in_hours`.
   - Endpoint `GET /api/ebay/analytics` supports `?quota_only=1` (or `/api/ebay/analytics/quota`), returning the live quota object without triggering external eBay API requests. The quota object is also attached to all standard analytics payloads.
3. **Modal Toolbar & Footer Quota Telemetry (`EditTabPerformance.jsx`)**:
   - Added an **eBay API Quota Pill Badge** in the header toolbar next to the eBay Listing ID badge: `⚡ eBay API: X/100 Used (Y Left)`.
   - Dynamic threshold styling: Emerald for >30 calls remaining, Amber for <=30 calls, and Rose/pulse for <=10 calls.
   - Interactive `InfoTooltip` on the quota badge explaining daily call limits, midnight Pacific reset time, and cache benefits.
   - Added a quota summary readout in the footer bar: `Daily Quota: X/100 used (Y remaining • resets in Zh)`.
4. **Settings View eBay Quota Management (`SettingsView.jsx`)**:
   - Added a dedicated **eBay Sell Analytics Daily Quota (100 Calls / Day)** card under `eBay Sales Auto-Sync` in the Integrations tab.
   - Features a visual progress bar, used count, remaining count, hours until reset, and an interactive "Refresh Quota" button calling `fetchEbayAnalyticsQuota()`.

## 30, 60, and 90-Day Analytics Window Isolation & Ingestion Decoupling [ACTION ID: PERF-005 / RANGE-001]

Resolved identical metric reporting across 30, 60, and 90-day time ranges caused by date_listed cache clamping and artificial zero-out logic.

### Window Isolation & Telemetry Ingestion Capabilities

1. **Root Cause Analysis of Range Identicality**:
   - During store-wide sync (`POST /api/ebay/sync-all`), Outpost initializes telemetry with a rolling 30-day window (`rangeDays = 30`), populating exactly 30 daily rows in `listing_traffic`.
   - When users switched to 60 or 90 days in `EditTabPerformance`, `onRequestGet` checked `coversDateRange`:
     `const expectedStartDate = dateListedYmd && dateListedYmd > startYMD ? dateListedYmd : startYMD;`
     `if (oldestRowDate <= expectedStartDate) { needsIngestion = false; }`
     Because `item.date_listed` was frequently recent (e.g. within the last 30 days), `expectedStartDate` was clamped to `dateListedYmd`. Because `rows[0].traffic_date` was already <= `dateListedYmd`, the condition evaluated to true, falsely indicating that the 30 rows in DB covered the entire 60 or 90-day range.
   - Additionally, `ingestListingTraffic` artificially zeroed out all dates prior to `date_listed` and concentrated all eBay report activity into dates on or after `date_listed`, causing 30, 60, and 90-day aggregations to calculate identical totals.
2. **Multi-Range Coverage Verification (`functions/api/ebay/analytics.js`)**:
   - Removed artificial `dateListedYmd` clamping and zero-out logic. eBay Analytics reports real historical traffic for the listing ID across the requested window, irrespective of Outpost's local listing date field.
   - Updated `coversDateRange` to verify both row count and date boundary: `rows.length >= rangeDays && oldestRowDate <= startYMD`. If fewer than `rangeDays` rows exist in D1 (e.g. only 30 rows exist when requesting 60 or 90 days), ingestion triggers immediately to retrieve the full 60 or 90-day report from eBay.
3. **Anti-Caching & Payload Freshness (`auctionApi.js` & `worker.js`)**:
   - Added `cache: 'no-store'` to all client `apiFetch` calls to prevent browser HTTP heuristic caching of JSON responses when changing query parameters.
   - Enhanced Cloudflare Worker `addSecurityHeaders` to apply `Cache-Control: no-cache, no-store, must-revalidate` to all `application/json` payloads.

## eBay Seller Hub Telemetry Reconciliation, Granular Off-eBay Views, and Total Impressions Priority [ACTION ID: PERF-007 / TRAFFIC-004]

Reconciled Outpost's telemetry engine with native eBay Seller Hub metrics (eliminating the discrepancy where 1,677 Seller Hub impressions and 3 page views were reported as 57 impressions and 0 views in Outpost).

### Seller Hub Reconciliation & Multi-Source Metrics Capabilities

1. **TOTAL_IMPRESSION_TOTAL Resolution (`functions/api/ebay/analytics.js`)**:
   - In eBay Sell Analytics API, `LISTING_IMPRESSION_TOTAL` accounts only for search result slots and store impressions (e.g. 57 search impressions for listing `336679216292`).
   - In contrast, `TOTAL_IMPRESSION_TOTAL` aggregates search, browse, category pages, item recommendations, and offsite / Promoted placements (e.g. 1,677 impressions matching Seller Hub).
   - Reordered candidate resolution in `extractTotalImpressions` to prioritize `TOTAL_IMPRESSION_TOTAL` before `LISTING_IMPRESSION_TOTAL`, guaranteeing exact alignment with eBay Seller Hub top-line impressions.
2. **Granular Multi-Source View Ingestion (`functions/api/ebay/analytics.js`)**:
   - eBay Seller Hub splits listing visits into `eBay views` (internal search, store, recommendations) and `External views` (search engines, offsite ads, direct links).
   - Expanded `metricsParam` in `ingestListingTraffic` to explicitly query `LISTING_VIEWS_TOTAL`, `LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE`, `LISTING_VIEWS_SOURCE_OTHER_EBAY`, `LISTING_VIEWS_SOURCE_OFF_EBAY`, `LISTING_VIEWS_SOURCE_STORE`, and `LISTING_VIEWS_SOURCE_DIRECT`.
   - Refactored `extractTotalViews` to compute `Math.max(directViews, sourceSum)`: prevents dropping external views (`LISTING_VIEWS_SOURCE_OFF_EBAY`) or non-search internal views (`LISTING_VIEWS_SOURCE_OTHER_EBAY`).
   - Added `extractOffEbayViews` and `extractOnEbayViews` helpers to verify external vs internal traffic distribution.
3. **Search vs. Non-Search / Browse UI Labeling (`EditTabPerformance.jsx`)**:
   - Updated Total Impressions card subtitle and breakdown pill: replaced ambiguous `Ad / Org` with `Browse/Ad` (`promoted_impressions` = total - search) and `Search` (`organic_impressions` = search slot impressions), directly mirroring Seller Hub's `Search slot impressions` and `Non-search impressions` categories.
   - Updated tooltip explanations to provide clear benchmark definitions for both channels.
4. **Click-Through Rate (CTR) Concordance**:
   - Because impressions accurately reflect the full 1,677 count and total views capture all visits (1 eBay view + 2 external views = 3 views), CTR calculates as `(views / impressions) * 100` (~0.12% to 0.18%), matching Seller Hub's rounded `0.1%` rate.

## Sticky Inventory Item Thumbnail & Photo Column [ACTION ID: UI-006 / THUMB-001]

Added a dedicated sticky product thumbnail column positioned directly between `ACTIONS` and `ITEM / DESCRIPTION` in the inventory data grid, rendering a compact visual preview of every item.

### Sticky Thumbnail & Photo Capabilities

1. **Synchronized Multi-Column Sticky Geometry**:
   - `ACTIONS`: Sticky left offset at `0px` (`actionsWidth = Math.max(195, columnWidths.actions || 195)`).
   - `IMAGE`: Sticky left offset at `${actionsWidth}px` (`imageWidth = columnWidths.image || 44`).
   - `ITEM / DESCRIPTION`: Sticky left offset at `${actionsWidth + (isImageVisible ? imageWidth : 0)}px` (`columnWidths.item_name || 220`).
   - In both `<thead>` and `<tbody>`, horizontal scrolling pins all three columns to the left edge in lockstep without visual collision, overlap, or clipping.
2. **Compact Visual Presentation & Graceful Fallback**:
   - 32x32px (`w-8 h-8`) rounded image container (`border border-slate-700/60 bg-slate-900/90`) styled with subtle amber hover ring (`hover:border-amber-500/60 hover:ring-1 hover:ring-amber-500/40`) and hover scale animation.
   - Synchronously extracts image URLs from `item.image_url`, `item.ebay_image_url`, `attributes.ebay_image_url`, `attributes.image_url`, `attributes.image_urls[0]`, and `notes` regex matching eBay/Amazon media URLs via `resolveItemImage`.
   - Reads global in-memory cache `PREVIEW_CACHE` to share resolved image previews across components without duplicate queries.
   - Falls back gracefully to `<Package className="w-3.5 h-3.5 text-slate-600" />` if no photo is available or if the image fails to load.
3. **Interactive Zoom & Edit Integration**:
   - Clicking the thumbnail opens the full item editor modal (`onOpenEditModal`).
   - Hovering over the thumbnail triggers `ItemImageHoverTooltip` (`onShowTooltip('item_image', item, e)`), displaying the high-resolution product photo preview portal.
4. **Thumbnail-Exclusive Image Hover Trigger (`InventoryGridRow.jsx`)**:
   - Decoupled floating image preview tooltip triggers (`onMouseEnter` / `onMouseLeave`) from the item title / description cell.
   - Image preview modal portal strictly triggers only when hovering directly over the item thumbnail element (`ItemThumbnailCell`).
   - Preserved browser tooltip (`title="Click to view & edit full item details"`) and click-to-edit action on the item title cell.

## Inventory and Sales Log Separation [ACTION ID: INV-004 / SALES-002]

Decoupled completed sales from the active inventory grid, establishing the dedicated Sales Log (`SalesLogView.jsx`) as the exclusive single source of truth for sold transactions.

### Inventory and Sales Log Capabilities

1. **Active Inventory Table Focus (`InventoryDataGrid.jsx`)**:
   - Removed the secondary "SOLD ITEMS" divider, accordion, and completed transaction rows from the bottom of `InventoryDataGrid.jsx`.
   - Grid body strictly iterates over `activeItems`, displaying active, listed, and draft items without appending completed sales.
   - Preserved empty state handling: renders informative filter message when no active items match the current query.
2. **Server-Side Non-Sold Filtering (`functions/api/items/enriched.js`)**:
   - `GET /api/items/enriched`: Injects default SQL filter `i.status != 'Sold'` when no specific status filter is provided.
   - Prevents completed sales records from being transferred in active inventory payloads or counted against `pagination.total`.
   - Supports explicit `status` querying and `include_sold=true` query parameters when historical item data is specifically requested.
3. **Inventory Command Bar Status Filter Alignment (`InventoryCommandBar.jsx`)**:
   - Filtered out `'Sold'` from the status selection dropdown (`ALL_STATUSES.filter(s => s !== 'Sold')`).
   - "All Status" counter reflects strictly active and available stock counts.
   - Header summary badges (COGS, Portfolio Value, and Potential Profit) accurately aggregate active and available inventory.
4. **Sales Log Single Source of Truth (`SalesLogView.jsx`)**:
   - Maintained `SalesLogView.jsx` as the standalone interface for all sold transactions, fee reconciliations, and historical profitability reporting.
   - Verified fallback resolution (`GET /api/items/:id`) for viewing and editing item attributes directly from sales records.

## Segmented Inventory Status Quick Tabs [ACTION ID: UI-007 / TAB-002]

Introduced segmented status quick tabs to the Inventory Command Bar (`InventoryCommandBar.jsx`), allowing instant one-click toggling across the core operational stock statuses: "All", "Listed", "Available", and "Kept for self".

### Segmented Status Tab Capabilities

1. **Quick-Switch Operational Tabs**:
   - Dedicated tab buttons for "All" (`''`), "Listed" (`'Listed'`), "Available" (`'Available'`), and "Kept for self" (`'Kept for Self'`).
   - Positioned immediately adjacent to the inventory search box within the unified command bar.
   - Employs horizontal scroll container (`overflow-x-auto`) for seamless responsiveness across mobile, laptop, and ultra-wide displays without layout shifting.
2. **Dynamic Live Count Badges**:
   - Each tab features a monospace pill badge displaying exact real-time item counts (e.g., `Listed (28)`, `Available (10)`, `Kept for self (2)`, `All (40)`).
   - Ingests server-calculated aggregation from `status_counts` via `GET /api/items/enriched` so counts remain constant and accurate across status switching and pagination.
3. **Tactical Amber Design Tokens**:
   - Active Tab: Highlights with amber background tint (`bg-amber-500/20`), amber text (`text-amber-300`), amber border (`border border-amber-500/40`), and subtle ambient glow (`shadow-sm shadow-amber-500/10`).
   - Inactive Tabs: Subtle tactical muted text (`text-slate-400 hover:text-slate-200 hover:bg-slate-800/40`).
   - Inner Badge: Contrasting font-mono pill badge (`bg-amber-500/30 text-amber-200 border-amber-500/50` on active; `bg-slate-800/80 text-slate-400 border-slate-700/50` on inactive).
4. **Bidirectional Two-Way Filter Synchronization**:
   - Clicking any segmented tab instantly sets `statusFilter` in `InventoryContext`, updating the URL query parameters and re-querying active inventory on page 1.
   - The secondary status dropdown (`#inventory-status-filter`) stays in lockstep: selecting a status via tab updates the dropdown, and choosing secondary statuses (e.g. `Draft`, `Unsold`, `Returned`) gracefully clears tab highlights while reflecting active state.

## Automated Listed Transition on eBay Item Connection [ACTION ID: SYNC-005 / EBAY-008]

Automated the lifecycle transition from "Available" to "Listed" status whenever an item is connected to an active eBay listing, automatically moving the item to the "Listed" tab.

### eBay Connection Lifecycle Capabilities

1. **Automatic Status & Platform Transition**:
   - When connecting an eBay listing ID to an "Available" or "Draft" item (via `EbayListingIdModal`, `EditTabFinancials`, `ListingMatchReviewModal`, or `QuickEditDrawer`), Outpost automatically updates the item status to `'Listed'`, assigns platform to `'eBay'`, and records `date_listed`.
   - `functions/api/ebay/sync-item.js`: Guarantees that syncing or connecting an active eBay listing transitions non-sold items to `'Listed'`.
   - `functions/api/items/[id].js`: Intercepts `PUT /api/items/:id` containing `ebay_listing_id` on Available/Draft items, auto-applying canonical `'Listed'` status and date.
2. **Immediate UI Tab Navigation**:
   - Upon completing an eBay connection, `InventoryHubView` automatically triggers `setStatusFilter('Listed')`.
   - The UI switches focus directly to the "Listed" status tab, presenting the newly linked item without requiring manual filter adjustments or tab clicking.

## Status Priority Hierarchy Sorting in Inventory View [ACTION ID: INV-005 / SORT-001]

Enforced automatic primary status sorting across active inventory when viewing all statuses without an active status filter, grouping inventory into a deterministic operational hierarchy.

### Status Priority Sorting Capabilities

1. **Canonical Status Priority Ranking (`src/utils/constants.js`)**:
   - Defines `STATUS_PRIORITY_RANK` and `getStatusRank(status)` mapping operational lifecycle states to deterministic ranks:
     - Rank 1: "Listed"
     - Rank 2: "Available"
     - Rank 3: "Kept for Self"
     - Deterministic remaining ranks: Draft (4), Unsold (5), Returned (6), and unrecognized statuses (99).
   - Case-insensitive trimming ensures consistent ranking regardless of input format.
2. **Default "All" View Hierarchy (`src/context/InventoryContext.jsx`)**:
   - When viewing all statuses (`!statusFilter || statusFilter === 'All'`) under default sorting (`sortPreset === 'default'` or `sortConfig.key === 'created_at' && sortConfig.direction === 'desc'`), items are automatically ordered by Status priority rank.
   - Preserves secondary tie-breaking within identical status ranks: newest acquisition/creation date first (`created_at` descending), followed by deterministic SKU/ID alphanumeric ordering.
3. **Explicit User Sort & Filter Preservation**:
   - Toggling an explicit column sort (e.g. List Price, Margin, Format) or selecting an explicit sort preset bypasses status rank clustering to respect direct user column ordering across all items.
   - When sorting explicitly by the Status column (`sortConfig.key === 'status'`), respects user direction (`asc` or `desc`) based on the canonical status hierarchy rather than arbitrary alphabetical string ordering.
   - Selecting an individual status filter tab (e.g. "Listed" or "Available") displays only items for that status, respecting user column sorting.
4. **Backend D1 Pagination Concordance (`functions/api/items/enriched.js` & `functions/api/items/index.js`)**:
   - Implemented `STATUS_CASE_SQL` in serverless item endpoints: when querying all statuses under default sort, D1 SQLite executes `ORDER BY CASE LOWER(TRIM(i.status)) WHEN 'listed' THEN 1 WHEN 'available' THEN 2 WHEN 'kept for self' THEN 3 WHEN 'draft' THEN 4 WHEN 'unsold' THEN 5 WHEN 'returned' THEN 6 ELSE 7 END ASC, i.created_at DESC`.
   - Ensures multi-page database pagination (`LIMIT / OFFSET`) partitions active items strictly according to the status hierarchy.

## Advanced Dark-Theme eBay Listing Template Generator [ACTION ID: LST-001 / EBAY-009]

Introduced a modular, dark-theme eBay HTML listing generator (`src/utils/ebayTemplate.js`) and integrated it into the Outpost listing copy generator suite (`src/utils/listingCopyGenerator.js`).

### Template Generator Capabilities

1. **Modular Dark-Theme Card Layout (`src/utils/ebayTemplate.js`)**:
   - Implements `generateEbayListingHtml(item)` producing a 900px centered responsive card container (`max-width:900px; margin:0 auto; font-family: Arial, Helvetica, sans-serif; color:#ffffff; line-height:1.5;`).
   - Cards utilize tactical dark charcoal backgrounds (`background-color:rgb(17,17,17)`) and subtle structural borders (`border:1px solid rgb(51,51,51); border-radius:6px; padding:18px; margin-bottom:15px;`).
   - Accents use Outpost tactical gold and amber typography (`color:rgb(241,193,91)` and `border:1px solid rgb(214,181,109)`).
2. **Dynamic Outpost Schema & Inventory API Mapping**:
   - Safely parses stringified JSON `attributes` from Outpost inventory records.
   - Maps Outpost inventory fields dynamically:
     - Title: `item.title || item.item_name || attrs.title || 'Authentic Collectible'`
     - Description: `item.description || item.notes || item.additional_description || attrs.description || ''`
     - Condition Details: `item.conditionDetails || item.condition_details || item.condition || attrs.conditionDetails || 'Please review all photos carefully for the exact condition, quality, and details.'`
     - Key Details: Maps array or newline-separated string `features` to `<li>` elements, with graceful fallback to `Brand: ${brand || 'N/A'}` and `Model: ${model || 'N/A'}`.
     - What's Included: Maps `includedItems`, `included_items`, or `includedInSale` to bulleted list, with fallback to `${title}` and exact item photos.
3. **Intelligent Conditional Authentication Card**:
   - Evaluates whether an item is certified or autographed.
   - If explicit `authentication` object (`{ provider, certNumber, type }`) or Outpost fields (`authenticator`, `cert_number`, `athlete_person`) indicate a certified/autographed piece, the Authentication card renders.
   - If the item is raw, uncertified, or non-autographed (`authenticator` in `'Raw'`, `'Uncertified'`, `'None'`, `'Other'`, `'N/A'`, or empty), the entire Authentication card block is completely omitted (`''`), maintaining a clean, relevant listing.
4. **Copy Generator & Modal Integration (`src/utils/listingCopyGenerator.js`)**:
   - Re-exports `generateEbayListingHtml`.
   - `generateEbayCopy` builds `insertHtml` and full `htmlBody` using `generateEbayListingHtml`, providing immediate dark-theme HTML code and live preview in `ListingCopyModal`.

## Pricing Floor Reconciliation & Tooltip Deconfliction [ACTION ID: CALC-002 / TOOLTIP-001]

Reconciled the Break-Even Floor Price calculation across the table and pricing hover cards, and removed intrusive native browser tooltip popups from overlapping the UI.

### Pricing Reconciliation Capabilities

1. **Floor Price Concordance (`src/utils/pricingMetrics.js`)**:
   - Aligned `getItemFloorMetrics(item)` with the canonical formula in `functions/utils/auction.js` (T-10 Item 1).
   - Removed divergent buyer-paid shipping fee burden from the break-even numerator (`costBasis = landedCost + platformFlatFee + estShippingCost`).
   - Prioritizes authoritative item database fields `item.floor_price || item.min_sell_price`, ensuring the Break-even Floor Price in `InventoryPricingTooltip` and the `Landed & Floor` table column in `InventoryGridRow` display identical values.
2. **Native Tooltip Deconfliction (`src/components/inventory/InventoryGridRow.jsx`)**:
   - Replaced `title="Pricing & cost breakdown (hover for details, click to edit)"` on the pricing action button with `aria-label="Pricing & cost breakdown"`.
   - Prevents the native browser tooltip box from obscuring table values and overlapping the custom glassmorphic pricing breakdown popover.

## Gemini AI Context-Aware eBay Listing Details Generator [ACTION ID: AI-001 / EBAY-010]

Integrated Google Gemini API (`gemini-3.8-flash`) into the Outpost eBay listing generation pipeline to dynamically produce context-aware, HTML-formatted Condition and Key Details cards based on actual item metadata, specs, and seller notes.

### AI Listing Generator Capabilities

1. **Serverless AI Generation Endpoint (`functions/api/ai/generate-ebay-details.js`)**:
   - Route: `POST /api/ai/generate-ebay-details` registered in `src/worker.js` with session authentication (`requireAuth` verifying HttpOnly `auth_token` and `users.token_version`).
   - Ingests item metadata payload (`title`, `brand`, `productType`, `condition`, `conditionHeader`, `conditionSubheader`, `notes`, `specs`, `features`).
   - Queries Google Gemini API (`gemini-3.8-flash`) using `fetchWithTimeout` enforcing a strict 15-second timeout via `AbortSignal.timeout(15000)` per AUDIT-003.
   - Dual API Resilience: Prioritizes modern Interactions API (`POST /v1beta/interactions`) with automatic fallback to `generateContent` endpoint if Interactions API is unconfigured.
   - Strict Output Sanitization: Strips markdown code fences (` ```html `) and strictly enforces the platform zero em-dash rule (replacing any Unicode em or en dashes with standard hyphens).
2. **Dynamic Template Injection & Fallback Architecture (`src/utils/ebayTemplate.js`)**:
   - `generateEbayListingHtml(item)` accepts optional `aiGeneratedMiddleSection`.
   - When provided, seamlessly injects the AI-generated HTML cards directly between the Header Banner and the What's Included / Authentication cards.
   - When absent, empty, or on generation failure, falls back cleanly to the static Condition and Key Details card layout with zero visual regressions.
   - Integrated with `generateEbayCopy` in `src/utils/listingCopyGenerator.js` to ensure both `insertHtml` and full `htmlBody` preview render the dynamic middle section.
3. **Frontend UI State & Dual-Trigger Ergonomics (`src/components/ListingCopyModal.jsx`)**:
   - Added an amber **"Auto-Generate AI Description"** button with `Sparkles` icon and animated `Loader2` spinner to the eBay tab toolbar and the Collapsible Details Form.
   - Follows AUDIT-004 resilience guidelines: gates loading flags in `finally {}` blocks to guarantee button recovery, catches `{ success: false }` payloads, and presents non-blocking accessible error alerts without browser `alert()` dialogs.
   - Displays real-time status pill badges: "AI Active" (emerald) when AI cards are rendered versus "Standard Template" (slate).
   - Provides an on-demand **"Reset to Static"** button allowing sellers to revert instantly to the static template at any time.

## D1 Runaway Write Remediation & Differential Sync Architecture [ACTION ID: PERF-004 / DB-001]

Eliminated high-frequency redundant Cloudflare D1 row and index writes across eBay analytics ingestion, background inventory synchronization, webhook handling, and client auto-polling.

### Write Remediation Capabilities

1. **Differential Traffic Upserts & Store-Wide TTL Gating (`functions/api/ebay/analytics.js`, `functions/api/ebay/sync-all.js`)**:
   - Replaced destructive `INSERT OR REPLACE INTO listing_traffic` (which generated new UUID primary keys and rewrote 4 secondary indexes across all 30 days on every sync) with deterministic row keys (`lt-${listingId}-${ymd}`) and pre-fetched in-memory change detection (`shouldUpsertTrafficRow`) paired with `INSERT ... ON CONFLICT(ebay_listing_id, traffic_date) DO UPDATE ... WHERE`. Unchanged historical days and existing 0-baseline rows execute zero SQLite writes.
   - Gated store-wide `ingestListingTraffic` inside `POST /api/ebay/sync-all` on `ANALYTICS_CACHE_TTL_HOURS` (12h) across active non-sold listings, preventing routine 30-minute price/order syncs from re-ingesting 30-day traffic reports when telemetry is already fresh.
   - Removed unconditional `DELETE FROM auction_item_analytics` and cached-read `UPDATE auction_items SET analytics_fetched_at = ...` from `GET /api/ebay/analytics`.
   - Enhanced HTTP 429 quota fallback in `GET /api/ebay/analytics` to backfill only missing dates (`INSERT OR IGNORE`) when expanding from 30d to 60d/90d, preventing repeated upstream ingestion attempts and sync history writes during quota lockouts.
2. **Active Item Dirty-Checking & Isolate DDL Caching (`functions/api/ebay/sync-all.js`, `functions/utils/syncLogger.js`)**:
   - Implemented in-memory field dirty-checking in `sync-all.js` comparing incoming price, status, platform fees, promoted rate, shipping cost, pricing floors, and serialized attributes against the existing `auction_items` row before executing `UPDATE auction_items`.
   - Removed redundant `UPDATE ebay_oauth_tokens SET last_refreshed_at = datetime('now')` from `sync-all.js` and `find-listings.js` (`tokenHelper.js` updates token timestamps strictly upon actual OAuth refresh).
   - Added a `WeakSet` isolate-level initialization guard (`initializedDbs`) to `ensureSyncHistoryTable` in `syncLogger.js` and removed 4 hot-path `ALTER TABLE` statements, eliminating 6 redundant DDL queries per `/api/sync/settings` and analytics quota call.
3. **Multi-Tab Cooldown, Webhook Idempotency & Durable Object Rate Limiting (`sync-all.js`, `webhook.js`, `InventoryContext.jsx`)**:
   - Added a 3-minute server-side cooldown in `POST /api/ebay/sync-all` for automated background polling (`manual: false`), deduplicating concurrent `setInterval` timers across multiple open browser tabs while allowing manual user syncs (`manual: true`) to run immediately.
   - Gated client-side `setInterval` auto-polling in `InventoryContext.jsx` on `document.visibilityState !== 'hidden'`, and gated `fetchActiveListings()` in `EditItemModal.jsx` to skip sold/returned items.
   - Added deterministic notification ID deduplication (`ebw_${notificationId}` with `INSERT OR IGNORE`) in `POST /api/ebay/webhook`, and connected `env?.RATE_LIMIT_DO` to `vinescout-sales.js` and `vinescout-inventory.js`.

## Dedicated Cloudflare D1 Database Isolation (`outpost-db`) [ACTION ID: DB-002 / INFRA-001]

Decoupled Outpost Tracker from the shared `personal-budget-db` instance by provisioning and migrating to a dedicated Cloudflare D1 SQLite database (`outpost-db`, ID: `c41ad6c7-26f1-4ca8-9af8-82990ccb4566`).

### Dedicated Database Capabilities

1. **Independent Quota & Single-Writer Lock Isolation**:
   - Outpost binds `outpost-db` (`c41ad6c7-26f1-4ca8-9af8-82990ccb4566`) in `outpost/wrangler.jsonc` under the constant Worker binding name `DB` (`env.DB`), isolating Outpost read/write telemetry and SQLite coordinator locks from Finance OS and Wayfinder.
   - Zero application query logic modifications were required as all Worker handlers continue to reference `env.DB`.
2. **Self-Contained Schema Initialization (`auction-schema.sql`)**:
   - Consolidated `CREATE TABLE IF NOT EXISTS users` (and associated indexes) directly into `outpost/auction-schema.sql` alongside all 19 Outpost domain, OAuth, analytics, and sync tables.
   - Local and remote instances are initialized and migrated via `npm run db:migrate:local` (`wrangler d1 execute outpost-db --local --file=./auction-schema.sql`) and `npm run db:migrate` (`wrangler d1 execute outpost-db --remote --file=./auction-schema.sql`).
3. **Synchronized CLI Tooling & UI Status Telemetry**:
   - Updated all administrative CLI scripts (`scripts/check-legacy-hashes.js`, `scripts/manage-integrations.js`, `scripts/migrate-amazon-tokens.js`, `scripts/migrate-ebay-tokens.js`) and `SettingsView.jsx` database status badge to reference `outpost-db`.










