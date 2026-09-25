import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { onRequestPost as updateProfilePost } from '../functions/api/auth/update-profile.js';
import { hashPassword, issueSession, verifyToken } from '../functions/utils/auth.js';

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

describe('Phase 2 Stage 3: Option B - Household model simplification', () => {
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

  // S3T1: Registration creates ONLY a users row and no household rows
  test('S3T1: registration creates only a users row and no household rows', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Solo',
        email: 'alice.solo@example.com',
        password: 'ValidPassword123!',
        securityQuestion: 'Pet name?',
        securityAnswer: 'Rover'
      })
    });

    const res = await registerPost({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 201);

    // Verify user row exists
    const userRow = await mockDb.prepare('SELECT id, email, name FROM users WHERE email = ?').bind('alice.solo@example.com').first();
    assert.ok(userRow, 'User must exist in users table');
    assert.strictEqual(userRow.name, 'Alice Solo');

    // Verify no rows were added to _bak_* tables
    const hhRows = await mockDb.prepare('SELECT COUNT(*) as count FROM _bak_households').first();
    assert.strictEqual(hhRows.count, 0, '_bak_households must have 0 rows');

    const hmRows = await mockDb.prepare('SELECT COUNT(*) as count FROM _bak_household_members').first();
    assert.strictEqual(hmRows.count, 0, '_bak_household_members must have 0 rows');

    const peopleRows = await mockDb.prepare('SELECT COUNT(*) as count FROM _bak_people').first();
    assert.strictEqual(peopleRows.count, 0, '_bak_people must have 0 rows');
  });

  // S3T2: Registration response returns 201 with householdId: null and valid session
  test('S3T2: registration response returns householdId: null and valid session', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Solo',
        email: 'bob.solo@example.com',
        password: 'ValidPassword123!',
        securityQuestion: 'First car?',
        securityAnswer: 'Toyota'
      })
    });

    const res = await registerPost({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 201);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.householdId, null);
    assert.ok(body.csrfToken, 'Must include csrfToken');
    assert.ok(body.user.id, 'Must include user ID');

    // Verify auth_token cookie
    const setCookie = res.headers.get('Set-Cookie');
    assert.ok(setCookie, 'Set-Cookie header must be present');
    assert.ok(setCookie.includes('auth_token='), 'auth_token cookie must be set');
  });

  // S3T3: Login succeeds against user with no household membership
  test('S3T3: login succeeds without any household membership row', async () => {
    const pwHash = await hashPassword('ValidPassword123!');
    const userId = 'usr-s3t3';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'solo.login@example.com', pwHash, 'Solo User', 'user', 0, 'Active', new Date().toISOString()).run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'solo.login@example.com',
        password: 'ValidPassword123!'
      })
    });

    const res = await loginPost({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.householdId, null);
    assert.strictEqual(body.user.id, userId);
  });

  // S3T4: /me succeeds without querying household_members
  test('S3T4: /me succeeds and returns user info with householdId: null', async () => {
    const pwHash = await hashPassword('ValidPassword123!');
    const userId = 'usr-s3t4';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'solo.me@example.com', pwHash, 'Solo Me', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'solo.me@example.com', name: 'Solo Me', token_version: 0 };
    const { token } = await issueSession(env, user, false);

    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await meGet({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.householdId, null);
    assert.strictEqual(body.user.id, userId);
    assert.ok(body.csrfToken, 'Must provide fresh csrfToken');
  });

  // S3T5: Issued JWT session token contains no householdId claim
  test('S3T5: issued session token contains no householdId claim', async () => {
    const user = { id: 'usr-s3t5', email: 'claim.test@example.com', name: 'Claim Test', token_version: 0 };
    const { token } = await issueSession(env, user, false);

    const payload = await verifyToken(token, env.JWT_SECRET);
    assert.ok(payload, 'Token must verify successfully');
    assert.strictEqual(payload.userId, 'usr-s3t5');
    assert.strictEqual(payload.householdId, undefined, 'householdId claim must be undefined');
  });

  // S3T6: Profile update re-issues session token with no householdId claim
  test('S3T6: update-profile re-issues session token without householdId claim', async () => {
    const pwHash = await hashPassword('ValidPassword123!');
    const userId = 'usr-s3t6';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, 'profile.test@example.com', pwHash, 'Profile Test', 'user', 0, 'Active', new Date().toISOString()).run();

    const user = { id: userId, email: 'profile.test@example.com', name: 'Profile Test', token_version: 0 };
    const { token, csrf } = await issueSession(env, user, false);

    const req = new Request('http://localhost/api/auth/update-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ name: 'Profile Updated Name' })
    });

    const res = await updateProfilePost({ request: req, env, ctx: {} });
    assert.strictEqual(res.status, 200);

    // Extract new auth_token from Set-Cookie header
    const setCookie = res.headers.get('Set-Cookie');
    const match = setCookie && setCookie.match(/auth_token=([^;]+)/);
    assert.ok(match, 'Updated auth_token cookie must be present');

    const updatedToken = match[1];
    const payload = await verifyToken(updatedToken, env.JWT_SECRET);
    assert.strictEqual(payload.name, 'Profile Updated Name');
    assert.strictEqual(payload.householdId, undefined, 'householdId claim must be undefined');
  });

  // S3T7: Archived _bak_* tables exist in schema
  test('S3T7: archived _bak_* tables exist and can store/preserve records', async () => {
    // Seed user first to satisfy foreign key on _bak_household_members
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind('usr-bak-test', 'bak@example.com', 'dummyhash', 'Bak User', 'user', 0, 'Active', new Date().toISOString()).run();

    // Seed records into _bak_households and verify readability
    await mockDb.prepare('INSERT INTO _bak_households (id, name) VALUES (?, ?)').bind('hh-bak-1', 'Legacy Vault').run();
    await mockDb.prepare(
      'INSERT INTO _bak_household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)'
    ).bind('hm-bak-1', 'hh-bak-1', 'usr-bak-test', 'owner').run();

    const row = await mockDb.prepare('SELECT name FROM _bak_households WHERE id = ?').bind('hh-bak-1').first();
    assert.strictEqual(row.name, 'Legacy Vault');
  });

  // S3T8: Purging default_vault removes orphaned vault row
  test('S3T8: user_backups correctly purges orphaned default_vault row', async () => {
    await mockDb.prepare('INSERT INTO user_backups (id, data, updated_at, updated_at_ms) VALUES (?, ?, ?, ?)').bind(
      'default_vault',
      '{"accounts":[]}',
      new Date().toISOString(),
      1786381650000
    ).run();

    await mockDb.prepare('INSERT INTO user_backups (id, data, updated_at, updated_at_ms) VALUES (?, ?, ?, ?)').bind(
      'usr-real-user',
      '{"accounts":[{"name":"Main"}]}',
      new Date().toISOString(),
      1790339562000
    ).run();

    // Execute purge
    await mockDb.prepare("DELETE FROM user_backups WHERE id = 'default_vault'").run();

    const dead = await mockDb.prepare("SELECT id FROM user_backups WHERE id = 'default_vault'").first();
    assert.strictEqual(dead, null, 'default_vault must be deleted');

    const alive = await mockDb.prepare("SELECT id FROM user_backups WHERE id = 'usr-real-user'").first();
    assert.ok(alive, 'User backup must remain intact');
  });
});
