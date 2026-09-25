import { test, describe } from 'node:test';
import assert from 'node:assert';
import worker from '../src/worker.js';

describe('Phase 2 Stage 7: Routing Cleanup', () => {
  const dummyEnv = {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }) })
    },
    ASSETS: {
      fetch: async () => new Response('assets-index-html', { status: 200, headers: { 'content-type': 'text/html' } })
    },
    JWT_SECRET: 'super-secret-jwt-key-32-bytes-long-for-testing'
  };

  const prodEnv = {
    ...dummyEnv,
    ENVIRONMENT: 'production'
  };

  // S7T1: Bare / returns 301 redirect to canonical /finance
  test('S7T1: bare / returns 301 redirect to canonical /finance mount', async () => {
    const req = new Request('https://techtrekgt.com/', { method: 'GET' });
    const res = await worker.fetch(req, dummyEnv, {});
    assert.strictEqual(res.status, 301);
    assert.strictEqual(res.headers.get('Location'), 'https://techtrekgt.com/finance');
  });

  // S7T2: In production, http: protocol returns 301 to https:
  test('S7T2: in production, http: returns 301 redirect to https:', async () => {
    const req = new Request('http://techtrekgt.com/finance', {
      method: 'GET',
      headers: { 'cf-ray': 'dummy-ray-id' }
    });
    const res = await worker.fetch(req, prodEnv, {});
    assert.strictEqual(res.status, 301);
    assert.strictEqual(res.headers.get('Location'), 'https://techtrekgt.com/finance');
  });

  // S7T3: x-forwarded-proto alone does not trigger 301 redirect when protocol is https:
  test('S7T3: x-forwarded-proto does not trigger 301 redirect when protocol is https:', async () => {
    const req = new Request('https://techtrekgt.com/finance', {
      method: 'GET',
      headers: {
        'cf-ray': 'dummy-ray-id',
        'x-forwarded-proto': 'http'
      }
    });
    const res = await worker.fetch(req, dummyEnv, {});
    // Should NOT redirect to https, since it already is https (renders assets/HTML)
    assert.notStrictEqual(res.status, 301);
  });

  // S7T4: Outpost redirect is scoped to production
  test('S7T4: outpost sub-site redirect is scoped to production', async () => {
    // 1. In production: /Outpost redirects to /outpost
    const reqProd = new Request('https://techtrekgt.com/Outpost', {
      method: 'GET',
      headers: { 'cf-ray': 'dummy-ray-id' }
    });
    const resProd = await worker.fetch(reqProd, prodEnv, {});
    assert.strictEqual(resProd.status, 301);
    assert.strictEqual(resProd.headers.get('Location'), 'https://techtrekgt.com/outpost');

    // 2. In non-production (localhost): /auction does not trigger outpost redirect
    const reqLocal = new Request('http://localhost:5173/auction', {
      method: 'GET'
    });
    const resLocal = await worker.fetch(reqLocal, dummyEnv, {});
    assert.notStrictEqual(resLocal.status, 301);
  });
});
