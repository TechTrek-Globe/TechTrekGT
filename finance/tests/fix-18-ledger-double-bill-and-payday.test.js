import test from 'node:test';
import assert from 'node:assert/strict';

import { processSpreadsheetImport } from '../src/utils/spreadsheet.js';
import { pruneOrphanedMatrixKeys, healShiftedLedgerRowsAndAlignMatrix } from '../src/migrations/budgetMigrations.js';

test('FIX-18: Imported bill matching 2x expected amount is preserved exactly and not halved', () => {
  const account = { id: 'acc-1', name: 'Checking', type: 'checking', enableExtraSavings: false, startingBalance: 1000 };
  const gymBill = { id: 'b-gym', name: 'Gym Membership', amount: 44.99, accountId: 'acc-1', dueDay: 17 };
  const budget = { accounts: [account], people: [], bills: [gymBill], fundingGoals: [] };

  const incomingTransactions = [
    { id: 'tx-gym', date: '2026-09-17', description: 'Gym Membership', amount: -89.98, accountId: 'acc-1' }
  ];

  const result = processSpreadsheetImport({
    namespaces: { transactions: true },
    strategies: { transactions: 'override' },
    data: { transactions: incomingTransactions, targetAccountId: 'acc-1', accounts: budget.accounts, people: [] },
    metadataState: budget,
    dailyMatrix: {},
    transactions: [],
    dryRun: false
  });

  assert.ok(result.success);
  // Matrix cell for 2026-09-17 bill b-gym must reflect the full 89.98 amount, NOT 44.99
  const cellVal = result.dailyMatrix['acc-1_2026-09_17_bill_b-gym'];
  assert.strictEqual(cellVal, 89.98, 'Imported bill amount must be preserved as 89.98 without halving');
});

test('FIX-18: pruneOrphanedMatrixKeys cleans up keys from deleted bills, people, and accounts', () => {
  const accounts = [{ id: 'acc-1' }];
  const bills = [{ id: 'b-1' }];
  const people = [{ id: 'p-1' }];

  const matrix = {
    'acc-1_2026-09_17_bill_b-1': 50,
    'acc-1_2026-09_17_bill_b-deleted': 44.99,
    'acc-1_2026-09_15_credit_p-1': 1000,
    'acc-1_2026-09_15_credit_p-deleted': 1200,
    'acc-deleted_2026-09_1_other_amount': 25,
    'acc-1_2026-09_5_other_amount': 30
  };

  const { cleanedMatrix: pruned } = pruneOrphanedMatrixKeys(matrix, { accounts, bills, people });

  assert.strictEqual(pruned['acc-1_2026-09_17_bill_b-1'], 50);
  assert.strictEqual(pruned['acc-1_2026-09_15_credit_p-1'], 1000);
  assert.strictEqual(pruned['acc-1_2026-09_5_other_amount'], 30);
  assert.strictEqual(pruned['acc-1_2026-09_17_bill_b-deleted'], undefined, 'Deleted bill key must be pruned');
  assert.strictEqual(pruned['acc-1_2026-09_15_credit_p-deleted'], undefined, 'Deleted person key must be pruned');
  assert.strictEqual(pruned['acc-deleted_2026-09_1_other_amount'], undefined, 'Deleted account key must be pruned');
});

test('FIX-18: healShiftedLedgerRowsAndAlignMatrix aligns matrix bill cells to transactions and preserves statement rows', () => {
  const budget = {
    accounts: [
      {
        id: 'acc-1',
        importedLedgerRows: {
          '2026-09-17': { regEnding: 308.65, totalEnding: 308.65 }
        }
      }
    ],
    bills: [
      { id: 'b-gym', name: 'Gym', amount: 44.99, accountId: 'acc-1', dueDay: 15 }
    ],
    transactions: [
      { id: 'tx-1', date: '2026-09-17', amount: -89.98, billId: 'b-gym', accountId: 'acc-1' }
    ],
    dailyMatrix: {
      'acc-1_2026-09_15_bill_b-gym': 44.99
    }
  };

  const { budget: healed, modifiedCount } = healShiftedLedgerRowsAndAlignMatrix(budget);
  assert.ok(modifiedCount > 0);
  // Matrix cell for 2026-09-17 reflects transaction actual amount 89.98
  assert.strictEqual(healed.dailyMatrix['acc-1_2026-09_17_bill_b-gym'], 89.98);
  // Alternate scheduled day is zeroed out
  assert.strictEqual(healed.dailyMatrix['acc-1_2026-09_15_bill_b-gym'], 0);
  // Bank statement row is preserved untouched as 308.65
  assert.strictEqual(healed.accounts[0].importedLedgerRows['2026-09-17'].totalEnding, 308.65);
});

test('FIX-18: OVERRIDE transactions replaces importedLedgerRows and purges stale statement rows', () => {
  const account = {
    id: 'acc-1',
    name: 'Checking',
    importedLedgerRows: {
      '2026-09-17': { totalEnding: 308.65 },
      '2026-09-18': { totalEnding: 308.65 }
    }
  };
  const budget = { accounts: [account], people: [], bills: [], fundingGoals: [] };

  const incomingTransactions = [
    { id: 'tx-1', date: '2026-09-17', description: 'Bank of America', amount: -44.99, accountId: 'acc-1' }
  ];

  const result = processSpreadsheetImport({
    namespaces: { transactions: true },
    strategies: { transactions: 'override' },
    data: { transactions: incomingTransactions, targetAccountId: 'acc-1', accounts: budget.accounts, people: [] },
    metadataState: budget,
    dailyMatrix: {},
    transactions: [],
    dryRun: false
  });

  assert.ok(result.success);
  const updatedAcc = result.metadataState.accounts.find(a => a.id === 'acc-1');
  // Stale 308.65 balances must be purged on override since incoming transactions have no statement balance column
  assert.deepStrictEqual(updatedAcc.importedLedgerRows, {});
});
