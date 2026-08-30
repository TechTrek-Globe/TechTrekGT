# EditItemModal Redesign - Implementation Plan

**Project:** TechTrekGT Outpost Tracker  
**Target Path:** `e:/TechTrekGT/outpost`  
**Stack:** Pure JavaScript (React 19 / JSX / Vite / Tailwind CSS 3.4 / Cloudflare D1 Workers)  
**Primary Target:** `src/components/EditItemModal.jsx` and modular subcomponents in `src/components/edit/`  

---

## 1. Executive Summary & Problem Analysis

The legacy `EditItemModal.jsx` (1,302 lines, ~64 KB) is a monolithic component created prior to Phase 4 schema enhancements. A comprehensive audit reveals several critical architectural and UX deficits:

1. **Schema & Field Divergence:**
   - Database schema enhancements in Phase 4 added `sku`, `listing_format`, `listing_status`, `quantity`, `purchase_date`, `floor_price`, and `buy_it_now_price`.
   - The current `EditItemModal.jsx` omits these fields completely, preventing users from viewing or updating core inventory metadata.
   - Dual-key rate drift: `boost_pct` (decimal 0.0-1.0) and `ebay_promoted_rate` (percentage 0-100) coexist in inconsistent ways, risking data corruption on save.

2. **Monolithic Complexity & Cognitive Overload:**
   - All state, rendering tabs, calculations, API sync logic, and styling are housed in a single 64 KB file.
   - Modifying or extending tabs causes massive re-renders and slows Vite HMR.
   - Form inputs lack structured grouping, consistent currency formatting, and responsive desktop/mobile hierarchy.

3. **Disconnected Pricing & Fee Engine:**
   - While `src/utils/feeEngine.js` provides centralized, pure-function fee and margin calculations, `EditItemModal.jsx` uses legacy ad-hoc formulas in `formulaPreview.js`.
   - Edits to list price, COGS, promoted rate, or outbound shipping do not give immediate, high-fidelity feedback regarding eBay final value fees, ad fees, net profit, ROI, and margin health tier badges.

4. **Missing Ergonomics & Safety Controls:**
   - No dirty state tracking or unsaved change protection (closing via backdrop or escape immediately loses changes).
   - Sticky header and footer are missing: the header lacks real-time item status/image preview context, and the save action requires scrolling to the bottom of forms.

---

## 2. Component Architecture & Modular Layout Breakdown

To adhere to the single-responsibility principle and keep files clean and maintainable, `EditItemModal.jsx` will be refactored into a thin orchestrator backed by dedicated, focused subcomponents inside `src/components/edit/`:

```
src/components/
├── EditItemModal.jsx                 # Thin orchestrator (modal shell, unified form state, API submit)
└── edit/
    ├── EditModalHeader.jsx           # Sticky top bar (item title, thumbnail preview, status badge, SKU, close)
    ├── EditModalFooter.jsx           # Sticky bottom bar (Cancel, Dirty indicator, Save button, quick actions)
    ├── EditTabNav.jsx                # Tab navigation strip (6 segmented tabs with badges and icons)
    ├── EditTabIdentity.jsx           # Tab 1: Identity, SKU, Classification & Quantity
    ├── EditTabListing.jsx            # Tab 2: Listing Details, Format, Platform & Lifecycle Dates
    ├── EditTabPricing.jsx            # Tab 3: Pricing Strategy, COGS, Floors & Target Margins
    ├── LiveFeeReadout.jsx            # Live Fee & Margin calculation strip (embedded in Tab 3)
    ├── EditTabComps.jsx              # Tab 4: Market Comps, Active/Sold Research & Auto-Fetch
    ├── EditTabConsignment.jsx        # Tab 5: Invoicing, Purchase Batches & Landed Cost Breakdown
    └── EditTabCondition.jsx          # Tab 6: Condition Notes, Authenticator & Cert Verification
```

### 2.1 Visual Hierarchy & Layout Wireframe

```
+-----------------------------------------------------------------------------------------+
| [Sticky Header]                                                                     [X] |
| [Icon/Thumb] Patrick Mahomes Signed Red Jersey JSA COA                                  |
| SKU: TT-NFL-0042  |  Category: Jersey  |  Status: [Available (Badge)]  |  *Unsaved Changes|
+-----------------------------------------------------------------------------------------+
| [Tab Strip] [1. Identity] [2. Listing] [3. Pricing & Fees] [4. Comps] [5. Invoice] [6. Auth] |
+-----------------------------------------------------------------------------------------+
| [Scrollable Form Body]                                                                  |
|                                                                                         |
|  (Active Tab View Content Rendered Here)                                                |
|  - Currency inputs with leading '$' prefix & numeric validation                         |
|  - Real-time reactivity                                                                 |
|  - Interactive tooltips & badges                                                        |
|                                                                                         |
|  [Embedded LiveFeeReadout in Pricing Tab]:                                              |
|  +-----------------------------------------------------------------------------------+  |
|  | Final Value: $14.20 | Ad Fee: $4.50 | Shipping: $6.00 | Deductions: $24.70       |  |
|  | Net Proceeds: $75.30 | Net Profit: +$35.30 (Emerald) | ROI: 88.3% | [High Margin] |  |
|  | Break-Even Floor: $48.25 | Landed COGS: $40.00                                    |  |
|  +-----------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------+
| [Sticky Footer]                                                                         |
| [Discard / Cancel]                  [Sync Active Listing]            [Save Changes]     |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Tab Structure & Deep Field Data Binding

All fields from `auction_items`, `auction_invoices`, and `auction_comps` will be mapped into clean, ergonomic controls across 6 tabs:

### Tab 1: Identity & Classification (`EditTabIdentity.jsx`)
- `item_name`: Item Title / Description (`TEXT NOT NULL`, required).
- `sku`: Custom Store SKU / Inventory Code (`TEXT`).
- `category`: Primary Category (Dropdown populated with standard + custom categories).
- `sport_genre`: Sport / Subject Genre (`TEXT`, e.g., Football, Baseball, Memorabilia).
- `athlete_person`: Signer / Athlete / Personality (`TEXT`).
- `quantity`: Item Count / Quantity (`INTEGER DEFAULT 1`, min 1).
- `best_listing_window`: Optimal Listing Window / Seasonality (`TEXT`).
- `description` / `notes`: Item notes and description details.

### Tab 2: Listing Details & Lifecycle (`EditTabListing.jsx`)
- `status`: Lifecycle Status (`Available`, `Listed`, `Sold`, `Unsold`, `Kept for Self`, `Returned`).
- `listing_format`: Sale Format (`Fixed Price` / `Auction`).
- `listing_status`: Marketplace Listing Status (`Draft`, `Active`, `Sold`, `Unsold`).
- `platform`: Target Sales Channel (`eBay`, `Whatnot`, `Mercari`, `Poshmark`, `Private Sale`, etc.).
- `ebay_listing_id`: Linked 12-digit eBay Item Number.
  - Live Actions: "Sync Live Data" trigger via `syncEbayItem()`, "Unlink", and direct `https://www.ebay.com/itm/:id` portal link.
- `purchase_date` / `date_acquired`: Acquisition Date (`DATE`).
- `date_listed`: Date Listed on Marketplace (`DATE`).
- `date_sold`: Date Sold (`DATE`).
- `actual_sell_price`: Realized Sale Price (active when status is `Sold`).

### Tab 3: Pricing Strategy & Live Fee Engine (`EditTabPricing.jsx`)
- `current_list_price`: Active Asking / Buy-It-Now List Price (`REAL`).
- `buy_it_now_price`: Secondary Buy-It-Now Price / Target Price (`REAL`).
- `floor_price`: Strict Minimum Floor Price / Hard Floor (`REAL`).
- `target_margin_pct`: Target Profit Margin Percentage (`REAL`, default 30%).
- `true_total_cost`: Landed Acquisition COGS (Unit Cost + Prorated Tax/Shipping/Fees) (`REAL`).
- `ebay_promoted_rate`: Promoted Listing Ad Rate % (Canonical percentage field, 0% to 100%).
- `platform_fee_pct`: Platform Fee % (Auto-set on platform change, customizable).
- `platform_flat_fee`: Platform Per-Order Flat Fee ($) (e.g., $0.40 for eBay).
- `est_shipping_cost`: Estimated Outbound Shipping Cost ($).
- **Subcomponent `LiveFeeReadout.jsx`**:
  - Live reactive execution of `computeFeeBreakdown()` from `src/utils/feeEngine.js`.
  - Visual indicators for Net Proceeds, Estimated Final Value Fee, Promoted Ad Fee, Total Deductions, Net Profit (color-coded), ROI %, Margin %, Break-Even Floor Price, and `MarginHealthBadge`.

### Tab 4: Market Comps & Research (`EditTabComps.jsx`)
- `comp_1`, `comp_2`, `comp_3`: Recent Sold Comparables ($).
- `active_comp_1`, `active_comp_2`, `active_comp_3`: Active Comp Listings ($).
- `recommended_list_price`: Target Recommended List Price ($).
- Actions:
  - "Auto-Fetch eBay Sold Comps" trigger calling `fetchLiveComps()`.
  - "Apply to Current Listing Price" button.
  - "Save Comps to Database" button calling `saveComp()`.
  - Direct external link to live eBay sold search with query sanitizer.

### Tab 5: Consignment & Invoicing (`EditTabConsignment.jsx`)
- `invoice_ref`: Parent Invoice / Batch Reference ID (Read-only context from `auction_invoices`).
- `invoice_description`: Purchase lot description.
- `unit_price`: Base Purchase Unit Price (Editable override).
- Proration Breakdown (Read-only reference):
  - `prorated_tax`, `prorated_shipping`, `prorated_discount`, `proration_weight`.
- `true_total_cost`: Final Landed Cost calculation with auto-recalculate toggle.

### Tab 6: Condition & Authenticity (`EditTabCondition.jsx`)
- `authenticator`: Authenticator Company (`Beckett`, `JSA`, `PSA`, `ACOA`, `Upper Deck`, `Fanatics`, `Tristar`, `Steiner`, `Other`).
- `cert_number`: Certificate / Hologram Serial Number (`TEXT`).
- `cert_verification_url`: Auto-generated authentication lookup URL with direct verification link.
- `condition`: Condition Grade / State (`Mint`, `Near Mint`, `Framed`, `Loose`, `Defective`).
- Memorabilia Notes: Inscriptions, framing details, COA sticker placement, slab notes.

---

## 4. State Management Strategy & Reactivity

### 4.1 Single Source of Truth
The top-level `EditItemModal.jsx` maintains a single unified `form` state object. Switching tabs changes visual presentation without unmounting or resetting form state:

```javascript
const [form, setForm] = useState(EMPTY_FORM);
const [initialForm, setInitialForm] = useState(EMPTY_FORM);
const [activeTab, setActiveTab] = useState('identity');
const [saving, setSaving] = useState(false);
const [error, setError] = useState('');
const [success, setSuccess] = useState('');
```

### 4.2 Dirty Checking (`isDirty`)
- On `item` prop receipt, deep copy initial values into `initialForm` and `form`.
- `isDirty` computed via `useMemo` comparing `form` vs `initialForm`.
- If `isDirty` is true:
  - A subtle amber indicator appears in the sticky header and footer.
  - Attempting to close via modal backdrop, `X` button, or `Escape` triggers a confirmation guard.

### 4.3 Live Fee Reactivity
Pure memoized execution of `feeEngine.js`:

```javascript
const liveFees = useMemo(() => {
  return computeFeeBreakdown({
    sellPrice: parseFloat(form.current_list_price) || 0,
    cogs: parseFloat(form.true_total_cost) || parseFloat(form.unit_price) || 0,
    platform_fee_pct: (parseFloat(form.platform_fee_pct) || 13.5) / 100,
    platform_flat_fee: parseFloat(form.platform_flat_fee) || 0.40,
    ebay_promoted_rate: parseFloat(form.ebay_promoted_rate) || 0,
    est_shipping_cost: parseFloat(form.est_shipping_cost) || 0,
    target_margin_pct: (parseFloat(form.target_margin_pct) || 30) / 100
  });
}, [
  form.current_list_price,
  form.true_total_cost,
  form.unit_price,
  form.platform_fee_pct,
  form.platform_flat_fee,
  form.ebay_promoted_rate,
  form.est_shipping_cost,
  form.target_margin_pct
]);
```

### 4.4 Auto-Calculations
1. **Comp Averaging:** Editing `comp_1`, `comp_2`, or `comp_3` dynamically recalculates `recommended_list_price` if no manual override is active.
2. **COGS Landed Cost:** Editing `unit_price` automatically recalculates `true_total_cost = unit_price + prorated_shipping + prorated_tax - prorated_discount`.
3. **Canonical Rate Mapping:** Editing `ebay_promoted_rate` (e.g. `5` for 5%) automatically synchronizes `boost_pct` (`0.05`) to prevent backend rate divergence.
4. **Platform Presets:** Changing `platform` automatically populates default platform fee % and flat fee amounts from `PLATFORM_FEE_PRESETS`.

---

## 5. API Integration & Payload Normalization

### 5.1 Endpoint: `PUT /api/items/:id`
The modal invokes `updateItem(item.id, payload)` from `src/utils/auctionApi.js`.

### 5.2 Payload Normalization Mapping

```javascript
const payload = {
  // Identity & Classification
  item_name: form.item_name.trim(),
  sku: form.sku?.trim() || null,
  category: form.category || null,
  sport_genre: form.sport_genre?.trim() || null,
  athlete_person: form.athlete_person?.trim() || null,
  quantity: parseInt(form.quantity, 10) || 1,
  best_listing_window: form.best_listing_window?.trim() || null,
  notes: form.notes?.trim() || null,

  // Costs & Landed Values
  unit_price: form.unit_price !== '' ? parseFloat(form.unit_price) : 0,
  true_total_cost: form.true_total_cost !== '' ? parseFloat(form.true_total_cost) : undefined,

  // Listing Details & Status
  status: form.status,
  listing_format: form.listing_format || null,
  listing_status: form.listing_status || null,
  platform: form.platform || null,
  platform_fee_pct: form.platform_fee_pct !== '' ? parseFloat(form.platform_fee_pct) / 100 : 0.135,
  platform_flat_fee: form.platform_flat_fee !== '' ? parseFloat(form.platform_flat_fee) : 0.40,
  est_shipping_cost: form.est_shipping_cost !== '' ? parseFloat(form.est_shipping_cost) : 0,

  // Pricing Strategy
  current_list_price: form.current_list_price !== '' ? parseFloat(form.current_list_price) : null,
  buy_it_now_price: form.buy_it_now_price !== '' ? parseFloat(form.buy_it_now_price) : null,
  floor_price: form.floor_price !== '' ? parseFloat(form.floor_price) : null,
  actual_sell_price: form.actual_sell_price !== '' ? parseFloat(form.actual_sell_price) : null,
  target_margin_pct: form.target_margin_pct !== '' ? parseFloat(form.target_margin_pct) / 100 : 0.30,

  // Rate consolidation
  ebay_promoted_rate: form.ebay_promoted_rate !== '' ? parseFloat(form.ebay_promoted_rate) : null,
  boost_pct: form.ebay_promoted_rate !== '' ? (parseFloat(form.ebay_promoted_rate) / 100) : 0,

  // Dates
  purchase_date: form.purchase_date || form.date_acquired || null,
  date_acquired: form.date_acquired || form.purchase_date || null,
  date_listed: form.date_listed || null,
  date_sold: form.date_sold || null,

  // Authentication & Verification
  authenticator: form.authenticator || null,
  cert_number: form.cert_number?.trim() || null,
  cert_verification_url: form.cert_verification_url || null,
  ebay_listing_id: form.ebay_listing_id?.trim() || null
};
```

---

## 6. Step-by-Step Implementation Roadmap

### Phase 1: Create Modular Subcomponents in `src/components/edit/`
1. `src/components/edit/EditModalHeader.jsx`: Sticky header bar with item name, image preview, SKU, status badge, dirty state dot, and close action.
2. `src/components/edit/EditModalFooter.jsx`: Sticky footer with Cancel button, dirty warning, Save Changes button with loading spinner, and quick action shortcuts.
3. `src/components/edit/EditTabNav.jsx`: Segmented navigation bar supporting 6 tabs with lucide-react icons, active tab styling, and responsive layout.
4. `src/components/edit/LiveFeeReadout.jsx`: Reusable live fee calculation box embedding `computeFeeBreakdown` with itemized fee table and `MarginHealthBadge`.
5. `src/components/edit/EditTabIdentity.jsx`: Inputs for `item_name`, `sku`, `category`, `sport_genre`, `athlete_person`, `quantity`, `best_listing_window`.
6. `src/components/edit/EditTabListing.jsx`: Inputs for `status`, `listing_format`, `listing_status`, `platform`, `ebay_listing_id`, dates, and eBay live sync.
7. `src/components/edit/EditTabPricing.jsx`: Inputs for `current_list_price`, `buy_it_now_price`, `floor_price`, `target_margin_pct`, `ebay_promoted_rate`, `platform_fee_pct`, shipping cost, and embedded `LiveFeeReadout`.
8. `src/components/edit/EditTabComps.jsx`: Inputs for `comp_1..3`, `active_comp_1..3`, `recommended_list_price`, with auto-fetch eBay comps integration.
9. `src/components/edit/EditTabConsignment.jsx`: Landed cost breakdown, invoice metadata reference, and purchase unit price editor.
10. `src/components/edit/EditTabCondition.jsx`: Inputs for `authenticator`, `cert_number`, auto-computed `cert_verification_url`, and memorabilia condition notes.

### Phase 2: Refactor Orchestrator `EditItemModal.jsx`
1. Replace monolithic body with modular subcomponents.
2. Implement centralized `form` and `initialForm` state initialization with full Phase 4 schema coverage.
3. Integrate `isDirty` calculation and close protection guard.
4. Standardize `updateField(key, value)` callback across all subcomponents.
5. Normalize API submission payload for `updateItem()`.

### Phase 3: Build & Verification
1. Run `npm run build` in `e:/TechTrekGT/outpost` to verify zero bundle errors or unresolved imports.
2. Verify all 6 tabs switch seamlessly while retaining modified state.
3. Verify live fee calculations update synchronously upon price/cost/rate modification.
4. Verify dirty-state guard on modal close.
5. Deploy to Cloudflare via `npm run deploy`.

---

## 7. Verification & Quality Assurance Plan

### Automated Checks
- `npm run build` execution in `e:/TechTrekGT/outpost` must exit code 0.

### Manual Test Matrix
| Feature / Scenario | Action / Input | Expected Result |
|-------------------|----------------|-----------------|
| Field Ingestion | Open modal for item with SKU, format, and custom prices | All fields populate accurately across all 6 tabs |
| Tab State Persistence | Modify title in Tab 1, price in Tab 3, switch to Tab 6 and back | All modified values remain intact |
| Live Fee Engine | Adjust `current_list_price` from $50 to $100 | Live fee readout immediately recomputes Final Value, Net Profit, and Margin Health Badge |
| Promoted Ad Rate | Enter `5.5%` for eBay Promoted Rate | Estimated Ad Fee computes to 5.5% of list price; `boost_pct` synced |
| Comps Integration | Click "Auto-Fetch eBay Sold Comps" in Tab 4 | Live comps fetched via API, comp averages and recommended price populated |
| Dirty State Guard | Modify any field and click `X` / press `Escape` | Confirmation prompt warns of unsaved changes before closing |
| Form Submission | Click "Save Changes" | Form submits normalized payload to `PUT /api/items/:id`; returns success and triggers `onUpdated` callback |

---
