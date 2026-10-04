# Sprig Bourbon Sommelier - State Architecture and Caching Engine

## 1. Overview of State Architecture

Bourbon Sommelier utilizes an in-memory client state architecture combined with edge proxy caching. Rather than reading and writing relational database rows for every catalog inspection, the application loads the complete catalog into a client-side memory cache on initial boot. Subsequent sorting, filtering, and tab transitions execute synchronously in browser memory with zero network latency.

## 2. Client-Side State Management (React useReducer)

Application state is centralized in [bourbon/src/context/BourbonContext.jsx](file:///e:/TechTrekGT/bourbon/src/context/BourbonContext.jsx) using a predictable state reducer:

- State Schema (INITIAL_STATE):
  - data: Array of parsed, enriched bourbon objects.
  - headers: Extracted column headers from the spreadsheet.
  - loading: Boolean indicating whether an active data fetch is in progress.
  - error: Error message string if data retrieval fails across all tiers.
  - lastUpdated: ISO timestamp or string reflecting the last successful catalog sync.
  - dataSource: Origin indicator tracking whether active data stems from live, cache, or seed sources.
  - searchQuery: Active text search query string.
  - activeTab: Current navigation screen (radar, explorer, search, sommelier).
  - sortBy: Current sort field (valueScore, sprigPrice, fairPrice, name, msrp).
  - sortDir: Sort direction (asc or desc).
  - filterTier: Selected valuation tier filter (all, unicorn, strong, fair, weak).
  - filterPrice: Selected price bracket filter (all, under15, 15to25, over25).
  - maxPrice: Explicit numeric price cap or null.
  - filterType: Whiskey category filter (all, wheated, rye, barrel proof, single barrel, bond).
  - filterDistillery: Selected distillery filter or all.
  - selectedBourbon: Currently active bottle object displayed in the detail modal, or null.

- Reducer Actions:
  - FETCH_START: Sets loading true and resets previous errors.
  - FETCH_SUCCESS: Populates data, headers, lastUpdated, and dataSource from the sync engine.
  - FETCH_ERROR: Populates error message while terminating the loading state.
  - SET_SEARCH: Updates the active search query.
  - SET_TAB: Switches the active display screen.
  - SET_SORT: Updates the sort column and toggles ascending/descending order.
  - SET_FILTER: Updates arbitrary attribute filter keys (tier, price bracket, type, distillery).
  - SET_MAX_PRICE: Sets an explicit numeric ceiling while resetting bracket filters.
  - CLEAR_FILTERS: Resets all filters and search queries back to their default states.
  - SELECT_BOURBON: Sets or clears the active bottle selection.

## 3. Catalog Memory Cache and Client-Side Memoization

Holding the catalog in client memory enables instantaneous responsive interactions:

- Zero Network Round-Trips: Filtering 100+ bottles by category or adjusting the maximum price slider does not issue network fetch requests.
- Client-Side Memoization: Screen components utilize useMemo to compute filtered, sorted sub-arrays derived from state.data, guaranteeing 60fps rendering during continuous slider adjustments.
- Detail Modal Cache: Clicking any bottle in the Explorer or Radar screens immediately mounts the bottle detail view with zero loading spinners, as the complete record already resides in memory.

## 4. Edge Proxy Caching (Cloudflare Cache API)

The Cloudflare Worker in [bourbon/src/worker.js](file:///e:/TechTrekGT/bourbon/src/worker.js) provides a transient caching layer at the edge:

- Cache Storage: Utilizes the Cloudflare Cache API (caches.default).
- Cache Key: Evaluated using a GET Request to the upstream Google Sheet CSV URL.
- TTL Configuration: Cache-Control: public, max-age=300, s-maxage=300 enforces a 5-minute time-to-live.
- Background Refresh: Once the 5-minute cache period expires, the next user request to /api/bourbon/data fetches a fresh CSV from Google Sheets and repopulates the edge cache.

## 5. Persistence Fallback and Relational Baseline Alignment

Bourbon Sommelier maintains a resilient relationship with the platform data layer:

- Static Seed Resilience: If both live Google Sheets and the worker cache proxy are unavailable, [bourbon/src/data/seedData.js](file:///e:/TechTrekGT/bourbon/src/data/seedData.js) serves as the persistent catalog anchor.
- D1 Database Alignment: Although [bourbon/wrangler.jsonc](file:///e:/TechTrekGT/bourbon/wrangler.jsonc) configures personal-budget-db as env.DB to maintain platform uniformity, Bourbon avoids unnecessary database reads and writes, keeping edge memory consumption minimal.
