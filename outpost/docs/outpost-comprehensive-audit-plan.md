# TechTrekGT Outpost Tracker - Comprehensive Audit & Implementation Plan

- **Target Workspace**: `e:/TechTrekGT/outpost`
- **Canonical Baseline Checked**: `e:/TechTrekGT/docs/02_arch.md`, `e:/TechTrekGT/docs/04_state.md`, and `e:/TechTrekGT/outpost/docs/01_identity.md`, `02_arch.md`, `03_features.md`, `04_state.md`
- **Stack Constraints**: Pure JavaScript (JSX/ESM, zero `.ts`/`.tsx`), React 19, Vite 6, Tailwind CSS 3.4, custom `pushState`/`popstate` SPA routing, React Context + hooks, Cloudflare Workers ESM (`nodejs_compat`), dedicated D1 (`outpost-db`), HttpOnly SSO `auth_token` cookie (`credentials: 'include'`).
- **Audit Scope**: Pillars 2-5 across all 246 files in `outpost/` (backend Worker/API routes, D1 schemas/migrations, financial/lifecycle math, parsers, listing templates, external proxies, React contexts/UI, and next-level feature blueprints).

---

## Executive Architecture & Documentation Drift Summary

1. **Dormant Relational Normalization (Migration `0011` vs Canonical Docs)**:
   - `outpost/docs/03_features.md`, `outpost/docs/04_state.md`, and root `docs/04_state.md` describe Migration `0011` relational tables (`auction_item_images`, `auction_item_specs`, `auction_item_platform_listings`, `ebay_reconciliation_fee_lines`) as active relational persistence layers.
   - In code, `outpost/functions/utils/normalizedItemStore.js` (L4-7) explicitly leaves these four Migration `0011` tables dormant/unwritten, while `image-preview.js`, `ebay/reconcile.js`, and `items/[id].js` continue reading/writing scalar columns or JSON blobs inside `auction_items.attributes`.
2. **Orphaned & Redundantly Mounted UI Components**:
   - Dead/unimported source modules: `src/components/edit/EditTabListingPricing.jsx` (1,176 lines), `src/components/edit/LiveFeeReadout.jsx` (217 lines, imported only by `EditTabListingPricing.jsx`), `src/components/inventory/QuickEditDrawer.jsx` (825 lines), `src/components/inventory/StatusFilterBar.jsx` (50 lines), and `src/components/ImportView.jsx` (38 lines, unrouted in `App.jsx`).
   - Dead modal mounts inside `src/components/InventoryHubView.jsx`: `LogSaleModal` (L427) and `EbayListingIdModal` (L454) remain mounted even though `saleModalOpen` and `listingIdModalItem` are never set to active state because L375-398 redirects Quick Edit, Edit, and eBay Listing ID actions into `EditItemModal` (`'financial'` tab).
3. **Divergent Client Financial Math**:
   - `InventoryPricingTooltip.jsx` uses `src/utils/pricingMetrics.js` (`getItemFloorMetrics`), whereas `EditItemModal.jsx`, `FeeBreakdownPanel.jsx`, `PricingCard.jsx`, and `InventoryMetricsStrip.jsx` use `src/utils/feeEngine.js` (`computeFeeBreakdown` / `computeTargetPriceFromMargin`). Hovering vs opening an item displays conflicting Net Profit, Margin %, ROI %, and Target Margin Floor figures.

---

## Pillar 2: Edge Worker, Auth & D1 Persistence Audit

### P2-1. Unenforced Central Router Auth + Redirect Shadowing in Worker Entry
- **Impact**: High | **Implementation Risk**: Low
- **Locations**: `outpost/src/worker.js` (`addSecurityHeaders` L129-137, legacy redirect block L425-430, `/auction/api/` rewrite L445-448, `ROUTES` dispatch L451-455).
- **Findings**:
  1. L425-430 issues an HTTP 301 redirect for `/auction/*` and `/Outpost/*` before L445-448 (`/auction/api/` rewrite) and L532-553 can execute, creating dead code and converting POST requests on legacy `/auction/api/*` paths to GETs.
  2. `matchRoute(request.method, apiPath)` (L451-455) delegates straight to `routeMatch.handler(context)` without enforcing `routeMatch.route.auth` (`'session'`, `'session_admin'`, `'bearer_or_secret'`, `'webhook'`) centrally, leaving endpoints exposed if a handler forgets `requireAuth`.
  3. `addSecurityHeaders` (L129-137) reflects `requestOrigin` with `Access-Control-Allow-Credentials: true` without setting `Vary: Origin`.
- **Implementation Plan**:
  1. Move `/auction/api/*` rewrite ahead of the HTML 301 redirect block and preserve HTTP 308 (not 301) only for non-API HTML routes.
  2. Enforce `routeMatch.route.auth` inside `worker.js` dispatch middleware before invoking route handlers (central defense-in-depth alongside per-handler checks).
  3. Add `Vary: Origin` whenever `Access-Control-Allow-Origin` is set dynamically from `requestOrigin`.

### P2-2. Fail-Open Token Version, Suspended User, and Revocation Gaps
- **Impact**: High | **Implementation Risk**: Medium
- **Locations**: `outpost/functions/utils/guard.js` (`requireAuth` L17-38), `outpost/functions/utils/apiIntegrations.js` (`resolveIntegrationUserId` L74-87, L135-136), `outpost/functions/api/auth/login.js` (L56), `verify-email.js` (L45, L70, L95, L120, L164-170), `register.js` (L98, L102-109), `update-profile.js` (L34-50, L86).
- **Findings**:
  1. `guard.js` `requireAuth` checks `tokenTv < currentTv` instead of `!==`, ignores missing/deleted `!user` and `user.status === 'Suspended'`, swallows DB exceptions in `catch (_) {}` (failing open), and omits `Set-Cookie: auth_token=; Max-Age=0` cleanup on L17-20 rejection responses.
  2. `apiIntegrations.js` `resolveIntegrationUserId` also fails open on `!user` or DB catch, ignores `status === 'Suspended'`, and retains deprecated `OUTPOST_SECRET_KEY` fallback resolving to the oldest user row.
  3. `auth/login.js` never validates `user.status` or subsequent-login `email_verified`.
  4. `auth/verify-email.js` omits `change_type` check (L45), signs session token with stale `tv: 1` (L70/L120), omits `token_version` increment on email change (L95), and performs state mutation in `onRequestGet` (L164-170).
  5. `auth/update-profile.js` calls `verifyToken` without DB `token_version` comparison, omits `Max-Age=0` on 401/403 (L86), and calls `checkRateLimit(env.RATE_LIMIT_KV, ...)` without `failClosed: true` or `env.RATE_LIMIT_DO`.
  6. `auth/register.js` omits `created_app = 'outpost'` (L98) and inserts 12 default platforms sequentially with swallowed errors (L102-109) instead of `env.DB.batch()`.
- **Implementation Plan**:
  1. Update `guard.js` `requireAuth` to verify `user && user.status !== 'Suspended' && Number(tokenTv) === Number(user.token_version)`, fail closed with HTTP 503 on D1 read error, and always attach cleared `auth_token` cookie headers (`Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/`) on 401/403 responses.
  2. Apply the same `!user` / `Suspended` / fail-closed rule to `resolveIntegrationUserId`, and gate/remove legacy `OUTPOST_SECRET_KEY` fallback behind explicit config disablement.
  3. Update `login.js`, `verify-email.js` (POST-only mutation, `token_version` query/bump, `change_type` validation), `update-profile.js` (use `requireAuth` + fail-closed `RATE_LIMIT_DO`), and `register.js` (`created_app = 'outpost'` + atomic `env.DB.batch()`).

### P2-3. Rate Limiter Bypass, Unchunked D1 Batches & Cross-Tenant Uniqueness Leakage
- **Impact**: High | **Implementation Risk**: Medium
- **Locations**: `outpost/functions/api/items/enriched.js` (L39), `outpost/functions/utils/RateLimitCounter.js` (L84), `outpost/functions/api/items/[id].js` (L214-234, L464-471), `outpost/functions/api/items/auto-sku.js` (L47), `outpost/functions/api/ebay/sync-item.js` (L59-69), `outpost/functions/api/import/batch.js` (L109), `outpost/functions/api/ebay/listingsCache.js` (L137, L171-173), `outpost/functions/api/ebay/analytics.js` (L607, L800, L930, L1051).
- **Findings**:
  1. `items/enriched.js` L39 passes `env` instead of `env.RATE_LIMIT_KV` to `checkRateLimit`, triggering a silent TypeError bypass; `RateLimitCounter.js` L84 caps alarm TTL at a hardcoded `900 * 1000` ms.
  2. `items/[id].js` L214-234, `ebay/sync-item.js` L59-69, and `import/batch.js` L109 run global `WHERE ebay_listing_id = ?` / `WHERE sku = ?` queries without `user_id = ?`, exposing another tenant's `item_name`/`sku`/`status` inside HTTP 400 errors.
  3. `listingsCache.js` L137 runs `ON CONFLICT(ebay_listing_id) DO UPDATE SET user_id = excluded.user_id` (allowing ownership takeover if listing IDs collide across sandbox/user accounts) and L171-173 builds an unchunked `NOT IN (...)` placeholder list risking SQLite's 999-bind limit.
  4. `items/[id].js` L464-471 executes sequential unbatched deletes; `auto-sku.js` L47 calls `env.DB.batch()` without chunking (`<= 90` statements per chunk); `ebay/analytics.js` L607, L800, L930, and L1051 swallow `.batch().catch(() => {})` failures while returning `{ success: true }`.
- **Implementation Plan**:
  1. Fix `enriched.js` L39 to pass `env.RATE_LIMIT_KV` (with `env.RATE_LIMIT_DO` and `failClosed`), and derive `RateLimitCounter.js` alarm TTL dynamically from the max active window.
  2. Scope all uniqueness checks in `[id].js`, `sync-item.js`, `import/batch.js`, and `listingsCache.js` (`PRIMARY KEY (user_id, ebay_listing_id)` or `WHERE user_id = ?`) to the authenticated `user_id`, removing foreign row metadata from 400 error strings.
  3. Wrap `[id].js` cascade deletes in `env.DB.batch()`, extract a shared `chunkedBatch(db, statements, chunkSize = 80)` utility for `auto-sku.js`, `listingsCache.js`, and `analytics.js`, and remove `.catch(() => {})` on DB writes in `analytics.js` so partial failures surface explicitly.

### P2-4. Reconcile Migration `0011` Dormancy vs Documentation
- **Impact**: Medium | **Implementation Risk**: Low
- **Locations**: `outpost/functions/utils/normalizedItemStore.js` (L4-7), `outpost/migrations/0011_deep_normalization.sql` (L8-69), `outpost/docs/03_features.md`, `04_state.md`.
- **Findings**: `normalizedItemStore.js` intentionally leaves all 4 Migration `0011` tables unused while keeping blobs in `auction_items.attributes` and `ebay_fee_reconciliations`.
- **Implementation Plan**: Either wire `normalizedItemStore.js` into `[id].js`, `image-preview.js`, and `reconcile.js` inside atomic `env.DB.batch()` transactions (dual-writing to `auction_item_images`, `auction_item_specs`, `auction_item_platform_listings`, `ebay_reconciliation_fee_lines`) or update canonical docs after explicit sign-off so docs/runtime match. Recommended path: activate `auction_item_images` and `auction_item_platform_listings` first because multi-image galleries and cross-channel routing (FB Marketplace + eBay) directly require them.

---

## Pillar 3: Inventory Lifecycle, Financial Math & Parsers Audit

### P3-1. Consolidate Divergent Financial Formulas Across Frontend & Backend
- **Impact**: High | **Implementation Risk**: Medium
- **Locations**: `outpost/src/utils/pricingMetrics.js` (`getItemFloorMetrics` L103-131), `outpost/src/utils/feeEngine.js` (`computeFeeBreakdown`, `computeTargetPriceFromMargin` L90-186), `outpost/functions/utils/auction.js` (`round2` L18, `computeItemProration` L132-168, `computePricingFloors` L262-287), `outpost/src/components/inventory/InventoryPricingTooltip.jsx` (L3, L16-89).
- **Findings**:
  1. `getItemFloorMetrics()` in `pricingMetrics.js` calculates `trueNetProfit = listPrice - platformFees - adFees - landedCost` - omitting BOTH `buyer_shipping_cost` credit and `est_shipping_cost` debit, returning `marginPct`/`roiPct` on a `0-100` scale while `feeEngine.js` returns `0-1` fractions.
  2. `getItemFloorMetrics()` computes `targetMarginFloor = costBasis / (1 - platformFeePct - adFeePct - targetMarginPct)`, diverging from `auction.js` (`min_sell_price * (1 + target_margin_pct)`) and `feeEngine.js` (`computeTargetPriceFromMargin`).
  3. Because `InventoryPricingTooltip.jsx` imports `pricingMetrics.js` while `EditItemModal.jsx`, `FeeBreakdownPanel.jsx`, `PricingCard.jsx`, and `InventoryMetricsStrip.jsx` import `feeEngine.js`, hovering the `$` icon in the grid produces completely different profit and target numbers than opening the item row.
  4. `auction.js` `round2` uses `(Math.round(val * 100) / 100)` (vulnerable to IEEE-754 half-cent rounding drift such as `1.005`), and `computeItemProration` rounds per item instead of using largest-remainder integer-cent distribution across an invoice, ignoring `quantity`.
- **Implementation Plan**:
  1. Deprecate `src/utils/pricingMetrics.js` and migrate `InventoryPricingTooltip.jsx` directly onto `computeFeeBreakdown` and `computeTargetPriceFromMargin` from `src/utils/feeEngine.js` (unifying `0-1` decimal fraction contracts across every view).
  2. Replace `round2` in `functions/utils/auction.js` and `src/utils/formulaPreview.js` with integer-cent / epsilon-corrected rounding (`Math.round((num + Math.sign(num) * 1e-9) * 100) / 100` or exact integer-cent math).
  3. Upgrade `computeItemProration` to compute invoice-level `netAdjustmentCents` first, distribute cents across items weighted by `(unit_price * quantity)` using Hamilton largest-remainder allocation so line-item landed totals sum strictly to `(base_total - discount + shipping + tax)` down to `$0.01`.

### P3-2. Fix Lifecycle State Corruption, Orphaned `'Sold'` Items & Unsafe Rollbacks
- **Impact**: High | **Implementation Risk**: Medium
- **Locations**: `outpost/functions/api/ebay/sync-all.js` (L182-186, L295, L324, L372-413, L535), `outpost/functions/api/ebay/sync-item.js` (L182-184), `outpost/functions/utils/sales.js` (`upsertSale` L349-391), `outpost/functions/api/sales/index.js` (L235, L260), `outpost/functions/api/ebay/tokenHelper.js` (L1796), `outpost/functions/api/ebay/match-sold-vinescout.js` (L242, L357-397), `outpost/functions/api/ebay/analytics.js` (L488).
- **Findings**:
  1. `ebay/sync-all.js` L295 sets `newStatus = 'Sold'` whenever `qtySold > 0`, even when L324 `orderData.isExactMatch === false` defers sale creation into a `PENDING_SALE_MATCH` alert; L372-413 then commits `auction_items.status = 'Sold'` with zero corresponding row in `auction_sales`.
  2. `ebay/sync-item.js` L182-184 unconditionally forces `newStatus = 'Listed'` and `platform = 'eBay'` even when `targetListingId` and `liveListing` are null.
  3. `ebay/sync-all.js` L535 and `ebay/analytics.js` L488 check `status !== 'Returned / Refunded'` instead of canonical `'Returned'`. `sync-all.js` L182-186 also caps Fulfillment order queries at 100 orders and overwrites Map keys on multi-line orders containing multiple items for the same listing ID.
  4. `sales.js` `upsertSale` catches ANY SQL error (including `CHECK` failures) and blindly falls back to `UPDATE`, blocks clearing nullable fields via `COALESCE`, and returns a synthetic object on L391 if the follow-up `SELECT` returns `null`.
  5. Both `sales/index.js` L260 and `tokenHelper.js` L1796 run compensating rollback `DELETE FROM auction_sales WHERE id = ?`, which destroys an existing historical sale if an upsert-update path fails mid-transaction!
  6. `sales/index.js` L235 and `match-sold-vinescout.js` L357-397 lack concurrency/double-sale guards when `auction_items.status === 'Sold'`, and `match-sold-vinescout.js` omits updating `actual_sell_price`, `date_sold`, and `days_on_market` while L242 hides sibling line items once an `order_id` matches once.
- **Implementation Plan**:
  1. In `sync-all.js`, gate `status = 'Sold'` transitions strictly on `orderData && orderData.isExactMatch === true` and `saleId` persistence (or leave item in `'Listed'` / `'delist_pending'` when deferred to `PENDING_SALE_MATCH`), paginate Fulfillment API calls, key orders by `(orderId, lineItemId)`, and normalize all `'Returned / Refunded'` checks to canonical `'Returned'`.
  2. In `sync-item.js`, preserve existing `status` and `platform` when `targetListingId` and `liveListing` are null.
  3. Rewrite `upsertSale` + `sales/index.js` + `tokenHelper.js` rollback logic to execute item status update + sale `INSERT ... ON CONFLICT(...) DO UPDATE` together inside a single atomic `env.DB.batch()`, guarding double-sale transitions with `WHERE status != 'Sold'` and checking `changes === 1` (or snapshotting the prior sale row before an update-path rollback).
  4. Update `match-sold-vinescout.js` to populate `actual_sell_price`, `date_sold`, and `days_on_market` via `computeSaleMetrics` and key order exclusions by `(order_id, line_item_id || legacy_item_id)`.

### P3-3. Fix Fee Reconciliation, Platform Validation & Tax Report Math
- **Impact**: High | **Implementation Risk**: Low
- **Locations**: `outpost/functions/api/ebay/reconcile.js` (L74-76, L83, L150), `outpost/functions/api/platforms/[id].js` (L45), `outpost/functions/api/reports/tax.js` (L44-52, L84, L94-98, L109-110), `outpost/src/components/TaxReportModal.jsx` (L66-77), `outpost/src/components/SettingsView.jsx` (L380-400, L430-450).
- **Findings**:
  1. `reconcile.js` L74-76/L83 includes `shippingLabelCost` inside `actualFees` and subtracts `sale.platform_fees_amt` (which excludes shipping), artificially inflating `fee_delta` by the entire label cost; L150 stores `finalValueFee + regulatoryFee` in `platform_fees_amt` whereas `tokenHelper.js` L1668 includes promoted and payment processing fees.
  2. `platforms/[id].js` L45 validates `fee_pct` with `validateNonNegativeMoney` instead of `validatePercentage`, permitting `fee_pct >= 1.0` (e.g., entering `15` stores `1500%`).
  3. `reports/tax.js` sums unrounded floats (L44-52, L109-110) and omits `'Kept for Self'`/`'Returned'` exclusions when computing beginning/ending Schedule C / Form 1125-A inventory valuation (L84, L94-98).
  4. `TaxReportModal.jsx` L66-77 and `SettingsView.jsx` L380-450 export user-editable text fields (`item_name`, `buyer_handle`, `notes`) directly to CSV without escaping leading `=`, `+`, `-`, `@` characters (CSV formula injection).
- **Implementation Plan**:
  1. Separate fee components cleanly in `reconcile.js` so `fee_delta` compares apples-to-apples (`actualPlatformFees - estimatedPlatformFees`) independently of `shipping_label_cost`, and unify `platform_fees_amt` semantics with `tokenHelper.js`.
  2. Enforce `validatePercentage` (`0 <= fee_pct < 1`) in `platforms/[id].js`.
  3. Round all monetary sums via `round2` and exclude non-sellable statuses (`'Kept for Self'`, `'Returned'`) in `reports/tax.js`; add a shared `escapeCsvCell()` helper sanitizing leading formula prefixes in `TaxReportModal.jsx` and `SettingsView.jsx`.

### P3-4. Harden Invoice, Amazon/VineScout, and Spreadsheet Parsers & Ingestion APIs
- **Impact**: High | **Implementation Risk**: Medium
- **Locations**: `outpost/src/utils/pdfInvoiceParser.js` (L156, L263, L312-332), `outpost/src/utils/spreadsheetParser.js` (L446-493), `outpost/functions/api/import/amazon.js` (L48-50, L92, L121, L219, L281), `outpost/functions/api/import/batch.js` (L109), `outpost/functions/api/invoices/index.js`, `outpost/functions/api/invoices/[id].js` (L95), `outpost/functions/api/sync/vinescout-catalog.js` (L159), `outpost/functions/api/export/vinescout-inventory.js`.
- **Findings**:
  1. `pdfInvoiceParser.js` extracts `adjustments.buyersPremium` at L156/263, then drops it when assembling `invoice` & `trueTotalCost` at L312-332 (plus unrounded proration floats).
  2. `spreadsheetParser.js` L446-493 hardcodes `0.40`/`6.50` fees/shipping instead of `constants.js`, skips `$0` cost items during floor calculation, and generates unrounded proration floats.
  3. `import/amazon.js` L92 hardcodes `const taxAmt = 0;`, discarding `taxCostAmt` on L219/281; omits `withAuth` wrapper (L48-50); filters via `json_extract` instead of indexed `i.order_id` (L121); and overwrites items already marked `'Sold'`.
  4. `import/batch.js` permits `NaN`/`Infinity` via `typeof !== 'number'`, zero-clobbers valid `0%` fee (`|| DEFAULT_PLATFORM_FEE_PCT`), skips `computePricingFloors` / promoted-rate columns, and leaves `manual_avg` unrounded.
  5. `invoices/index.js` rejects `$0` `unit_price` (blocking `$0` Vine/promo lots), mis-validates percentage fields with `validateNonNegativeMoney`, overrides `0` fee with `!it.platform_fee_pct`, and bypasses `normalizeItemStatus` and `pricing.pricing_error`. `invoices/[id].js` L95 omits `itemCount` from `computeItemProration`.
  6. `sync/vinescout-catalog.js` L159 coalesces invalid date order (`daysBetween() ?? 0`) to `0`, and `export/vinescout-inventory.js` filters non-existent status `'Selling'` while mixing percentage/fraction outputs.
- **Implementation Plan**:
  1. Include `buyersPremium` in `pdfInvoiceParser.js` invoice landed cost (mapped into tax/fee overhead or explicit `buyers_premium` column) and route client proration through unified largest-remainder integer-cent proration.
  2. Refactor `spreadsheetParser.js` to import defaults from `constants.js`, compute floor even for `$0` acquisition items (`est_shipping` + flat fee recovery), and unify fee calculation.
  3. Fix `import/amazon.js` (`withAuth`, preserve computed `taxCostAmt`, query indexed `i.order_id`, guard `status != 'Sold'`), harden `import/batch.js` (`Number.isFinite` + `??` instead of `||` for zero fees), fix `invoices/index.js` & `invoices/[id].js` (`unit_price >= 0`, `validatePercentage`, pass `itemCount`), and fix `vinescout-catalog.js` / `export/vinescout-inventory.js`.

---

## Pillar 4: Listing Pipeline, Media & External Proxies Audit

### P4-1. Eliminate Stored/Reflected HTML XSS in Listing Templates & Gemini AI Pipeline
- **Impact**: High | **Implementation Risk**: Low
- **Locations**: `outpost/src/utils/ebayTemplate.js` (L123-168), `outpost/src/utils/listingCopyGenerator.js` (L67-68, L176-179, L207, L233), `outpost/functions/api/ai/generate-ebay-details.js` (L271-285), `outpost/src/components/ListingCopyModal.jsx` (L253-290, L320-346, L943).
- **Findings**:
  1. `ebayTemplate.js` and `listingCopyGenerator.js` interpolate `title`, `description`, `conditionDetails`, specs, and features directly into HTML template literals without `escapeHtml()`.
  2. `ai/generate-ebay-details.js` strips code fences/em-dashes and tracking notes, returning raw Gemini-generated HTML without allowlist tag/attribute filtering (`<script>`, `<iframe>`, `on*` handlers, `javascript:` URLs). It also duplicates `stripInternalTrackingNotes`, chains sequential 10s + 15s AI calls (25s total latency), and passes the Gemini key in query param `?key=`.
  3. `ListingCopyModal.jsx` L943 renders `curEbay.htmlBody` verbatim inside `dangerouslySetInnerHTML`.
  4. `listingCopyGenerator.js` L67-68 truncates titles mid-word (`slice(0, 77) + '...'`) wasting eBay 80-char SEO keywords, and L207/L233 hardcodes personal `tt_globetrotter` banner/store URLs instead of user settings.
- **Implementation Plan**:
  1. Add `escapeHtml()` to every interpolated field in `ebayTemplate.js` and `listingCopyGenerator.js`, and implement strict HTML allowlist sanitization (allowing only safe structural tags `<div>`, `<p>`, `<span>`, `<ul>`, `<li>`, `<strong>`, `<br>`, `<table>`/`<tr>`/`<td>` and safe inline `style`, stripping `<script>`, `<iframe>`, `on*`, and unsafe `href`/`src` schemes) both server-side in `generate-ebay-details.js` and client-side before `dangerouslySetInnerHTML` (or render preview inside a sandboxed `<iframe sandbox="" srcDoc={...}>`).
  2. Move the Gemini API key in `generate-ebay-details.js` from `?key=` URL query string to `x-goog-api-key` HTTP header, unify `stripInternalTrackingNotes`, and trim eBay titles on word boundaries without `'...'` filler. Move store banner/store URL to `sync_settings` / user profile preferences with safe fallback.

### P4-2. Enforce `AbortSignal.timeout(15000)` on All Remaining External Proxies & Gateway Calls
- **Impact**: High | **Implementation Risk**: Low
- **Locations**: `outpost/functions/api/items/image-preview.js` (L127), `outpost/functions/api/market-alerts.js` (L130), `outpost/functions/utils/auth.js` (L347 Resend API), `outpost/src/utils/auctionApi.js` (L208-258: `fetchLiveComps`, `fetchEbayCatalog`, `fetchEbayItemDetail`, `fetchAmazonProduct`), `outpost/functions/api/ebay/tokenHelper.js` (L27-212, L90, L1102).
- **Findings**:
  1. Upstream Worker calls in `image-preview.js` L127, `market-alerts.js` L130, and `auth.js` L347 call raw `fetch()` without `AbortSignal.timeout(15000)` / `fetchWithTimeout`, risking hanging Worker isolates.
  2. Client gateway wrappers in `auctionApi.js` L208-258 similarly omit request timeouts / caller abort propagation.
  3. `tokenHelper.js` duplicates AES-GCM encryption routines already canonicalized in `functions/utils/tokenCrypto.js` (L27-212), inspects `navigator.userAgent` (L90), and interpolates `accessToken` unescaped into Trading XML (L1102).
  4. `ebay/analytics.js` L693-736 handles eBay `dimension=LISTING` aggregate totals by dividing `totalImp`/`totalViews` evenly across all calendar days `n`, distorting daily sparkline charts when 30d/60d/90d windows overlap; `sync/settings.js` `PUT` accepts client overrides of server-managed sync timestamps.
- **Implementation Plan**:
  1. Replace raw `fetch()` calls in `image-preview.js`, `market-alerts.js`, and `auth.js` with `fetchWithTimeout(..., 15000)` (`AbortSignal.timeout(15000)`), and add `AbortSignal.any` / 15s timeout support inside `auctionApi.js` proxy calls.
  2. Deduplicate `tokenHelper.js` crypto imports to `tokenCrypto.js`, XML-escape `accessToken` in Trading calls, and replace `navigator.userAgent` checks with explicit env capability flags.
  3. Restrict `sync/settings.js` `PUT` strictly to user-editable preferences (`ebay_auto_sync`, `ebay_sync_interval_m`, `vscout_auto_sync`, `vscout_sync_interval_m`, store copy preferences).

### P4-3. Image/Media Storage Lifecycle & Multi-Image Support
- **Impact**: Medium | **Implementation Risk**: Medium
- **Locations**: `outpost/functions/api/items/image-preview.js`, `outpost/functions/api/items/[id].js`, `outpost/migrations/0011_deep_normalization.sql` (`auction_item_images`), `outpost/src/components/edit/EditTabDetails.jsx` (L36-57).
- **Findings**:
  - Images exist only as inconsistent single URLs (`auction_items.image_url`, `attributes.ebay_image_url`, `attributes.amazon_image_url`). `image-preview.js` writes resolved thumbnails back only into `attributes` JSON rather than `auction_items.image_url` or `auction_item_images`. There is no image upload/reordering/primary-selection API, and deleting/unlinking an eBay listing leaves stale URLs behind.
- **Implementation Plan**:
  1. Sync `image-preview.js` and `ebay/sync-item.js` writes to `auction_items.image_url` AND `auction_item_images` (`sort_order`, `is_primary`, `ON DELETE CASCADE`), preserving primary selection and cleaning orphaned marketplace URLs when unlinking `ebay_listing_id`.
  2. Surface multi-thumbnail strip (primary badge, reorder, add URL, fallback resolution) in `EditTabDetails.jsx`.

---

## Pillar 5: UI/UX Consolidation, Frontend State & Next-Level Feature Architecture

### P5-1. Information Architecture & UI Redundancy Consolidation
- **Impact**: High | **Implementation Risk**: Medium
- **Locations**: `InventoryHubView.jsx` (L375-465), `EditItemModal.jsx` (L299, L912-1000), `EditTabNav.jsx`, `EditTabListingPricing.jsx`, `LiveFeeReadout.jsx`, `QuickEditDrawer.jsx`, `EbayListingIdModal.jsx`, `InventoryGridRow.jsx` (L97-179), `SettingsView.jsx` (L27-33, L1161-1260), `ImportView.jsx`, `StatusFilterBar.jsx`.
- **Findings**:
  1. **Duplicate / Dead Edit & Modal Code**: ~2,800+ lines of orphaned or duplicate editing components (`EditTabListingPricing.jsx`, `LiveFeeReadout.jsx`, `QuickEditDrawer.jsx`, `EbayListingIdModal.jsx`, `ImportView.jsx`, `StatusFilterBar.jsx`) clutter the repo alongside dead `InventoryHubView.jsx` state (`saleModalOpen`, `listingIdModalItem`).
  2. **Overlapping Row Action Icons**: `InventoryGridRow.jsx` L97-179 displays 7 row action icons (`Sync`, `Edit`, `eBay Link`, `Copy`, `Log Sale`, `Delete`, `Profit Hover`), where clicking `Edit`, `eBay Link`, or `Profit Hover` all invoke `EditItemModal` on `'financial'`. Meanwhile, `Log Sale` in `InventoryHubView` navigates to Sales with `pendingSaleItem` instead of opening an inline drawer/modal cleanly.
  3. **Scattered Operational Workflow**: Sourcing/Intake (`SpreadsheetImporter`, `AmazonItemModal`, `AddInvoiceModal`), Listing/Comps (`ListingCopyModal`, `EditTabComps`, `ListingMatchReviewModal`), and Reports (`TaxReportModal`, `FinanceSyncModal`, `CSV Exports`) are split between `InventoryCommandBar`, `SettingsView` `'data'` tab, and `CommandPalette`.
- **Implementation Plan**:
  1. **Prune Dead Code & Single-Path Item Inspector**: Remove unreferenced `EditTabListingPricing.jsx`, `LiveFeeReadout.jsx`, `QuickEditDrawer.jsx`, `EbayListingIdModal.jsx`, `ImportView.jsx`, and `StatusFilterBar.jsx` (and remove dead modal mounts from `InventoryHubView.jsx`). Consolidate `InventoryGridRow.jsx` actions into 4 distinct triggers (`Edit Inspector`, `Listing Copy & Channel Router`, `Record Sale`, `More/Sync/Delete`) plus one clickable `StatusBadge` / `MarginHealthBadge`.
  2. **Logical Stage Ordering Inside Unified Inspector (`EditItemModal.jsx`)**: Order tabs linearly by inventory lifecycle: `1. Intake & Details (Auth/Images/Vine)` -> `2. Pricing & Comps (Channel Compare + Aging/Reprice)` -> `3. Listing & Copy (eBay/FB/Local Templates + Listing Link)` -> `4. Sales & Payouts (Traffic + Sale/Recon Ledger)`. Extract shared `<StatusBadge>` and `<FeeBreakdownBadge>` consumed identically by grid rows, hover tooltips, cards, and inspector headers.
  3. **Declutter `SettingsView.jsx`**: Keep `SettingsView` focused strictly on Configuration (`Platforms/Fees`, `API/eBay/VineSync`, `Columns/Categories`, `Security`), moving operational tools (`Importer`, `IRS Schedule C Tax Report`, `LEDGER CSV Exports`) into a dedicated top-level `Operations / Reports` modal menu or `Intake` / `Sales` view toolbars cleanly accessible via `CommandPalette`.

### P5-2. Frontend Auth Sync, Race-Condition Guards, SPA Routing & Dialog Hygiene
- **Impact**: High | **Implementation Risk**: Low
- **Locations**: `src/utils/auctionApi.js` (L46), `src/context/AuthContext.jsx` (L104, L242), `src/context/InventoryContext.jsx` (L182, L188, L222), `src/App.jsx` (L133, L180), `src/components/AppLayout.jsx` (L32), `src/components/AdminView.jsx` (L15, L30), `src/components/ui/CommandPalette.jsx` (L97), `src/components/DashboardView.jsx` (L16-31), `src/components/dashboard/MarketAlertsPanel.jsx` (L13, L32, L46), `src/components/ViewInvoiceModal.jsx`, `src/components/EditItemModal.jsx` (L331-350, L646), `SalesLogView.jsx` (L299), `SettingsView.jsx` (L134, 147, 272, 309, 340, 861, 1890), `EbayConnectBanner.jsx` (L79), `InventoryHubView.jsx` (L132).
- **Findings**:
  1. `auctionApi.js:46` dispatches `'outpost:unauthorized'` on HTTP 401 (omits 403), and **zero components listen for it**, leaving revoked sessions stuck in signed-in React state. Meanwhile, `InventoryContext.jsx:222`, `MarketAlertsPanel.jsx:13,32,46`, `AdminView.jsx:30`, and `App.jsx:133` bypass `apiFetch` with raw `fetch()` (`App.jsx:133` also omits `credentials: 'include'`).
  2. `AuthContext.jsx:242` calls `window.history.pushState({}, '', '/outpost')` without notifying `App.jsx`'s `pathname` React state, and L104 triggers a hard `window.location.href` reload.
  3. Admin gating hardcodes `'jgk1865@gmail.com'` in `App.jsx:180`, `AppLayout.jsx:32`, `AdminView.jsx:15`, and `CommandPalette.jsx:97` instead of reading `user.role === 'admin'`.
  4. `fetchRequestIdRef` stale-response guards exist in `InventoryContext.jsx:182`, `EditItemModal.jsx:646` (analytics only), and `SalesLogView.jsx:124`, but are missing in `DashboardView.jsx`, `MarketAlertsPanel.jsx`, `AdminView.jsx`, `ViewInvoiceModal.jsx`, and `EditItemModal.jsx`'s `getItem`/`getComps` loads.
  5. `InventoryContext.jsx:188` fetches `limit: 50`, so client-side `sortedItems` and `InventoryMetricsStrip` KPIs reflect only the current 50-item page rather than the true active portfolio.
  6. **11 native `window.confirm()` calls** violate the UI-banner/modal invariant (`EbayConnectBanner.jsx:79`, `EditItemModal.jsx:394`, `InventoryHubView.jsx:132`, `SalesLogView.jsx:299`, and `SettingsView.jsx` 7 occurrences).
- **Implementation Plan**:
  1. Subscribe to `'outpost:unauthorized'` inside `AuthContext.jsx` (triggering immediate state reset + cookie-expired session banner without full page reload), emit the event on both 401 and 403 revocation responses in `auctionApi.js`, and migrate all raw `fetch()` calls to `apiFetch`.
  2. Replace `AuthContext.jsx:242` `pushState` + L104 reload with a shared SPA navigation helper / CustomEvent listener synced to `App.jsx`, and gate Admin views via `user?.role === 'admin' || user?.is_admin`.
  3. Add monotonic `fetchRequestIdRef` + `AbortController` guards to `DashboardView.jsx`, `MarketAlertsPanel.jsx`, `AdminView.jsx`, `ViewInvoiceModal.jsx`, and `EditItemModal.jsx` comps/sale fetches.
  4. Move aggregate KPI totals (`totalLandedCost`, `totalListValue`, `estNetProfit`, `compsCoverage`) and primary multi-column sorting (`net_profit`, `margin`, `days_in_inventory`) onto `/api/items/enriched` D1 queries / metadata so paginated pages remain accurate.
  5. Replace all 11 `window.confirm()` calls with a reusable `<ConfirmBannerModal>` / inline destructive confirmation popover.

### P5-3. Zero-Dependency Ergonomics (Shortcuts, Filtering, Bulk Grid Actions & Caching)
- **Impact**: Medium | **Implementation Risk**: Low
- **Locations**: `src/components/inventory/InventoryDataGrid.jsx`, `InventoryGridRow.jsx`, `InventoryCommandBar.jsx`, `InventoryHubView.jsx`, `src/components/ui/CommandPalette.jsx`, `src/utils/auctionApi.js`.
- **Implementation Plan**:
  1. **Grid Multi-Select & Bulk Action Bar**: Add `selectedIds` (`Set`) + header checkbox in `InventoryDataGrid.jsx` and row checkbox in `InventoryGridRow.jsx`. When `selectedIds.size > 0`, render a compact floating bulk bar supporting: Bulk Status change (`Available` / `Listed` / `Kept for Self` / `Returned`), Bulk Channel/Platform assignment, Bulk Auto-SKU assign, and Bulk Reprice Preview.
  2. **Multi-Faceted Filter Chips**: Extend `InventoryCommandBar.jsx` with 1-click diagnostic chips: `Aging (31-60d / 61-90d / 90d+)`, `Unlinked eBay`, `Missing Comps`, `Below Floor`, and `Unverified Auth`.
  3. **Global Keyboard Shortcuts**: Standardize `/` (focus active view search input), `Cmd/Ctrl+K` (Command Palette), `n` (New Invoice when unfocused), and `Escape` (pop topmost modal layer).
  4. **Zero-Dep Client Cache**: Add an in-memory TTL `Map` inside `auctionApi.js` / `InventoryContext.jsx` (pattern matching `CommandPalette.jsx`'s LRU cache) for `/api/platforms`, `/api/dashboard`, and `/api/ebay/active-listings`, invalidated automatically on mutations.

### P5-4. Next-Level Feature Blueprint A: Automated Repricing & Aging-Inventory Decay Engine
- **Impact**: High | **Implementation Risk**: Medium
- **Goal**: Automatically detect stagnant listings across Days-in-Inventory buckets (`0-30d`, `31-60d`, `61-90d`, `90d+`) and compute strictly floor-clamped markdown suggestions (`10%` / `20%` / `Liquidation`) that never violate `0%` net profit break-even cost.
- **Data Model & Additive Schema (`migrations/0012_repricing_channel_routing.sql`)**:
  - Alter `auction_items` to add:
    - `original_list_price REAL` (snapshotted on first list / backfill from `current_list_price`)
    - `last_repriced_at TEXT`
    - `reprice_locked INTEGER NOT NULL DEFAULT 0` (per-item opt-out for collectibles/high-conviction holds)
    - `reprice_tier TEXT` (`'fresh' | 'decay_10' | 'decay_20' | 'liquidation'`)
- **Pure Shared Math Engine (`functions/utils/auction.js` + `src/utils/feeEngine.js`)**:
  - Add pure function `computeAgingDecaySuggestion(item, platformSchedule, options = {})`:
    1. **Days in Inventory**: `daysListed = daysBetween(item.date_listed || item.date_acquired || item.purchase_date, todayUTC)`. Only evaluate eligible statuses (`'Listed'`, `'Available'`; skip `'Sold'`, `'Kept for Self'`, `'Returned'`, `'delist_pending'`, or `reprice_locked === 1`).
    2. **Bucket Assignment**:
       - `0-30d`: `bucket = '0-30d'`, `tier = 'fresh'`, `discountPct = 0` (Hold).
       - `31-60d`: `bucket = '31-60d'`, `tier = 'decay_10'`, `discountPct = 0.10`.
       - `61-90d`: `bucket = '61-90d'`, `tier = 'decay_20'`, `discountPct = 0.20`.
       - `90d+`: `bucket = '90d+'`, `tier = 'liquidation'`, `target = 'break_even'`.
    3. **Canonical Break-Even Cost Floor**: Compute `breakEvenFloor = round2(computePricingFloors({ true_total_cost, est_shipping_cost: netShipOut, platform_flat_fee, platform_fee_pct, boost_pct, target_margin_pct: 0 }).min_sell_price)` so fees, promoted ad rate, outbound shipping deficit (`max(0, est_shipping_cost - buyer_shipping_cost)`), and COGS/auth/tax are 100% covered (`0%` profit floor).
    4. **Floor-Clamped Markdown**:
       - Base price `anchor = Number(item.original_list_price || item.current_list_price || item.suggested_list_price || 0)`.
       - `rawTarget = tier === 'liquidation' ? breakEvenFloor : round2(anchor * (1 - discountPct))`.
       - **Hard Invariant**: `suggestedReprice = round2(Math.max(rawTarget, breakEvenFloor))`. Never recommend a price below `breakEvenFloor` automatically; if `current_list_price <= breakEvenFloor`, flag `atFloorBlocked = true` and route recommendation toward Blueprint B (zero-fee local pickup liquidation to eliminate marketplace/shipping drag).
- **Backend Endpoints & Execution Safety**:
  - `GET /api/items/reprice-candidates`: Aggregates aging buckets and floor-clamped suggestions across user inventory (also emitting optional `'AGING_DECAY'` notifications to `auction_market_alerts`).
  - `POST /api/items/reprice-apply` (`requireAuth`, accepts array of `{ item_id, target_price, sync_to_ebay }`):
    1. Recomputes `breakEvenFloor` server-side inside the Worker and rejects/clamps any `target_price < breakEvenFloor` unless `allowBelowFloorLiquidation: true` is explicitly confirmed.
    2. Updates `auction_items` (`current_list_price`, `original_list_price = COALESCE(original_list_price, current_list_price)`, `last_repriced_at`, `reprice_tier`) atomically via chunked `env.DB.batch()`.
    3. Optionally revises active eBay listing price via new `updateEbayListingPrice` in `tokenHelper.js` (Trading API `ReviseFixedPriceItem`/`ReviseItem` `<StartPrice>`); if eBay rejects revision, executes compensating D1 rollback restoring prior price.
- **UI Integration**:
  - Compact Age pill (`18d`, `42d -10%`, `74d -20%`, `96d LIQ`) inside `InventoryGridRow.jsx`, an Aging Bucket summary strip / quick filter in `InventoryCommandBar.jsx`, and a batch-review modal ("Aging Markdown Review") inside `InventoryHubView.jsx` allowing 1-click lock (`reprice_locked`) or selective price application.

### P5-5. Next-Level Feature Blueprint B: Sold-Comp Velocity & Channel-Routing Intelligence
- **Impact**: High | **Implementation Risk**: Medium
- **Goal**: Compare eBay shipped economics vs zero-fee Facebook Marketplace / Local Pickup economics per item using comps & listing traffic velocity, recommend the optimal channel, and output 1-click channel-tailored copy.
- **Shared Channel-Routing Engine (`functions/utils/auction.js` + `src/utils/feeEngine.js`)**:
  - New pure function `compareChannelEconomics(item, options = {})`:
    1. **Inputs**: `askPrice = compsRecommended || current_list_price || suggested_list_price`, `landedCost`, `estShippingCost`, `buyerShippingCost`, `ebayPlatform` (`fee_pct`, `flat_fee`, `promoted_rate`), and `localDiscountPct` (default `0.00` or user-adjustable `5-10%` local buyer expectation), plus velocity signals (`daysInInventory`, `compsSummary` from `market_comps`/`auction_comps`, `total_impressions_30d`, `total_page_views_30d`, `avg_ctr_30d`).
    2. **eBay Shipped Economics**: Uses `computeFeeBreakdown` -> `{ netProceeds, netProfit: ebayNetProfit, marginPct: ebayMargin, roiPct: ebayRoi, breakEvenFloor: ebayFloor }`.
    3. **Local Pickup / Facebook Marketplace (Zero-Fee) Economics**: `localGross = round2(askPrice * (1 - localDiscountPct))`, `localFees = 0`, `localShipping = 0`, `localNetProfit = round2(localGross - landedCost)`, `localFloor = round2(landedCost)`, `localMargin`, `localRoi`.
    4. **Velocity & Routing Rule Engine**:
       - Compute `localAdvantageDollars = round2(localNetProfit - ebayNetProfit)`.
       - Calculate `sellThroughScore` from active vs sold comps (`soldCount / Math.max(1, soldCount + activeCount)`) and eBay CTR (`avg_ctr_30d`) + `daysInInventory`.
       - Recommend `'Facebook Marketplace / Local Pickup'` when: `(localAdvantageDollars >= 5 && estShippingCost >= 12)` OR `(ebayNetProfit <= 0 && localNetProfit > 0)` OR `(daysInInventory > 60 && total_impressions_30d < 50 && localAdvantageDollars >= 0)`.
       - Recommend `'eBay (Shipped)'` when national collector/cert demand yields higher net realization (`ebayNetProfit > localNetProfit` or high eBay CTR/sold-comp velocity on lightweight/certified goods).
       - Surface clear explanation badge (`"+$18.40 net saved locally by avoiding $14.20 eBay fee & $11.50 shipping"` or `"Best on eBay: 72% comp sell-through & verified cert lookup"`).
- **Dual-Template Copy & SEO Engine Upgrade (`src/utils/listingCopyGenerator.js` + `ListingCopyModal.jsx`)**:
  1. **eBay 80-Char Word-Boundary SEO Generator**: Fix `generateEbayCopy` L67-68 to pack high-signal tokens (`Brand`, `Athlete`, `Item Name`, `Authenticator`, `Cert #`, `Condition`) cleanly on word boundaries `<= 80` chars with zero ellipsis truncation, and ensure sanitized HTML (`escapeHtml`).
  2. **Facebook Marketplace / Local Pickup Generator (`generateFacebookCopy`)**: Add dedicated generator producing:
     - Clean scannable local title (no eBay SEO spam, includes Condition/Location-ready tag).
     - Formatted bullet summary + verified cert check note (if authenticated).
     - Automatic removal of shipping tracking/packaging notes via `stripInternalTrackingNotes` + customizable local pickup/cash/Venmo/Zelle terms and suggested local ask price vs eBay shipped break-even savings callout.
  3. **UI Surfacing**:
     - Add **"Channel Profit Compare (eBay vs. Local FB)"** side-by-side comparison card inside `EditTabFinancials.jsx` and `ListingCopyModal.jsx`.
     - Add **`Facebook / Local`** tab in `ListingCopyModal.jsx` right beside `eBay (SEO & HTML)` with 1-click Copy Title + Copy Description buttons and suggested price switcher.

---

## Prioritized Execution Roadmap

| Priority | Workstream | Primary Files | Impact | Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1 (Security & Correctness)** | Enforce central `worker.js` auth, fix `guard.js` / `apiIntegrations.js` fail-closed + `Max-Age=0`, fix `enriched.js` rate-limit arg, scope multi-tenant uniqueness checks, upgrade CSV injection escaping | `src/worker.js`, `functions/utils/guard.js`, `apiIntegrations.js`, `auth/*.js`, `items/[id].js`, `listingsCache.js`, `TaxReportModal.jsx`, `SettingsView.jsx` | High | Low-Med |
| **Phase 2 (Financial & Lifecycle Integrity)** | Unify `pricingMetrics.js` onto `feeEngine.js`, fix integer-cent proration + half-cent rounding, guard `sync-all.js`/`sync-item.js`/`upsertSale` atomic `DB.batch()`, fix `reconcile.js`, `platforms/[id].js`, `tax.js`, `pdfInvoiceParser.js`, `import/amazon.js` | `feeEngine.js`, `pricingMetrics.js`, `InventoryPricingTooltip.jsx`, `functions/utils/auction.js`, `sales.js`, `sync-all.js`, `reconcile.js`, `pdfInvoiceParser.js`, `import/amazon.js` | High | Medium |
| **Phase 3 (Listing Security, Timeouts & Image Sync)** | Sanitize template + Gemini HTML + `ListingCopyModal.jsx`, move `?key=` to header, wrap external fetches in `fetchWithTimeout(15000)`, sync `auction_items.image_url` + `auction_item_images` | `ebayTemplate.js`, `listingCopyGenerator.js`, `ai/generate-ebay-details.js`, `ListingCopyModal.jsx`, `image-preview.js`, `market-alerts.js`, `auth.js`, `auctionApi.js`, `normalizedItemStore.js` | High | Low-Med |
| **Phase 4 (UI/UX Consolidation & State Hygiene)** | Prune 5 orphaned files + 2 dead modal mounts, wire `outpost:unauthorized` listener + raw `fetch()` fixes, add `fetchRequestIdRef` gaps, move KPI/sort server-side, replace 11 `window.confirm()` calls, add grid bulk actions & shortcuts | `InventoryHubView.jsx`, `EditItemModal.jsx`, `InventoryGridRow.jsx`, `InventoryDataGrid.jsx`, `AuthContext.jsx`, `InventoryContext.jsx`, `SettingsView.jsx`, `DashboardView.jsx`, `CommandPalette.jsx` | High | Medium |
| **Phase 5 (Next-Level Blueprints A & B)** | Ship Aging-Inventory Decay Engine (D1 migration `0012`, floor-clamped reprice API + batch review UI) & Channel-Routing Intelligence (eBay vs Local FB profit comparator + `generateFacebookCopy` + 80-char word-boundary SEO generator) | `migrations/0012_*.sql`, `functions/utils/auction.js`, `items/reprice-*.js`, `tokenHelper.js`, `feeEngine.js`, `listingCopyGenerator.js`, `ListingCopyModal.jsx`, `EditTabFinancials.jsx` | High | Medium |

