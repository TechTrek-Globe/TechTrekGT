import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as adminUserStatusPost } from '../functions/api/admin/user-status.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { hashPassword, issueSession } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
const migration0005Sql = fs.readFileSync(path.join(__dirname, '../migrations/0005_backfill_user_created_at.sql'), 'utf8');

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

describe('Phase 2 Stage 4: Schema and Data Integrity', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };
  });

  // S4T1: Migration 0005 backfills users with NULL or empty created_at
  test('S4T1: migration 0005 backfills missing created_at with sentinel timestamp', async () => {
    // Test empty string on active schema
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-s4-empty', 'empty-date@example.com', 'dummyhash', 'Empty User', 'user', 0, 'Active', '').run();

    // Test NULL on legacy schema without NOT NULL constraint
    const legacyDb = new DatabaseSync(':memory:');
    legacyDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT
      );
      INSERT INTO users (id, email, password_hash, name, created_at) VALUES ('usr-legacy-null', 'legacy@example.com', 'hash', 'Legacy User', null);
    `);

    // Execute migration SQL on both
    mockDb._raw.exec(migration0005Sql);
    legacyDb.exec(migration0005Sql);

    const emptyUser = await mockDb.prepare('SELECT created_at FROM users WHERE id = ?').bind('usr-s4-empty').first();
    assert.strictEqual(emptyUser.created_at, '1970-01-01T00:00:00.000Z', 'Empty created_at must be backfilled');

    const legacyUser = legacyDb.prepare('SELECT created_at FROM users WHERE id = ?').get('usr-legacy-null');
    assert.strictEqual(legacyUser.created_at, '1970-01-01T00:00:00.000Z', 'NULL created_at must be backfilled');
  });

  // S4T2: Admin user can change status of another user to Suspended
  test('S4T2: admin user can change status of another user to Suspended', async () => {
    const adminUser = { id: 'usr-admin', email: 'admin@example.com', name: 'Admin', role: 'admin', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminUser.id, adminUser.email, 'hash', adminUser.name, 'admin', 0, 'Active', new Date().toISOString()).run();

    const targetUser = { id: 'usr-target-1', email: 'target1@example.com', name: 'Target 1', role: 'user', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(targetUser.id, targetUser.email, 'hash', targetUser.name, 'user', 0, 'Active', new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, adminUser, false);

    const req = new Request('http://localhost/api/admin/user/' + targetUser.id + '/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ status: 'Suspended' })
    });

    const res = await adminUserStatusPost({ request: req, env, ctx: {}, params: { id: targetUser.id } });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.status, 'Suspended');

    // Confirm DB row is updated
    const updated = await mockDb.prepare('SELECT status FROM users WHERE id = ?').bind(targetUser.id).first();
    assert.strictEqual(updated.status, 'Suspended');
  });

  // S4T3: Non-admin user cannot change status (403 Forbidden)
  test('S4T3: non-admin user cannot change status', async () => {
    const regularUser = { id: 'usr-regular', email: 'reg@example.com', name: 'Regular', role: 'user', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(regularUser.id, regularUser.email, 'hash', regularUser.name, 'user', 0, 'Active', new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, regularUser, false);

    const req = new Request('http://localhost/api/admin/user/some-id/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ status: 'Suspended' })
    });

    const res = await adminUserStatusPost({ request: req, env, ctx: {}, params: { id: 'some-id' } });
    assert.strictEqual(res.status, 403);
  });

  // S4T4: Admin cannot suspend their own account
  test('S4T4: admin cannot suspend their own account', async () => {
    const adminUser = { id: 'usr-admin-self', email: 'admin.self@example.com', name: 'Admin Self', role: 'admin', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminUser.id, adminUser.email, 'hash', adminUser.name, 'admin', 0, 'Active', new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, adminUser, false);

    const req = new Request('http://localhost/api/admin/user/' + adminUser.id + '/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ status: 'Suspended' })
    });

    const res = await adminUserStatusPost({ request: req, env, ctx: {}, params: { id: adminUser.id } });
    assert.strictEqual(res.status, 400);

    const body = await res.json();
    assert.ok(body.error.includes('own account'));
  });

  // S4T5: Invalid status value returns 400
  test('S4T5: invalid status value returns 400', async () => {
    const adminUser = { id: 'usr-admin-s4t5', email: 'admin5@example.com', name: 'Admin 5', role: 'admin', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminUser.id, adminUser.email, 'hash', adminUser.name, 'admin', 0, 'Active', new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, adminUser, false);

    const req = new Request('http://localhost/api/admin/user/target-id/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ status: 'Deleted' })
    });

    const res = await adminUserStatusPost({ request: req, env, ctx: {}, params: { id: 'target-id' } });
    assert.strictEqual(res.status, 400);
  });

  // S4T6: Changing status to Suspended increments token_version
  test('S4T6: suspending a user increments token_version to invalidate active sessions', async () => {
    const adminUser = { id: 'usr-admin-s4t6', email: 'admin6@example.com', name: 'Admin 6', role: 'admin', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminUser.id, adminUser.email, 'hash', adminUser.name, 'admin', 0, 'Active', new Date().toISOString()).run();

    const targetUser = { id: 'usr-target-6', email: 'target6@example.com', name: 'Target 6', role: 'user', token_version: 5 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(targetUser.id, targetUser.email, 'hash', targetUser.name, 'user', 5, 'Active', new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, adminUser, false);

    const req = new Request('http://localhost/api/admin/user/' + targetUser.id + '/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ status: 'Suspended' })
    });

    const res = await adminUserStatusPost({ request: req, env, ctx: {}, params: { id: targetUser.id } });
    assert.strictEqual(res.status, 200);

    const updated = await mockDb.prepare('SELECT token_version, status FROM users WHERE id = ?').bind(targetUser.id).first();
    assert.strictEqual(updated.status, 'Suspended');
    assert.strictEqual(updated.token_version, 6, 'token_version must increment from 5 to 6');
  });

  // S4T7: Suspended user cannot authenticate or login
  test('S4T7: suspended user cannot log in or authenticate with existing session', async () => {
    const pwHash = await hashPassword('ValidPass123!');
    const suspendedUser = { id: 'usr-suspended-7', email: 'suspended7@example.com', name: 'Suspended 7', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(suspendedUser.id, suspendedUser.email, pwHash, suspendedUser.name, 'user', 0, 'Suspended', new Date().toISOString()).run();

    // 1. Test login rejection
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: suspendedUser.email, password: 'ValidPass123!' })
    });
    const loginRes = await loginPost({ request: loginReq, env, ctx: {} });
    assert.strictEqual(loginRes.status, 403, 'Login must return 403 for suspended user');

    // 2. Test session authenticate rejection
    const { token } = await issueSession(env, suspendedUser, false);
    const meReq = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });
    const meRes = await meGet({ request: meReq, env, ctx: {} });
    assert.strictEqual(meRes.status, 403, 'Existing session must be rejected with 403');
  });

  // S4T8: Admin can re-activate a Suspended user back to Active
  test('S4T8: admin can re-activate a suspended user', async () => {
    const adminUser = { id: 'usr-admin-s4t8', email: 'admin8@example.com', name: 'Admin 8', role: 'admin', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminUser.id, adminUser.email, 'hash', adminUser.name, 'admin', 0, 'Active', new Date().toISOString()).run();

    const pwHash = await hashPassword('ValidPass123!');
    const targetUser = { id: 'usr-target-8', email: 'target8@example.com', name: 'Target 8', role: 'user', token_version: 0 };
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(targetUser.id, targetUser.email, pwHash, targetUser.name, 'user', 0, 'Suspended', new Date().toISOString()).run();

    const { token, csrf } = await issueSession(env, adminUser, false);

    const req = new Request('http://localhost/api/admin/user/' + targetUser.id + '/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ status: 'Active' })
    });

    const res = await adminUserStatusPost({ request: req, env, ctx: {}, params: { id: targetUser.id } });
    assert.strictEqual(res.status, 200);

    const updated = await mockDb.prepare('SELECT status FROM users WHERE id = ?').bind(targetUser.id).first();
    assert.strictEqual(updated.status, 'Active');

    // Confirm user can log in now
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetUser.email, password: 'ValidPass123!' })
    });
    const loginRes = await loginPost({ request: loginReq, env, ctx: {} });
    assert.strictEqual(loginRes.status, 200, 'User can log in after reactivation');
  });
});
