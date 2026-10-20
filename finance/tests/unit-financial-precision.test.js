import { describe, it, expect } from 'vitest';
import {
  round2,
  parseMoney,
  isValidMoney,
  safeAdd,
  safeSub,
  safeMul,
  safeDiv,
  fmtMoney
} from '../src/utils/formatters.js';

import {
  allocateEarnerCredit,
  listFutureCreditOverrideDiagnostics
} from '../src/utils/ledgerEngine.js';

describe('FIN-AUDIT-003: Financial Math Precision & Deterministic Invariants', () => {

  describe('1. Half-Cent Rounding & Number.EPSILON Preservation', () => {
    it('correctly rounds half-cent boundaries that IEEE 754 typically truncates', () => {
      // In standard IEEE 754 floating point:
      // 1.005 * 100 = 100.49999999999999
      // Math.round(1.005 * 100) / 100 yields 1.00 instead of 1.01
      expect(Math.round(1.005 * 100) / 100).toBe(1);

      // round2 uses Number.EPSILON to guarantee banker-exact half-cent rounding
      expect(round2(1.005)).toBe(1.01);
      expect(round2(1.055)).toBe(1.06);
      expect(round2(2.555)).toBe(2.56);
      expect(round2(10.005)).toBe(10.01);
      expect(round2(100.005)).toBe(100.01);
    });

    it('preserves symmetric rounding for negative half-cent boundaries', () => {
      expect(round2(-1.005)).toBe(-1.01);
      expect(round2(-1.055)).toBe(-1.06);
      expect(round2(-2.555)).toBe(-2.56);
      expect(round2(-10.005)).toBe(-10.01);
    });

    it('eliminates sub-cent floating-point accumulation drift over series addition', () => {
      // 0.1 + 0.2 in JS evaluates to 0.30000000000000004
      expect(0.1 + 0.2 === 0.3).toBe(false);
      expect(round2(0.1 + 0.2)).toBe(0.3);

      let rawAccumulator = 0;
      let safeAccumulator = 0;
      for (let i = 0; i < 100; i++) {
        rawAccumulator += 0.07;
        safeAccumulator = safeAdd(safeAccumulator, 0.07);
      }

      // Raw IEEE 754 accumulator drifts from 7.00
      expect(rawAccumulator).not.toBe(7);
      // Safe accumulator maintains cent-exactness
      expect(safeAccumulator).toBe(7);
      expect(round2(rawAccumulator)).toBe(7);
    });
  });

  describe('2. Negative Zero (-0) Normalization', () => {
    it('normalizes negative zero to positive zero across edge multiplications and additions', () => {
      const negativeZeroFromMul = 0 * -1;
      expect(Object.is(negativeZeroFromMul, -0)).toBe(true);
      expect(Object.is(round2(negativeZeroFromMul), 0)).toBe(true);
      expect(Object.is(round2(negativeZeroFromMul), -0)).toBe(false);

      const tinyNegative = -0.00001;
      expect(Object.is(round2(tinyNegative), 0)).toBe(true);
      expect(Object.is(round2(tinyNegative), -0)).toBe(false);

      const subResult = safeSub(10.50, 10.50);
      expect(Object.is(subResult, 0)).toBe(true);
      expect(Object.is(subResult, -0)).toBe(false);
    });

    it('stringifies normalized zero as "$0.00" without negative signs', () => {
      expect(fmtMoney(-0.000001)).toBe('$0.00');
      expect(fmtMoney(0 * -1)).toBe('$0.00');
    });
  });

  describe('3. Multi-Year 360-Month Amortization Calculation Integrity', () => {
    it('simulates 360 monthly payments and converges exactly to 0 without penny divergence', () => {
      const loanAmount = 300000;
      const annualRate = 0.06; // 6%
      const monthlyRate = annualRate / 12;
      const totalMonths = 360;

      // Standard PMT formula: P * (r * (1 + r)^n) / ((1 + r)^n - 1)
      const pmtRaw = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
      const scheduledPayment = round2(pmtRaw);
      expect(scheduledPayment).toBe(1798.65);

      let balance = loanAmount;
      let totalInterest = 0;
      let totalPrincipal = 0;

      for (let month = 1; month <= totalMonths; month++) {
        const interestPortion = round2(balance * monthlyRate);
        let principalPortion = round2(scheduledPayment - interestPortion);

        // Final month payment adjustment
        if (month === totalMonths || balance < principalPortion) {
          principalPortion = balance;
        }

        balance = round2(balance - principalPortion);
        totalInterest = round2(totalInterest + interestPortion);
        totalPrincipal = round2(totalPrincipal + principalPortion);
      }

      // Balance must converge cleanly to 0.00
      expect(balance).toBe(0);
      expect(totalPrincipal).toBe(loanAmount);
      expect(totalInterest).toBeGreaterThan(0);
    });
  });

  describe('4. Earner Credit Allocation Conservation Invariant', () => {
    const mockPerson = {
      id: 'p-alex',
      name: 'Alex',
      payFrequency: 'semi-monthly',
      payDay1: '1st',
      payDay2: '15th',
      depositAccount: 'acc-1',
      accountAllocations: { 'acc-1': 2000 },
      enableExtraSavings: true,
      extraSavingsAccount: 'acc-1'
    };

    const mockBudget = {
      people: [mockPerson],
      accounts: [
        { id: 'acc-1', name: 'Checking', startingBalance: 1000, enabledEarners: ['p-alex'], enableExtraSavings: true }
      ],
      bills: [],
      fundingGoals: []
    };

    it('strictly enforces earnerReg + earnerExtra <= earnerDeposit invariant', () => {
      // Normal projection
      const allocProj = allocateEarnerCredit(mockPerson, 'acc-1', 2026, 0, 1, mockBudget, {}, { isLockedDay: false });
      expect(allocProj.earnerDeposit).toBe(2000);
      expect(round2(allocProj.earnerReg + allocProj.earnerExtra)).toBe(allocProj.earnerDeposit);

      // Stored manual override with both regular and extra credit
      const matrixOverride = {
        'acc-1_2026-01_1_credit_p-alex': '1750.00',
        'acc-1_2026-01_1_extra_credit_p-alex': '250.00'
      };
      const allocOverride = allocateEarnerCredit(mockPerson, 'acc-1', 2026, 0, 1, mockBudget, matrixOverride, { isLockedDay: false });
      expect(allocOverride.earnerDeposit).toBe(1750);
      expect(allocOverride.earnerExtra).toBe(250);
      expect(allocOverride.earnerReg).toBe(1500);
      expect(round2(allocOverride.earnerReg + allocOverride.earnerExtra)).toBe(allocOverride.earnerDeposit);
    });

    it('treats explicitly stored zero credit as a manual zero override, not fallback to projection', () => {
      const matrixZero = {
        'acc-1_2026-01_1_credit_p-alex': '0',
        'acc-1_2026-01_1_extra_credit_p-alex': '0'
      };
      const allocZero = allocateEarnerCredit(mockPerson, 'acc-1', 2026, 0, 1, mockBudget, matrixZero, { isLockedDay: false });
      expect(allocZero.earnerDeposit).toBe(0);
      expect(allocZero.earnerExtra).toBe(0);
      expect(allocZero.earnerReg).toBe(0);
      expect(allocZero.source).toBe('manual');
    });
  });

  describe('5. Monetary Parsing & Boundary Clamping', () => {
    it('handles various valid formatted strings into clean 2-decimal floats', () => {
      expect(parseMoney('$1,234.56')).toBe(1234.56);
      expect(parseMoney('($45.67)')).toBe(-45.67);
      expect(parseMoney('-100.50')).toBe(-100.50);
      expect(parseMoney('  $500  ')).toBe(500);
      expect(parseMoney('0')).toBe(0);
    });

    it('safely falls back to default value on invalid, non-numeric or empty strings', () => {
      expect(parseMoney('')).toBe(0);
      expect(parseMoney(null)).toBe(0);
      expect(parseMoney(undefined)).toBe(0);
      expect(parseMoney('N/A', 0)).toBe(0);
      expect(parseMoney('Pending verification', 25.00)).toBe(25.00);
      expect(parseMoney('--', 0)).toBe(0);
    });

    it('correctly assesses validity of currency expressions via isValidMoney', () => {
      expect(isValidMoney(100)).toBe(true);
      expect(isValidMoney('100.50')).toBe(true);
      expect(isValidMoney('$1,000.00')).toBe(true);
      expect(isValidMoney('invalid')).toBe(false);
      expect(isValidMoney('')).toBe(false);
      expect(isValidMoney(null)).toBe(false);
      expect(isValidMoney(NaN)).toBe(false);
      expect(isValidMoney(Infinity)).toBe(false);
    });
  });
});
