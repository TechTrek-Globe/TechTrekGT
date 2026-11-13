import { describe, it, expect } from 'vitest';
import { budgetRecordKey, LEGACY_BUDGET_KEY } from '../src/utils/indexedDB.js';
import { ALLOWED_BUDGET_KEYS, ALLOWED_BUDGET_KEYS_LIST } from '../src/utils/budgetSchema.js';
import { matchCreditToEarner, findMatchingBill, normalizeIsoDate } from '../src/utils/importerHelpers.js';
import { round2, isValidMoney, parseMoney } from '../src/utils/formatters.js';

describe('Phase 3 & Phase 4 Remediation: Multi-User Isolation, Schema Integrity & Math Safety', () => {

  describe('1. Multi-User & Shared Ledger IndexedDB Key Scoping', () => {
    it('scopes budget storage keys strictly by user id and ledger id', () => {
      expect(budgetRecordKey('usr_alice_123', 'ledger_shared_789')).toBe('budget:usr_alice_123:ledger_shared_789');
      expect(budgetRecordKey('usr_bob_456', 'ledger_home_001')).toBe('budget:usr_bob_456:ledger_home_001');
    });

    it('scopes budget storage keys to user id when ledger id is null or identical to userId', () => {
      expect(budgetRecordKey('usr_alice_123', null)).toBe('budget:usr_alice_123');
      expect(budgetRecordKey('usr_alice_123', 'usr_alice_123')).toBe('budget:usr_alice_123');
    });

    it('falls back to legacy key when no user id is provided', () => {
      expect(budgetRecordKey(null)).toBe('budget:legacy');
      expect(budgetRecordKey(undefined)).toBe('budget:legacy');
      expect(budgetRecordKey('')).toBe('budget:legacy');
    });

    it('guarantees tenant isolation across multiple ledgers for the same user', () => {
      const personalKey = budgetRecordKey('usr_alice', null);
      const sharedKey = budgetRecordKey('usr_alice', 'ledger_business');
      expect(personalKey).not.toBe(sharedKey);
    });
  });

  describe('2. Canonical Budget Schema Whitelist', () => {
    it('defines canonical allowed budget keys list and set', () => {
      expect(ALLOWED_BUDGET_KEYS).toBeInstanceOf(Set);
      expect(Array.isArray(ALLOWED_BUDGET_KEYS_LIST)).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('accounts')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('people')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('bills')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('loans')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('fundingGoals')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('lineItems')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('dailyMatrix')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('transactions')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('theme')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('hideDashboardHeader')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('dashboardWidgets')).toBe(true);
      expect(ALLOWED_BUDGET_KEYS.has('schemaVersion')).toBe(true);
    });

    it('rejects unrecognized keys during backup validation', () => {
      const mockBackup = {
        accounts: [],
        bills: [],
        maliciousScript: '<script>alert(1)</script>',
        unrecognizedKey: 123
      };
      const invalidKeys = Object.keys(mockBackup).filter(k => !ALLOWED_BUDGET_KEYS.has(k));
      expect(invalidKeys).toEqual(['maliciousScript', 'unrecognizedKey']);
    });
  });

  describe('3. Importer Helpers Decoupling & Pure Logic', () => {
    it('normalizes various date representations to YYYY-MM-DD', () => {
      expect(normalizeIsoDate('2026-03-15')).toBe('2026-03-15');
      expect(normalizeIsoDate('3/15/2026')).toBe('2026-03-15');
      expect(normalizeIsoDate('03/15/2026')).toBe('2026-03-15');
    });

    it('matches bills accurately via exact or alias matching', () => {
      const bills = [
        { id: 'b1', name: 'Dominion Energy', aliases: ['Dominion Power'] },
        { id: 'b2', name: 'Netflix' }
      ];
      expect(findMatchingBill('Dominion Power Payment', '', bills)?.id).toBe('b1');
      expect(findMatchingBill('NETFLIX.COM', '', bills)?.id).toBe('b2');
      expect(findMatchingBill('Unknown Vendor', '', bills)).toBe(null);
    });

    it('matches earner credits using both options object and positional conventions', () => {
      const people = [
        { id: 'p1', name: 'Alex', aliases: ['Alex Salary'] },
        { id: 'p2', name: 'Sam', aliases: ['Sam Consulting'] }
      ];

      // Options object convention
      const matchObj = matchCreditToEarner({
        amount: 2500,
        description: 'Direct Deposit Alex Salary',
        people
      });
      expect(matchObj?.person?.id).toBe('p1');

      // Positional parameter convention
      const matchPos = matchCreditToEarner(
        1800,
        'Sam Consulting LLC ACH',
        '',
        people
      );
      expect(matchPos?.person?.id).toBe('p2');
    });
  });

  describe('4. Financial Formatting and Math Safety', () => {
    it('safely rounds numbers to 2 decimal places using Number.EPSILON', () => {
      expect(round2(1.005)).toBe(1.01);
      expect(round2(0.1 + 0.2)).toBe(0.3);
      expect(round2('123.456')).toBe(123.46);
    });

    it('rejects multi-dot or corrupted number strings', () => {
      expect(isValidMoney('1.2.3')).toBe(false);
      expect(isValidMoney('100-50')).toBe(false);
      expect(round2('1.2.3', 0)).toBe(0);
      expect(round2('100-50', 0)).toBe(0);
    });

    it('handles currency formatted strings with commas and dollar signs', () => {
      expect(isValidMoney('$1,234.56')).toBe(true);
      expect(parseMoney('$1,234.56')).toBe(1234.56);
      expect(round2('$1,234.56')).toBe(1234.56);
    });
  });
});
