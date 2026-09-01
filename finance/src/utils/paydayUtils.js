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

/**
 * Resolves the deposit amount for a person for a specific account selection.
 * Supports explicit accountAllocations, unallocated paycheck remainders, and dynamic bill/savings split fallbacks.
 * @param {object} person
 * @param {string} selectedAccountId - 'all' or specific account ID
 * @param {object} [budget] - optional budget context containing accounts and bills
 * @returns {number}
 */
export function getPersonDepositAmountForAccount(person, selectedAccountId = 'all', budget = null) {
  if (!person) return 0;
  const netPay = parseFloat(person.netPerPay) || 0;
  if (!selectedAccountId || selectedAccountId === 'all') {
    return netPay;
  }

  // Helper to calculate this person's obligation for the account based on bills & extra savings
  const getCalculatedPortionForAccount = () => {
    if (!budget) return 0;
    const accountBills = (budget.bills || []).filter(b => !b.isArchived && b.accountId === selectedAccountId);
    const monthlyBillPortion = accountBills.reduce((sum, b) => {
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

    const targetAcc = (budget.accounts || []).find(a => a.id === selectedAccountId);
    const extraPortion = targetAcc ? getAccountSaveExtraPersonPortion(targetAcc, person, budget) : 0;
    const totalMonthly = monthlyBillPortion + extraPortion;

    if (totalMonthly > 0) {
      if (person.payFrequency === 'semi-monthly') {
        return Math.round((totalMonthly / 2) * 100) / 100;
      } else if (person.payFrequency === 'bi-weekly') {
        return Math.round(((totalMonthly * 12) / 26) * 100) / 100;
      } else if (person.payFrequency === 'weekly') {
        return Math.round(((totalMonthly * 12) / 52) * 100) / 100;
      }
      return Math.round(totalMonthly * 100) / 100;
    }
    return 0;
  };

  const allocations = person.accountAllocations;
  if (allocations && typeof allocations === 'object' && Object.keys(allocations).length > 0) {
    const targetVal = allocations[selectedAccountId];
    if (targetVal === 'remaining') {
      let fixedSum = 0;
      let remainingAccountsCount = 0;
      Object.entries(allocations).forEach(([accId, val]) => {
        if (val === 'remaining') {
          remainingAccountsCount++;
        } else {
          const amt = parseFloat(val);
          if (!isNaN(amt) && amt > 0) fixedSum += amt;
        }
      });
      const remainingTotal = Math.max(0, netPay - fixedSum);
      return remainingAccountsCount > 0 ? remainingTotal / remainingAccountsCount : remainingTotal;
    }

    const allocatedNum = parseFloat(targetVal);
    if (!isNaN(allocatedNum) && allocatedNum > 0) {
      return allocatedNum;
    }

    // If targetVal is undefined or 0 for this account, check if there's an unallocated remainder
    const hasExplicitRemaining = Object.values(allocations).some(v => v === 'remaining');
    if (!hasExplicitRemaining) {
      let fixedSum = 0;
      Object.entries(allocations).forEach(([accId, val]) => {
        const amt = parseFloat(val);
        if (!isNaN(amt) && amt > 0) fixedSum += amt;
      });
      const unallocatedRemainder = Math.max(0, netPay - fixedSum);

      if (unallocatedRemainder > 0) {
        const calculatedPortion = getCalculatedPortionForAccount();
        if (calculatedPortion > 0) {
          return Math.min(calculatedPortion, unallocatedRemainder);
        }

        const accounts = budget?.accounts || [];
        const isPrimaryChecking = accounts.length > 0 && (
          accounts[0]?.id === selectedAccountId ||
          accounts.find(a => a.type === 'checking')?.id === selectedAccountId
        );
        const targetAcc = accounts.find(a => a.id === selectedAccountId);
        const isEnabledOnAcc = targetAcc?.enabledEarners
          ? targetAcc.enabledEarners.includes(person.id)
          : true;

        if (isPrimaryChecking || isEnabledOnAcc) {
          return Math.round(unallocatedRemainder * 100) / 100;
        }
      }
    }

    // Fall back to bill/savings split calculation if available
    const calculatedPortion = getCalculatedPortionForAccount();
    if (calculatedPortion > 0) {
      return calculatedPortion;
    }

    return 0;
  }

  // If no explicit accountAllocations exist, check bill/savings splits
  const calculatedPortion = getCalculatedPortionForAccount();
  if (calculatedPortion > 0) {
    return calculatedPortion;
  }

  // If no explicit accountAllocations exist and no bills split, primary earners deposit full netPay into the primary checking account; other accounts get 0 unless allocated.
  if (person.role === 'Primary' || person.isPrimary) {
    return netPay;
  }

  return 0;
}

/**
 * Calculates the monthly extra savings portion for a given person and account based on split percentages or income ratio.
 *
 * @param {object} account
 * @param {object} person
 * @param {object} budget
 * @returns {number}
 */
export function getAccountSaveExtraPersonPortion(account, person, budget) {
  if (!account || !person) return 0;
  if (account.enableExtraSavings === false || account.enableExtraSavings === 0 || account.enableExtraSavings === 'false') return 0;
  const totalExtra = parseFloat(account.saveExtraMonthly) || 0;
  if (totalExtra <= 0) return 0;

  // If the account has an explicit list of enabled split earners, check if this person is included
  if (account.enabledEarners && Array.isArray(account.enabledEarners) && account.enabledEarners.length > 0) {
    if (!account.enabledEarners.includes(person.id)) {
      return 0;
    }
  }

  const splits = account.saveExtraSplits;
  const splitType = account.saveExtraSplitType || 'percentage';

  if (splits && typeof splits === 'object' && splits[person.id] !== undefined && splits[person.id] !== null && splits[person.id] !== '') {
    const val = parseFloat(splits[person.id]) || 0;
    if (splitType === 'amount') {
      return val;
    } else {
      return (totalExtra * val) / 100;
    }
  }

  const rawEnabledList = (account.enabledEarners && Array.isArray(account.enabledEarners) && account.enabledEarners.length > 0)
    ? account.enabledEarners
    : (budget?.people || []).map(p => p.id);

  const people = budget?.people || [];
  const enabledPeople = people.filter(p => rawEnabledList.includes(p.id));
  const nonCreditEarners = enabledPeople.filter(p => p.name.toLowerCase() !== 'credit' && p.role !== 'Credit' && p.role !== 'Reimbursement');
  const targetEarners = nonCreditEarners.length > 0 ? nonCreditEarners : enabledPeople;

  if (!targetEarners.some(p => p.id === person.id)) {
    return 0;
  }

  return totalExtra / Math.max(1, targetEarners.length);
}

/**
 * Calculates the per-paycheck extra savings deposit amount for a given person and account.
 * Converts the monthly extra savings portion into per-paycheck frequency (semi-monthly, bi-weekly, weekly).
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
      if (acc.enableExtraSavings === false || acc.enableExtraSavings === 0 || acc.enableExtraSavings === 'false') return sum;
      const monthlyExtra = getAccountSaveExtraPersonPortion(acc, person, budget);
      if (monthlyExtra <= 0) return sum;
      let perPay = monthlyExtra;
      const freq = (person.payFrequency || 'bi-weekly').toLowerCase();
      if (freq === 'semi-monthly') {
        perPay = monthlyExtra / 2;
      } else if (freq === 'bi-weekly') {
        perPay = (monthlyExtra * 12) / 26;
      } else if (freq === 'weekly') {
        perPay = (monthlyExtra * 12) / 52;
      }
      return sum + perPay;
    }, 0);
  }

  const targetAcc = (budget.accounts || []).find(a => a.id === selectedAccountId);
  if (!targetAcc || targetAcc.enableExtraSavings === false || targetAcc.enableExtraSavings === 0 || targetAcc.enableExtraSavings === 'false') return 0;

  const monthlyExtra = getAccountSaveExtraPersonPortion(targetAcc, person, budget);
  if (monthlyExtra <= 0) return 0;

  let perPay = monthlyExtra;
  const freq = (person.payFrequency || 'bi-weekly').toLowerCase();
  if (freq === 'semi-monthly') {
    perPay = monthlyExtra / 2;
  } else if (freq === 'bi-weekly') {
    perPay = (monthlyExtra * 12) / 26;
  } else if (freq === 'weekly') {
    perPay = (monthlyExtra * 12) / 52;
  }

  return Math.round(perPay * 100) / 100;
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

