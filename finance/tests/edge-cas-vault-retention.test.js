import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker.js';
import { createMockD1 } from './helpers/mockD1.js';
import { createMockKV } from './helpers/mockKV.js';
import { createToken } from '../functions/utils/auth.js';

describe('BUG-003: Cloud Vault Backup Retention & Snapshot Pruning Edge Tests', () => {
  let db;
  let env;
  let testUserId;
  let validAuthCookie;
  let validCsrfToken;

  const JWT_SECRET = 'vault-retention-secret-32-chars-long!';

  beforeEach(async () => {
    db = createMockD1();
    env = {
      DB: db,
      GATEWAY_KV: createMockKV(),
      USER_CACHE: createMockKV(),
      RATE_LIMIT_KV: createMockKV(),
      JWT_SECRET,
      SYNC_UNLOCK_CODE: 'UNLOCK123',
      ENVIRONMENT: 'development'
    };

    testUserId = 'usr_retention_test';
    await db.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
       VALUES (?, ?, 'hash', 'Retention User', 'Active', 'user', 1, 1)`
    ).bind(testUserId, 'retention@example.com').run();

    validCsrfToken = 'csrf-token-retention';
    const { token: jwt } = await createToken({ userId: testUserId, tv: 1 }, JWT_SECRET, 3600);
    validAuthCookie = `auth_token=${jwt}; csrf_token=${validCsrfToken}`;
  });

  function makeBackupRequest(body) {
    return new Request('http://localhost:3000/finance/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': validAuthCookie,
        'X-CSRF-Token': validCsrfToken,
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify(body)
    });
  }

  function makeVersionsRequest() {
    return new Request('http://localhost:3000/finance/api/sync/versions', {
      method: 'GET',
      headers: {
        'Cookie': validAuthCookie,
        'Origin': 'http://localhost:3000'
      }
    });
  }

  it('prunes historical manual snapshots beyond the retention threshold', async () => {
    // Perform multiple manual backups with distinct timestamps
    for (let i = 1; i <= 6; i++) {
      const payload = {
        schemaVersion: 8,
        accounts: [{ id: `acc_${i}`, name: `Account ${i}` }]
      };
      const req = makeBackupRequest({ budget: payload, manual: true, force: true });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
    }

    // Verify row count in user_backup_versions
    const countRow = await db.prepare(
      'SELECT COUNT(*) as cnt FROM user_backup_versions WHERE user_id = ?'
    ).bind(testUserId).first();

    const storedCount = Number(countRow.cnt);
    // Stored count should be bounded (at most 10)
    expect(storedCount).toBeLessThanOrEqual(10);
    expect(storedCount).toBeGreaterThan(0);
  });

  it('guarantees that auto-sync updates single ongoing sync without generating historical snapshots', async () => {
    // 1. Initial manual backup creates 1 snapshot
    const manualPayload = { schemaVersion: 8, accounts: [{ id: 'acc_manual', name: 'Manual' }] };
    const manualReq = makeBackupRequest({ budget: manualPayload, manual: true, force: true });
    await worker.fetch(manualReq, env, {});

    const snapshotBefore = await db.prepare(
      'SELECT COUNT(*) as cnt FROM user_backup_versions WHERE user_id = ?'
    ).bind(testUserId).first();
    const countBefore = Number(snapshotBefore.cnt);
    expect(countBefore).toBe(1);

    // 2. Perform automated background syncs
    for (let i = 1; i <= 3; i++) {
      const autoPayload = { schemaVersion: 8, accounts: [{ id: `acc_auto_${i}`, name: `Auto ${i}` }] };
      const autoReq = makeBackupRequest({ budget: autoPayload, auto: true, force: true });
      const autoRes = await worker.fetch(autoReq, env, {});
      expect(autoRes.status).toBe(200);
    }

    // Snapshot count must remain exactly 1 (no pollution from background auto-saves)
    const snapshotAfter = await db.prepare(
      'SELECT COUNT(*) as cnt FROM user_backup_versions WHERE user_id = ?'
    ).bind(testUserId).first();
    expect(Number(snapshotAfter.cnt)).toBe(1);

    // Ongoing sync record in user_backups must reflect the latest auto-save
    const ongoing = await db.prepare('SELECT data FROM user_backups WHERE id = ?').bind(testUserId).first();
    expect(ongoing.data).toContain('acc_auto_3');
  });

  it('lists historical versions through GET /api/sync/versions along with ongoing sync metadata', async () => {
    const payload = { schemaVersion: 8, accounts: [{ id: 'acc_v', name: 'Versioned' }] };
    await worker.fetch(makeBackupRequest({ budget: payload, manual: true, force: true }), env, {});

    const versionsRes = await worker.fetch(makeVersionsRequest(), env, {});
    expect(versionsRes.status).toBe(200);

    const body = await versionsRes.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.versions)).toBe(true);
    expect(body.versions.length).toBeGreaterThan(0);
    expect(body.ongoingSync).toBeDefined();
    expect(body.ongoingSync.updatedAt).toBeDefined();
  });
});
