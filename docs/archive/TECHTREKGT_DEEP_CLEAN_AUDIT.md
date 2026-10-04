# [ARCHIVED] TechTrekGT Ecosystem - Aggressive Deep-Clean Audit

> **Audit Date:** 2026-08-22
> **Supersedes:** `TECHTREKGT_ORPHAN_AUDIT_PLAN.md` (prior conservative audit)
> **Scope:** All 5 sub-apps + workspace root. Static analysis only - NO files were modified.

---

## 0. PRIOR AUDIT STATUS - WHAT HAS ALREADY BEEN CLEANED

All 40 files flagged in the prior conservative audit have already been removed. Key deletions confirmed:

| Prior Orphan | Status |
| :--- | :--- |
| `landing/public/images/techtrekgt-logo.png` + `wayfinder-logo.svg` | **DELETED** |
| `finance/src/components/AccountLedgerView.jsx` | **DELETED** |
| `finance/src/assets/header-logo.png` | **DELETED** |
| `finance/Personal Budget Emory Parc 2026.xlsx` + `ARCHITECTURE.md` | **DELETED** |
| All 10 outpost legacy PNG/JPG banner assets | **DELETED** |
| `outpost/Prestine Auction Tracker v2.xlsx` | **DELETED** |
| `outpost/INVENTORY_PRICING_RETHINK.md` | **DELETED** |
| `outpost/docs/amazon-fetch-fix-plan.md` | **DELETED** |
| `wayfinder/scratch/` (13 scripts + data dumps) | **DELETED** |
| `wayfinder/public/poland-map-route-clean.png` (duplicate) | **DELETED** |
| `wayfinder/outline.md`, `DATA_AUDIT_REPORT.md`, `migrate-wayfinder-001.sql`, `seed-wayfinder.sql`, `ARCHITECTURE.md`, `README.md` | **DELETED** |
| Root `package-lock.json` | **DELETED** |

---

## 1. EXECUTIVE SUMMARY - NET-NEW DEEP CLEAN FINDINGS

This aggressive audit adds: dead export analysis, unused NPM dependency cross-referencing, empty directory detection, orphaned island detection, and stale documentation link analysis.

| Sub-App | Orphaned Islands | Dead Exports | Legacy/Junk | Unused NPM Deps | Disconnected Assets | Total |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `landing/` | 0 | 0 | 0 | 0 | 0 | **0** |
| `finance/` | 0 | 1 | 1 | 0 | 0 | **2** |
| `outpost/` | 1 | 0 | 2 | 1 | 0 | **4** |
| `wayfinder/` | 0 | 0 | 1 | 0 | 0 | **1** |
| `bigworm/` | 0 | 0 | 0 | 0 | 0 | **0** |
| `workspace root` | 0 | 0 | 3 | 0 | 0 | **3** |
| **TOTALS** | **1** | **1** | **7** | **1** | **0** | **10** |

> **The workspace is already very lean.** The prior audit eliminated the bulk of dead weight. This deep audit surfaces **10 additional candidates**. The highest-impact finding is the **`recharts` NPM dependency in `outpost`** - a 450KB+ charting library that is fully unused in that app.

---

## 2. DETAILED FINDINGS BY SUB-APP

---

### 2.1 `landing/` - Status: CLEAN

All 5 images in `public/images/` confirmed active via full `index.html` trace:
- `techtrekgt-banner.png` - hero banner (line 24)
- `finance-logo.png` - Finance card (line 60)
- `outpost-logo.png` - Outpost card (line 83)
- `vinescout-logo.png` - Vine Scout card (line 106)
- `wayfinder-logo.png` - Wayfinder card (line 130)

**Candidate Files: None.**

---

### 2.2 `finance/` - Status: 2 Candidates

Full component and utility graph verified active. All 15 components, 8 utils, 4 context files, 8 API handlers, and both assets wired.

#### Dead Utilities / Unused Exports

| Symbol | File | Evidence | Risk |
| :--- | :--- | :--- | :--- |
| `mergePeople()` | `finance/src/utils/importer.js` (line 641) | Exported but zero imports found anywhere in `finance/src/`. The entire `importer.js` module is actively used, but this one function is dead code within it. | Low |

#### Legacy / Junk Files

| Path | Type | Evidence | Risk |
| :--- | :--- | :--- | :--- |
| `finance/scratch/` | Empty directory | `finance/scratch/` exists on disk but contains zero files. Dead structural weight. | Low |

**Note:** `SettingsModal.jsx` (161KB) and `SettingsView.jsx` (160KB) are both genuinely active - they serve different entry points (`isSettingsOpen` overlay vs. `/finance/settings` route). They are NOT duplicates.

---

### 2.3 `outpost/` - Status: 4 Candidates (1 High-Impact)

Full component graph verified. All 16 components, 11 utils, 2 contexts, and all 29 API handler imports in `worker.js` are wired.

Assets confirmed active:
- `src/assets/outpost-ai-cropped.webp` - imported in `AuthPage.jsx`
- `src/assets/outpost-logo.webp` - imported in `AppLayout.jsx`
- `public/outpost-logo.webp` - referenced in `manifest.webmanifest`

#### Orphaned Component Islands

| Directory | File | Evidence | Risk |
| :--- | :--- | :--- | :--- |
| `outpost/VHELPER_BRIDGE/` | `outpostBridge.js` | Not compiled into the Outpost bundle. Not imported by any `src/` file. Not referenced in `vite.config.js`, `wrangler.jsonc`, or `worker.js`. A standalone Chrome extension bridge module stored in the wrong repository. | Medium - Retain or relocate to VHelper extension repo |

#### Legacy / Junk Files

| Path | Type | Evidence | Risk |
| :--- | :--- | :--- | :--- |
| `outpost/docs/` | Empty directory | `amazon-fetch-fix-plan.md` was deleted in the prior audit; the `docs/` directory shell remains with zero contents. | Low |
| `outpost/VHELPER_BRIDGE/` | Orphaned directory | Contains only `outpostBridge.js` (see above). Entire directory disconnected from Outpost build. | Medium |

#### Unused NPM Dependencies - **HIGHEST IMPACT FINDING**

| Package | Declared In | Evidence | Approx. Cost | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `recharts` | `outpost/package.json` (line 19) | Zero `import` statements referencing `recharts` found anywhere in `outpost/src/`. `recharts` IS actively used in `finance/src/components/DashboardView.jsx`, but finance and outpost are separate apps with separate `package.json` files. The outpost copy sits unused in `outpost/node_modules`. | ~450KB+ in node_modules | Low (Vite tree-shaking would exclude it from the bundle, but it wastes install time and disk) |

**Verification:** `grep -r "recharts" outpost/src/` - zero results.

---

### 2.4 `wayfinder/` - Status: 1 Dead File

Full component graph verified active. All 19 top-level components, 10 city sub-components, 3 contexts, 2 utils, 1 hook, all 6 wayfinder API handlers, and all 7 auth API handlers are wired.

All 161 Poland-2026 POI images verified against `cityImages.js` - 100% active:

| Folder | Count | Folder | Count |
| :--- | :---: | :--- | :---: |
| `gdansk/attractions/` | 12 | `poznan/food/` | 11 |
| `gdansk/food/` | 11 | `poznan/markets/` | 4 |
| `gdansk/markets/` | 4 | `torun/attractions/` | 8 |
| `general/markets/` | 1 | `torun/food/` | 4 |
| `krakow/attractions/` | 14 | `torun/markets/` | 3 |
| `krakow/food/` | 34 | `wroclaw/attractions/` | 11 |
| `krakow/markets/` | 4 | `wroclaw/food/` | 26 |
| `poznan/attractions/` | 11 | `wroclaw/markets/` | 3 |
| **TOTAL** | | | **161** |

`src/assets/` verified:
- `poland-map-route-clean.png` - imported in `PolandLanding.jsx` - ACTIVE
- `wayfinder-header-banner-new.png` - imported in `Layout.jsx` (line 7) - ACTIVE

#### Dead Utilities / Unused Exports

| File | Symbol | Evidence | Risk |
| :--- | :--- | :--- | :--- |
| `wayfinder/src/data/schema.js` | `citySchema` (entire file, 32 lines) | Developer reference template describing the target data shape for `poland-2026.js`. Exports `citySchema` constant but zero imports found across all of `wayfinder/src/`. The actual data lives in the 289KB `poland-2026.js`. This file has no runtime role. | Low |

---

### 2.5 `bigworm/` - Status: CLEAN

All 26 source files remain 100% active and wired. Zero orphan files.

---

### 2.6 `workspace root/` - Status: 3 Items

#### Legacy / Junk Files

| File | Type | Evidence | Risk |
| :--- | :--- | :--- | :--- |
| `TECHTREKGT_ORPHAN_AUDIT_PLAN.md` | Historical audit doc | All 40 items it documented have been resolved. Now a historical artifact superseded by this document. Zero runtime references. | Low |
| `ANTIGRAVITY_COACH_INDEX.md` | Stale index doc (UPDATE not DELETE) | Line 31 references deleted `finance/ARCHITECTURE.md`. Line 41 references deleted `wayfinder/ARCHITECTURE.md`. Both links are broken. The correct action is to update these two lines to point to the root `ARCHITECTURE.md`. | Low |
| `.tmp.driveupload/` | Empty temp directory | Confirmed empty (zero files). Likely created by Google Drive sync during a file upload. No runtime role. | Low |

---

## 3. CROSS-CUTTING ANALYSIS RESULTS

### 3.1 Orphaned Island Verification

| App | Entry Path Traced | Island Found? |
| :--- | :--- | :--- |
| `landing/` | `index.html` -> `style.css` | No |
| `finance/` | `main.jsx` -> `App.jsx` -> 15 components -> 8 utils -> 4 contexts -> `worker.js` -> 8 API handlers | No |
| `outpost/` | `main.jsx` -> `App.jsx` -> 16 components -> 11 utils -> 2 contexts -> `worker.js` -> 29 API handler imports | **Yes: `VHELPER_BRIDGE/outpostBridge.js`** |
| `wayfinder/` | `main.jsx` -> `App.jsx` -> 19 components -> 10 city sub-components -> 3 contexts -> 2 utils -> 1 hook -> `worker.js` -> 13 API handlers | No |
| `bigworm/` | `main.jsx` -> `App.jsx` -> 2 components -> 1 context -> 1 util -> `worker.js` -> 3 API handlers | No |

### 3.2 NPM Dependency Audit Summary

| App | Package | Status |
| :--- | :--- | :--- |
| `finance` | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | ACTIVE - used in `LedgerView.jsx`, `DashboardView.jsx` |
| `finance` | `recharts` | ACTIVE - `DashboardView.jsx` |
| `finance` | `xlsx` | ACTIVE - `importer.js`, `spreadsheetParser.js`, `SpreadsheetImporter.jsx`, `SettingsView.jsx`, `SettingsModal.jsx` |
| `outpost` | `pdfjs-dist` | ACTIVE - `pdfInvoiceParser.js` (dynamic import) |
| `outpost` | `xlsx` | ACTIVE - `spreadsheetParser.js` (dynamic import) |
| `outpost` | **`recharts`** | **UNUSED - zero imports in `outpost/src/`** |
| `wayfinder` | `lucide-react` | ACTIVE - multiple components |

### 3.3 Dead Export Summary

| File | Dead Export | Consumers Found |
| :--- | :--- | :--- |
| `finance/src/utils/importer.js` | `mergePeople()` (line 641) | 0 |
| `wayfinder/src/data/schema.js` | `citySchema` (entire file) | 0 |

---

## 4. CONSOLIDATED REMOVAL CANDIDATE TABLE

| # | File / Symbol | Category | Sub-App | Est. Size | Risk | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `outpost/package.json` -> `recharts` entry | Unused NPM Dep | `outpost/` | ~450KB node_modules | Low | **HIGH** |
| 2 | `outpost/VHELPER_BRIDGE/outpostBridge.js` | Orphaned Island | `outpost/` | ~4.1 KB | Medium | Medium |
| 3 | `outpost/VHELPER_BRIDGE/` (dir) | Orphaned Island | `outpost/` | ~4.1 KB | Medium | Medium |
| 4 | `wayfinder/src/data/schema.js` | Dead File | `wayfinder/` | ~1.3 KB | Low | Medium |
| 5 | `mergePeople()` in `finance/src/utils/importer.js` | Dead Export | `finance/` | ~12 lines | Low | Low |
| 6 | `outpost/docs/` (empty dir) | Legacy/Junk | `outpost/` | 0 bytes | Low | Low |
| 7 | `finance/scratch/` (empty dir) | Legacy/Junk | `finance/` | 0 bytes | Low | Low |
| 8 | `.tmp.driveupload/` (empty dir) | Legacy/Junk | root | 0 bytes | Low | Low |
| 9 | `TECHTREKGT_ORPHAN_AUDIT_PLAN.md` | Stale Doc | root | ~14.6 KB | Low | Low |
| 10 | `ANTIGRAVITY_COACH_INDEX.md` lines 31+41 | **UPDATE links only** | root | N/A | Low | Low |

---

## 5. PHASED EXECUTION PLAN

> SAFETY DIRECTIVE ACTIVE - SEE SECTION 6

### Phase 1 - Unused NPM Dependency (High Priority)
1. Remove `recharts` from `outpost/package.json` dependencies.
2. Run `npm install` in `outpost/` to update `package-lock.json`.
3. Run `npm run build` in `outpost/` - verify zero errors.

### Phase 2 - Orphaned Island Removal
1. Remove `outpost/VHELPER_BRIDGE/` directory (or relocate `outpostBridge.js` to VHelper extension repo).
2. Remove empty `outpost/docs/` directory.

### Phase 3 - Dead File Removal
1. Delete `wayfinder/src/data/schema.js`.
2. Run `npm run build` in `wayfinder/` - verify zero import errors.

### Phase 4 - Dead Export Pruning (Optional)
1. Delete the `mergePeople()` function block (lines 641-651) from `finance/src/utils/importer.js`.
2. Run `npm run build` in `finance/` - verify zero errors.

### Phase 5 - Empty Directories and Stale Docs
1. Delete `finance/scratch/` (empty directory).
2. Delete `.tmp.driveupload/` (empty temp directory).
3. Delete `TECHTREKGT_ORPHAN_AUDIT_PLAN.md` (superseded by this document).
4. Update `ANTIGRAVITY_COACH_INDEX.md` lines 31 and 41: replace broken links to deleted per-app `ARCHITECTURE.md` files with a link to the root `ARCHITECTURE.md`.

### Phase 6 - Full Build Verification
```powershell
cd E:\TechTrekGT\finance;   npm run build
cd E:\TechTrekGT\outpost;   npm run build
cd E:\TechTrekGT\wayfinder; npm run build
cd E:\TechTrekGT\bigworm;   npm run build
# landing/ - static only, no build step
```

---

## 6. SAFETY GUARDRAIL

> [!CAUTION]
> **ALL EXECUTION IS BLOCKED. THIS IS A READ-ONLY AUDIT DOCUMENT.**
>
> No files, directories, or `package.json` entries have been deleted, moved, renamed, or modified.
>
> File removal and dependency changes are strictly forbidden until the user explicitly responds with:
>
> `"Deep clean approved, proceed with removal"`
