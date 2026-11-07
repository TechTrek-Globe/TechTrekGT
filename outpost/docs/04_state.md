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







