# Shared Expense Ledger - Person-by-Person Breakdown Upgrade Plan

> CRITICAL STOP - This plan MUST be reviewed and approved before any source code is written or modified.
> All edits will be strictly surgical - modifying only files and lines identified below.

---

## 1. Pre-Flight Audit Summary

### 1.1 Files Inspected

| File | Role |
|---|---|
| `src/components/budget/ExpenseLedger.jsx` | Primary UI - 1,261 lines. All summary cards, filters, expense cards, modals. |
| `src/utils/expenseLedger.js` | Pure utility: convertCurrency, formatCurrency, splitEqually, calculateSettleUp. |
| `functions/api/wayfinder/budget.js` | Backend aggregate endpoint (no changes needed). |
| `functions/api/wayfinder/expenses.js` | CRUD API (no changes needed for this feature). |
| `wayfinder/docs/04_state.md` | Schema: wayfinder_expenses, wayfinder_expense_splits, wayfinder_expense_settlements. |

### 1.2 Existing Architecture Constraints Confirmed

- Two hard-coded participants: Jon Kemp (currentUserId / usr-1785511589441-3fvgv) and Ronald Milton Few (usr-ronald-few). The participants array is useMemo-derived.
- calculateSettleUp in expenseLedger.js already computes balances[] per person with { id, name, paid, owed, net, settlementsPaid, settlementsReceived }. This is the mathematical source of truth - it must not be duplicated.
- No backend changes needed - all person-by-person data can be derived client-side from the already-fetched expenses[] and settlements[] arrays.
- Category normalization via normalizeCategory() already maps all DB aliases (hotel->lodging, train->transit, etc.).
- Floating-point rounding is already EPSILON-safe in splitEqually (integer-cent arithmetic) and calculateSettleUp (Math.round * 100 / 100 pattern). The 50/50 rounding in import-jobs.js uses the floor + remainder pattern. No changes needed to the math engine.

### 1.3 Key Data Already Available Client-Side (No New API Calls)

From GET /api/wayfinder/expenses?journey_id=... (already called on mount):
- expenses[] - Each row has: id, paid_by_user_id, paid_by_name, category, amount_original, currency_original, payment_method, purchase_site, splits[] (with is_settled).
- settlements[] - Each row has: from_user_id, from_user_name, to_user_id, amount, currency, method.

All person-by-person breakdowns, category splits per person, and payment method summaries will be computed via useMemo hooks from these existing arrays.

---

## 2. Feature Scope

### 2.1 What We're Adding (3 Distinct UI Sections)

```
[Existing: Top Controls & Currency Switcher]
[Existing: 4 Single-User Summary Cards]
[Existing: Debt Settle-Up Banner]
---
[NEW: "Expedition Breakdown" Expandable Panel]
  - Participant toggle bar (All | Jon Kemp | Ronald Few)
  - Per-person summary cards (2 side-by-side on sm+, stacked on mobile)
  - [On expand per-card] Category bars + Payment method groups per person
  - [On expand per-card] Participant-scoped ledger feed filter pills
[Existing: Category filter pills + expense list]
[Existing: Settlement history accordion]
```

### 2.2 What We're NOT Changing

- handleSeedPresets, handleSaveExpense, handleSettleUp, handleConfirmItemSettle, handleUndoSplit, handleUndoSettlement, handleDeleteExpense - all CRUD operations preserved exactly.
- The Add Expense modal (lines 907-1107) - untouched.
- The Settle Total modal (lines 1109-1178) - untouched.
- The Item Settle modal (lines 1180-1258) - untouched.
- expenseLedger.js utility functions - no changes to existing functions.
- budget.js backend - no changes.
- expenses.js backend - no changes.

---

## 3. Implementation Plan

### Phase 1: Extend expenseLedger.js with Three New Pure Functions

File: e:/TechTrekGT/wayfinder/src/utils/expenseLedger.js
Action: APPEND ONLY - add ~65 lines at the end of the file. Zero changes to existing functions.

#### 3.1.A computePersonCategoryBreakdown(expenses, personId, displayCurrency)

```
Input:  expenses[], personId string, displayCurrency string
Output: { [normalizedCategory]: { paidByPerson: number, shareOwed: number, settled: number } }
```

Logic:
- For each expense where paid_by_user_id === personId (or fallback user_id === personId):
  accumulate paidByPerson per normalized category, converting amount_original / currency_original to displayCurrency.
- For each expense split where split.user_id === personId:
  accumulate shareOwed per category. If split.is_settled, also accumulate settled.
- Return map keyed by canonical category strings: flight, lodging, transit, activity, dining, market, other.
- All accumulations wrapped in Math.round(x * 100) / 100 at finalization.

#### 3.1.B computePersonPaymentMethods(expenses, personId, displayCurrency)

```
Input:  expenses[], personId string, displayCurrency string
Output: Array<{ method: string, totalPaid: number, count: number }>
```

Logic:
- Filter expenses where paid_by_user_id === personId (or user_id === personId).
- Group by payment_method (normalize empty/null to 'Unknown').
- For each group: sum convertCurrency(amount_original, currency_original, displayCurrency) and count.
- Return sorted descending by totalPaid.
- All totals wrapped in Math.round(x * 100) / 100.

#### 3.1.C buildNetFormula(balance, displayCurrency)

```
Input:  balance object from calculateSettleUp, displayCurrency
Output: Object { paidLabel, shareLabel, sentLabel, receivedLabel, netLabel } - formatted strings
```

No network calls. Pure string formatting using existing formatCurrency.
Used by the formula tooltip to show:
  Paid Out-of-Pocket: $X,XXX.XX
- Allocated Share:    $X,XXX.XX
+ Settlements Sent:  $   XXX.XX
- Settlements Recv:  $   XXX.XX
= Net Balance:       +$  XXX.XX  (or -$XXX.XX)

---

### Phase 2: New Sub-Component PersonBreakdownPanel.jsx

File (new): e:/TechTrekGT/wayfinder/src/components/budget/PersonBreakdownPanel.jsx
Action: CREATE NEW ~320 lines. No existing files modified in this step.

This is a pure presentational component. It receives all data as props - no useState for data, no fetch calls. It is fully self-contained and imported by ExpenseLedger.jsx.

#### Props Interface

```js
PersonBreakdownPanel({
  participants,              // [{ id, name }] - same useMemo array from ExpenseLedger
  balances,                  // balanceList[] from calculateSettleUp()
  expenses,                  // raw expenses[] array
  settlements,               // raw settlements[] array
  displayCurrency,           // string
  currentUserId,             // string
  isViewer,                  // boolean
  totalExpeditionInDisplay,  // number - for contribution % bar
  onPersonFilterChange,      // callback(userId | null, filterMode | null)
})
```

#### Internal Component State (local only - no lifting needed except via callback)

```js
const [isExpanded, setIsExpanded]           = useState(false);  // panel open/close toggle
const [expandedPersonId, setExpandedPersonId] = useState(null); // which person drill-down open
const [activeTooltipId, setActiveTooltipId] = useState(null);  // formula tooltip visible
const [activeFeedFilter, setActiveFeedFilter] = useState(null); // { personId, mode }
```

#### Layout Structure

```
[Panel Header: "Expedition Breakdown" + count badge + ChevronDown icon - clickable to toggle]

[When isExpanded:]
  Participant Filter Bar:
    [All Travelers pill] [Jon Kemp pill] [Ronald Few pill]
    (pills set expandedPersonId when clicked)

  Person Cards Row (flex-col on mobile, flex-row on sm+):
    [Jon Kemp Card]                          [Ronald Few Card]
    - Avatar initials circle (amber ring)    - Avatar initials circle (blue ring)
    - Paid Out-of-Pocket: sky-400            - Paid Out-of-Pocket: sky-400
    - Fair Share (Liability): purple-400     - Fair Share: purple-400
    - Reimbursements Settled: slate-400      - Reimbursements: slate-400
    - Contribution % progress bar            - Contribution % progress bar
    - Net Position: emerald/amber/slate      - Net Position: emerald/amber/slate
    - Net label: "Owed by group" etc.        - Net label: "Owes Jon" etc.
    - Formula tooltip button (i)             - Formula tooltip button (i)
    - [Expand Details chevron button]        - [Expand Details chevron button]

  [When expandedPersonId === person.id:]
    Category Split for [Person Name]:
      (7 rows, one per canonical category, even if zero)
      [Icon] [Category Label]
        Paid: $XXX.XX  |progress bar: paid/totalExpedition|
        Share: $XXX.XX |progress bar: share/totalShare|

    Payment Method Summary:
      (sorted by totalPaid desc)
      [CreditCard icon] [Method Name]    $X,XXX.XX  (N charges)

    Ledger Feed Filter:
      [All] [Paid by Person] [Owed by Person (Unsettled)] [Settled Items]
      (These call onPersonFilterChange to lift filter state to ExpenseLedger)
```

#### Formula Tooltip Implementation

A simple useState toggle (not CSS-only) to ensure keyboard/screen reader accessibility.
Tooltip is an absolutely positioned div within the card's `position: relative` container.
Dismissed by clicking the (i) button again, or by clicking anywhere outside (useEffect mousedown listener referencing a ref).
Content: formatted strings from buildNetFormula() helper.
Example:
```
  Paid Out-of-Pocket:    $1,980.00
- Allocated Share:       $  990.00
+ Settlements Sent:      $    0.00
- Settlements Received:  $    0.00
                        ───────────
= Net Balance:           + $990.00
```

#### Category Drill-Down useMemo Computation

Inside PersonBreakdownPanel, two useMemos compute per-person data:

```js
const personCategoryData = useMemo(() => {
  const result = {};
  for (const p of participants) {
    result[p.id] = computePersonCategoryBreakdown(expenses, p.id, displayCurrency);
  }
  return result;
}, [expenses, participants, displayCurrency]);

const personPaymentData = useMemo(() => {
  const result = {};
  for (const p of participants) {
    result[p.id] = computePersonPaymentMethods(expenses, p.id, displayCurrency);
  }
  return result;
}, [expenses, participants, displayCurrency]);
```

No re-derivation of balance data - balances prop is passed in directly from calculateSettleUp already computed in ExpenseLedger.

---

### Phase 3: Surgical Edits to ExpenseLedger.jsx

File: e:/TechTrekGT/wayfinder/src/components/budget/ExpenseLedger.jsx
Action: 3 targeted surgical edits only.

#### Edit A - Import Line (top of file, after line 13)

Target exact text:
```
} from '../../utils/expenseLedger';
```

Replacement:
```
  buildNetFormula
} from '../../utils/expenseLedger';
import { PersonBreakdownPanel } from './PersonBreakdownPanel.jsx';
```

(Adds buildNetFormula to the existing named import destructure, then adds the new component import.)

#### Edit B - Two New State Variables (after line 93: `const [isSubmitting, setIsSubmitting] = useState(false);`)

Surgical insert after that exact line:
```js
  // Person-by-Person breakdown panel filter state
  const [activePersonId, setActivePersonId] = useState(null);
  const [personFilter, setPersonFilter] = useState(null); // null | 'paid_by' | 'owed_by' | 'settled'
```

#### Edit C - Extend filteredExpenses useMemo (lines 172-176)

Target exact text:
```js
  const filteredExpenses = useMemo(() => {
    if (selectedCategory === 'all') return expenses;
    return expenses.filter(e => normalizeCategory(e.category) === selectedCategory);
  }, [expenses, selectedCategory]);
```

Replacement:
```js
  const filteredExpenses = useMemo(() => {
    let result = selectedCategory === 'all' ? expenses : expenses.filter(e => normalizeCategory(e.category) === selectedCategory);
    if (personFilter === 'paid_by' && activePersonId) {
      result = result.filter(e => (e.paid_by_user_id || e.user_id) === activePersonId);
    } else if (personFilter === 'owed_by' && activePersonId) {
      result = result.filter(e => e.splits?.some(s => s.user_id === activePersonId && !s.is_settled));
    } else if (personFilter === 'settled') {
      result = result.filter(e => e.splits?.length > 0 && e.splits.every(s => Boolean(s.is_settled)));
    }
    return result;
  }, [expenses, selectedCategory, personFilter, activePersonId]);
```

#### Edit D - Insert PersonBreakdownPanel JSX

Target exact text (the comment that opens the Category Filter section at ~line 634):
```jsx
      {/* Filter Tabs & Empty State Presets */}
```

Replacement (prepend the new panel block before that comment):
```jsx
      {/* Person-by-Person Expedition Breakdown Panel */}
      <PersonBreakdownPanel
        participants={participants}
        balances={balances}
        expenses={expenses}
        settlements={settlements}
        displayCurrency={displayCurrency}
        currentUserId={currentUserId}
        isViewer={isViewer}
        totalExpeditionInDisplay={totalExpeditionInDisplay}
        onPersonFilterChange={(userId, filterMode) => {
          setActivePersonId(userId);
          setPersonFilter(filterMode);
        }}
      />

      {/* Filter Tabs & Empty State Presets */}
```

---

## 4. Styling Specification

All Tailwind classes follow the existing dark-mode palette. No new colors introduced.

| Element | Tailwind Classes |
|---|---|
| Panel container | p-5 rounded-2xl glass-panel border border-white/15 bg-slate-900/70 space-y-4 |
| Panel header button | w-full flex items-center justify-between cursor-pointer select-none group |
| Panel title | text-sm font-bold text-slate-200 flex items-center space-x-2 |
| Count badge | px-2 py-0.5 rounded-lg bg-white/10 text-xs text-slate-400 |
| Chevron icon | w-4 h-4 text-slate-400 transition-transform (rotate-180 when expanded) |
| Participant filter row | flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none |
| Person cards wrapper | flex flex-col sm:flex-row gap-4 |
| Person card | flex-1 relative p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-3 |
| Avatar circle (Jon) | w-10 h-10 rounded-full bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center text-amber-300 font-black text-sm |
| Avatar circle (Ronald) | w-10 h-10 rounded-full bg-sky-500/20 border-2 border-sky-500/50 flex items-center justify-center text-sky-300 font-black text-sm |
| Paid out-of-pocket | text-xl font-black text-sky-300 |
| Fair share | text-base font-bold text-purple-300 |
| Settled amount | text-xs text-slate-400 |
| Progress bar track | h-1.5 w-full rounded-full bg-white/10 mt-1 |
| Progress bar fill | h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 |
| Net positive | text-2xl font-black text-emerald-400 |
| Net negative | text-2xl font-black text-amber-400 |
| Net zero | text-2xl font-black text-slate-300 |
| Formula tooltip | absolute left-0 bottom-full mb-2 z-20 w-64 p-3 rounded-xl bg-slate-800 border border-white/15 shadow-xl text-xs font-mono text-slate-200 |
| Category drill-down section | mt-3 pt-3 border-t border-white/10 space-y-2 |
| Category bar row | flex items-center space-x-2 py-1 |
| Category bar track | flex-1 h-1 rounded-full bg-white/10 |
| Category bar fill paid | h-1 rounded-full bg-sky-500 |
| Category bar fill share | h-1 rounded-full bg-purple-500 |
| Payment method row | flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 |
| Feed filter pills | Reuse existing pill style: px-3 py-1.5 rounded-xl text-xs font-bold |
| Active feed filter | bg-amber-500 text-slate-950 shadow-sm |
| Inactive feed filter | text-slate-400 hover:text-white hover:bg-white/5 |

---

## 5. Math Precision Verification

No changes to math are needed - the existing implementations are already EPSILON-safe:

1. splitEqually uses integer-cent arithmetic: Math.round(amount * 100) -> Math.floor(cents / count) -> remainder distribution. Already verified - no floating-point drift.

2. calculateSettleUp wraps every accumulation in Math.round(x * 100) / 100.

3. Category breakdown accumulation in the new computePersonCategoryBreakdown:
   - Convert amount_original to display currency via existing convertCurrency (which itself uses Math.round(result * 100) / 100).
   - Accumulate in a plain JS object. Finalize each total with Math.round(total * 100) / 100.

4. 50/50 penny handling (documented invariant from import-jobs.js):
   - split1 = Math.floor((amount / 2) * 100) / 100
   - split2 = Number((amount - split1).toFixed(2))
   - This invariant is in the backend only and surfaces correctly through the existing splits[] data - no client-side change needed.

5. Currency conversion formula verification example ($22.59 split):
   - $22.59 total -> Math.round(22.59 * 100) = 2259 cents
   - baseCents = Math.floor(2259 / 2) = 1129
   - remainderCents = 2259 % 2 = 1
   - Person 1 gets: 1129 + 1 = 1130 cents = $11.30
   - Person 2 gets: 1129 + 0 = 1129 cents = $11.29
   - Sum: $22.59 EXACT (zero penny drift)

---

## 6. Accessibility & Mobile Considerations

- Participant filter pills and person cards are keyboard-navigable (native <button> elements).
- Formula tooltip is dismissible via Escape key (simple keydown listener in useEffect returning cleanup).
- Category bars include title attributes with numeric values for screen reader context.
- The panel header button includes aria-expanded={isExpanded} and aria-controls="breakdown-panel-content".
- Mobile layout: participant cards stack vertically (flex-col) below sm: breakpoint; side-by-side (flex-row sm:flex-row) on sm: and above.
- Payment method summary and category drill-down are inside the person card's expansion - they stack naturally below the summary fields on mobile with no overflow.
- Touch target sizes: all interactive buttons maintain minimum 36px height (py-2 on sm:, py-1.5 on xs).

---

## 7. File Change Summary

| File | Action | Line Count Impact |
|---|---|---|
| src/utils/expenseLedger.js | APPEND 3 new exported functions at EOF | +65 lines |
| src/components/budget/PersonBreakdownPanel.jsx | CREATE NEW sub-component | +320 lines (new file) |
| src/components/budget/ExpenseLedger.jsx | 4 surgical edits: import, 2 state vars, filteredExpenses, JSX insert | ~20 lines changed |

Zero backend changes required. Zero schema changes required.

---

## 8. Post-Approval Execution Order

1. Append computePersonCategoryBreakdown, computePersonPaymentMethods, and buildNetFormula to expenseLedger.js.
2. Create PersonBreakdownPanel.jsx in src/components/budget/.
3. Apply 4 surgical edits to ExpenseLedger.jsx (import update, 2 state vars, filteredExpenses update, JSX panel insert).
4. Run npm run build inside e:/TechTrekGT/wayfinder/ via PowerShell.
5. If build passes with zero errors: run npm run deploy.
6. Update wayfinder/docs/03_features.md (append new subsection to Section 5).
7. Update wayfinder/docs/04_state.md (append new subsection 9.4 to Section 9).
8. No changes needed to root docs/04_state.md (no schema or cross-app contract changes).

---

## 9. Post-Flight Documentation Targets

### 9.1 wayfinder/docs/03_features.md - Append to Section 5 (Private Trip Hub)

New subsection: "5.X Person-by-Person Shared Ledger Breakdown" documenting:
- Expandable PersonBreakdownPanel above expense list (collapsed by default, one-click expand).
- Per-person summary cards: Paid Out-of-Pocket, Fair Share (Liability), Reimbursements Settled, Contribution % bar, Net Position (emerald/amber/slate).
- Net Balance Formula tooltip showing exact (Out-of-Pocket Paid) - (Allocated Share) + (Settlements Sent) - (Settlements Received) = Net.
- Per-person category drill-down: horizontal bars for each of 7 categories (paid vs. share).
- Payment method grouping per payer: sorted by total amount paid per instrument.
- Participant-scoped ledger feed filter: All | Paid by Person | Owed by Person (Unsettled) | Settled Items.
- Pure client-side computation via useMemo - zero additional API calls.

### 9.2 wayfinder/docs/04_state.md - Append to Section 9

New subsection "9.4 Person-by-Person Breakdown Client State":
- personFilter state: null | 'paid_by' | 'owed_by' | 'settled' in ExpenseLedger.jsx.
- activePersonId state: null | string (userId) in ExpenseLedger.jsx.
- isExpanded, expandedPersonId, activeTooltipId, activeFeedFilter local states in PersonBreakdownPanel.jsx.
- personCategoryData, personPaymentData useMemo caches in PersonBreakdownPanel.jsx keyed by participant userId.
- New pure utility exports from expenseLedger.js: computePersonCategoryBreakdown(expenses, personId, displayCurrency), computePersonPaymentMethods(expenses, personId, displayCurrency), buildNetFormula(balance, displayCurrency).

Root docs/04_state.md: NO CHANGES - no new tables, no schema changes, no cross-app contract changes.

---

## 10. Risk Assessment

| Risk | Mitigation |
|---|---|
| calculateSettleUp returns balances keyed by userId - ordering may be unstable | Panel derives participant order from the fixed participants array (not from Object.values(balances)). Balance for each person is found by .find(b => b.id === p.id). |
| paid_by_user_id is null on legacy rows | Both computePersonCategoryBreakdown and filteredExpenses use exp.paid_by_user_id \|\| exp.user_id fallback, identical to existing ExpenseLedger.jsx pattern. |
| Formula tooltip z-index conflicts with sticky nav | Tooltip uses position: absolute within card's position: relative container. Never reaches z-50 nav level. |
| New state variables (personFilter, activePersonId) adding to filteredExpenses dependency array | Both are plain string/null values set only by user interaction callbacks. No computed values, no infinite loop risk. |
| New component file missing from Vite bundle | Vite auto-discovers static imports. No vite.config.js change needed. |
| PersonBreakdownPanel renders before balances are populated (loading state) | Panel checks balances.length === 0 and shows a minimal skeleton or returns null. Loading state already managed by parent's loading state. |

