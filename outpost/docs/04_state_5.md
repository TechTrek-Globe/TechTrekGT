# TechTrek Outpost State Registry (v5 Snapshot)

## Multi-Platform Listing Creation & AI State (`LIST-003`)

- **Shared Registry Module (`e:\TechTrekGT\outpost\src\utils\platformListingRules.js`)**: Pure JavaScript ESM module imported by frontend components/generators (`src/utils/listingCopyGenerator.js`, `src/components/ListingCopyModal.jsx`) and Worker modules (`src/worker.js`, `functions/api/ai/generate-ebay-details.js`). Cert verification routing in `src/utils/certLookup.js` resolves Beckett (BGS/BAS) to `https://www.beckett-authentication.com/get-data/${certNumber}`.
- **Worker AI Handler (`e:\TechTrekGT\outpost\functions\api\ai\generate-ebay-details.js`)**:
  - Keeps Gemini `gemini-3.5-flash-lite` (10s timeout) primary + `gemini-3.5-flash` (15s timeout) fallback via `fetchWithTimeout` and `x-goog-api-key`.
  - Adds `generateAiPlatformListing(env, itemData)` and `mode: 'platform_listing'` handling inside `onRequestPost` (`POST /api/ai/generate-ebay-details`), preserving the exact 85-route manifest in `src/worker.js`.
  - Re-enforces deterministic `pricing_guidance`, `logistics` / `shipping_profile`, `sanitizeNoEmDash`, and Facebook `brand: null` invariants on top of Gemini JSON output before running `validatePlatformPayload`.
- **Frontend State (`e:\TechTrekGT\outpost\src\components\ListingCopyModal.jsx` & `src\utils\auctionApi.js`)**:
  - `generateAiPlatformListingApi(payload)` calls `POST /api/ai/generate-ebay-details` with `mode: 'platform_listing'` via `apiFetch`.
  - Modal state tracks `athlete`, `teamOrBand`, `sportOrGenre`, `authenticator`, `certNumber`, `inscription`, `size`, `isWearable`, `isCustomJersey`, `isPickguardSignedGuitar`, `targetNet`, `aiPlatformPayloads`, `generatingPlatformAi`, and `platformAiMsg` (reset inside `finally {}`, non-blocking alert banners).
  - Amber Tactical 5-platform tab bar (`ebay`, `facebook`, `mercari`, `whatnot`, `reverb`) surfaces live UTF-16 character counts, Pre-Publish Validation Gate pass/fail checks, fee-adjusted pricing guidance (`tabular-nums`), 4-photo sequence, and one-click JSON export.
