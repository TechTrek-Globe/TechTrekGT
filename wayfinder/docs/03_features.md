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
- Slim Desktop Header: Replaces cluttered legacy headers with a minimal top bar housing TechTrekGT Launch Pad navigation, the Practical Guide, active PLN exchange rates, and user authentication actions.
- Consolidated City Drill-Down Tabs: CityPage tabs are streamlined to 5 primary destinations (Overview, Markets, Sights, Food, Stays, and Safe Spaces), avoiding horizontal overflow on small displays while moving in-depth historical chronologies to an engaging highlight card inside Overview.
- Public/Private Schedule Harmony: Unauthenticated visitors can view the full 10-day Poland trip itinerary freely, with a discreet invitation to authenticate to reveal private booking confirmations and tickets.
- Unified Journey Sequence & Schedule Stops: [wayfinder/src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx) directly integrates the full 10-day itinerary timeline, flight arrivals, PKP rail transfers, daily activities, and authenticated private booking records directly into the 5 Journey Sequence stops (Kraków, Wrocław, Poznań, Toruń, Gdańsk). This unifies the public landing guide and personal schedule into a single, cohesive interface, complete with intercity transit connector cards, stop filter pills, and a Schedule vs. Cards view mode switcher (defaulting to compact Cards view).
- Shared Private Booking Cards: [wayfinder/src/components/itinerary/PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx) renders D1-persisted booking records (flights, hotels, restaurants, excursions, rail) with private lock badges, confirmation numbers, passenger details, and theme badges across both the main journey stops and the dedicated private hub.

## 7. Booking Confirmation Import: Email Forwarding System

Authenticated users can import hotel and attraction booking confirmations via dedicated email forwarding into `wayfinder_itinerary_items` with `status = 'imported'` and `verification_status = 'unverified'`:

### 7.1 Email Forward Channel

- Unique Trip Inbox Provisioning: Each user receives a unique forwarding address per journey, format `TT<6-digit-token>.<journey-slug>@techtrekgt.com` (e.g. `TT412312.poland2026@techtrekgt.com`). Provisioned via `POST /api/wayfinder/email-inboxes` (idempotent, returns existing address if already created). Resolves journeys where `created_by = user.userId` or `visibility = 'public'` (supporting platform-seeded expeditions like Poland 2026).
- Cloudflare Email Worker: Worker exports an `email()` handler alongside `fetch()`. When a forwarded email arrives at a recognized inbox address, the worker: (1) looks up the inbox row by `email_address` to resolve `user_id` and `journey_id` (the unique token is the access control, no sender verification required), (2) parses the MIME stream to extract plain text using a pure-runtime MIME walker with `quoted-printable` and `base64` decoding, (3) infers `item_type` (hotel, flight, train, activity, transport, dining, other) from subject keywords, (4) extracts confirmation number and check-in date via regex, (5) writes atomically to D1 via `env.DB.batch()`.
- Inbox Stats: `wayfinder_email_inboxes.emails_received` counter and `last_received_at` updated on every successful import.
- API: `GET /api/wayfinder/email-inboxes?journey_id=` (fetch inbox), `POST /api/wayfinder/email-inboxes` (provision), `DELETE /api/wayfinder/email-inboxes/:id` (deactivate).

### 7.2 Booking Import UI Components

- Dedicated Import Inbox Card: [wayfinder/src/components/BookingImportChannels.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BookingImportChannels.jsx) is integrated directly into [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx). Generates unique trip inbox address, 1-click clipboard copy with animated visual feedback, live processed email counters, and supported booking provider tags.
- Synced Confirmations List: Integrated directly in [DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx) right below the import inbox card. Displays all D1-persisted booking items with provider names, dates, item type badges, and a direct 1-click link to navigate into the Itinerary timeline. Note: Legacy Gmail sync has been completely removed in favor of reliable email forwarding.

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

