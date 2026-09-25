import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestPost as forgotPasswordPost } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordPost } from '../functions/api/auth/reset-password.js';
import { onRequestPost as updateProfilePost } from '../functions/api/auth/update-profile.js';
import { onRequestPost as verifyEmailPost } from '../functions/api/auth/verify-email.js';
import { onRequestPost as resendVerificationPost } from '../functions/api/auth/resend-verification.js';
import { onRequestPost as confirmEmailChangePost } from '../functions/api/auth/confirm-email-change.js';
import { hashPassword, issueSession, hmacHex, clearMemoryUserCache } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-session-tokens-32bytes';
const TEST_CODE_HMAC_SECRET = 'test-code-hmac-secret-key-for-otps-32bytes';

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

describe('REM-09: Dedicated CODE_HMAC_SECRET for One-Time Codes', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
  });

  // 1. Missing CODE_HMAC_SECRET produces clear 503 SERVICE_UNAVAILABLE
  test('missing CODE_HMAC_SECRET produces 503 on register', async () => {
    const envMissing = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const req = new Request('https://techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Password123!',
        securityQuestion: 'Pet?',
        securityAnswer: 'Dog'
      })
    });
    const res = await registerPost({ request: req, env: envMissing });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.code, 'SERVICE_UNAVAILABLE');
  });

  test('missing CODE_HMAC_SECRET produces 503 on forgot-password', async () => {
    const envMissing = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const req = new Request('https://techtrekgt.com/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com' })
    });
    const res = await forgotPasswordPost({ request: req, env: envMissing });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.code, 'SERVICE_UNAVAILABLE');
  });

  test('missing CODE_HMAC_SECRET produces 503 on reset-password', async () => {
    const envMissing = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const req = new Request('https://techtrekgt.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        token: '12345678',
        newPassword: 'NewPassword123!'
      })
    });
    const res = await resetPasswordPost({ request: req, env: envMissing });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.code, 'SERVICE_UNAVAILABLE');
  });

  test('missing CODE_HMAC_SECRET produces 503 on update-profile', async () => {
    const envMissing = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const req = new Request('https://techtrekgt.com/api/auth/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice New' })
    });
    const res = await updateProfilePost({ request: req, env: envMissing });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.code, 'SERVICE_UNAVAILABLE');
  });

  test('missing CODE_HMAC_SECRET produces 503 on verify-email', async () => {
    const pwHash = await hashPassword('Password123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-1', 'alice@example.com', pwHash, 'Alice', 'user', 0, 'Active', 0, new Date().toISOString()).run();

    const envWithJwt = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const { token, csrf } = await issueSession(envWithJwt, { id: 'usr-1', email: 'alice@example.com', name: 'Alice', token_version: 0 }, { rememberMe: false });

    const envMissing = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const req = new Request('https://techtrekgt.com/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ code: '12345678' })
    });
    const res = await verifyEmailPost({ request: req, env: envMissing });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.code, 'SERVICE_UNAVAILABLE');
  });

  test('missing CODE_HMAC_SECRET produces 503 on resend-verification', async () => {
    const pwHash = await hashPassword('Password123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-1', 'alice@example.com', pwHash, 'Alice', 'user', 0, 'Active', 0, new Date().toISOString()).run();

    const envWithJwt = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const { token, csrf } = await issueSession(envWithJwt, { id: 'usr-1', email: 'alice@example.com', name: 'Alice', token_version: 0 }, { rememberMe: false });

    const envMissing = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const req = new Request('https://techtrekgt.com/api/auth/resend-verification', {
      method: 'POST',
      headers: {
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      }
    });
    const res = await resendVerificationPost({ request: req, env: envMissing });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.code, 'SERVICE_UNAVAILABLE');
  });

  test('missing CODE_HMAC_SECRET produces 503 on confirm-email-change', async () => {
    const pwHash = await hashPassword('Password123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, pending_email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-1', 'alice@example.com', 'new@example.com', pwHash, 'Alice', 'user', 0, 'Active', 1, new Date().toISOString()).run();

    const envWithJwt = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const { token, csrf } = await issueSession(envWithJwt, { id: 'usr-1', email: 'alice@example.com', name: 'Alice', token_version: 0 }, { rememberMe: false });

    const envMissing = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const req = new Request('https://techtrekgt.com/api/auth/confirm-email-change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ code: '12345678' })
    });
    const res = await confirmEmailChangePost({ request: req, env: envMissing });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.code, 'SERVICE_UNAVAILABLE');
  });

  // 2. Functional code verification with CODE_HMAC_SECRET
  test('verify-email verifies code generated under CODE_HMAC_SECRET', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET };
    const pwHash = await hashPassword('Password123!');
    const email = 'verify-test@example.com';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-vfy', email, pwHash, 'Verify Test', 'user', 0, 'Active', 0, new Date().toISOString()).run();

    const code = '55556666';
    const codeHash = await hmacHex(TEST_CODE_HMAC_SECRET, `verify:${email}:${code}`);
    await mockDb.prepare(
      'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('vfy-ok', 'usr-vfy', email, codeHash, Date.now() + 86400000, Date.now()).run();

    const { token, csrf } = await issueSession(env, { id: 'usr-vfy', email, name: 'Verify Test', token_version: 0 }, { rememberMe: false });
    const req = new Request('https://techtrekgt.com/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ code })
    });

    const res = await verifyEmailPost({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

  // 3. Forward-only rotation: In-flight code issued under JWT_SECRET fails verification under CODE_HMAC_SECRET
  test('in-flight code generated under JWT_SECRET fails verification under CODE_HMAC_SECRET without crashing', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET };
    const pwHash = await hashPassword('Password123!');
    const email = 'inflight@example.com';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-inflight', email, pwHash, 'Inflight User', 'user', 0, 'Active', 0, new Date().toISOString()).run();

    const code = '99998888';
    // Pre-rotation: code was HMACed using JWT_SECRET
    const oldCodeHash = await hmacHex(TEST_JWT_SECRET, `verify:${email}:${code}`);
    await mockDb.prepare(
      'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('vfy-inflight', 'usr-inflight', email, oldCodeHash, Date.now() + 86400000, Date.now()).run();

    const { token, csrf } = await issueSession(env, { id: 'usr-inflight', email, name: 'Inflight User', token_version: 0 }, { rememberMe: false });
    const req = new Request('https://techtrekgt.com/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ code })
    });

    const res = await verifyEmailPost({ request: req, env });
    // Returns 400 Invalid verification code (attempt counted, safe rejection, no 500 crash)
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'Invalid verification code.');
  });
});
