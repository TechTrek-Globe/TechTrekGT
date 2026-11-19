# Outpost State Management Documentation

## State Architecture

Outpost uses React Context and standard React hooks (`useState`, `useReducer`, `useMemo`, `useCallback`, `useRef`) for client-side state management, persisted across views via root-level providers in `src/App.jsx`.

### Core Context Providers

1. **`AuthProvider` (`src/context/AuthContext.jsx`)**:
   - Manages user authentication state (`user`, `isAuthenticated`, `isLoading`).
   - Interacts with HTTP-only session cookies (`credentials: 'include'`).
   - Exposes `login`, `register`, and `logout` actions.

2. **`CommandPaletteProvider` (`src/context/CommandPaletteContext.jsx`) [HIGH-001]**:
   - Manages global visibility state for the Command Palette modal (`isOpen`, `openPalette`, `closePalette`, `togglePalette`).
   - Mounted at the top level of `src/App.jsx` wrapping `MainContent` to persist palette state across route and view transitions.
   - Consumed by `AppLayout` for global shortcut (`Cmd+K` / `Ctrl+K`) listeners and desktop/mobile UI trigger buttons.

3. **`InventoryProvider` (`src/context/InventoryContext.jsx`)**:
   - Manages active items list, sorting, filtering (`search`, `statusFilter`, `categoryFilter`), and pagination.
   - Provides integration operations including `handleSyncEbay`, `fetchItems`, and item updates.
   - Integrated with `CommandPalette` to allow SKU selections to update `search` and highlight targeted items in the inventory table.

### Styling & Design System State [HIGH-002 / UI-001]

- **CSS Custom Properties**:
  - Global styling theme state is anchored in `:root` variables in `src/index.css` (`--color-brand-50` through `--color-brand-900`).
  - Colors are referenced by `tailwind.config.js` with `<alpha-value>` modifier support, enabling runtime theme configuration and decoupled visual tokens without component-level refactoring.

### Inline Grid Editing & Optimistic UI State [MED-001 / INT-001]

- **Component & Table State**:
  - `InlineEditableCell` (`src/components/ui/InlineEditableCell.jsx`): Manages local edit mode (`isEditing`), input buffering (`currentInput`), in-flight status (`internalSaving`), and validation state without triggering parent re-renders until committed.
  - `SalesLogView` (`src/components/SalesLogView.jsx`): Tracks in-flight row saves via `savingCellMap` (`{ [cellKey]: boolean }`) and focused edit sessions via `editingCell`.
  - **Optimistic Reconciliation**:
    - Updates local `sales` state immediately with recalculated net proceeds, net profit, and ROI fractions derived from `computeSaleMetrics`.
    - Adjusts summary telemetry (`total_gross`, `total_net_proceeds`, `total_net_profit`, `blended_roi`) instantaneously using delta arithmetic.
    - Preserves snapshots (`prevSales`, `prevSummary`) for atomic rollback and user error notification if the asynchronous `PUT /api/sales/:id` call fails.

### Backend Transactional & Database Integrity State [ACTION ID: AUDIT-001]

- **Compensating Rollback State Pattern**:
  - Cloudflare D1 SQLite does not support long-lived interactive multi-statement transactions across asynchronous I/O boundaries.
  - Multi-step state transitions maintain transactional integrity using compensating rollback actions executed in `catch` blocks:
    - **Item & Sale State Reconciliation**: When marking an item sold (`/api/sales`, `/api/sync/vinescout-catalog`, `/api/ebay/match-sold-vinescout`, `/api/ebay/sync-item`), if the sale persistence fails, item status and attributes are rolled back to their pre-sale snapshot.
    - **Invoice & Item Cascading Cleanup**: If item insertion fails during invoice creation (`/api/invoices`, `/api/import/amazon`, `/api/import/amazon-url`), the parent invoice is purged immediately to prevent orphaned empty invoices.
    - **Batch Import Rollback**: If batch processing fails during replacement, `cleanupBatch` removes all batch-tagged records and reverts any item status changes.
  - Operations supporting immediate atomic execution (`DELETE /api/sales/:id`, `DELETE /api/items/:id`, `DELETE /api/invoices/:id`, platform default updates) use `env.DB.batch(...)` to guarantee all-or-nothing execution at the SQLite engine level.

### Authentication and Security Credential Lifecycle State [ACTION ID: AUDIT-002]

- **Security State Synchronization & Invalidation**:
  - Security states strictly mirror backend realities. Invalid, revoked, or expired credentials trigger immediate invalidation across clients and database storage.
  - **Client Cookie Cleanup**: 401 Unauthorized responses from `requireAuth` and `/api/auth/me` explicitly emit `Set-Cookie: auth_token=; Max-Age=0` headers, clearing stale session cookies in the browser and preventing endless failed background polling loops.
  - **Token Version (`token_version`) State Invariants**:
    - When users reset their password (`/api/auth/reset-password`), update their password (`/api/auth/update-profile`), or request global session termination (`/api/auth/logout` with `all: true`), `users.token_version` is bumped in D1.
    - All subsequent requests presenting tokens with an older `tv` claim are immediately rejected with HTTP 401 across both `requireAuth` and `resolveIntegrationUserId`.
  - **API Integration & OAuth Credential Lifecycle**:
    - Manually revoking an API integration (`UPDATE api_integrations SET revoked_at = datetime('now')`) immediately prevents all subsequent API authentications without delay.
    - Expired eBay refresh tokens and permanent 400/401 OAuth refresh errors purge corresponding records from `ebay_oauth_tokens`, immediately reverting UI status to `{ connected: false }`.

### External Synchronization & Webhook Resilience State [ACTION ID: AUDIT-003]

- **Sync Run History & Failure State Tracking (`outpost_sync_history` & `outpost_sync_settings`)**:
  - Outbound sync operations (eBay, VineScout, Amazon, Webhook) record atomic telemetry to `outpost_sync_history` (`status`, `items_total`, `items_synced`, `items_failed`, `error_message`, `details`, `started_at`, `completed_at`).
  - **Conditional Timestamp Stamping Invariant**: `last_ebay_sync_at` is stamped in `outpost_sync_settings` ONLY upon 100% successful sync completion (`status = 'success'`).
  - **Partial Failure State**: When individual items fail during eBay or platform sync runs, successful items are committed, failed items are recorded in `outpost_sync_history`, and `outpost_sync_settings` sets `last_ebay_sync_status = 'partial'` and preserves the existing `last_ebay_sync_at` timestamp.
  - **Hard Failure State**: Network timeouts and unexpected external API rejections record `last_ebay_sync_status = 'failed'`, document the diagnostic error in `last_ebay_sync_error`, and preserve earlier sync timestamps without advancing them.
- **Client Sync Telemetry & Recovery State**:
  - `InventoryContext` re-fetches sync settings on both success and error paths, re-throwing caught errors to notify calling UI components.
  - `SettingsView` renders informative status alerts for `failed` and `partial` states with explicit error messages and timestamps for the last successful sync, preventing misleading green checks or stuck loading states.

### Frontend State and UI Consistency [ACTION ID: AUDIT-004]

- **Elimination of False-Positive Success Responses (`apiFetch`)**:
  - Centralized in `src/utils/auctionApi.js`: `apiFetch` validates that `data.success !== false`. If an endpoint returns HTTP 200 with `{ success: false, error: '...' }`, `apiFetch` throws an Error immediately.
  - Calling components can never misinterpret a rejected business transaction as a success.
- **Asynchronous Request Counters & Race Condition Isolation**:
  - `InventoryContext` (`fetchItems`), `SalesLogView` (`fetchSales`), and `CatalogSearchDropdown` (`searchCatalog`) implement monotonic request counters via `useRef` latches (`fetchRequestIdRef`).
  - Slower, out-of-order network responses from earlier queries or pagination changes cannot overwrite fresh search results.
- **User-Scoped Lifecycle State & Cross-Session Cache Purging**:
  - `src/App.jsx` mounts `<InventoryProvider key={user?.id}>`. Logging out or switching users immediately destroys the existing React tree and purges cached inventory, platform lists, and sync timers from memory.
  - `src/context/AuthContext.jsx` includes `isMounted` guards to prevent memory leaks and unmounted state updates during session restoration, and gates `isAuthenticated` on `!data.verificationPending`.
- **Guaranteed Loading State Recovery via `finally {}` Blocks**:
  - All asynchronous mutation workflows (`handleSubmit`, `handleSave`, `handleSync`, `handleReconcile`, `handleDelete`) reset button loading and submitting flags inside `finally {}` blocks.
  - If a network failure, validation error, or unexpected exception occurs, submission buttons and spinners are guaranteed to re-enable.
- **Non-Blocking In-App Error Presentation**:
  - Raw browser `alert()` invocations across all components (`InventoryHubView`, `SalesLogView`, `SettingsView`, `QuickEditDrawer`, `PricingCard`, `ListingCopyModal`, `DelistPendingAlert`) are replaced with local, non-blocking contextual state (`setError`, `saveError`, `fetchMsg`).
  - Components render accessible alert badges with retry actions rather than halting browser thread execution.
- **Dependent View Null/Failure States (`DashboardView`)**:
  - If initial dashboard telemetry fails to load (`!data && !loading && error`), `DashboardView` replaces misleading $0.00 zero-value skeleton widgets with an explicit connection error state and a manual retry button.

### Phase 8 Schema & Inventory Decoupling State [ACTION ID: SYNC-001 / INV-002]

- **Global SKU Uniqueness Invariant (`idx_auction_items_sku_unique`)**:
  - Outpost enforces a database-level partial unique index on non-null, non-empty SKUs: `CREATE UNIQUE INDEX idx_auction_items_sku_unique ON auction_items(sku) WHERE sku IS NOT NULL AND sku != ''`.
  - `generateUniqueSku` verifies uniqueness globally across all rows in `auction_items` via `SELECT id FROM auction_items WHERE sku = ? LIMIT 1`, regenerating candidates on collision.
- **Order-Level Ingestion Indexing (`idx_auction_items_user_order_id`)**:
  - Ingestion deduplication is anchored on Amazon Order IDs rather than product ASINs.
  - Accelerated via expression index: `CREATE INDEX idx_auction_items_user_order_id ON auction_items(user_id, json_extract(attributes, '$.order_id')) WHERE attributes IS NOT NULL AND json_valid(attributes)`.
  - Re-importing an existing order updates mutable fields idempotently without altering SKU or duplicating rows. Distinct orders for identical ASINs receive separate SKUs and independent inventory records.
- **Historical Data Decoupling & Database Repair**:
  - Audited live Cloudflare D1 database (`personal-budget-db`) and decoupled collapsed historical rows:
    - GPS Wireless Dog Fence (`B0H5VRLRMQ`): Unit 1 (`item-39df6393-65f4-4547-9ab8-03df7656eeb0`, SKU `OP-260914-Q2CV`) restored to status `'Sold'` with $160 sale linked to `inv-cb79f9c4-b568-40a4-8e46-d23c50e2df6b`. Unit 2 (`item-6f1e8a24-9b27-4a41-b844-48f86f80a9d1`, SKU `OP-260914-DF02`) created as status `'Available'` under invoice `inv-77243ab5-6079-4087-a333-7f0d057d4d62` (Order `113-2593337-5812239`) with no attached sale.
    - TUBR Gordo Carry Case (`B0H73Q5W2B` / `B0H4J81NNK`): Unit 1 (`item-8a840c62-283c-4490-afcb-64c87b87a981`, SKU `OP-260820-3Z88`) restored to status `'Sold'` with $19.99 sale linked to `inv-1bf6fefd-b715-434b-94ba-c3f555dd6fb3`. Unit 2 (`item-9c3f4e15-8a21-4d32-9cb1-e87a552bf102`, SKU `OP-260820-MW02`) created as status `'Listed'` with active eBay listing `336816297681` ($75) under invoice `inv-4b82d7a1-260928-b0h73q5w2b` (Order `112-8713304-6992213`).
  - Verified remote D1 invariant: exactly zero desynced sales remain across `auction_items` and `auction_sales`.
- **eBay Listing ID Unique Index Collision Defense (`idx_items_ebay_listing`)**:
  - D1 enforces unique non-null eBay listing IDs across `auction_items`: `CREATE UNIQUE INDEX idx_items_ebay_listing ON auction_items(ebay_listing_id) WHERE ebay_listing_id IS NOT NULL`.
  - Cleared stale `ebay_listing_id` from historical Sold unit `item-39df6393-65f4-4547-9ab8-03df7656eeb0` to allow active Unit 2 (`item-6f1e8a24-9b27-4a41-b844-48f86f80a9d1`) to link listing `336766695532`.
  - Normalized JSON attributes across all decoupled rows to ensure `json_valid(attributes) = 1` for index resolution.
  - Added proactive conflict pre-checks in `PUT /api/items/:id` and `POST /api/ebay/sync-item` to catch duplicate listing IDs and SKUs before reaching SQLite, returning actionable 400 validation errors.
- **Live eBay Sale Reconciliation State**:
  - `reconcileAndSaveEbaySale` synchronizes actual eBay Finances and Fulfillment data into `auction_sales` and `ebay_fee_reconciliations`.
  - Prioritizes item `lineItemCost` ($70.00) over total fee basis ($76.95), preventing buyer shipping charges from being double counted in net proceeds arithmetic.
  - Dynamically ingests eBay shipping labels ($6.82) and ad fees ($2.53) directly from Finances API transaction types `SHIPPING_LABEL` and `NON_SALE_CHARGE`.
- **Realized Sale & Fee Reconciliation Modal State [ACTION ID: FIN-001 / MODAL-002]**:
  - **Enriched API & Query Joins (`functions/api/items/enriched.js` & `functions/api/items/index.js`)**:
    - `GET /api/items/enriched` and `GET /api/items` perform a `LEFT JOIN auction_sales s ON i.id = s.item_id` and `LEFT JOIN ebay_fee_reconciliations efr ON s.id = efr.sale_id`.
    - Exposes realized sale and fee reconciliation columns: `sale_id`, `gross_sale_price`, `buyer_shipping_paid`, `actual_shipping_cost`, `platform_fees_amt`, `promoted_listing_fee`, `net_proceeds`, `net_profit`, `buyer_handle`, `ebay_order_id`, `fee_reconciled_at`, `recon_final_value_fee`, `recon_promoted_listing_fee`, and `recon_shipping_label_cost`.
    - Column mapping preserves database schema naming (`s.fee_reconciled_at`) to prevent SQLite schema errors.
  - **Client-Side Modal State Hydration (`EditItemModal.jsx`)**:
    - Maintains `saleData` and `reconData` local state hooks.
    - When opening an item in `'Sold'` status or with an existing `sale_id`, if the parent item does not already embed sale or reconciliation objects, `EditItemModal` automatically triggers `getItem(item.id)` to fetch full enriched records.
    - Passes normalized `sale={saleData || item.sale}` and `reconciliation={reconData || item.reconciliation}` down to `EditTabFinancials`.
  - **Pre-Sale Action Gating (`isSold`)**:
    - `isSold = form.status === 'Sold' || item?.status === 'Sold'` acts as an immutable UI guard across edit tabs (`EditTabFinancials`, `EditTabComps`).
    - Gated elements include pre-sale sensitivity sliders, break-even floor calculation cards, algorithmic price suggestions, and target list price application triggers.
- **Unified Listing & Financials Tab State [ACTION ID: TAB-001 / MODAL-003]**:
  - `EditTabNav` maintains a 5-tab registration matrix. `listing_pricing` is consolidated into `financial`.
  - Transparent route mapping in `EditTabNav` and `EditItemModal`: requests for `activeTab === 'listing_pricing'` (e.g. from table listing badges or external deep links) resolve to `financial`.
  - `EditTabFinancials` receives full listing props (`allPlatforms`, `onPlatformChange`, `handleSyncWithEbay`, `syncingEbay`, `ebayListings`, `loadingEbayListings`, `ebaySearch`, `setEbaySearch`, `fetchActiveListings`, `handlePairEbayListing`), eliminating separate state containers and duplicate fee calculations.
- **Performance & Traffic State [ACTION ID: PERF-001 / TRAFFIC-001]**:
  - `listing_traffic` schema stores atomic daily performance points (`traffic_date`, `impressions_total`, `impressions_search`, `page_views_total`, `click_through_rate`, `sales_conversion_rate`).
  - Active listing dates missing from D1 are ingested safely via eBay range queries (`dimension=LISTING`), populating daily points in D1 without multi-request storms.
  - Client-side auto-fetch lifecycle in `EditItemModal` is protected by `analyticsAttemptedRef` and gated on `!analyticsError` to strictly prevent infinite request loops upon 429 or network errors.
  - Reconciles confirmed sales from `auction_sales` into `onRequestGet`: guarantees `units_sold` is accurately represented, ensures `total_page_views` cannot fall below confirmed orders, and calculates true `sales_conversion_rate` (`(units_sold / total_page_views) * 100`).
  - `EditTabPerformance` renders a dedicated **Completed Sale Telemetry** banner for sold items and displays real trend sparklines, daily search/organic stacked bars, and conversion efficiency.
  - Interactive tooltip UI state uses accessible `InfoTooltip` with named `group/tip` Tailwind hover and `group-focus-within/tip` keyboard focus states, directional popover positioning (`align="left|center|right"`), and `pointer-events-none` to prevent hover traps while navigating tabular performance charts.
  - **Single-Call Store-Wide Telemetry Batching State [ACTION ID: PERF-002 / TRAFFIC-002]**:
    - `ingestListingTraffic` batches up to 200 listing IDs in a single eBay Analytics request (`filter=listing_ids:{id1|id2|...}`).
    - Protects the strict eBay Sell Analytics quota of 100 calls per 24 hours (resetting daily at 07:00 UTC / midnight Pacific / 3:00 AM EDT).
    - Writes all item metrics to `listing_traffic` using 90-statement D1 chunks and writes 30-day snapshot columns (`total_impressions_30d`, `total_page_views_30d`, `avg_ctr_30d`, `avg_conversion_30d`, `analytics_fetched_at`) to `auction_items`.
    - `POST /api/ebay/sync-all` runs batch traffic ingestion automatically at store sync, updating all 30+ items in 1 single API call.
    - Subsequent item modal opens serve directly from local D1 database cache in <50ms with 0 API calls.
  - **Resilient Multi-Key Metric Parsing, Range Coverage Validation, and Monotonic Request Tracking [ACTION ID: PERF-003 / TRAFFIC-003]**:
    - `extractTotalViews`, `extractTotalImpressions`, and `extractSearchImpressions` in `functions/api/ebay/analytics.js` dynamically resolve metric keys across eBay Sell Analytics schema variants (`LISTING_VIEWS_TOTAL`, `TOTAL_LISTING_VIEWS`, `LISTING_VIEWS_SOURCE_*`), extracting numeric values whether represented as nested value objects (`{ value: n }`) or direct numbers.
    - `onRequestGet` verifies cache date range coverage by comparing the oldest cached date with `expectedStartDate`. Expanding date range from 30d to 90d automatically triggers ingestion for missing historical dates rather than returning an incomplete 30-day cache.
    - Single-listing traffic ingestion scopes eBay queries to `listing_ids:{listingId}` for immediate isolation and zero batch overhead during item modal inspections.
    - `EditItemModal.jsx` manages `analyticsFetchRequestIdRef` monotonic counter per AUDIT-004 to eliminate stale race conditions during rapid time-range toggling.
  - **Left-Side Pricing Breakdown Hover & Table Column State [ACTION ID: UI-005 / GRID-002]**:
    - Hover popover triggers removed from right-side price columns (`current_list_price` and `landed_floor`) to eliminate interference with inline editing and click-to-edit targets.
    - Sticky `ACTIONS` column toolbar hosts dedicated `CircleDollarSign` button (`pricing_details` tooltip type) with amber border and styling.
    - `InventoryPricingTooltip` detects left-side viewport triggers (`rect.left < 400`) and anchors the floating card to the right (`rect.right + 10`), avoiding actions occlusion.
    - Synchronized column minWidth and defaultWidth for `actions` set to 195px (`Math.max(195, columnWidths.actions || 195)`) across header and row cells.
  - **Pricing Breakdown & Floor Metrics Mathematical State [ACTION ID: PRICING-001 / TOOLTIP-002]**:
    - Isolated calculation engine in `src/utils/pricingMetrics.js` (`getItemFloorMetrics`), consumed directly by `InventoryPricingTooltip.jsx`.
    - Evaluates exact mathematical formulas:
      1. True Net Profit: `listPrice - platformFees - adFees - landedCost`
      2. Margin %: `(True Net Profit / listPrice) * 100`
      3. ROI %: `(True Net Profit / landedCost) * 100`
      4. Break-even Floor Price (0% profit): `(landedCost + platformFlatFee + (buyerShipping * platformFeePct)) / (1 - platformFeePct - adFeePct)`
      5. Min Target Margin Floor: `(landedCost + platformFlatFee + (buyerShipping * platformFeePct)) / (1 - platformFeePct - adFeePct - targetMarginPct)`
    - Incorporates buyer-paid shipping burden (`buyerShipping * platformFeePct`) into the floor formula numerator when platform fees apply to shipping.
    - Guards division by zero for $0 acquisitions or zero list prices, formatting missing or un-costed values as `--` and rounding all currency/percent calculations via `round2`.
  - **Telemetry Tooltip Positioning & eBay Analytics Quota State [ACTION ID: PERF-004 / QUOTA-001]**:
    - `InfoTooltip` across all 7 KPI cards in `EditTabPerformance.jsx` uses `position="bottom"` (`top-full mt-2`) with `max-w-[calc(100vw-2rem)]` and `max-h-[85vh]` overflow bounds, preventing top container clipping inside the modal scroll body.
    - Ingestion in `functions/api/ebay/analytics.js` logs every external call to `outpost_sync_history` with `sync_type = 'ebay_analytics'`.
    - `getEbayAnalyticsQuota` computes daily Pacific Time usage against the 100-call limit:
      ```javascript
      {
        daily_limit: 100,
        used: number,
        remaining: number,
        resets_at: string, // ISO UTC string of next midnight Pacific Time
        resets_in_hours: number
      }
      ```
    - Handled via early-return parameter `GET /api/ebay/analytics?quota_only=1` and attached to standard analytics responses (`payload.quota`).
    - `EditTabPerformance.jsx` consumes `data?.quota` to render dynamic header badge (`⚡ eBay API: X/100 Used (Y Left)`) with threshold coloring (>30 green, <=30 amber, <=10 red pulse) and footer breakdown.
    - `SettingsView.jsx` maintains `ebayQuota` and `loadingQuota` state, displaying a dedicated progress card under Integrations with on-demand refresh via `fetchEbayAnalyticsQuota()`.
  - **eBay Seller Hub Multi-Source Metric Reconciliation State [ACTION ID: PERF-007 / TRAFFIC-004]**:
    - Prioritizes `TOTAL_IMPRESSION_TOTAL` over `LISTING_IMPRESSION_TOTAL` in `extractTotalImpressions`, ensuring overall marketplace impressions (including category browse and item recommendations) match eBay Seller Hub rather than search-only slots.
    - Expands `metricsParam` in `ingestListingTraffic` with granular source metrics (`LISTING_VIEWS_SOURCE_OFF_EBAY`, `LISTING_VIEWS_SOURCE_OTHER_EBAY`, `LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE`, `LISTING_VIEWS_SOURCE_STORE`, `LISTING_VIEWS_SOURCE_DIRECT`).
    - Uses `Math.max(directViews, sourceSum)` in `extractTotalViews` to prevent omitting off-eBay visits or non-search internal views when `LISTING_VIEWS_TOTAL` reflects only search clicks.
    - Updates Total Impressions state breakdown in `EditTabPerformance.jsx` to `Browse/Ad` and `Search`, aligning with Seller Hub terminology.
  - **Sticky Inventory Thumbnail Column & Multi-Column Offsets [ACTION ID: UI-006 / THUMB-001]**:
    - `DEFAULT_COLUMNS` in `src/utils/userSettings.js` and `src/components/inventory/InventoryDataGrid.jsx` includes `{ key: 'image', label: 'Item Photo', defaultVisible: true, minWidth: 44, defaultWidth: 44 }` at index 1 directly between `actions` and `item_name`.
    - `InventoryDataGrid.jsx` header and `InventoryGridRow.jsx` calculate sticky left positions with dynamic image visibility:
      - `actions`: `left: 0`
      - `image`: `left: ${actionsWidth}px`
      - `item_name`: `left: ${actionsWidth + (isImageVisible ? imageWidth : 0)}px`
    - Shared `PREVIEW_CACHE` Map exported from `ItemImageHoverTooltip.jsx` stores resolved positive image hits in memory across hovers and thumbnail cells.
    - `ItemThumbnailCell` resolves images via `resolveItemImage(item, attrs)` and `PREVIEW_CACHE`, providing instant visual rendering, onError fallback to `<Package />`, click-to-edit modal opening, and hover portal tooltip triggering.
    - Decoupled `item_image` hover tooltip triggers (`onMouseEnter` / `onMouseLeave`) from the item title/description cell in `InventoryGridRow.jsx`; hover portal triggers strictly on direct interaction with `ItemThumbnailCell`, while title cell retains `title` attribute for native tooltip and click-to-edit navigation.
  - **Inventory and Sales Log Decoupling State [ACTION ID: INV-004 / SALES-002]**:
    - `InventoryDataGrid.jsx`: Removed `soldItems` grouping memo and secondary "SOLD ITEMS" completed transactions accordion section. Table rows render strictly from `activeItems` (`(items || []).filter(it => it.status !== 'Sold')`).
    - `InventoryHubView.jsx`: Wrapped `displayItems` in memoized filter `sortedItems.filter(it => it.status !== 'Sold')`, preventing completed sales from appearing in both Table View and Pricing View.
    - `InventoryCommandBar.jsx`: Filtered `'Sold'` out of the status dropdown (`ALL_STATUSES.filter(s => s !== 'Sold')`), preventing zero-count or empty sold queries in the active inventory view. "All Status" counter reflects strictly active inventory.
    - `functions/api/items/enriched.js`: Automatically injects `conditions.push("i.status != 'Sold'")` when no status filter is provided or `status` is empty, keeping `pagination.total` and returned `items` bounded to active stock while supporting `include_sold=true` when explicit historical querying is required.
  - **Segmented Inventory Status Quick Tabs State [ACTION ID: UI-007 / TAB-002]**:
    - `InventoryCommandBar.jsx`: Defines `STATUS_TABS` configuration (`[ { id: '', label: 'All', countKey: 'all' }, { id: 'Listed', label: 'Listed', countKey: 'Listed' }, { id: 'Available', label: 'Available', countKey: 'Available' }, { id: 'Kept for Self', label: 'Kept for self', countKey: 'Kept for Self' } ]`).
    - Tab Selection: Clicking sets `statusFilter` directly in `InventoryContext`, which triggers `fetchItems(1)` to reload page 1 with active query parameters.
    - Two-Way Dropdown Sync: Dropdown `#inventory-status-filter` synchronizes value with `statusFilter`; selecting a tab highlights the tab and selects the value in dropdown, while selecting secondary statuses in the dropdown (`Draft`, `Unsold`, `Returned`) updates `statusFilter` and clears tab active highlights.
    - `functions/api/items/enriched.js`: Injects dynamic `statusCountsSql` (`SELECT i.status, COUNT(*) AS count FROM auction_items i WHERE i.user_id = ? AND i.status != 'Sold' ... GROUP BY i.status`) matching non-status active filters (category, format, search) and returns `status_counts` alongside paginated items.
    - `InventoryContext.jsx`: Maintains `serverStatusCounts` state from `data.status_counts`, preventing count pill collapse or zero-state flicker when toggling between statuses or navigating paginated pages. Optimistically mutates `serverStatusCounts` on `updateItemLocal(id, patch)`.
  - **Automated Listed Transition State on eBay Connection [ACTION ID: SYNC-005 / EBAY-008]**:
    - `functions/api/ebay/sync-item.js`: Default status assignment on active non-sold sync set to `'Listed'` (`newStatus = 'Listed'`), transitioning Available/Draft items to Listed status in D1.
    - `functions/api/items/[id].js`: When `body.ebay_listing_id` is supplied without an explicit status, Available or Draft items automatically transition to `status = 'Listed'`, `platform = 'eBay'`, and `date_listed = now()`.
    - `InventoryHubView.jsx`: `handleItemLocalUpdate` and `handleModalItemUpdated` inspect patched items for `status === 'Listed'` upon eBay connection, triggering `setStatusFilter('Listed')` to automatically move the active view focus to the "Listed" tab.
  - **Status Priority Hierarchy Sorting State [ACTION ID: INV-005 / SORT-001]**:
    - `src/utils/constants.js`: Exports `STATUS_PRIORITY_RANK` object (`{ 'listed': 1, 'available': 2, 'kept for self': 3, 'draft': 4, 'unsold': 5, 'returned': 6 }`) and `getStatusRank(status)` helper mapping status strings (with case-insensitive trimming) to numeric ranks, defaulting to 99 for unknown statuses.
    - `src/context/InventoryContext.jsx`: `sortedItems` computes `isAllStatusView = !statusFilter || statusFilter === 'All'` and `isDefaultSort = sortPreset === 'default' || (sortConfig.key === 'created_at' && sortConfig.direction === 'desc')`.
    - Primary Sorting: In default All view, sorts by `getStatusRank(a.status) - getStatusRank(b.status)`. When user explicitly sorts by Status (`sortConfig.key === 'status'`), sorts by status rank with respect to `sortConfig.direction`.
    - Secondary Tie-Breaking: Within items of identical rank, preserves secondary sorting: `created_at` descending, followed by deterministic SKU/ID alphanumeric tie-breaking.
    - User Sort Preservation: Explicit column sorts (`sortPreset === 'custom'` or non-default presets) and active status-specific filters bypass default status clustering to respect user column sorting across items.
    - Server-Side D1 Synchronization: `functions/api/items/enriched.js` and `functions/api/items/index.js` apply `STATUS_CASE_SQL` to order SQLite results by status rank ASC and `created_at DESC` when querying all statuses under default sorting, ensuring database pagination partitions items in lockstep with the client hierarchy.
  - **Modular Dark-Theme eBay Listing Generator State [ACTION ID: LST-001 / EBAY-009]**:
    - `src/utils/ebayTemplate.js`: Pure function `generateEbayListingHtml(item)` generates an inline-styled dark-theme modular card layout (`max-width:900px`, `background-color:rgb(17,17,17)`, `border:1px solid rgb(51,51,51)`).
    - Dynamic Inventory API Schema State Mapping:
      - Attributes parsing: Evaluates `typeof item.attributes === 'string'` with safe JSON try-catch parsing.
      - Core fields: Dynamically falls back across Outpost inventory columns (`item_name`, `notes`, `condition`, `authenticator`, `cert_number`, `athlete_person`).
      - Key details: Resolves array/newline `features` with fallback to `Brand: ${brand || 'N/A'}` and `Model: ${model || 'N/A'}`.
      - What's included: Resolves `includedItems`/`includedInSale` with fallback to `${title}` and exact photographs.
    - Conditional Authentication State:
      - Evaluates explicit `item.authentication` object or resolves `item.authenticator` against uncertified states (`Raw`, `Uncertified`, `None`, `Other`, `N/A`).
      - Only renders the Authentication card block when verified certification or autograph metadata is present, rendering an empty string (`''`) for standard retail/non-autographed items.
    - Generator Integration State:
      - `src/utils/listingCopyGenerator.js` exports `generateEbayListingHtml` and integrates it into `generateEbayCopy`.
      - In `generateEbayCopy`, `insertHtml` delegates directly to `generateEbayListingHtml`, and `htmlBody` wraps the modular cards in a matching dark viewport frame (`#0b0f19`) with store branding and trust signals for `ListingCopyModal`.
  - **Pricing Floor Concordance and Tooltip State [ACTION ID: CALC-002 / TOOLTIP-001]**:
    - `src/utils/pricingMetrics.js`: `getItemFloorMetrics(item)` computes `breakEvenFloor` using `costBasis = landedCost + platformFlatFee + estShippingCost` and `divisor = 1 - platformFeePct - adFeePct`, eliminating divergent buyer-shipping fee burden from the break-even calculation.
    - Synchronized State Binding: Returns `Number(item.floor_price || item.min_sell_price)` when populated on the item entity, ensuring the `InventoryPricingTooltip` Break-Even Floor Price and the `InventoryGridRow` Landed & Floor cell stay in 100% agreement.
    - Non-Overlapping Tooltip State: `InventoryGridRow.jsx` replaces the native `title` attribute on the pricing breakdown trigger button with `aria-label`, eliminating conflicting browser tooltips that obscured the pricing popover.
  - **Gemini AI Dynamic Listing Template State [ACTION ID: AI-001 / EBAY-010]**:
    - `functions/api/ai/generate-ebay-details.js`: Serverless endpoint executing Gemini `gemini-3.5-flash-lite` (primary, 8s, 1 transient retry) with `gemini-3.8-flash` (10s) and `gemini-2.5-flash` (10s) fallbacks via `generateContent` API within a 14s total budget, `fetchWithTimeout` (AUDIT-003), status-specific error classification (`buildGeminiUpstreamError`), zero em-dash enforcement, and internal tracking filter (`stripInternalTrackingNotes`) stripping warehouse lot/item/invoice references from prompt and response.
    - `src/utils/ebayTemplate.js`: Evaluates `item.aiGeneratedMiddleSection`; if present and non-empty, injects the custom Condition and Key Details cards between Header Banner and What's Included / Authentication cards, falling back to static layout when absent. Integrates `stripInternalTrackingNotes` on description and condition details to guarantee internal lot/item numbers (`Lot #12862710 · Item #8183938`) are never rendered in public listings.
    - `src/utils/listingCopyGenerator.js`: Exports `stripInternalTrackingNotes` and renders the updated outer HTML template (`fe4AAeSwSO1q8G1~` header banner, `ADD LISTING INFO HERE` content container delimiters, and compact dark footer strip with store link).
    - `src/components/ListingCopyModal.jsx`: Manages `aiGeneratedMiddleSection`, `generatingAiDetails`, and `aiDetailsMsg` state hooks. Automatically scrubs internal lot and item tracking metadata when initializing form description and before sending notes to AI generation. Exposes dedicated "Copy Full HTML" (`htmlBody`) and "Copy Insert Only" (`insertHtml`) actions.
  - **D1 Write-Budget & Differential Synchronization State [ACTION ID: PERF-004 / DB-001]**:
    - `functions/api/ebay/analytics.js`: `ingestListingTraffic` pre-fetches existing `listing_traffic` rows for `(user_id, startYMD..endYMD)` into `existingTrafficMap` and skips unchanged daily records. Uses deterministic primary keys (`lt-${listingId}-${ymd}`) and conditional `ON CONFLICT(ebay_listing_id, traffic_date) DO UPDATE ... WHERE` clauses so SQLite never rewrites unchanged rows or secondary indexes. `onRequestGet` updates `auction_items` 30-day snapshot columns strictly when `needsIngestion === true`, and backfills missing dates via `INSERT OR IGNORE` on HTTP 429 even when partial range rows exist.
    - `functions/api/ebay/sync-all.js`: Enforces a 3-minute server-side cooldown on background auto-polls (`manual: false`) using `outpost_sync_settings.last_ebay_sync_at`, gates store-wide `ingestListingTraffic` on `ANALYTICS_CACHE_TTL_HOURS` (12h) across non-sold items, and performs field-level dirty-checking (`isDirty`) before executing `UPDATE auction_items`.
    - `functions/utils/syncLogger.js`: Tracks initialized D1 bindings per isolate via `initializedDbs = new WeakSet()`, ensuring `CREATE TABLE IF NOT EXISTS outpost_sync_history` runs at most once per isolate lifecycle and eliminating runtime `ALTER TABLE` executions.
    - `functions/api/ebay/webhook.js`: Uses deterministic `ebw_${notificationId}` keys with `INSERT OR IGNORE INTO ebay_webhook_events` to short-circuit duplicate webhook deliveries (`meta.changes === 0`).
    - `src/context/InventoryContext.jsx` & `src/components/EditItemModal.jsx`: Background `setInterval` timers check `document.visibilityState !== 'hidden'` and pass `{ manual: false }` to `syncAllEbayItems`. `EditItemModal` skips `fetchActiveListings()` when opening items in `'Sold'` or `'Returned / Refunded'` status.
  - **Dedicated Cloudflare D1 Database State (`outpost-db`) [ACTION ID: DB-002 / INFRA-001]**:
    - `outpost/wrangler.jsonc`: Binds `env.DB` (`"binding": "DB"`) to dedicated Cloudflare D1 database `outpost-db` (`database_id`: `c41ad6c7-26f1-4ca8-9af8-82990ccb4566`), decoupling Outpost from `personal-budget-db`.
    - `outpost/auction-schema.sql`: Defines the complete 27-table Outpost schema (`users`, `email_verifications`, `password_resets`, `auction_invoices`, `auction_items`, `auction_sales`, `auction_comps`, `auction_platforms`, `auction_supplies`, `auction_market_alerts`, `ebay_oauth_tokens`, `ebay_webhook_events`, `ebay_fee_reconciliations`, `auction_item_analytics`, `market_comps`, `listing_traffic`, `outpost_sync_settings`, `outpost_sync_history`, `api_integrations`, `ebay_listings_cache`, `ebay_active_listings`, `auction_item_images`, `auction_item_specs`, `auction_item_platform_listings`, `ebay_reconciliation_fee_lines`, `import_batches`, `import_batch_file_chunks`).
    - All existing Outpost production records were migrated and verified across both remote and local `outpost-db` instances.
  - **Relational Normalization & Fast-Path Column State [ACTION ID: DB-003]**:
    - `ebay_active_listings`: Discrete 1-to-many active listing table with primary key `ebay_listing_id`, foreign user scoping, and indexes `idx_ebay_active_user_sku` and `idx_ebay_active_user_synced`. Replaces monolithic `ebay_listings_cache` JSON blob reads while maintaining dual-write backward compatibility.
    - `auction_items`: Fast-path columns (`asin`, `order_id`, `image_url`, `is_vinescout`, `etv`, `tax_cost`, `cert_verified`, `cert_verified_at`) with indexes `idx_auction_items_asin`, `idx_auction_items_order_id`, and `idx_auction_items_vinescout`.
    - Handlers: `enriched.js` and `image-preview.js` prioritize native column values before JSON fallback. `amazon.js`, `[id].js`, and `sync/vinescout-catalog.js` synchronize native columns on insert and update.
  - **Deep Relational Normalization State [ACTION ID: DB-004]**:
    - `auction_item_images`: Relational gallery table replacing embedded `images` JSON arrays. Indexed via `idx_item_images_order` on `(item_id, display_order)` and `idx_item_images_primary` on `(item_id, is_primary)`.
    - `auction_item_specs`: Relational specifications and bullet features table replacing opaque `specs` and `features` JSON blobs. Indexed via `idx_item_specs_item` on `(item_id, spec_type, display_order)`.
    - `auction_item_platform_listings`: Relational multi-platform mapping table with compound unique index `idx_item_platform_listings_unique` on `(item_id, platform_id)`.
    - `ebay_reconciliation_fee_lines`: Discrete fee line item breakdown table replacing JSON arrays in `ebay_fee_reconciliations`, indexed via `idx_fee_lines_recon`.
    - Normalized Store Engine: `functions/utils/normalizedItemStore.js` provides atomic positional parameter queries (`FIN-AUDIT-001`) for decomposing and reconstructing item relations on all read/write paths. Annotated as dormant stub with canonical data residing on `auction_items.attributes`.
  - **Read/Write Optimization & Schema Consistency State [ACTION ID: PERF-005 / AUDIT-004]**:
    - `functions/api/import/batch.js`: Repaired `ON CONFLICT(item_id)` conflict targets for `auction_sales` and `auction_comps` inserts, aligning batch upsert queries with schema unique keys.
    - `functions/api/sync/finance.js` & `FinanceSyncModal.jsx`: Removed dropped Finance table references (`households`, `accounts`) from `outpost-db`. Exposes live Outpost metrics with `bridge_status: 'unavailable'` and amber notification state.
    - Query Round-Trip Reductions: `functions/api/items/enriched.js` batches status group counts and rows, calculating active totals in-memory. `functions/api/sales/index.js` batches aggregate summaries and rows.
    - In-Engine SQL Aggregations: `functions/api/reports/tax.js` calculates IRS Schedule C beginning/ending inventory values via conditional `SUM()` queries directly on SQLite.
    - Chunked Ingestions & Decoupled Polling: `functions/api/ebay/listingsCache.js` and `functions/api/ebay/sync-all.js` apply 50-statement chunking. `src/context/InventoryContext.jsx` stabilizes sync callbacks with `useRef` to eliminate interval churn.
    - Indexes: Added `idx_auction_items_user_status_created` on `(user_id, status, created_at DESC)` and `idx_market_alerts_user_unread` on `(user_id, is_read, created_at DESC)`. Dropped redundant duplicate index `idx_auction_sales_item`.
  - **Phase 1 Security & Authentication State Hardening [ACTION ID: SEC-001 / AUDIT-005]**:
    - Central Edge Auth Dispatch: `src/worker.js` inspects `routeMatch.route.auth` prior to handler execution. Unauthenticated requests fail before reaching business logic.
    - Stale Cookie Cleansing: All 401 and 403 responses emit `Set-Cookie: auth_token=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/` to immediately terminate invalid client sessions and prevent automated background request thrashing.
    - Multi-Tenant Isolation & Anti-Takeover: `functions/api/items/[id].js`, `functions/api/ebay/sync-item.js`, and `functions/api/import/batch.js` scope `ebay_listing_id` and `sku` uniqueness checks to `user_id = ?`, returning sanitized 400 responses that hide foreign tenant row existence. `functions/api/ebay/listingsCache.js` enforces `WHERE ebay_active_listings.user_id = excluded.user_id` on conflict updates to block tenant listing takeovers.
    - Token Version Invalidation: `functions/utils/guard.js` evaluates `tokenTv < currentTv` to invalidate sessions immediately upon `token_version` increment (triggered on password change or email update in `auth/verify-email.js`).
    - Dynamic Alarm Window State: `functions/utils/RateLimitCounter.js` stores `windowMs` and schedules storage alarm TTL dynamically derived from the active rate-limit window with a 60-second floor.
    - CSV Formula Neutralization: `src/utils/csvExport.js` sanitizes export fields across `TaxReportModal.jsx` and `SettingsView.jsx`, neutralizing cell prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) to protect users from formula injection attacks during spreadsheet opens.
  - **Phase 2 Financial & Lifecycle Integrity State Hardening [ACTION ID: FIN-002 / AUDIT-006]**:
    - Pricing Engine State Delegation: `src/utils/pricingMetrics.js` delegates calculation state directly to `src/utils/feeEngine.js` (`computeFeeBreakdown`, `computeTargetPriceFromMargin`), outputting both percentage and decimal forms (`marginPct`, `marginDecimal`, `roiPct`, `roiDecimal`) alongside canonical `breakdown` metadata, resolving pricing floor and margin discordance across `InventoryPricingTooltip`, `FeeBreakdownPanel`, and `EditItemModal`.
    - Integer-Cent Hamilton Largest-Remainder Allocation State (`distributeCents`): `functions/utils/auction.js` upgrades `round2` with sign-aware epsilon (`1e-9`) for IEEE-754 half-cent precision and adds Hamilton largest-remainder integer cent distribution to `reprorateBatch`, eliminating invoice discount/tax proration penny loss and ensuring item landed costs sum strictly to invoice totals down to $0.01.
    - Lifecycle State Guardrails & Non-Destructive Rollback State: `functions/api/ebay/sync-all.js` holds item status in `item.status || 'Listed'` when order matches are deferred to `PENDING_SALE_MATCH`; `functions/api/sales/index.js` and `functions/api/ebay/tokenHelper.js` snapshot `priorSale` so transaction failures only delete newly inserted sale records and never destroy pre-existing sales; `functions/api/ebay/match-sold-vinescout.js` keys lines by `order_id:line_item_id` and populates `actual_sell_price`, `date_sold`, and `days_on_market` (via `daysBetween`) on `auction_items`; `functions/api/ebay/sync-item.js` preserves item `status` and `platform` when listing ID is absent; automated sync queries in `sync-all.js` and `analytics.js` exclude canonical `'Returned'` status alongside `'Sold'`.
    - Fee Reconciliation State Isolation & Platform Validation: `functions/api/ebay/reconcile.js` isolates `actualPlatformFees` from `shippingLabelCost` so `feeDelta` measures platform fees independently without label cost distortion; `functions/api/platforms/[id].js` enforces `validatePercentage` (`0 <= fee_pct < 1`) on platform updates.
    - Tax Asset Valuation & Ingestion Parser State: `functions/api/reports/tax.js` applies `round2` on financial totals and filters out non-sellable statuses (`'Kept for Self'`, `'Returned'`) from IRS inventory asset valuations; `src/utils/pdfInvoiceParser.js` captures `adjustments.buyersPremium` into invoice tax and item landed cost basis with `round2` rounding; `src/utils/spreadsheetParser.js` imports fee and shipping defaults and computes pricing floors for $0 cost items; `functions/api/import/amazon.js` wraps in `withAuth`, checks indexed `order_id`, and blocks re-importing sold items; `functions/api/import/batch.js` respects 0% fees via `Number.isFinite`, rounds manual averages, and auto-computes pricing floors.
  - **Phase 3 Listing Security, Timeouts & Image Sync State [ACTION ID: LIST-001 / AUDIT-007]**:
    - HTML XSS Sanitization State: `src/utils/ebayTemplate.js` exports `escapeHtml` (entity-encoding `&`, `<`, `>`, `"`, `'`) and `sanitizeListingHtml` (stripping `<script>`, `<iframe>`, `on*` event handlers, `javascript:` schemes, and `expression()` styles). All dynamic template string fields in `generateEbayListingHtml` are entity-escaped, and AI middle sections are double-sanitized via `stripInternalTrackingNotes` followed by `sanitizeListingHtml`. `src/utils/listingCopyGenerator.js` re-exports both sanitizers, escapes table rows and store links, and performs word-boundary truncation (<= 80 chars). `src/components/ListingCopyModal.jsx` passes HTML through `sanitizeListingHtml` before rendering dangerouslySetInnerHTML.
    - Gemini Key Header-Only Security State: `functions/api/ai/generate-ebay-details.js` passes Gemini API key strictly via `x-goog-api-key` request header, eliminating key leakage in URL query parameters and access logs. Replaces local tracking filter with imported `stripInternalTrackingNotes` from `ebayTemplate.js`.
    - Timeout Hardening State: 15-second abort signal (`AbortSignal.timeout(15000)`) enforced on external fetch calls across `functions/api/items/image-preview.js` (Amazon gateway), `functions/api/market-alerts.js` (live comps gateway), `functions/utils/auth.js` (Resend email API), and `src/utils/auctionApi.js` (client `apiFetch` and gateway wrappers `fetchLiveComps`, `fetchEbayCatalog`, `fetchEbayItemDetail`, `fetchAmazonProduct`).
    - Crypto Consolidation & XML Injection State: `functions/api/ebay/tokenHelper.js` imports and re-exports AES-GCM primitives from canonical `src/utils/tokenCrypto.js` and applies `xmlEscape()` on `accessToken`, `cleanId`, and `cleanSku` in Trading API XML calls to neutralize XML injection risks.
    - Settings Endpoint Hardening State: `functions/api/sync/settings.js` PUT handler restricts updates to 4 user-editable fields (`ebay_auto_sync`, `ebay_sync_interval_m`, `vscout_auto_sync`, `vscout_sync_interval_m`), ignoring client overrides for sync timestamps.
    - Relational Image Dual-Write State: `functions/api/items/image-preview.js` and `functions/api/ebay/sync-item.js` dual-write resolved image URLs to both `auction_items.image_url` and `auction_item_images` (`sort_order=0, is_primary=1`) atomically via `env.DB.batch()`. `functions/api/items/[id].js` cascades item deletes across `auction_item_images`, `auction_item_specs`, and `auction_item_platform_listings`. `src/components/edit/EditTabDetails.jsx` provides an interactive gallery thumbnail strip from `attributes.image_urls` allowing primary image promotion.
  - **Phase 4 UI/UX Consolidation, Frontend State & Ergonomics [ACTION ID: UI-007 / AUDIT-008]**:
    - Pruned Dead Code State: Removed orphaned files `EditTabListingPricing.jsx`, `LiveFeeReadout.jsx`, `QuickEditDrawer.jsx`, `EbayListingIdModal.jsx`, and `StatusFilterBar.jsx`. Removed dead mounts `<LogSaleModal>` and `<EbayListingIdModal>` from `InventoryHubView.jsx`.
    - Modal Confirmation Architecture State: `src/components/ui/ConfirmModal.jsx` provides an accessible, non-blocking replacement for browser `window.confirm()` across all 11 destructive actions in `EbayConnectBanner.jsx`, `EditItemModal.jsx`, `InventoryHubView.jsx`, `SalesLogView.jsx`, and `SettingsView.jsx`.
    - Session Event & Reactive Navigation State: `src/utils/auctionApi.js` exports `apiFetch` and emits `outpost:unauthorized` CustomEvent on HTTP 401 and 403 responses. `src/context/AuthContext.jsx` subscribes to clear invalid credentials without page reload, and dispatches `popstate` events on pushState transitions.
    - Role-Based Access State: Admin gating across `App.jsx`, `AppLayout.jsx`, `AdminView.jsx`, and `CommandPalette.jsx` evaluates `user?.role === 'admin' || Boolean(user?.is_admin)` alongside configured admin emails.
    - Stale-Response Guard State: Monotonic `fetchRequestIdRef` sequence tracking implemented in `DashboardView.jsx`, `MarketAlertsPanel.jsx`, `AdminView.jsx`, `ViewInvoiceModal.jsx`, and `EditItemModal.jsx`.
    - Server-Side Portfolio KPI State: `functions/api/items/enriched.js` computes active portfolio landed cost and list value totals directly in SQLite via conditional aggregations, passed through `InventoryContext.jsx` as `portfolioKpis` to decouple dashboard and inventory header metrics from pagination boundaries.
    - Platform In-Memory Cache State: `src/utils/auctionApi.js` caches `getPlatforms()` for 60 seconds and auto-invalidates on write operations. Keyboard shortcut `/` focuses active view search inputs.
  - **Phase 5 Next-Level Repricing & Channel-Routing State [ACTION ID: REPRICE-001 / CHANNEL-001 / AUDIT-009]**:
    - Repricing Decay Engine State: `functions/utils/auction.js` exports `computeAgingDecaySuggestion` and `src/utils/feeEngine.js` re-exports it. Gated strictly on actively listed inventory (`status = 'Listed'`), calculating days listed from `date_listed` (or fallback intake dates), categorizing into `0-30d` (hold), `31-60d` (-10%), `61-90d` (-20%), and `90d+` (liquidation). Unlisted inventory (`Available`, `Draft`, `Sold`) returns `eligible: false` and `tier: 'unlisted'`. All markdowns are strictly clamped to the 0% net loss break-even floor (`computePricingFloors` with `target_margin_pct = 0`). Items at or below floor are flagged `at_floor_blocked: true`. Items with `reprice_locked = 1` are excluded from suggestions.
    - Repricing Persistence & Migration State: Migration `migrations/0012_repricing_channel_routing.sql` extends `auction_items` with `original_list_price` (REAL), `last_repriced_at` (TEXT), `reprice_locked` (INTEGER DEFAULT 0), and `reprice_tier` (TEXT), supported by covering index `idx_auction_items_reprice`. `functions/api/items/[id].js` allows updating `reprice_locked` via PUT `/api/items/:id`.
    - Serverless Repricing API State: `functions/api/items/reprice-candidates.js` provides `GET /api/items/reprice-candidates` scanning actively listed inventory (`status = 'Listed'` exclusively) to return decay candidates and aggregate portfolio markdown stats. `functions/api/items/reprice-apply.js` provides `POST /api/items/reprice-apply`, re-verifying floor constraints server-side, guarding against unlisted items, persisting revisions via `chunkedBatch()`, and revising active eBay prices via `updateEbayListingPrice()` in `tokenHelper.js`.
    - Channel-Routing Economics State: `functions/utils/auction.js` and `src/utils/feeEngine.js` export `compareChannelEconomics` to evaluate eBay Shipped net profit (deducting FVF, promoted listing ad fee, flat fee, and shipping label cost) against Facebook Marketplace / Local Pickup net profit (zero commissions, zero shipping costs, optional cash discounts). Generates `net_advantage`, recommended channel, and rationale badge.
    - Local Dual-Template Copy State: `src/utils/listingCopyGenerator.js` exports `generateFacebookCopy` alongside `generateEbayCopy`, outputting human-readable titles (<= 100 chars), formatted cash asking prices, authentication certs, bulleted features, and local safe-pickup terms with internal tracking notes stripped.
    - Repricing & Channel UI State: `src/components/inventory/InventoryGridRow.jsx` renders color-coded aging badges (`30d`, `60d`, `90d+`) and interactive lock toggles. `src/components/inventory/InventoryCommandBar.jsx` surfaces the "Reprice Engine" action button. `src/components/inventory/AgingMarkdownModal.jsx` provides an interactive batch review modal for aging markdown candidates with tier filtering and one-click execution. `src/components/edit/EditTabFinancials.jsx` renders the side-by-side Channel Routing & Profit Comparison card. `src/components/ListingCopyModal.jsx` mounts the "Facebook / Local" copy tab.
  - **Operational Dashboard Command State [ACTION ID: DASH-001 / AUDIT-011]**:
    - Aggregation & Radar State: `functions/api/dashboard.js` batches 12 queries atomically via `env.DB.batch()`, calculating idle available capital vs. active listed capital, unrealized profit margin, and an aging summary matrix across 4 decay buckets (`fresh_count`, `decay_10_count`, `decay_20_count`, `liquidation_count`, `locked_count`) using `julianday('now')` date deltas on SQLite. Surfaces the top 5 oldest active listings and top 5 unlisted high-capital items.
    - Dashboard Operations UI State: `src/components/DashboardView.jsx` mounts `<AgingMarkdownModal>` for one-click in-place batch repricing, integrates with `InventoryContext` to pass `Available` status filters and SKU search parameters directly into the Inventory Hub, and provides live one-click eBay sync triggering with real-time UI refresh.
  - **1-Click eBay Listing Creation & Gemini AI Publishing State [ACTION ID: LIST-002 / AUDIT-012]**:
    - Trading API SOAP XML Engine State: `functions/api/ebay/tokenHelper.js` exports `createEbayListing(env, accessToken, listingData)`, `reviseEbayListing(env, accessToken, listingId, listingData)`, and `xmlEscape(s)`. Builds validated `AddFixedPriceItem` and `ReviseFixedPriceItem` XML with CDATA description wrappers, ConditionID mapping (`1000` New, `2750` Like New, `3000` Used, `1500` Open Box), CategoryID resolution (`213` cards, `267` books, `9355` electronics, `212` default), EPS photo placeholder fallbacks, `Object Type` item-specific resolution (`resolveEbayObjectType`), and `21919303` retry-without-specifics fallback on revisions. Extracts 12-digit ItemID and formats canonical listing URLs (`https://www.ebay.com/itm/${itemId}`).
    - Serverless Creation Endpoint State: `functions/api/ebay/create-listing.js` handles `POST /api/ebay/create-listing`. Validates authenticated session, fetches item, retrieves eBay user token, invokes `generateAiListingDetails()` and `generateEbayListingHtml()` when AI description is requested, publishes to eBay Trading API, and executes atomic 3-table D1 mutations via `env.DB.batch()`: updating `auction_items` (`ebay_listing_id`, `status = 'Listed'`, `platform = 'eBay'`, `current_list_price`, `date_listed`), upserting `ebay_active_listings`, and upserting `auction_item_platform_listings`.
    - Route Table & Client API State: Registered route `POST /api/ebay/create-listing` with session auth in `src/worker.js`, expanding route table from 80 to 81 verified routes. Client helper `createEbayListingApi(payload)` exported from `src/utils/auctionApi.js`.
    - 1-Click UI Publishing State: `src/components/ListingCopyModal.jsx` mounts the 1-Click eBay Listing Creator action card on the eBay tab with in-flight spinner, success badge, and direct external link to the live eBay listing. `src/components/edit/EditTabFinancials.jsx` mounts the 1-Click Create on eBay button in the pairing hub header for immediate unlisted item publishing. `src/components/InventoryHubView.jsx` attaches the `onListingCreated` refresh callback.
  - **Mobile & Tablet Responsiveness State Engine [ACTION ID: RESP-001 / AUDIT-013]**:
    - Viewport & Safe Area Geometry State: `index.html` implements `viewport-fit=cover` for notch and Dynamic Island perimeter bounding. `src/index.css` provides safe area utility classes (`.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`, `.px-safe`) mapped to `env(safe-area-inset-*)`. Enforces 16px font-size minimum on mobile `<640px` inputs via `@layer base` CSS rule to neutralize forced iOS Safari viewport zoom.
    - App Shell Dynamic Viewport Height: `AppLayout.jsx` bound to `h-[100dvh] max-h-[100dvh]`, isolating main content from iOS Safari address bar height oscillation. Mounts `Tax / Schedule C` launcher directly on mobile header.
    - Inventory Grid Responsive Freeze: `InventoryDataGrid.jsx` and `InventoryGridRow.jsx` constrain 3 sticky-left columns (`actions`, `image`, `item_name`) to `lg:sticky` (`>=1024px`), preventing occlusion of the 12 tabular data columns on iPhone 18 Pro and iPad Portrait viewports. Persistent opacity state (`opacity-70 lg:opacity-0 lg:group-hover:opacity-100`) reveals action pencils on touch surfaces.
    - Mobile Card Fallback State: `InventoryHubView.jsx` initializes `viewMode` state dynamically to `'pricing'` cards when `window.innerWidth < 640px` in the absence of a persisted preference.
    - Touch-Activated Inline Editing: `InlineEditableCell.jsx` detects coarse pointer touch screens (`window.matchMedia('(pointer: coarse)').matches`) to activate cell editing or trigger `onMobileFallback` with a single touch tap instead of requiring double-clicks.
    - Modal Viewport Clamping: Clamped height across 10 modal surfaces (`EditItemModal`, `AddInvoiceModal`, `ViewInvoiceModal`, `ListingMatchReviewModal`, `SoldEbayVineMatcherModal`, `AgingMarkdownModal`, `TaxReportModal`, `ListingCopyModal`, `LogSaleModal`, `FinanceSyncModal`) using `max-h-[90dvh]` to `max-h-[94dvh]` with flex overflow scrolling and bottom safe area clearance.
  - **Import History Archive & Non-Vine P&L State Engine [ACTION ID: IMP-002 / PNL-001]**:
    - Chunked File Archive Persistence (`migrations/0013_import_batches_and_files.sql`, applied locally & remotely on `outpost-db`): Creates `import_batches` and `import_batch_file_chunks` tables (`idx_import_batches_user_created`, `idx_auction_invoices_batch`, `idx_auction_items_batch`) and backfills legacy `import_batch_id` metadata records. `functions/utils/importBatches.js` defines `MAX_IMPORT_FILE_BYTES` (10 MB decoded), `BASE64_CHUNK_CHARS` (524288), `ensureImportBatchTables` (`WeakSet` isolate guard), `prepareImportFileArchive`, `decodeBase64ChunksToBytes`, and `sanitizeDownloadFilename`.
    - Batch Write & Stream State (`functions/api/import/batch.js`, `batches.js`, `batches/[id].js`, `batches/[id]/file.js`, `invoices/index.js`, `invoices/[id].js`): `POST /api/import/batch` persists `import_batches` and chunked blobs inside `statements` while preserving `cleanupBatch` atomic rollback across batches, chunks, invoices, and items. `src/worker.js` expands from 81 to 85 verified routes (`GET /api/import/batches`, `GET /api/import/batches/:id`, `GET /api/import/batches/:id/file`, `GET /api/reports/non-vine-pnl`) and emits `X-Frame-Options: SAMEORIGIN` for inline PDF streams.
    - Non-Vine Cost Exclusion & Standing State (`functions/utils/nonVinePnl.js`, `functions/api/reports/non-vine-pnl.js`, `functions/api/dashboard.js`): `NON_VINE_ITEM_SQL` excludes `is_vinescout = 1` and legacy JSON (`source = 'amazon_vinescout'`, `is_vinescout`, `vine_program` under `json_valid`). `buildNonVinePnlStatements` executes static parameterized SQL statements excluding `Returned` items from `total_non_vine_spend` and embeds `non_vine_pnl` in `GET /api/dashboard`. Fixed `functions/api/items/[id].js` PUT handler so `asin` alone no longer sets `is_vinescout = 1`.
    - Frontend Client & Dashboard State (`src/utils/auctionApi.js`, `ImportHistoryModal.jsx`, `SpreadsheetImporterModal.jsx`, `ViewInvoiceModal.jsx`, `NonVinePnlCard.jsx`, `DashboardView.jsx`): Captures <= 10 MB file SHA-256 and base64 payloads on upload, exposes History tab + inline PDF `<iframe src={blobUrl} />` viewer and download triggers, and mounts `<NonVinePnlCard>` with range switching (`all`, `ytd`, `90d`, `30d`) and `fetchRequestIdRef` stale-response guards on the Dashboard.
  - **Multi-Platform Listing Optimization & Rules Engine State [ACTION ID: LIST-003]**:
    - Shared Rules Registry (`src/utils/platformListingRules.js`): Exports `SUPPORTED_PLATFORMS` (`['ebay', 'facebook', 'mercari', 'whatnot', 'reverb']`), `PLATFORM_RULES_REGISTRY`, `computeUtf16Length`, `resolveWearableSize`, `resolveCategoryEmoji`, `buildPlatformTitle`, `buildFacebookRelistTitle`, `computePlatformPricing`, `resolvePlatformLogistics`, `buildPlatformPayload`, `validatePlatformPayload`, `buildPlatformSystemPrompt`, and `sanitizeNoEmDash`.
    - Backward-Compatible Copy Adapter (`src/utils/listingCopyGenerator.js`): Supports `options.enforcePlatformRules` on `generateEbayCopy`, `generateFacebookCopy`, `generateWhatnotCopy`, and `generateMercariCopy`, alongside `generateReverbCopy` and `generatePlatformListing`. Integrates `generateEbayListingHtml` to generate full modular dark-card HTML for eBay (`htmlBody` full layout with store banner image `fe4AAeSwSO1q8G1~`, delimiters, and compact dark footer strip with `Browse All Listings` link, alongside `insertHtml` inner cards). Updated `stripInternalTrackingNotes` in `src/utils/ebayTemplate.js` to strip both `ASIN:` and colon-less `ASIN B0...` markers. Cert verification routing in `src/utils/certLookup.js` maps Beckett (BGS/BAS) to `https://www.beckett-authentication.com/get-data/${certNumber}`.
    - AI Platform JSON State (`functions/api/ai/generate-ebay-details.js`, `src/worker.js`, `src/utils/auctionApi.js`): `generateAiPlatformListing` uses `gemini-3.5-flash-lite` (8s, 1 transient retry) + `gemini-3.8-flash` (10s) + `gemini-2.5-flash` (10s) via `callGeminiWithFallback` (14s budget, status-specific 503/429/auth errors), enforces deterministic pricing/logistics/zero-em-dash/Facebook `brand: null`/always-included `Smoke-Free Collection` invariants over parsed AI JSON, and routes via `mode: 'platform_listing'` on `POST /api/ai/generate-ebay-details` (`generateAiPlatformListingApi`). `src/worker.js` re-exports the rules registry without altering the 85-route manifest.
    - Modal State (`src/components/ListingCopyModal.jsx`): Adds `athlete`, `teamOrBand`, `sportOrGenre`, `authenticator`, `certNumber`, `inscription`, `size`, `isWearable`, `isCustomJersey`, `isPickguardSignedGuitar`, `targetNet`, `aiPlatformPayloads`, `generatingPlatformAi`, and `platformAiMsg` hooks (reset in `finally {}`, non-blocking banners), Amber Tactical 5-platform selector, live Pre-Publish Validation Gate, pricing/photo cards, and Reverb sell tab + footer link.
  - **Product-Specific Item Detail & Prep State Engine [ACTION ID: INV-006 / ITEM-001]**:
    - D1 Schema Migration (`migrations/0014_item_detail_fields.sql`, applied locally & remotely on `outpost-db`, mirrored in `auction-schema.sql`): Extends `auction_items` with 8 promoted columns (`item_subtype`, `item_condition`, `condition_notes`, `auth_type`, `prep_status` DEFAULT `'Ready'`, `framing_status`, `source_vendor`, `storage_location`) and partial index `idx_auction_items_prep_status` on `(user_id, prep_status) WHERE prep_status != 'Ready'`.
    - Worker CRUD & Mass-Assignment State (`functions/api/items/[id].js`, `enriched.js`, `index.js`, `invoices/index.js`, `import/batch.js`): Expands `CLIENT_SETTABLE_ATTR_KEYS` with 24 allowlisted category-specific memorabilia/product keys (`color`, `ink_color`, `signed_surface`, `signature_location`, `dimensions`, `frame_dimensions`, `source_lot_ref`, `jersey_style`, `colorway`, `jersey_number`, `equipment_model`, `case_included`, `guitar_type`, `instrument_finish`, `media_format`, `album_title`, `media_included`, `photo_finish`, `card_year`, `card_set`, `card_number`, `parallel_serial`, `card_grade`, `auto_grade`), syncs `cert_verified` and `cert_verified_at` SQL columns on `PUT /api/items/:id`, adds `prep_status` filtering and expanded search (`item_subtype`, `storage_location`, `source_vendor`) on `GET /api/items/enriched`, packs joined invoice/comp/sale/reconciliation columns via SQLite `json_object(...)` across `enriched.js`, `index.js`, and `[id].js` to stay strictly under Cloudflare D1's hard 100-column result-set cap (79/77/76 columns), and persists intake fields on invoice/batch creation using strictly parameterized `?` bindings.
    - Conditional UI & Downstream Mapping State (`src/utils/itemCategories.js`, `EditItemModal.jsx`, `EditTabDetails.jsx`, `EditModalHeader.jsx`, `AddInvoiceModal.jsx`, `userSettings.js`, `InventoryDataGrid.jsx`, `InventoryGridRow.jsx`, `PricingCard.jsx`, `ListingCopyModal.jsx`, `ebayTemplate.js`, `platformListingRules.js`, `ebaySearch.js`, `create-listing.js`, `tokenHelper.js`, `generate-ebay-details.js`): Deduplicates `EditTabDetails.jsx`, gates product specifics by `resolveCategoryGroup()`, adds 5 default-hidden optional grid columns, and propagates `item_condition`, `condition_notes`, `auth_type`, `framing_status`, and category specifics into eBay `ConditionID`, `ItemSpecifics` XML, Gemini AI prompts, and structured comp queries.

