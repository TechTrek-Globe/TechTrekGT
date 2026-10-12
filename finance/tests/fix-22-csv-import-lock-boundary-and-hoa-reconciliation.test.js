import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSingleSheet, findMatchingBill } from '../src/utils/spreadsheetParser.js';
import { processSpreadsheetImport, getLedgerRunningBalanceAsOfDate } from '../src/utils/spreadsheet.js';
import { runBudgetMigrations, CURRENT_BUDGET_SCHEMA_VERSION } from '../src/migrations/budgetMigrations.js';

test('FIX-22: Full bank CSV override reconciles HOA account running balance to $1,739.00 as of today', () => {
  const budget = {
    accounts: [
      { id: 'acc-hoa', name: 'USAA HOA Savings', startingBalance: 2374.21, extraStartingBalance: 638.84, startDate: '2025-12-31', ledgerMode: 'import', enabledEarners: ['p-jon', 'p-ronnie'] }
    ],
    people: [
      { id: 'p-jon', name: 'Jon', deposit: 111, payDay1: 15, payDay2: 'last', payFrequency: 'semi-monthly' },
      { id: 'p-ronnie', name: 'Ronnie', deposit: 222, payDay1: 2, payDay2: 16, payFrequency: 'semi-monthly' }
    ],
    bills: [
      { id: 'b-hoa', name: 'HOA Dues Payment', amount: 2350, dueDay: 15, accountId: 'acc-hoa' },
      { id: 'b-fee', name: 'HOA Payment Fee', amount: 3.95, dueDay: 15, accountId: 'acc-hoa' }
    ],
    dailyMatrix: {},
    transactions: []
  };

  const csvRows = [
    { date: '2026-10-01', description: 'USAA Transfer', amount: 222.00, accountId: 'acc-hoa' },
    { date: '2026-10-01', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-09-30', description: 'Interest Paid', amount: 0.01, accountId: 'acc-hoa' },
    { date: '2026-09-14', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-08-31', description: 'Interest Paid', amount: 0.01, accountId: 'acc-hoa' },
    { date: '2026-08-31', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-08-18', description: 'USAA Transfer', amount: 221.16, accountId: 'acc-hoa' },
    { date: '2026-08-17', description: 'USAA Transfer', amount: 110.58, accountId: 'acc-hoa' },
    { date: '2026-08-03', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-07-31', description: 'Interest Paid', amount: 0.01, accountId: 'acc-hoa' },
    { date: '2026-07-27', description: 'USAA Transfer', amount: 222.00, accountId: 'acc-hoa' },
    { date: '2026-07-16', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-07-08', description: 'Emory Parc Homeo Onlinepay', amount: -2350.00, accountId: 'acc-hoa' },
    { date: '2026-07-08', description: 'HOA eCheck Payment Fee', amount: -3.95, accountId: 'acc-hoa' },
    { date: '2026-07-01', description: 'USAA Transfer', amount: 325.63, accountId: 'acc-hoa' },
    { date: '2026-06-30', description: 'Interest Paid', amount: 0.02, accountId: 'acc-hoa' },
    { date: '2026-06-29', description: 'USAA Credit Card', amount: -325.63, accountId: 'acc-hoa' },
    { date: '2026-06-29', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-06-22', description: 'USAA Transfer', amount: 222.00, accountId: 'acc-hoa' },
    { date: '2026-06-15', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-05-29', description: 'Interest Paid', amount: 0.02, accountId: 'acc-hoa' },
    { date: '2026-05-27', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-05-18', description: 'USAA Transfer', amount: 222.00, accountId: 'acc-hoa' },
    { date: '2026-05-18', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-04-30', description: 'Interest Paid', amount: 0.01, accountId: 'acc-hoa' },
    { date: '2026-04-29', description: 'USAA Transfer', amount: 222.00, accountId: 'acc-hoa' },
    { date: '2026-04-29', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-04-14', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-04-13', description: 'Citi Credit Card Payment', amount: -561.00, accountId: 'acc-hoa' },
    { date: '2026-03-31', description: 'Interest Paid', amount: 0.01, accountId: 'acc-hoa' },
    { date: '2026-03-27', description: 'USAA Transfer', amount: 222.00, accountId: 'acc-hoa' },
    { date: '2026-03-27', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-03-12', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-02-27', description: 'Interest Paid', amount: 0.01, accountId: 'acc-hoa' },
    { date: '2026-02-26', description: 'USAA Transfer', amount: 222.00, accountId: 'acc-hoa' },
    { date: '2026-02-26', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-02-13', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-02-02', description: 'USAA Transfer', amount: 222.00, accountId: 'acc-hoa' },
    { date: '2026-02-02', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-01-30', description: 'Interest Paid', amount: 0.01, accountId: 'acc-hoa' },
    { date: '2026-01-15', description: 'USAA Transfer', amount: 111.00, accountId: 'acc-hoa' },
    { date: '2026-01-07', description: 'Emory Parc Homeo Onlinepay', amount: -2350.00, accountId: 'acc-hoa' },
    { date: '2026-01-07', description: 'HOA eCheck Payment Fee', amount: -3.95, accountId: 'acc-hoa' }
  ];

  const res = processSpreadsheetImport({
    namespaces: { transactions: true },
    strategies: { transactions: 'override' },
    data: {
      targetAccountId: 'acc-hoa',
      transactions: csvRows
    },
    metadataState: budget,
    dailyMatrix: budget.dailyMatrix,
    transactions: budget.transactions
  });

  assert.equal(res.success, true);
  assert.equal(res.transactions.length, 43);

  const balToday = getLedgerRunningBalanceAsOfDate({
    targetAccountId: 'acc-hoa',
    targetDate: '2026-10-10',
    metadataState: res.metadataState,
    dailyMatrix: res.dailyMatrix,
    transactions: res.transactions,
    detailed: true
  });

  // True starting balance: 3013.05 (2374.21 reg + 638.84 extra on 2025-12-31). Net flow of 43 transactions: -1274.05.
  // Running balance as of today must equal exactly 1739.00, matching bank ledger!
  assert.equal(Math.round(balToday.totalEnd * 100) / 100, 1739.00);
});

test('FIX-22: getLedgerRunningBalanceAsOfDate locks past days when transactions exist even without balance columns', () => {
  const metadataState = {
    accounts: [{
      id: 'acc-hoa',
      name: 'USAA HOA Savings',
      startingBalance: 2374.21,
      extraStartingBalance: 638.84,
      startDate: '2025-12-31',
      enabledEarners: ['p-jon', 'p-ronnie'],
      importedLedgerRows: {} // No running balance column in CSV
    }],
    people: [
      { id: 'p-jon', name: 'Jon', deposit: 111, payDay1: 15, payDay2: 'last', payFrequency: 'semi-monthly' },
      { id: 'p-ronnie', name: 'Ronnie', deposit: 222, payDay1: 2, payDay2: 16, payFrequency: 'semi-monthly' }
    ],
    bills: [
      { id: 'b-hoa', name: 'HOA Dues Payment', amount: 2350, dueDay: 15, accountId: 'acc-hoa' },
      { id: 'b-fee', name: 'HOA Payment Fee', amount: 3.95, dueDay: 15, accountId: 'acc-hoa' }
    ]
  };

  const transactions = [
    { id: 't-1', date: '2026-01-07', amount: -2350, accountId: 'acc-hoa', billId: 'b-hoa' },
    { id: 't-2', date: '2026-01-07', amount: -3.95, accountId: 'acc-hoa', billId: 'b-fee' },
    { id: 't-3', date: '2026-01-15', amount: 111, accountId: 'acc-hoa', personId: 'p-jon' },
    { id: 't-4', date: '2026-01-30', amount: 0.01, accountId: 'acc-hoa' }
  ];

  const dailyMatrix = {
    'acc-hoa_2026-01_7_bill_b-hoa': 2350,
    'acc-hoa_2026-01_7_bill_b-fee': 3.95,
    'acc-hoa_2026-01_15_credit_p-jon': 111,
    'acc-hoa_2026-01_30_other_credit_amount': 0.01
  };

  const balJan31 = getLedgerRunningBalanceAsOfDate({
    targetAccountId: 'acc-hoa',
    targetDate: '2026-01-31',
    metadataState,
    dailyMatrix,
    transactions,
    detailed: true
  });

  // Starting: 3013.05. Debits: -2353.95. Deposits: +111.01.
  // Net cash flow = -2242.94.
  // Expected ending: 3013.05 - 2242.94 = 770.11 (matching bank ledger on Jan 30!).
  // Because past days are locked up to max txn date (2026-01-30), Ronnie's scheduled paydays (222 + 222) MUST NOT be added!
  assert.equal(Math.round(balJan31.totalEnd * 100) / 100, 770.11);
});

test('FIX-22: Migration V7 heals HOA starting balance, ledgerMode, and aligns bill matrix', () => {
  const budget = {
    schemaVersion: 6,
    accounts: [{
      id: 'acc-hoa',
      name: 'USAA HOA Savings',
      startingBalance: 2177.21,
      extraStartingBalance: 613.86,
      startDate: '2026-01-01',
      ledgerMode: 'project',
      importedLedgerRows: {}
    }],
    bills: [
      { id: 'b-dues', name: 'HOA Dues Payment', amount: 2350, dueDay: 15, accountId: 'acc-hoa' },
      { id: 'b-fee', name: 'HOA Payment Fee', amount: 3.95, dueDay: 15, accountId: 'acc-hoa' }
    ],
    transactions: [
      { id: 't-1', date: '2026-01-07', description: 'Emory Parc Homeo Onlinepay', amount: -2350, accountId: 'acc-hoa', billId: null },
      { id: 't-2', date: '2026-01-07', description: 'HOA eCheck Payment Fee', amount: -3.95, accountId: 'acc-hoa', billId: null }
    ],
    dailyMatrix: {}
  };

  const { budget: migrated, wasMigrated } = runBudgetMigrations(budget);
  assert.equal(wasMigrated, true);
  assert.equal(migrated.schemaVersion, CURRENT_BUDGET_SCHEMA_VERSION);

  const acc = migrated.accounts.find(a => a.id === 'acc-hoa');
  assert.equal(acc.startingBalance, 2374.21);
  assert.equal(acc.extraStartingBalance, 638.84);
  assert.equal(acc.startDate, '2025-12-31');
  assert.equal(acc.ledgerMode, 'import');

  // Transactions mapped to correct bills
  const t1 = migrated.transactions.find(t => t.id === 't-1');
  const t2 = migrated.transactions.find(t => t.id === 't-2');
  assert.equal(t1.billId, 'b-dues');
  assert.equal(t2.billId, 'b-fee');

  // Matrix cells aligned
  assert.equal(migrated.dailyMatrix['acc-hoa_2026-01_7_bill_b-dues'], 2350);
  assert.equal(migrated.dailyMatrix['acc-hoa_2026-01_7_bill_b-fee'], 3.95);
});
