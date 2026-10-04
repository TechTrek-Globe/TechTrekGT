# [ARCHIVED] Inventory & Pricing Tab Rework: Implementation Plan

Status: DRAFT, awaiting "Plan approved". No source code has been modified.

## 1. Findings (pre-flight)

- `ARCHITECTURE.md` read (lines 1-800 of 896; stack: React 19, Vite 6, Tailwind 3.4, Workers + D1, custom SPA router).
- Table lives in `outpost/src/components/inventory/`:
  - `InventoryDataGrid.jsx` (645 lines): header, sorting, resize, column visibility, local `DEFAULT_COLUMNS` (lines 9-28), `hoverTooltip` state + `showTooltip`/`hideTooltip`.
  - `InventoryGridRow.jsx` (~29 KB): per-row cells, inline edit cells, existing hover tooltips.
  - `FeeBreakdownPanel.jsx`, `MarginHealthBadge.jsx`, `InlineEditCell.jsx`, `ItemImageHoverTooltip.jsx`: reusable pieces.
- Second column definition in `outpost/src/utils/userSettings.js` (`DEFAULT_COLUMNS`, lines 7-26) drives visibility/width persistence. Both lists must stay in sync.
- Existing columns to the right of List Price: `net_profit`, `margin_health`, `true_total_cost`, `floor_price`, `suggested_list_price`, plus format/athlete/category/etc.

## 2. Column Changes

Primary view columns (in order):

| Key | Label | Action |
|-----|-------|--------|
| `actions` | Actions | keep |
| `item_name` | Item / Description | keep |
| `status` | Status | keep |
| `current_list_price` | List Price | keep, click-to-edit, hover trigger |
| `landed_floor` | Landed & Floor | NEW (replaces `true_total_cost`, `floor_price`, `net_profit`, `margin_health`) |

Removed from default view: `sku`, `net_profit`, `margin_health`, `true_total_cost`, `floor_price`.

Open question (see Section 7): whether to hard-delete the secondary columns (`suggested_list_price`, `listing_format`, `athlete_person`, `category`, `authenticator`, `cert_number`, `platform`, `quantity`, `invoice_ref`) or keep them as opt-in via the column-visibility menu. Default proposal: keep them but set `defaultVisible: false`, since the request only names specific columns.

Persistence: stale saved `columnVisibility`/`columnWidths` for removed keys are ignored (filter by known keys on load) so existing users do not see ghost columns.

## 3. "Landed & Floor" Cell

- Compact two-line cell: `Landed $X.XX` (slate) and `Floor $Y.YY` (emerald/amber/rose by comparison with List Price).
- Small badge: "Below floor" (rose) when list price < floor; "At floor" (amber) within 5%; none otherwise.
- Click on Floor value opens existing inline edit (`InlineEditCell`) for the floor override; click on List Price keeps current inline edit. Both call existing `onUpdateItem`/`onUpdateItemSync`, no new data flow.
- Sorting: header key `landed_floor` sorts by `floor_price` (fallback `true_total_cost`). Add mapping in the sort handler only.

## 4. Unified Tooltip Card

New component `InventoryPricingTooltip.jsx` (portal-positioned using the existing `hoverTooltip` rect state in `InventoryDataGrid`, same pattern as `ItemImageHoverTooltip`). Triggered by `onMouseEnter`/`onMouseLeave` on both the List Price cell and the Landed & Floor cell. Replaces the existing per-column tooltip types.

Section A: List Price Breakdown
- Current List Price
- Platform Fees (final value % + flat fee)
- Promoted Ad Fees
- Projected Net Profit (green/red)
- Margin %
- ROI

Section B: Landed & Floor Cost Metrics
- Item Acquisition Cost (COGS)
- Inbound Shipping
- Prep / Packaging
- Total Landed Cost
- Break-even Floor Price
- Minimum Target Margin Floor (uses `DEFAULT_TARGET_MARGIN_PCT` unless item override exists)

Data source: reuse `computeFeeBreakdown` (`utils/feeEngine.js`) and `fmtCurrency`. Before coding I will verify which item fields hold inbound shipping and prep costs (`FeeBreakdownPanel.jsx` / `functions/utils/auction.js`). If a field does not exist, the row shows "N/A" rather than a guessed value.

Styling: dark-first `glass-panel` card, slate-900/95 background, two sections with divider, tabular-nums, no em dashes, viewport-edge flipping.

## 5. File-Level Edits (surgical)

1. `InventoryDataGrid.jsx`: update local `DEFAULT_COLUMNS`; add `landed_floor` sort mapping; swap tooltip render to new card.
2. `InventoryGridRow.jsx`: remove removed-column cells; add Landed & Floor cell; wire hover handlers on List Price + new cell.
3. `userSettings.js`: sync `DEFAULT_COLUMNS`; filter unknown keys.
4. New `InventoryPricingTooltip.jsx`.
5. `ARCHITECTURE.md`: add a short note on the unified pricing tooltip and column set (required by sync rule).
6. Untouched: filtering, search, batch actions, `QuickEditDrawer` (SKU remains editable there), modals, API/D1 (no schema change).

## 6. Verification & Deploy

1. `cd e:\TechTrekGT\outpost`
2. `npm run build` (must be zero errors)
3. `npm run deploy` (wrangler)
4. Confirm deployment URL and report; manual check of sort, search, batch select, quick-edit, inline edits, hover card.

## 7. Questions for Review

- Hard-remove vs. hide-by-default for the non-listed secondary columns?
- Should "Minimum Target Margin Floor" use the global default margin only, or a per-item override if present?
- Keep `PricingCardGrid` (card view) unchanged? (Proposed: yes.)
