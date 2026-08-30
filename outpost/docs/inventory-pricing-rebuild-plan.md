# Rebuild Outpost Inventory & Pricing Section

Complete re-imagination of the Inventory & Pricing UX for TechTrekGT Outpost Tracker. Rebuilds the section from the ground up for maximum speed, clarity, and ease of use - with comprehensive eBay data ingestion, fee/margin calculations, and professional-grade pricing intelligence.

---

## User Review Required

> [!IMPORTANT]
> **Schema Migration**: This plan adds 7 new columns to `auction_items` and 5 new columns to `auction_comps`. These are all additive `ALTER TABLE ADD COLUMN` statements - no existing columns are modified or dropped. The migration is non-destructive and idempotent.

> [!IMPORTANT]
> **Component Replacement Strategy**: The 13 files inside `src/components/inventory/` will be **deleted and replaced** with 15 new files. The parent orchestrator [`InventoryHubView.jsx`](file:///e:/TechTrekGT/outpost/src/components/InventoryHubView.jsx) will be rewritten. Existing modals (`EditItemModal`, `AddInvoiceModal`, `LogSaleModal`, etc.) are **not touched** - they remain as-is and are still triggered from the new view.

> [!WARNING]
> **Status Model Expansion**: The current status set (`Available`, `Listed`, `Sold`, `Kept for Self`, `Returned`) is expanded with two new eBay-native statuses: `Draft` and `Unsold`. This requires updating [`constants.js`](file:///e:/TechTrekGT/outpost/src/utils/constants.js) and the `STATUS_META` map. Existing data is unaffected since the new statuses are additive.

---

## Open Questions

1. **Listing Format Default**: Should the default `listing_format` for new items be `'Fixed Price'` or `null` (unset)?  I'm defaulting to `null` since many items start as unlisted inventory.
2. **eBay Ad Rate Handling**: The schema already has `ebay_promoted_rate` on `auction_items` (added in Phase 3). The new fee engine will use this field. Should the default promoted listing rate be configurable globally in Settings, or remain per-item only?
3. **Drawer vs. Modal for Quick Edit**: Plan proposes a **slide-out drawer** (right-side panel) for rapid pricing/field edits, replacing the current in-table `PricingDrawer` (which renders as a collapsible `<tr>` beneath each row). Is this the preferred UX direction, or should we keep the collapsible in-row approach?

---

## Proposed Changes

### Overview: New Component Hierarchy

```
InventoryHubView (orchestrator)
├── InventoryCommandBar          ← Top bar: search, filters, actions, import/add buttons
├── InventoryMetricsStrip        ← Compact horizontal metrics: active count, COGS, potential revenue, margin health
├── StatusFilterBar              ← Pill-based status toggles with live counts  
├── InventoryDataGrid            ← Primary table with virtualized rows, resizable columns, sticky actions
│   └── InventoryGridRow         ← Individual row: inline edits, status badges, margin indicators
├── PricingCardGrid              ← Alternate card-based view for pricing intelligence
│   └── PricingCard              ← Individual card: comps, pricing, margin health ring
├── QuickEditDrawer              ← Slide-out right panel for rapid field updates & fee preview
├── FeeMarginEngine (utility)    ← Pure calculation: eBay FVF, ad fees, shipping, net profit, ROI
└── MarginHealthBadge            ← Reusable: color-coded margin indicator component
```

---

### 1. Database Schema Migration

#### [MODIFY] [auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql)

Append additive migration block at end of file. All statements use `ALTER TABLE ... ADD COLUMN` with `IF NOT EXISTS`-safe patterns (D1 silently ignores duplicate `ADD COLUMN` for existing columns).

**New columns on `auction_items`:**

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `sku` | TEXT | NULL | Custom label / SKU for the item |
| `listing_format` | TEXT | NULL | `'Fixed Price'`, `'Auction'`, or NULL |
| `listing_status` | TEXT | NULL | `'Draft'`, `'Active'`, `'Sold'`, `'Unsold'`, or NULL |
| `quantity` | INTEGER | 1 | Quantity in stock (for multi-quantity listings) |
| `purchase_date` | TEXT | NULL | When the item was acquired (distinct from invoice `date_acquired`) |
| `floor_price` | REAL | NULL | Lowest acceptable sell price (manual override of computed floor) |
| `buy_it_now_price` | REAL | NULL | Explicit BIN price (may differ from `current_list_price`) |

**New columns on `auction_comps`:**

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `active_comp_1` | REAL | NULL | Active (unsold) listing comp #1 |
| `active_comp_2` | REAL | NULL | Active (unsold) listing comp #2 |
| `active_comp_3` | REAL | NULL | Active (unsold) listing comp #3 |
| `active_avg` | REAL | NULL | Average of active comps |
| `sold_count` | INTEGER | 0 | Number of sold comps found in last fetch |

---

### 2. Worker API Route Additions

#### [MODIFY] [worker.js](file:///e:/TechTrekGT/outpost/src/worker.js)

No new route handlers needed. The existing `PUT /api/items/:id` endpoint already accepts arbitrary column updates and the `GET /api/items/enriched` endpoint returns all joined data. The new columns are automatically included via `SELECT i.*` in the enriched query.

The enriched query will be updated to also return the new comp columns (`active_comp_*`, `active_avg`, `sold_count`).

#### [MODIFY] [enriched.js](file:///e:/TechTrekGT/outpost/functions/api/items/enriched.js)

- Add `i.sku`, `i.listing_format`, `i.listing_status`, `i.quantity`, `i.purchase_date`, `i.floor_price`, `i.buy_it_now_price` to the SELECT (already covered by `i.*` but document for clarity).
- Add `c.active_comp_1`, `c.active_comp_2`, `c.active_comp_3`, `c.active_avg`, `c.sold_count` to the SELECT clause (these are new columns on `auction_comps` and need explicit selection since the query already names specific `c.*` columns).
- Add sort parameter support: `sort_by` and `sort_dir` query params to enable server-side sorting by margin, date, price, and listing status.

#### [MODIFY] [[id].js](file:///e:/TechTrekGT/outpost/functions/api/items/%5Bid%5D.js)

- Add the 7 new columns to the allowed update fields whitelist in the `PUT` handler so inline edits can persist `sku`, `listing_format`, `listing_status`, `quantity`, `purchase_date`, `floor_price`, and `buy_it_now_price`.

#### [MODIFY] [comps/index.js](file:///e:/TechTrekGT/outpost/functions/api/comps/index.js)

- Add the 5 new comp columns (`active_comp_1..3`, `active_avg`, `sold_count`) to the INSERT/UPDATE UPSERT statement so `saveComp()` can persist active comps alongside sold comps.

---

### 3. Frontend: Utility & Engine Layer

#### [MODIFY] [constants.js](file:///e:/TechTrekGT/outpost/src/utils/constants.js)

Add new statuses and their visual metadata:

```js
export const STATUS_META = {
  'Draft':         { color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/20'  },
  'Available':     { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  'Listed':        { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20'   },
  'Sold':          { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'  },
  'Unsold':        { color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  'Kept for Self': { color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  'Returned':      { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20'    },
};

export const LISTING_FORMATS = ['Fixed Price', 'Auction'];
export const LISTING_STATUSES = ['Draft', 'Active', 'Sold', 'Unsold'];
```

#### [NEW] [feeEngine.js](file:///e:/TechTrekGT/outpost/src/utils/feeEngine.js)

Pure-function fee and margin calculator. No side effects, no API calls - designed for instant client-side previews.

```
Inputs: sellPrice, cogs, platformFeePct, platformFlatFee, promotedListingRate,
        shippingCost, paymentProcessingPct (default 0)

Outputs:
  - finalValueFee     = sellPrice * platformFeePct
  - promotedFee       = sellPrice * promotedListingRate
  - paymentFee        = sellPrice * paymentProcessingPct  
  - totalFees         = finalValueFee + promotedFee + paymentFee + platformFlatFee
  - netProceeds       = sellPrice - totalFees - shippingCost
  - netProfit         = netProceeds - cogs
  - roiPct            = netProfit / cogs (as decimal)
  - marginPct         = netProfit / sellPrice (as decimal)
  - marginHealth      = 'excellent' | 'good' | 'warning' | 'danger' | 'loss'
                        (>30% = excellent, >15% = good, >5% = warning, >0% = danger, <0% = loss)
```

Key functions:
- `computeFeeBreakdown(item)` - full fee breakdown from an enriched item object
- `computeMarginHealth(marginPct)` - returns health tier string
- `computeBreakEvenPrice(item)` - minimum price to achieve $0 profit
- `computeTargetPrice(item, targetMarginPct)` - price to achieve a target margin

#### [MODIFY] [formulaPreview.js](file:///e:/TechTrekGT/outpost/src/utils/formulaPreview.js)

No changes needed. Existing `computePricingFloors`, `computeSaleMetrics`, `fmtCurrency`, `fmtPct` are reused. The new `feeEngine.js` complements (not replaces) these existing functions.

---

### 4. Frontend: Context Layer

#### [MODIFY] [InventoryContext.jsx](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx)

Enhancements to the existing provider:

1. **Server-side sorting**: Add `sortBy` and `sortDir` to the `fetchItems` params, pass to the enriched API endpoint. The current client-side sort (`sortedItems` useMemo) becomes a fallback for instant column header clicks while the next server fetch is in flight.
2. **Debounced search**: Wrap the search-triggered fetch in a 300ms debounce to prevent excessive API calls during typing.
3. **Listing format/status filters**: Add `listingFormatFilter` and `listingStatusFilter` state + setters to the context value.
4. **Sort presets**: Add a `sortPreset` state with values like `'margin-desc'`, `'date-newest'`, `'price-asc'`, `'listing-status'` that map to `sortBy`/`sortDir` combinations for the quick-sort dropdown.

---

### 5. Frontend: New Component Files

All files live under `src/components/inventory/`. The 13 existing files in this directory are **deleted and replaced**.

#### [DELETE] Existing files to remove:
- `CatalogSearchDropdown.jsx`
- `InlineEditCell.jsx`
- `InlineSelectCell.jsx`
- `InlineStatusSelect.jsx`
- `InventoryFilters.jsx`
- `InventoryMetrics.jsx`
- `InventoryTable.jsx`
- `InventoryTableRow.jsx`
- `PricingCard.jsx`
- `PricingCardList.jsx`
- `PricingDrawer.jsx`
- `QueryEditModal.jsx`
- `StatusBadge.jsx`

#### [NEW] Replacement files:

| # | File | Purpose | Key Features |
|---|------|---------|-------------|
| 1 | `InventoryCommandBar.jsx` | Top action bar | Search input (debounced), category dropdown, sort preset dropdown, view mode toggle (Table/Card), action buttons (+ Invoice, Amazon Import, Spreadsheet Import, Refresh) |
| 2 | `InventoryMetricsStrip.jsx` | Horizontal metrics strip | 5 metric cards in a single row: Active Count, Total COGS, Potential Revenue (sum of `current_list_price`), Avg Margin %, Comps Coverage %. Each with sparkline-style micro-indicator |
| 3 | `StatusFilterBar.jsx` | Status pill toggles | Horizontal row of status pills with live counts and color-coded badges. Includes new Draft and Unsold statuses. Multi-select support for filtering by multiple statuses simultaneously |
| 4 | `InventoryDataGrid.jsx` | Primary data table | Resizable columns, sticky header, sticky actions column, zebra striping, sold-items section divider. Column definitions include all new fields (SKU, listing format/status, quantity, purchase date, floor/BIN price). Pagination footer |
| 5 | `InventoryGridRow.jsx` | Individual table row | Inline-editable cells for text/number/select fields, status badge, margin health indicator dot, expand button for quick-edit drawer trigger, action buttons (edit modal, listing copy, record sale, delete) |
| 6 | `InlineEditCell.jsx` | Reusable inline edit cell | Click-to-edit text/number input with Enter/Escape/blur handling, auto-save via `handleFieldSave`, loading indicator, prefix/suffix support ($ sign). Rebuilt from scratch with improved focus management |
| 7 | `InlineSelectCell.jsx` | Reusable inline select cell | Click-to-open dropdown for categorical fields (status, category, platform, listing format, listing status, authenticator). Rebuilt with improved positioning and keyboard nav |
| 8 | `StatusBadge.jsx` | Status indicator badge | Color-coded pill badge using `STATUS_META`. Supports the expanded status set. Optional click-to-change via inline dropdown |
| 9 | `MarginHealthBadge.jsx` | Margin health indicator | Color-coded dot/pill showing margin health tier (excellent/good/warning/danger/loss). Uses `feeEngine.computeMarginHealth()`. Tooltip shows full fee breakdown on hover |
| 10 | `PricingCardGrid.jsx` | Card-based pricing view | Responsive CSS grid of `PricingCard` components. Same data source as the table, alternate visual layout for pricing-focused workflow |
| 11 | `PricingCard.jsx` | Individual pricing card | Item header with image/status, 3 sold comp inputs + 3 active comp inputs, comp averages, fee breakdown preview, target price input, margin health ring, save/apply buttons. Rebuilt with active comps section |
| 12 | `QuickEditDrawer.jsx` | Slide-out right panel | Fixed-position drawer that slides in from the right edge. Contains: all editable item fields grouped into sections (Identity, Pricing, eBay Metadata, Comps), live fee breakdown preview via `feeEngine`, save/cancel actions. Replaces the old in-row `PricingDrawer` |
| 13 | `FeeBreakdownPanel.jsx` | Fee breakdown display | Reusable panel showing: COGS, eBay FVF, promoted listing fee, shipping cost, payment processing, total fees, net proceeds, net profit, ROI %, margin %. Used inside `QuickEditDrawer` and `PricingCard` |
| 14 | `QueryEditModal.jsx` | eBay search query editor | Rebuilt with improved UX. Shows cleaned query, allows manual edit, confirm triggers auto-fetch. Functionally identical to current but with better layout |
| 15 | `SortPresetDropdown.jsx` | Quick sort selector | Dropdown with preset sort options: Newest First, Oldest First, Highest Margin, Lowest Margin, Price High-Low, Price Low-High, Listing Status, Category |

---

### 6. Frontend: Orchestrator Rewrite

#### [MODIFY] [InventoryHubView.jsx](file:///e:/TechTrekGT/outpost/src/components/InventoryHubView.jsx)

Complete rewrite of the view orchestrator. Key changes:

1. **Composition**: Uses the new sub-components (`InventoryCommandBar`, `InventoryMetricsStrip`, `StatusFilterBar`, `InventoryDataGrid` / `PricingCardGrid`, `QuickEditDrawer`).
2. **Quick Edit Drawer State**: Manages `drawerItem` (the item being edited in the drawer), `isDrawerOpen` toggle.
3. **Modal Pass-through**: Still renders existing modals (`AddInvoiceModal`, `AmazonItemModal`, `SpreadsheetImporterModal`, `LogSaleModal`, `ListingCopyModal`, `EditItemModal`, `EbayListingIdModal`, `DelistPendingAlert`) - these are untouched.
4. **Keyboard Shortcuts**: `Escape` closes the drawer, `/` focuses search.

---

### 7. Frontend: Styling Updates

#### [MODIFY] [index.css](file:///e:/TechTrekGT/outpost/src/index.css)

Add CSS for the new drawer animation and any new utility classes:

```css
/* Quick Edit Drawer slide animation */
.drawer-enter { transform: translateX(100%); }
.drawer-enter-active { transform: translateX(0); transition: transform 200ms ease-out; }
.drawer-exit { transform: translateX(0); }
.drawer-exit-active { transform: translateX(100%); transition: transform 150ms ease-in; }

/* Margin health colors */
.margin-excellent { color: #34d399; }
.margin-good { color: #60a5fa; }
.margin-warning { color: #fbbf24; }
.margin-danger { color: #f97316; }
.margin-loss { color: #ef4444; }
```

#### [MODIFY] [tailwind.config.js](file:///e:/TechTrekGT/outpost/tailwind.config.js)

Add `outpost-*` color tokens to the theme extend for consistent naming:

```js
outpost: {
  surface: '#0b101d',
  card: '#141d30',
  border: '#1e293b',
  accent: '#fbbf24',
}
```

---

### 8. No Changes (Preserved As-Is)

These files are **not modified** in this rebuild:

| File | Reason |
|------|--------|
| `App.jsx` | Routing unchanged, `InventoryHubView` import path unchanged |
| `AppLayout.jsx` | Shell/nav unchanged |
| `AuthContext.jsx` | Auth unchanged |
| `EditItemModal.jsx` | Full edit modal kept as-is (may gain new fields in a follow-up) |
| `AddInvoiceModal.jsx` | Invoice creation modal unchanged |
| `AmazonItemModal.jsx` | Amazon import modal unchanged |
| `LogSaleModal.jsx` | Sale logging modal unchanged |
| `ListingCopyModal.jsx` | Listing copy generator unchanged |
| `SpreadsheetImporterModal.jsx` | Spreadsheet import unchanged |
| `EbayListingIdModal.jsx` | eBay linking modal unchanged |
| `DelistPendingAlert.jsx` | Delist alert unchanged |
| `EbayConnectBanner.jsx` | eBay OAuth banner unchanged |
| `FeeReconciliationPanel.jsx` | Fee recon panel unchanged |
| `DashboardView.jsx` | Dashboard unchanged |
| `SalesLogView.jsx` | Sales log unchanged |
| `SettingsView.jsx` | Settings unchanged |
| `auctionApi.js` | API utility unchanged (new fields pass through existing `updateItem`) |
| `formulaPreview.js` | Existing calc utils unchanged |
| `ebaySearch.js` | eBay search utils unchanged |
| `worker.js` | Worker routing unchanged (no new routes) |

---

## Verification Plan

### Automated Tests
- `npm run build` from `e:/TechTrekGT/outpost` - must produce zero errors.
- `npm run deploy` - must deploy successfully to Cloudflare.

### Manual Verification
1. Schema migration runs without errors on local D1 via `npm run db:migrate:local`.
2. Inventory table renders with all existing items, including the new columns (initially null/default).
3. Inline editing works for all fields including new ones (SKU, listing format, listing status, quantity, floor price, BIN price).
4. Status filter pills show correct counts including new Draft/Unsold statuses.
5. Sort presets work: margin desc, date newest, price high-low.
6. Quick edit drawer opens/closes with smooth animation, persists changes on save.
7. Fee breakdown panel shows correct calculations matching the `feeEngine.js` logic.
8. Margin health badges display correct color tiers.
9. Pricing card view renders with active comps section.
10. All existing modals (AddInvoice, EditItem, LogSale, ListingCopy, etc.) still open and function correctly from the rebuilt view.
11. Pagination, search, and category filtering work correctly.
12. Mobile responsive layout is acceptable.
