// tests/fix-05-desc-preservation.test.js
// FIX-05: _desc keys in dailyMatrix must survive the api.js sanitizer and
//         pass validateBudgetPayloadDetailed on the worker.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import worker validator (pure ESM, no Cloudflare runtime needed)
import { validateBudgetPayloadDetailed, BUDGET_LIMITS } from '../src/worker.js';

// ---------------------------------------------------------------------------
// Reproduce the api.js sanitizer as a pure function for testing
// ---------------------------------------------------------------------------
function sanitizeMatrix(rawMatrix) {
  const cleanMatrix = {};
  for (const [k, v] of Object.entries(rawMatrix)) {
    if (k.endsWith('_desc')) {
      if (typeof v === 'string' && v.length > 0) {
        cleanMatrix[k] = v;
      }
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      cleanMatrix[k] = v;
    }
  }
  return cleanMatrix;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/incident-household.json'), 'utf-8')
);

// Keys present in the fixture's dailyMatrix that are _desc strings
const DESC_KEYS = Object.keys(fixture.dailyMatrix).filter(k => k.endsWith('_desc'));
// Numeric keys in the fixture
const NUMERIC_KEYS = Object.keys(fixture.dailyMatrix).filter(k => !k.endsWith('_desc'));

// ---------------------------------------------------------------------------
describe('FIX-05: BUDGET_LIMITS.MAX_DESC_LEN is defined', () => {
  it('MAX_DESC_LEN is a positive number', () => {
    assert.ok(
      typeof BUDGET_LIMITS.MAX_DESC_LEN === 'number' && BUDGET_LIMITS.MAX_DESC_LEN > 0,
      'BUDGET_LIMITS.MAX_DESC_LEN must be a positive number'
    );
  });

  it('MAX_DESC_LEN is 500 (the agreed limit)', () => {
    assert.equal(BUDGET_LIMITS.MAX_DESC_LEN, 500);
  });
});

describe('FIX-05: validateBudgetPayloadDetailed - dailyMatrix _desc keys', () => {
  it('valid _desc string values pass validation', () => {
    const result = validateBudgetPayloadDetailed({
      dailyMatrix: {
        'acc-mortgage_2026-09_1_other_desc': 'Opening deposit note',
        'acc-bills_2026-10_15_other_desc': 'Mid-month reconcile',
        'acc-mortgage_2026-09_25_credit_person-alice': 1234.56
      }
    });
    assert.equal(result.valid, true, result.reason);
  });

  it('_desc value at exactly MAX_DESC_LEN passes', () => {
    const maxStr = 'x'.repeat(BUDGET_LIMITS.MAX_DESC_LEN);
    const result = validateBudgetPayloadDetailed({
      dailyMatrix: { 'acc_2026-01_1_other_desc': maxStr }
    });
    assert.equal(result.valid, true, result.reason);
  });

  it('_desc value exceeding MAX_DESC_LEN is rejected', () => {
    const overStr = 'x'.repeat(BUDGET_LIMITS.MAX_DESC_LEN + 1);
    const result = validateBudgetPayloadDetailed({
      dailyMatrix: { 'acc_2026-01_1_other_desc': overStr }
    });
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('description exceeds max length'), `reason: ${result.reason}`);
  });

  it('null _desc value is permitted (treated as absent)', () => {
    const result = validateBudgetPayloadDetailed({
      dailyMatrix: { 'acc_2026-01_1_other_desc': null }
    });
    assert.equal(result.valid, true, result.reason);
  });

  it('non-numeric value on a non-_desc key is rejected', () => {
    const result = validateBudgetPayloadDetailed({
      dailyMatrix: { 'acc_2026-01_1_credit_person-alice': 'not-a-number' }
    });
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('must be a finite number or null'), `reason: ${result.reason}`);
  });

  it('NaN on a non-_desc key is rejected', () => {
    const result = validateBudgetPayloadDetailed({
      dailyMatrix: { 'acc_2026-01_1_credit_person-alice': NaN }
    });
    assert.equal(result.valid, false);
  });

  it('unknown top-level keys are still rejected', () => {
    const result = validateBudgetPayloadDetailed({ injected_field: 'evil' });
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('Unknown top-level key'), `reason: ${result.reason}`);
  });
});

describe('FIX-05: api.js sanitizeMatrix - _desc strings survive', () => {
  it('_desc strings are preserved by the sanitizer', () => {
    const raw = {
      'acc_2026-09_1_other_desc': 'Opening deposit note',
      'acc_2026-09_25_credit_person-alice': 1234.56,
      'acc_2026-10_1_other_desc': 'Another note'
    };
    const clean = sanitizeMatrix(raw);
    assert.equal(clean['acc_2026-09_1_other_desc'], 'Opening deposit note');
    assert.equal(clean['acc_2026-10_1_other_desc'], 'Another note');
    assert.equal(clean['acc_2026-09_25_credit_person-alice'], 1234.56);
  });

  it('null _desc values are stripped (treated as absent)', () => {
    const raw = { 'acc_2026-01_1_other_desc': null };
    const clean = sanitizeMatrix(raw);
    assert.ok(!('acc_2026-01_1_other_desc' in clean), 'null desc must be stripped');
  });

  it('empty string _desc values are stripped', () => {
    const raw = { 'acc_2026-01_1_other_desc': '' };
    const clean = sanitizeMatrix(raw);
    assert.ok(!('acc_2026-01_1_other_desc' in clean), 'empty desc must be stripped');
  });

  it('NaN numeric values are stripped', () => {
    const raw = { 'acc_2026-01_1_credit_person-alice': NaN };
    const clean = sanitizeMatrix(raw);
    assert.ok(!('acc_2026-01_1_credit_person-alice' in clean), 'NaN must be stripped');
  });

  it('Infinity numeric values are stripped', () => {
    const raw = { 'acc_2026-01_1_bill_bill-test': Infinity };
    const clean = sanitizeMatrix(raw);
    assert.ok(!('acc_2026-01_1_bill_bill-test' in clean), 'Infinity must be stripped');
  });

  it('null numeric values are stripped', () => {
    const raw = { 'acc_2026-01_1_credit_person-alice': null };
    const clean = sanitizeMatrix(raw);
    assert.ok(!('acc_2026-01_1_credit_person-alice' in clean));
  });

  it('owner_id is absent from ALLOWED_KEYS upload projection', () => {
    // Verify source-level: owner_id is not in the api.js ALLOWED_KEYS list
    const apiSrc = fs.readFileSync(path.join(__dirname, '../src/utils/api.js'), 'utf-8');
    const allowedKeysIdx = apiSrc.indexOf("const ALLOWED_KEYS = [");
    assert.ok(allowedKeysIdx !== -1, 'ALLOWED_KEYS must exist in api.js');
    // Find the closing bracket of the array
    const listEnd = apiSrc.indexOf('];', allowedKeysIdx);
    const keysList = apiSrc.slice(allowedKeysIdx, listEnd + 2);
    assert.ok(!keysList.includes("'owner_id'") && !keysList.includes('"owner_id"'),
      'owner_id must NOT be in ALLOWED_KEYS upload projection'
    );
  });
});

describe('FIX-05: fixture round-trip - desc keys survive sanitize + validate', () => {
  it('fixture contains _desc keys to test against', () => {
    assert.ok(DESC_KEYS.length > 0, 'fixture must have at least one _desc key to prove the test is meaningful');
  });

  it('sanitizing the fixture dailyMatrix preserves all _desc keys with non-empty string values', () => {
    const clean = sanitizeMatrix(fixture.dailyMatrix);
    for (const k of DESC_KEYS) {
      const origVal = fixture.dailyMatrix[k];
      if (typeof origVal === 'string' && origVal.length > 0) {
        assert.ok(k in clean, `_desc key "${k}" must survive the sanitizer`);
        assert.equal(clean[k], origVal, `value for "${k}" must be preserved`);
      }
    }
  });

  it('sanitizing the fixture preserves all numeric keys with finite values', () => {
    const clean = sanitizeMatrix(fixture.dailyMatrix);
    for (const k of NUMERIC_KEYS) {
      const origVal = fixture.dailyMatrix[k];
      if (typeof origVal === 'number' && Number.isFinite(origVal)) {
        assert.ok(k in clean, `numeric key "${k}" must survive the sanitizer`);
      }
    }
  });

  it('sanitized fixture dailyMatrix passes validateBudgetPayloadDetailed', () => {
    const cleanMatrix = sanitizeMatrix(fixture.dailyMatrix);
    const payload = { dailyMatrix: cleanMatrix };
    const result = validateBudgetPayloadDetailed(payload);
    assert.equal(result.valid, true, `Fixture validation failed: ${result.reason}`);
  });

  it('worker returns a reason in the validation object on failure', () => {
    const result = validateBudgetPayloadDetailed({
      dailyMatrix: { 'acc_2026-01_1_other_desc': 'x'.repeat(600) }
    });
    assert.equal(result.valid, false);
    assert.ok(typeof result.reason === 'string' && result.reason.length > 0,
      'Failed validation must include a reason string'
    );
  });
});
