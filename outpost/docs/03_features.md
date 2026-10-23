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

## Decoupled SKU Generation and Order-Level Idempotent Ingestion [ACTION ID: SYNC-001 / INV-002]

Decoupled internal Outpost SKU generation from Amazon ASIN identifiers to support multiple physical units and distinct orders sharing a single ASIN without inventory record or sales status collapse.

### Key Capabilities
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

### Key Capabilities
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

### Key Capabilities
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

### Key Capabilities
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

## Inventory Table Pricing Tooltip & Left-Side Action Ergonomics [ACTION ID: UI-005 / GRID-002]

Refactored the pricing and cost breakdown telemetry hover experience within the inventory data grid to prevent interference with inline cell editing and table scanning.

### Key Capabilities
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
4. **Synchronized Sticky Column Geometry (`InventoryDataGrid.jsx` & `userSettings.js`)**:
   - Expanded default and minimum width for the sticky `actions` column from 140px to 195px (`Math.max(195, columnWidths.actions || 195)`).
   - Enforces identical sticky offsets between the table header and body rows, guaranteeing that all 7 operational action buttons remain visible and aligned without horizontal clipping or scroll drift.
