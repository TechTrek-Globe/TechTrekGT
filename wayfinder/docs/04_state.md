# Wayfinder Guide - State Architecture and Data Persistence

## 1. Overview of State Architecture

Wayfinder employs a hybrid state management model combining immutable client-side catalog structures with authenticated, serverless relational persistence. Public city and travel discovery data is static and inlined, while personal travel schedules, uploaded documents, and budget ledgers persist in the shared Cloudflare D1 database.

## 2. Client-Side State Management (React Context)

Client state is partitioned into specialized React Context providers:

- WayfinderContext: Declared in [wayfinder/src/context/WayfinderContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/WayfinderContext.jsx).
  - State Fields: itinerary (chronological list of travel events), documents (uploaded travel files), jobs (background document extraction tasks), isLoading, and error.
  - Action Handlers: fetchItinerary, fetchDocuments, fetchJobs, uploadDocument, getJobFields, and saveExtractedFields.
  - Lifecycle: Automatically triggers data re-fetching upon user authentication and provides optimistic local updates during document intake.
- AuthContext: Declared in [wayfinder/src/context/AuthContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/AuthContext.jsx).
  - State Fields: user (authenticated profile with id, email, name, is_admin), isAuthenticated, and isLoading.
  - Lifecycle: Inspects /api/auth/me on mount with credentials: 'include'. Coordinates session state across login, registration, and logout actions.
- SettingsContext: Declared in [wayfinder/src/context/SettingsContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/SettingsContext.jsx).
  - State Fields: currency (default PLN or USD), temperatureUnit (Celsius or Fahrenheit), and notificationPreferences.
  - Persistence: Persisted to browser localStorage for instant retrieval across browser sessions.
- Client Document Storage (IndexedDB): Declared in [wayfinder/src/utils/documentStorage.js](file:///e:/TechTrekGT/wayfinder/src/utils/documentStorage.js).
  - Store: `WayfinderDocumentDB` (store name: `document_files`).
  - Capabilities: Persists uploaded booking PDFs and images locally in browser storage, enabling instant previews in [wayfinder/src/components/DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx) even when edge storage (Cloudflare R2) is offline or pending. Falls back to static bundled documents (such as `Poland_Delta.pdf`).

## 3. Static POI Catalog Memory Model

The core travel guide data lives in the centralized data module [wayfinder/src/data/poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js):

- Immutable Data Structures: Deep JavaScript object trees organizing cities, coordinates, historical narratives, photo assets, operating hours, and verified venue metadata.
- Zero Latency Rendering: By bundling verified POI records directly into the client bundle, city tab navigation executes instantaneously with zero network round-trips.
- Offline Capability: Even when traveling with spotty mobile network roaming or in airplane mode, the complete catalog of attractions, restaurants, and safety details remains fully interactive.

## 4. Persistent Relational Schema (Cloudflare D1)

Private travel data persists in the shared Cloudflare D1 database (personal-budget-db) governed by [wayfinder/schema-wayfinder.sql](file:///e:/TechTrekGT/wayfinder/schema-wayfinder.sql):

- Table wayfinder_journeys:
  - Stores journey containers (such as poland-christmas-2026) with ownership and visibility flags.
  - Fields: id, slug, title, tagline, description, hero_image_url, start_month, start_year, start_date, end_date, status, visibility, created_by, created_at, updated_at.
- Table wayfinder_itinerary_items:
  - Stores scheduled events and milestones within a journey.
  - Fields: id, journey_id, user_id, title, city, category (transport, hotel, attraction, dining, market), start_time, end_time, location, notes, cost_pln, cost_usd, status.
- Table wayfinder_documents:
  - Stores metadata and references for uploaded booking documents and receipts.
  - Fields: id, journey_id, user_id, original_name, mime_type, file_size, storage_key, doc_type (flight, hotel, train, insurance, ticket), created_at.
- Table wayfinder_import_jobs:
  - Tracks asynchronous document field parsing and OCR extraction tasks.
  - Fields: id, document_id, user_id, status (pending, processing, completed, failed), extracted_fields, error_message, created_at, updated_at.
- Table wayfinder_budget_items:
  - Manages financial ledger line items for trip planning and actual expense tracking.
  - Fields: id, journey_id, user_id, category, description, estimated_pln, actual_pln, estimated_usd, actual_usd, is_paid, created_at.
- Table wayfinder_packing_items:
  - Stores personal and shared winter checklist items with bag allocations and weights.
  - Fields: id, journey_id, user_id, category, name, quantity, weight_grams, is_packed, is_shared, assigned_to, bag_type (checked, carryon, personal), notes, sort_order, created_at, updated_at.

## 5. Ephemeral Edge State and Rate Limiting

Transient edge state is isolated to specific performance and security layers:

- RATE_LIMIT_KV: Bound in [wayfinder/wrangler.jsonc](file:///e:/TechTrekGT/wayfinder/wrangler.jsonc) to track IP-based and account-based authentication attempts. Protects /api/auth/login and password reset routes with automated lockout windows.
- NBP Exchange Rate Edge Caching: The worker proxy endpoint /api/wayfinder/exchange-rate caches current Polish zloty exchange tables in memory with short TTLs to shield the upstream National Bank of Poland API from redundant client queries.
- Open-Meteo Weather Telemetry Edge & Session Cache: The worker endpoint /api/wayfinder/weather caches normalized forecast and climate payloads in an in-memory isolate map (1-hour TTL) and sets Cache-Control headers (3,600s browser / 10,800s Cloudflare edge). The client WeatherWidget component caches responses in browser sessionStorage (`wf_weather_*`) with 1-hour expiration to eliminate redundant network fetches across city tabs and itinerary days.
- Packing Manager Local State & Weight Telemetry: Managed in [PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx) via `useState` and `useMemo`. Tracks live baggage utilization against 23.0 kg checked and 8.0 kg carry-on limits, category filters, search terms, and category fold states. For unauthenticated travelers, persists state locally to browser `localStorage` (`wayfinder_offline_packing_v1`), syncing with D1 upon login.
- UI Modal and Filter State: Drill-down category filters, active city tab selections, search queries, and modal states (AuthModal, CurrencyConverterModal, SettingsModal) are held strictly in component memory and discarded on navigation.
- Client Route Optimizer State: Managed locally in [CityAttractionsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityAttractionsTab.jsx) via `useState` and `useMemo`. Tracks `isOptimized` (boolean toggle between curated and 2-opt order), `anchorMode` ('market' base vs 'none' / first sight), `isRoundTrip` (whether loop closes back to base), and `includeExcursions` (whether day-trip sights >12km are grouped into city walks). Computations execute deterministically in memory via [routeOptimizer.js](file:///e:/TechTrekGT/wayfinder/src/utils/routeOptimizer.js) with zero backend round-trips.
- Persistent Navigation State: Handled via popstate events in [wayfinder/src/components/Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx) and synchronized down to [wayfinder/src/components/BottomTabBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx). Active state indicators (isCities, isSchedule, isPractical, isDocs) dynamically evaluate against current window.location.pathname.
- Unauthenticated View State in PrivateHub: [wayfinder/src/components/PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx) dynamically bifurcates view state between documents (hard auth gated), packing manager (available offline and syncable), and the itinerary schedule (public timeline rendered with an overlay sign-in invite), eliminating dead-end navigation loops.
- PolandLanding Journey Sequence State: [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) manages viewMode (defaults to 'cards' with toggle to 'schedule'), selectedStopFilter ('all' or individual city IDs), and expandedStops object state. When authenticated, D1 private itinerary items and accommodations fetched via WayfinderContext are merged into matching stop date windows.

## 6. Booking Import State

### 6.1 Email Inbox Table (wayfinder_email_inboxes)

Stores the unique per-user per-journey forwarding address records:

- `id`, `user_id`, `journey_id`: ownership identifiers.
- `inbox_token`: 6-digit random numeric token used in the local-part of the email address.
- `email_address`: fully constructed address (e.g. `TT412312.poland2026@techtrekgt.com`). UNIQUE indexed for fast Email Worker lookup.
- `is_active`, `emails_received`, `last_received_at`: operational counters.
- Constraints: `UNIQUE(user_id, journey_id)` - one active inbox per journey.

### 6.2 Retired Legacy Gmail Table (wayfinder_gmail_connections)

Legacy Gmail OAuth integration has been removed from active ingestion in favor of dedicated email forwarding. Existing D1 queries and API endpoints explicitly filter out any historical items tagged with `gmail:` notes to ensure clean itineraries.

### 6.3 Email Forward Security

The Email Forward channel relies on the existing `DB` binding and the unique inbox token as implicit access control, requiring no external Google Cloud OAuth dependencies.
