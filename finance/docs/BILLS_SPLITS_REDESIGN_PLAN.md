# Architecture & Implementation Plan: Bills & Splits UX/UI Redesign

**Target Application:** TechTrekGT Finance OS (`finance/`)  
**Document Path:** `finance/docs/BILLS_SPLITS_REDESIGN_PLAN.md`  
**Date:** August 27, 2026  
**Status:** Design Completed - Awaiting User Approval  

---

## 1. Executive Summary & Problem Analysis

In the TechTrekGT Finance OS Settings interface (`SettingsView.jsx` and `SettingsModal.jsx`), the **Bills & Splits** panel is rendered by `finance/src/components/settings/BillsSplitsPanel.jsx`.

### 1.1 Current UX Pain Points
1. **Severe Inline Input Congestion:** Every single row in the high-density table forces 5 distinct inline editable form controls into cramped table cells:
   - Bill Name inline text input.
   - Bank Statement Aliases (`matchingKey` / `bankMatchNames`) inline text input squeezed underneath the name.
   - Dollar Amount inline number input with floating point steps.
   - Frequency / Recurrence popover button (`NoYearCalendarPicker`).
   - Payment Account `<select>` dropdown.
   - Household Earner split percentage inputs for every active earner, plus a sum badge.
2. **Metadata Truncation & Visual Noise:** With every cell containing an input field with border, background, and padding, the interface creates high visual fatigue. When bills have multiple alias keywords (e.g., `COMCAST, XFINITY, 800-COMCAST`), text is truncated or pushes column widths into horizontal overflow.
3. **High Risk of Accidental Mutation:** Clicking a row to inspect details or copy a value immediately triggers input focus and potential unintended keystroke mutations directly into React Context.
4. **Disjointed "Add" vs. "Edit" Experience:** Users currently have an "Add Bill" modal for creating new bills, but must edit existing bills through tiny inline table inputs. There is no dedicated editing dialog for existing bills.
5. **No Search or Quick Scannability:** When managing 20 to 50 household bills, users cannot search by keyword, alias, or note, forcing exhaustive manual table scanning.

---

## 2. Proposed Redesign Architecture

The redesigned Bills & Splits interface separates **high-efficiency scannability** from **focused data editing**:

```
+-----------------------------------------------------------------------------------------------+
| Bills & Splits Header & KPI Metric Strip                                                      |
| [Active Bills: 24]  [Total Monthly: $4,825.50]  [Accounts: 4]  [Splits Health: 100% Balanced] |
+-----------------------------------------------------------------------------------------------+
| Search & Filter Bar:                                                                          |
| [Active (24) | Archived (3)]  [Search bills, aliases...]  [Account Filter v]  [+ Add Bill]   |
+-----------------------------------------------------------------------------------------------+
| Scannable Data Table (Read-Optimized, Formatted, Zero Inline Clutter):                        |
| - Row Click opens Focused Bill Editor Modal                                                   |
| - Bill Name & Type Badge (Bold, high contrast)                                                |
| - Statement Aliases rendered as modern Tag Pills (e.g., [COMCAST] [XFINITY])                  |
| - Scheduled Amount ($XX.XX) + Monthly Equivalent subtext (~$YY.YY/mo)                         |
| - Due Date & Recurrence Badge (e.g., [15th] [Monthly])                                        |
| - Assigned Account Chip with color dot                                                        |
| - Compact Visual Earner Split (Segmented Progress Bar + [JK: 50%] [AL: 50%])                  |
| - Quick Actions: [Edit Pencil] [Archive] [Delete]                                             |
+-----------------------------------------------------------------------------------------------+
| Focused Bill Editor Modal / Drawer (Shared for Add & Edit):                                   |
| - Section 1: Bill Identity & Interactive Statement Alias Tagger                               |
| - Section 2: Amount, Recurrence (Frequency, Due Day, 12-Month Interactive Grid) & Account     |
| - Section 3: Earner Split Sliders (Auto-balancing, 100% sum guard, live $ portion preview)   |
| - Section 4: Notes & Payment Source                                                           |
+-----------------------------------------------------------------------------------------------+
```

---

## 3. Target Files to Modify & Create

| Action | File Path | Responsibilities |
|---|---|---|
| **NEW** | `finance/src/components/settings/BillEditorModal.jsx` | Dedicated modal dialog for creating and editing bills. Houses interactive alias tagger, recurrence controls, earner split sliders with auto-balance, and 100% validation. |
| **MODIFY** | `finance/src/components/settings/BillsSplitsPanel.jsx` | Refactored into a sleek, scannable table view with KPI metrics strip, real-time search/filter bar, rich tag badges, visual split breakdown, and modal state trigger. |
| **READ-ONLY** | `finance/src/context/BudgetContext.jsx` / `BudgetMetadataContext.jsx` | Reuses existing context hooks (`useBudgetMetadata`, `addBill`, `updateBill`, `deleteBill`, `archiveBill`, `unarchiveBill`, `updateBillSplits`). Zero schema changes required. |

---

## 4. Detailed Component Design & Specifications

### 4.1 Primary Table & List View (`BillsSplitsPanel.jsx`)

#### A. KPI Metric Strip (Top Summary)
- **Active Monthly Obligation:** Sum of all active bills normalized to monthly cost (`getBillMonthlyCost`).
- **Active Bills Count:** Total active vs. archived count.
- **Account Coverage:** Number of unique accounts handling bills.
- **Split Health Alert:** Green badge if all active bills sum to 100%; Amber/Rose alert badge if any bill has unbalanced splits (with count of unbalanced bills).

#### B. Search, Filtering & Sorting Controls
- **Filter Tabs:** `Active (N)` vs. `Archived (N)` with badge counts.
- **Real-Time Search Input:** Matches across Bill Name, Bank Match Aliases (`bankMatchNames`/`matchingKey`), Account Name, and Notes.
- **Account Filter Dropdown:** Filter by specific funding account or view "All Accounts Combined".
- **Primary CTA:** Prominent `+ Add Bill` button in emerald styling.

#### C. Clean Table Columns (Zero Inline Form Congestion)
1. **Bill Name & Payment Source (24% width):**
   - High-contrast bill name (`text-slate-100 font-bold text-sm hover:text-blue-400 cursor-pointer`).
   - Payment method badge: `Auto Pay`, `Manual`, `Credit Card`, `Direct Debit` in subtle slate/blue badge.
   - Notes preview below if present (`text-slate-500 italic text-xs truncate max-w-xs`).
2. **Statement Aliases / Bank Match Names (22% width):**
   - Displayed as modern pill badges:
     ```html
     <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-950/70 border border-blue-800/50 text-blue-300 font-medium">
       COMCAST
     </span>
     ```
   - Multiple aliases display up to 2 badges + a `+N more` badge showing full list on hover tooltip.
   - If empty: subtle dashed indicator `—` or `+ Add Alias` prompt.
3. **Scheduled Amount & Monthly Equivalent (14% width):**
   - Large formatted currency `$XX.XX` (`font-mono font-bold text-slate-100 text-sm`).
   - If frequency is not Monthly (e.g. Quarterly, Annual): displays `~$YY.YY / mo` in muted text below.
4. **Due Date & Recurrence (14% width):**
   - Formatted due day badge: e.g. `15th` with calendar icon.
   - Recurrence frequency tag:
     - `Monthly`: Blue pill badge.
     - `Quarterly`: Purple pill badge with month list (e.g., `Jan, Apr, Jul, Oct`).
     - `Annual`: Amber pill badge with due month (e.g., `Jan`).
     - `Custom`: Indigo pill badge with month count.
5. **Assigned Account (12% width):**
   - Account badge with color indicator dot and account type (Checking/Savings/Credit).
6. **Earner Split Breakdown (18% width):**
   - **Mini Segmented Progress Bar:** Visual 2-color / 3-color bar representing earner percentages.
   - **Earner Ratio Badges:** e.g. `JK: 50%` | `AL: 50%` in purple/emerald badges.
   - **Integrity Indicator:** If splits do not total 100%, displays a warning pill: `⚠ X%` in rose/amber to flag data errors.
7. **Actions (8% width):**
   - `Edit` (Pencil icon) -> Opens `BillEditorModal`.
   - `Archive` / `Unarchive` (Archive icon) -> Toggles archive state.
   - `Delete` (Trash2 icon) -> Opens deletion safety confirmation.

#### D. Row Interactions
- Entire row is interactive: clicking anywhere on the row opens the `BillEditorModal` for that bill.
- Action buttons stop event propagation to prevent accidental modal triggers.

---

### 4.2 Unified Bill Editor Modal (`BillEditorModal.jsx`)

Used for both **New Bill Creation** and **Existing Bill Editing**.

#### Modal Header
- Dynamic title: `"Edit Bill: {bill.name}"` or `"Create New Scheduled Bill"`.
- Mode pill badge: `"Edit Mode"` (Blue) or `"New Bill"` (Emerald).
- Top-right close button (`X`).

#### Section 1: Identity & Statement Aliases (Bank Match Names)
- **Bill Name Input:** Required text input with auto-focus in Add mode.
- **Statement Aliases (Interactive Tagger):**
  - Text input allowing users to type keywords and press `Enter` or `,` to add.
  - Interactive chip container with individual remove (`×`) buttons.
  - Live preview of statement match keywords.
  - Helper note: "These keywords are matched against bank statement CSV/XLSX imports to automatically link transactions to this bill without manual entry."
- **Notes / Memo:** Optional text area for account numbers, customer service phone numbers, or contract dates.

#### Section 2: Financial Terms & Recurrence
- **Amount ($):** Currency number input with two decimal places.
- **Billing Period:** Dropdown (`Monthly`, `Quarterly`, `Semi-Annual`, `Annual`, `Specific Months (Custom)`).
- **Interactive Due Month Grid:**
  - 12 month buttons (`Jan` to `Dec`).
  - Auto-selects based on period (e.g., Quarterly selects Jan, Apr, Jul, Oct; Annual selects Jan).
  - Allows full manual multi-select in Custom mode.
- **Due Day of Month:** Number stepper / input bounded between 1 and 31.
- **Assigned Account:** Dropdown populated from `budget.accounts`.
- **Payment Source:** Dropdown (`Auto Pay`, `Manual`, `Direct Debit`, `Credit Card`).

#### Section 3: Earner Split Allocation Matrix
- **Earner Rows:** Renders every active wage earner from `budget.people` (excluding Credit role).
- **Interactive Percentage Inputs & Sliders:**
  - Synchronized range slider (`0% - 100%`) and numeric input box for each earner.
  - **Two-Earner Auto-Balancing:** When exactly two earners exist, adjusting Earner A automatically sets Earner B to `100 - A`.
  - **Multi-Earner Support:** Manual entry for 3+ earners with quick "Even Split" button.
- **Validation Guard:**
  - Live split total calculator.
  - If `total === 100%`: Displays green checkmark with `"Split Balanced: 100%"`.
  - If `total !== 100%`: Displays red warning banner `"Splits must sum to 100% (Current: X%)"` and disables the Save/Submit button.
- **Live Dollar Share Preview:**
  - Shows each person's exact monthly dollar contribution (e.g., `Jon: $60.00 / mo (50%)`, `Kate: $60.00 / mo (50%)`).

#### Modal Footer
- **Left Action:** Delete Bill button (in Edit mode only, with confirmation dialog).
- **Right Actions:**
  - `Cancel` button (discards local modal state without touching Context).
  - `Save Bill` / `Create Bill` button (submits sanitized data to Context).

---

## 5. State Management & Data Integrity

### 5.1 Bill Data Model Schema
The redesign preserves all existing fields and ensures strict compatibility:

```javascript
{
  id: "bill-1724784000000",            // Stable unique identifier
  name: "Georgia Power Electric",      // Human-readable bill name
  amount: 145.50,                      // Scheduled bill amount
  period: "Monthly",                   // Recurrence type: Monthly | Quarterly | Semi-Annual | Annual | Custom
  dueDay: 18,                          // Day of month (1-31)
  dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // Due month numbers (1-12)
  accountId: "acc-bills-checking",     // Assigned payment account ID
  paymentSource: "Auto Pay",           // Auto Pay | Manual | Direct Debit | Credit Card
  notes: "Budget billing plan",        // Freeform notes
  matchingKey: "GA POWER, GEORGIA POWER, GAPOW", // Statement alias standard (synced)
  bankMatchNames: "GA POWER, GEORGIA POWER, GAPOW", // Statement alias standard (synced)
  splits: {                            // Percentages summing to 100
    "person-1": 50,
    "person-2": 50
  },
  isArchived: false                    // Archive flag
}
```

### 5.2 Context Dispatch Synchronization
All mutations route through `useBudgetMetadata()` hooks:
- **Creating Bills:** `addBill(formData)`
- **Updating Bills:** `updateBill(bill.id, formData)`
- **Updating Splits:** Handled directly in `updateBill(bill.id, { splits })` or `updateBillSplits(bill.id, splits)`
- **Archiving / Unarchiving:** `archiveBill(bill.id)` / `unarchiveBill(bill.id)`
- **Deleting Bills:** `deleteBill(bill.id)`
- **Alias Synchronization:** Ensuring `matchingKey` and `bankMatchNames` remain identically synchronized during save.

---

## 6. Visual Design Tokens & Aesthetic Standard

In accordance with TechTrekGT design standards:
- **Base Backgrounds:** `bg-slate-950/60`, `bg-slate-900/90` with `border-slate-800`.
- **Accents:**
  - Primary Action / Add: Emerald (`bg-emerald-600`, `hover:bg-emerald-500`, `text-white`).
  - Active Tab / Edit: Blue (`bg-blue-600`, `text-blue-200`).
  - Archive / Warning: Amber (`bg-amber-600/20`, `border-amber-700/50`, `text-amber-300`).
  - Delete / Error: Rose (`bg-rose-950/50`, `border-rose-800/60`, `text-rose-300`).
  - Earner Identifiers: Purple (`bg-purple-950/70`, `text-purple-300`, `border-purple-800/50`).
- **Typography:**
  - Amounts and percentages: `font-mono font-bold`.
  - Aliases: `font-mono text-[10px]`.
  - Headings and labels: `font-sans font-semibold`.

---

## 7. Verification & Testing Plan

1. **Scannability & Layout Verification:**
   - Verify table renders cleanly without truncated text or horizontal column squeeze.
   - Verify aliases appear as styled tag badges.
   - Verify non-monthly bills clearly show both scheduled amount and normalized monthly cost.
2. **Search & Filter Verification:**
   - Test search by bill name, alias keyword, account name, and notes.
   - Test toggle between Active and Archived tabs.
   - Test filtering by specific payment accounts.
3. **Editor Modal Verification:**
   - Test clicking any row to open the modal with pre-populated data.
   - Test alias tagger: adding new keywords via Enter/comma and removing tags.
   - Test recurrence change (e.g., changing from Monthly to Quarterly updates month selectors).
   - Test earner split sliders: verify 2-earner auto-balancing and 100% sum validation guard.
4. **Data Persistence Verification:**
   - Verify edits persist to IndexedDB (`current_budget`) and are reflected immediately in `MainBudgetView.jsx` and `DashboardView.jsx`.
5. **Zero-Error Build Verification:**
   - Run `npm run build` in `finance/` to ensure zero compilation or bundler errors.

---

## 8. Anti-Pilot Safety Halt Directive

In strict compliance with instructions:
- No `.js` or `.jsx` source files have been modified.
- Execution halts here.
- Source code refactoring will only commence once the user explicitly submits: **"Plan approved"**.
