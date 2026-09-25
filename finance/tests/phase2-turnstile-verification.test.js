import { test, describe, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { hashPassword, ERROR_CODES } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';
const TEST_CODE_HMAC_SECRET = 'test-code-hmac-secret-32-bytes-long';
const TEST_TURNSTILE_SECRET = '0x4AAAAAAAJX-test-secret-key';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  return {
    _raw: db,
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) { boundParams = params; return this; },
        async first() { return db.prepare(sql).get(...boundParams) || null; },
        async all() { return { results: db.prepare(sql).all(...boundParams) }; },
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

describe('Phase 2: Cloudflare Turnstile Server-Side Verification Tests', () => {
  let mockDb;
  let env;
  const originalFetch = globalThis.fetch;
  let mockSiteverifyHandler = null;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET,
      TURNSTILE_SECRET_KEY: TEST_TURNSTILE_SECRET
    };

    mockSiteverifyHandler = null;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
        if (mockSiteverifyHandler) {
          return mockSiteverifyHandler(url, options);
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(url, options);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  test('login is rejected with VALIDATION_ERROR when TURNSTILE_SECRET_KEY is configured and token is missing', async () => {
    const pwHash = await hashPassword('Password123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t1', 'turnstile-user@example.com', pwHash, 'Turnstile User', 'user', 0).run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'turnstile-user@example.com',
        password: 'Password123!'
        // turnstileToken omitted
      })
    });

    const res = await loginPost({ request: req, env, requestId: 'test-ts-missing' });
    assert.strictEqual(res.status, 400, 'Must return 400 when Turnstile token is missing');

    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
    assert.strictEqual(body.error, 'Security verification failed. Please try again.');
  });

  test('login is rejected when Turnstile siteverify returns failure', async () => {
    mockSiteverifyHandler = async (url, options) => {
      return new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const pwHash = await hashPassword('Password123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t2', 'turnstile-fail@example.com', pwHash, 'Turnstile User', 'user', 0).run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'turnstile-fail@example.com',
        password: 'Password123!',
        turnstileToken: 'bad-or-expired-token'
      })
    });

    const res = await loginPost({ request: req, env, requestId: 'test-ts-fail' });
    assert.strictEqual(res.status, 400);

    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
    assert.strictEqual(body.error, 'Security verification failed. Please try again.');
  });

  test('login succeeds when Turnstile siteverify returns success', async () => {
    let siteverifyCalled = false;
    mockSiteverifyHandler = async (url, options) => {
      siteverifyCalled = true;
      assert.strictEqual(options.method, 'POST');
      assert.ok(options.body instanceof FormData);
      assert.strictEqual(options.body.get('secret'), TEST_TURNSTILE_SECRET);
      assert.strictEqual(options.body.get('response'), 'valid-turnstile-token');
      return new Response(JSON.stringify({ success: true, challenge_ts: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const pwHash = await hashPassword('Password123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t3', 'turnstile-ok@example.com', pwHash, 'Turnstile OK', 'user', 0).run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'turnstile-ok@example.com',
        password: 'Password123!',
        turnstileToken: 'valid-turnstile-token'
      })
    });

    const res = await loginPost({ request: req, env, requestId: 'test-ts-ok' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(siteverifyCalled, true, 'Must call siteverify endpoint');

    const body = await res.json();
    assert.strictEqual(body.success, true);
  });

  test('register is rejected with VALIDATION_ERROR when TURNSTILE_SECRET_KEY is configured and token is missing', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New User',
        email: 'new-user-ts@example.com',
        password: 'StrongPassword123!',
        securityQuestion: 'Pet name?',
        securityAnswer: 'Fido'
        // turnstileToken omitted
      })
    });

    const res = await registerPost({ request: req, env, requestId: 'test-reg-ts-missing' });
    assert.strictEqual(res.status, 400);

    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.VALIDATION_ERROR);
    assert.strictEqual(body.error, 'Security verification failed. Please try again.');
  });

  test('register succeeds when Turnstile siteverify returns success', async () => {
    let siteverifyCalled = false;
    mockSiteverifyHandler = async (url, options) => {
      siteverifyCalled = true;
      assert.strictEqual(options.body.get('response'), 'valid-reg-token');
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Verified User',
        email: 'new-verified@example.com',
        password: 'StrongPassword123!',
        securityQuestion: 'Pet name?',
        securityAnswer: 'Fido',
        turnstileToken: 'valid-reg-token'
      })
    });

    const res = await registerPost({ request: req, env, requestId: 'test-reg-ts-ok' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(siteverifyCalled, true);
  });

  test('when TURNSTILE_SECRET_KEY is unset, verification is skipped gracefully', async () => {
    const envNoSecret = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET
      // TURNSTILE_SECRET_KEY omitted
    };

    const pwHash = await hashPassword('Password123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t4', 'turnstile-skipped@example.com', pwHash, 'Turnstile Skipped', 'user', 0).run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'turnstile-skipped@example.com',
        password: 'Password123!'
      })
    });

    const res = await loginPost({ request: req, env: envNoSecret, requestId: 'test-ts-skipped' });
    assert.strictEqual(res.status, 200, 'Must allow login when TURNSTILE_SECRET_KEY is not configured');
  });
});
