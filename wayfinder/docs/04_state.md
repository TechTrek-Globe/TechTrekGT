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

## 3. Static POI Catalog Memory Model

The core travel guide data lives in the centralized data module [wayfinder/src/data/poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js):

- Immutable Data Structures: Deep JavaScript object trees organizing cities, coordinates, historical narratives, photo assets, operating hours, and verified venue metadata.
- Zero Latency Rendering: By bundling verified POI records directly into the client bundle, city tab navigation executes instantaneously with zero network round-trips.
- Offline Capability: Even when traveling with spotty mobile network roaming or in airplane mode, the complete catalog of attractions, restaurants, and safety details remains fully interactive.

## 4. Persistent Relational Schema (Cloudflare D1)

Private travel data persists in the shared Cloudflare D1 database (personal-budget-db) governed by [wayfinder/schema-wayfinder.sql](file:///e:/TechTrekGT/wayfinder/schema-wayfinder.sql):

- Table wayfinder_journeys:
  - Stores journey containers (such as poland-christmas-2026) linked to owning user_id.
  - Fields: id, user_id, title, destination, start_date, end_date, created_at, updated_at.
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

## 5. Ephemeral Edge State and Rate Limiting

Transient edge state is isolated to specific performance and security layers:

- RATE_LIMIT_KV: Bound in [wayfinder/wrangler.jsonc](file:///e:/TechTrekGT/wayfinder/wrangler.jsonc) to track IP-based and account-based authentication attempts. Protects /api/auth/login and password reset routes with automated lockout windows.
- NBP Exchange Rate Edge Caching: The worker proxy endpoint /api/wayfinder/exchange-rate caches current Polish zloty exchange tables in memory with short TTLs to shield the upstream National Bank of Poland API from redundant client queries.
- UI Modal and Filter State: Drill-down category filters, active city tab selections, search queries, and modal states (AuthModal, CurrencyConverterModal, SettingsModal) are held strictly in component memory and discarded on navigation.
