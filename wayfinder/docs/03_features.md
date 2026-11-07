# Wayfinder Guide - Platform Features and Discovery Services

## 1. Dual-Verification Standard for Point of Interest (POI) Ingestion

To eliminate phantom venues, incorrect coordinates, or outdated operating details, Wayfinder enforces a mandatory dual-verification standard across external APIs before committing any venue to the primary catalog:

- Geoapify Places and Geocoding API: Serves as the primary discovery and coordinate generation engine. Queries real venues using category filters including tourism.sights, catering.restaurant, and leisure.
- Google Places and Maps API: Serves as the verification and media enrichment engine. Queries Places searchText to cross-reference venue existence, star ratings, local opening hours, and direct navigation deep-links.
- Coordinate Delta Guardrail: Venue coordinates must match within a strict 250-meter delta threshold across both services. Venues exceeding this threshold are flagged for manual verification before inclusion.
- Dual-Verified Catalog: All validated POIs are compiled directly into the central data file [wayfinder/src/data/poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js), providing high-speed offline-capable rendering without runtime external API dependencies.

## 2. Comprehensive Poland 2026 City Catalog

Wayfinder features an extensive, structured repository covering six premier destinations across Poland:

- Wrocław:
  - Attractions: Ostrów Tumski (Cathedral Island), Centennial Hall, Panorama of Racławice, and interactive hunting for the historic Wrocław Dwarfs (Krasnale).
  - Food: Traditional Silesian cuisine, historic market halls (Hala Targowa), and classic milk bars (Bar Miś).
  - Christmas Market: Centered on the historic Rynek, featuring fairy-tale forest installations and wooden stalls.
  - LGBTQ+ Safe Spaces: Curated welcoming cafes, community centers, and local cultural spaces.
- Poznań:
  - Attractions: Old Market Square with mechanical fighting billy goats (Koziołki), Imperial Castle, and Cathedral Island (Ostrów Tumski).
  - Food: St. Martin's Croissant (Rogale Świętomarcińskie) heritage bakeries and hearty Greater Poland gastronomy.
  - Christmas Market: Celebrated Plac Wolności and Old Market Square holiday villages with open-air ice rinks.
- Toruń:
  - Attractions: UNESCO-listed Gothic Old Town, Town Hall Tower, Leaning Tower, and Nicolaus Copernicus monuments.
  - Food: Centuries-old Toruń gingerbread (Pierniki Toruńskie) workshops and medieval cellar dining.
  - Christmas Market: Intimate Gothic holiday fair situated in the historic Rynek Staromiejski.
- Gdańsk:
  - Attractions: Royal Way (Długa Street), Neptune Fountain, St. Mary's Basilica, and the World War II Museum.
  - Food: Baltic seafood, historic merchant taverns, and Goldwasser herbal liqueurs.
  - Christmas Market: Targ Węglowy (Coal Market) festival, frequently recognized among Europe's top holiday markets.
- Warsaw:
  - Attractions: Reconstructed Old Town, Royal Castle, POLIN Museum, and Palace of Culture and Science.
  - Food: Cutting-edge modern Polish cuisine, historic pre-war dining rooms, and lively Hala Koszyki food hall.
  - Christmas Market: Old Town walls and Castle Square illuminated holiday market.
- Kraków:
  - Attractions: Wawel Royal Castle and Cathedral, Main Market Square (Rynek Główny), Cloth Hall (Sukiennice), and Kazimierz historic Jewish quarter.
  - Food: Authentic Zapiekanki at Plac Nowy, obwarzanek street pretzels, and traditional Galician dining.
  - Christmas Market: Iconic Main Square winter market with wooden stalls, living nativity scenes, and folk caroling.

## 3. Interactive Route and Logistics Visualization

Wayfinder visualizes the complete winter travel itinerary in [wayfinder/src/components/RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx):

- Sequential Journey Map: Connects Wrocław, Poznań, Toruń, Gdańsk, Warsaw, and Kraków in optimal travel order.
- Rail Travel Durations: Displays calculated PKP Intercity transit times between each city pair, helping travelers schedule departures.
- Transfer Details: Outlines departure stations, train classifications (EIP Express InterCity Premium, IC, TLK), and seat reservation advisories.

## 4. Live Currency Converter and NBP Exchange Rate Proxy

The currency conversion suite in [wayfinder/src/components/CurrencyConverterModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/CurrencyConverterModal.jsx) provides instant financial clarity:

- National Bank of Poland (NBP) API Proxy: The worker endpoint /api/wayfinder/exchange-rate proxies live foreign exchange tables directly from the official NBP Web API (api.nbp.pl).
- Multi-Currency Conversion: Computes real-time conversion rates between Polish Zloty (PLN), United States Dollar (USD), and Euro (EUR).
- Quick Reference Matrix: Displays convenient pocket pricing reference cards (such as 10 PLN coffee, 35 PLN meal, 150 PLN hotel) to assist travelers with on-the-spot cash decisions.

## 5. Private Trip Hub and Document Management

Authenticated travelers access a dedicated private management suite:

- Itinerary Scheduling: View day-by-day scheduled activities, booked train departures, and walking tours via [wayfinder/src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx).
- Confirmed Hotel Stay Integration in City Stays: Authenticated travelers with confirmed lodging (such as Hotel Experior Boutique in Kraków, Hotel Altus Palace in Wrocław, Hotel Brovaria in Poznań, or Radisson Blu in Gdańsk) immediately see a prominent "Your Confirmed Stay in [City]" hero card at the top of [wayfinder/src/components/city/CityHotelsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityHotelsTab.jsx). The hero card surfaces check-in/out dates and times, confirmation numbers, room type, guest party count, total costs, 1-click Google Maps turn-by-turn directions, and an interactive "View Booking Voucher" trigger opening [wayfinder/src/components/DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx).
- Dynamic Accommodations API: The `/api/wayfinder/accommodations` endpoint queries D1 `wayfinder_itinerary_items` (filtering on `item_type IN ('hotel', 'accommodation', 'lodging')`), enriches records with metadata from `wayfinder_extracted_fields` and joins with `wayfinder_documents` for secure voucher inspection.
- Document Center & Viewer: Upload and organize PDF travel confirmations, flight tickets, and hotel vouchers via [wayfinder/src/components/DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx). Interactive inspection is powered by [wayfinder/src/components/DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx) with IndexedDB caching, bundled asset fallbacks, dedicated hotel and flight helper bars, and multi-format previewing.
- Flight Arrival & Lodging Check-in Synchronization: Explicitly surfaces inbound flight DL9208 timing (Dec 4, 2026 at 13:30 CET / Poland local time) across Kraków lodging helpers [wayfinder/src/components/city/CityHotelsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityHotelsTab.jsx), transit dossiers [wayfinder/src/components/RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx), and journey stops [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx). Touchdown directly informs hotel check-in timing (~14:45 - 15:15 arrival via 17m SKA1 airport rail matching standard 15:00 check-in).
- Automated Extraction: Integration with document import jobs extracting check-in dates, confirmation numbers, and hotel addresses.
- Travel Budget Tracker: Tracks trip expenses in PLN and USD, comparing estimated travel costs against actual spending across lodging, dining, transit, and activities.

## 6. Mobile-First Navigation Simplification and Bottom Tab Bar

To maximize usability during winter roaming and in-destination field usage, Wayfinder provides a streamlined, thumb-zone optimized navigation architecture:

- Persistent Mobile Bottom Tab Bar: [wayfinder/src/components/BottomTabBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx) anchors 5 key actions at the base of mobile screens (iOS safe-area aware):
  - Cities: Immediate return to the Poland overview and city catalog.
  - Schedule: Direct access to the unified 10-day itinerary timeline.
  - Practical: Instant access to transit guides, tipping rules, and emergency logistics.
  - Money: One-tap launcher for the full-screen interactive currency converter.
  - Hub: Direct gateway to the private travel vault and document center.
- Slim Desktop Header & Spill-Over Brand Crest: Features a locked top bar housing the enlarged high-resolution brand banner (`wayfinderHeaderBanner`) which spills over the bottom gold border (`-mb-4 sm:-mb-6 md:-mb-8 lg:-mb-9`) with realistic drop-shadow depth, ensuring full legibility across all viewports. Houses the Practical Guide, 10-day Itinerary anchor, live Currency Converter, Private Hub, and user authentication actions in [wayfinder/src/components/Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx).
- Docked Private Hub Sub-Toolbar: [wayfinder/src/components/PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx) anchors directly beneath the main navbar as a sticky sub-bar (`sticky top-14 sm:top-16 z-30 bg-slate-900/95 backdrop-blur-xl border-b border-white/10`). Replaces the oversized left-side header block with an elegant, compact inline identity pill (`[ShieldCheck] Private Hub • Poland 2026`) and presents all sub-navigation buttons (Itinerary, Packing List, Expense Ledger, Documents, Sync Calendar, Share) on a single horizontal row with zero horizontal scroll. Day timeline headers in [wayfinder/src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) lock smoothly beneath the dual sticky bars (`top-[104px] sm:top-[112px]`) with synchronized `scroll-mt-32` offsets. Global administrator access is cleanly unified in the top navigation header ([Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx)), eliminating redundant buttons from the trip sub-bar.
- Consolidated City Drill-Down Tabs: CityPage tabs are streamlined to 5 primary destinations (Overview, Markets, Sights, Food, Stays, and Safe Spaces), avoiding horizontal overflow on small displays while moving in-depth historical chronologies to an engaging highlight card inside Overview.
- Public/Private Schedule Harmony: Unauthenticated visitors can view the full 10-day Poland trip itinerary freely, with a discreet invitation to authenticate to reveal private booking confirmations and tickets.
- Unified Journey Sequence & Schedule Stops: [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) directly integrates the full 10-day itinerary timeline, flight arrivals, PKP rail transfers, daily activities, and authenticated private booking records directly into the 5 Journey Sequence stops (Kraków, Wrocław, Poznań, Toruń, Gdańsk). This unifies the public landing guide and personal schedule into a single, cohesive interface, complete with intercity transit connector cards, stop filter pills, and a Schedule vs. Cards view mode switcher (defaulting to compact Cards view). In Schedule view, each day's date header (badge, date, subtitle, live weather, and recommended base) features sticky positioning (`sticky top-14 sm:top-16 z-20 bg-slate-950/95 backdrop-blur-md`) enclosed in bounded day section containers with natural CSS replacement as travelers scroll through each day's events.
- Shared Private Booking Cards: [wayfinder/src/components/itinerary/PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx) renders D1-persisted booking records (flights, hotels, restaurants, excursions, rail) with private lock badges, confirmation numbers, passenger details, and theme badges across both the main journey stops and the dedicated private hub.
- Interactive Timeline Drag-and-Drop & Reordering: Both [wayfinder/src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) and [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) provide full HTML5 drag-and-drop handles (`GripVertical`) and 1-click Up/Down reorder buttons (`ChevronUp`, `ChevronDown`) on every timeline card. Custom ordering is managed dynamically via `buildUnifiedDayTimeline` and `applyCustomTimelineOrder` in [wayfinder/src/utils/itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js), persists in `localStorage` under `wayfinder_timeline_order_v1`, broadcasts across all views via `wayfinder:timeline-order-changed` events, and provides a 1-click Reset Order action in the day header. Day 1 default order accurately connects flight touchdown (1:30 PM), SKA1 airport commuter rail (2:15 PM), and hotel check-in (3:00 PM). Dragging is isolated strictly to the right-side grip handle, keeping text freely selectable and copyable.
- Interactive Itinerary Deep-Links & Google Maps Navigation: In both [wayfinder/src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) and [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx), category icons (fork and knife, landmark, market) are interactive buttons linking directly to the corresponding city guide section. Timeline addresses across public events and [wayfinder/src/components/itinerary/PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx) are clickable links opening Google Maps turn-by-turn directions. Suggested dining cards feature dedicated action buttons (e.g. 'View Morskie Oko Tile') that deep-link directly to the restaurant Must-Have tile in [wayfinder/src/components/city/CityFoodTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityFoodTab.jsx), scrolling into view and applying an amber highlight ring.

## 7. Booking Confirmation Import: Email Forwarding System

Authenticated users can import hotel and attraction booking confirmations via dedicated email forwarding into `wayfinder_itinerary_items` with `status = 'imported'` and `verification_status = 'unverified'`:

### 7.1 Email Forward Channel

- Unique Trip Inbox Provisioning: Each user receives a unique forwarding address per journey, format `TT<6-digit-token>.<journey-slug>@techtrekgt.com` (e.g. `TT351825.poland-christmas-2026@techtrekgt.com`). Provisioned via `POST /api/wayfinder/email-inboxes` (idempotent, returns existing address if already created). Resolves journeys where `created_by = user.userId` or `visibility = 'public'` (supporting platform-seeded expeditions like Poland 2026).
- Cloudflare Email Worker ([email-worker.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-worker.js)): Worker exports an `email()` handler alongside `fetch()`. When a forwarded email arrives at a recognized inbox address, the worker:
  - Dual Token & Case-Insensitive Lookup: Matches recipient addresses via 6-digit unguessable token extraction (`inbox_token`) and `COLLATE NOCASE` database matching, eliminating case-sensitivity drops across differing email clients.
  - Safe Memory Stream & Recursive MIME Extraction: Decodes the raw MIME stream using standard `Response(message.raw).text()` streams. The recursive MIME parser (`extractContentFromMime` and `extractMimeContent`) extracts both normalized plain-text bodies and binary attachment blocks (`application/pdf`, tickets, vouchers), automatically persisting attached documents into `wayfinder_documents` and linking them via `source_document_id`.
  - Specialized GetYourGuide Connector (`parseGetYourGuideEmail`): When a GetYourGuide email is detected (via sender or content heuristics), a dedicated connector parses the template with high fidelity:
    - Activity Title: Strips marketing tags (such as `100% guaranteed`) to yield clean titles like `GetYourGuide: Auschwitz-Birkenau & Wieliczka Salt Mine Tour`.
    - Operator / Supplier Attribution: Captures supplier names (e.g. `Note from Mr.Shuttle`) and renders dedicated operator pills.
    - Tour Schedule & Hotel Pickup Window: Extracts pickup windows (e.g. `Pickups between 5:30 and 7:30`) and sets normalized `local_time: '06:30'` and `end_time: '17:30'` based on the 11-hour duration.
    - Direct Mobile Ticket Deep-Links: Extracts GetYourGuide mobile app ticket URLs (`[Open tickets](https://l4ab.adj.st/tickets/booking/...)`) and activity detail links (`[See activity details](https://l4ab.adj.st/bookings/...)`).
    - Museum Grounds Bag Restrictions: Extracts strict museum luggage rules (`Max 30x20x10 cm on Museum grounds`) and displays prominent warning banners advising guests that large bags can be left on the bus.
    - Booking & Confirmation References: Maps GYG confirmation codes (e.g. `GYG7VKK692WY`) and alphanumeric booking references (`6ICXW284P0LJK9OYS594M5NZKD52BTFT`).
  - Multi-Provider Field & Title Extraction: Cleans forwarded email subjects (stripping Fwd/Re artifacts), extracts vendor names (GetYourGuide, Delta Air Lines, PKP Intercity, hotels), and automatically extracts the exact activity/tour name from email MIME bodies to generate clean, descriptive titles.
  - Automated Expense Synchronization: Parses fare and receipt totals (`extractBookingCost`), automatically creating both the private `wayfinder_itinerary_items` record (with `local_time`, `end_time`, `location`, `source_document_id`) and the linked `wayfinder_expenses` entry with 50/50 group split allocations in `wayfinder_expense_splits`.
  - Atomicity & Auditing: Writes atomically to D1 via `env.DB.batch()`, updating `emails_received` and logging detailed telemetry in `wayfinder_audit_events`.
- Inbox Stats: `wayfinder_email_inboxes.emails_received` counter and `last_received_at` updated on every successful import.
- API: `GET /api/wayfinder/email-inboxes?journey_id=` (fetch inbox), `POST /api/wayfinder/email-inboxes` (provision), `DELETE /api/wayfinder/email-inboxes/:id` (deactivate).

### 7.2 Booking Import UI Components

- Dedicated Import Inbox Card: [wayfinder/src/components/BookingImportChannels.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BookingImportChannels.jsx) is integrated directly into [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx). Generates unique trip inbox address, 1-click clipboard copy with animated visual feedback, live processed email counters, and supported booking provider tags.
- Synced Confirmations List & Interactive Booking Modal: Integrated directly in [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx) right below the import inbox card. Displays all D1-persisted booking items with clean titles, providers, dates, times, and day indicators. Each card is interactive and clickable:
  - Clicking any card opens a rich `BookingDetailModal` displaying the full booking title, provider, confirmation code (with 1-click clipboard copy), schedule, location, and parsed email notes.
  - One-Tap Mobile Tickets Action: When a mobile ticket deep-link is present (e.g. GetYourGuide), renders a gradient "Open Mobile Tickets" launcher button that opens tickets directly in the GetYourGuide app or browser.
  - Document Attachment Launcher: If a linked ticket PDF exists (`source_document_id`), provides a direct "View Attached Ticket (PDF)" button.
  - Operator & Pickup Banners: Displays the tour operator (`Mr.Shuttle`), pickup time window (`05:30 - 07:30`), and museum luggage restriction warnings (`30x20x10 cm`).
  - Includes a direct "Jump to Day X Timeline" button that navigates directly to `/wayfinder/poland-christmas-2026/private?day=X`.
  - [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) supports deep-linking via `?day=X` URL query parameters with automatic smooth scrolling to the target day container (`#day-X`).
  - [PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx) renders the booking on the chronological timeline with confirmation number, provider pill, operator pill, pickup window, bag restrictions, mobile ticket launcher, and clean notes. Note: Legacy Gmail sync has been completely removed in favor of reliable email forwarding.
- Document Deletion & Cascade Purge Workflow:
  - Travelers can delete any imported travel document directly from [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx) via trash action buttons on stored document cards and inside the Document Viewer modal header.
  - Interactive Confirmation Modal: Displays a glassmorphic warning modal listing the filename, journey context, and cascading impact (warning that linked itinerary items, expense ledger records, and extraction jobs will be removed).
  - Cascading Purge (`DELETE /api/wayfinder/documents/:id` in [documents.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js)): Broadened permissions allow either document owner, journey creator, or public journey travelers to delete. The endpoint cascades deletion through linked `wayfinder_expense_splits`, `wayfinder_expenses`, `wayfinder_itinerary_items`, `wayfinder_extracted_fields`, `wayfinder_extraction_jobs`, and hard-deletes `wayfinder_documents`.
  - Hash Conflict Prevention: By purging the document record and file hash from D1, travelers can immediately re-upload and re-parse an updated or corrected file without triggering duplicate hash conflict rejections.
  - Client-Side Synchronization: Purges the local binary file from IndexedDB via `documentStorage.deleteDocument(docId)` and re-syncs documents, extraction jobs, itinerary items, and expenses across WayfinderContext.
- Document Title Renaming Capability:
  - Edge API (`PUT` / `PATCH /api/wayfinder/documents/:id` in [documents.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js)): Allows authenticated travelers to update `safe_display_name` in D1. Updates are verified against ownership or public journey traveler permissions, recorded in `wayfinder_audit_events`, and returned immediately as sanitized document metadata.
  - Rename Document Modal & Quick Suggestions: [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx) provides a dedicated glassmorphic rename dialog featuring context-aware quick suggestion chips (e.g. "Hotel Experior Boutique (Kraków)", "Hotel Experior Boutique - Check-in Voucher", "Hotel Brovaria & Microbrewery (Poznań)").
  - Multi-Trigger Access: Rename triggers are placed directly on each document card (inline title hover pencil and action button) and in the Document Viewer modal headers.
- Strict Static Fallback Resolution & Cross-City Isolation:
  - Prior regex heuristics that matched generic terms (such as `hotel`, `palace`, or `wroclaw`) have been surgically tightened to strictly isolate bundled static files (`isAltus = lower.includes('altus')`).
  - Guarantees that Kraków accommodations (e.g. Hotel Experior Boutique) or Poznań lodging (e.g. Hotel Brovaria) never incorrectly pull or display the Altus Palace Wrocław voucher.
  - When viewing documents without an attached local binary blob, renders a clean metadata card with action shortcuts to "Review Extracted Fields", "Attach Local PDF File", and "Rename Title".
- Profitroom Booking Engine & PDF Text Stream Ingestion:
  - Dedicated PDF Stream Decompressor (`extractPdfText`): Built directly into [gemini-parser.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/gemini-parser.js) using `node:zlib`. Features byte-level stream boundary detection (`findStreamBoundaries`) handling CR, LF, and CRLF delimiters without regex failures.
  - Multi-Format Stream Decompression: Tri-tier decompression engine attempting standard zlib inflate, raw inflate (`inflateRawSync`), and uncompressed ASCII stream fallback.
  - Variable-Width ToUnicode CMap Resolution: `parseCMapEntries` dynamically detects 2-byte and 4-byte hex source keys across `beginbfchar`/`beginbfrange` blocks and decodes multi-byte UTF-16BE unicode sequences.
  - Robust Text Operator Decoding: `extractTextFromContentStream` parses literal string operators (`(text) Tj`) using balanced parenthesis scanners that handle escaped characters, hex literal strings (`<hex> Tj`), single-quote newline operators, and modern PDF array kerning operators (`[...] TJ`) with word-break detection on negative kerning adjustments (< -100).
  - Multi-Format Date and Entity Heuristics: Extracts 6+ date patterns (Check-in/Arrival, DD Month YYYY with Polish month declensions, European DD.MM.YYYY, ISO 8601), dynamic hotel and venue titles, Polish street addresses (`ul.`, `al.`, `pl.`), and multi-currency prices (PLN, zł, USD, EUR) with comma decimal handling.
  - Client-Side IndexedDB Re-Parse Recovery: [WayfinderContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/WayfinderContext.jsx) `parseDocument` safely handles null file references by retrieving cached binary blobs from IndexedDB via `getLocalDocumentFile` before delegating to edge parsing.
  - Automatic Ingestion of Profitroom Confirmation Printouts: Automatically recognizes Profitroom booking confirmation printouts (often downloaded as `Your booking confirmation.pdf` or `print.pdf` from `mailer.profitroom.pl`), extracting the 7-character confirmation code (`IMIWHDH`), hotel name (`Hotel Altus Palace Wrocław`), address (`ul. Wierzbowa 15, 50-056 Wrocław`), room type (`Junior Suite`), check-in date (`2026-12-07 15:00`), check-out date (`2026-12-09 12:00`), and Polish currency costs (`1,420.20 zł` / `1420.20 PLN` / `$359.79 USD`).
  - Polish Currency Separator Support: [import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js) `parseCost` sanitizes Polish space thousands separators (e.g. `1 420.20 zł` -> `1420.20`), preventing premature numeric truncation.
  - Automatic Title Enhancement: When uploading printouts with generic names like `Your booking confirmation.pdf`, the system automatically re-titles the document to `Hotel Altus Palace Wrocław Confirmation.pdf` upon parse completion.

## 8. Key-Free Open-Meteo Winter Weather & Daylight Telemetry

To equip winter travelers for sub-zero Polish conditions and brief winter daylight windows (~8 hours in December), Wayfinder provides real-time and climate-modeled weather telemetry:

- Serverless Open-Meteo Edge Proxy: The worker endpoint `GET /api/wayfinder/weather` in [wayfinder/functions/api/wayfinder/weather.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/weather.js) proxies Open-Meteo forecast and archive endpoints with zero external API key requirements.
- Dual Operating Modes:
  - Live 16-Day Forecast: Used when querying current conditions or dates within -1 to +16 days of the request. Returns temperature ranges, WMO weather codes, precipitation probabilities, snowfall accumulation in cm, sunrise, and sunset times.
  - Historical Climate Baseline: Used for trip planning dates beyond 16 days. Samples prior-year seasonal calendar windows from Open-Meteo Archive API to calculate expected highs, lows, and snow probabilities.
- Daylight Telemetry: Computes exact daily sunrise, sunset, and total daylight span (e.g. 07:35 to 15:40 CET / 8h 05m). Vital for winter scheduling because Polish Christmas markets peak after dusk while Gothic Old Town photography requires daylight.
- Freezing & Cold Advisories: Automatically evaluates freezing thresholds and generates actionable winter advisories (thermal base layer recommendations, crampon/traction warnings on icy cobblestones, waterproof footwear).
- UI Component Integration: [wayfinder/src/components/weather/WeatherWidget.jsx](file:///e:/TechTrekGT/wayfinder/src/components/weather/WeatherWidget.jsx) is embedded into [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) stop headers and daily schedule sub-strips, as well as [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) day headers. Seamlessly toggles between Celsius and Fahrenheit according to user settings in SettingsContext.

## 9. Client-Side Route & Walking Loop Optimization (2-Opt & Nearest-Neighbor)

To minimize traveler exposure to sub-zero winter temperatures and eliminate criss-crossing backtracking across Polish Old Towns, Wayfinder provides an in-browser route optimization engine:

- Algorithmic Architecture: Implemented in [wayfinder/src/utils/routeOptimizer.js](file:///e:/TechTrekGT/wayfinder/src/utils/routeOptimizer.js) and ported from TREK (`RouteCalculator.ts`). Executes 100% on the client in <2ms with zero network requests or API costs.
- Two-Stage Optimization:
  - Nearest-Neighbor Seed: Constructs an initial Hamiltonian path using greedy nearest-neighbor traversal seeded from the traveler's active base anchor (e.g. Main Market Square or central station).
  - 2-Opt Iterative Edge Untangling: Iteratively evaluates 2-edge swaps by reversing candidate tour sub-segments `[i..j]` whenever the candidate length is strictly shorter by at least 1mm (`len < bestLen - 1e-6`). Eliminates all self-intersecting loops and criss-crossing paths.
  - Round-Trip Loop Orientation: When `isRoundTrip` is active (`startAnchor === endAnchor`), the loop orientation is oriented to start at the sight closest to the hotel/market base, creating an intuitive walking tour that departs from base, circles through sights, and returns.
- Geodesic & Winter Telemetry:
  - Haversine Distance: Uses spherical trigonometry to calculate precise kilometer distances between consecutive stops.
  - Winter Walking Pace: Calibrated at 4.5 km/h (~13.3 min/km) to account for snowy, icy cobblestones and winter footwear.
  - Savings Metrics: Directly computes distance saved (e.g. -1.8 km) and minutes saved in freezing weather.
- City Walk vs. Excursion Partitioning: Sights situated >12 km from the city center (such as Auschwitz-Birkenau ~65 km or Wieliczka Salt Mine ~14 km from Kraków) are partitioned into a dedicated Regional Day-Trip Excursions section so regional transit trips do not distort local Old Town walking loops.
- Mobile Navigation Integration: Generates native Google Maps multi-stop walking directions URLs linking all sequential waypoints, enabling 1-click navigation directly in iOS/Android Google Maps during winter roaming.
- UI Component Integration: [wayfinder/src/components/route/WalkingLoopOptimizer.jsx](file:///e:/TechTrekGT/wayfinder/src/components/route/WalkingLoopOptimizer.jsx) is embedded into [CityAttractionsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityAttractionsTab.jsx), offering toggles between curated guide order and 2-opt loop mode, base anchor selection, round-trip toggles, and step-by-step leg distance badges on [MustSeeCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/MustSeeCard.jsx).

## 10. Winter Packing Checklist & Luggage Weight Budgeting

To ensure travelers are fully prepared for sub-zero Polish winter weather while strictly respecting international airline baggage allowances, Wayfinder provides an interactive packing manager and baggage weight budget suite:

- Cloudflare D1 Relational Persistence: Manages packing items in `wayfinder_packing_items` with fields for category, quantity, weight in grams, packed status, baggage location (checked, carry-on, personal daypack), and contextual advice notes.
- Serverless API Engine: [wayfinder/functions/api/wayfinder/packing.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/packing.js) handles item retrieval, item creation, item status mutations (`PUT /api/wayfinder/packing/:id`), bulk clearing of checked items, and preset instantiation (`action: 'apply_preset'`). Includes self-healing table initialization.
- Real-Time Baggage Weight Budgeting:
  - Checked Suitcase Limit: Real-time telemetry comparing sum of checked items against standard transatlantic 23.0 kg (50.7 lbs) airline limit, featuring colored utilization meters (emerald <75%, amber 75-95%, red >95%) and remaining gift buffer calculation.
  - Cabin Carry-On Limit: Tracks cabin baggage against European 8.0 kg limits, ensuring cold-sensitive lithium batteries and delicate holiday market baubles remain safely in cabin baggage.
  - Overall Readiness Meter: Visual percentage tracker displaying packed items vs total checklist.
- Curated Poland Winter 2026 Preset: Includes 1-click loading of 37 pre-seeded expedition items across 7 winter categories (thermal base layers, sub-zero down parka, ice grippers for slick cobblestones, Type C/E plug adapters, 10,000mAh cold-resistant power banks, passport sleeves, and emergency Polish złoty cash).
- Guest & Roaming Resilience: Fully functional in offline and unauthenticated states using browser localStorage persistence, seamlessly syncing with Cloudflare D1 upon user sign-in.
- UI Component Integration: [wayfinder/src/components/packing/PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx) is mounted as a dedicated subview tab inside [PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx) at `/wayfinder/poland-christmas-2026/private/packing`, with a primary launcher callout integrated into [PracticalPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PracticalPage.jsx) and mobile bottom tab bar integration in [BottomTabBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx).

## 11. Universal Travel Preferences & Unit Conversion Suite (Weight, Temperature, Distance, Currency, Time Format)

Wayfinder provides a comprehensive, reactive localization and travel preference suite covering the core pillars of transatlantic travel:

- Global Travel Preferences Modal: [wayfinder/src/components/SettingsModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/SettingsModal.jsx) provides a unified preferences interface accessible from the slim desktop navigation bar, mobile bottom bar, and in-context quick buttons across the application:
  - Time Display Preference: Select between 12-Hour (`12h` with AM/PM indicators) and 24-Hour (`24h` military time).
  - Weight & Luggage Preference: Select between Pounds / Ounces (`lbs / oz`) and Kilograms / Grams (`kg / g`).
  - Temperature Unit: Select between Fahrenheit (`°F`) and Celsius (`°C`).
  - Distance Unit: Select between Miles (`mi`) and Kilometers (`km`).
  - Base Currency: Select between US Dollar (`USD`), Euro (`EUR`), British Pound (`GBP`), and Polish Złoty (`PLN`).
- Dynamic Time Formatting & Schedule Telemetry:
  - Unified Itinerary Stops: In [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) and [wayfinder/src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx), timeline badge times (e.g. `15:00` or `3:00 PM`) dynamically adapt to the active `timeFormat` preference via `<FormatTime>`.
  - Booking Vouchers & Private Itinerary Cards: In [wayfinder/src/components/itinerary/PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx), start times, end times, duration ranges (e.g. `15:00 - 18:00 (3h)` vs `3:00 PM - 6:00 PM (3h)`), and excursion windows dynamically convert according to user preference.
  - Daylight & Sunrise/Sunset Telemetry: In [wayfinder/src/components/weather/WeatherWidget.jsx](file:///e:/TechTrekGT/wayfinder/src/components/weather/WeatherWidget.jsx), sunrise and sunset timestamps render in 12-hour AM/PM or 24-hour military clock across compact header badges, tooltips, and expanded forecast cards.
  - Quick Reference Bars & Narrative Guides: In [wayfinder/src/components/city/QuickReferenceBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/QuickReferenceBar.jsx), daylight and peak market hour summaries reactively adapt via `FormatText`.
- Dynamic Weight & Luggage Conversion:
  - Baggage Budget Meters: In [wayfinder/src/components/packing/PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx), telemetry meters dynamically convert between transatlantic 23.0 kg (50.7 lbs) checked baggage limits and European 8.0 kg (17.6 lbs) cabin baggage limits with reactive remaining buffer calculations.
  - Item Weights & Subtotals: Item rows dynamically format between grams/kilograms and ounces/pounds using `formatWeight`. Category headers display live subtotals (e.g. `~12.4 lbs` or `~5.6 kg`).
  - Custom Item Entry: Input forms dynamically adjust step sizes and labels (`Est. Weight (Ounces each)` vs `Est. Weight (Grams each)`), automatically converting entered ounces to backend grams for consistent relational persistence.
  - In-Context Quick Switcher: PackingManager features a dedicated 1-click `[ lbs / oz | kg / g ]` toggle pill and Settings shortcut button directly in its header action bar.
- Dynamic Temperature & Weather Telemetry:
  - Open-Meteo Weather Widgets: In [wayfinder/src/components/weather/WeatherWidget.jsx](file:///e:/TechTrekGT/wayfinder/src/components/weather/WeatherWidget.jsx), both compact inline tooltip cards and expanded city overview telemetry cards convert temperatures reactively between Celsius and Fahrenheit.
  - In-Context Quick Switcher: Weather widgets embed 1-click `[ °C | °F ]` pill switches and Settings shortcut buttons directly in their tooltip headers.
- Universal Text Processor (FormatText):
  - In [wayfinder/src/components/Formatters.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Formatters.jsx), `FormatText` dynamically parses narrative descriptions across city overviews, transit dossiers, and packing guides. It accurately converts clock times between 12-hour AM/PM and 24-hour military formats, Celsius ranges (e.g. `-2°C to 4°C` -> `28°F to 39°F`), sub-zero equipment ratings (`-10°C rated` -> `14°F rated`), baggage weight limits (`23 kg` -> `50.7 lbs`), and distance benchmarks (`12 km` -> `7.5 mi`).
- Distance & Route Telemetry:
  - [wayfinder/src/components/route/WalkingLoopOptimizer.jsx](file:///e:/TechTrekGT/wayfinder/src/components/route/WalkingLoopOptimizer.jsx) and [wayfinder/src/components/RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx) dynamically format walking savings, total route distances, and PKP intercity rail corridor spans in miles or kilometers according to active traveler settings.

## 12. Dynamic iCalendar (.ics) Feed Generator & Subscription Engine

To provide seamless native calendar integration across mobile devices (iOS, Android, macOS, Windows) without manual schedule entry, Wayfinder implements an RFC 5545 compliant calendar subscription and export engine:

- RFC 5545 Standards Compliance:
  - Generates valid `VCALENDAR` payloads with strict 75-octet line folding (`foldLine`), standard character escaping (`\`, `;`, `,`, `\n`), and explicit `VTIMEZONE` blocks for `Europe/Warsaw` (CET/CEST).
  - Emits typed `VEVENT` records with deterministic UIDs, UTC creation timestamps (`DTSTAMP`), start/end timestamps (`DTSTART`, `DTEND`), category tags (`FLIGHT`, `TRAIN`, `HOTEL`, `MARKET`, `DINING`, `SIGHTSEEING`), and status flags.
- Comprehensive Journey Event Coverage:
  - Daily Expedition Overviews: All-day milestone cards for each of the 10 itinerary days summarizing daily themes, base lodging zones, and top sights.
  - Inbound Flight DL9208: Dedicated flight arrival event for Delta Air Lines DL9208 touching down at Kraków John Paul II Airport (KRK) on Dec 4, 2026 at 13:30 CET, including passenger names, confirmation code (GUDI3J), layover details, and SKA1 train synchronization notes.
  - Intercity Rail Transfers: Scheduled PKP Intercity IC/EIP train legs connecting Kraków, Wrocław, Poznań, Toruń, and Gdańsk with carriage classifications, station names, and transit durations.
  - Curated Accommodations: Synchronized check-in (15:00) and check-out (11:00) events for lodging stays (including Altus Palace Wrocław) with direct contact details, telephone numbers, and reception websites.
  - User-Authored D1 Bookings: Authenticated users automatically receive their private D1 itinerary records (`wayfinder_itinerary_items`) overlaid directly into their personalized feed.
- Multi-Platform 1-Click Subscription:
  - Apple Calendar (iOS, iPadOS, macOS): 1-click `webcal://` deep links triggering native iOS/macOS system prompts to subscribe to live background updates.
  - Google Calendar (Android & Web): 1-click web subscription link via Google Calendar render URL.
  - Outlook / Microsoft 365: Direct `webcal://` and web add-from-url links for desktop and cloud Outlook users.
  - Direct .ics Export: 1-click offline snapshot download (`/api/wayfinder/calendar/export.ics`) providing instant one-time import into any desktop or mobile calendar app.
- Edge Architecture & Security:
  - Public Feed Endpoint: `GET /api/wayfinder/calendar/feed/:token.ics` verifies active 32-character crypto random tokens in `wayfinder_calendar_tokens`, incrementing `poll_count` and recording `last_polled_at` timestamps for telemetry. Edge cached for 30 minutes (`max-age=1800, s-maxage=3600`).
  - Private Token Management: Protected endpoints (`GET`, `POST`, `DELETE` `/api/wayfinder/calendar/token`) allow authenticated users to generate, inspect, and rotate their 32-character feed token if the URL is compromised.
- UI Component Integration:
  - [wayfinder/src/components/calendar/CalendarSubscribeModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/calendar/CalendarSubscribeModal.jsx): Interactive modal featuring 1-click client subscription cards, copyable HTTPS feed links with visual confirmation, poll telemetry meters, private token rotation, and direct offline `.ics` downloads.
  - Integrated launcher buttons mounted in [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) header, [PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx) navigation bar, and [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) Journey Sequence controls.

## 13. Unified Chronological Itinerary Ordering & Placeholder Deduplication Engine

To eliminate disjointed schedule rendering, out-of-order cards, and duplicate hotel base recommendations, Wayfinder provides a centralized chronological timeline builder in [wayfinder/src/utils/itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js):

- Unified Multi-Source Merge: Merges public catalog milestones (`dayItem.schedule`), authenticated user bookings from Cloudflare D1 (`dayPrivate`), and confirmed accommodations (`dayAccommodations`, e.g. Altus Palace Wrocław) into a single cohesive list.
- Strict Chronological Sorting: Normalizes all event times into absolute minute values (`00:00` = 0, `23:59` = 1439). Sorts every card in ascending chronological order, ensuring travelers experience a logical flow throughout the day (e.g. 10:30 Kraków morning check-out -> 11:30 PKP Intercity IC rail transfer -> 15:00 Wrocław hotel check-in -> 16:30 Fairytale Market -> 19:30 dinner).
- Automatic Hotel Placeholder Deduplication: Inspects days where a confirmed accommodation or private hotel booking is present. Automatically suppresses generic recommendations (e.g. `Hotel Check-in (from 15:00)` with `Recommended Base Zone` badges), preventing confusing duplicate check-in prompts.
- Cross-Source Accommodation Deduplication: When an authenticated user's private D1 itinerary contains a hotel booking covering a curated accommodation (such as `Hotel Altus Palace Wrocław`), `buildUnifiedDayTimeline` and `calendar.js` automatically suppress the duplicate static accommodation entry, while enriching the private booking with reception contact metadata (`phone`, `email`, `website_url`).
- Strict Domain Metadata Scoping: `parseBookingMetadata` strictly isolates excursion attributes (`mobileTicketUrl`, `activityDetailsUrl`, `pickupWindow`, `bagRestriction`, `supplier`). Hotels never inherit GetYourGuide mobile tickets or activity detail links.
- Universal Application Harmony:
  - [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx): Journey Sequence stop days render the unified chronological timeline directly within expandable stop dossiers.
  - [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx): Full 10-day expedition view uses identical unified chronological timeline rendering.
  - [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx): Synced booking inspection modals and confirmation cards accurately map itinerary dates to destination cities (Dec 7 to Wrocław) and display contextual labels ("Booking Confirmation (PDF)").
  - [calendar.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/calendar.js): The RFC 5545 calendar subscription engine applies the same accommodation deduplication rules, guaranteeing clean native calendar feeds.

## 14. Multi-Currency Group Expense Ledger & Debt Settle-Up Engine

To streamline shared travel costs and eliminate complicated group debt calculations across international currencies, Wayfinder implements an edge-persisted expense ledger and debt simplification suite:

- Multi-Currency Conversion & Display: Supports Polish Złoty (`PLN`), US Dollar (`USD`), Euro (`EUR`), and British Pound (`GBP`). Travelers can toggle between currencies dynamically, instantly re-evaluating total expedition spending, personal out-of-pocket payments, and member shares.
- Exact-Cent Splitting Algorithms ([expenseLedger.js](file:///e:/TechTrekGT/wayfinder/src/utils/expenseLedger.js)):
  - `splitEqually(amount, participants)`: Computes base cent shares and deterministically distributes remainder cents across members, guaranteeing that the sum of split allocations matches the total expense down to the penny with zero rounding leaks.
- Greedy Bipartite Debt Simplification:
  - `calculateSettleUp(expenses, settlements, displayCurrency)`: Computes each participant's out-of-pocket expenses paid (`paid`), personal expense liability across all splits (`owed`), direct debt transfers sent (`settlementsPaid`), and direct debt transfers received (`settlementsReceived`). Net balance is computed as `(expensesPaid - expenseShare) + (settlementsPaid - settlementsReceived)`. This guarantees exact zero-sum balance conservation across the group (`sum(net) === 0.00`). Separates net creditors from net debtors and greedily pairs maximum debtors with maximum creditors to generate minimal direct transfers. Also renders inline converted preview badges on all foreign currency splits (e.g. `1,200.00 zł (≈ $300.00)`), eliminating currency ambiguity.
  - Generates the theoretical minimum number of direct settlement transfers (e.g. "Ronald pays Jon $442.38" instead of multiple circular payments).
- Edge API & Settlement Tracking ([expenses.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/expenses.js)):
  - Endpoints: `GET /api/wayfinder/expenses` (public read fallback, returns expenses, member splits, and settlements), `POST /api/wayfinder/expenses` (records new costs), `PUT /api/wayfinder/expenses/:id` (updates expense description, category, amount, currency, payer, and recomputes splits while preserving settled states), `DELETE /api/wayfinder/expenses/:id` (removes expense and cascades splits), `POST /api/wayfinder/expenses/settle` (logs settle-up payments via Cash, Bank Transfer, Zelle, Venmo, Apple Pay, Cash App, Both Paid Separately, PayPal, Credit Card Split, or Revolut/Wise), and `POST /api/wayfinder/expenses/preset` (seeds realistic Poland 2026 trip expenses).
- Document Import & OCR Expense Synchronization ([import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js)):
  - Automated Cost Extraction: Extracts fare and price fields (`total_cost`, `cost`, `price`, `amount`) during document OCR extraction and review in [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx).
  - Atomic Approval Synchronization: When an imported travel document (flights, hotels, PKP rail tickets, tours) is approved via `POST /api/wayfinder/import-jobs/:doc_id/approve`, the edge worker automatically creates both the verified itinerary item in `wayfinder_itinerary_items` AND the linked cost in `wayfinder_expenses` with 50/50 group split allocations in `wayfinder_expense_splits`.
  - Idempotent Protection: Checks for existing expense rows tied to `document_id` before inserting, ensuring re-approvals or edits never duplicate costs in the shared ledger.
- UI Component Integration:
  - [ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx): Mounted as a dedicated tab inside [PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx) at `/wayfinder/poland-christmas-2026/private/expenses`, featuring overview metric cards, net balance callouts, simplified settle-up action cards, category filtering, new expense modal, in-place expense & payer editing modal (allowing travelers to reassign who paid, amount, and split strategy on any recorded expense), item-level settlement shortcuts, and payment settlement log.
  - Setting-Driven Currency Preference: Governed directly by `settings.currency` from [SettingsContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/SettingsContext.jsx) (`USD`, `EUR`, `GBP`, `PLN`) with a 1-click modal opener, eliminating ad-hoc page toggles.
  - Live Input Currency Conversion Preview: When entering expenses in non-base currencies, renders a real-time conversion preview badge into the user's preferred display currency prior to saving.
  - Comprehensive Settlement Methods: Supports real-world US traveler channels including Cash, Bank Transfer, Zelle, Venmo, Apple Pay, Cash App, Both Paid Separately, PayPal, Credit Card (Split at POS), and Revolut / Wise.
  - Subpath-Aware API Resilience: Leverages `getApiUrl` and `credentials: 'include'` for all expense fetch requests, ensuring reliable data communication across subpath routing.
- Purchase Site & Payment Method Tracking:
  - Schema Support: `wayfinder_expenses` and `wayfinder_itinerary_items` both track `purchase_site` (e.g., Booking.com, Hotels.com, Delta.com, PKP Intercity, GetYourGuide, On-Site) and `payment_method` (e.g., Visa, Mastercard, American Express, Apple Pay, PayPal, Cash).
  - Multi-Engine Ingestion: Extracted automatically via Gemini Flash (`gemini-parser.js` `BOOKING_SCHEMA` and regex heuristics) and email ingestion worker (`email-worker.js`). Sensitive field whitelisting in `import-jobs.js` preserves payment method descriptions while redacting credit card numbers.
  - Interactive Expense Ledger ([ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx)): Add/Edit Expense modal includes dedicated text inputs with 1-click quick suggestion chips for top sites and payment methods. Displays visual badges with `ShoppingCart` and `CreditCard` icons on ledger list items.
  - Timeline Synchronization ([PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx)): Itinerary cards render "Purchased At" and "Payment" metadata pills in the card footer alongside confirmation numbers and ticket links.

## 15. Intelligent Excursion Reconciliation, Canonical Booking Deep-Linking & Universal Ticket Viewer

To eliminate redundant day trip suggestions, resolve timeline schedule conflicts, and prevent broken adjust deep-links, Wayfinder provides an automated excursion reconciliation and ticket viewer engine:

- Redundant Excursion Idea Suppression ([itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js)):
  - Landmark & Keyword Cross-Referencing: When an authenticated user has a confirmed private excursion booking (such as the 11-hour Auschwitz-Birkenau and Wieliczka Salt Mine tour), the timeline engine cross-references keywords (`auschwitz`, `wieliczka`, `salt mine`, `malbork`, `zakopane`).
  - Automatic Elimination: Generic placeholder suggestions (such as `Day Trip Idea: Wieliczka Salt Mine or Auschwitz Memorial`) are automatically suppressed from the unified timeline, ensuring travelers never see redundant prompts for tours they have already booked.
- Time-Window Occlusion & Conflict Resolution:
  - Daytime Sight Suppression: For excursions spanning four or more hours (e.g. 06:30 to 17:30), generic daytime city sights and walking tours falling within the active excursion window (e.g. 14:00 Kazimierz Jewish Heritage Walk) are automatically suppressed from the active schedule because travelers are physically away on the tour.
  - Evening Activity Preservation: Late afternoon and evening activities scheduled after the excursion returns (such as 17:00 Plac Wolnica chalets and 19:30 dinner at Plac Nowy Zapiekanki) remain clearly displayed for when travelers return to the base city.
- Canonical Web URL Resolution & Auto-Authentication:
  - Elimination of Adjust Tracking Errors: Replaces mobile app tracking links (`https://l4ab.adj.st/...`, which return 404 "URL not found" in desktop web browsers) by extracting and decoding the embedded `adj_fallback` parameter.
  - Guest Session Deep-Linking: Injects `partner_id` and `visitor_id` query parameters directly into the canonical GetYourGuide web URL (`https://www.getyourguide.com/booking/:ref?partner_id=...&visitor_id=...`), allowing travelers to access their mobile tickets and activity details with zero login barriers.
- Universal Ticket & PDF Inspection:
  - Direct Iframe Viewer: Replaces erratic `<object>` tags with CSP-compliant `<iframe src={`${fileUrl}#toolbar=1&view=FitH`}>`, supported by `object-src 'self' blob: data:` in [worker.js](file:///e:/TechTrekGT/wayfinder/src/worker.js).
  - Quick Actions: Adds direct "Open in New Tab" and "Download Ticket PDF" action buttons in [DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx) and [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx).
  - Prominent Excursion Banner: Displays a verified confirmation banner and time block pill on [PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx) (`06:30 - 17:30 (11h Guided Excursion)`).

## 16. Booking Metadata Sanitization & Linebreak Normalization Engine

To prevent raw email-dump text, regex bleed-through, and multiline escape sequence leaks in itinerary cards and document modals:

- Universal Linebreak Normalization: Standardizes all representations of line breaks (`\\r\\n`, `\\n`, `\r\n`, `\r`) into standard ASCII newlines (`\n`) prior to text splitting or regex evaluation across both SQLite D1 databases and client UI components.
- Centralized `parseBookingMetadata(item)` ([PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx)):
  - Structured Key-Value Extraction: Iterates normalized lines and extracts known fields (`Confirmation`, `Booking Reference`, `Supplier`, `Pickup Window`, `Tickets`, `Duration`, `Bag Restrictions`, `Mobile Tickets`, `Activity Details`) into a clean dictionary.
  - Zero Raw Dump Leak: Suppresses internal metadata headers and URLs from being rendered as raw card descriptions. Falls back to curated, context-aware narrative descriptions for tours and flights.
  - Ticket and Duration Decoupling: Separates participant counts (e.g., `2 Adults (Age 17 - 99) - English`) from trip duration (`11 hours`), rendering clean individual metadata badges.
  - Museum Bag Restriction Polish: Replaces redundant repetitious text with a clear, concise safety and locker advisory.
- Multi-Component Parity:
  - [PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx): Uses structured metadata for the main timeline display, eliminating all multiline bleeding.
  - [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx): Powers the `selectedBooking` modal grid and converts escaped newlines in raw email forward notes into properly wrapped paragraphs.

## 17. Official Lodging Document Integration (Hotel Altus Palace Wrocław)

Provides synchronized document verification and offline-capable ticket inspection for trip accommodations:

- Official Voucher Asset: Bundled PDF confirmation [Hotel_Altus_Palace_Wroclaw_Confirmation.pdf](file:///e:/TechTrekGT/wayfinder/public/Poland-2026/docs/Hotel_Altus_Palace_Wroclaw_Confirmation.pdf) documenting confirmation number `ALT-88421`, 2-night stay dates (Dec 7-9, 2026), room tier (Palace Deluxe Double Room), total fare (2,400.00 PLN), hotel phone (+48 71 747 50 00), and email.
- Relational Document Entity: Registered in `wayfinder_documents` (`doc-altus-palace-wroclaw`) and cross-linked to verified itinerary item `itin-altus-palace-wroclaw` and ledger expense `exp-altus-palace-hotel`.
- Document Center Parity: Renders within "Synced Trip Confirmations" and the primary document repository in [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx), with seamless 1-click in-app PDF previewing.

## 18. Resilient Offline Mutation Queue & Ambient Connection Telemetry

Wayfinder provides seamless offline resilience for travelers moving through cellular dead zones, underground transit tunnels, and high-speed rail corridors across Poland:

- Client-Side IndexedDB Mutation Store ([documentStorage.js](file:///e:/TechTrekGT/wayfinder/src/utils/documentStorage.js)):
  - Upgraded schema to Database Version 2 (`DB_VERSION = 2`), provisioning the `mutation_queue` object store.
  - Indexed by `status` (pending, replaying, failed, completed) and `createdAt` timestamp for deterministic FIFO processing.
  - Stores serializable mutation envelopes containing HTTP method, target URL, payload body, headers, entity metadata, and retry attempt counters.
- Deterministic Replay Engine & Idempotency Key Protocol ([mutationQueue.js](file:///e:/TechTrekGT/wayfinder/src/utils/mutationQueue.js)):
  - Cryptographic Idempotency Header: Injects a unique `X-Idempotency-Key` (UUIDv4) into every mutated request, ensuring Cloudflare edge workers and D1 SQLite transactions never execute duplicate operations upon replay.
  - Transparent `resilientFetch` Wrapper: Intercepts network failures (e.g., `TypeError: Failed to fetch`, offline browser events). Instead of throwing fatal errors to UI components, it serializes the mutation into IndexedDB and returns a synthetic HTTP `202 Accepted` response with `{ queued: true }`.
  - FIFO Replay Queue: Processes pending offline changes in strict order of capture when connection is restored.
  - Adaptive Auto-Drain Listeners: Listens to native browser `window.addEventListener('online')` and `window.addEventListener('focus')` events, initiating automatic background queue drain when connectivity resumes.
  - Global DOM Event Bus: Dispatches `wayfinder:queue-updated`, `wayfinder:sync-start`, `wayfinder:sync-complete`, and `wayfinder:mutation-synced` events to keep active React components in sync without coupling.
- Ambient Telemetry & Sync Management Pill ([OfflineSyncBadge.jsx](file:///e:/TechTrekGT/wayfinder/src/components/common/OfflineSyncBadge.jsx)):
  - Unified Status Indicator: Mounted into both the desktop right actions strip and the sticky mobile top bar in [Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx).
  - Ambient Color Coding: Displays subtle muted green when fully synchronized and online; vibrant amber badge with pending counter when mutations are queued offline; animated spinning blue badge during active synchronization.
  - Interactive Queue Inspector Modal: Travelers can click the badge to review pending operations (entity type, action, timestamp), view connection details, and trigger manual "Sync Now" flushes.
- Resilient Mutation Wireup:
  - [PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx): Packing item checkboxes, quantity increments, item deletions, and bulk list operations safely persist locally while offline.
  - [ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx): Expense additions, category updates, individual split settlements, and undo operations queue transparently when disconnected.
  - [WayfinderContext.jsx](file:///e:/TechTrekGT/wayfinder/src/context/WayfinderContext.jsx): Extracted field modifications, approval reviews, and document status updates queue safely without user disruption.

## 19. Intelligent Booking Document & Email Parsing Engine (Gemini Structured Outputs)

Replaces brittle regex matching and static simulated filename keywords with a serverless, multi-modal Gemini 2.5 Flash / 3.8 Flash structured output parsing pipeline:

- Gemini Structured Extraction Engine ([gemini-parser.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/gemini-parser.js)):
  - Schema Enforcement: Leverages `responseMimeType: "application/json"` and strict `responseSchema` definitions, guaranteeing typed outputs for 7 core travel item types: `flight`, `rail`, `hotel`, `excursion`, `restaurant`, `transport`, `other`.
  - Rich Travel Metadata Normalization: Deterministically extracts start/end dates (ISO YYYY-MM-DD), start/end times (24-hour HH:MM), carrier/provider names, confirmation/booking codes, origin and destination stations, assigned seats, total costs, and ISO currency codes (PLN, USD, EUR, GBP).
  - Multi-Provider Ingestion Support: Built-in recognition for Polish and European travel providers including PKP Intercity, Delta Air Lines, LOT Polish Airlines, GetYourGuide, Hotel Altus Palace, Accor / The Bridge Wroclaw, Hotel Stary Krakow, and Booking.com.
  - Strict Privacy and Security Scrubbing: Automatically scrubs credit card numbers, CVVs, and full passport IDs before persistence in Cloudflare D1.
  - Resilient Zero-Key Heuristic Fallback: In offline local development or when `GEMINI_API_KEY` is not bound, falls back seamlessly to an intelligent serverless heuristic parser, extracting structured metadata without throwing fatal runtime errors.
- Cloudflare Inbound Email 2-Stage Pipeline ([email-worker.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-worker.js)):
  - Stage 1 Fast Regex Pass: Quickly matches standard GetYourGuide, Delta, and PKP email formats.
  - Stage 2 Gemini Fallback: Automatically invokes the Gemini parser when regex confidence is low, confirmation code is missing, or dates fail bounds checking.
- Interactive Document Center Upload Pipeline ([DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)):
  - Binary and Text Streaming: Reads uploaded PDF vouchers, tickets, or text files and dispatches them to `POST /api/wayfinder/import-jobs/:doc_id/parse`.
  - Automated Field Population: Automatically populates `wayfinder_extracted_fields` and flags the extraction job as `ready_for_review`.
  - Review Gate Integration: Opens the verification modal with extracted values highlighted for user approval before landing into `wayfinder_itinerary_items`.

## 20. Parser Self-Healing, Inbound Document Ingestion & Lodging Ledger Reconciliation

Provides end-to-end self-healing for forwarded travel confirmations, instant UI feedback, and verified multi-city expense splits:

- Resilient Parser Auto-Healing ([import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js)):
  - Zero-404 Extraction Recovery: If an extraction job record is missing when inspecting a document, the API automatically provisions a `ready_for_review` job record in `wayfinder_extraction_jobs`.
  - Automatic Field Population: When a document has no extracted fields, the handler inspects linked itinerary item records and document metadata to populate initial fields (`hotel_name`, `carrier`, `airline`, `confirmation_number`, `dates`, `times`, `location`, `total_cost`) into `wayfinder_extracted_fields`.
  - Duplicate Itinerary Suppression: Approving an extraction job checks for existing items by `source_document_id`, executing an atomic SQL `UPDATE` instead of creating redundant duplicate bookings.
  - European Decimal Normalization: Normalizes comma decimal currencies (e.g. `450,00 PLN` -> `450.00 PLN`) and ISO symbol aliases (`zł`, `PLN`, `USD`, `EUR`).
- Document Center Refresh & Feedback UX ([DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)):
  - Animated Refresh Indicator: Replaces silent static button with an active spinning icon (`animate-spin`), disabled state during operations, and success toast confirming data synchronization across documents, jobs, and bookings.
  - Multi-Entity Concurrent Fetch: Executes concurrent background fetches for documents (`fetchDocuments`), extraction jobs (`fetchJobs`), and itinerary timeline items (`fetchItinerary`).
  - 1-Click Reparse for Pending Documents: Adds a dedicated "Reparse" action on pending cards, allowing users to trigger serverless Gemini extraction directly from the document grid.
- Multi-City Lodging & Expense Reconciliation ([expenses.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/expenses.js) & Cloudflare D1):
  - Hotel Experior Boutique Kraków: Reconciled 3-night stay (Dec 4-7, 2026) for $366.43 USD fronted by Jon Kemp, properly attributing the Kraków lodging location and 50/50 member splits ($183.22 / $183.21).
  - Hotel Altus Palace Wrocław: Reconciled 2-night 5-star palace stay (Dec 7-9, 2026) for 2,400.00 PLN (~$600.00 USD) fronted by Jonathan Kemp, correcting the city to Wrocław and linking to booking voucher `ALT-88421`.
  - Hotel Brovaria Poznań: Reconciled 1-night Old Market Square microbrewery stay (Dec 9-10, 2026) for 450.00 PLN (~$112.50 USD) fronted by Jonathan Kemp, linking to confirmed receipt attachment.

## 21. Hardened Document Import Job Handler & PDF/Booking Parser Engine

Hardenings in [import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js) and [gemini-parser.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/gemini-parser.js) resolve data integrity bugs, schema mismatches, and PDF/heuristic parsing edge cases:

- Atomic D1 Batches for Field Mutations:
  - In both `/parse` and `/fields` endpoints, the deletion of previous fields (`DELETE FROM wayfinder_extracted_fields WHERE document_id = ?`) and insertion of freshly extracted fields are bundled into a single atomic `env.DB.batch([deleteFieldsStmt, ...stmts])` transaction, preventing empty states or orphaned rows during failures.
- Unified Lowercase-Normalized Sensitive Field Filter (`isSensitiveField`):
  - Normalizes field names to lowercase before evaluating security filters.
  - Explicitly permits `payment_method` while strictly redacting sensitive account numbers, CVVs, card numbers, and passport IDs.
- Target Item ID & Foreign Key Deduplication:
  - On approval (`action === 'approve'`), queries `existingItem` before generating any new ID and sets `targetItemId = existingItem ? existingItem.id : itemId`.
  - Consistently binds `targetItemId` across the itinerary insert/update, audit events, `wayfinder_expenses.itinerary_item_id`, and the JSON response.
- Penny-Loss Prevention & Re-Approval Expense Synchronization:
  - Calculates 50/50 expense splits using `Math.floor((parsedCost.amount / 2) * 100) / 100` and assigns the remainder penny to Ronald Milton Few via `Number((parsedCost.amount - split1).toFixed(2))`.
  - On re-approval of an existing document expense, an `else` branch atomically updates `wayfinder_expenses` and both `wayfinder_expense_splits` records to propagate user price overrides.
- Single-Pass Content Stream Tokenizer with Reading Order & Bracket Scope Tracking:
  - Replaces four independent scanning passes with a single top-to-bottom tokenizing loop in `extractTextFromContentStream`, preserving natural PDF reading order.
  - Implements `findMatchingBracket` tracking literal string parens and hex string angles so literal brackets inside PDF strings do not terminate the array scan.
  - Supports both `'` and `"` text display operators alongside both `pendingHex` and `pendingLit` buffers.
- Unicode Code Point Safety & CMap Range Expansion:
  - Uses `String.fromCodePoint` for supplementary Unicode plane mapping and expands `bfrange` step capacity from 256 to 1024.
- Luhn Validation for Credit Card Redaction:
  - Verifies candidate numbers against the Luhn algorithm in `scrubSensitiveData`, preventing false-positive redaction of 13-digit airline e-tickets and 11-digit PKP references.
- Heuristic Execution Ordering & Trigger Tightening:
  - Runs dynamic regex extractors (confirmation codes, dates, times, room types, hotel names, addresses, price, currency, guests) before applying provider fallbacks via nullish coalescing `??`.
  - Tightens trigger rules to prevent false matches: Delta flight requires `DL 9208` or explicit Delta keywords (not bare 'dl' in Polish addresses); The Bridge hotel requires 'the bridge' or 'mgallery' (not bare 'bridge'); and Auschwitz/Wieliczka hardcoded titles apply only to explicit tour keywords.
- Gemini REST API Hardening:
  - Removes `?key=` query parameters from the endpoint URL, enforcing authentication strictly via the `x-goog-api-key` header.
  - Enforces `AbortSignal.timeout(20000)` on the serverless `fetch` call to fail fast and fall back gracefully to heuristic parsing if the API stalls.

## 22. Cross-File Backend API Hardening & Resilience Protocols

Comprehensive backend hardening across Wayfinder API endpoints ensures zero-loss multi-currency ledger tracking, midnight calendar compliance, and tightened edge security:

- Shared Expedition Approval Resilience ([import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js)):
  - Journey check in approval workflow matches if created by current user or if matching the shared `'poland-christmas-2026'` expedition (`slug = 'poland-christmas-2026' OR id = 'poland-christmas-2026'`), falling back to `poland-christmas-2026` if journey table row is unseeded.
  - Computes `amountUsd` from original currencies (1:1 for USD, 4.0 PLN/USD, 1.08 EUR/USD) and binds `paid_by_user_id` and `amount_usd` in both initial expense insertion and re-approval updates.
  - Maps `transport` documents to `transit` category.
- Luhn Digit Length Guardrail ([gemini-parser.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/gemini-parser.js)):
  - Enforces `digits.length >= 13 && digits.length <= 19` in `isLuhnValid`, preventing short character matches with spaces or hyphens from false-positive Luhn validation.
- Atomic Expense Mutations & Idempotent Preset Seeding ([expenses.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/expenses.js)):
  - Enforces user authentication check on `GET /api/wayfinder/expenses`.
  - Replaces sequential `run()` invocations with atomic `db.batch()` across `POST /preset`, `POST /expenses`, `PUT /expenses/:id`, `DELETE /expenses/:id`, and `DELETE /settle`.
  - Seeds presets idempotently by checking existing descriptions in D1, preventing duplicate ledger entries.
- Journey Slug Resolution & Companion Visibility ([budget.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/budget.js)):
  - Resolves expenses using `(journey_id = ? OR journey_id = ?)` bound to `(journey.id, journeyId)`.
  - Broadens query to include companion expenses where the user has an assigned split in `wayfinder_expense_splits`.
- Full-Month Inbound Email Parsing & End Date Preservation ([email-worker.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-worker.js)):
  - Expands date regex patterns to match the 16th through 31st of December without defaulting to December 6th.
  - Preserves `end_date` from Gemini Stage 2 fallback and binds `end_date` into `wayfinder_itinerary_items`.
  - Partitions odd-cent expense splits using `Math.floor` and remainder difference to prevent penny leaks.
- Email Inbox Re-activation ([email-inboxes.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-inboxes.js)):
  - Reactivates soft-deleted inboxes (`is_active = 0`) to `is_active = 1` on `POST /api/wayfinder/email-inboxes`.
- Midnight Calendar Rollover & Dynamic URLs ([calendar.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/calendar.js)):
  - Implements `addMinutesWithDate(dateStr, timeStr, minsToAdd)` to advance `endDate` whenever total minutes exceed 1440, ensuring `DTEND` is never earlier than `DTSTART`.
  - Derives feed paths dynamically from `request.url` in `getSubscribeUrls`.
- Scoped Document Ownership ([documents.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js)):
  - Removes `OR visibility = 'public'` from rename and delete handlers to prevent unauthorized modifications on shared journeys.
- Exchange Rate Timeout & Consistent Conversion Keys ([exchange-rate.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/exchange-rate.js)):
  - Adds 8-second `AbortSignal.timeout` to upstream rate fetch.
  - Returns `usdToPln`, `eurToPln`, `gbpToPln`, and `plnToUsd` in 200 JSON payloads.
- Gemini API Key Connectivity Validation & Authentication Guard ([gemini-parser.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/gemini-parser.js)):
  - Implements `isApiKeyConnected(env)` inspecting `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `GOOGLE_MAPS_API_KEY`.
  - Upgraded model target to `gemini-3.5-flash` (with `env.GEMINI_MODEL` override) ensuring full compatibility with current Google Generative Language API specifications.
  - In `callGeminiRestApi`, explicitly validates that `apiKey` is non-empty before initiating `fetch`.
  - In `parseBookingDocument`, guards Gemini REST calls by verifying both API key presence and authenticated user context (`user?.userId`). If unauthenticated or missing an API key, logs a structured warning and falls back gracefully to `heuristicParseDocument` with zero unhandled exceptions.
  - In `import-jobs.js` and `email-worker.js`, passes authenticated traveler credentials into the parsing engine.
  - Production `GEMINI_API_KEY` deployed securely to Cloudflare Workers secrets via `wrangler secret put GEMINI_API_KEY`.
- Responsive Expense Modal Viewport & Pinned Action Footer ([ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx)):
  - Enforces `max-h-[90vh]` and `flex flex-col` on modal containers across Add/Edit Expense, Total Settle-Up, and Item Settle-Up modals.
  - Constrains input fields to an inner `overflow-y-auto flex-1` container while pinning the modal header and action footer (`flex-shrink-0 bg-slate-900/95 backdrop-blur-sm`).
  - Guarantees that "Cancel" and "Save Expense" buttons remain visible and interactive on viewports with constrained vertical height.

## 23. System Administration & Account-Level API Key Governance

Provides full parity with the TechTrekGT/Finance administration architecture, enabling system administrators to monitor registered accounts and toggle Gemini AI API Key entitlements per user:

- Account-Level API Key Access Control ([gemini-parser.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/gemini-parser.js)):
  - Enforces that the serverless Gemini API is only callable when the user is authenticated and their account has `api_key_enabled = 1` in the database (or possesses administrator privileges).
  - Non-entitled or unauthenticated accounts automatically fall back to heuristic document parsing, preventing unauthorized consumption of Gemini tokens.
- Administrative API Endpoints ([admin.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/admin.js)):
  - `GET /api/wayfinder/admin/stats` and `GET /api/admin/stats`: Returns user account counts, active/suspended metrics, API key entitlement counts, Wayfinder operational statistics (journeys, documents, itinerary milestones), and the full user catalog.
  - `POST /api/wayfinder/admin/user-api-access` and `POST /api/admin/user-api-access`: Toggles `users.api_key_enabled` between 0 and 1 for any specified user account.
  - `POST /api/wayfinder/admin/user-status` and `POST /api/admin/user-status`: Toggles account status between `Active` and `Suspended` while incrementing `token_version` on suspension to revoke active sessions.
- Dedicated Admin Dashboard Component ([AdminView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/admin/AdminView.jsx)):
  - Renders 4 high-level stat cards (Total Accounts, Active Accounts, API Key Enabled, Suspended Accounts) alongside Wayfinder operational counters.
  - Interactive user table with real-time search filtering, status badges, and one-click toggle actions for both account status and API key entitlements.
  - Role-based route guard rendering an Access Denied view for non-admin accounts.
- Navigation Integration ([Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx) & [PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx)):
  - Renders a prominent amber Shield "Admin" link in desktop navigation, mobile top bar, and Private Operations Hub when `user.isAdmin` or `user.role === 'admin'`.
  - Client-side routing in `App.jsx` dynamically resolves `/wayfinder/admin` and `/wayfinder/poland-christmas-2026/admin`.

## 24. Viewport Optimization & Unified Sticky Navigation Bar

Refines the navigation architecture in [Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx) to eliminate redundant vertical header elements and lock navigation permanently in view:

- Unified Sticky Header Bar:
  - Eliminated the separate full-width black banner section above the navbar, reclaiming significant vertical viewport space.
  - Moved the brand graphic asset (`wayfinderHeaderBanner`) directly into the left side of the primary navigation bar (`h-9 sm:h-11 md:h-12`), replacing the former compass icon and text logo.
  - Enforced `sticky top-0 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-[#b48214]/30 shadow-xl` without CSS transforms, locking the navigation bar at the top of the viewport across all pages and scroll depths.
  - Configured `overflow-x-clip` on the layout root container to prevent horizontal scrollbars while preserving native browser `position: sticky` behavior.
- Streamlined Header Actions:
  - Removed the standalone "Launch Pad" button from the top navigation bar to prevent horizontal overflow and button wrapping on desktop and laptop displays (retained in the global footer for cross-platform navigation).
  - Streamlined the "Currency Converter" button across desktop and mobile headers by removing the live rate badge (`zł 3.94`), presenting a clean, compact interactive button that launches the full converter modal on demand.

## 25. Brand Logo Spill-Over & Zero-Gap Sub-Toolbar Architecture

Refines header brand presentation and eliminates intermediate coordinate displacement gaps:

- Brand Logo Overflow Spill-Over ([Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx)):
  - Enlarged `wayfinderHeaderBanner` image dimensions across breakpoints (`h-14 sm:h-18 md:h-20 lg:h-22`) with negative margin offsets (`-mb-4 sm:-mb-6 md:-mb-8 lg:-mb-9`).
  - Allows the graphic explorer emblem and compass badge to gracefully spill over the bottom gold border of the fixed navbar with drop-shadow depth (`drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)]`) while keeping the header row compact (`h-14 sm:h-16`).
- Zero-Gap Sub-Toolbar In-Flow Docking ([PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx)):
  - Converted the Private Operations Hub secondary navigation bar from an internal sticky offset to standard in-flow positioning (`relative z-20 w-full bg-slate-900/95 backdrop-blur-xl border-b border-white/10 shadow-lg`).
  - Eliminates the 64px black void caused by child sticky coordinate calculation within `<main>`, docking the sub-toolbar flush against the main navigation bar bottom border (gap = 0.0px).
  - Re-spaced the trip summary badges and breadcrumb navigation, ensuring date pills (`[DEC 3 - DEC 13, 2026]`, `[10 DAYS • 9 NIGHTS]`) and "Back to Poland Journey" link remain fully visible without top edge clipping.
- Timeline Day Header Realignment ([ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx)):
  - Synchronized sticky day headers (`sticky top-14 sm:top-16 z-20`) and target anchor offsets (`scroll-mt-24`) to dock cleanly beneath the primary navigation bar during deep timeline exploration.

## 26. Unauthenticated Privacy Guardrail & Confirmed Booking Isolation

Enforces strict defense-in-depth privacy isolation between public guide visitors and authenticated travelers:

- Public Catalog Sanitization ([poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js)):
  - Purged private passenger names (Ronald Milton Few, Jonathan Kemp) and confirmation codes (GUDI3J) from the static public `itinerary` schedule and `flightArrival` dataset.
  - Day 1 and Day 10 public schedules present generic travel arrival/departure milestones ("Target Arrival: Kraków Airport (KRK)", "Morning Departure: Gdańsk (GDN) -> Amsterdam (AMS)", "Homeward Flight: Amsterdam (AMS) -> Atlanta (ATL)") without "Confirmed Arrival" badges.
  - Exported private confirmed flight details into `confirmedFlightEvents` for dynamic overlay exclusively upon authentication.
- Authentication-Gated Timeline Merging ([itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js)):
  - `buildUnifiedDayTimeline` accepts `isAuthenticated` boolean parameter.
  - Unauthenticated requests strictly suppress private D1 bookings and confirmed hotel accommodations (`activeAccommodations = []`, `enrichedPrivate = []`).
  - Automatically upgrades public flight milestones to confirmed personal flight records and attached vouchers only when `isAuthenticated === true`.
- Component-Level Document & Badge Gating:
  - [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) & [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx): Wrapped "View Delta Flight Confirmation" button, `Conf: GUDI3J` badge, and private booking cards in `{isAuthenticated && ...}` checks.
  - [RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx): Gated `Conf: GUDI3J` and "View Document" preview button behind authentication; unauthenticated visitors view generic "Kraków Airport (KRK)" air arrival without confirmation numbers.
  - [CityHotelsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityHotelsTab.jsx): Suppressed confirmation codes and Delta flight document buttons when unauthenticated, displaying public airport transit details.
  - [DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx): Enforced strict early return (`if (!isOpen || !isAuthenticated) return null;`), preventing unauthenticated preview of booking PDFs or passenger rosters.

## 27. Schedule View Scope Resolution & Calendar Sync Authentication Gate

Resolves the runtime crash during Schedule View stop expansion and enforces strict authentication gating on all calendar synchronization triggers:

- Schedule View Scope Resolution ([PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx)):
  - In `JourneyStopSchedule`, added `const { isAuthenticated: contextIsAuth } = useAuth();` and resolved `isAuthenticated` from props with context fallback (`propIsAuth !== undefined ? propIsAuth : contextIsAuth`).
  - Passed `isAuthenticated={isAuthenticated}` directly from `PolandLanding` to `<JourneyStopSchedule />`.
  - Eliminates the runtime `ReferenceError: isAuthenticated is not defined` when switching to Schedule View or expanding individual city stops, allowing all 5 destination stop dossiers, weather widgets, and transit connector cards to render cleanly.
- Universal Calendar Sync Authentication Gate:
  - Landing Journey Sequence ([PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx)): Wrapped the "Calendar Sync" quick action button in `{isAuthenticated && ...}`, completely hiding it from unauthenticated visitors.
  - Private Operations Hub ([PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx)): Wrapped the "Sync Calendar" sub-toolbar button in `{isAuthenticated && ...}`.
  - Full Expedition Timeline ([ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx)): Wrapped the "Sync / Export (.ics)" header button in `{isAuthenticated && ...}`.
  - Calendar Subscribe Modal ([CalendarSubscribeModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/calendar/CalendarSubscribeModal.jsx)): Added an early return guard (`if (!isOpen || !isAuthenticated) return null;`) preventing the modal from rendering or executing feed token queries for unauthenticated visitors.
  - Calendar Snapshot API Route ([src/worker.js](file:///e:/TechTrekGT/wayfinder/src/worker.js)): Enforced authentication checks on `GET /api/wayfinder/calendar/export.ics` (`if (!auth.ok) return auth.error;`), requiring an active authenticated session to download calendar snapshots.
## 28. Universal Itinerary Deep-Linking & Turn-by-Turn Navigation Parity

Extends granular venue deep-linking, smooth auto-scroll, amber glow highlight pulsing, and 1-click turn-by-turn Google Maps navigation across all Sights and Christmas Markets across all 5 expedition cities (Kraków, Wrocław, Poznań, Toruń, Gdańsk):

- Granular Destination Resolver ([itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js)):
  - Expanded `getItemDestination(itemData, dayCityId)` with comprehensive keyword and city matching for both `type === 'market'` and `type === 'sight'`.
  - Markets: Deep-links to exact cards via `#rynek-glowny`, `#maly-rynek`, `#kazimierz-wolnica` (Kraków); `#wroclaw-rynek`, `#wroclaw-plac-solny`, `#wroclaw-swidnicka` (Wrocław); `#poznan-plac-wolnosci`, `#poznan-stary-rynek`, `#poznan-mtp` (Poznań); `#torun-rynek-staromiejski` (Toruń); `#gdansk-targ-weglowy`, `#gdansk-tkacka`, `#gdansk-wyspa-spichrzow` (Gdańsk).
  - Sights: Deep-links to exact cards via `#wawel-castle`, `#st-marys-basilica`, `#cloth-hall`, `#kazimierz-district`, `#planty-park`, `#wieliczka-salt-mine`, `#auschwitz-birkenau`, `#schindler-factory`, `#chocholow-thermal-baths` (Kraków); `#ostrow-tumski`, `#wroclaw-dwarfs`, `#panorama-raclawice`, `#centennial-hall`, `#tumski-bridge`, `#wroclaw-ratusz` (Wrocław); `#poznan-rogalowe-muzeum`, `#poznan-ratusz`, `#poznan-ostrow-tumski`, `#poznan-zamek-cesarski` (Poznań); `#torun-zywemu-muzeum-piernika`, `#torun-dom-kopernika`, `#torun-krzywa-wieza`, `#torun-ratusz-staromiejski` (Toruń); `#gdansk-dlugi-targ`, `#gdansk-bazylika-mariacka`, `#gdansk-zuraw`, `#gdansk-fontanna-neptuna`, `#gdansk-muzeum-ii-wojny`, `#gdansk-ecs-solidarnosc`, `#sopot-pier` (Gdańsk).
- Dynamic Amber Glow Highlight & Auto-Scroll:
  - Attractions Tab ([CityAttractionsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityAttractionsTab.jsx)): Added `useEffect` listener detecting `#targetId` or `?sight=targetId`. Smoothly scrolls the target card into viewport center (`block: 'center'`) and pulses the amber highlight ring (`ring-4 ring-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.8)]`) with automatic removal after 3500ms.
  - Markets Tab ([CityMarketsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityMarketsTab.jsx)): Added `useEffect` listener detecting `#targetId` or `?market=targetId`. Auto-switches to the grid view (`activeMarketTab = 'all'`) if needed so the tile is mounted in the DOM, then smoothly scrolls and pulses the amber highlight ring for 3500ms.
- Deterministic IDs & Interactive Map Direction Badges:
  - Must-See Card ([MustSeeCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/MustSeeCard.jsx)): Assigned deterministic `id` and `scroll-mt-36` to the `<article>` tag. Wrapped `cardTransit` address text with an interactive `<a>` link pointing to turn-by-turn Google Maps navigation (`https://www.google.com/maps/dir/?api=1&destination=...`) with hover styling and `<ExternalLink />` icon.
  - Market Tiles ([CityMarketsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityMarketsTab.jsx)): Assigned deterministic `id={market.id}` and `scroll-mt-36` to grid articles and deep-dive cards. Wrapped `market.address` with direct turn-by-turn Google Maps navigation links.
- Generalized Itinerary Tile Action Launchers:
  - Itinerary View ([ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx)) & Landing ([PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx)): Generalizes the timeline event bottom action launcher for all destination types:
    - Food: Amber pill button with `<Utensils />` icon and `${cityName} Dining Guide`.
    - Market: Purple pill button with `<Sparkles />` icon and `${cityName} Market Guide`.
    - Sight: Sky blue pill button with `<Landmark />` icon and `${cityName} Attractions Guide`.
  - Timeline Item Map Directions: Enhanced timeline item location links with city-grounded parameters (`${timelineItem.data.location}, ${cityName || 'Poland'}`), guaranteeing exact geographic context for turn-by-turn navigation in Google Maps.
- Deep-Link Scroll Protection ([CityPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/CityPage.jsx)):
  - Added an early return check in `useLayoutEffect` (`if (typeof window !== 'undefined' && window.location.hash) return;`), ensuring sub-page header scroll offsets do not preempt or interrupt tile-level smooth scrolling when navigating to deep-linked venue tiles.

## 29. Compact Tile Architecture & Responsive 2-Column Action Footer

Eliminates excessive vertical tile height and resolves button label truncation across attraction, dining, and venue cards:

- Must-See Card Compact Geometry ([MustSeeCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/MustSeeCard.jsx)):
  - Scaled hero image height from fixed `h-[200px]` to `h-36 sm:h-40 md:h-44` (144px-160px).
  - Streamlined container padding to `p-3.5 sm:p-4.5` and adjusted card titles to `text-base sm:text-lg line-clamp-2`.
  - Enforced `line-clamp-3` on venue descriptions to prevent unbounded paragraph expansion.
  - Streamlined GetYourGuide and Viator booking buttons to `min-h-[32px] sm:min-h-[34px]`.
  - Reclaimed over 180px of vertical card height, ensuring tiles fit comfortably within standard desktop and laptop viewports.
- 2-Column Responsive Action Footer Parity ([MustSeeCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/MustSeeCard.jsx), [CityFoodTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityFoodTab.jsx), [CityLgbtqTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityLgbtqTab.jsx)):
  - Replaced crowded 4-column inline footers (`sm:grid-cols-4`) with an ergonomic 2-column grid (`grid grid-cols-2 gap-2`).
  - Removed aggressive text truncation (`truncate`), providing ample width (~140px per button) so labels (`Website`, `Directions`, `View on Map`, `+ Itinerary` / `Saved`) render in full without ellipses.
  - Set unauthenticated full-width spanning (`col-span-2`) for "View on Map" when itinerary toggles are hidden.
- Optimized Grid and Optimizer Spacing ([CityAttractionsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityAttractionsTab.jsx), [WalkingLoopOptimizer.jsx](file:///e:/TechTrekGT/wayfinder/src/components/route/WalkingLoopOptimizer.jsx)):
  - Reduced attractions grid gap from `gap-6` to `gap-4 sm:gap-5` and section spacing to `space-y-4 sm:space-y-5`.
  - Compacted the Walking Loop Optimizer panel padding to `p-4 sm:p-5` with `p-2.5 sm:p-3` metric cards, preserving valuable vertical screen real estate.



## 30. Shared Agenda Collaboration & Email Invitations

- Roles: `owner` (journey `created_by`), `admin` (share admin), `editor`, `viewer`, `none` (unaffiliated). Platform admins resolve to `admin`. Only the owner can grant or modify `admin`.
- Access boundaries: Collaborators share access across itinerary and packing according to their role. Strict tier separation applies to sensitive modules (Documents, Expenses, Budget, Import Jobs) which are restricted exclusively to `owner` and `admin` (platform admin or share admin). `editor` and `viewer` roles are blocked with HTTP 403 Forbidden from accessing sensitive vaults.
- API (`functions/api/wayfinder/agenda-shares.js`): `POST/GET /api/wayfinder/agendas/:id/invites`, `DELETE .../invites/:inviteId` (revoke), `PUT/DELETE .../shares/:userId`, `GET .../access` (caller role and permissions object), public `GET /api/wayfinder/invites/verify?token=`, session `POST /api/wayfinder/invites/claim`.
- Invite creation: 32 random bytes via `crypto.getRandomValues` (base64url), SHA-256 stored as `token_hash`, 7-day expiry, prior pending invites for the same email are revoked. Response returns the raw token and `inviteLink` once for the Copy Link fallback; `SEND_EMAIL` dispatch (`functions/utils/inviteEmail.js`) sends from the canonical platform address `no-reply@techtrekgt.com` (configured via `env.MAIL_FROM`, aligned with Outpost) using the structured Workers Email Sending API with fallback to raw `EmailMessage`, reporting `emailSent` and `emailError`.
- Claim: requires session email to match `invited_email`; `env.DB.batch` atomically marks the invite accepted, upserts `wayfinder_agenda_shares` (keeps the higher role) and writes an audit event; 409 if the invite was consumed concurrently.
- Client: `/wayfinder/invite` renders `InviteClaim.jsx` (Case A accept card, Case B inline sign-in then auto-claim, Case C registration with locked email via `inviteToken` then auto-claim; email mismatch offers account switch). `ShareAgendaModal.jsx` (Share button in Private Hub for owner/admin) handles invite, copy link, revoke, role change and removal.
- Register: `/api/auth/register` accepts optional `inviteToken`; a matching pending invite marks `users.email_verified = 1`.

## 31. Multi-User Tenant Isolation & Gated Private Hub Access Control

Hardens Wayfinder against cross-tenant data leaks and enforces role-based boundaries between public guide exploration, shared itinerary collaboration, and confidential travel document vaults:

- Universal Role Resolution Protocol (`functions/utils/agendaAccess.js`):
  - Function `resolveAgendaAccess(env, ref, user)` deterministically resolves the caller's relationship to any journey ref (ID or slug) to exactly one of `owner`, `admin`, `editor`, `viewer`, or `none`.
  - Deprecated and removed implicit ownership assignment to users who created invites (`invited_by`), preventing privilege escalation if a collaborator is demoted or removed.
  - Generates unified server-side capability matrix via `agendaPermissions(role)` returning `{ itinerary, packing, documents, expenses, share, edit }`.
- Backend Endpoint Authorization & Scoping (`functions/api/wayfinder/*`):
  - Elimination of Unscoped Visibility Fallbacks: Removed naive `!access.role && journey.visibility !== 'public'` gates and hardcoded `OR journey_id = 'poland-christmas-2026'` query fragments across `documents.js`, `expenses.js`, `budget.js`, `accommodations.js`, `itinerary.js`, `packing.js`, and `import-jobs.js`.
  - Sensitive Document & Expense Vaults (`documents.js`, `expenses.js`, `budget.js`): Enforces `canViewSensitive(role)` (`owner` or `admin`). Non-admin collaborators (`editor`, `viewer`) and unaffiliated users (`none`) receive HTTP 403 Forbidden. All ID-based mutation operations (`PUT /expenses/:id`, `DELETE /expenses/:id`, `DELETE /expenses/settle`) enforce relational journey isolation (`WHERE id = ? AND journey_id = ?`) to eliminate cross-journey IDOR vulnerabilities.
  - Accommodations Security (`accommodations.js`): Gated behind `isMember(role)`. Non-members receive an empty array, and non-sensitive roles have booking costs, currency, and source document links scrubbed from output.
  - Itinerary Schedule Parity (`itinerary.js`): Authenticated non-members querying the schedule receive only items with `visibility = 'public'`, completely isolating private bookings, confirmation numbers, and internal notes. Mutations require `canEdit(role)`.
  - Packing List Isolation (`packing.js`): Gated behind `isMember(role)`. Non-members receive HTTP 403 Forbidden on all operations.
  - Import Jobs & Email Inboxes (`import-jobs.js`, `email-inboxes.js`): Approval and inbox provisioning require `canManage(role)` on the resolved journey.
- Relational Ownership Migration:
  - Reassigned `wayfinder_journeys.created_by` for `'poland-christmas-2026'` in D1 from `'system'` to the designated primary account ID (`usr-1785511589441-3fvgv`), establishing cryptographic ownership without heuristic fallbacks.
- Client-Side Gatekeeping & View Isolation (`src/context/WayfinderContext.jsx`, `src/components/PrivateHub.jsx`, `src/components/BottomTabBar.jsx`):
  - Shared Context State: `WayfinderContext` fetches and holds `agendaAccess` `{ role, permissions, loaded }` on initial auth load. Data fetchers (`fetchDocuments`, `fetchJobs`) execute only when `permissions.documents` is true, preventing unlinked users from initiating unauthorized requests or polluting IndexedDB.
  - Unaffiliated Account Gate (`NoAccessPanel`): Authenticated users resolving to `role: 'none'` accessing `/private` are greeted by an unauthorized explanation screen directing them to the public guide or offering an invite claim shortcut. Restricted child components (`ItineraryView`, `DocumentCenter`, `ExpenseLedger`, `PackingManager`) remain completely unmounted.
  - Sub-Toolbar Tab Pruning: `PrivateHub` dynamically filters sub-toolbar navigation tabs so users only see links to authorized modules (e.g. Documents and Expenses tabs are hidden for editors and viewers).
  - Deep-Link Interception: Attempting to directly navigate to restricted tabs (`/private/documents`, `/private/expenses`) silently redirects the caller back to `/private` via `window.history.replaceState` and displays a contextual permission warning.
  - Mobile Bottom Bar Adaptation (`BottomTabBar.jsx`): Dynamically resolves the Hub tab route to `/private/documents` for administrators and `/private` for non-document roles.

## 32. Mandatory Email Verification for User Registration & Sign In Gating

Enforces email ownership validation before allowing new user accounts to sign in or obtain active platform session credentials:

- Unverified Registration Quarantine (`functions/api/auth/register.js`):
  - Standard user registration creates the account with `email_verified = 0` and `email_verified_at = NULL`.
  - Withholds automatic session issuance (no `Set-Cookie` header and no JWT returned).
  - Automatically generates a cryptographically random 8-digit verification code (`generateVerificationCode()`).
  - Computes a SHA-256 HMAC digest (`verify:${cleanEmail}:${verificationCode}`) using `CODE_HMAC_SECRET || JWT_SECRET` and persists the record into shared `email_verifications` with a 24-hour expiration window.
  - Dispatches an email with the 8-digit verification code via `SEND_EMAIL` / `EmailMessage` / Resend API using the platform canonical address `no-reply@techtrekgt.com`.
  - Returns HTTP 201 with `{ success: true, requiresVerification: true, email }`.
  - Exception: Registrations carrying a valid, active `inviteToken` prove control of the invited inbox and are marked `email_verified = 1` immediately upon account creation.
- Login Verification Enforcement (`functions/api/auth/login.js`):
  - Validates credentials against PBKDF2 password hashes.
  - Prior to issuing session tokens, verifies `user.email_verified === 1 || Boolean(user.email_verified_at)`.
  - Unverified accounts are blocked with HTTP 403 Forbidden and `{ error: 'Email verification required...', code: 'EMAIL_VERIFICATION_REQUIRED', requiresVerification: true, email }`, preventing unverified sign ins.
- Email Verification Endpoint (`POST /api/auth/verify-email`):
  - Rate limited to 5 attempts per 60 seconds per IP.
  - Accepts `{ email, code }` and validates 8-digit formatting (`/^\d{8}$/`).
  - Retrieves active verification records from `email_verifications` where `used = 0`.
  - Enforces timing attack mitigation via constant-time string comparison (`constantTimeStringEqual`).
  - Tracks failed attempts (marks code invalid after 5 failed attempts).
  - Upon successful verification, atomically marks the code as `used = 1` and updates `users` setting `email_verified = 1` and `email_verified_at = datetime('now')`.
- Resend Verification Code Endpoint (`POST /api/auth/resend-verification`):
  - Rate limited to 3 attempts per 300 seconds per IP.
  - Accepts `{ email }`.
  - Neutral response pattern for non-existent or already verified accounts to prevent user enumeration.
  - For unverified accounts, invalidates prior codes, generates a fresh 8-digit code, and dispatches a new verification email.
- Client-Side Verification Flow (`src/components/AuthModal.jsx`, `src/context/AuthContext.jsx`):
  - `AuthModal` supports `mode = 'verify'` with an 8-digit numeric input, direct "Resend Code" action, and clear guidance.
  - When standard registration completes, `AuthModal` transitions directly to `mode = 'verify'`.
  - If an unverified user attempts to sign in, `AuthModal` intercepts the 403 error, transitions to `mode = 'verify'`, and prompts the user to enter their verification code.
  - Successful verification displays an evergreen confirmation alert and redirects the user to the Sign In screen with their verified email pre-filled.

## 33. Admin Dashboard Trip Collaboration Governance & Role Differentiation

Provides full administrative oversight and interactive control over trips, collaborator groups, and account permissions across the platform:

- Dual Role Representation (Platform Role vs. Trip Role):
  - Resolves ambiguity between platform-wide administrator status (`users.role = 'admin'` / `is_admin = 1`) and trip-level collaborator permissions (`wayfinder_agenda_shares.role` in `'viewer'`, `'editor'`, `'admin'`).
  - Both roles are explicitly exposed and modifiable directly within the Admin Dashboard ([AdminView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/admin/AdminView.jsx)).
- Trips & Collaborator Groups Overview:
  - Surfaces active trips and journeys discovered in D1 with complete ownership metadata (`owner.name`, `owner.email`, `Owner` badge).
  - Visualizes tied accounts per trip with real-time collaborator counts, trip roles, and active invitations.
  - Interactive Trip Role Selector: Admins can dynamically change collaborator permissions (`viewer` <-> `editor` <-> `admin`) directly from the trip card or Registered Accounts table.
  - Disconnect Action: One-click collaborator detachment with confirmation prompts (`DELETE /api/wayfinder/admin/trip-membership` or `POST .../remove`), immediately revoking Private Hub access.
  - Unaffiliated Accounts Discovery & Quick-Tie: Explicitly identifies registered users not affiliated with a given trip, offering 1-click role selection and immediate trip affiliation (`POST /api/wayfinder/admin/trip-membership`).
- Platform Role Governance:
  - Interactive platform role toggle allows authorized administrators to promote users to Platform Admin or demote them to standard User (`POST /api/wayfinder/admin/user-role`), complete with self-demotion prevention guardrails.
- Audit Logging:
  - All admin-initiated trip membership modifications, role updates, and disconnections automatically insert immutable audit entries into `wayfinder_audit_events`.

## 34. Self-Service & Administrative Account Deletion

Empowers both regular users and platform administrators to permanently erase user accounts and scrub associated personal data from the system:

- Self-Service Account Deletion ([SettingsModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/SettingsModal.jsx)):
  - Authenticated users access a dedicated "Account & Data Deletion" section in the Preferences modal.
  - Requires typing the confirmation word `DELETE` to prevent accidental deletion.
  - Dispatches `POST /api/auth/delete-account` via `AuthContext.deleteAccount()`.
  - Clears `auth_token` session cookie via `Max-Age=0`, invalidates client authentication state, and redirects to the public guide.
- Administrative Account Deletion ([AdminView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/admin/AdminView.jsx)):
  - Registered Accounts table provides a direct `[Delete]` action for both third-party accounts and the active administrator's own account.
  - Deleting another user permanently scrubs their account and refreshes admin metrics.
  - Deleting self triggers a critical confirmation alert, executes `POST /api/wayfinder/admin/user-delete`, clears the administrator's session cookie, and signs them out to the public landing page.
- Comprehensive Relational Data Scrubbing (`functions/utils/deleteAccount.js`):
  - Atomic batch cleanup across all D1 tables in `personal-budget-db`:
    - `wayfinder_agenda_shares` (membership rows)
    - `wayfinder_agenda_invites` (sent, received, or accepted invites)
    - `email_verifications` & `password_resets` (verification and reset codes)
    - `wayfinder_calendar_tokens` (personalized calendar feed tokens)
    - `wayfinder_packing_items` (user gear lists)
    - `wayfinder_expense_splits` & `wayfinder_expense_settlements` (ledger splits and payments)
    - `wayfinder_email_inboxes` & `wayfinder_gmail_connections` (forwarding inboxes and OAuth links)
    - `wayfinder_extracted_fields`, `wayfinder_extraction_jobs`, `wayfinder_documents`, & `wayfinder_expenses`
    - `wayfinder_itinerary_items` (private user bookings)
    - `wayfinder_journeys` (reassigns `created_by` to `'system'` to preserve public guide availability)
    - `users` (primary account row)
  - Records an immutable `account_deleted` entry in `wayfinder_audit_events`.

## 35. Transactional Email Dispatch via Cloudflare Email Routing & Viewport-Safe Modal Architecture

Ensures reliable transactional email delivery and unobstructed user interaction across authentication workflows:

- Standardized Cloudflare Email Routing (`functions/utils/inviteEmail.js`):
  - Configures canonical sender address `noreply@techtrekgt.com` via Cloudflare `SEND_EMAIL` binding and `MAIL_FROM` environment variable.
  - Multi-Strategy Dispatch Pipeline:
    1. Primary: Native `EmailMessage` from `cloudflare:email` using RFC 5322 MIME multipart standards with UTF-8 base64 encoding (compatible with Cloudflare Workers `nodejs_compat`).
    2. Fallback 1: Structured parameter object `{ to, from, subject, text, html }`.
    3. Fallback 2: Array-based recipient object `{ to: [{ email }], from: { email, name }, subject, text, html }`.
    4. Fallback 3: External Resend API (`api.resend.com/emails`) if `RESEND_API_KEY` is provisioned.
  - Active Delivery Validation: Gating endpoints (`/api/auth/register`, `/api/auth/resend-verification`) validate delivery status and surface actionable diagnostic errors rather than false success confirmations.
- Viewport-Safe Auth Modal Stacking & Layout ([AuthModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/AuthModal.jsx)):
  - Z-Index Elevation: Modal elevated to `z-[100]`, strictly superseding the sticky navigation bar (`sticky top-0 z-50`) to eliminate title clipping and button obscuration.
  - Vertical Bounding: Container constrained to `max-h-[85vh]` with `flex flex-col` flexbox distribution.
  - Fixed Structural Frame: Header and footer configured with `shrink-0`, guaranteeing permanent visibility of modal titles, status descriptions, close button (`X`), and action links.
  - Scrollable Form Body: Form container configured with `overflow-y-auto flex-1`, ensuring form controls, security questions, and verification inputs remain fully accessible across short mobile viewports and zoomed desktop displays.


