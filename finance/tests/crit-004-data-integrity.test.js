import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestPost as updateProfilePost } from '../functions/api/auth/update-profile.js';
import { createToken, newCsrfToken, sessionCookies, clearMemoryUserCache, hashPassword } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';
const TEST_CODE_HMAC = 'super-secret-hmac-key-32-bytes-long-for-testing';

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

describe('CRIT-004 / FIN-AUDIT-001: Backend Data Integrity & Compensating Rollback Audit', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: TEST_CODE_HMAC,
      ENVIRONMENT: 'development'
    };
  });

  test('Registration rollback: failed downstream verification leaves no orphaned user in D1', async () => {
    // Inject a failure when inserting into email_verifications during registration
    const originalPrepare = mockDb.prepare.bind(mockDb);
    mockDb.prepare = function (sql) {
      if (sql.includes('INSERT INTO email_verifications')) {
        return {
          bind() { return this; },
          async run() {
            throw new Error('Simulated D1 error during email_verifications insertion');
          }
        };
      }
      return originalPrepare(sql);
    };

    const registerBody = {
      name: 'Alice Integrity',
      email: 'alice.integrity@example.com',
      password: 'CorrectHorseBatteryStaple123!',
      securityQuestion: 'Favorite color?',
      securityAnswer: 'Blue'
    };

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerBody)
    });

    const res = await registerPost({ request: req, env, requestId: 'test-req-reg-fail' });
    assert.strictEqual(res.status, 500, 'Handler must fail with HTTP 500 on unexpected exception');

    // Verify compensating cleanup removed the partial user record from users table
    const orphanedUser = mockDb._raw.prepare('SELECT * FROM users WHERE email = ?').get('alice.integrity@example.com');
    assert.strictEqual(orphanedUser, undefined, 'Compensating rollback must remove the orphaned user record from users');

    // Restore normal DB functionality
    mockDb.prepare = originalPrepare;

    // Verify user can now successfully register without being blocked by a 409 conflict
    const retryReq = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerBody)
    });
    const retryRes = await registerPost({ request: retryReq, env, requestId: 'test-req-reg-retry' });
    assert.strictEqual(retryRes.status, 201, 'User must be able to register cleanly after prior failed attempt was rolled back');
    const createdUser = mockDb._raw.prepare('SELECT * FROM users WHERE email = ?').get('alice.integrity@example.com');
    assert.ok(createdUser, 'User record must exist in D1 after successful registration');
  });

  test('Backup sync rollback: exception during backup execution does not leave orphaned version records', async () => {
    // Seed user
    const userId = 'usr-sync-integrity-1';
    const passwordHash = await hashPassword('TestPassword123!');
    mockDb._raw.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?)'
    ).run(userId, 'user.sync@example.com', passwordHash, 'User Sync', 'user', 'Active', new Date().toISOString());

    const { token } = await createToken({ userId, email: 'user.sync@example.com', name: 'User Sync', tv: 0 }, TEST_JWT_SECRET, 3600);
    const csrfToken = newCsrfToken();
    const cookies = sessionCookies(token, csrfToken, 3600).join('; ');

    // Count versions before
    const countBefore = mockDb._raw.prepare('SELECT COUNT(*) as count FROM user_backup_versions WHERE user_id = ?').get(userId).count;
    assert.strictEqual(countBefore, 0);

    // Simulate an error after user_backup_versions insertion by making the subsequent user_backups write fail
    const originalBatch = mockDb.batch.bind(mockDb);
    mockDb.batch = async function (statements) {
      // Execute the first statement (insert version)
      await statements[0].run();
      // Throw exception before completing batch
      throw new Error('Simulated D1 batch interruption');
    };

    const backupPayload = {
      baseVersion: 0,
      force: true,
      budget: {
        accounts: [{ id: 'acc-1', name: 'Checking', startingBalance: 1000 }]
      }
    };

    const req = new Request('http://localhost/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify(backupPayload)
    });

    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 500, 'Failed backup must return HTTP 500');

    // Verify compensating cleanup deleted the orphaned version record
    const countAfter = mockDb._raw.prepare('SELECT COUNT(*) as count FROM user_backup_versions WHERE user_id = ?').get(userId).count;
    assert.strictEqual(countAfter, 0, 'Orphaned version row must be removed by compensating rollback in catch block');
  });

  test('Update profile rollback: failure during profile update removes orphaned pending verification codes', async () => {
    // Seed user
    const userId = 'usr-profile-integrity-1';
    const passwordHash = await hashPassword('CurrentPassword123!');
    mockDb._raw.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?)'
    ).run(userId, 'profile.orig@example.com', passwordHash, 'Orig Name', 'user', 'Active', new Date().toISOString());

    const { token } = await createToken({ userId, email: 'profile.orig@example.com', name: 'Orig Name', tv: 0 }, TEST_JWT_SECRET, 3600);
    const csrfToken = newCsrfToken();
    const cookies = sessionCookies(token, csrfToken, 3600).join('; ');

    // Cause UPDATE users to fail
    const originalPrepare = mockDb.prepare.bind(mockDb);
    mockDb.prepare = function (sql) {
      if (sql.includes('UPDATE users')) {
        return {
          bind() { return this; },
          async run() {
            throw new Error('Simulated D1 error during UPDATE users');
          }
        };
      }
      return originalPrepare(sql);
    };

    const updateBody = {
      name: 'New Name',
      email: 'profile.new@example.com',
      currentPassword: 'CurrentPassword123!'
    };

    const req = new Request('http://localhost/api/auth/update-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify(updateBody)
    });

    const res = await updateProfilePost({ request: req, env, requestId: 'test-req-profile-fail' });
    assert.strictEqual(res.status, 500, 'Handler must fail with HTTP 500');

    // Verify orphaned verification code was cleaned up from email_verifications
    const pendingCodes = mockDb._raw.prepare('SELECT * FROM email_verifications WHERE user_id = ? AND email = ?').all(userId, 'profile.new@example.com');
    assert.strictEqual(pendingCodes.length, 0, 'Orphaned email_verifications row must be rolled back on update failure');

    // Verify user table state was not corrupted
    const userState = mockDb._raw.prepare('SELECT email, pending_email, name FROM users WHERE id = ?').get(userId);
    assert.strictEqual(userState.email, 'profile.orig@example.com');
    assert.strictEqual(userState.pending_email, null);
  });
});
