import test from 'node:test';
import assert from 'node:assert/strict';

import { findMatchingBill } from '../src/utils/spreadsheetParser.js';
import { healHoaAndBillMappings, runBudgetMigrations, CURRENT_BUDGET_SCHEMA_VERSION } from '../src/migrations/budgetMigrations.js';

test('findMatchingBill prioritizes exact name match over loose keyword contains', () => {
  const bills = [
    { id: 'b-dues', name: 'HOA Dues Payment', accountId: 'acc-hoa' },
    { id: 'b-fee', name: 'HOA Payment Fee', accountId: 'acc-hoa' }
  ];

  // "HOA Payment Fee" should match "HOA Payment Fee" (b-fee), NOT the first bill with "hoa" (b-dues)
  const matched = findMatchingBill('HOA Payment Fee', '', bills);
  assert.equal(matched?.id, 'b-fee');

  // "HOA Dues Payment" should match "HOA Dues Payment"
  const matchedDues = findMatchingBill('HOA Dues Payment', '', bills);
  assert.equal(matchedDues?.id, 'b-dues');
});

test('V6: heals transaction bill mapping, matrix deductions, and 2025-12-31 to 2026-01-01 continuity', () => {
  const budget = {
    schemaVersion: 5,
    accounts: [{
      id: 'acc-hoa',
      name: 'USAA HOA Savings - 9575',
      startingBalance: 2374.21,
      extraStartingBalance: 638.82,
      startDate: '2025-12-31',
      importedLedgerRows: {
        '2025-12-31': { regBeg: 2374.21, extraBeg: 638.82, totalBeg: 3013.03, regEnding: 2374.21, extraEnding: 638.84, totalEnding: 3013.05 },
        '2026-01-01': { regBeg: 2177.21, extraBeg: 613.86, totalBeg: 2791.07, regEnding: 2177.21, extraEnding: 613.86, totalEnding: 2791.07 },
        '2026-01-07': { regEnding: 0, extraEnding: 437.12, totalEnding: 437.12, regBeg: 2177.21, extraBeg: 613.86, totalBeg: 2791.07 }
      }
    }],
    bills: [
      { id: 'b-dues', name: 'HOA Dues Payment', amount: 2350, dueDay: 15, accountId: 'acc-hoa' },
      { id: 'b-fee', name: 'HOA Payment Fee', amount: 3.95, dueDay: 15, accountId: 'acc-hoa' }
    ],
    transactions: [
      { id: 't-int', date: '2025-12-31', description: 'Interest Paid', amount: 0.02, accountId: 'acc-hoa' },
      { id: 't-dues', date: '2026-01-07', description: 'HOA Dues Payment', amount: -2350, accountId: 'acc-hoa', billId: 'b-dues' },
      // Erroneously assigned to b-dues originally:
      { id: 't-fee', date: '2026-01-07', description: 'HOA Payment Fee', amount: -3.95, accountId: 'acc-hoa', billId: 'b-dues' }
    ],
    dailyMatrix: {
      // Fee had overwritten dues in matrix:
      'acc-hoa_2026-01_7_bill_b-dues': 3.95
    }
  };

  const { budget: migrated, wasMigrated } = runBudgetMigrations(budget);
  assert.equal(wasMigrated, true);
  assert.equal(migrated.schemaVersion, CURRENT_BUDGET_SCHEMA_VERSION);

  // 1. Transaction bill re-association
  const feeTxn = migrated.transactions.find(t => t.id === 't-fee');
  assert.equal(feeTxn.billId, 'b-fee');

  // 2. Daily matrix alignment
  assert.equal(migrated.dailyMatrix['acc-hoa_2026-01_7_bill_b-dues'], 2350);
  assert.equal(migrated.dailyMatrix['acc-hoa_2026-01_7_bill_b-fee'], 3.95);

  // 3. 2025-12-31 to 2026-01-01 continuity
  const hoaAcc = migrated.accounts.find(a => a.id === 'acc-hoa');
  assert.equal(hoaAcc.startingBalance, 2374.21);
  assert.equal(hoaAcc.extraStartingBalance, 638.84);
  assert.equal(hoaAcc.importedLedgerRows['2025-12-31'].totalEnding, 3013.05);
  assert.equal(hoaAcc.importedLedgerRows['2026-01-01'].totalBeg, 3013.05);
});
