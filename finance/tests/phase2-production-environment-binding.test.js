import { test, describe } from 'node:test';
import assert from 'node:assert';
import worker, { addSecurityHeaders } from '../src/worker.js';

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
});
