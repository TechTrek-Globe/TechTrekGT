# Outpost Multi-Platform Listing Creation & Rules Engine Plan

## 1. Objective & Scope

Upgrade the TechTrek Outpost Listing Creation feature (`ListingCopyModal.jsx`, `listingCopyGenerator.js`, `functions/api/ai/generate-ebay-details.js`, and `src/worker.js`) so that selecting any of the 5 supported marketplaces (`ebay`, `facebook`, `mercari`, `whatnot`, `reverb`) dynamically routes, applies, and validates that platform's exact title rules, character budgets, wearable size tokens, category emojis, description architecture (semantic HTML vs. plain text), fee-adjusted pricing math, meetup/shipping logistics, and pre-publish policy guardrails.

### Architectural & Governance Constraints
- **Pure JavaScript (ESM / JSX)**: React 19, Vite 6, Tailwind CSS 3.4, Cloudflare Workers ESM (`src/worker.js`). Strictly zero TypeScript.
- **Custom SPA Routing**: Scoped to `/outpost/` via `window.history.pushState`.
- **Amber Tactical Design System**: Uses `--color-brand-*` RGB tokens, `.glass-card`, and `tabular-nums`.
- **AUDIT-001 through AUDIT-004 Compliance**:
  - Positional `?` bindings on all D1 SQLite queries (`outpost-db` / `personal-budget-db`).
  - Strict 15-second `AbortSignal.timeout(15000)` (via `fetchWithTimeout` / `getTimeoutSignal`) on all outbound AI and external API calls.
  - Client `apiFetch` (`src/utils/auctionApi.js`) throws on `{ success: false }`, resets loading flags in `finally {}` blocks, and renders non-blocking inline UI alert banners instead of `alert()`.
- **Strict Punctuation Invariant**: Zero em dashes or en dashes anywhere in code comments, UI copy, or AI prompt templates. Use standard hyphens (`-`), colons (`:`), or parentheses (`()`) exclusively.
- **Client Bundle Integrity (`tests/client-bundle-integrity.test.js`)**: Every file under `src/` must reference only declared bindings or standard globals in the test allowlist (use `globalThis.Intl` or pure JS math rather than bare `Intl`).
- **Route Table Invariant (`tests/t05-route-table-shadowing.test.js`)**: Preserve the 85-route manifest in `src/worker.js` by extending `POST /api/ai/generate-ebay-details` to support multi-platform structured JSON generation alongside legacy eBay HTML middle-card generation, and exporting the platform rules registry from `src/worker.js`.

---

## 2. File-by-File Implementation Specification (To Execute After User Approval)

### Step 1: Modular Platform Rules Registry (`src/utils/platformListingRules.js`)

Create `e:/TechTrekGT/outpost/src/utils/platformListingRules.js` as a pure ESM module shared by both the frontend UI (`src/components/ListingCopyModal.jsx`, `src/utils/listingCopyGenerator.js`) and the Cloudflare Worker backend (`src/worker.js`, `functions/api/ai/generate-ebay-details.js`).

#### 1.1 Constants & Lookup Tables
- `SUPPORTED_PLATFORMS`: `['ebay', 'facebook', 'mercari', 'whatnot', 'reverb']`
- `HARD_EMOJI_BLOCKLIST`: `['🔥', '🚨', '⭐', '🌟', '👀', '✅', '💯', '💥', '⚡', '💎', '👑', '🏆', '💰', '❗', '‼️']`
- `BANNED_HYPE_WORDS`: `['LOOK', 'WOW', 'RARE', 'HTF', 'MUST SEE', 'MINT', 'NICE', 'GREAT GIFT', 'INVEST', 'NR', 'NO LOWBALLS']`
- `ALLOWED_UPPERCASE_ACRONYMS`: `['JSA', 'PSA', 'DNA', 'BAS', 'COA', 'LOA', 'HOF', 'MVP', 'OML', 'ONL', 'MLB', 'NFL', 'NBA', 'NHL', 'NCAA', 'UGA', 'SWAU', 'CD', 'LP', 'EP', 'DVD', 'TV', 'VIP', 'OEM', 'USA', 'NASA', 'BGS', 'UDA', 'BAM', 'F1', 'WWE', 'UFC', 'MMA', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'II', 'III', 'IV', 'JR', 'SR']`
- `APPROVED_AUTHENTICATORS`: `['PSA/DNA', 'PSA', 'JSA', 'Beckett', 'Beckett/BAS', 'BAS', 'Fanatics', 'Steiner', 'Upper Deck', 'UDA', 'Tristar', 'MLB Authenticated', 'NFL Authenticated', 'NBA Authenticated', 'Schwartz', 'SWAU', 'B.A.M.']`
- `BANNED_COA_ISSUERS`: `['ACE Authentic', "Coach's Corner", 'Christopher L. Morales', 'CSC Collectibles', 'Donald Frangipani', 'Forensic Document Services', 'Hollywood Dreams', 'InPerson Authentics', 'J. DiMaggio Co.', 'Legends Sports Memorabilia', "Nathan's Autographs", 'Nicholas Burczyk', 'Pro Sports Memorabilia', 'Rare and Signed', 'Robert Prouty', "R.R.'s Sports Cards", 'SCAA', 'Slamdunk Sportscards', 'Sports Alley', 'Sports Management Group', "Stan's Sports", 'TTA/STAT Authentic', 'Universal Memorabilia', 'USA Authentics', 'Operation Bullpen']`
- `PROTECTED_JERSEY_BRANDS`: `['Nike', 'Adidas', 'Mitchell & Ness', 'Reebok', 'Fanatics', 'Authentic', 'Official', 'NFL', 'MLB', 'NBA', 'NHL', 'NCAA']`
- `PROTECTED_GUITAR_BRANDS`: `['Fender', 'Gibson', 'Martin', 'Taylor', 'Epiphone']`
- `VALID_WEARABLE_SIZES`: `['S', 'M', 'L', 'XL', '2XL', '3XL', '48', '50', '52', '54', '56']`
- `CATEGORY_EMOJI_LOOKUP`:
  - Sports: Football `🏈`, Baseball/Softball `⚾`, Basketball `🏀`, Hockey `🏒`, Golf `⛳`, Soccer `⚽`, Tennis/Pickleball `🎾`, Boxing/MMA/UFC `🥊`, Wrestling/WWE `🤼`, Racing/NASCAR/F1 `🏁`, Olympics/Track & Field `🏅`
  - Music & Entertainment: Guitars/Basses/Pickguards/Rock/Country `🎸`, Vocals/Live Performers `🎤`, CDs/Vinyl/Sheet Music/General Music `🎵`, Drumheads/Drummers `🥁`, Keys/Pianists `🎹`, Movies/TV/Hollywood/Scripts/Soundtracks `🎬`, Comics/Superheroes/Art `🦸` / `🎨`, Gaming/Esports `🎮`, Books/Authors/Historical `📚` / `✒️`, Space/NASA `🚀`, Politics/Presidents `🇺🇸`
  - Controlled Fallback Leeway: `['🎺', '🎷', '🎻', '🎱', '🎳', '🎭', '🛠️', '🏡']`

#### 1.2 Core Rules Functions
1. `computeUtf16Length(str)`: Returns `String(str || '').length` (UTF-16 code units, matching eBay/Mercari 80-char UTF-16 evaluation where surrogate-pair emojis count as 2 units).
2. `resolveCategoryEmoji(itemData, platform)`:
   - Evaluates sport/genre, category, item type, and title keywords.
   - For `reverb`, prioritizes the Music-Focused Lookup (`🎸`, `🎤`, `🎵`, `🥁`, `🎹`, `🎬`, or literal instrument `🎺`, `🎷`, `🎻`).
   - Guarantees the returned emoji is a single literal category/subject emoji and never in `HARD_EMOJI_BLOCKLIST`.
3. `isWearableItem(itemData)`:
   - Detects whether the base item is wearable apparel/jersey/shirt/hoodie/jacket vs. non-wearable (baseball, football, basketball, puck, helmet, mini helmet, photo, card, guitar, pickguard, drumhead, CD, vinyl, book, bat, pylon).
4. `resolveWearableSize(itemData, platform)`:
   - Completely independent of the emoji rule.
   - Returns standalone size token (`S`, `M`, `L`, `XL`, `2XL`, `3XL`, `48`, `52`) ONLY when `isWearableItem(itemData)` is true.
   - Strips forbidden prefixes (`Size:`, `Size`, `Sz:`, `Sz`).
   - Returns `null` for all non-wearables (guitars, pickguards, drumheads, balls, helmets, photos, CDs, flat items).
5. `buildPlatformTitle(platform, itemData, options)`:
   - Enforces the strict Left-to-Right Slot Order:
     - `reverb`: `[1. Artist/Band/Signer Full Name] [2. Auth Verb ('Signed' preferred)] [3. Signed Component & Base Item (e.g. 'Signed Pickguard on 38" Acoustic Guitar')] [4. Conditional Wearable Size] [5. Conditional Inscription/Tour/Album] [6. Authenticator + Type] [7. Single Category Emoji]`
     - `ebay`, `facebook`, `mercari`, `whatnot`: `[1. Full Name of Signer] [2. Auth Verb ('Signed' preferred)] [3. Team/School/Band/Franchise] [4. Base Item Type & Variant] [5. Conditional Wearable Size] [6. Conditional Milestone/Inscription] [7. Authenticator + Type] [8. Single Category Emoji]`
   - Reserves final 3+ UTF-16 code units (`1 space + 1 emoji`) so text before emoji never exceeds `77` UTF-16 units (`75` if emoji is 4 UTF-16 units), keeping total `computeUtf16Length(title) <= 80`.
   - Strips banned hype words, punctuation spam (`*`, `!`, `?`, `~`, `@`, `#`, `$`, `|`, `/`), and spoofed brands on custom jerseys or unbranded display guitars.
   - Front-loads core identity within the first `48-60` characters.
6. `buildFacebookRelistTitle(itemData, options)`:
   - Generates `relist_title` (`<= 80` UTF-16 chars) obeying all Facebook title rules while varying phrasing (`Signed` <-> `Autographed` or swapping Team and Base Item Type order) for 14-day duplicate-filter refresh.
7. `computePlatformPricing(platform, targetNetInput, itemData)`:
   - Resolves `targetNet` from `options.targetNet` or item's `current_list_price || suggested_list_price || min_sell_price || unit_price || 100`.
   - Applies exact platform formulas:
     - `reverb`:
       - `suggested_list_price = Math.ceil(((targetNet + 0.49) / 0.9181) * 1.12)`
       - `minimum_acceptable_offer = Math.ceil((targetNet + 0.49) / 0.9181)`
       - `accept_offers = true`
     - `whatnot`:
       - `buy_it_now_price = Math.ceil(((targetNet + 0.30) / 0.891) * 1.12)`
       - `minimum_offer_auto_accept = Math.ceil((targetNet + 0.30) / 0.891)`
       - `auction_start_price = Math.ceil((targetNet + 0.30) / 0.891)`
     - `mercari`:
       - `suggested_list_price = Math.ceil(targetNet * 1.18)` (15-20% buffer for Mercari Smart Offers/Promote)
       - `minimum_acceptable_price = Math.ceil(targetNet)`
     - `facebook`:
       - `suggested_list_price = Math.ceil(targetNet * 1.15)` (15% haggling buffer)
       - `minimum_acceptable_price = Math.ceil(targetNet)`
     - `ebay`:
       - Computes fee-adjusted list price and floor using Outpost's eBay FVF (`13.6% + $0.40`) + offer buffer (`1.12`).
8. `resolvePlatformLogistics(platform, itemData)`:
   - `facebook`:
     - Determines `risk_tier`: `'High-Value Autographed'` (when autographed, certified, or `targetNet >= 150`) vs `'Standard Lower-Risk'`.
     - Routes `meetup_location`: `'Local Police Precinct lot or QuikTrip (QT) Safe Place lot'` for Tier 1; `'Mason Mill Park'` for Tier 2.
     - Sets `accepted_local_payments: ['Cash', 'Apple Pay']` and `shipping_enabled: true`.
   - `whatnot`:
     - Maps item type to `estimated_packed_weight`: `'8-12 oz'` (photos/CDs/cards), `'1-2 lbs'` (baseballs in UV cubes / jerseys), `'3-5 lbs'` (mini helmets / footballs), `'8-12 lbs'` (acoustic display guitars), with matching `packaging_method`.
   - `reverb`:
     - Returns `{ box_dimensions_note: 'Double-boxed with 2 inches of padding on all sides (kept under 48 inches length to avoid oversize carrier surcharges) and neck/headstock support', handling_days: 3 }`.
   - `mercari`:
     - Shipping-only via Mercari Prepaid Labels or Self-Ship; zero local meetup.
   - `ebay`:
     - Protective packaging (UV display cube, poly-bagged sturdy box, or double-boxed with corner protection).
9. `buildPlatformPayload(platform, itemData, options)`:
   - Produces the complete platform-specific JSON object matching the exact output schema in the 5 attached `.md` specifications:
     - `ebay`: `{ title, ebay_char_count, category_path, item_specifics, description_html, recommended_photo_order, pricing_guidance, validation_passed }`
     - `facebook`: `{ title, relist_title, char_count, marketplace_category, condition, brand, size, logistics, pricing_guidance, product_tags, description_plain_text, recommended_photo_order, validation_passed }`
     - `mercari`: `{ title, title_char_count, category_path, condition, brand, size, pricing_guidance, hashtags, description_plain_text, recommended_photo_order, validation_passed }`
     - `whatnot`: `{ title, title_char_count, whatnot_category, listing_format_recommendation, condition, size, shipping_profile, pricing_guidance, description_plain_text, recommended_photo_order, validation_passed }`
     - `reverb`: `{ title, title_char_count, reverb_category, brand, model, finish, condition, size, shipping_profile, pricing_guidance, description_html, recommended_photo_order, validation_passed }`
10. `validatePlatformPayload(platform, payload, itemData)`:
    - Runs all platform-specific Pre-Publish Validation Gate checks and returns `{ passed: boolean, checks: Array<{ id, label, passed, detail }>, errors: string[], warnings: string[] }`.
11. `buildPlatformSystemPrompt(platform)` & `buildPlatformResponseSchema(platform)`:
    - Returns the complete system prompt and JSON schema for each of the 5 platforms (with zero em dashes).

---

### Step 2: Update `src/utils/listingCopyGenerator.js`

- Import the platform rules engine from `./platformListingRules.js` and re-export its helpers.
- Add `generateReverbCopy(item, options)` and `generatePlatformListing(platform, item, options)`.
- Enhance `generateEbayCopy`, `generateFacebookCopy`, `generateMercariCopy`, and `generateWhatnotCopy`:
  - When `options.enforcePlatformRules` is enabled (used by `ListingCopyModal.jsx` and `generatePlatformListing`), apply the strict 80-char UTF-16 slot-ordered title, conditional wearable Size token, mandatory trailing category emoji, 4-block/5-block HTML or plain-text description architecture, fee formulas, logistics, tags/hashtags, and validation gate.
  - Preserve default legacy return properties when `options.enforcePlatformRules` is omitted so existing unit tests (`tests/ai-ebay-template.test.js` and `tests/blueprint-b-channel-routing-intelligence.test.js`) pass without modification.

---

### Step 3: Wire Platform Rules into Worker AI Endpoint (`functions/api/ai/generate-ebay-details.js` & `src/worker.js`)

1. **`functions/api/ai/generate-ebay-details.js`**:
   - Import `PLATFORM_RULES_REGISTRY`, `getPlatformRules`, `buildPlatformSystemPrompt`, `buildPlatformPayload`, `validatePlatformPayload`, and `computeUtf16Length` from `../../../src/utils/platformListingRules.js`.
   - Export `generateAiPlatformListing(env, itemData)`:
     - Validates `platform` (`ebay`, `facebook`, `mercari`, `whatnot`, `reverb`).
     - Builds the platform-specific system instruction via `buildPlatformSystemPrompt(platform)` and user prompt with internal tracking notes stripped (`stripInternalTrackingNotes`).
     - Calls Google Gemini API (`gemini-3.5-flash-lite` primary with 10s timeout, `gemini-3.5-flash` fallback with 15s timeout) via `fetchWithTimeout` (enforcing `AbortSignal.timeout(15000)` per AUDIT-003) and `x-goog-api-key` header.
     - Parses the JSON response, sanitizes HTML fields via `sanitizeListingHtml`, strips em dashes (`replace(/[\u2014\u2013]/g, '-')`), merges with deterministic fallback fields from `buildPlatformPayload`, and executes `validatePlatformPayload`.
   - In `onRequestPost(context)`:
     - If `body.mode === 'platform_listing'` or `body.platform` is provided with `body.responseFormat === 'json'`, invoke `generateAiPlatformListing(env, body)` and return `ok({ success: true, platform, payload, validation, html: payload.description_html || '' })`.
     - Otherwise, execute existing `generateAiListingDetails(env, body)` so existing eBay middle-section AI calls and tests remain 100% compatible.
2. **`src/worker.js`**:
   - Import and re-export `PLATFORM_RULES_REGISTRY`, `getPlatformRules`, and `validatePlatformPayload` from `./utils/platformListingRules.js` so the Worker entrypoint directly exposes the rules registry while keeping `ROUTES.length === 85`.
3. **`src/utils/auctionApi.js`**:
   - Add `generateAiPlatformListingApi(payload)` calling `apiFetch('/api/ai/generate-ebay-details', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ ...payload, mode: 'platform_listing' }) })`.

---

### Step 4: Upgrade Listing Creation UI (`src/components/ListingCopyModal.jsx`)

Update `ListingCopyModal.jsx` using the Amber Tactical Design System (`--color-brand-*`, `.glass-card`, `tabular-nums`, zero `alert()` calls, `finally {}` state cleanup):

1. **Platform Selector Bar (`ebay`, `facebook`, `mercari`, `whatnot`, `reverb`)**:
   - Replace the old `social` tab with `reverb` (`Reverb (Music & Gear)`) and keep `ebay`, `facebook`, `mercari`, and `whatnot` in the primary 5-platform selector bar.
   - Display live UTF-16 character badge (`XX/80 UTF-16`) and validation status dot (`Passed` emerald vs `Review` amber/rose) on the active platform view.
2. **Memorabilia, Wearable Size & Instrument Metadata Controls**:
   - Add dedicated inputs in the collapsible Details Form for:
     - `Athlete / Artist / Signer` (`athlete`)
     - `Team / Band / Franchise` (`teamOrBand`)
     - `Sport / Genre` (`sportOrGenre`)
     - `Authenticator` (`authenticator`, e.g., `JSA`, `Beckett BAS`, `PSA/DNA`, `SWAU`, `Fanatics`) & `Cert #` (`certNumber`)
     - `Inscription / Milestone` (`inscription`, e.g., `"HOF 14"`, `"WS MVP"`)
     - `Item VariantFlags`: `isCustomJersey` (Custom Stitched Jersey), `isPickguardSignedGuitar` (Signed Pickguard on Display Guitar), `isWearable` (Wearable Apparel/Jersey toggle)
     - `Wearable Size` (`size`: `S`, `M`, `L`, `XL`, `2XL`, `3XL`, `48`, `52` - enabled only when `isWearable` is active)
     - `Target Net Payout ($)` (`targetNet`) for live platform fee math calculation
3. **Dynamic Platform Preview, Fee Math, Logistics & Pre-Publish Validation Panel**:
   - **Title Architecture Bar**:
     - Displays the generated 80-char slot-ordered title with UTF-16 character counter (`<= 80`), front-load indicator (first 48-60 chars), independent wearable Size token badge (when wearable), and trailing category emoji badge.
     - On `facebook`, also displays the `relist_title` (`14-Day Refresh Relist Title`) with one-click copy.
   - **Fee-Adjusted Pricing Guidance Card (`tabular-nums`)**:
     - Dynamically renders the active platform's exact fee formula and calculated prices:
       - `eBay`: Suggested List Price, Minimum Floor Price, Item Specifics summary.
       - `Facebook Marketplace`: Suggested List Price (`+15%` negotiation buffer), Minimum Acceptable Price, Risk Tier.
       - `Mercari`: Suggested List Price (`+18%` Smart Offer buffer), Minimum Acceptable Price, Character Counter (`<= 1000` chars), `8-12` Hashtags pill list.
       - `Whatnot`: Buy-It-Now Price (`8% + 2.9% + $0.30` + `12%` offer buffer), Minimum Offer Auto-Accept Floor, Recommended Auction Start Price, Format Recommendation (`Buy It Now` vs `Live Auction`).
       - `Reverb`: Suggested List Price (`5% + 3.19% + $0.49` + `12%` offer buffer), Minimum Acceptable Offer Floor, Brand/Model anti-spoofing readout.
   - **Platform Logistics & Photo Order Card**:
     - `Facebook`: Tiered Meetup Location (`Local Police Precinct lot or QuikTrip (QT) Safe Place lot` vs `Mason Mill Park`), Accepted Local Payments (`Cash`, `Apple Pay`), Shipping Enabled badge.
     - `Whatnot`: Packed Weight Tier (`8-12 oz`, `1-2 lbs`, `3-5 lbs`, `8-12 lbs`) and Collector Packaging Method.
     - `Reverb`: Box Dimensions Note (`< 48"` length, `2"` padding on all sides) and `3-day` handling window.
     - Recommended 4-Photo Order checklist tailored to the selected platform.
   - **Pre-Publish Validation Gate Checklist**:
     - Renders live pass/fail badges for every platform rule (UTF-16 budget `<= 80`, single allowed trailing emoji, independent wearable Size rule, COA & banned issuer gate, zero brand-spoofing on custom jerseys/guitars, zero hype/punctuation spam, HTML vs plain-text compliance, and Mercari `<= 1000` char / zero-URL check).
   - **Gemini AI Platform Optimization Trigger**:
     - Button to invoke `generateAiPlatformListingApi` for the currently selected platform (`ebay`, `facebook`, `mercari`, `whatnot`, `reverb`), updating the preview and JSON schema output with non-blocking status feedback and `finally {}` loading state reset.
   - **Copy Actions**:
     - One-click copy buttons for Title, Relist Title (Facebook), Description (HTML or Plain Text), Tags/Hashtags (Facebook/Mercari), and Full Structured JSON Payload.

---

## 3. Verification, Testing & Deployment Plan (Post-Approval)

1. **Unit & Integration Tests (`e:/TechTrekGT/outpost/tests/platform-listing-rules.test.js`)**:
   - Verify all 5 platforms (`ebay`, `facebook`, `mercari`, `whatnot`, `reverb`) for:
     - `<= 80` UTF-16 character title budget and `<= 77` pre-emoji text cap.
     - Independent wearable `Size` token inclusion on jerseys/apparel and strict omission on baseballs, guitars, pickguards, drumheads, helmets, and photos.
     - Independent mandatory trailing category/instrument emoji and hard rejection of blocklisted emojis (`🔥`, `🚨`, `⭐`, `💯`, etc.).
     - Exact pricing math for Reverb (`ceil((net + 0.49) / 0.9181 * 1.12)`), Whatnot (`ceil((net + 0.30) / 0.891 * 1.12)`), Mercari (`+15-20%`), Facebook (`+15%`), and eBay.
     - Tier 1 (`Police Precinct / QT Safe Place`) vs Tier 2 (`Mason Mill Park`) meetup routing and `Cash` / `Apple Pay` payment rules on Facebook.
     - Brand-spoofing rejection (`Nike`/`NFL` on custom jerseys; `Fender`/`Gibson`/`Martin`/`Taylor` on generic display guitars) and banned COA rejection (`Coach's Corner`, `ACE Authentic`, etc.).
     - Mercari `<= 1000` char plain-text limit, zero URLs, and `8-12` hashtags.
     - Reverb mandatory signed-pickguard disclosure in both title and Block 1 of `description_html`.
     - Zero em dashes across all generated outputs and prompts.
2. **Full Test Suite Execution**:
   - Run `cd e:\TechTrekGT\outpost; npm test` (`node --test tests/*.test.js`) and confirm 100% pass rate including `t05-route-table-shadowing.test.js` and `client-bundle-integrity.test.js`.
3. **Production Build & Cloudflare Deployment**:
   - Run `cd e:\TechTrekGT\outpost; npm run build` and verify zero build or bundle errors.
   - Run `cd e:\TechTrekGT\outpost; npm run deploy` and verify live Cloudflare Worker deployment.
4. **Mandatory Post-Flight Documentation Sync**:
   - Update `e:/TechTrekGT/outpost/docs/03_features.md` and `e:/TechTrekGT/outpost/docs/04_state.md` to document the 5-platform listing rules registry, pricing formulas, validation gates, UI controls, and AI generation schemas.

---

## 4. Re-Plan Triggers

Re-plan if:
- Any existing test in `tests/t05-route-table-shadowing.test.js`, `tests/ai-ebay-template.test.js`, `tests/blueprint-b-channel-routing-intelligence.test.js`, or `tests/client-bundle-integrity.test.js` fails after integration.
- Vite bundle size or chunking in `outpost/vite.config.js` encounters circular dependency warnings between `src/utils/platformListingRules.js` and `src/utils/listingCopyGenerator.js`.
