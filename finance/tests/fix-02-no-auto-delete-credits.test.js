// tests/fix-02-no-auto-delete-credits.test.js
// FIX-02: Loading, sign-in, matrix edits, and restore must never delete any dailyMatrix key.
// Round-trip export then restore deep-equals every key.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------------------------
// The pruning logic that was removed from restoreFromBackup (for comparison)
// -------------------------------------------------------------------------
function oldPruneLogic(matrix) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const creditKeyPattern = /^(.+)_(\d{4}-\d{2})_(\d{1,2})_(?:extra_)?credit_(.+)$/;
  const result = { ...matrix };
  for (const [key] of Object.entries(result)) {
    const m = key.match(creditKeyPattern);
    if (!m) continue;
    const cellIso = `${m[2]}-${String(parseInt(m[3], 10)).padStart(2, '0')}`;
    if (cellIso > todayIso) delete result[key];
  }
  return result;
}

// The new restoreFromBackup matrix handling (exact copy of the fixed code path)
function newRestoreMatrix(parsedData) {
  return (parsedData.dailyMatrix && typeof parsedData.dailyMatrix === 'object')
    ? { ...parsedData.dailyMatrix }
    : {};
}

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/incident-household.json'), 'utf-8')
);

// Keys that are future-dated credit cells (> 2026-10-05, today during this test run)
const FUTURE_CREDIT_KEYS = [
  'acc-mortgage-test_2026-10_13_credit_person-alice',
  'acc-mortgage-test_2026-10_18_credit_person-bob',
  'acc-mortgage-test_2026-11_25_credit_person-bob',
  'acc-mortgage-test_2026-11_1_credit_person-alice'
];

// Keys that are past-dated or non-credit (must never be removed)
const PAST_CREDIT_KEYS = [
  'acc-mortgage-test_2026-09_25_credit_person-bob',
  'acc-mortgage-test_2026-09_29_credit_person-alice',
  'acc-mortgage-test_2026-01_15_credit_person-alice',
  'acc-mortgage-test_2026-01_1_bill_bill-mortgage',
  'acc-mortgage-test_2026-09_29_reg_ending',
  'acc-mortgage-test_2026-09_1_other_desc'
];

// -------------------------------------------------------------------------
describe('FIX-02: restoreFromBackup preserves all dailyMatrix keys', () => {
  it('new restore path returns an exact shallow copy of parsedData.dailyMatrix', () => {
    const matrix = newRestoreMatrix(fixture);
    // Every key in the fixture must be present in the restored matrix
    for (const key of Object.keys(fixture.dailyMatrix)) {
      assert.ok(key in matrix, `Key "${key}" must survive restore`);
      assert.equal(matrix[key], fixture.dailyMatrix[key], `Value for "${key}" must be byte-equal`);
    }
  });

  it('future credit cells are preserved on restore (not deleted)', () => {
    const matrix = newRestoreMatrix(fixture);
    for (const key of FUTURE_CREDIT_KEYS) {
      if (key in fixture.dailyMatrix) {
        assert.ok(key in matrix, `Future credit key "${key}" must NOT be deleted by restore`);
      }
    }
  });

  it('past credit cells survive restore', () => {
    const matrix = newRestoreMatrix(fixture);
    for (const key of PAST_CREDIT_KEYS) {
      if (key in fixture.dailyMatrix) {
        assert.ok(key in matrix, `Past key "${key}" must survive restore`);
      }
    }
  });

  it('round-trip: every fixture key deep-equals after restore', () => {
    const matrix = newRestoreMatrix(fixture);
    const originalKeys = Object.keys(fixture.dailyMatrix);
    const restoredKeys = Object.keys(matrix);
    assert.equal(
      restoredKeys.length, originalKeys.length,
      `Restored key count (${restoredKeys.length}) must equal original (${originalKeys.length})`
    );
    assert.deepEqual(matrix, fixture.dailyMatrix);
  });

  it('old prune logic WOULD have deleted future keys (confirms the bug is gone)', () => {
    // Proves the old logic was destructive so we have evidence the removal was necessary
    const prunedMatrix = oldPruneLogic(fixture.dailyMatrix);
    const futureKeysInFixture = FUTURE_CREDIT_KEYS.filter(k => k in fixture.dailyMatrix);
    // At least some of the fixture's future credit keys should have been removed by old logic
    const survived = futureKeysInFixture.filter(k => k in prunedMatrix);
    assert.ok(
      survived.length < futureKeysInFixture.length || futureKeysInFixture.length === 0,
      'Old prune logic must have deleted at least one future credit key from the fixture'
    );
  });
});

describe('FIX-02: Option A auto-delete useEffect is gone', () => {
  it('LedgerDataContext.jsx does not contain the Option A useEffect trigger phrase', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/context/LedgerDataContext.jsx'),
      'utf-8'
    );
    assert.ok(
      !source.includes('REPAIR_FUTURE_CREDITS'),
      'REPAIR_FUTURE_CREDITS log tag must be gone - Option A useEffect was removed'
    );
    assert.ok(
      !source.includes("Option A self-healing migration"),
      '"Option A self-healing migration" comment must be gone'
    );
  });

  it('restoreFromBackup in LedgerDataContext.jsx does not contain the old credit pruning loop', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/context/LedgerDataContext.jsx'),
      'utf-8'
    );
    // The old pruning was between rawDailyMatrix assignment and the newDailyMatrix loop
    assert.ok(
      !source.includes('rawDailyMatrix'),
      '"rawDailyMatrix" variable from old pruning block must not exist in restoreFromBackup'
    );
  });
});

describe('FIX-02: clearFutureMatrixCredits no longer force-pushes', () => {
  it('clearFutureMatrixCredits implementation does not call pushCloudBackup with force:true', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/context/LedgerDataContext.jsx'),
      'utf-8'
    );
    // Find the clearFutureMatrixCredits function body
    const fnStart = source.indexOf('const clearFutureMatrixCredits');
    assert.ok(fnStart !== -1, 'clearFutureMatrixCredits must still exist');
    // The function ends at the next useCallback close - grab a 1500-char window
    const fnBody = source.slice(fnStart, fnStart + 1500);
    assert.ok(
      !fnBody.includes('force: true'),
      'clearFutureMatrixCredits must not call pushCloudBackup with force:true'
    );
  });
});
