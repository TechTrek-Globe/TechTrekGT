// tests/fix-09-consistent-credit-rule.test.js
// FIX-09: One consistent credit rule across all three engines
// - Use the same lock rule everywhere: lock end = min(last imported date, today). Pass the same isLockedDay value in spreadsheet.js as the other two engines.
// - On locked (past imported) dates, show only stored or imported credits; never projected credits.
// - When an imported credit for an earner exists within a pay period, do not also show that period's projected credit on the scheduled payday.
// - Imported bank credits land on the bank's date.
// Accept: LedgerView, getCalculatedBalanceAsOf, and getLedgerRunningBalanceAsOfDate return identical reg, extra, and total for every fixture date; no duplicate credits within a pay period.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { round2, parseMoney } from '../src/utils/formatters.js';
import { allocateEarnerCredit, hasImportedCreditInPayPeriod, LEDGER_SOURCE } from '../src/utils/ledgerEngine.js';
import { getLedgerRunningBalanceAsOfDate } from '../src/utils/spreadsheet.js';
import {
  getPersonDepositAmountForAccount,
  getPersonExtraSavingsDepositAmountForAccount,
  effectiveDueDay,
  isBillDueInMonth
} from '../src/utils/paydayUtils.js';

// Load fixture
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/incident-household.json'), 'utf-8')
);

// Helper function to simulate matrixData generation exactly as LedgerView.jsx does
function computeLedgerViewRows(account, budget, startDateStr, endDateStr, todayStr = '2026-10-05') {
  const dailyMatrix = budget.dailyMatrix || {};
  const isImportMode = account.ledgerMode === 'import' || (account.importedLedgerRows && Object.keys(account.importedLedgerRows).length > 0);
  const importedRows = isImportMode ? (account.importedLedgerRows || {}) : {};
  const importedDatesList = Object.keys(importedRows);
  const maxImportDateStr = importedDatesList.length > 0 ? importedDatesList.reduce((a, b) => a > b ? a : b) : null;
  const showExtraColumns = account.enableExtraSavings !== false;

  const effectiveLockEnd = maxImportDateStr && maxImportDateStr < todayStr ? maxImportDateStr : todayStr;

  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);
  const cur = new Date(sY, sM - 1, sD);
  const end = new Date(eY, eM - 1, eD);

  const people = (account.enabledEarners && Array.isArray(account.enabledEarners))
    ? budget.people.filter(p => account.enabledEarners.includes(p.id))
    : budget.people;
  const bills = (budget.bills || []).filter(b => !b.isArchived && b.accountId === account.id);

  const earnerPlanCache = new Map();
  people.forEach(p => {
    const planDep = round2(getPersonDepositAmountForAccount(p, account.id, budget));
    const planExtra = planDep > 0 ? round2(getPersonExtraSavingsDepositAmountForAccount(p, account.id, budget)) : 0;
    earnerPlanCache.set(p.id, { planDeposit: planDep, planExtra });
  });

  let runningRegBeg = round2(account.startingBalance, 0);
  let runningExtraBeg = showExtraColumns ? round2(account.extraStartingBalance, 0) : 0;
  const rows = [];

  while (cur <= end) {
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const day = cur.getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isLockedDay = Boolean(isImportMode && maxImportDateStr && isoDate <= effectiveLockEnd);

    // 1. Credits
    let totalRegCredits = 0;
    let dayExtraAdd = 0;
    people.forEach(p => {
      const plan = earnerPlanCache.get(p.id);
      const alloc = allocateEarnerCredit(p, account.id, year, month, day, budget, dailyMatrix, {
        isLockedDay,
        planDeposit: plan?.planDeposit,
        planExtra: plan?.planExtra
      });
      totalRegCredits = round2(totalRegCredits + alloc.earnerReg);
      dayExtraAdd = round2(dayExtraAdd + alloc.earnerExtra);
    });

    // 2. Bills
    let totalDayBills = 0;
    bills.forEach(b => {
      const bKey = `${account.id}_${monthKey}_${day}_bill_${b.id}`;
      const customBill = dailyMatrix[bKey];
      const expectedBillAmt = round2(b.amount, 0);
      if (customBill !== undefined && customBill !== null && customBill !== '') {
        let amt = parseMoney(customBill, 0);
        if (expectedBillAmt > 0 && Math.abs(amt - 2 * expectedBillAmt) < 0.02) {
          amt = expectedBillAmt;
        }
        totalDayBills = round2(totalDayBills + amt);
      } else if (!isLockedDay) {
        if (effectiveDueDay(b, year, month) === day && isBillDueInMonth(b, month, true)) {
          totalDayBills = round2(totalDayBills + expectedBillAmt);
        }
      }
    });

    // 3. Other
    const customOther = dailyMatrix[`${account.id}_${monthKey}_${day}_other_amount`];
    const customOtherCredit = dailyMatrix[`${account.id}_${monthKey}_${day}_other_credit_amount`];
    let otherAmt = 0;
    if (customOther !== undefined) otherAmt = round2(otherAmt + parseMoney(customOther, 0));
    if (customOtherCredit !== undefined) otherAmt = round2(otherAmt + parseMoney(customOtherCredit, 0));

    // 4. Ending balances
    const regEnding = round2(runningRegBeg + totalRegCredits - totalDayBills + otherAmt);
    const extraEnding = showExtraColumns ? round2(runningExtraBeg + dayExtraAdd) : 0;
    const totalEnd = round2(regEnding + (showExtraColumns ? extraEnding : 0));

    rows.push({
      isoDate,
      regBeg: runningRegBeg,
      extraBeg: runningExtraBeg,
      totalRegCredits,
      dayExtraAdd,
      totalDayBills,
      otherAmt,
      regEnding,
      extraEnding,
      totalEnd,
      reg: regEnding,
      extra: extraEnding,
      total: totalEnd,
      isLockedDay
    });

    runningRegBeg = regEnding;
    runningExtraBeg = extraEnding;
    cur.setDate(cur.getDate() + 1);
  }

  return rows;
}

// Helper to simulate LedgerDataContext.jsx getCalculatedBalanceAsOf
function computeCalculatedBalanceAsOf(account, budget, targetDateObj, todayStr = '2026-10-05') {
  const dailyMatrix = budget.dailyMatrix || {};
  const isImportMode = account.ledgerMode === 'import' || (account.importedLedgerRows && Object.keys(account.importedLedgerRows).length > 0);
  const importedRows = isImportMode ? (account.importedLedgerRows || {}) : {};
  const importedDatesList = Object.keys(importedRows);
  const maxImportDateStr = importedDatesList.length > 0 ? importedDatesList.reduce((a, b) => a > b ? a : b) : null;
  const showExtra = account.enableExtraSavings !== false;

  const effectiveLockEnd = maxImportDateStr && maxImportDateStr < todayStr ? maxImportDateStr : todayStr;

  const startDateStr = account.balanceAsOfDate || account.startDate || '2026-01-01';
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const startDateObj = new Date(sy, sm - 1, sd);
  const target = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate());

  if (target < startDateObj) {
    const sReg = parseMoney(account.startingBalance, 0);
    const sExtra = showExtra ? parseMoney(account.extraStartingBalance, 0) : 0;
    const total = round2(sReg + sExtra);
    return {
      regEnding: sReg,
      extraEnding: sExtra,
      totalEnd: total,
      reg: sReg,
      extra: sExtra,
      total
    };
  }

  let runningRegBeg = parseMoney(account.startingBalance, 0);
  let runningExtraBeg = showExtra ? parseMoney(account.extraStartingBalance, 0) : 0;

  const allPeople = budget.people || [];
  const people = (account.enabledEarners && Array.isArray(account.enabledEarners))
    ? allPeople.filter(p => account.enabledEarners.includes(p.id))
    : allPeople;
  const accountBills = (budget.bills || []).filter(b => !b.isArchived && b.accountId === account.id);

  const earnerPlanCache = new Map();
  people.forEach(p => {
    const planDep = round2(getPersonDepositAmountForAccount(p, account.id, budget));
    const planExtra = planDep > 0 ? round2(getPersonExtraSavingsDepositAmountForAccount(p, account.id, budget)) : 0;
    earnerPlanCache.set(p.id, { planDeposit: planDep, planExtra });
  });

  let cur = new Date(startDateObj);
  while (cur <= target) {
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const day = cur.getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isLockedDay = Boolean(isImportMode && maxImportDateStr && isoDate <= effectiveLockEnd);

    // 1. Credits
    let dayCredits = 0;
    let dayExtraAdd = 0;
    people.forEach(p => {
      const plan = earnerPlanCache.get(p.id);
      const alloc = allocateEarnerCredit(p, account.id, year, month, day, budget, dailyMatrix, {
        isLockedDay,
        planDeposit: plan?.planDeposit,
        planExtra: plan?.planExtra
      });
      dayCredits = round2(dayCredits + alloc.earnerReg);
      dayExtraAdd = round2(dayExtraAdd + alloc.earnerExtra);
    });

    // 2. Bills
    let dayBills = 0;
    accountBills.forEach(b => {
      const customBill = dailyMatrix[`${account.id}_${monthKey}_${day}_bill_${b.id}`];
      const expectedBillAmt = round2(b.amount, 0);
      if (customBill !== undefined && customBill !== null && customBill !== '') {
        let amt = parseMoney(customBill, 0);
        if (expectedBillAmt > 0 && Math.abs(amt - 2 * expectedBillAmt) < 0.02) {
          amt = expectedBillAmt;
        }
        dayBills = round2(dayBills + amt);
      } else if (!isLockedDay) {
        if (effectiveDueDay(b, year, month) === day && isBillDueInMonth(b, month, true)) {
          dayBills = round2(dayBills + expectedBillAmt);
        }
      }
    });

    // 3. Other
    const customOther = dailyMatrix[`${account.id}_${monthKey}_${day}_other_amount`];
    const customOtherCredit = dailyMatrix[`${account.id}_${monthKey}_${day}_other_credit_amount`];
    let otherAmt = 0;
    if (customOther !== undefined) otherAmt = round2(otherAmt + parseMoney(customOther, 0));
    if (customOtherCredit !== undefined) otherAmt = round2(otherAmt + parseMoney(customOtherCredit, 0));

    runningRegBeg = round2(runningRegBeg + dayCredits - dayBills + otherAmt);
    runningExtraBeg = showExtra ? round2(runningExtraBeg + dayExtraAdd) : 0;
    cur.setDate(cur.getDate() + 1);
  }

  const extraEnding = showExtra ? runningExtraBeg : 0;
  const totalEnd = round2(runningRegBeg + extraEnding);
  return {
    regEnding: runningRegBeg,
    extraEnding,
    totalEnd,
    reg: runningRegBeg,
    extra: extraEnding,
    total: totalEnd
  };
}

describe('FIX-09: One consistent credit rule across all three engines', () => {
  const mortgageAcc = fixture.accounts.find(a => a.id === 'acc-mortgage-test');
  const billsAcc = fixture.accounts.find(a => a.id === 'acc-bills-test');
  const alice = fixture.people.find(p => p.id === 'person-alice');
  const bob = fixture.people.find(p => p.id === 'person-bob');

  it('lock end = min(last imported date, today)', () => {
    // In mortgageAcc, last imported date in importedLedgerRows is 2027-06-06
    // When today is 2026-10-05, lock end must be 2026-10-05 (min of 2027-06-06 and 2026-10-05)
    const importedDates = Object.keys(mortgageAcc.importedLedgerRows);
    const maxImportDate = importedDates.reduce((a, b) => a > b ? a : b);
    assert.equal(maxImportDate, '2027-06-06');

    const todayStr = '2026-10-05';
    const effectiveLockEnd = maxImportDate && maxImportDate < todayStr ? maxImportDate : todayStr;
    assert.equal(effectiveLockEnd, '2026-10-05');
  });

  it('on locked (past imported) dates, show only stored or imported credits, never projected credits', () => {
    // 2026-09-01 is a locked date with no stored credit cell in dailyMatrix for mortgageAcc
    const alloc = allocateEarnerCredit(alice, mortgageAcc.id, 2026, 8, 1, fixture, fixture.dailyMatrix, { isLockedDay: true });
    assert.equal(alloc.earnerDeposit, 0, 'Locked date without stored credit must return 0 deposit');
    assert.equal(alloc.earnerReg, 0);
    assert.equal(alloc.earnerExtra, 0);

    // 2026-09-25 has stored Bob credit 1222.61 and extra_credit 0
    const allocBob = allocateEarnerCredit(bob, mortgageAcc.id, 2026, 8, 25, fixture, fixture.dailyMatrix, { isLockedDay: true });
    assert.equal(allocBob.earnerDeposit, 1222.61, 'Locked date with stored credit must display stored credit');
    assert.equal(allocBob.source, LEDGER_SOURCE.MANUAL);

    // 2026-09-15 has stored Alice credit 0
    const allocAlice0 = allocateEarnerCredit(alice, mortgageAcc.id, 2026, 8, 15, fixture, fixture.dailyMatrix, { isLockedDay: true });
    assert.equal(allocAlice0.earnerDeposit, 0, 'Stored zero displays 0, not projected amount');
  });

  it('imported bank credits land on the bank date', () => {
    // Alice bank deposit on Oct 13: 689.42
    const allocAlice13 = allocateEarnerCredit(alice, mortgageAcc.id, 2026, 9, 13, fixture, fixture.dailyMatrix, { isLockedDay: false });
    assert.equal(allocAlice13.earnerDeposit, 689.42);
    assert.equal(allocAlice13.source, LEDGER_SOURCE.ACTUAL_IMPORT);

    // Bob bank deposit on Oct 18: 1222.61
    const allocBob18 = allocateEarnerCredit(bob, mortgageAcc.id, 2026, 9, 18, fixture, fixture.dailyMatrix, { isLockedDay: false });
    assert.equal(allocBob18.earnerDeposit, 1222.61);
    assert.equal(allocBob18.source, LEDGER_SOURCE.ACTUAL_IMPORT);
  });

  it('when an imported credit for an earner exists within a pay period, do not also show projected credit on payday', () => {
    // Alice pay period 2 (Oct 9 to Oct 31) has imported credit on Oct 13 (689.42).
    // On scheduled payday Oct 15, projected credit must be suppressed (0).
    const hasAliceCredit = hasImportedCreditInPayPeriod(alice, mortgageAcc.id, 2026, 9, 15, fixture, fixture.dailyMatrix);
    assert.equal(hasAliceCredit, true, 'Alice has imported credit in pay period 2');

    const allocAlice15 = allocateEarnerCredit(alice, mortgageAcc.id, 2026, 9, 15, fixture, fixture.dailyMatrix, { isLockedDay: false });
    assert.equal(allocAlice15.earnerDeposit, 0, 'Oct 15 projected credit must be suppressed');

    // Bob monthly pay period (Oct 1 to Oct 31) has imported credit on Oct 18 (1222.61).
    // On scheduled payday Oct 25, projected credit must be suppressed (0).
    const hasBobCredit = hasImportedCreditInPayPeriod(bob, mortgageAcc.id, 2026, 9, 25, fixture, fixture.dailyMatrix);
    assert.equal(hasBobCredit, true, 'Bob has imported credit in October pay period');

    const allocBob25 = allocateEarnerCredit(bob, mortgageAcc.id, 2026, 9, 25, fixture, fixture.dailyMatrix, { isLockedDay: false });
    assert.equal(allocBob25.earnerDeposit, 0, 'Oct 25 projected credit must be suppressed');
  });

  it('no duplicate credits within a pay period: Alice Oct 1 projection is preserved', () => {
    // Alice pay period 1 (Oct 1 to Oct 8) has NO imported credit in dailyMatrix.
    // Scheduled payday Oct 1 projects normally when unlocked.
    const hasAlicePeriod1 = hasImportedCreditInPayPeriod(alice, mortgageAcc.id, 2026, 9, 1, fixture, fixture.dailyMatrix);
    assert.equal(hasAlicePeriod1, false, 'No imported credit in pay period 1');

    const allocAlice1 = allocateEarnerCredit(alice, mortgageAcc.id, 2026, 9, 1, fixture, fixture.dailyMatrix, { isLockedDay: false });
    assert.equal(allocAlice1.earnerDeposit, 689.42, 'Oct 1 projected credit is preserved');
  });

  it('LedgerView, getCalculatedBalanceAsOf, and getLedgerRunningBalanceAsOfDate return identical reg, extra, and total for every fixture date', () => {
    const fixtureDates = [
      '2026-09-01',
      '2026-09-15',
      '2026-09-25',
      '2026-09-29',
      '2026-09-30'
    ];

    [mortgageAcc, billsAcc].forEach(acc => {
      const ledgerRows = computeLedgerViewRows(acc, fixture, '2026-01-01', '2026-09-30', '2026-10-05');
      const rowMap = new Map(ledgerRows.map(r => [r.isoDate, r]));

      fixtureDates.forEach(isoDate => {
        const [y, m, d] = isoDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);

        const lvRow = rowMap.get(isoDate);
        assert.ok(lvRow, `LedgerView row exists for ${isoDate}`);

        const calcBal = computeCalculatedBalanceAsOf(acc, fixture, dateObj, '2026-10-05');
        const spBal = getLedgerRunningBalanceAsOfDate({
          targetAccountId: acc.id,
          targetDate: isoDate,
          metadataState: {
            accounts: fixture.accounts,
            people: fixture.people,
            bills: fixture.bills,
            fundingGoals: fixture.fundingGoals
          },
          dailyMatrix: fixture.dailyMatrix,
          transactions: fixture.transactions,
          detailed: true
        });

        // Verify identical reg
        assert.equal(
          lvRow.reg,
          calcBal.reg,
          `LedgerView vs getCalculatedBalanceAsOf reg mismatch on ${isoDate} (${acc.id})`
        );
        assert.equal(
          calcBal.reg,
          spBal.reg,
          `getCalculatedBalanceAsOf vs spreadsheet reg mismatch on ${isoDate} (${acc.id})`
        );

        // Verify identical extra
        assert.equal(
          lvRow.extra,
          calcBal.extra,
          `LedgerView vs getCalculatedBalanceAsOf extra mismatch on ${isoDate} (${acc.id})`
        );
        assert.equal(
          calcBal.extra,
          spBal.extra,
          `getCalculatedBalanceAsOf vs spreadsheet extra mismatch on ${isoDate} (${acc.id})`
        );

        // Verify identical total
        assert.equal(
          lvRow.total,
          calcBal.total,
          `LedgerView vs getCalculatedBalanceAsOf total mismatch on ${isoDate} (${acc.id})`
        );
        assert.equal(
          calcBal.total,
          spBal.total,
          `getCalculatedBalanceAsOf vs spreadsheet total mismatch on ${isoDate} (${acc.id})`
        );
      });
    });
  });

  it('all 365 projection dates of 2026 produce identical balances across all 3 engines for mortgage checking', () => {
    const ledgerRows = computeLedgerViewRows(mortgageAcc, fixture, '2026-01-01', '2026-12-31', '2026-10-05');
    const rowMap = new Map(ledgerRows.map(r => [r.isoDate, r]));

    let cur = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 31);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const d = cur.getDate();
      const isoDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      const lvRow = rowMap.get(isoDate);
      const calcBal = computeCalculatedBalanceAsOf(mortgageAcc, fixture, cur, '2026-10-05');
      const spBal = getLedgerRunningBalanceAsOfDate({
        targetAccountId: mortgageAcc.id,
        targetDate: isoDate,
        metadataState: {
          accounts: fixture.accounts,
          people: fixture.people,
          bills: fixture.bills,
          fundingGoals: fixture.fundingGoals
        },
        dailyMatrix: fixture.dailyMatrix,
        transactions: fixture.transactions,
        detailed: true
      });

      assert.equal(lvRow.reg, calcBal.reg, `Reg mismatch on ${isoDate}`);
      assert.equal(calcBal.reg, spBal.reg, `Reg mismatch on ${isoDate}`);
      assert.equal(lvRow.extra, calcBal.extra, `Extra mismatch on ${isoDate}`);
      assert.equal(calcBal.extra, spBal.extra, `Extra mismatch on ${isoDate}`);
      assert.equal(lvRow.total, calcBal.total, `Total mismatch on ${isoDate}`);
      assert.equal(calcBal.total, spBal.total, `Total mismatch on ${isoDate}`);

      cur.setDate(cur.getDate() + 1);
    }
  });
});
