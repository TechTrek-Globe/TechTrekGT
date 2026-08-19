# TechTrek Wayfinder

**Wayfinder** is a curated, interactive travel intelligence platform and digital expedition guide hosted on `techtrekgt.com/wayfinder`. Its flagship expedition is **Poland: Winter Christmas Markets 2026**, traversing Poland from south to north (Krakow -> Wroclaw -> Poznan -> Torun -> Gdansk) with rich historical deep-dives, vetted culinary recommendations, Christmas market intelligence, high-speed rail routing, live currency conversion, and authenticated itinerary/document management.

---

## 1. Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Framework** | React 19.0.0 | Pure JavaScript / JSX (Function components & hooks only) |
| **Build Tool** | Vite 6.0.7 | Scoped base path `/wayfinder/`, code splitting, manual chunking |
| **Styling** | Tailwind CSS 3.4.17 + PostCSS | Custom `wf-*` palette, glassmorphic UI, responsive layouts |
| **Icons** | Lucide React 0.474.0 | Consistent iconography across views and badges |
| **Routing** | Custom SPA Router | Native `window.history.pushState` + `popstate` listeners (Zero React Router) |
| **State Management** | React Context API | `AuthContext`, `SettingsContext`, `WayfinderContext` |
| **Backend Runtime** | Cloudflare Workers (ESM) | `src/worker.js` with Pages-Functions style handlers in `functions/api/` |
| **Database** | Cloudflare D1 (SQLite) | Shared `personal-budget-db` with `wayfinder_*` relational schema |
| **Auth & Security** | WebCrypto PBKDF2 / HS256 JWT | Shared SSO HttpOnly cookies (`credentials: 'include'`) |
| **External APIs** | NBP API, Geoapify, Foursquare | Live exchange rates, geocoded venues, and curated POI photography |

---

## 2. Directory Structure

```
wayfinder/
├── index.html                    # SPA HTML shell and metadata
├── package.json                  # React 19, Vite 6, Tailwind, Lucide dependencies
├── vite.config.js                # Vite build configuration (base: '/wayfinder/', port: 5174)
├── tailwind.config.js            # Custom color palette (wf-navy, wf-amber, wf-evergreen, etc.)
├── postcss.config.js             # PostCSS plugins (Tailwind, Autoprefixer)
├── wrangler.jsonc                # Cloudflare Worker configuration (D1, ASSETS, routes)
├── schema-wayfinder.sql          # D1 relational schema extension (journeys, itinerary, docs)
├── seed-wayfinder.sql            # Seed data for local/staging D1 database
├── functions/                    # Cloudflare Pages-Functions style API handlers
│   ├── api/
│   │   ├── auth/                 # SSO authentication handlers (login, me, logout, register, reset)
│   │   └── wayfinder/            # Wayfinder endpoints (journeys, itinerary, documents, budget, etc.)
│   └── utils/
│       ├── auth.js               # PBKDF2 password hashing & HS256 JWT token verification
│       ├── id.js                 # NanoID / random ID utility generator
│       └── rateLimit.js          # Rate limiter utility for API endpoints
├── public/                       # Static public assets served by Cloudflare
│   └── Poland-2026/
│       └── images/               # Strict hierarchical asset repository
│           ├── gdansk/           # attractions/, food/, hotels/, markets/
│           ├── general/          # Shared market imagery
│           ├── krakow/           # attractions/, food/, hotels/, markets/
│           ├── poznan/           # attractions/, food/, hotels/, markets/
│           ├── torun/            # attractions/, food/, hotels/, markets/
│           └── wroclaw/          # attractions/, food/, hotels/, markets/
└── src/
    ├── main.jsx                  # Application entry point with Provider tree
    ├── App.jsx                   # Root router and Suspense lazy-route controller
    ├── index.css                 # Tailwind directives, keyframes, and global styles
    ├── worker.js                 # Cloudflare Worker entry point (API router + SPA fallback)
    ├── components/               # React components and views
    │   ├── AuthModal.jsx         # Multi-mode SSO authentication modal
    │   ├── CityPage.jsx          # Dynamic multi-tab city expedition guide
    │   ├── CulinaryHighlightsSection.jsx # Journey-wide culinary guide
    │   ├── CurrencyConverterModal.jsx    # Real-time interactive currency converter
    │   ├── DocumentCenter.jsx    # Authenticated document upload & management view
    │   ├── Formatters.jsx        # Live currency formatter & Markdown text parser
    │   ├── ItineraryView.jsx     # Chronological booking & timeline schedule
    │   ├── Layout.jsx            # Global shell with sticky navigation, header banner & footer
    │   ├── MarketsPage.jsx       # Journey-wide Christmas market directory
    │   ├── MustSeeCard.jsx       # Interactive attraction card with itinerary bookmarks
    │   ├── PolandLanding.jsx     # Poland 2026 flagship journey overview & route map
    │   ├── PracticalPage.jsx     # Transit, packing, currency, and emergency info
    │   ├── PrivateHub.jsx        # Auth-gated itinerary & document management hub
    │   ├── RouteVisualization.jsx# Interactive rail route and transit visualization
    │   ├── SettingsModal.jsx     # Currency preferences and custom exchange rate modal
    │   ├── StaysAndFoodPage.jsx  # Neighborhood base and dining target directory
    │   ├── WayfinderLanding.jsx  # Root platform landing page
    │   └── city/                 # Sub-components for CityPage tabs
    │       ├── CityAttractionsTab.jsx # Top sights & must-see attraction listings
    │       ├── CityFoodTab.jsx        # Categorized dining guide with drill-down filters
    │       ├── CityHeroImageCard.jsx  # City hero banner with quick info
    │       ├── CityHistoryTab.jsx     # Timeline epochs, stats, and historical legends
    │       ├── CityHotelsTab.jsx      # Recommended base zones & lodging guide
    │       ├── CityLgbtqTab.jsx       # LGBTQ+ safety ratings & vetted venues
    │       ├── CityMarketsTab.jsx     # Market details, chalets, dates & kaucja callouts
    │       ├── CityOverviewTab.jsx    # Daylight, holiday closures & quick practical stats
    │       ├── DrillDownFilters.jsx   # Multi-category pill filter selector
    │       └── QuickReferenceBar.jsx  # Market dates, daylight, peak hours & mug deposit bar
    ├── context/                  # React Context Providers
    │   ├── AuthContext.jsx       # Shared SSO session state & auth modal controls
    │   ├── SettingsContext.jsx   # Preferred currency (USD/PLN/EUR) & custom exchange rates
    │   └── WayfinderContext.jsx  # Journeys, itinerary items, documents & import jobs state
    ├── data/
    │   ├── poland-2026.js        # Centralized static intelligence dataset for Poland 2026
    │   └── schema.js             # Data structure blueprint for city entries
    ├── hooks/
    │   └── useExchangeRate.js    # NBP live exchange rate fetcher with caching & fallback
    └── utils/
        ├── api.js                # Dynamic subpath URL resolver for API requests
        └── cityImages.js         # Intelligent POI image resolution & fallback engine
```

---

## 3. Local Setup & Development Commands

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Wrangler**: v3.101.0 or higher (included in devDependencies)

### 1. Environment Secrets Setup
Copy the example environment variables template:
```powershell
copy .dev.vars.example .dev.vars
```
Configure `.dev.vars` with real development secrets:
```ini
JWT_SECRET=your_shared_sso_secret_here
FOURSQUARE_API_KEY=your_foursquare_api_key_here
GEOAPIFY_API_KEY=your_geoapify_api_key_here
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### 2. Install Dependencies
```powershell
npm install
```

### 3. Development Server
Run Vite locally on port `5174`:
```powershell
npm run dev
```
Access the application at `http://localhost:5174/wayfinder/`.

### 4. Local Worker & D1 Preview
To run the full Cloudflare Worker environment locally with SQLite D1:
```powershell
npx wrangler dev
```

### 5. Production Build & Deployment
Execute the production build and deploy to Cloudflare Workers:
```powershell
# Production Vite Build (Outputs to dist/client)
npm run build

# Deploy to Cloudflare Worker (techtrek-wayfinder)
npm run deploy
```

---

## 4. Application Architecture & Routing

### 4.1 Custom Client-Side Router
Wayfinder implements a lightweight, zero-dependency router inside `App.jsx` using `window.history.pushState` and `window.addEventListener('popstate', ...)`. All view components are lazy-loaded via `React.lazy()` with `<Suspense>` fallbacks.

| URL Path | View Component | Description |
|---|---|---|
| `/wayfinder` or `/` | `WayfinderLanding` | Platform hub and expedition catalog |
| `/wayfinder/poland-christmas-2026` | `PolandLanding` | Poland 2026 flagship landing & route summary |
| `/wayfinder/poland-christmas-2026/route` | `RouteVisualization` | High-speed rail itinerary and transit timings |
| `/wayfinder/poland-christmas-2026/markets` | `MarketsPage` | Journey-wide Christmas market listings & culinary guide |
| `/wayfinder/poland-christmas-2026/stays-and-food` | `StaysAndFoodPage` | Neighborhood lodging base zones and dining targets (no unbooked hotel listings) |
| `/wayfinder/poland-christmas-2026/practical` | `PracticalPage` | Transit, currency, packing, daylight & emergency guide |
| `/wayfinder/poland-christmas-2026/cities/:cityId/:subPage` | `CityPage` | Deep-dive city expedition guide (7 sub-tabs) |
| `/wayfinder/poland-christmas-2026/private*` | `PrivateHub` | Auth-gated itinerary timeline (including private booked hotels) & document center |

### 4.2 Dynamic City Sub-Pages (`CityPage.jsx`)
City views resolve dynamic subpages with built-in route alias mapping:
- `overview`: General stats, daylight hours, holiday operating schedules, and transit stations.
- `history`: Timeline epochs, historical statistics, and folklore legends.
- `attractions`: Curated must-see sights with ticket links, duration, and itinerary bookmarking.
- `markets`: Chalet listings, locations, opening hours, kaucja mug deposits, and culinary targets.
- `restaurants`: Drill-down food guides (Traditional Polish, Pierogarnie, Milk Bars, High-End Dining, Craft Breweries, Pubs, Cocktails, Cafes).
- `hotels`: Recommended neighborhood base zones (market proximity, transit links, and live Google Maps lookups). No unbooked hotels are listed. Specific booked hotels appear exclusively in the authenticated private itinerary.
- `lgbtq`: Safety score, legal rights overview, vetted queer-friendly venues, and safety advice.

---

## 5. State Management & Context Architecture

```
<AuthProvider>
  └── <SettingsProvider>
      └── <WayfinderProvider>
          └── <App>
              └── <Layout>
                  └── <Suspense>
                      └── <RouteComponent />
```

1. **`AuthContext`**: Manages user authentication state via HttpOnly session cookies. Interacts with `/api/auth/me`, `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, and password recovery endpoints. Controls global `AuthModal` visibility.
2. **`SettingsContext`**: Controls user UI preferences including active currency (`USD`, `PLN`, `EUR`) and custom exchange rate overrides. Persists selections in `localStorage`.
3. **`WayfinderContext`**: Fetches and caches server-side journeys, personalized itinerary events (including private booked hotels), travel documents, and OCR/import jobs via the `/api/wayfinder/*` Worker API.
4. **`useExchangeRate`**: Real-time currency hook querying the National Bank of Poland (NBP) API at `/api/wayfinder/exchange-rate` with client-side caching and fallback rate safeguards.

---

## 6. Asset Hierarchy & Media Rules

All static venue photography and imagery MUST adhere to the standardized path structure under `public/Poland-2026/images/`:

```
public/Poland-2026/images/
├── [city_name]/                 # gdansk, general, krakow, poznan, torun, wroclaw
│   ├── attractions/             # Historic sights, landmarks, and museums
│   ├── food/                    # Restaurants, cafes, milk bars, and craft pubs
│   └── markets/                 # Christmas market squares, chalets, and lights
```

- **Resolution Utility (`src/utils/cityImages.js`)**: Maps attraction names and city identifiers directly to local assets with keyword matching fallbacks.
- **External Image Mandate**: External image links are strictly forbidden in production datasets. All photography is downloaded and curated locally using Foursquare / Geoapify integrations.
- **Google Maps Integration**: Direct Google Maps lookup queries and directions URLs are embedded for dynamic navigation and live hotel exploration.

---

## 7. Cloudflare Worker API & D1 Backend

The Cloudflare Worker (`src/worker.js`) routes requests through a unified middleware chain:
1. **CORS Validation**: Allows `https://techtrekgt.com` and localhost development ports (`5174`).
2. **Security Headers**: Injects strict CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, and Permissions-Policy.
3. **Public Auth Routes**: Intercepts `/api/auth/*` requests and executes shared SSO handlers.
4. **Protected API Routes**: Validates HS256 JWT sessions before routing to `/api/wayfinder/*` endpoints:
   - `GET /api/wayfinder/exchange-rate`: Real-time NBP currency rate cache.
   - `GET / POST /api/wayfinder/journeys`: Trip container records.
   - `GET / POST / DELETE /api/wayfinder/itinerary`: Personal itinerary items.
   - `GET / POST / DELETE /api/wayfinder/documents`: User travel documents and metadata.
   - `GET / POST /api/wayfinder/import-jobs`: Asynchronous document import/OCR jobs.
   - `GET / POST / PUT / DELETE /api/wayfinder/budget`: Expedition budget allocations.
5. **SPA Static Asset Serving**: Directs all non-API paths to `env.ASSETS` serving `./dist/client` with single-page application fallback.
