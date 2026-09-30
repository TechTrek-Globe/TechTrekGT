import { test, describe } from 'node:test';
import assert from 'node:assert';

// Pure calculation engine tests - no DOM, no React, no Worker
import {
  parseDayNumber,
  getPersonTargetPayDaysForMonth,
  getPersonDepositDatesForMonth,
  isPersonDepositDay,
  getAnnualAmount,
  getMonthlyAmount,
  getAmountPerPaycheck,
  goalPerPay,
  goalMonthlyDisplay,
  FREQUENCY_ANNUAL_PERIODS
} from '../src/utils/paydayUtils.js';

import {
  normalizeIsoDate,
  mergeBills,
  matchCreditToEarner
} from '../src/utils/importer.js';

import {
  getLedgerRunningBalanceAsOfDate,
  getBillMatchAliases
} from '../src/utils/spreadsheet.js';

// --- Helper Fixtures (synthetic data, zero PII) ---

const semiMonthlyPerson = {
  id: 'p-1',
  name: 'Earner One',
  payFrequency: 'semi-monthly',
  payDay1: '1st',
  payDay2: '15th',
  payOffsetDays: 0
};

const biWeeklyPerson = {
  id: 'p-2',
  name: 'Earner Two',
  payFrequency: 'bi-weekly',
  payDay1: 1,
  payDay2: 15,
  payOffsetDays: -2
};

const monthlyPerson = {
  id: 'p-3',
  name: 'Earner Three',
  payFrequency: 'monthly',
  payDay1: 'last',
  payOffsetDays: 0
};

const weeklyPerson = {
  id: 'p-4',
  name: 'Earner Four',
  payFrequency: 'weekly',
  payOffsetDays: 0
};

describe('parseDayNumber', () => {
  test('parses numeric string "15"', () => {
    assert.strictEqual(parseDayNumber('15', 31), 15);
  });

  test('parses ordinal string "1st"', () => {
    assert.strictEqual(parseDayNumber('1st', 31), 1);
  });

  test('parses "last" to daysInMonth', () => {
    assert.strictEqual(parseDayNumber('last', 30), 30);
    assert.strictEqual(parseDayNumber('End of Month', 31), 31);
  });

  test('clamps out-of-range numbers', () => {
    assert.strictEqual(parseDayNumber(0, 31), 1);
    assert.strictEqual(parseDayNumber(40, 31), 31);
  });

  test('returns null for empty/invalid', () => {
    assert.strictEqual(parseDayNumber('', 31), null);
    assert.strictEqual(parseDayNumber(null, 31), null);
    assert.strictEqual(parseDayNumber(undefined, 31), null);
  });
});

describe('getPersonTargetPayDaysForMonth', () => {
  test('semi-monthly in January (31 days) returns day 1 and 15', () => {
    const days = getPersonTargetPayDaysForMonth(semiMonthlyPerson, 2026, 0);
    assert.strictEqual(days.length, 2);
    assert.strictEqual(days[0].getDate(), 1);
    assert.strictEqual(days[1].getDate(), 15);
  });

  test('monthly with "last" returns last day of Feb (28 in 2026)', () => {
    const days = getPersonTargetPayDaysForMonth(monthlyPerson, 2026, 1);
    assert.strictEqual(days.length, 1);
    assert.strictEqual(days[0].getDate(), 28);
  });

  test('monthly with "last" returns 29 in leap year 2028', () => {
    const days = getPersonTargetPayDaysForMonth(monthlyPerson, 2028, 1);
    assert.strictEqual(days.length, 1);
    assert.strictEqual(days[0].getDate(), 29);
  });

  test('bi-weekly with only payDay1 sets default d2', () => {
    const partial = { ...semiMonthlyPerson, payDay1: 1, payDay2: null };
    const days = getPersonTargetPayDaysForMonth(partial, 2026, 0);
    assert.strictEqual(days.length, 2);
    assert.ok(days[1].getDate() >= 14);
  });

  test('weekly returns all Fridays in January 2026', () => {
    const days = getPersonTargetPayDaysForMonth(weeklyPerson, 2026, 0);
    days.forEach(d => {
      assert.strictEqual(d.getDay(), 5);
    });
    assert.ok(days.length >= 4);
  });
});

describe('getPersonDepositDatesForMonth with offset', () => {
  test('deposit dates for bi-weekly person with -2 day offset', () => {
    const dates = getPersonDepositDatesForMonth(biWeeklyPerson, 2026, 0);
    dates.forEach(d => {
      assert.strictEqual(d.getFullYear(), 2026);
      assert.strictEqual(d.getMonth(), 0);
    });
  });

  test('deposit dates span correct month boundary', () => {
    const dates = getPersonDepositDatesForMonth(semiMonthlyPerson, 2026, 1);
    assert.ok(dates.length >= 2);
  });
});

describe('isPersonDepositDay', () => {
  test('returns true for deposit day', () => {
    assert.ok(isPersonDepositDay(semiMonthlyPerson, 2026, 0, 1) === true);
  });

  test('returns false for non-deposit day', () => {
    assert.strictEqual(isPersonDepositDay(semiMonthlyPerson, 2026, 0, 10), false);
  });

  test('returns false for null person', () => {
    assert.strictEqual(isPersonDepositDay(null, 2026, 0, 1), false);
  });
});

describe('getAnnualAmount', () => {
  test('monthly amount annualizes to 12x', () => {
    assert.strictEqual(getAnnualAmount(100, 'monthly'), 1200);
  });

  test('bi-weekly amount annualizes to 26x', () => {
    assert.strictEqual(getAnnualAmount(500, 'bi-weekly'), 13000);
  });

  test('weekly amount annualizes to 52x', () => {
    assert.strictEqual(getAnnualAmount(100, 'weekly'), 5200);
  });

  test('semi-monthly amount annualizes to 24x', () => {
    assert.strictEqual(getAnnualAmount(800, 'semi-monthly'), 19200);
  });

  test('falls back to 12x for unknown frequency', () => {
    assert.strictEqual(getAnnualAmount(100, 'unknown'), 1200);
  });
});

describe('getMonthlyAmount', () => {
  test('bi-weekly 500 per-paycheck is close to 1083.33 monthly', () => {
    const result = getMonthlyAmount(500, 'bi-weekly');
    assert.ok(Math.abs(result - 1083.33) < 0.01, `Expected ~1083.33, got ${result}`);
  });

  test('monthly 1000 = 1000 monthly', () => {
    assert.strictEqual(getMonthlyAmount(1000, 'monthly'), 1000);
  });
});

describe('getAmountPerPaycheck', () => {
  test('goal 1200 monthly with semi-monthly pay = 600 per paycheck', () => {
    assert.strictEqual(getAmountPerPaycheck(1200, 'monthly', 'semi-monthly'), 600);
  });

  test('goal 1000 monthly with bi-weekly pay uses 24 pay periods', () => {
    const result = getAmountPerPaycheck(1000, 'monthly', 'bi-weekly');
    assert.strictEqual(result, Math.round((1000 * 12 / 24) * 100) / 100);
  });
});

describe('goalPerPay & goalMonthlyDisplay', () => {
  test('goalPerPay rounds to 2dp', () => {
    assert.strictEqual(goalPerPay({ amountPerPay: 123.456 }), 123.46);
  });

  test('goalMonthlyDisplay with bi-weekly uses multiplier 2', () => {
    assert.strictEqual(goalMonthlyDisplay({ amountPerPay: 500 }, 'bi-weekly'), 1000);
  });

  test('goalMonthlyDisplay with monthly uses multiplier 1', () => {
    assert.strictEqual(goalMonthlyDisplay({ amountPerPay: 1000 }, 'monthly'), 1000);
  });
});

describe('normalizeIsoDate', () => {
  test('normalizes YYYY-MM-DD string', () => {
    assert.strictEqual(normalizeIsoDate('2026-03-15'), '2026-03-15');
  });

  test('normalizes Date object from Excel serial number (1900 epoch)', () => {
    // 45112 is approximately 2023-07-04 in Excel serial
    const result = normalizeIsoDate(45112);
    assert.ok(result);
    assert.ok(typeof result === 'string' && result.includes('-'));
  });

  test('returns null for null/undefined/empty', () => {
    assert.strictEqual(normalizeIsoDate(null), null);
    assert.strictEqual(normalizeIsoDate(undefined), null);
    assert.strictEqual(normalizeIsoDate(''), null);
  });
});

describe('mergeBills', () => {
  const existingBill = {
    id: 'bill-1',
    name: 'Rent',
    amount: 1200,
    period: 'Monthly',
    dueDay: 1,
    accountId: 'acc-1'
  };

  test('merges by name match', () => {
    const incoming = [{ name: 'Rent', amount: 1250, accountId: 'acc-1' }];
    const result = mergeBills([existingBill], incoming);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'Rent');
    assert.strictEqual(result[0].amount, 1250);
  });

  test('adds new bill when no match', () => {
    const incoming = [{ name: 'New Expense', amount: 100 }];
    const result = mergeBills([existingBill], incoming);
    assert.strictEqual(result.length, 2);
  });

  test('handles empty arrays', () => {
    const result = mergeBills([], []);
    assert.strictEqual(result.length, 0);
  });
});

describe('matchCreditToEarner', () => {
  const acc = { id: 'acc-1', name: 'Checking' };
  const bob = {
    id: 'p-bob',
    name: 'Bob',
    payFrequency: 'semi-monthly',
    bankMatchNames: 'bob payroll'
  };
  const alice = {
    id: 'p-alice',
    name: 'Alice',
    payFrequency: 'monthly'
  };

  test('matches direct name in description', () => {
    const match = matchCreditToEarner({
      amount: 1500,
      description: 'Bob Payroll Direct',
      people: [bob, alice],
      accounts: [acc]
    });
    assert.ok(match);
    assert.strictEqual(match.person.id, 'p-bob');
  });

  test('returns null for tiny amounts below MIN_EARNER_AMOUNT', () => {
    const match = matchCreditToEarner({
      amount: 2.50,
      description: 'Interest credit',
      people: [bob],
      accounts: [acc]
    });
    assert.strictEqual(match, null);
  });

  test('excludes non-earner categories', () => {
    const match = matchCreditToEarner({
      amount: 100,
      description: 'ATM withdrawal',
      category: 'interest income',
      people: [bob],
      accounts: [acc]
    });
    assert.strictEqual(match, null);
  });

  test('matches alias in description', () => {
    const match = matchCreditToEarner({
      amount: 1500,
      description: 'Bob Payroll Transfer',
      people: [bob],
      accounts: [acc]
    });
    assert.ok(match);
    assert.strictEqual(match.person.id, 'p-bob');
  });

  test('handles empty people list', () => {
    const match = matchCreditToEarner({
      amount: 1000,
      description: 'Some payment',
      people: [],
      accounts: [acc]
    });
    assert.strictEqual(match, null);
  });
});

describe('getLedgerRunningBalanceAsOfDate', () => {
  const accId = 'acc-1';
  const metadataState = {
    accounts: [{
      id: accId,
      name: 'Checking',
      startingBalance: 1000,
      extraStartingBalance: 0,
      enableExtraSavings: false,
      balanceAsOfDate: '2026-01-01',
      startDate: '2026-01-01'
    }],
    people: [{
      id: 'p-1',
      name: 'Earner One',
      payFrequency: 'semi-monthly',
      payDay1: '1st',
      payDay2: '15th',
      payOffsetDays: 0
    }],
    bills: [{
      id: 'b-1',
      name: 'Rent',
      amount: 500,
      accountId: accId,
      dueDay: 1,
      period: 'Monthly'
    }]
  };

  test('returns starting balance when no target date', () => {
    const bal = getLedgerRunningBalanceAsOfDate({
      targetAccountId: accId,
      targetDate: null,
      metadataState
    });
    assert.strictEqual(bal, 1000);
  });

  test('returns starting balance before account start date', () => {
    const bal = getLedgerRunningBalanceAsOfDate({
      targetAccountId: accId,
      targetDate: '2025-12-31',
      metadataState
    });
    assert.strictEqual(bal, 1000);
  });

  test('simulates balance with empty matrix', () => {
    const bal = getLedgerRunningBalanceAsOfDate({
      targetAccountId: accId,
      targetDate: '2026-01-31',
      metadataState,
      dailyMatrix: {},
      transactions: []
    });
    assert.ok(typeof bal === 'number');
    assert.ok(!isNaN(bal));
  });

  test('falls back to first account when target not found', () => {
    const bal = getLedgerRunningBalanceAsOfDate({
      targetAccountId: 'nonexistent',
      targetDate: null,
      metadataState
    });
    assert.strictEqual(bal, 1000);
  });
});

describe('getBillMatchAliases', () => {
  test('extracts aliases from bankMatchNames string', () => {
    const aliases = getBillMatchAliases({ bankMatchNames: 'rent, house payment, mortgage co' });
    assert.ok(Array.isArray(aliases));
    assert.ok(aliases.length >= 2);
    assert.ok(aliases.some(a => a.includes('rent')));
  });

  test('returns empty array for null bill', () => {
    assert.deepStrictEqual(getBillMatchAliases(null), []);
  });

  test('returns empty array for empty string', () => {
    assert.deepStrictEqual(getBillMatchAliases({ bankMatchNames: '', matchingKey: '' }), []);
  });
});

describe('Edge cases: February and leap years', () => {
  test('Feb 2026 has 28 target pay days with semi-monthly', () => {
    const days = getPersonTargetPayDaysForMonth(semiMonthlyPerson, 2026, 1);
    assert.strictEqual(days.length, 2);
    assert.strictEqual(days[0].getDate(), 1);
    assert.strictEqual(days[1].getDate(), 15);
  });

  test('Feb 2028 leap year has 29 target pay days with "last"', () => {
    const days = getPersonTargetPayDaysForMonth(monthlyPerson, 2028, 1);
    assert.strictEqual(days.length, 1);
    assert.strictEqual(days[0].getDate(), 29);
  });

  test('bi-weekly deposit dates survive leap year', () => {
    const dates = getPersonDepositDatesForMonth(biWeeklyPerson, 2028, 1);
    assert.ok(dates.length >= 2);
  });
});
