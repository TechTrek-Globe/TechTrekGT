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
import { hashPassword, issueSession, hmacHex, clearMemoryUserCache, issueOneTimeCode, ONE_TIME_CODE_TTL_MS, RESET_CODE_TTL_MS, VERIFY_CODE_TTL_MS, sendTransactionalEmail, sendResetEmail, sendVerificationEmail, sendEmailChangeNotification } from '../functions/utils/auth.js';

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

  // 4. Centralized TTL constants
  test('ONE_TIME_CODE_TTL_MS and RESET_CODE_TTL_MS constants match expected durations', () => {
    assert.strictEqual(ONE_TIME_CODE_TTL_MS, 24 * 60 * 60 * 1000);
    assert.strictEqual(VERIFY_CODE_TTL_MS, 24 * 60 * 60 * 1000);
    assert.strictEqual(RESET_CODE_TTL_MS, 15 * 60 * 1000);
  });

  // 5. issueOneTimeCode helper unit tests
  test('issueOneTimeCode generates valid 8-digit code, HMACs with CODE_HMAC_SECRET, and invalidates prior records', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET };
    const userId = 'usr-otc-test';
    const email = 'otc@example.com';

    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, email, 'hash', 'OTC User', 'user', 0, 'Active', 0, new Date().toISOString()).run();

    // First issuance
    const res1 = await issueOneTimeCode(env, {
      table: 'email_verifications',
      userId,
      email,
      purpose: 'verify',
      ttlMs: ONE_TIME_CODE_TTL_MS
    });

    assert.ok(res1.code);
    assert.match(res1.code, /^\d{8}$/);
    assert.ok(res1.verificationId.startsWith('vfy-'));

    // Check DB record
    const row1 = await mockDb.prepare('SELECT id, token, used, attempts FROM email_verifications WHERE id = ?').bind(res1.verificationId).first();
    assert.ok(row1);
    assert.strictEqual(row1.used, 0);
    const expectedHash1 = await hmacHex(TEST_CODE_HMAC_SECRET, `verify:${email}:${res1.code}`);
    assert.strictEqual(row1.token, expectedHash1);

    // Second issuance (should invalidate first record)
    const res2 = await issueOneTimeCode(env, {
      table: 'email_verifications',
      userId,
      email,
      purpose: 'verify',
      ttlMs: ONE_TIME_CODE_TTL_MS
    });

    assert.match(res2.code, /^\d{8}$/);
    const row1After = await mockDb.prepare('SELECT used FROM email_verifications WHERE id = ?').bind(res1.verificationId).first();
    assert.strictEqual(row1After.used, 1, 'Prior verification record must be marked as used');

    const row2 = await mockDb.prepare('SELECT used FROM email_verifications WHERE id = ?').bind(res2.verificationId).first();
    assert.strictEqual(row2.used, 0, 'New verification record must be active');

    // Test password_resets issuance
    const resReset = await issueOneTimeCode(env, {
      table: 'password_resets',
      userId,
      email,
      purpose: 'reset',
      ttlMs: RESET_CODE_TTL_MS
    });

    assert.ok(resReset.verificationId.startsWith('rst-'));
    assert.match(resReset.code, /^\d{8}$/);
    const resetRow = await mockDb.prepare('SELECT id, token, used FROM password_resets WHERE id = ?').bind(resReset.verificationId).first();
    assert.ok(resetRow);
    assert.strictEqual(resetRow.used, 0);
    const expectedResetHash = await hmacHex(TEST_CODE_HMAC_SECRET, `reset:${email}:${resReset.code}`);
    assert.strictEqual(resetRow.token, expectedResetHash);
  });

  // 6. sendTransactionalEmail shared helper tests
  test('sendTransactionalEmail handles unconfigured env gracefully and formats request', async () => {
    const originalConsoleError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(' '));

    try {
      const okNoEnv = await sendTransactionalEmail({}, {
        to: 'user@example.com',
        subject: 'Test Subject',
        bodyLines: ['Hello', 'World'],
        logPrefix: '[email-verify]',
        devFallbackMessage: 'dev fallback test'
      });
      assert.strictEqual(okNoEnv, false);
      assert.ok(errors.some(e => e.includes('[email-verify] dev fallback test')));

      const originalFetch = globalThis.fetch;
      try {
        let sentBody = null;
        globalThis.fetch = async (url, opts) => {
          sentBody = JSON.parse(opts.body);
          return new Response(JSON.stringify({ id: 'resend-123' }), { status: 200 });
        };

        const okSuccess = await sendTransactionalEmail({
          RESEND_API_KEY: 'test-key',
          MAIL_FROM: 'noreply@techtrekgt.com'
        }, {
          to: 'user@example.com',
          subject: 'Test Subject',
          bodyLines: ['Line 1', 'Line 2'],
          logPrefix: '[test]'
        });

        assert.strictEqual(okSuccess, true);
        assert.deepStrictEqual(sentBody.to, ['user@example.com']);
        assert.strictEqual(sentBody.subject, 'Test Subject');
        assert.strictEqual(sentBody.text, 'Line 1\nLine 2');
        assert.strictEqual(sentBody.from, 'noreply@techtrekgt.com');

        globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });
        const okFail = await sendTransactionalEmail({
          RESEND_API_KEY: 'test-key',
          MAIL_FROM: 'noreply@techtrekgt.com'
        }, {
          to: 'user@example.com',
          subject: 'Test',
          bodyLines: ['Hi'],
          logPrefix: '[test-fail]'
        });
        assert.strictEqual(okFail, false);
        assert.ok(errors.some(e => e.includes('[test-fail] mail provider returned 401')));
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      console.error = originalConsoleError;
    }
  });

  // 7. Wrapper functions: sendResetEmail, sendVerificationEmail, sendEmailChangeNotification
  test('sendResetEmail, sendVerificationEmail, and sendEmailChangeNotification delegate correctly', async () => {
    const originalConsoleError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(' '));

    const originalFetch = globalThis.fetch;
    let lastSent = null;

    try {
      // Test dev fallbacks when unconfigured
      const resetDev = await sendResetEmail({}, 'reset@example.com', '12345678', 'Favorite food?');
      assert.strictEqual(resetDev, false);
      assert.ok(errors.some(e => e.includes('[forgot-password]') && e.includes('12345678')));

      const verifyDev = await sendVerificationEmail({}, 'verify@example.com', '87654321');
      assert.strictEqual(verifyDev, false);
      assert.ok(errors.some(e => e.includes('[email-verify]') && e.includes('87654321')));

      const noticeDev = await sendEmailChangeNotification({}, 'old@example.com', 'new@example.com');
      assert.strictEqual(noticeDev, false);
      assert.ok(errors.some(e => e.includes('[email-change-notice]') && e.includes('old@example.com -> new@example.com')));

      // Test configured delivery
      globalThis.fetch = async (url, opts) => {
        lastSent = JSON.parse(opts.body);
        return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 });
      };

      const envConfigured = {
        RESEND_API_KEY: 'mock-resend-key',
        MAIL_FROM: 'noreply@techtrekgt.com'
      };

      // sendResetEmail
      const resetOk = await sendResetEmail(envConfigured, 'reset@example.com', '11223344', 'Favorite city?');
      assert.strictEqual(resetOk, true);
      assert.deepStrictEqual(lastSent.to, ['reset@example.com']);
      assert.strictEqual(lastSent.subject, 'Your TechTrek password reset code');
      assert.ok(lastSent.text.includes('Your reset code is: 11223344'));
      assert.ok(lastSent.text.includes('Favorite city?'));

      // sendVerificationEmail (register)
      const verifyRegOk = await sendVerificationEmail(envConfigured, 'new@example.com', '99887766', 'register');
      assert.strictEqual(verifyRegOk, true);
      assert.deepStrictEqual(lastSent.to, ['new@example.com']);
      assert.strictEqual(lastSent.subject, 'Verify your TechTrek account email');
      assert.ok(lastSent.text.includes('Your verification code is: 99887766'));
      assert.ok(lastSent.text.includes('Thank you for registering with TechTrek.'));

      // sendVerificationEmail (change)
      const verifyChangeOk = await sendVerificationEmail(envConfigured, 'pending@example.com', '55443322', 'change');
      assert.strictEqual(verifyChangeOk, true);
      assert.deepStrictEqual(lastSent.to, ['pending@example.com']);
      assert.strictEqual(lastSent.subject, 'Verify your new TechTrek email address');
      assert.ok(lastSent.text.includes('Your verification code is: 55443322'));
      assert.ok(lastSent.text.includes('You requested to change your TechTrek email address.'));

      // sendEmailChangeNotification (sends to OLD email, references NEW email)
      const noticeOk = await sendEmailChangeNotification(envConfigured, 'old@example.com', 'new@example.com');
      assert.strictEqual(noticeOk, true);
      assert.deepStrictEqual(lastSent.to, ['old@example.com']);
      assert.strictEqual(lastSent.subject, 'Security Alert: Email change requested for your TechTrek account');
      assert.ok(lastSent.text.includes('New address requested: new@example.com'));
    } finally {
      console.error = originalConsoleError;
      globalThis.fetch = originalFetch;
    }
  });
});

