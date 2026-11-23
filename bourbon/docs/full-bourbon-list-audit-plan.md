# Bourbon Sommelier - Full Bourbon List Consistency Audit & Fix Plan

## 1. Canonical Source of Truth

The canonical dataset for the TechTrekGT Bourbon Sommelier (`bourbon/`) application is the live Sprig Google Sheet CSV feed (`SHEET_ID: 1XfZCAILlqCNuPkpAJ3alZc8XOBMFu4M24dH-mTrhlrA`, tab `Sheet1`), fetched and normalized by [sheetService.js](file:///e:/TechTrekGT/bourbon/src/data/sheetService.js) (`fetchBourbonData()`) and held in `state.data` inside [BourbonContext.jsx](file:///e:/TechTrekGT/bourbon/src/context/BourbonContext.jsx):

1. **Tier 1 (Direct Live Fetch)**: Client `fetch()` to `https://docs.google.com/spreadsheets/d/1XfZCAILlqCNuPkpAJ3alZc8XOBMFu4M24dH-mTrhlrA/gviz/tq?tqx=out:csv&sheet=Sheet1` with an 8-second `AbortController` timeout.
2. **Tier 2 (Worker Edge Cache Proxy)**: Fallback fetch to the Cloudflare Worker (`techtrek-bourbon` in [worker.js](file:///e:/TechTrekGT/bourbon/src/worker.js)), which caches the upstream CSV for 300 seconds in `caches.default`.
3. **Tier 3 (Static Seed Fallback)**: `SEED_BOURBONS` in [seedData.js](file:///e:/TechTrekGT/bourbon/src/data/seedData.js) (22 hardcoded bottles), intended strictly for offline/outage resilience.

Bourbon maintains zero tables in Cloudflare D1 (`personal-budget-db` is bound in `wrangler.jsonc` only for platform symmetry).

---

## 2. Audit Findings: Why the Full Bourbon List Is Not Used Consistently

### 2.1 Broken Tier 2 Worker Proxy URL (Causes Silent Fallback to 22-Bottle Seed Data)
- **File**: `e:/TechTrekGT/bourbon/src/data/sheetService.js` (line 274)
- **Issue**: Tier 2 calls `fetch('/api/bourbon/data', { cache: 'no-cache' })`. Because the app is mounted under `/bourbon/` (`vite.config.js` line 6: `base: '/bourbon/'`; `wrangler.jsonc` lines 16-24), a root-relative `/api/bourbon/data` request bypasses `techtrek-bourbon` and routes to `techtrek-landing`, returning HTTP 404. Whenever Tier 1 direct Google Sheets fetch fails (CORS, network timeout, mobile), Tier 2 fails and the app silently drops to the 22-item `SEED_BOURBONS` subset.
- **Surgical Fix**: Update line 274 to `${import.meta.env.BASE_URL}api/bourbon/data` (which resolves to `/bourbon/api/bourbon/data` in both dev and production).

### 2.2 Sync Source Telemetry Mismatch in Header
- **File**: `e:/TechTrekGT/bourbon/src/App.jsx` (line 89)
- **Issue**: Checks `dataSource === 'live'` and `dataSource === 'cache'`, whereas `sheetService.js` returns `source: 'google-sheet'`, `'worker-proxy'`, or `'seed-catalog'`. The UI always displays `Static Seed` even when the full live sheet is loaded.
- **Surgical Fix**: Update line 89 to check `dataSource === 'google-sheet'` and `dataSource === 'worker-proxy'`.

### 2.3 Sommelier Screen Truncates Flavor Archetype Matches to 6 Pours
- **File**: `e:/TechTrekGT/bourbon/src/screens/SommelierScreen.jsx` (line 69)
- **Issue**: `profileRecommendations` filters `data`, sorts by `valueScore`, and appends `.slice(0, 6)`. Only 6 pours are rendered per archetype, and the Custom Tasting Flight Builder can only add pours from those 6 truncated cards (there is no full-catalog selector).
- **Surgical Fix**: Remove `.slice(0, 6)` on line 69 so all matching pours from `data` are rendered in `profileRecommendations` and available to add to the flight.

### 2.4 Sommelier Consultation Caps Results at 2-3 Pours & Uses Unsorted Unicorns
- **File**: `e:/TechTrekGT/bourbon/src/screens/SommelierScreen.jsx` (lines 108, 113, 118, 122, 132, 138)
- **Issue**:
  - Line 108 uses `[...unicorns].slice(0, 3)` in raw spreadsheet order rather than sorting by `valueScore` descending.
  - Lines 108, 113, 118, 122, 132, and 138 truncate `recommendedPours` to `.slice(0, 3)` or `.slice(0, 2)`, hiding the rest of the matching pours from `data`.
- **Surgical Fix**: Sort `unicorns` by `valueScore` descending (in `BourbonContext.jsx`), and remove the `.slice(0, 3)` / `.slice(0, 2)` caps on `recommendedPours` (keeping the summary text concise while listing all matched pours).

### 2.5 Radar Screen Slices Unsorted Unicorns & Undercounts Strong Values
- **File**: `e:/TechTrekGT/bourbon/src/context/BourbonContext.jsx` (line 179) & `e:/TechTrekGT/bourbon/src/screens/RadarScreen.jsx` (lines 26, 95)
- **Issue**:
  - `unicorns` in `BourbonContext.jsx` (line 179) is not sorted by `valueScore` descending, so `RadarScreen.jsx` line 26 (`unicorns.slice(0, 5)`) displays the first 5 unicorns in spreadsheet row order rather than the top 5 by `valueScore`.
  - `RadarScreen.jsx` line 95 computes `data.filter(b => b.tier === 'strong').length` inline instead of using `strongValues.length` from `BourbonContext.jsx` (line 180), which also accounts for `valueRating` starting with `'A'`.
- **Surgical Fix**: Sort `unicorns` by `(b.valueScore ?? -Infinity) - (a.valueScore ?? -Infinity)` in `BourbonContext.jsx` line 179, and use `strongValues.length` in `RadarScreen.jsx` line 95.

### 2.6 Hardcoded Style Filter Lists Omit Valid Sheet Categories
- **File**: `e:/TechTrekGT/bourbon/src/context/BourbonContext.jsx` (line 184) & `e:/TechTrekGT/bourbon/src/screens/ExplorerScreen.jsx` (line 343)
- **Issue**: `BourbonContext.jsx` hardcodes `types` to 6 strings and `ExplorerScreen.jsx` hardcodes 7 filter buttons, omitting `'Single Malt'`, `'Finished / Specialty'`, and `'Bourbon'` produced by `extractType()` in `sheetService.js`.
- **Surgical Fix**: Derive `types` dynamically from `state.data` in `BourbonContext.jsx` (matching how `distilleries` is derived on line 183) and consume `types` in `ExplorerScreen.jsx`.

### 2.7 Null-Check Bug on Seed Fallback in `BourbonDetail.jsx` and `BourbonCard.jsx`
- **File**: `e:/TechTrekGT/bourbon/src/components/BourbonDetail.jsx` (lines 171, 179, 187, 195) & `e:/TechTrekGT/bourbon/src/components/BourbonCard.jsx` (lines 202, 210, 218)
- **Issue**: Components guard numeric fields with `!== null` before calling `.toFixed(2)`. Records in `SEED_BOURBONS` (`seedData.js`) omit `fairPrice` and `rawCost` (`undefined`), so `undefined !== null` evaluates to `true` and `fairPrice.toFixed(2)` in `BourbonDetail.jsx` line 182 throws a `TypeError` crash.
- **Surgical Fix**: Guard with `!= null` (or `typeof val === 'number'`) in `BourbonDetail.jsx` and `BourbonCard.jsx`.

---

## 3. Verification & Deployment Plan (After Approval)

1. Apply surgical `replace_file_content` edits to:
   - `e:/TechTrekGT/bourbon/src/data/sheetService.js`
   - `e:/TechTrekGT/bourbon/src/App.jsx`
   - `e:/TechTrekGT/bourbon/src/context/BourbonContext.jsx`
   - `e:/TechTrekGT/bourbon/src/screens/RadarScreen.jsx`
   - `e:/TechTrekGT/bourbon/src/screens/ExplorerScreen.jsx`
   - `e:/TechTrekGT/bourbon/src/screens/SommelierScreen.jsx`
   - `e:/TechTrekGT/bourbon/src/components/BourbonCard.jsx`
   - `e:/TechTrekGT/bourbon/src/components/BourbonDetail.jsx`
2. Synchronize `e:/TechTrekGT/bourbon/docs/03_features.md` and `e:/TechTrekGT/bourbon/docs/04_state.md`.
3. Run `npm run build` and `npm run deploy` inside `e:\TechTrekGT\bourbon` via PowerShell and verify live deployment.
