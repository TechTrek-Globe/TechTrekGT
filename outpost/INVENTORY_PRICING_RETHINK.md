# Inventory + Pricing Intelligence Consolidation Plan

> **Status:** PROPOSAL - Awaiting approval before any code changes
> **Author:** Antigravity Systems Architect
> **Date:** 2026-08-21
> **Scope:** `outpost/` application only

---

## 1. Executive Summary

The Outpost application currently treats **Inventory** (`/outpost/inventory`) and **Pricing Intelligence** (`/outpost/pricing`) as separate views with independent data fetching, duplicated state, and overlapping UI concerns. This proposal consolidates them into a single, unified **"Inventory & Pricing"** section that provides a master-detail experience: a powerful spreadsheet table for bulk inventory management with an integrated inline pricing intelligence panel per item.

### Why Consolidate?

| Problem | Impact |
|---------|--------|
| **Duplicate data fetching** | `InventoryView` calls `getItems()` (items API) and `PricingIntelligenceView` calls `getComps()` (comps API, which LEFT JOINs items anyway). Both fetch the same item rows from `auction_items`. |
| **Duplicate local state** | Both views maintain independent `items`/`comps` arrays, separate `search`, `statusFilter`, `categoryFilter`, `loading`, and `error` states. Edits in one view are invisible to the other until a manual refresh. |
| **Context switching** | Users research pricing comps on the Pricing tab, then switch to Inventory to update `current_list_price` - losing context and requiring mental mapping. |
| **Duplicated utility functions** | `cleanEbaySearchQuery()` is duplicated in both `PricingIntelligenceView.jsx` (client) and `functions/api/comps/index.js` (server). |
| **Navigation overhead** | Two separate nav entries occupy sidebar real estate for what is conceptually one workflow: "I have items, I need to price them, I need to list them." |

---

## 2. Current Architecture Map

### 2.1 State Ownership

```
+------------------------------------------------------------------+
|  App.jsx                                                          |
|  +-- AuthProvider (context/AuthContext.jsx)                       |
|  +-- MainContent                                                 |
|       +-- activeView === 'inventory'                              |
|       |    +-- InventoryView (self-contained)                     |
|       |         +-- items[]          <-- getItems()               |
|       |         +-- platforms[]      <-- getPlatforms()           |
|       |         +-- search, statusFilter, pagination, sortConfig  |
|       |         +-- userSettings (localStorage)                   |
|       |         +-- Modals: AddInvoice, LogSale, Importer,        |
|       |              ListingCopy, EditItem, AmazonItem            |
|       |                                                           |
|       +-- activeView === 'pricing'                                |
|            +-- PricingIntelligenceView (self-contained)           |
|                 +-- comps[]          <-- getComps() [items+comps] |
|                 +-- drafts{}         <-- local comp input state   |
|                 +-- search, statusFilter, categoryFilter          |
|                 +-- Modals: ListingCopy, QueryEdit                |
+------------------------------------------------------------------+
```

### 2.2 API Endpoints Involved

| Endpoint | Used By | Data Shape |
|----------|---------|------------|
| `GET /api/items` | InventoryView | `{ items: [...], pagination: {...} }` |
| `PUT /api/items/:id` | InventoryView (inline edits) | Updates item, returns recalculated pricing floors |
| `DELETE /api/items/:id` | InventoryView | Deletes item |
| `GET /api/comps` | PricingIntelligenceView | LEFT JOINs `auction_items` + `auction_comps` + `auction_invoices` - returns item fields plus comp fields |
| `POST /api/comps` | PricingIntelligenceView | Upserts comp row, optionally applies `recommended_list_price` to item |
| `POST /api/comps/live` | PricingIntelligenceView | Fetches live eBay sold comps via scraper/API |
| `GET /api/platforms` | InventoryView | Platform fee reference table |

### 2.3 File Sizes (Complexity Indicator)

| File | Lines | Bytes |
|------|-------|-------|
| `InventoryView.jsx` | 915 | 41,287 |
| `PricingIntelligenceView.jsx` | 886 | 48,949 |
| `auctionApi.js` | 184 | 4,809 |
| `comps/index.js` | 262 | 9,122 |

### 2.4 Shared Sub-Components

Both views already share:
- `ListingCopyModal` - multi-channel listing copy generator
- `fmtCurrency` / `fmtPct` from `formulaPreview.js`
- `cleanAthleteName` / `cleanItemDescription` from `spreadsheetParser.js`

---

## 3. Proposed Architecture

### 3.1 New Route Structure

| Before | After |
|--------|-------|
| `/outpost/inventory` -> `InventoryView` | `/outpost/inventory` -> `InventoryHubView` |
| `/outpost/pricing` -> `PricingIntelligenceView` | **Removed as standalone route** |

The `VIEWS` array in `App.jsx` drops `'pricing'`. The sidebar `AppLayout.jsx` `NAV_ITEMS` merges the entry:

```
Before: Dashboard | Inventory | Sales Log | Pricing Intelligence | Settings
After:  Dashboard | Inventory & Pricing | Sales Log | Settings
```

### 3.2 New Context Provider: `InventoryProvider`

Currently, Outpost has only `AuthProvider`. Both Inventory and Pricing views fetch their own data independently with `useState` + `useEffect` inside the component. This is the root cause of the duplicate state problem.

**Introduce `src/context/InventoryContext.jsx`** - a new React Context that owns the unified item + comp data:

```
<App>
  <AuthProvider>
    <InventoryProvider>         <-- NEW
      <MainContent>
        <InventoryHubView />    <-- consumes useInventory()
        <DashboardView />       <-- unchanged (uses /api/dashboard)
        <SalesLogView />        <-- unchanged (uses /api/sales)
        <SettingsView />        <-- unchanged
      </MainContent>
    </InventoryProvider>
  </AuthProvider>
</App>
```

#### Context Shape

```js
// context/InventoryContext.jsx
const InventoryContext = createContext();

export function InventoryProvider({ children }) {
  // --- Core Data ---
  const [items, setItems] = useState([]);           // auction_items rows
  const [comps, setComps] = useState({});            // { [itemId]: compRow }
  const [platforms, setPlatforms] = useState([]);     // platform fee reference
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });

  // --- Filters (shared between table + pricing panel) ---
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // --- UI State ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // --- Actions ---
  const fetchItems = useCallback(async (page = 1) => { ... }, [search, statusFilter]);
  const fetchComps = useCallback(async () => { ... }, []);
  const fetchPlatforms = useCallback(async () => { ... }, []);
  const updateItemLocal = (id, patch) => { ... };    // optimistic update
  const refreshAll = () => { fetchItems(); fetchComps(); };

  // --- User Settings (column visibility, widths) ---
  const [userSettings, setUserSettings] = useState(getStoredUserSettings);

  return (
    <InventoryContext.Provider value={{
      items, comps, platforms, pagination,
      search, setSearch,
      statusFilter, setStatusFilter,
      categoryFilter, setCategoryFilter,
      sortConfig, setSortConfig,
      loading, error,
      fetchItems, fetchComps, fetchPlatforms, refreshAll,
      updateItemLocal, userSettings, setUserSettings
    }}>
      {children}
    </InventoryContext.Provider>
  );
}

export const useInventory = () => useContext(InventoryContext);
```

#### Key Design Decisions

1. **Items and comps are separate state arrays, keyed together**: `comps` is a lookup object `{ [itemId]: compData }` rather than a flat array. When rendering a row, the view does `const comp = comps[item.id]` for O(1) access.

2. **Lazy comp loading**: Comps are fetched on-demand when the user expands the pricing panel for an item (or bulk-fetched when the pricing sub-tab is active). This avoids the overhead of a joined query on every inventory page load.

3. **Single source of truth**: Any inline edit in the table (status change, price update) calls `updateItemLocal(id, patch)` which updates the shared `items` array. No stale data across views.

4. **Comp draft state stays local**: The `drafts` object (comp_1, comp_2, comp_3, recommended_list_price inputs) remains in the `InventoryHubView` component, not in context. This is ephemeral editing state that doesn't need to be shared.

### 3.3 New API Endpoint: `GET /api/items/enriched`

> **NOTE:** This is an **optional optimization**. The plan works without it by making two parallel fetches (`getItems()` + `getComps()`), but a single enriched endpoint reduces D1 round-trips and eliminates client-side join logic.

**Option A (Recommended):** Add a new endpoint that returns items with their comp data pre-joined:

```sql
SELECT
  i.*,
  c.comp_1, c.comp_2, c.comp_3, c.manual_avg, c.live_avg,
  c.ebay_search_url, c.recommended_list_price,
  inv.invoice_ref
FROM auction_items i
LEFT JOIN auction_comps c ON i.id = c.item_id AND c.user_id = i.user_id
LEFT JOIN auction_invoices inv ON i.invoice_id = inv.id
WHERE i.user_id = ?
ORDER BY i.created_at DESC
LIMIT ? OFFSET ?
```

This is essentially what `GET /api/comps` already does (see `comps/index.js` L107-L153), but from the items table's perspective (paginated, with proper sorting support).

**Option B:** Keep the two existing endpoints and fetch in parallel:

```js
const [itemsRes, compsRes] = await Promise.all([
  getItems({ page, limit: 50, q: search, status: statusFilter }),
  getComps({ status: statusFilter === '' ? undefined : 'active' })
]);
```

### 3.4 Unified UI Layout: `InventoryHubView`

The new view is a single component with two integrated layout modes:

```
+-------------------------------------------------------------------+
|  INVENTORY & PRICING                                    [Refresh]  |
|  324 items - $12,450.00 total landed cost                          |
+-------------------------------------------------------------------+
|  [Import Spreadsheet] [Amazon Item] [Manual Invoice] [Log Sale]    |
+-------------------------------------------------------------------+
|  +----------------------------------+ +---------------------------+|
|  | [Table View]  [Pricing View]    | | Search...     [Refresh]   ||
|  +----------------------------------+ +---------------------------+|
|  [All (324)] [Available (180)] [Listed (95)] [Sold (40)] ...       |
+-------------------------------------------------------------------+
|                                                                    |
|  -- TABLE VIEW (default) ------------------------------------------+
|  Full spreadsheet table with inline editing, sorting,              |
|  resizable columns, pagination. Same as current InventoryView.     |
|  + NEW: An expandable "pricing drawer" per row (toggle icon)       |
|                                                                    |
|  -- PRICING VIEW (toggle) -----------------------------------------+
|  Card-based layout (current PricingIntelligenceView style)         |
|  with comps inputs, eBay auto-fetch, break-even calculations,     |
|  listing copy generation. Uses the same data from context.         |
|                                                                    |
+--------------------------------------------------------------------+
```

#### 3.4.1 View Mode Toggle

A tab-style toggle at the top allows switching between:
- **Table View** (default): The power-user spreadsheet table with all inline editing capabilities
- **Pricing View**: The rich card-based pricing intelligence layout

Both modes share the same filter bar, search, status pills, and operate on the same `items` + `comps` data from `useInventory()`.

#### 3.4.2 Inline Pricing Drawer (Table View Enhancement)

In Table View, each row gets a small expand/collapse chevron. Clicking it reveals an inline pricing drawer below the row containing:
- 3 comp inputs (comp_1, comp_2, comp_3)
- Computed average
- Target price input
- Auto-fetch eBay button
- Break-even floor and spread indicators
- Save / Apply to Item buttons

This lets power users quickly research and price items without leaving the table view.

#### 3.4.3 Summary Metrics Banner

A unified metrics banner at the top replaces both views' separate metric sections:

| Metric | Source |
|--------|--------|
| Active Inventory Count | items where status IN ('Available', 'Listed') |
| Total Landed Cost | SUM(true_total_cost) for active items |
| Market Comp Coverage | items with at least one comp value / total active items |
| Comp Strategy | Static label: "3-Comp Median & Sold Valuation" |

### 3.5 Component Decomposition

The current monolithic files (915 + 886 lines) will be decomposed into focused, reusable sub-components:

```
src/components/
+-- InventoryHubView.jsx          <-- NEW: Master orchestrator (~200 lines)
+-- inventory/                    <-- NEW: Sub-component directory
|   +-- InventoryTable.jsx        <-- Extracted from InventoryView table rendering
|   +-- InventoryTableRow.jsx     <-- Single row with inline edits
|   +-- PricingCardList.jsx       <-- Extracted from PricingIntelligenceView card layout
|   +-- PricingCard.jsx           <-- Single item pricing card
|   +-- PricingDrawer.jsx         <-- NEW: Inline row expansion for comps in table view
|   +-- InlineEditCell.jsx        <-- Extracted from InventoryView
|   +-- InlineStatusSelect.jsx    <-- Extracted from InventoryView
|   +-- InlineSelectCell.jsx      <-- Extracted from InventoryView
|   +-- StatusBadge.jsx           <-- Extracted from InventoryView
|   +-- InventoryMetrics.jsx      <-- NEW: Unified metrics banner
|   +-- InventoryFilters.jsx      <-- NEW: Shared filter bar
|   +-- QueryEditModal.jsx        <-- Extracted from PricingIntelligenceView
+-- AddInvoiceModal.jsx           <-- Unchanged
+-- AmazonItemModal.jsx           <-- Unchanged
+-- EditItemModal.jsx             <-- Unchanged
+-- ListingCopyModal.jsx          <-- Unchanged
+-- LogSaleModal.jsx              <-- Unchanged
+-- SpreadsheetImporterModal.jsx  <-- Unchanged
+-- DashboardView.jsx             <-- Unchanged
+-- SalesLogView.jsx              <-- Unchanged
+-- SettingsView.jsx              <-- Unchanged
+-- AppLayout.jsx                 <-- Minor nav update
+-- AuthPage.jsx                  <-- Unchanged
+-- (deleted) InventoryView.jsx           <-- Replaced by InventoryHubView
+-- (deleted) PricingIntelligenceView.jsx <-- Absorbed into inventory/
```

### 3.6 Utility Consolidation

| Duplicated Function | Currently In | Action |
|---------------------|-------------|--------|
| `cleanEbaySearchQuery()` | `PricingIntelligenceView.jsx` (client) + `comps/index.js` (server) | Extract to `src/utils/ebaySearch.js` (client) and keep server copy in `comps/index.js` |
| `buildEbaySearchUrl()` | Both files | Extract to `src/utils/ebaySearch.js` |
| `roundPrice()` | `PricingIntelligenceView.jsx` | Extract to `src/utils/formulaPreview.js` |
| `STATUS_META` constant | `InventoryView.jsx` | Extract to `src/utils/constants.js` |

---

## 4. State Consolidation Plan

### 4.1 Migration Matrix

| State Variable | Currently In | Target Location | Notes |
|---------------|-------------|-----------------|-------|
| `items[]` | InventoryView | `InventoryContext` | Single source of truth |
| `comps[]` / `comps{}` | PricingIntelligenceView | `InventoryContext` (as `{ [itemId]: compRow }`) | Keyed lookup object |
| `platforms[]` | InventoryView | `InventoryContext` | Shared across table + pricing |
| `search` | Both (independent) | `InventoryContext` | Unified search across both views |
| `statusFilter` | Both (different schemas) | `InventoryContext` | Unified: `''` = all, or specific status |
| `categoryFilter` | PricingIntelligenceView only | `InventoryContext` | Available in both view modes |
| `sortConfig` | InventoryView only | `InventoryContext` | Sort persists across view mode toggle |
| `pagination` | InventoryView only | `InventoryContext` | Pricing card view uses same pagination |
| `loading` / `error` | Both (independent) | `InventoryContext` | Single loading state |
| `userSettings` | InventoryView | `InventoryContext` | Column visibility/widths shared |
| `drafts{}` | PricingIntelligenceView | `InventoryHubView` (local) | Ephemeral comp editing state - no context needed |
| `modalOpen` states | InventoryView | `InventoryHubView` (local) | Modal toggles stay local to the view |
| `copyModalItem` | Both (independent) | `InventoryHubView` (local) | Single modal instance |
| `queryEditModal` | PricingIntelligenceView | `InventoryHubView` (local) | Ephemeral popup state |
| `editModalItem` | InventoryView | `InventoryHubView` (local) | Stays local |
| `itemToSell` | InventoryView | `InventoryHubView` (local) | Stays local |

### 4.2 Data Flow Diagram

```
                    +----------------------+
                    |  InventoryProvider    |
                    |                      |
  +--------------+  |  items[]  <----------+---- GET /api/items (paginated)
  |              |  |  comps{}  <----------+---- GET /api/comps  (or /api/items/enriched)
  | useInventory |  |  platforms[] <-------+---- GET /api/platforms
  |              |  |  search, filters     |
  +------+-------+  |  pagination, sort    |
         |          +----------------------+
         |
         v
  +------------------------------------------------+
  |  InventoryHubView                               |
  |                                                 |
  |  viewMode: 'table' | 'pricing'                  |
  |  drafts{} (local comp editing state)            |
  |  modal toggle states (local)                    |
  |                                                 |
  |  +----------------+  +------------------------+|
  |  | InventoryTable |  | PricingCardList        ||
  |  | (Table View)   |  | (Pricing View)         ||
  |  |                |  |                         ||
  |  | Row + inline   |  | Card per item with     ||
  |  | PricingDrawer  |  | comps, eBay, targets   ||
  |  +----------------+  +------------------------+|
  |                                                 |
  |  +--------------------------------------------+|
  |  | Shared Modals                               ||
  |  | AddInvoice, LogSale, Importer,              ||
  |  | ListingCopy, EditItem, AmazonItem,          ||
  |  | QueryEdit                                   ||
  |  +--------------------------------------------+|
  +------------------------------------------------+
```

---

## 5. Implementation Phases

### Phase A: Foundation (Non-Breaking)

1. **Create `src/context/InventoryContext.jsx`** with the unified state shape
2. **Create `src/utils/ebaySearch.js`** - extract duplicated eBay search utilities
3. **Create `src/utils/constants.js`** - extract `STATUS_META` and other shared constants
4. **Add `roundPrice()` to `formulaPreview.js`**
5. **Wire `InventoryProvider` into `App.jsx`** provider tree (below `AuthProvider`)

### Phase B: Extract Sub-Components

1. **Create `src/components/inventory/` directory**
2. **Extract from `InventoryView.jsx`**: `StatusBadge`, `InlineStatusSelect`, `InlineEditCell`, `InlineSelectCell`
3. **Extract from `PricingIntelligenceView.jsx`**: `QueryEditModal`
4. **Create `InventoryMetrics.jsx`** - unified metrics banner
5. **Create `InventoryFilters.jsx`** - shared filter bar (search + status pills + category dropdown)

### Phase C: Build Unified View

1. **Create `InventoryHubView.jsx`** - master orchestrator with view mode toggle
2. **Create `InventoryTable.jsx`** - refactored table rendering from `InventoryView`
3. **Create `PricingCardList.jsx`** - refactored card layout from `PricingIntelligenceView`
4. **Create `PricingDrawer.jsx`** - new inline row expansion component

### Phase D: Router & Navigation Update

1. **Update `App.jsx`**: Remove `PricingIntelligenceView` lazy import, update `VIEWS` array, replace `InventoryView` with `InventoryHubView`
2. **Update `AppLayout.jsx`**: Merge nav items, update sidebar icon/label
3. **Handle legacy route**: `/outpost/pricing` redirects to `/outpost/inventory`

### Phase E: Cleanup & Verify

1. **Delete `InventoryView.jsx`** and **`PricingIntelligenceView.jsx`**
2. **Build verification**: `npm run build` must succeed with zero errors
3. **Deploy**: `npm run deploy`
4. **Update `ARCHITECTURE.md`** to reflect new component structure and context provider

---

## 6. Risk Assessment & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Regression in inline editing | High | All `InlineEditCell` / `InlineStatusSelect` logic is extracted verbatim - no behavioral changes |
| Pagination behavior change | Medium | Pagination state moves to context but the fetch logic remains identical |
| User settings (localStorage) | Low | `userSettings.js` is unchanged - same storage key, same schema |
| Dashboard data fetch | None | Dashboard uses its own `/api/dashboard` endpoint - completely independent |
| SalesLogView | None | Sales view is self-contained with its own `/api/sales` fetch |
| Build size increase | Low | Component decomposition may slightly increase module count but Vite tree-shaking + code splitting handles this |
| Legacy `/outpost/pricing` bookmarks | Low | `getViewFromPathname()` will map `/outpost/pricing` to `inventory` with a `console.info` deprecation notice |

---

## 7. Database Impact

> **IMPORTANT:** No schema changes required. All tables (`auction_items`, `auction_comps`, `auction_invoices`, `auction_platforms`) remain untouched. No migrations needed.

The optional `GET /api/items/enriched` endpoint is a read-only query that joins existing tables - it requires only a new file in `functions/api/items/enriched.js`.

---

## 8. Files Changed Summary

### New Files
| File | Purpose |
|------|---------|
| `src/context/InventoryContext.jsx` | Unified inventory + comps state provider |
| `src/components/InventoryHubView.jsx` | Master view orchestrator |
| `src/components/inventory/InventoryTable.jsx` | Spreadsheet table sub-component |
| `src/components/inventory/InventoryTableRow.jsx` | Single table row |
| `src/components/inventory/PricingCardList.jsx` | Card-based pricing layout |
| `src/components/inventory/PricingCard.jsx` | Single pricing card |
| `src/components/inventory/PricingDrawer.jsx` | Inline row expansion for comps |
| `src/components/inventory/InlineEditCell.jsx` | Extracted inline edit component |
| `src/components/inventory/InlineStatusSelect.jsx` | Extracted status selector |
| `src/components/inventory/InlineSelectCell.jsx` | Extracted select cell |
| `src/components/inventory/StatusBadge.jsx` | Extracted status badge |
| `src/components/inventory/InventoryMetrics.jsx` | Unified metrics banner |
| `src/components/inventory/InventoryFilters.jsx` | Shared filter/search bar |
| `src/components/inventory/QueryEditModal.jsx` | eBay query editor popup |
| `src/utils/ebaySearch.js` | Deduplicated eBay search utilities |
| `src/utils/constants.js` | Shared constants (STATUS_META, etc.) |
| `functions/api/items/enriched.js` | Optional joined items+comps endpoint |

### Modified Files
| File | Change |
|------|--------|
| `App.jsx` | Drop `pricing` from VIEWS, swap `InventoryView` for `InventoryHubView`, wrap with `InventoryProvider` |
| `AppLayout.jsx` | Merge "Inventory" + "Pricing Intelligence" nav items into single "Inventory & Pricing" |
| `formulaPreview.js` | Add `roundPrice()` export |
| `ARCHITECTURE.md` | Update component listing, add `InventoryProvider` to state management section |

### Deleted Files
| File | Reason |
|------|--------|
| `src/components/InventoryView.jsx` | Replaced by `InventoryHubView` + `inventory/` sub-components |
| `src/components/PricingIntelligenceView.jsx` | Absorbed into `inventory/PricingCardList.jsx` + `PricingCard.jsx` |

---

## 9. Open Questions

> **Q1: Enriched API endpoint or parallel fetches?**
> Option A (enriched endpoint) reduces D1 round-trips and simplifies the client. Option B (parallel fetches) requires no backend changes. Which approach do you prefer?

> **Q2: Nav label preference?**
> Options: "Inventory & Pricing" | "Inventory Hub" | "Stock & Comps" | "Inventory" (keep simple)

> **Q3: Default view mode?**
> Should the unified view default to Table View (spreadsheet) or Pricing View (cards)? The current InventoryView table is the more frequently used view.

> **Q4: Pricing drawer in table view - opt-in or always visible?**
> Should each row's pricing drawer be collapsed by default (expand on click), or should there be a "Show All Comps" toggle that expands all rows at once?

---

## 10. Verification Plan

### Build Verification
```powershell
cd E:\TechTrekGT\outpost
npm run build
```

### Functional Checklist
- [ ] Table view renders all items with inline editing (status, category, prices, platform)
- [ ] Column visibility and resizing persists via localStorage
- [ ] Sorting works across all columns
- [ ] Pagination works correctly
- [ ] Status filter pills filter correctly
- [ ] Search filters items in both view modes
- [ ] Pricing card view renders all items with comp inputs
- [ ] Auto-fetch eBay comps works with query editor
- [ ] Save comps to DB works
- [ ] Apply target price to item works
- [ ] Break-even floor calculations are correct
- [ ] All modals open/close correctly (AddInvoice, LogSale, Importer, ListingCopy, EditItem, AmazonItem)
- [ ] `/outpost/pricing` redirects to `/outpost/inventory`
- [ ] Dashboard, Sales Log, and Settings views are unaffected
- [ ] View mode toggle persists during the session

### Deploy Verification
```powershell
cd E:\TechTrekGT\outpost
npm run deploy
```
