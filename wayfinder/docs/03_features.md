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

Wayfinder visualizes the complete winter travel itinerary in [wayfinder/src/components/RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx) and the interactive 3D route map in [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx):

- Sequential Journey Map & Locked 3:2 Relief Asset: Connects Kraków, Wrocław, Poznań, Toruń, and Gdańsk in optimal south-to-north travel order over a clean 3:2 landscape 3D topographical Poland relief asset ([poland-map-route-clean.jpg](file:///e:/TechTrekGT/wayfinder/src/assets/poland-map-route-clean.jpg)) with zero baked-in train or loop artifacts. Desktop renders an exact `sm:aspect-[3/2]` canvas and mobile uses an `aspect-[7/6]` card wrapping a centered `aspect-[3/2]` coordinate canvas (`group-hover:scale-[1.02]` applied to the unified canvas wrapper so map, vectors, and nodes scale together with zero drift).
- Interactive 3D Map Train & Flight Navigation:
  - Precision Curved Vector Tracks: SVG quadratic Bezier rail paths (`vectorEffect="non-scaling-stroke"`) connect Kraków `(58%, 79%)` -> Wrocław `(33%, 66%)` -> Poznań `(31%, 47%)` -> Toruń `(48%, 37%)` -> Gdańsk `(47%, 18%)`, paired with dashed flight arcs into `KRK` and out of `GDN`.
  - Non-Overlapping Golden Rail Pills: 4 compact circular-medallion train pills (`PKP • DAY 4`, `PKP • DAY 6`, morning `PKP • DAY 7`, afternoon `PKP • DAY 7`) positioned at exact quadratic Bezier midpoints along open rail corridors (`z-20 hover:z-40`), paired with directional city node badges (`z-30 pointer-events-none` container, `pointer-events-auto hover:z-40` anchors) so labels and nodes remain unobstructed from 360px mobile to desktop viewports.
  - Interactive Flight Badges: Clickable `FLY IN: KRK` (Day 1, bottom-right) and `FLY OUT: GDN` (Day 10, top-left) badges.
  - 1-Click Smooth Navigation: Clicking any train or airplane badge automatically transitions viewMode to 'schedule', expands the target city's schedule section, scrolls the screen directly to the specific travel event placeholder/card, and highlights it with an amber ring (`ring-4 ring-amber-400`).
  - Interactive Ticket & Transit Inspection: Clicking directly on the travel card or the "View PKP Rail Ticket & Transit Details" / "View Delta Flight Confirmation" buttons opens the universal `DocumentViewerModal` displaying verified travel documents (e.g. PKP Intercity IC 58 Galicja with carriage 272, seats 34 & 36, confirmation `WN 71563945`, or Delta confirmation `GUDI3J`).
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
  - Home: Immediate return to the Poland overview map and 5 City Cards.
  - Schedule: Opens Private Hub Itinerary directly when signed in, or scrolls to the public `#journey-sequence` preview when signed out.
  - Practical: Instant access to transit guides, tipping rules, and emergency logistics.
  - Money: One-tap launcher for the full-screen interactive currency converter.
  - Hub: Direct gateway to the private travel vault (`Documents`, `Packing List`, `Expense Ledger`).
- Slim Desktop Header & Spill-Over Brand Crest: Features a locked top bar housing the enlarged high-resolution brand banner (`wayfinderHeaderBanner`) which spills over the bottom gold border (`-mb-4 sm:-mb-6 md:-mb-8 lg:-mb-9`) with realistic drop-shadow depth, ensuring full legibility across all viewports. Houses an explicit **Home** button (returning directly to `/wayfinder/poland-christmas-2026` Overview Map & Cards View), Practical Guide, auth-aware **Itinerary** button (opening `/wayfinder/poland-christmas-2026/private` when signed in or `#journey-sequence` when signed out), live Currency Converter, an interactive **Private Hub** dropdown menu (providing 1-click access to Daily Itinerary, Documents & Tickets, Packing List, and Expense Ledger), and user authentication actions in [wayfinder/src/components/Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx).
- Docked Private Hub Sub-Toolbar & Scrollspy City/Day Navigation: [wayfinder/src/components/PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx) anchors directly beneath the main navbar as a sticky sub-bar (`sticky top-14 sm:top-16 z-30 bg-slate-900/95 backdrop-blur-xl border-b border-white/10`). Replaces the oversized left-side header block with an elegant, compact inline identity pill (`[ShieldCheck] Private Hub • Poland 2026`) and presents all sub-navigation buttons (Itinerary, Packing List, Expense Ledger, Documents, Sync Calendar, Share) on a single horizontal row with zero horizontal scroll. In [wayfinder/src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx), the sticky City & Day Navigation Bar (`md:sticky md:top-[116px] z-20`) runs a `requestAnimationFrame`-throttled scrollspy over `#day-1`..`#day-10` sections when viewing the full timeline (`selectedDay === 'all'`): as the traveler scrolls down into each day, the active City pill (e.g., Wrocław) and Day pill (`D4`) dynamically highlight and auto-scroll horizontally within their pill bars, while `All Cities` / `All` shifts to a subtle reset-pill outline (and smoothly scrolls back to top when clicked). Global administrator access is cleanly unified in the top navigation header ([Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx)), eliminating redundant buttons from the trip sub-bar.
- Consolidated City Drill-Down Tabs: CityPage tabs are streamlined to 5 primary destinations (Overview, Markets, Sights, Food, Stays, and Safe Spaces), avoiding horizontal overflow on small displays while moving in-depth historical chronologies to an engaging highlight card inside Overview.
- Public/Private Schedule Harmony: Unauthenticated visitors can view the full 10-day Poland trip itinerary freely, with a discreet invitation to authenticate to reveal private booking confirmations and tickets.
- Unified Journey Sequence & Schedule Stops: [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) pairs the interactive Poland rail map with the 5 Journey Sequence stop cards (`Cards View`: Kraków, Wrocław, Poznań, Toruń, Gdańsk). For signed-out visitors, `Schedule View`, `View Stop Schedule`, and interactive map train pins expand an inline public schedule preview inside each stop card (`sticky top-14 sm:top-16 z-20` day headers). When signed in (`isAuthenticated`), `Cards View` stays the clean high-level overview while `Schedule View`, `View Stop Schedule`, and map train pins route directly into the canonical Private Hub timeline ([ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx), pre-filtered via `?city=` or `?day=`), eliminating duplicate signed-in schedule views.
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

- Serverless Open-Meteo Edge Proxy: The worker endpoint `GET /api/wayfinder/weather` in [wayfinder/functions/api/wayfinder/weather.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/weather.js) proxies Open-Meteo forecast and archive endpoints with zero external API key requirements, backed by L1 isolate memory cache plus Cloudflare `caches.default` Edge caching (`1h` upstream TTL / `5m` fallback TTL on transient upstream failure or HTTP `525`).
- Dual Operating Modes:
  - Live 16-Day Forecast: Used when querying current conditions or dates within -1 to +16 days of the request. Returns temperature ranges, WMO weather codes, precipitation probabilities, snowfall accumulation in cm, sunrise, and sunset times.
  - Historical Climate Baseline: Used for trip planning dates beyond 16 days. Samples prior-year seasonal calendar windows from Open-Meteo Archive API to calculate expected highs, lows, and snow probabilities.
- Daylight Telemetry: Computes exact daily sunrise, sunset, and total daylight span (e.g. 07:35 to 15:40 CET / 8h 05m). Vital for winter scheduling because Polish Christmas markets peak after dusk while Gothic Old Town photography requires daylight.
- Freezing & Cold Advisories: Automatically evaluates freezing thresholds and generates actionable winter advisories (thermal base layer recommendations, crampon/traction warnings on icy cobblestones, waterproof footwear).
- UI Component Integration: [wayfinder/src/components/weather/WeatherWidget.jsx](file:///e:/TechTrekGT/wayfinder/src/components/weather/WeatherWidget.jsx) is embedded into [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) stop headers and daily schedule sub-strips, as well as [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx) day headers. Seamlessly toggles between Celsius and Fahrenheit according to user settings in SettingsContext, deduplicates concurrent identical requests via `inFlightWeatherRequests`, and defers offscreen fetches via `IntersectionObserver` (`rootMargin: '250px'`).

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
  - Atomic batch cleanup across all D1 tables in `wayfinder-db`:
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

## 36. Cloudflare D1 Write-Volume Remediation & Idempotency Hardening

Eliminates runaway D1 write amplification across Wayfinder backend endpoints, inbound email webhooks, and client sync loops:

- Isolate-Scoped DDL Singleton Locks & Zero Hot-Path `ALTER TABLE` ([expenses.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/expenses.js), [packing.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/packing.js), [calendar.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/calendar.js), [agendaAccess.js](file:///e:/TechTrekGT/wayfinder/functions/utils/agendaAccess.js)):
  - Removed unconditional per-request `ALTER TABLE wayfinder_expenses ADD COLUMN ...` statements from `expenses.js`.
  - Guarded `ensureTables` (`expenses.js`), `ensureTable` (`packing.js`), `ensureCalendarTable` (`calendar.js`), and `ensureShareTables` (`agendaAccess.js`) with module-scoped boolean flags (`tablesReady`) and in-flight singleton promises so concurrent requests never race DDL batches.
  - Bypassed DDL execution on `GET` requests unless SQLite returns a `no such table` error on a fresh database.
- Strict Read-Only `GET` Enforcement & Telemetry Throttling ([import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js), [calendar.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/calendar.js), [CalendarSubscribeModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/calendar/CalendarSubscribeModal.jsx)):
  - `GET /api/wayfinder/import-jobs/:doc_id` synthesizes virtual extraction job and field previews in memory when no rows exist in D1, deferring physical `INSERT` operations until an explicit `POST /parse`, `POST /fields`, or `POST /approve` mutation.
  - `GET /api/wayfinder/calendar/feed/:token.ics` throttles `poll_count` and `last_polled_at` `UPDATE` writes to at most once every 6 hours per feed token.
  - `CalendarSubscribeModal.jsx` checks token status via `GET /api/wayfinder/calendar/token` without auto-firing a `POST` mutation on modal open; token generation only occurs when the user clicks "Enable Live Feed".
- Idempotent Preset Seeding, Split Diffing & Inbound Email Deduplication ([packing.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/packing.js), [expenses.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/expenses.js), [email-worker.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-worker.js)):
  - `POST /api/wayfinder/packing` (`action: 'apply_preset'`) deduplicates against existing `(category, name)` items in `wayfinder_packing_items`, avoiding 37-row + 74-index duplicate batch writes.
  - `PUT /api/wayfinder/expenses/:id` compares incoming splits against existing `wayfinder_expense_splits` rows (`user_id`, `amount_owed`, `percentage`) and skips `DELETE` + re-`INSERT` statements when split allocations are unchanged.
  - `handleInboundEmail` in `email-worker.js` checks `wayfinder_itinerary_items` by `confirmation_number` or `(title, local_date)` before executing the 16-statement `env.DB.batch`, preventing duplicate document, itinerary, and expense writes on retried or re-forwarded emails.
- Client Write Debouncing, Queue Retry Bounds & Stale Cookie Purging ([PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx), [mutationQueue.js](file:///e:/TechTrekGT/wayfinder/src/utils/mutationQueue.js), [worker.js](file:///e:/TechTrekGT/wayfinder/src/worker.js), [me.js](file:///e:/TechTrekGT/wayfinder/functions/api/auth/me.js)):
  - `PackingManager.jsx` coalesces rapid `+`/`-` quantity clicks and checkbox toggles per item using a 400ms debounce timer (`scheduleDebouncedItemPut`) and cancels pending timers if the item is deleted.
  - `mutationQueue.js` enforces a maximum of 5 retry attempts (`nextAttempts >= 5`) for 5xx and network errors in `flushQueue()`, preventing poison-pill mutations from looping on every window focus event.
  - `requireAuth` (`worker.js`) and `GET /api/auth/me` (`me.js`) attach `Set-Cookie: auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` on HTTP 401 responses when an invalid or expired token is presented.

## 37. Dedicated Cloudflare D1 Database (`wayfinder-db`) & Relational Normalization

Decouples Wayfinder Guide from the shared `personal-budget-db` instance onto its own dedicated Cloudflare D1 database (`wayfinder-db`, ID: `f95ad16e-8b63-419e-b828-d749b6fdd8f1`) and normalizes semi-structured booking and audit blobs into typed scalar columns:

- Dedicated Database Provisioning & Binding ([wrangler.jsonc](file:///e:/TechTrekGT/wayfinder/wrangler.jsonc), [schema-wayfinder.sql](file:///e:/TechTrekGT/wayfinder/schema-wayfinder.sql)):
  - Bound via `env.DB` to `wayfinder-db` (`f95ad16e-8b63-419e-b828-d749b6fdd8f1`), isolating Wayfinder's single-writer SQLite lock and quota metrics.
  - Self-contained 16-table schema including core identity tables (`users`, `email_verifications`, `password_resets`) and 13 Wayfinder domain tables.
- Relational Normalization of Itinerary Booking Metadata ([email-worker.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-worker.js), [import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js), [itinerary.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/itinerary.js), [accommodations.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/accommodations.js)):
  - Promoted 16 structured booking attributes onto `wayfinder_itinerary_items`: `supplier`, `confirmation_number` (indexed via `idx_wf_items_confirmation`), `booking_reference`, `origin`, `destination`, `room_type`, `seat`, `guests`, `tickets`, `language`, `duration`, `pickup_window`, `bag_restriction`, `mobile_ticket_url`, `activity_details_url`, and `import_source` (`'email-forward'`, `'document-upload'`, `'manual'`).
  - `handleInboundEmail` (`email-worker.js`) queries the indexed `confirmation_number` and `import_source` columns directly for idempotency checks and populates all normalized booking columns on insert.
  - `handleImportJobs` (`import-jobs.js`) writes normalized booking columns on both `INSERT` and `UPDATE` during document approval (`action === 'approve'`) and reads `linkedItem.confirmation_number` directly during virtual field hydration.
  - `sanitizeItem` (`itinerary.js`) and `handleAccommodations` (`accommodations.js`) expose all normalized columns directly to the client with backwards-compatible regex fallbacks on `notes`.
- Normalized Audit Trail & Extraction Job Ownership ([documents.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js), [admin.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/admin.js), [deleteAccount.js](file:///e:/TechTrekGT/wayfinder/functions/utils/deleteAccount.js)):
  - Added `target_user_id`, `target_email`, `previous_value`, `new_value`, and `metadata_summary` to `wayfinder_audit_events`.
  - Added `user_id` (indexed via `idx_wf_jobs_user`) to `wayfinder_extraction_jobs` and `expense_id` / `split_id` to `wayfinder_expense_settlements`.
- Rail Timeline Deduplication & Transit Connector Streamlining ([itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js), [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx)):
  - `buildUnifiedDayTimeline` detects confirmed private rail bookings (`hasConfirmedRail`) and automatically suppresses generic intercity rail placeholders (`isGenericRailPlaceholder`) on the same day while preserving the Day 1 SKA1 airport commuter train.
  - Private rail items are deduplicated via `seenRailKeys` (`confirmation_number` or `source_document_id`) to prevent duplicate train cards.
  - In `PolandLanding.jsx` (`JourneyStopSchedule`), inter-stop transit connector banners (`nextTransitTitle`) automatically collapse when the receiving stop's schedule is expanded (`!nextStopExpanded`), and stop arrival badges use concise destination descriptors instead of repeating train labels.

## 38. D1 Read/Write Query Optimization, Covering Indexes & Parallelization

Eliminates full table scans, serial query latency, and unbatched writes across core Wayfinder edge endpoints:

- 5 Composite & Covering D1 Indexes ([schema-wayfinder.sql](file:///e:/TechTrekGT/wayfinder/schema-wayfinder.sql)):
  - `idx_wf_fields_doc` on `wayfinder_extracted_fields(document_id)`: Accelerates extraction job field retrieval, field saving, and cascade deletion paths.
  - `idx_wf_expenses_doc` on `wayfinder_expenses(document_id)`: Accelerates document approval re-sync and cascading document purge queries.
  - `idx_wf_items_source_doc` on `wayfinder_itinerary_items(source_document_id)`: Accelerates accommodation joins and document approval checks.
  - `idx_wf_items_journey_type` on `wayfinder_itinerary_items(journey_id, item_type)`: Eliminates table scans during accommodation and lodging lookups.
  - `idx_wf_docs_user_deleted` on `wayfinder_documents(user_id, deleted_at)`: Accelerates document vault listing for authenticated travelers.
- Concurrent Query Parallelization ([expenses.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/expenses.js), [import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js), [budget.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/budget.js)):
  - In `expenses.js`, `GET /api/wayfinder/expenses` runs the primary expenses query and debt settlements query concurrently via `Promise.all`, dropping edge latency by eliminating serial round-trips.
  - In `import-jobs.js`, document approval (`action === 'approve'`) executes pre-flight checks for `allFields`, `existingItem`, and `existingExpense` in parallel via `Promise.all` before building the atomic transaction batch.
  - In `budget.js`, individual expense retrieval, category grouping, and total aggregations execute in parallel via `Promise.all`.
- SQL-Native Aggregation Pushdown ([budget.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/budget.js)):
  - `GET /api/wayfinder/budget` pushes `COUNT(*)`, `SUM(amount_usd)`, and category groupings into SQL queries, eliminating manual JavaScript accumulators and avoiding payload bloat.
- Cascading Document Purge Subquery Optimization ([documents.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js)):
  - `DELETE /api/wayfinder/documents/:id` replaces the sequential pre-fetch and per-expense ID loop with a single SQL subquery in `env.DB.batch`: `DELETE FROM wayfinder_expense_splits WHERE expense_id IN (SELECT id FROM wayfinder_expenses WHERE document_id = ?)`.
- Single-Item Packing Response Synthesis ([packing.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/packing.js)):
  - Single-item `POST` (create) and `PUT` (edit/toggle) endpoints construct the returned item payload directly from known input parameters rather than executing an extra post-write `SELECT` round-trip.
- Atomic Admin Membership & Audit Batching ([admin.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/admin.js)):
  - Unaffiliate, role assignment, and share disconnect mutations combine the target table write and `wayfinder_audit_events` insert into a unified `env.DB.batch` call.
- Orphaned Code Cleanup:
  - Removed 3 dead `auditEvent` utility functions across `documents.js`, `import-jobs.js`, and `itinerary.js`.

## 39. iOS WebKit Document Persistence, Mobile Approval & Viewport Safety

Resolves mobile and iOS WebKit document ingestion, storage cloning, and modal approval blockers across client and edge workers:

- Structured ArrayBuffer IndexedDB Persistence ([documentStorage.js](file:///e:/TechTrekGT/wayfinder/src/utils/documentStorage.js)):
  - Replaces raw `File` / `Blob` cloning with structured `ArrayBuffer` conversion in `saveLocalDocumentFile`, circumventing WebKit's native `File` descriptor cloning restriction (`DataCloneError`) on iOS Safari.
  - Automatically serializes File/Blob into `{ buffer, type, name, size, lastModified }` and deserializes into a valid typed `Blob` during `getLocalDocumentFile`.
  - Multi-key cache indexing saves documents under `id`, `filename`, and `safe_display_name` (and their lowercase counterparts) for resilient offline retrieval and reloads across mobile sessions.
- Mobile MIME Ingestion Normalization ([documents.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js)):
  - Expands `ALLOWED_MIME` to accept mobile-specific types (`application/x-pdf`, `application/acrobat`, `image/heic`, `image/heif`).
  - Infers MIME types from filename extensions when mobile Safari submits generic `application/octet-stream` or empty MIME strings.
- Explicit User Approval Gating Resolution ([import-jobs.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/import-jobs.js)):
  - Eliminates the blocking HTTP 422 `Unconfirmed critical fields` gate during user-initiated document approvals (`action === 'approve'`). Explicit approval automatically marks all document fields as `user_verified`.
  - Broadens permission checks to permit journey owners, administrators, editors, and the uploader (`doc.user_id === user.userId`) to approve extractions directly into the itinerary.
- Modal Stacking & Mobile Viewport Protection ([DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)):
  - Upgrades all modal stacking contexts (`Review & Approve`, `Document Viewer`, `PDF Preview`, `Synced Booking`, `Rename`, `Delete Confirmation`) to `z-[100]`, preventing the fixed `BottomTabBar` (`z-50`) from intercepting touch events on iOS mobile devices.
  - Adds in-modal error surfacing (`modalError`) directly inside the Review dialog so network or validation issues are immediately visible to the traveler without modal closure.
  - Reorganizes the Review modal action footer into a mobile-first responsive layout (`flex-col-reverse sm:flex-row`) with `pb-safe` padding for iPhone gesture bar clearance.

## 40. Protected Route Enforcement, Guest UI Suppression & Safe Document Preview Resolution

Closes unauthenticated private-document exposure on public timelines, eliminates guest-triggered PKP/Delta preview popups, prevents SPA 404 HTML fallbacks inside embedded PDF iframes, and ensures direct navigation to protected routes cleanly prompts sign-in:

- Dedicated Protected Route Guard ([ProtectedRoute.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ProtectedRoute.jsx)):
  - Evaluates `AuthContext` (`isLoading`, `isAuthenticated`, `user`, `setIsAuthModalOpen`).
  - Renders a centered `"Verifying session..."` spinner while session cookies resolve, renders an inline `"Protected Area / Sign In Required"` panel with a once-per-entry automatic Sign-In modal trigger and `"Return to Public Guide"` `pushState` navigation when unauthenticated, and enforces `requireAdmin` `"Access Denied"` checks before mounting restricted children.
- Canonical Protected SPA Route Normalization ([App.jsx](file:///e:/TechTrekGT/wayfinder/src/App.jsx)):
  - Wraps `/private`, `/private/*`, and `/admin` in `<ProtectedRoute>` and preserves mixed-case route segments (`rawNormalizedPath`) and query strings (`searchSuffix`) during canonical `window.history.replaceState` normalization.
  - Intercepts shorthand and legacy protected paths (`/wayfinder/private*`, `/documents*`, `/Poland-2026/docs/*`, `/itinerary`, `/timeline`, `/expenses`, `/budget`, `/ledger`, `/packing`, `/gmail-callback`), redirecting them to canonical `/poland-christmas-2026/private*` routes wrapped in `<ProtectedRoute>` rather than falling through to SPA 404 or construction screens.
- Deep-Link Document ID Hydration ([PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx), [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)):
  - Parses `:docId` from `/private/documents/:docId`, `/private/:docId`, `?doc=`, and `?id=`, passing `initialDocId` to `DocumentCenter` to open matching vault entries (by document ID, filename, or normalized title) or display a dismissible `"Requested Document Not Found"` notice after vault loading finishes.
  - Removes unauthenticated public-itinerary leakage inside `PrivateHub.jsx` so guests never view private operational chrome.
- Complete Public UI Document & Private Link Suppression:
  - [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) & [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx): Gates PKP rail ticket triggers (`WN 71563945`), Delta confirmation actions (`Conf: GUDI3J`), `isTravelCard` card click handlers/cursors/tooltips, Kraków `"View Document"` triggers, `"Manage Documents"` private banners, `"View Attached ..."` ticket tooltips on map rail segments, `<DocumentViewerModal>`, and `<CalendarSubscribeModal>` behind `isAuthenticated`; sanitizes Day 10 `stopTransitInfo.gdansk` guest copy (`nextTransitDetailsPublic`) so `DL9528` is hidden from guests.
  - [CityOverviewTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityOverviewTab.jsx), [CityHotelsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityHotelsTab.jsx), [RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx), & [PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx): Gates Kraków `"View Document"` triggers and all `<DocumentViewerModal>` mounts by `isAuthenticated`, with an early unauthenticated `null` return in `PrivateBookingCard` after hook initialization.
  - [BottomTabBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx) & [PracticalPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PracticalPage.jsx): Replaces unauthenticated mobile `"Hub"` (`/private/documents`) and `"Interactive Checklist"` (`/private/packing`) anchors with Sign-In action buttons invoking `setIsAuthModalOpen(true)`.
  - [AdminView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/admin/AdminView.jsx): Awaits `authLoading` prior to evaluating admin access or executing `fetchStats()`, showing `"Administrator Sign In Required"` for unauthenticated visitors.
- Safe Binary Verification & Bundled Asset Allowlist ([DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx), [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)):
  - Enforces `if (!isOpen || !isAuthenticated) return null;` and short-circuits document resolution effects when `!isOpen || !isAuthenticated`.
  - Replaces speculative `${baseUrl}Poland-2026/docs/${filename}` fallback synthesis with a strict `BUNDLED_STATIC_PDFS` allowlist (`Poland_Delta.pdf`, `GetYourGuide_Ticket_GYG7VKK692WY.pdf`, `Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`) and removes inaccurate excursion fallback defaults in `DocumentCenter` synced booking previews.
  - Executes `HEAD` requests (with `AbortController`) verifying `res.ok && !contentType.includes('text/html')` in both `DocumentViewerModal` and `DocumentCenter.openPdfPreview`, and guards the preview `<iframe>` behind `!(embedError || !fileUrl)` so missing binary files (`Bilet - WN71563945.pdf`, etc.) display the `"Local Document File Not Attached"` state and booking metadata instead of rendering the React SPA 404 page underneath modal headers.

## 41. Full Link Audit, Accurate Travel Ticket Mapping & City Deep-Link Integrity

Eliminates wrong-ticket modal fallbacks, mismatched schedule deep links, broken OpenStreetMap iframe queries, stale SPA navigation highlights, and unattached hash scroll listeners across Wayfinder:

- Exact Schedule-to-Document & DOM ID Classification ([itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js), [poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js)):
  - Exported shared helpers `isConfirmedIntercityRail`, `isFlightScheduleItem`, `getTravelDomIdForScheduleItem`, and `getTravelDocForScheduleItem`.
  - Excludes Day 1 `SKA1` commuter rail, Day 9 optional `Sopot SKM` excursion, and Day 10 `AMS Transit` layover (`itemType: 'transit'`) from intercity PKP ticket buttons so non-intercity legs no longer open wrong Toruń-to-Gdańsk fallback tickets.
  - Resolves distinct flight metadata objects for inbound (`DL9208`), Day 10 morning departure (`DL9528 GDN -> AMS`), and Day 10 transatlantic homeward leg (`DL9227 AMS -> ATL`), alongside unique DOM anchor IDs (`travel-flight-krk`, `travel-flight-gdn`, `travel-flight-atl`, `travel-train-krakow-wroclaw`, `travel-train-wroclaw-poznan`, `travel-train-poznan-torun`, `travel-train-torun-gdansk`).
- Timeline Deep-Link & External URL Accuracy ([itineraryTimeline.js](file:///e:/TechTrekGT/wayfinder/src/utils/itineraryTimeline.js), [poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js), [MustSeeCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/MustSeeCard.jsx)):
  - Added `cityName` onto `getItemDestination` responses; routed Day 7 Evening Market (`19:00` at `Targ Węglowy`) to Gdańsk, Day 3 `19:30` to `#plac-nowy-zapiekanki`, Day 8 `14:00` (Harbor Crane) to `#gdansk-zuraw`, and Day 9 `09:30` Sopot rail excursion to `#sopot-pier`.
  - Replaced `archikatedra.gdansk.pl` on `gdansk-oliwa-park-illuminations` with `https://www.gdansk.pl/`, and replaced hardcoded `Krakow+` tour search prefixes in `MustSeeCard.jsx` GetYourGuide/Viator fallback links with dynamic `encodeURIComponent(cityName)`.
- Safe Document Preview Fallbacks Without Hardcoded Wrong Bookings ([DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx), [PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx), [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)):
  - Strictly gated legacy static PDFs (`Poland_Delta.pdf`, `GetYourGuide_Ticket_GYG7VKK692WY.pdf`) and hardcoded confirmation fallbacks (`WN 71563945`, `GUDI3J`, `6ICXW284P0LJK9OYS594M5NZKD52BTFT`) behind explicit matching predicates so unlinked rail or excursion records never render another trip segment's details.
  - Rendered dynamic city labels (`targetCityLabel`) in `DocumentViewerModal` footers instead of hardcoded Kraków labels.
- OpenStreetMap Per-City Embeds, Retired Route Cleanup & PopState Hash Scrolling ([CityPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/CityPage.jsx), [CityMarketsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityMarketsTab.jsx), [CityFoodTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityFoodTab.jsx), [CityAttractionsTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityAttractionsTab.jsx), [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx), [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx), [RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx), [Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx), [BottomTabBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx)):
  - Replaced malformed HTML-entity `&amp;` query separators in `CityPage.jsx` `mapUrl` with raw `&` parameters and added dedicated OpenStreetMap bounding boxes and markers for all 5 stops (`krakow`, `wroclaw`, `poznan`, `torun`, `gdansk`).
  - Added `'popstate'` listeners in `CityMarketsTab`, `CityFoodTab`, and `CityAttractionsTab` (and memoized `detailedItems` in `CityFoodTab`) so SPA `pushState` navigation with `#hash` anchors scrolls cleanly to the target tile.
  - Updated `Layout.jsx` (`window.location.pathname + window.location.search`) and `BottomTabBar.jsx` (`!isSchedule` mutual exclusivity) so mobile bottom tab active indicators track query-based itinerary scrolling accurately.
  - Replaced retired links (`/route`, `/markets`, `/stays-and-food`, `/itinerary`) across `ItineraryView.jsx` and `RouteVisualization.jsx` with active `/wayfinder/poland-christmas-2026` city/private routes and added `stop-{city.id}` scroll fallback anchors in `PolandLanding.jsx` (`getDaysForCity('gdansk')` Day 7 filter restricted to `18:00`/`19:00`).

## 42. Shared Expense Ledger - Person-by-Person Breakdown & Settle-Up Intelligence

Provides a transparent, multi-participant financial overview with itemized person-by-person metrics, category footprints, payment method summaries, and ledger feed filtering:

- Unified Full-Detail Expedition Breakdown Dashboard ([PersonBreakdownPanel.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/PersonBreakdownPanel.jsx)):
  - Mounted directly above the shared expense ledger in [ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx).
  - Displays a prominent **Total Trip Cost** header pill and full-width summary strip (`formatCurrency(totalExpeditionInDisplay)`) alongside booking counts right above the participant comparison grid.
  - Collapsible container rendering all participant financial details simultaneously without tab switching or expand toggles, providing an unobstructed side-by-side comparison (`grid-cols-1 md:grid-cols-2`).
  - Side-by-side participant summary cards rendering traveler initials avatars, identity roles ("Trip Organizer", "Expedition Co-Traveler"), out-of-pocket spend (`Direct bookings fronted` / `excl. reimbursed`), allocated liability share (`50/50 of total trip`), directional reimbursement tracking (`Reimbursements Settled (to [Recipient])` and `Reimbursements Received (from [Sender])`), dual visual progress bars comparing Cash Fronted % vs. Fair Share (Liability) % against the total trip cost, full 7-category breakdown, payment instruments used, and ledger feed filter triggers.
  - Clear net position badges (+Owed in emerald / -Owes in amber / $0.00 Settled in slate).
- Mathematical Precision & Net Formula Tooltip ([PersonBreakdownPanel.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/PersonBreakdownPanel.jsx), [expenseLedger.js](file:///e:/TechTrekGT/wayfinder/src/utils/expenseLedger.js)):
  - Interactive formula popover (`(i)` trigger) displaying the exact settle-up calculation: `(Out-of-Pocket Paid) - (Allocated Share) - (Reimbursements Received) + (Direct Sent Reimbursements) = Exact Net Position`.
  - Accessible dismissal via click outside or `Escape` key handler, constrained by viewport width (`max-w-[calc(100vw-3rem)]`) to prevent mobile horizontal overflow.
  - Strict 2-decimal EPSILON rounding preventing penny drift on odd-cent 50/50 splits.
- Itemized Per-Person Category Drill-Down:
  - Side-by-side category view displaying 7 canonical categories: Flights, Hotels, Rail/Trans, Activities, Dining, Markets, and Other.
  - Dual proportional micro-meters comparing paid out-of-pocket vs. liability share per category for each traveler with exact percentages.
- Payment Method Grouping & Trip-Persistent Instrument Store:
  - Summarizes all payment instruments used by each payer (e.g., Visa, Apple Pay, Cash, US Bank VISA) with transaction counts and subtotal amounts for credit card statement reconciliation.
  - Trip-Persistent Payment Methods & Booking Sites: When custom payment methods (e.g. `US Bank VISA`) or booking vendors are entered in the Add/Edit Expense modal, they are automatically saved into trip-scoped local storage (`wf_payment_methods_${journeyId}` and `wf_booking_sites_${journeyId}`) and auto-discovered from existing trip expenses, populating interactive quick-select pills and native `<datalist>` browser autocomplete options for reuse across future entries.
  - Allows travelers to quickly save new methods on the fly via a "+ Save to Trip" button or dismiss obsolete custom cards via a subtle clear control.
- Participant-Scoped Ledger Feed Filtering:
  - 1-click filter pills: "Paid by [Person]", "Owed by [Person] (Unsettled)", and "Settled Items".
  - Integrates with parent `filteredExpenses` memoized pipeline, featuring an active filter status banner with instant 1-click filter reset.

## 43. Architectural Hardening, Authenticated Document Blobs, Bookmarks API & Offline Resilience

Delivers comprehensive security, privacy, API resilience, geospatial audit tooling, and zero-dependency UX upgrades across Wayfinder:

- Edge Security, Zero Hot-Path DDL & Validation ([auth.js](file:///e:/TechTrekGT/wayfinder/functions/utils/auth.js), [weather.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/weather.js), [packing.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/packing.js), [calendar.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/calendar.js), [journeys.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/journeys.js), [itinerary.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/itinerary.js)):
  - Live D1 `users.token_version` (`tv` claim) and `users.status` verification in `authenticateRequest`, clearing stale `auth_token` cookies (`Max-Age=0`) on `401`/`403` and rejecting conflicting Cookie + Bearer credentials with HTTP `400`.
  - Implemented `PUT /api/wayfinder/itinerary/:id` with `resolveAgendaAccess` RBAC (`404` non-member, `403` non-editor), JSON body validation, non-empty `title` check, and atomic `env.DB.batch` audit logging.
  - Hardened `weather.js` with strict ISO calendar date validation (`400`), `AbortSignal.timeout(5000)` guards on Open-Meteo upstream calls, bounded FIFO cache (`MAX_CACHE_ENTRIES = 100`), and dynamic prior-year `Date.UTC` archive window clamping.
  - Eliminated `GET` hot-path `ensure*` DDL calls across `journeys.js`, `packing.js`, `calendar.js`, and `bookmarks.js`, generalized hardcoded flight/accommodation constants out of `packing.js` and `calendar.js`, chunked `packing.js` `apply_preset` batches (80 statements), and sanitized 500 JSON responses.
- Static PDF Purge & Authenticated D1 Chunked Binary Blobs ([documents.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/documents.js), [documentBlobs.js](file:///e:/TechTrekGT/wayfinder/functions/utils/documentBlobs.js), [DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx)):
  - Removed unauthenticated static PDFs (`dist/client/Poland-2026/docs` purged) in favor of authenticated `256 KB` D1 chunks stored in `wayfinder_document_blobs` (up to `10 MB`) with `ensureDocumentBlobsTable` write-path resilience and `no such table` read fallbacks.
- Personal D1 Bookmarks & Shared Collaborators API ([bookmarks.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/bookmarks.js), [worker.js](file:///e:/TechTrekGT/wayfinder/src/worker.js), [CityPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/CityPage.jsx)):
  - Added `/api/wayfinder/bookmarks` (`GET`, `POST` upsert, `DELETE /:itemId`) gated by `resolveAgendaAccess` and synchronized via `WayfinderContext` (`bookmarks`, `savedItemIds`, `toggleBookmark`).
  - Wired `/agendas/:id/members` collaborator directory access and atomic invitation claims (`InviteClaim.jsx` awaits `refreshAgendaAccess()`).
- Unified NBP FX Proxy & MIME UTF-8 Normalization ([exchange-rate.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/exchange-rate.js), [email-worker.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/email-worker.js), [expenseLedger.js](file:///e:/TechTrekGT/wayfinder/src/utils/expenseLedger.js)):
  - Unified all client FX conversion and previews (`useExchangeRate.js`, `CurrencyConverterModal.jsx`, `expenseLedger.js`) onto `/api/wayfinder/exchange-rate` (NBP Table A primary with `open.er-api` secondary fallback and edge cache).
  - Hardened `email-worker.js` MIME boundary/charset decoding for UTF-8 Polish quoted-printable (`=C5=82`), RFC 2047 headers, and LF-only (`\n\n`) header boundaries, alongside Luhn/CVV/passport scrubbing.
- Offline Resilience, Routing Normalization & Search/Filter UX ([router.js](file:///e:/TechTrekGT/wayfinder/src/utils/router.js), [useEscapeKey.js](file:///e:/TechTrekGT/wayfinder/src/hooks/useEscapeKey.js), [mutationQueue.js](file:///e:/TechTrekGT/wayfinder/src/utils/mutationQueue.js), [OfflineSyncBadge.jsx](file:///e:/TechTrekGT/wayfinder/src/components/common/OfflineSyncBadge.jsx), [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx), [ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx)):
  - Extracted pure canonical route parser/redirect resolution (`router.js`) preserving `?search` and `#hash` in an `App.jsx` effect instead of render-time `replaceState`.
  - Fixed React Rules of Hooks ordering across city guide tabs, added shared `useEscapeKey` hook across modals, flushed debounced `PackingManager.jsx` updates via `keepalive` on pagehide/unmount, added IndexedDB `offline_cache` read fallback and `wayfinder:auth-expired` / `wayfinder:sync-status` handling (`OfflineSyncBadge.jsx`), and added `useDeferredValue` search (`/` shortcut) + activity-type filtering + `?day=` popstate reset in `ItineraryView.jsx` and `ExpenseLedger.jsx`.
- Asset Tree Standardization & Dual Geo-Audit Tooling ([poland-2026.js](file:///e:/TechTrekGT/wayfinder/src/data/poland-2026.js), [WayfinderLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/WayfinderLanding.jsx), [verify-pois-dual-geo.mjs](file:///e:/TechTrekGT/wayfinder/scripts/verify-pois-dual-geo.mjs)):
  - Standardized `krakow/markets/` placement (`attractions`/`food`/`markets` only), pruned legacy `city.restaurants` arrays from `poland-2026.js`, and added `verify-pois-dual-geo.mjs` to validate all 140 POI coordinates and local images against Geoapify and Google Places (noting Google Places CLI requests currently return HTTP `403 PERMISSION_DENIED` until an unrestricted server key is provided via `GOOGLE_PLACES_SERVER_KEY`).
- Edge Asset Caching, Image Optimization & Bundle/Compositor Performance ([worker.js](file:///e:/TechTrekGT/wayfinder/src/worker.js), [weather.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/weather.js), [WeatherWidget.jsx](file:///e:/TechTrekGT/wayfinder/src/components/weather/WeatherWidget.jsx), [Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx), [PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx), [vite.config.js](file:///e:/TechTrekGT/wayfinder/vite.config.js)):
  - Added `withAssetCacheHeaders` in `worker.js` so `/wayfinder/assets/*` (non-HTML) receives `Cache-Control: public, max-age=31536000, immutable` and `/wayfinder/Poland-2026/images/*` + static icons/manifest receive `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`, while omitting `Vary: Origin` on non-CORS `public` static assets (`text/html` stays `no-cache, no-store, must-revalidate`).
  - Compressed all 152 JPEG POI assets (`maxDim=960`, `q=80`, EXIF orientation preserved) and converted 10 opaque PNGs (`9` market images + `poland-map-route-clean.jpg` at `1264x848` `q=85`) to JPEG, resizing `wayfinder-header-banner-new.png` (`512x176`, alpha preserved) and reducing `public/` from `81.41 MB` to `21.66 MB`.
  - Upgraded `weather.js` with Cloudflare Edge `caches.default` canonical keying and 5-minute (`300s`) L1/L2 caching on transient upstream failures (`forecast-525` / `archive-525`), and updated `WeatherWidget.jsx` with module-level `inFlightWeatherRequests` deduplication and `IntersectionObserver` (`rootMargin: '250px'`) deferral.
  - Eliminated render-blocking Google Fonts `<link>` from `index.html` (CSP-safe async injection in `main.jsx`), removed expensive per-card `backdrop-filter: blur()` and `mix-blend-screen` compositing (`index.css`, `Layout.jsx`), lazy-loaded `CurrencyConverterModal` / `SettingsModal` on open and `PrivateHub.jsx` sub-tabs (`ItineraryView`, `DocumentCenter`, `PackingManager`, `ExpenseLedger`), and switched `vite.config.js` `manualChunks(id)` to a matcher splitting `react`/`react-dom`/`scheduler` cleanly into `vendor`.
- Sticky Auth-Aware Navigation & City Filter Bars ([PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx), [CityPage.jsx](file:///e:/TechTrekGT/wayfinder/src/components/CityPage.jsx), [RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx), [PrivateHub.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PrivateHub.jsx), [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx), [Formatters.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Formatters.jsx)):
  - Locked section navigation bars at `sticky top-14 sm:top-16 z-30` directly beneath the main navbar in `PolandLanding.jsx`, `CityPage.jsx`, `RouteVisualization.jsx`, and `PrivateHub.jsx` (plus `md:sticky md:top-[116px] z-20` City/Day quick-jump bar in `ItineraryView.jsx`), adjusting `PolandLanding.jsx` Schedule View day headers to `sticky top-[166px] md:top-[124px] z-20` to prevent overlap.
  - Added `formatCompactStopDates` (`Formatters.jsx`) so unauthenticated visitors see the clean basic stop/city bar (`All Stops (5)`, `01 Kraków`, ...) while signed-in travelers see actual stop dates (`All Stops (Dec 3-13)`, `01 Kraków Dec 4-7`, ...) across `PolandLanding.jsx`, `CityPage.jsx` quick city-switcher, `RouteVisualization.jsx`, `PrivateHub.jsx`, and `ItineraryView.jsx`.

## 44. Mobile Viewport, Safe Area & iPhone 18 Pro Usability Architecture

Wayfinder delivers an end-to-end mobile-first responsive architecture specifically optimized for iOS Safari / WebKit and the iPhone 18 Pro viewport (402x874 CSS logical pixels, 3x DPR, top Dynamic Island inset, and bottom home indicator):

- Viewport & Safe Area Inset Support (`index.html`, `index.css`, `Layout.jsx`, `BottomTabBar.jsx`):
  - Viewport metadata configured with `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`.
  - Utility classes `.pt-safe`, `.pb-safe`, and dynamic `.safe-pb` (`max(0.75rem, env(safe-area-inset-bottom))`) ensure sticky headers (`pt-[env(safe-area-inset-top,0px)]`) clear the Dynamic Island / status bar, and fixed navigation controls (`BottomTabBar.jsx`) clear the iOS home indicator bar.
  - Page content container (`Layout.jsx`) enforces `pb-24` clearance across `<main>` and `<footer>` so scrolling content is never obstructed by the fixed bottom navigation bar.
- Dynamic Viewport Heights & Address Bar Clipping Prevention (`index.css`, `Layout.jsx`, Modals):
  - Global `#root` and `<Layout>` configured with `min-h-[100dvh]` to prevent viewport layout jumps when Safari URL and toolbar expand or collapse.
  - All modal dialogs and bottom sheets (`CurrencyConverterModal`, `SettingsModal`, `AuthModal`, `ShareAgendaModal`, `CalendarSubscribeModal`, `DocumentViewerModal`, `DocumentCenter` review/detail/booking modals, `ExpenseLedger` add/settle modals, `RouteVisualization` station dossier) use `max-h-[85dvh]` or `max-h-[90dvh]` paired with internal `overflow-y-auto` scroll containment, preventing content clipping off-screen.
- Zero Horizontal Overflow on 402px Viewport Width:
  - Flex and grid containers across all views (`ItineraryView`, `PolandLanding`, `PrivateBookingCard`, `ExpenseLedger`, `PersonBreakdownPanel`, `AdminView`, `CityPage`) enforce `min-w-0` on flex/grid children.
  - Polish venue addresses, long email addresses, and filenames apply `break-words`, `break-all sm:break-normal`, and `truncate max-w-full`, eliminating unintended horizontal page scrolling.
  - 3D route map on the landing page preserves its exact 3:2 topological aspect ratio with touch hit targets expanded via `before:absolute before:-inset-2` without altering visual coordinate positions.
- Accessible Touch Target Sizing (>= 44x44px):
  - All primary interactive touch targets (bottom navigation tab items, mobile currency trigger, modal close buttons, expense edit/delete/settle buttons, packing item toggles, document actions, and city card footer action buttons) enforce `min-h-[44px] min-w-[44px]` (or `min-h-[36px] min-w-[36px]` for timeline reorder and quantity stepper controls).
- iOS Safari Auto-Zoom Prevention:
  - Form controls across all views (`<input>`, `<select>`, `<textarea>`) apply `text-base sm:text-xs` or `text-base sm:text-sm` so text renders at 16px on mobile viewports (< 640px) and prevents iOS WebKit from triggering intrusive focus auto-zooming.
  - Global CSS fallback guard in `index.css` (`@media screen and (max-width: 640px) { input, select, textarea { font-size: 16px; } }`) guarantees zero auto-zoom even on dynamically injected fields.
- Modal Stacking Context & Layer Isolation:
  - All modal backdrops and panels are standardized to `z-[100]`, cleanly floating above the `z-50` sticky header and fixed bottom navigation bar without layering glitches.

## 45. Context-Aware Lodging Base Display & Hover Tooltips

Wayfinder dynamically adapts lodging base guidance depending on whether travelers have already booked accommodations:

- Confirmed Hotel Suppression for Recommended Base (`hasConfirmedHotelForDay` in `itineraryTimeline.js`):
  - When an authenticated traveler has a confirmed hotel booking covering an itinerary day (evaluated across `check_in_date` to `check_out_date` date ranges, single-day check-in, or city stay windows), the generic "Recommended Base: [Zone]" pill is automatically suppressed from the day header in both `ItineraryView.jsx` and `PolandLanding.jsx`.
  - This eliminates redundant guidance and frees up valuable header space, leaving the confirmed hotel check-in card prominent on the timeline.
- Rich Hover Tooltips for Unbooked Days:
  - For days without a confirmed hotel booking (and for unauthenticated visitors browsing recommendations), the "Recommended Base" pill is displayed with `title={dayItem.base}` and an interactive floating hover tooltip (`group-hover/base:flex`) that shows the full neighborhood recommendation text (`dayItem.base.replace(/^Recommended Base:\s*/i, '')`) without truncation or clipping.









