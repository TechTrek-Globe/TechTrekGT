import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import { onRequestGet as statsGet } from '../functions/api/admin/stats.js';
import { onRequestPost as userStatusPost } from '../functions/api/admin/user-status.js';
import {
  authenticate,
  getCachedUser,
  setCachedUser,
  invalidateCachedUser,
  clearMemoryUserCache,
  issueSession,
  hashPassword,
  createToken,
  MAX_BODY_SYNC
} from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  let queryCount = 0;
  let executedQueries = [];

  return {
    _raw: db,
    getQueryCount: () => queryCount,
    getExecutedQueries: () => executedQueries,
    resetStats: () => { queryCount = 0; executedQueries = []; },
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) { boundParams = params; return this; },
        async first() {
          queryCount++;
          executedQueries.push({ sql, boundParams });
          const row = db.prepare(sql).get(...boundParams);
          return row || null;
        },
        async all() {
          queryCount++;
          executedQueries.push({ sql, boundParams });
          const results = db.prepare(sql).all(...boundParams);
          return { results };
        },
        async run() {
          queryCount++;
          executedQueries.push({ sql, boundParams });
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

describe('REM-17: Authenticated User Session Cache', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };
  });

  test('repeated authenticate() calls use cache and skip D1 query', async () => {
    const pwHash = await hashPassword('TestPass123!');
    const userId = 'usr-rem17-cache';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'cache.test@example.com', pwHash, 'Cache User', 'user', 0, 'Active', new Date().toISOString()).run();

    const { token } = await issueSession(env, { id: userId, email: 'cache.test@example.com', name: 'Cache User', token_version: 0 }, { rememberMe: false });
    const req = new Request('https://techtrekgt.com/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    mockDb.resetStats();

    // First call: cache miss, must query D1
    const auth1 = await authenticate({ request: req, env }, { requireCsrf: false });
    assert.ok(!auth1.error, 'First auth should succeed');
    assert.strictEqual(auth1.user.id, userId);
    assert.strictEqual(mockDb.getQueryCount(), 1, 'First authenticate must query D1 on cache miss');

    // Second call: cache hit, must NOT query D1
    const auth2 = await authenticate({ request: req, env }, { requireCsrf: false });
    assert.ok(!auth2.error, 'Second auth should succeed');
    assert.strictEqual(auth2.user.id, userId);
    assert.strictEqual(mockDb.getQueryCount(), 1, 'Second authenticate must use cache without querying D1');

    // Cached user object excludes credential hashes
    assert.strictEqual(auth2.user.password_hash, undefined, 'password_hash must NOT be in cached user');
    assert.strictEqual(auth2.user.security_answer_hash, undefined, 'security_answer_hash must NOT be in cached user');
  });

  test('invalidateCachedUser forces a D1 query on next authenticate() call', async () => {
    const pwHash = await hashPassword('TestPass123!');
    const userId = 'usr-rem17-inval';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'inval@example.com', pwHash, 'Inval User', 'user', 0, 'Active', new Date().toISOString()).run();

    const { token } = await issueSession(env, { id: userId, email: 'inval@example.com', name: 'Inval User', token_version: 0 }, { rememberMe: false });
    const req = new Request('https://techtrekgt.com/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    // Populate cache
    await authenticate({ request: req, env }, { requireCsrf: false });

    // Explicitly invalidate cache
    await invalidateCachedUser(userId, env);

    mockDb.resetStats();
    const auth = await authenticate({ request: req, env }, { requireCsrf: false });
    assert.ok(!auth.error);
    assert.strictEqual(mockDb.getQueryCount(), 1, 'After invalidation, authenticate must re-query D1');
  });

  test('admin suspension immediately revokes access via cache invalidation', async () => {
    const adminPw = await hashPassword('AdminPass123!');
    const targetPw = await hashPassword('TargetPass123!');

    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-admin', 'admin@example.com', adminPw, 'Admin', 'admin', 0, 'Active', new Date().toISOString()).run();

    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-target', 'target@example.com', targetPw, 'Target', 'user', 0, 'Active', new Date().toISOString()).run();

    const { token: adminToken, csrf: adminCsrf } = await issueSession(env, { id: 'usr-admin', email: 'admin@example.com', name: 'Admin', role: 'admin', token_version: 0 }, { rememberMe: false });
    const { token: targetToken } = await issueSession(env, { id: 'usr-target', email: 'target@example.com', name: 'Target', token_version: 0 }, { rememberMe: false });

    const targetReq = new Request('https://techtrekgt.com/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${targetToken}` }
    });

    // Ensure target user is cached
    const preAuth = await authenticate({ request: targetReq, env }, { requireCsrf: false });
    assert.ok(!preAuth.error);

    // Admin suspends user via user-status POST
    const suspendReq = new Request('https://techtrekgt.com/api/admin/user-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${adminToken}; csrf_token=${adminCsrf}`,
        'X-CSRF-Token': adminCsrf
      },
      body: JSON.stringify({ userId: 'usr-target', status: 'Suspended' })
    });

    const suspendRes = await userStatusPost({ request: suspendReq, env });
    assert.strictEqual(suspendRes.status, 200);

    // Target user's next request must immediately be rejected with 403 Suspended and ACCOUNT_SUSPENDED code
    const postAuth = await authenticate({ request: targetReq, env }, { requireCsrf: false });
    assert.ok(postAuth.error, 'Suspended user must be rejected immediately');
    assert.strictEqual(postAuth.error.status, 403);
    const postAuthData = await postAuth.error.json();
    assert.strictEqual(postAuthData.code, 'ACCOUNT_SUSPENDED');
  });
});

describe('REM-18: ETag & Conditional 304 Support for Sync Polling', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      ENVIRONMENT: 'test'
    };
  });

  test('handleSyncRestore returns ETag on 200 and 304 on matching If-None-Match', async () => {
    const userId = 'usr-rem18-restore';
    const pwHash = await hashPassword('Pass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'restore@example.com', pwHash, 'Restore User', 'user', 0, 'Active', new Date().toISOString()).run();

    const timestamp = 1700000000000;
    const budgetData = JSON.stringify({ accounts: [{ id: 'acc-1', name: 'Checking' }] });
    await mockDb.prepare(
      "INSERT INTO user_backups (id, data, data_byte_length, updated_at, updated_at_ms) VALUES (?, ?, ?, datetime('now'), ?)"
    ).bind(userId, budgetData, budgetData.length, timestamp).run();

    const { token } = await issueSession(env, { id: userId, email: 'restore@example.com', name: 'Restore User', token_version: 0 }, { rememberMe: false });

    // 1. Initial GET without If-None-Match returns 200 with ETag header
    const req1 = new Request('https://techtrekgt.com/api/sync/restore', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const res1 = await worker.fetch(req1, env, {});
    assert.strictEqual(res1.status, 200);
    const etag = res1.headers.get('ETag');
    assert.ok(etag, 'ETag header must be returned on 200');
    assert.strictEqual(etag, `"backup-${timestamp}"`);
    assert.strictEqual(res1.headers.get('Cache-Control'), 'no-store');

    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.version, timestamp);

    // 2. Conditional GET with matching If-None-Match returns 304 Not Modified with empty body
    const req2 = new Request('https://techtrekgt.com/api/sync/restore', {
      method: 'GET',
      headers: {
        Cookie: `auth_token=${token}`,
        'If-None-Match': etag
      }
    });
    const res2 = await worker.fetch(req2, env, {});
    assert.strictEqual(res2.status, 304, 'Must return 304 Not Modified on ETag match');
    assert.strictEqual(res2.headers.get('ETag'), etag);
    assert.strictEqual(res2.headers.get('Cache-Control'), 'no-store');
    const text2 = await res2.text();
    assert.strictEqual(text2, '', '304 response body must be empty');

    // 3. Conditional GET with stale If-None-Match returns full 200 response
    const req3 = new Request('https://techtrekgt.com/api/sync/restore', {
      method: 'GET',
      headers: {
        Cookie: `auth_token=${token}`,
        'If-None-Match': '"backup-1600000000000"'
      }
    });
    const res3 = await worker.fetch(req3, env, {});
    assert.strictEqual(res3.status, 200, 'Must return 200 when ETag does not match');
    assert.strictEqual(res3.headers.get('ETag'), etag);
  });

  test('handleSyncVersions returns ETag on 200 and 304 on matching If-None-Match', async () => {
    const userId = 'usr-rem18-versions';
    const pwHash = await hashPassword('Pass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'versions@example.com', pwHash, 'Versions User', 'user', 0, 'Active', new Date().toISOString()).run();

    const savedAt = 1700000005000;
    await mockDb.prepare(
      'INSERT INTO user_backup_versions (id, user_id, data, saved_at) VALUES (?, ?, ?, ?)'
    ).bind('ver-1', userId, '{}', savedAt).run();

    const { token } = await issueSession(env, { id: userId, email: 'versions@example.com', name: 'Versions User', token_version: 0 }, { rememberMe: false });

    // 1. Initial GET
    const req1 = new Request('https://techtrekgt.com/api/sync/versions', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const res1 = await worker.fetch(req1, env, {});
    assert.strictEqual(res1.status, 200);
    const etag = res1.headers.get('ETag');
    assert.ok(etag, 'ETag header must be returned on versions 200');
    assert.strictEqual(etag, `"versions-${savedAt}-1"`);
    assert.strictEqual(res1.headers.get('Cache-Control'), 'no-store');

    // 2. Matching If-None-Match
    const req2 = new Request('https://techtrekgt.com/api/sync/versions', {
      method: 'GET',
      headers: {
        Cookie: `auth_token=${token}`,
        'If-None-Match': etag
      }
    });
    const res2 = await worker.fetch(req2, env, {});
    assert.strictEqual(res2.status, 304);
    assert.strictEqual(res2.headers.get('ETag'), etag);
    assert.strictEqual(res2.headers.get('Cache-Control'), 'no-store');
    const text2 = await res2.text();
    assert.strictEqual(text2, '');
  });
});

describe('REM-19: /api/admin/stats Bounded Query & Rate Limiting', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };
  });

  test('admin/stats query includes explicit LIMIT 1000 on user_backups', async () => {
    const adminPw = await hashPassword('AdminPass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-admin-stats', 'admin.stats@example.com', adminPw, 'Admin', 'admin', 0, 'Active', new Date().toISOString()).run();

    const { token } = await issueSession(env, { id: 'usr-admin-stats', email: 'admin.stats@example.com', name: 'Admin', role: 'admin', token_version: 0 }, { rememberMe: false });

    const req = new Request('https://techtrekgt.com/api/admin/stats', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    mockDb.resetStats();
    const res = await statsGet({ request: req, env });
    assert.strictEqual(res.status, 200);

    const executed = mockDb.getExecutedQueries();
    const backupQuery = executed.find(q => q.sql.includes('user_backups'));
    assert.ok(backupQuery, 'user_backups query must be executed');
    assert.ok(backupQuery.sql.toUpperCase().includes('LIMIT 1000'), 'user_backups query must include LIMIT 1000');
  });

  test('admin/stats enforces rate limiting (returns 429 when KV is bound and rate limited)', async () => {
    const adminPw = await hashPassword('AdminPass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-admin-rl', 'admin.rl@example.com', adminPw, 'Admin', 'admin', 0, 'Active', new Date().toISOString()).run();

    const { token } = await issueSession(env, { id: 'usr-admin-rl', email: 'admin.rl@example.com', name: 'Admin', role: 'admin', token_version: 0 }, { rememberMe: false });

    // Mock Durable Object that triggers rate limit
    const mockDO = {
      idFromName(name) { return { name }; },
      get() {
        return {
          async fetch() {
            return new Response(JSON.stringify({ allowed: false, retryAfter: 30 }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
        };
      }
    };

    const envWithLimiter = { ...env, RATE_LIMITER: mockDO };
    const req = new Request('https://techtrekgt.com/api/admin/stats', {
      method: 'GET',
      headers: {
        Cookie: `auth_token=${token}`,
        'CF-Connecting-IP': '198.51.100.1'
      }
    });

    const res = await statsGet({ request: req, env: envWithLimiter });
    assert.strictEqual(res.status, 429, 'admin/stats must return 429 when rate limit is exceeded');
  });
});

describe('REM-20: Byte-Accurate Size Checks with TextEncoder', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      ENVIRONMENT: 'test'
    };
  });

  test('multi-byte UTF-8 string is measured by byte length in handleSyncBackup and stored in data_byte_length', async () => {
    const userId = 'usr-rem20-bytes';
    const pwHash = await hashPassword('Pass123!');
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'bytes@example.com', pwHash, 'Byte User', 'user', 0, 'Active', new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, { id: userId, email: 'bytes@example.com', name: 'Byte User', token_version: 0 }, { rememberMe: false });

    // Emoji "💰🚀🎉" has 6 UTF-16 code units (length 6) but 12 UTF-8 bytes
    const emojiPayload = {
      accounts: [{ id: 'acc-1', name: '💰 Savings 🚀' }],
      transactions: [{ id: 'tx-1', notes: 'Celebration 🎉 party' }]
    };

    const payloadJson = JSON.stringify(emojiPayload);
    const expectedByteLength = new TextEncoder().encode(payloadJson).length;
    assert.ok(expectedByteLength > payloadJson.length, 'UTF-8 byte length must exceed UTF-16 length for multi-byte characters');

    const req = new Request('https://techtrekgt.com/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({
        force: true,
        budget: emojiPayload
      })
    });

    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 200);

    const storedRow = await mockDb.prepare('SELECT data_byte_length FROM user_backups WHERE id = ?').bind(userId).first();
    assert.strictEqual(Number(storedRow.data_byte_length), expectedByteLength, 'Stored data_byte_length must match UTF-8 byte length');
  });
});

describe('REM-21: Distinct ACCOUNT_SUSPENDED Error Code', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };
  });

  test('login and authenticate return ACCOUNT_SUSPENDED code with 403 status', async () => {
    const pwHash = await hashPassword('TestPass123!');
    const userId = 'usr-rem21-susp';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'suspended@example.com', pwHash, 'Suspended User', 'user', 0, 'Suspended', new Date().toISOString()).run();

    // 1. Login with suspended credentials returns ACCOUNT_SUSPENDED, never UNAUTHORIZED
    const loginReq = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'suspended@example.com', password: 'TestPass123!' })
    });
    const loginRes = await worker.fetch(loginReq, env, {});
    assert.strictEqual(loginRes.status, 403);
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 'ACCOUNT_SUSPENDED');
    assert.notStrictEqual(loginData.code, 'UNAUTHORIZED');

    // 2. Authenticate with session token returns ACCOUNT_SUSPENDED, never UNAUTHORIZED
    const { token } = await issueSession(env, { id: userId, email: 'suspended@example.com', name: 'Suspended User', token_version: 0 }, { rememberMe: false });
    const authReq = new Request('https://techtrekgt.com/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const authRes = await worker.fetch(authReq, env, {});
    assert.strictEqual(authRes.status, 403);
    const authData = await authRes.json();
    assert.strictEqual(authData.code, 'ACCOUNT_SUSPENDED');
    assert.notStrictEqual(authData.code, 'UNAUTHORIZED');
  });
});
