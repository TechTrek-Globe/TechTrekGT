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



