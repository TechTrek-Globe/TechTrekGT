import { test, describe } from 'node:test';
import assert from 'node:assert';
import worker, { addSecurityHeaders } from '../src/worker.js';

describe('MED-4: Content-Security-Policy Nonce & unsafe-inline Removal', () => {
  test('addSecurityHeaders includes nonce in script-src and removes unsafe-inline', () => {
    const rawResponse = new Response('Hello World', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

    const testNonce = 'k4b9F_testNonce1234';
    const secured = addSecurityHeaders(rawResponse, false, 'https://techtrekgt.com', testNonce);

    const csp = secured.headers.get('Content-Security-Policy');
    assert.ok(csp, 'CSP header must be set');

    // Split CSP directives for precision testing
    const directives = Object.fromEntries(
      csp.split(';').map(d => {
        const parts = d.trim().split(/\s+/);
        return [parts[0], parts.slice(1)];
      })
    );

    // script-src assertions
    const scriptSrc = directives['script-src'];
    assert.ok(scriptSrc, 'script-src directive must exist in CSP');
    assert.ok(scriptSrc.includes(`'nonce-${testNonce}'`), `script-src must include 'nonce-${testNonce}'`);
    assert.ok(scriptSrc.includes("'self'"), "script-src must include 'self'");
    assert.ok(scriptSrc.includes('https://challenges.cloudflare.com'), 'script-src must allow Cloudflare challenges');
    assert.strictEqual(
      scriptSrc.includes("'unsafe-inline'"),
      false,
      "script-src must strictly NOT include 'unsafe-inline'"
    );

    // style-src assertions (lower priority, kept for now per instructions)
    const styleSrc = directives['style-src'];
    assert.ok(styleSrc, 'style-src directive must exist in CSP');
    assert.ok(styleSrc.includes("'unsafe-inline'"), "style-src retains 'unsafe-inline' as lower priority");
  });

  test('addSecurityHeaders supports options object signature', () => {
    const rawResponse = new Response('OK', { status: 200 });
    const testNonce = 'optNonce5678_abcd';

    const secured = addSecurityHeaders(rawResponse, {
      isLocalhost: false,
      requestOrigin: 'https://techtrekgt.com',
      nonce: testNonce
    });

    const csp = secured.headers.get('Content-Security-Policy');
    assert.ok(csp);
    assert.ok(csp.includes(`'nonce-${testNonce}'`));
    assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"));
  });

  test('addSecurityHeaders bypasses CSP and HSTS on localhost', () => {
    const rawResponse = new Response('dev', { status: 200 });
    const secured = addSecurityHeaders(rawResponse, true, 'http://localhost:3001', 'any-nonce');

    assert.strictEqual(secured.headers.get('Content-Security-Policy'), null);
    assert.strictEqual(secured.headers.get('Strict-Transport-Security'), null);
  });

  test('addSecurityHeaders falls back to non-nonce script-src if nonce is empty', () => {
    const rawResponse = new Response('fallback', { status: 200 });
    const secured = addSecurityHeaders(rawResponse, false, 'https://techtrekgt.com', '');

    const csp = secured.headers.get('Content-Security-Policy');
    assert.ok(csp);
    assert.ok(csp.includes("script-src 'self' https://challenges.cloudflare.com"));
    assert.ok(!csp.includes("'unsafe-inline' for scripts"));
    assert.strictEqual(csp.includes("'unsafe-inline' https://challenges.cloudflare.com"), false);
  });

  test('worker.fetch generates per-request unique nonces and attaches nonce CSP', async () => {
    const env = {
      DB: {
        prepare() {
          return {
            bind() { return this; },
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true })
          };
        }
      },
      RATE_LIMIT_KV: {
        get: async () => null,
        put: async () => {},
        delete: async () => {}
      },
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length-for-hmac'
    };

    // First request
    const req1 = new Request('https://techtrekgt.com/outpost/api/auth/me', {
      headers: { Origin: 'https://techtrekgt.com' }
    });
    const res1 = await worker.fetch(req1, env, {});
    const csp1 = res1.headers.get('Content-Security-Policy');
    assert.ok(csp1, 'Request 1 must have CSP header');

    const nonceMatch1 = csp1.match(/'nonce-([^']+)'/);
    assert.ok(nonceMatch1, 'Request 1 CSP must have nonce');
    const nonce1 = nonceMatch1[1];
    assert.ok(nonce1.length >= 16, 'Nonce must have sufficient length/entropy');

    // Second request
    const req2 = new Request('https://techtrekgt.com/outpost/api/auth/me', {
      headers: { Origin: 'https://techtrekgt.com' }
    });
    const res2 = await worker.fetch(req2, env, {});
    const csp2 = res2.headers.get('Content-Security-Policy');
    assert.ok(csp2, 'Request 2 must have CSP header');

    const nonceMatch2 = csp2.match(/'nonce-([^']+)'/);
    assert.ok(nonceMatch2, 'Request 2 CSP must have nonce');
    const nonce2 = nonceMatch2[1];

    // Nonces must be unique per request
    assert.notStrictEqual(nonce1, nonce2, 'Consecutive requests must generate distinct nonces');

    // Neither contains unsafe-inline in script-src
    assert.strictEqual(csp1.includes("script-src 'self' 'unsafe-inline'"), false);
    assert.strictEqual(csp2.includes("script-src 'self' 'unsafe-inline'"), false);
  });
});
