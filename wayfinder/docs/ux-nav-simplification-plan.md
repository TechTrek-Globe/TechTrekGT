# Wayfinder UX/Nav Simplification - Implementation Plan

**Branch:** `feature/ux-nav-simplification`
**Date:** 2026-10-24
**Status:** Awaiting user approval

---

## 1. Problem Diagnosis

After auditing every component in the navigation tree, the following friction points were identified:

### 1.1 Two-Step Entry Funnel (Redundant Landing)

The user currently travels through **three layers** before reaching actionable content:

```text
/wayfinder  (WayfinderLanding - choose a trip)
  -> /wayfinder/poland-christmas-2026  (PolandLanding - hero + city grid)
    -> /wayfinder/poland-christmas-2026/cities/:id  (CityPage)
```

`WayfinderLanding` is a gateway page with only one real destination (Poland 2026) and a grey placeholder. It adds a dead click with zero value.

### 1.2 Competing Top-Level Pages With Overlapping Content

The following standalone pages all live at the same routing depth and duplicate content already inside CityPage tabs:

| Route             | Page                 | Overlap                                        |
| ----------------- | -------------------- | ---------------------------------------------- |
| `/markets`        | `MarketsPage`        | Duplicates CityPage "Christmas Markets" tab    |
| `/stays-and-food` | `StaysAndFoodPage`   | Duplicates CityPage "Food" and "Hotels" tabs   |
| `/practical`      | `PracticalPage`      | Standalone; no equivalent city tab - KEEP      |
| `/route`          | `RouteVisualization` | Duplicates route track already on PolandLanding |
| `/itinerary`      | `ItineraryView`      | Auth-adjacent; competes with PrivateHub        |

The PolandLanding "The Strategy" section links to `/markets` and `/rail` - two more exits splitting focus. The result is a star-pattern where users jump from almost any page to almost any other with no clear hierarchy.

### 1.3 Global Header is Cluttered on Mobile

Sticky header contains: Logo / Launch Pad / Itinerary / Currency Converter / Settings / Sign In. Mobile collapses to: Currency button + hamburger. The mobile menu lists 7 competing items.

### 1.4 CityPage Sub-Tab Bar Overflows on Mobile

Up to **7 horizontal tabs**: Overview, History, Markets, Attractions, Food, Hotels, LGBTQ+. On 375px screens this forces horizontal scrolling - disorienting when navigating in cold weather.

### 1.5 Itinerary Route Ambiguity

`/itinerary` is accessible from 3 places (header, PolandLanding, PrivateHub) and renders `ItineraryView` both as a standalone page and inside `PrivateHub`. Confusing about whether it is public or private.

---

## 2. Design Principles

1. **One Tap to Action:** Never more than one tap from any screen to the most important next step.
2. **Context-Aware Navigation:** Header and bottom bar adapt to where the user is.
3. **Mobile-First Thumb Zone:** All primary actions in the lower 40% of the screen.
4. **Collapse Redundancy:** Standalone pages duplicating CityPage tab content are retired.
5. **Progressive Disclosure:** Surface only what is relevant at each depth.

---

## 3. Proposed Navigation Architecture

### 3.1 Flatten the Entry Funnel

**Before:**

```text
/wayfinder -> PolandLanding -> CityPage
```

**After:**

```text
/wayfinder  -> redirects immediately to /wayfinder/poland-christmas-2026
```

`PolandLanding` becomes the true root. `WayfinderLanding.jsx` is NOT deleted - just no longer the default route. It can be reinstated at `/wayfinder/destinations` when a second trip is added.

**Files affected:**

- `src/App.jsx` - change `/wayfinder` route to render `<PolandLanding />` directly.

---

### 3.2 Retire Redundant Standalone Pages - Fold Into City Tabs

The following top-level pages are retired as primary navigation destinations. Their routes become redirects to preserve bookmarks.

| Retired Route     | Redirect Target          | Rationale                                       |
| ----------------- | ------------------------ | ----------------------------------------------- |
| `/markets`        | `/poland-christmas-2026` | Market content lives in each city's Markets tab |
| `/stays-and-food` | `/poland-christmas-2026` | Hotel/food content in city Hotels + Food tabs   |
| `/route`          | `/poland-christmas-2026` | Route map already exists on PolandLanding       |

`PracticalPage` (`/practical`) is **kept and promoted** - most valuable on-the-ground resource.

**Files affected:**

- `src/App.jsx` - repurpose route blocks for 3 retired pages as redirects.

---

### 3.3 New Global Navigation: Bottom Tab Bar (Mobile) + Slim Top Bar (Desktop)

#### Mobile: Persistent Bottom Navigation Bar

Replace the hamburger menu with a **5-slot bottom tab bar** pinned above the iOS safe area.

```text
[ Cities ] [ Schedule ] [ Practical ] [ Currency ] [ Hub ]
 (map pin)  (calendar)   (backpack)    (coins)    (shield)
```

The bottom bar is visible on all screens except modals/overlays.

**Active state:** Relevant tab glows amber-400. Cities tab active on PolandLanding or any CityPage.

**Implementation:** New `BottomTabBar.jsx` component rendered inside `Layout.jsx`, hidden on desktop (`md:hidden`).

#### Desktop: Slim Sticky Header

Simplified to **3-4 items** maximum:

```text
[Logo] ----spacer---- [Practical Guide] [Currency: zł X.XX] [Sign In / Hub]
```

"Destinations", "Poland 2026", and "Itinerary" links are removed from the top bar entirely. On desktop, the PolandLanding city grid IS the navigation.

**Files affected:**

- `src/components/Layout.jsx` - major surgical edit to nav links + add BottomTabBar.
- New file: `src/components/BottomTabBar.jsx`

---

### 3.4 Simplify CityPage Sub-Tab Bar (7 tabs -> 5 tabs max)

"History & Timeline" is high-interest but rarely needed in the field. Proposed change:

- **Remove** "History & Timeline" from the primary tab strip.
- Add a "Read City History" expandable card **inside the Overview tab** instead.
- Reduce to max **5 visible tabs**: Overview / Markets / Sights / Food / Stays
- Rename "LGBTQ+" to "Safe Spaces" for better clarity on small screens.
- Add a subtle horizontal scroll indicator arrow on mobile.

**Tab consolidation mapping:**

| Old Tab Label      | New Label          | Change                                     |
| ------------------ | ------------------ | ------------------------------------------ |
| Overview           | Overview           | No change                                  |
| History & Timeline | (removed from bar) | Moved into Overview as "Read History" card |
| Christmas Markets  | Markets            | Label shortened                            |
| Must-See Sights    | Sights             | Label shortened                            |
| Food & Drink       | Food               | Label shortened                            |
| Lodging & Stays    | Stays              | Label shortened                            |
| LGBTQ+ Guide       | Safe Spaces        | Renamed                                    |

**Files affected:**

- `src/components/CityPage.jsx` - tab bar JSX, label strings, activeSubPage normalization.
- `src/components/city/CityOverviewTab.jsx` - add "Read City History" inline card.

---

### 3.5 Itinerary Clarification: Public Summary vs. Private Hub

**Current problem:** `/itinerary` linked from header, PolandLanding, and PrivateHub.

**Solution:**

- The bottom bar "Schedule" slot links to `/wayfinder/poland-christmas-2026/private` (PrivateHub gates unauthenticated users gracefully with a Sign In CTA).
- `/wayfinder/poland-christmas-2026/itinerary` and `/timeline` aliases redirect to `/private`.
- The PolandLanding "10-Day Itinerary" button updated to link to `/private`.
- Remove standalone Itinerary link from desktop header.

**Files affected:**

- `src/App.jsx` - redirect `/itinerary` and `/timeline` routes to `/private`.
- `src/components/PolandLanding.jsx` - update "10-Day Itinerary" href to `/private`.
- `src/components/Layout.jsx` - remove standalone Itinerary link from desktop nav.

---

### 3.6 PolandLanding Cleanup: Remove Competing Links

The "The Strategy" section's two nav links ("Market Timing" -> `/markets`, "Rail Connections" -> `/rail`) navigate to pages being retired. Replace them with **inline static summary text panels** - no navigation required.

**Files affected:**

- `src/components/PolandLanding.jsx` - replace 2 nav link rows with static text cards in the Strategy section.

---

## 4. New File to Create

| File                              | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `src/components/BottomTabBar.jsx` | Mobile persistent 5-slot bottom navigation |

No other new files. All changes are surgical edits to existing files.

---

## 5. Files to Edit (Summary)

| File                                     | Change                                           | Estimated Scope |
| ---------------------------------------- | ------------------------------------------------ | --------------- |
| `src/App.jsx`                            | Route redirects + flatten entry                  | ~20 lines       |
| `src/components/Layout.jsx`              | Slim header + add BottomTabBar                   | ~60 lines       |
| `src/components/PolandLanding.jsx`       | Remove Strategy nav links; update itinerary href | ~15 lines       |
| `src/components/CityPage.jsx`            | Tab bar labels + remove History tab from bar     | ~30 lines       |
| `src/components/city/CityOverviewTab.jsx`| Add "Read City History" card                     | ~15 lines       |
| `src/components/BottomTabBar.jsx`        | New file                                         | ~80 lines       |

**Total estimated delta:** ~220 lines across 6 files. No files deleted. No data files touched.

---

## 6. Files NOT Touched

- `src/data/poland-2026.js`
- `src/components/city/City*.jsx` (except CityOverviewTab)
- `src/components/MarketsPage.jsx` (file kept, route redirects)
- `src/components/StaysAndFoodPage.jsx` (same)
- `src/components/RouteVisualization.jsx` (same)
- `src/components/CurrencyConverterModal.jsx`
- `src/components/AuthModal.jsx`
- `src/worker.js`
- All `src/context/` and `src/hooks/`
- All `docs/` files (updated post-flight after code is approved)

---

## 7. New Navigation Flow Diagram

### Before (current state)

```text
Header (desktop): Logo | Launch Pad | Poland 2026 | Itinerary | Currency | Settings | Sign In
Mobile header:    Logo | Currency button | Hamburger (7-item menu)

/wayfinder
  /poland-christmas-2026    <- PolandLanding
    /route                  <- RouteVisualization (duplicate of map on PolandLanding)
    /markets                <- MarketsPage (partial duplicate of city tabs)
    /stays-and-food         <- StaysAndFoodPage (partial duplicate of city tabs)
    /practical              <- PracticalPage
    /itinerary              <- ItineraryView standalone (also inside PrivateHub)
    /timeline               <- alias
    /cities/:id             <- CityPage (7-tab bar)
      /history, /markets, /attractions, /restaurants, /hotels, /lgbtq
    /private                <- PrivateHub (auth gate)
      /documents
```

### After (proposed state)

```text
Header (desktop): Logo | Practical Guide | Currency zł X.XX | Hub / Sign In
Bottom bar (mobile): [ Cities ] [ Schedule ] [ Practical ] [ Currency ] [ Hub ]

/wayfinder                  -> redirect to /poland-christmas-2026
/wayfinder/poland-christmas-2026    <- PolandLanding (new root)
  /practical                <- PracticalPage (promoted)
  /route                    -> redirect to /poland-christmas-2026
  /markets                  -> redirect to /poland-christmas-2026
  /stays-and-food           -> redirect to /poland-christmas-2026
  /itinerary                -> redirect to /private
  /timeline                 -> redirect to /private
  /cities/:id               <- CityPage (5-tab bar)
    (overview)              <- default (history now accessible from within)
    /markets, /attractions, /restaurants, /hotels, /lgbtq ("Safe Spaces")
    /history                <- still accessible via URL and Overview card link
  /private                  <- PrivateHub (auth gate - Schedule + Documents)
    /documents
```

---

## 8. Mobile Bottom Tab Bar Wireframe

```text
+--------------------------------------------------+
|  CONTENT AREA (scrollable)                       |
|                                                  |
|                                                  |
+--------------------------------------------------+
| [MapPin]  [Calendar] [Backpack] [Coins] [Shield] |
|  Cities   Schedule   Practical  Money   Hub      |
+---- bg-slate-950/95 | border-t border-white/10 --+
|         iOS safe area padding                    |
+--------------------------------------------------+
```

- Min tap target height: 56px per tab slot
- Active tab: icon `text-amber-400` + label `text-amber-300`
- Inactive tab: icon `text-slate-500` + label `text-slate-600`
- Hidden on `md:` breakpoint and above
- Renders in `Layout.jsx` below `<main>`, above `<footer>` (footer hidden on mobile)

---

## 9. Style Notes

- All new classes use the existing `wf-*` palette in `tailwind.config.js`
- No new custom classes needed
- Bottom bar uses `fixed bottom-0 left-0 right-0 z-50 safe-pb` consistent with existing `safe-pt` usage in Layout
- The `<main>` element gains `pb-20 md:pb-0` to avoid content hiding behind the bottom bar

---

## 10. Post-Flight Documentation Updates (After Code Approval)

After code is merged:

- `wayfinder/docs/02_arch.md` - update View Hierarchy section to reflect new route structure
- `wayfinder/docs/03_features.md` - update navigation feature descriptions
- `wayfinder/docs/04_state.md` - note BottomTabBar active state is component-local

---

## 11. Build and Deploy Sequence (Post-Approval)

Per workspace Mandatory Build and Deploy Loop rules:

1. `cd wayfinder && npm run build` - zero-error mandate
2. `npm run deploy` - Cloudflare Pages deployment
3. Confirm live at `https://techtrekgt.com/wayfinder/`

---

**Plan created. Waiting for user review.**
