import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import { createToken, newCsrfToken, sessionCookies } from '../functions/utils/auth.js';

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

describe('Phase 2 Stage 2: Stop losing user data (Sync Concurrency & Versioning)', () => {
  let mockDb;
  let env;
  let tokenA;
  let tokenB;
  let csrfTokenA;
  let csrfTokenB;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    // Seed User A
    mockDb._raw.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('user-a', 'user-a@example.com', 'dummy_hash', 'User A', 'Active', 'user', 0);

    // Seed User B
    mockDb._raw.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('user-b', 'user-b@example.com', 'dummy_hash', 'User B', 'Active', 'user', 0);

    const resA = await createToken({ userId: 'user-a', email: 'user-a@example.com', role: 'user', tv: 0 }, TEST_JWT_SECRET);
    tokenA = resA.token;
    const resB = await createToken({ userId: 'user-b', email: 'user-b@example.com', role: 'user', tv: 0 }, TEST_JWT_SECRET);
    tokenB = resB.token;

    csrfTokenA = newCsrfToken();
    csrfTokenB = newCsrfToken();
  });

  function makeAuthHeaders(token, csrfToken) {
    return {
      'Content-Type': 'application/json',
      'Cookie': `auth_token=${token}; csrf_token=${csrfToken}`,
      'X-CSRF-Token': csrfToken
    };
  }

  // S2T1: Push with stale baseVersion returns 409, stored row untouched.
  test('S2T1: push with stale baseVersion returns 409 and leaves stored row untouched', async () => {
    // Seed initial backup with updated_at_ms = 2000
    const initialData = JSON.stringify({ accounts: [{ id: 'acc-1', name: 'Main' }] });
    mockDb._raw.prepare(
      `INSERT INTO user_backups (id, data, updated_at_ms) VALUES (?, ?, ?)`
    ).run('user-a', initialData, 2000);

    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({
        budget: { accounts: [{ id: 'acc-1', name: 'Stale Edit' }] },
        baseVersion: 1000 // Stale: 1000 < 2000
      })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.code, 'SYNC_CONFLICT');
    assert.strictEqual(body.conflict, true);
    assert.strictEqual(body.serverVersion, 2000);
    assert.deepStrictEqual(body.serverData, { accounts: [{ id: 'acc-1', name: 'Main' }] });

    // Verify row untouched in DB
    const row = mockDb._raw.prepare('SELECT data, updated_at_ms FROM user_backups WHERE id = ?').get('user-a');
    assert.strictEqual(row.data, initialData);
    assert.strictEqual(row.updated_at_ms, 2000);
  });

  // S2T2: Push with current baseVersion succeeds.
  test('S2T2: push with current baseVersion succeeds and returns updated version', async () => {
    mockDb._raw.prepare(
      `INSERT INTO user_backups (id, data, updated_at_ms) VALUES (?, ?, ?)`
    ).run('user-a', JSON.stringify({ accounts: [] }), 2000);

    const newBudget = { accounts: [{ id: 'acc-new', name: 'New Checking' }] };
    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({
        budget: newBudget,
        baseVersion: 2000
      })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(typeof body.version === 'number');
    assert.ok(body.version > 2000);

    const row = mockDb._raw.prepare('SELECT data, updated_at_ms FROM user_backups WHERE id = ?').get('user-a');
    assert.strictEqual(row.updated_at_ms, body.version);
    assert.deepStrictEqual(JSON.parse(row.data), newBudget);
  });

  // S2T3: Push with no baseVersion and no force is rejected with 400.
  test('S2T3: push with no baseVersion and no force returns 400 VALIDATION_ERROR', async () => {
    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({
        budget: { accounts: [] }
      })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.ok(body.error.includes('baseVersion'));
  });

  // S2T4: Restore of a prior version returns exactly the stored payload.
  test('S2T4: restore of a prior version returns exactly the stored payload', async () => {
    // 1. Push version 1
    const v1Budget = { v: 1, title: 'First Backup Snapshot' };
    const req1 = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({ budget: v1Budget, force: true })
    });
    const res1 = await worker.fetch(req1, env);
    assert.strictEqual(res1.status, 200);
    const body1 = await res1.json();

    // 2. Push version 2
    const v2Budget = { v: 2, title: 'Second Backup Snapshot' };
    const req2 = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({ budget: v2Budget, baseVersion: body1.version })
    });
    const res2 = await worker.fetch(req2, env);
    assert.strictEqual(res2.status, 200);

    // 3. Query versions
    const reqList = new Request('http://localhost/api/sync/versions', {
      method: 'GET',
      headers: makeAuthHeaders(tokenA, csrfTokenA)
    });
    const resList = await worker.fetch(reqList, env);
    assert.strictEqual(resList.status, 200);
    const listBody = await resList.json();
    assert.strictEqual(listBody.success, true);
    assert.strictEqual(listBody.versions.length, 2);

    // Older version is second item (list is newest first)
    const olderVersion = listBody.versions[1];

    // 4. Restore older version
    const reqRestore = new Request('http://localhost/api/sync/restore-version', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({ versionId: olderVersion.id })
    });
    const resRestore = await worker.fetch(reqRestore, env);
    assert.strictEqual(resRestore.status, 200);
    const restoreBody = await resRestore.json();
    assert.strictEqual(restoreBody.success, true);
    assert.deepStrictEqual(restoreBody.budget, v1Budget);

    // Verify user_backups now has v1Budget
    const row = mockDb._raw.prepare('SELECT data FROM user_backups WHERE id = ?').get('user-a');
    assert.deepStrictEqual(JSON.parse(row.data), v1Budget);
  });

  // S2T5: Version table prunes to 10, oldest pruned first.
  test('S2T5: version table prunes to 10 most recent, oldest pruned first', async () => {
    // Push 12 versions sequentially with slight timestamp offsets
    for (let i = 1; i <= 12; i++) {
      const req = new Request('http://localhost/api/sync/backup', {
        method: 'POST',
        headers: makeAuthHeaders(tokenA, csrfTokenA),
        body: JSON.stringify({
          budget: { count: i, payload: `Snapshot ${i}` },
          force: true
        })
      });
      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 200);
    }

    const versions = mockDb._raw.prepare(
      'SELECT id, data, saved_at FROM user_backup_versions WHERE user_id = ? ORDER BY saved_at ASC, rowid ASC'
    ).all('user-a');

    assert.strictEqual(versions.length, 10, 'Must have pruned to exactly 10 versions');
    // First version in table should have count: 3 (1 and 2 were pruned)
    const oldestRemaining = JSON.parse(versions[0].data);
    assert.strictEqual(oldestRemaining.count, 3, 'Oldest versions (1 and 2) must be pruned first');

    const newestRemaining = JSON.parse(versions[versions.length - 1].data);
    assert.strictEqual(newestRemaining.count, 12, 'Newest version (12) must be present');
  });

  // S2T6: Payload at 5% of stored size is rejected (SYNC_SUSPICIOUS).
  test('S2T6: payload at 5% of stored size without force is rejected with 409 SYNC_SUSPICIOUS', async () => {
    // Large stored payload (10,000 bytes)
    const largePayload = { accounts: [], padding: 'A'.repeat(10000) };
    const largeStr = JSON.stringify(largePayload);
    mockDb._raw.prepare(
      `INSERT INTO user_backups (id, data, updated_at_ms) VALUES (?, ?, ?)`
    ).run('user-a', largeStr, 1000);

    // Tiny incoming payload (~50 bytes, far below 10%)
    const tinyPayload = { accounts: [] };
    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({
        budget: tinyPayload,
        baseVersion: 1000
      })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.code, 'SYNC_SUSPICIOUS');
    assert.strictEqual(body.suspicious, true);

    // Stored row untouched
    const row = mockDb._raw.prepare('SELECT data FROM user_backups WHERE id = ?').get('user-a');
    assert.strictEqual(row.data, largeStr);
  });

  // S2T7: Same payload with force: true is accepted.
  test('S2T7: payload at 5% size with force: true is accepted', async () => {
    const largePayload = { accounts: [], padding: 'B'.repeat(10000) };
    const largeStr = JSON.stringify(largePayload);
    mockDb._raw.prepare(
      `INSERT INTO user_backups (id, data, updated_at_ms) VALUES (?, ?, ?)`
    ).run('user-a', largeStr, 1000);

    const tinyPayload = { accounts: [] };
    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({
        budget: tinyPayload,
        force: true
      })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);

    const row = mockDb._raw.prepare('SELECT data FROM user_backups WHERE id = ?').get('user-a');
    assert.deepStrictEqual(JSON.parse(row.data), tinyPayload);
  });

  // S2T8: Cross-user version access returns 403.
  test('S2T8: cross-user version access returns 403 and list excludes other users', async () => {
    // User B writes a backup version
    const reqB = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: makeAuthHeaders(tokenB, csrfTokenB),
      body: JSON.stringify({
        budget: { user: 'B secret data' },
        force: true
      })
    });
    const resB = await worker.fetch(reqB, env);
    assert.strictEqual(resB.status, 200);

    // Get User B's version ID directly from DB
    const versionRowB = mockDb._raw.prepare(
      'SELECT id FROM user_backup_versions WHERE user_id = ?'
    ).get('user-b');
    assert.ok(versionRowB, 'User B must have a version row');

    // 1. User A lists versions -> must NOT see User B's version
    const reqListA = new Request('http://localhost/api/sync/versions', {
      method: 'GET',
      headers: makeAuthHeaders(tokenA, csrfTokenA)
    });
    const resListA = await worker.fetch(reqListA, env);
    assert.strictEqual(resListA.status, 200);
    const listBodyA = await resListA.json();
    assert.deepStrictEqual(listBodyA.versions, []);

    // 2. User A attempts to restore User B's version -> must return 403
    const reqRestoreA = new Request('http://localhost/api/sync/restore-version', {
      method: 'POST',
      headers: makeAuthHeaders(tokenA, csrfTokenA),
      body: JSON.stringify({ versionId: versionRowB.id })
    });
    const resRestoreA = await worker.fetch(reqRestoreA, env);
    assert.strictEqual(resRestoreA.status, 403);
  });
});
