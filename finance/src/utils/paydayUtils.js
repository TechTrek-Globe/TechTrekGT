/**
 * Utility functions for calculating and resolving paycheck deposit schedules,
 * target paydays, early deposit offsets, and per-account allocations.
 */

/**
 * Parses a payday string or number into a target day of month (1 to daysInMonth).
 * Handles numbers (e.g. 15, "15", "15th", "1st"), keywords ("last", "End of Month", "End").
 * @param {string|number} val
 * @param {number} daysInMonth
 * @returns {number|null}
 */
export function parseDayNumber(val, daysInMonth) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') {
    if (isNaN(val)) return null;
    return Math.min(Math.max(1, Math.floor(val)), daysInMonth);
  }
  const str = String(val).toLowerCase().trim();
  if (str.includes('last') || str.includes('end')) {
    return daysInMonth;
  }
  const match = str.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    return Math.min(Math.max(1, num), daysInMonth);
  }
  return null;
}

/**
 * Calculates target payday Date objects for a person in a given month.
 * @param {object} person
 * @param {number} year - 4-digit year
 * @param {number} month - 0-indexed month (0 = Jan, 11 = Dec)
 * @returns {Date[]} Array of target payday Date objects
 */
export function getPersonTargetPayDaysForMonth(person, year, month) {
  if (!person) return [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const freq = (person.payFrequency || 'bi-weekly').toLowerCase();
  const payDays = [];

  if (freq === 'monthly') {
    const dayNum = parseDayNumber(person.payDay1, daysInMonth) ?? 1;
    payDays.push(new Date(year, month, dayNum));
  } else if (freq === 'semi-monthly' || freq === 'bi-weekly') {
    const d1 = parseDayNumber(person.payDay1, daysInMonth);
    const d2 = parseDayNumber(person.payDay2, daysInMonth);

    if (d1 !== null && d2 !== null) {
      payDays.push(new Date(year, month, d1));
      payDays.push(new Date(year, month, d2));
    } else if (d1 !== null) {
      payDays.push(new Date(year, month, d1));
      const defaultD2 = d1 === 15 ? daysInMonth : Math.min(d1 + 14, daysInMonth);
      payDays.push(new Date(year, month, defaultD2));
    } else {
      payDays.push(new Date(year, month, 15));
      payDays.push(new Date(year, month, daysInMonth));
    }
  } else if (freq === 'weekly') {
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      if (d.getDay() === 5) {
        payDays.push(d);
      }
    }
  } else {
    const dayNum = parseDayNumber(person.payDay1, daysInMonth) ?? 1;
    payDays.push(new Date(year, month, dayNum));
  }

  return payDays;
}

/**
 * Calculates actual deposit Date objects for a person taking into account early pay offset (payOffsetDays).
 * @param {object} person
 * @param {number} year - 4-digit year
 * @param {number} month - 0-indexed month
 * @returns {Date[]} Array of actual deposit Date objects
 */
export function getPersonDepositDatesForMonth(person, year, month) {
  if (!person) return [];
  const offset = parseInt(person.payOffsetDays, 10) || 0;

  const targetDays = [
    ...getPersonTargetPayDaysForMonth(person, year, month - 1),
    ...getPersonTargetPayDaysForMonth(person, year, month),
    ...getPersonTargetPayDaysForMonth(person, year, month + 1)
  ];

  const depositDates = targetDays.map(tDate => {
    const depDate = new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate());
    depDate.setDate(depDate.getDate() + offset);
    return depDate;
  });

  return depositDates.filter(d => d.getFullYear() === year && d.getMonth() === month);
}

/**
 * Checks if a specific day in a month is an actual deposit day for a person.
 * @param {object} person
 * @param {number} year
 * @param {number} month - 0-indexed month
 * @param {number} day - 1-based day of month
 * @returns {boolean}
 */
export function isPersonDepositDay(person, year, month, day) {
  if (!person) return false;
  const depositDates = getPersonDepositDatesForMonth(person, year, month);
  return depositDates.some(d => d.getDate() === day);
}

export const FREQUENCY_ANNUAL_PERIODS = {
  weekly: 52,
  'bi-weekly': 26,
  biweekly: 26,
  'semi-monthly': 24,
  semimonthly: 24,
  monthly: 12,
  annual: 1,
  annually: 1
};

/**
 * Converts any amount and frequency into an annualized total.
 * @param {number|string} amount
 * @param {string} frequency - weekly | bi-weekly | semi-monthly | monthly | annual
 * @returns {number}
 */
export function getAnnualAmount(amount, frequency) {
  const norm = String(frequency || 'monthly').toLowerCase().replace(/_/g, '-');
  const periods = FREQUENCY_ANNUAL_PERIODS[norm] ?? 12;
  return (parseFloat(amount) || 0) * periods;
}

/**
 * Normalizes any goal or recurring amount to a standard monthly figure.
 * @param {number|string} amount
 * @param {string} frequency
 * @returns {number}
 */
export function getMonthlyAmount(amount, frequency) {
  return getAnnualAmount(amount, frequency) / 12;
}

/**
 * Converts a goal amount to match the exact paycheck frequency of a contributor.
 * @param {number|string} goalAmount
 * @param {string} goalFrequency
 * @param {string} contributorPayFrequency
 * @returns {number}
 */
export function getAmountPerPaycheck(goalAmount, goalFrequency, contributorPayFrequency) {
  const annual = getAnnualAmount(goalAmount, goalFrequency);
  const normPayFreq = String(contributorPayFrequency || 'semi-monthly').toLowerCase().replace(/_/g, '-');
  let payPeriods = FREQUENCY_ANNUAL_PERIODS[normPayFreq] ?? 24;
  if (normPayFreq === 'bi-weekly' || normPayFreq === 'biweekly') {
    payPeriods = 24;
  }
  return Math.round((annual / payPeriods) * 100) / 100;
}

// Baseline monthly display periods - bi-weekly treated as 2 paychecks/mo for budgeting
export const MONTHLY_DISPLAY_PERIODS = {
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
export function goalMonthlyDisplay(goal, contributorPayFrequency) {
  const freq = String(contributorPayFrequency || 'semi-monthly').toLowerCase();
  const multiplier = MONTHLY_DISPLAY_PERIODS[freq] ?? 2;
  return Math.round((goalPerPay(goal) * multiplier) * 100) / 100;
}

/**
 * Calculates total expected contributions (monthly, annual, per-paycheck) across all accounts and goals for a contributor.
 * @param {string} contributorId
 * @param {Array} fundingGoals
 * @param {object} budget
 * @returns {object}
 */
export function calculateDashboardTotalsForContributor(contributorId, fundingGoals = [], budget = null) {
  const people = budget?.people || [];
  const contributor = people.find(p => p.id === contributorId);
  const payFreq = String(contributor?.payFrequency || 'semi-monthly').toLowerCase();
  const personGoals = (fundingGoals || []).filter(g => g.contributorId === contributorId);

  const perPaycheckTotal = personGoals.reduce((sum, g) => sum + goalPerPay(g), 0);
  const monthlyTotal = personGoals.reduce((sum, g) => sum + goalMonthlyDisplay(g, payFreq), 0);
  
  const periods = FREQUENCY_ANNUAL_PERIODS[payFreq.replace(/_/g, '-')] ?? 24;
  const annualTotal = perPaycheckTotal * periods;

  return {
    contributorId,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    annualTotal: Math.round(annualTotal * 100) / 100,
    perPaycheckTotal: Math.round(perPaycheckTotal * 100) / 100,
    goals: personGoals
  };
}

/**
 * Generates the specific transaction breakdown per account on deposit days.
 * @param {object} contributor
 * @param {Date|string} depositDate
 * @param {Array} fundingGoals
 * @param {object} budget
 * @returns {object}
 */
export function generatePaycheckTransactions(contributor, depositDate, fundingGoals = [], budget = null) {
  if (!contributor) return {};
  const personGoals = (fundingGoals || []).filter(g => g.contributorId === contributor.id);
  const accounts = budget?.accounts || [];

  const accountBreakdown = {};
  accounts.forEach(acc => {
    const accGoals = personGoals.filter(g => g.accountId === acc.id);
    const totalDeposit = getPersonDepositAmountForAccount(contributor, acc.id, budget);
    const billPortionPerPay = getPersonBillPerPaycheckPortionForAccount(contributor, acc.id, budget);
    const surplus = Math.max(0, totalDeposit - billPortionPerPay);

    accountBreakdown[acc.id] = {
      accountId: acc.id,
      accountName: acc.name,
      totalDeposit: Math.round(totalDeposit * 100) / 100,
      billPortion: Math.round(billPortionPerPay * 100) / 100,
      extraSavingsSurplus: Math.round(surplus * 100) / 100,
      goals: accGoals
    };
  });

  return accountBreakdown;
}

/**
 * Resolves the deposit amount for a person for a specific account selection.
 * Supports explicit fundingGoals, explicit accountAllocations, unallocated paycheck remainders, and dynamic bill/savings split fallbacks.
 * @param {object} person
 * @param {string} selectedAccountId - 'all' or specific account ID
 * @param {object} [budget] - optional budget context containing accounts, bills, and fundingGoals
 * @returns {number}
 */
export function getPersonDepositAmountForAccount(person, selectedAccountId = 'all', budget = null) {
  if (!person) return 0;
  if (!selectedAccountId || selectedAccountId === 'all') {
    return parseFloat(person.netPerPay) || 0;
  }
  
  const targetAcc = (budget?.accounts || []).find(a => a.id === selectedAccountId);
  const targetAccName = (targetAcc?.name || '').toLowerCase();

  // 1. Explicit Funding Goals (New standard)
  const goals = (budget?.fundingGoals || []).filter(g => {
    if (g.contributorId !== person.id) return false;
    if (g.accountId === selectedAccountId) return true;
    if (targetAcc && g.accountId) {
      const goalAcc = (budget?.accounts || []).find(a => a.id === g.accountId);
      if (goalAcc && goalAcc.name && goalAcc.name.toLowerCase() === targetAccName) return true;
      if ((g.accountId === 'acc-mortgage-checking' || g.accountId.includes('mortgage')) && targetAccName.includes('mortgage')) return true;
      if ((g.accountId === 'acc-hoa-savings' || g.accountId.includes('hoa')) && targetAccName.includes('hoa')) return true;
      if ((g.accountId === 'acc-bills-checking' || g.accountId.includes('bills')) && targetAccName.includes('bills')) return true;
    }
    return false;
  });
  if (goals.length > 0) {
    return Math.round(goals.reduce((sum, g) => sum + goalPerPay(g), 0) * 100) / 100;
  }

  // 2. Legacy Account Allocations
  if (person.accountAllocations) {
    if (person.accountAllocations[selectedAccountId] !== undefined && person.accountAllocations[selectedAccountId] !== 'remaining') {
      return parseFloat(person.accountAllocations[selectedAccountId]);
    }
    for (const [accKey, val] of Object.entries(person.accountAllocations)) {
      if (val === 'remaining') continue;
      if ((accKey.includes('mortgage') || accKey === 'acc-mortgage-checking') && targetAccName.includes('mortgage')) return parseFloat(val);
      if ((accKey.includes('hoa') || accKey === 'acc-hoa-savings') && targetAccName.includes('hoa')) return parseFloat(val);
      if ((accKey.includes('bills') || accKey === 'acc-bills-checking') && targetAccName.includes('bills')) return parseFloat(val);
    }
  }

  // 3. Fallback to Dynamic Bill Splitting
  return getPersonBillPerPaycheckPortionForAccount(person, selectedAccountId, budget);
}

/**
 * Calculates the monthly bill obligation for a given person and account based on active bill splits.
 *
 * @param {object} person
 * @param {string} accountId
 * @param {object} budget
 * @returns {number}
 */
export function getPersonBillMonthlyPortionForAccount(person, accountId, budget) {
  if (!person || !accountId || !budget) return 0;
  const accountBills = (budget.bills || []).filter(b => !b.isArchived && b.accountId === accountId);
  return accountBills.reduce((sum, b) => {
    const amt = Math.abs(parseFloat(b.amount) || 0);
    const period = b.period || 'Monthly';
    let monthlyCost = amt;
    if (period === 'Semi-Annual') monthlyCost = amt / 6;
    else if (period === 'Annual') monthlyCost = amt / 12;
    else if (period === 'Quarterly') monthlyCost = amt / 3;
    else if (period === 'Weekly') monthlyCost = (amt * 52) / 12;
    else if (period === 'Custom' || period === 'Specific Months') {
      const count = Array.isArray(b.dueMonths) && b.dueMonths.length > 0 ? b.dueMonths.length : 12;
      monthlyCost = (amt * count) / 12;
    }
    const pct = parseFloat(b.splits?.[person.id]) || 0;
    return sum + (monthlyCost * pct) / 100;
  }, 0);
}

/**
 * Calculates the per-paycheck bill obligation for a given person and account based on pay frequency.
 *
 * @param {object} person
 * @param {string} accountId
 * @param {object} budget
 * @returns {number}
 */
export function getPersonBillPerPaycheckPortionForAccount(person, accountId, budget) {
  if (!person || !accountId || !budget) return 0;
  const monthlyBills = getPersonBillMonthlyPortionForAccount(person, accountId, budget);
  if (monthlyBills <= 0) return 0;

  const freq = (person.payFrequency || 'bi-weekly').toLowerCase();
  if (freq === 'semi-monthly') {
    return Math.round((monthlyBills / 2) * 100) / 100;
  } else if (freq === 'bi-weekly' || freq === 'biweekly') {
    // Treat bi-weekly as exactly 2 paychecks per month for baseline budgeting
    return Math.round((monthlyBills / 2) * 100) / 100;
  } else if (freq === 'weekly') {
    return Math.round(((monthlyBills * 12) / 52) * 100) / 100;
  }
  return Math.round(monthlyBills * 100) / 100;
}

/**
 * Calculates the monthly extra savings portion for a given person and account based on split percentages,
 * income ratio, or automatic buffer from goal allocations exceeding projected bills.
 *
 * @param {object} account
 * @param {object} person
 * @param {object} budget
 * @returns {number}
 */
export function getAccountSaveExtraPersonPortion(account, person, budget) {
  if (!account || !person) return 0;
  const deposit = getPersonDepositAmountForAccount(person, account.id, budget);
  const bills   = getPersonBillPerPaycheckPortionForAccount(person, account.id, budget);
  const surplusPerPay = Math.max(0, deposit - bills);
  const freq = String(person.payFrequency || 'semi-monthly').toLowerCase();
  const multiplier = MONTHLY_DISPLAY_PERIODS[freq] ?? 2;
  return Math.round((surplusPerPay * multiplier) * 100) / 100;
}

/**
 * Calculates the per-paycheck extra savings deposit amount for a given person and account.
 * Savings overflow = deposit minus bills, strictly 2dp safe.
 * On a 3-paycheck bi-weekly month, the entire 3rd paycheck deposit routes to extra savings.
 *
 * @param {object} person
 * @param {string} selectedAccountId - 'all' or specific account ID
 * @param {object} budget
 * @returns {number}
 */
export function getPersonExtraSavingsDepositAmountForAccount(person, selectedAccountId = 'all', budget = null) {
  if (!person || !budget) return 0;

  if (!selectedAccountId || selectedAccountId === 'all') {
    const accounts = budget.accounts || [];
    return accounts.reduce((sum, acc) => {
      return sum + getPersonExtraSavingsDepositAmountForAccount(person, acc.id, budget);
    }, 0);
  }

  const targetAcc = (budget.accounts || []).find(a => a.id === selectedAccountId);
  if (!targetAcc) return 0;

  const deposit = getPersonDepositAmountForAccount(person, selectedAccountId, budget);
  const bills   = getPersonBillPerPaycheckPortionForAccount(person, selectedAccountId, budget);
  return Math.max(0, Math.round((deposit - bills) * 100) / 100);
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const MONTH_SHORT_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Returns an array of 1-based month indices (1..12) when a bill is due.
 * @param {object} bill
 * @returns {number[]}
 */
export function getBillDueMonths(bill) {
  if (!bill) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  const period = bill.period || 'Monthly';
  if (period === 'Monthly') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  let rawMonths = [];
  if (Array.isArray(bill.dueMonths) && bill.dueMonths.length > 0) {
    rawMonths = bill.dueMonths.map(Number).filter(m => m >= 1 && m <= 12).sort((a, b) => a - b);
  } else if (bill.dueMonth) {
    const m = parseInt(bill.dueMonth, 10);
    if (!isNaN(m) && m >= 1 && m <= 12) rawMonths = [m];
  }

  if (period === 'Annual') {
    return rawMonths.length > 0 ? [rawMonths[0]] : [1];
  }

  if (period === 'Semi-Annual') {
    if (rawMonths.length === 2) return rawMonths;
    if (rawMonths.length > 0 && rawMonths.length < 2) {
      const secondMonth = ((rawMonths[0] + 5) % 12) + 1;
      return [rawMonths[0], secondMonth].sort((a, b) => a - b);
    }
    return [1, 7];
  }

  if (period === 'Quarterly') {
    if (rawMonths.length === 4) return rawMonths;
    if (rawMonths.length > 0 && rawMonths.length < 4) {
      const m1 = rawMonths[0];
      return [m1, ((m1 + 2) % 12) + 1, ((m1 + 5) % 12) + 1, ((m1 + 8) % 12) + 1].sort((a, b) => a - b);
    }
    return [1, 4, 7, 10];
  }

  if (period === 'Custom' || period === 'Specific Months') {
    return rawMonths.length > 0 ? rawMonths : [1];
  }
  
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

/**
 * Checks if a bill is due in a given month (1-based 1..12 or 0-based 0..11 if isZeroBased=true).
 * @param {object} bill
 * @param {number} monthNum - Month index
 * @param {boolean} [isZeroBased=false]
 * @returns {boolean}
 */
export function isBillDueInMonth(bill, monthNum, isZeroBased = false) {
  const m1Based = isZeroBased ? monthNum + 1 : monthNum;
  const period = bill?.period || 'Monthly';
  if (period === 'Monthly') return true;
  const dueMonths = getBillDueMonths(bill);
  return dueMonths.includes(m1Based);
}

/**
 * Computes the exact next upcoming due Date for a bill relative to refDate.
 * @param {object} bill
 * @param {Date} [refDate=new Date()]
 * @returns {Date}
 */
export function getNextBillDueDate(bill, refDate = new Date()) {
  const dueDay = parseInt(bill?.dueDay, 10) || 1;
  const dueMonths = getBillDueMonths(bill); // 1..12
  
  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth(); // 0..11

  // Search forward up to 2 years
  for (let y = refYear; y <= refYear + 2; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === refYear && (m - 1) < refMonth) continue;
      
      if (dueMonths.includes(m)) {
        const daysInCandidateMonth = new Date(y, m, 0).getDate();
        const actualDay = Math.min(dueDay, daysInCandidateMonth);
        const candidate = new Date(y, m - 1, actualDay);
        
        // Compare dates normalized to 00:00:00 vs 23:59:59
        const candCopy = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), 23, 59, 59);
        const refCopy = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 0, 0, 0);
        
        if (candCopy >= refCopy) {
          return candidate;
        }
      }
    }
  }

  return new Date(refYear, refMonth, dueDay);
}

/**
 * Formats due month(s) description for display (e.g. "Nov", "Jan, Jul", "Jan, Apr, Jul, Oct").
 * @param {object} bill
 * @returns {string}
 */
export function formatBillDueMonths(bill) {
  const period = bill?.period || 'Monthly';
  if (period === 'Monthly') return 'Every Month';
  const dueMonths = getBillDueMonths(bill);
  if (dueMonths.length === 12) return 'Every Month';
  if (dueMonths.length === 0) return 'None';
  return dueMonths.map(m => MONTH_SHORT_NAMES[m - 1]).join(', ');
}

