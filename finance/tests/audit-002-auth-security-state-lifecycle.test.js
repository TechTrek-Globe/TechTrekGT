import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  authenticate,
  requireAuth,
  withAuth,
  createToken,
  issueSession,
  hashPassword,
  clearedCookies,
  sessionCookies,
  getAllTokensFromRequest,
  getTokenFromRequest,
  invalidateCachedUser,
  ERROR_CODES
} from '../functions/utils/auth.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as refreshPost } from '../functions/api/auth/refresh.js';
import { onRequestPost as logoutPost } from '../functions/api/auth/logout.js';
import { onRequestPost as resetPasswordPost } from '../functions/api/auth/reset-password.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

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

const TEST_JWT_SECRET = 'audit-002-test-jwt-secret-key-32-chars-long!';

describe('FIN-AUDIT-002: Authentication, Authorization, and Session Lifecycle Audit', () => {

  test('1. Failed token validation purges invalid credentials via Set-Cookie headers with 401', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    // Request with corrupted/invalid token
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: 'auth_token=invalid.tampered.signature' }
    });

    const auth = await authenticate({ request: req, env }, { requireCsrf: false });
    assert.ok(auth.error, 'Should return error response on invalid token');
    assert.strictEqual(auth.error.status, 401, 'Should return 401 status');

    const setCookieHeader = auth.error.headers.get('Set-Cookie');
    assert.ok(setCookieHeader, 'Must set Set-Cookie to clear credentials');
    assert.ok(setCookieHeader.includes('Max-Age=0'), 'Set-Cookie must specify Max-Age=0');
    assert.ok(setCookieHeader.includes('HttpOnly'), 'Set-Cookie must specify HttpOnly');
    assert.ok(setCookieHeader.includes('Secure'), 'Set-Cookie must specify Secure');
    assert.ok(setCookieHeader.includes('SameSite=Strict'), 'Set-Cookie must specify SameSite=Strict');
  });

  test('2. Expired token (exp in past) returns immediate 401 with cleared cookies', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    // Create token that expired 1 hour ago
    const pastTime = Math.floor(Date.now() / 1000) - 3600;
    const { token } = await createToken({ userId: 'usr-expired', tv: 0 }, TEST_JWT_SECRET, -3600, pastTime);

    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await meGet({ request: req, env });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.UNAUTHORIZED);

    const setCookie = res.headers.get('Set-Cookie');
    assert.ok(setCookie && setCookie.includes('Max-Age=0'));
  });

  test('3. Simulated token_version increment in D1 causes subsequent requests to return 401 SESSION_EXPIRED with purged cookies', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    const pwHash = await hashPassword('ValidPass123!');
    const user = { id: 'usr-sim-tv', email: 'tv-sim@example.com', name: 'TV Sim', role: 'user', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, user.email, pwHash, user.name, user.role, 0, 'Active', 1, new Date().toISOString()).run();

    // Issue initial session with tv = 0
    const { token } = await issueSession(env, user, { rememberMe: false });

    // Request 1: Valid session works
    const req1 = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const res1 = await meGet({ request: req1, env });
    assert.strictEqual(res1.status, 200);

    // Simulate token_version increment in D1 (e.g. password change, admin reset, or logout from another device)
    await mockDb.prepare('UPDATE users SET token_version = 1 WHERE id = ?').bind(user.id).run();
    await invalidateCachedUser(user.id, env);

    // Request 2: Old token with tv=0 now actively denied with 401 SESSION_EXPIRED
    const req2 = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const res2 = await meGet({ request: req2, env });
    assert.strictEqual(res2.status, 401);

    const body2 = await res2.json();
    assert.strictEqual(body2.code, ERROR_CODES.SESSION_EXPIRED);
    assert.strictEqual(body2.error, 'Session expired. Please sign in again.');

    const setCookie2 = res2.headers.get('Set-Cookie');
    assert.ok(setCookie2, 'Set-Cookie header must be present on 401 SESSION_EXPIRED');
    assert.ok(setCookie2.includes('Max-Age=0'), 'Must clear cookies with Max-Age=0');
  });

  test('4. Multi-cookie resolution: valid session cookie succeeds even if shadowed by older stale cookie', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    const pwHash = await hashPassword('ValidPass123!');
    const user = { id: 'usr-multi-cookie', email: 'multi@example.com', name: 'Multi Cookie', role: 'user', token_version: 1 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, user.email, pwHash, user.name, user.role, 1, 'Active', 1, new Date().toISOString()).run();

    // Create old stale token with tv=0 (e.g. from prior session or subpath)
    const { token: staleToken } = await createToken({ userId: user.id, tv: 0 }, TEST_JWT_SECRET);
    // Create new valid token with tv=1
    const { token: validToken } = await createToken({ userId: user.id, tv: 1 }, TEST_JWT_SECRET);

    // Browser header sends staleToken first, then validToken
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${staleToken}; auth_token=${validToken}` }
    });

    const res = await meGet({ request: req, env });
    assert.strictEqual(res.status, 200, 'Valid candidate token must resolve and succeed');
    const body = await res.json();
    assert.strictEqual(body.user.id, user.id);
  });

  test('5. Multi-credential conflict: Cookie + Bearer in same request throws 400', async () => {
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: {
        Cookie: 'auth_token=some-cookie-jwt',
        Authorization: 'Bearer some-bearer-jwt'
      }
    });

    assert.throws(() => {
      getAllTokensFromRequest(req);
    }, (err) => {
      assert.ok(err instanceof Response);
      assert.strictEqual(err.status, 400);
      return true;
    });
  });

  test('6. requireAuth helper enforces authentication and throws 401 Response on missing/invalid token', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    const emptyReq = new Request('http://localhost/api/budget');
    await assert.rejects(async () => {
      await requireAuth(emptyReq, env);
    }, (err) => {
      assert.ok(err instanceof Response, 'Must throw a Response');
      assert.strictEqual(err.status, 401);
      return true;
    });

    // withAuth catches thrown Response and returns it cleanly
    const safeResponse = await withAuth(async () => {
      await requireAuth(emptyReq, env);
      return new Response(JSON.stringify({ success: true }));
    });
    assert.strictEqual(safeResponse.status, 401);
  });

  test('7. Password reset increments token_version and immediately invalidates active sessions', async () => {
    const mockDb = createMockD1();
    const CODE_HMAC_SECRET = 'reset-hmac-secret-test-32-chars!!';
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, CODE_HMAC_SECRET };

    const user = { id: 'usr-reset-audit', email: 'reset-audit@example.com', name: 'Reset Audit', role: 'user', token_version: 0 };
    const oldPwHash = await hashPassword('OldPass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, user.email, oldPwHash, user.name, user.role, 0, 'Active', 1, new Date().toISOString()).run();

    // Issue session before password reset
    const { token: oldSessionToken } = await issueSession(env, user, { rememberMe: false });

    // Seed reset code in DB
    const rawCode = '12345678';
    const { hmacHex } = await import('../functions/utils/auth.js');
    const codeHash = await hmacHex(CODE_HMAC_SECRET, `reset:${user.email}:${rawCode}`);
    await mockDb.prepare(
      'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('rst-audit-1', user.id, user.email, codeHash, Date.now() + 900000, Date.now()).run();

    // Execute password reset
    const resetReq = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        token: rawCode,
        newPassword: 'NewValidPass123!'
      })
    });
    const resetRes = await resetPasswordPost({ request: resetReq, env });
    assert.strictEqual(resetRes.status, 200);

    // Verify token_version bumped in DB
    const dbUserAfter = await mockDb.prepare('SELECT token_version FROM users WHERE id = ?').bind(user.id).first();
    assert.strictEqual(Number(dbUserAfter.token_version), 1, 'token_version must increment after password reset');

    // Verify old session token is now rejected with 401 SESSION_EXPIRED
    const testReq = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${oldSessionToken}` }
    });
    const testRes = await meGet({ request: testReq, env });
    assert.strictEqual(testRes.status, 401);
    const testBody = await testRes.json();
    assert.strictEqual(testBody.code, ERROR_CODES.SESSION_EXPIRED);
  });

  test('8. Suspended account actively denies requests with 403 ACCOUNT_SUSPENDED and clears cookies', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    const pwHash = await hashPassword('ValidPass123!');
    const user = { id: 'usr-susp-audit', email: 'suspended-audit@example.com', name: 'Suspended Audit', role: 'user', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, user.email, pwHash, user.name, user.role, 0, 'Suspended', 1, new Date().toISOString()).run();

    const { token } = await issueSession(env, user, { rememberMe: false });
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await meGet({ request: req, env });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.code, ERROR_CODES.ACCOUNT_SUSPENDED);

    const setCookie = res.headers.get('Set-Cookie');
    assert.ok(setCookie && setCookie.includes('Max-Age=0'), 'Must clear cookies when account is suspended');
  });

  test('9. Refresh endpoint issues HttpOnly, Secure, SameSite=Strict cookies and clears cookies on expired sexp', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    const user = { id: 'usr-refresh-audit', email: 'refresh-audit@example.com', name: 'Refresh Audit', role: 'user', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, user.email, 'hash', user.name, user.role, 0, 'Active', 1, new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, user, { rememberMe: true });

    // Valid refresh
    const reqValid = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: {
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      }
    });

    const resValid = await refreshPost({ request: reqValid, env });
    assert.strictEqual(resValid.status, 200);
    const setCookieValid = resValid.headers.get('Set-Cookie');
    assert.ok(setCookieValid.includes('HttpOnly'));
    assert.ok(setCookieValid.includes('Secure'));
    assert.ok(setCookieValid.includes('SameSite=Strict'));

    // Expired sexp session token
    const pastSexp = Math.floor(Date.now() / 1000) - 100;
    const { token: expiredSexpToken } = await createToken({ userId: user.id, tv: 0 }, TEST_JWT_SECRET, 7200, pastSexp);

    const reqExpired = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: {
        Cookie: `auth_token=${expiredSexpToken}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      }
    });

    const resExpired = await refreshPost({ request: reqExpired, env });
    assert.strictEqual(resExpired.status, 401);
    const setCookieExpired = resExpired.headers.get('Set-Cookie');
    assert.ok(setCookieExpired.includes('Max-Age=0'), 'Must clear cookies when session window has expired');
  });

});
