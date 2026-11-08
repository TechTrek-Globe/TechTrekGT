import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker.js';
import { createMockD1 } from './helpers/mockD1.js';
import { createMockKV } from './helpers/mockKV.js';
import { createToken } from '../functions/utils/auth.js';

describe('Admin Cross-App Account Separation, Ledger Association, & Account Deletion', () => {
  let db;
  let env;
  const JWT_SECRET = 'admin-mgmt-test-jwt-secret-min-32-chars!';

  const adminUserId = 'usr_admin_master_1';
  const adminEmail = 'admin@example.com';

  const financeUserId = 'usr_finance_user_2';
  const financeEmail = 'finance.user@example.com';

  const wayfinderUserId = 'usr_wayfinder_user_3';
  const wayfinderEmail = 'wayfinder.user@example.com';

  const unaffiliatedUserId = 'usr_unaffiliated_4';
  const unaffiliatedEmail = 'unaffiliated.user@example.com';

  let adminHeaders;
  let nonAdminHeaders;
  const validCsrfToken = 'csrf-admin-mgmt-fixed-test';

  async function makeAuthHeaders(userId) {
    const { token: jwt } = await createToken({ userId, tv: 1 }, JWT_SECRET, 3600);
    return {
      'Cookie': `auth_token=${jwt}; csrf_token=${validCsrfToken}`,
      'X-CSRF-Token': validCsrfToken,
      'Origin': 'http://localhost:3000',
      'Content-Type': 'application/json'
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
      ENVIRONMENT: 'development'
    };

    // Seed users
    const users = [
      { id: adminUserId, email: adminEmail, name: 'Master Admin', role: 'admin' },
      { id: financeUserId, email: financeEmail, name: 'Finance User', role: 'user' },
      { id: wayfinderUserId, email: wayfinderEmail, name: 'Wayfinder User', role: 'user' },
      { id: unaffiliatedUserId, email: unaffiliatedEmail, name: 'Unaffiliated User', role: 'user' }
    ];

    for (const u of users) {
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
         VALUES (?, ?, 'hash', ?, 'Active', ?, 1, 1)`
      ).bind(u.id, u.email, u.name, u.role).run();
    }

    // Seed finance user with a backup and ledger
    await db.prepare(
      `INSERT INTO finance_ledgers (id, owner_id, name)
       VALUES (?, ?, 'Finance Household Budget')`
    ).bind(financeUserId, financeUserId).run();

    await db.prepare(
      `INSERT INTO user_backups (id, data, data_byte_length, updated_at, updated_at_ms)
       VALUES (?, '{"accounts":[]}', 16, datetime('now'), ?)`
    ).bind(financeUserId, Date.now()).run();

    // Create wayfinder_agenda_shares table and seed wayfinder user
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS wayfinder_agenda_shares (
        id TEXT PRIMARY KEY,
        agenda_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL
      )
    `).run();

    await db.prepare(
      `INSERT INTO wayfinder_agenda_shares (id, agenda_id, user_id, role)
       VALUES ('wf_shr_1', 'poland-christmas-2026', ?, 'viewer')`
    ).bind(wayfinderUserId).run();

    adminHeaders = await makeAuthHeaders(adminUserId);
    nonAdminHeaders = await makeAuthHeaders(financeUserId);
  });

  describe('1. Cross-App Account Separation (GET /api/admin/stats)', () => {
    it('strictly isolates Finance accounts and omits Wayfinder and unaffiliated accounts', async () => {
      const req = new Request('http://localhost:3000/api/admin/stats', {
        headers: adminHeaders
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.totalUsers).toBe(2);
      expect(data.financeCount).toBe(2);

      // Verify users contains admin and financeUser, but NOT wayfinderUser or unaffiliatedUser
      const financeEmails = data.financeUsers.map(u => u.email);
      expect(financeEmails).toContain(financeEmail);
      expect(financeEmails).toContain(adminEmail);
      expect(financeEmails).not.toContain(wayfinderEmail);
      expect(financeEmails).not.toContain(unaffiliatedEmail);

      // Other platform accounts must be completely omitted from Finance stats
      expect(data.otherUsers).toEqual([]);
    });

    it('rejects non-admin access with HTTP 403 Forbidden', async () => {
      const req = new Request('http://localhost:3000/api/admin/stats', {
        headers: nonAdminHeaders
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });
  });

  describe('2. Ledger Membership Association (POST /api/admin/ledger-membership)', () => {
    it('associates an unaffiliated or wayfinder account into a finance ledger', async () => {
      const req = new Request('http://localhost:3000/api/admin/ledger-membership', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          ledgerId: financeUserId,
          userId: wayfinderUserId,
          role: 'editor'
        })
      });

      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.role).toBe('editor');

      // Verify row in ledger_shares
      const shareRow = await db.prepare(
        'SELECT * FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
      ).bind(financeUserId, wayfinderUserId).first();
      expect(shareRow).toBeDefined();
      expect(shareRow.role).toBe('editor');

      // Subsequent stats call now recognizes wayfinderUser as a Finance collaborator
      const statsReq = new Request('http://localhost:3000/api/admin/stats', {
        headers: adminHeaders
      });
      const statsRes = await worker.fetch(statsReq, env, {});
      const statsData = await statsRes.json();
      const updatedFinanceEmails = statsData.financeUsers.map(u => u.email);
      expect(updatedFinanceEmails).toContain(wayfinderEmail);
    });

    it('disconnects an account from a finance ledger', async () => {
      // First associate
      await worker.fetch(new Request('http://localhost:3000/api/admin/ledger-membership', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          ledgerId: financeUserId,
          userId: wayfinderUserId,
          role: 'viewer'
        })
      }), env, {});

      // Disconnect via POST /api/admin/ledger-membership/remove
      const req = new Request('http://localhost:3000/api/admin/ledger-membership/remove', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          ledgerId: financeUserId,
          userId: wayfinderUserId
        })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const shareRow = await db.prepare(
        'SELECT * FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
      ).bind(financeUserId, wayfinderUserId).first();
      expect(shareRow).toBeNull();
    });
  });

  describe('3. Universal Account Deletion (POST /api/admin/user-delete)', () => {
    it('permanently deletes a user account across all tables', async () => {
      // Link unaffiliated user with a share and pending invite first
      await db.prepare(
        `INSERT INTO ledger_shares (id, ledger_id, user_id, role)
         VALUES ('shr_temp_del', ?, ?, 'viewer')`
      ).bind(financeUserId, unaffiliatedUserId).run();

      await db.prepare(
        `INSERT INTO ledger_invites (id, ledger_id, invited_email, role, token_hash, status, invited_by, expires_at)
         VALUES ('inv_temp_del', ?, ?, 'viewer', 'hash123', 'pending', ?, datetime('now', '+7 days'))`
      ).bind(financeUserId, unaffiliatedEmail, adminUserId).run();

      const req = new Request('http://localhost:3000/api/admin/user-delete', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ userId: unaffiliatedUserId })
      });

      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isSelf).toBe(false);

      // Verify deletion in users table
      const userRow = await db.prepare('SELECT * FROM users WHERE id = ?').bind(unaffiliatedUserId).first();
      expect(userRow).toBeNull();

      // Verify cascading deletion in ledger_shares
      const shareRow = await db.prepare('SELECT * FROM ledger_shares WHERE user_id = ?').bind(unaffiliatedUserId).first();
      expect(shareRow).toBeNull();

      // Verify cascading deletion in ledger_invites
      const inviteRow = await db.prepare('SELECT * FROM ledger_invites WHERE id = ?').bind('inv_temp_del').first();
      expect(inviteRow).toBeNull();
    });

    it('rejects deletion attempt from non-admin caller (HTTP 403)', async () => {
      const req = new Request('http://localhost:3000/api/admin/user-delete', {
        method: 'POST',
        headers: nonAdminHeaders,
        body: JSON.stringify({ userId: unaffiliatedUserId })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });
  });
});

