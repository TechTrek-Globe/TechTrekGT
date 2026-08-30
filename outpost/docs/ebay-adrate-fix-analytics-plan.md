# eBay Ad Rate Fix & Listing Performance Analytics - Implementation Plan

> Outpost Tracker (`e:/TechTrekGT/outpost`) | Authored: 2026-08-30

---

## 1. Executive Summary

Two discrete problems are addressed in this plan:

1. **Bug Fix:** The Promoted Listing Ad Rate (`ebay_promoted_rate` / `boost_pct`) frequently syncs as `0%` or `null` despite the listing being enrolled in a Promoted Listings Standard campaign on eBay.
2. **Feature:** Ingestion of eBay Sell Analytics API traffic data (impressions, page views, CTR, conversion rate) with a new "Performance & Traffic" tab in `EditItemModal`, including SVG time-series charts.

---

## 2. Root Cause Analysis - 0% Promoted Listing Ad Rate

### 2.1 Code Path Review

The ad rate sync flows through:

```
EditItemModal.handleSyncWithEbay()
  -> syncEbayItem() [src/utils/auctionApi.js]
     -> POST /api/ebay/sync-item [functions/api/ebay/sync-item.js]
        -> fetchSingleEbayListing() [functions/api/ebay/tokenHelper.js:395]
           -> Trading API GetItem (XML) - checks for <BidPercentage>, <AdRate>, <PromotedRate>, <AdPercentage>
           -> Marketing API /sell/marketing/v1/ad_campaign - loops campaigns -> ads -> bidPercentage
```

### 2.2 Identified Root Causes

#### Root Cause A: Incorrect Marketing API Ad Endpoint URL (PRIMARY)

In `tokenHelper.js` line 642, the per-listing ad query uses:

```
/sell/marketing/v1/ad_campaign/{campaignId}/ad?listing_ids={cleanId}
```

**This parameter name is wrong.** The correct eBay Promoted Listings Standard (PLS) endpoint uses the singular form:

```
GET /sell/marketing/v1/ad_campaign/{campaignId}/ad?listing_id={cleanId}
```

The parameter must be `listing_id` (singular), NOT `listing_ids` (plural). This causes all per-listing ad queries at line 642 to return a 404 or empty-ads response, causing the loop to fall through to the less-reliable campaign-level `fundingStrategy.bidPercentage` fallback.

The **second fallback** at line 663 (the "check all ads" call without `listing_id` filter) does work, but it iterates all 100 ads and relies on `find(a => String(a.listingId) === cleanId)`. This fails silently if the campaign has more than 100 ads, or if `listingId` in the ad object does not match the 12-digit `cleanId` format exactly.

#### Root Cause B: Campaign Funding Strategy Fallback is Insufficient

The `fundingStrategy.bidPercentage` fallback (lines 682-697) applies the campaign-level default ad rate to ALL listings in a campaign. This is incorrect when:
- A campaign uses Promoted Listings Standard with per-listing bid overrides.
- The campaign uses a dynamic `COST_PER_CLICK` funding model (which has no `bidPercentage`).
- The listing was recently removed from a campaign.

#### Root Cause C: `sync-all.js` Never Fetches Ad Rates

`sync-all.js` calls `fetchEbayActiveSellerListings()` which uses the Trading API's `GetMyeBaySelling`. This endpoint **does not return Promoted Listing rates** in any `<Item>` block. At sync-all time, `boost_pct` is derived only from the existing `item.ebay_promoted_rate` value in D1 (line 52). If `ebay_promoted_rate` was wrong from a prior sync, it stays wrong across all future bulk syncs.

#### Root Cause D: `boost_pct` vs `ebay_promoted_rate` Fallback Order in `sync-item.js`

In `sync-item.js` lines 55-59, the resolution order is:
1. `liveListing.promoted_rate` (from `fetchSingleEbayListing`) - **fails due to Root Cause A**
2. `body.ebay_promoted_rate` (user-submitted override from the UI)
3. `item.ebay_promoted_rate` (current value in D1)
4. Default `0`

If the Marketing API call fails silently (no exception, just returns `null`), the code falls back to the D1 value - which may also be `0` or `null` for a newly linked listing. The result: `promotedRate = 0`, `boostPct = 0`, and the fee engine calculates no promoted listing fee.

### 2.3 Fix Strategy

| Fix | File | Change |
|-----|------|--------|
| F-1 | `tokenHelper.js` | Fix query param: `listing_ids=` -> `listing_id=` on line ~642 |
| F-2 | `tokenHelper.js` | Fix the 100-ad fallback: use `limit=200` and match on `String(a.listingId) === cleanId` with `.includes()` guard |
| F-3 | `tokenHelper.js` | Add `promoted_rate_source: 'ad_level' | 'campaign_default' | null` field to the return object |
| F-4 | `sync-all.js` | After bulk listing fetch, call `fetchSingleEbayListing()` for items where `ebay_promoted_rate` is `0` or `null` (cap at 30 individual API calls per bulk sync run) |

---

## 3. eBay Analytics API Integration

### 3.1 Available eBay Analytics Endpoints

The eBay **Sell Analytics API** (`/sell/analytics/v1/`) provides traffic and performance data:

| Endpoint | Data Returned | Granularity |
|----------|---------------|-------------|
| `GET /sell/analytics/v1/traffic_report` | Impressions (total + promoted), page views, CTR, sales conversion rate | Daily, weekly, monthly |
| `GET /sell/analytics/v1/seller_standards_profile` | Seller-level performance tier | Evaluation period |

**Required OAuth scope:** `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly`

> [!IMPORTANT]
> The `sell.analytics.readonly` scope must be added to the eBay OAuth authorization flow. Users who connected before this feature launches will need to **re-authorize** their eBay account to grant the new scope. A re-auth prompt must appear in both the Performance tab and Settings > eBay Integration.

### 3.2 Traffic Report Request Format

```
GET https://api.ebay.com/sell/analytics/v1/traffic_report
  ?dimension=DAY
  &metric=IMPRESSION_TOTAL,IMPRESSION_PROMOTED,PAGE_VIEW_ITEM_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE
  &filter=listing_ids:{listingId}
  &date_range:[2026-06-01..2026-08-30]
```

Response shape (abbreviated):
```json
{
  "dimensionNodes": [ { "dimensionKey": "DAY", "name": "2026-08-01" } ],
  "metricData": [
    { "metricKey": "IMPRESSION_TOTAL", "data": [ { "value": "482" } ] },
    { "metricKey": "PAGE_VIEW_ITEM_TOTAL", "data": [ { "value": "31" } ] },
    { "metricKey": "CLICK_THROUGH_RATE", "data": [ { "value": "0.0642" } ] },
    { "metricKey": "SALES_CONVERSION_RATE", "data": [ { "value": "0.0323" } ] }
  ]
}
```

### 3.3 Caching Strategy

- Traffic data is fetched on-demand per listing when the user opens the Performance tab.
- Results are cached in D1 (`auction_item_analytics` table) with a `fetched_at` timestamp.
- Cache TTL: **12 hours**. If `fetched_at` is within 12 hours and range matches, serve cached data.
- A manual "Refresh" button always bypasses the cache.
- Worker returns a `cached: true | false` flag so the UI shows a "last updated" timestamp.

---

## 4. Schema Migrations (Phase 5)

All migrations are additive. They are appended to `auction-schema.sql` under a `-- PHASE 5` block.

### 4.1 New Table: `auction_item_analytics`

```sql
-- P5-1: Listing performance analytics (eBay Sell Analytics API traffic data)
CREATE TABLE IF NOT EXISTS auction_item_analytics (
  id                      TEXT PRIMARY KEY,
  item_id                 TEXT NOT NULL,
  user_id                 TEXT NOT NULL,
  ebay_listing_id         TEXT NOT NULL,
  period_start            TEXT NOT NULL,
  period_end              TEXT NOT NULL,
  granularity             TEXT NOT NULL DEFAULT 'DAY',
  range_days              INTEGER NOT NULL DEFAULT 30,
  total_impressions       INTEGER DEFAULT 0,
  promoted_impressions    INTEGER DEFAULT 0,
  organic_impressions     INTEGER DEFAULT 0,
  total_page_views        INTEGER DEFAULT 0,
  click_through_rate      REAL DEFAULT 0.0,
  sales_conversion_rate   REAL DEFAULT 0.0,
  dates_json              TEXT,
  impressions_json        TEXT,
  promoted_impressions_json TEXT,
  page_views_json         TEXT,
  ctr_json                TEXT,
  conversion_json         TEXT,
  raw_response            TEXT,
  fetched_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES auction_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_analytics_item ON auction_item_analytics(item_id, range_days);
CREATE INDEX IF NOT EXISTS idx_analytics_ebay  ON auction_item_analytics(ebay_listing_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user  ON auction_item_analytics(user_id);
```

### 4.2 Column Additions: `auction_items`

```sql
-- P5-2: KPI snapshot columns for quick dashboard access
ALTER TABLE auction_items ADD COLUMN analytics_fetched_at TEXT;
ALTER TABLE auction_items ADD COLUMN total_impressions_30d INTEGER DEFAULT 0;
ALTER TABLE auction_items ADD COLUMN total_page_views_30d  INTEGER DEFAULT 0;
ALTER TABLE auction_items ADD COLUMN avg_ctr_30d           REAL    DEFAULT 0.0;
ALTER TABLE auction_items ADD COLUMN avg_conversion_30d    REAL    DEFAULT 0.0;
```

---

## 5. Backend Endpoint

### 5.1 New File: `functions/api/ebay/analytics.js`

**Route:** `GET /api/ebay/analytics?item_id={id}&range=30|60|90&force=true|false`

**Handler Logic:**
1. `requireAuth` / `withAuth` guard.
2. Fetch item from D1; verify ownership + `ebay_listing_id` is set.
3. Check `auction_item_analytics` cache (match `item_id` + `range_days`). If `fetched_at` within 12 hours and `force` param is not `true`, return cached data.
4. Call `getEbayUserToken()` from `tokenHelper.js`.
5. Check `ebay_oauth_tokens.scopes` for `sell.analytics.readonly`. If absent, return `{ needsReauth: true, error: 'Analytics scope not granted' }` with HTTP 403.
6. Build `period_start` / `period_end` from `range` param (today minus N days).
7. `GET /sell/analytics/v1/traffic_report` with metrics: `IMPRESSION_TOTAL,IMPRESSION_PROMOTED,PAGE_VIEW_ITEM_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE`.
8. Parse `dimensionNodes` (dates array) and `metricData` arrays into parallel JSON arrays.
9. Compute aggregate totals and averages.
10. Upsert into `auction_item_analytics` (delete old row for same `item_id` + `range_days`, insert new).
11. Update snapshot columns on `auction_items`.
12. Return structured analytics object.

### 5.2 Route Registration in `src/worker.js`

Add import and dispatch for `GET /api/ebay/analytics`:

```js
// Inside the existing ebay route block in worker.js:
if (path === '/api/ebay/analytics') {
  const { onRequestGet } = await import('../functions/api/ebay/analytics.js');
  return onRequestGet({ request, env, ctx });
}
```

---

## 6. Frontend UI Architecture

### 6.1 New Tab: `'performance'`

Added to `TABS` array in `EditTabNav.jsx`:

```js
{ id: 'performance', label: 'Performance & Traffic', icon: BarChart2 }
```

Badge condition:
```js
const showPerfDot = tab.id === 'performance' && Boolean(form.analytics_fetched_at);
```

### 6.2 New Component: `src/components/edit/EditTabPerformance.jsx`

**Props:**
```jsx
<EditTabPerformance
  item={item}
  form={form}
  analytics={analytics}
  loadingAnalytics={bool}
  analyticsError={string}
  analyticsRange={30|60|90}
  setAnalyticsRange={fn}
  onFetchAnalytics={fn}
/>
```

**Layout Sections:**

**A. Header Bar**
- Range toggle pills: `30d | 60d | 90d`
- "Load / Refresh Data" button
- "Last updated: X hours ago" caption
- Re-auth warning banner (when `analytics?.needsReauth === true`)

**B. KPI Cards (4-up grid)**

| Card | Field | Color |
|------|-------|-------|
| Total Impressions | `analytics.total_impressions` | Amber |
| Page Views | `analytics.total_page_views` | Blue |
| Avg CTR | `analytics.click_through_rate` as `X.XX%` | Purple |
| Conversion Rate | `analytics.sales_conversion_rate` as `X.XX%` | Emerald |

Each card includes an embedded `<MiniSparkline>` SVG showing the last 14 days of data.

**C. Chart 1: Impressions Overview (Stacked Bars + Page View Line)**
- Stacked bars: amber (promoted impressions) + slate-700 (organic impressions)
- Blue `<polyline>` overlay for page views (right-axis scaled)
- Date labels on X-axis (every 7 days for 30d range, every 14 days for 60/90d)
- SVG `viewBox="0 0 800 220"` with `preserveAspectRatio="none"`

**D. Chart 2: CTR vs Conversion Rate (Dual Line)**
- Purple `<polyline>` for CTR
- Emerald `<polyline>` for conversion rate
- Dashed `<line>` markers at the period averages
- Y-axis labeled in `%`

**SVG Chart Implementation Approach:**
- All charts are pure SVG - no external library dependency.
- A shared internal `buildPath(dataArray, width, height, maxVal)` function maps values to SVG coordinates.
- Hover tooltips: native SVG `<title>` elements on bar rects and polyline segments.
- Responsive: charts use `width="100%"` with a fixed `viewBox`.

**E. Performance Summary Text**
- Auto-generated contextual summary (e.g., "Your CTR of 6.4% exceeds the eBay average of ~3% for this category, indicating strong title and image quality.")
- "View in eBay Seller Hub" external link

### 6.3 State Additions in `EditItemModal.jsx`

```js
const [analytics, setAnalytics] = useState(null);
const [loadingAnalytics, setLoadingAnalytics] = useState(false);
const [analyticsError, setAnalyticsError] = useState('');
const [analyticsRange, setAnalyticsRange] = useState(30);

const fetchAnalytics = async (forceRefresh = false) => {
  if (!item?.id || !form.ebay_listing_id) return;
  setLoadingAnalytics(true);
  setAnalyticsError('');
  try {
    const url = `/api/ebay/analytics?item_id=${item.id}&range=${analyticsRange}${forceRefresh ? '&force=true' : ''}`;
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analytics fetch failed');
    setAnalytics(data);
  } catch (e) {
    setAnalyticsError(e.message);
  } finally {
    setLoadingAnalytics(false);
  }
};
```

Analytics state is reset to `null` on item change inside the existing `useEffect([item])`.

When `activeTab === 'performance'` changes to `'performance'` and `analytics === null` and `form.ebay_listing_id` is set, auto-trigger `fetchAnalytics()` (serve cache if fresh).

---

## 7. Step-by-Step File Modification List

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `auction-schema.sql` | MODIFY | Add Phase 5 block: `auction_item_analytics` table + `auction_items` snapshot columns |
| 2 | `functions/api/ebay/tokenHelper.js` | MODIFY | Fix `listing_ids` -> `listing_id` bug; increase ad page limit; annotate `promoted_rate_source` |
| 3 | `functions/api/ebay/sync-all.js` | MODIFY | Per-item promoted rate fetch for 0%/null items (capped at 30 calls) |
| 4 | `functions/api/ebay/analytics.js` | NEW | Analytics worker endpoint with cache + eBay Sell Analytics API integration |
| 5 | `src/worker.js` | MODIFY | Register `GET /api/ebay/analytics` route |
| 6 | `src/components/edit/EditTabNav.jsx` | MODIFY | Add `performance` tab + `BarChart2` icon + badge condition |
| 7 | `src/components/edit/EditTabPerformance.jsx` | NEW | Performance tab component with KPI cards + SVG charts |
| 8 | `src/components/EditItemModal.jsx` | MODIFY | Analytics state, fetchAnalytics, tab render, reset on item change |
| 9 | `src/components/SettingsView.jsx` | MODIFY | Add `sell.analytics.readonly` scope to eBay OAuth flow + re-auth detection banner |

---

## 8. eBay API Scope Requirements

| Scope | Purpose | Grant Type |
|-------|---------|-----------|
| `sell.inventory.readonly` | Read active listing data | ACG User Token |
| `sell.marketing.readonly` | Read Promoted Listings campaigns + ad rates | ACG User Token |
| `sell.analytics.readonly` | Traffic/performance metrics - **NEW** | ACG User Token |
| `sell.finances` | Finances API fee reconciliation | ACG User Token |

---

## 9. Component Hierarchy

```
EditItemModal
  |- EditModalHeader
  |- EditTabNav         [details | listing_pricing | comps | performance (NEW)]
  |- Tab Panel (switch on activeTab)
  |    |- EditTabDetails
  |    |- EditTabListingPricing -> LiveFeeReadout
  |    |- EditTabComps
  |    |- EditTabPerformance (NEW)
  |         |- Header + Range Pills + Refresh Button
  |         |- Re-auth Banner (conditional)
  |         |- KPI Cards (x4) + MiniSparkline (SVG)
  |         |- TrafficBarChart (pure SVG stacked bars + page view line)
  |         |- DualLineChart (pure SVG CTR vs conversion)
  |         |- PerformanceSummaryPanel + eBay Seller Hub link
  |- EditModalFooter
```

---

## 10. Open Questions for User Review

> [!IMPORTANT]
> **Q1 - Re-Auth Scope UX:** When `sell.analytics.readonly` scope is missing, should the re-auth prompt appear only in the Performance tab, or also as a persistent banner in Settings > eBay Integration? **Recommendation:** both locations.

> [!IMPORTANT]
> **Q2 - Analytics Cache TTL:** 12-hour cache is proposed. Should a manual "Force Refresh" button always be available regardless of TTL? **Recommendation:** yes, include a Refresh button that sets `force=true`.

> [!NOTE]
> **Q3 - sync-all.js API Call Cap:** The plan caps per-item Marketing API calls during bulk sync at 30 per run to avoid hitting rate limits. Is 30 appropriate, or should the cap be user-configurable?

> [!NOTE]
> **Q4 - Impressions Stacking:** Should promoted vs. organic impressions be shown as stacked bars, or as two separate grouped bars? **Recommendation:** stacked (amber = promoted on top, slate = organic base).

> [!CAUTION]
> **Q5 - Existing User Re-Auth:** All users who connected their eBay account before this update must disconnect and reconnect to grant `sell.analytics.readonly`. Confirm this one-time friction is acceptable before implementing.

> [!NOTE]
> **Q6 - Inventory Hub Column:** Should the 30-day impression/page-view snapshot columns (`total_impressions_30d`, `total_page_views_30d`) be surfaced in the `InventoryHubView` table as optional columns? This would give at-a-glance traffic health across the whole catalog without opening each item.
