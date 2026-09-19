# Implementation Plan: eBay Image Extraction, Hover Card Preview & Default Inventory Sort Order

## 1. Problem Overview
In TechTrekGT Outpost Tracker:
1. **eBay Image Extraction & Hover Card Preview**:
   - When syncing active eBay seller listings via backend workers (`sync-item.js` and `sync-all.js`), the primary image URL extracted from eBay APIs (Trading API `GetMyeBaySelling` / `GetItem` and Sell Inventory API) is not persisted into the item record's `attributes` JSON blob (`ebay_image_url`).
   - Many eBay image URLs returned by legacy Trading APIs use unencrypted `http://` schemes (e.g. `http://i.ebayimg.com/...`), which are blocked as mixed content on modern HTTPS origins like `https://techtrekgt.com`.
   - In the frontend hover card tooltip (`ItemImageHoverTooltip.jsx`) and pricing cards (`PricingCard.jsx`), image elements lack secure protocol normalization and native `onError` fallback handlers, causing native browser broken image placeholders to render when an image fails to load or has not yet synced.
2. **Default Inventory Sort Order**:
   - On initial page load of the Inventory & Pricing Hub, items are ordered purely by `created_at DESC` across both the backend D1 query (`enriched.js`) and the client-side quick sort (`InventoryContext.jsx`).
   - Items with a status of "Listed" should automatically sort to the top of the table on initial page load, followed by other active items by acquisition/creation date, keeping live marketable listings front and center.

---

## 2. Proposed Architectural Changes

### Component 1: Backend Image Extraction & Persistence
- **[tokenHelper.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js)**:
  - Add a shared utility function `normalizeHttps(url)` to guarantee all eBay gallery and picture URLs use secure `https://` protocols (converting `http://` and protocol-relative `//` URLs).
  - In `fetchEbayActiveSellerListings`:
    - Normalize Trading API extracted `<GalleryURL>` and `<PictureURL>`.
    - Extract `image_url` from Sell Inventory API items (`inv.product?.imageUrls?.[0]`) with HTTPS normalization (previously omitted).
  - In `fetchSingleEbayListing`:
    - Normalize `galleryUrl`, `imageUrl`, and all entries in `pictureUrls` to `https://`.
- **[sync-item.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-item.js)**:
  - When live listing data is retrieved from `fetchSingleEbayListing`, extract `liveListing.image_url`.
  - Parse existing `item.attributes`, stamp `attrs.ebay_image_url = liveListing.image_url`, and persist `attributes = ?` into D1 `auction_items` within the existing `UPDATE` statement.
- **[sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js)**:
  - When matching active listings or single detail fallbacks, extract `match.image_url` or `singleDetail.image_url`.
  - Parse `item.attributes`, stamp `attrs.ebay_image_url`, and update `attributes` column in D1 `auction_items`.
- **[image-preview.js](file:///e:/TechTrekGT/outpost/functions/api/items/image-preview.js)**:
  - Normalize any returned `imageUrl` to HTTPS before responding and caching into `attributes`.
- **[enriched.js](file:///e:/TechTrekGT/outpost/functions/api/items/enriched.js)**:
  - Normalize resolved `image_url` to HTTPS before returning the enriched item row to the client.

### Component 2: Frontend Hover Card & Preview Component
- **[ItemImageHoverTooltip.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/ItemImageHoverTooltip.jsx)**:
  - Add client-side `normalizeHttps(url)` helper to ensure all synchronous and async image URLs are forced to `https://`.
  - Introduce `imgError` state tracking and an `onError` event handler on `<img />`.
  - Support automatic secondary image fallback (e.g., if `attrs.ebay_image_url` fails, fallback to Amazon `attrs.image_url` or `target.image_url` before failing).
  - When no valid image is available or image loading fails, render a styled fallback panel (`ImageOff` icon with "No photo available") without displaying broken browser placeholder icons.
- **[PricingCard.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/PricingCard.jsx)**:
  - Normalize thumbnail URL to HTTPS.
  - Add `onError` fallback handling so broken or unreachable images fall back gracefully to the placeholder rather than browser broken icons.

### Component 3: Default Inventory Sort Order (Listed Status to Top)
- **[enriched.js](file:///e:/TechTrekGT/outpost/functions/api/items/enriched.js)**:
  - Update default query sorting: when `sortByParam === 'created_at'` and `sortDirParam === 'DESC'` (the default load condition), use:
    `ORDER BY CASE WHEN i.status = 'Listed' THEN 0 ELSE 1 END, i.created_at DESC`
    This ensures page 1 of paginated queries returns "Listed" items first from the database.
- **[InventoryContext.jsx](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx)**:
  - In `sortedItems`, update the client-side sorting comparator:
    When `sortPreset === 'default'` (or default sorting on `created_at`), prioritize items where `status === 'Listed'` before comparing `created_at`.
    When the user selects an explicit preset or clicks a specific column header, the chosen column sort is respected.

---

## 3. Files to Modify

1. **[tokenHelper.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js)**:
   - Normalize Trading API and Sell Inventory API image URLs to HTTPS.
   - Extract `imageUrls[0]` from Sell Inventory API items.
2. **[sync-item.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-item.js)**:
   - Save `attrs.ebay_image_url` to `auction_items.attributes` in D1 during item synchronization.
3. **[sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js)**:
   - Save `attrs.ebay_image_url` to `auction_items.attributes` in D1 during batch synchronization.
4. **[image-preview.js](file:///e:/TechTrekGT/outpost/functions/api/items/image-preview.js)**:
   - Ensure HTTPS normalization on returned and cached image URLs.
5. **[enriched.js](file:///e:/TechTrekGT/outpost/functions/api/items/enriched.js)**:
   - Update default SQL `ORDER BY` to rank `status = 'Listed'` first.
   - Normalize `image_url` returned to client to HTTPS.
6. **[ItemImageHoverTooltip.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/ItemImageHoverTooltip.jsx)**:
   - Add HTTPS normalization helper.
   - Add image error state and fallback handling with graceful UI.
7. **[PricingCard.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/PricingCard.jsx)**:
   - Add HTTPS normalization and image error handling.
8. **[InventoryContext.jsx](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx)**:
   - Update client-side default sort logic to place `Listed` items at the top on initial page load.

---

## 4. Verification Plan

### Automated Verification
- Run production build in PowerShell:
  `cd e:\TechTrekGT\outpost; npm run build`
  Verify zero errors and successful Vite bundling into `dist/client`.

### Manual Verification
- **Image Extraction**:
  - Test `/api/items/image-preview` and `/api/ebay/sync-item` to confirm `attrs.ebay_image_url` is saved to D1 with HTTPS scheme.
- **Hover Card Rendering**:
  - Open Outpost Inventory Hub in browser.
  - Hover over item descriptions and verify live image renders cleanly with no broken icon.
  - Test with items missing images to confirm clean fallback UI (`No photo available`).
- **Default Sort Order**:
  - Load Inventory Hub with default sort preset.
  - Verify all items with status `Listed` appear at the top of the table.
  - Verify clicking custom column headers (e.g. Price, Margin) re-sorts by that column as expected.
