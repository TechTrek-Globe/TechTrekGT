import { describe, it, expect } from 'vitest';
import { runBudgetMigrations } from '../src/migrations/budgetMigrations.js';

describe('BUG-001: Budget Migrations & Schema Upgrade Tests', () => {

  it('migrates a legacy v1 budget payload up to v8 without errors', () => {
    const legacyBudget = {
      accounts: [
        { id: 'acc_leg_1', name: 'Legacy Checking', startingBalance: 1000 }
      ],
      bills: [
        { id: 'bill_leg_1', name: 'Rent', amount: 1500, dueDay: 1, accountId: 'acc_leg_1' }
      ],
      dailyMatrix: {
        'acc_leg_1_2026-02_30_bill_rent': 1500 // Ghost day key in February (day 30)
      }
    };

    const result = runBudgetMigrations(legacyBudget);
    expect(result).toBeDefined();
    expect(result.wasMigrated).toBe(true);
    expect(result.budget.schemaVersion).toBe(8);

    // Assert that February 30 ghost day key was pruned
    expect(result.budget.dailyMatrix['acc_leg_1_2026-02_30_bill_rent']).toBeUndefined();
  });

  it('is idempotent when run on an already current v8 budget', () => {
    const currentBudget = {
      schemaVersion: 8,
      accounts: [{ id: 'acc_cur', name: 'Checking' }],
      bills: [],
      dailyMatrix: {}
    };

    const result = runBudgetMigrations(currentBudget);
    expect(result.wasMigrated).toBe(false);
    expect(result.budget.schemaVersion).toBe(8);
  });
});
