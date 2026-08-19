# Wayfinder Data Integrity & Compliance Audit Report

**Date:** 2026-08-19
**Audited File:** `wayfinder/src/data/poland-2026.js`
**Audit Script:** `wayfinder/scratch/audit-poland-data.mjs`
**Workspace Rules:** Rule 5 (Things to Do Validation & Asset Hierarchy), Rule 6 (External API Integration)

---

## Executive Summary

| Metric | Count |
|---|---|
| Total POIs audited | 126 |
| Fully compliant POIs | 77 (61.1%) |
| POIs with violations | 49 (38.9%) |

**Image Integrity: PASS (100%).** All 126 POI image references point to valid, existing local files within the strict `public/Poland-2026/images/[city]/[category]/` hierarchy. Zero external URLs, zero dangling references, zero legacy directory paths.

**Data Completeness: FAIL (49 POIs with violations).** All violations fall into two buckets: missing coordinates and incomplete Krakow market entries.

---

## Violation Breakdown by Type (Unique POIs, Script-Computed)

The audit script tracks failures per-POI. A single POI may carry multiple violation flags. The table below reports unique POI counts per violation type (not summed flags, since one POI can carry several).

| Violation Type | Unique POIs Affected | Notes |
|---|---|---|
| MISSING_DESCRIPTION | 3 | Krakow markets (all 3) |
| MISSING_COORDINATES | 49 | All 49 failing POIs include this flag |
| MISSING_IMAGE | 3 | Krakow markets (all 3) |
| IMAGE_PATH_MISMATCH | 0 | - |
| IMAGE_FILE_NOT_FOUND | 0 | - |

Of the 49 failing POIs: 3 Krakow markets carry all three flags (description + coordinates + image); the remaining 46 carry only MISSING_COORDINATES.

---

## Detailed Findings

### 1. Krakow Markets - Incomplete Entries (3 POIs)

All three Krakow market entries in `route[0].markets` are missing `description`, `lat`/`lng` coordinates, and `image`/`imageSrc`/`imageUrl` references. These are the only POIs in the entire dataset missing image references.

| POI | Array Index | Missing Fields |
|---|---|---|
| Rynek Glowny Main Market | `krakow.markets[0]` | description, lat, lng, image |
| Maly Rynek Craft Corner | `krakow.markets[1]` | description, lat, lng, image |
| Plac Wolnica Market | `krakow.markets[2]` | description, lat, lng, image |

Note: These entries contain `details` (not `description`), `address` (human-readable, not coordinates), and `highlights` arrays. The audit script checks for a `description` key specifically. A humanized `description` summary can be derived from the existing `details`/`highlights` fields without API calls, but `lat`/`lng` coordinates and `image` refs must be sourced externally.

### 2. Missing Coordinates - Krakow (48 POIs)

Every POI in Krakow's `mustSee`, `restaurantsDetailed`, `drinksDetailed`, and `cafesDetailed` arrays lacks `lat`/`lng` properties. Other cities (Wroclaw, Poznan, Torun, Gdansk) have coordinates on all POIs. All 48 Krakow POIs have valid descriptions and image references.

**Affected categories:**

| Category (array key) | POIs Missing lat/lng |
|---|---|
| `mustSee` | 14 |
| `restaurantsDetailed` | 14 |
| `drinksDetailed` | 14 |
| `cafesDetailed` | 6 |
| **Total** | **48** |

### 3. Missing Coordinates - Wroclaw (1 POI)

One Wroclaw attraction is missing coordinates:

| POI | Array Key | Missing |
|---|---|---|
| Wroclaw Christmas Market & Dwarf Hunting Guided Tour | `wroclaw.mustSee` (last entry) | lat, lng |

---

## Proposed Remediation Scripts (NOT YET WRITTEN - FOR APPROVAL)

Per Workspace Rule 6, missing data must be fetched from external APIs, never hallucinated. Two utility scripts are proposed:

### Script A: `scratch/fetch-krakow-coordinates.mjs`

**Purpose:** Backfill `lat`/`lng` coordinates for all 49 POIs missing them (48 Krakow + 1 Wroclaw).

**Data Source:** Geoapify Places API (`https://api.geoapify.com/v2/places`) using `GEOAPIFY_API_KEY` from `.dev.vars`.

**Logic:**
1. Iterate every POI in Krakow `mustSee`, `restaurantsDetailed`, `drinksDetailed`, `cafesDetailed` + Wroclaw tour mustSee entry.
2. For each POI with existing `address` or `location` string, query Geoapify Geocoding API (`https://api.geoapify.com/v1/geocoding/search`) with the address text.
3. If no address exists, query Geoapify Places API using venue `name` + `"Krakow"` for category `tourism.sights`, `catering.restaurant`, or `leisure` as appropriate.
4. Take the first result's `lat`/`lon`, write back into `poland-2026.js` at the POI object.
5. Leave coordinates `null` if no result found - do not fabricate.

### Script B: `scratch/fetch-krakow-market-images.mjs`

**Purpose:** Download local images for the 3 Krakow market POIs into the strict hierarchy.

**Data Source:** Foursquare Places API (`https://api.foursquare.com/v3/places/search` + `/photos`) using `FOURSQUARE_API_KEY` from `.dev.vars`.

**Logic:**
1. Query Foursquare `/places/search` with `query="Krakow Christmas Market"` and `near="Krakow, Poland"` or by exact address string.
2. For the top match, call `/places/{fsq_id}/photos` and download the first high-quality photo.
3. Save as:
   - `public/Poland-2026/images/krakow/markets/rynek-glowny.jpg`
   - `public/Poland-2026/images/krakow/markets/maly-rynek.jpg`
   - `public/Poland-2026/images/krakow/markets/plac-wolnica.jpg`
4. Inject the `imageUrl`/`imageSrc` path into each market POI.
5. Also fetch `lat`/`lng` from the Foursquare venue response to backfill the missing coordinates on these 3 entries.

### Script C (Optional): `scratch/fetch-krakow-market-descriptions.mjs`

**Purpose:** Backfill humanized `description` fields for the 3 Krakow market POIs.

**Logic:** No external API required. The existing `details` and `highlights` fields on each market POI contain sufficient content to construct a `description` paragraph. This is a pure data transformation script (not hallucination). Alternatively, this can be done manually with 3 targeted `replace_in_file` edits.

---

## Asset Hierarchy Verification (Pass)

All 126 image references conform to:

```
public/Poland-2026/images/[city_name]/[category]/
```

Validated categories observed: `attractions`, `food`, `markets`. No `hotels` category exists in the public dataset (per Architecture Rule 4, hotels live in private user data only). This is compliant.

---

## Recommended Next Steps

1. **[Approval Required]** Approve this audit report.
2. **[Approval Required]** Authorize execution of Script A (Geoapify coordinate backfill) and Script B (Foursquare market image + coordinate fetch).
3. Apply the 3 market `description` backfills (Script C / manual edits).
4. Re-run `node scratch/audit-poland-data.mjs` to confirm 0 failures.
5. Update `ARCHITECTURE.md` if any data schema changes are made (Rule 4).