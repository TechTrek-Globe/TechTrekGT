import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import {
  sessionCookies,
  clearedCookies,
  hashPassword,
  issueSession,
  verifyToken,
  createToken,
  readCookie
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
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  };
}

describe('Phase 2 Stage 12: Cookie Path Scoping & Origin Isolation', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      SYNC_UNLOCK_CODE: 'test-sync-passcode-12345',
      ASSETS: {
        fetch: async () => new Response('assets-html', { status: 200, headers: { 'content-type': 'text/html' } })
      }
    };
  });

  // T1: sessionCookies unit test
  test('T1: sessionCookies scopes strictly to Path=/finance and Path=/api, excluding Path=/', () => {
    const cookies = sessionCookies('test-token-value', 'test-csrf-value', 3600);
    assert.strictEqual(cookies.length, 4, 'Must return exactly 4 cookies (2 pairs for /finance and /api)');

    const authCookies = cookies.filter(c => c.startsWith('auth_token='));
    const csrfCookies = cookies.filter(c => c.startsWith('csrf_token='));

    assert.strictEqual(authCookies.length, 2, 'Must have 2 auth_token cookies');
    assert.strictEqual(csrfCookies.length, 2, 'Must have 2 csrf_token cookies');

    // Verify paths
    assert.ok(authCookies.some(c => c.includes('Path=/finance;') && c.includes('HttpOnly;')), 'auth_token for /finance');
    assert.ok(authCookies.some(c => c.includes('Path=/api;') && c.includes('HttpOnly;')), 'auth_token for /api');
    assert.ok(csrfCookies.some(c => c.includes('Path=/finance;') && !c.includes('HttpOnly;')), 'csrf_token for /finance (non-HttpOnly)');
    assert.ok(csrfCookies.some(c => c.includes('Path=/api;') && !c.includes('HttpOnly;')), 'csrf_token for /api (non-HttpOnly)');

    // Verify NO cookie is set with bare Path=/
    for (const c of cookies) {
      assert.ok(!c.includes('Path=/;'), `Cookie must not have bare Path=/: ${c}`);
      assert.ok(c.includes('SameSite=Strict'), `Cookie must be SameSite=Strict: ${c}`);
      assert.ok(c.includes('Secure'), `Cookie must be Secure: ${c}`);
    }
  });

  // T2: clearedCookies unit test
  test('T2: clearedCookies evicts /finance, /api, and legacy / cookies', () => {
    const cookies = clearedCookies();
    assert.strictEqual(cookies.length, 6, 'Must clear 6 cookies (/finance, /api, and legacy /)');

    assert.ok(cookies.some(c => c.includes('auth_token=;') && c.includes('Path=/finance;')), 'Clears auth_token on /finance');
    assert.ok(cookies.some(c => c.includes('csrf_token=; ') || c.includes('csrf_token=;') && c.includes('Path=/finance;')), 'Clears csrf_token on /finance');
    assert.ok(cookies.some(c => c.includes('auth_token=;') && c.includes('Path=/api;')), 'Clears auth_token on /api');
    assert.ok(cookies.some(c => c.includes('csrf_token=; ') || c.includes('csrf_token=;') && c.includes('Path=/api;')), 'Clears csrf_token on /api');
    assert.ok(cookies.some(c => c.includes('auth_token=;') && c.includes('Path=/;')), 'Clears legacy auth_token on /');
    assert.ok(cookies.some(c => c.includes('csrf_token=; ') || c.includes('csrf_token=;') && c.includes('Path=/;')), 'Clears legacy csrf_token on /');

    for (const c of cookies) {
      assert.ok(c.includes('Max-Age=0'), `Cleared cookie must have Max-Age=0: ${c}`);
      assert.ok(c.includes('SameSite=Strict'), `Cleared cookie must have SameSite=Strict: ${c}`);
      assert.ok(c.includes('Secure'), `Cleared cookie must be Secure: ${c}`);
    }
  });

  // T3: Cookie path matching against /outpost and /auction
  test('T3: Cookie paths /finance and /api do not match /outpost or /auction paths', () => {
    // RFC 6265 cookie-path matching: request-path is either identical to cookie-path,
    // or request-path starts with cookie-path and either cookie-path ends with '/' or
    // the first character of request-path after cookie-path is '/'
    function pathMatches(cookiePath, reqPath) {
      if (reqPath === cookiePath) return true;
      if (reqPath.startsWith(cookiePath)) {
        if (cookiePath.endsWith('/')) return true;
        if (reqPath[cookiePath.length] === '/') return true;
      }
      return false;
    }

    const scopedPaths = ['/finance', '/api'];
    const unrelatedPaths = ['/outpost', '/outpost/items', '/auction', '/auction/sales', '/'];

    for (const cookiePath of scopedPaths) {
      for (const unrelatedPath of unrelatedPaths) {
        assert.strictEqual(
          pathMatches(cookiePath, unrelatedPath),
          false,
          `Path ${cookiePath} must NOT match unrelated path ${unrelatedPath}`
        );
      }
    }

    // Verify they DO match valid finance paths
    assert.strictEqual(pathMatches('/finance', '/finance'), true);
    assert.strictEqual(pathMatches('/finance', '/finance/dashboard'), true);
    assert.strictEqual(pathMatches('/finance', '/finance/api/sync/backup'), true);
    assert.strictEqual(pathMatches('/api', '/api/auth/login'), true);
    assert.strictEqual(pathMatches('/api', '/api/sync/backup'), true);
  });

  // T4: POST /api/auth/login sets Path=/finance and Path=/api cookies
  test('T4: POST /api/auth/login emits Set-Cookie headers with Path=/finance and Path=/api', async () => {
    const pwHash = await hashPassword('TestPass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-cookie-1', 'cookie-user@example.com', pwHash, 'Cookie User', 'user', 0, 'Active', new Date().toISOString()).run();

    const req = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://techtrekgt.com'
      },
      body: JSON.stringify({
        email: 'cookie-user@example.com',
        password: 'TestPass123!'
      })
    });

    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 200);

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('Set-Cookie')];
    assert.ok(setCookies.length > 0, 'Must emit Set-Cookie headers');

    const allCookiesJoined = setCookies.join('\n');
    assert.ok(allCookiesJoined.includes('Path=/finance;'), 'Must contain Path=/finance');
    assert.ok(allCookiesJoined.includes('Path=/api;'), 'Must contain Path=/api');
    assert.ok(!allCookiesJoined.includes('Path=/;'), 'Must NOT contain bare Path=/');
  });

  // T5: POST /api/auth/logout emits Set-Cookie headers with Max-Age=0 for /finance, /api, and /
  test('T5: POST /api/auth/logout clears /finance, /api, and legacy / cookies', async () => {
    const req = new Request('https://techtrekgt.com/api/auth/logout', {
      method: 'POST',
      headers: {
        'Origin': 'https://techtrekgt.com'
      }
    });

    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 200);

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('Set-Cookie')];
    const allCookiesJoined = setCookies.join('\n');

    assert.ok(allCookiesJoined.includes('Path=/finance;'), 'Clears Path=/finance');
    assert.ok(allCookiesJoined.includes('Path=/api;'), 'Clears Path=/api');
    assert.ok(allCookiesJoined.includes('Path=/;'), 'Clears legacy Path=/');
    assert.ok(allCookiesJoined.includes('Max-Age=0'), 'Must set Max-Age=0');
  });

  // T6: GET /finance/api/auth/me and POST /finance/api/sync/backup with Path=/finance cookies
  test('T6: Endpoints routed under /finance/api/ accept cookies and authenticate', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-cookie-finance';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'financeflow@example.com', pwHash, 'Finance Flow', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'financeflow@example.com', name: 'Finance Flow', role: 'user', token_version: 0 };
    const { token, csrf } = await issueSession(env, user, { rememberMe: false });

    // 1. GET /finance/api/auth/me
    const meReq = new Request('https://techtrekgt.com/finance/api/auth/me', {
      method: 'GET',
      headers: {
        Cookie: `auth_token=${token}; csrf_token=${csrf}`
      }
    });

    const meRes = await worker.fetch(meReq, env, {});
    assert.strictEqual(meRes.status, 200);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.success, true);
    assert.strictEqual(meBody.user.id, userId);

    // 2. POST /finance/api/sync/backup
    const backupReq = new Request('https://techtrekgt.com/finance/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://techtrekgt.com',
        'X-CSRF-Token': csrf,
        'X-Sync-Passcode': 'test-sync-passcode-12345',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`
      },
      body: JSON.stringify({
        budget: { accounts: [] },
        baseVersion: 0
      })
    });

    const backupRes = await worker.fetch(backupReq, env, {});
    assert.strictEqual(backupRes.status, 200);
    const backupBody = await backupRes.json();
    assert.strictEqual(backupBody.success, true);
  });
});
