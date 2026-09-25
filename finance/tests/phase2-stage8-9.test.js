import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import { ERROR_CODES } from '../functions/utils/errorCodes.js';
import { emitMetric } from '../functions/utils/auth.js';
import { enforceRateLimit } from '../functions/utils/rateLimit.js';

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

describe('Phase 2 Stage 8 & 9: Rate Limit Hardening, Request ID Threading & Observability', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };
  });

  // S8T1: enforceRateLimit fails closed with 503 SERVICE_UNAVAILABLE when CF-Connecting-IP is absent in production
  test('S8T1: enforceRateLimit returns 503 when CF-Connecting-IP is missing in production', async () => {
    const req = new Request('https://techtrekgt.com/api/auth/login', {
      headers: { 'cf-ray': 'ray-123' } // indicates production Cloudflare environment
    });
    const limited = await enforceRateLimit({ request: req, env, requestId: 'test-req-id' }, 'login', 10, 60);
    assert.ok(limited);
    assert.strictEqual(limited.status, 503);
    const body = await limited.json();
    assert.strictEqual(body.code, ERROR_CODES.SERVICE_UNAVAILABLE);
    assert.strictEqual(body.requestId, 'test-req-id');
  });

  // S8T2: enforceRateLimit uses dev fallback IP when cf-ray is absent
  test('S8T2: enforceRateLimit uses dev-unknown fallback when outside production', async () => {
    const req = new Request('http://localhost/api/auth/login'); // no cf-ray
    const limited = await enforceRateLimit({ request: req, env }, 'login', 10, 60);
    // Should NOT be rejected with 503; in dev without binding, it allows
    assert.strictEqual(limited, null);
  });

  // S9T1: requestId is included in error responses
  test('S9T1: worker error responses include generated requestId', async () => {
    const req = new Request('https://techtrekgt.com/api/unknown-route', { method: 'GET' });
    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.NOT_FOUND);
    assert.ok(body.requestId, 'requestId must be present in error response');
    assert.strictEqual(typeof body.requestId, 'string');
    assert.match(body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  // S9T2: emitMetric prints valid JSON structured metric
  test('S9T2: emitMetric formats structured event correctly', () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      emitMetric('auth.login.success', 'req-abc-123');
      assert.strictEqual(logs.length, 1);
      const parsed = JSON.parse(logs[0]);
      assert.strictEqual(parsed.type, 'metric');
      assert.strictEqual(parsed.event, 'auth.login.success');
      assert.strictEqual(parsed.requestId, 'req-abc-123');
      assert.ok(typeof parsed.ts === 'number');
    } finally {
      console.log = originalLog;
    }
  });
});
