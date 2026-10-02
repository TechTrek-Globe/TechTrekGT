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

### Backend Transactional & Database Integrity State [ACTION ID: AUDIT-001]

- **Compensating Rollback State Pattern**:
  - Cloudflare D1 SQLite does not support long-lived interactive multi-statement transactions across asynchronous I/O boundaries.
  - Multi-step state transitions maintain transactional integrity using compensating rollback actions executed in `catch` blocks:
    - **Item & Sale State Reconciliation**: When marking an item sold (`/api/sales`, `/api/sync/vinescout-catalog`, `/api/ebay/match-sold-vinescout`, `/api/ebay/sync-item`), if the sale persistence fails, item status and attributes are rolled back to their pre-sale snapshot.
    - **Invoice & Item Cascading Cleanup**: If item insertion fails during invoice creation (`/api/invoices`, `/api/import/amazon`, `/api/import/amazon-url`), the parent invoice is purged immediately to prevent orphaned empty invoices.
    - **Batch Import Rollback**: If batch processing fails during replacement, `cleanupBatch` removes all batch-tagged records and reverts any item status changes.
  - Operations supporting immediate atomic execution (`DELETE /api/sales/:id`, `DELETE /api/items/:id`, `DELETE /api/invoices/:id`, platform default updates) use `env.DB.batch(...)` to guarantee all-or-nothing execution at the SQLite engine level.

### Authentication and Security Credential Lifecycle State [ACTION ID: AUDIT-002]

- **Security State Synchronization & Invalidation**:
  - Security states strictly mirror backend realities. Invalid, revoked, or expired credentials trigger immediate invalidation across clients and database storage.
  - **Client Cookie Cleanup**: 401 Unauthorized responses from `requireAuth` and `/api/auth/me` explicitly emit `Set-Cookie: auth_token=; Max-Age=0` headers, clearing stale session cookies in the browser and preventing endless failed background polling loops.
  - **Token Version (`token_version`) State Invariants**:
    - When users reset their password (`/api/auth/reset-password`), update their password (`/api/auth/update-profile`), or request global session termination (`/api/auth/logout` with `all: true`), `users.token_version` is bumped in D1.
    - All subsequent requests presenting tokens with an older `tv` claim are immediately rejected with HTTP 401 across both `requireAuth` and `resolveIntegrationUserId`.
  - **API Integration & OAuth Credential Lifecycle**:
    - Manually revoking an API integration (`UPDATE api_integrations SET revoked_at = datetime('now')`) immediately prevents all subsequent API authentications without delay.
    - Expired eBay refresh tokens and permanent 400/401 OAuth refresh errors purge corresponding records from `ebay_oauth_tokens`, immediately reverting UI status to `{ connected: false }`.

### External Synchronization & Webhook Resilience State [ACTION ID: AUDIT-003]

- **Sync Run History & Failure State Tracking (`outpost_sync_history` & `outpost_sync_settings`)**:
  - Outbound sync operations (eBay, VineScout, Amazon, Webhook) record atomic telemetry to `outpost_sync_history` (`status`, `items_total`, `items_synced`, `items_failed`, `error_message`, `details`, `started_at`, `completed_at`).
  - **Conditional Timestamp Stamping Invariant**: `last_ebay_sync_at` is stamped in `outpost_sync_settings` ONLY upon 100% successful sync completion (`status = 'success'`).
  - **Partial Failure State**: When individual items fail during eBay or platform sync runs, successful items are committed, failed items are recorded in `outpost_sync_history`, and `outpost_sync_settings` sets `last_ebay_sync_status = 'partial'` and preserves the existing `last_ebay_sync_at` timestamp.
  - **Hard Failure State**: Network timeouts and unexpected external API rejections record `last_ebay_sync_status = 'failed'`, document the diagnostic error in `last_ebay_sync_error`, and preserve earlier sync timestamps without advancing them.
- **Client Sync Telemetry & Recovery State**:
  - `InventoryContext` re-fetches sync settings on both success and error paths, re-throwing caught errors to notify calling UI components.
  - `SettingsView` renders informative status alerts for `failed` and `partial` states with explicit error messages and timestamps for the last successful sync, preventing misleading green checks or stuck loading states.


