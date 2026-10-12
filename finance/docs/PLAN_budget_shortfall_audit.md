# Implementation Plan: Budget Shortfall Audit & Per Paycheck Target Fix

**Status:** Approved & Implemented
**Date:** 2026-10-12
**Scope:** Finance OS - DashboardView.jsx / BudgetMetadataContext.jsx

---

## Part 1: Audit Findings

### 1A. Household Budget Shortfall Banner

**Location:** `src/components/DashboardView.jsx` lines 699-716, inside `case 'earner_splits':`

**How the banner value is computed:**

```
totalNetMonthly    = SUM(getMonthlyNetIncome(p))         for all people
totalTargetMonthly = SUM(per-person obligation monthly)
  if (hasAllocations):
    perPaycheck = SUM(getPersonDepositAmountForAccount per account)
    bi-weekly:   (perPaycheck * 26) / 12
  else:
    getPersonMonthlyTotal(p.id)
totalSurplusMonthly = totalNetMonthly - totalTargetMonthly
```

**Root cause of the displayed -$156.15:**

- `getMonthlyNetIncome` for bi-weekly: `netPerPay * 26 / 12` (annualized)
- `getPersonMonthlyTotal` for obligations uses `getAccountSaveExtraPersonPortion`
  which calls `MONTHLY_DISPLAY_PERIODS['bi-weekly'] = 2` (baseline 2 paychecks/mo display)
- Bills portion uses `getBillMonthlyCost` (monthly amounts divided as-is)

For Jon (bi-weekly, Monthly Net = $1,770.00, Monthly Obligations = $1,926.19):
- Individual deficit: $1,770.00 - $1,926.19 = -$156.19
- Offset slightly by Gym Credit surplus = net household shortfall of -$156.15

**Key insight:** The -$156.15 is an **earner-level allocation imbalance** (Jon's assigned obligations are 108.8% of his monthly net), not necessarily a household income shortage. The banner label "Household Budget Shortfall" is misleading without context. **The math is correct; the UX is deficient.**

**No calculation changes needed for the banner.** Only the tooltip must be added.

---

### 1B. Per Paycheck Target - `getPersonPerPaycheckTotal`

**Location:** `src/context/BudgetMetadataContext.jsx` lines 848-861

**Current code (broken):**
```js
const getPersonPerPaycheckTotal = useCallback((personId, stateOverride) => {
  const state = stateOverride || metadataState;
  const person = (state.people || []).find(p => p.id === personId);
  if (!person) return 0;
  const monthlyTotal = getPersonMonthlyTotal(personId, state);
  if (person.payFrequency === 'semi-monthly') {
    return monthlyTotal / 2;
  } else if (person.payFrequency === 'bi-weekly') {
    return (monthlyTotal * 12) / 26;   // BUG
  } else if (person.payFrequency === 'weekly') {
    return (monthlyTotal * 12) / 52;   // BUG
  }
  return monthlyTotal;
}, [metadataState, getPersonMonthlyTotal]);
```

**Traced dependency chain:**
- `getPersonMonthlyTotal` calls `getAccountSaveExtraPersonPortion`
- `getAccountSaveExtraPersonPortion` uses `MONTHLY_DISPLAY_PERIODS['bi-weekly'] = 2`
  meaning it multiplies the per-pay surplus by **2** to get the monthly figure
- Bills portion from `getBillPersonMonthlyPortion` is already monthly (no frequency conversion)

**Round-trip math for bi-weekly (Gym Credit, $11.25/pay):**

| Step | Value | Operation |
|---|---|---|
| Per-paycheck bill/savings | $11.25 | Input |
| Monthly total (built with `*2`) | $22.50 | `* MONTHLY_DISPLAY_PERIODS['bi-weekly']` = `* 2` |
| Per-paycheck target (current) | $10.38 | `$22.50 * 12 / 26` (WRONG) |
| Per-paycheck target (correct) | $11.25 | `$22.50 / 2` (symmetric inverse) |

**Round-trip math for weekly:**

| Step | Operation |
|---|---|
| Monthly built with | `* MONTHLY_DISPLAY_PERIODS['weekly']` = `* 4` |
| Current inverse | `* 12 / 52 = * 0.2308` (rounds down: `4 * 0.2308 = 0.9231 != 1`) |
| Correct inverse | `/ 4` (symmetric) |

**Conclusion:** `getPersonPerPaycheckTotal` must divide by the **same baseline factor** that `getPersonMonthlyTotal` used to build the monthly total - not by the annualized factor.

---

### 1C. `getAmountPerPaycheck` bi-weekly hardcoded to 24 (paydayUtils.js line 205-207)

This is a **deliberate design decision** - the goal-based funding path budgets on 24 periods/yr
(baseline 2 paychecks/mo * 12 months) to match `MONTHLY_DISPLAY_PERIODS`. This is internally
consistent with `goalMonthlyDisplay` and `calculateDashboardTotalsForContributor`. **No change.**

---

### 1D. `allocateEarnerCredit` FIN-AUDIT-003 Compliance

Per `03_features.md`: "clamping extra savings to prevent over-allocation" (`earnerReg + earnerExtra <= earnerDeposit`). This is already implemented correctly. **No change.**

---

## Part 2: Changes Required

### Change 1 - Fix `getPersonPerPaycheckTotal` (CRITICAL BUG FIX)

**File:** `src/context/BudgetMetadataContext.jsx`
**Lines:** 848-861

**Before:**
```js
const getPersonPerPaycheckTotal = useCallback((personId, stateOverride) => {
  const state = stateOverride || metadataState;
  const person = (state.people || []).find(p => p.id === personId);
  if (!person) return 0;
  const monthlyTotal = getPersonMonthlyTotal(personId, state);
  if (person.payFrequency === 'semi-monthly') {
    return monthlyTotal / 2;
  } else if (person.payFrequency === 'bi-weekly') {
    return (monthlyTotal * 12) / 26;
  } else if (person.payFrequency === 'weekly') {
    return (monthlyTotal * 12) / 52;
  }
  return monthlyTotal;
}, [metadataState, getPersonMonthlyTotal]);
```

**After:**
```js
const getPersonPerPaycheckTotal = useCallback((personId, stateOverride) => {
  const state = stateOverride || metadataState;
  const person = (state.people || []).find(p => p.id === personId);
  if (!person) return 0;
  const monthlyTotal = getPersonMonthlyTotal(personId, state);
  // Invert MONTHLY_DISPLAY_PERIODS (the same factor used to build the monthly total):
  //   bi-weekly = 2 paychecks/mo baseline  -> divide by 2
  //   semi-monthly = 2 paychecks/mo exact  -> divide by 2
  //   weekly = 4 weeks/mo baseline          -> divide by 4
  //   monthly = 1                           -> return as-is
  if (person.payFrequency === 'semi-monthly') return round2(monthlyTotal / 2);
  if (person.payFrequency === 'bi-weekly')    return round2(monthlyTotal / 2);
  if (person.payFrequency === 'weekly')       return round2(monthlyTotal / 4);
  return round2(monthlyTotal);
}, [metadataState, getPersonMonthlyTotal]);
```

**Effect:** Gym Credit bi-weekly Per Paycheck Target: $10.38 -> **$11.25** (correct).

---

### Change 2 - Add Shortfall Tooltip to `DashboardView.jsx`

**File:** `src/components/DashboardView.jsx`

#### 2A. Add `HelpCircle` and `X` to lucide-react import

Find the lucide-react import line and add `HelpCircle` and `X` if not already present.

#### 2B. Add `shortfallTooltipOpen` state at component level

Near line ~200 with other `useState` declarations:
```js
const [shortfallTooltipOpen, setShortfallTooltipOpen] = React.useState(false);
```

#### 2C. Replace the shortfall banner (lines 703-716)

**Before** (current banner, no tooltip):
```jsx
{peopleList.length > 0 && Math.abs(totalSurplusMonthly) >= 0.01 && (
  <div className={`p-2.5 rounded-xl flex items-center justify-between font-mono text-xs ${
    totalSurplusMonthly > 0
      ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-200'
      : 'bg-rose-950/50 border border-rose-800/60 text-rose-200'
  }`}>
    <span className="font-sans font-semibold text-slate-300">
      {totalSurplusMonthly > 0 ? 'Total Household Available for Savings:' : 'Household Budget Shortfall:'}
    </span>
    <span className="font-bold text-sm">
      {totalSurplusMonthly > 0 ? `+${fmtMoney(totalSurplusMonthly)}` : fmtMoney(totalSurplusMonthly)}
      <span className="text-[10px] font-normal text-slate-400 ml-1">/ mo</span>
    </span>
  </div>
)}
```

**After** (banner + inline tooltip panel):
```jsx
{peopleList.length > 0 && Math.abs(totalSurplusMonthly) >= 0.01 && (
  <div className="space-y-2">
    <div className={`p-2.5 rounded-xl flex items-center justify-between font-mono text-xs ${
      totalSurplusMonthly > 0
        ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-200'
        : 'bg-rose-950/50 border border-rose-800/60 text-rose-200'
    }`}>
      <span className="font-sans font-semibold text-slate-300 flex items-center gap-1.5">
        {totalSurplusMonthly > 0 ? 'Total Household Available for Savings:' : 'Household Budget Shortfall:'}
        <button
          id="shortfall-info-btn"
          type="button"
          aria-label="Show budget shortfall explanation"
          aria-expanded={shortfallTooltipOpen}
          aria-controls="shortfall-info-panel"
          onClick={() => setShortfallTooltipOpen(v => !v)}
          className="text-slate-400 hover:text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded transition-colors"
        >
          <HelpCircle size={13} />
        </button>
      </span>
      <span className="font-bold text-sm">
        {totalSurplusMonthly > 0 ? `+${fmtMoney(totalSurplusMonthly)}` : fmtMoney(totalSurplusMonthly)}
        <span className="text-[10px] font-normal text-slate-400 ml-1">/ mo</span>
      </span>
    </div>

    {shortfallTooltipOpen && (
      <div
        id="shortfall-info-panel"
        role="region"
        aria-label="Budget shortfall explanation"
        className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-[11px] text-slate-300 space-y-2.5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-200 font-sans">Household Budget Breakdown</span>
          <button
            type="button"
            aria-label="Close explanation"
            onClick={() => setShortfallTooltipOpen(false)}
            className="text-slate-500 hover:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          >
            <X size={12} />
          </button>
        </div>

        <div className="space-y-1 font-mono">
          <div className="flex justify-between">
            <span className="text-slate-400 font-sans">Total Monthly Net Income:</span>
            <span className="text-emerald-400 font-bold">{fmtMoney(totalNetMonthly)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400 font-sans">Total Monthly Obligations:</span>
            <span className="text-purple-300 font-bold">{fmtMoney(totalTargetMonthly)}</span>
          </div>
          <div className={`flex justify-between border-t border-slate-700 pt-1 font-bold ${totalSurplusMonthly >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            <span className="font-sans">Net Household Balance:</span>
            <span>{totalSurplusMonthly >= 0 ? '+' : ''}{fmtMoney(totalSurplusMonthly)} / mo</span>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-2 space-y-1.5">
          <span className="font-sans font-semibold text-slate-300 block">Earner Breakdown:</span>
          {peopleList.map(p => {
            const inc = getMonthlyNetIncome(p);
            const obl = getPersonMonthlyTotal(p.id);
            const pct = inc > 0 ? (obl / inc) * 100 : 0;
            const bal = round2(inc - obl);
            return (
              <div key={p.id} className="bg-slate-800/60 rounded-lg p-2 space-y-0.5 font-mono">
                <div className="flex justify-between items-center">
                  <span className="font-sans font-semibold text-slate-200">{p.name}</span>
                  <span className="text-[10px] text-slate-500 font-sans capitalize">{p.payFrequency}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400 font-sans">Net / Month:</span>
                  <span className="text-emerald-400">{fmtMoney(inc)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400 font-sans">Obligations:</span>
                  <span className="text-purple-300">{fmtMoney(obl)} ({fmtPct(pct)})</span>
                </div>
                <div className={`flex justify-between text-[10px] border-t border-slate-700/60 pt-0.5 font-bold ${bal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span className="font-sans">Individual Balance:</span>
                  <span>{bal >= 0 ? '+' : ''}{fmtMoney(bal)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {totalSurplusMonthly < 0 && (
          <div className="border-t border-slate-700 pt-2 text-[10px] text-slate-400 font-sans leading-relaxed">
            <span className="text-amber-400 font-semibold">Note: </span>
            This shortfall reflects an earner-level allocation imbalance - one or more
            earners have assigned obligations exceeding their individual monthly net income.
            Check individual earner balances above to identify over-allocated earners and
            rebalance bill splits or savings contributions in Settings.
          </div>
        )}
      </div>
    )}
  </div>
)}
```

**Note:** `round2` is already available in `DashboardView.jsx` via its context imports
(`useBudget` exposes it). Confirm via grep before assuming - if not, import from `../utils/formatters`.

---

## Part 3: File Change Summary

| File | Lines Changed | Change Type |
|---|---|---|
| `src/context/BudgetMetadataContext.jsx` | 853-860 | Bug fix: `getPersonPerPaycheckTotal` divisors |
| `src/components/DashboardView.jsx` | ~200 (state), import line, 703-716 | Feature: tooltip state + HelpCircle import + banner replacement |

**Files not modified:**
- `src/utils/paydayUtils.js` - no changes (bi-weekly 24 period is intentional)
- All other context/utility files

---

## Part 4: Post-Flight Documentation Updates

### `docs/03_features.md` - Add to Section 5:
> "Per Paycheck Target Symmetry Fix (FIN-BUDGET-001): `getPersonPerPaycheckTotal` in `BudgetMetadataContext.jsx` now divides the monthly obligation total by the same `MONTHLY_DISPLAY_PERIODS` baseline factor used to build it (`/2` for bi-weekly and semi-monthly, `/4` for weekly), not by annualized divisors (`*12/26`, `*12/52`). This makes the Per Paycheck Target displayed in the earner splits widget symmetric and consistent with Monthly Bill & Savings Share."

### `docs/03_features.md` - Add to Section 6:
> "Household Budget Shortfall Tooltip (UI-BUDGET-001): The earner splits widget shortfall/surplus banner now includes an accessible `HelpCircle` toggle button. The expandable panel shows: (a) total household monthly net income vs. total monthly obligations; (b) per-earner rows with individual net, obligations, percentage, and individual balance; (c) an explanatory note when shortfall is detected clarifying the distinction between an earner-level allocation imbalance and a true household income deficit."

### `docs/04_state.md` - Add to Section 8:
> "Earner Splits Shortfall Tooltip State (UI-BUDGET-001): `DashboardView` holds a `shortfallTooltipOpen` boolean state controlling visibility of the budget breakdown tooltip panel on the household shortfall/surplus banner."

---

## Part 5: Build & Deploy

Per workspace Mandatory Build & Deploy Loop rule:
1. `cd e:/TechTrekGT/finance`
2. `npm run build` - must exit zero errors
3. `npm run deploy` - Cloudflare Worker deploy
4. Verify deployment URL and log status in task summary
