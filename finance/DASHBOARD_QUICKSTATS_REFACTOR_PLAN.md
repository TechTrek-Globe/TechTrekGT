# Refactor Plan: Dashboard Account Balance Snapshot & Sidebar Quick Stats

## Executive Summary
This document provides the comprehensive audit findings and surgical implementation plan to refactor the **Account Balances Snapshot** widget on the Financial Dashboard and the **Quick Stats** panel in the Application Sidebar within TechTrekGT Finance (`e:/TechTrekGT/finance`).

The refactor resolves visual hierarchy confusion, updates naming terminology, and eliminates calculation discrepancies between static starting balances, mid-month snapshots, and true projected month-end figures.

---

## 1. Audit Findings: Current State vs. Proposed "Month End (Est)"

### 1.1 Sidebar "Cash On Hand" Discrepancy
- **Where it is currently computed:**
  - In `src/components/AppLayout.jsx` (line 129), `getTotalCashOnHand` is imported from `useBudgetMetadata()`.
  - In `src/context/BudgetMetadataContext.jsx` (lines 641-657):
    ```javascript
    const getTotalCashOnHand = useCallback((accountsOverride) => {
      const accounts = accountsOverride || metadataState.accounts || [];
      return accounts.reduce((sum, acc) => {
        let bal = 0;
        if (acc.importedLedgerRows && typeof acc.importedLedgerRows === 'object') {
          const dates = Object.keys(acc.importedLedgerRows).sort();
          if (dates.length > 0) {
            const latest = acc.importedLedgerRows[dates[dates.length - 1]];
            if (typeof latest === 'number') bal = latest;
            else if (latest && typeof latest === 'object' && typeof latest.totalEnding === 'number') bal = latest.totalEnding;
          }
        }
        if (!bal) {
          bal = (parseFloat(acc.startingBalance) || 0) + (acc.enableExtraSavings !== false ? (parseFloat(acc.extraStartingBalance) || 0) : 0);
        }
        return sum + bal;
      }, 0);
    }, [metadataState.accounts]);
    ```
  - **Root Cause:** `BudgetMetadataContext` has no access to the running ledger simulation (`getCalculatedBalanceAsOf`), payday schedules, or bill debits. It sums static starting balances (or old imported row snapshots), yielding **$9,391** in the screenshot.
  - Furthermore, in `src/context/LedgerDataContext.jsx` (lines 815-822), `getTotalCashOnHand` was hardcoded to evaluate `getCalculatedBalanceAsOf(acc.id, today)` (today's mid-month date, e.g. August 27th), producing an arbitrary mid-month balance rather than the Month End figure.

- **Proposed Calculation for "Month End (Est)":**
  - Compute the target date as the final day of the active month:
    `const endOfMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);`
  - Update `LedgerDataContext.jsx` so `getTotalCashOnHand` supports an optional target date parameter (`asOfDate`), and export a dedicated `getTotalMonthEndCashOnHand(accountsOverride, targetDate)`.
  - For each account, evaluate:
    `const balObj = getCalculatedBalanceAsOf(acc.id, endOfMonthDate);`
    `const monthEndBal = balObj?.totalEnd ?? (parseFloat(acc.startingBalance) || 0);`
  - Update `AppLayout.jsx` to consume `useBudget()` (which provides `LedgerDataContext` running simulation) instead of `useBudgetMetadata()`.
  - The resulting Sidebar Cash On Hand will match the exact sum of all account "Month End Balance (Est)" figures on the dashboard.

---

### 1.2 Sidebar "Net Income/Mo"
- **Where it is currently computed:**
  - In `src/context/BudgetMetadataContext.jsx` (lines 540-562), `getTotalMonthlyNetIncome(budget?.people)` normalizes each person's `netPerPay` by their pay frequency:
    - Semi-monthly: `net * 2`
    - Bi-weekly: `(net * 26) / 12`
    - Weekly: `(net * 52) / 12`
  - In the screenshot: `$3,394.38` (rounded to `$3,394` in sidebar).
- **Proposed Calculation for "Month End (Est)":**
  - Maintain `getTotalMonthlyNetIncome(budget?.people)` as the primary baseline.
  - This accurately reflects total projected take-home earnings across all household earners for the month.

---

### 1.3 Sidebar "Monthly Flow"
- **Where it is currently computed:**
  - In `src/components/AppLayout.jsx` (line 149):
    `const netFlow = useMemo(() => netIncome - expenses, [netIncome, expenses]);`
    where `expenses` was `getTotalMonthlyExpenses(budget?.bills)`.
  - `getTotalMonthlyExpenses` sums planned recurring bill obligations without checking whether actual line items have been logged for the active month.
- **Proposed Calculation for "Month End (Est)":**
  - In `AppLayout.jsx`, utilize `getTotalActualExpenses(monthKey, budget?.bills)` from `useBudget()`.
  - `getTotalActualExpenses` checks `lineItems` for the active month: if an actual amount is recorded (e.g. Electric bill is $158.40 instead of $165.00), it uses the actual amount; for upcoming unbilled items, it uses the planned monthly cost.
  - `netFlow = netIncome - expenses`. This ensures any actual bill variances already incurred during the month are reflected in the projected month-end net flow.

---

## 2. UI Reordering & Hierarchy Plan

### 2.1 Dashboard > Account Balances Snapshot Card
**Target Component:** `src/components/DashboardView.jsx` (`case 'account_cards':`, lines 517-575)

#### Current Layout Problem:
- The top-right of the card header currently contains:
  ```jsx
  <div className="text-right">
    <span className="text-xs font-black text-slate-100 font-mono block">
      {fmtMoney(currentBalance)}
    </span>
    <span className="text-xs text-slate-500 block mt-0.5">Current Balance</span>
  </div>
  ```
  This creates visual clutter in the card header, competing with the account name and type, while the projected month-end balance is pushed down to the very bottom labeled as "End Balance (Actual)".

#### Proposed Reordered Structure:
1. **Header Row (Identity Focus):**
   - Account Name (`acc.name`) on the left (`text-xs font-bold text-slate-200`).
   - Account Type (`acc.type`) on the right as a clean badge (`text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800/70 border border-slate-700/50`).
2. **Body Rows (Downward Visual Hierarchy):**
   - **Row 1 - Current Balance:**
     ```jsx
     <div className="flex items-center justify-between text-[11px] font-mono">
       <span className="text-slate-400 font-sans">Current Balance:</span>
       <span className="font-semibold text-slate-100">{fmtMoney(currentBalance)}</span>
     </div>
     ```
   - **Row 2 - Monthly Obligations:**
     ```jsx
     <div className="flex items-center justify-between text-[11px] font-mono">
       <span className="text-slate-400 font-sans">Monthly Exp:</span>
       <div className="text-right">
         <span className="text-rose-400 font-bold">{fmtMoney(actualCost)}</span>
         {hasActualOverride && (
           <span className="text-[10px] text-slate-500 block font-sans">Proj: {fmtMoney(monthlyCost)}</span>
         )}
       </div>
     </div>
     ```
   - **Row 3 - Culminating Projected Stat (Top border separator):**
     ```jsx
     <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
       <span className="text-slate-300 font-sans font-medium">Month End Balance (Est):</span>
       <span className={`font-bold ${actualEnd < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
         {fmtMoney(actualEnd)}
       </span>
     </div>
     ```

#### Verification of Value Calculation:
- Active month: `const today = new Date();`
- End of month date: `const endOfMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);`
- Projected balance: `const endOfMonthObj = getCalculatedBalanceAsOf(acc.id, endOfMonthDate);`
- `actualEnd = endOfMonthObj.totalEnd;`
- This correctly simulates through the final calendar day of the active month, incorporating all payday credits and scheduled bills.

---

### 2.2 Sidebar > Quick Stats Panel
**Target Component:** `src/components/AppLayout.jsx` (lines 90-114)

#### Proposed Layout & Naming Changes:
1. **Section Header / Subtitle:**
   - Change:
     `<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Quick Stats</p>`
   - To:
     `<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Month End Quick Stats (est)</p>`
2. **Metric Lines:**
   - **Cash On Hand:** Displays `monthEndCashOnHand` (rounded to integer with `toLocaleString('en-US')`).
   - **Net Income/Mo:** Displays `netIncome` (rounded to integer with `toLocaleString('en-US')`).
   - **Monthly Flow:** Displays `netFlow` with `+` sign when `>= 0` (rounded to integer with `toLocaleString('en-US')`).

---

## 3. Targeted Files and Line Numbers

| File | Target Lines | Planned Modification |
|------|-------------|----------------------|
| `src/context/LedgerDataContext.jsx` | 815-823, 847, 874 | Update `getTotalCashOnHand` to accept `(accountsOverride, asOfDate)`; add `getTotalMonthEndCashOnHand(accountsOverride, targetDate)` and export in context actions. |
| `src/context/BudgetMetadataContext.jsx` | 641-658 | Update JSDoc/comments to clarify static fallback role of `getTotalCashOnHand` when ledger context is unavailable. |
| `src/components/AppLayout.jsx` | 1-2, 90-114, 120-155 | Import `useBudget` instead of `useBudgetMetadata`; calculate `monthEndCashOnHand` using `getCalculatedBalanceAsOf(acc.id, endOfMonthDate)` (or `getTotalMonthEndCashOnHand`); use `getTotalActualExpenses(monthKey)` for `expenses`; rename sidebar header to `"Month End Quick Stats (est)"`. |
| `src/components/DashboardView.jsx` | 517-575 | Reposition "Current Balance" below the account header; place account type badge in header; update "End Balance (Actual):" label to "Month End Balance (Est):"; verify `endOfMonthDate` computation. |

---

## 4. Pre-flight Context Checklist
- [x] Zero TypeScript files: pure JS/JSX exclusively.
- [x] Hand-rolled SPA router preserved (no `react-router-dom`).
- [x] React Context and standard hooks exclusively (no external state libraries).
- [x] Non-destructive Tailwind styling aligned with dark mode tokens.
- [x] No typography violations (standard hyphens used, zero Em Dashes).
- [x] Zero code changes performed prior to explicit user approval.
