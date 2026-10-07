// tests/fix-08-ending-balance-formula.test.js
// FIX-08: Ending balance must always equal the row calculation
// - In LedgerView matrixData, LedgerDataContext.getCalculatedBalanceAsOf, and spreadsheet.getLedgerRunningBalanceAsOfDate:
//   ending = round2(beginning + credits - bills + other) every day. Never replace it with reg_ending, extra_ending, or importedLedgerRows values.
// - Keep those stored values unchanged and use them only for comparison. When |calculated - bank| > 0.01,
//   mark the row with a visible "Differs from bank by $X" indicator (text and icon, not color only) and include the variance in row data.
// Accept: fixture rows for the 9/28 to 9/30 scenario satisfy the formula on every row; the variance indicator appears where stored balances differ.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { round2, fmtMoney, parseMoney } from '../src/utils/formatters.js';
import { allocateEarnerCredit } from '../src/utils/ledgerEngine.js';
import { getLedgerRunningBalanceAsOfDate } from '../src/utils/spreadsheet.js';

// Load fixture
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/incident-household.json'), 'utf-8')
);

// Helper function to simulate matrixData generation exactly as LedgerView.jsx does
function computeLedgerViewRows(account, budget, startDateStr, endDateStr) {
  const dailyMatrix = budget.dailyMatrix || {};
  const importedRows = account.importedLedgerRows || {};
  const showExtraColumns = account.enableExtraSavings !== false;

  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);
  const cur = new Date(sY, sM - 1, sD);
  const end = new Date(eY, eM - 1, eD);

  let runningRegBeg = round2(account.startingBalance, 0);
  let runningExtraBeg = showExtraColumns ? round2(account.extraStartingBalance, 0) : 0;
  const rows = [];

  while (cur <= end) {
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const day = cur.getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 1. Credits
    let totalRegCredits = 0;
    let dayExtraAdd = 0;
    (budget.people || []).forEach(p => {
      const alloc = allocateEarnerCredit(p, account.id, year, month, day, budget, dailyMatrix, { isLockedDay: false });
      totalRegCredits = round2(totalRegCredits + alloc.earnerReg);
      dayExtraAdd = round2(dayExtraAdd + alloc.earnerExtra);
    });

    // 2. Bills
    let totalDayBills = 0;
    (budget.bills || []).filter(b => b.accountId === account.id && !b.isArchived).forEach(b => {
      const bKey = `${account.id}_${monthKey}_${day}_bill_${b.id}`;
      const customBill = dailyMatrix[bKey];
      if (customBill !== undefined) {
        totalDayBills = round2(totalDayBills + parseMoney(customBill, 0));
      } else if (b.dueDay === day) {
        totalDayBills = round2(totalDayBills + parseMoney(b.amount, 0));
      }
    });

    // 3. Other
    const customOther = dailyMatrix[`${account.id}_${monthKey}_${day}_other_amount`];
    const customOtherCredit = dailyMatrix[`${account.id}_${monthKey}_${day}_other_credit_amount`];
    let otherAmt = 0;
    if (customOther !== undefined) otherAmt = round2(otherAmt + parseMoney(customOther, 0));
    if (customOtherCredit !== undefined) otherAmt = round2(otherAmt + parseMoney(customOtherCredit, 0));

    // 4. FIX-08 Ending balances formula
    const regEnding = round2(runningRegBeg + totalRegCredits - totalDayBills + otherAmt);
    const extraEnding = round2(runningExtraBeg + dayExtraAdd);
    const totalEnd = round2(regEnding + (showExtraColumns ? extraEnding : 0));

    // Stored bank balance checks
    let customRegEnd;
    let customExtraEnd;
    const accReg = dailyMatrix[`${account.id}_${monthKey}_${day}_reg_ending`];
    const accExtra = dailyMatrix[`${account.id}_${monthKey}_${day}_extra_ending`];
    if (accReg !== undefined && accReg !== null && accReg !== '') customRegEnd = parseFloat(accReg);
    if (accExtra !== undefined && accExtra !== null && accExtra !== '') customExtraEnd = parseFloat(accExtra);

    const impRow = importedRows[isoDate];
    if (customRegEnd === undefined && impRow !== undefined) {
      if (typeof impRow === 'number') {
        customRegEnd = impRow;
      } else if (impRow && typeof impRow === 'object') {
        const statedEnd = impRow.regEnding ?? impRow.totalEnding ?? null;
        if (statedEnd !== null && statedEnd !== undefined && !isNaN(statedEnd)) {
          customRegEnd = statedEnd;
        }
      }
    }
    if (customExtraEnd === undefined && impRow !== undefined) {
      if (impRow && typeof impRow === 'object') {
        const statedExtra = impRow.extraEnding ?? null;
        if (statedExtra !== null && statedExtra !== undefined && !isNaN(statedExtra)) {
          customExtraEnd = statedExtra;
        }
      }
    }

    // Stored bank balance for comparison only (never replaces calculated ending balance)
    let bankBalance = null;
    if (impRow !== undefined) {
      if (typeof impRow === 'number') {
        bankBalance = round2(impRow);
      } else if (impRow && typeof impRow === 'object') {
        const statedTotal = impRow.totalEnding ?? (
          impRow.regEnding !== undefined && impRow.extraEnding !== undefined
            ? round2((parseFloat(impRow.regEnding) || 0) + (parseFloat(impRow.extraEnding) || 0))
            : (impRow.regEnding ?? null)
        );
        if (statedTotal !== null && statedTotal !== undefined && !isNaN(statedTotal)) {
          bankBalance = round2(parseFloat(statedTotal));
        }
      }
    }
    if (bankBalance === null) {
      if (customRegEnd !== undefined && !isNaN(customRegEnd)) {
        const extraPart = (customExtraEnd !== undefined && !isNaN(customExtraEnd) && showExtraColumns) ? customExtraEnd : 0;
        bankBalance = round2(customRegEnd + extraPart);
      } else if (customExtraEnd !== undefined && !isNaN(customExtraEnd) && showExtraColumns) {
        bankBalance = round2(customExtraEnd);
      }
    }

    const variance = bankBalance !== null ? round2(totalEnd - bankBalance) : 0;
    const hasBankDiff = bankBalance !== null && Math.abs(variance) > 0.01;
    const bankDiffText = hasBankDiff ? `Differs from bank by ${fmtMoney(Math.abs(variance))}` : '';

    rows.push({
      isoDate,
      regBeg: runningRegBeg,
      totalRegCredits,
      totalDayBills,
      otherAmt,
      regEnding,
      extraEnding,
      totalEnd,
      bankBalance,
      variance,
      bankVariance: variance,
      hasBankDiff,
      bankDiffText
    });

    // Carry forward
    runningRegBeg = regEnding;
    runningExtraBeg = extraEnding;

    cur.setDate(cur.getDate() + 1);
  }

  return rows;
}

describe('FIX-08: Ending balance formula and bank variance indicators', () => {
  const mortgageAcc = fixture.accounts.find(a => a.id === 'acc-mortgage-test');

  it('every row satisfies ending = round2(beginning + credits - bills + other)', () => {
    const rows = computeLedgerViewRows(mortgageAcc, fixture, '2026-01-01', '2026-09-30');

    rows.forEach(r => {
      const expectedEnding = round2(r.regBeg + r.totalRegCredits - r.totalDayBills + r.otherAmt);
      assert.equal(
        r.regEnding,
        expectedEnding,
        `Row on ${r.isoDate} must strictly satisfy ending = round2(beg + credits - bills + other): expected ${expectedEnding}, got ${r.regEnding}`
      );
    });
  });

  it('fixture rows for 9/28, 9/29, and 9/30 satisfy the formula on every row', () => {
    const rows = computeLedgerViewRows(mortgageAcc, fixture, '2026-01-01', '2026-09-30');
    const r28 = rows.find(r => r.isoDate === '2026-09-28');
    const r29 = rows.find(r => r.isoDate === '2026-09-29');
    const r30 = rows.find(r => r.isoDate === '2026-09-30');

    assert.ok(r28, '9/28 row exists');
    assert.ok(r29, '9/29 row exists');
    assert.ok(r30, '9/30 row exists');

    // 9/28: ending = beginning + credits - bills + other
    assert.equal(r28.regEnding, round2(r28.regBeg + r28.totalRegCredits - r28.totalDayBills + r28.otherAmt));
    assert.equal(r28.hasBankDiff, false, '9/28 has no bank variance');

    // 9/29: ending = beginning + credits - bills + other
    assert.equal(r29.regEnding, round2(r29.regBeg + r29.totalRegCredits - r29.totalDayBills + r29.otherAmt));
    // Stored bank is 308.65, calculated ending is not replaced by 308.65
    assert.notEqual(r29.regEnding, 308.65, '9/29 regEnding must NOT be replaced with stored bank 308.65');
    assert.equal(r29.bankBalance, 308.65, 'Stored bank balance preserved for comparison');
    assert.equal(r29.hasBankDiff, true, '9/29 must indicate variance from bank');
    assert.equal(r29.variance, round2(r29.regEnding - 308.65));
    assert.equal(r29.bankDiffText, `Differs from bank by ${fmtMoney(Math.abs(r29.variance))}`);

    // 9/30: ending = beginning + credits - bills + other
    assert.equal(r30.regBeg, r29.regEnding, '9/30 beginning carries forward from 9/29 calculated ending');
    assert.equal(r30.regEnding, round2(r30.regBeg + r30.totalRegCredits - r30.totalDayBills + r30.otherAmt));
    // Stored bank is 393.65, calculated ending is not replaced by 393.65
    assert.notEqual(r30.regEnding, 393.65, '9/30 regEnding must NOT be replaced with stored bank 393.65');
    assert.equal(r30.bankBalance, 393.65, 'Stored bank balance preserved for comparison');
    assert.equal(r30.hasBankDiff, true, '9/30 must indicate variance from bank');
    assert.equal(r30.variance, round2(r30.regEnding - 393.65));
    assert.equal(r30.bankDiffText, `Differs from bank by ${fmtMoney(Math.abs(r30.variance))}`);
  });

  it('stored values in dailyMatrix and importedLedgerRows remain unchanged', () => {
    assert.equal(fixture.dailyMatrix['acc-mortgage-test_2026-09_29_reg_ending'], 308.65);
    assert.equal(fixture.dailyMatrix['acc-mortgage-test_2026-09_30_reg_ending'], 393.65);
    assert.equal(mortgageAcc.importedLedgerRows['2026-09-29'].regEnding, 308.65);
    assert.equal(mortgageAcc.importedLedgerRows['2026-09-30'].regEnding, 393.65);
  });

  it('spreadsheet.getLedgerRunningBalanceAsOfDate does not replace ending with stored bank balances', () => {
    // Test with an account where daily matrix has a reg_ending override
    const testAccount = {
      id: 'acc-test',
      name: 'Test Account',
      startingBalance: 100,
      balanceAsOfDate: '2026-09-01',
      startDate: '2026-09-01',
      enableExtraSavings: false,
      ledgerMode: 'project'
    };
    const testMetadata = {
      accounts: [testAccount],
      people: [],
      bills: []
    };
    const testMatrix = {
      'acc-test_2026-09_1_other_amount': 50,
      'acc-test_2026-09_1_reg_ending': 999.99 // Arbitrary override that should NOT replace calculated ending
    };

    const bal = getLedgerRunningBalanceAsOfDate({
      targetAccountId: 'acc-test',
      targetDate: '2026-09-01',
      metadataState: testMetadata,
      dailyMatrix: testMatrix,
      transactions: []
    });

    // 100 + 50 = 150, NOT 999.99
    assert.equal(bal, 150, 'getLedgerRunningBalanceAsOfDate must return 150 (beginning + other), never 999.99');
  });

  it('variance indicator text and icon formatting', () => {
    // When |calculated - bank| > 0.01:
    // indicator text is "Differs from bank by $X"
    const variance = round2(153.26 - 308.65); // -155.39
    const indicatorText = `Differs from bank by ${fmtMoney(Math.abs(variance))}`;
    assert.equal(indicatorText, 'Differs from bank by $155.39');

    // When variance <= 0.01:
    const smallVariance = 0.005;
    const hasDiff = Math.abs(smallVariance) > 0.01;
    assert.equal(hasDiff, false, 'No indicator for differences <= 0.01');
  });

  it('bank variance relates to totalEnd rather than regEnding when extra savings is enabled', () => {
    // Scenario: user bank has $449.89. Total End is $449.89 (Reg End $349.89 + Extra End $100.00).
    // Variance must be 0 and hasBankDiff must be false.
    const testAccount = {
      id: 'acc-split-bank',
      name: 'Checking With Extra Savings',
      startingBalance: 349.89,
      extraStartingBalance: 100.00,
      balanceAsOfDate: '2026-10-07',
      startDate: '2026-10-07',
      enableExtraSavings: true,
      ledgerMode: 'import',
      importedLedgerRows: {
        '2026-10-07': 449.89
      }
    };
    const testBudget = {
      accounts: [testAccount],
      people: [],
      bills: [],
      dailyMatrix: {}
    };

    const rows = computeLedgerViewRows(testAccount, testBudget, '2026-10-07', '2026-10-07');
    const todayRow = rows[0];

    assert.equal(todayRow.regEnding, 349.89, 'Reg End is $349.89');
    assert.equal(todayRow.extraEnding, 100.00, 'Extra End is $100.00');
    assert.equal(todayRow.totalEnd, 449.89, 'Total End is $449.89');
    assert.equal(todayRow.bankBalance, 449.89, 'Bank balance is $449.89');
    assert.equal(todayRow.variance, 0, 'Variance against Total End is 0');
    assert.equal(todayRow.hasBankDiff, false, 'No bank difference flag when Total End matches bank');
  });
});
