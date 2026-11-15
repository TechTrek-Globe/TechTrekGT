# Outpost Tracker - Mobile (iPhone 18 Pro) & Tablet (iPad) UI/UX Responsiveness Audit & Implementation Plan

## 1. Executive Summary & Target Device Profiles

- **Target Device 1 - iPhone 18 Pro**:
  - Viewport: `~402x874` CSS px portrait (`390px-430px` class) / `~874x402` CSS px landscape.
  - Hardware & OS Quirks: Dynamic Island / top sensor housing (`env(safe-area-inset-top)`), bottom Home Indicator (`env(safe-area-inset-bottom)`), landscape horizontal insets (`env(safe-area-inset-left/right)`), iOS Safari dynamic address/toolbar (`100dvh` vs `100vh`), iOS Safari forced auto-zoom on `<input>/<select>/<textarea>` elements with `font-size < 16px`, lack of hover state (`group-hover:`), and Apple HIG minimum `44x44px` touch targets.
- **Target Device 2 - iPad (Air / Pro 11" & 13")**:
  - Viewport: `~820x1180` CSS px (`768px-834px` portrait) and `~1024x1366` / `~1180x820` CSS px (`1024px-1366px` landscape).
  - Hardware & OS Quirks: Split-view / Slide Over multitasking widths (`md:` `768px` vs `lg:` `1024px`), touch-first interaction without persistent mouse hover (`group-hover:` pencils and `onDoubleClick` cells fail on touch), virtual keyboard viewport compression in centered modals, and horizontal table scroll ergonomics.
- **Architectural & Invariant Guardrails**:
  - Pure JavaScript (JSX/ESM) only (zero TypeScript), React 19, Vite 6, Tailwind CSS 3.4, custom `pushState`/`popstate` SPA routing, React Context + hooks only.
  - Zero changes to Cloudflare Worker/D1 backend logic, API contracts, or existing desktop (`lg:`/`xl:`/`2xl:`) visual layouts unless strictly required for responsive breakpoint parity.

---

## 2. View-by-View Audit Matrix (iPhone 18 Pro vs. iPad Status)

| View / Component Surface | File Path | iPhone 18 Pro (`~402x874` P / `874x402` L) | iPad (`768-820px` P / `1024-1366px` L) | Key Audit Findings |
| :--- | :--- | :--- | :--- | :--- |
| **Root HTML & Global CSS** | `index.html`, `src/index.css` | **CRITICAL** | **MODERATE** | Missing `viewport-fit=cover`; zero `env(safe-area-inset-*)` utilities; `.input-field` uses `text-sm` (`14px`) causing iOS Safari auto-zoom on focus. |
| **App Shell & Navigation** | `src/components/AppLayout.jsx` | **CRITICAL** | **MODERATE** | Outer shell uses `h-screen max-h-screen` (`100vh`) clipping bottom pagination under iOS Safari bars; `Tax / Schedule C` button missing on `<1024px` (mobile & iPad Portrait); mobile header/nav buttons are `24px-30px` tall (`<44px`). |
| **Authentication View** | `src/components/AuthPage.jsx` | **CRITICAL** | **POLISH** | Fixed `280px` header banner consumes 70% of iPhone landscape height; `Launch Pad` button (`top-4 left-4`) collides with Dynamic Island; `14px`/`12px` inputs trigger iOS auto-zoom; `16x16px` checkbox. |
| **Executive Dashboard** | `src/components/DashboardView.jsx`, `dashboard/MarketAlertsPanel.jsx` | **MODERATE** | **MODERATE** | 4-col aging bar (`grid-cols-4`) clips text on `402px`; Stagnant/Unlisted rows lack `truncate` on metadata strings; `MarketAlertsPanel` dismiss button uses `opacity-0 group-hover:opacity-100` (invisible on iPhone/iPad touch). |
| **Inventory Hub & Command Bar** | `src/components/InventoryHubView.jsx`, `inventory/InventoryCommandBar.jsx` | **CRITICAL** | **MODERATE** | Command bar inputs use `text-xs` (`12px`, iOS zoom) and `py-1` (`26px` height); `pendingCertPrompt` banner lacks `flex-wrap`; pagination footer lacks bottom safe-area clearance. |
| **Inventory Data Grid & Row** | `src/components/inventory/InventoryDataGrid.jsx`, `inventory/InventoryGridRow.jsx` | **CRITICAL** | **CRITICAL** | 3 sticky-left columns (`195px + 44px + 220px = 459px` default / `399px` min) exceed 100% of iPhone 18 Pro width (`386px` container) and 60% of iPad Portrait, hiding all 12 scrolled columns underneath sticky columns; `w-6 h-6` (`24px`) action icons; `opacity-0 group-hover:` inline edit pencils unreachable on touch. |
| **Inventory Pricing Cards** | `src/components/inventory/PricingCardGrid.jsx`, `inventory/PricingCard.jsx` | **POLISH** | **PASS** | Responsive card grid works well; minor touch target sizing on `px-2.5 py-1.5` footer buttons and `14px` inline price input on mobile. |
| **Sales Log View** | `src/components/SalesLogView.jsx`, `FeeReconciliationPanel.jsx` | **CRITICAL** | **MODERATE** | `table-fixed` (`~945px`) has no mobile card view; `InlineEditableCell` blocks `<640px` without `onMobileFallback` and requires `onDoubleClick` on iPad; `w-5 h-5` (`20x20px`) row action buttons; hover-only fee tooltips; `11px` search/select inputs. |
| **Settings View** | `src/components/SettingsView.jsx`, `EbayConnectBanner.jsx` | **MODERATE** | **POLISH** | 5 top tabs wrap into uneven 3-row stack on `402px`; 2-col column visibility toggles clip labels on `402px`; API/VScout key rows overflow without `flex-wrap`; `text-xs`/`text-sm` inputs trigger iOS auto-zoom. |
| **Admin Control Center** | `src/components/AdminView.jsx` | **MODERATE** | **PASS** | Header refresh button and table cells need mobile padding/touch target adjustments; inputs in modals need `16px` mobile font guard. |
| **Edit Item Modal (Shell & 5 Tabs)** | `src/components/EditItemModal.jsx`, `edit/EditModalHeader.jsx`, `edit/EditModalFooter.jsx`, `edit/EditTab*.jsx` | **CRITICAL** | **MODERATE** | `max-h-[94vh]` clips behind iOS toolbars/keyboard; `EditModalFooter` hides `Listing Copy` button on `<640px` (`hidden sm:inline-flex`); `EditTabFinancials` 12-col accounting waterfall crushes `col-span-3` columns on `402px`; manual eBay ID pairing row overflows on `<640px`. |
| **Add / View Invoice & Amazon Modals** | `src/components/AddInvoiceModal.jsx`, `ViewInvoiceModal.jsx`, `AmazonItemModal.jsx` | **CRITICAL** | **POLISH** | `AddInvoiceModal` Step 1 (`grid-cols-3`) and Step 2 (`grid-cols-12` with `col-span-4`) crush inputs to `~95px` wide on iPhone 18 Pro (`402px`); `ViewInvoiceModal` hides `Pristine Dashboard` link on `<640px`. |
| **Listing Copy & Match Modals** | `src/components/ListingCopyModal.jsx`, `ListingMatchReviewModal.jsx`, `inventory/SoldEbayVineMatcherModal.jsx` | **CRITICAL** | **MODERATE** | `ListingMatchReviewModal` 3-tab bar overflows `402px` and Tab 3 search uses fixed `w-64`; `SoldEbayVineMatcherModal` uses fixed `h-[90vh]`, un-wrapped header/tab stats, and cramped 2-pane manual matcher on mobile; `ListingCopyModal` format/copy bar overflows on `<430px`. |
| **Repricing, Tax, Finance & Utility Modals** | `inventory/AgingMarkdownModal.jsx`, `TaxReportModal.jsx`, `FinanceSyncModal.jsx`, `SpreadsheetImporterModal.jsx`, `ui/CommandPalette.jsx` | **MODERATE** | **POLISH** | `AgingMarkdownModal` 9-col table lacks `overflow-x-auto` wrapper; `TaxReportModal` header wraps poorly on `<640px`; `CommandPalette` uses `100vh` instead of `100dvh` and lacks top safe-area inset on full-screen mobile. |

---

## 3. Prioritized File-by-File Remediation Plan (Grouped by Severity)

### Severity 1: CRITICAL Layout Breakage & Feature Inaccessibility

#### 1.1 Root Viewport, Safe-Area Insets & iOS Auto-Zoom Prevention
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/index.html` (Lines 5-12)
  - `e:/TechTrekGT/outpost/src/index.css` (Lines 45-122)
- **Issues**:
  1. `index.html:5` lacks `viewport-fit=cover`, preventing `env(safe-area-inset-*)` from functioning around the iPhone 18 Pro Dynamic Island and Home Indicator.
  2. `src/index.css:71-75` defines `.input-field` with `text-sm` (`14px`), and dozens of component inputs use `text-xs` (`12px`) or `text-[11px]`, triggering iOS Safari forced viewport auto-zoom on focus.
  3. `.modal-content` (`src/index.css:91-93`) uses fixed `p-6` and no `max-h-[90dvh]` containment.
- **Target Tailwind/CSS Fixes**:
  - In `index.html:5`, update viewport meta to:
    `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`
  - In `src/index.css`, update `.input-field` (`L71-75`) from `text-sm` to `text-base sm:text-sm` (`16px` on `<640px`, `14px` on `sm+`).
  - Add a global mobile iOS Safari auto-zoom guard inside `@layer base` in `src/index.css`:
    ```css
    @media screen and (max-width: 639px) {
      input, select, textarea {
        font-size: 16px !important;
      }
    }
    ```
    *(Note: this guarantees zero iOS Safari auto-zoom across all modals, inline editors, and search bars on iPhone 18 Pro while preserving exact `text-xs`/`text-sm` typography on `640px+` iPad and desktop).*
  - Add safe-area utility classes in `src/index.css` (`@layer utilities`):
    - `.pt-safe { padding-top: env(safe-area-inset-top, 0px); }`
    - `.pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }`
    - `.pl-safe { padding-left: env(safe-area-inset-left, 0px); }`
    - `.pr-safe { padding-right: env(safe-area-inset-right, 0px); }`
    - `.px-safe { padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }`
  - Update `.modal-content` (`src/index.css:91-93`) to `p-4 sm:p-6 max-h-[90dvh] overflow-y-auto`.

#### 1.2 App Shell Dynamic Viewport Height (`100dvh`), Safe Areas & Missing Mobile Tax Action
- **File & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/AppLayout.jsx` (Lines 80-83, 307-390)
- **Issues**:
  1. `L80`: `h-screen max-h-screen` (`100vh`) causes the bottom of `<main>` (including `InventoryHubView` pagination footer) to be hidden behind the iOS Safari bottom bar on iPhone 18 Pro and iPad.
  2. `L310-348`: Mobile/tablet header (`lg:hidden`, active on iPhone 18 Pro AND iPad Portrait `768px-820px`) omits the `Tax / Schedule C` button (`setTaxReportOpen(true)`) that exists in the desktop sidebar (`L197-205`).
  3. `L310-367`: Mobile header and horizontal nav lack `pt-safe` / `px-safe` for Dynamic Island and landscape safe areas, and header action buttons (`L316-346`) are `24px-30px` tall (`<44px`).
- **Target Tailwind/CSS Fixes**:
  - `L80`: Replace `h-screen max-h-screen` with `h-screen h-[100dvh] max-h-[100dvh]`.
  - `L310`: Add `pt-safe px-safe` to `<header className="lg:hidden ...">`.
  - `L315-347`: Add the `Tax / Schedule C` button (`<FileSpreadsheet className="w-3.5 h-3.5" />` calling `setTaxReportOpen(true)`) alongside `Sync`, and increase all mobile header interactive buttons to `min-h-[40px] min-w-[40px] sm:min-h-[44px]` with `px-2.5 py-2` touch targets.
  - `L351-367`: Add `px-safe` to `<nav className="lg:hidden ...">` and increase tab button touch height from `py-1.5` to `py-2.5 min-h-[40px]`.
  - `L370`: Add `pb-safe px-safe` to `<main id="main-content" ...>`.

#### 1.3 Inventory Data Grid Sticky-Column Lockout & Mobile Card Fallback
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/InventoryHubView.jsx` (Lines 93-100, 257-300, 353-388)
  - `e:/TechTrekGT/outpost/src/components/inventory/InventoryDataGrid.jsx` (Lines 53-74, 108-140)
  - `e:/TechTrekGT/outpost/src/components/inventory/InventoryGridRow.jsx` (Lines 74-78, 94-248, 560-578, 700-718)
- **Issues**:
  1. **Sticky Column Viewport Lockout (`InventoryDataGrid.jsx:55-57`, `InventoryGridRow.jsx:75-77`)**: `actions` (`left: 0, width: 195px`), `image` (`left: 195px, width: 44px`), and `item_name` (`left: 239px, minWidth: 160px`) are hardcoded as `sticky` across all screen sizes (`399px-459px` total sticky width). On iPhone 18 Pro (`386px` grid width), sticky columns cover >100% of the viewport so horizontally scrolled columns are 100% invisible underneath them. On iPad Portrait (`768px-820px`), sticky columns consume ~60% of the table width.
  2. **Mobile Default View (`InventoryHubView.jsx:94`)**: `viewMode` defaults to `'table'` even on `<640px` phones unless manually toggled, violating `outpost/docs/01_identity.md` (`<640px` responsive cards) while also needing Table view to remain usable if selected.
  3. **Hover-Only Inline Pencils (`InventoryGridRow.jsx:241, 572, 713` & `InlineEditCell.jsx:112`, `InlineSelectCell.jsx:73`)**: Cert # edit button (`L572`) and Invoice Ref edit button (`L713`) use `opacity-0 group-hover/cert:opacity-100` and `opacity-0 group-hover/inv:opacity-100`, making existing Cert # and Invoice Ref fields uneditable on touch screens (iPhone & iPad).
- **Target Tailwind/CSS Fixes**:
  - In `InventoryDataGrid.jsx` (`L55-57`, `L108-132`) and `InventoryGridRow.jsx` (`L75-77`, `L95`, `L200`, `L211`):
    - Make sticky columns responsive: apply `lg:sticky` (sticky only at `>=1024px` where full sidebar + wide viewport exist). On `<1024px` (iPhone 18 Pro & iPad Portrait), the table scrolls smoothly as a unified sheet without sticky column occlusion, while `>=1024px` (iPad Landscape & Desktop) retains the 3-column sticky freeze.
    - Also compact the `actions` column on mobile/tablet from `195px` to `168px` or allow touch-friendly spacing.
  - In `InventoryHubView.jsx` (`L94-99`):
    - When `localStorage.getItem('outpost_inventory_view_mode')` is not set, default to `'cards'` if `window.innerWidth < 640`, otherwise `'table'`.
    - `L258`: Add `flex-wrap` to `pendingCertPrompt` banner (`flex flex-wrap items-center justify-between gap-3`) and `flex-wrap` on its input/button controls (`L267`).
  - In `InventoryGridRow.jsx`:
    - `L241, 572, 713`: Change `opacity-0 group-hover/...:opacity-100` to `opacity-70 lg:opacity-0 lg:group-hover/...:opacity-100` so edit pencils are always visible and tappable on iPhone and iPad touch devices.
    - `L105-190`: Increase row action button hit areas on touch devices (`w-7 h-7 sm:w-6 sm:h-6`) and guard hover tooltips (`ItemImageHoverTooltip`, `InventoryPricingTooltip`) with `window.matchMedia('(hover: hover)').matches` so touch taps do not leave orphan fixed tooltips on screen.

#### 1.4 AuthPage Fixed Banner Height & Dynamic Island Overlap
- **File & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/AuthPage.jsx` (Lines 257-275, 425-445)
- **Issues**:
  1. `L257`: Uses `min-h-screen` instead of `min-h-[100dvh]`.
  2. `L260`: `<header style={{ height: '280px' }}>` hardcodes `280px` height. On iPhone 18 Pro Landscape (`874x402px`), the banner takes 70% of the screen height.
  3. `L263`: `Launch Pad` link (`absolute top-4 left-4`) lacks `env(safe-area-inset-top)` / `env(safe-area-inset-left)` offset.
- **Target Tailwind/CSS Fixes**:
  - `L257`: Replace `min-h-screen` with `min-h-screen min-h-[100dvh] pb-safe`.
  - `L260`: Remove inline `style={{ height: '280px' }}` and use responsive Tailwind classes `h-36 sm:h-52 lg:h-[280px]`.
  - `L263`: Update `top-4 left-4` to `top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] min-h-[40px]`.
  - `L429-435`: Increase `Remember me` touch target padding (`py-1.5`) and checkbox to `w-5 h-5`.

#### 1.5 EditItemModal & Tabs (`EditModalFooter`, `EditTabFinancials`, `EditTabNav`)
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/EditItemModal.jsx` (Lines 899-920)
  - `e:/TechTrekGT/outpost/src/components/edit/EditModalHeader.jsx` (Lines 31-125)
  - `e:/TechTrekGT/outpost/src/components/edit/EditModalFooter.jsx` (Lines 14-93)
  - `e:/TechTrekGT/outpost/src/components/edit/EditTabNav.jsx` (Lines 42-78)
  - `e:/TechTrekGT/outpost/src/components/edit/EditTabFinancials.jsx` (Lines 993-1054, 1327-1475)
- **Issues**:
  1. `EditItemModal.jsx:900-901`: Uses `p-2 sm:p-4` and `max-h-[94vh]`. On iPhone 18 Pro, `94vh` exceeds `dvh` when Safari toolbars or virtual keyboard appear.
  2. `EditModalFooter.jsx:30`: `Listing Copy` button has `hidden sm:inline-flex`, completely hiding the Listing Copy feature inside the Edit Modal on iPhone 18 Pro (`<640px`). Also, the 3-column footer layout (`px-6 py-3.5 flex items-center justify-between gap-3`) squeezes `Cancel` and `Save Changes` on `402px`.
  3. `EditTabFinancials.jsx:1005`: Manual eBay Listing ID pairing row (`<div className="flex items-center gap-2">`) with input + `Pair & Fetch Live Data` button overflows horizontally on `<640px`.
  4. `EditTabFinancials.jsx:1347-1474`: Pillar 1 Accounting Waterfall uses a rigid `grid-cols-12` (`col-span-6` / `col-span-3` / `col-span-3`) where `col-span-3` is only `~80px` wide on iPhone 18 Pro, causing `Calculation Basis` text and currency amounts to collide.
- **Target Tailwind/CSS Fixes**:
  - `EditItemModal.jsx:901`: Replace `max-h-[94vh]` with `max-h-[94dvh]` and body padding `p-3.5 sm:p-6` (`L914`).
  - `EditModalHeader.jsx:31`: Change `px-6 py-4` to `px-4 py-3 sm:px-6 sm:py-4`, and close button (`L119`) to `w-9 h-9 sm:w-8 sm:h-8`.
  - `EditModalFooter.jsx:15-92`:
    - Change container to `px-3.5 py-3 sm:px-6 sm:py-3.5 flex flex-wrap items-center justify-between gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]`.
    - `L30`: Change `hidden sm:inline-flex` on `Listing Copy` button to `inline-flex` so iPhone users can open Listing Copy from Edit Item Modal.
    - Hide the redundant center `"All changes saved"` text on `<640px` (`hidden md:block`) so action buttons have full width on mobile.
  - `EditTabFinancials.jsx`:
    - `L1005`: Change `flex items-center gap-2` to `flex flex-col sm:flex-row items-stretch sm:items-center gap-2`.
    - `L1347-1474`: Make the Accounting Waterfall rows responsive (`grid-cols-12`): use `col-span-7 sm:col-span-6` for Line Item, `hidden sm:block sm:col-span-3` for Calculation Basis (with an inline mobile subtitle `<span className="block sm:hidden text-[10px] text-slate-500 font-normal">...</span>` under the Line Item), and `col-span-5 sm:col-span-3` for Amount.

#### 1.6 AddInvoiceModal Multi-Column Crushing on iPhone 18 Pro
- **File & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/AddInvoiceModal.jsx` (Lines 176-406)
- **Issues**:
  1. `L238`: Step 1 `Total Discount`, `Total Shipping`, `Total Tax` uses `grid-cols-3 gap-4` unconditionally. On `402px` iPhone, each input is `~95px` wide with a left icon (`pl-9`), clipping numbers and labels (`Total Discount ($)` wraps to 2 lines).
  2. `L300-386`: Step 2 Line Items grid uses `grid-cols-12 gap-3` where Category (`col-span-4`), Authenticator (`col-span-4`), Unit Price (`col-span-4`), Platform (`col-span-4`), Est Shipping (`col-span-4`), Margin % (`col-span-4`), Status (`col-span-4`), and Notes (`col-span-8`) are hardcoded at 3 columns per row even on `402px` portrait mobile.
  3. `L194-208` & `L392-402`: Step indicator and Step 2 footer lack `flex-wrap`, overflowing when `Base / Landed` totals or item counts appear.
- **Target Tailwind/CSS Fixes**:
  - `L177`: Change `mx-4` to `mx-3 sm:mx-4 max-h-[92dvh] flex flex-col overflow-hidden`, and header/body padding from `px-6`/`p-6` to `px-4 sm:px-6` / `p-4 sm:p-6`.
  - `L194`: Add `flex-wrap` to the Step indicator bar.
  - `L238`: Change `grid-cols-3 gap-4` to `grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4`.
  - `L314, 321, 328, 343, 348, 353, 360, 368, 376, 383`: Change `col-span-4` to `col-span-12 sm:col-span-4`, `col-span-6` to `col-span-12 sm:col-span-6`, and `col-span-8` to `col-span-12 sm:col-span-8`.
  - `L392`: Change Step 2 footer to `flex flex-wrap items-center justify-between gap-3 mt-5 pt-4`.

#### 1.7 SalesLogView Mobile Card Layout, Touch Inline Editing & Action Targets
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/SalesLogView.jsx` (Lines 320-460, 530-915)
  - `e:/TechTrekGT/outpost/src/components/ui/InlineEditableCell.jsx` (Lines 60-83, 187-198)
- **Issues**:
  1. `SalesLogView.jsx:537`: Uses `table-fixed` (`~945px` wide) with no mobile card view on `<640px`, and does not pass `onMobileFallback` to `InlineEditableCell`.
  2. `InlineEditableCell.jsx:67-72`: Blocks inline editing on `<640px` (`if (isMobile()) { if (onMobileFallback) onMobileFallback(); return; }`), so tapping/double-tapping a cell in `SalesLogView` on iPhone 18 Pro does nothing at all.
  3. `InlineEditableCell.jsx:192`: Uses `onDoubleClick={handleStartEditing}`, which is intercepted by iPadOS Safari double-tap zoom or ignored on touchscreens.
  4. `SalesLogView.jsx:829-859`: Row action buttons (`Reconcile Fees`, `Edit`, `Delete`) are `w-5 h-5` (`20x20px`) with `gap-0.5` (`2px`), causing severe mis-tap risk between `Edit` and `Delete` on touch screens.
- **Target Tailwind/CSS Fixes**:
  - In `InlineEditableCell.jsx`:
    - Allow touch tap activation on coarse pointers (`onClick` when `window.matchMedia('(pointer: coarse)').matches`) or pass `onMobileFallback={() => handleOpenEditSale(sale)}` from `SalesLogView.jsx` so tapping a sale metric on `<640px` opens `LogSaleModal` (or edits inline on iPad touch with single tap).
  - In `SalesLogView.jsx`:
    - Pass `onMobileFallback={() => handleOpenEditSale(sale)}` to all `InlineEditableCell` instances (`L686, 704, 725, 744`).
    - Increase row action buttons (`L829-859`) from `w-5 h-5` (`gap-0.5`) to `w-8 h-8 sm:w-6 sm:h-6` (`gap-1.5 sm:gap-1`) so `Reconcile`, `Edit`, and `Delete` are safely tappable on iPhone and iPad.
    - Add a responsive mobile card list (`<div className="sm:hidden divide-y divide-slate-800/60">`) in `SalesLogView.jsx` (or responsive card toggle) showing item title, platform badge, sale date, Gross, COGS, Fees, Net Proceeds, Net Profit, ROI badge, and touch-friendly `Reconcile`, `Edit`, and `Delete` buttons on `<640px`.

#### 1.8 ListingMatchReviewModal & SoldEbayVineMatcherModal Mobile Overflow
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/ListingMatchReviewModal.jsx` (Lines 106-189, 545-560)
  - `e:/TechTrekGT/outpost/src/components/inventory/SoldEbayVineMatcherModal.jsx` (Lines 204-307, 338-365, 503-542, 560-748)
- **Issues**:
  1. `ListingMatchReviewModal.jsx:129-188`: The 3 tab buttons (`Suggested Matches`, `Unmatched Inventory`, `All Active eBay Listings`) with full text labels overflow `402px` horizontally without `overflow-x-auto`. Also, Tab 3 (`L545-559`) places a paragraph and a fixed `w-64` search input side-by-side without `flex-wrap`.
  2. `SoldEbayVineMatcherModal.jsx`:
     - `L205`: Uses fixed `h-[90vh]` instead of `h-[90dvh] max-h-[90dvh]`.
     - `L244-306`: Tab bar + `Quick Stats Toolbar` (`Sold eBay Orders: X · VScout Catalog Items: Y`) are in a single `flex items-center justify-between` row without `flex-wrap` or `overflow-x-auto`, crushing the 3 tabs on iPhone 18 Pro and iPad Portrait.
     - `L338`: Batch Action Bar (`flex items-center justify-between gap-4`) lacks `flex-wrap`.
     - `L503`: Card Action Footer (`Change Pair...` + `Confirm Match & Reconcile`) lacks `flex-wrap`.
- **Target Tailwind/CSS Fixes**:
  - `ListingMatchReviewModal.jsx`:
    - `L107`: Change `max-h-[90vh]` to `max-h-[90dvh]`.
    - `L129-130`: Add `flex-wrap gap-2` to outer bar and `overflow-x-auto max-w-full flex-nowrap` to the inner tab pill container (`whitespace-nowrap` on buttons).
    - `L545-549`: Add `flex-wrap` to the header row and `w-full sm:w-64` on the search wrapper.
  - `SoldEbayVineMatcherModal.jsx`:
    - `L205`: Replace `h-[90vh]` with `h-[92dvh] max-h-[92dvh]`.
    - `L208, 244, 309`: Reduce mobile padding (`px-4 sm:px-6`, `p-4 sm:p-6`), add `flex-wrap gap-2 overflow-x-auto` to the tab bar (`L244`), and hide or wrap the Quick Stats toolbar (`L301`) on `<640px` (`hidden md:flex`).
    - `L338` & `L503`: Add `flex-wrap gap-2` so search input and batch confirm buttons stack cleanly on `<640px`.

---

### Severity 2: MODERATE Usability, Overflow & Touch Ergonomics

#### 2.1 Executive Dashboard & MarketAlertsPanel Touch Fixes
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/DashboardView.jsx` (Lines 126-207, 217-323, 357-374, 386-423, 471-501)
  - `e:/TechTrekGT/outpost/src/components/dashboard/MarketAlertsPanel.jsx` (Lines 125-138)
- **Target Tailwind/CSS Fixes**:
  - `MarketAlertsPanel.jsx:129`: Change `opacity-0 group-hover:opacity-100` on the dismiss button to `opacity-100 lg:opacity-0 lg:group-hover:opacity-100 w-8 h-8 sm:w-6 sm:h-6` so iPhone and iPad users can dismiss market alerts.
  - `DashboardView.jsx:357`: Change the 4-tier aging distribution grid from `grid-cols-4 gap-2` to `grid-cols-2 sm:grid-cols-4 gap-2` so `31-60d (-10%)` and `61-90d (-20%)` labels do not clip on `402px`.
  - `DashboardView.jsx:395, 475`: Add `truncate` to the `<p className="text-[11px] text-slate-400 font-mono truncate">` metadata lines in Stagnant Listings and Unlisted Queue rows so long SKU/platform strings do not push action buttons off-screen.
  - `DashboardView.jsx:198`: Increase `#refresh-dashboard-btn` touch target to `w-10 h-10 sm:w-9 sm:h-9`.

#### 2.2 InventoryCommandBar Mobile Wrapping & Touch Ergonomics
- **File & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/inventory/InventoryCommandBar.jsx` (Lines 69-320)
- **Target Tailwind/CSS Fixes**:
  - `L70`: Make the search input full-width on mobile (`w-full sm:flex-1 sm:min-w-[180px] sm:max-w-xs`) so the search bar gets its own clean row on iPhone 18 Pro (`402px`).
  - `L100`: Allow the Status Segmented Tabs strip (`All`, `Listed`, `Available`, `Sold`, `VScout`) to scroll horizontally without wrapping (`overflow-x-auto max-w-full flex-nowrap`) with `whitespace-nowrap py-1.5` buttons.
  - `L169`: Give action buttons (`Table/Cards`, `Stats`, `Import`, `Amazon`, `Sync eBay`, `Match Sold`, `Reprice Engine`, `+ Invoice`, `Refresh`) a minimum touch height (`min-h-[36px] sm:min-h-0 py-1.5 sm:py-1`) and change `#refresh-inventory-btn` (`L310`) from `w-6 h-6` to `w-8 h-8 sm:w-7 sm:h-7`.

#### 2.3 AgingMarkdownModal, TaxReportModal & ViewInvoiceModal Table & Header Containment
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/inventory/AgingMarkdownModal.jsx` (Lines 155-182, 312-475)
  - `e:/TechTrekGT/outpost/src/components/TaxReportModal.jsx` (Lines 116-183)
  - `e:/TechTrekGT/outpost/src/components/ViewInvoiceModal.jsx` (Lines 64-112)
- **Target Tailwind/CSS Fixes**:
  - `AgingMarkdownModal.jsx`:
    - `L155`: Change `max-h-[92vh]` to `max-h-[92dvh]`, header/body padding to `px-4 sm:px-6` / `p-4 sm:p-6`.
    - `L312`: Add `overflow-x-auto` to `<div className="rounded-xl overflow-hidden overflow-x-auto border border-slate-800 bg-slate-950/60">` so the 9-column repricing table scrolls horizontally on iPhone 18 Pro and iPad Portrait instead of overflowing the modal.
  - `TaxReportModal.jsx`:
    - `L118`: Add `flex-wrap gap-3 px-4 sm:px-6 py-3.5 sm:py-4` to the modal header so the title and Year Selector / CSV / Print / Close controls wrap cleanly on `<640px`.
    - `L183`: Change `p-6 max-h-[78vh]` to `p-4 sm:p-6 max-h-[80dvh]`.
  - `ViewInvoiceModal.jsx`:
    - `L64`: Change `max-h-[92vh]` to `max-h-[92dvh]`.
    - `L94`: Change `hidden sm:inline-flex` on the `Pristine Dashboard` link to `inline-flex` (with compact label on `<640px`) so mobile users can open the external Pristine invoice link.

#### 2.4 ListingCopyModal & LogSaleModal Responsive Bars
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/ListingCopyModal.jsx` (Lines 440-478, 530-555, 801-821, 1031-1097, 1290-1325)
  - `e:/TechTrekGT/outpost/src/components/LogSaleModal.jsx` (Lines 351-372, 399-418, 721-746)
- **Target Tailwind/CSS Fixes**:
  - `ListingCopyModal.jsx`:
    - `L440`: Change `max-h-[90vh]` to `max-h-[92dvh]`.
    - `L442, 480`: Change `px-6`/`p-6` to `px-4 sm:px-6` / `p-4 sm:p-6`.
    - `L530`: Change Amazon lookup input + `Fetch from Amazon` button row to `flex flex-col sm:flex-row gap-2`.
    - `L1031`: Add `flex-wrap gap-2` to the Format Toggle (`Plain Text / HTML Preview / Raw HTML`) + Copy buttons row so it does not overflow on `402px`.
    - `L1290`: Add `flex-wrap gap-2 px-4 sm:px-6` to the modal footer.
  - `LogSaleModal.jsx`:
    - `L352`: Add `mx-3 sm:mx-4` and `px-4 sm:px-6` (`L354, 381`).
    - `L403`: Add `flex-wrap` to the selected item metadata row (`Category · Athlete · True Cost`).

#### 2.5 SettingsView & EbayConnectBanner Mobile Polish
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/SettingsView.jsx` (Lines 587-616, 1370-1392, 1757-1848, 2044-2072)
  - `e:/TechTrekGT/outpost/src/components/EbayConnectBanner.jsx` (Lines 202-250)
- **Target Tailwind/CSS Fixes**:
  - `SettingsView.jsx`:
    - `L587`: Make the 5-tab settings navigation bar horizontally scrollable on mobile (`flex flex-nowrap sm:flex-wrap overflow-x-auto gap-1.5 p-1.5`) with `flex-shrink-0 sm:flex-1` so tabs sit in a clean single swipeable strip on iPhone 18 Pro instead of a 3-row stack.
    - `L1370`: Change column visibility grid from `grid-cols-2 gap-2` to `grid-cols-1 min-[400px]:grid-cols-2 gap-2`.
    - `L1757, 1824, 2044`: Add `flex-wrap sm:flex-nowrap` to the API URL and Secret Key copy rows so `Reveal` and `Copy Key` buttons wrap cleanly on narrow viewports.

---

### Severity 3: POLISH & Touch Ergonomics

#### 3.1 CommandPalette, ConfirmModal, FinanceSyncModal, AmazonItemModal, SpreadsheetImporterModal & EditTabPerformance
- **Files & Line Ranges**:
  - `e:/TechTrekGT/outpost/src/components/ui/CommandPalette.jsx` (Lines 423-461)
  - `e:/TechTrekGT/outpost/src/components/AmazonItemModal.jsx` (Lines 239-262)
  - `e:/TechTrekGT/outpost/src/components/SpreadsheetImporterModal.jsx` (Lines 131-154, 374-406)
  - `e:/TechTrekGT/outpost/src/components/FinanceSyncModal.jsx` (Lines 78-105, 191-229)
  - `e:/TechTrekGT/outpost/src/components/edit/EditTabPerformance.jsx` (Lines 11-48)
- **Target Tailwind/CSS Fixes**:
  - `CommandPalette.jsx`:
    - `L423, 426, 460`: Add `pt-safe pb-safe` to full-screen mobile dialog (`h-[100dvh] sm:h-auto sm:max-h-[85dvh]`) and change `max-h-[calc(100vh-140px)]` to `max-h-[calc(100dvh-140px)]`.
  - `AmazonItemModal.jsx:239` & `SpreadsheetImporterModal.jsx:131`:
    - Change `max-h-[90vh]` to `max-h-[92dvh]` and reduce mobile horizontal padding (`px-4 sm:px-6`).
  - `FinanceSyncModal.jsx:191`:
    - Add `flex-wrap gap-2` to the footer action bar.
  - `EditTabPerformance.jsx:25`:
    - Ensure `InfoTooltip` popover stays within horizontal viewport bounds on `402px` screens (`max-w-[calc(100vw-2rem)]`).

---

## 4. Verification & Post-Approval Execution Protocol
Once the user replies with `"Plan approved, proceed with implementation"`:
1. Apply all surgical edits across the files listed above using `edit_file`.
2. Update `e:/TechTrekGT/outpost/docs/03_features.md` and `e:/TechTrekGT/outpost/docs/04_state.md` per the Mandatory Post-Flight Documentation Rule.
3. Run `npm run build` inside `e:/TechTrekGT/outpost/` and verify zero build or bundle errors.
4. Run `npm run deploy` inside `e:/TechTrekGT/outpost/` and verify live Cloudflare Worker deployment.

## 5. Re-plan If
- The user requests additional device breakpoints or changes to the proposed sticky-column or mobile-card behaviors before approving implementation.
