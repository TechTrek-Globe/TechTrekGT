---
trigger: always_on
---

# TechTrekGT Workspace Rules

## 0. MANDATORY PRE-FLIGHT AUDIT (READ BEFORE CODING)
BEFORE writing, editing, or generating any code, data, or components:
1. **Read Architecture First:** You MUST read `ARCHITECTURE.md` to confirm the exact tech stack, directory structure, state management, and routing rules for the target app.
2. **Inspect Asset Tree:** You MUST inspect the workspace asset folder (`public/` or `src/assets/`) to see which image files actually exist on disk before referencing any local file path.
3. **Locate Data Files:** Determine whether city/travel data lives in centralized files (e.g., `wayfinder/src/data/poland-2026.js`) or inside component files, and update the data at its source.

---

## 1. Architecture & Navigation (Multi-App)
* **No Root Manifest:** The repository contains five standalone apps (`landing/`, `finance/`, `outpost/`, `wayfinder/`, `bigworm/`). You MUST `cd` into the specific project directory before executing any npm, Vite, or Wrangler commands.
* **Pure JavaScript (No TypeScript):** The project uses pure JS/JSX (`React 19`, `Vite 6`, `Tailwind 3.4`). NEVER attempt to run `tsc`, enforce type-checking, or generate `.ts`/`.tsx` files.
* **Custom SPA Routing:** There is NO React Router. The apps use a hand-rolled client-side router (`window.history.pushState`). Do not import, install, or attempt to configure `react-router-dom`.
* **State Management:** Use React Context and standard hooks (`useState`, `useReducer`) exclusively. Do not introduce Redux, Zustand, or other state libraries.

---

## 2. Backend, Database & Cloudflare Workers
* **Worker Routing:** API and request logic lives in each app's `src/worker.js` (Cloudflare Workers ESM format) and `functions/api/` (Pages-Functions style endpoints).
* **Shared D1 Database:** All apps share a single Cloudflare D1 SQLite database (`personal-budget-db`). Write SQL migrations directly into the specific project's schema file. Be mindful of single-writer SQLite limits when designing data imports.
* **Authentication:** All React apps share a single SSO JWT secret. Sessions rely exclusively on HttpOnly cookies (`credentials: 'include'`). Never store auth tokens in `localStorage`.
* **Local Secrets:** Use `.dev.vars` for local environment variables during `wrangler dev`. Never commit `.dev.vars` to version control.

---

## 3. Mandatory Build & Deploy Loop

**Automated Build Trigger:** Immediately upon completing source code modifications, `cd` into the target app directory and execute the production build (`npm run build`) using PowerShell.  Move to Deploy as next step assuming below rules are met.

**Zero-Error Mandate:** If the build fails (due to linting, unresolved imports, or bundle misconfigurations), the task is not complete. Surgically fix the regression and rebuild.

**Deployment Execution:** Upon a successful zero-error build, immediately deploy the application using `npm run deploy` (which triggers `wrangler deploy`).

**Verification:** Confirm the deployment completes successfully. Log the deployment status or Cloudflare Worker URL in your final task summary.

Atomic Execution Mandate: Never end a turn or present findings after npm run build without having already executed npm run deploy and verified the live Cloudflare deployment in the exact same turn.

---

## 4. Architectural Integrity & Documentation Sync
* **Always Read First:** Before proposing or executing any structural changes (new directories, state providers, database tables, or routing paths), you MUST read the `ARCHITECTURE.md` file in the workspace root to ensure your approach aligns with the established system design.
* **Mandatory Sync:** If your code modifications alter the tech stack, routing strategy, database schema, CI/CD pipeline, or deployment topology, you MUST automatically update the `ARCHITECTURE.md` file to accurately reflect the new state of the project before marking the task as complete.
* **No Silent Drift:** Never leave the architecture document outdated. If a feature changes how the system works, document it immediately.

---

## 5. Wayfinder Asset Management & Directory Standardization
* **Strict Image Hierarchy:** All images for the Wayfinder application MUST be stored locally following this exact path convention: `public/Poland-2026/images/[city_name]/[category]/`. Valid categories are limited to `attractions`, `food`, and `markets` (commercial hotel directories are deprecated; booked hotels live in private user data).
* **Asset Sourcing via Google Places & Geoapify:** When adding or modifying a POI, verify that a local image exists. If missing, write and execute a Node.js utility script that uses the Google Places API or Geoapify to download a high-quality venue photo and save it to the strict hierarchical folder. Never leave external image URLs in the data source.
* **Global Image Migration Mandate:** If you detect any images stored in legacy or root directories (e.g., `public/images/`), autonomously move the files to their correct city/category folders using Node.js file system commands, then update all data files and React components to reference the new paths.
* **Critical: Validate Data Integrity for "Things to Do" Functionality**
   Before activating the "Things to Do" feature, you MUST:
   1. **Image URL Validation:** Audit all image URLs to confirm they point to valid, local resources within the strict directory structure.
   2. **Data Sanitization & Completeness:** Verify that all required fields are populated (venue, date/time, location). Remove or replace incomplete entries.
   3. **Production Safety Check:** Ensure no debugging, placeholder code, or dead external image links remain.
   4. **Action Mandate:** If validation fails, fix the issue before marking the task complete.

---

## 6. External API Integration Rules & Mandatory Dual Verification (Google Places & Geoapify)
* **Mandatory Dual-Verification Standard:** All external API data ingestion for POIs (coordinates, addresses, venue existence, and metadata) MUST use dual verification across both Google Places API and Geoapify API. No single provider data may be committed without cross-provider validation.
* **Google Places & Maps API (Primary Photos, Venue Details & Navigation):**
  - **API Keys:** The Google Maps API key is stored as `GOOGLE_MAPS_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY` in `.dev.vars`.
  - **Fetching Data:** Pass the key via headers/URL parameters when querying `https://places.googleapis.com/v1/places:searchText` (for venue data/photos) or Google Maps URL scheme for navigation.
* **Geoapify API (Primary POI Generation & Geocoding):**
  - **API Keys:** Access the Geoapify API key via `GEOAPIFY_API_KEY` in `.dev.vars`.
  - **Zero Hallucination POI Generation:** Whenever populating attractions, dining, or Christmas market locations for a city (e.g., Wrocław, Poznań, Kraków):
    1. Use Geoapify Places API (`https://api.geoapify.com/v2/places`) or Geocoding API to query real venues for the target city.
    2. Categories to query: `tourism.sights`, `catering.restaurant`, `leisure`.
    3. Cross-verify coordinates and address metadata against Google Places API results (calculating delta threshold < 250 meters).
    4. Save the dual-verified venue names, addresses, star ratings, and coordinates directly into the central data file (`wayfinder/src/data/poland-2026.js`).