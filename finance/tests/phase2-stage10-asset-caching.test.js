import { test, describe } from 'node:test';
import assert from 'node:assert';
import worker, { addSecurityHeaders, fetchAsset } from '../src/worker.js';

describe('Static Asset Caching & Security Headers', () => {
  const dummyEnv = {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] })
        })
      })
    },
    ASSETS: {
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname.endsWith('.js')) {
          return new Response('console.log("bundle");', {
            status: 200,
            headers: { 'content-type': 'application/javascript; charset=utf-8' }
          });
        }
        if (url.pathname.endsWith('.css')) {
          return new Response('body { margin: 0; }', {
            status: 200,
            headers: { 'content-type': 'text/css; charset=utf-8' }
          });
        }
        if (url.pathname.endsWith('.svg')) {
          return new Response('<svg></svg>', {
            status: 200,
            headers: { 'content-type': 'image/svg+xml' }
          });
        }
        if (url.pathname === '/' || url.pathname.endsWith('.html')) {
          return new Response('<!DOCTYPE html><html><body>Root</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' }
          });
        }
        return new Response('Not found', { status: 404 });
      }
    },
    JWT_SECRET: 'super-secret-jwt-key-32-bytes-long-for-testing'
  };

  test('T1: hashed static assets under /finance/assets/ return immutable Cache-Control', async () => {
    const req = new Request('https://techtrekgt.com/finance/assets/index-JzKByDmC.js', { method: 'GET' });
    const res = await worker.fetch(req, dummyEnv, {});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('T2: hashed CSS asset under /finance/assets/ returns immutable Cache-Control', async () => {
    const req = new Request('https://techtrekgt.com/finance/assets/index-B-SItIcd.css', { method: 'GET' });
    const res = await worker.fetch(req, dummyEnv, {});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });

  test('T3: dot-hashed asset pattern (*.[hash].js) returns immutable Cache-Control', () => {
    const resp = new Response('var x = 1;', {
      status: 200,
      headers: { 'content-type': 'application/javascript' }
    });
    const result = addSecurityHeaders(resp, { requestPath: '/finance/vendor.a1b2c3d4.js' });

    assert.strictEqual(result.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });

  test('T4: unhashed static asset returns short max-age with stale-while-revalidate', async () => {
    const req = new Request('https://techtrekgt.com/finance/favicon.svg', { method: 'GET' });
    const res = await worker.fetch(req, dummyEnv, {});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=3600, stale-while-revalidate=86400');
  });

  test('T5: unhashed JS asset outside /finance/assets/ uses fallback caching', () => {
    const resp = new Response('console.log("unhashed");', {
      status: 200,
      headers: { 'content-type': 'application/javascript' }
    });
    const result = addSecurityHeaders(resp, { requestPath: '/finance/scripts/legacy.js' });

    assert.strictEqual(result.headers.get('cache-control'), 'public, max-age=3600, stale-while-revalidate=86400');
  });

  test('T6: HTML responses strictly retain no-store, must-revalidate', async () => {
    const req = new Request('https://techtrekgt.com/finance', { method: 'GET' });
    const res = await worker.fetch(req, dummyEnv, {});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, must-revalidate');
    assert.strictEqual(res.headers.get('pragma'), 'no-cache');
    assert.strictEqual(res.headers.get('expires'), '0');
  });

  test('T7: JSON responses strictly retain no-store', async () => {
    const req = new Request('https://techtrekgt.com/api/auth/me', { method: 'GET' });
    const res = await worker.fetch(req, dummyEnv, {});

    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  });

  test('T8: error responses (404/500) do NOT receive immutable caching', () => {
    const notFoundResp = new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain' }
    });
    const result = addSecurityHeaders(notFoundResp, { requestPath: '/finance/assets/missing.js' });

    assert.notStrictEqual(result.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });
});
