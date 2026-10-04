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
- Document Center: Upload and organize PDF travel confirmations, flight tickets, hotel vouchers, and passport copies via [wayfinder/src/components/DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx).
- Automated Extraction: Integration with document import jobs extracting check-in dates, confirmation numbers, and hotel addresses.
- Travel Budget Tracker: Tracks trip expenses in PLN and USD, comparing estimated travel costs against actual spending across lodging, dining, transit, and activities.
