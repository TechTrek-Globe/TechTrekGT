import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkRateLimit } from '../functions/utils/rateLimit.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestPost as securityQuestionPost } from '../functions/api/auth/security-question.js';
import { onRequestPost as updateProfilePost } from '../functions/api/auth/update-profile.js';
import { hashPassword, createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec("ALTER TABLE users ADD COLUMN amazon_api_token TEXT;");
  db.exec(auctionSchema);

  return {
    _raw: db,
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          const stmt = db.prepare(sql);
          return stmt.get(...boundParams) || null;
        },
        async all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...boundParams) };
        },
        async run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    }
  };
}

function createWorkingKV() {
  const store = new Map();
  return {
    async get(key) {
      return store.get(key) || null;
    },
    async put(key, val) {
      store.set(key, String(val));
    }
  };
}

function createThrowingKV(errorMessage = 'Simulated KV Network Failure') {
  return {
    async get() {
      throw new Error(errorMessage);
    },
    async put() {
      throw new Error(errorMessage);
    }
  };
}

describe('[MED-1] Rate limiter failClosed support and brute-force protection', () => {
  let mockDb;
  const testUser = {
    id: 'usr-med1-test-user',
    email: 'med1user@techtrekgt.test',
    password: 'Password123!',
    name: 'MED-1 Test User',
    securityQuestion: 'Favorite food?',
    securityAnswer: 'Pierogi'
  };

  beforeEach(async () => {
    mockDb = createMockD1();
    const passwordHash = await hashPassword(testUser.password);
    const answerHash = await hashPassword(testUser.securityAnswer.toLowerCase().trim());
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, status, role, email_verified, security_question, security_answer_hash)
      VALUES ('${testUser.id}', '${testUser.email}', '${passwordHash}', '${testUser.name}', 'Active', 'user', 1, '${testUser.securityQuestion}', '${answerHash}');
    `);
  });

  describe('checkRateLimit Unit Behavior', () => {
    test('checkRateLimit defaults to fail-open (allowed: true) when KV is missing and failClosed is false/omitted', async () => {
      const omitted = await checkRateLimit(null, 'test-key', 5, 60);
      assert.deepStrictEqual(omitted, { allowed: true });

      const explicitFalse = await checkRateLimit(null, 'test-key', 5, 60, false);
      assert.deepStrictEqual(explicitFalse, { allowed: true });

      const objectFalse = await checkRateLimit(undefined, 'test-key', 5, 60, { failClosed: false });
      assert.deepStrictEqual(objectFalse, { allowed: true });
    });

    test('checkRateLimit returns { allowed: false, retryAfter: 60 } when KV is missing and failClosed is true', async () => {
      const boolTrue = await checkRateLimit(null, 'test-key', 5, 60, true);
      assert.deepStrictEqual(boolTrue, { allowed: false, retryAfter: 60 });

      const objTrue = await checkRateLimit(undefined, 'test-key', 5, 60, { failClosed: true });
      assert.deepStrictEqual(objTrue, { allowed: false, retryAfter: 60 });
    });

    test('checkRateLimit defaults to fail-open (allowed: true) when KV throws and failClosed is false/omitted', async () => {
      const throwingKv = createThrowingKV();
      const res = await checkRateLimit(throwingKv, 'test-key', 5, 60);
      assert.deepStrictEqual(res, { allowed: true });

      const explicitFalse = await checkRateLimit(throwingKv, 'test-key', 5, 60, false);
      assert.deepStrictEqual(explicitFalse, { allowed: true });
    });

    test('checkRateLimit returns { allowed: false, retryAfter: 60 } when KV throws and failClosed is true', async () => {
      const throwingKv = createThrowingKV();
      const boolTrue = await checkRateLimit(throwingKv, 'test-key', 5, 60, true);
      assert.deepStrictEqual(boolTrue, { allowed: false, retryAfter: 60 });

      const objTrue = await checkRateLimit(throwingKv, 'test-key', 5, 60, { failClosed: true });
      assert.deepStrictEqual(objTrue, { allowed: false, retryAfter: 60 });
    });

    test('checkRateLimit behaves normally with working KV under threshold and throttles when exceeded', async () => {
      const kv = createWorkingKV();
      for (let i = 0; i < 3; i++) {
        const res = await checkRateLimit(kv, 'counter-key', 3, 60, true);
        assert.strictEqual(res.allowed, true);
      }
      const throttled = await checkRateLimit(kv, 'counter-key', 3, 60, true);
      assert.strictEqual(throttled.allowed, false);
      assert.ok(throttled.retryAfter > 0);
    });
  });

  describe('Endpoint Fail-Closed Verification (login & register)', () => {
    test('POST /api/auth/login returns 429 when env.RATE_LIMIT_KV is null/undefined', async () => {
      const req = new Request('https://techtrekgt.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.1' },
        body: JSON.stringify({ email: testUser.email, password: testUser.password })
      });

      const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
      const res = await loginPost({ request: req, env });

      assert.strictEqual(res.status, 429);
      assert.strictEqual(res.headers.get('Retry-After'), '60');
      const body = await res.json();
      assert.strictEqual(body.error, 'Too many login attempts. Please wait.');
    });

    test('POST /api/auth/login returns 429 when env.RATE_LIMIT_KV throws an error', async () => {
      const req = new Request('https://techtrekgt.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.2' },
        body: JSON.stringify({ email: testUser.email, password: testUser.password })
      });

      const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: createThrowingKV() };
      const res = await loginPost({ request: req, env });

      assert.strictEqual(res.status, 429);
      assert.strictEqual(res.headers.get('Retry-After'), '60');
      const body = await res.json();
      assert.strictEqual(body.error, 'Too many login attempts. Please wait.');
    });

    test('POST /api/auth/login succeeds 200 when env.RATE_LIMIT_KV is bound and working', async () => {
      const req = new Request('https://techtrekgt.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.3' },
        body: JSON.stringify({ email: testUser.email, password: testUser.password })
      });

      const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: createWorkingKV() };
      const res = await loginPost({ request: req, env });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
    });

    test('POST /api/auth/register returns 429 when env.RATE_LIMIT_KV is null/undefined', async () => {
      const req = new Request('https://techtrekgt.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.4' },
        body: JSON.stringify({
          name: 'New Registered User',
          email: 'newuser@techtrekgt.test',
          password: 'Password123!',
          securityQuestion: 'First car?',
          securityAnswer: 'Civic'
        })
      });

      const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
      const res = await registerPost({ request: req, env });

      assert.strictEqual(res.status, 429);
      assert.strictEqual(res.headers.get('Retry-After'), '60');
      const body = await res.json();
      assert.strictEqual(body.error, 'Too many registration attempts. Please wait.');
    });

    test('POST /api/auth/register returns 429 when env.RATE_LIMIT_KV throws an error', async () => {
      const req = new Request('https://techtrekgt.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.5' },
        body: JSON.stringify({
          name: 'Throwing KV User',
          email: 'throwkv@techtrekgt.test',
          password: 'Password123!',
          securityQuestion: 'First car?',
          securityAnswer: 'Civic'
        })
      });

      const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: createThrowingKV() };
      const res = await registerPost({ request: req, env });

      assert.strictEqual(res.status, 429);
      assert.strictEqual(res.headers.get('Retry-After'), '60');
      const body = await res.json();
      assert.strictEqual(body.error, 'Too many registration attempts. Please wait.');
    });

    test('POST /api/auth/register succeeds 201 when env.RATE_LIMIT_KV is bound and working', async () => {
      const req = new Request('https://techtrekgt.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.6' },
        body: JSON.stringify({
          name: 'Valid Registered User',
          email: 'validreg@techtrekgt.test',
          password: 'Password123!',
          securityQuestion: 'First pet?',
          securityAnswer: 'Kitten'
        })
      });

      const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: createWorkingKV() };
      const res = await registerPost({ request: req, env });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
    });
  });

  describe('PERF-007: Auth-adjacent endpoints fail closed', () => {
    test('POST /api/auth/security-question fails closed (returns 429) when RATE_LIMIT_KV is null', async () => {
      const req = new Request('https://techtrekgt.com/api/auth/security-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.7' },
        body: JSON.stringify({ email: testUser.email })
      });

      const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
      const res = await securityQuestionPost({ request: req, env });

      assert.strictEqual(res.status, 429);
      const body = await res.json();
      assert.ok(body.error);
    });

    test('POST /api/auth/update-profile fails open (allows request) when RATE_LIMIT_KV is null', async () => {
      const token = await createToken({ userId: testUser.id, email: testUser.email }, TEST_JWT_SECRET);
      const req = new Request('https://techtrekgt.com/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${token}`,
          'CF-Connecting-IP': '198.51.100.8'
        },
        body: JSON.stringify({ name: 'Updated Name Only' })
      });

      const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
      const res = await updateProfilePost({ request: req, env });

      assert.notStrictEqual(res.status, 429);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.user.name, 'Updated Name Only');
    });
  });
});
