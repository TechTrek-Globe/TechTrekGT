import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  round2,
  parseMoney,
  isValidMoney,
  safeAdd,
  safeSub,
  safeMul,
  safeDiv,
  fmtMoney
} from '../src/utils/formatters.js';

import {
  allocateEarnerCredit,
  listFutureCreditOverrideDiagnostics
} from '../src/utils/ledgerEngine.js';

import {
  parseDayNumber,
  getAnnualAmount,
  getMonthlyAmount,
  getAmountPerPaycheck,
  goalPerPay,
  goalMonthlyDisplay
} from '../src/utils/paydayUtils.js';

import {
  round2 as backendRound2,
  parseMoney as backendParseMoney,
  isValidMoney as backendIsValidMoney,
  safeAdd as backendSafeAdd,
  safeSub as backendSafeSub,
  safeMul as backendSafeMul,
  safeDiv as backendSafeDiv,
  validateNonNegativeMoney
} from '../functions/utils/guard.js';

describe('FIN-AUDIT-003: Deterministic Financial Math Utilities', () => {
  test('round2 eliminates floating-point drift on fractional sums', () => {
    // 0.1 + 0.2 in JS is 0.30000000000000004
    assert.strictEqual(0.1 + 0.2 === 0.3, false);
    assert.strictEqual(round2(0.1 + 0.2), 0.3);

    // Cumulative sum drift test
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += 0.1;
    }
    assert.strictEqual(round2(sum), 1);
  });

  test('round2 correctly rounds half-cent boundaries (Number.EPSILON protection)', () => {
    // In IEEE 754, 1.005 * 100 = 100.49999999999999, so standard Math.round(1.005 * 100) / 100 gives 1
    assert.strictEqual(Math.round(1.005 * 100) / 100, 1);
    // round2 uses EPSILON to guarantee correct banker-friendly rounding
    assert.strictEqual(round2(1.005), 1.01);
    assert.strictEqual(round2(-1.005), -1.01);
    assert.strictEqual(round2(1.055), 1.06);
    assert.strictEqual(round2(2.555), 2.56);
  });

  test('round2 eliminates negative zero (-0)', () => {
    const res = round2(-0);
    assert.strictEqual(res, 0);
    assert.strictEqual(Object.is(res, 0), true);
    assert.strictEqual(Object.is(res, -0), false);
  });

  test('round2 safely parses formatted currency strings and accounting negatives', () => {
    assert.strictEqual(round2('$1,234.56'), 1234.56);
    assert.strictEqual(round2('($1,234.56)'), -1234.56);
    assert.strictEqual(round2('(450.25)'), -450.25);
    assert.strictEqual(round2('  $99.99  '), 99.99);
  });

  test('round2 guards against NaN, Infinity, null, and undefined without crashing', () => {
    assert.strictEqual(round2(NaN), 0);
    assert.strictEqual(round2(Infinity), 0);
    assert.strictEqual(round2(-Infinity), 0);
    assert.strictEqual(round2(null), 0);
    assert.strictEqual(round2(undefined), 0);
    assert.strictEqual(round2(''), 0);
    assert.strictEqual(round2('not-a-number'), 0);
    assert.strictEqual(round2(NaN, null), null);
    assert.strictEqual(round2(undefined, 100), 100);
  });

  test('parseMoney parses strings, ignores currency symbols and commas, and rejects invalid inputs', () => {
    assert.strictEqual(parseMoney('3500.50'), 3500.5);
    assert.strictEqual(parseMoney('$4,567.89'), 4567.89);
    assert.strictEqual(parseMoney('(150.00)'), -150);
    assert.strictEqual(parseMoney(''), 0);
    assert.strictEqual(parseMoney(null, null), null);
    assert.strictEqual(parseMoney('invalid-input', 0), 0);
  });

  test('isValidMoney correctly identifies valid vs invalid money inputs', () => {
    assert.strictEqual(isValidMoney(0), true);
    assert.strictEqual(isValidMoney(123.45), true);
    assert.strictEqual(isValidMoney('-50.25'), true);
    assert.strictEqual(isValidMoney('$1,000.00'), true);
    assert.strictEqual(isValidMoney('(250)'), true);

    assert.strictEqual(isValidMoney(NaN), false);
    assert.strictEqual(isValidMoney(Infinity), false);
    assert.strictEqual(isValidMoney(-Infinity), false);
    assert.strictEqual(isValidMoney(null), false);
    assert.strictEqual(isValidMoney(undefined), false);
    assert.strictEqual(isValidMoney(''), false);
    assert.strictEqual(isValidMoney('   '), false);
    assert.strictEqual(isValidMoney('abc'), false);
  });

  test('safe arithmetic helpers prevent floating drift and zero division', () => {
    assert.strictEqual(safeAdd(0.1, 0.2), 0.3);
    assert.strictEqual(safeSub(1.03, 0.42), 0.61);
    assert.strictEqual(safeMul(19.99, 3), 59.97);
    assert.strictEqual(safeDiv(100, 3), 33.33);
    assert.strictEqual(safeDiv(100, 0), 0);
    assert.strictEqual(safeDiv(100, null), 0);
    assert.strictEqual(safeDiv(NaN, 5), 0);
  });

  test('fmtMoney renders clean 2 decimal place currency format', () => {
    assert.strictEqual(fmtMoney(1234.5), '$1,234.50');
    assert.strictEqual(fmtMoney(0.1 + 0.2), '$0.30');
    assert.strictEqual(fmtMoney(0), '$0.00');
    assert.strictEqual(fmtMoney(NaN), '$0.00');
  });
});

describe('FIN-AUDIT-003: Backend Guard Currency Validation', () => {
  test('backend math mirrors frontend deterministic behavior', () => {
    assert.strictEqual(backendRound2(0.1 + 0.2), 0.3);
    assert.strictEqual(backendRound2(1.005), 1.01);
    assert.strictEqual(backendRound2(-1.005), -1.01);
    assert.strictEqual(backendRound2(NaN), 0);
    assert.strictEqual(backendRound2(Infinity), 0);
    assert.strictEqual(backendParseMoney('$2,500.75'), 2500.75);
    assert.strictEqual(backendSafeDiv(50, 0), 0);
    assert.strictEqual(backendSafeAdd(0.7, 0.1), 0.8);
    assert.strictEqual(backendSafeSub(1.4, 0.2), 1.2);
  });

  test('validateNonNegativeMoney rejects invalid and negative amounts', () => {
    const res1 = validateNonNegativeMoney(100.5);
    assert.strictEqual(res1.valid, true);
    assert.strictEqual(res1.value, 100.5);

    const res2 = validateNonNegativeMoney('$1,000.00');
    assert.strictEqual(res2.valid, true);
    assert.strictEqual(res2.value, 1000);

    const res3 = validateNonNegativeMoney(0);
    assert.strictEqual(res3.valid, true);
    assert.strictEqual(res3.value, 0);

    assert.strictEqual(validateNonNegativeMoney(-5).valid, false);
    assert.strictEqual(validateNonNegativeMoney(NaN).valid, false);
    assert.strictEqual(validateNonNegativeMoney(Infinity).valid, false);
    assert.strictEqual(validateNonNegativeMoney('invalid').valid, false);
    assert.strictEqual(validateNonNegativeMoney(null).valid, false);
  });
});

describe('FIN-AUDIT-003: Payday and Amortization Calculation Integrity', () => {
  test('parseDayNumber handles string variations and rejects non-finite safely', () => {
    assert.strictEqual(parseDayNumber('1st'), 1);
    assert.strictEqual(parseDayNumber('15th'), 15);
    assert.strictEqual(parseDayNumber('31'), 31);
    assert.strictEqual(parseDayNumber('last'), 31);
    assert.strictEqual(parseDayNumber(NaN), null);
    assert.strictEqual(parseDayNumber(Infinity), null);
    assert.strictEqual(parseDayNumber(null), null);
    assert.strictEqual(parseDayNumber(undefined), null);
  });

  test('frequency conversion utilities round to exact cents without drift', () => {
    // Bi-weekly to annual: 100.55 * 26 = 2614.3
    assert.strictEqual(getAnnualAmount(100.55, 'bi-weekly'), 2614.3);
    // Monthly from bi-weekly: 2614.3 / 12 = 217.858333... -> 217.86
    assert.strictEqual(getMonthlyAmount(100.55, 'bi-weekly'), 217.86);
    // Amount per paycheck: $1200 annual for monthly earner = 100
    assert.strictEqual(getAmountPerPaycheck(1200, 'annual', 'monthly'), 100);
    // Semi-monthly: $1000 monthly = 1000 * 12 / 24 = 500
    assert.strictEqual(getAmountPerPaycheck(1000, 'monthly', 'semi-monthly'), 500);

    // Goal per pay: canonical read from goal.amountPerPay
    assert.strictEqual(goalPerPay({ amountPerPay: 250.5 }), 250.5);
    // Goal monthly display for semi-monthly: 250.5 * 2 = 501
    assert.strictEqual(goalMonthlyDisplay({ amountPerPay: 250.5 }, 'semi-monthly'), 501);
  });
});

describe('FIN-AUDIT-003: Ledger Engine Credit Allocation Safety', () => {
  const mockPerson = {
    id: 'p-earner',
    name: 'Earner A',
    payFrequency: 'semi-monthly',
    payDay1: '1st',
    payDay2: '15th',
    payOffsetDays: 0,
    depositAccount: 'acc-1',
    accountAllocations: { 'acc-1': 2500 },
    enableExtraSavings: true,
    extraSavingsAccount: 'acc-1'
  };

  const mockMetadata = {
    people: [mockPerson],
    accounts: [
      { id: 'acc-1', name: 'Primary Checking', startingBalance: 1000, extraStartingBalance: 200, enabledEarners: ['p-earner'] }
    ],
    bills: [
      { id: 'bill-1', accountId: 'acc-1', amount: 3000, period: 'Monthly', splits: { 'p-earner': 100 } }
    ],
    fundingGoals: [
      { id: 'g-1', contributorId: 'p-earner', accountId: 'acc-1', amountPerPay: 2500 }
    ]
  };

  test('allocateEarnerCredit maintains the invariant earnerReg + earnerExtra <= earnerDeposit', () => {
    const dailyMatrix = {};
    const alloc = allocateEarnerCredit(mockPerson, 'acc-1', 2026, 0, 1, mockMetadata, dailyMatrix, { isLockedDay: false });
    
    assert.strictEqual(alloc.earnerDeposit, 2500);
    assert.strictEqual(alloc.earnerReg + alloc.earnerExtra, alloc.earnerDeposit);
  });

  test('allocateEarnerCredit handles manual override strings with dollar signs and decimals', () => {
    const dailyMatrix = {
      'acc-1_2026-01_1_credit_p-earner': '$2,750.50',
      'acc-1_2026-01_1_extra_credit_p-earner': '$600.25'
    };
    const alloc = allocateEarnerCredit(mockPerson, 'acc-1', 2026, 0, 1, mockMetadata, dailyMatrix, { isLockedDay: false });

    assert.strictEqual(alloc.earnerDeposit, 2750.5);
    assert.strictEqual(alloc.earnerExtra, 600.25);
    assert.strictEqual(alloc.earnerReg, 2150.25);
    assert.strictEqual(round2(alloc.earnerReg + alloc.earnerExtra), alloc.earnerDeposit);
  });

  test('listFutureCreditOverrideDiagnostics calculates accurate diffs without floating drift', () => {
    const currentYear = new Date().getFullYear();
    const dailyMatrix = {
      [`acc-1_${currentYear}-01_15_credit_p-earner`]: '2500.10'
    };
    const diagnostics = listFutureCreditOverrideDiagnostics(
      mockMetadata,
      dailyMatrix
    );

    const match = diagnostics.find(d => d.accountId === 'acc-1' && d.personId === 'p-earner' && d.day === 15);
    assert.ok(match, 'Expected diagnostic entry for credit override');
    assert.strictEqual(match.override, 2500.1);
    assert.strictEqual(match.projected, 2500);
    assert.strictEqual(match.diff, 0.1);
  });
});
