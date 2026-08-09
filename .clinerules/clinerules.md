# TechTrekGT Workspace Rules

## 1. Architecture & Navigation (Multi-App)
* **No Root Manifest:** The repository contains five standalone apps (`landing/`, `finance/`, `outpost/`, `wayfinder/`, `bigworm/`). You MUST `cd` into the specific project directory before executing any npm, Vite, or Wrangler commands.
* **Pure JavaScript (No TypeScript):** The project uses pure JS/JSX (`React 19`, `Vite 6`, `Tailwind 3.4`). NEVER attempt to run `tsc`, enforce type-checking, or generate `.ts`/`.tsx` files.
* **Custom SPA Routing:** There is NO React Router. The apps use a hand-rolled client-side router (`window.history.pushState`). Do not import, install, or attempt to configure `react-router-dom`.
* **State Management:** Use React Context and standard hooks (`useState`, `useReducer`) exclusively. Do not introduce Redux, Zustand, or other state libraries.

## 2. Backend, Database & Cloudflare Workers
* **Worker Routing:** API and request logic lives in each app's `src/worker.js` (Cloudflare Workers ESM format) and `functions/api/` (Pages-Functions style endpoints). 
* **Shared D1 Database:** All apps share a single Cloudflare D1 SQLite database (`personal-budget-db`). Write SQL migrations directly into the specific project's schema file. Be mindful of single-writer SQLite limits when designing data imports.
* **Authentication:** All React apps share a single SSO JWT secret. Sessions rely exclusively on HttpOnly cookies (`credentials: 'include'`). Never store auth tokens in `localStorage`.
* **Local Secrets:** Use `.dev.vars` for local environment variables during `wrangler dev`. Never commit `.dev.vars` to version control.

## 3. Mandatory Build & Deploy Loop
* **Automated Build Trigger:** Immediately upon completing source code modifications, `cd` into the target app directory and execute the production build (`npm run build`) using PowerShell.
* **Zero-Error Mandate:** If the build fails (due to linting, unresolved imports, or bundle misconfigurations), the task is not complete. Surgically fix the regression and rebuild.
* **Deployment Execution:** Upon a successful zero-error build, immediately deploy the application using `npm run deploy` (which triggers `wrangler deploy`).
* **Verification:** Confirm the deployment completes successfully. Log the deployment status or Cloudflare Worker URL in your final task summary.

## 4. Architectural Integrity & Documentation Sync
* **Always Read First:** Before proposing or executing any structural changes (new directories, state providers, database tables, or routing paths), you MUST read the `ARCHITECTURE.md` file in the workspace root to ensure your approach aligns with the established system design.
* **Mandatory Sync:** If your code modifications alter the tech stack, routing strategy, database schema, CI/CD pipeline, or deployment topology, you MUST automatically update the `ARCHITECTURE.md` file to accurately reflect the new state of the project before marking the task as complete.
* **No Silent Drift:** Never leave the architecture document outdated. If a feature changes how the system works, document it immediately.

## 5. Wayfinder Asset Management & Directory Standardization
* **Strict Image Hierarchy:** All images for the Wayfinder application MUST be stored locally following this exact path convention: `public/Poland-2026/images/[city_name]/[category]/`. Valid categories are limited to `hotels`, `food`, `markets`, and `attractions` (e.g., `public/Poland-2026/images/krakow/markets/`).
* **Asset Verification & Download:** When adding, generating, or modifying a place (hotel, attraction, restaurant, etc.), you must verify that a local image exists in the correct directory. If missing or currently referencing an external URL, write and execute a utility script to download the image and save it to the strict hierarchical folder. Never leave external image URLs in the data source.
* **Global Image Migration Mandate:** If you detect any images stored in legacy or root directories (e.g., `public/images/hotels/`), you must autonomously move the files to their correct city/category folders using Node.js file system commands. Immediately following the move, you must update the corresponding data files (JSON/JS) and React components to wire the images to their new local paths.