# Wayfinder Guide - Product Identity and Travel Companion Persona

## 1. Product Overview and Core Mission

Wayfinder is the dedicated international travel companion and winter journey guide within the TechTrekGT platform, hosted at techtrekgt.com/wayfinder/*. Designed specifically for the Poland Christmas 2026 expedition, Wayfinder transforms complex multi-city winter travel logistics into an intuitive, elegant digital guide.

The core mission of Wayfinder is to provide a curated, zero-stress exploration platform for six iconic Polish destinations: Wrocław, Poznań, Toruń, Gdańsk, Warsaw, and Kraków. It combines dual-verified point of interest (POI) discovery with private travel schedule coordination, real-time currency conversion, and secure document vault management.

## 2. Target Personas and Travel Archetypes

Wayfinder is designed around specific travel needs and exploration styles:

- Winter Journey Explorer: An independent traveler seeking authentic cultural experiences, historic Old Town walking routes, gothic architecture, and vibrant European Christmas markets with hand-crafted gifts and mulled wine (grzaniec galicyjski).
- Culinary and Dining Enthusiast: A traveler focused on traditional Polish gastronomy (pierogi, żurek, bigos, oscypek), contemporary culinary concepts, historic milk bars (bary mleczne), and curated cafe culture.
- Group Logistics and Itinerary Coordinator: The designated planner responsible for intercity rail schedules (PKP Intercity), booked hotel check-ins, confirmation vouchers, and group travel budgets.
- Inclusive Travel Advocate: A traveler prioritizing safety, dignity, and welcoming community spaces, relying on verified LGBTQ+ friendly venues, cultural centers, and local legal context across Poland.

## 3. Visual Aesthetics and Design Philosophy

Wayfinder employs a warm, atmospheric winter aesthetic that captures the magic of snowy European squares and illuminated holiday markets:

- Winter Color Palette: Declared via Tailwind CSS tokens in [wayfinder/tailwind.config.js](file:///e:/TechTrekGT/wayfinder/tailwind.config.js). Combines deep midnight slate backgrounds with warm festive gold and amber highlights, frosted glass cards, and crisp ice-blue accents.
- Modern Typography: Utilizes Inter from Google Fonts for clean legibility across tabular schedules, detailed historical summaries, and street-level addresses.
- Atmospheric Micro-Interactions: Subtle snow animations, glowing holiday badges, interactive route maps, and smooth tab transitions create an immersive sense of place.
- High-Density Data Layouts: City tabs balance visual media with structured practical details: operating hours, Polish zloty (PLN) pricing, walking distances, and Google Maps navigation deep-links.

## 4. Zero-Hallucination and Asset Discipline Philosophy

Wayfinder enforces strict standards regarding data integrity and media sourcing:

- Dual Verification Mandate: No commercial or cultural venue is added to the catalog without dual verification across both Geoapify API and Google Places API, guaranteeing accurate coordinates, live existence, and precise addresses.
- Localized Media Hierarchy: External image dependencies are deprecated. All venue and city media must be hosted locally within structured public directories (public/Poland-2026/images/[city]/[category]/), protecting travelers from broken image links during mobile roaming.
- Private Hub vs Public Guide: Clear architectural separation between the public travel guide (accessible to anyone exploring Polish culture) and the private trip hub (gated behind SSO JWT authentication for personal bookings, itineraries, and vouchers).
