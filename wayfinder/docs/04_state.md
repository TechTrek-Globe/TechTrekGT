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
  - Fields: id, journey_id, user_id, destination_id, item_type (flight, hotel, rail, excursion, restaurant, other), title, provider, status, verification_status, local_date, local_time, end_date, end_time, timezone, location, location_address, notes, source_document_id, visibility, has_conflict, conflict_notes, created_at, updated_at.
- Table wayfinder_documents:
  - Stores metadata and references for uploaded booking documents and inbound email attachments.
  - Fields: id, user_id, journey_id, original_filename, safe_display_name, mime_type, file_size_bytes, file_hash, storage_key, storage_status, upload_date, processing_status, detected_provider, detected_doc_type, security_scan_status, extraction_version, retention_status, deleted_at, deleted_by.
- Table wayfinder_expenses & wayfinder_expense_splits:
  - Tracks trip costs, receipt currencies, and 50/50 participant balance splits.
  - Fields: id, journey_id, itinerary_item_id, user_id, paid_by_name, category, description, amount_original, currency_original, paid_status, verification_status, created_at.
- Table wayfinder_import_jobs:
  - Tracks asynchronous document field parsing and OCR extraction tasks.
  - Fields: id, document_id, user_id, status (pending, processing, completed, failed), extracted_fields, error_message, created_at, updated_at.
- Table wayfinder_budget_items:
  - Manages financial ledger line items for trip planning and actual expense tracking.
  - Fields: id, journey_id, user_id, category, description, estimated_pln, actual_pln, estimated_usd, actual_usd, is_paid, created_at.
- Table wayfinder_packing_items:
  - Stores personal and shared winter checklist items with bag allocations and weights.
  - Fields: id, journey_id, user_id, category, name, quantity, weight_grams, is_packed, is_shared, assigned_to, bag_type (checked, carryon, personal), notes, sort_order, created_at, updated_at.
- Table wayfinder_calendar_tokens:
  - Stores secure, token-based calendar subscription records for live iCal feeds.
  - Fields: id, user_id, journey_id, token (32-character crypto random hex string), feed_name, is_active, last_polled_at, poll_count, created_at.
  - Constraints: UNIQUE(token), UNIQUE(user_id, journey_id). Indexed on token and user_id.

## 5. Ephemeral Edge State and Rate Limiting

Transient edge state is isolated to specific performance and security layers:

- RATE_LIMIT_KV: Bound in [wayfinder/wrangler.jsonc](file:///e:/TechTrekGT/wayfinder/wrangler.jsonc) to track IP-based and account-based authentication attempts. Protects /api/auth/login and password reset routes with automated lockout windows.
- Calendar Feed Caching and Telemetry: The public worker endpoint /api/wayfinder/calendar/feed/:token.ics applies Cloudflare edge caching headers (1,800s browser / 3,600s Cloudflare edge) to prevent calendar client polling spikes from overloading D1. Each poll automatically increments `poll_count` and updates `last_polled_at` asynchronously via `ctx.waitUntil`.
- Calendar Subscription Modal State: Managed in [CalendarSubscribeModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/calendar/CalendarSubscribeModal.jsx) via `useState`. Tracks token retrieval, rotation operations, clipboard copy confirmation badges, and direct `.ics` snapshot triggers.
- NBP Exchange Rate Edge Caching: The worker proxy endpoint /api/wayfinder/exchange-rate caches current Polish zloty exchange tables in memory with short TTLs to shield the upstream National Bank of Poland API from redundant client queries.
- Open-Meteo Weather Telemetry Edge & Session Cache: The worker endpoint /api/wayfinder/weather caches normalized forecast and climate payloads in an in-memory isolate map (1-hour TTL) and sets Cache-Control headers (3,600s browser / 10,800s Cloudflare edge). The client WeatherWidget component caches responses in browser sessionStorage (`wf_weather_*`) with 1-hour expiration to eliminate redundant network fetches across city tabs and itinerary days.
- Packing Manager Local State & Weight Telemetry: Managed in [PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx) via `useState` and `useMemo`. Tracks live baggage utilization against 23.0 kg checked and 8.0 kg carry-on limits, category filters, search terms, and category fold states. For unauthenticated travelers, persists state locally to browser `localStorage` (`wayfinder_offline_packing_v1`), syncing with D1 upon login.
- UI Modal and Filter State: Drill-down category filters, active city tab selections, search queries, and modal states (AuthModal, CurrencyConverterModal, SettingsModal, BookingDetailModal) are held strictly in component memory and discarded on navigation.
- Document Center Synced Booking State: Managed in [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx) via `selectedBooking` and `copiedConf`. Clicking any synced trip confirmation card activates `selectedBooking`, opening the inspection modal with confirmation code copy, vendor metadata, and date-to-journey day mapping (`getDayNumber`).
- Itinerary Deep-Linking and Timeline Query State: Managed in [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) where `selectedDay` initializes from `new URLSearchParams(window.location.search).get('day') || 'all'`. Subscribes to `popstate` events to dynamically synchronize filters when navigating from Document Center or external links, and triggers a smooth scroll to `#day-X` anchors.
- Itinerary API Item Sanitization: Handled in [itinerary.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/itinerary.js) `sanitizeItem` which automatically extracts and exposes `confirmation_number` from `notes` regex matching (`confirmation:\s*([A-Za-z0-9]+)`).
- Client Route Optimizer State: Managed locally in [CityAttractionsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityAttractionsTab.jsx) via `useState` and `useMemo`. Tracks `isOptimized` (boolean toggle between curated and 2-opt order), `anchorMode` ('market' base vs 'none' / first sight), `isRoundTrip` (whether loop closes back to base), and `includeExcursions` (whether day-trip sights >12km are grouped into city walks). Computations execute deterministically in memory via [routeOptimizer.js](file:///e:/TechTrekGT/wayfinder/src/utils/routeOptimizer.js) with zero backend round-trips.
- Persistent Navigation State: Handled via popstate events in [wayfinder/src/components/Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx) and synchronized down to [wayfinder/src/components/BottomTabBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx). Active state indicators (isCities, isSchedule, isPractical, isDocs) dynamically evaluate against current window.location.pathname.
- Unauthenticated View State in PrivateHub: [wayfinder/src/components/PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx) dynamically bifurcates view state between documents (hard auth gated), packing manager (available offline and syncable), and the itinerary schedule (public timeline rendered with an overlay sign-in invite), eliminating dead-end navigation loops.
- PolandLanding Journey Sequence State: [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) manages viewMode (defaults to 'cards' with toggle to 'schedule'), selectedStopFilter ('all' or individual city IDs), and expandedStops object state. When authenticated, D1 private itinerary items and accommodations fetched via WayfinderContext are merged into matching stop date windows.

## 6. Booking Import State

### 6.1 Email Inbox Table (wayfinder_email_inboxes)

Stores the unique per-user per-journey forwarding address records:

- `id`, `user_id`, `journey_id`: ownership identifiers.
- `inbox_token`: 6-digit random numeric token used in the local-part of the email address.
- `email_address`: fully constructed address (e.g. `tt351825.poland-christmas-2026@techtrekgt.com`). Lowercase normalized and queried with `COLLATE NOCASE` alongside token lookup.
- `is_active`, `emails_received`, `last_received_at`: operational counters.
- Constraints: `UNIQUE(user_id, journey_id)` - one active inbox per journey. Matches by 6-digit `inbox_token` with fallback to `email_address COLLATE NOCASE`.

### 6.2 Retired Legacy Gmail Table (wayfinder_gmail_connections)

Legacy Gmail OAuth integration has been removed from active ingestion in favor of dedicated email forwarding. Existing D1 queries and API endpoints explicitly filter out any historical items tagged with `gmail:` notes to ensure clean itineraries.

### 6.3 Email Forward Security

The Email Forward channel relies on the existing `DB` binding and the unique inbox token as implicit access control, requiring no external Google Cloud OAuth dependencies.

---

## 7. Dynamic iCalendar Feed Tokens State (`wayfinder_calendar_tokens`)

Stores 32-character crypto-random subscription tokens for secure, unauthenticated iCalendar reader access:

- `id`: unique token identifier (e.g. `caltok-1730000000000-abc12`).
- `user_id`: owning traveler UUID.
- `journey_id`: associated journey slug (`poland-christmas-2026`).
- `feed_token`: 32-character hex secret used in the URL path `/api/wayfinder/calendar/feed/:token.ics`. UNIQUE indexed.
- `is_active`: toggle flag allowing instant user token revocation.
- `poll_count`: telemetry counter recording feed reads from external clients.
- `last_polled_at`: ISO timestamp of latest calendar client fetch.
- `created_at`, `updated_at`: lifecycle timestamps.

---

## 8. Unified Timeline and Deduplication Runtime State (`itineraryTimeline.js`)

Governs the deterministic chronological rendering and deduplication pipeline across the UI and iCal feed:

- `buildUnifiedDayTimeline(dayItem, dayPrivate, dayAccommodations)`: pure ESM transformer that merges public, private, and accommodation datasets.
- Time Normalization: parses `HH:MM` strings into absolute minute integers (`parseTimeToMinutes`).
- Deduplication Predicate: `isGenericHotelPlaceholder(event)` tests for generic hotel recommendation items (`Recommended Base Zone` badge, `Check-in (from 15:00)`, `Settle into chosen base`).
- Hotel Active Flag: `hasConfirmedHotel` evaluates true whenever curated accommodations or D1 hotel bookings are present for the given day, automatically suppressing generic base suggestions.
- Tie-Breaker Precedence: identical minute timestamps are resolved by entity priority (Accommodations: 1, Private Bookings: 2, Public Schedule Events: 3).

---

## 9. Multi-Currency Expense Ledger & Splits State (`wayfinder_expenses`, `wayfinder_expense_splits`, `wayfinder_expense_settlements`)

Tracks shared expedition costs, member split allocations, and debt settlements in Cloudflare D1 `personal-budget-db`:

### 9.1 Primary Expenses Table (`wayfinder_expenses`)
- `id`: unique expense identifier (e.g. `exp-1730000000000-abc12`).
- `journey_id`: associated journey slug (`poland-christmas-2026`).
- `itinerary_item_id`: optional foreign key referencing linked `wayfinder_itinerary_items(id)`.
- `document_id`: optional foreign key referencing source `wayfinder_documents(id)`.
- `user_id`: creator UUID (the authenticated user who recorded the expense in D1).
- `paid_by_name`: display name of the member who actually fronted the payment (e.g. `Jonathan Kemp`, `Ronald Milton Few`).
- `paid_by_user_id`: UUID of the member who fronted the payment. This is the authoritative payer field used by `calculateSettleUp` in [expenseLedger.js](file:///e:/TechTrekGT/wayfinder/src/utils/expenseLedger.js) to determine net balances. Distinct from `user_id` (which is the row creator). Falls back to `user_id` for legacy rows where this column is null.
- `category`: categorized domain (`flight`, `lodging`, `transit`, `activity`, `dining`, `market`, `other`).
- `description`: expense title or merchant name.
- `amount_original`, `currency_original`: raw payment amount and ISO 4217 currency (`PLN`, `USD`, `EUR`, `GBP`).
- `amount_usd`: calculated USD equivalent at booking exchange rate.
- `paid_status`: payment status (`paid`, `pending`, `reimbursed`).
- `verification_status`: verification state (`verified`, `unverified`).
- `notes`: optional receipt or split notes.
- `created_at`: record creation timestamp.

### 9.2 Expense Splits Table (`wayfinder_expense_splits`)
- `id`: split record identifier (`spl-...`).
- `expense_id`: foreign key referencing parent `wayfinder_expenses(id)`.
- `user_id`: owing member UUID.
- `user_name`: owing member display name.
- `amount_owed`: fractional cost allocation in original expense currency (calculated to exact cent).
- `percentage`: percentage share of total cost (e.g. 50.0).
- `is_settled`: binary settlement flag (0 or 1).
- `settled_at`: ISO timestamp of settlement.
- `settle_method`: payment channel used when settled item-by-item (e.g. `zelle`, `venmo`, `apple_pay`, `cash_app`, `cash`, `bank_transfer`, `split_separately`, `paypal`, `credit_card_pos`, `revolut`, `other`).

### 9.3 Expense Settlements Table (`wayfinder_expense_settlements`)
- `id`: settlement transaction identifier (`stl-...`).
- `journey_id`: associated journey slug.
- `from_user_id`, `from_user_name`: debtor who sent funds.
- `to_user_id`, `to_user_name`: creditor who received funds.
- `amount`, `currency`: payment amount and currency.
- `settled_date`: date payment occurred.
- `method`: payment channel (`cash`, `bank_transfer`, `zelle`, `venmo`, `apple_pay`, `cash_app`, `split_separately`, `paypal`, `credit_card_pos`, `revolut`, `other`).
- `notes`: settlement transaction memo.
- `expense_id`: optional foreign key referencing specific parent `wayfinder_expenses(id)` for item-by-item settlements.
- `split_id`: optional foreign key referencing specific `wayfinder_expense_splits(id)` for item-by-item settlements.

## 10. Confirmed Excursion State & Timeline Occlusion Architecture

Tracks confirmed private tour bookings, time window parameters, and reconciliation metadata in `wayfinder_itinerary_items`:

### 10.1 Itinerary Excursion Fields
- `local_date`: ISO date of excursion (e.g. `2026-12-06`).
- `local_time`: Excursion departure / pickup midpoint time (e.g. `06:30`).
- `end_time`: Tour return time (e.g. `17:30`).
- `source_document_id`: Foreign key referencing attached voucher or ticket in `wayfinder_documents` (`doc-gyg-7vkk692wy`).
- `notes`: Structured metadata parsed during email or document ingestion:
  - `Confirmation: <GYG_CONF>`
  - `Booking Reference: <BOOKING_REF>`
  - `Supplier: <OPERATOR>` (e.g. `Mr.Shuttle`)
  - `Tickets: <COUNT>` (e.g. `2 Adults (Age 17 - 99) • English • 11 hours`)
  - `Cost: <AMOUNT> <CURRENCY>` (e.g. `284.76 USD`)
  - `Pickup Window: <WINDOW>` (e.g. `05:30 - 07:30`)
  - `Bag Restrictions: <RESTRICTION>` (e.g. `Max 30x20x10 cm on Museum grounds`)
  - `Mobile Tickets: <AUTHENTICATED_URL>` (includes `visitor_id` for instant guest access)
  - `Activity Details: <AUTHENTICATED_URL>`

### 10.2 Timeline Conflict Resolution Rules
- Landmark Keyword Matching: Reconciles matching public events against booked excursion keywords (`auschwitz`, `wieliczka`, `salt mine`). Suppresses placeholder ideas on confirmed dates.
- All-Day Time Occlusion: When excursion duration is >= 4 hours, suppresses daytime sight suggestions within `[start_time + 30m, end_time - 15m]`, while preserving evening dining, drinks, and markets (`itemType: food`, `market`).

### 10.3 Metadata Normalization & Sanitization State
- Raw Note Storage: In SQLite D1, multiline string values are stored using standard line breaks (`CHAR(10)`). Existing records with escaped string literals (`\\n`) are converted to `CHAR(10)`.
- Client Runtime Sanitization: `parseBookingMetadata(item)` splits on normalized line breaks (`\n`), populating typed metadata:
  - `confNumber`: Confirmation / booking code.
  - `supplier`: Tour operator or service provider.
  - `pickupWindow`: Confirmed pickup timeframe.
  - `bagRestriction`: Museum size limits.
  - `rawTickets`: Participant and ticket counts with duration decoupled.
  - `rawDuration`: Parsed duration (e.g. `11 hours`).
  - `mobileTicketUrl` & `activityDetailsUrl`: Canonical web booking links.
  - `description`: Curated narrative description preventing raw metadata leakage.

---

## 11. Core Lodging & Expedition Expense State Ingestion

Active persistent entities for confirmed trip reservations:

### 11.1 Hotel Altus Palace Wrocław
- Document Record (`wayfinder_documents`): `id: doc-altus-palace-wroclaw`, `original_filename: Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`, `storage_status: imported`, `processing_status: imported`.
- Itinerary Record (`wayfinder_itinerary_items`): `id: itin-altus-palace-wroclaw`, `item_type: hotel`, `title: Altus Palace Wrocław 5-Star Stay (Check-in)`, `local_date: 2026-12-07`, `local_time: 15:00`, `end_date: 2026-12-09`, `end_time: 11:00`, `source_document_id: doc-altus-palace-wroclaw`.
- Expense Record (`wayfinder_expenses`): `id: exp-altus-palace-hotel`, `amount_original: 2400.00`, `currency_original: PLN`, `paid_by_name: Jonathan Kemp`, `category: lodging`, linked to splits `spl-altus-1` and `spl-altus-2` (1,200.00 PLN each).

### 11.2 Inbound Transatlantic Flights
- Document Record: `ea78634a-eaa9-46e8-b40c-b3703bb6e2ca` (`Poland_Delta.pdf`).
- Itinerary Record: `471a82a3-2251-4d01-a308-a8f084b6108a` (`Flight: ATL to KRK`).
- Expense Record: `exp-delta-flight-dl9208`, `amount_original: 1980.00`, `currency_original: USD`, `amount_usd: 1980.00`, `paid_by_name: Ronald Milton Few`, `paid_by_user_id: usr-ronald-few`, linked to splits `spl-flight-jon` (Jonathan owes $990.00 USD) and `spl-flight-ronald` (Ronald paid share of $990.00 USD).

### 11.3 Auschwitz & Wieliczka Guided Excursion
- Document Record: `doc-gyg-7vkk692wy` (`GetYourGuide_Ticket_GYG7VKK692WY.pdf`).
- Itinerary Record: `5263ea74-fc84-4b85-8f9d-9d5179e7f292` (`GetYourGuide: Auschwitz-Birkenau & Wieliczka Salt Mine Tour`).
- Expense Record: `exp-gyg-7vkk692wy`, `amount_original: 284.76`, `currency_original: USD`, `amount_usd: 284.76`, linked to splits `split-gyg-1` and `split-gyg-2` ($142.38 USD each).
---

## 12. Offline Mutation Queue State & Idempotency Governance

Governs the state transitions, local storage contracts, and replay guarantees for offline operations:

### 12.1 Client IndexedDB Object Store Schema (`mutation_queue`)
- Database: `wayfinder_offline_docs`, Version: `2`.
- Object Store: `mutation_queue` with keyPath `id`.
- Indexes:
  - `idx_status`: Bounded lookup for mutations matching `pending`, `replaying`, `failed`, or `completed`.
  - `idx_createdAt`: Ascending timestamp sort ensuring deterministic First-In-First-Out (FIFO) replay.

### 12.2 Mutation Record Schema
Each queued mutation record comprises:
- `id`: Client-generated unique identifier (`mut-<timestamp>-<random>`).
- `idempotencyKey`: UUIDv4 header value transmitted via `X-Idempotency-Key` to guarantee idempotency across multiple delivery attempts.
- `url`: Target endpoint URL (e.g. `/api/wayfinder/packing/item-123`).
- `method`: Mutating HTTP method (`POST`, `PUT`, `DELETE`, `PATCH`).
- `headers`: Key-value map of outbound HTTP headers.
- `body`: Serialized JSON payload string or null.
- `entityType`: Domain identifier (`packing_item`, `expense`, `document_field`, `import_job`).
- `entityId`: Associated entity identifier for UI display.
- `action`: Human-readable mutation description (`toggle_packed`, `add_expense`, `update_quantity`).
- `status`: Lifecycle stage (`pending` -> `replaying` -> `completed` / `failed`).
- `attempts`: Integer tracking retry attempts (default: 0).
- `lastError`: Error message captured from failed network response.
- `createdAt`: ISO 8601 creation timestamp.
- `syncedAt`: ISO 8601 completion timestamp.

### 12.3 DOM Event Bus Contracts
- `wayfinder:queue-updated`: Dispatched with `{ count, mutations }` when items are enqueued, removed, or state transitions occur.
- `wayfinder:sync-start`: Dispatched when the background replay processor begins draining pending items.
- `wayfinder:sync-complete`: Dispatched with `{ synced, failed, remaining }` upon queue drain completion, triggering automatic component data refreshes.
- `wayfinder:mutation-synced`: Dispatched with `{ mutation, result }` when an individual mutation is successfully delivered to the Cloudflare edge.

---

## 13. Gemini Extraction Job State & Schema Normalization

Tracks structured extraction metadata, prompt generation, and review validation across both file uploads and inbound forwarded emails:

### 13.1 Extraction Entity Lifecycle
1. `pending`: Document or email attachment registered in `wayfinder_documents` and `wayfinder_extraction_jobs`.
2. `processing`: Serverless Gemini 2.5 Flash / 3.8 Flash REST extraction actively running.
3. `ready_for_review`: Structured fields populated into `wayfinder_extracted_fields` and awaiting traveler confirmation.
4. `approved`: Fields verified; verified itinerary record written to `wayfinder_itinerary_items` and document status updated to `imported`.
5. `rejected`: Extraction dismissed; job marked `rejected` without polluting itinerary schedules.

### 13.2 Normalized Extraction Payload
The structured JSON output produced by `gemini-parser.js` adheres to:
- `item_type`: enum [`flight`, `rail`, `hotel`, `excursion`, `restaurant`, `transport`, `other`]
- `title`: String descriptor (e.g. "PKP Intercity 13100: Wrocław Główny -> Poznań Główny")
- `provider`: Service provider or operator name (e.g. "PKP Intercity", "Delta Air Lines", "Hotel Altus Palace")
- `confirmation_number`: Booking confirmation code or PNR
- `start_date`: ISO date `YYYY-MM-DD`
- `start_time`: 24-hour time `HH:MM`
- `end_date`: Optional ISO date `YYYY-MM-DD`
- `end_time`: Optional 24-hour time `HH:MM`
- `location`: Street address or venue coordinates
- `origin`: Departure station / airport IATA code
- `destination`: Arrival station / airport IATA code
- `price`: Total monetary amount
- `currency`: ISO 4217 currency code (`PLN`, `USD`, `EUR`, `GBP`)
- `seat`: Coach, seat number, or platform
- `notes`: Human-readable summary of cancellation policies, pickup directions, or baggage limits
- `confidence`: enum [`high`, `medium`, `low`]
