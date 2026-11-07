import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker.js';
import { createMockD1 } from './helpers/mockD1.js';
import { createMockKV } from './helpers/mockKV.js';
import { createToken } from '../functions/utils/auth.js';

describe('FIN-AUDIT-004: Tenant Isolation & Shared Ledger Access Control Edge Tests', () => {
  let db;
  let env;
  const JWT_SECRET = 'tenant-isolation-jwt-secret-minimum-32-chars!';

  const ownerUserId = 'usr_owner_100';
  const adminUserId = 'usr_admin_200';
  const editorUserId = 'usr_editor_300';
  const viewerUserId = 'usr_viewer_400';
  const strangerUserId = 'usr_stranger_500';
  const platformAdminUserId = 'usr_plat_admin_900';

  let ownerAuthHeader;
  let adminAuthHeader;
  let editorAuthHeader;
  let viewerAuthHeader;
  let strangerAuthHeader;
  let platformAdminAuthHeader;

  const validCsrfToken = 'csrf-test-token-fixed-abc';

  async function createAuthHeaders(userId) {
    const { token: jwt } = await createToken({ userId, tv: 1 }, JWT_SECRET, 3600);
    return {
      'Cookie': `auth_token=${jwt}; csrf_token=${validCsrfToken}`,
      'X-CSRF-Token': validCsrfToken,
      'Origin': 'http://localhost:3000'
    };
  }

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

    // Seed users
    const users = [
      { id: ownerUserId, email: 'owner@example.com', role: 'user' },
      { id: adminUserId, email: 'admin@example.com', role: 'user' },
      { id: editorUserId, email: 'editor@example.com', role: 'user' },
      { id: viewerUserId, email: 'viewer@example.com', role: 'user' },
      { id: strangerUserId, email: 'stranger@example.com', role: 'user' },
      { id: platformAdminUserId, email: 'platform_admin@example.com', role: 'admin' }
    ];

    for (const u of users) {
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
         VALUES (?, ?, 'hash', ?, 'Active', ?, 1, 1)`
      ).bind(u.id, u.email, u.email.split('@')[0], u.role).run();
    }

    // Seed finance_ledgers row for owner
    await db.prepare(
      `INSERT INTO finance_ledgers (id, owner_id, name)
       VALUES (?, ?, 'Owner Household Budget')`
    ).bind(ownerUserId, ownerUserId).run();

    // Seed initial backup data for owner's ledger
    const samplePayload = JSON.stringify({
      schemaVersion: 8,
      accounts: [{ id: 'acc_1', name: 'Checking', type: 'checking', startingBalance: 1000 }],
      bills: [],
      dailyMatrix: {}
    });

    await db.prepare(
      `INSERT INTO user_backups (id, data, data_byte_length, updated_at, updated_at_ms)
       VALUES (?, ?, ?, datetime('now'), ?)`
    ).bind(ownerUserId, samplePayload, samplePayload.length, Date.now()).run();

    // Seed a saved version in user_backup_versions
    await db.prepare(
      `INSERT INTO user_backup_versions (id, user_id, data, saved_at)
       VALUES ('ver_test_01', ?, ?, ?)`
    ).bind(ownerUserId, samplePayload, Date.now()).run();

    // Seed ledger shares for collaborator roles
    await db.prepare(
      `INSERT INTO ledger_shares (id, ledger_id, user_id, role)
       VALUES ('shr_1', ?, ?, 'admin')`
    ).bind(ownerUserId, adminUserId).run();

    await db.prepare(
      `INSERT INTO ledger_shares (id, ledger_id, user_id, role)
       VALUES ('shr_2', ?, ?, 'editor')`
    ).bind(ownerUserId, editorUserId).run();

    await db.prepare(
      `INSERT INTO ledger_shares (id, ledger_id, user_id, role)
       VALUES ('shr_3', ?, ?, 'viewer')`
    ).bind(ownerUserId, viewerUserId).run();

    // Prepare auth headers for all actors
    ownerAuthHeader = await createAuthHeaders(ownerUserId);
    adminAuthHeader = await createAuthHeaders(adminUserId);
    editorAuthHeader = await createAuthHeaders(editorUserId);
    viewerAuthHeader = await createAuthHeaders(viewerUserId);
    strangerAuthHeader = await createAuthHeaders(strangerUserId);
    platformAdminAuthHeader = await createAuthHeaders(platformAdminUserId);
  });

  describe('1. Unaffiliated / Stranger Isolation (Role: none)', () => {
    it('blocks stranger from reading restore endpoint for owner ledger (HTTP 403)', async () => {
      const req = new Request(`http://localhost:3000/api/sync/restore?ledgerId=${ownerUserId}`, {
        headers: strangerAuthHeader
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });

    it('blocks stranger from writing backup to owner ledger (HTTP 403)', async () => {
      const req = new Request('http://localhost:3000/api/sync/backup', {
        method: 'POST',
        headers: { ...strangerAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledgerId: ownerUserId,
          budget: { schemaVersion: 8, accounts: [], bills: [], dailyMatrix: {} },
          baseVersion: 0
        })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });

    it('blocks stranger from reading backup versions for owner ledger (HTTP 403)', async () => {
      const req = new Request(`http://localhost:3000/api/sync/versions?ledgerId=${ownerUserId}`, {
        headers: strangerAuthHeader
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });

    it('blocks stranger from restoring backup version for owner ledger (HTTP 403)', async () => {
      const req = new Request('http://localhost:3000/api/sync/restore-version', {
        method: 'POST',
        headers: { ...strangerAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'ver_test_01', ledgerId: ownerUserId })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });

    it('blocks stranger from deleting backup version for owner ledger (HTTP 403)', async () => {
      const req = new Request('http://localhost:3000/api/sync/delete-version', {
        method: 'POST',
        headers: { ...strangerAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'ver_test_01', ledgerId: ownerUserId })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });
  });

  describe('2. Viewer Permissions Enforcement (Role: viewer)', () => {
    it('allows viewer to read restore data from owner ledger', async () => {
      const req = new Request(`http://localhost:3000/api/sync/restore?ledgerId=${ownerUserId}`, {
        headers: viewerAuthHeader
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.budget).toBeDefined();
      expect(body.budget.accounts[0].name).toBe('Checking');
    });

    it('allows viewer to list backup versions from owner ledger', async () => {
      const req = new Request(`http://localhost:3000/api/sync/versions?ledgerId=${ownerUserId}`, {
        headers: viewerAuthHeader
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.versions.length).toBeGreaterThan(0);
    });

    it('blocks viewer from writing backup to shared ledger (HTTP 403)', async () => {
      const req = new Request('http://localhost:3000/api/sync/backup', {
        method: 'POST',
        headers: { ...viewerAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledgerId: ownerUserId,
          budget: { schemaVersion: 8, accounts: [], bills: [], dailyMatrix: {} },
          baseVersion: 0
        })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });

    it('blocks viewer from restoring snapshot version to shared ledger (HTTP 403)', async () => {
      const req = new Request('http://localhost:3000/api/sync/restore-version', {
        method: 'POST',
        headers: { ...viewerAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'ver_test_01', ledgerId: ownerUserId })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });

    it('blocks viewer from deleting snapshot version from shared ledger (HTTP 403)', async () => {
      const req = new Request('http://localhost:3000/api/sync/delete-version', {
        method: 'POST',
        headers: { ...viewerAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'ver_test_01', ledgerId: ownerUserId })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });
  });

  describe('3. Editor Permissions Enforcement (Role: editor)', () => {
    it('allows editor to read and write backup to shared ledger', async () => {
      const updatedPayload = {
        schemaVersion: 8,
        accounts: [{ id: 'acc_1', name: 'Checking Edited', type: 'checking', startingBalance: 1200 }],
        bills: [],
        dailyMatrix: {}
      };

      const req = new Request('http://localhost:3000/api/sync/backup', {
        method: 'POST',
        headers: { ...editorAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledgerId: ownerUserId,
          budget: updatedPayload,
          baseVersion: 0,
          force: true
        })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify read-back
      const restoreReq = new Request(`http://localhost:3000/api/sync/restore?ledgerId=${ownerUserId}`, {
        headers: editorAuthHeader
      });
      const restoreRes = await worker.fetch(restoreReq, env, {});
      const restoreBody = await restoreRes.json();
      expect(restoreBody.budget.accounts[0].name).toBe('Checking Edited');
    });

    it('blocks editor from deleting backup version (HTTP 403 - requires share admin)', async () => {
      const req = new Request('http://localhost:3000/api/sync/delete-version', {
        method: 'POST',
        headers: { ...editorAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'ver_test_01', ledgerId: ownerUserId })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });
  });

  describe('4. Share Admin & Owner Permissions Enforcement', () => {
    it('allows share admin to delete backup versions from shared ledger', async () => {
      const req = new Request('http://localhost:3000/api/sync/delete-version', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'ver_test_01', ledgerId: ownerUserId })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deletedVersionId).toBe('ver_test_01');
    });

    it('allows platform admin full read and write access to any ledger', async () => {
      const req = new Request(`http://localhost:3000/api/sync/restore?ledgerId=${ownerUserId}`, {
        headers: platformAdminAuthHeader
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
