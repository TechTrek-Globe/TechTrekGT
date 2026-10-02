# Outpost State Management Documentation

## State Architecture

Outpost uses React Context and standard React hooks (`useState`, `useReducer`, `useMemo`, `useCallback`, `useRef`) for client-side state management, persisted across views via root-level providers in `src/App.jsx`.

### Core Context Providers

1. **`AuthProvider` (`src/context/AuthContext.jsx`)**:
   - Manages user authentication state (`user`, `isAuthenticated`, `isLoading`).
   - Interacts with HTTP-only session cookies (`credentials: 'include'`).
   - Exposes `login`, `register`, and `logout` actions.

2. **`CommandPaletteProvider` (`src/context/CommandPaletteContext.jsx`) [HIGH-001]**:
   - Manages global visibility state for the Command Palette modal (`isOpen`, `openPalette`, `closePalette`, `togglePalette`).
   - Mounted at the top level of `src/App.jsx` wrapping `MainContent` to persist palette state across route and view transitions.
   - Consumed by `AppLayout` for global shortcut (`Cmd+K` / `Ctrl+K`) listeners and desktop/mobile UI trigger buttons.

3. **`InventoryProvider` (`src/context/InventoryContext.jsx`)**:
   - Manages active items list, sorting, filtering (`search`, `statusFilter`, `categoryFilter`), and pagination.
   - Provides integration operations including `handleSyncEbay`, `fetchItems`, and item updates.
   - Integrated with `CommandPalette` to allow SKU selections to update `search` and highlight targeted items in the inventory table.

### Styling & Design System State [HIGH-002 / UI-001]

- **CSS Custom Properties**:
  - Global styling theme state is anchored in `:root` variables in `src/index.css` (`--color-brand-50` through `--color-brand-900`).
  - Colors are referenced by `tailwind.config.js` with `<alpha-value>` modifier support, enabling runtime theme configuration and decoupled visual tokens without component-level refactoring.

### Inline Grid Editing & Optimistic UI State [MED-001 / INT-001]

- **Component & Table State**:
  - `InlineEditableCell` (`src/components/ui/InlineEditableCell.jsx`): Manages local edit mode (`isEditing`), input buffering (`currentInput`), in-flight status (`internalSaving`), and validation state without triggering parent re-renders until committed.
  - `SalesLogView` (`src/components/SalesLogView.jsx`): Tracks in-flight row saves via `savingCellMap` (`{ [cellKey]: boolean }`) and focused edit sessions via `editingCell`.
  - **Optimistic Reconciliation**:
    - Updates local `sales` state immediately with recalculated net proceeds, net profit, and ROI fractions derived from `computeSaleMetrics`.
    - Adjusts summary telemetry (`total_gross`, `total_net_proceeds`, `total_net_profit`, `blended_roi`) instantaneously using delta arithmetic.
    - Preserves snapshots (`prevSales`, `prevSummary`) for atomic rollback and user error notification if the asynchronous `PUT /api/sales/:id` call fails.


