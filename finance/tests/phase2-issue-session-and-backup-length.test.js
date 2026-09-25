import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import {
  issueSession,
  verifyToken,
  SESSION_TTL_REMEMBER,
  SESSION_TTL_DEFAULT,
  newCsrfToken,
  createToken,
  hashPassword
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
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    }
  };
}

describe('issueSession Options Object Signature & Verification', () => {
  const env = { JWT_SECRET: TEST_JWT_SECRET };
  const user = { id: 'usr-opt-1', email: 'opts@example.com', name: 'Opts User', role: 'user', token_version: 0 };

  test('issueSession with { rememberMe: true } issues SESSION_TTL_REMEMBER (30 days)', async () => {
    const session = await issueSession(env, user, { rememberMe: true });
    assert.strictEqual(session.maxAge, SESSION_TTL_REMEMBER);
    assert.ok(session.token);
    assert.ok(session.csrf);

    const payload = await verifyToken(session.token, TEST_JWT_SECRET);
    assert.ok(payload);
    assert.strictEqual(payload.userId, user.id);
    const expectedSexp = Math.floor(Date.now() / 1000) + SESSION_TTL_REMEMBER;
    assert.ok(Math.abs(payload.sexp - expectedSexp) <= 2, 'sexp should be ~30 days in future');
  });

  test('issueSession with { rememberMe: false } issues SESSION_TTL_DEFAULT (1 day)', async () => {
    const session = await issueSession(env, user, { rememberMe: false });
    assert.strictEqual(session.maxAge, SESSION_TTL_DEFAULT);
    assert.ok(session.token);

    const payload = await verifyToken(session.token, TEST_JWT_SECRET);
    assert.ok(payload);
    const expectedSexp = Math.floor(Date.now() / 1000) + SESSION_TTL_DEFAULT;
    assert.ok(Math.abs(payload.sexp - expectedSexp) <= 2, 'sexp should be ~1 day in future');
  });

  test('issueSession with empty options or omitted options defaults to SESSION_TTL_DEFAULT', async () => {
    const session1 = await issueSession(env, user, {});
    assert.strictEqual(session1.maxAge, SESSION_TTL_DEFAULT);

    const session2 = await issueSession(env, user);
    assert.strictEqual(session2.maxAge, SESSION_TTL_DEFAULT);
  });

  test('legacy positional argument false/true without options object does NOT enable rememberMe', async () => {
    // If a caller passes legacy boolean as arg3, options is a boolean, options.rememberMe is undefined -> rememberMe false
    const session = await issueSession(env, user, true);
    assert.strictEqual(session.maxAge, SESSION_TTL_DEFAULT);
  });
});

describe('handleSyncBackup data_byte_length & Suspicious-Shrink Optimization', () => {
  let mockDb;
  let env;
  let token;
  let csrfToken;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    const pwHash = await hashPassword('TestPass123!');
    mockDb._raw.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('user-sync-test', 'synctest@example.com', pwHash, 'Sync User', 'Active', 'user', 0, 1, new Date().toISOString());

    const session = await issueSession(env, { id: 'user-sync-test', email: 'synctest@example.com', name: 'Sync User', token_version: 0 }, { rememberMe: false });
    token = session.token;
    csrfToken = session.csrf;
  });

  function makeAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Cookie': `auth_token=${token}; csrf_token=${csrfToken}`,
      'X-CSRF-Token': csrfToken
    };
  }

  test('handleSyncBackup writes data_byte_length to user_backups alongside data', async () => {
    const budget = {
      accounts: [{ id: 'acc-1', name: 'Checking' }],
      bills: [{ id: 'bill-1', name: 'Electric', amount: 150 }]
    };
    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({
        budget,
        baseVersion: 0
      })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);

    const row = mockDb._raw.prepare('SELECT data, data_byte_length, updated_at_ms FROM user_backups WHERE id = ?').get('user-sync-test');
    assert.ok(row);
    assert.strictEqual(row.data_byte_length, JSON.stringify(budget).length);
    assert.deepStrictEqual(JSON.parse(row.data), budget);
  });

  test('suspicious shrink check uses stored data_byte_length integer directly without reading full data blob', async () => {
    // Seed initial backup with large data_byte_length
    const largeBudget = { accounts: [], bills: [], notes: 'X'.repeat(5000) };
    const largeStr = JSON.stringify(largeBudget);
    mockDb._raw.prepare(
      `INSERT INTO user_backups (id, data, data_byte_length, updated_at_ms) VALUES (?, ?, ?, ?)`
    ).run('user-sync-test', largeStr, largeStr.length, 1000);

    // Incoming tiny budget (~50 bytes, < 10% of 5000 bytes)
    const tinyBudget = { accounts: [] };
    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({
        budget: tinyBudget,
        baseVersion: 1000
      })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.code, 'SYNC_SUSPICIOUS');
    assert.strictEqual(body.suspicious, true);

    // Stored row was untouched
    const row = mockDb._raw.prepare('SELECT data_byte_length FROM user_backups WHERE id = ?').get('user-sync-test');
    assert.strictEqual(row.data_byte_length, largeStr.length);
  });

  test('conflict response (storedVersion > baseVersion) fetches full data and returns serverData correctly', async () => {
    const serverBudget = { accounts: [{ id: 'acc-conflict', name: 'Server Stored Account' }] };
    const serverStr = JSON.stringify(serverBudget);
    mockDb._raw.prepare(
      `INSERT INTO user_backups (id, data, data_byte_length, updated_at_ms) VALUES (?, ?, ?, ?)`
    ).run('user-sync-test', serverStr, serverStr.length, 5000);

    // Client attempts to push with stale baseVersion: 4000 (< 5000)
    const clientBudget = { accounts: [{ id: 'acc-client', name: 'Client Stored Account' }] };
    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({
        budget: clientBudget,
        baseVersion: 4000
      })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.code, 'SYNC_CONFLICT');
    assert.strictEqual(body.conflict, true);
    assert.deepStrictEqual(body.serverData, serverBudget);
    assert.strictEqual(body.serverVersion, 5000);
  });

  test('handleSyncRestoreVersion updates data_byte_length on restored version', async () => {
    const versionBudget = { accounts: [{ id: 'acc-v1', name: 'Restored Version Account' }] };
    const versionStr = JSON.stringify(versionBudget);
    const versionId = 'ver-test-1';

    mockDb._raw.prepare(
      `INSERT INTO user_backup_versions (id, user_id, data, saved_at) VALUES (?, ?, ?, ?)`
    ).run(versionId, 'user-sync-test', versionStr, 12345);

    const req = new Request('http://localhost/api/sync/restore-version', {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ versionId })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.deepStrictEqual(body.budget, versionBudget);

    const row = mockDb._raw.prepare('SELECT data, data_byte_length FROM user_backups WHERE id = ?').get('user-sync-test');
    assert.ok(row);
    assert.strictEqual(row.data_byte_length, versionStr.length);
    assert.deepStrictEqual(JSON.parse(row.data), versionBudget);
  });
});
