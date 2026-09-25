import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as forgotPasswordPost } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { hashPassword, ERROR_CODES } from '../functions/utils/auth.js';
import worker from '../src/worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';
const TEST_CODE_HMAC_SECRET = 'test-code-hmac-secret-32-bytes-long';

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

describe('Phase 2: Account-Keyed Rate Limiting Tests', () => {
  let mockDb;
  let kvStore;
  let mockKv;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    kvStore = new Map();
    mockKv = {
      async get(key) { return kvStore.get(key) || null; },
      async put(key, val) { kvStore.set(key, String(val)); }
    };
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET,
      RATE_LIMIT_KV: mockKv
    };
  });

  test('distributed credential stuffing against a single email address is throttled by login-account limiter', async () => {
    const targetEmail = 'victim@techtrekgt.com';
    const pwHash = await hashPassword('CorrectPassword123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-victim', targetEmail, pwHash, 'Victim User', 'user', 0).run();

    // Perform 10 failed login attempts from 10 completely different source IPs
    for (let i = 1; i <= 10; i++) {
      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': `198.51.100.${i}`
        },
        body: JSON.stringify({ email: targetEmail, password: 'wrong-password' })
      });
      const res = await loginPost({ request: req, env, requestId: `req-dist-login-${i}` });
      assert.strictEqual(res.status, 401, `Attempt ${i} from distinct IP should pass rate limit and fail with 401`);
    }

    // 11th attempt from a brand-new 11th source IP against the SAME target email
    const req11 = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.99'
      },
      body: JSON.stringify({ email: targetEmail, password: 'even-correct-password-should-be-blocked' })
    });
    const res11 = await loginPost({ request: req11, env, requestId: 'req-dist-login-11' });
    assert.strictEqual(res11.status, 429, '11th attempt from distinct source IP against same account must return 429');

    const body11 = await res11.json();
    assert.strictEqual(body11.code, ERROR_CODES.RATE_LIMITED);
    assert.strictEqual(body11.error, 'Too many requests. Please wait and try again.');
    assert.ok(res11.headers.get('Retry-After'), 'Must include Retry-After header');
  });

  test('IP-based rate limit still runs first and blocks credential spraying across multiple accounts', async () => {
    const singleAttackerIp = '203.0.113.55';

    // 10 attempts from the same IP targeting 10 different email addresses
    for (let i = 1; i <= 10; i++) {
      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': singleAttackerIp
        },
        body: JSON.stringify({ email: `user-${i}@example.com`, password: 'password123' })
      });
      const res = await loginPost({ request: req, env, requestId: `req-spray-${i}` });
      assert.strictEqual(res.status, 401, `Attempt ${i} from same IP should pass initial rate limit`);
    }

    // 11th attempt from the same IP targeting yet another new account
    const req11 = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': singleAttackerIp
      },
      body: JSON.stringify({ email: 'user-11@example.com', password: 'password123' })
    });
    const res11 = await loginPost({ request: req11, env, requestId: 'req-spray-11' });
    assert.strictEqual(res11.status, 429, '11th attempt from same IP must be blocked by IP rate limit');
    const body11 = await res11.json();
    assert.strictEqual(body11.code, ERROR_CODES.RATE_LIMITED);
  });

  test('distributed forgot-password requests targeting one email are throttled by forgot-account limiter', async () => {
    const targetEmail = 'target-forgot@techtrekgt.com';
    const pwHash = await hashPassword('Password123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-target-forgot', targetEmail, pwHash, 'Target Forgot', 'user', 0).run();

    // 5 attempts from 5 distinct IPs
    for (let i = 1; i <= 5; i++) {
      const req = new Request('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': `198.51.100.${i}`
        },
        body: JSON.stringify({ email: targetEmail })
      });
      const res = await forgotPasswordPost({ request: req, env, requestId: `req-forgot-${i}` });
      assert.strictEqual(res.status, 200, `Attempt ${i} from distinct IP should succeed`);
    }

    // 6th attempt from a 6th distinct source IP targeting the same email
    const req6 = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.99'
      },
      body: JSON.stringify({ email: targetEmail })
    });
    const res6 = await forgotPasswordPost({ request: req6, env, requestId: 'req-forgot-6' });
    assert.strictEqual(res6.status, 429, '6th forgot-password attempt against same email from distinct IP must return 429');
    const body6 = await res6.json();
    assert.strictEqual(body6.code, ERROR_CODES.RATE_LIMITED);
  });

  test('distinct rate limit key prefixes ensure IP and account namespaces do not collide', async () => {
    const email = 'prefix-check@techtrekgt.com';
    const ip = '198.51.100.42';

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': ip
      },
      body: JSON.stringify({ email, password: 'any' })
    });

    await loginPost({ request: req, env, requestId: 'req-prefix-check' });

    // Inspect keys stored in KV
    const storedKeys = Array.from(kvStore.keys());
    const ipKey = storedKeys.find(k => k.startsWith('rl:login:198.51.100.42:'));
    const accountKey = storedKeys.find(k => k.startsWith(`rl:login-account:${email}:`));

    assert.ok(ipKey, 'KV store must have IP-keyed entry with login: prefix');
    assert.ok(accountKey, 'KV store must have account-keyed entry with login-account: prefix');
    assert.notStrictEqual(ipKey, accountKey, 'IP and account keys must not collide');
  });
});
