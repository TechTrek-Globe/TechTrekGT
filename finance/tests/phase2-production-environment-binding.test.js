import { test, describe } from 'node:test';
import assert from 'node:assert';
import worker, { addSecurityHeaders, PRODUCTION_ORIGINS, DEV_ORIGINS, ALLOWED_ORIGINS } from '../src/worker.js';

describe('Phase 2: Explicit Production Environment Binding & Security Headers', () => {
  const baseEnv = {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }) })
    },
    ASSETS: {
      fetch: async () => new Response('assets-index-html', { status: 200, headers: { 'content-type': 'text/html' } })
    },
    JWT_SECRET: 'super-secret-jwt-key-32-bytes-long-for-testing'
  };

  const prodEnv = {
    ...baseEnv,
    ENVIRONMENT: 'production'
  };

  const devEnv = {
    ...baseEnv,
    ENVIRONMENT: 'development'
  };

  // T1: CSP & HSTS present in production even when cf-ray header is absent
  test('T1: CSP and HSTS headers are present in production when cf-ray is absent', async () => {
    const req = new Request('https://techtrekgt.com/finance', {
      method: 'GET'
      // No cf-ray header passed
    });

    const res = await worker.fetch(req, prodEnv, {});
    assert.strictEqual(res.status, 200);

    const csp = res.headers.get('Content-Security-Policy');
    const hsts = res.headers.get('Strict-Transport-Security');

    assert.ok(csp, 'Content-Security-Policy must be present in production even without cf-ray');
    assert.ok(csp.includes("default-src 'self'"), 'CSP must contain default-src policy');
    assert.ok(hsts, 'Strict-Transport-Security must be present in production even without cf-ray');
    assert.ok(hsts.includes('max-age=31536000'), 'HSTS max-age must be 1 year');
  });

  // T2: CSP & HSTS present in production when cf-ray is present
  test('T2: CSP and HSTS headers are present in production when cf-ray is present', async () => {
    const req = new Request('https://techtrekgt.com/finance', {
      method: 'GET',
      headers: {
        'cf-ray': 'ray-prod-12345'
      }
    });

    const res = await worker.fetch(req, prodEnv, {});
    assert.strictEqual(res.status, 200);

    assert.ok(res.headers.get('Content-Security-Policy'), 'CSP must be present in production with cf-ray');
    assert.ok(res.headers.get('Strict-Transport-Security'), 'HSTS must be present in production with cf-ray');
  });

  // T3: CSP & HSTS omitted in development environment
  test('T3: CSP and HSTS headers are omitted when ENVIRONMENT is development', async () => {
    const req = new Request('https://techtrekgt.com/finance', {
      method: 'GET'
    });

    const res = await worker.fetch(req, devEnv, {});
    assert.strictEqual(res.status, 200);

    assert.strictEqual(res.headers.get('Content-Security-Policy'), null, 'CSP must be omitted in development');
    assert.strictEqual(res.headers.get('Strict-Transport-Security'), null, 'HSTS must be omitted in development');
  });

  // T4: CSP & HSTS bypassed on localhost even if ENVIRONMENT is production
  test('T4: CSP and HSTS headers are bypassed on localhost even if ENVIRONMENT is production', async () => {
    const req = new Request('http://localhost:3000/finance', {
      method: 'GET'
    });

    const res = await worker.fetch(req, prodEnv, {});
    assert.strictEqual(res.status, 200);

    assert.strictEqual(res.headers.get('Content-Security-Policy'), null, 'CSP must be bypassed on localhost');
    assert.strictEqual(res.headers.get('Strict-Transport-Security'), null, 'HSTS must be bypassed on localhost');
  });

  // T5: Missing ENVIRONMENT binding logs a warning when cf-ray is present
  test('T5: Warning is logged when ENVIRONMENT is undefined on cf-ray traffic', async () => {
    const req = new Request('https://techtrekgt.com/finance', {
      method: 'GET',
      headers: {
        'cf-ray': 'ray-warning-test'
      }
    });

    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => {
      warnings.push(args.join(' '));
      originalWarn(...args);
    };

    try {
      // baseEnv has no ENVIRONMENT set
      const res = await worker.fetch(req, baseEnv, {});
      assert.strictEqual(res.status, 200);

      const warningFound = warnings.some(w =>
        w.includes('env.ENVIRONMENT is undefined') && w.includes('cf-ray')
      );
      assert.ok(warningFound, 'Must log visible warning when env.ENVIRONMENT is undefined on cf-ray traffic');

      // CSP and HSTS should not be present because isProduction is false
      assert.strictEqual(res.headers.get('Content-Security-Policy'), null);
      assert.strictEqual(res.headers.get('Strict-Transport-Security'), null);
    } finally {
      console.warn = originalWarn;
    }
  });

  // T6: addSecurityHeaders unit test for isProduction and isLocalhost options
  test('T6: addSecurityHeaders gates CSP/HSTS strictly on isProduction && !isLocalhost', () => {
    const makeRes = () => new Response('test', { status: 200 });

    // 1. Production, not localhost -> headers added
    const res1 = addSecurityHeaders(makeRes(), { isProduction: true, isLocalhost: false });
    assert.ok(res1.headers.get('Content-Security-Policy'));
    assert.ok(res1.headers.get('Strict-Transport-Security'));

    // 2. Production, but localhost -> bypassed
    const res2 = addSecurityHeaders(makeRes(), { isProduction: true, isLocalhost: true });
    assert.strictEqual(res2.headers.get('Content-Security-Policy'), null);
    assert.strictEqual(res2.headers.get('Strict-Transport-Security'), null);

    // 3. Not production, not localhost -> omitted
    const res3 = addSecurityHeaders(makeRes(), { isProduction: false, isLocalhost: false });
    assert.strictEqual(res3.headers.get('Content-Security-Policy'), null);
    assert.strictEqual(res3.headers.get('Strict-Transport-Security'), null);
  });

  // T7: Origin constants export shape
  test('T7: PRODUCTION_ORIGINS, DEV_ORIGINS, and ALLOWED_ORIGINS exports exist and have expected values', () => {
    assert.ok(Array.isArray(PRODUCTION_ORIGINS), 'PRODUCTION_ORIGINS must be an array');
    assert.ok(Array.isArray(DEV_ORIGINS), 'DEV_ORIGINS must be an array');
    assert.ok(Array.isArray(ALLOWED_ORIGINS), 'ALLOWED_ORIGINS must be an array');

    assert.ok(PRODUCTION_ORIGINS.includes('https://techtrekgt.com'));
    assert.ok(PRODUCTION_ORIGINS.includes('http://techtrekgt.com'));
    assert.ok(PRODUCTION_ORIGINS.includes('https://techtrek-budget.pages.dev'));
    assert.strictEqual(PRODUCTION_ORIGINS.length, 3);

    assert.ok(DEV_ORIGINS.includes('http://localhost:3000'));
    assert.ok(DEV_ORIGINS.includes('http://localhost:5173'));
    assert.ok(DEV_ORIGINS.includes('http://localhost:8787'));
    assert.ok(DEV_ORIGINS.includes('http://127.0.0.1:3000'));
    assert.ok(DEV_ORIGINS.includes('http://127.0.0.1:5173'));
    assert.ok(DEV_ORIGINS.includes('http://127.0.0.1:8787'));
    assert.strictEqual(DEV_ORIGINS.length, 6);

    assert.strictEqual(ALLOWED_ORIGINS.length, PRODUCTION_ORIGINS.length + DEV_ORIGINS.length);
    assert.deepStrictEqual(ALLOWED_ORIGINS, [...PRODUCTION_ORIGINS, ...DEV_ORIGINS]);
  });

  // T8: In production, OPTIONS preflight from localhost origin is rejected with 403 and omits CORS headers
  test('T8: In production, OPTIONS preflight from localhost origin returns 403 and omits CORS headers', async () => {
    const req = new Request('https://techtrekgt.com/finance/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000'
      }
    });

    const res = await worker.fetch(req, prodEnv, {});
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Credentials'), null);
  });

  // T9: In production, OPTIONS preflight from allowed production origin returns 204 and includes CORS headers
  test('T9: In production, OPTIONS preflight from production origin returns 204 with CORS headers', async () => {
    const req = new Request('https://techtrekgt.com/finance/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://techtrekgt.com'
      }
    });

    const res = await worker.fetch(req, prodEnv, {});
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://techtrekgt.com');
    assert.strictEqual(res.headers.get('Access-Control-Allow-Credentials'), 'true');
  });

  // T10: In production, non-GET state-changing request from localhost origin is rejected with 403 Forbidden
  test('T10: In production, state-changing request with Origin from localhost is rejected with 403', async () => {
    const req = new Request('https://techtrekgt.com/finance/api/auth/logout', {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:3000',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const res = await worker.fetch(req, prodEnv, {});
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Credentials'), null);
  });

  // T11: In development, requests from localhost origins receive CORS headers and are allowed
  test('T11: In development, requests from localhost origins receive CORS headers and are allowed', async () => {
    const preflightReq = new Request('http://localhost:3000/finance/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000'
      }
    });

    const preflightRes = await worker.fetch(preflightReq, devEnv, {});
    assert.strictEqual(preflightRes.status, 204);
    assert.strictEqual(preflightRes.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
    assert.strictEqual(preflightRes.headers.get('Access-Control-Allow-Credentials'), 'true');
  });

  // T12: addSecurityHeaders unit test for isProduction origin gating
  test('T12: addSecurityHeaders unit test gates CORS headers by isProduction', () => {
    const makeRes = () => new Response('test', { status: 200 });

    // 1. Production with localhost origin -> CORS headers omitted
    const resProdLocal = addSecurityHeaders(makeRes(), {
      isProduction: true,
      requestOrigin: 'http://localhost:3000'
    });
    assert.strictEqual(resProdLocal.headers.get('Access-Control-Allow-Origin'), null);
    assert.strictEqual(resProdLocal.headers.get('Access-Control-Allow-Credentials'), null);

    // 2. Production with production origin -> CORS headers included
    const resProdAllowed = addSecurityHeaders(makeRes(), {
      isProduction: true,
      requestOrigin: 'https://techtrekgt.com'
    });
    assert.strictEqual(resProdAllowed.headers.get('Access-Control-Allow-Origin'), 'https://techtrekgt.com');
    assert.strictEqual(resProdAllowed.headers.get('Access-Control-Allow-Credentials'), 'true');

    // 3. Development with localhost origin -> CORS headers included
    const resDevLocal = addSecurityHeaders(makeRes(), {
      isProduction: false,
      requestOrigin: 'http://localhost:3000'
    });
    assert.strictEqual(resDevLocal.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
    assert.strictEqual(resDevLocal.headers.get('Access-Control-Allow-Credentials'), 'true');
  });
});
