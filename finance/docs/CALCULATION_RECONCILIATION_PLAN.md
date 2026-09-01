# Calculation / Reconciliation Discrepancy Fix Plan
## Finance OS - Dashboard vs. Transactions Deposit Mismatch

---

## Background

Two separate surfaces in Finance OS display earner deposit information that should agree but do not:

1. **Dashboard > Account Funding & Transfer Breakdown** (`AccountTransferSummary.jsx`) - "Jon Portion (Semi-Monthly)"
2. **Dashboard > Earner Splits > Direct Deposit Allocations (Per Paycheck)** (`DashboardView.jsx`)
3. **Ledger View > Daily Spreadsheet Matrix** - actual per-deposit credit cells computed by `getCalculatedBalanceAsOf` in `LedgerDataContext.jsx`

All three ultimately delegate to `getPersonDepositAmountForAccount` in `paydayUtils.js`, but the path each surface takes and the multipliers applied after diverge in subtle but important ways.

---

## Identified Root Causes

### Bug 1 - AccountTransferSummary.jsx: bills-basis per-paycheck conversion ignores bi-weekly frequency

**File:** src/components/AccountTransferSummary.jsx (line 99)

When basisMode === 'bills', the per-paycheck conversion hard-codes `monthlyPortion / 2` for all non-weekly frequencies:

```js
// BUGGY - line 99
rawPortion = mode === 'paycheck'
  ? (p.payFrequency === 'weekly' ? (monthlyPortion * 12) / 52 : monthlyPortion / 2)
  : monthlyPortion;
```

For a bi-weekly earner `monthlyPortion / 2` overstates the per-paycheck target by ~8.33% compared to the correct `(monthlyPortion * 12) / 26`.

---

### Bug 2 - paydayUtils.js: getPersonPerPaycheckTotal treats bi-weekly identically to semi-monthly

**File:** src/utils/paydayUtils.js (lines 629-630)

```js
// BUGGY - lines 629-630
if (person.payFrequency === 'semi-monthly' || person.payFrequency === 'bi-weekly') {
  return monthlyTotal / 2;
```

- semi-monthly: 2 exact paychecks/month, so `monthlyTotal / 2` is correct.
- bi-weekly: 26 paychecks/year = `(monthlyTotal * 12) / 26` per paycheck - NOT `monthlyTotal / 2`.

The overstated per-paycheck target appears in the "Per Paycheck Target" row of the Earner Splits widget, but the Ledger Matrix credits the correct `netPerPay` amount per deposit day. This creates a visible number mismatch between Dashboard and Transactions.

**Impact magnitude:** For a bi-weekly earner with $3,000/mo in obligations, Dashboard shows $1,500/paycheck but Ledger deposits $(3000*12)/26 = $1,384.62/paycheck - a $115.38 gap per event.

---

### Bug 3 - DashboardView.jsx: "Total Household Available for Savings" uses bill-splits total, not allocation total

**File:** src/components/DashboardView.jsx (lines 679-681)

```js
// BUGGY - uses bill-splits basis, not allocation basis
const totalTargetMonthly = peopleList.reduce(
  (sum, p) => sum + getPersonMonthlyTotal(p.id), 0
);
const totalSurplusMonthly = totalNetMonthly - totalTargetMonthly;
```

`getPersonMonthlyTotal` sums bill-split portions + extra savings. It does NOT account for:
- Unallocated paycheck remainders (the 'remaining' allocation entries)
- Fixed allocations that exceed bill-split obligations
- Bill/savings splits that don't sum to 100% across earners

If Jon's allocations total $3,000/mo but his bill splits only total $2,700/mo, the household savings surplus is overstated by $300/mo - the Dashboard shows more headroom than actually flows through the deposit ledger.

---

### Bug 4 - (Verified No Change Needed) LedgerDataContext.jsx: getCalculatedBalanceAsOf

**File:** src/context/LedgerDataContext.jsx (lines 742-744)

The balance simulation correctly calls:
```js
earnerDeposit = getPersonDepositAmountForAccount(p, accountId, metadataStateRef.current);
```

This returns the per-paycheck amount with no additional multiplier - correct, because it is called only on actual deposit days (guarded by isPersonDepositDay). No code change is required here. The goal is for Bugs 1-3 to align the Dashboard to what this simulation already computes correctly.

---

## Proposed Changes

> **Guardrails:**
> - Pure JavaScript (ESM / JSX) only - NO TypeScript
> - Custom SPA router - NO react-router-dom
> - State: React Context / hooks only
> - Surgical replace_file_content edits - zero drive-by refactoring

---

### Fix 1 - paydayUtils.js: Correct bi-weekly per-paycheck formula in getPersonPerPaycheckTotal

**File:** src/utils/paydayUtils.js (lines 629-630)

```diff
-  if (person.payFrequency === 'semi-monthly' || person.payFrequency === 'bi-weekly') {
-    return monthlyTotal / 2;
-  } else if (person.payFrequency === 'weekly') {
+  if (person.payFrequency === 'semi-monthly') {
+    return monthlyTotal / 2;
+  } else if (person.payFrequency === 'bi-weekly') {
+    return (monthlyTotal * 12) / 26;
+  } else if (person.payFrequency === 'weekly') {
     return (monthlyTotal * 12) / 52;
   }
```

This aligns "Per Paycheck Target" in the Earner Splits widget with the actual per-paycheck credit amounts in the Ledger Matrix.

---

### Fix 2 - AccountTransferSummary.jsx: Correct bills-basis per-paycheck conversion for bi-weekly

**File:** src/components/AccountTransferSummary.jsx (line 99)

```diff
       rawPortion = mode === 'paycheck'
-        ? (p.payFrequency === 'weekly' ? (monthlyPortion * 12) / 52 : monthlyPortion / 2)
+        ? (p.payFrequency === 'weekly'
+            ? (monthlyPortion * 12) / 52
+            : p.payFrequency === 'bi-weekly'
+              ? (monthlyPortion * 12) / 26
+              : monthlyPortion / 2)
         : monthlyPortion;
```

---

### Fix 3 - DashboardView.jsx: Use allocation-aware monthly total for Household Savings surplus

**File:** src/components/DashboardView.jsx (lines 679-681 in the earner_splits case)

Replace the static `getPersonMonthlyTotal`-based total with an allocation-aware computation:

```diff
-const totalTargetMonthly = peopleList.reduce((sum, p) => sum + getPersonMonthlyTotal(p.id), 0);
+const totalTargetMonthly = peopleList.reduce((sum, p) => {
+  const hasAllocations = p.accountAllocations &&
+    typeof p.accountAllocations === 'object' &&
+    Object.values(p.accountAllocations).some(v => parseFloat(v) > 0 || v === 'remaining');
+  if (hasAllocations) {
+    const perPaycheck = (budget?.accounts || []).reduce(
+      (s, acc) => s + getPersonDepositAmountForAccount(p, acc.id, budget), 0
+    );
+    if (p.payFrequency === 'semi-monthly') return sum + perPaycheck * 2;
+    if (p.payFrequency === 'bi-weekly') return sum + (perPaycheck * 26) / 12;
+    if (p.payFrequency === 'weekly') return sum + (perPaycheck * 52) / 12;
+    return sum + perPaycheck;
+  }
+  return sum + getPersonMonthlyTotal(p.id);
+}, 0);
```

Note: `getPersonDepositAmountForAccount` is already destructured from `useBudget()` at line 282 of DashboardView.jsx - no additional import is needed.

---

## Files to be Modified

| File | Lines | Change | Bug Fixed |
|------|-------|--------|-----------|
| src/utils/paydayUtils.js | 629-630 | Split semi-monthly / bi-weekly condition | Bug 2 |
| src/components/AccountTransferSummary.jsx | 99 | Add bi-weekly branch to bills-basis per-paycheck | Bug 1 |
| src/components/DashboardView.jsx | 679-681 | Allocation-aware monthly total for savings surplus | Bug 3 |
| src/context/LedgerDataContext.jsx | (none) | Audit only - no change | N/A |

---

## Open Questions

1. What is Jon's configured payFrequency? If it is 'semi-monthly', Bug 2 does NOT apply to Jon directly (only to bi-weekly earners). Confirming this narrows the priority order.

2. When viewing the Transfer Breakdown, which Basis mode is active (Auto Setup / Bill Split Ratios / Direct Deposit)? The divergence is most pronounced in "Bill Split Ratios" mode for bi-weekly earners.

3. Does the household have any earner with payFrequency === 'bi-weekly'? If all earners are semi-monthly, Bugs 1 and 2 have no numeric impact and Bug 3 becomes the primary focus.

---

## Verification Plan

### Manual Steps
1. Set Jon to semi-monthly, confirm "Jon Portion (Semi-Monthly)" in Transfer Breakdown matches the Ledger Matrix credit cell for any semi-monthly deposit day.
2. Set a test earner to bi-weekly, confirm "Per Paycheck Target" in Earner Splits matches actual credit cell amounts in Ledger after Fix 1.
3. Verify "Total Household Available for Savings" matches `sum(monthly net income) - sum(actual monthly deposit outflows)` via the Ledger running balance month-over-month delta.
4. Confirm bills Basis mode in Transfer Breakdown shows correct per-paycheck amounts for bi-weekly earners after Fix 2.

### Build Verification
```powershell
cd e:\TechTrekGT\finance
npm run build
npm run deploy
```
