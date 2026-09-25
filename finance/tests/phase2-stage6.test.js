import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import { ERROR_CODES as SERVER_ERROR_CODES } from '../functions/utils/errorCodes.js';
import { ERROR_CODES as CLIENT_ERROR_CODES } from '../src/utils/errorCodes.js';
import {
  fail,
  hashPassword,
  issueSession,
  createToken,
  newCsrfToken
} from '../functions/utils/auth.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as resetPasswordPost } from '../functions/api/auth/reset-password.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestGet as adminStatsGet } from '../functions/api/admin/stats.js';

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
        bind(...params) { boundParams = params; return this; },
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
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    }
  };
}

describe('Phase 2 Stage 6: Uniform API Error Contract', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: 'test-code-hmac-secret-32-bytes-long',
      SYNC_UNLOCK_CODE: 'valid-secret-sync-code'
    };
  });

  // S6T1: Client and server errorCodes dictionaries are identical
  test('S6T1: client and server ERROR_CODES definitions match exactly', () => {
    assert.deepStrictEqual(CLIENT_ERROR_CODES, SERVER_ERROR_CODES);
    assert.ok(SERVER_ERROR_CODES.INVALID_CREDENTIALS);
    assert.ok(SERVER_ERROR_CODES.RESET_CODE_INVALID);
    assert.ok(SERVER_ERROR_CODES.SESSION_EXPIRED);
    assert.ok(SERVER_ERROR_CODES.UNAUTHORIZED);
    assert.ok(SERVER_ERROR_CODES.FORBIDDEN);
    assert.ok(SERVER_ERROR_CODES.CSRF_INVALID);
    assert.ok(SERVER_ERROR_CODES.RATE_LIMITED);
    assert.ok(SERVER_ERROR_CODES.VALIDATION_ERROR);
    assert.ok(SERVER_ERROR_CODES.NOT_FOUND);
    assert.ok(SERVER_ERROR_CODES.CONFLICT);
    assert.ok(SERVER_ERROR_CODES.SYNC_CONFLICT);
    assert.ok(SERVER_ERROR_CODES.SYNC_SUSPICIOUS);
    assert.ok(SERVER_ERROR_CODES.SERVICE_UNAVAILABLE);
    assert.ok(SERVER_ERROR_CODES.INTERNAL_ERROR);
  });

  // S6T2: fail() helper generates machine-readable error and code fields
  test('S6T2: fail() outputs standard { error, code } payload and status', async () => {
    const res = fail(SERVER_ERROR_CODES.VALIDATION_ERROR, 400, 'Test error message', 'req-12345');
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Test error message');
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.strictEqual(body.requestId, 'req-12345');
  });

  // S6T3: Information-hiding audit on login (H7): unknown user vs bad password
  test('S6T3: login returns identical 401 INVALID_CREDENTIALS for nonexistent account and wrong password', async () => {
    const pwHash = await hashPassword('CorrectPassword123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-1', 'existing@example.com', pwHash, 'Existing User', 'user', 0, 'Active', 1, new Date().toISOString()).run();

    // 1. Unknown user
    const reqUnknown = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@example.com', password: 'AnyPassword123!' })
    });
    const resUnknown = await loginPost({ request: reqUnknown, env });
    assert.strictEqual(resUnknown.status, 401);
    const bodyUnknown = await resUnknown.json();
    assert.strictEqual(bodyUnknown.code, SERVER_ERROR_CODES.INVALID_CREDENTIALS);
    assert.strictEqual(bodyUnknown.error, 'Invalid email or password.');

    // 2. Wrong password for existing user
    const reqWrongPw = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'existing@example.com', password: 'WrongPassword123!' })
    });
    const resWrongPw = await loginPost({ request: reqWrongPw, env });
    assert.strictEqual(resWrongPw.status, 401);
    const bodyWrongPw = await resWrongPw.json();
    assert.strictEqual(bodyWrongPw.code, SERVER_ERROR_CODES.INVALID_CREDENTIALS);
    assert.strictEqual(bodyWrongPw.error, 'Invalid email or password.');

    // Crucial check: payloads are indistinguishable
    assert.deepStrictEqual(bodyUnknown, bodyWrongPw);
  });

  // S6T4: Information-hiding audit on reset-password (H7)
  test('S6T4: reset-password returns identical 400 RESET_CODE_INVALID across all failure modes', async () => {
    const pwHash = await hashPassword('OriginalPassword123!');
    const answerHash = await hashPassword('CorrectAnswer');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, security_question, security_answer_hash, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-reset', 'user-reset@example.com', pwHash, 'Reset User', 'user', 0, 'Active', 'Fav city?', answerHash, 1, new Date().toISOString()).run();

    // 1. No record exists
    const reqNoRecord = new Request('https://techtrekgt.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user-reset@example.com',
        token: '12345678',
        newPassword: 'NewPassword123!',
        securityAnswer: 'CorrectAnswer'
      })
    });
    const resNoRecord = await resetPasswordPost({ request: reqNoRecord, env });
    assert.strictEqual(resNoRecord.status, 400);
    const bodyNoRecord = await resNoRecord.json();
    assert.strictEqual(bodyNoRecord.code, SERVER_ERROR_CODES.RESET_CODE_INVALID);

    // 2. Insert expired code
    await mockDb.prepare(
      'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('rst-expired', 'usr-reset', 'user-reset@example.com', 'dummyhash', Date.now() - 1000, Date.now() - 2000).run();

    const reqExpired = new Request('https://techtrekgt.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user-reset@example.com',
        token: '12345678',
        newPassword: 'NewPassword123!',
        securityAnswer: 'CorrectAnswer'
      })
    });
    const resExpired = await resetPasswordPost({ request: reqExpired, env });
    assert.strictEqual(resExpired.status, 400);
    const bodyExpired = await resExpired.json();
    assert.strictEqual(bodyExpired.code, SERVER_ERROR_CODES.RESET_CODE_INVALID);
    assert.deepStrictEqual(bodyExpired, bodyNoRecord);

    // 3. Exceeded attempts (used = 1 or attempts >= 5)
    await mockDb.prepare(
      'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 5, ?)'
    ).bind('rst-attempts', 'usr-reset', 'user-reset@example.com', 'dummyhash', Date.now() + 100000, Date.now()).run();

    const reqAttempts = new Request('https://techtrekgt.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user-reset@example.com',
        token: '12345678',
        newPassword: 'NewPassword123!',
        securityAnswer: 'CorrectAnswer'
      })
    });
    const resAttempts = await resetPasswordPost({ request: reqAttempts, env });
    assert.strictEqual(resAttempts.status, 400);
    const bodyAttempts = await resAttempts.json();
    assert.strictEqual(bodyAttempts.code, SERVER_ERROR_CODES.RESET_CODE_INVALID);
    assert.deepStrictEqual(bodyAttempts, bodyNoRecord);
  });

  // S6T5: Authentication and CSRF error codes
  test('S6T5: authentication returns UNAUTHORIZED, CSRF_INVALID, and SESSION_EXPIRED codes', async () => {
    // 1. Missing authentication
    const reqNoAuth = new Request('https://techtrekgt.com/api/auth/me', { method: 'GET' });
    const resNoAuth = await worker.fetch(reqNoAuth, env, {});
    assert.strictEqual(resNoAuth.status, 401);
    const bodyNoAuth = await resNoAuth.json();
    assert.strictEqual(bodyNoAuth.code, SERVER_ERROR_CODES.UNAUTHORIZED);

    // 2. Cookie auth without CSRF token header on state-changing endpoint
    const userObj = { id: 'usr-csrf', email: 'csrf@example.com', name: 'CSRF User', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userObj.id, userObj.email, 'hash', userObj.name, 'user', 0, 'Active', 1, new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, userObj, { rememberMe: false });
    const reqBadCsrf = new Request('https://techtrekgt.com/api/auth/update-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': 'wrong-csrf-token'
      },
      body: JSON.stringify({ name: 'New Name' })
    });
    const resBadCsrf = await worker.fetch(reqBadCsrf, env, {});
    assert.strictEqual(resBadCsrf.status, 403);
    const bodyBadCsrf = await resBadCsrf.json();
    assert.strictEqual(bodyBadCsrf.code, SERVER_ERROR_CODES.CSRF_INVALID);

    // 3. Stale token version returns SESSION_EXPIRED
    const staleToken = (await createToken(
      { userId: userObj.id, email: userObj.email, name: userObj.name, tv: 99, sid: 'sid-1' },
      TEST_JWT_SECRET,
      3600,
      Math.floor(Date.now() / 1000) + 3600
    )).token;

    const reqStale = new Request('https://techtrekgt.com/api/auth/me', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${staleToken}` }
    });
    const resStale = await worker.fetch(reqStale, env, {});
    assert.strictEqual(resStale.status, 401);
    const bodyStale = await resStale.json();
    assert.strictEqual(bodyStale.code, SERVER_ERROR_CODES.SESSION_EXPIRED);
  });

  // S6T6: Validation and Conflict error codes
  test('S6T6: registration returns VALIDATION_ERROR for invalid inputs and CONFLICT for existing email', async () => {
    // 1. Invalid email format
    const reqInvalid = new Request('https://techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid User',
        email: 'invalid-email-no-domain',
        password: 'Password123!',
        securityQuestion: 'Fav pet?',
        securityAnswer: 'Dog'
      })
    });
    const resInvalid = await registerPost({ request: reqInvalid, env });
    assert.strictEqual(resInvalid.status, 400);
    const bodyInvalid = await resInvalid.json();
    assert.strictEqual(bodyInvalid.code, SERVER_ERROR_CODES.VALIDATION_ERROR);

    // 2. Conflict on already registered email
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-exist', 'existing@example.com', 'hash', 'Existing', 'user', 0, 'Active', 1, new Date().toISOString()).run();

    const reqConflict = new Request('https://techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate User',
        email: 'existing@example.com',
        password: 'Password123!',
        securityQuestion: 'Fav pet?',
        securityAnswer: 'Dog'
      })
    });
    const resConflict = await registerPost({ request: reqConflict, env });
    assert.strictEqual(resConflict.status, 409);
    const bodyConflict = await resConflict.json();
    assert.strictEqual(bodyConflict.code, SERVER_ERROR_CODES.CONFLICT);
  });

  // S6T7: Role and Permission error codes (admin endpoints)
  test('S6T7: non-admin user receives 403 FORBIDDEN on admin endpoints', async () => {
    const regularUser = { id: 'usr-reg', email: 'regular@example.com', name: 'Regular User', role: 'user', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(regularUser.id, regularUser.email, 'hash', regularUser.name, 'user', 0, 'Active', 1, new Date().toISOString()).run();

    const { token } = await issueSession(env, regularUser, { rememberMe: false });
    const reqAdmin = new Request('https://techtrekgt.com/api/admin/stats', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${token}` }
    });
    const resAdmin = await adminStatsGet({ request: reqAdmin, env });
    assert.strictEqual(resAdmin.status, 403);
    const bodyAdmin = await resAdmin.json();
    assert.strictEqual(bodyAdmin.code, SERVER_ERROR_CODES.FORBIDDEN);
  });

  // S6T8: Sync error codes (VALIDATION_ERROR, SYNC_CONFLICT, SYNC_SUSPICIOUS, FORBIDDEN, NOT_FOUND)
  test('S6T8: sync handlers return proper machine-readable error codes across error scenarios', async () => {
    const userA = { id: 'usr-sync-a', email: 'synca@example.com', name: 'Sync User A', token_version: 0 };
    const userB = { id: 'usr-sync-b', email: 'syncb@example.com', name: 'Sync User B', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userA.id, userA.email, 'hash', userA.name, 'user', 0, 'Active', 1, new Date().toISOString()).run();
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userB.id, userB.email, 'hash', userB.name, 'user', 0, 'Active', 1, new Date().toISOString()).run();

    const { token: tokenA, csrf: csrfA } = await issueSession(env, userA, { rememberMe: false });
    const { token: tokenB, csrf: csrfB } = await issueSession(env, userB, { rememberMe: false });

    // 1. Missing baseVersion without force returns VALIDATION_ERROR
    const reqNoVer = new Request('https://techtrekgt.com/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${tokenA}; csrf_token=${csrfA}`,
        'X-CSRF-Token': csrfA
      },
      body: JSON.stringify({ budget: { accounts: [{ id: 1 }] } })
    });
    const resNoVer = await worker.fetch(reqNoVer, env, {});
    assert.strictEqual(resNoVer.status, 400);
    const bodyNoVer = await resNoVer.json();
    assert.strictEqual(bodyNoVer.code, SERVER_ERROR_CODES.VALIDATION_ERROR);

    // Initial valid backup to establish cloud state
    const initialReq = new Request('https://techtrekgt.com/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${tokenA}; csrf_token=${csrfA}`,
        'X-CSRF-Token': csrfA
      },
      body: JSON.stringify({
        budget: {
          accounts: [{ id: 1, name: 'Initial Account' }],
          transactions: Array.from({ length: 20 }, (_, i) => ({
            id: `tx-${i}`,
            amount: 50,
            description: 'Cloud state seed transaction'
          }))
        },
        force: true
      })
    });
    const initialRes = await worker.fetch(initialReq, env, {});
    assert.strictEqual(initialRes.status, 200);

    // 2. Push with stale baseVersion returns SYNC_CONFLICT
    const reqConflict = new Request('https://techtrekgt.com/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${tokenA}; csrf_token=${csrfA}`,
        'X-CSRF-Token': csrfA
      },
      body: JSON.stringify({ budget: { accounts: [{ id: 2 }] }, baseVersion: 100 })
    });
    const resConflict = await worker.fetch(reqConflict, env, {});
    assert.strictEqual(resConflict.status, 409);
    const bodyConflict = await resConflict.json();
    assert.strictEqual(bodyConflict.code, SERVER_ERROR_CODES.SYNC_CONFLICT);

    // 3. Shrunk payload (<10% of stored) returns SYNC_SUSPICIOUS
    const reqSuspicious = new Request('https://techtrekgt.com/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${tokenA}; csrf_token=${csrfA}`,
        'X-CSRF-Token': csrfA
      },
      body: JSON.stringify({ budget: { accounts: [] }, baseVersion: Date.now() + 100000 })
    });
    const resSuspicious = await worker.fetch(reqSuspicious, env, {});
    assert.strictEqual(resSuspicious.status, 409);
    const bodySuspicious = await resSuspicious.json();
    assert.strictEqual(bodySuspicious.code, SERVER_ERROR_CODES.SYNC_SUSPICIOUS);

    // 4. User B attempting to restore User A's version returns FORBIDDEN
    const versionRow = await mockDb.prepare('SELECT id FROM user_backup_versions WHERE user_id = ?').bind(userA.id).first();
    assert.ok(versionRow);

    const reqCrossRestore = new Request('https://techtrekgt.com/api/sync/restore-version', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${tokenB}; csrf_token=${csrfB}`,
        'X-CSRF-Token': csrfB
      },
      body: JSON.stringify({ versionId: versionRow.id })
    });
    const resCrossRestore = await worker.fetch(reqCrossRestore, env, {});
    assert.strictEqual(resCrossRestore.status, 403);
    const bodyCrossRestore = await resCrossRestore.json();
    assert.strictEqual(bodyCrossRestore.code, SERVER_ERROR_CODES.FORBIDDEN);

    // 5. Non-existent version returns NOT_FOUND
    const reqMissingVer = new Request('https://techtrekgt.com/api/sync/restore-version', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${tokenA}; csrf_token=${csrfA}`,
        'X-CSRF-Token': csrfA
      },
      body: JSON.stringify({ versionId: 'non-existent-version-id' })
    });
    const resMissingVer = await worker.fetch(reqMissingVer, env, {});
    assert.strictEqual(resMissingVer.status, 404);
    const bodyMissingVer = await resMissingVer.json();
    assert.strictEqual(bodyMissingVer.code, SERVER_ERROR_CODES.NOT_FOUND);
  });

  // S6T9: Unknown API route returns 404 with NOT_FOUND
  test('S6T9: unknown api route returns 404 with NOT_FOUND code', async () => {
    const req404 = new Request('https://techtrekgt.com/api/unknown-endpoint-xyz', { method: 'GET' });
    const res404 = await worker.fetch(req404, env, {});
    assert.strictEqual(res404.status, 404);
    const body404 = await res404.json();
    assert.strictEqual(body404.code, SERVER_ERROR_CODES.NOT_FOUND);
  });
});
