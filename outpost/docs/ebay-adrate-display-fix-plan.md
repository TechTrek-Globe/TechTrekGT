# Promoted Listing Ad Rate 0% Display & Sync Bug - Implementation Plan

> Outpost Tracker (`e:/TechTrekGT/outpost`) | Authored: 2026-08-30

---

## 1. Issue Summary & Visual Reference

In `EditItemModal` > **Listing, Pricing & Fees** tab (`src/components/edit/EditTabListingPricing.jsx`), the "Live eBay Store Sync & Listing Connection" box for active eBay listing `#336748830345` displays:
```
Item Number: 336748830345 • 0% Promoted Ad
```
even though the item has a 7% Promoted Listing active on eBay.

---

## 2. Root Cause Analysis

Following a full trace from database through worker backend to frontend UI rendering, five contributing root causes were identified:

### Root Cause 1: Truthy String Coercion Bug in `EditTabListingPricing.jsx` (Visual Bug)
In [`src/components/edit/EditTabListingPricing.jsx`](file:///e:/TechTrekGT/outpost/src/components/edit/EditTabListingPricing.jsx) line 75:
```jsx
{form.ebay_promoted_rate && (
  <span className="text-amber-300 font-bold ml-2">• {form.ebay_promoted_rate}% Promoted Ad</span>
)}
```
When `form.ebay_promoted_rate` is populated with the string `"0"` (or `0.0`), JavaScript evaluates `Boolean("0") === true`. This causes the badge to render `• 0% Promoted Ad` instead of hiding or rendering the active non-zero percentage.

### Root Cause 2: OAuth Scope Authorization Gate on eBay Marketing API
Direct live testing against eBay API with the user's decrypted OAuth token returned:
```json
{
  "errors": [{
    "errorId": 1100,
    "domain": "ACCESS",
    "category": "REQUEST",
    "message": "Access denied",
    "longMessage": "Insufficient permissions to fulfill the request."
  }]
}
```
The user's active token in `ebay_oauth_tokens` was issued prior to adding `sell.marketing.readonly` and `sell.analytics.readonly` to `EBAY_ACG_SCOPES`. Because Marketing API calls return 403 Forbidden, `fetchSingleEbayListing()` fails silently and returns `promoted_rate: null`.

### Root Cause 3: Backend Fallback Overwrite in `sync-item.js`
In [`functions/api/ebay/sync-item.js`](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-item.js) lines 55-59:
```js
const promotedRate = (liveListing.promoted_rate != null && liveListing.promoted_rate > 0)
  ? liveListing.promoted_rate
  : (body.ebay_promoted_rate != null && body.ebay_promoted_rate !== ''
      ? parseFloat(body.ebay_promoted_rate)
      : (item.ebay_promoted_rate != null ? parseFloat(item.ebay_promoted_rate) : 0));
```
When `liveListing.promoted_rate` is `null` (due to missing Marketing API scope), if `body.ebay_promoted_rate` was `0` or empty, `promotedRate` resolved to `0`. `sync-item.js` then executed an `UPDATE auction_items SET ebay_promoted_rate = 0, boost_pct = 0`, overwriting any previous ad rate in D1.

### Root Cause 4: Form State Initialization Priority in `EditItemModal.jsx`
In [`src/components/EditItemModal.jsx`](file:///e:/TechTrekGT/outpost/src/components/EditItemModal.jsx) lines 158-160:
```js
ebay_promoted_rate: item.ebay_promoted_rate != null
  ? String(item.ebay_promoted_rate)
  : (item.boost_pct != null && Number(item.boost_pct) > 0 ? String(parseFloat((Number(item.boost_pct) * 100).toFixed(2))) : ''),
```
When `item.ebay_promoted_rate` is `0`, `item.ebay_promoted_rate != null` evaluates to `true`. This sets `form.ebay_promoted_rate = "0"`, and completely bypasses `item.boost_pct` (e.g. `0.07` = 7%).

### Root Cause 5: Client-Side Sync Overwrite in `handleSyncWithEbay`
In [`src/components/EditItemModal.jsx`](file:///e:/TechTrekGT/outpost/src/components/EditItemModal.jsx) lines 273-277:
When `syncEbayItem` returns `it.ebay_promoted_rate = 0` (from Root Cause 3), `syncPromotedRate` fell back to `form.ebay_promoted_rate || ''` (which was `'0'`), keeping the `'0'` string in state and overwriting any manual rate the user entered.

---

## 3. Proposed Changes

### Component 1: `src/components/edit/EditTabListingPricing.jsx`

#### [MODIFY] [EditTabListingPricing.jsx](file:///e:/TechTrekGT/outpost/src/components/edit/EditTabListingPricing.jsx)
- Update badge display check at line 75:
  Change from `{form.ebay_promoted_rate && ...}` to `{Number(form.ebay_promoted_rate) > 0 && ...}`.
- In the active listings browser picker (line 188), ensure `promoted_rate` is converted to percentage format properly.
- If `Number(form.ebay_promoted_rate) === 0` or blank, do not render the `• 0% Promoted Ad` bullet in the connection header.

### Component 2: `src/components/EditItemModal.jsx`

#### [MODIFY] [EditItemModal.jsx](file:///e:/TechTrekGT/outpost/src/components/EditItemModal.jsx)
- **Form Initialization:** Prioritize positive non-zero values for `ebay_promoted_rate`:
  ```js
  ebay_promoted_rate: (item.ebay_promoted_rate != null && Number(item.ebay_promoted_rate) > 0)
    ? String(item.ebay_promoted_rate)
    : (item.boost_pct != null && Number(item.boost_pct) > 0
        ? String(parseFloat((Number(item.boost_pct) * 100).toFixed(2)))
        : '')
  ```
- **Sync Handler (`handleSyncWithEbay`):** If live listing returns `promoted_rate: null` or `0`, preserve the user's manual rate in form state rather than resetting to `'0'`.

### Component 3: `functions/api/ebay/sync-item.js`

#### [MODIFY] [sync-item.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-item.js)
- When `liveListing.promoted_rate` is `null` (e.g. Marketing API 403 or unlinked), do not wipe out an existing positive `item.ebay_promoted_rate` or non-zero `body.ebay_promoted_rate` in D1.
- Preserve existing rate unless eBay actively returns an explicit rate:
  ```js
  const liveRate = (liveListing.promoted_rate != null && Number(liveListing.promoted_rate) > 0)
    ? Number(liveListing.promoted_rate)
    : null;

  const userRate = (body.ebay_promoted_rate != null && body.ebay_promoted_rate !== '' && Number(body.ebay_promoted_rate) > 0)
    ? parseFloat(body.ebay_promoted_rate)
    : null;

  const dbRate = (item.ebay_promoted_rate != null && Number(item.ebay_promoted_rate) > 0)
    ? parseFloat(item.ebay_promoted_rate)
    : (item.boost_pct != null && Number(item.boost_pct) > 0 ? parseFloat(item.boost_pct) * 100 : 0);

  const promotedRate = liveRate ?? userRate ?? dbRate ?? 0;
  const boostPct = promotedRate > 0 ? promotedRate / 100 : 0;
  ```

### Component 4: `functions/api/ebay/tokenHelper.js`

#### [MODIFY] [tokenHelper.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js)
- In `fetchSingleEbayListing()`, when the Marketing API returns a 403 status (missing scope), log a clean warning without throwing, and return `promoted_rate: null` with `promoted_rate_error: 'UNAUTHORIZED_SCOPE'`.

---

## 4. Verification Plan

### Manual & Automated Verification
1. **Unit/State Check:** Verify in `EditTabListingPricing.jsx` that `form.ebay_promoted_rate = "0"` or `0` does not display `• 0% Promoted Ad`.
2. **Value Check:** When `form.ebay_promoted_rate = "7"` or `7`, verify it displays `• 7% Promoted Ad`.
3. **Sync Check:** Click "Sync Live Data" with a 7% ad rate in the input; verify the 7% rate is preserved and properly updates `boost_pct` (`0.07`) and feeEngine calculations.
4. **Build Check:** Run `npm run build` in `e:/TechTrekGT/outpost` to confirm 0 compilation errors.
5. **Deploy Check:** Run `npm run deploy` and verify live Cloudflare worker triggers.

---

## 5. Step-by-Step File Modification List

| File | Action | Summary |
|------|--------|---------|
| `src/components/edit/EditTabListingPricing.jsx` | MODIFY | Fix `{Number(form.ebay_promoted_rate) > 0 && ...}` condition |
| `src/components/EditItemModal.jsx` | MODIFY | Fix `ebay_promoted_rate` initialization and sync state handling |
| `functions/api/ebay/sync-item.js` | MODIFY | Fix rate fallback cascade to preserve valid rates when Marketing API is unpermitted |
| `functions/api/ebay/tokenHelper.js` | MODIFY | Clean handling of 403 on Marketing API calls |
