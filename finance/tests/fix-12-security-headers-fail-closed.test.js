import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import worker, { PRODUCTION_ORIGINS, ALLOWED_ORIGINS } from '../src/worker.js';

describe('FIX-12: Security headers fail closed', () => {
  const baseEnvWithoutEnvironment = {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }) })
    },
    ASSETS: {
      fetch: async () => new Response('assets-html', { status: 200, headers: { 'content-type': 'text/html' } })
    },
    JWT_SECRET: 'test-secret-at-least-32-chars-long-for-jwt'
  };

  test('PRODUCTION_ORIGINS does not include http://techtrekgt.com', () => {
    assert.strictEqual(PRODUCTION_ORIGINS.includes('http://techtrekgt.com'), false);
    assert.strictEqual(PRODUCTION_ORIGINS.includes('https://techtrekgt.com'), true);
    assert.strictEqual(PRODUCTION_ORIGINS.includes('https://techtrek-budget.pages.dev'), true);
  });

  test('OPTIONS preflight from http://techtrekgt.com is rejected with 403', async () => {
    const req = new Request('https://techtrekgt.com/finance/api/auth/me', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://techtrekgt.com'
      }
    });
    const res = await worker.fetch(req, { ...baseEnvWithoutEnvironment, ENVIRONMENT: 'production' }, {});
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null);
  });

  test('CSP and HSTS are present when ENVIRONMENT is unset and URL contains a port', async () => {
    // Request with port in URL and ENVIRONMENT unset (fail closed)
    const req = new Request('https://techtrekgt.com:8443/finance', {
      method: 'GET'
    });
    const res = await worker.fetch(req, baseEnvWithoutEnvironment, {});
    assert.strictEqual(res.status, 200);

    const csp = res.headers.get('Content-Security-Policy');
    const hsts = res.headers.get('Strict-Transport-Security');

    assert.ok(csp, 'Content-Security-Policy must be present when ENVIRONMENT is unset');
    assert.ok(hsts, 'Strict-Transport-Security must be present when ENVIRONMENT is unset');
    assert.match(csp, /default-src 'self'/);
    assert.match(hsts, /max-age=31536000/);
  });

  test('CSP and HSTS are present when ENVIRONMENT is unset even on localhost URL with port', async () => {
    const req = new Request('http://localhost:5173/finance', {
      method: 'GET'
    });
    const res = await worker.fetch(req, baseEnvWithoutEnvironment, {});
    assert.strictEqual(res.status, 200);

    const csp = res.headers.get('Content-Security-Policy');
    const hsts = res.headers.get('Strict-Transport-Security');

    assert.ok(csp, 'CSP must be present on localhost when ENVIRONMENT is unset (fail closed)');
    assert.ok(hsts, 'HSTS must be present on localhost when ENVIRONMENT is unset (fail closed)');
  });

  test('CSP and HSTS are bypassed ONLY when ENVIRONMENT is explicitly development on localhost or 127.0.0.1', async () => {
    const devEnv = {
      ...baseEnvWithoutEnvironment,
      ENVIRONMENT: 'development'
    };

    // 1. development on localhost -> bypassed
    const reqLocalhost = new Request('http://localhost:5173/finance', { method: 'GET' });
    const resLocalhost = await worker.fetch(reqLocalhost, devEnv, {});
    assert.strictEqual(resLocalhost.headers.get('Content-Security-Policy'), null);
    assert.strictEqual(resLocalhost.headers.get('Strict-Transport-Security'), null);

    // 2. development on 127.0.0.1 -> bypassed
    const req127 = new Request('http://127.0.0.1:5173/finance', { method: 'GET' });
    const res127 = await worker.fetch(req127, devEnv, {});
    assert.strictEqual(res127.headers.get('Content-Security-Policy'), null);
    assert.strictEqual(res127.headers.get('Strict-Transport-Security'), null);

    // 3. development on techtrekgt.com -> applied!
    const reqRemote = new Request('https://techtrekgt.com/finance', { method: 'GET' });
    const resRemote = await worker.fetch(reqRemote, devEnv, {});
    assert.ok(resRemote.headers.get('Content-Security-Policy'));
    assert.ok(resRemote.headers.get('Strict-Transport-Security'));
  });

});
