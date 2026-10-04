# Sprig Bourbon Sommelier - Platform Features and Curation Services

## 1. Google Sheet CSV Synchronization Engine

Bourbon Sommelier utilizes a lightweight, high-resilience external spreadsheet sync engine implemented in [bourbon/src/data/sheetService.js](file:///e:/TechTrekGT/bourbon/src/data/sheetService.js):

- Direct Google Visualization Endpoint: Connects to the public Google Sheet (ID: 1XfZCAILlqCNuPkpAJ3alZc8XOBMFu4M24dH-mTrhlrA) via the gviz export URL (gviz/tq?tqx=out:csv&sheet=Sheet1).
- Custom CSV Parsing Algorithm: Implements an internal character-by-character CSV parser (parseCsv) that accurately handles escaped quotes (""), commas nested within quotation blocks, whitespace normalization, and dynamic header extraction without requiring bulky external parsing libraries.
- Resilient Three-Tier Fallback Hierarchy:
  - Tier 1 (Direct Live Fetch): Attempts a direct client fetch from Google Sheets with a 6-second timeout.
  - Tier 2 (Worker Edge Cache Proxy): If the direct fetch is blocked by browser CORS or network timeouts, it requests /bourbon/api/bourbon/data from the Cloudflare Worker, which serves a 5-minute edge-cached version.
  - Tier 3 (Static Seed Data): If both external and proxy fetches fail, the client hydrates immediately from [bourbon/src/data/seedData.js](file:///e:/TechTrekGT/bourbon/src/data/seedData.js), ensuring complete offline and failure-resistant rendering.

## 2. Distillery, Proof, and Mashbill Extraction

Raw spreadsheet records are enriched through automated heuristic classifiers:

- Automated Distillery Recognition: The extractDistillery function maps commercial bottle names to their true heritage distilleries:
  - Buffalo Trace Distillery: Blanton's, Eagle Rare, E.H. Taylor, George T. Stagg, Stagg, W.L. Weller.
  - Heaven Hill Distillery: Elijah Craig, Evan Williams, Henry McKenna, Larceny, Old Fitz.
  - Jim Beam / Clermont: Baker's, Basil Hayden, Booker's, Knob Creek.
  - Barton 1792: 1792 expressions, Thomas S. Moore.
  - Independent / Craft Distillers: Bardstown Bourbon Co, Balcones, ASW, 2XO, High West.
- Proof and Strength Classification:
  - Standard Proof: 80 to 99 proof, accessible daily sippers.
  - Bottled in Bond: Exactly 100 proof, distilled in one season by one distiller at one distillery and aged at least 4 years.
  - Barrel Proof / Cask Strength: 105 to 140+ proof, uncut and unfiltered powerhouses.
- Grain Bill and Category Parsing: Categorizes expressions into Wheated Bourbons (softer, sweeter profile), High-Rye Bourbons (spicy, peppery profile), Rye Whiskies (>= 51% rye grain), Single Barrel selections, and Finished Bourbons.

## 3. Sommelier Valuation Engine and Unicorn Tiers

The core financial intelligence of Bourbon Sommelier compares on-premise pour costs against retail bottle value:

- Value Score Calculation: Evaluates the ratio between the Sprig pour price (typically for a 1.5oz or 2.0oz pour) and the estimated fair secondary or MSRP bottle value. A score greater than 2.0 indicates an exceptional bargain where the pour costs significantly less than proportional replacement costs.
- Unicorn Value Tiers:
  - Unicorn: Highly allocated, rare bottles offered at near-MSRP pour prices. Immediate buy recommendation.
  - Strong Buy: Excellent whiskey poured at an advantageous price relative to market value.
  - Fair Pour: Competitively priced pour reflecting standard hospitality bar margins.
  - Weak Value: Everyday shelf bottles with high bar markups. Best enjoyed at home.

## 4. Discovery Screens and Navigation Architecture

Bourbon Sommelier organizes exploration into four dedicated screen experiences:

- Radar Screen ([bourbon/src/screens/RadarScreen.jsx](file:///e:/TechTrekGT/bourbon/src/screens/RadarScreen.jsx)): Highlights the top unicorn finds, high-value barrel-proof bottles, and limited allocations currently available at the bar.
- Explorer Screen ([bourbon/src/screens/ExplorerScreen.jsx](file:///e:/TechTrekGT/bourbon/src/screens/ExplorerScreen.jsx)): The complete interactive catalog with multi-column sorting (value score, price, name, MSRP), classification filters, and pagination.
- Search Screen ([bourbon/src/screens/SearchScreen.jsx](file:///e:/TechTrekGT/bourbon/src/screens/SearchScreen.jsx)): Real-time, instant fuzzy text search searching across bottle names, distilleries, mashbills, and tasting notes with instant keyboard response.
- Sommelier Screen ([bourbon/src/screens/SommelierScreen.jsx](file:///e:/TechTrekGT/bourbon/src/screens/SommelierScreen.jsx)): An interactive guided recommendation engine that asks the patron for their price budget and flavor preference (sweet wheated, bold oak, spicy rye, or proof hound) and serves tailored pour suggestions.

## 5. Attribute Filtering and Price Slider Controls

Patrons can dynamically narrow the catalog to their exact requirements:

- Dynamic Price Caps: Selectable price brackets (Under $15, $15 to $25, Over $25) or a precision numeric slider (maxPrice) to filter out bottles exceeding a target expenditure.
- Type Filters: Toggle filters for Wheated, Rye, Barrel Proof, Single Barrel, and Bottled-in-Bond.
- Distillery Filter: Dropdown selector filtering bottles by specific heritage distilleries.
- Sorting Options: Instant sorting by valueScore, sprigPrice, fairPrice, bottle name, or MSRP in ascending or descending sequence.
