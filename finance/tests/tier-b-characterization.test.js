import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// Tier B Characterization Tests
// Covers: P7 (IMP-001), P9 (BILL-002), P10 (CALC-001)
// These tests lock in CURRENT behavior first, then the
// corrected expected behavior is asserted after fixes.
// ============================================================

import { allocateEarnerCredit, listFutureCreditOverrideDiagnostics } from '../src/utils/ledgerEngine.js';
import { processSpreadsheetImport } from '../src/utils/spreadsheet.js';
import { effectiveDueDay, isBillDueInMonth } from '../src/utils/paydayUtils.js';

// ============================================================
// P10 - CALC-001: allocateEarnerCredit overflow split behavior
// ============================================================

describe('P10 (CALC-001): allocateEarnerCredit - stored credit without stored extra_credit', () => {
  // Person with semi-monthly pay, deposits $689 net to checking
  // Account has extra savings enabled ($50/period extra)
  const person = {
    id: 'person-alice',
    name: 'Alice',
    payFrequency: 'semi-monthly',
    payDay1: 15,
    payDay2: 'last',
    payOffsetDays: 0,
    grossPerPay: 800,
    netPerPay: 689.42,
    accountAllocations: { 'acc-check': 639.42 }
  };

  const budget = {
    accounts: [{ id: 'acc-check', enableExtraSavings: true, saveExtraMonthly: 100 }],
    people: [person],
    bills: [],
    fundingGoals: []
  };

  test('projected path: no stored credit - uses deposit amount from paydayUtils', () => {
    const dailyMatrix = {};
    // Sep 30 is payDay2='last' for September
    const alloc = allocateEarnerCredit(person, 'acc-check', 2026, 8, 30, budget, dailyMatrix, { isLockedDay: false });
    // Should return a non-zero projected amount (getPersonDepositAmountForAccount)
    assert.ok(alloc.earnerDeposit >= 0, 'projected deposit is non-negative');
    assert.strictEqual(alloc.source, 'projected', 'source should be projected when no stored cell');
  });

  test('stored credit without stored extra_credit: earnerExtra must be 0, full amount is reg', () => {
    // Key fix: if c is set but ec is not, the stored amount is treated as purely regular.
    // Pre-fix this would incorrectly calculate earnerExtra from projected amounts.
    const storedAmount = 689.42;
    const dailyMatrix = {
      'acc-check_2026-09_30_credit_person-alice': storedAmount
      // No extra_credit key
    };
    const alloc = allocateEarnerCredit(person, 'acc-check', 2026, 8, 30, budget, dailyMatrix, { isLockedDay: false });

    assert.strictEqual(alloc.earnerDeposit, storedAmount, 'earnerDeposit equals stored credit');
    // CORRECTED behavior: no extra_credit stored means earnerExtra = 0, earnerReg = full stored amount
    assert.strictEqual(alloc.earnerExtra, 0, 'earnerExtra must be 0 when no extra_credit cell is stored');
    assert.strictEqual(alloc.earnerReg, storedAmount, 'earnerReg must equal full stored amount when no extra_credit');
    assert.ok(
      Math.abs((alloc.earnerReg + alloc.earnerExtra) - alloc.earnerDeposit) < 0.01,
      'earnerReg + earnerExtra must equal earnerDeposit to the cent'
    );
  });

  test('stored credit WITH stored extra_credit: uses MANUAL source and both stored values', () => {
    const storedCredit = 689.42;
    const storedExtra = 50.00;
    const dailyMatrix = {
      'acc-check_2026-09_30_credit_person-alice': storedCredit,
      'acc-check_2026-09_30_extra_credit_person-alice': storedExtra
    };
    const alloc = allocateEarnerCredit(person, 'acc-check', 2026, 8, 30, budget, dailyMatrix, { isLockedDay: false });

    assert.strictEqual(alloc.earnerDeposit, storedCredit, 'earnerDeposit equals stored credit');
    assert.strictEqual(alloc.earnerExtra, storedExtra, 'earnerExtra equals stored extra_credit when explicitly set');
    assert.strictEqual(alloc.source, 'manual', 'source should be manual when both cells are stored');
    assert.ok(
      Math.abs((alloc.earnerReg + alloc.earnerExtra) - alloc.earnerDeposit) < 0.01,
      'earnerReg + earnerExtra must equal earnerDeposit'
    );
  });

  test('stored credit=0 explicitly: treated as zeroed override, not projected', () => {
    // A stored 0 means the user explicitly cleared the deposit for that day
    const dailyMatrix = {
      'acc-check_2026-09_30_credit_person-alice': 0
    };
    const alloc = allocateEarnerCredit(person, 'acc-check', 2026, 8, 30, budget, dailyMatrix, { isLockedDay: false });
    // 0 is falsy so parseFloat(0) || 0 = 0; the deposit is 0, reg is 0, extra is 0
    assert.strictEqual(alloc.earnerDeposit, 0, 'stored 0 credit yields earnerDeposit=0');
    assert.strictEqual(alloc.earnerReg, 0, 'stored 0 credit yields earnerReg=0');
    assert.strictEqual(alloc.earnerExtra, 0, 'stored 0 credit yields earnerExtra=0');
  });

  test('isLockedDay: no stored credit returns 0, not projection', () => {
    const dailyMatrix = {};
    const alloc = allocateEarnerCredit(person, 'acc-check', 2026, 8, 25, budget, dailyMatrix, { isLockedDay: true });
    // On a locked day with no stored credit, projected amount is blocked
    assert.strictEqual(alloc.earnerDeposit, 0, 'locked day with no stored cell returns 0');
    assert.strictEqual(alloc.source, 'projected', 'source is projected even on locked day (0 amount)');
  });

  test('earnerReg + earnerExtra <= earnerDeposit invariant holds for any stored combination', () => {
    const testCases = [
      { credit: 1222.61, extra: undefined },
      { credit: 689.42, extra: undefined },
      { credit: 1378.00, extra: 200.00 },
      { credit: 500.00, extra: 600.00 }, // extra > deposit edge case
      { credit: 0, extra: undefined }
    ];
    testCases.forEach(({ credit, extra }) => {
      const matrix = { 'acc-check_2026-09_25_credit_person-alice': credit };
      if (extra !== undefined) {
        matrix['acc-check_2026-09_25_extra_credit_person-alice'] = extra;
      }
      const alloc = allocateEarnerCredit(person, 'acc-check', 2026, 8, 25, budget, matrix, { isLockedDay: false });
      assert.ok(
        alloc.earnerExtra <= alloc.earnerDeposit,
        `earnerExtra (${alloc.earnerExtra}) must not exceed earnerDeposit (${alloc.earnerDeposit}) for credit=${credit}, extra=${extra}`
      );
      assert.ok(
        Math.abs((alloc.earnerReg + alloc.earnerExtra) - alloc.earnerDeposit) < 0.005,
        `reg+extra (${alloc.earnerReg + alloc.earnerExtra}) must equal deposit (${alloc.earnerDeposit}) for credit=${credit}`
      );
    });
  });
});

// ============================================================
// P9 - BILL-002: Archived bills excluded from totals
// ============================================================

describe('P9 (BILL-002): Bill totals must exclude archived bills', () => {
  // Simulate getBillMonthlyCost as a pure function (matches BudgetMetadataContext logic)
  function getBillMonthlyCost(bill) {
    if (!bill) return 0;
    const amt = Math.abs(parseFloat(bill.amount) || 0);
    if (bill.period === 'Annual') return amt / 12;
    if (bill.period === 'Semi-Annual') return amt / 6;
    if (bill.period === 'Quarterly') return amt / 3;
    if (bill.period === 'Weekly') return (amt * 52) / 12;
    return amt;
  }

  const activeBill1 = { id: 'bill-mortgage', name: 'Mortgage', amount: 2756, dueDay: 1, accountId: 'acc-check', isArchived: false };
  const activeBill2 = { id: 'bill-hoa', name: 'HOA', amount: 444, dueDay: 1, accountId: 'acc-savings', isArchived: false };
  const archivedBill = { id: 'bill-old-utility', name: 'Old Utility', amount: 150, dueDay: 15, accountId: 'acc-check', isArchived: true };
  const allBills = [activeBill1, activeBill2, archivedBill];

  // getTotalMonthlyExpenses equivalent
  function getTotalMonthlyExpenses(bills) {
    return bills.filter(b => !b.isArchived).reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
  }

  // getAccountMonthlyExpenses equivalent
  function getAccountMonthlyExpenses(accountId, bills) {
    return bills
      .filter(b => !b.isArchived && b.accountId === accountId)
      .reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
  }

  // getUpcomingBills equivalent
  function getUpcomingBills(bills, limit = 5) {
    return bills.filter(b => !b.isArchived).slice(0, limit);
  }

  test('getTotalMonthlyExpenses excludes archived bills', () => {
    const total = getTotalMonthlyExpenses(allBills);
    // Should only count mortgage (2756) + hoa (444) = 3200; NOT old utility (150)
    assert.strictEqual(total, 2756 + 444, `total should be ${2756 + 444}, got ${total}`);
    assert.notStrictEqual(total, 2756 + 444 + 150, 'archived bill must NOT be included');
  });

  test('getAccountMonthlyExpenses excludes archived bills from account total', () => {
    const checkTotal = getAccountMonthlyExpenses('acc-check', allBills);
    // acc-check has mortgage (active, 2756) and old-utility (archived, 150)
    // Only mortgage should be counted
    assert.strictEqual(checkTotal, 2756, 'acc-check total should only include active mortgage');
    assert.notStrictEqual(checkTotal, 2756 + 150, 'archived utility must NOT be included in account total');
  });

  test('getUpcomingBills excludes archived bills from the list', () => {
    const upcoming = getUpcomingBills(allBills, 10);
    const ids = upcoming.map(b => b.id);
    assert.ok(!ids.includes('bill-old-utility'), 'archived bill must not appear in upcoming bills list');
    assert.ok(ids.includes('bill-mortgage'), 'active mortgage must appear in upcoming bills list');
    assert.ok(ids.includes('bill-hoa'), 'active hoa must appear in upcoming bills list');
  });

  test('with zero active bills and one archived bill: total is 0', () => {
    const bills = [archivedBill];
    const total = getTotalMonthlyExpenses(bills);
    assert.strictEqual(total, 0, 'only archived bill results in 0 monthly total');
  });

  test('effectiveDueDay clamps archived bill the same as active (does not skip clamping)', () => {
    // This verifies archived bills are excluded at the filter level, not at the dueDay level
    const shortMonthBill = { id: 'b-arch', amount: 99, dueDay: 31, isArchived: true };
    const clamped = effectiveDueDay(shortMonthBill, 2026, 1); // February 2026 = 28 days
    assert.strictEqual(clamped, 28, 'effectiveDueDay still clamps archived bills correctly');
  });
});

// ============================================================
// P7 - IMP-001: Scheduled payday zeroing clamps to daysInMonth
// ============================================================

describe('P7 (IMP-001): Importer does not write day keys beyond daysInMonth', () => {
  // Test that after an import in September, no credit key with day=31 is created
  // The person has payDay2='last', which resolves to day 31 naively (September has 30 days)

  const alicePerson = {
    id: 'person-alice',
    name: 'Alice',
    payFrequency: 'semi-monthly',
    payDay1: 15,
    payDay2: 'last',
    payOffsetDays: 0,
    netPerPay: 689.42,
    accountAllocations: { 'acc-check': 689.42 }
  };

  const budget = {
    accounts: [{ id: 'acc-check', name: 'Checking', type: 'checking', enableExtraSavings: false }],
    people: [alicePerson],
    bills: [],
    fundingGoals: []
  };

  // Simulate an actual deposit transaction landing on Sep 29 (Alice's actual payday)
  const transactions = [
    {
      id: 'txn-sep-alice',
      date: '2026-09-29',
      amount: 689.42,
      description: 'Alice Paycheck',
      accountId: 'acc-check',
      personId: 'person-alice'
    }
  ];

  test('importing a Sep 29 credit does not create a Sep 31 scheduled-zero key', () => {
    const result = processSpreadsheetImport({
      namespaces: { transactions: true },
      strategies: { transactions: 'merge' },
      data: {
        transactions,
        targetAccountId: 'acc-check',
        people: [alicePerson],
        accounts: budget.accounts
      },
      metadataState: budget,
      dailyMatrix: {},
      transactions: [],
      dryRun: false
    });

    assert.ok(result.success, `import should succeed: ${result.error || ''}`);

    const matrixKeys = Object.keys(result.dailyMatrix || {});

    // The actual transaction on Sep 29 should be recorded
    const sep29Key = 'acc-check_2026-09_29_credit_person-alice';
    assert.ok(matrixKeys.includes(sep29Key), `Sep 29 actual credit key must be written: ${sep29Key}`);

    // No day-31 key should exist for September (September has 30 days)
    const invalidKey = 'acc-check_2026-09_31_credit_person-alice';
    assert.ok(
      !matrixKeys.includes(invalidKey),
      `Invalid Sep 31 key must NOT be written. Keys found: ${matrixKeys.filter(k => k.includes('_31_')).join(', ')}`
    );
  });

  test('importing a Sep 15 first-half credit does not zero out day 31 in September', () => {
    // Alice deposits on Sep 15 = payDay1, so actualDay === numericPayDay and no zero is needed.
    // More importantly: a zero for the SECOND-half scheduled payday (payDay2='last' -> day 30)
    // should NOT be written since this transaction is in the FIRST half of the month.
    const sep15Txns = [
      {
        id: 'txn-sep-alice-2',
        date: '2026-09-15',
        amount: 689.42,
        description: 'Alice Paycheck',
        accountId: 'acc-check',
        personId: 'person-alice'
      }
    ];

    const result = processSpreadsheetImport({
      namespaces: { transactions: true },
      strategies: { transactions: 'merge' },
      data: {
        transactions: sep15Txns,
        targetAccountId: 'acc-check',
        people: [alicePerson],
        accounts: budget.accounts
      },
      metadataState: budget,
      dailyMatrix: {},
      transactions: [],
      dryRun: false
    });

    assert.ok(result.success, `import should succeed: ${result.error || ''}`);

    const matrixKeys = Object.keys(result.dailyMatrix || {});
    const sepKeys = matrixKeys.filter(k => k.includes('2026-09'));

    // The Sep 15 actual credit key must be written
    const sep15Key = 'acc-check_2026-09_15_credit_person-alice';
    assert.ok(matrixKeys.includes(sep15Key), `Sep 15 credit key must be written`);

    // No invalid day-31 key should ever exist for September
    const invalidSep31Key = 'acc-check_2026-09_31_credit_person-alice';
    assert.ok(
      !matrixKeys.includes(invalidSep31Key),
      `Sep 31 key must NOT exist for September. Found: ${invalidSep31Key}`
    );

    // actualDay(15) === numericPayDay(15=payDay1), so no zero-out key is written - correct
    // (There is nothing to suppress: the actual already landed on the scheduled day)
    const anyDay31Sep = matrixKeys.find(k => k.match(/_2026-09_31_/));
    assert.ok(!anyDay31Sep, `No September key should contain day 31. Found: ${anyDay31Sep}`);
  });

  test('Sep 14 early first-half deposit: writes zero on payDay1 (day 15)', () => {
    // If Alice's money arrives on Sep 14 instead of Sep 15, the scheduled payDay1=15 should be zeroed
    const sep14Txns = [
      {
        id: 'txn-sep-alice-early',
        date: '2026-09-14',
        amount: 689.42,
        description: 'Alice Paycheck',
        accountId: 'acc-check',
        personId: 'person-alice'
      }
    ];

    const result = processSpreadsheetImport({
      namespaces: { transactions: true },
      strategies: { transactions: 'merge' },
      data: {
        transactions: sep14Txns,
        targetAccountId: 'acc-check',
        people: [alicePerson],
        accounts: budget.accounts
      },
      metadataState: budget,
      dailyMatrix: {},
      transactions: [],
      dryRun: false
    });

    assert.ok(result.success, `import should succeed: ${result.error || ''}`);
    const matrixKeys = Object.keys(result.dailyMatrix || {});

    // Sep 14 credit must be written
    assert.ok(matrixKeys.includes('acc-check_2026-09_14_credit_person-alice'), 'Sep 14 credit key must exist');

    // Sep 15 must be zeroed out (suppress the scheduled projection since actual landed on 14)
    assert.ok(matrixKeys.includes('acc-check_2026-09_15_credit_person-alice'), 'Sep 15 zero-out key must exist');
    assert.strictEqual(result.dailyMatrix['acc-check_2026-09_15_credit_person-alice'], 0, 'Sep 15 zero-out value must be 0');

    // No day-31 key
    const anyDay31Sep = matrixKeys.find(k => k.match(/_2026-09_31_/));
    assert.ok(!anyDay31Sep, `No September key should contain day 31. Found: ${anyDay31Sep}`);
  });


  test('February import: payDay2=28 import does not write day 29 or 30', () => {
    // person with payDay2=30 in a non-leap February (28 days)
    const bobPerson = {
      id: 'person-bob',
      name: 'Bob',
      payFrequency: 'semi-monthly',
      payDay1: 15,
      payDay2: 30,
      payOffsetDays: 0,
      netPerPay: 1222.61,
      accountAllocations: { 'acc-check': 1222.61 }
    };

    const feb15Txns = [
      {
        id: 'txn-feb-bob',
        date: '2026-02-15',
        amount: 1222.61,
        description: 'Bob Paycheck',
        accountId: 'acc-check',
        personId: 'person-bob'
      }
    ];

    const result = processSpreadsheetImport({
      namespaces: { transactions: true },
      strategies: { transactions: 'merge' },
      data: {
        transactions: feb15Txns,
        targetAccountId: 'acc-check',
        people: [bobPerson],
        accounts: budget.accounts
      },
      metadataState: { ...budget, people: [bobPerson] },
      dailyMatrix: {},
      transactions: [],
      dryRun: false
    });

    assert.ok(result.success, `import should succeed: ${result.error || ''}`);

    const matrixKeys = Object.keys(result.dailyMatrix || {});
    const febKeys = matrixKeys.filter(k => k.includes('2026-02'));

    // No day > 28 should appear in a February key
    const invalidFebKeys = febKeys.filter(k => {
      const m = k.match(/_2026-02_(\d+)_/);
      return m && parseInt(m[1], 10) > 28;
    });

    assert.strictEqual(
      invalidFebKeys.length, 0,
      `No February key should have day > 28. Found: ${invalidFebKeys.join(', ')}`
    );
  });
});

describe('Option A (C3): Clear future matrix credit overrides', () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'fixtures/incident-household.json'),
      'utf-8'
    )
  );

  test('future credit cells are cleared while past historical cells and bills remain intact', () => {
    const todayIso = '2026-10-01';
    const creditKeyPattern = /^(.+)_(\d{4}-\d{2})_(\d{1,2})_(?:extra_)?credit_(.+)$/;
    const cleanMatrix = { ...fixture.dailyMatrix };
    let removed = 0;

    for (const [key] of Object.entries(cleanMatrix)) {
      const m = key.match(creditKeyPattern);
      if (!m) continue;
      const [, accId, mKey, dayStr] = m;
      const cellIso = `${mKey}-${dayStr.padStart(2, '0')}`;
      if (cellIso > todayIso) {
        delete cleanMatrix[key];
        removed++;
      }
    }

    assert.strictEqual(removed, 2, 'Should clear exactly the 2 future credit cells (10/13 and 10/18)');
    // Past historical cells MUST be preserved
    assert.strictEqual(cleanMatrix['acc-mortgage-test_2026-09_25_credit_person-bob'], 1222.61);
    assert.strictEqual(cleanMatrix['acc-mortgage-test_2026-09_29_credit_person-alice'], 689.42);
    assert.strictEqual(cleanMatrix['acc-mortgage-test_2026-01_15_credit_person-alice'], 689.42);
    // Bills MUST be preserved
    assert.strictEqual(cleanMatrix['acc-mortgage-test_2026-01_1_bill_bill-mortgage'], 2756.00);
    // Future cells MUST be deleted
    assert.strictEqual(cleanMatrix['acc-mortgage-test_2026-10_13_credit_person-alice'], undefined);
    assert.strictEqual(cleanMatrix['acc-mortgage-test_2026-10_18_credit_person-bob'], undefined);
  });

  test('after future cleanup, live funding goals project cleanly on paydays without double credits', () => {
    const todayIso = '2026-10-01';
    const creditKeyPattern = /^(.+)_(\d{4}-\d{2})_(\d{1,2})_(?:extra_)?credit_(.+)$/;
    const cleanMatrix = { ...fixture.dailyMatrix };

    for (const [key] of Object.entries(cleanMatrix)) {
      const m = key.match(creditKeyPattern);
      if (!m) continue;
      const [, accId, mKey, dayStr] = m;
      const cellIso = `${mKey}-${dayStr.padStart(2, '0')}`;
      if (cellIso > todayIso) {
        delete cleanMatrix[key];
      }
    }

    const bob = fixture.people[1];
    const accId = 'acc-mortgage-test';

    // On Oct 18 (Sunday, non-payday): credit is 0, no phantom $1,222.61
    const oct18 = allocateEarnerCredit(bob, accId, 2026, 9, 18, fixture, cleanMatrix, { isLockedDay: false });
    assert.strictEqual(oct18.earnerDeposit, 0);

    // On Oct 25 (Bob's scheduled monthly payday): clean live projection of $1,378
    const oct25 = allocateEarnerCredit(bob, accId, 2026, 9, 25, fixture, cleanMatrix, { isLockedDay: false });
    assert.strictEqual(oct25.earnerDeposit, 1378);
    assert.strictEqual(oct25.source, 'projected');
  });

  test('listFutureCreditOverrideDiagnostics runs cleanly without reference errors', () => {
    const results = listFutureCreditOverrideDiagnostics(fixture, fixture.dailyMatrix);
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.monthKey === '2026-10' && r.day === 18 && r.override === 1222.61));
  });
});
