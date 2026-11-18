# Outpost Tracker: Item Detail Schema Audit & Product-Specific Field Architecture Plan

## 1. Executive Summary

An audit of `e:/TechTrekGT/outpost/` (D1 `outpost-db`, Worker API handlers, item modals, intake forms, grid/card views, and multi-platform listing/eBay publishing engines) revealed three structural issues and high-signal memorabilia domain gaps:

1. **Duplicate & Noisy Inputs in `EditTabDetails.jsx`**:
   - `athlete_person` and `sport_genre` are rendered twice (lines 284-312 and lines 329-366).
   - `authenticator` and `cert_number` are rendered twice (lines 409-443 as plain inputs and lines 607-650 as select/input inside the Auth card).
   - The full 135-line VineScout/Amazon Vine card is duplicated in `EditTabDetails.jsx` (lines 670-805) despite having its own dedicated `EditTabVineScout.jsx` tab.
2. **Active Schema & Persistence Drift Bugs**:
   - **Missing `condition` storage**: `ListingCopyModal.jsx`, `ebayTemplate.js`, `create-listing.js`, and `tokenHelper.js` read `item.condition`, yet `auction_items` has no condition column and `EditTabDetails.jsx` has no condition control. Every 1-click eBay publish silently defaults to eBay ConditionID `1000` (Brand New).
   - **`cert_verified` D1 column drift**: Migration 0010 added `cert_verified` and `cert_verified_at` fast-path columns to `auction_items`, and `GET /api/items/enriched` reads those columns first, but `PUT /api/items/:id` only writes them into `attributes` JSON and omits them from the SQL `UPDATE auction_items` statement.
   - **Fragmented Category & Authenticator Registries**: Four separate hardcoded lists exist across `EditItemModal.jsx` (missing `Guitar`, `Pickguard`, `CD / Vinyl`, `Album Flat`, `Mini Helmet`, `Drumhead`), `AddInvoiceModal.jsx`, `userSettings.js`, and `certLookup.js` (missing `B.A.M.`, `SWAU`, `Schwartz`, `MLB/NFL/NBA Authenticated` that `platformListingRules.js` already approves).
3. **High-Signal Memorabilia Domain Gaps**:
   - No structured fields for **condition & buyer-facing flaw notes** (distinct from internal warehouse/lot notes), **authentication tier (`auth_type`)**, **prep/framing workflow status**, **sourcing vendor / lot provenance**, **physical storage bin**, or **category-specific valuation attributes** (e.g., baseball sweet-spot/ink color, jersey construction style, guitar signed surface, CD/vinyl disc inclusion, photo/frame dimensions, trading card set/grade).

This plan introduces a lean, zero-fluff, category-aware Item Detail architecture backed by D1 Migration `0014_item_detail_fields.sql`, allowlisted `attributes` JSON keys (`CLIENT_SETTABLE_ATTR_KEYS`), deduplicated conditional UI in `EditTabDetails.jsx`, and full downstream wiring into eBay Item Specifics, Gemini AI copy generation, comps search, and inventory display views.

---

## 2. Audit of Currently Existing Item Fields

### 2.1 Existing D1 Columns on `auction_items` (48 columns)
- **Identity & Taxonomy (10)**: `id`, `user_id`, `invoice_id`, `import_batch_id`, `item_name`, `sku`, `category`, `sport_genre`, `athlete_person`, `quantity`
- **Authentication (5)**: `authenticator`, `cert_number`, `cert_verification_url`, `cert_verified`, `cert_verified_at`
- **Acquisition & COGS (9)**: `unit_price`, `item_base_total`, `proration_weight`, `prorated_discount`, `prorated_shipping`, `prorated_tax`, `true_total_cost`, `purchase_date`, `date_acquired`
- **Pricing, Fees & Repricing (18)**: `status`, `platform`, `platform_fee_pct`, `platform_flat_fee`, `est_shipping_cost`, `buyer_shipping_cost`, `boost_pct`, `min_sell_price`, `suggested_list_price`, `current_list_price`, `actual_sell_price`, `target_margin_pct`, `floor_price`, `buy_it_now_price`, `original_list_price`, `last_repriced_at`, `reprice_locked`, `reprice_tier`
- **Marketplace & Telemetry (13)**: `ebay_listing_id`, `other_platform_listing_ids`, `ebay_promoted_rate`, `listing_format`, `listing_status`, `date_listed`, `date_sold`, `days_on_market`, `analytics_fetched_at`, `total_impressions_30d`, `total_page_views_30d`, `avg_ctr_30d`, `avg_conversion_30d`
- **VineScout Fast-Path (6)**: `asin`, `order_id`, `image_url`, `is_vinescout`, `etv`, `tax_cost`
- **Freeform & Metadata (4)**: `notes`, `best_listing_window`, `attributes` (JSON TEXT), `created_at`, `updated_at`

### 2.2 Existing Client-Settable `attributes` JSON Keys (`functions/api/items/[id].js`)
- `asin`, `order_id`, `etv`, `tax_cost`, `cert_verified`, `is_vinescout`, `cert_verified_at`
- `brand`, `team_or_band`, `inscription`, `size`, `is_wearable`, `is_custom_jersey`, `is_pickguard_guitar`, `target_net`
- `condition_header`, `condition_subheader`, `features`, `specs`, `model`, `included_in_sale`, `ai_middle_section`

---

## 3. Proposed New Field Architecture (Zero-Fluff, Category-Aware)

### 3.1 Promoted D1 Columns on `auction_items` (Migration `0014_item_detail_fields.sql`)
Cross-cutting operational, valuation, auth, and prep fields that benefit from SQL filtering, indexing, sorting, and direct eBay/API reads:

| Column | D1 Type | Default / Allowed Values | Primary Utility |
| :--- | :--- | :--- | :--- |
| `item_subtype` | `TEXT` | Free/preset per category (e.g. `Custom Stitched`, `OMLB`, `Display Acoustic`, `8x10`, `Graded Slab`) | Valuation tier, comps search precision, eBay `Type` specific |
| `item_condition` | `TEXT` | `New / Unopened`, `Mint`, `Near Mint`, `Excellent`, `Very Good`, `Good`, `Flawed / As-Is` | Maps directly to eBay `ConditionID` and marketplace listings |
| `condition_notes` | `TEXT` | Public buyer-facing flaw/surface disclosure (e.g. `Clean ink, minor corner ding`) | Separates buyer condition disclosure from private internal `notes` |
| `auth_type` | `TEXT` | `Witnessed`, `Basic Cert`, `Full LOA`, `Graded Slab`, `Team / League Holo`, `Uncertified` | Major valuation multiplier; feeds `ebayTemplate.js` and `platformListingRules.js` |
| `prep_status` | `TEXT NOT NULL DEFAULT 'Ready'` | `Needs Auth`, `At Authenticator`, `Needs Framing`, `At Framer`, `Needs Case/Clean`, `Ready` | Operational readiness tracking; prevents listing unprepped inventory |
| `framing_status` | `TEXT` | `Unframed`, `Framed`, `Framed + Matted`, `UV Acrylic Case`, `Ball Cube`, `Slab / Top Loader` | Major price multiplier and shipping/packaging tier selector |
| `source_vendor` | `TEXT` | `Pristine Auction`, `Heritage`, `Goldin`, `eBay`, `Private Signing`, `Local Estate`, `Amazon Vine`, `Retail`, `Other` | Sourcing provenance & future vendor ROI attribution |
| `storage_location` | `TEXT` | Short bin/rack code (e.g. `Bin A3`, `Jersey Rack 2`, `Wall 1`, `Safe`) | Rapid physical retrieval upon multi-channel sale |

**Partial Covering Index**:
```sql
CREATE INDEX IF NOT EXISTS idx_auction_items_prep_status
  ON auction_items(user_id, prep_status)
  WHERE prep_status IS NOT NULL AND prep_status != 'Ready';
```

**Bug Fix in Existing Columns**:
- Update `PUT /api/items/:id` SQL `UPDATE auction_items` to persist `cert_verified = ?` (`0`/`1`) and `cert_verified_at = ?` alongside `attributes` JSON so fast-path reads in `GET /api/items/enriched` never drift.

### 3.2 Category-Specific Conditional Fields (Allowlisted in `attributes` JSON via `CLIENT_SETTABLE_ATTR_KEYS`)
Sparse product-specific attributes stay in validated `attributes` JSON (canonical pattern in `outpost-db`) and render **only** when the item's category matches that product group:

1. **Shared Signed Memorabilia (shown for all memorabilia categories)**:
   - `ink_color` (`string`): `Blue Ballpoint`, `Black Sharpie`, `Blue Sharpie`, `Silver Paint Pen`, `Gold Paint Pen`, `White Paint Pen`, `Red Paint Pen`, `Other`
   - `signed_surface` (`string`): Where the autograph sits (e.g. `Number`, `Pickguard`, `Front Booklet`, `Sweet Spot`, `Crown`, `On-Card`)
   - `frame_dimensions` (`string`): Shown ONLY when `framing_status` is `Framed` or `Framed + Matted` (e.g. `24x32 in` - feeds packaging & Reverb `< 48"` box disclosure)
   - `source_lot_ref` (`string`): Private auction lot / consignment / receipt ID (keeps internal tracking cleanly out of public `notes`)
2. **Jerseys & Apparel (`Jersey`, `Clothing`, `Hat / Cap`)**:
   - `jersey_style` (`string`): `Custom Stitched`, `Replica / Swingman`, `Authentic / On-Field`, `Game-Used / Team-Issued` (auto-syncs `is_custom_jersey` and `is_wearable` guardrails)
   - `size` (existing key): Shown strictly for wearables (`S`, `M`, `L`, `XL`, `2XL`, `3XL`, `48`, `50`, `52`, `54`)
   - `colorway` (`string`): e.g. `Home White`, `Away Red`, `Alternate Black`, `Throwback`
   - `jersey_number` (`string`): e.g. `15`, `19`
3. **Balls, Helmets, Bats & Sports Gear (`Baseball`, `Football`, `Basketball`, `Helmet`, `Mini Helmet`, `Bat`, `Puck`, `Glove`, `Mask`)**:
   - `equipment_model` (`string`): e.g. `OMLB Official MLB`, `NFL Duke`, `Riddell Speed Full-Size`, `Riddell Speed Mini`, `Lunar Eclipse`, `Louisville Slugger Pro`
   - `signature_location` (`string`): `Sweet Spot`, `Side Panel`, `Crown`, `Front Panel`, `Barrel`, `Blade`
   - `case_included` (`boolean`): Whether display cube/case ships with item
4. **Guitars, Pickguards & Music Instruments (`Guitar`, `Pickguard`, `Drumhead`, `Drum Stick`)**:
   - `guitar_type` (`string`): `Display Acoustic (38")`, `Full-Size Acoustic`, `Electric Guitar`, `Pickguard Only`, `Drumhead`, `Drum Stick Pair` (auto-syncs `is_pickguard_guitar` guardrail when `signed_surface === 'Pickguard'` + guitar)
   - `instrument_finish` (`string`): e.g. `Black`, `Sunburst`, `White`, `Natural`
5. **CDs, Vinyl & Album Flats (`CD / Vinyl`, `Album Flat`)**:
   - `media_format` (`string`): `CD Booklet`, `Jewel Case + CD`, `12x12 Album Flat`, `Vinyl LP Jacket`, `Vinyl LP + Disc`
   - `album_title` (`string`): Exact album or tour title (feeds listing title & comps)
   - `media_included` (`boolean`): `Disc / Vinyl Included` vs `Cover / Flat / Booklet Only` (prevents eBay INAD disputes)
6. **Photos & Posters (`Photo`, `Framed Photo`, `Poster`)**:
   - `dimensions` (`string`): `8x10`, `11x14`, `16x20`, `18x24`, `24x36`, `Custom`
   - `photo_finish` (`string`): `Glossy`, `Matte`, `Canvas`, `Lithograph / Print`
7. **Trading Cards (`Card`, `Trading Card`)**:
   - `card_year` (`string`): e.g. `2024`
   - `card_set` (`string`): e.g. `Panini Prizm`, `Topps Chrome`, `Bowman 1st`
   - `card_number` (`string`): e.g. `#101`
   - `parallel_serial` (`string`): e.g. `Silver Prizm`, `Gold /10`, `RPA /99`
   - `card_grade` (`string`): e.g. `PSA 10`, `BGS 9.5`, `SGC 10`, `Raw`
   - `auto_grade` (`string`): e.g. `Auto 10`, `Auto 9`, `None`
8. **General / Retail (`Electronics`, `Tools`, `Home & Kitchen`, `Toys & Games`, `Books`, `Automotive`, `Other`, etc.)**:
   - Memorabilia-only sections (Subject/Auth/Framing) auto-collapse when a non-memorabilia retail category is selected (with a 1-click `"Signed / Memorabilia item?"` expand toggle), keeping the UI focused on `brand`, `model`, `item_condition`, `condition_notes`, `included_in_sale`, and `storage_location`.

---

## 4. Target Files & Implementation Steps

### Phase 1: Shared Category & Domain Constants
1. **`e:/TechTrekGT/outpost/src/utils/itemCategories.js`** (new pure ESM module):
   - Single source of truth for canonical categories grouped into `MEMORABILIA_CATEGORIES` (`Jersey`, `Baseball`, `Football`, `Basketball`, `Helmet`, `Mini Helmet`, `Bat`, `Puck`, `Glove`, `Guitar`, `Pickguard`, `CD / Vinyl`, `Album Flat`, `Drumhead`, `Drum Stick`, `Photo`, `Framed Photo`, `Poster`, `Card`, `Mask`, `Other Memorabilia`) and `GENERAL_CATEGORIES` (`Electronics`, `Tools`, `Home & Kitchen`, `Toys & Games`, `Clothing`, `Books`, `Automotive`, `Office`, `Health`, `Beauty`, `Pet Supplies`, `Sports`, `Other`).
   - Helper `resolveCategoryGroup(category, itemName)` returning `'jersey_apparel' | 'sports_gear' | 'music_instrument' | 'music_media' | 'photo_print' | 'trading_card' | 'general'`.
   - Shared option arrays (`ITEM_CONDITIONS`, `AUTH_TYPES`, `PREP_STATUSES`, `FRAMING_STATUSES`, `SOURCE_VENDORS`, `INK_COLORS`, `JERSEY_STYLES`, `PHOTO_DIMENSIONS`, `SUBTYPE_PRESETS_BY_GROUP`).
2. **`e:/TechTrekGT/outpost/src/utils/certLookup.js`**:
   - Align `AUTHENTICATORS` list with `platformListingRules.js` (`APPROVED_AUTHENTICATORS`), adding `B.A.M.`, `SWAU`, `Schwartz`, `MLB Authenticated`, `NFL Authenticated`, `NBA Authenticated` with lookup URLs where available.
3. **`e:/TechTrekGT/outpost/src/utils/userSettings.js`**:
   - Import canonical category defaults and add optional (default-hidden: `defaultVisible: false`) inventory grid columns: `item_condition`, `prep_status`, `framing_status`, `storage_location`, `source_vendor`.

### Phase 2: Database Migration & Worker API Updates
4. **`e:/TechTrekGT/outpost/migrations/0014_item_detail_fields.sql`** (new migration) & **`e:/TechTrekGT/outpost/auction-schema.sql`**:
   - Add the 8 `ALTER TABLE auction_items ADD COLUMN ...` statements (`item_subtype`, `item_condition`, `condition_notes`, `auth_type`, `prep_status`, `framing_status`, `source_vendor`, `storage_location`) and partial index `idx_auction_items_prep_status`.
   - Append identically to `auction-schema.sql` so all test suites initialize with the updated schema.
   - Apply migration to local and remote `outpost-db` via `wrangler d1 execute`.
5. **`e:/TechTrekGT/outpost/functions/api/items/[id].js`**:
   - Expand `CLIENT_SETTABLE_ATTR_KEYS` with the allowlisted category-specific keys while preserving strict exclusion of all system-managed keys (`MED-6` invariant).
   - Add validation for `prep_status` / `item_condition` string sanitization and update `GET` unpacking + `PUT` parameterized `?` SQL statement to persist all 8 new D1 columns AND fix `cert_verified` / `cert_verified_at` D1 column persistence.
6. **`e:/TechTrekGT/outpost/functions/api/items/enriched.js`** & **`e:/TechTrekGT/outpost/functions/api/items/index.js`**:
   - Add optional query filter `prep_status` (and include `i.item_subtype`, `i.source_vendor`, `i.storage_location` in search `LIKE ?` bindings in `enriched.js`).
   - Unpack the new category-specific `attributes` keys cleanly alongside the promoted columns.
7. **`e:/TechTrekGT/outpost/functions/api/invoices/index.js`** & **`e:/TechTrekGT/outpost/functions/api/import/batch.js`**:
   - Accept and persist optional `item_subtype`, `item_condition`, `auth_type`, `prep_status`, `framing_status`, `source_vendor`, `storage_location` during manual invoice creation and batch imports using strict positional `?` bindings (defaulting `prep_status` to `'Ready'`).

### Phase 3: Item Detail Modal, Forms & Display Views
8. **`e:/TechTrekGT/outpost/src/components/EditItemModal.jsx`**:
   - Replace local `STANDARD_CATEGORIES` with shared `ALL_ITEM_CATEGORIES` from `itemCategories.js`.
   - Extend `EMPTY_FORM`, hydration `useEffect`, and `handleSubmit` payload with all 8 promoted columns + category-specific attribute keys + `condition_header` / `condition_subheader` / `model` / `included_in_sale` (so edits in `EditItemModal` and `ListingCopyModal` stay 100% synchronized).
   - Auto-derive `is_wearable`, `is_custom_jersey`, and `is_pickguard_guitar` cleanly when category/style/surface changes while preserving manual override capability.
9. **`e:/TechTrekGT/outpost/src/components/edit/EditTabDetails.jsx`**:
   - **Deduplicate & Restructure** into 6 crisp, non-redundant sections:
     1. **Product Media & Gallery** (existing, unchanged).
     2. **Core Identity & Storage**: Title, Store SKU (Auto + Push), Category (grouped Memorabilia vs Retail), Subtype (with datalist presets per category), Brand, Quantity, Storage Location.
     3. **Category-Specific Details & Subject** (conditional by `resolveCategoryGroup()`):
        - Memorabilia categories show Subject/Athlete, Team/Band, Sport/Genre, Exact Inscription, Ink Color + **only the 2-5 fields relevant to that product group** (Jersey/Apparel, Ball/Helmet/Bat, Guitar/Music Gear, CD/Vinyl/Flat, Photo/Poster, or Trading Card), plus a compact Platform Guardrails override strip.
        - General/Retail categories show Brand/Model/Included Items and collapse Memorabilia fields behind a 1-click toggle.
     4. **Authentication & COA** (single consolidated card, auto-collapsed for non-memorabilia categories unless populated): Authenticator `<select>`, Auth Type `<select>`, Cert #, Verified toggle, Verification URL + Open Database Lookup button.
     5. **Condition, Prep & Framing**: Item Condition `<select>`, Prep Status `<select>`, Framing / Display `<select>` (revealing Frame Dimensions only when framed), and Public Condition / Flaw Notes textarea.
     6. **Acquisition, Sourcing & Internal Notes**: Source Vendor `<select>`, Source Lot/Ref, Base Unit Price & Landed Cost (COGS) + Proration strip, Target Listing Window, and Private Internal Notes textarea.
     - Replace the duplicated 135-line VineScout card with a compact 1-line status banner linking directly to the `VineScout / Vine` tab (`onSwitchTab('vinescout')`).
10. **`e:/TechTrekGT/outpost/src/components/edit/EditModalHeader.jsx`**:
    - Display compact pills when populated: `prep_status` (amber/rose pill whenever not `'Ready'`), `framing_status` (when framed/cased), `item_condition`, and `storage_location` (slate mono badge).
11. **`e:/TechTrekGT/outpost/src/components/AddInvoiceModal.jsx`**:
    - Use unified `ALL_ITEM_CATEGORIES` and `AUTHENTICATORS`.
    - Add optional `Source Vendor` dropdown on Step 1 (inherited by all line items on submit) and compact optional `Condition` + `Prep Status` selects on Step 2.
12. **`e:/TechTrekGT/outpost/src/components/inventory/InventoryGridRow.jsx`**, **`InventoryDataGrid.jsx`**, **`PricingCard.jsx`**:
    - Render optional columns (`item_condition`, `prep_status`, `framing_status`, `storage_location`, `source_vendor`) when toggled visible by the user, plus subtle micro-badges on `PricingCard` (`prep_status` warning when not ready, `framing_status` when framed, `auth_type` next to cert).

### Phase 4: Listing, AI Copy, eBay Publishing & Comps Integration
13. **`e:/TechTrekGT/outpost/src/components/ListingCopyModal.jsx`**:
    - Seed `condition` from `item.item_condition || item.condition`, seed `conditionSubheader` / flaw disclosure from `item.condition_notes`, pass `auth_type`, `framing_status`, `frame_dimensions`, `ink_color`, `dimensions`, `album_title`, `media_included`, `card_grade`, `card_set` into copy generators and persist `item_condition` / `condition_notes` on `handleSaveItem`.
14. **`e:/TechTrekGT/outpost/src/utils/ebayTemplate.js`** & **`e:/TechTrekGT/outpost/src/utils/platformListingRules.js`**:
    - Read `item_condition`, `condition_notes`, `auth_type`, `framing_status`, `frame_dimensions`, `ink_color`, `signed_surface`, `signature_location`, `dimensions`, `album_title`, `media_included`, `card_year`/`card_set`/`card_number`/`card_grade` to enrich Block 2 specifications, Block 3 authentication details, packaging method (e.g. framed vs unframed), and Reverb oversized box warnings (`>= 48"`).
15. **`e:/TechTrekGT/outpost/functions/api/ebay/create-listing.js`**, **`tokenHelper.js`**, & **`functions/api/ai/generate-ebay-details.js`**:
    - Map `item.item_condition` into `resolveEbayConditionId()`.
    - Expand `buildEbayItemSpecificsXml()` to include `Autograph Authentication`, `Autograph Format`, `Team`, `Size`, `Framed`, `Color` (ink/jersey), `Card Number`, `Grade`, and `Season/Year` when present (respecting custom-jersey and pickguard-guitar brand guardrails).
    - Pass structured condition, auth type, framing, and category-specific specs into `generateAiListingDetails` prompt.
16. **`e:/TechTrekGT/outpost/src/utils/ebaySearch.js`**:
    - Enhance `buildStructuredCompQuery()` to incorporate `item.inscription`, `item.item_subtype`, `item.dimensions` (for photos), `item.card_year`/`card_set`/`card_grade` (for cards), and `item.framing_status === 'Framed'` when building eBay sold-comp queries.

---

## 5. Verification & Documentation Sync Plan

1. **Automated Tests (`node --test`)**:
   - Create `e:/TechTrekGT/outpost/tests/item-detail-fields.test.js` validating:
     - Migration `0014` columns exist and default `prep_status = 'Ready'`.
     - `PUT /api/items/:id` persists all 8 promoted columns, syncs `cert_verified`/`cert_verified_at` D1 columns, accepts allowlisted category attributes, and rejects disallowed system keys (`MED-6`).
     - `GET /api/items/:id` and `GET /api/items/enriched` unpack promoted + JSON fields cleanly and filter by `prep_status`.
     - `resolveCategoryGroup()` and eBay `buildEbayItemSpecificsXml` / `resolveEbayConditionId` map new fields accurately without breaking anti-spoofing rules.
   - Run full existing test suite (`node --test tests/*.test.js`) to confirm zero regressions (especially `med-6-attribute-mass-assignment.test.js`, `platform-listing-rules.test.js`, `ebay-create-listing.test.js`, `crit-001-d1-parameterization.test.js`).
2. **D1 Migration Execution**:
   - Execute `migrations/0014_item_detail_fields.sql` against both local and remote `outpost-db`.
3. **Documentation Sync (Mandatory Post-Flight)**:
   - Update `e:/TechTrekGT/outpost/docs/03_features.md`, `e:/TechTrekGT/outpost/docs/04_state.md`, and `e:/TechTrekGT/docs/04_state.md` with Migration 0014 and the conditional Item Detail architecture.
4. **Build & Deploy**:
   - Run `npm run build` followed immediately by `npm run deploy` inside `e:/TechTrekGT/outpost/` and verify live Cloudflare deployment.
