// tests/fix-tooltip-ledger-sync.test.js
// Verification suite for ColumnHeaderHoverTooltip and getColumnRecentTransactions:
// 1. Clamps dates strictly to viewed month / asOfDate so future transactions (e.g. Sep 14) do not leak into past months (e.g. Aug 31).
// 2. Prevents cross-earner alias collisions (e.g. generic "USAA Transfer" alias on Jon does not claim Ronnie's Aug 18 deposit).
// 3. Aligns earner credit amounts with dailyMatrix cell overrides (e.g. Jon's Aug 17 cell displays $800.00 matching the ledger instead of $689.42).
// 4. Correctly matches and attributes Ronnie's deposit to Ronnie.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getColumnRecentTransactions, toYmd } from '../src/utils/columnTooltipUtils.js';

describe('ColumnHeaderHoverTooltip Ledger Synchronization & Discrepancy Fixes', () => {
  const accountId = 'acc-mortgage-3223';
  const personJon = {
    id: 'person-jon',
    name: 'Jon',
    bankMatchNames: 'USAA Transfer, USAA FUNDS TRANSFER CR',
    deposit: 689.00
  };
  const personRonnie = {
    id: 'person-ronnie',
    name: 'Ronnie',
    bankMatchNames: 'USAA Transfer',
    deposit: 1378.84
  };
  const people = [personJon, personRonnie];
  const accounts = [{ id: accountId, name: 'USAA Mortgage Checking - 3223' }];

  const dailyMatrix = {
    [`${accountId}_2026-08_17_credit_person-jon`]: 800.00,
    [`${accountId}_2026-08_18_credit_person-ronnie`]: 1378.84,
    [`${accountId}_2026-08_31_credit_person-jon`]: 689.00,
    [`${accountId}_2026-09_14_credit_person-jon`]: 689.00
  };

  const transactions = [
    {
      id: 'txn-sep-14',
      date: '2026-09-14',
      description: 'USAA Transfer',
      amount: 689.00,
      accountId
    },
    {
      id: 'txn-aug-31',
      date: '2026-08-31',
      description: 'USAA Transfer',
      amount: 689.00,
      accountId
    },
    {
      id: 'txn-aug-18',
      date: '2026-08-18',
      description: 'USAA Transfer',
      amount: 1378.84,
      accountId
    },
    {
      id: 'txn-aug-17',
      date: '2026-08-17',
      description: 'USAA Transfer',
      amount: 689.42,
      accountId
    }
  ];

  it('excludes future month transactions when asOfDate is clamped to viewed month (August 2026)', () => {
    const asOfAugust = new Date(2026, 8, 0); // 2026-08-31
    const results = getColumnRecentTransactions({
      column: personJon,
      type: 'person',
      transactions,
      dailyMatrix,
      selectedAccountId: accountId,
      asOfDate: asOfAugust,
      people,
      accounts
    });

    const dates = results.map(r => r.date);
    // Sep 14 must NOT appear in August 2026 view
    assert.strictEqual(dates.includes('2026-09-14'), false);
    // Aug 31 and Aug 17 should appear
    assert.strictEqual(dates.includes('2026-08-31'), true);
    assert.strictEqual(dates.includes('2026-08-17'), true);
  });

  it('prevents cross-earner alias collisions: Jon does not claim Ronnie Aug 18 deposit', () => {
    const asOfAugust = new Date(2026, 8, 0); // 2026-08-31
    const results = getColumnRecentTransactions({
      column: personJon,
      type: 'person',
      transactions,
      dailyMatrix,
      selectedAccountId: accountId,
      asOfDate: asOfAugust,
      people,
      accounts
    });

    const dates = results.map(r => r.date);
    // Aug 18 was allocated to Ronnie in dailyMatrix; Jon must not claim it via generic alias
    assert.strictEqual(dates.includes('2026-08-18'), false);
  });

  it('correctly matches and attributes Aug 18 transaction to Ronnie', () => {
    const asOfAugust = new Date(2026, 8, 0); // 2026-08-31
    const results = getColumnRecentTransactions({
      column: personRonnie,
      type: 'person',
      transactions,
      dailyMatrix,
      selectedAccountId: accountId,
      asOfDate: asOfAugust,
      people,
      accounts
    });

    const dates = results.map(r => r.date);
    assert.strictEqual(dates.includes('2026-08-18'), true);
    const aug18 = results.find(r => r.date === '2026-08-18');
    assert.strictEqual(aug18.amount, 1378.84);
  });

  it('aligns earner credit amounts with dailyMatrix cell: Jon Aug 17 reflects $800.00 not $689.42', () => {
    const asOfAugust = new Date(2026, 8, 0); // 2026-08-31
    const results = getColumnRecentTransactions({
      column: personJon,
      type: 'person',
      transactions,
      dailyMatrix,
      selectedAccountId: accountId,
      asOfDate: asOfAugust,
      people,
      accounts
    });

    const aug17 = results.find(r => r.date === '2026-08-17');
    assert.ok(aug17, 'August 17 entry should exist for Jon');
    // Ledger cell is 800.00; tooltip must align with ledger cell instead of raw 689.42
    assert.strictEqual(aug17.amount, 800.00);
  });

  it('aligns bill amounts with dailyMatrix cell and prevents cross-bill alias collisions', () => {
    const billMortgage = {
      id: 'b-mortgage',
      name: 'Emory Parc - Mortgage',
      bankMatchNames: 'Mortgage, USAA Payment',
      amount: 2036.51
    };
    const billTv = {
      id: 'b-tv',
      name: 'Youtube TV Zack',
      bankMatchNames: 'Youtube, Google',
      amount: 36.50
    };

    const matrixWithBills = {
      [`${accountId}_2026-08_17_bill_b-tv`]: 36.50,
      [`${accountId}_2026-08_10_bill_b-mortgage`]: 2036.51
    };

    const billTxns = [
      {
        id: 'txn-tv',
        date: '2026-08-17',
        description: 'Google *YouTube TV',
        amount: -36.50,
        accountId
      },
      {
        id: 'txn-mortgage',
        date: '2026-08-10',
        description: 'Mortgage Payment',
        amount: -2036.51,
        accountId
      }
    ];

    const tvResults = getColumnRecentTransactions({
      column: billTv,
      type: 'bill',
      transactions: billTxns,
      dailyMatrix: matrixWithBills,
      selectedAccountId: accountId,
      asOfDate: '2026-08-31'
    });

    assert.strictEqual(tvResults.length, 1);
    assert.strictEqual(tvResults[0].date, '2026-08-17');
    assert.strictEqual(tvResults[0].amount, 36.50);

    const mortgageResults = getColumnRecentTransactions({
      column: billMortgage,
      type: 'bill',
      transactions: billTxns,
      dailyMatrix: matrixWithBills,
      selectedAccountId: accountId,
      asOfDate: '2026-08-31'
    });

    assert.strictEqual(mortgageResults.length, 1);
    assert.strictEqual(mortgageResults[0].date, '2026-08-10');
    assert.strictEqual(mortgageResults[0].amount, 2036.51);
  });
});
