import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import { ERROR_CODES } from '../functions/utils/errorCodes.js';
import { emitMetric } from '../functions/utils/auth.js';
import { enforceRateLimit, getClientIp } from '../functions/utils/rateLimit.js';
import { RateLimiter } from '../src/RateLimiter.js';

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

  // HIGH-001 (FUNC-002): Standardized client IP extraction & Cloudflare proxy context
  describe('HIGH-001: Cloudflare Proxy IP Extraction & Per-Client Rate Limiting', () => {
    test('getClientIp prioritizes CF-Connecting-IP over other proxy headers', () => {
      const req = new Request('https://techtrekgt.com/api/test', {
        headers: {
          'CF-Connecting-IP': '198.51.100.42',
          'x-forwarded-for': '203.0.113.10, 10.0.0.1',
          'x-real-ip': '203.0.113.99'
        }
      });
      assert.strictEqual(getClientIp(req), '198.51.100.42');
    });

    test('getClientIp trims whitespace from CF-Connecting-IP', () => {
      const req = new Request('https://techtrekgt.com/api/test', {
        headers: { 'CF-Connecting-IP': '  198.51.100.55  ' }
      });
      assert.strictEqual(getClientIp(req), '198.51.100.55');
    });

    test('getClientIp returns null in production when CF-Connecting-IP is absent (rejects spoofed headers)', () => {
      const req = new Request('https://techtrekgt.com/api/test', {
        headers: {
          'cf-ray': 'ray-prod-123',
          'x-forwarded-for': '203.0.113.10',
          'x-real-ip': '203.0.113.10'
        }
      });
      assert.strictEqual(getClientIp(req), null);

      const reqEnv = new Request('https://techtrekgt.com/api/test', {
        headers: { 'x-forwarded-for': '203.0.113.10' }
      });
      assert.strictEqual(getClientIp(reqEnv, { ENVIRONMENT: 'production' }), null);
    });

    test('getClientIp falls back to standard request headers in local development', () => {
      // 1. X-Forwarded-For fallback (extracts first IP)
      const reqXff = new Request('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '203.0.113.88, 10.0.0.1' }
      });
      assert.strictEqual(getClientIp(reqXff), '203.0.113.88');

      // 2. X-Real-IP fallback
      const reqXri = new Request('http://localhost/api/test', {
        headers: { 'x-real-ip': '203.0.113.77' }
      });
      assert.strictEqual(getClientIp(reqXri), '203.0.113.77');

      // 3. X-Client-IP fallback
      const reqXci = new Request('http://localhost/api/test', {
        headers: { 'x-client-ip': '203.0.113.66' }
      });
      assert.strictEqual(getClientIp(reqXci), '203.0.113.66');

      // 4. Default dev-unknown fallback when no IP headers exist
      const reqNone = new Request('http://localhost/api/test');
      assert.strictEqual(getClientIp(reqNone), 'dev-unknown');
    });

    test('rate limiting triggers individually per actual client IP (acceptance criteria)', async () => {
      // Setup mock KV storage that records counts per key
      const kvStore = new Map();
      const mockKV = {
        async get(key) {
          return kvStore.get(key) || null;
        },
        async put(key, val) {
          kvStore.set(key, val);
        }
      };

      const testEnv = { ...env, RATE_LIMIT_KV: mockKV };
      const ipA = '198.51.100.1';
      const ipB = '198.51.100.2';

      // Client A exhausts its limit (5 requests max)
      for (let i = 0; i < 5; i++) {
        const reqA = new Request('http://localhost/api/auth/login', {
          headers: { 'CF-Connecting-IP': ipA }
        });
        const resA = await enforceRateLimit({ request: reqA, env: testEnv }, 'login', 5, 60);
        assert.strictEqual(resA, null, `Client A request ${i + 1} should be allowed`);
      }

      // 6th request from Client A must be rate-limited (HTTP 429)
      const reqA6 = new Request('http://localhost/api/auth/login', {
        headers: { 'CF-Connecting-IP': ipA }
      });
      const resA6 = await enforceRateLimit({ request: reqA6, env: testEnv }, 'login', 5, 60);
      assert.ok(resA6, 'Client A 6th request must be blocked');
      assert.strictEqual(resA6.status, 429);

      // Client B with different IP must NOT be blocked
      const reqB = new Request('http://localhost/api/auth/login', {
        headers: { 'CF-Connecting-IP': ipB }
      });
      const resB = await enforceRateLimit({ request: reqB, env: testEnv }, 'login', 5, 60);
      assert.strictEqual(resB, null, 'Client B should be allowed despite Client A being rate limited');
    });

    test('RateLimiter Durable Object safely handles invalid JSON and limits atomically', async () => {
      let storedState = null;
      const mockStorage = {
        async get(key) {
          return key === 'bucket' ? storedState : null;
        },
        async put(key, val) {
          if (key === 'bucket') storedState = val;
        }
      };
      const mockState = {
        storage: mockStorage,
        async blockConcurrencyWhile(fn) {
          return await fn();
        }
      };

      const limiter = new RateLimiter(mockState);

      // 1. Invalid JSON returns 400
      const badReq = new Request('https://rl/check', {
        method: 'POST',
        body: 'invalid-json'
      });
      const badRes = await limiter.fetch(badReq);
      assert.strictEqual(badRes.status, 400);

      // 2. Normal requests within limit return allowed: true
      const req1 = new Request('https://rl/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max: 2, window: 60 })
      });
      const res1 = await limiter.fetch(req1);
      const data1 = await res1.json();
      assert.strictEqual(data1.allowed, true);

      const req2 = new Request('https://rl/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max: 2, window: 60 })
      });
      const res2 = await limiter.fetch(req2);
      const data2 = await res2.json();
      assert.strictEqual(data2.allowed, true);

      // 3. 3rd request exceeds limit of 2 -> allowed: false
      const req3 = new Request('https://rl/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max: 2, window: 60 })
      });
      const res3 = await limiter.fetch(req3);
      const data3 = await res3.json();
      assert.strictEqual(data3.allowed, false);
      assert.ok(data3.retryAfter > 0);
    });
  });
});
