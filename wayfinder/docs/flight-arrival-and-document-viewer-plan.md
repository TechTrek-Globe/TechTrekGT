# Implementation Plan: Flight Arrival Visibility and Document Viewer Integration

## Overview
This plan establishes comprehensive flight arrival visibility and interactive document inspection across Wayfinder for the Poland 2026 Christmas expedition. Currently, travelers planning their stay in Kraków lack explicit visibility into their inbound flight touchdown time (13:30 CET on Dec 4, 2026 via Delta DL9208) when assessing hotel check-in times and transfer logistics. Furthermore, uploaded Delta flight confirmation documents (such as `Poland_Delta.pdf`) are not previewable across lodging helpers, transit overviews, and timeline booking cards.

This implementation surfaces flight arrival timing and timezone metadata in all relevant lodging and transit views, and provides an active, universal document preview modal with robust fallback handling.

---

## 1. Architecture and Component Touchpoints

### A. Central Data Layer (`src/data/poland-2026.js`)
* **Flight Metadata Source**: Enrich `polandJourney` with a top-level `flightArrival` object and update `route[0]` (Kraków) transit metadata:
  * Inbound Carrier: Delta Air Lines / KLM Partner
  * Inbound Routing: Atlanta (ATL) ➔ Amsterdam (AMS) ➔ Kraków (KRK)
  * Flight Numbers: DL0074 (ATL ➔ AMS, departs Dec 3 at 20:10 EST, arrives Dec 4 at 10:40 CET) with a 55-minute layover in Amsterdam, connecting to DL9208 (AMS ➔ KRK, departs Dec 4 at 11:35 CET)
  * Arrival Touchdown: Friday, Dec 4, 2026 at 13:30 CET (Central European Time / UTC+1)
  * Airport: Kraków John Paul II International Airport (KRK / Balice)
  * Confirmation Number: GUDI3J (Passengers: Ronald Milton Few, Jonathan Kemp)
  * Lodging Check-in Sync: Touchdown at 13:30 CET + customs/baggage (~45m) + direct SKA1 commuter rail (17m) places travelers at Kraków Główny and their Old Town/Kazimierz hotel between 14:45 and 15:15 CET, perfectly aligning with standard 15:00 CET European hotel check-in times without requiring early check-in fees.
  * Static Document Attachment: `Poland_Delta.pdf` (located at `Poland-2026/docs/Poland_Delta.pdf`).

### B. Lodging and Hotel Booking Helper (`src/components/city/CityHotelsTab.jsx`)
* **Dedicated Flight Arrival & Check-in Sync Callout**:
  * Render an arrival timing alert banner when viewing Kraków (`city.id === 'krakow'`).
  * Display touchdown timing: `Dec 4, 2026 at 13:30 CET (Local Poland Time / KRK Airport)`.
  * Detail transit-to-lodging pipeline: SKA1 train to Kraków Główny (17 mins) arrives ~14:45 - 15:15 CET, synchronizing directly with 15:00 standard hotel check-in.
  * Provide an interactive button: `View Delta Flight Confirmation` which directly launches the document preview modal.
  * Add luggage drop guidance for travelers arriving earlier than expected.

### C. Transit Summary & Station Dossiers (`src/components/RouteVisualization.jsx`)
* **Inbound Flight Transfer Card**:
  * Upgrade the inbound flight box (lines 420-434) to explicitly display:
    * Flight: `Delta DL9208 (ATL ➔ AMS ➔ KRK)`
    * Touchdown: `Dec 4, 2026 • 13:30 CET (Local Poland Time)`
    * Transit Connection: `Direct SKA1 Rail (17m) to Kraków Główny`
  * Add a secondary action button alongside `Transfer Dossier`: `View Flight Document` opening `Poland_Delta.pdf` in the preview modal.

### D. Main Journey Overview & Timeline (`src/components/PolandLanding.jsx`)
* **Stop 01 Kraków Transit & Arrival Details**:
  * Expand `stopTransitInfo.krakow` to highlight the 13:30 CET arrival timezone and lodging check-in alignment.
  * In the Journey Stop card for Kraków, add a quick-action button to view the Delta flight confirmation document.

### E. Itinerary Timeline & Booking Cards (`src/components/itinerary/PrivateBookingCard.jsx` & `src/components/ItineraryView.jsx`)
* **Card Document Trigger**:
  * In `PrivateBookingCard.jsx`, inspect if the item has an attached document (`source_document_id`, `document_url`, or if it is the Delta flight item matching `GUDI3J` / `DL9208`).
  * Surface an active `View Attached Document` action pill/button.
  * In `ItineraryView.jsx`, add an interactive document inspection trigger to Day 1's confirmed flight arrival item.

### F. Reusable Universal Document Viewer (`src/components/DocumentViewerModal.jsx`)
* **Modular Preview Component**:
  * Extract and consolidate preview modal logic into an accessible, responsive modal usable across all pages.
  * Document Resolution Hierarchy:
    1. Check active in-memory blob cache.
    2. Check IndexedDB store (`getLocalDocumentFile`) using document ID or filename.
    3. Check static asset fallback path: `import.meta.env.BASE_URL + 'Poland-2026/docs/' + filename` (resolving `Poland_Delta.pdf` if filename references Delta or flight).
    4. Check direct remote URL (`file_url`).
  * Supported Formats & Fallbacks:
    * PDF viewer utilizing `<object>` / `<iframe>` with error capture.
    * Image viewer (`<img>`) with responsive fit for PNG, JPEG, WEBP.
    * Fallback error state with explicit error messaging:
      * Provides document metadata (name, size, type).
      * `Download Document` direct trigger.
      * `Open in New Tab` fallback link.
      * Extracted flight details cheat sheet (ATL ➔ AMS ➔ KRK, DL9208, 13:30 CET).
      * `Attach / Re-upload File` manual file picker to refresh local browser IndexedDB storage.
    * Keyboard escape handling and outside-click dismiss.

### G. Document Center Integration (`src/components/DocumentCenter.jsx`)
* Refactor `DocumentCenter.jsx` to adopt the shared modal or ensure seamless synchronization with IndexedDB and bundled default documents like `Poland_Delta.pdf`.
* Ensure flight extraction metadata in `simulateExtraction` populates standard arrival/departure dates and times (`departure_date: '2026-12-03'`, `departure_time: '20:10'`, `arrival_date: '2026-12-04'`, `arrival_time: '13:30'`, `arrival_timezone: 'CET'`).

---

## 2. Step-by-Step Implementation Strategy

1. **Data Model Updates (`src/data/poland-2026.js`)**:
   - Add `flightArrival` object to `polandJourney`.
   - Update `route[0]` (Kraków) transit details to include airport arrival time (13:30 CET), flight number (DL9208), and hotel check-in synchronization notes.

2. **Universal Modal Component (`src/components/DocumentViewerModal.jsx`)**:
   - Create `src/components/DocumentViewerModal.jsx` supporting PDF and image previewing, IndexedDB resolution, bundled static fallbacks, and error recovery.

3. **Hotel Booking Helper Updates (`src/components/city/CityHotelsTab.jsx`)**:
   - Add the Flight Arrival & Check-in Sync card for Kraków.
   - Include direct landing time, local CET timezone, transfer duration, check-in recommendation, and the `View Delta Flight Confirmation` button.

4. **Transit Summary Updates (`src/components/RouteVisualization.jsx`)**:
   - Surface local arrival time (13:30 CET) and Delta flight DL9208 in the Inbound Flight Transfer card.
   - Wire the `View Flight Document` button to open the preview modal.

5. **Trip Overview Updates (`src/components/PolandLanding.jsx`)**:
   - Update Kraków stop transit metadata and add document preview launcher.

6. **Itinerary Timeline & Booking Card Updates (`src/components/itinerary/PrivateBookingCard.jsx` & `src/components/ItineraryView.jsx`)**:
   - Add document viewer triggers to private flight booking cards and Day 1 arrival events.

7. **Verification & Quality Checks**:
   - Run `npm run build` in `wayfinder/` to verify zero build or packaging regressions.
   - Verify that clicking document viewer triggers displays `Poland_Delta.pdf` properly with no console errors or broken links.
   - Verify punctuation guardrail: zero em dashes used.

---

## 3. Pre-Flight Checklist
* [x] Path targets identified: `src/data/poland-2026.js`, `src/components/city/CityHotelsTab.jsx`, `src/components/RouteVisualization.jsx`, `src/components/DocumentViewerModal.jsx`, `src/components/itinerary/PrivateBookingCard.jsx`, `src/components/ItineraryView.jsx`, `src/components/PolandLanding.jsx`.
* [x] Target static asset verified: `public/Poland-2026/docs/Poland_Delta.pdf` (exists on disk).
* [x] Build pipeline verified: `npm run build` succeeds cleanly.
* [x] Punctuation guardrail: No em dashes in plan or source code.

