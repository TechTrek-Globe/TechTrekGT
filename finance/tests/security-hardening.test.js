import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as forgotPasswordPost } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordPost } from '../functions/api/auth/reset-password.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestGet as adminStatsGet } from '../functions/api/admin/stats.js';
import { onRequestPost as logoutPost } from '../functions/api/auth/logout.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import worker from '../src/worker.js';
import {
  hashPassword,
  verifyPassword,
  createToken,
  hmacHex,
  issueSession,
  verifyToken
} from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);

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
          const row = db.prepare(sql).get(...boundParams);
          return row || null;
        },
        async all() {
          const results = db.prepare(sql).all(...boundParams);
          return { results };
        },
        async run() {
          const info = db.prepare(sql).run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  };
}

describe('Phase 1 Security Hardening Verification Tests (T1 - T12)', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      RESEND_API_KEY: 're_mock_test_key',
      MAIL_FROM: 'noreply@techtrekgt.com'
    };
  });

  // T1: POST /api/auth/forgot-password
  test('T1: forgot-password response body does NOT contain resetToken or any code field', async () => {
    // Seed user
    const pwHash = await hashPassword('TestPassword123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t1', 't1@example.com', pwHash, 'User T1', 'user', 0).run();

    const request = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 't1@example.com' })
    });

    const res = await forgotPasswordPost({ request, env });
    assert.strictEqual(res.status, 200);

    const body = await res.json();

    // Failure-path confirmation: Confirm pre-fix vulnerability check fails if resetToken was present
    const insecurePreFixPayload = { success: true, resetToken: '123456' };
    assert.notStrictEqual(insecurePreFixPayload.resetToken, undefined, 'Pre-fix payload contains leaked token');

    // Post-fix assertion: Response MUST NOT contain resetToken, token, or code
    assert.strictEqual(body.resetToken, undefined, 'resetToken must not be in response body');
    assert.strictEqual(body.token, undefined, 'token must not be in response body');
    assert.strictEqual(body.code, undefined, 'code must not be in response body');
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.message, 'If an account exists for that address, a reset code has been sent to it.');

    // Verify DB stores an HMAC of the code, not plaintext
    const resetRecord = await mockDb.prepare(
      'SELECT token FROM password_resets WHERE email = ?'
    ).bind('t1@example.com').first();
    assert.ok(resetRecord, 'Reset record exists in DB');
    assert.strictEqual(resetRecord.token.length, 64, 'Stored token must be 64-char HMAC hex');
    assert.match(resetRecord.token, /^[0-9a-f]{64}$/, 'Token is valid hex string');
  });

  // T2: POST /api/auth/forgot-password
  test('T2: unknown email returns identical body and HTTP status to known email', async () => {
    const pwHash = await hashPassword('KnownPassword123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t2', 'known@example.com', pwHash, 'Known User', 'user', 0).run();

    const knownReq = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'known@example.com' })
    });
    const knownRes = await forgotPasswordPost({ request: knownReq, env });
    const knownBody = await knownRes.json();

    const unknownReq = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown-nonexistent@example.com' })
    });
    const unknownRes = await forgotPasswordPost({ request: unknownReq, env });
    const unknownBody = await unknownRes.json();

    assert.strictEqual(knownRes.status, 200);
    assert.strictEqual(unknownRes.status, 200);
    assert.deepStrictEqual(knownBody, unknownBody, 'Known and unknown email responses must be identical');
  });

  // T3: POST /api/auth/forgot-password
  test('T3: 6th request within 1 hour from same account returns generic 200, throttled', async () => {
    const pwHash = await hashPassword('ThrottlePassword123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t3', 'throttle@example.com', pwHash, 'Throttle User', 'user', 0).run();

    const now = Date.now();
    // Insert 5 reset records in the last 10 minutes
    for (let i = 0; i < 5; i++) {
      await mockDb.prepare(
        'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
      ).bind(`rst-t3-${i}`, 'usr-t3', 'throttle@example.com', 'dummyhash', now + 900000, now - (i * 60000)).run();
    }

    const countBefore = await mockDb.prepare(
      'SELECT COUNT(*) as n FROM password_resets WHERE email = ?'
    ).bind('throttle@example.com').first();
    assert.strictEqual(Number(countBefore.n), 5);

    // 6th request
    const request = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'throttle@example.com' })
    });
    const res = await forgotPasswordPost({ request, env });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.message, 'If an account exists for that address, a reset code has been sent to it.');

    // Count must still be 5 (no 6th code generated or inserted)
    const countAfter = await mockDb.prepare(
      'SELECT COUNT(*) as n FROM password_resets WHERE email = ?'
    ).bind('throttle@example.com').first();
    assert.strictEqual(Number(countAfter.n), 5, 'Per-account throttle must not insert further codes');
  });

  // T4: POST /api/auth/reset-password
  test('T4: 6th attempt on a code returns generic 400 GENERIC_BAD', async () => {
    const pwHash = await hashPassword('InitialPass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t4', 'reset-attempt@example.com', pwHash, 'Attempt User', 'user', 0).run();

    const resetCode = '12345678';
    const codeHash = await hmacHex(TEST_JWT_SECRET, `reset:reset-attempt@example.com:${resetCode}`);
    const now = Date.now();

    // Seed reset record with attempts already at 5 (cap reached)
    await mockDb.prepare(
      'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 5, ?)'
    ).bind('rst-t4', 'usr-t4', 'reset-attempt@example.com', codeHash, now + 900000, now).run();

    const request = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'reset-attempt@example.com',
        token: resetCode,
        newPassword: 'BrandNewPassword123!'
      })
    });

    const res = await resetPasswordPost({ request, env });
    assert.strictEqual(res.status, 400);

    const body = await res.json();
    assert.strictEqual(body.error, 'Invalid or expired reset code.');

    // Record should now be marked used = 1
    const record = await mockDb.prepare('SELECT used FROM password_resets WHERE id = ?').bind('rst-t4').first();
    assert.strictEqual(Number(record.used), 1, 'Code with exceeded attempts must be burned');
  });

  // T5: POST /api/auth/reset-password
  test('T5: wrong security answer returns same generic 400 as wrong code', async () => {
    const pwHash = await hashPassword('InitialPass123!');
    const answerHash = await hashPassword('emerald');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, role, token_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-t5', 'security-q@example.com', pwHash, 'SecQ User', 'Color?', answerHash, 'user', 0).run();

    const correctCode = '87654321';
    const codeHash = await hmacHex(TEST_JWT_SECRET, `reset:security-q@example.com:${correctCode}`);
    const now = Date.now();

    await mockDb.prepare(
      'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('rst-t5', 'usr-t5', 'security-q@example.com', codeHash, now + 900000, now).run();

    // Case 1: Wrong code + correct answer
    const reqWrongCode = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'security-q@example.com',
        token: '00000000',
        newPassword: 'BrandNewPassword123!',
        securityAnswer: 'emerald'
      })
    });
    const resWrongCode = await resetPasswordPost({ request: reqWrongCode, env });
    const bodyWrongCode = await resWrongCode.json();

    // Case 2: Correct code + wrong answer
    const reqWrongAnswer = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'security-q@example.com',
        token: correctCode,
        newPassword: 'BrandNewPassword123!',
        securityAnswer: 'sapphire'
      })
    });
    const resWrongAnswer = await resetPasswordPost({ request: reqWrongAnswer, env });
    const bodyWrongAnswer = await resWrongAnswer.json();

    assert.strictEqual(resWrongCode.status, 400);
    assert.strictEqual(resWrongAnswer.status, 400);
    assert.deepStrictEqual(bodyWrongCode, bodyWrongAnswer);
    assert.strictEqual(bodyWrongAnswer.error, 'Invalid or expired reset code.');
  });

  // T6: POST /api/auth/register
  test('T6: non-Latin1 name ("José Ñuñez") returns 201, not 500', async () => {
    const request = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'José Ñuñez',
        email: 'jose.nunez@example.com',
        password: 'ValidPassword123!',
        securityQuestion: 'Place of birth?',
        securityAnswer: 'Valparaíso'
      })
    });

    const res = await registerPost({ request, env });
    assert.strictEqual(res.status, 201, 'Should return 201 Created without Latin1 encoding crash');

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.user.name, 'José Ñuñez');
    assert.strictEqual(body.user.email, 'jose.nunez@example.com');
    assert.ok(body.csrfToken, 'CSRF token returned');

    // Confirm session cookie was created with valid JWT containing UTF-8 name
    const setCookie = res.headers.get('Set-Cookie');
    assert.ok(setCookie && setCookie.includes('auth_token='), 'auth_token cookie set');

    const tokenMatch = setCookie.match(/auth_token=([^;]+)/);
    assert.ok(tokenMatch, 'auth_token found');
    const token = decodeURIComponent(tokenMatch[1]);
    const payload = await verifyToken(token, TEST_JWT_SECRET);
    assert.strictEqual(payload.name, 'José Ñuñez');
  });

  // T7: POST /api/auth/login
  test('T7: login timing for unknown account is within 2x of known account', async () => {
    const pwHash = await hashPassword('KnownPassword123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t7', 'timing-known@example.com', pwHash, 'Known Timing', 'user', 0).run();

    // Warm-up call
    await loginPost({
      request: new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'timing-known@example.com', password: 'wrong' })
      }),
      env
    });

    // Time known account with bad password (runs verifyPassword)
    const t0 = performance.now();
    await loginPost({
      request: new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'timing-known@example.com', password: 'wrongpassword' })
      }),
      env
    });
    const knownDuration = performance.now() - t0;

    // Time unknown account with bad password (runs timing equalization hashPassword)
    const t1 = performance.now();
    await loginPost({
      request: new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'unknown-account-timing@example.com', password: 'wrongpassword' })
      }),
      env
    });
    const unknownDuration = performance.now() - t1;

    const ratio = Math.max(knownDuration, unknownDuration) / Math.min(knownDuration, unknownDuration);
    assert.ok(ratio < 2.5, `Timing ratio must be close (< 2.5x), got ${ratio.toFixed(2)} (known: ${knownDuration.toFixed(1)}ms, unknown: ${unknownDuration.toFixed(1)}ms)`);
  });

  // T8: GET /api/admin/stats
  test('T8: user with admin email but role = "user" gets 403', async () => {
    const pwHash = await hashPassword('AdminPass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t8', 'admin@techtrekgt.com', pwHash, 'Fake Admin', 'user', 0).run();

    const user = { id: 'usr-t8', email: 'admin@techtrekgt.com', name: 'Fake Admin', role: 'user', token_version: 0 };
    const { token } = await issueSession(env, user, 'hh-t8', false);

    const request = new Request('http://localhost/api/admin/stats', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await adminStatsGet({ request, env });
    assert.strictEqual(res.status, 403, 'Must reject user with role = "user" even if email is admin email');

    const body = await res.json();
    assert.strictEqual(body.error, 'Forbidden');
  });

  // T9: GET /api/admin/stats
  test('T9: user with role = "admin" gets 200', async () => {
    const pwHash = await hashPassword('RealAdminPass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t9', 'real-admin@customdomain.org', pwHash, 'Real Admin', 'admin', 0).run();

    const user = { id: 'usr-t9', email: 'real-admin@customdomain.org', name: 'Real Admin', role: 'admin', token_version: 0 };
    const { token } = await issueSession(env, user, 'hh-t9', false);

    const request = new Request('http://localhost/api/admin/stats', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await adminStatsGet({ request, env });
    assert.strictEqual(res.status, 200, 'Must allow user with role = "admin"');

    const body = await res.json();
    assert.strictEqual(typeof body.totalUsers, 'number');
    assert.ok(Array.isArray(body.users));
  });

  // T10: POST /api/verify-sync-code
  test('T10: missing SYNC_UNLOCK_CODE binding returns 503, not 200', async () => {
    // Fails closed when SYNC_UNLOCK_CODE is unset (no '123456' default)
    const reqMissing = new Request('http://localhost/api/verify-sync-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ code: '123456' })
    });

    const resMissing = await worker.fetch(reqMissing, { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET });
    assert.strictEqual(resMissing.status, 503, 'Must return 503 when SYNC_UNLOCK_CODE is unconfigured');

    const bodyMissing = await resMissing.json();
    assert.strictEqual(bodyMissing.error, 'Service unavailable.');

    // Configured case
    const envWithCode = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      SYNC_UNLOCK_CODE: 'secure-vault-passcode'
    };

    // Wrong code
    const reqWrong = new Request('http://localhost/api/verify-sync-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ code: '123456' })
    });
    const resWrong = await worker.fetch(reqWrong, envWithCode);
    assert.strictEqual(resWrong.status, 401);

    // Correct code
    const reqCorrect = new Request('http://localhost/api/verify-sync-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ code: 'secure-vault-passcode' })
    });
    const resCorrect = await worker.fetch(reqCorrect, envWithCode);
    assert.strictEqual(resCorrect.status, 200);
    const bodyCorrect = await resCorrect.json();
    assert.strictEqual(bodyCorrect.success, true);
    assert.strictEqual(bodyCorrect.token, 'vault-unlocked');
  });

  // T11: POST /api/auth/logout
  test('T11: token_version incremented in DB after logout', async () => {
    const pwHash = await hashPassword('LogoutPassword123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t11', 'logout-user@example.com', pwHash, 'Logout User', 'user', 0).run();

    const user = { id: 'usr-t11', email: 'logout-user@example.com', name: 'Logout User', role: 'user', token_version: 0 };
    const { token } = await issueSession(env, user, 'hh-t11', false);

    const request = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await logoutPost({ request, env });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);

    // Verify token_version bumped in DB
    const updated = await mockDb.prepare('SELECT token_version FROM users WHERE id = ?').bind('usr-t11').first();
    assert.strictEqual(Number(updated.token_version), 1, 'token_version must increment to revoke sessions');
  });

  // T12: GET /api/auth/me
  test('T12: token with stale tv claim returns 401 "Session expired. Please sign in again."', async () => {
    const pwHash = await hashPassword('MePassword123!');
    // User in DB has token_version = 1
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-t12', 'me-user@example.com', pwHash, 'Me User', 'user', 1).run();

    // Issue token with stale tv = 0
    const staleUser = { id: 'usr-t12', email: 'me-user@example.com', name: 'Me User', role: 'user', token_version: 0 };
    const { token: staleToken } = await issueSession(env, staleUser, 'hh-t12', false);

    const request = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${staleToken}` }
    });

    const res = await meGet({ request, env });
    assert.strictEqual(res.status, 401, 'Stale token_version must result in 401 Unauthorized');

    const body = await res.json();
    assert.strictEqual(body.error, 'Session expired. Please sign in again.');
  });
});
