import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { onRequestPost as refreshPost } from '../functions/api/auth/refresh.js';
import { hashPassword, issueSession, createToken, verifyToken, ACCESS_TOKEN_TTL, ERROR_CODES } from '../functions/utils/auth.js';
import worker from '../src/worker.js';

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

describe('Phase 2 Stage 10: CSRF & Session Cookie Refresh Hardening', () => {
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

  // T1: Two sequential /me calls within the same short window do NOT produce two different csrf_token Set-Cookie values
  test('T1: two sequential /me calls within normal session window do not rotate CSRF or emit Set-Cookie', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t1';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft1@example.com', pwHash, 'CSRF Test 1', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'csrft1@example.com', name: 'CSRF Test 1', role: 'user', token_version: 0 };
    const { token, csrf: initialCsrf } = await issueSession(env, user, { rememberMe: false });

    const makeRequest = () => new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}; csrf_token=${initialCsrf}` }
    });

    // Call 1
    const res1 = await meGet({ request: makeRequest(), env, ctx: {} });
    assert.strictEqual(res1.status, 200);
    const setCookie1 = res1.headers.get('Set-Cookie');
    assert.strictEqual(setCookie1, null, 'Call 1 within valid window must not emit Set-Cookie');

    const body1 = await res1.json();
    assert.strictEqual(body1.success, true);
    assert.strictEqual(body1.csrfToken, initialCsrf, 'Call 1 must echo the existing CSRF token');
    assert.strictEqual(body1.user.id, userId);

    // Call 2 (sequential)
    const res2 = await meGet({ request: makeRequest(), env, ctx: {} });
    assert.strictEqual(res2.status, 200);
    const setCookie2 = res2.headers.get('Set-Cookie');
    assert.strictEqual(setCookie2, null, 'Call 2 within valid window must not emit Set-Cookie');

    const body2 = await res2.json();
    assert.strictEqual(body2.success, true);
    assert.strictEqual(body2.csrfToken, initialCsrf, 'Call 2 must echo the exact same existing CSRF token');
    assert.strictEqual(body1.csrfToken, body2.csrfToken, 'Sequential calls must return identical csrfToken');
  });

  // T2: Session and CSRF cookies are refreshed when expiry approaches (< 25% of ACCESS_TOKEN_TTL remaining)
  test('T2: session and CSRF cookies are refreshed when token expiry approaches', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t2';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft2@example.com', pwHash, 'CSRF Test 2', 'user', 0, 'Active', new Date().toISOString()).run();

    const now = Math.floor(Date.now() / 1000);
    // Mint token with 10 minutes remaining (600s < 1800s threshold)
    const expiringSoonSec = 600;
    const { token: expiringToken } = await createToken(
      {
        userId,
        email: 'csrft2@example.com',
        name: 'CSRF Test 2',
        role: 'user',
        tv: 0,
        sid: 'test-sid'
      },
      env.JWT_SECRET,
      expiringSoonSec,
      now + expiringSoonSec
    );

    const oldCsrf = 'old-csrf-token-that-is-still-valid-string-12345';
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${expiringToken}; csrf_token=${oldCsrf}` }
    });

    const res = await meGet({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 200);

    // Refresh branch MUST emit Set-Cookie headers
    const setCookie = res.headers.get('Set-Cookie');
    assert.ok(setCookie, 'Expiring session must emit Set-Cookie headers');
    assert.ok(setCookie.includes('auth_token='), 'Set-Cookie must contain refreshed auth_token');
    assert.ok(setCookie.includes('csrf_token='), 'Set-Cookie must contain refreshed csrf_token');

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.csrfToken, 'Response must include csrfToken');
    assert.notStrictEqual(body.csrfToken, oldCsrf, 'Refreshed response must issue a brand new csrfToken');
  });

  // T3: Session is refreshed when user session-relevant fields (e.g. role) change in the database
  test('T3: session is refreshed when user role differs from token payload', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t3';
    // User role promoted to admin in DB
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft3@example.com', pwHash, 'CSRF Test 3', 'admin', 0, 'Active', new Date().toISOString()).run();

    // Token has role: 'user'
    const now = Math.floor(Date.now() / 1000);
    const { token } = await createToken(
      {
        userId,
        email: 'csrft3@example.com',
        name: 'CSRF Test 3',
        role: 'user',
        tv: 0,
        sid: 'test-sid-3'
      },
      env.JWT_SECRET,
      ACCESS_TOKEN_TTL,
      now + ACCESS_TOKEN_TTL
    );

    const oldCsrf = 'existing-csrf-token-value-abcde-12345';
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}; csrf_token=${oldCsrf}` }
    });

    const res = await meGet({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 200);

    const setCookie = res.headers.get('Set-Cookie');
    assert.ok(setCookie, 'Role mismatch must trigger session refresh and Set-Cookie');
    assert.ok(setCookie.includes('auth_token='), 'Must set new auth_token');

    const body = await res.json();
    assert.strictEqual(body.user.isAdmin, true, 'User payload must reflect new admin status');
  });

  // T4: Recovers from partial cookie loss when CSRF cookie is missing
  test('T4: recovers from partial cookie loss when csrf_token cookie is absent', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t4';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft4@example.com', pwHash, 'CSRF Test 4', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'csrft4@example.com', name: 'CSRF Test 4', role: 'user', token_version: 0 };
    const { token } = await issueSession(env, user, { rememberMe: false });

    // Request with ONLY auth_token cookie, missing csrf_token
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await meGet({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 200);

    const setCookie = res.headers.get('Set-Cookie');
    assert.ok(setCookie, 'Missing CSRF cookie must trigger session refresh and Set-Cookie');
    assert.ok(setCookie.includes('csrf_token='), 'Must set fresh csrf_token cookie');

    const body = await res.json();
    assert.ok(body.csrfToken, 'Response body must contain newly minted csrfToken');
  });

  // T5: Response payload shape is identical between cached and refreshed branches
  test('T5: response payload shape remains consistent across both branches', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t5';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft5@example.com', pwHash, 'CSRF Test 5', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'csrft5@example.com', name: 'CSRF Test 5', role: 'user', token_version: 0 };
    const { token, csrf } = await issueSession(env, user, { rememberMe: false });

    // Cached branch
    const reqCached = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}; csrf_token=${csrf}` }
    });
    const resCached = await meGet({ request: reqCached, env, ctx: {} });
    const bodyCached = await resCached.json();

    // Refreshed branch (missing csrf cookie)
    const reqRefreshed = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const resRefreshed = await meGet({ request: reqRefreshed, env, ctx: {} });
    const bodyRefreshed = await resRefreshed.json();

    const expectedKeys = ['success', 'user', 'householdId', 'csrfToken'];
    assert.deepStrictEqual(Object.keys(bodyCached).sort(), expectedKeys.sort());
    assert.deepStrictEqual(Object.keys(bodyRefreshed).sort(), expectedKeys.sort());

    const expectedUserKeys = [
      'id', 'email', 'name', 'isAdmin', 'emailVerified',
      'pendingEmail', 'securityQuestion', 'hasSecurityQuestion'
    ];
    assert.deepStrictEqual(Object.keys(bodyCached.user).sort(), expectedUserKeys.sort());
    assert.deepStrictEqual(Object.keys(bodyRefreshed.user).sort(), expectedUserKeys.sort());
  });

  // T6: POST /api/auth/refresh requires valid, non-expired credentials
  test('T6: POST /api/auth/refresh without credentials returns 401 UNAUTHORIZED', async () => {
    const req = new Request('http://localhost/api/auth/refresh', {
      method: 'POST'
    });
    const res = await refreshPost({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.UNAUTHORIZED);
  });

  // T7: POST /api/auth/refresh with expired access token returns 401 UNAUTHORIZED
  test('T7: POST /api/auth/refresh with expired token returns 401 UNAUTHORIZED', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredPayload = {
      userId: 'usr-csrf-t7',
      email: 'csrft7@example.com',
      name: 'CSRF Test 7',
      role: 'user',
      tv: 0,
      exp: now - 100,
      sexp: now + 3600
    };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', TEST_JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    const expiredToken = `${header}.${payload}.${sig}`;

    const req = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: {
        Cookie: `auth_token=${expiredToken}; csrf_token=any-csrf`,
        'X-CSRF-Token': 'any-csrf'
      }
    });
    const res = await refreshPost({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.UNAUTHORIZED);
  });

  // T8: POST /api/auth/refresh with cookie auth requires valid X-CSRF-Token
  test('T8: POST /api/auth/refresh with cookie auth requires matching X-CSRF-Token', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t8';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft8@example.com', pwHash, 'CSRF Test 8', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'csrft8@example.com', name: 'CSRF Test 8', role: 'user', token_version: 0 };
    const { token, csrf } = await issueSession(env, user, { rememberMe: false });

    // Missing X-CSRF-Token header
    const reqNoHeader = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `auth_token=${token}; csrf_token=${csrf}` }
    });
    const resNoHeader = await refreshPost({ request: reqNoHeader, env, ctx: {} });
    assert.strictEqual(resNoHeader.status, 403);
    const bodyNoHeader = await resNoHeader.json();
    assert.strictEqual(bodyNoHeader.code, ERROR_CODES.CSRF_INVALID);

    // Mismatched X-CSRF-Token header
    const reqMismatch = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: {
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': 'wrong-csrf-token'
      }
    });
    const resMismatch = await refreshPost({ request: reqMismatch, env, ctx: {} });
    assert.strictEqual(resMismatch.status, 403);
    const bodyMismatch = await resMismatch.json();
    assert.strictEqual(bodyMismatch.code, ERROR_CODES.CSRF_INVALID);
  });

  // T9: POST /api/auth/refresh confirms token_version matches DB
  test('T9: POST /api/auth/refresh returns 401 SESSION_EXPIRED on token_version mismatch', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t9';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft9@example.com', pwHash, 'CSRF Test 9', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'csrft9@example.com', name: 'CSRF Test 9', role: 'user', token_version: 0 };
    const { token, csrf } = await issueSession(env, user, { rememberMe: false });

    // Increment token_version in DB
    await mockDb.prepare('UPDATE users SET token_version = 1 WHERE id = ?').bind(userId).run();

    const req = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: {
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      }
    });
    const res = await refreshPost({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.SESSION_EXPIRED);
  });

  // T10: POST /api/auth/refresh successfully renews access token without extending sexp
  test('T10: POST /api/auth/refresh renews access token and retains original session expiry (sexp)', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t10';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft10@example.com', pwHash, 'CSRF Test 10', 'user', 0, 'Active', new Date().toISOString()).run();

    const now = Math.floor(Date.now() / 1000);
    // User logged in with rememberMe (sexp = now + 30 days)
    const originalSexp = now + 30 * 24 * 60 * 60;
    // But current access token is short-lived, say 1 hour remaining
    const { token: oldToken } = await createToken(
      {
        userId,
        email: 'csrft10@example.com',
        name: 'CSRF Test 10',
        role: 'user',
        tv: 0,
        sid: 'sid-csrf-t10'
      },
      TEST_JWT_SECRET,
      1800, // 30 minutes access token
      originalSexp
    );
    const oldCsrf = 'old-csrf-token-10';

    const req = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: {
        Cookie: `auth_token=${oldToken}; csrf_token=${oldCsrf}`,
        'X-CSRF-Token': oldCsrf
      }
    });

    const res = await refreshPost({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.csrfToken, 'Response body must contain new csrfToken');
    assert.notStrictEqual(body.csrfToken, oldCsrf, 'New csrfToken must be generated');

    const setCookie = res.headers.get('Set-Cookie');
    assert.ok(setCookie, 'Must emit Set-Cookie headers');
    assert.ok(setCookie.includes('auth_token='), 'Must set new auth_token cookie');
    assert.ok(setCookie.includes('csrf_token='), 'Must set new csrf_token cookie');

    // Parse the new auth_token from Set-Cookie
    const match = setCookie.match(/auth_token=([^;]+)/);
    assert.ok(match && match[1], 'Must find auth_token cookie');
    const newToken = match[1];

    const decoded = await verifyToken(newToken, TEST_JWT_SECRET);
    assert.ok(decoded, 'New token must verify against secret');
    assert.strictEqual(decoded.userId, userId);
    assert.strictEqual(decoded.sexp, originalSexp, 'sexp must remain unchanged (not extended)');
    // Access token expiration should be renewed to now + ACCESS_TOKEN_TTL
    const expectedExp = Math.min(decoded.iat + ACCESS_TOKEN_TTL, originalSexp);
    assert.strictEqual(decoded.exp, expectedExp, 'Access token exp must be renewed to ACCESS_TOKEN_TTL');
  });

  // T11: POST /api/auth/refresh routes correctly through worker and supports Bearer auth
  test('T11: POST /api/auth/refresh routes through worker and supports Bearer token', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-csrf-t11';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'csrft11@example.com', pwHash, 'CSRF Test 11', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'csrft11@example.com', name: 'CSRF Test 11', role: 'user', token_version: 0 };
    const { token } = await issueSession(env, user, { rememberMe: true });

    const req = new Request('https://techtrekgt.com/api/auth/refresh', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.csrfToken);
  });
});
