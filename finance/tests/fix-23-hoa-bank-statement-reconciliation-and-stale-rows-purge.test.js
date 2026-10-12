import test from 'node:test';
import assert from 'node:assert/strict';

import { runBudgetMigrations } from '../src/migrations/budgetMigrations.js';
import { getLedgerRunningBalanceAsOfDate } from '../src/utils/spreadsheet.js';

test('FIX-23: Migration V8 purges stale future importedLedgerRows and reconciles HOA account to $1,739.00 with zero diff', () => {
  // Simulate database state with 403 stale importedLedgerRows including phantom 1514.90 on 2026-10-10
  const staleRows = {
    '2025-12-31': { regEnding: 2374.21, extraEnding: 638.82, totalEnding: 3013.03 },
    '2026-09-30': { regEnding: 1188.27, extraEnding: 326.63, totalEnding: 1514.90 },
    '2026-10-04': { regEnding: 1188.27, extraEnding: 326.63, totalEnding: 1514.90 },
    '2026-10-10': { regEnding: 1188.27, extraEnding: 326.63, totalEnding: 1514.90 },
    '2027-02-06': { regEnding: 1500.00, extraEnding: 300.00, totalEnding: 1800.00 }
  };

  const budget = {
    schemaVersion: 7,
    accounts: [
      {
        id: 'acc-hoa',
        name: 'USAA HOA Savings',
        startingBalance: 2374.21,
        extraStartingBalance: 638.82,
        startDate: '2025-12-31',
        ledgerMode: 'manual',
        importedLedgerRows: staleRows,
        enabledEarners: ['p-jon', 'p-ronnie']
      }
    ],
    people: [
      { id: 'p-jon', name: 'Jon', deposit: 111, payDay1: 15, payDay2: 'last', payFrequency: 'semi-monthly' },
      { id: 'p-ronnie', name: 'Ronnie', deposit: 222, payDay1: 2, payDay2: 16, payFrequency: 'semi-monthly' }
    ],
    bills: [
      { id: 'b-dues', name: 'HOA Dues Payment', amount: 2350, dueDay: 15, accountId: 'acc-hoa' },
      { id: 'b-fee', name: 'HOA Payment Fee', amount: 3.95, dueDay: 15, accountId: 'acc-hoa' }
    ],
    dailyMatrix: {
      'acc-hoa_2026-10_14_credit_p-jon': 110.58,
      'acc-hoa_2026-10_18_credit_p-ronnie': 221.16
    },
    transactions: [
      { id: 't-old-1', accountId: 'acc-hoa', date: '2026-10-14', amount: 98.08, description: 'Jon Credit' }
    ]
  };

  const { budget: migrated, wasMigrated } = runBudgetMigrations(budget);
  assert.equal(wasMigrated, true);
  assert.equal(migrated.schemaVersion, 8);

  const hoa = migrated.accounts.find(a => a.id === 'acc-hoa');
  assert.ok(hoa);
  assert.equal(hoa.startingBalance, 2374.21);
  assert.equal(hoa.extraStartingBalance, 638.84);
  assert.equal(hoa.ledgerMode, 'import');

  // Verify stale future rows (like 2026-10-10: 1514.90, 2027-02-06: 1800.00) are purged
  assert.equal(hoa.importedLedgerRows['2026-10-10'], undefined);
  assert.equal(hoa.importedLedgerRows['2027-02-06'], undefined);
  assert.equal(hoa.importedLedgerRows['2026-10-04'], undefined);

  // Verify authentic statement ending checkpoints
  assert.equal(hoa.importedLedgerRows['2025-12-31']?.totalEnding, 3013.05);
  assert.equal(hoa.importedLedgerRows['2026-01-07']?.totalEnding, 659.10);
  assert.equal(hoa.importedLedgerRows['2026-09-30']?.totalEnding, 1406.00);
  assert.equal(hoa.importedLedgerRows['2026-10-01']?.totalEnding, 1739.00);

  // Verify running balance calculation on 2026-10-01 and 2026-10-10
  const balOct01 = getLedgerRunningBalanceAsOfDate({
    targetAccountId: 'acc-hoa',
    targetDate: '2026-10-01',
    metadataState: migrated,
    dailyMatrix: migrated.dailyMatrix,
    transactions: migrated.transactions,
    detailed: true
  });
  assert.equal(Math.round(balOct01.totalEnd * 100) / 100, 1739.00);

  const balOct10 = getLedgerRunningBalanceAsOfDate({
    targetAccountId: 'acc-hoa',
    targetDate: '2026-10-10',
    metadataState: migrated,
    dailyMatrix: migrated.dailyMatrix,
    transactions: migrated.transactions,
    detailed: true
  });
  assert.equal(Math.round(balOct10.totalEnd * 100) / 100, 1739.00);

  // Check variance comparison on 2026-10-01: exactly matches statement 1739.00
  const statementOct01 = hoa.importedLedgerRows['2026-10-01'].totalEnding;
  assert.equal(Math.abs(balOct01.totalEnd - statementOct01) < 0.001, true);

  // Check on 2026-10-10: no ghost row exists, so bank diff text is never shown
  assert.equal(hoa.importedLedgerRows['2026-10-10'], undefined);
});
