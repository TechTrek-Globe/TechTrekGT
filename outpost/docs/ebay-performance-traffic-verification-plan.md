# Implementation Plan: eBay Performance & Traffic Metric Verification and CTR Scaling Fix

## 1. Executive Summary & Objective

The objective of this investigation is to confirm that the "Performance & Traffic" telemetry pulled and rendered in Outpost Tracker aligns with actual eBay seller data. Specifically, we investigate the root cause of the abnormal 909.0% Click-Through Rate (CTR) displayed in the UI screenshot (`image_15261b.png`), establish baseline truth from the official eBay Listing Quality Report spreadsheet (`Listing quality report for tt_globetrotter - US - 10_23_2026 07-38 PST.xlsx`), audit the Cloudflare Worker analytics logic (`outpost/functions/api/ebay/analytics.js`), and define the exact deltas required to restore mathematical integrity.

---

## 2. Evidence Analysis & Baseline Ground Truth

### 2.1 UI Screenshot Review (`image_15261b.png`)
Inspection of the user-provided screenshot reveals two distinct visualization anomalies:
1. **Daily Search Impressions & Page Views Chart (Top Chart):**
   - Date range spans rolling 30 calendar days (09-25 through 10-24, ending yesterday T-1 Pacific Time relative to 10-25).
   - Impressions bars hover around 3 to 4 impressions daily.
   - Page Views polyline flatlines at 0 views from 09-25 through 10-15 (first 21 days), then steps up to exactly 1 view on 10-16 and remains flat at 1 view per day through 10-24 (last 9 days).
2. **CTR & Buyer Conversion Efficiency Chart (Bottom Chart):**
   - Left vertical Y-axis labels are scaled to `909.0%`, `454.5%`, and `0.0%`.
   - Buyer Conversion Rate (green polyline) is flat at 0.0% across all 30 days.
   - Click-Through Rate (purple polyline) is flat at 0.0% until 10-15, then on 10-16 jumps vertically to 909.0% and stays pinned at 909.0% across all remaining dates.

### 2.2 Spreadsheet Ground Truth Parsing (`Listing quality report for tt_globetrotter - US - 10_23_2026 07-38 PST.xlsx`)
Parsing all 11 worksheets of the official eBay report via Node.js SheetJS reveals:
- **Seller Account:** `tt_globetrotter` (US marketplace).
- **Report Scope:** Analysis based on last 31 days, Buy It Now active listings, generated 10/23/2026 at 07:38 PST.
- **Listing Metrics Baseline across Categories:**
  - `Baseball-MLB>Jerseys` (5 listings):
    - Item `336705109055` (`OP-260701-UUTU`): Impressions: 15/day, CTR: `"No clicks"`, Conversion: `"No sales"`
    - Item `336705060686` (`OP-260701-BUU4`): Impressions: 53/day, CTR: `"No clicks"`, Conversion: `"No sales"`
    - Item `336705097129` (`OP-260701-EN4B`): Impressions: 682/day, CTR: `0.0003309067` (0.033%), Conversion: `"No sales"`
    - Item `336705067081` (`OP-260701-9EUB`): Impressions: 54/day, CTR: `"No clicks"`, Conversion: `"No sales"`
    - Item `336796769215` (`OP-260727-ZD24`): Impressions: 520/day, CTR: `0.001548563` (0.155%), Conversion: `"No sales"`
  - `Bats` (4 listings):
    - Item `336727951624`: Impressions: 584/day, CTR: `0.0008285462` (0.083%), Conversion: `"No sales"`
    - Item `336728213166` (`OP-260701-6U9Y`): Impressions: 74/day, CTR: `0.0008624407` (0.086%), Conversion: `"No sales"`
  - `Basketball-NBA>Jerseys` (3 listings):
    - Item `336679170464` (`OP-260701-2QXN`): Impressions: 34/day, CTR: `0.009259259` (0.926%), Conversion: `"No sales"`
    - Item `336816288839`: Impressions: 75/day, CTR: `0.003051882` (0.305%), Conversion: `"No sales"`
- **Format Invariants from eBay:**
  1. eBay represents Click-Through Rate as a decimal fraction (ratio between 0.0000 and 1.0000, e.g. `0.0003309` for 0.033%) or string `"No clicks"` when views/clicks equal 0.
  2. eBay represents Sales Conversion Rate as a decimal fraction or string `"No sales"` when units sold equal 0.
  3. Realistic CTR for active eBay sports memorabilia listings hovers between 0.03% and 0.93% (never exceeding single-digit percentages under normal retail conditions).

---

## 3. Architecture & API Protocol Audit

### 3.1 eBay Sell Analytics API Constraints
- **Dimension Protocol Rule:**
  - In `GET /sell/analytics/v1/traffic_report`, `dimension=DAY` can ONLY be queried at the marketplace or account level without `listing_ids`.
  - When filtering by `listing_ids:{...}`, eBay strictly requires `dimension=LISTING`. Passing `listing_ids` with `dimension=DAY` produces HTTP 400 Bad Request.
  - Consequently, querying eBay for a specific listing returns a single aggregated record summarizing the entire date range (total impressions, total views, range CTR, range conversion rate), rather than 30 separate daily observations.
- **Filter Nesting:**
  - `filter=marketplace_ids:{EBAY_US},listing_ids:{${idListParam}},date_range:[${startYMD}..${endYMD}]`
  - Correctly implemented and properly URL-encoded.
- **Timezone & Reporting Lag:**
  - Pacific Time (`America/Los_Angeles`) boundaries ending yesterday T-1 (`getPacificYMD(1)`) are correctly enforced, preventing error 50018.

---

## 4. Discrepancies Found & Root Cause Analysis

### Discrepancy 1: Double Percentage Multiplication (The 909.0% Bug)
- **Location:** `outpost/functions/api/ebay/analytics.js` (lines 608-617) vs `outpost/src/components/edit/EditTabPerformance.jsx` (lines 308-354).
- **Root Cause:**
  1. In `ingestListingTraffic`:
     `const dayCtr = dayImp > 0 ? parseFloat(((dayViews / dayImp) * 100).toFixed(2)) : 0;`
     Here, `dayCtr` is stored in SQLite table `listing_traffic` as a pre-scaled percentage: `9.09` (meaning 9.09%).
  2. In `ConversionAndCtrChart`:
     The component expects decimal fractions:
     `const maxRate = Math.max(Math.max(...ctrSeries, 0), Math.max(...conversionSeries, 0), 0.05);`
     `const pctLabel = `${(ratio * maxRate * 100).toFixed(1)}%`;`
     Because `ctrSeries` contained `9.09`, `maxRate` evaluated to `9.09`.
     Multiplying `ratio * maxRate * 100` resulted in `1.0 * 9.09 * 100 = 909.0%` on the top axis guide and `454.5%` on the middle guide.
  3. In `MiniSparkline` (line 797):
     `<MiniSparkline data={(analytics.ctr_series || []).map(v => v * 100)} color="#a855f7" />`
     Multiplying `v * 100` on an already multiplied percentage transformed `9.09` into `909`.
  4. In SVG Tooltip (line 391):
     `<title>{`${d}: CTR ${(ctr * 100).toFixed(2)}%`}</title>`
     Rendered `CTR 909.00%`.

### Discrepancy 2: Unit Inconsistency between `parseEbayDailyTraffic` and `ingestListingTraffic`
- `parseEbayDailyTraffic` (line 310) stores `clickThroughRate: ctr > 0 ? parseFloat((ctr / 100).toFixed(4)) : 0.0` (decimal fraction between 0.0000 and 1.0000).
- `ingestListingTraffic` (line 608) stores `dayCtr = parseFloat(((dayViews / dayImp) * 100).toFixed(2))` (percentage between 0.0 and 100.0).
- This internal schema inconsistency leads to erratic behavior depending on whether data originated from mock/daily endpoints or range ingestion.

### Discrepancy 3: Units Sold Calculation Error in `onRequestGet`
- In `analytics.js` line 880:
  `totalUnitsSold += Math.round(conv * pv);`
  If `conv` is stored as a percentage (e.g. `5.0`), `Math.round(5.0 * pv)` inflates units sold by a factor of 100x.
  `conv` must strictly be a decimal fraction (e.g. `0.05`).

### Discrepancy 4: Artificial Remainder Allocation (The 9-Day Step Function)
- In `ingestListingTraffic` lines 596-607:
  `const baseViews = Math.floor(totalViews / n);`
  `const remViews = totalViews % n;`
  `const isRecentViews = i >= (n - remViews);`
  `const dayViews = baseViews + (isRecentViews ? 1 : 0);`
- For an item with 9 total views over 30 days, `remViews` equals 9. The formula assigns 0 views to days 0 through 20 (09-25 to 10-15), and clusters all 9 views into the final 9 days (10-16 to 10-24).
- This creates an artificial step function where CTR sits at 0.0% for 3 weeks and abruptly surges on day 21.

### Discrepancy 5: Missing `TOTAL_IMPRESSION_TOTAL` in Traffic Query
- `analytics.js` requests `LISTING_IMPRESSION_TOTAL` (which only counts Search Results and Store impressions).
- In contrast, eBay Seller Hub displays `TOTAL_IMPRESSION_TOTAL` (which includes category browse, related item recommendation carousels, and off-eBay views).
- Adding `TOTAL_IMPRESSION_TOTAL` to the query metrics allows Outpost to capture overall impressions consistent with Seller Hub.

---

## 5. Proposed Remediation Plan & Targeted Deltas

### Phase 1: Backend Standardization (`outpost/functions/api/ebay/analytics.js`)
1. **Standardize Storage as Decimal Fractions:**
   - In `ingestListingTraffic`:
     ```javascript
     // Compute decimal fraction (e.g. 0.0909 instead of 9.09)
     const dayCtr = dayImp > 0 ? parseFloat((dayViews / dayImp).toFixed(4)) : 0.0;
     const dayConv = conv > 0 ? parseFloat((conv / 100).toFixed(4)) : 0.0;
     ```
   - Store `dayCtr` and `dayConv` in `listing_traffic` as decimal fractions (0.0000 to 1.0000).
2. **Smooth Remainder Distribution:**
   - Instead of clustering all remainder views into the most recent N days (`i >= n - remViews`), distribute remainder views evenly across the period or proportionally to daily impressions so synthetic traffic resembles realistic distribution.
3. **Fix Units Sold Accumulation in `onRequestGet`:**
   - Ensure conversion multiplication uses decimal fraction:
     ```javascript
     const convFraction = conv > 1.0 ? conv / 100 : conv;
     totalUnitsSold += Math.round(convFraction * pv);
     ```
4. **Normalize API Response Format:**
   - `ctr_series`: Array of decimal fractions (e.g. `[0.0, ..., 0.0909]`).
   - `conversion_series`: Array of decimal fractions (e.g. `[0.0, ..., 0.0]`).
   - `click_through_rate`: Overall summary percentage for KPI card (e.g. `9.09`).
   - `sales_conversion_rate`: Overall summary percentage for KPI card (e.g. `0.00`).
5. **Database Cache Auto-Correction:**
   - When serving `onRequestGet`, if existing cached rows have `click_through_rate > 1.0` (indicating legacy pre-scaled rows), divide by 100 dynamically so sellers see corrected metrics immediately without requiring manual database flushes.

### Phase 2: Frontend Defense (`outpost/src/components/edit/EditTabPerformance.jsx`)
1. **Defensive Scaling in `ConversionAndCtrChart`:**
   - Normalize series values defensively:
     ```javascript
     const normalizedCtrSeries = (ctrSeries || []).map(v => (v > 1.0 ? v / 100 : v));
     const normalizedConvSeries = (conversionSeries || []).map(v => (v > 1.0 ? v / 100 : v));
     ```
   - Guarantees `maxRate` never balloons to 9.09, keeping the Y-axis scaled to realistic retail percentages (e.g. `0.0%` to `5.0%` or `10.0%`).
2. **Sparkline Input Alignment:**
   - In KPI cards:
     ```javascript
     <MiniSparkline data={(analytics.ctr_series || []).map(v => (v > 1.0 ? v : v * 100))} color="#a855f7" />
     <MiniSparkline data={(analytics.conversion_series || []).map(v => (v > 1.0 ? v : v * 100))} color="#10b981" />
     ```

### Phase 3: Unit Testing & Verification (`outpost/tests/t07-ebay-analytics-real-traffic.test.js`)
1. Verify `ingestListingTraffic` writes decimal fractions (`< 1.0`) to `listing_traffic`.
2. Verify `onRequestGet` returns decimal fraction arrays for `ctr_series` and `conversion_series`.
3. Verify `ConversionAndCtrChart` guide tick labels display accurate percentages (e.g. `0.0%` to `5.0%`, never `909.0%`).
4. Run regression test suite: `node --test tests/t07-ebay-analytics-real-traffic.test.js`.

---

## 6. Pre-Flight Checklist Before Code Modification
- [x] Review screenshot `image_15261b.png` and isolate visual rendering bugs.
- [x] Parse Excel spreadsheet `Listing quality report for tt_globetrotter - US - 10_23_2026 07-38 PST.xlsx` across all 11 sheets.
- [x] Audit Outpost frontend components (`EditTabPerformance.jsx`, `EditItemModal.jsx`).
- [x] Audit Cloudflare Worker backend logic (`functions/api/ebay/analytics.js`, `src/worker.js`).
- [x] Cross-reference eBay Sell Analytics API documentation and protocol rules.
- [x] Verify zero TypeScript and zero em dash compliance.
- [x] Plan saved to disk. Awaiting explicit user approval before editing code.
