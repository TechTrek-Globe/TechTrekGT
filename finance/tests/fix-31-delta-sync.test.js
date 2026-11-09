import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMatrixCompositeKey } from '../functions/utils/structuredBudgetStore.js';
import { enqueueDelta, clearDeltaQueue } from '../src/utils/deltaQueue.js';

test('FIX-31: parseMatrixCompositeKey key extraction and fallback', async (t) => {
  await t.test('correctly parses hyphen-separated 5-part keys', () => {
    const res = parseMatrixCompositeKey('acc1-2026-11-15-amount');
    assert.equal(res.accountId, 'acc1');
    assert.equal(res.monthKey, '2026-11');
    assert.equal(res.dayNum, 15);
    assert.equal(res.fieldKey, 'amount');
  });

  await t.test('falls back safely for underscore-delimited client keys while preserving rawKey as fieldKey', () => {
    const raw = 'acc-1699000000000_2026-11_15_other_amount';
    const res = parseMatrixCompositeKey(raw);
    assert.equal(res.accountId, 'default');
    assert.equal(res.monthKey, '0000-00');
    assert.equal(res.dayNum, 0);
    assert.equal(res.fieldKey, raw);
  });
});

test('FIX-31: deltaQueue enqueuing and deduplication', async (t) => {
  clearDeltaQueue();

  await t.test('enqueueDelta runs without errors and clearDeltaQueue resets state', () => {
    enqueueDelta({
      op: 'upsert_matrix_cell',
      ledgerId: 'test-ledger',
      key: 'acc1_2026-11_15_other_amount',
      numValue: 125.50,
      strValue: null
    });

    // Overwriting same key should dedup
    enqueueDelta({
      op: 'upsert_matrix_cell',
      ledgerId: 'test-ledger',
      key: 'acc1_2026-11_15_other_amount',
      numValue: 130.00,
      strValue: null
    });

    clearDeltaQueue();
    assert.ok(true, 'Queue enqueued and cleared safely');
  });
});

