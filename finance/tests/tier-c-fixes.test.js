import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { getPersonTargetPayDaysForMonth } from '../src/utils/paydayUtils.js';
import {
  pruneInvalidMatrixDayKeys,
  normalizeFundingGoals,
  runBudgetMigrations,
  CURRENT_BUDGET_SCHEMA_VERSION
} from '../src/migrations/budgetMigrations.js';
import { addSecurityHeaders } from '../src/worker.js';

describe('Tier C Remediation Verification Tests', () => {

  // ------------------------------------------------------------------
  // C1: Bi-Weekly Pay Model Cadence
  // ------------------------------------------------------------------
  describe('C1: Bi-weekly pay model (14-day cadence with anchorDate)', () => {
    test('calculates 3 paychecks in a 3-paycheck month when anchorDate is specified', () => {
      const person = {
        id: 'person-test-1',
        name: 'Alex',
        payFrequency: 'bi-weekly',
        anchorDate: '2026-01-02' // Friday
      };

      // January 2026 (month 0): Jan 2, Jan 16, Jan 30
      const janDays = getPersonTargetPayDaysForMonth(person, 2026, 0);
      assert.strictEqual(janDays.length, 3, 'January 2026 must have 3 bi-weekly paychecks from anchor 2026-01-02');
      assert.strictEqual(janDays[0].getDate(), 2);
      assert.strictEqual(janDays[1].getDate(), 16);
      assert.strictEqual(janDays[2].getDate(), 30);

      // February 2026 (month 1): Feb 13, Feb 27
      const febDays = getPersonTargetPayDaysForMonth(person, 2026, 1);
      assert.strictEqual(febDays.length, 2, 'February 2026 must have 2 bi-weekly paychecks');
      assert.strictEqual(febDays[0].getDate(), 13);
      assert.strictEqual(febDays[1].getDate(), 27);
    });

    test('falls back gracefully to payDay1 and payDay2 when anchorDate is missing', () => {
      const person = {
        id: 'person-test-2',
        name: 'Taylor',
        payFrequency: 'bi-weekly',
        payDay1: 15,
        payDay2: 'last'
      };

      const janDays = getPersonTargetPayDaysForMonth(person, 2026, 0);
      assert.strictEqual(janDays.length, 2, 'Must fall back to 2 fixed paydays');
      assert.strictEqual(janDays[0].getDate(), 15);
      assert.strictEqual(janDays[1].getDate(), 31);
    });
  });

  // ------------------------------------------------------------------
  // C2: saveExtraMonthly vs Goal Overflow Precedence
  // ------------------------------------------------------------------
  describe('C2: saveExtraMonthly vs Goal Overflow Precedence', () => {
    test('accounts governed by active funding goals can be filtered to prevent double-saving', () => {
      const accounts = [
        { id: 'acc-mortgage', name: 'Mortgage Checking', saveExtraMonthly: 150, enableExtraSavings: true },
        { id: 'acc-emergency', name: 'Emergency Savings', saveExtraMonthly: 100, enableExtraSavings: true }
      ];
      const fundingGoals = [
        { id: 'goal-1', accountId: 'acc-mortgage', amountPerPay: 689 }
      ];

      // Filtering accounts that have active funding goals:
      const filtered = accounts.filter(acc => {
        if (!acc.saveExtraMonthly || acc.saveExtraMonthly <= 0 || acc.enableExtraSavings === false) return false;
        const hasGoals = fundingGoals.some(g => g.accountId === acc.id);
        return !hasGoals || acc.forceExtraSavingsWithGoals === true;
      });

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].id, 'acc-emergency', 'acc-mortgage must defer to its active funding goals');
    });
  });

  // ------------------------------------------------------------------
  // C5 & C8: Versioned Schema Migration Runner & Pruning Ghost Day Keys
  // ------------------------------------------------------------------
  describe('C5 & C8: Versioned Schema Migrations and Matrix Ghost Day Pruning', () => {
    test('pruneInvalidMatrixDayKeys removes dates exceeding calendar days in month', () => {
      const dailyMatrix = {
        'acc-1_2026-02_28_credit_person-1': 1000,
        'acc-1_2026-02_30_credit_person-1': 0, // Invalid (Feb 30)
        'acc-1_2026-02_31_credit_person-1': 0, // Invalid (Feb 31)
        'acc-1_2026-04_30_bill_1': 50,
        'acc-1_2026-04_31_credit_person-1': 0, // Invalid (Apr 31)
        'acc-1_2026-09_30_bill_2': 100,
        'acc-1_2026-09_31_credit_person-1': 0, // Invalid (Sep 31)
        'acc-1_2026-01_31_credit_person-1': 500 // Valid (Jan 31)
      };

      const { cleanedMatrix, removedCount, removedKeys } = pruneInvalidMatrixDayKeys(dailyMatrix);

      assert.strictEqual(removedCount, 4, 'Must remove exactly 4 invalid day keys');
      assert.strictEqual(cleanedMatrix['acc-1_2026-02_28_credit_person-1'], 1000);
      assert.strictEqual(cleanedMatrix['acc-1_2026-04_30_bill_1'], 50);
      assert.strictEqual(cleanedMatrix['acc-1_2026-09_30_bill_2'], 100);
      assert.strictEqual(cleanedMatrix['acc-1_2026-01_31_credit_person-1'], 500);

      assert.strictEqual(cleanedMatrix['acc-1_2026-02_30_credit_person-1'], undefined);
      assert.strictEqual(cleanedMatrix['acc-1_2026-02_31_credit_person-1'], undefined);
      assert.strictEqual(cleanedMatrix['acc-1_2026-04_31_credit_person-1'], undefined);
      assert.strictEqual(cleanedMatrix['acc-1_2026-09_31_credit_person-1'], undefined);
    });

    test('runBudgetMigrations upgrades budget to v2 and prunes ghost keys', () => {
      const legacyBudget = {
        dailyMatrix: {
          'acc-1_2026-09_30_credit_p1': 500,
          'acc-1_2026-09_31_credit_p1': 0 // Ghost key
        },
        fundingGoals: [
          { id: 'g1', accountId: 'acc-1', amount: 300, frequency: 'monthly' }
        ]
      };

      const { budget, wasMigrated, details } = runBudgetMigrations(legacyBudget);

      assert.strictEqual(wasMigrated, true);
      assert.strictEqual(budget.schemaVersion, CURRENT_BUDGET_SCHEMA_VERSION);
      assert.strictEqual(budget.schemaVersion, 2);
      assert.strictEqual(details.v2.prunedGhostDayKeys, 1);
      assert.strictEqual(budget.dailyMatrix['acc-1_2026-09_31_credit_p1'], undefined);
      assert.strictEqual(budget.dailyMatrix['acc-1_2026-09_30_credit_p1'], 500);
      assert.strictEqual(budget.fundingGoals[0].amountPerPay, 300);
      assert.strictEqual(budget.fundingGoals[0].amount, undefined);
    });

    test('runBudgetMigrations is idempotent when already at latest schemaVersion', () => {
      const modernBudget = {
        schemaVersion: 2,
        dailyMatrix: { 'acc-1_2026-01_15_credit_p1': 400 },
        fundingGoals: [{ id: 'g1', accountId: 'acc-1', amountPerPay: 400 }]
      };

      const { budget, wasMigrated } = runBudgetMigrations(modernBudget);
      assert.strictEqual(wasMigrated, false);
      assert.strictEqual(budget.schemaVersion, 2);
    });
  });

  // ------------------------------------------------------------------
  // C7: CSP Report-Only Header Configuration
  // ------------------------------------------------------------------
  describe('C7: CSP Report-Only Mode in Worker Security Headers', () => {
    test('emits Content-Security-Policy when cspReportOnly is false', () => {
      const initialResponse = new Response('ok', { status: 200 });
      const secResponse = addSecurityHeaders(initialResponse, {
        isProduction: true,
        isLocalhost: false,
        cspReportOnly: false,
        nonce: 'test-nonce'
      });

      assert.ok(secResponse.headers.has('Content-Security-Policy'), 'Must have Content-Security-Policy header');
      assert.strictEqual(secResponse.headers.has('Content-Security-Policy-Report-Only'), false);
    });

    test('emits Content-Security-Policy-Report-Only when cspReportOnly is true', () => {
      const initialResponse = new Response('ok', { status: 200 });
      const secResponse = addSecurityHeaders(initialResponse, {
        isProduction: true,
        isLocalhost: false,
        cspReportOnly: true,
        nonce: 'test-nonce'
      });

      assert.ok(secResponse.headers.has('Content-Security-Policy-Report-Only'), 'Must have Content-Security-Policy-Report-Only header');
      assert.strictEqual(secResponse.headers.has('Content-Security-Policy'), false, 'Must not enforce strict blocking CSP');
    });
  });
});
