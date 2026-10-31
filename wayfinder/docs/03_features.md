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
- Document Center & Viewer: Upload and organize PDF travel confirmations, flight tickets, and hotel vouchers via [wayfinder/src/components/DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx). Interactive inspection is powered by [wayfinder/src/components/DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx) with IndexedDB caching, bundled asset fallbacks, and multi-format previewing.
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
- Slim Desktop Header: Replaces cluttered legacy headers with a minimal top bar housing TechTrekGT Launch Pad navigation, the Practical Guide, 10-day Itinerary anchor, live Currency Converter (with active PLN exchange rate badge), Private Hub (SSO-gated personal vault), and user authentication actions in [wayfinder/src/components/Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx). Responsive breakpoint labels ensure consistent, unambiguous naming without duplicate labels across screen sizes.
- Consolidated City Drill-Down Tabs: CityPage tabs are streamlined to 5 primary destinations (Overview, Markets, Sights, Food, Stays, and Safe Spaces), avoiding horizontal overflow on small displays while moving in-depth historical chronologies to an engaging highlight card inside Overview.
- Public/Private Schedule Harmony: Unauthenticated visitors can view the full 10-day Poland trip itinerary freely, with a discreet invitation to authenticate to reveal private booking confirmations and tickets.
- Unified Journey Sequence & Schedule Stops: [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) directly integrates the full 10-day itinerary timeline, flight arrivals, PKP rail transfers, daily activities, and authenticated private booking records directly into the 5 Journey Sequence stops (Kraków, Wrocław, Poznań, Toruń, Gdańsk). This unifies the public landing guide and personal schedule into a single, cohesive interface, complete with intercity transit connector cards, stop filter pills, and a Schedule vs. Cards view mode switcher (defaulting to compact Cards view).
- Shared Private Booking Cards: [wayfinder/src/components/itinerary/PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx) renders D1-persisted booking records (flights, hotels, restaurants, excursions, rail) with private lock badges, confirmation numbers, passenger details, and theme badges across both the main journey stops and the dedicated private hub.

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

## 11. Universal Travel Preferences & Unit Conversion Suite (Weight, Temperature, Distance, Currency)

Wayfinder provides a comprehensive, reactive localization and travel preference suite covering the 4 core pillars of transatlantic travel:

- Global Travel Preferences Modal: [wayfinder/src/components/SettingsModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/SettingsModal.jsx) provides a unified preferences interface accessible from the slim desktop navigation bar, mobile bottom bar, and in-context quick buttons across the application:
  - Weight & Luggage Preference: Select between Pounds / Ounces (`lbs / oz`) and Kilograms / Grams (`kg / g`).
  - Temperature Unit: Select between Fahrenheit (`°F`) and Celsius (`°C`).
  - Distance Unit: Select between Miles (`mi`) and Kilometers (`km`).
  - Base Currency: Select between US Dollar (`USD`), Euro (`EUR`), British Pound (`GBP`), Canadian Dollar (`CAD`), and Polish Złoty (`PLN`).
- Dynamic Weight & Luggage Conversion:
  - Baggage Budget Meters: In [wayfinder/src/components/packing/PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx), telemetry meters dynamically convert between transatlantic 23.0 kg (50.7 lbs) checked baggage limits and European 8.0 kg (17.6 lbs) cabin baggage limits with reactive remaining buffer calculations.
  - Item Weights & Subtotals: Item rows dynamically format between grams/kilograms and ounces/pounds using `formatWeight`. Category headers display live subtotals (e.g. `~12.4 lbs` or `~5.6 kg`).
  - Custom Item Entry: Input forms dynamically adjust step sizes and labels (`Est. Weight (Ounces each)` vs `Est. Weight (Grams each)`), automatically converting entered ounces to backend grams for consistent relational persistence.
  - In-Context Quick Switcher: PackingManager features a dedicated 1-click `[ lbs / oz | kg / g ]` toggle pill and Settings shortcut button directly in its header action bar.
- Dynamic Temperature & Weather Telemetry:
  - Open-Meteo Weather Widgets: In [wayfinder/src/components/weather/WeatherWidget.jsx](file:///e:/TechTrekGT/wayfinder/src/components/weather/WeatherWidget.jsx), both compact inline tooltip cards and expanded city overview telemetry cards convert temperatures reactively between Celsius and Fahrenheit.
  - In-Context Quick Switcher: Weather widgets embed 1-click `[ °C | °F ]` pill switches and Settings shortcut buttons directly in their tooltip headers.
- Universal Text Processor (FormatText):
  - In [wayfinder/src/components/Formatters.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Formatters.jsx), `FormatText` dynamically parses narrative descriptions across city overviews, transit dossiers, and packing guides. It accurately converts Celsius ranges (e.g. `-2°C to 4°C` -> `28°F to 39°F`), sub-zero equipment ratings (`-10°C rated` -> `14°F rated`), baggage weight limits (`23 kg` -> `50.7 lbs`), and distance benchmarks (`12 km` -> `7.5 mi`).
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
- Universal Application Harmony:
  - [PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx): Journey Sequence stop days render the unified chronological timeline directly within expandable stop dossiers.
  - [ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx): Full 10-day expedition view uses identical unified chronological timeline rendering.
  - [calendar.js](file:///e:/TechTrekGT/wayfinder/functions/api/wayfinder/calendar.js): The RFC 5545 calendar subscription engine applies the same placeholder suppression rules, guaranteeing clean native calendar feeds.

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
