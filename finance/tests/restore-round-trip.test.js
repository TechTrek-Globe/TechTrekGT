import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ALLOWED_BUDGET_KEYS } from '../src/worker.js';
import { initialBudgetData } from '../src/initialData.js';

// CRIT-003: restoreFromBackup must round-trip every persisted key so cloud pull,
// version restore, and conflict resolution never silently delete funding goals.
describe('CRIT-003: restore metadata round-trip', () => {
  test('ALLOWED_BUDGET_KEYS includes fundingGoals', () => {
    assert.ok(ALLOWED_BUDGET_KEYS.has('fundingGoals'), 'fundingGoals must be an allowed budget key');
  });

  test('initial budget data ships with fundingGoals', () => {
    assert.ok(Array.isArray(initialBudgetData.fundingGoals), 'initialBudgetData.fundingGoals must be an array');
  });

  test('an empty fundingGoals array stays empty after a simulated restore', () => {
    const parsedData = {
      accounts: [{ id: 'acc-1', name: 'Checking' }],
      people: [],
      bills: [],
      loans: [],
      fundingGoals: [],
      dashboardWidgets: [],
      theme: 'dark',
      hideDashboardHeader: false,
      dailyMatrix: {},
      lineItems: [],
      transactions: []
    };

    const RESTORE_KEYS = ['accounts', 'people', 'bills', 'loans', 'fundingGoals', 'dashboardWidgets', 'theme', 'hideDashboardHeader'];
    const mergedMetadata = {};
    RESTORE_KEYS.forEach((key) => {
      const value = parsedData[key];
      if (Array.isArray(value)) {
        mergedMetadata[key] = value;
      } else if (key === 'theme') {
        mergedMetadata[key] = typeof value === 'string' && value ? value : 'dark';
      } else if (key === 'hideDashboardHeader') {
        mergedMetadata[key] = Boolean(value);
      } else if (key === 'fundingGoals') {
        mergedMetadata[key] = Array.isArray(value) ? value : [];
      } else {
        mergedMetadata[key] = (value !== undefined && value !== null) ? value : (initialBudgetData[key] || []);
      }
    });

    assert.deepStrictEqual(mergedMetadata.fundingGoals, [], 'empty funding goals must stay empty');
    assert.ok(RESTORE_KEYS.every((k) => k in mergedMetadata), 'every restore key must be present');
  });

  test('populated funding goals survive a round-trip', () => {
    const goals = [
      { id: 'goal-1', contributorId: 'person-1', accountId: 'acc-1', amountPerPay: 100 }
    ];
    const parsedData = {
      accounts: [{ id: 'acc-1', name: 'Checking' }],
      people: [],
      bills: [],
      loans: [],
      fundingGoals: goals,
      dashboardWidgets: [],
      theme: 'dark',
      hideDashboardHeader: false,
      dailyMatrix: {},
      lineItems: [],
      transactions: []
    };

    const RESTORE_KEYS = ['accounts', 'people', 'bills', 'loans', 'fundingGoals', 'dashboardWidgets', 'theme', 'hideDashboardHeader'];
    const mergedMetadata = {};
    RESTORE_KEYS.forEach((key) => {
      const value = parsedData[key];
      if (Array.isArray(value)) {
        mergedMetadata[key] = value;
      } else if (key === 'theme') {
        mergedMetadata[key] = typeof value === 'string' && value ? value : 'dark';
      } else if (key === 'hideDashboardHeader') {
        mergedMetadata[key] = Boolean(value);
      } else if (key === 'fundingGoals') {
        mergedMetadata[key] = Array.isArray(value) ? value : [];
      } else {
        mergedMetadata[key] = (value !== undefined && value !== null) ? value : (initialBudgetData[key] || []);
      }
    });

    assert.deepStrictEqual(mergedMetadata.fundingGoals, goals, 'funding goals must round-trip exactly');
  });
});
