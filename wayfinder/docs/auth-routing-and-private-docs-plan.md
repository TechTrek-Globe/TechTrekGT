# Wayfinder Guide: Auth Routing & Private Travel Document Isolation Plan

## 1. Executive Summary & Root Cause Analysis

Unauthenticated visitors to the Wayfinder Guide currently encounter two interconnected issues: private travel document triggers and confirmation details remain visible on public views, and clicking rail/flight triggers (or visiting protected/document routes directly) produces a PKP Intercity train ticket banner with a full SPA `404 - Not Found` error rendered underneath it.

### 1.1 Exact Mechanism of the PKP Banner + `404 - Not Found` Bug
1. **Ungated Private Document Triggers**:
   - In `wayfinder/src/components/PolandLanding.jsx`:
     - `JourneyStopSchedule` renders a `"View Document"` button beside the Kraków arrival badge (lines 269-279) without checking `isAuthenticated`.
     - Timeline travel cards (`isTravelCard = isTrainItem || isFlightItem`, lines 476-485) attach `onClick` -> `onOpenTravelDoc` and tooltip `"Click to view ticket and travel details"` without checking `isAuthenticated`.
     - Rail cards unconditionally render `"View PKP Rail Ticket & Transit Details"` and `"1st-Class PKP Intercity"` (lines 597-612).
     - Flight cards unconditionally render `"View Delta Flight Confirmation"` and `"Conf: GUDI3J"` (lines 615-630).
     - `handleOpenTravelDoc` (lines 835-949) does not validate `isAuthenticated` and constructs hardcoded ticket metadata containing confirmation `WN 71563945`, passenger names, and unbundled synthetic filenames (`Bilet - WN71563945.pdf`, `PKP_Intercity_Wroclaw_Poznan.pdf`, `PKP_Morning_Poznan_Torun.pdf`, `PKP_Coastal_Torun_Gdansk.pdf`, `Poland_Delta_Return.pdf`).
     - `<DocumentViewerModal>` (line 1419) is mounted unconditionally regardless of auth state.
   - In `wayfinder/src/components/city/CityOverviewTab.jsx`:
     - The Kraków airport transfer card renders a `"View Document"` button (lines 179-189) and mounts `<DocumentViewerModal>` (lines 304-307) with zero `useAuth()` / `isAuthenticated` check.
   - In `wayfinder/src/components/ItineraryView.jsx` (rendered on `/private` even for guests):
     - Timeline `isTravelCard` clicks (lines 667-676), `"View PKP Rail Ticket & Transit Details"` (lines 790-805), `"View Delta Flight Confirmation"` + `"Conf: GUDI3J"` (lines 808-823), and `handleOpenTravelDoc` (lines 207-321) are all ungated.
2. **Broken Guard in `DocumentViewerModal.jsx`**:
   - Line 10 imports `useAuth()` and destructures `isAuthenticated`, yet never checks it in `useEffect` (lines 58-125) or in the render guard (line 146 only checks `if (!isOpen) return null;` instead of `if (!isOpen || !isAuthenticated) return null;`). This violates the contract already documented in `wayfinder/docs/03_features.md` (Section 26) and `wayfinder/docs/04_state.md` (Section 16.7).
3. **Missing Static PDF + Cloudflare SPA Fallback Inside `<iframe>`**:
   - When opened on a rail item, `DocumentViewerModal.jsx` renders the amber `PKP Rail Travel Document` helper bar at the top (lines 328-361) and computes a static fallback path `${normalizedBase}Poland-2026/docs/${filename}` (lines 98-111) for files like `Bilet - WN71563945.pdf`.
   - Only three static PDFs actually exist in `wayfinder/public/Poland-2026/docs/`: `Poland_Delta.pdf`, `GetYourGuide_Ticket_GYG7VKK692WY.pdf`, and `Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`.
   - Because `wayfinder/wrangler.jsonc` sets `"not_found_handling": "single-page-application"`, requesting the missing PDF via `<iframe src="/wayfinder/Poland-2026/docs/Bilet - WN71563945.pdf#toolbar=1&view=FitH">` causes `worker.js` -> `env.ASSETS.fetch(...)` to return **HTTP 200 `index.html` (`text/html`)**.
   - The React SPA boots inside the `<iframe>` for path `/wayfinder/Poland-2026/docs/Bilet - WN71563945.pdf`, falls through `App.jsx` line 145, and paints the full `"404 - Not Found: The travel guide you're looking for doesn't exist."` page directly underneath the PKP Intercity ticket banner.

### 1.2 Additional Privacy & Protected Routing Gaps
- **Public Timeline / Navigation Leakage**:
  - `PolandLanding.jsx` line 59 (`stopTransitInfo.gdansk.nextTransitDetails`) includes flight code `DL9528` without an auth gate, and line 1102 map tooltips read `"... - Click to jump to schedule and view ticket"`.
  - `BottomTabBar.jsx` line 41 points unauthenticated mobile users' `Hub` tab href directly to `/wayfinder/poland-christmas-2026/private/documents`.
  - `PracticalPage.jsx` line 74 renders an `<a href="/wayfinder/poland-christmas-2026/private/packing">` link without gating or distinguishing guest vs authenticated behavior.
  - `CityHotelsTab.jsx` (lines 485, 515) and `RouteVisualization.jsx` (line 816) mount `<DocumentViewerModal>` unconditionally (triggers are already gated, so wrapping mounts adds defense-in-depth).
- **Protected Route / Auth Wrapper Gaps in `App.jsx`, `PrivateHub.jsx`, and `AdminView.jsx`**:
  - `/wayfinder/poland-christmas-2026/private` and `/private/*` subroutes render `<PrivateHub />` without an outer route guard. Unauthenticated visitors hitting `/private` see `ItineraryView` (with the leaked ticket triggers), and hitting `/private/expenses` mounts `ExpenseLedger` (which performs a 401 fetch and contains hardcoded participant fallback names).
  - Shorthand or document routes (`/wayfinder/private*`, `/wayfinder/documents*`, `/wayfinder/poland-christmas-2026/documents*`, `/wayfinder/Poland-2026/docs/*`, `/wayfinder/expenses`, `/wayfinder/budget`, `/wayfinder/ledger`, `/wayfinder/itinerary`, `/wayfinder/timeline`, `/wayfinder/packing`, `/wayfinder/poland-christmas-2026/packing`) are unhandled or partially mapped, falling through to `404 - Not Found` or `"Component under construction"`.
  - Deep links to a specific document ID (e.g., `/wayfinder/poland-christmas-2026/private/documents/<docId>`, `/wayfinder/documents/<docId>`) are not resolved or gated cleanly.
  - `AdminView.jsx` checks `!isAdmin` without checking `AuthContext.isLoading` or `isAuthenticated`, showing raw `"Access Denied"` (without a sign-in option) to guests and flashing `"Access Denied"` during initial reload while `/api/auth/me` is still resolving.

---

## 2. Architecture & Design Plan (Pure JS / JSX, Custom SPA Routing Only)

No TypeScript, no `react-router`, and no external state libraries will be introduced. All navigation continues using native `window.history.pushState` / `window.history.replaceState` and `PopStateEvent('popstate')`.

### 2.1 Reusable Authorization Wrapper (`wayfinder/src/components/ProtectedRoute.jsx`)
Create a pure JSX route guard component backed by `useAuth()`:
- **Loading State (`isLoading === true`)**: Renders a centered dark-theme spinner (`"Verifying session..."`) while `/api/auth/me` resolves. Prevents premature redirects or false `"Access Denied"` / sign-in screens on hard page reloads.
- **Unauthenticated State (`!isAuthenticated`)**:
  - Instead of showing a 404 or rendering private components/banners underneath, preserves the target URL in `window.location` (so logging in immediately transitions in-place to the requested route or document ID) and renders a clean, themed **"Sign In Required"** gateway panel explaining that private trip operations, travel documents, and reservations require authentication.
  - Provides a primary `"Sign In / Create Account"` button calling `setIsAuthModalOpen(true)` (plus a `"Return to Public Guide"` button navigating cleanly via `pushState` to `/wayfinder/poland-christmas-2026`).
  - Optionally triggers `setIsAuthModalOpen(true)` cleanly on mount only once per unauthenticated protected-route entry (with an inline prompt always remaining underneath if the user closes the modal, avoiding any dead-end or infinite loop).
- **Admin Role Enforcement (`requireAdmin === true`)**:
  - Only evaluated after `!isLoading && isAuthenticated`. If `!user?.isAdmin && user?.role !== 'admin'`, displays the clean `"Access Denied"` view with navigation back to `/wayfinder/poland-christmas-2026`.

### 2.2 Custom SPA Route Normalization & Protected Routing in `App.jsx`
Update `renderRoute()` in [wayfinder/src/App.jsx](file:///e:/TechTrekGT/wayfinder/src/App.jsx) using `window.history.replaceState` + `<ProtectedRoute>`:
- Helper `navigateReplace(targetPathWithQuery)` preserves `window.location.search` when appropriate during canonicalization so deep-link query params (`?day=`, `?doc=`, `?view=`) are retained.
- **Canonical Protected Routes & Shorthand Aliases (zero 404 / zero "under construction")**:
  1. `/wayfinder/private` and `/wayfinder/private/*` -> canonicalize to `/wayfinder/poland-christmas-2026/private/*` via `replaceState` and wrap `<PrivateHub />` in `<ProtectedRoute>`.
  2. `/wayfinder/documents`, `/wayfinder/documents/*`, `/wayfinder/poland-christmas-2026/documents`, `/wayfinder/poland-christmas-2026/documents/*` -> canonicalize to `/wayfinder/poland-christmas-2026/private/documents/*` (preserving any `:docId` suffix) via `replaceState` and wrap `<PrivateHub />` in `<ProtectedRoute>`.
  3. `/wayfinder/Poland-2026/docs/*` (when browser navigation hits SPA fallback) -> canonicalize to `/wayfinder/poland-christmas-2026/private/documents` via `replaceState` and wrap `<PrivateHub />` in `<ProtectedRoute>` so missing static doc URLs never show a raw `404 - Not Found` page.
  4. `/wayfinder/itinerary`, `/wayfinder/timeline`, `/wayfinder/poland-christmas-2026/itinerary`, `/wayfinder/poland-christmas-2026/timeline` -> canonicalize to `/wayfinder/poland-christmas-2026/private` via `replaceState` and wrap in `<ProtectedRoute>`.
  5. `/wayfinder/expenses`, `/wayfinder/budget`, `/wayfinder/ledger`, `/wayfinder/poland-christmas-2026/expenses`, `/wayfinder/poland-christmas-2026/budget`, `/wayfinder/poland-christmas-2026/ledger` -> canonicalize to `/wayfinder/poland-christmas-2026/private/expenses` via `replaceState` and wrap in `<ProtectedRoute>`.
  6. `/wayfinder/packing`, `/wayfinder/poland-christmas-2026/packing` -> canonicalize to `/wayfinder/poland-christmas-2026/private/packing` via `replaceState` and wrap in `<ProtectedRoute>`.
  7. `/wayfinder/poland-christmas-2026/private` and `/wayfinder/poland-christmas-2026/private/*` -> wrap `<PrivateHub currentPath={normalizedPath} />` in `<ProtectedRoute>`.
  8. `/wayfinder/gmail-callback` -> canonicalize to `/wayfinder/poland-christmas-2026/private/documents` inside `<ProtectedRoute>`.
  9. `/wayfinder/admin` and `/wayfinder/poland-christmas-2026/admin` -> wrap `<AdminView />` in `<ProtectedRoute requireAdmin>`.
- **Sub-view & Specific Document ID Handling in `PrivateHub.jsx` and `DocumentCenter.jsx`**:
  - Because `PrivateHub` sits inside `<ProtectedRoute>`, remove the partial unauthenticated `ItineraryView` fallback and unauthenticated `/private/expenses` / `/private/packing` exposure (adding a defensive `if (!isAuthenticated) return null;` safety guard).
  - Support document IDs in `PrivateHub`:
    - Extract trailing `:docId` from `/wayfinder/poland-christmas-2026/private/documents/:docId` (case-preserving via `window.location.pathname` rather than lowercased `normalizedPath`).
    - If a user visits `/wayfinder/poland-christmas-2026/private/<unknownSlug>` where `<unknownSlug>` is not a known tab (`documents`, `packing`, `expenses`, `budget`), resolve it gracefully into `<DocumentCenter initialDocId={unknownSlug} />` when `permissions.documents` is true, or fall back cleanly via `replaceState` to `/wayfinder/poland-christmas-2026/private` when disallowed, eliminating dead/unexpected fallback renders.
  - Inside `DocumentCenter.jsx`, accept `initialDocId`: once `documents` finish loading, if `initialDocId` matches a stored document (`d.id === initialDocId || d.filename === initialDocId`), open its viewer/details automatically; otherwise show a clear non-fatal notice banner (`"Requested document was not found or is not shared with your account."`) instead of throwing or 404ing.

### 2.3 Strict Guest UI Suppression Across Public Components
Ensure zero private document buttons, ticket modal triggers, confirmation PNRs, or PII render for unauthenticated visitors:
- **`wayfinder/src/components/PolandLanding.jsx`**:
  - Gate Kraków header `"View Document"` button (lines 269-279) with `{isAuthenticated && city.id === 'krakow' && onOpenDocViewer && (...)}`.
  - Gate `isTravelCard` timeline card clickability (`onClick`, `cursor-pointer`, hover amber border, and `title="Click to view ticket and travel details"`, lines 476-485) with `isAuthenticated && isTravelCard && onOpenTravelDoc`.
  - Gate rail button block (`"View PKP Rail Ticket & Transit Details"`, `"1st-Class PKP Intercity"`, lines 597-612) with `{isAuthenticated && isTrainItem && onOpenTravelDoc && (...)}`.
  - Gate flight button block (`"View Delta Flight Confirmation"`, `"Conf: GUDI3J"`, lines 615-630) with `{isAuthenticated && isFlightItem && onOpenTravelDoc && (...)}`.
  - Guard `handleOpenTravelDoc` (line 835): immediately return (or prompt auth modal) if `!isAuthenticated`.
  - Guard `mapTrainSegments` tooltip (line 1102): omit `"and view ticket"` when `!isAuthenticated` (`isAuthenticated ? `${train.label} - Click to jump to schedule and view ticket` : `${train.label} - Click to jump to schedule``).
  - Guard `stopTransitInfo.gdansk.nextTransitDetails` display inside `JourneyStopSchedule`: hide flight code `DL9528` when `!isAuthenticated` (render `'Early airport transfer (04:30) for morning international departure (06:45)'` for guests).
  - Gate `<DocumentViewerModal>` and `<CalendarSubscribeModal>` mounts (lines 1419-1432) with `{isAuthenticated && (...)}`.
- **`wayfinder/src/components/city/CityOverviewTab.jsx`**:
  - Import `useAuth()` from `../../context/AuthContext`.
  - Gate Kraków `"View Document"` button (lines 179-189) behind `{isAuthenticated && city.id === 'krakow' && (...)}`.
  - Wrap `<DocumentViewerModal>` (lines 304-307) in `{isAuthenticated && (...)}`.
- **`wayfinder/src/components/city/CityHotelsTab.jsx`**:
  - Wrap both `<DocumentViewerModal>` mounts (lines 485-533) in `{isAuthenticated && ...}` as defense-in-depth alongside already-gated trigger buttons.
- **`wayfinder/src/components/RouteVisualization.jsx`**:
  - Wrap `<DocumentViewerModal>` (line 816) in `{isAuthenticated && (...)}` as defense-in-depth alongside the gated button on line 440.
- **`wayfinder/src/components/ItineraryView.jsx`**:
  - Gate `isTravelCard` clickability and tooltip (lines 667-676), `"View PKP Rail Ticket & Transit Details"` (lines 790-805), `"View Delta Flight Confirmation"` + `"Conf: GUDI3J"` (lines 808-823), `handleOpenTravelDoc` (line 207), and `<DocumentViewerModal>` (lines 856-862) by `isAuthenticated` (and keep `PrivateBookingCard` gated).
- **`wayfinder/src/components/itinerary/PrivateBookingCard.jsx`**:
  - Import `useAuth()` and guard the `"View Ticket / PDF"` action button and `<DocumentViewerModal>` mount by `isAuthenticated`.
- **`wayfinder/src/components/BottomTabBar.jsx`**:
  - When `!isAuthenticated`, do NOT emit an `<a href="/wayfinder/poland-christmas-2026/private/documents">` link in the mobile tab bar. Instead render a `"Sign In"` `<button>` (using `<Lock />` icon) invoking `setIsAuthModalOpen(true)`, matching the desktop header in `Layout.jsx`. When authenticated, preserve the role-aware `"Hub"` `<TabItem>` link.
- **`wayfinder/src/components/PracticalPage.jsx`**:
  - Check `useAuth()` on the `"Interactive Checklist & Luggage Budget"` CTA (line 74): when `!isAuthenticated`, render a `"Sign In for Luggage Budget & Sync"` button calling `setIsAuthModalOpen(true)` rather than linking guests directly into `/private/packing`.
- **`wayfinder/src/components/admin/AdminView.jsx`**:
  - Consume `isAuthenticated`, `isLoading`, and `setIsAuthModalOpen` from `useAuth()`. Show a loading indicator while `isLoading` is true, and show a clean sign-in prompt if `!isAuthenticated` (working seamlessly alongside `<ProtectedRoute requireAdmin>`).

### 2.4 Eliminating `<iframe>` 404 Loops Inside `DocumentViewerModal.jsx` & `DocumentCenter.jsx`
1. **`DocumentViewerModal.jsx` Hard Auth & Asset Verification Guard**:
   - Guard render output immediately: `if (!isOpen || !isAuthenticated) return null;`.
   - Guard `useEffect`: if `!isOpen || !isAuthenticated`, reset `fileUrl`, `embedError`, `isLoading`, and return before reading IndexedDB or resolving static URLs.
   - Replace naive fallback `${normalizedBase}Poland-2026/docs/${filename}` (line 106) with an explicit allowlist of actually bundled static PDFs (`Poland_Delta.pdf`, `GetYourGuide_Ticket_GYG7VKK692WY.pdf`, `Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`):
     - Check IndexedDB first (`blobUrl` / `getLocalDocumentFile`) - covers any ticket or PDF uploaded/reattached by the authenticated traveler on this device.
     - Otherwise, only propose a static `/Poland-2026/docs/...` URL when the document genuinely maps to one of the 3 bundled PDFs (never synthesize paths like `/Poland-2026/docs/Bilet - WN71563945.pdf` or `/Poland-2026/docs/PKP_Intercity_Wroclaw_Poznan.pdf`).
     - Before setting `fileUrl` for any HTTP(S) path (`candidateUrl`), execute a lightweight `fetch(candidateUrl, { method: 'HEAD', credentials: 'include' })` (with abort cleanup on unmount) to verify `res.ok` AND that `content-type` is NOT `text/html` (since Cloudflare Workers / Vite dev server return HTTP 200 `text/html` SPA fallback for missing static assets).
     - When no local IndexedDB blob or verified non-HTML asset exists, cleanly transition to `embedError = true` (with `fileUrl = null`) so the modal renders its rich structured Ticket/Booking Summary Card + `"Attach Local File"` button and **never mounts `<iframe src="...html">`** or exposes broken download links.
2. **`DocumentCenter.jsx` Fallback Cleanup**:
   - In the Synced Booking detail modal `"View Attached ..."` click handler (lines 1106-1117), stop falling back `defaultPdf` to `'GetYourGuide_Ticket_GYG7VKK692WY.pdf'` for unbundled rail/hotel docs when the doc isn't in `documents`. Only attach static `file_url` when the booking clearly matches Altus Palace (`Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`), Delta (`Poland_Delta.pdf`), or GetYourGuide (`GetYourGuide_Ticket_GYG7VKK692WY.pdf`); otherwise pass `file_url: null` so `openPdfPreview` inspects IndexedDB or prompts local attachment cleanly.

---

## 3. File Change Scope

### Files to Create
- `wayfinder/src/components/ProtectedRoute.jsx` (pure JSX authorization & session-loading wrapper using `useAuth` and custom `pushState`)

### Files to Modify
- `wayfinder/src/App.jsx` (canonicalize shorthand/document routes via `replaceState`, wrap `/private*`, `/documents*`, `/admin*`, and `/Poland-2026/docs/*` in `<ProtectedRoute>`)
- `wayfinder/src/components/PrivateHub.jsx` (require authenticated context, resolve `:docId` / unknown `/private/*` subpaths cleanly into `DocumentCenter` or `/private` fallback)
- `wayfinder/src/components/DocumentCenter.jsx` (accept `initialDocId` prop with graceful non-404 banner if missing/unpermitted, fix wrong `defaultPdf` excursion fallback at line 1110)
- `wayfinder/src/components/DocumentViewerModal.jsx` (enforce `!isAuthenticated` short-circuit in `useEffect` and render return, allowlist bundled static PDFs, verify HTTP asset content-type != `text/html` before mounting `<iframe>`)
- `wayfinder/src/components/PolandLanding.jsx` (gate all ticket/document buttons, card clicks, tooltips, `handleOpenTravelDoc`, flight number `DL9528`, and modal mounts behind `isAuthenticated`)
- `wayfinder/src/components/city/CityOverviewTab.jsx` (add `useAuth()`, gate Kraków `"View Document"` button and `<DocumentViewerModal>` behind `isAuthenticated`)
- `wayfinder/src/components/city/CityHotelsTab.jsx` (wrap `<DocumentViewerModal>` instances behind `isAuthenticated`)
- `wayfinder/src/components/RouteVisualization.jsx` (wrap `<DocumentViewerModal>` behind `isAuthenticated`)
- `wayfinder/src/components/ItineraryView.jsx` (gate travel card clicks, PKP/Delta buttons, `Conf: GUDI3J`, `handleOpenTravelDoc`, and `<DocumentViewerModal>` behind `isAuthenticated`)
- `wayfinder/src/components/itinerary/PrivateBookingCard.jsx` (gate ticket preview trigger and `<DocumentViewerModal>` behind `isAuthenticated`)
- `wayfinder/src/components/BottomTabBar.jsx` (show `"Sign In"` button instead of `/private/documents` link for guests)
- `wayfinder/src/components/PracticalPage.jsx` (gate `/private/packing` link behind auth prompt for guests)
- `wayfinder/src/components/admin/AdminView.jsx` (handle `isLoading` and `!isAuthenticated` gracefully before rendering `"Access Denied"`)

### Documentation to Synchronize (Post-Implementation)
- `wayfinder/docs/03_features.md` (document `ProtectedRoute`, auth-gated route normalization, guest UI suppression updates, and `DocumentViewerModal` content-type / allowlist hardening)
- `wayfinder/docs/04_state.md` (update Section 2 / 5 / 16.7 invariants for protected route resolution, document ID deep-link state, and removal of unauthenticated viewer exposure)
- `wayfinder/docs/02_arch.md` (only if adding `ProtectedRoute.jsx` warrants listing in component topology)

---

## 4. Verification & Deployment Sequence (Upon `Plan approved`)

1. **Unauthenticated Verification**:
   - Visit `/wayfinder` and `/wayfinder/poland-christmas-2026` (both Cards View and Schedule View with all city stops expanded): verify zero `"View Document"`, zero `"View PKP Rail Ticket & Transit Details"`, zero `"View Delta Flight Confirmation"`, zero `Conf: GUDI3J` / `WN 71563945`, zero clickable ticket hover cursor on train/flight cards, and no Kraków `"View Document"` on City Overview.
   - Inspect mobile `BottomTabBar`: confirms `"Sign In"` triggers auth modal with zero link to `/private/documents`.
   - Navigate directly to protected URLs while logged out (`/wayfinder/poland-christmas-2026/private`, `/wayfinder/poland-christmas-2026/private/documents`, `/wayfinder/poland-christmas-2026/private/documents/test-doc`, `/wayfinder/private`, `/wayfinder/documents/123`, `/wayfinder/poland-christmas-2026/private/expenses`, `/wayfinder/admin`, `/wayfinder/Poland-2026/docs/Bilet%20-%20WN71563945.pdf`): verify loading state transitions to Sign-In prompt cleanly with zero `404 - Not Found` errors and zero PKP banner leakage.
2. **Authenticated Verification**:
   - Sign in on a protected route prompt: verify immediate in-place reveal of `/private`, `/private/documents/:id`, or `/admin`.
   - Open PKP Intercity `IC 58 Galicja` ticket modal (`Bilet - WN71563945.pdf`): verify `DocumentViewerModal` never renders a 404 SPA HTML page inside `<iframe>`, instead showing clean rail details + `"Attach Local File"` unless cached in IndexedDB.
   - Open bundled PDFs (`Poland_Delta.pdf`, `GetYourGuide_Ticket_GYG7VKK692WY.pdf`, `Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`): verify inline preview still works cleanly.
   - Test non-member (`role: 'none'`) and non-admin access on `/private` and `/admin`: confirm `NoAccessPanel` and `Access Denied` remain intact.
3. **Production Build & Cloudflare Deploy**:
   - Update `wayfinder/docs/03_features.md` and `wayfinder/docs/04_state.md` (and `02_arch.md` if applicable).
   - Run `cd e:\TechTrekGT\wayfinder` and execute `npm run build` (must finish with zero errors).
   - Immediately execute `npm run deploy` and verify live Cloudflare deployment status and Worker URL in the same turn.

