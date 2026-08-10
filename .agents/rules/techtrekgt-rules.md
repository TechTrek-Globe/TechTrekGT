---
trigger: always_on
---

---
trigger: always_on
---

# TechTrekGT Workspace Rules

## 0. MANDATORY PRE-FLIGHT AUDIT (READ BEFORE CODING)
BEFORE writing, editing, or generating any code, data, or components:
1. **Read Architecture First:** You MUST read `ARCHITECTURE.md` to confirm the exact tech stack, directory structure, state management, and routing rules for the target app.
2. **Inspect Asset Tree:** You MUST inspect the workspace asset folder (`public/` or `src/assets/`) to see which image files actually exist on disk before referencing any local file path.
3. **Locate Data Files:** Determine whether city/travel data lives in centralized files (e.g., `wayfinder/src/data/poland-2026.js`) or inside component files, and update the data at its source.

## 1. Architecture & Navigation (Multi-App)
* **No Root Manifest:** The repository contains five standalone apps. You MUST `cd` into the specific project directory before executing any npm, Vite, or Wrangler commands.
* **Pure JavaScript (No TypeScript):** The project uses pure JS/JSX (`React 19`, `Vite 6`, `Tailwind 3.4`). NEVER attempt to run `tsc`, enforce type-checking, or generate `.ts`/`.tsx` files.
* **Custom SPA Routing (CRITICAL):** There is NO React Router. The apps use a hand-rolled client-side router (`window.history.pushState` / `MapsTo`). Do NOT import, install, or use `react-router-dom`.
* **State Management:** Use React Context and standard hooks exclusively. Do not introduce Redux, Zustand, or other state libraries.

## 2. Content, Asset & Image Integrity Rules
* **No Invented Local Paths:** NEVER generate local image paths unless you have confirmed that the file physically exists on disk.
* **Image Fallbacks:** If local assets do not exist, use high-quality external Unsplash URLs. Images MUST match the domain context (e.g., European winter, Polish architecture). **NEVER use tropical, beach, or warm-climate images.**
* **Zero Hallucination & Cross-Contamination:** - Fact-check all hotel names, attractions, and Christmas market details for the target city.
  - NEVER copy data from one city (e.g., Wroclaw) into another (e.g., Poznan) without completely overhauling the data to match reality.

## 3. Backend, Database & Cloudflare Workers
* **Worker Routing:** API logic lives in `src/worker.js` and `functions/api/`.
* **Shared D1 Database:** All apps share a single D1 database (`personal-budget-db`). Write SQL migrations directly into the specific project's schema file. 
* **Authentication:** Sessions rely exclusively on HttpOnly cookies. Never store tokens in `localStorage` or `sessionStorage`.

## 4. Production Readiness & Validation Mandate
1. **Routing Verification:** Verify that every link and CTA button uses the custom SPA router.
2. **Asset Validation:** Verify that every `src` URL loads a real image that fits the context.
3. **Data Completeness:** Ensure no placeholder text (e.g., "Lorem Ipsum") remains.
4. **Action Mandate:** If any step fails, you MUST fix the issue before marking the task as complete.

## 5. Geoapify API Data Fetching Rules
* **API Key Location:** Access the API key via `process.env.GEOAPIFY_API_KEY` or `.env`.
* **Zero Hallucination POI Generation:** Whenever populating hotels, attractions, or Christmas market locations for a city (e.g., Wrocław, Poznań, Kraków):
  1. Use Geoapify Places API (`https://api.geoapify.com/v2/places`) or Geocoding API to query real venues for the target city.
  2. Categories to query: `accommodation.hotel`, `tourism.sights`, `catering.restaurant`, `leisure`.
  3. Save the fetched venue names, addresses, star ratings, and coordinates directly into the central data file (`wayfinder/src/data/poland-2026.js`).
* **Image Fallbacks:** If Geoapify does not return a direct image URL, use high-quality Unsplash URLs matching European winter/architecture. Never invent fake local image paths.