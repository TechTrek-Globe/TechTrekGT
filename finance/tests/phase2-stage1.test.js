import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { hashPassword, issueSession, createToken, invalidateCachedUser, clearMemoryUserCache } from '../functions/utils/auth.js';

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

function makeRegisterRequest(body) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('Phase 2 Stage 1: Phase 1 regression fixes', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: 'test-code-hmac-secret-32-bytes-long',
      RESEND_API_KEY: 're_mock_test_key',
      MAIL_FROM: 'noreply@techtrekgt.com'
    };
  });

  // S1T1: created_at is written explicitly at registration (Stage 1.1)
  test('S1T1: new registration row has a non-null created_at value', async () => {
    const req = makeRegisterRequest({
      name: 'Alice Test',
      email: 's1t1@example.com',
      password: 'ValidPass123!',
      securityQuestion: 'What is your pet name?',
      securityAnswer: 'Fluffy'
    });
    const res = await registerPost({ request: req, env });
    assert.strictEqual(res.status, 201);

    const row = await mockDb.prepare(
      'SELECT created_at FROM users WHERE email = ?'
    ).bind('s1t1@example.com').first();

    assert.ok(row, 'User row must exist after registration');
    assert.ok(row.created_at, 'created_at must be non-null');
    assert.ok(row.created_at.length > 0, 'created_at must not be empty string');
    // Must be a parseable date - ISO-8601 format
    const parsed = new Date(row.created_at);
    assert.ok(!isNaN(parsed.getTime()), `created_at "${row.created_at}" must be a valid date`);
  });

  // S1T2: status is written explicitly at registration (Stage 1.2)
  test('S1T2: new registration row has status = "Active"', async () => {
    const req = makeRegisterRequest({
      name: 'Bob Test',
      email: 's1t2@example.com',
      password: 'ValidPass123!',
      securityQuestion: 'What is your pet name?',
      securityAnswer: 'Whiskers'
    });
    const res = await registerPost({ request: req, env });
    assert.strictEqual(res.status, 201);

    const row = await mockDb.prepare(
      'SELECT status FROM users WHERE email = ?'
    ).bind('s1t2@example.com').first();

    assert.ok(row, 'User row must exist after registration');
    assert.strictEqual(row.status, 'Active', 'status must be "Active" immediately after registration');
  });

  // S1T3: two concurrent /me calls succeed and return consistent session info (Stage 1.3)
  test('S1T3: two concurrent /me calls succeed and return consistent session info', async () => {
    // Seed a user
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-s1t3';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 's1t3@example.com', pwHash, 'Carol Test', 'user', 0, 'Active', new Date().toISOString()).run();

    // Issue a real token so /me can authenticate
    const user = { id: userId, email: 's1t3@example.com', name: 'Carol Test', token_version: 0 };
    const { token } = await issueSession(env, user, { rememberMe: false });

    function makeMeRequest() {
      return new Request('http://localhost/api/auth/me', {
        method: 'GET',
        headers: { Cookie: `auth_token=${token}` }
      });
    }

    // Fire two concurrent requests
    const [res1, res2] = await Promise.all([
      meGet({ request: makeMeRequest(), env, ctx: {} }),
      meGet({ request: makeMeRequest(), env, ctx: {} })
    ]);

    assert.strictEqual(res1.status, 200, 'First /me must return 200');
    assert.strictEqual(res2.status, 200, 'Second /me must return 200');

    const body1 = await res1.json();
    const body2 = await res2.json();

    assert.strictEqual(body1.user.id, userId, 'First /me must return correct user ID');
    assert.strictEqual(body2.user.id, userId, 'Second /me must return correct user ID');
    assert.strictEqual(body1.user.email, body2.user.email, 'Both /me calls must return same user email');

    // Both responses must include a usable csrfToken
    assert.ok(body1.csrfToken, 'First /me must return csrfToken');
    assert.ok(body2.csrfToken, 'Second /me must return csrfToken');
  });

  // S1T4: registration response contains exactly one csrfToken; no csrf2 leak (Stage 1.4)
  test('S1T4: registration response contains exactly one csrfToken field', async () => {
    const req = makeRegisterRequest({
      name: 'Dave Test',
      email: 's1t4@example.com',
      password: 'ValidPass123!',
      securityQuestion: 'What is your pet name?',
      securityAnswer: 'Spot'
    });
    const res = await registerPost({ request: req, env });
    assert.strictEqual(res.status, 201);

    const body = await res.json();
    assert.ok(body.csrfToken, 'Response must contain csrfToken');
    assert.strictEqual(typeof body.csrfToken, 'string', 'csrfToken must be a string');
    assert.ok(body.csrfToken.length > 0, 'csrfToken must not be empty');

    // Confirm no second token key exists under any alias
    assert.strictEqual(body.csrf2, undefined, 'No csrf2 field must be present in response');
    assert.strictEqual(body.csrf, undefined, 'No raw csrf field (only csrfToken) must be present');

    // The returned csrfToken must be usable: it must be a valid hex or base64url string
    assert.match(body.csrfToken, /^[A-Za-z0-9_\-+/=]{20,}$/, 'csrfToken must be a non-trivial token string');
  });

  // S1T4b: /me uses short-TTL session cache (REM-17); invalidating cache on token_version bump rejects stale token
  test('S1T4b: /me rejects stale token after token_version bump and cache invalidation (REM-17)', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const userId = 'usr-s1t4b';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 's1t4b@example.com', pwHash, 'Eve Test', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 's1t4b@example.com', name: 'Eve Test', token_version: 0 };
    const { token } = await issueSession(env, user, { rememberMe: false });

    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const res = await meGet({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    // token_version is bumped and cache is invalidated (simulating logout/password change write)
    await mockDb.prepare(
      'UPDATE users SET token_version = token_version + 1 WHERE id = ?'
    ).bind(userId).run();
    await invalidateCachedUser(userId, env);

    const req2 = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const res2 = await meGet({ request: req2, env, ctx: {} });
    // Must be 401 because DB token_version no longer matches the JWT tv claim
    assert.strictEqual(res2.status, 401, 'stale token must be rejected after token_version bump');
  });
});
