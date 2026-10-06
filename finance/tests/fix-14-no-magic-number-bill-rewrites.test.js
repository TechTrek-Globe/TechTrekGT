import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBudgetMigrations, proposeLegacyBillCorrections } from '../src/migrations/budgetMigrations.js';

describe('FIX-14: Remove magic-number bill rewrites', () => {
  it('ensures BudgetMetadataContext.jsx contains no magic-number bill rewrites', () => {
    const metaSrc = fs.readFileSync(path.resolve('src/context/BudgetMetadataContext.jsx'), 'utf-8');
    assert.equal(metaSrc.includes('442.32'), false, 'BudgetMetadataContext must not rewrite 442.32');
    assert.equal(metaSrc.includes('2601.45'), false, 'BudgetMetadataContext must not rewrite 2601.45');
    assert.equal(metaSrc.includes('2757.68'), false, 'BudgetMetadataContext must not rewrite 2757.68');
  });

  it('a bill set to 442.32 stays 442.32 through runBudgetMigrations', () => {
    const rawBudget = {
      schemaVersion: 1,
      bills: [
        { id: 'b-hoa', name: 'HOA Monthly Assessment', amount: 442.32, period: 'Monthly' },
        { id: 'b-mortgage', name: 'Home Mortgage', amount: 2601.45, period: 'Monthly' }
      ]
    };

    const { budget: migrated } = runBudgetMigrations(rawBudget);
    const hoa = migrated.bills.find(b => b.id === 'b-hoa');
    const mortgage = migrated.bills.find(b => b.id === 'b-mortgage');

    assert.equal(hoa.amount, 442.32, 'Bill amount 442.32 must not be rewritten by migrations');
    assert.equal(mortgage.amount, 2601.45, 'Bill amount 2601.45 must not be rewritten by migrations');
  });

  it('proposeLegacyBillCorrections lists proposed corrections for owner approval without running on real data', () => {
    const bills = [
      { id: 'b-hoa', name: 'HOA Assessment', amount: 442.32 },
      { id: 'b-mortgage', name: 'Primary Mortgage', amount: 2757.68 },
      { id: 'b-water', name: 'City Water', amount: 75.00 }
    ];

    const { proposedBills, changes } = proposeLegacyBillCorrections(bills);

    assert.equal(changes.length, 2, 'Should detect two legacy amounts requiring review');
    assert.equal(changes[0].currentAmount, 442.32);
    assert.equal(changes[0].proposedAmount, 444.00);
    assert.equal(changes[1].currentAmount, 2757.68);
    assert.equal(changes[1].proposedAmount, 2756.00);

    // Original array must not be mutated
    assert.equal(bills[0].amount, 442.32, 'Original bill must remain untouched');
  });
});
