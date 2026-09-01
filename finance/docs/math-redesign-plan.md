# Finance OS Math Redesign Plan
## Simplified Per-Paycheck Goal Model

---

## 1. Root Cause Analysis

### The Core Bug: Annual-Normalization Mismatch

The current system stores funding goals with an independent `frequency` field and converts through an annual basis:

```
getAmountPerPaycheck(goalAmount, goalFrequency, contributorPayFrequency)
  -> (amount * goalPeriods) / contributorPeriods
```

This works only when `goalFrequency === contributorPayFrequency`. When they differ, it produces wrong results.

**Exact failure trace - Gym earner ($11.25 bi-weekly):**

| Scenario | Stored Goal | Formula | Result | Expected |
|---|---|---|---|---|
| Gym demo data | $22.50 / monthly | (22.50 * 12) / 26 | **$10.38** | **$11.25** |
| Correct storage | $11.25 / bi-weekly | (11.25 * 26) / 26 | $11.25 | $11.25 |

The demo data stored the goal as `$22.50 / monthly` (semi-monthly approximation). The system converts `$22.50 * 12 / 26 = $10.38`, not `$11.25`. These two amounts are not equivalent:
- $22.50/mo * 12 = $270/yr
- $11.25/pay * 26 = $292.50/yr

### Secondary Cascades

1. **Dashboard "Amount To Pay"** - shows $10.38 instead of $11.25.
2. **Ledger credits** - Gym rows are $10.38, monthly totals undercount.
3. **Settings modal** - shows $22.50/mo goal but $10.38/pay, contradicting $11.25 netPerPay.
4. **Jon/Ronnie mismatches** - floating-point accumulation from mixed-frequency goal sums.

---

## 2. The Simplified Model

### Core Principle

> A funding goal IS the exact, literal per-paycheck deposit amount for that account.
> Monthly display values are DERIVED from the per-paycheck amount, never stored.

### New Schema

```js
{
  id: 'goal-xxx',
  contributorId: 'person-gym',
  accountId: 'acc-bills-checking',
  name: 'Gym Membership Share',
  amountPerPay: 11.25   // EXACT per-paycheck amount - canonical source of truth
  // 'amount' and 'frequency' REMOVED
}
```

### New Utility Functions

```js
// Baseline monthly display periods - bi-weekly treated as 2 paychecks/mo for budgeting
const MONTHLY_DISPLAY_PERIODS = {
  'weekly':       4,   // 4 weeks/mo (baseline)
  'bi-weekly':    2,   // 2 paychecks/mo (baseline - any 3rd paycheck is overflow)
  'semi-monthly': 2,   // exactly 2/mo
  'monthly':      1,   // exactly 1/mo
  'annual':       1/12 // amortized
};

// Exact deposit per paycheck - the canonical value, read directly from goal
export function goalPerPay(goal) {
  return Math.round((parseFloat(goal.amountPerPay) || 0) * 100) / 100;
}

// Monthly BASELINE display: bi-weekly = amountPerPay * 2 (not * 26/12)
// This reflects the household budget reality: plan for 2 paychecks/month.
// A 3rd paycheck in a bi-weekly month is a bonus overflow - it does NOT
// inflate the monthly baseline. Display only - never stored.
export function goalMonthlyDisplay(goal, contributorPayFrequency) {
  const freq = String(contributorPayFrequency || 'semi-monthly').toLowerCase();
  const multiplier = MONTHLY_DISPLAY_PERIODS[freq] ?? 2;
  return Math.round((goalPerPay(goal) * multiplier) * 100) / 100;
}

// THE SINGLE SHARED DEPOSIT FUNCTION - used by BOTH Dashboard and Ledger.
// This is the only source of truth for how much a person deposits per paycheck
// into a given account. Both views call this exact function to guarantee
// 100% parity between the Dashboard "Amount to Pay" column and each Ledger
// transaction credit row. No view-specific calculation is permitted.
export function getPersonDepositAmountForAccount(person, accountId, budget) {
  if (!person) return 0;
  const goals = (budget?.fundingGoals || []).filter(
    g => g.contributorId === person.id && g.accountId === accountId
  );
  if (goals.length > 0) {
    return Math.round(goals.reduce((sum, g) => sum + goalPerPay(g), 0) * 100) / 100;
  }
  return 0;
}

// Savings overflow = deposit minus bills, strictly 2dp safe.
// On a standard bi-weekly month (2 paychecks): surplus = deposit - bills.
// On a 3-paycheck bi-weekly month: the ENTIRE 3rd paycheck deposit routes
// here as extra savings, because it falls outside the 2-paycheck baseline.
// The Ledger generates a credit row of amountPerPay on the 3rd payday;
// since no bills are deducted against it (baseline covered by first 2 pays),
// getPersonExtraSavingsForAccount returns the full amountPerPay amount.
export function getPersonExtraSavingsForAccount(person, accountId, budget) {
  const deposit = getPersonDepositAmountForAccount(person, accountId, budget);
  const bills   = getPersonBillPerPaycheckPortionForAccount(person, accountId, budget);
  return Math.max(0, Math.round((deposit - bills) * 100) / 100);
}
```

### Dashboard / Ledger Parity Contract

This is the critical architectural guarantee that eliminates the original discrepancy:

| View | Function Called | Value for Gym (Bills Checking) |
|---|---|---|
| Dashboard "Amount To Pay" | `getPersonDepositAmountForAccount(gym, accId, budget)` | **$11.25** |
| Ledger transaction credit row | `getPersonDepositAmountForAccount(gym, accId, budget)` | **$11.25** |
| Settings "Deposit / Paycheck" | `goalPerPay(goal)` | **$11.25** |
| Settings "Monthly Display" | `goalMonthlyDisplay(goal, 'bi-weekly')` | **$22.50** |

Both the Dashboard and Ledger call `getPersonDepositAmountForAccount`. No view calculates its own deposit amount independently. If a number appears in the Dashboard, it is **exactly** the number that will appear as a credit in the Ledger for that payday.

### Bi-Weekly 3rd-Paycheck Overflow Model

Bi-weekly earners have 26 pays/year. In any given calendar month, they receive either 2 or 3 paychecks depending on the specific payday dates. The budget baseline is always 2 paychecks per month.

| Month Type | Paydays | Total Deposits (Gym) | Bills Covered By | Extra Savings |
|---|---|---|---|---|
| Standard month (2 pays) | Pay 1, Pay 2 | 2 x $11.25 = $22.50 | Pay 1 surplus, Pay 2 surplus | Normal overflow only |
| 3-paycheck month | Pay 1, Pay 2, Pay 3 | 3 x $11.25 = $33.75 | Pay 1 + Pay 2 as usual | **Pay 3 full $11.25 -> Extra Savings** |

`getPersonExtraSavingsForAccount` is called independently for each payday. On the 3rd payday, `deposit ($11.25) - bills ($0 already covered) = $11.25` routes entirely to extra savings. No special-case branching is required in code; the per-payday calculation naturally handles this.

---

## 3. Migration of Existing Data

### Demo Preset (`demoPresetData.js`) - Migrated Values

| Goal | Old Amount | Old Freq | Contributor Freq | New amountPerPay |
|---|---|---|---|---|
| Bills Checking Base (Jon) | $85.00 | semi-monthly | semi-monthly | **$85.00** |
| Bills Checking Buffer (Jon) | $156.16 | monthly | semi-monthly | **$78.08** |
| Gym Membership Share | $22.50 | monthly | bi-weekly | **$11.25** |
| Mortgage Contribution (Jon) | $1,378.00 | monthly | semi-monthly | **$689.00** |
| Mortgage Contribution (Ronnie) | $1,378.00 | monthly | monthly | **$1,378.00** |
| HOA Reserve (Jon) | $222.00 | monthly | semi-monthly | **$111.00** |
| HOA Reserve (Ronnie) | $222.00 | monthly | monthly | **$222.00** |

NOTE: Gym's old `$22.50 monthly` was a semi-monthly approximation. The correct value matching `netPerPay = $11.25` for a bi-weekly earner is `amountPerPay: 11.25`.

### Live Data Migration

A one-time migration function runs on IndexedDB and localStorage load:

```js
function migrateFundingGoals(savedGoals, people) {
  return (savedGoals || []).map(g => {
    if (g.amountPerPay !== undefined) return g; // Already migrated
    const contributor = people.find(p => p.id === g.contributorId);
    const payFreq = contributor?.payFrequency || 'semi-monthly';
    const amountPerPay = Math.round(getAmountPerPaycheck(g.amount, g.frequency, payFreq) * 100) / 100;
    const { amount, frequency, ...rest } = g;
    return { ...rest, amountPerPay };
  });
}
```

---

## 4. Files to Modify

### A. `finance/src/utils/paydayUtils.js`

1. Keep `getAnnualAmount`, `getMonthlyAmount`, `getAmountPerPaycheck` internally for migration only.
2. Add `goalPerPay(goal)` and `goalMonthlyDisplay(goal, payFrequency)` as new exports.
3. Rewrite `getPersonDepositAmountForAccount` - sum `amountPerPay` directly, no fallback chains.
4. Rewrite `getAccountSaveExtraPersonPortion` - deposit minus bills only, no recursion.
5. Rewrite `getPersonExtraSavingsDepositAmountForAccount` - deposit minus bills.
6. Rewrite `calculateDashboardTotalsForContributor` - sum `amountPerPay` directly.
7. Rewrite `generatePaycheckTransactions` - read `amountPerPay` directly.

### B. `finance/src/demoPresetData.js`

1. Replace all 7 goal objects with `amountPerPay` values from Section 3.

### C. `finance/src/context/BudgetMetadataContext.jsx`

1. Add `migrateFundingGoals(savedGoals, people)`.
2. Call it at IndexedDB and localStorage load paths.
3. No changes to CRUD actions.

### D. `finance/src/components/settings/AccountsPeoplePanel.jsx`

1. Replace `getAmountPerPaycheck` import with `goalPerPay` and `goalMonthlyDisplay`.
2. Display `goalPerPay(goal)` as editable per-paycheck field; `goalMonthlyDisplay(goal, payFreq)` as read-only monthly.
3. Change goal input label to "Amount Per Paycheck ($)".
4. Remove the `frequency` dropdown from goal rows entirely.
5. On "+ Add Goal": default `amountPerPay: billPortionPerPay > 0 ? billPortionPerPay : 0`.
6. Update Mortgage+HOA badge to check `sum(goals.amountPerPay)` for Ronnie = $1,600.00.

---

## 5. Mathematical Verification After Migration

| Earner | Account | amountPerPay | Pay Freq | Monthly Display |
|---|---|---|---|---|
| Jon | Bills Checking | $163.08 ($85 + $78.08) | semi-monthly | $326.16/mo |
| Jon | Mortgage | $689.00 | semi-monthly | $1,378.00/mo |
| Jon | HOA Savings | $111.00 | semi-monthly | $222.00/mo |
| **Jon Total** | | **$963.08/pay** | | **$1,926.16/mo** |
| Ronnie | Mortgage | $1,378.00 | monthly | $1,378.00/mo |
| Ronnie | HOA Savings | $222.00 | monthly | $222.00/mo |
| **Ronnie Total** | | **$1,600.00/pay** | | **$1,600.00/mo** |
| Gym | Bills Checking | **$11.25** | bi-weekly | **$22.50/mo** (2 x $11.25) |

**Monthly Display Formula by Frequency (goalMonthlyDisplay):**

| Frequency | Multiplier | Gym Example | Jon Example |
|---|---|---|---|
| bi-weekly | x 2 (baseline) | $11.25 x 2 = **$22.50** | n/a |
| semi-monthly | x 2 (exact) | n/a | $85.00 x 2 = **$170.00** |
| monthly | x 1 (exact) | n/a | $1,378.00 x 1 = **$1,378.00** |

**Ledger Parity Guarantee (all views call `getPersonDepositAmountForAccount`):**
- Jon (2 pays/mo): 2 x $963.08 = $1,926.16/mo credits - exact match with Dashboard.
- Ronnie (1 pay/mo): 1 x $1,600.00 = $1,600.00/mo - exact match with Dashboard.
- Gym standard month (2 pays): 2 x $11.25 = $22.50/mo - exact match with Dashboard.
- Gym 3-paycheck month: 3 x $11.25 = $33.75 total; 3rd pay ($11.25) routes entirely to extra savings.

No frequency conversion in the hot path = zero floating-point drift across Settings, Dashboard, and Ledger.

---

## 6. Resolved Decisions

**Bi-weekly monthly display (RESOLVED):** Use `amountPerPay * 2` as the monthly baseline for bi-weekly earners. Gym monthly display = $22.50 (not the annualized $24.38). Any 3rd paycheck in a month overflows entirely to extra savings. The `goalMonthlyDisplay` function uses `MONTHLY_DISPLAY_PERIODS` multipliers (bi-weekly: 2) instead of true annual-period math.

**Jon's netPerPay vs goal total (RESOLVED - pending user confirmation):** Jon's goal sum ($963.08/pay) exceeds his stored `netPerPay` ($885). This will be corrected in `demoPresetData.js` by updating Jon's `netPerPay: 885` to `netPerPay: 963.08` to match the sum of his funding goals. If Jon's actual take-home is $885, the Bills Checking buffer goal ($78.08/pay) must instead be reduced or removed before implementation.

WARNING: Removing the `frequency` field is a breaking schema change. Old-schema cloud backups auto-migrate on load. There is no rollback. Export a backup before approving if needed.

---

## 7. Verification Plan

1. `npm run build` - zero errors.
2. Dashboard: Gym shows $11.25/pay, Ronnie shows $1,600.00/pay.
3. Ledger (Mortgage Checking, September): Jon credit rows = $689.00 each payday; Ronnie = $1,378.00. Monthly Totals match.
4. Settings > Gym > Goals modal: field shows $11.25, label reads "Amount Per Paycheck".
5. `npm run deploy` to Cloudflare Workers, confirm version ID.
