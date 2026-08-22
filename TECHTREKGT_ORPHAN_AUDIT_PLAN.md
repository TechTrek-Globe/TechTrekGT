# TechTrekGT Ecosystem - Dead Code & Orphan File Audit Plan

## 1. Executive Summary

A comprehensive, read-only static analysis and dependency-graph audit was conducted across all 5 sub-applications in the TechTrekGT ecosystem (`landing/`, `finance/`, `outpost/`, `wayfinder/`, `bigworm/`) and the root workspace.

The audit verified all entry points (`index.html`, `src/main.jsx`, `src/App.jsx`, `src/worker.js`, `functions/api/`), dynamic imports, CSS `url()` references, asset references, and data structures (including `wayfinder/src/data/poland-2026.js`).

### Summary of Findings by Sub-Application

| Sub-Application | Total Files Analyzed | Active Files | Candidate Orphan Files | Reclaimable Disk Space | Primary Orphan Categories |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`landing/`** | 13 | 11 | 2 | ~486.8 KB | Unused legacy static logo assets |
| **`finance/`** | 59 | 55 | 4 | ~581.7 KB | 1 dead component, 1 unused logo, sample sheet, legacy doc |
| **`outpost/`** | 107 | 94 | 13 | ~6.15 MB | 10 unreferenced PNG/JPG assets (superseded by WebP), sample sheet, dev notes |
| **`wayfinder/`** | 251 | 231 | 20 | ~1.19 MB | 1 redundant duplicate map asset, 13 scratch verification scripts, legacy docs/SQL |
| **`bigworm/`** | 26 | 26 | 0 | 0 KB | None (100% active, zero orphan files) |
| **`workspace root`** | 7 | 6 | 1 | ~161.9 KB | Obsolete root `package-lock.json` (no root package.json exists) |
| **TOTALS** | **463** | **423** | **40** | **~8.57 MB** | **Dead components, obsolete assets, scratch scripts, legacy docs** |

---

## 2. Sub-Application Audit Details & Candidate Tables

### 2.1 `landing/` (Platform Root Hub)
- **Status:** Static Cloudflare Worker deployment serving `techtrekgt.com`.
- **Edge Case Verification:** Verified `.assetsignore` is required by Cloudflare Wrangler to exclude configuration and build files from being served as public assets.
- **Candidate Files:**

| File Path | Type | Estimated Size | Confirmation Reason (Zero references found) | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| `landing/public/images/techtrekgt-logo.png` | Asset | 473,949 bytes (~474 KB) | Zero references in `index.html` or `style.css`. The application uses `techtrekgt-banner.png` exclusively. | Low |
| `landing/public/images/wayfinder-logo.svg` | Asset | 12,911 bytes (~13 KB) | Zero references in `index.html` or `style.css`. The application uses `wayfinder-logo.png` for the Wayfinder card. | Low |

---

### 2.2 `finance/` (Personal Budget Tracker)
- **Status:** React 19 + Vite + Cloudflare Worker SPA mounted at `/finance/*`.
- **Edge Case Verification:** 
  - `src/utils/api.js` was verified as actively imported across `AuthContext.jsx`, `LedgerDataContext.jsx`, `BudgetMetadataContext.jsx`, `SettingsModal.jsx`, and `SettingsView.jsx`.
  - `src/components/AccountLedgerView.jsx` was confirmed as a dead legacy view (216 lines) that was superseded by `LedgerView.jsx`. It is not imported anywhere in `App.jsx` or any active component.
- **Candidate Files:**

| File Path | Type | Estimated Size | Confirmation Reason (Zero references found) | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| `finance/src/components/AccountLedgerView.jsx` | Component | 9,582 bytes (~9.6 KB) | Dead legacy component (216 lines). Fully superseded by `LedgerView.jsx`. Zero imports or render invocations across active codebase. | Low |
| `finance/src/assets/header-logo.png` | Asset | 473,949 bytes (~474 KB) | Legacy uncompressed header logo. Superseded by `header-logo-dark.png` and `header-logo-light.png` used in `AppLayout.jsx` and `AuthPage.jsx`. | Low |
| `finance/Personal Budget Emory Parc 2026.xlsx` | Util / Sample Data | 85,308 bytes (~85 KB) | Static reference workbook in sub-app root. Zero references in runtime code or build scripts. | Low |
| `finance/ARCHITECTURE.md` | Documentation | 12,897 bytes (~13 KB) | Legacy local architecture document. Superseded by unified root `ARCHITECTURE.md`. | Low |

---

### 2.3 `outpost/` (Resale / Auction Operations Tracker)
- **Status:** React 19 + Vite + Cloudflare Worker SPA mounted at `/outpost/*`.
- **Edge Case Verification:**
  - `src/utils/api.js` was verified as actively imported by `ListingCopyModal.jsx`, `SpreadsheetImporterModal.jsx`, `AuthContext.jsx`, `InventoryContext.jsx`, and `auctionApi.js`.
  - All 10 legacy PNG/JPG banner and logo assets were confirmed unreferenced following conversion to optimized `.webp` formats (`outpost-logo.webp`, `outpost-ai-cropped.webp`).
  - `VHELPER_BRIDGE/outpostBridge.js` is a reference integration module for the VineScout Chrome extension. It is not compiled into the Outpost client bundle.
- **Candidate Files:**

| File Path | Type | Estimated Size | Confirmation Reason (Zero references found) | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| `outpost/public/ebay-banner-collectibles.jpg` | Asset | 390,130 bytes (~390 KB) | Unused static banner asset in `public/`. Zero references in source or markup. | Low |
| `outpost/public/ebay-banner-sports.png` | Asset | 788,611 bytes (~789 KB) | Unused static banner asset in `public/`. Zero references in source or markup. | Low |
| `outpost/public/outpost-header-banner.png` | Asset | 476,779 bytes (~477 KB) | Unused static header banner asset in `public/`. Zero references in source or markup. | Low |
| `outpost/public/outpost-logo.png` | Asset | 995,671 bytes (~996 KB) | Uncompressed legacy PNG logo in `public/`. Superseded by `outpost-logo.webp`. Zero references. | Low |
| `outpost/src/assets/globetrotter-portrait.png` | Asset | 495,553 bytes (~496 KB) | Unused portrait artwork in `src/assets/`. Zero imports or CSS references. | Low |
| `outpost/src/assets/outpost-ai-cropped.png` | Asset | 561,922 bytes (~562 KB) | Uncompressed legacy PNG artwork. Superseded by `outpost-ai-cropped.webp` in `AuthPage.jsx`. Zero imports. | Low |
| `outpost/src/assets/outpost-header-banner.png` | Asset | 476,779 bytes (~477 KB) | Unused header banner in `src/assets/`. Zero imports across components. | Low |
| `outpost/src/assets/outpost-logo.png` | Asset | 995,671 bytes (~996 KB) | Uncompressed legacy PNG logo in `src/assets/`. Superseded by `outpost-logo.webp` in `AppLayout.jsx`. Zero imports. | Low |
| `outpost/src/assets/outpost-merged-banner.png` | Asset | 750,080 bytes (~750 KB) | Unused banner artwork in `src/assets/`. Zero imports. | Low |
| `outpost/src/assets/outpost-wide-ai-banner.png` | Asset | 593,296 bytes (~593 KB) | Unused wide banner artwork in `src/assets/`. Zero imports. | Low |
| `outpost/Prestine Auction Tracker v2.xlsx` | Util / Sample Data | 92,193 bytes (~92 KB) | Sample Excel workbook in sub-app root. Zero references in runtime code or build scripts. | Low |
| `outpost/INVENTORY_PRICING_RETHINK.md` | Documentation | 25,954 bytes (~26 KB) | Developer planning notes doc in sub-app root. Zero runtime references. | Low |
| `outpost/docs/amazon-fetch-fix-plan.md` | Documentation | 10,062 bytes (~10 KB) | Development fix plan doc in `docs/`. Zero runtime references. | Low |
| `outpost/VHELPER_BRIDGE/outpostBridge.js` | Integration Utility | 4,062 bytes (~4.1 KB) | Standalone Chrome extension bridge reference module. Not imported in Outpost web app. | Medium *(Retain or relocate to extension repository)* |

---

### 2.4 `wayfinder/` (Poland Christmas 2026 Travel Guide)
- **Status:** React 19 + Vite + Cloudflare Worker SPA mounted at `/wayfinder/*`.
- **Edge Case Verification:**
  - **Asset Tree Verification:** All 161 POI venue images located in `public/Poland-2026/images/[city]/[category]/` were audited against `wayfinder/src/data/poland-2026.js` and `wayfinder/src/utils/cityImages.js`. **100% of the 161 POI images are actively referenced and valid.** Zero POI images are orphaned.
  - `src/components/PolandLanding.jsx` imports `import polandMapRouteClean from '../assets/poland-map-route-clean.png'`. The duplicate copy in `public/poland-map-route-clean.png` is completely unreferenced.
  - `wayfinder/scratch/` contains 13 temporary POI verification scripts and dual-verification JSON dumps from historical batch data ingestion.
- **Candidate Files:**

| File Path | Type | Estimated Size | Confirmation Reason (Zero references found) | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| `wayfinder/public/poland-map-route-clean.png` | Asset | 839,643 bytes (~840 KB) | Redundant unreferenced duplicate in `public/`. Application directly imports `src/assets/poland-map-route-clean.png`. | Low |
| `wayfinder/scratch/audit-poland-data.json` | Scratch Data | 3,865 bytes (~3.9 KB) | Scratch audit output in `scratch/`. Zero runtime references. | Low |
| `wayfinder/scratch/audit-poland-data.mjs` | Scratch Script | 9,064 bytes (~9.1 KB) | Scratch audit script in `scratch/`. Zero runtime references. | Low |
| `wayfinder/scratch/dual-verification-results.json` | Scratch Data | 3,172 bytes (~3.2 KB) | Scratch dual verification output. Zero runtime references. | Low |
| `wayfinder/scratch/dual-verify-krakow-markets.mjs` | Scratch Script | 8,054 bytes (~8.1 KB) | Scratch POI verification script. Zero runtime references. | Low |
| `wayfinder/scratch/dual_verification_final.json` | Scratch Data | 12,171 bytes (~12.2 KB) | Scratch dual verification dump. Zero runtime references. | Low |
| `wayfinder/scratch/fetch-and-verify-sights.mjs` | Scratch Script | 10,940 bytes (~10.9 KB) | Scratch fetch script. Zero runtime references. | Low |
| `wayfinder/scratch/fetch-krakow-coordinates.mjs` | Scratch Script | 13,008 bytes (~13.0 KB) | Scratch coordinate lookup script. Zero runtime references. | Low |
| `wayfinder/scratch/fetch-krakow-markets.mjs` | Scratch Script | 5,320 bytes (~5.3 KB) | Scratch market fetch script. Zero runtime references. | Low |
| `wayfinder/scratch/patch-krakow-markets.mjs` | Scratch Script | 4,857 bytes (~4.9 KB) | Scratch data patch script. Zero runtime references. | Low |
| `wayfinder/scratch/route-itinerary-outline.md` | Scratch Doc | 13,414 bytes (~13.4 KB) | Scratch itinerary draft. Zero runtime references. | Low |
| `wayfinder/scratch/verification_results.json` | Scratch Data | 11,380 bytes (~11.4 KB) | Scratch verification dump. Zero runtime references. | Low |
| `wayfinder/scratch/verified-sights-output.json` | Scratch Data | 5,364 bytes (~5.4 KB) | Scratch sights dump. Zero runtime references. | Low |
| `wayfinder/scratch/verify_pois.js` | Scratch Script | 11,159 bytes (~11.2 KB) | Scratch POI validation script. Zero runtime references. | Low |
| `wayfinder/outline.md` | Documentation | 92,305 bytes (~92.3 KB) | Legacy planning outline document in sub-app root. Zero runtime references. | Low |
| `wayfinder/DATA_AUDIT_REPORT.md` | Documentation | 4,396 bytes (~4.4 KB) | Historical audit report. Zero runtime references. | Low |
| `wayfinder/migrate-wayfinder-001.sql` | DB Migration | 1,581 bytes (~1.6 KB) | One-time D1 patch script (already consolidated into `schema-wayfinder.sql`). | Low |
| `wayfinder/seed-wayfinder.sql` | DB Seed | 1,316 bytes (~1.3 KB) | Sample seed script. Zero runtime references. | Low |
| `wayfinder/ARCHITECTURE.md` | Documentation | 19,582 bytes (~19.6 KB) | Local app architecture document. Superseded by root `ARCHITECTURE.md`. | Low |
| `wayfinder/README.md` | Documentation | 14,419 bytes (~14.4 KB) | Local README document. Zero runtime references. | Low |

---

### 2.5 `bigworm/` (Secure Remote Desktop Portal)
- **Status:** React 19 + Vite + Cloudflare Worker SPA mounted at `bigworm.techtrekgt.com`.
- **Audit Findings:** All 26 files analyzed are actively wired and required.
  - Entry points: `index.html`, `src/main.jsx`, `src/App.jsx`, `src/worker.js`, `src/index.css`.
  - Auth & Views: `src/components/AuthPage.jsx`, `src/components/GuacamoleView.jsx`, `src/context/AuthContext.jsx`, `src/utils/api.js`.
  - Backend Handlers: `functions/api/guac-token.js`, `functions/api/auth/login.js`, `functions/api/auth/logout.js`, `functions/api/auth/me.js`, `functions/utils/auth.js`, `functions/utils/rateLimit.js`.
  - Container & Config: `bigworm-docker-compose.yml`, `guacamole-config/guacamole.properties`, `guacamole-config/user-mapping.xml`.
- **Candidate Files:** None (0 orphan files).

---

### 2.6 `workspace root`
- **Candidate Files:**

| File Path | Type | Estimated Size | Confirmation Reason (Zero references found) | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| `package-lock.json` | Config / Lockfile | 161,939 bytes (~162 KB) | Obsolete root lockfile from prior root-level npm invocations. There is no root `package.json`; each of the 5 apps maintains its own independent `package.json` and lockfile. | Low |

---

## 3. Phased Removal & Build Verification Strategy

When removal is authorized, execute the cleanup in disciplined phases with mandatory per-app build verification:

### Phase 1: Dead Documentation, Sample Workbooks & Scratch Directories
- Remove legacy `.md` files in `finance/`, `outpost/`, and `wayfinder/`.
- Remove root `package-lock.json`.
- Remove unreferenced sample `.xlsx` files (`finance/`, `outpost/`).
- Remove `wayfinder/scratch/` directory.

### Phase 2: Obsolete & Uncompressed Static Assets
- Remove unreferenced legacy assets in `landing/public/images/` (`techtrekgt-logo.png`, `wayfinder-logo.svg`).
- Remove unreferenced assets in `finance/src/assets/` (`header-logo.png`).
- Remove 10 uncompressed legacy PNG/JPG banner & logo assets in `outpost/public/` and `outpost/src/assets/`.
- Remove redundant duplicate map in `wayfinder/public/poland-map-route-clean.png`.

### Phase 3: Dead Components & Consolidations
- Remove dead component `finance/src/components/AccountLedgerView.jsx`.
- Retain `outpost/VHELPER_BRIDGE/outpostBridge.js` as an external integration reference or relocate it if requested.

### Phase 4: Per-Application Build Verification
Execute the production build across all sub-applications sequentially:
1. `cd e:\TechTrekGT\landing` -> verify static assets.
2. `cd e:\TechTrekGT\finance && npm run build` -> verify zero build errors in Vite bundle (`dist/client`).
3. `cd e:\TechTrekGT\outpost && npm run build` -> verify zero build errors in Vite bundle (`dist/client`).
4. `cd e:\TechTrekGT\wayfinder && npm run build` -> verify zero build errors in Vite bundle (`dist/client`).
5. `cd e:\TechTrekGT\bigworm && npm run build` -> verify zero build errors in Vite bundle (`dist/client`).

---

## 4. Execution State & Safety Guardrail

> **SAFETY DIRECTIVE ACTIVE:**
> All audit findings in this document are read-only. No files have been deleted, moved, or altered.
> File removal is strictly blocked until manual user authorization is received with the exact confirmation phrase:
> `"Plan approved, proceed with removal"`
