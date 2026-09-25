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

  // (a) DO bound and over limit returns 429
  test('S8T3: enforceRateLimit returns 429 when Durable Object is bound and over limit', async () => {
    const mockDO = {
      idFromName(name) { return { name }; },
      get() {
        return {
          async fetch() {
            return new Response(JSON.stringify({ allowed: false, retryAfter: 45 }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        };
      }
    };
    const req = new Request('https://techtrekgt.com/api/auth/login', {
      headers: { 'CF-Connecting-IP': '198.51.100.10' }
    });
    const limited = await enforceRateLimit(
      { request: req, env: { ...env, RATE_LIMITER: mockDO }, requestId: 'do-test-id' },
      'login',
      10,
      60
    );
    assert.ok(limited);
    assert.strictEqual(limited.status, 429);
    assert.strictEqual(limited.headers.get('Retry-After'), '45');
    const body = await limited.json();
    assert.strictEqual(body.code, ERROR_CODES.RATE_LIMITED);
    assert.strictEqual(body.requestId, 'do-test-id');

    // DO call throws -> fails closed with 429
    const throwingDO = {
      idFromName(name) { return { name }; },
      get() {
        return {
          async fetch() { throw new Error('DO simulated network error'); }
        };
      }
    };
    const limitedThrow = await enforceRateLimit(
      { request: req, env: { ...env, RATE_LIMITER: throwingDO } },
      'login',
      10,
      60
    );
    assert.ok(limitedThrow);
    assert.strictEqual(limitedThrow.status, 429);
    const bodyThrow = await limitedThrow.json();
    assert.strictEqual(bodyThrow.code, ERROR_CODES.RATE_LIMITED);
  });

  // (b) KV bound and over limit returns 429
  test('S8T4: enforceRateLimit returns 429 when KV is bound and over limit', async () => {
    const mockKV = {
      async get() { return '10'; }, // Already at limit of 10
      async put() {}
    };
    const req = new Request('https://techtrekgt.com/api/auth/login', {
      headers: { 'CF-Connecting-IP': '198.51.100.11' }
    });
    const limited = await enforceRateLimit(
      { request: req, env: { ...env, RATE_LIMIT_KV: mockKV }, requestId: 'kv-test-id' },
      'login',
      10,
      60
    );
    assert.ok(limited);
    assert.strictEqual(limited.status, 429);
    assert.ok(limited.headers.get('Retry-After'));
    const body = await limited.json();
    assert.strictEqual(body.code, ERROR_CODES.RATE_LIMITED);
    assert.strictEqual(body.requestId, 'kv-test-id');

    // KV call throws -> fails closed with 429
    const throwingKV = {
      async get() { throw new Error('KV storage unavailable'); },
      async put() {}
    };
    const limitedThrow = await enforceRateLimit(
      { request: req, env: { ...env, RATE_LIMIT_KV: throwingKV } },
      'login',
      10,
      60
    );
    assert.ok(limitedThrow);
    assert.strictEqual(limitedThrow.status, 429);
    const bodyThrow = await limitedThrow.json();
    assert.strictEqual(bodyThrow.code, ERROR_CODES.RATE_LIMITED);
  });

  // (c) No binding in production returns 503
  test('S8T5: enforceRateLimit returns 503 when no limiter is bound in production', async () => {
    // 1. With cf-ray header and CF-Connecting-IP present
    const reqWithRay = new Request('https://techtrekgt.com/api/auth/login', {
      headers: { 'cf-ray': 'ray-prod-456', 'CF-Connecting-IP': '198.51.100.12' }
    });
    const limitedRay = await enforceRateLimit(
      { request: reqWithRay, env, requestId: 'prod-no-binding-id' },
      'login',
      10,
      60
    );
    assert.ok(limitedRay);
    assert.strictEqual(limitedRay.status, 503);
    const bodyRay = await limitedRay.json();
    assert.strictEqual(bodyRay.code, ERROR_CODES.SERVICE_UNAVAILABLE);
    assert.strictEqual(bodyRay.requestId, 'prod-no-binding-id');

    // 2. With env.ENVIRONMENT === 'production'
    const reqWithEnv = new Request('https://techtrekgt.com/api/auth/login', {
      headers: { 'CF-Connecting-IP': '198.51.100.12' }
    });
    const limitedEnv = await enforceRateLimit(
      { request: reqWithEnv, env: { ...env, ENVIRONMENT: 'production' }, requestId: 'prod-env-id' },
      'login',
      10,
      60
    );
    assert.ok(limitedEnv);
    assert.strictEqual(limitedEnv.status, 503);
    const bodyEnv = await limitedEnv.json();
    assert.strictEqual(bodyEnv.code, ERROR_CODES.SERVICE_UNAVAILABLE);
  });

  // (d) No binding in dev returns allowed with dev warning logged
  test('S8T6: enforceRateLimit allows request and logs dev warning when outside production', async () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      const req = new Request('http://localhost:5173/api/auth/login');
      const limited = await enforceRateLimit({ request: req, env }, 'login', 10, 60);
      assert.strictEqual(limited, null);
      assert.ok(warnings.some(w => w.includes('[rateLimit] DEV MODE: no limiter bound, allowing request')));
    } finally {
      console.warn = originalWarn;
    }
  });

  // Acceptance criteria: All 10 rate-limited endpoints return 503 in production without bindings
  test('S8T7: all 10 rate-limited endpoints return 503 in production when no limiter is bound', async () => {
    const endpoints = [
      { method: 'POST', path: '/api/auth/login' },
      { method: 'POST', path: '/api/auth/register' },
      { method: 'POST', path: '/api/auth/forgot-password' },
      { method: 'POST', path: '/api/auth/reset-password' },
      { method: 'POST', path: '/api/auth/update-profile' },
      { method: 'POST', path: '/api/auth/verify-email' },
      { method: 'POST', path: '/api/auth/resend-verification' },
      { method: 'POST', path: '/api/auth/confirm-email-change' },
      { method: 'POST', path: '/api/admin/user/usr_test_123/status' },
      { method: 'POST', path: '/api/verify-sync-code' }
    ];

    for (const ep of endpoints) {
      const req = new Request(`https://techtrekgt.com${ep.path}`, {
        method: ep.method,
        headers: {
          'cf-ray': 'ray-prod-check',
          'CF-Connecting-IP': '198.51.100.99',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const res = await worker.fetch(req, env, {});
      assert.strictEqual(
        res.status,
        503,
        `Expected ${ep.method} ${ep.path} to return 503, got ${res.status}`
      );
      const data = await res.json();
      assert.strictEqual(
        data.code,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        `Expected code ${ERROR_CODES.SERVICE_UNAVAILABLE} on ${ep.path}, got ${data.code}`
      );
    }
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
