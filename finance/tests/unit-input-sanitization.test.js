import { describe, it, expect } from 'vitest';
import { parseMoney, isValidMoney } from '../src/utils/formatters.js';
import { validateBudgetPayloadDetailed, BUDGET_LIMITS, ALLOWED_BUDGET_KEYS } from '../src/worker.js';
import { HOSTILE_CURRENCY_INPUTS, HOSTILE_BUDGET_PAYLOADS } from './helpers/hostilePayloads.js';

describe('Taint & Hostile Input Sanitization Defense', () => {

  describe('1. Currency & Monetary Input Sanitization', () => {
    it('neutralizes SQL injection, XSS, and script payloads safely without exceptions', () => {
      for (const hostile of HOSTILE_CURRENCY_INPUTS) {
        expect(() => {
          const parsed = parseMoney(hostile);
          expect(typeof parsed).toBe('number');
          expect(Number.isFinite(parsed)).toBe(true);
        }).not.toThrow();
      }
    });

    it('identifies malicious script and SQL injection inputs as invalid money', () => {
      expect(isValidMoney("<script>alert('xss')</script>")).toBe(false);
      expect(isValidMoney("100.00'; DROP TABLE users; --")).toBe(false);
      expect(isValidMoney("100.00 UNION SELECT password_hash FROM users")).toBe(false);
    });

    it('rejects non-finite IEEE 754 edge numbers (NaN, Infinity, -Infinity)', () => {
      expect(isValidMoney(NaN)).toBe(false);
      expect(isValidMoney(Infinity)).toBe(false);
      expect(isValidMoney(-Infinity)).toBe(false);

      expect(parseMoney(NaN, 0)).toBe(0);
      expect(parseMoney(Infinity, 0)).toBe(0);
      expect(parseMoney(-Infinity, 0)).toBe(0);
    });

    it('safely parses accounting parentheses formatted currency', () => {
      expect(parseMoney('(150.25)')).toBe(-150.25);
      expect(parseMoney('($2,500.00)')).toBe(-2500.00);
      expect(parseMoney('(0.00)')).toBe(0);
    });
  });

  describe('2. Cloud Vault Schema & Boundary Sanitization', () => {
    it('rejects payloads with unauthorized/injected top-level keys', () => {
      const res = validateBudgetPayloadDetailed(HOSTILE_BUDGET_PAYLOADS.unauthorizedKeys);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Unknown top-level key');
    });

    it('rejects payloads exceeding the 25,000 transaction boundary ceiling', () => {
      const res = validateBudgetPayloadDetailed(HOSTILE_BUDGET_PAYLOADS.oversizedTransactions);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain(`must be an array <= ${BUDGET_LIMITS.MAX_TRANSACTIONS}`);
    });

    it('rejects oversized note/description strings exceeding text length limits', () => {
      const res = validateBudgetPayloadDetailed(HOSTILE_BUDGET_PAYLOADS.oversizedDescription);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('notes invalid');
    });

    it('accepts valid, fully populated budget payloads conforming to schema', () => {
      const validPayload = {
        schemaVersion: 8,
        theme: 'dark',
        accounts: [
          {
            id: 'acc_main',
            name: 'Primary Checking',
            type: 'checking',
            startingBalance: 1500.00,
            extraStartingBalance: 0,
            enableExtraSavings: false,
            isArchived: false
          }
        ],
        people: [
          { id: 'usr_1', name: 'Jordan', role: 'Primary' }
        ],
        bills: [
          { id: 'bill_1', name: 'Rent', amount: 1850.00, dueDay: 1, accountId: 'acc_main' }
        ],
        dailyMatrix: {
          'acc_main_2026-01_1_bill_bill_1': 1850.00,
          'acc_main_2026-01_1_other_desc': 'Manual adjustment'
        }
      };

      const res = validateBudgetPayloadDetailed(validPayload);
      expect(res.valid).toBe(true);
      expect(res.reason).toBeUndefined();
    });
  });
});
