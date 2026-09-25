import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker, { validateBudgetPayload, BUDGET_LIMITS, ALLOWED_BUDGET_KEYS } from '../src/worker.js';
import { createToken, newCsrfToken, ERROR_CODES } from '../functions/utils/auth.js';
import { initialBudgetData } from '../src/initialData.js';
import { fakeDemoBudgetData } from '../src/demoPresetData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  return {
    _raw: db,
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) { boundParams = params; return this; },
        async first() {
          const row = db.prepare(sql).get(...boundParams);
          return row || null;
        },
        async all() {
          const results = db.prepare(sql).all(...boundParams);
          return { results };
        },
        async run() {
          const info = db.prepare(sql).run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    }
  };
}

describe('Security: handleSyncBackup Payload Validation & Hardening', () => {
  let mockDb;
  let env;
  let token;
  let csrfToken;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    mockDb._raw.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('user-test-1', 'user-test-1@example.com', 'dummy_hash', 'Test User', 'Active', 'user', 0);

    const tokenRes = await createToken(
      { userId: 'user-test-1', email: 'user-test-1@example.com', role: 'user', tv: 0 },
      TEST_JWT_SECRET
    );
    token = tokenRes.token;
    csrfToken = newCsrfToken();
  });

  function makeAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Cookie': `auth_token=${token}; csrf_token=${csrfToken}`,
      'X-CSRF-Token': csrfToken
    };
  }

  // 1. Direct unit tests for validateBudgetPayload
  describe('Unit: validateBudgetPayload', () => {
    test('validates initialBudgetData successfully', () => {
      assert.strictEqual(validateBudgetPayload(initialBudgetData), true);
    });

    test('validates fakeDemoBudgetData successfully', () => {
      assert.strictEqual(validateBudgetPayload(fakeDemoBudgetData), true);
    });

    test('validates empty object successfully', () => {
      assert.strictEqual(validateBudgetPayload({}), true);
    });

    test('rejects non-object payloads', () => {
      assert.strictEqual(validateBudgetPayload(null), false);
      assert.strictEqual(validateBudgetPayload(undefined), false);
      assert.strictEqual(validateBudgetPayload('string'), false);
      assert.strictEqual(validateBudgetPayload(12345), false);
      assert.strictEqual(validateBudgetPayload([1, 2, 3]), false);
      assert.strictEqual(validateBudgetPayload(true), false);
    });

    test('rejects unknown top-level keys', () => {
      assert.strictEqual(validateBudgetPayload({ unknownKey: 'malicious' }), false);
      assert.strictEqual(validateBudgetPayload({ accounts: [], injectedScript: '<script>' }), false);
      assert.strictEqual(validateBudgetPayload({ foo: 1, bar: 2 }), false);
    });

    test('rejects unexpected types in known fields', () => {
      assert.strictEqual(validateBudgetPayload({ accounts: 'not-an-array' }), false);
      assert.strictEqual(validateBudgetPayload({ bills: 12345 }), false);
      assert.strictEqual(validateBudgetPayload({ theme: 999 }), false);
      assert.strictEqual(validateBudgetPayload({ hideDashboardHeader: 'false' }), false);
      assert.strictEqual(validateBudgetPayload({ dailyMatrix: [1, 2, 3] }), false);
      assert.strictEqual(validateBudgetPayload({ dailyMatrix: { key1: 'not-a-number' } }), false);
    });

    test('rejects unexpected types inside collection items', () => {
      // Account with non-finite startingBalance
      assert.strictEqual(validateBudgetPayload({ accounts: [{ id: 'acc-1', startingBalance: 'fifty' }] }), false);
      assert.strictEqual(validateBudgetPayload({ accounts: [{ id: 'acc-1', startingBalance: NaN }] }), false);
      assert.strictEqual(validateBudgetPayload({ accounts: [{ id: 'acc-1', startingBalance: Infinity }] }), false);

      // Bill with non-string name
      assert.strictEqual(validateBudgetPayload({ bills: [{ id: 'bill-1', name: 12345 }] }), false);

      // Transaction with non-finite amount
      assert.strictEqual(validateBudgetPayload({ transactions: [{ id: 'tx-1', amount: 'ten' }] }), false);
    });

    test('rejects oversized collection arrays', () => {
      const oversizedTxns = new Array(BUDGET_LIMITS.MAX_TRANSACTIONS + 1).fill({ id: 'tx-1', amount: 10 });
      assert.strictEqual(validateBudgetPayload({ transactions: oversizedTxns }), false);

      const oversizedAccs = new Array(BUDGET_LIMITS.MAX_ACCOUNTS + 1).fill({ id: 'acc-1', name: 'Test' });
      assert.strictEqual(validateBudgetPayload({ accounts: oversizedAccs }), false);

      const oversizedBills = new Array(BUDGET_LIMITS.MAX_BILLS + 1).fill({ id: 'bill-1', name: 'Test' });
      assert.strictEqual(validateBudgetPayload({ bills: oversizedBills }), false);
    });

    test('rejects oversized string fields in nested items', () => {
      const longName = 'a'.repeat(BUDGET_LIMITS.MAX_NAME_LEN + 1);
      assert.strictEqual(validateBudgetPayload({ accounts: [{ id: 'acc-1', name: longName }] }), false);

      const longNotes = 'n'.repeat(BUDGET_LIMITS.MAX_TEXT_LEN + 1);
      assert.strictEqual(validateBudgetPayload({ bills: [{ id: 'bill-1', notes: longNotes }] }), false);

      const longTheme = 't'.repeat(51);
      assert.strictEqual(validateBudgetPayload({ theme: longTheme }), false);
    });
  });

  // 2. Integration tests for handleSyncBackup via worker.fetch
  describe('Integration: handleSyncBackup endpoint validation', () => {
    test('valid payload passes and is saved to database', async () => {
      const validBudget = {
        accounts: [
          { id: 'acc-chk', name: 'Primary Checking', startingBalance: 2500.50, color: 'blue' }
        ],
        bills: [
          { id: 'bill-rent', name: 'Apartment Rent', amount: 1800, period: 'Monthly' }
        ],
        transactions: [
          { id: 'tx-1', accountId: 'acc-chk', amount: -50.25, description: 'Groceries' }
        ],
        theme: 'dark',
        hideDashboardHeader: false
      };

      const req = new Request('http://localhost/api/sync/backup', {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          budget: validBudget,
          force: true
        })
      });

      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(typeof body.version === 'number');

      // Verify row persisted in DB
      const row = mockDb._raw.prepare('SELECT data FROM user_backups WHERE id = ?').get('user-test-1');
      assert.ok(row, 'Row must exist in user_backups');
      assert.deepStrictEqual(JSON.parse(row.data), validBudget);
    });

    test('payload with an unexpected type in a known field is rejected with 400', async () => {
      const invalidBudget = {
        accounts: 'string-instead-of-array'
      };

      const req = new Request('http://localhost/api/sync/backup', {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          budget: invalidBudget,
          force: true
        })
      });

      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
      assert.strictEqual(body.error, 'Invalid backup payload.');

      // Verify database remains untouched
      const row = mockDb._raw.prepare('SELECT data FROM user_backups WHERE id = ?').get('user-test-1');
      assert.strictEqual(row, undefined, 'No row should be written to user_backups');
    });

    test('payload with non-finite number in nested item is rejected with 400', async () => {
      const invalidBudget = {
        accounts: [{ id: 'acc-1', startingBalance: 'not-a-number' }]
      };

      const req = new Request('http://localhost/api/sync/backup', {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          budget: invalidBudget,
          force: true
        })
      });

      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
      assert.strictEqual(body.error, 'Invalid backup payload.');
    });

    test('payload with an oversized nested array is rejected with 400', async () => {
      const oversizedBudget = {
        accounts: [{ id: 'acc-1', name: 'Checking' }],
        transactions: Array.from({ length: BUDGET_LIMITS.MAX_TRANSACTIONS + 1 }, (_, i) => ({
          id: `tx-${i}`,
          amount: 10
        }))
      };

      const req = new Request('http://localhost/api/sync/backup', {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          budget: oversizedBudget,
          force: true
        })
      });

      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
      assert.strictEqual(body.error, 'Invalid backup payload.');

      // Verify database remains untouched
      const row = mockDb._raw.prepare('SELECT data FROM user_backups WHERE id = ?').get('user-test-1');
      assert.strictEqual(row, undefined);
    });

    test('payload with unknown top-level key is rejected with 400', async () => {
      const unknownKeyBudget = {
        accounts: [],
        maliciousPayload: '<script>alert("xss")</script>'
      };

      const req = new Request('http://localhost/api/sync/backup', {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          budget: unknownKeyBudget,
          force: true
        })
      });

      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
      assert.strictEqual(body.error, 'Invalid backup payload.');

      // Verify database remains untouched
      const row = mockDb._raw.prepare('SELECT data FROM user_backups WHERE id = ?').get('user-test-1');
      assert.strictEqual(row, undefined);
    });

    test('non-object payload is rejected with 400', async () => {
      const req = new Request('http://localhost/api/sync/backup', {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          budget: 'malicious-string-payload',
          force: true
        })
      });

      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
      assert.strictEqual(body.error, 'Invalid backup payload.');
    });

    test('oversized string field in nested item is rejected with 400', async () => {
      const oversizedStringBudget = {
        accounts: [
          { id: 'acc-1', name: 'X'.repeat(BUDGET_LIMITS.MAX_NAME_LEN + 1) }
        ]
      };

      const req = new Request('http://localhost/api/sync/backup', {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          budget: oversizedStringBudget,
          force: true
        })
      });

      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
      assert.strictEqual(body.error, 'Invalid backup payload.');
    });
  });
});
