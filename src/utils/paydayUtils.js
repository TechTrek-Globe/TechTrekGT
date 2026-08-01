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
 * @param {object} person
 * @param {string} selectedAccountId - 'all' or specific account ID
 * @returns {number}
 */
export function getPersonDepositAmountForAccount(person, selectedAccountId = 'all') {
  if (!person) return 0;
  const netPay = parseFloat(person.netPerPay) || 0;
  if (!selectedAccountId || selectedAccountId === 'all') {
    return netPay;
  }

  const allocations = person.accountAllocations;
  if (allocations && typeof allocations === 'object' && Object.keys(allocations).length > 0) {
    const allocated = parseFloat(allocations[selectedAccountId]);
    if (!isNaN(allocated) && allocated > 0) {
      return allocated;
    }
    const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    if (totalAllocated > 0) {
      return 0;
    }
  }

  return netPay;
}
