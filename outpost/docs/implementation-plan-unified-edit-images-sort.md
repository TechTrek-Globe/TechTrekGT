# Implementation Plan: Unified Item Edit Workflow, eBay Image Extraction & Default Table Sort

## 1. Executive Summary

This implementation plan addresses three key functional improvements for the **TechTrekGT Outpost Tracker** inventory system:
1. **Unify Inventory Item Display & Edit Workflows:** Eliminate the split UX between clicking on an Item Title/Description (`EditItemModal`) versus clicking Action -> Open Quick Edit (`QuickEditDrawer`). Design and implement a single, unified, user-friendly Item Details & Quick Edit Modal/Drawer that acts as the single source of truth for viewing item details, editing fields (pricing, status, description, COGS), and displaying product media.
2. **Fix eBay Image Extraction & Hover Card Preview:** Audit and fix the backend eBay sync pipeline and D1 storage so active listing images are reliably extracted and saved. Fix the floating hover card tooltip to prevent state drift between items, handle secure HTTPS protocol normalization, and display graceful fallbacks without broken browser icons.
3. **Update Default Table Sorting:** Ensure that on initial page load (and default view), inventory items with status "Listed" automatically sort to the top of the table, followed by other active items by acquisition/creation date.

---

## 2. Comprehensive Audit Findings

### 2.1 Split Edit UX Audit
- **Current State:**
  - In [InventoryGridRow.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/InventoryGridRow.jsx#L157), clicking on the Item Title / Description or the pencil icon triggers `onOpenEditModal(item)`, opening `<EditItemModal />`.
  - In the same row under the Actions column ([InventoryGridRow.jsx#L92](file:///e:/TechTrekGT/outpost/src/components/inventory/InventoryGridRow.jsx#L92)), clicking the `Edit3` button triggers `onOpenQuickEdit(item)`, opening `<QuickEditDrawer />`.
  - In [PricingCard.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/PricingCard.jsx#L198), clicking the `Edit3` icon triggers `onOpenQuickEdit(item)`, but clicking the card title does not open any edit view.
  - In [InventoryHubView.jsx](file:///e:/TechTrekGT/outpost/src/components/InventoryHubView.jsx#L74-L80), both `drawerItem` and `editModalItem` are maintained as separate states, mounting both `<QuickEditDrawer />` and `<EditItemModal />`.
- **Issues Identified:**
  - Users encounter two completely different interfaces for editing the same inventory item.
  - `<QuickEditDrawer />` lacks product media display, eBay 30-day traffic/performance analytics, and tabbed navigation.
  - `<EditItemModal />` lacks the quick "Auto-Generate SKU" and "Push SKU to eBay" buttons found in the drawer, and does not display product image media.
  - Divergent states and duplicated code increase maintenance overhead and confuse user workflows.

### 2.2 eBay Image Extraction & Hover Card Audit
- **Backend eBay Sync Pipeline:**
  - In [tokenHelper.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js#L202-L211), `fetchEbayActiveSellerListings` executes a `GetMyeBaySelling` Trading API call without `<DetailLevel>ReturnAll</DetailLevel>`. Without `ReturnAll`, eBay omits `<PictureDetails>` and `<PictureURL>` from active listings.
  - In [sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js#L184), `const ebayImg = match.image_url || singleDetail?.image_url || null;` references `singleDetail`, which is block-scoped inside an earlier `if` statement ([line 147](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js#L147)). If that `if` block is not entered, evaluating `singleDetail` throws a runtime `ReferenceError: singleDetail is not defined`, aborting image assignment.
  - In [tokenHelper.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js#L66), `normalizeHttps` is implemented but needs to be consistently applied across all image ingestion paths (Trading API, Sell Inventory API, and image preview).
- **Frontend Hover Card Tooltip ([ItemImageHoverTooltip.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/ItemImageHoverTooltip.jsx)):**
  - In `ItemImageHoverTooltip.jsx`, `useState(() => { ... })` initializes state only on component mount. When the user moves the mouse across table rows, `<ItemImageHoverTooltip />` remains mounted while receiving a new `target` prop. Because `state` is not reinitialized on `cacheKey` changes, the tooltip continues displaying the previous item's image or loading state.
  - Images missing HTTPS normalization can be blocked as mixed content on HTTPS origins (`techtrekgt.com`).
  - Image failure recovery needs clean UI rendering (`ImageOff` icon) without broken image placeholder icons.

### 2.3 Default Table Sorting Audit
- In [enriched.js](file:///e:/TechTrekGT/outpost/functions/api/items/enriched.js#L170-L172), the default SQL sort uses:
  `ORDER BY CASE WHEN i.status = 'Listed' THEN 0 ELSE 1 END, i.created_at DESC`
  This check is case-sensitive. If status values in D1 have lowercase or mixed casing (e.g. `'listed'`), the conditional evaluates to false.
- In [InventoryContext.jsx](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx#L100-L106), the client-side `sortedItems` memo checks `a.status === 'Listed'`, which also lacks case-insensitivity.
- In [InventoryDataGrid.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/InventoryDataGrid.jsx#L72-L84), `activeItems` filters out `Sold` items, but should explicitly ensure `Listed` items maintain top positioning regardless of secondary sort parameters during default view.

---

## 3. Proposed Changes

### Component 1: Unified Item Details & Quick Edit Modal

#### [MODIFY] [InventoryHubView.jsx](file:///e:/TechTrekGT/outpost/src/components/InventoryHubView.jsx)
- Eliminate the separate `drawerItem` / `setDrawerItem` state.
- Retain a single unified `editModalItem` / `setEditModalItem` state.
- Route all edit triggers (`onOpenEditModal`, `onOpenQuickEdit`) to open the unified modal.
- Remove `<QuickEditDrawer />` import and JSX render block, keeping `<EditItemModal />` as the single source of truth.

#### [MODIFY] [InventoryGridRow.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/InventoryGridRow.jsx)
- Update the Action column's `Edit3` button to call `onOpenEditModal(item)` instead of `onOpenQuickEdit(item)`.
- Ensure clicking the Item Title/Description and clicking the Action edit icon invoke the identical unified modal workflow.

#### [MODIFY] [PricingCard.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/PricingCard.jsx)
- Update the card header `Edit3` button to trigger the unified edit modal.
- Make the card title clickable to open the unified edit modal.

#### [MODIFY] [EditItemModal.jsx](file:///e:/TechTrekGT/outpost/src/components/EditItemModal.jsx)
- Integrate all capabilities previously exclusive to `QuickEditDrawer`:
  - Auto-generate SKU button using `generateSku()`.
  - Push SKU to eBay button using `pushSkuToEbay()`.
  - Display item media in the modal header and in the Details tab.
  - Show image thumbnail, high-resolution preview link, and fallback display.
- Maintain existing tabbed layout (`Details`, `Listing & Pricing`, `Market Comps`, `Performance & Traffic`, `VineScout`).
- Ensure optimistic local updates and responsive field auto-saving.

#### [MODIFY] [EditModalHeader.jsx](file:///e:/TechTrekGT/outpost/src/components/edit/EditModalHeader.jsx)
- Replace generic package icon with the item's product photo thumbnail (if available) with HTTPS normalization and click-to-preview capability.
- Display live eBay listing link and direct sync shortcut if linked to an eBay listing.

#### [MODIFY] [EditTabDetails.jsx](file:///e:/TechTrekGT/outpost/src/components/edit/EditTabDetails.jsx)
- Add product media preview card displaying the primary item image (eBay or Amazon), source badge, and external full-size link.
- Add "Auto-Generate SKU" button alongside the SKU input field.
- Add "Push SKU to eBay" action when the item is linked to an active eBay listing ID.

---

### Component 2: Backend eBay Image Extraction & Hover Card Tooltip

#### [MODIFY] [tokenHelper.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js)
- In `fetchEbayActiveSellerListings`:
  - Add `<DetailLevel>ReturnAll</DetailLevel>` to `GetMyeBaySellingRequest` so eBay returns `<PictureDetails>` and `<PictureURL>`.
  - Extract `<PictureURL>` and `<GalleryURL>` from item blocks with `normalizeHttps()`.
  - Extract `inv.product?.imageUrls?.[0]` with `normalizeHttps()` from Sell Inventory API results.
- In `fetchSingleEbayListing`:
  - Guarantee all extracted picture and gallery URLs are normalized to HTTPS.

#### [MODIFY] [sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js)
- Fix the scoping bug on line 184: declare `let singleDetail = null;` at the item iteration level so accessing `singleDetail` never throws a `ReferenceError`.
- Ensure `attrs.ebay_image_url` is captured from `match.image_url || singleDetail?.image_url` and saved into D1 `auction_items.attributes`.

#### [MODIFY] [sync-item.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-item.js)
- Ensure `liveListing.image_url` is normalized to HTTPS and saved to `attrs.ebay_image_url` in D1 `auction_items.attributes`.

#### [MODIFY] [enriched.js](file:///e:/TechTrekGT/outpost/functions/api/items/enriched.js)
- Ensure `attrs.ebay_image_url` is resolved with `normalizeHttps()` and returned as top-level `image_url` on enriched item rows.
- Ensure case-insensitive SQL ordering: `ORDER BY CASE WHEN LOWER(i.status) = 'listed' THEN 0 ELSE 1 END, i.created_at DESC`.

#### [MODIFY] [ItemImageHoverTooltip.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/ItemImageHoverTooltip.jsx)
- Fix the state drift bug: add an effect or re-initialize `state` whenever `cacheKey` changes so the tooltip never retains the prior item's image.
- Enforce `normalizeHttps()` on all image URLs before rendering `<img src={...} />`.
- Retain secondary fallback (e.g. falling back to Amazon image if eBay image fails).
- Render clean `ImageOff` fallback with "No photo found on eBay or Amazon" when no valid image exists, eliminating browser broken image icons.

#### [MODIFY] [InventoryDataGrid.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/InventoryDataGrid.jsx)
- Pass `key={hoverTooltip.item.id}` to `<ItemImageHoverTooltip />` so each hovered item mounts a fresh, isolated component instance.

---

### Component 3: Default Table Sorting (Listed Items at Top)

#### [MODIFY] [enriched.js](file:///e:/TechTrekGT/outpost/functions/api/items/enriched.js)
- In the SQL query builder, update the default order clause to use `LOWER(i.status) = 'listed'`:
  `ORDER BY CASE WHEN LOWER(i.status) = 'listed' THEN 0 ELSE 1 END, i.created_at DESC`
  This guarantees that page 1 of paginated query results returns all Listed items first from the database.

#### [MODIFY] [InventoryContext.jsx](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx)
- In `sortedItems`, update the client-side default sort comparator:
  When `sortPreset === 'default'` (or `sortConfig.key === 'created_at' && sortConfig.direction === 'desc'`), prioritize items where `(a.status || '').toLowerCase() === 'listed'`.
- Ensure explicit user column clicks (e.g. sorting by Price or Margin) override the default preset as expected.

---

## 4. Verification Plan

### Automated Verification
1. **Zero-Error Production Build:**
   Run Vite production build via PowerShell:
   ```powershell
   cd e:\TechTrekGT\outpost; npm run build
   ```
   Confirm build succeeds with zero errors and generates output in `dist/client`.

### Manual Verification
1. **Unified Edit Workflow:**
   - Click an Item Title / Description in the table row: verify the unified Item Details modal opens.
   - Click the Action column `Edit3` button in the same table row: verify the exact same unified modal opens.
   - Verify all fields (Title, SKU, Category, Athlete, Status, Prices, Shipping, COGS, Notes) can be viewed and edited.
   - Verify the "Auto-Generate SKU" and "Push SKU to eBay" buttons function properly.
   - Verify product media image displays cleanly in the modal header and Details tab.
2. **eBay Image Extraction & Hover Card:**
   - Hover over item descriptions in the inventory table: verify the floating image card renders smoothly with HTTPS image URLs.
   - Test items without photos: verify clean fallback ("No photo found on eBay or Amazon") without broken browser icon.
   - Trigger eBay sync for an item: verify `attrs.ebay_image_url` is captured and saved to D1.
3. **Default Table Sorting:**
   - Reload the Inventory & Pricing page with default settings.
   - Verify all items with status "Listed" display at the top of the table.
   - Verify non-listed items follow by acquisition / creation date.
   - Click column headers (Price, Margin): verify custom sorting operates correctly.
