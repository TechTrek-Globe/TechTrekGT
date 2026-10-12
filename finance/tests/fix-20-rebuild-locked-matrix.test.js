import test from 'node:test';
import assert from 'node:assert/strict';

import { getLedgerRunningBalanceAsOfDate } from '../src/utils/spreadsheet.js';
import { rebuildLockedMatrixFromTransactions } from '../src/migrations/budgetMigrations.js';

test('V5: rebuilds stale locked matrix cells from transactions so the ledger matches the bank statement', () => {
  const acc = {
    id: 'acc-1',
    startingBalance: 1000,
    startDate: '2026-01-01',
    enableExtraSavings: false,
    importedLedgerRows: {
      '2026-01-01': { totalEnding: 1000 },
      '2026-01-10': { totalEnding: 910 },
      '2026-01-11': { totalEnding: 910 }
    }
  };
  const budget = {
    accounts: [acc],
    people: [],
    bills: [{ id: 'b-1', name: 'Gym', amount: 50, accountId: 'acc-1', dueDay: 12 }],
    transactions: [{ id: 't1', date: '2026-01-10', description: 'Gym', amount: -90, accountId: 'acc-1', billId: 'b-1' }],
    dailyMatrix: { 'acc-1_2026-01_12_bill_b-1': 50, 'acc-1_2026-01_9_other_amount': -30 }
  };

  const calc = (m) => getLedgerRunningBalanceAsOfDate({
    targetAccountId: 'acc-1', targetDate: '2026-01-11', metadataState: budget, dailyMatrix: m, transactions: budget.transactions
  });
  assert.notEqual(calc(budget.dailyMatrix), 910);

  const { budget: healed, modifiedCount } = rebuildLockedMatrixFromTransactions(budget);
  assert.equal(modifiedCount, 1);
  assert.equal(healed.dailyMatrix['acc-1_2026-01_10_bill_b-1'], 90);
  assert.equal(healed.dailyMatrix['acc-1_2026-01_9_other_amount'], undefined);
  assert.equal(calc(healed.dailyMatrix), 910);
  assert.equal(healed.accounts[0].importedLedgerRows['2026-01-10'].totalEnding, 910);
});

test('V5: leaves an account untouched when rebuilding would not improve reconciliation', () => {
  const budget = {
    accounts: [{
      id: 'acc-1', startingBalance: 500, startDate: '2026-01-01', enableExtraSavings: false,
      importedLedgerRows: { '2026-01-05': { totalEnding: 500 } }
    }],
    people: [],
    bills: [],
    transactions: [{ id: 't1', date: '2026-01-03', description: 'Unknown', amount: -25, accountId: 'acc-1' }],
    dailyMatrix: {}
  };
  const { modifiedCount } = rebuildLockedMatrixFromTransactions(budget);
  assert.equal(modifiedCount, 0);
});
