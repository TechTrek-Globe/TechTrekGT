# TechTrek Wayfinder - Architecture Document

## 1. System Overview

**Wayfinder** is a curated digital expedition platform and travel intelligence engine deployed as an independent Cloudflare Worker at `techtrekgt.com/wayfinder/*`. It delivers deep-dive travel guides, holiday market intelligence, high-speed rail route planning, interactive currency conversions, and authenticated trip itinerary/document management.

The flagship expedition is **Poland: Winter Christmas Markets 2026**, covering Kraków, Wrocław, Poznań, Toruń, and Gdańsk.

```
+-----------------------------------------------------------------------------------+
|                                 Client Layer                                      |
|  React 19 (Pure JS/JSX) | Tailwind CSS 3.4 | Lucide Icons | Custom SPA Router     |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                            Cloudflare Worker Layer                                |
|  src/worker.js (ESM) | Security Headers (CSP/HSTS) | CORS | JWT WebCrypto Auth   |
+-----------------------------------------------------------------------------------+
                    |                                         |
                    v                                         v
+---------------------------------------+ +-----------------------------------------+
|        Static Asset Storage           | |           Data & API Layer              |
|  env.ASSETS (dist/client)             | |  Cloudflare D1 (personal-budget-db)     |
|  public/Poland-2026/images/           | |  External APIs: NBP, Foursquare, Geoapify|
+---------------------------------------+ +-----------------------------------------+
```

---

## 2. Frontend Architecture & Component Hierarchy

### 2.1 Provider & App Tree

The application is mounted at `src/main.jsx` with a three-layer React Context provider tree:

```jsx
<StrictMode>
  <AuthProvider>            {/* SSO Session & Auth Modal State */}
    <SettingsProvider>      {/* Currency (USD/PLN/EUR) & Exchange Rate Overrides */}
      <WayfinderProvider>  {/* Server-synced Journeys, Itinerary & Documents */}
        <App />             {/* Custom Router & Layout Controller */}
      </WayfinderProvider>
    </SettingsProvider>
  </AuthProvider>
</StrictMode>
```

### 2.2 Component Hierarchy & View Decomposition

```
<App>
├── <Layout>                                   # Global shell, navbar, breadcrumbs, header banner & footer
│   ├── <CurrencyConverterModal />            # Live currency conversion modal (USD/PLN/EUR)
│   ├── <SettingsModal />                     # User preferences & exchange rate customization
│   └── <Suspense fallback={<Loading />}>
│       ├── <WayfinderLanding />              # Path: /wayfinder (Platform overview & catalog)
│       ├── <PolandLanding />                 # Path: /wayfinder/poland-christmas-2026
│       ├── <RouteVisualization />            # Path: /wayfinder/poland-christmas-2026/route
│       ├── <MarketsPage />                   # Path: /wayfinder/poland-christmas-2026/markets
│       │   └── <CulinaryHighlightsSection /> # Journey-wide traditional food & drink guide
│       ├── <StaysAndFoodPage />              # Path: /wayfinder/poland-christmas-2026/stays-and-food
│       ├── <PracticalPage />                 # Path: /wayfinder/poland-christmas-2026/practical
│       ├── <CityPage>                        # Path: /wayfinder/poland-christmas-2026/cities/:cityId/:subPage
│       │   ├── <CityHeroImageCard />         # Top hero banner with city metadata
│       │   ├── <QuickReferenceBar />         # Dates, daylight, peak hours & mug deposit kaucja
│       │   ├── <CityOverviewTab />           # Overview, daylight stats, closures, practical info
│       │   ├── <CityHistoryTab />            # Timeline epochs, history stats & legends
│       │   ├── <CityAttractionsTab />        # Sights & must-see list
│       │   │   └── <MustSeeCard />           # Interactive attraction card with itinerary bookmarks
│       │   ├── <CityMarketsTab />            # Christmas market locations, chalets, dates & kaucja
│       │   ├── <CityFoodTab />               # Categorized dining guide
│       │   │   └── <DrillDownFilters />      # Multi-category pill filter buttons
│       │   ├── <CityHotelsTab />             # Base neighborhood zone & lodging guide
│       │   └── <CityLgbtqTab />              # Safety ratings, legal rights & vetted venues
│       └── <PrivateHub>                      # Path: /wayfinder/poland-christmas-2026/private*
│           ├── <ItineraryView />             # Chronological booking schedule with conflict check
│           └── <DocumentCenter />            # User travel documents & OCR import status
└── <AuthModal />                             # Multi-mode SSO modal (login, register, forgot-password)
```

---

## 3. Client-Side Routing Strategy

Wayfinder does NOT use `react-router-dom`. It implements a custom history-based router in `src/App.jsx` using `window.history.pushState` and `window.addEventListener('popstate', ...)`.

### 3.1 Route Mapping Matrix

| URL Path Pattern | Component | Code Splitting | Access |
|---|---|---|---|
| `/wayfinder` or `/` | `WayfinderLanding` | `React.lazy()` | Public |
| `/wayfinder/poland-christmas-2026` | `PolandLanding` | `React.lazy()` | Public |
| `/wayfinder/poland-christmas-2026/route` or `/rail` | `RouteVisualization` | `React.lazy()` | Public |
| `/wayfinder/poland-christmas-2026/markets` | `MarketsPage` | `React.lazy()` | Public |
| `/wayfinder/poland-christmas-2026/stays-and-food` | `StaysAndFoodPage` | `React.lazy()` | Public |
| `/wayfinder/poland-christmas-2026/practical` | `PracticalPage` | `React.lazy()` | Public |
| `/wayfinder/poland-christmas-2026/cities/:cityId/:subPage` | `CityPage` | `React.lazy()` | Public |
| `/wayfinder/poland-christmas-2026/private*` | `PrivateHub` | `React.lazy()` | Auth-gated |
| Any other `/wayfinder/*` | 404 Fallback View | Inline JSX | Public |

### 3.2 Dynamic City Sub-Page Aliasing

`CityPage.jsx` normalizes subpage URL segments into 7 canonical tab views:

```js
// Subpage alias normalization in CityPage.jsx
const ALIASES = {
  history: ['history', 'timeline', 'history-timeline', 'chronological'],
  attractions: ['attractions', 'sights', 'must-see', 'must-see-sights'],
  markets: ['markets', 'market', 'christmas-markets'],
  restaurants: ['restaurants', 'food', 'dining', 'top-restaurants', 'food-drink', 'drinks', 'bars', 'pubs', 'breweries'],
  hotels: ['hotels', 'hotel', 'stays', 'lodging', 'accommodations'],
  lgbtq: ['lgbtq', 'gay', 'queer', 'lgbt', 'lgbtq-guide'],
  overview: ['overview']
};
```

---

## 4. State Management & React Contexts

### 4.1 `AuthContext` (`src/context/AuthContext.jsx`)
- **State**: `user`, `isAuthenticated`, `loading`, `authModalOpen`, `authModalMode` (`login`, `register`, `forgot-password`, `security-question`).
- **Session Transport**: HttpOnly cookies with `credentials: 'include'`.
- **Endpoints**:
  - `GET /api/auth/me`: Session validation on app mount.
  - `POST /api/auth/login`: Authenticates credentials against D1 `users` table.
  - `POST /api/auth/register`: Creates new user with PBKDF2 salt/hash.
  - `POST /api/auth/logout`: Clears HttpOnly cookie.
  - `POST /api/auth/forgot-password`, `reset-password`, `security-question`: Account recovery.

### 4.2 `SettingsContext` (`src/context/SettingsContext.jsx`)
- **State**: `currency` (`'USD'`, `'PLN'`, `'EUR'`), `customRate` (manual multiplier override).
- **Persistence**: Persisted to `localStorage` under `wayfinder_currency` and `wayfinder_custom_rate`.

### 4.3 `WayfinderContext` (`src/context/WayfinderContext.jsx`)
- **State**: `journeys`, `itinerary`, `documents`, `importJobs`, `loading`.
- **Persistence**: Syncs with Cloudflare D1 via `/api/wayfinder/*` when authenticated. Provides local fallback and optimistic UI updates for itinerary bookmarks.

### 4.4 `useExchangeRate` Hook (`src/hooks/useExchangeRate.js`)
- Queries `/api/wayfinder/exchange-rate` (backed by the National Bank of Poland API Table A).
- Caches rate in `localStorage` with a 12-hour TTL.
- Fallback rate of `4.00 PLN/USD` safeguards against upstream network downtime.

---

## 5. Data Architecture & Static Models

### 5.1 Static Dataset (`src/data/poland-2026.js`)
The primary source of truth for public expedition data is `polandJourney`, containing:
- **Expedition Meta**: `id`, `title`, `tagline`, `description`, `dates`.
- **Culinary Highlights**: Array of `{ name, phonetic, english, description, tip }`.
- **Route Array**: 5 distinct destination models:
  1. `krakow` (3 Nights base)
  2. `wroclaw` (2 Nights base)
  3. `poznan` (2 Nights base)
  4. `torun` (Day trip transit hub)
  5. `gdansk` (2 Nights base)

Each destination model contains:
- `quickReference`: Dates, daylight hours, peak illuminations, kaucja mug deposit rules.
- `holidayClosures`: Critical Dec 24 (Wigilia), Dec 25 (Christmas), Dec 26 operating schedules.
- `kaucjaCallout`: Cash-only deposit requirements and return instructions.
- `historyStats`, `historyEpochs`, `historyLegends`: Deep-dive cultural timeline.
- `transit`: Station name, platforms, luggage lockers, and walking route to Old Town.
- `markets`: Array of market squares with dates, hours, chalets count, coordinates, and images.
- `mustSee`: Array of top sights with ticket links, visit duration, addresses, and coordinates.
- `restaurantsDetailed`, `drinksDetailed`, `cafesDetailed`: Multi-category dining catalog.
- `lgbtq`: Safety score, legal context, vetted venues, and safety tips.

### 5.2 Dynamic Image Resolution (`src/utils/cityImages.js`)
Resolves POI imagery with multi-tiered fallback:
1. Exact static asset path (`/wayfinder/Poland-2026/images/[city]/[category]/[file]`).
2. Exact filename dictionary match (`attractionImages[filename]`).
3. Title & keyword heuristic matcher (e.g. `'tumski'`, `'dwarf'`, `'wawel'`, `'piernik'`).
4. City default hero image fallback.

---

## 6. Backend Worker & API Middleware

The Cloudflare Worker entry point is `src/worker.js`:

```
Incoming Request
       |
       v
1. OPTIONS Preflight Check -> Return 204 with CORS Headers
       |
       v
2. Subpath Normalization -> /wayfinder/api/* rewrites to /api/*
       |
       v
3. Public Auth Routes (/api/auth/*) -> Execute handlers in functions/api/auth/
       |
       v
4. Public Currency Route (/api/wayfinder/exchange-rate) -> NBP API Proxy
       |
       v
5. Protected Wayfinder Routes (/api/wayfinder/*) -> JWT Verification
       |-- Unauthorized -> 401 JSON Response
       \-- Authorized   -> Execute handlers in functions/api/wayfinder/
       |
       v
6. Static Asset Serving -> env.ASSETS.fetch() with SPA fallback & Security Headers
```

### 6.1 Security Headers & CSP
Injected on all worker responses:
- **Content-Security-Policy**:
  `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self' https://techtrekgt.com; img-src 'self' data: blob: https://fonts.gstatic.com https://www.transparenttextures.com; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://www.openstreetmap.org; frame-ancestors 'none';`
- **Strict-Transport-Security**: `max-age=31536000; includeSubDomains`
- **X-Content-Type-Options**: `nosniff`
- **X-Frame-Options**: `DENY`
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: `camera=(), microphone=(), geolocation=(), payment=()`

---

## 7. Cloudflare D1 Database Architecture

All TechTrekGT apps share the single `personal-budget-db` D1 database (`database_id: 10f220d4-1c10-49e9-b63e-5d4cb08d599f`). Wayfinder extends this database with isolated tables (`schema-wayfinder.sql`):

```sql
-- Core trip containers
CREATE TABLE wayfinder_journeys (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning', created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- Destination segments
CREATE TABLE wayfinder_destinations (
  id TEXT PRIMARY KEY, journey_id TEXT NOT NULL, slug TEXT NOT NULL,
  name TEXT NOT NULL, stay_type TEXT NOT NULL, nights INTEGER,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE
);

-- Itinerary events (flights, hotels, rail, bookings)
CREATE TABLE wayfinder_itinerary_items (
  id TEXT PRIMARY KEY, journey_id TEXT NOT NULL, user_id TEXT NOT NULL,
  item_type TEXT NOT NULL, title TEXT NOT NULL, local_date TEXT, local_time TEXT,
  provider TEXT, status TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private',
  has_conflict INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Travel documents & OCR metadata
CREATE TABLE wayfinder_documents (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, journey_id TEXT,
  original_filename TEXT NOT NULL, safe_display_name TEXT NOT NULL,
  mime_type TEXT NOT NULL, file_size_bytes INTEGER, storage_key TEXT,
  storage_status TEXT NOT NULL DEFAULT 'pending_r2',
  processing_status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Asynchronous document ingestion jobs
CREATE TABLE wayfinder_import_jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, document_id TEXT NOT NULL,
  job_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trip budgets & expense tracking
CREATE TABLE wayfinder_budgets (...);
CREATE TABLE wayfinder_budget_items (...);
CREATE TABLE wayfinder_budget_allocations (...);
```

---

## 8. External API Integrations

### 8.1 Geoapify API (POI Generation & Geocoding)
- **Key**: `GEOAPIFY_API_KEY` in `.dev.vars`.
- **Purpose**: Batch geocoding and real venue generation for hotels, restaurants, attractions, and Christmas markets.
- **Categories Queried**: `accommodation.hotel`, `tourism.sights`, `catering.restaurant`, `leisure`.

### 8.2 Foursquare Places API (Curated Photos)
- **Key**: `FOURSQUARE_API_KEY` in `.dev.vars`.
- **Purpose**: Autonomous discovery and local download of high-resolution venue photos for all POIs via the `/v3/places/{fsq_id}/photos` endpoint.

### 8.3 National Bank of Poland (NBP) API (Live Exchange Rate)
- **Endpoint**: `https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json`
- **Proxy**: Routed via `/api/wayfinder/exchange-rate` to prevent client CORS restrictions and cache exchange rate data.

---

## 9. Asset Hierarchy & Standardization Mandate

All Wayfinder imagery is stored locally following a strict directory structure:

```
public/Poland-2026/images/
├── [city_name]/                 # gdansk, general, krakow, poznan, torun, wroclaw
│   ├── attractions/             # Landmarks, museums, historic monuments
│   ├── food/                    # Traditional restaurants, cafes, milk bars, pubs
│   ├── hotels/                  # Base hotels & accommodations
│   └── markets/                 # Christmas market squares & chalets
```

Rules:
1. Zero external image links in production code/data.
2. Category folders are restricted to `attractions`, `food`, `hotels`, and `markets`.
3. Root or legacy folders in `public/` or `src/assets/` are deprecated and cataloged for pruning.

---

## 10. Build, Verification & Deployment Loop

1. **Build Step**:
   ```powershell
   npm run build
   ```
   Vite compiles assets into `dist/client`, creating hashed vendor chunks (`vendor`, `icons`) and separate lazy route bundles.

2. **Zero-Error Verification**:
   Build must complete with 0 errors before running deployment.

3. **Deploy Step**:
   ```powershell
   npm run deploy
   ```
   Triggers `wrangler deploy`, pushing the compiled worker script (`src/worker.js`) and static assets (`dist/client`) to Cloudflare Workers under routes `techtrekgt.com/wayfinder` and `techtrekgt.com/wayfinder/*`.
