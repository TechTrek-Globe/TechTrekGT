# TechTrek Outpost (Auction Hub) Comprehensive Architecture & Codebase Audit

**Audit Date**: August 2026  
**Audited Target**: `outpost/src/` (Components, Context, Utilities, Cloudflare Worker Routing)  
**Status**: COMPLETE (Discovery Phase)  
**Execution Gate**: Application code modifications strictly locked pending explicit user approval.

---

## Executive Summary

A comprehensive 100% deep-dive audit of the entire `outpost/src/` codebase, its context state providers, modal components, table/pricing subcomponents, formula utilities, and Cloudflare Worker API routes was conducted.

The audit uncovered **11 distinct issues** categorized across:
1. **Critical Runtime Exceptions & Broken Flows (P0)**
2. **Architectural & Endpoint Routing Disconnects (P1)**
3. **State, Data Mapping & Calculation Scaling Defects (P1/P2)**
4. **Hook Compliance & Lifecycle / Memory Issues (P2/P3)**

---

## Detailed Audit Findings & Proposed Fixes

### 1. [P0 - CRITICAL] Runtime Crash on Password Reset Submission
* **File**: `outpost/src/components/AuthPage.jsx`
* **Line Number**: 145
* **Target Code**:
  ```javascript
  if (!resetToken || !newPassword) {
    setError('Please enter a new password.');
    return;
  }
  ```
* **Root Cause**: The password reset workflow was refactored to use HttpOnly cookie-based session verification (`reset_session` cookie issued in Step 2). The state variable `resetToken` was removed, but line 145 still contains `!resetToken ||`. When the user submits their new password in Step 3, the browser throws an uncaught `ReferenceError: resetToken is not defined`, crashing the auth view and blocking password recovery.
* **Proposed Surgical Fix**:
  In `outpost/src/components/AuthPage.jsx:145`, change `if (!resetToken || !newPassword)` to `if (!newPassword)`.

---

### 2. [P0 - CRITICAL] Broken Sheet Autodetection in Workbook & Spreadsheet Importer
* **File**: `outpost/src/utils/spreadsheetParser.js`
* **Line Number**: 327
* **Target Code**:
  ```javascript
  const { score } = findTableHeaders(rows, [...ITEM_NAME_ALIASES, ...UNIT_PRICE_ALIASES], 1);
  ```
* **Root Cause**: `findTableHeaders()` returns `{ headerIdx, headerMap, headers }` and does **not** return a `score` property. As a result, `score` evaluates to `undefined`, and the condition `score > bestScore` (`undefined > -1`) is always `false`. Unless the workbook contains a worksheet literally named `"inventory"` (case-insensitive), the automatic table and sheet detection fails, causing valid multi-sheet Excel workbooks to throw "No valid inventory items found".
* **Proposed Surgical Fix**:
  In `outpost/src/utils/spreadsheetParser.js:131`, update `findTableHeaders()` to return `{ headerIdx: bestIdx, headerMap: bestMap, headers: bestHeaders, score: bestScore }`.

---

### 3. [P1 - HIGH] Data Key Mismatch in Sales Ledger KPI Metrics Strip
* **File**: `outpost/src/components/SalesLogView.jsx`
* **Line Numbers**: 130, 146
* **Target Code**:
  ```javascript
  // Line 130:
  <p className="text-xl font-black text-slate-100">{fmtCurrency(summary.total_gross_volume)}</p>
  // Line 146:
  <p className="text-xl font-black text-emerald-400">{fmtPct(summary.overall_roi_pct)}</p>
  ```
* **Root Cause**: The backend endpoint `functions/api/sales/index.js` returns summary metrics with keys `total_gross` and `blended_roi`. `SalesLogView.jsx` attempts to read non-existent keys `summary.total_gross_volume` and `summary.overall_roi_pct`. As a result, the KPI cards render `$--` and `--` for Gross Sales Volume and Overall ROI.
* **Proposed Surgical Fix**:
  In `outpost/src/components/SalesLogView.jsx`:
  - Line 130: Replace `summary.total_gross_volume` with `summary.total_gross`.
  - Line 146: Replace `summary.overall_roi_pct` with `summary.blended_roi`.

---

### 4. [P1 - HIGH] Hook Dependency & Prop Disconnect in Log Sale Modal
* **File**: `outpost/src/components/LogSaleModal.jsx`
* **Line Numbers**: 51, 76, 97
* **Target Code**:
  ```javascript
  // Line 20-21:
  const isModalOpen = open !== undefined ? Boolean(open) : Boolean(isOpen);
  const targetItem = preselectedItem || item;
  // Line 76:
  if (preselectedItem) {
    setSelectedItem(preselectedItem);
    applyItemPlatformDefaults(preselectedItem, preselectedItem.platform || defaultPlatform.name);
    return;
  }
  // Line 97:
  }, [open, isEdit, saleToEdit, preselectedItem, defaultPlatform]);
  ```
* **Root Cause**: `InventoryHubView.jsx` opens `LogSaleModal` via `<LogSaleModal isOpen={saleModalOpen} item={itemToSell} ... />`. In `LogSaleModal.jsx`:
  1. `useEffect` on line 97 only includes `open` (not `isOpen` or `isModalOpen`) in its dependency array. When `isOpen` toggles to `true`, `open` remains `undefined`, preventing the effect from re-running.
  2. Line 76 checks `if (preselectedItem)` instead of `if (targetItem)`. Because the parent passes `item`, the preselection check fails and triggers an unnecessary network fetch (`fetchInventory()`) for 100 items instead of selecting the clicked item.
* **Proposed Surgical Fix**:
  In `outpost/src/components/LogSaleModal.jsx`:
  - Line 76: Change `if (preselectedItem)` to `if (targetItem)` and pass `targetItem` to `setSelectedItem` and `applyItemPlatformDefaults`.
  - Line 97: Update dependency array to `[isModalOpen, isEdit, saleToEdit, targetItem, defaultPlatform]`.

---

### 5. [P1 - HIGH] Dead Endpoints & Architectural Gateway Violation in Amazon Modals
* **Files**:
  - `outpost/src/components/AmazonItemModal.jsx:127`
  - `outpost/src/components/ListingCopyModal.jsx:141`
* **Target Code**:
  ```javascript
  const res = await fetch(getApiUrl('/api/import/amazon-fetch'), { ... });
  ```
* **Root Cause**: The Amazon scraper was migrated to the Central API Gateway at `https://techtrekgt.com/api/amazon/fetch` (wrapped by `fetchAmazonProduct` in `auctionApi.js`). `functions/api/import/amazon-fetch.js` was deleted from the Outpost backend and is not routed in `worker.js`. Direct calls to `getApiUrl('/api/import/amazon-fetch')` return 404 responses, breaking Amazon metadata scraping in both modals.
* **Proposed Surgical Fix**:
  In `AmazonItemModal.jsx` and `ListingCopyModal.jsx`:
  - Import `fetchAmazonProduct` from `../utils/auctionApi`.
  - Replace the direct `fetch(getApiUrl('/api/import/amazon-fetch'))` call with `await fetchAmazonProduct(inputQuery)`.

---

### 6. [P1 - HIGH] Target Margin Scaling Bug in Card Show Calculator Intake
* **File**: `outpost/src/components/CardShowCalculatorModal.jsx`
* **Line Number**: 94
* **Target Code**:
  ```javascript
  target_margin_pct: targetMarginPct,
  ```
* **Root Cause**: In `CardShowCalculatorModal.jsx`, `targetMarginPct` is stored as an integer percentage (e.g. `30` for 30%). In the database schema and `formulaPreview.js`, `target_margin_pct` is expected as a decimal fraction (`0.30`). Saving `30` causes subsequent pricing floor calculations to evaluate `1 + 30 = 31`, resulting in a 3100% markup error on suggested list prices.
* **Proposed Surgical Fix**:
  In `outpost/src/components/CardShowCalculatorModal.jsx:94`, change `target_margin_pct: targetMarginPct` to `target_margin_pct: (targetMarginPct || 0) / 100`.

---

### 7. [P1 - HIGH] Missing Worker Route Mapping for Market Value Alerts
* **File**: `outpost/src/worker.js`
* **Line Numbers**: 1-28, 226-230
* **Target Code**: `worker.js` omits imports and dispatch routes for `functions/api/market-alerts.js`.
* **Root Cause**: `functions/api/market-alerts.js` implements `onRequestGet`, `onRequestPut`, and `onRequestPost`, and `MarketAlertsPanel.jsx` queries `/api/market-alerts`, `/api/market-alerts/:id`, and `/api/market-alerts/refresh-all`. Because `worker.js` does not map these paths, all requests hit the fallback 404 handler.
* **Proposed Surgical Fix**:
  In `outpost/src/worker.js`:
  - Import handlers: `import { onRequestGet as marketAlertsGetHandler, onRequestPut as marketAlertsPutHandler, onRequestPost as marketAlertsPostHandler } from '../functions/api/market-alerts.js';`
  - Add routes:
    ```javascript
    } else if (apiPath === '/api/market-alerts' && request.method === 'GET') {
      response = await marketAlertsGetHandler(context);
    } else if (apiPath === '/api/market-alerts/refresh-all' && request.method === 'POST') {
      response = await marketAlertsPostHandler(context);
    } else if (/^\/api\/market-alerts\/[^/]+$/.test(apiPath) && request.method === 'PUT') {
      response = await marketAlertsPutHandler(context);
    ```

---

### 8. [P2 - MEDIUM] Category Filter Fracture Across Server Pagination and Client Table
* **Files**:
  - `outpost/src/context/InventoryContext.jsx:88-103`
  - `outpost/src/components/InventoryHubView.jsx:56-59`
  - `outpost/functions/api/items/enriched.js:46-70`
* **Target Code**:
  ```javascript
  // InventoryContext.jsx:
  const res = await getEnrichedItems({ page, limit: 50, sort: sortConfig.key, dir: sortConfig.direction, search, status: statusFilter });
  // InventoryHubView.jsx:
  const displayItems = useMemo(() => {
    if (!categoryFilter || categoryFilter === 'All') return sortedItems;
    return sortedItems.filter(i => i.category === categoryFilter);
  }, [sortedItems, categoryFilter]);
  ```
* **Root Cause**: `categoryFilter` is stored in `InventoryContext`, but `fetchItems()` does not pass `category` to the server API, and `functions/api/items/enriched.js` does not filter SQL by category. The client applies `categoryFilter` only to the current 50-item page slice. If page 1 contains 0 items in that category, the table renders empty even when matching items exist on subsequent pages.
* **Proposed Surgical Fix**:
  1. In `outpost/functions/api/items/enriched.js`: Accept `category` query parameter and add `WHERE category = ?` clause when supplied.
  2. In `outpost/src/utils/auctionApi.js`: Pass `category` in `getEnrichedItems()`.
  3. In `outpost/src/context/InventoryContext.jsx`: Pass `category: categoryFilter !== 'All' ? categoryFilter : undefined` inside `fetchItems()`.
  4. In `outpost/src/components/InventoryHubView.jsx`: Rely on server-filtered `sortedItems` directly for `displayItems`.

---

### 9. [P2 - MEDIUM] Unintended Destructive Field Stripping on Modal Open
* **File**: `outpost/src/components/EditItemModal.jsx`
* **Line Numbers**: 64, 67
* **Target Code**:
  ```javascript
  item_name: cleanItemDescription(item.item_name || '', item.athlete_person, item.authenticator),
  athlete_person: cleanAthleteName(item.athlete_person || '')
  ```
* **Root Cause**: `cleanItemDescription` is a display formatter that strips athlete names and authenticator strings. Running this when initializing the edit form populates the form input with the stripped string. If the user saves any edit, the original full item name in the database is permanently truncated.
* **Proposed Surgical Fix**:
  In `outpost/src/components/EditItemModal.jsx:64, 67`, initialize `item_name: item.item_name || ''` and `athlete_person: item.athlete_person || ''` without destructive string cleaning.

---

### 10. [P3 - LOW] Missing `platforms` Dependency in Proration Effect
* **File**: `outpost/src/components/AddInvoiceModal.jsx`
* **Line Number**: 83
* **Target Code**:
  ```javascript
  }, [discount, shipping, tax, items.map(i => `${i._key}:${i.unit_price}:${i.platform}:${i.est_shipping_cost}:${i.boost_pct}:${i.target_margin_pct}`).join('|')]);
  ```
* **Root Cause**: `platforms` is used inside the `useEffect` on line 71 to calculate pricing floors, but is omitted from the dependency array. If platforms update or load asynchronously, the preview calculation does not re-compute with updated fee schedules.
* **Proposed Surgical Fix**:
  Add `platforms` to the dependency array of the proration calculation `useEffect` in `AddInvoiceModal.jsx:83`.

---

### 11. [P3 - LOW] Uncleaned Debounce Timer on Dropdown Unmount
* **File**: `outpost/src/components/inventory/CatalogSearchDropdown.jsx`
* **Line Numbers**: 52-57
* **Target Code**:
  ```javascript
  debounceRef.current = setTimeout(() => { searchCatalog(val); }, 500);
  ```
* **Root Cause**: `CatalogSearchDropdown` does not clear `debounceRef.current` when unmounting, allowing pending timer callbacks to execute against unmounted components.
* **Proposed Surgical Fix**:
  In `CatalogSearchDropdown.jsx`, add a cleanup function in `useEffect` returning `() => { if (debounceRef.current) clearTimeout(debounceRef.current); }`.

---

## Action Plan & Verification Matrix

| Issue ID | File Path | Component / Module | Severity | Resolution Status |
| :--- | :--- | :--- | :--- | :--- |
| **AUDIT-01** | `outpost/src/components/AuthPage.jsx:145` | Auth & Password Reset | P0 | Verified & Documented |
| **AUDIT-02** | `outpost/src/utils/spreadsheetParser.js:327` | Workbook Parser | P0 | Verified & Documented |
| **AUDIT-03** | `outpost/src/components/SalesLogView.jsx:130, 146` | Sales Ledger KPI Strip | P1 | Verified & Documented |
| **AUDIT-04** | `outpost/src/components/LogSaleModal.jsx:51, 76, 97` | Log Sale Modal | P1 | Verified & Documented |
| **AUDIT-05** | `outpost/src/components/AmazonItemModal.jsx:127` & `ListingCopyModal.jsx:141` | Amazon Metadata Modals | P1 | Verified & Documented |
| **AUDIT-06** | `outpost/src/components/CardShowCalculatorModal.jsx:94` | Card Show Intake Modal | P1 | Verified & Documented |
| **AUDIT-07** | `outpost/src/worker.js:123-226` | Cloudflare Worker Router | P1 | Verified & Documented |
| **AUDIT-08** | `outpost/src/context/InventoryContext.jsx:88-103` | Inventory State & Pagination | P2 | Verified & Documented |
| **AUDIT-09** | `outpost/src/components/EditItemModal.jsx:64, 67` | Edit Item Modal | P2 | Verified & Documented |
| **AUDIT-10** | `outpost/src/components/AddInvoiceModal.jsx:83` | Invoice Proration Hook | P3 | Verified & Documented |
| **AUDIT-11** | `outpost/src/components/inventory/CatalogSearchDropdown.jsx:52` | Catalog Debounce Effect | P3 | Verified & Documented |

---

## HALT ENFORCEMENT

In accordance with the Anti-Pilot Guardrail Directive, **zero application source code has been modified**. Execution is immediately halted. To proceed with the surgical implementation of all 11 fixes, reply with:

`Audit approved, proceed with fixes.`
