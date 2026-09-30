import { test, describe } from 'node:test';
import assert from 'node:assert';
import { effectiveDueDay, parseDayNumber } from '../src/utils/paydayUtils.js';

describe('CRIT-007: effectiveDueDay clamps to shorter months', () => {
  test('dueDay 31 fires in 31-day months', () => {
    const bill = { dueDay: 31 };
    assert.strictEqual(effectiveDueDay(bill, 2026, 0), 31);
    assert.strictEqual(effectiveDueDay(bill, 2026, 2), 31);
    assert.strictEqual(effectiveDueDay(bill, 2026, 4), 31);
    assert.strictEqual(effectiveDueDay(bill, 2026, 6), 31);
    assert.strictEqual(effectiveDueDay(bill, 2026, 7), 31);
    assert.strictEqual(effectiveDueDay(bill, 2026, 9), 31);
    assert.strictEqual(effectiveDueDay(bill, 2026, 11), 31);
  });

  test('dueDay 31 clamps to 30 in 30-day months', () => {
    const bill = { dueDay: 31 };
    assert.strictEqual(effectiveDueDay(bill, 2026, 3), 30);
    assert.strictEqual(effectiveDueDay(bill, 2026, 5), 30);
    assert.strictEqual(effectiveDueDay(bill, 2026, 8), 30);
    assert.strictEqual(effectiveDueDay(bill, 2026, 10), 30);
  });

  test('dueDay 31 clamps to 28 in non-leap February', () => {
    const bill = { dueDay: 31 };
    assert.strictEqual(effectiveDueDay(bill, 2026, 1), 28);
  });

  test('dueDay 31 clamps to 29 in leap February', () => {
    const bill = { dueDay: 31 };
    assert.strictEqual(effectiveDueDay(bill, 2028, 1), 29);
  });

  test('dueDay 29 fires in leap February', () => {
    const bill = { dueDay: 29 };
    assert.strictEqual(effectiveDueDay(bill, 2028, 1), 29);
  });

  test('dueDay 29 clamps to 28 in non-leap February', () => {
    const bill = { dueDay: 29 };
    assert.strictEqual(effectiveDueDay(bill, 2026, 1), 28);
  });

  test('dueDay 30 fires in 30-day months and February', () => {
    const bill = { dueDay: 30 };
    assert.strictEqual(effectiveDueDay(bill, 2026, 1), 28);
    assert.strictEqual(effectiveDueDay(bill, 2026, 3), 30);
  });

  test('invalid dueDay falls back to last day of month', () => {
    const bill = { dueDay: null };
    assert.strictEqual(effectiveDueDay(bill, 2026, 1), 28);
    assert.strictEqual(effectiveDueDay(bill, 2026, 0), 31);
  });

  test('parseDayNumber still clamps raw values', () => {
    assert.strictEqual(parseDayNumber(31, 28), 28);
    assert.strictEqual(parseDayNumber('15', 31), 15);
    assert.strictEqual(parseDayNumber('last', 28), 28);
    assert.strictEqual(parseDayNumber(null, 31), null);
  });
});
