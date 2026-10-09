import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectTransactionConflicts,
  mergeTransactions
} from '../src/utils/importer.js';
import {
  processSpreadsheetImport,
  getLedgerRunningBalanceAsOfDate
} from '../src/utils/spreadsheet.js';
import { round2 } from '../src/utils/formatters.js';

// ============================================================
// FIX-17: Merge matches bank transactions & Override clears grid
// ============================================================

const account = { id: 'acc-1', name: 'Checking', type: 'checking', enableExtraSavings: false, startingBalance: 1000, extraStartingBalance: 0 };
const budget = { accounts: [account], people: [], bills: [], fundingGoals: [] };

function runImport({ transactions, strategy = 'merge', existingTransactions = [], dailyMatrix = {}, metadataState = budget }) {
  return processSpreadsheetImport({
    namespaces: { transactions: true },
    strategies: { transactions: strategy },
    data: { transactions, targetAccountId: 'acc-1', accounts: budget.accounts, people: [] },
    metadataState,
    dailyMatrix,
    transactions: existingTransactions,
    dryRun: false
  });
}

test('MERGE: same logical txn (desc match) with shifted payment date updates the date, does NOT duplicate', () => {
  const existing = [
    { id: 'e1', date: '2026-09-15', description: 'Netflix', amount: -15.99, accountId: 'acc-1' }
  ];
  const incoming = [
    { id: 'i1', date: '2026-09-18', description: 'Netflix', amount: -15.99, accountId: 'acc-1' }
  ];

  const conflicts = detectTransactionConflicts(existing, incoming);
  assert.strictEqual(conflicts.length, 0, 'a pure date shift with matching amount/desc is not a conflict');

  const merged = mergeTransactions(existing, incoming, {});
  assert.strictEqual(merged.length, 1, 'no duplicate row is added');
  assert.strictEqual(merged[0].date, '2026-09-18', 'payment date is updated to the bank posted date');
  assert.strictEqual(merged[0].id, 'e1', 'existing row identity is preserved');
});

test('MERGE: amount mismatch on the same logical txn is flagged as a conflict for review', () => {
  const existing = [
    { id: 'e1', date: '2026-09-15', description: 'Netflix', amount: -15.99, accountId: 'acc-1' }
  ];
  const incoming = [
    { id: 'i1', date: '2026-09-15', description: 'Netflix', amount: -17.99, accountId: 'acc-1' }
  ];

  const conflicts = detectTransactionConflicts(existing, incoming);
  assert.strictEqual(conflicts.length, 1, 'amount mismatch must be surfaced, not silently merged');
  assert.strictEqual(conflicts[0].incoming.id, 'i1');
  assert.strictEqual(conflicts[0].matches.length, 1);
  assert.strictEqual(conflicts[0].matches[0].id, 'e1');
});

test('MERGE: amount mismatch with a shifted date is still flagged (date window)', () => {
  const existing = [
    { id: 'e1', date: '2026-09-15', description: 'Electric Bill', amount: -120.00, accountId: 'acc-1' }
  ];
  const incoming = [
    { id: 'i1', date: '2026-09-21', description: 'Electric Bill', amount: -134.50, accountId: 'acc-1' }
  ];

  const conflicts = detectTransactionConflicts(existing, incoming);
  assert.strictEqual(conflicts.length, 1, 'amount mismatch outside exact date still requires review');
});

test('MERGE: genuinely new row is appended without conflict', () => {
  const existing = [
    { id: 'e1', date: '2026-09-15', description: 'Netflix', amount: -15.99, accountId: 'acc-1' }
  ];
  const incoming = [
    { id: 'i1', date: '2026-09-20', description: 'Spotify', amount: -9.99, accountId: 'acc-1' }
  ];

  const conflicts = detectTransactionConflicts(existing, incoming);
  assert.strictEqual(conflicts.length, 0, 'unrelated row is not a conflict');
  const merged = mergeTransactions(existing, incoming, {});
  assert.strictEqual(merged.length, 2, 'new row is appended');
});

test('MERGE: exact duplicate (same date + amount) is deduplicated silently', () => {
  const existing = [
    { id: 'e1', date: '2026-09-15', description: 'Netflix', amount: -15.99, accountId: 'acc-1' }
  ];
  const incoming = [
    { id: 'i1', date: '2026-09-15', description: 'Netflix', amount: -15.99, accountId: 'acc-1' }
  ];

  const conflicts = detectTransactionConflicts(existing, incoming);
  assert.strictEqual(conflicts.length, 0, 'exact duplicate is not a conflict');
  const merged = mergeTransactions(existing, incoming, {});
  assert.strictEqual(merged.length, 1, 'exact duplicate is deduplicated');
});

test('MERGE: resolved conflict "merge" applies imported amount and date onto target row', () => {
  const existing = [
    { id: 'e1', date: '2026-09-15', description: 'Netflix', amount: -15.99, accountId: 'acc-1' }
  ];
  const incoming = [
    { id: 'i1', date: '2026-09-15', description: 'Netflix', amount: -17.99, accountId: 'acc-1' }
  ];
  const merged = mergeTransactions(existing, incoming, { i1: { action: 'merge', targetId: 'e1' } });
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].amount, -17.99, 'imported amount wins on explicit merge');
});

test('OVERRIDE: fully replaces the grid with imported rows (clears other accounts + stale dates)', () => {
  const acc1 = { id: 'acc-1', name: 'Checking', type: 'checking', enableExtraSavings: false, startingBalance: 500 };
  const acc2 = { id: 'acc-2', name: 'Savings', type: 'savings', enableExtraSavings: false, startingBalance: 100 };
  const metaState = { accounts: [acc1, acc2], people: [], bills: [] };

  const existingTransactions = [
    { id: 'old-1', date: '2026-01-05', description: 'Old acc-1 row', amount: -50, accountId: 'acc-1' },
    { id: 'old-2', date: '2026-01-06', description: 'Old acc-2 row', amount: -25, accountId: 'acc-2' },
    { id: 'old-3', date: '2026-12-31', description: 'Future acc-1 row', amount: 999, accountId: 'acc-1' }
  ];
  const staleMatrix = { 'acc-1_2026-01_5_other_amount': 50 };

  const imported = [
    { id: 'n1', date: '2026-09-10', description: 'Imported credit', amount: 200, accountId: 'acc-1' },
    { id: 'n2', date: '2026-09-12', description: 'Imported debit', amount: -75, accountId: 'acc-1' }
  ];

  const result = runImport({
    transactions: imported,
    strategy: 'override',
    existingTransactions,
    dailyMatrix: staleMatrix,
    metadataState: metaState
  });

  assert.ok(result.success, `override import should succeed: ${result.error || ''}`);

  const ids = result.transactions.map(t => t.id);
  assert.deepStrictEqual(ids.sort(), ['n1', 'n2'], 'grid contains ONLY the imported rows');
  assert.ok(!ids.includes('old-1'), 'stale acc-1 row (before import window) is cleared');
  assert.ok(!ids.includes('old-2'), 'other-account row is cleared by full override');
  assert.ok(!ids.includes('old-3'), 'future projected row is cleared by full override');

  const matrixKeys = Object.keys(result.dailyMatrix || {});
  assert.ok(!matrixKeys.includes('acc-1_2026-01_5_other_amount'), 'stale matrix cell is cleared by full override');
});

test('OVERRIDE: post-import running balance matches the imported statement (bank balance check)', () => {
  const acc = { id: 'acc-1', name: 'Checking', type: 'checking', enableExtraSavings: false, startingBalance: 1000, extraStartingBalance: 0 };
  const metaState = { accounts: [acc], people: [], bills: [] };

  // Legacy garbage that previously leaked into the balance and broke the check.
  const existingTransactions = [
    { id: 'old-1', date: '2026-01-05', description: 'Legacy debit', amount: -500, accountId: 'acc-1' },
    { id: 'old-3', date: '2026-12-31', description: 'Legacy future credit', amount: 999, accountId: 'acc-1' }
  ];

  const imported = [
    { id: 'n1', date: '2026-09-10', description: 'Credit', amount: 300, accountId: 'acc-1' },
    { id: 'n2', date: '2026-09-12', description: 'Debit', amount: -100, accountId: 'acc-1' }
  ];

  const result = runImport({
    transactions: imported,
    strategy: 'override',
    existingTransactions,
    dailyMatrix: {},
    metadataState: metaState
  });

  assert.ok(result.success, `override import should succeed: ${result.error || ''}`);

  const calculated = getLedgerRunningBalanceAsOfDate({
    targetAccountId: 'acc-1',
    targetDate: '2026-09-30',
    metadataState: result.metadataState,
    dailyMatrix: result.dailyMatrix || {},
    transactions: result.transactions
  });

  const expected = round2(1000 + 300 - 100);
  assert.strictEqual(calculated, expected, 'calculated balance must equal start + imported credits - debits');
});