# Outpost Features Documentation

## Global Command Palette (Cmd+K / Ctrl+K) [ACTION ID: HIGH-001 / NAV-001]

The Global Command Palette provides keyboard-first rapid navigation and fuzzy search across Outpost routes, operational tools, and inventory items by SKU.

### Key Capabilities
1. **Keyboard-Driven Invocation**:
   - Shortcut: `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux).
   - Global event listener in `src/components/AppLayout.jsx` with input guards ensuring standard text input (typing 'k') never triggers the palette.
   - Interactive trigger buttons in desktop sidebar and mobile header for point-and-click accessibility.
2. **Fuzzy Search & Routing**:
   - Instant filtering across primary views: Dashboard, Inventory & Pricing, Sales Log, Settings, and Admin Controls.
   - Quick launcher for platform utilities: Finance Sync, Tax / Schedule C Report, Sync eBay Store, and TechTrekGT Launch Pad.
3. **Dynamic Remote SKU Search**:
   - Debounced (250ms) query against `GET /api/items/enriched?q=<query>&limit=8`.
   - In-flight request cancellation via `AbortController` and client-side memory caching to eliminate duplicate API requests.
   - Server-side rate limiting on `GET /api/items/enriched` when `q` is provided.
   - Selecting a SKU result navigates to `Inventory & Pricing` and sets the active search filter to the selected SKU/title.
4. **Developer-Tool Aesthetics & Accessibility**:
   - Backdrop blur (`backdrop-blur-md bg-slate-950/80`) with VS Code / Spotlight styling.
   - Full keyboard navigation: `↑` and `↓` arrow keys with auto-scroll into view, and `Enter` to execute.
   - `aria-modal="true"`, `role="dialog"`, auto-focus on search input upon opening, Tab focus trapping, and `Escape` dismissal.
   - Responsive full-screen width layout on mobile viewports.

## CSS Variables & Dynamic Design System [ACTION ID: HIGH-002 / UI-001]

The brand color palette has been refactored from hardcoded hex constants into root CSS custom properties with full opacity modifier support in Tailwind CSS.

### Key Capabilities
1. **Root CSS Custom Properties (`src/index.css`)**:
   - The brand amber palette (`50` through `900`) is declared under `:root` as space-separated RGB channel values (`--color-brand-50` through `--color-brand-900`).
   - Global design system tokens can be updated dynamically or overridden for alternate color profiles and theme switching.
2. **Tailwind Opacity Support (`tailwind.config.js`)**:
   - Palette colors are mapped using standard Tailwind `<alpha-value>` interpolation: `rgb(var(--color-brand-<shade>) / <alpha-value>)`.
   - Enables full utility class alpha modifiers across the entire application (e.g. `bg-brand-500/10`, `text-brand-400/90`, `border-brand-500/20`).
3. **Consolidated Design Utilities**:
   - Core utility classes (`.text-gradient-amber`, `.glow-amber`, `.glow-amber-sm`, `.bg-grid-pattern`, `.glass-card`, `.hover-border-amber`, and scrollbar styles) directly consume the `--color-brand-*` CSS custom properties, ensuring cohesive visual styling.

## Inline Grid Editing for Data Tables [ACTION ID: MED-001 / INT-001]

Spreadsheet-like inline grid editing enables rapid data entry directly within tabular views without requiring modal dialogues.

### Key Capabilities
1. **Interactive Triggering & Cell Transformation**:
   - Double-clicking or pressing `Enter` on focused editable cells transforms the cell into an active input field.
   - Smooth layout transition matches exact cell height (22px) and bounds to prevent layout shifts.
   - Pressing `Escape` cancels edits and reverts to previous values without saving.
   - Pressing `Enter` or blurring commits changes.
2. **Keyboard Navigation & Flow**:
   - Focusable cells via `tabIndex={0}` and `role="gridcell"`.
   - Pressing `Tab` while editing commits the current value and naturally advances focus to the adjacent editable cell across rows and columns.
3. **Optimistic UI Updates & Loading Telemetry**:
   - Local state updates immediately upon commit, automatically recalculating financial metrics (`net_proceeds`, `net_profit`, `roi_pct`) via `computeSaleMetrics` and updating summary cards.
   - Subtle animated `Loader2` spinner indicates in-flight network requests.
   - Reverts state and surfaces an error alert if the server update (`PUT /api/sales/:id`) fails.
4. **Validation & Mobile Fallback**:
   - Validates numeric inputs against bounds (non-negative numbers).
   - Viewport threshold check (`< 640px`) disables inline editing on small mobile devices, seamlessly delegating to the comprehensive edit modal.

