# Wayfinder Guide: Mobile-Friendliness & iPhone 18 Pro Viewport Audit Plan

**Target Viewport**: iPhone 18 Pro (`402x874` CSS logical pixels, `3x` DPR, iOS Safari/WebKit, Dynamic Island top inset, bottom home indicator).
**Application Path**: `e:/TechTrekGT/wayfinder/`
**Stack Constraints**: Pure JavaScript (JSX/ESM), React 19, Vite 6, Tailwind CSS 3.4 (dark-mode first), custom `pushState`/`popstate` routing under `/wayfinder/`, React Context + hooks only.

---

## 1. Viewport & Safe Areas (`index.html`, `src/index.css`, `Layout.jsx`, `BottomTabBar.jsx`)

### 1.1 [index.html](file:///e:/TechTrekGT/wayfinder/index.html)
- **Status**: Verified compliant (Lines 8-10).
- `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />` and `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />` are properly configured. No changes required.

### 1.2 [src/index.css](file:///e:/TechTrekGT/wayfinder/src/index.css)
- **Lines 46-51 (`.safe-pt`, `.safe-pb` & missing `.pb-safe` / `.pt-safe` utilities)**:
  - `DocumentCenter.jsx` (L806) uses `.pb-safe`, which is currently undefined in `src/index.css`.
  - Add `.pt-safe` (`padding-top: env(safe-area-inset-top, 0px);`) and `.pb-safe` (`padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px));`), and refine `.safe-pb` to `padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));` so `BottomTabBar` does not add excessive dead height while still clearing the iOS home indicator.
- **Lines 53-61 (`.no-scrollbar` & missing `.scrollbar-none` alias)**:
  - `PrivateHub.jsx` (L134), `ItineraryView.jsx` (L530, L570), `PolandLanding.jsx` (L1142), and `ExpenseLedger.jsx` (L797) use `scrollbar-none`, which is undefined in `src/index.css` or `tailwind.config.js`.
  - Add `.scrollbar-none` alongside `.no-scrollbar` so horizontal filter strips hide scrollbars cleanly on WebKit.
- **Lines 89-97 (`#root` `100vh` vs `100dvh` & iOS Auto-Zoom Guard)**:
  - Update `#root` (L93) to include `min-height: 100dvh;` after `min-height: 100vh;` to prevent iOS Safari dynamic address bar clipping.
  - Add a mobile WebKit form-control guard (`@media screen and (max-width: 640px) { input, select, textarea { font-size: 16px; } }`) as a baseline safety net against iOS Safari focus auto-zoom, complementing component-level `text-base sm:text-xs` / `text-base sm:text-sm` classes.

### 1.3 [src/components/Layout.jsx](file:///e:/TechTrekGT/wayfinder/src/components/Layout.jsx)
- **Line 56 (Root Wrapper Height)**:
  - Change `min-h-screen` to `min-h-screen min-h-[100dvh]` to prevent iOS Safari address bar bounce/clipping.
- **Line 64 (Sticky Header Dynamic Island Safe Area)**:
  - Add `pt-[env(safe-area-inset-top,0px)]` to `<header className="sticky top-0 z-50 ...">` so the sticky top navigation bar clears the iPhone 18 Pro Dynamic Island in standalone PWA and full-screen WebKit modes.
- **Lines 294-301 (Mobile Top Bar Currency Trigger Touch Target)**:
  - Change `px-2.5 py-1.5` on the mobile currency converter button to `px-3 py-2 min-h-[44px] min-w-[44px]` to meet the 44x44px touch target minimum.
- **Lines 325 & 352 (Main Content & Footer Bottom Clearance for `BottomTabBar`)**:
  - `BottomTabBar` is fixed at the bottom on `< md` viewports (~76-90px total height with safe-area inset). Update `<main>` (L325) from `pb-20 md:pb-0` to `pb-24 md:pb-0` and `<footer>` (L352) to include `pb-24 md:pb-8` so footer links and bottom cards are never obscured by the bottom navigation bar.

### 1.4 [src/components/BottomTabBar.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BottomTabBar.jsx)
- **Lines 35-36 (Bottom Bar Safe Area & Touch Targets)**:
  - Keep `z-50 safe-pb` on `<nav>`, and ensure each tab button/link (L54, L80) includes `min-w-[44px]` alongside `min-h-[56px]` for full 44x44px touch compliance across the 5-column grid on 402px width (~80px per column).

---

## 2. Horizontal Overflow & Grid/Flex Containment (402px Width Audit)

### 2.1 [src/components/DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx)
- **Lines 213-295 (Modal Header Overflow on 402px)**:
  - Currently, the header is a single non-wrapping `flex items-center justify-between` row containing an icon, title, subtitle (`doc.filename` without `truncate` on L239), plus up to 4 buttons (`Replace File`, `New Tab`, `Download` with visible text, and `Close`). On 402px width, this squeezes the title container to near-zero width and overflows horizontally.
  - **Fix**:
    - Add `truncate` to the `<p>` subtitle showing `doc.filename` (L239).
    - Hide button text labels on `< sm` screens (`<span className="hidden sm:inline">Download</span>`) or wrap the header into a responsive two-row layout (`flex-wrap gap-2`) on mobile while keeping `min-h-[44px] min-w-[44px]` on all icon buttons.

### 2.2 [src/components/DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)
- **Lines 839-878 (Selected Document Detail Modal Header Overflow)**:
  - Header row puts the document title, status pill, `Review Extracted Fields` button, `Rename` button, `Delete` button, and `X` close button in a single `flex items-center justify-between` row without wrapping, overflowing 402px width.
  - **Fix**: Change header container (L839) to `flex flex-col sm:flex-row sm:items-center justify-between gap-3`, add `min-w-0` to the title block (L840), and `flex-wrap gap-1.5` to the action buttons container (L848).
- **Line 1255 (Unbreakable URLs in `selectedBooking.notes`)**:
  - Change `whitespace-pre-wrap` to `whitespace-pre-wrap break-words [overflow-wrap:anywhere]` so long GetYourGuide / airline confirmation URLs in booking notes wrap cleanly inside the 402px modal.

### 2.3 [src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx)
- **Line 613 (Synced Bookings Callout Banner)**:
  - Change `flex items-center justify-between` to `flex flex-wrap items-center justify-between gap-2` so the `"Manage Documents ->"` action does not collide with the banner text on 402px width.
- **Lines 852-903 (Timeline Event Card Header & Polish Address Link)**:
  - Add `min-w-0` to `<div className="flex items-center space-x-2.5 min-w-0">` (L853) and its child `<div className="min-w-0 flex-1">` (L872).
  - On the Google Maps location link (L896), change `max-w-fit` to `max-w-full min-w-0` and add `break-words` on the address `<span>` (L899) so long Polish street addresses wrap instead of overflowing the card.

### 2.4 [src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx)
- **Lines 480-519 (Master Timeline Event Card Header)**:
  - Add `min-w-0` to `<div className="flex items-center space-x-2.5 min-w-0">` (L481) and `<div className="min-w-0 flex-1">` (L500), and `break-words` to the location link `<span>` (L514).
- **Line 1096 (Route Map Footer Status Text)**:
  - Add `flex-wrap` to `<span className="text-emerald-400 font-medium flex flex-wrap items-center gap-1.5">`.

### 2.5 [src/components/itinerary/PrivateBookingCard.jsx](file:///e:/TechTrekGT/wayfinder/src/components/itinerary/PrivateBookingCard.jsx)
- **Lines 254-286 (Private Booking Card Header & Location Link)**:
  - Add `min-w-0` to `<div className="flex items-center space-x-2.5 min-w-0">` (L255) and `<div className="min-w-0 flex-1">` (L259).
  - On the location link (L275), replace `max-w-fit` with `max-w-full min-w-0` and add `break-words` to the address `<span>` (L279).

### 2.6 [src/components/budget/PersonBreakdownPanel.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/PersonBreakdownPanel.jsx)
- **Lines 417-441 (2-Column Paid vs Fair Share Grid)**:
  - Add `min-w-0` to both grid children (`<div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5 min-w-0">`) on L418 and L430 so `truncate` on currency figures works without pushing grid columns past 402px.

### 2.7 [src/components/budget/ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx)
- **Lines 1048-1058 (Settlement Payment Log Row)**:
  - Change `flex items-center justify-between` (L1050) to `flex flex-wrap sm:flex-nowrap items-center justify-between gap-2` and change inner `flex items-center space-x-2 min-w-0` (L1052) to `flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0` so 4 `shrink-0` spans (`from_user_name`, `settled with`, `to_user_name`, `via ...`) do not overflow 402px width.

### 2.8 [src/components/admin/AdminView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/admin/AdminView.jsx)
- **Lines 537-557 (Trip Card Header & Owner Email)**:
  - Add `min-w-0` to `<div className="flex items-center gap-3 min-w-0">` (L538) and `<div className="min-w-0">` (L542), and `break-all sm:break-normal` to the owner email `<span>` (L551).
- **Lines 657-668 (Pending Invites Row)**:
  - Add `min-w-0 gap-2` to the row container (L658) and `truncate min-w-0` to `<span className="text-slate-300 truncate min-w-0">{inv.email}</span>` (L660).

---

## 3. Touch Targets (`>= 44x44px`), Modals (`dvh` & Stacking) & iOS WebKit Quirks (`>= 16px` Inputs)

### 3.1 Modal Viewport Height (`dvh`), Stacking Context (`z-[100]`), & Close Button Touch Targets
On mobile (`< md`), `BottomTabBar` and sticky `<header>` both use `z-50`. Any modal using `z-50` instead of `z-[100]` risks stacking collision with the bottom bar, and `90vh` instead of `90dvh` can clip behind the iOS Safari toolbar.
- **[src/components/CurrencyConverterModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/CurrencyConverterModal.jsx)**:
  - Line 98: Add `max-h-[90dvh] overflow-y-auto` to modal panel so it scrolls internally on landscape/compact viewports.
  - Line 107: Increase close button from `p-1` to `p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center`.
- **[src/components/SettingsModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/SettingsModal.jsx)**:
  - Line 26: Change `max-h-[90vh]` to `max-h-[90dvh]`.
  - Line 38: Increase close button from `p-2` to `p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center`.
- **[src/components/AuthModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/AuthModal.jsx)**:
  - Line 182: Change `max-h-[85vh]` to `max-h-[85dvh]`.
  - Line 214: Increase close button from `p-1.5` to `p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center`.
- **[src/components/ShareAgendaModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ShareAgendaModal.jsx)**:
  - Lines 94-95: Upgrade backdrop from `z-50` to `z-[100]` and panel from `max-h-[90vh]` to `max-h-[90dvh]`.
  - Line 101: Upgrade bare close button (`<button onClick={onClose} className="text-wf-muted hover:text-white">`) to `p-2.5 min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-wf-muted hover:text-white hover:bg-white/10`.
- **[src/components/calendar/CalendarSubscribeModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/calendar/CalendarSubscribeModal.jsx)**:
  - Lines 106-108: Upgrade backdrop from `z-50` to `z-[100]` and panel from `max-h-[90vh]` to `max-h-[90dvh]`.
  - Line 125: Add `min-h-[44px] min-w-[44px] flex items-center justify-center` to close button.
- **[src/components/DocumentViewerModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentViewerModal.jsx)**:
  - Line 210: Update inline height from `min(92vh, 920px)` to `min(90dvh, 920px)`.
  - Lines 251, 267, 279, 288: Ensure header action and close buttons have `min-h-[44px] min-w-[44px] flex items-center justify-center`.
- **[src/components/DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)**:
  - Lines 755, 838, 908, 1064: Replace `90vh` with `90dvh`.
  - Lines 768, 872, 949, 1094, 1451: Add `min-h-[44px] min-w-[44px] flex items-center justify-center` to all modal close (`X`) buttons.
  - Lines 1353, 1405, 1416: Make the hover-only title rename button (`opacity-0 group-hover/title:opacity-100`) visible on touch devices (`opacity-100 sm:opacity-0 sm:group-hover/title:opacity-100`), and expand card action buttons (L1405, L1416) from `p-1` to `p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center`.
- **[src/components/budget/ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx)**:
  - Lines 1083-1085, 1338-1339, 1409-1410: Upgrade modal backdrops from `z-50` to `z-[100]` and `max-h-[90vh]` to `max-h-[90dvh]`.
  - Lines 1103 & 1419: Expand modal close (`✕`) buttons to `min-h-[44px] min-w-[44px] flex items-center justify-center`.
  - Lines 1015 & 1024: Expand Edit/Delete expense row icon buttons from `p-1.5` to `p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center`.
- **[src/components/common/OfflineSyncBadge.jsx](file:///e:/TechTrekGT/wayfinder/src/components/common/OfflineSyncBadge.jsx)**:
  - Line 180: Upgrade modal backdrop from `z-50` to `z-[100]`.
  - Line 202: Expand modal close button from `p-1` to `p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center`.
- **[src/components/RouteVisualization.jsx](file:///e:/TechTrekGT/wayfinder/src/components/RouteVisualization.jsx)**:
  - Lines 52 & 59 (`StationDossierModal`): Upgrade backdrop from `z-50` to `z-[100]`, `max-h-[90vh]` to `max-h-[90dvh]`, and close button (L85) to `min-h-[44px] min-w-[44px] flex items-center justify-center`.

### 3.2 Interactive Touch Targets (`>= 44x44px`) Across Views & Cards
- **[src/components/PolandLanding.jsx](file:///e:/TechTrekGT/wayfinder/src/components/PolandLanding.jsx)**:
  - Lines 405-435 (Timeline Reorder Up/Down/Grip Buttons): Increase padding from `p-0.5` (~16x16px) to `p-2 min-h-[36px] min-w-[36px] sm:p-1 sm:min-h-0 sm:min-w-0 flex items-center justify-center` so travelers can tap Up/Down on mobile without mis-tapping the card.
  - Lines 980 & 1020 (3D Route Map Interactive City Nodes & Train/Flight Pills): Add invisible touch-target hit-area expansion `relative before:absolute before:-inset-2 before:content-['']` so the visual sizes and coordinates remain 100% identical (preserving the non-overlapping invariant in `docs/04_state.md` Section 16.20) while expanding touch hit targets to >= 44x44px.
- **[src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx)**:
  - Lines 785-815 (Timeline Reorder Up/Down/Grip Buttons): Increase mobile touch target to `p-2 min-h-[36px] min-w-[36px] sm:p-1 sm:min-h-0 sm:min-w-0 flex items-center justify-center`.
- **[src/components/packing/PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx)**:
  - Line 1028 (Item Pack/Unpack Checkbox Button): Expand from `p-1` to `p-2.5 -m-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center`.
  - Lines 1068-1096 (Quantity `-` / `+` Stepper & Delete Buttons): Expand stepper buttons to `px-2.5 py-1.5 min-h-[36px] min-w-[36px]` and delete button (L1092) to `p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center`.
- **[src/components/city/CityFoodTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityFoodTab.jsx)** & **[src/components/city/CityLgbtqTab.jsx](file:///e:/TechTrekGT/wayfinder/src/components/city/CityLgbtqTab.jsx)**:
  - Increase card footer action buttons (`Website`, `Directions`, `View on Map`, `+ Itinerary` in `CityFoodTab.jsx` L224-260 and `CityLgbtqTab.jsx` L127-190, L313-350, L418-455) from `min-h-[34px]` to `min-h-[44px] sm:min-h-[38px]`.

### 3.3 iOS Safari Auto-Zoom Prevention (`text-base` / 16px on `<input>`, `<select>`, `<textarea>`)
Update mobile font size classes on form controls from `text-xs` / `text-sm` to `text-base sm:text-xs` or `text-base sm:text-sm`:
- **[src/components/ItineraryView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ItineraryView.jsx)**: Search input (L486) -> `text-base sm:text-xs`.
- **[src/components/SettingsModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/SettingsModal.jsx)**: Delete confirmation input (L250) -> `text-base sm:text-xs`.
- **[src/components/AuthModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/AuthModal.jsx)**: Inputs & select on L247, L265, L322, L338, L356, L379, L397, L412 -> `text-base sm:text-sm` (and `text-base sm:text-xs` on L338).
- **[src/components/DocumentCenter.jsx](file:///e:/TechTrekGT/wayfinder/src/components/DocumentCenter.jsx)**: Extracted field inputs (L799) & rename input (L1468) -> `text-base sm:text-sm`.
- **[src/components/BookingImportChannels.jsx](file:///e:/TechTrekGT/wayfinder/src/components/BookingImportChannels.jsx)**: Forwarding email input (L146) -> `text-base sm:text-sm`.
- **[src/components/ShareAgendaModal.jsx](file:///e:/TechTrekGT/wayfinder/src/components/ShareAgendaModal.jsx)**: `field` class (L91), invite link input (L122), role select (L138) -> `text-base sm:text-sm` / `text-base sm:text-xs`.
- **[src/components/InviteClaim.jsx](file:///e:/TechTrekGT/wayfinder/src/components/InviteClaim.jsx)**: `inputClass` (L155) -> `text-base sm:text-sm`.
- **[src/components/packing/PackingManager.jsx](file:///e:/TechTrekGT/wayfinder/src/components/packing/PackingManager.jsx)**: Custom item inputs/selects (L750, L764, L780, L799, L814, L828) and search input (L915) -> `text-base sm:text-xs`.
- **[src/components/budget/ExpenseLedger.jsx](file:///e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx)**: Search input (L824), Add Expense form controls (L1085, L1219, L1268), Settle selects (L1367, L1450) -> `text-base sm:text-xs` / `text-base sm:text-sm`.
- **[src/components/admin/AdminView.jsx](file:///e:/TechTrekGT/wayfinder/src/components/admin/AdminView.jsx)**: Role selects (L624, L708, L843) and user search input (L762) -> `text-base sm:text-xs`.

---

## 4. Verification & Post-Flight Planning

1. **Automated Build & Cloudflare Deployment (Post-Approval)**:
   - Run `npm run build` in `e:/TechTrekGT/wayfinder` and verify zero bundle or lint errors.
   - Run `npm run deploy` in `e:/TechTrekGT/wayfinder` to deploy to Cloudflare Workers and verify live status.
2. **Browser DevTools Mobile Viewport Emulation (`402x874`, 3x DPR, Touch Simulation)**:
   - Emulate iPhone 18 Pro (`402x874` logical resolution, touch enabled) across:
     - `/wayfinder/poland-christmas-2026` (Landing hero, 3D route map pills, day timeline cards, city preview tabs).
     - `/wayfinder/poland-christmas-2026/krakow` (and `/markets`, `/attractions`, `/restaurants`, `/hotels`, `/lgbtq`, `/history`).
     - `/wayfinder/poland-christmas-2026/route` (Sticky horizontal city tabs, `StationDossierModal`).
     - `/wayfinder/poland-christmas-2026/practical` (Emergency numbers, transit tables, cultural tips).
     - `/wayfinder/poland-christmas-2026/private` (`ItineraryView`, `DocumentCenter`, `DocumentViewerModal`, `ExpenseLedger`, `PersonBreakdownPanel`, `PackingManager`, `CurrencyConverterModal`, `SettingsModal`, `ShareAgendaModal`, `CalendarSubscribeModal`).
   - Confirm `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (`402px`) on every route and modal state.
   - Confirm all interactive controls meet `>= 44x44px` touch target sizing and `<input>` / `<select>` elements compute to `>= 16px` font size on mobile.
3. **Post-Flight Documentation Synchronization**:
   - Update `e:/TechTrekGT/wayfinder/docs/03_features.md` and `e:/TechTrekGT/wayfinder/docs/04_state.md` to record the iPhone 18 Pro (`402x874`) mobile responsiveness, `100dvh` modal/layout hardening, safe-area inset support, and touch-target / auto-zoom safeguards.

