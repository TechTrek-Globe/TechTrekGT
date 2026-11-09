# Wayfinder Guide - State Architecture and Data Persistence

## 1. Overview of State Architecture

Wayfinder employs a hybrid state management model combining immutable client-side catalog structures with authenticated, serverless relational persistence. Public city and travel discovery data is static and inlined, while personal travel schedules, uploaded documents, and budget ledgers persist in the shared Cloudflare D1 database.

## 2. Client-Side State Management (React Context)

Client state is partitioned into specialized React Context providers:

- WayfinderContext: Declared in [wayfinder/src/context/WayfinderContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/WayfinderContext.jsx).
  - State Fields: itinerary (chronological list of travel events), accommodations (active lodging bookings enriched with check-in/out dates, vouchers, and metadata), documents (uploaded travel files), jobs (background document extraction tasks), isLoading, and error.
  - Action Handlers: fetchItinerary, fetchAccommodations, fetchDocuments, fetchJobs, uploadDocument, getJobFields, and saveExtractedFields.
  - Lifecycle: Automatically triggers data re-fetching upon user authentication (including itinerary, accommodations, documents, and import jobs) and provides optimistic local updates during document intake.
- AuthContext: Declared in [wayfinder/src/context/AuthContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/AuthContext.jsx).
  - State Fields: user (authenticated profile with id, email, name, is_admin), isAuthenticated, and isLoading.
  - Lifecycle: Inspects /api/auth/me on mount with credentials: 'include'. Coordinates session state across login, registration, and logout actions.
- SettingsContext: Declared in [wayfinder/src/context/SettingsContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/SettingsContext.jsx).
  - State Fields: currency (`USD`, `EUR`, `GBP`, `PLN`), temperature (`F` or `C`), distance (`mi` or `km`), weight (`lbs` or `kg`), and timeFormat (`12h` with AM/PM or `24h` military).
  - Persistence: Persisted to browser localStorage under `wayfinder_user_settings` for instant retrieval across browser sessions.
- Client Document Storage (IndexedDB): Declared in [wayfinder/src/utils/documentStorage.js](file:///e:/TechTrekGT/wayfinder/src/utils/documentStorage.js).
  - Store: `WayfinderDocumentDB` (store name: `document_files`).
  - Capabilities: Persists uploaded booking PDFs and images locally in browser storage, enabling instant previews in [wayfinder/src/components/DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx) even when edge storage (Cloudflare R2) is offline or pending. Falls back to static bundled documents (such as `Poland_Delta.pdf`).
- Timeline Custom Ordering (localStorage): Governed by [wayfinder/src/utils/itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js).
  - Store: `localStorage` key `wayfinder_timeline_order_v1`.
  - Structure: Record mapping day numbers to ordered arrays of timeline item keys (e.g. `{ "1": ["pub-1-confirmed_arrival...-13:30", "pub-1-ska1_airport...-14:15", "acc-1", ...] }`).
  - Synchronization: Broadcasts window event `wayfinder:timeline-order-changed` on every reorder or reset, syncing state across [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) and [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) without page reload.

## 3. Static POI Catalog Memory Model

The core travel guide data lives in the centralized data module [wayfinder/src/data/poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js):

- Immutable Data Structures: Deep JavaScript object trees organizing cities, coordinates, historical narratives, photo assets, operating hours, and verified venue metadata.
- Zero Latency Rendering: By bundling verified POI records directly into the client bundle, city tab navigation executes instantaneously with zero network round-trips.
- Offline Capability: Even when traveling with spotty mobile network roaming or in airplane mode, the complete catalog of attractions, restaurants, and safety details remains fully interactive.

## 4. Persistent Relational Schema (Cloudflare D1)

Private travel data persists in the dedicated Cloudflare D1 database (`wayfinder-db`, ID: `f95ad16e-8b63-419e-b828-d749b6fdd8f1`) governed by [wayfinder/schema-wayfinder.sql](file:///e:/TechTrekGT/wayfinder/schema-wayfinder.sql):

- Tables `users`, `email_verifications`, and `password_resets`:
  - Core identity, PBKDF2 password hashes, API key entitlements (`api_key_enabled`), 8-digit HMAC verification codes, and password recovery tokens.
- Table wayfinder_journeys:
  - Stores journey containers (such as poland-christmas-2026) with ownership and visibility flags.
  - Fields: id, slug, title, tagline, description, hero_image_url, start_month, start_year, start_date, end_date, status, visibility, created_by, created_at, updated_at.
- Table wayfinder_itinerary_items:
  - Stores scheduled events and milestones within a journey with normalized booking columns.
  - Fields: id, journey_id, user_id, destination_id, item_type (flight, hotel, rail, excursion, restaurant, other), title, provider, supplier, confirmation_number (indexed via `idx_wf_items_confirmation`), booking_reference, status, verification_status, local_date, local_time, end_date, end_time, timezone, location, location_address, origin, destination, room_type, seat, guests, tickets, language, duration, pickup_window, bag_restriction, mobile_ticket_url, activity_details_url, import_source, notes, source_document_id, purchase_site, payment_method, visibility, has_conflict, conflict_notes, created_at, updated_at.
- Table wayfinder_documents:
  - Stores metadata and references for uploaded booking documents and inbound email attachments.
  - Fields: id, user_id, journey_id, original_filename, safe_display_name, mime_type, file_size_bytes, file_hash, storage_key, storage_status, upload_date, processing_status, detected_provider, detected_doc_type, security_scan_status, extraction_version, retention_status, deleted_at, deleted_by.
- Table wayfinder_expenses, wayfinder_expense_splits & wayfinder_expense_settlements:
  - Tracks trip costs, receipt currencies, 50/50 participant balance splits, and debt settlements (`expense_id`, `split_id`).
  - Fields: id, journey_id, itinerary_item_id, document_id, user_id, paid_by_name, paid_by_user_id, category, description, amount_original, currency_original, amount_usd, purchase_site, payment_method, paid_status, verification_status, created_at.
- Table wayfinder_extraction_jobs & wayfinder_extracted_fields:
  - Tracks document field parsing tasks (`id`, `document_id`, `user_id`, `status`, `reviewed_at`, `reviewed_by`, `review_decision`) and field-level extraction results.
- Table wayfinder_audit_events:
  - Immutable audit log with normalized context columns (`target_user_id`, `target_email`, `previous_value`, `new_value`, `metadata_summary`, `details`).
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

### 6.4 PDF Text Extraction and Profitroom Ingestion State

To process raw booking vouchers without external OCR API dependencies, the import pipeline leverages in-memory stream extraction:
- `extractPdfText`: Decompresses flate streams with `node:zlib`, parses variable-width CMaps, and decodes textual operators (`Tj`/`TJ` kerning arrays) alongside uncompressed URI strings.
  - `findStreamBoundaries`: Scans raw PDF binary buffers using byte offsets to isolate stream payloads across CRLF, LF, and CR delimiters.
  - `decompressStream`: Sequentially attempts zlib inflate, raw inflate (`inflateRawSync`), and uncompressed ASCII text fallback.
  - `parseCMapEntries`: Parses `beginbfchar` and `beginbfrange` blocks, supporting variable code lengths (2-byte and 4-byte hex keys) and mapping them to UTF-16BE / UTF-8 characters.
  - `extractTextFromContentStream`: Decodes literal strings `(text) Tj` with balanced parenthesis handling, hex strings `<hex> Tj`, single-quote newline operators, and array kerning expressions `[(string) kern (string)] TJ` with automatic word-spacing on kerning deltas < -100.
- Heuristic Parser Enhancements: Multi-pattern date extraction (Arrival/Departure, Check-in/Check-out, Polish month words, European and ISO formats), dynamic hotel/venue title extraction, Polish address matching (`ul. ...`), and multi-currency parsing (PLN/zł, USD/$, EUR/€) with comma decimal normalization.
- Client-Side Re-Parse Cache Recovery: When document re-parse requests omit a local file reference, `WayfinderContext.jsx` queries IndexedDB via `getLocalDocumentFile` to rehydrate the binary payload before sending to the server.
- Profitroom Engine Ingestion: Normalizes confirmation numbers (7-letter alphanumeric `IMIWHDH`), hotel name (`Hotel Altus Palace Wrocław`), address (`ul. Wierzbowa 15, 50-056 Wrocław`), room type (`Junior Suite`), check-in/out timestamps (`2026-12-07 15:00` to `2026-12-09 12:00`), and Polish zloty totals (`1,420.20 zł` / `1420.20 PLN` / `$359.79 USD`).
- Sanitized Thousand Separators: Pre-processes numeric fields to collapse whitespace in Polish currency formats (e.g. `1 420.20` -> `1420.20`), eliminating numeric drop errors.
- Automatic Title Upgrades: When generic PDF names like `Your booking confirmation.pdf` are parsed, `safe_display_name` in `wayfinder_documents` is automatically upgraded to `${provider} Confirmation.pdf`.

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
- Cross-Source Accommodation Deduplication: When `dayPrivate` contains a hotel booking matching a curated accommodation (e.g. `Altus Palace Wrocław`), the static accommodation is suppressed to prevent duplicate cards, and the private booking is enriched with `phone`, `email`, and `website_url`.
- Private Hotel Deduplication: Filters redundant private hotel entries for the same document or hotel key.
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
- `purchase_site`: booking vendor or platform website (e.g. `Booking.com`, `Hotels.com`, `Delta.com`, `PKP Intercity`, `GetYourGuide`, `On-Site`).
- `payment_method`: method or instrument used for payment (e.g. `American Express`, `Visa`, `Mastercard`, `Apple Pay`, `PayPal`, `Cash`).
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
  - `supplier`: Tour operator or service provider (strictly null for hotels).
  - `pickupWindow`: Confirmed pickup timeframe (strictly null for hotels).
  - `bagRestriction`: Museum size limits (strictly null for hotels).
  - `rawTickets`: Participant and ticket counts with duration decoupled.
  - `rawDuration`: Parsed duration (e.g. `11 hours`).
  - `mobileTicketUrl` & `activityDetailsUrl`: Canonical web booking links (strictly null for hotels; only populated for excursions and GetYourGuide bookings).
  - `description`: Curated narrative description preventing raw metadata leakage.

---

## 11. Core Lodging & Expedition Expense State Ingestion

Active persistent entities for confirmed trip reservations:

### 11.1 Hotel Experior Boutique Kraków
- Document Record (`wayfinder_documents`): `id: 1b8d5a44-96a7-4ee5-905b-2b0a6e1274b5`, `original_filename: english check-in voucher (for visa application).pdf`, `safe_display_name: Hotel: Your booking at Hotel Experior Boutique - Destigo Hotels has been confirmed-NoReply`, `storage_status: imported`, `processing_status: imported`.
- Itinerary Record (`wayfinder_itinerary_items`): `id: bffe6e8f-54ce-4211-816b-2fd61ae75697`, `item_type: hotel`, `title: Hotel Experior Boutique Kraków (Check-in)`, `local_date: 2026-12-04`, `local_time: 15:00`, `end_date: 2026-12-07`, `source_document_id: 1b8d5a44-96a7-4ee5-905b-2b0a6e1274b5`.
- Expense Record (`wayfinder_expenses`): `id: exp-altus-palace-hotel`, `amount_original: 366.43`, `currency_original: USD`, `amount_usd: 366.43`, `paid_by_name: Jon Kemp`, `paid_by_user_id: usr-1785511589441-3fvgv`, `category: lodging`, linked to splits `spl-1793468636871-ioshc` ($183.22 USD) and `spl-1793468636925-hs8y2` ($183.21 USD).

### 11.2 Hotel Altus Palace Wrocław
- Document Record (`wayfinder_documents`): `id: doc-altus-palace-wroclaw`, `original_filename: Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`, `storage_status: imported`, `processing_status: imported`.
- Itinerary Record (`wayfinder_itinerary_items`): `id: itin-altus-palace-wroclaw`, `item_type: hotel`, `title: Altus Palace Wrocław 5-Star Stay (Check-in)`, `local_date: 2026-12-07`, `local_time: 15:00`, `end_date: 2026-12-09`, `end_time: 11:00`, `source_document_id: doc-altus-palace-wroclaw`.
- Expense Record (`wayfinder_expenses`): `id: exp-altus-palace-wroclaw-hotel`, `amount_original: 2400.00`, `currency_original: PLN`, `amount_usd: 600.00`, `paid_by_name: Jonathan Kemp`, `category: lodging`, linked to splits `spl-altus-wroc-1` (1,200.00 PLN) and `spl-altus-wroc-2` (1,200.00 PLN).

### 11.3 Hotel Brovaria Poznań
- Document Record (`wayfinder_documents`): `id: 266f700b-0004-444c-915b-af303a822083`, `original_filename: confirmation of payment.pdf`, `safe_display_name: BROVARIA Room reservation (confirmation of payment.pdf)`, `storage_status: imported`, `processing_status: imported`.
- Itinerary Record (`wayfinder_itinerary_items`): `id: e7cbb11e-a89d-4546-8f6a-f0675f8f9749`, `item_type: hotel`, `title: Hotel Brovaria Poznań (Room Reservation)`, `local_date: 2026-12-09`, `local_time: 15:00`, `end_date: 2026-12-10`, `source_document_id: 266f700b-0004-444c-915b-af303a822083`.
- Expense Record (`wayfinder_expenses`): `id: exp-brovaria-hotel-poznan`, `amount_original: 450.00`, `currency_original: PLN`, `amount_usd: 112.50`, `paid_by_name: Jonathan Kemp`, `category: lodging`, linked to splits `spl-brovaria-1` (225.00 PLN) and `spl-brovaria-2` (225.00 PLN).

### 11.4 Inbound Transatlantic Flights
- Document Record: `ea78634a-eaa9-46e8-b40c-b3703bb6e2ca` (`Poland_Delta.pdf`).
- Itinerary Record: `471a82a3-2251-4d01-a308-a8f084b6108a` (`Flight: ATL to KRK`).
- Expense Record: `exp-delta-flight-dl9208`, `amount_original: 1980.00`, `currency_original: USD`, `amount_usd: 1980.00`, `paid_by_name: Ronald Milton Few`, `paid_by_user_id: usr-ronald-few`, linked to splits `spl-flight-jon` (Jonathan owes $990.00 USD) and `spl-flight-ronald` (Ronald paid share of $990.00 USD).

### 11.5 Auschwitz & Wieliczka Guided Excursion
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
- `purchase_site`: Booking platform or website (e.g. `Booking.com`, `Hotels.com`, `Delta.com`, `PKP Intercity`, `GetYourGuide`, `On-Site`)
- `payment_method`: Method or card used for payment (e.g. `Visa`, `Mastercard`, `American Express`, `Apple Pay`, `PayPal`, `Cash`)
- `notes`: Human-readable summary of cancellation policies, pickup directions, or baggage limits
- `confidence`: enum [`high`, `medium`, `low`]

---

## 14. Document Cascade Deletion & Purge Lifecycle

To allow travelers to remove erroneously imported documents (e.g., incorrect dates, mismatched venues, or botched OCR scans) and re-import cleanly without duplicate file hash collisions:

### 14.1 Cascading Purge Sequence (`DELETE /api/wayfinder/documents/:id`)
When a document deletion is requested by the document owner or journey participant:
1. `wayfinder_expense_splits`: Removes all split allocations linked to child expenses of the document (`DELETE FROM wayfinder_expense_splits WHERE expense_id IN (SELECT id FROM wayfinder_expenses WHERE document_id = ?)`).
2. `wayfinder_expenses`: Deletes all expense ledger records created from this document (`DELETE FROM wayfinder_expenses WHERE document_id = ?`).
3. `wayfinder_itinerary_items`: Deletes all itinerary bookings generated from this document (`DELETE FROM wayfinder_itinerary_items WHERE source_document_id = ?`).
4. `wayfinder_extracted_fields`: Clears all parsed field records (`DELETE FROM wayfinder_extracted_fields WHERE document_id = ?`).
5. `wayfinder_extraction_jobs`: Clears extraction processing jobs (`DELETE FROM wayfinder_extraction_jobs WHERE document_id = ?`).
6. `wayfinder_documents`: Hard deletes the document row (`DELETE FROM wayfinder_documents WHERE id = ?`).
7. IndexedDB Binary Purge: Removes the cached PDF or image blob from local browser storage via `documentStorage.deleteDocument(docId)`.

### 14.2 Hash Lock Release & Re-Import Capability
Because `wayfinder_documents` enforces SHA-256 file hash checks (`file_hash`) to avoid duplicate uploads, hard deletion purges the hash record from D1. This allows the traveler to immediately re-upload the same document or an amended copy with zero "duplicate document" blocks.

### 14.3 Document Renaming State Lifecycle (`PUT` / `PATCH /api/wayfinder/documents/:id`)
Allows travelers to edit the display title of stored travel documents:
1. Client Mutation: Dispatched via `renameDocument(docId, newTitle, journeyId)` in `WayfinderContext.jsx` with `{ safe_display_name: newTitle }`.
2. D1 Update: Edge worker updates `wayfinder_documents.safe_display_name` and logs the previous and new title in `wayfinder_audit_events`.
3. Optimistic State Propagation: Instantly updates local `documents` state in context and triggers background refreshes for all itinerary and document views.
4. Static Fallback Protection: Strict heuristic boundaries ensure that renaming or viewing documents never causes non-Altus lodging to resolve to `Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`.

## 15. Extraction Job Execution State & Approval Re-Sync

Governs the state transitions, foreign key alignment, and ledger synchronizations when travel confirmation fields are extracted, edited, and approved via [import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js):

### 15.1 Atomic Extracted Fields Mutation State
- Extracted fields storage in `wayfinder_extracted_fields` executes atomically:
  - Both `/parse` (serverless extraction) and `/fields` (client-side extraction) combine `DELETE FROM wayfinder_extracted_fields WHERE document_id = ?` and new `INSERT` statements into a single Cloudflare D1 `env.DB.batch([deleteStmt, ...stmts])`.
  - Guarantees zero orphaned rows or empty states if an error occurs mid-operation.
  - Sensitive field filtering is normalized (`isSensitiveField`), allowing `payment_method` while stripping card numbers, CVVs, and passport IDs.

### 15.2 Target Item Foreign Key State Alignment
- Approval route (`action === 'approve'`) checks for existing items by `source_document_id`:
  - `targetItemId = existingItem ? existingItem.id : generateId();`
  - Re-approving an already imported document performs an `UPDATE` on `wayfinder_itinerary_items` instead of an `INSERT`.
  - `targetItemId` is consistently bound to `wayfinder_expenses.itinerary_item_id`, `wayfinder_audit_events`, and the response JSON (`itinerary_item_id: targetItemId`), eliminating detached or phantom foreign keys.

### 15.3 Re-Approval Expense Synchronization & 50/50 Split Rounding
- When a document includes a parsed cost (`total_cost`, `cost`, `price`, `amount`):
  - Split rounding avoids penny loss on odd amounts:
    - `split1 = Math.floor((parsedCost.amount / 2) * 100) / 100` (assigned to user / payer)
    - `split2 = Number((parsedCost.amount - split1).toFixed(2))` (assigned to Ronald Milton Few)
    - Invariant: `split1 + split2 === parsedCost.amount` strictly holds across all amounts.
  - Initial Approval: Inserts `wayfinder_expenses` and two `wayfinder_expense_splits` rows.
  - Re-Approval: When `existingExpense` exists for the document, an `UPDATE` statement updates `wayfinder_expenses` (`amount_original`, `currency_original`, `description`, `purchase_site`, `payment_method`) and updates both `wayfinder_expense_splits` rows with recalculated split amounts, ensuring traveler price edits propagate to the shared ledger.

## 16. Edge API Hardening & State Mutation Invariants

Governs the state invariants, atomic transaction guarantees, and edge lifecycle contracts across Wayfinder backend services:

### 16.1 Shared Journey Resolution & Expense Normalization
- Journey Lookup Invariant:
  - Approval and budget queries resolve journeys using `(journey_id = ? OR journey_id = ?)` against both `journey.id` and `journey.slug`, with fallback to the platform default `poland-christmas-2026`.
- Amount USD Normalization:
  - Both `import-jobs.js` and `expenses.js` compute and persist `amount_usd` upon creation and edit (`parsedCost.amount` for USD, `Math.round((amount / 4.0) * 100) / 100` for PLN, `Math.round((amount * 1.08) * 100) / 100` for EUR), preventing imported ledger items from classifying as unpriced items in `budget.js`.
  - Ledger queries in `budget.js` surface shared expenses where the user has an assigned split in `wayfinder_expense_splits`, ensuring companion expenses are accounted for.

### 16.2 Atomic Mutation Batch Invariants
- All multi-statement write operations across `expenses.js` (`POST /preset`, `POST /expenses`, `PUT /expenses/:id`, `DELETE /expenses/:id`, `DELETE /settle`) execute via atomic `env.DB.batch(stmts)`.
- Eliminates orphaned split records or partial state transitions on network or database exceptions.
- Preset seeding checks existing descriptions (`SELECT description FROM wayfinder_expenses WHERE journey_id = ? OR journey_id = 'poland-christmas-2026'`), executing insert batches only for novel entries.

### 16.3 Inbox Lifecycle & Calendar Rollover Invariants
- Email Inbox State:
  - When provisioning an inbox via `POST /api/wayfinder/email-inboxes`, existing soft-deleted records (`is_active === 0`) are reactivated to `is_active = 1` in D1, restoring email forwarding without violating the unique `(user_id, journey_id)` database constraint.
- RFC 5545 Chronological Invariant:
  - The calendar generator applies `addMinutesWithDate(dateStr, timeStr, minsToAdd)` across scheduled activities, flight arrivals, hotel check-in/out, and private items.
  - Invariant: `DTEND >= DTSTART` strictly holds even when activities or bookings cross midnight (advancing `endDate` via `addDays(dateStr, Math.floor(total / 1440))`).

### 16.4 API Key Connectivity & Parsing Authentication Invariants
- API Key Connectivity Invariant:
  - `isApiKeyConnected(env)` checks `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `GOOGLE_MAPS_API_KEY` for non-empty string content.
  - In `callGeminiRestApi`, requests missing a valid API key throw an explicit error before initiating any network `fetch`.
  - Default model targets `gemini-3.5-flash` with `env.GEMINI_MODEL` override for current Google Generative Language API compatibility.
- Authenticated Parser Gating:
  - Gemini extraction in `parseBookingDocument` executes only when both `isApiKeyConnected(env)` and `user?.userId` are present.
  - If unauthenticated or if the API key is disconnected, Gemini calls are bypassed and execution gracefully falls back to `heuristicParseDocument` with structured warning logs, guaranteeing zero 500 crashes or leaked exceptions to clients.
- Production Secret Deployment:
  - `GEMINI_API_KEY` is persisted in local development via `.dev.vars` and provisioned to Cloudflare Workers production environment via `wrangler secret put GEMINI_API_KEY`.

### 16.5 Account-Level API Key Entitlements & Administrative Governance
- Database Column Extension (`users.api_key_enabled`):
  - Extends the shared platform `users` table with `api_key_enabled INTEGER NOT NULL DEFAULT 0`.
  - Administrator accounts (`role = 'admin'` or `is_admin = 1`) possess default entitlement to the API key.
- Parser Entitlement Gating Invariant:
  - In `gemini-parser.js`, before initiating any Gemini REST API request, the engine validates that the user is authenticated AND `api_key_enabled === 1` in D1 (or `isAdmin` is true).
  - Unentitled accounts trigger a structured log warning and immediately fall back to local heuristic extraction, preventing unauthorized consumption of Gemini tokens while maintaining flawless user experience.
- Session Claims & Auth Serialization:
  - `me.js` and `login.js` query and serialize `isAdmin` and `apiKeyEnabled` into public user payloads and JWT tokens, providing consistent client state across the application lifecycle.
- Real-Time Admin State Mutation:
  - `POST /api/wayfinder/admin/user-api-access` updates `api_key_enabled` in D1 with atomic validation.
  - `POST /api/wayfinder/admin/user-status` updates user status (`Active`/`Suspended`) and bumps `token_version` on suspension to revoke active sessions.

### 16.6 Layout, Navigation & Coordinate Invariants
- Fixed Navigation Anchor Invariant:
  - `Layout.jsx` enforces `sticky top-0 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-[#b48214]/30 shadow-xl` without CSS transforms or intermediate overflow scroll contexts, locking navigation to the viewport top across all pages.
- Overflow Clipping Boundary:
  - The root layout container applies `overflow-x-clip flex-1` rather than `overflow-x-hidden`. This prevents Blink/WebKit from instantiating an internal scroll container trap that miscalculates child sticky offsets.
- Sub-Toolbar In-Flow Invariant:
  - In `PrivateHub.jsx`, the journey sub-toolbar resides directly in document flow (`relative z-20 w-full`) without child `sticky top-14` positioning. This prevents coordinate displacement inside `<main>`, guaranteeing gap = 0.0px directly against the sticky main navbar.
- Day Header Sticky Realignment:
  - In both `ItineraryView.jsx` and `PolandLanding.jsx` (`JourneyStopSchedule`), daily timeline headers specify `sticky top-14 sm:top-16 z-20 bg-slate-950/95 backdrop-blur-md` matching the main navbar height (`h-14 sm:h-16`). Each day's schedule items are enclosed in a `relative space-y-4` container, and the parent stop card container omits `overflow-hidden`, preserving viewport scroll context and ensuring natural CSS sticky replacement as successive days scroll into view.

### 16.7 Public Schedule Isolation & Unauthenticated Data Invariants
- Public State Boundary:
  - The static POI catalog (`polandJourney.itinerary`) must never contain personal booking confirmations, passenger identities, or booking reference codes.
  - Public timeline events for transit arrival and departures describe destination milestones ("Target Arrival: Kraków Airport (KRK)", "Morning Departure: Gdańsk (GDN) -> Amsterdam (AMS)") with public badges.
- Timeline Overlay State:
  - `buildUnifiedDayTimeline(dayItem, dayPrivate, dayAccommodations, isAuthenticated)` dynamically upgrades public flight events to confirmed personal itineraries and injects private D1 records only when `isAuthenticated === true`.
  - When `isAuthenticated === false`, `dayPrivate` and `dayAccommodations` are forced to empty collections (`[]`), ensuring unauthenticated visitors cannot access private reservations.
- Document Vault Gating Invariant:
  - `DocumentViewerModal` verifies `isAuthenticated` on mount and enforces an early return (`if (!isOpen || !isAuthenticated) return null;`), preventing unauthenticated preview or transmission of private vouchers and PDF records.
- Calendar Sync Authentication Gating Invariant:
  - `CalendarSubscribeModal` requires `isAuthenticated === true` (`if (!isOpen || !isAuthenticated) return null;`), preventing unauthenticated initialization or feed token retrieval.
  - Cloudflare edge worker route `GET /api/wayfinder/calendar/export.ics` enforces `requireAuth` (`if (!auth.ok) return auth.error;`), restricting .ics snapshot downloads to authenticated sessions.
- Schedule Stop Scope Invariant:
  - `JourneyStopSchedule` resolves `isAuthenticated` from props and context fallback, guaranteeing safe evaluation of `dayPrivate` and `dayAccommodations` across both authenticated and unauthenticated rendering paths with zero undefined reference exceptions.

### 16.8 Deep-Linking, Smooth Auto-Scroll & Navigation State Invariants
- Deterministic DOM Identifier Invariant:
  - All sights in `mustSee` and all markets in `markets` across all 5 itinerary cities (Kraków, Wrocław, Poznań, Toruń, Gdańsk) must possess unique, explicit, kebab-case `id` strings matching destination hashtag targets in `itineraryTimeline.js`.
  - Cards render with `id={sight?.id}` / `id={market.id}` and `scroll-mt-36` to ensure the viewport clears fixed sticky headers (56px navbar + sticky sub-toolbar).
- Deep-Link Scroll Preemption Invariant:
  - In `CityPage.jsx`, `useLayoutEffect` strictly checks `if (typeof window !== 'undefined' && window.location.hash) return;`.
  - Generic sub-page header scroll animations are bypassed whenever a hash is present in the URL, granting exclusive control to the target tab component's smooth scrolling logic.
- Target Highlight Lifecycle:
  - When a target hash (`#targetId`) or query parameter (`?sight=...`, `?market=...`) is detected upon mount or `hashchange`, the target DOM node is smoothly scrolled to `block: 'center'`.
  - The node receives transient highlight styling (`ring-4 ring-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.8)]`).
  - An unmount/cleanup timer removes the ring after exactly 3500ms to restore default card styling without polluting DOM state.
- Market Grid Mounting Invariant:
  - When deep-linking to an individual Christmas market, `CityMarketsTab.jsx` automatically sets `activeMarketTab = 'all'`, ensuring all market articles are rendered into the DOM before `document.getElementById` executes.
- Geographic Turn-by-Turn Routing Invariant:
  - All direct navigation anchors (`MustSeeCard`, `CityMarketsTab`, `ItineraryView`, `PolandLanding`) generate Google Maps URL strings with fully qualified query parameters (`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${venueLocation}, ${cityName || 'Poland'}`)}`).
  - Appending the explicit city name prevents Google Maps from resolving identical street names in foreign jurisdictions.

### 16.9 Compact Tile Geometry & Action Footer Invariants
- Tile Viewport Fitting Invariants:
  - Attraction card hero images maintain responsive heights (`h-36 sm:h-40 md:h-44`) to cap card vertical dimensions at <= 500px, allowing complete tiles to remain in the active desktop and laptop viewport alongside top navigation and routing tools.
  - Attraction descriptions are strictly clamped to `line-clamp-3` to prevent variable multiline text from skewing grid row alignment or causing card overflow.
- 2-Column Action Footer Invariant:
  - Action button containers across attraction (`MustSeeCard`), dining (`CityFoodTab`), and venue (`CityLgbtqTab`) cards must maintain a 2-column responsive grid layout (`grid grid-cols-2 gap-2`).
  - Truncation classes (`truncate`) are prohibited on action button labels (`Website`, `Directions`, `View on Map`, `+ Itinerary` / `Saved`), guaranteeing full text visibility without ellipsis clipping across all card widths.
  - When unauthenticated, the secondary action ("View on Map") spans full width (`col-span-2`) to maintain balanced grid geometry.


### 16.10 Shared Agenda Invite & Share State

- Tables (`schema-wayfinder.sql`, also created idempotently at runtime by `ensureShareTables` in `functions/utils/agendaAccess.js`): `wayfinder_agenda_invites` (`id`, `agenda_id`, `invited_email` NOCASE, `role`, `token_hash` UNIQUE, `status` pending|accepted|revoked, `invited_by`, `created_at`, `expires_at`, `accepted_at`, `accepted_by`) and `wayfinder_agenda_shares` (`agenda_id`, `user_id`, `role`, `invite_id`, UNIQUE(`agenda_id`,`user_id`)).
- Raw invite tokens are never persisted. The client stores a pending token only in `sessionStorage` key `wf_pending_invite` (not an auth token) until claimed.
- `PrivateHub` & `WayfinderContext` state: `agendaAccess` object `{ role, permissions, loaded }` (from `GET /agendas/poland-christmas-2026/access`) drives collaborator access across Itinerary, Packing, Expense Ledger, and Documents. Linked collaborator accounts have access scoped by their capability matrix. `canShare` (owner/admin) controls collaborator invite modal access.
- `journeys.js` list/detail also return agendas shared with the caller.

### 16.11 Multi-User Tenant Isolation & Access Control Invariants

- Canonical Access Resolution Invariant:
  - Caller role must resolve deterministically via `resolveAgendaAccess(env, ref, user)` to one of: `owner`, `admin`, `editor`, `viewer`, or `none`.
  - Unaffiliated authenticated users with no membership row in `wayfinder_agenda_shares` and no ownership of `wayfinder_journeys` resolve strictly to `role: 'none'`.
- Cryptographic Ownership Invariant:
  - Implicit ownership by previous inviters (`invited_by`) is strictly prohibited.
  - Ownership is rooted in `wayfinder_journeys.created_by = user.userId` (or platform administrator status verified via `users.is_admin = 1`).
  - Journey record `'poland-christmas-2026'` is relationally owned by primary administrator ID `'usr-1785511589441-3fvgv'`.
- Sensitive Data Boundary Invariant:
  - Document vaults (`documents.js`), Expense Ledgers (`expenses.js`), Aggregated Budgets (`budget.js`), and Extraction Jobs (`import-jobs.js`) require `canViewSensitive(role)` (`owner` or `admin`).
  - `editor`, `viewer`, and `none` callers querying sensitive endpoints receive HTTP 403 Forbidden.
  - Naive fallbacks matching `journey.visibility !== 'public'` or hardcoded `OR journey_id = 'poland-christmas-2026'` are prohibited on all sensitive queries.
- Accommodations Data Sanitization Invariant:
  - Accommodations endpoint requires `isMember(role)`. Non-members receive an empty list (`[]`).
  - For non-sensitive member roles (`editor`, `viewer`), financial costs (`total_cost`, `currency`), and source document metadata (`source_document_id`, `filename`, `safe_display_name`, `mime_type`) are scrubbed to `null`.
- Client-Side Isolation & Lazy Evaluation Invariant:
  - `WayfinderContext` state hooks (`fetchDocuments`, `fetchJobs`) are gated on `agendaAccess.permissions.documents`. Unauthorized accounts never query or store private documents in client state.
  - If `role === 'none'`, `PrivateHub` renders `NoAccessPanel` and unmounts all private subviews (`ItineraryView`, `DocumentCenter`, `ExpenseLedger`, `PackingManager`).
  - Unpermitted deep link paths are intercepted and replaced with `/private`, rendering an explanatory notice.

### 16.12 Email Verification State & Invariants (`email_verifications`)

- Table Schema (`personal-budget-db`):
  - `email_verifications` (`id` TEXT PRIMARY KEY, `user_id` TEXT NOT NULL, `email` TEXT NOT NULL, `token` TEXT NOT NULL, `expires_at` INTEGER NOT NULL, `used` INTEGER NOT NULL DEFAULT 0, `attempts` INTEGER NOT NULL DEFAULT 0, `created_at` INTEGER NOT NULL).
- Verification Token Hashing Invariant:
  - Tokens are stored as SHA-256 HMAC digests using message format `verify:${cleanEmail}:${verificationCode}` signed with `CODE_HMAC_SECRET || JWT_SECRET`. Plaintext verification codes are never stored.
- Sign In Gating Invariant:
  - `POST /api/auth/login` checks `user.email_verified === 1 || Boolean(user.email_verified_at)`.
  - Accounts with `email_verified = 0` are denied session issuance with HTTP 403 and `code: 'EMAIL_VERIFICATION_REQUIRED'`.
- Code Lifecycle & Invalidation:
  - Verification codes expire after exactly 24 hours (`now + 86,400,000ms`).
  - After 5 invalid attempts, the verification record is marked `used = 1` to prevent brute force discovery.
  - Resending verification code invalidates all prior unconsumed codes for that user/email before inserting a new record.

### 16.13 Admin Dashboard Trip Collaboration State & Invariants

- Dual Role Invariant:
  - Platform administrator status is strictly read from `users.role = 'admin'` or `users.is_admin = 1`.
  - Trip collaborator role is read from `wayfinder_agenda_shares.role` (`viewer`, `editor`, `admin`), or `'owner'` if `wayfinder_journeys.created_by = user.id`.
  - Administrative endpoints never overwrite platform role when updating trip collaborator membership, nor vice versa.
- Trip Membership Mutation Invariant (`POST /api/wayfinder/admin/trip-membership`):
  - Validates `role` in `['viewer', 'editor', 'admin', 'none', 'unaffiliated']`.
  - When `role` is `'none'` or `'unaffiliated'`, atomically deletes the collaborator from `wayfinder_agenda_shares` and records an `admin_unaffiliate_trip_user` audit event.
  - Prohibits demoting or altering the permissions of the trip owner (`journey.created_by === userId`).
  - Upserts into `wayfinder_agenda_shares` with `ON CONFLICT(agenda_id, user_id) DO UPDATE SET role = excluded.role`.
- Collaborator Disconnection Invariant (`POST /api/wayfinder/admin/trip-membership/remove`):
  - Deletes matching `(agenda_id, user_id)` from `wayfinder_agenda_shares`.
  - Prohibits disconnecting the trip owner.
- Platform Role Modification Invariant (`POST /api/wayfinder/admin/user-role`):
  - Accepts `role` in `['admin', 'user']` and synchronizes `users.role` and `users.is_admin`.
  - Strictly prevents callers from demoting their own active platform admin account (`userId === user.userId`).

### 16.14 Account Deletion State & Invariants

- Atomic Cascading Purge (`deleteUserAccount`):
  - Execution runs strictly inside a single `env.DB.batch(stmts)` array, guaranteeing all statements commit atomically or rollback completely on error.
  - Clears `wayfinder_agenda_shares`, `wayfinder_agenda_invites`, `email_verifications`, `password_resets`, `wayfinder_calendar_tokens`, `wayfinder_packing_items`, `wayfinder_expense_splits`, `wayfinder_expense_settlements`, `wayfinder_email_inboxes`, `wayfinder_gmail_connections`, `wayfinder_extracted_fields`, `wayfinder_extraction_jobs`, `wayfinder_documents`, and `wayfinder_expenses`.
  - Preserves Public Guide Continuity: If the deleted user created system journeys (e.g., `poland-christmas-2026`), `wayfinder_journeys.created_by` is safely updated to `'system'` rather than cascaded or deleted, preventing loss of platform-wide itineraries.
- Session Invalidation Invariant:
  - Whenever an account is deleted (either via self-service `/api/auth/delete-account` or an administrator deleting their own account via `/api/wayfinder/admin/user-delete`), the response MUST return `Set-Cookie: auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`.
- Audit Logging Invariant:
  - Account deletion records an immutable audit event in `wayfinder_audit_events` with `action = 'account_deleted'` capturing `deletedUserId`, `deletedEmail`, and `isSelf`.

### 16.15 Transactional Email & Modal Viewport Invariants

- Cloudflare Email Routing Configuration Invariant:
  - The canonical sender address for Wayfinder transactional emails is bound to `noreply@techtrekgt.com` via `wrangler.jsonc` `MAIL_FROM` variable.
  - Workers use the `SEND_EMAIL` binding with native `EmailMessage` and base64 RFC 5322 MIME encoding.
  - Gating endpoints (`/api/auth/register`, `/api/auth/resend-verification`) never suppress mail delivery errors; non-zero delivery failures bubble up as explicit errors or warnings.
- Viewport & Stacking Invariant:
  - Authentication modal (`AuthModal.jsx`) maintains an invariant `z-[100]` stacking index, strictly superseding the `sticky top-0 z-50` navigation header.
  - Modal dialog frame enforces `max-h-[85vh]` with `shrink-0` header/footer anchors and an internal `overflow-y-auto` scroll container, preventing title clipping across all device viewports.

### 16.16 D1 Write-Volume Governance & Idempotency Invariants

- Isolate-Scoped DDL Singleton Invariant:
  - Runtime schema helpers (`ensureTables` in `expenses.js`, `ensureTable` in `packing.js`, `ensureCalendarTable` in `calendar.js`, and `ensureShareTables` in `agendaAccess.js`) cache completion state in isolate-scoped flags (`tablesReady`, `packingTableReady`, `calendarTableReady`) with in-flight promise locks (`tablesInitPromise`, `packingTablePromise`, `calendarTablePromise`, `shareTablesPromise`).
  - `ALTER TABLE` statements are strictly prohibited on request hot paths.
  - `GET` handlers never proactively invoke DDL helpers; DDL only executes on write requests (`POST`, `PUT`, `DELETE`) or if a `SELECT` throws `no such table`.
- Read-Only `GET` Invariant:
  - `GET /api/wayfinder/import-jobs/:doc_id` never inserts into `wayfinder_extraction_jobs` or `wayfinder_extracted_fields`; missing records are synthesized as virtual preview objects (`virtual-job-*`, `virtual-fld-*`) until a user-initiated `POST` or `PUT` mutation occurs.
  - `GET /api/wayfinder/calendar/feed/:token.ics` throttles `poll_count` and `last_polled_at` updates to once per 6-hour window per token (`6 * 60 * 60 * 1000` ms).
- Idempotent Batch & Client Mutation Invariants:
  - `POST /api/wayfinder/packing` (`action: 'apply_preset'`) deduplicates preset items by `(category, name)` before executing `env.DB.batch`.
  - `PUT /api/wayfinder/expenses/:id` diffs incoming split allocations against existing `wayfinder_expense_splits` rows and omits `DELETE` + `INSERT` statements when unchanged.
  - `handleInboundEmail` (`email-worker.js`) deduplicates against `wayfinder_itinerary_items` by `confirmation_number` or `(title, local_date)` prior to executing the 16-row batch insert.
  - Client-side `PackingManager.jsx` debounces per-item `PUT` updates by 400ms, and `mutationQueue.js` drops failed offline mutations after 5 failed attempts (`nextAttempts >= 5`).

### 16.17 Dedicated Database (`wayfinder-db`) & Relational Normalization Invariants

- Database Isolation Invariant:
  - Wayfinder binds `env.DB` exclusively to `wayfinder-db` (`f95ad16e-8b63-419e-b828-d749b6fdd8f1`) in `wayfinder/wrangler.jsonc`.
  - All 16 tables (`users`, `email_verifications`, `password_resets`, `wayfinder_journeys`, `wayfinder_destinations`, `wayfinder_itinerary_items`, `wayfinder_documents`, `wayfinder_extraction_jobs`, `wayfinder_extracted_fields`, `wayfinder_expenses`, `wayfinder_expense_splits`, `wayfinder_expense_settlements`, `wayfinder_audit_events`, `wayfinder_email_inboxes`, `wayfinder_gmail_connections`, `wayfinder_packing_items`, `wayfinder_calendar_tokens`, `wayfinder_agenda_invites`, `wayfinder_agenda_shares`) reside in `wayfinder-db`.
- Normalized Itinerary Columns Invariant:
  - Structured booking attributes (`supplier`, `confirmation_number`, `booking_reference`, `origin`, `destination`, `room_type`, `seat`, `guests`, `tickets`, `language`, `duration`, `pickup_window`, `bag_restriction`, `mobile_ticket_url`, `activity_details_url`, `import_source`) are persisted as typed scalar columns on `wayfinder_itinerary_items` in addition to human-readable summary lines in `notes`.
  - `sanitizeItem` (`itinerary.js`), `handleAccommodations` (`accommodations.js`), and `parseBookingMetadata` (`PrivateBookingCard.jsx`) read normalized scalar columns first before falling back to regex extraction on `notes`.
- Rail Timeline Deduplication Invariant:
  - When a confirmed private rail booking (`item_type IN ('rail', 'train')`) exists on a day, `buildUnifiedDayTimeline` (`itineraryTimeline.js`) suppresses generic intercity rail placeholders (`isGenericRailPlaceholder`) and deduplicates private rail entries via `seenRailKeys`.
  - In `PolandLanding.jsx`, inter-stop transit connector banners (`nextTransitTitle`) are hidden when `nextStopExpanded` is true so expanded day timelines do not stack redundant train banners above the timeline cards.




