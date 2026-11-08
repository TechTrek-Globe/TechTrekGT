import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker.js';
import { createMockD1 } from './helpers/mockD1.js';
import { createMockKV } from './helpers/mockKV.js';
import { createToken } from '../functions/utils/auth.js';
import { sha256Hex } from '../functions/utils/ledgerAccess.js';

describe('Shared Ledger Collaboration, Invites, & Access Management Edge Tests', () => {
  let db;
  let env;
  const JWT_SECRET = 'invite-test-jwt-secret-minimum-32-chars!';

  const ownerId = 'usr_owner_10';
  const ownerEmail = 'owner10@example.com';

  const inviteeId = 'usr_invitee_20';
  const inviteeEmail = 'invitee20@example.com';

  const otherUserId = 'usr_other_30';
  const otherUserEmail = 'other30@example.com';

  let ownerHeaders;
  let inviteeHeaders;
  let otherHeaders;

  const validCsrfToken = 'csrf-fixed-invite-test-token';

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
      CODE_HMAC_SECRET: 'test-code-hmac-secret-min-32-chars-long!',
      SYNC_UNLOCK_CODE: 'UNLOCK123',
      ENVIRONMENT: 'development'
    };

    // Seed users
    const users = [
      { id: ownerId, email: ownerEmail, name: 'Alice Owner' },
      { id: inviteeId, email: inviteeEmail, name: 'Bob Invitee' },
      { id: otherUserId, email: otherUserEmail, name: 'Charlie Other' }
    ];

    for (const u of users) {
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
         VALUES (?, ?, 'hash', ?, 'Active', 'user', 1, 1)`
      ).bind(u.id, u.email, u.name).run();
    }

    // Seed owner's ledger in finance_ledgers
    await db.prepare(
      `INSERT INTO finance_ledgers (id, owner_id, name)
       VALUES (?, ?, 'Alice Household Budget')`
    ).bind(ownerId, ownerId).run();

    ownerHeaders = await makeAuthHeaders(ownerId);
    inviteeHeaders = await makeAuthHeaders(inviteeId);
    otherHeaders = await makeAuthHeaders(otherUserId);
  });

  describe('1. Invite Generation (POST /api/finance/ledgers/:id/invites)', () => {
    it('allows owner to generate an invite token with role editor', async () => {
      const req = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/invites`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ email: inviteeEmail, role: 'editor' })
      });

      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(typeof data.token).toBe('string');
      expect(data.role).toBe('editor');
      expect(data.email).toBe(inviteeEmail);
      expect(data.inviteLink).toContain(data.token);

      // Verify that SHA-256 token hash was stored in D1
      const expectedHash = await sha256Hex(data.token);
      const row = await db.prepare(
        'SELECT * FROM ledger_invites WHERE id = ?'
      ).bind(data.inviteId).first();

      expect(row).toBeDefined();
      expect(row.token_hash).toBe(expectedHash);
      expect(row.status).toBe('pending');
      expect(row.role).toBe('editor');
      expect(row.ledger_id).toBe(ownerId);
    });

    it('rejects invite generation when email format is invalid', async () => {
      const req = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/invites`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ email: 'not-an-email', role: 'viewer' })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(400);
    });

    it('blocks stranger from creating invites on owner ledger (HTTP 403)', async () => {
      const req = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/invites`, {
        method: 'POST',
        headers: otherHeaders,
        body: JSON.stringify({ email: 'somebody@example.com', role: 'viewer' })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
    });
  });

  describe('2. Invite Verification (GET /api/finance/invites/verify?token=<TOKEN>)', () => {
    let generatedToken;

    beforeEach(async () => {
      const req = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/invites`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ email: inviteeEmail, role: 'editor' })
      });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      generatedToken = data.token;
    });

    it('returns valid metadata for a fresh pending token without authentication', async () => {
      const req = new Request(`http://localhost:3000/api/finance/invites/verify?token=${generatedToken}`, {
        method: 'GET'
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.ledgerId).toBe(ownerId);
      expect(data.ledgerTitle).toBe('Alice Household Budget');
      expect(data.role).toBe('editor');
      expect(data.invitedEmail).toBe(inviteeEmail);
      expect(data.accountExists).toBe(true);
    });

    it('returns 404 with reason invalid for unknown token', async () => {
      const req = new Request('http://localhost:3000/api/finance/invites/verify?token=completely-unknown-token-xyz', {
        method: 'GET'
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.reason).toBe('invalid');
    });

    it('returns 410 with reason revoked when invite has been revoked', async () => {
      const hash = await sha256Hex(generatedToken);
      await db.prepare("UPDATE ledger_invites SET status = 'revoked' WHERE token_hash = ?").bind(hash).run();

      const req = new Request(`http://localhost:3000/api/finance/invites/verify?token=${generatedToken}`, {
        method: 'GET'
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.reason).toBe('revoked');
    });

    it('returns 410 with reason expired when invite expires_at is past', async () => {
      const hash = await sha256Hex(generatedToken);
      await db.prepare("UPDATE ledger_invites SET expires_at = datetime('now', '-1 day') WHERE token_hash = ?").bind(hash).run();

      const req = new Request(`http://localhost:3000/api/finance/invites/verify?token=${generatedToken}`, {
        method: 'GET'
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.reason).toBe('expired');
    });
  });

  describe('3. Invite Claim (POST /api/finance/invites/claim)', () => {
    let testToken;

    beforeEach(async () => {
      const req = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/invites`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ email: inviteeEmail, role: 'viewer' })
      });
      const res = await worker.fetch(req, env, {});
      const data = await res.json();
      testToken = data.token;
    });

    it('allows matched invitee to claim invite and grants share access', async () => {
      const req = new Request('http://localhost:3000/api/finance/invites/claim', {
        method: 'POST',
        headers: inviteeHeaders,
        body: JSON.stringify({ token: testToken })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.ledgerId).toBe(ownerId);
      expect(body.role).toBe('viewer');

      // Verify D1 records
      const shareRow = await db.prepare(
        'SELECT * FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
      ).bind(ownerId, inviteeId).first();
      expect(shareRow).toBeDefined();
      expect(shareRow.role).toBe('viewer');

      const hash = await sha256Hex(testToken);
      const inviteRow = await db.prepare('SELECT status, accepted_by FROM ledger_invites WHERE token_hash = ?').bind(hash).first();
      expect(inviteRow.status).toBe('accepted');
      expect(inviteRow.accepted_by).toBe(inviteeId);
    });

    it('rejects claim with HTTP 403 when authenticated user email does not match invited email', async () => {
      const req = new Request('http://localhost:3000/api/finance/invites/claim', {
        method: 'POST',
        headers: otherHeaders,
        body: JSON.stringify({ token: testToken })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.reason).toBe('email_mismatch');
      expect(data.invitedEmail).toBe(inviteeEmail);
    });

    it('rejects re-claiming an already accepted invite (HTTP 410)', async () => {
      // First claim
      await worker.fetch(new Request('http://localhost:3000/api/finance/invites/claim', {
        method: 'POST',
        headers: inviteeHeaders,
        body: JSON.stringify({ token: testToken })
      }), env, {});

      // Second claim attempt
      const res = await worker.fetch(new Request('http://localhost:3000/api/finance/invites/claim', {
        method: 'POST',
        headers: inviteeHeaders,
        body: JSON.stringify({ token: testToken })
      }), env, {});

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.reason).toBe('used');
    });
  });

  describe('4. Ledger Access & Collaborator Management', () => {
    beforeEach(async () => {
      // Direct share seeding
      await db.prepare(
        `INSERT INTO ledger_shares (id, ledger_id, user_id, role)
         VALUES ('shr_collab_1', ?, ?, 'viewer')`
      ).bind(ownerId, inviteeId).run();
    });

    it('returns role and permission matrix for GET /api/finance/ledgers/:id/access', async () => {
      const req = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/access`, {
        headers: inviteeHeaders
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.role).toBe('viewer');
      expect(body.permissions.edit).toBe(false);
      expect(body.permissions.manageShares).toBe(false);
      expect(body.permissions.read).toBe(true);
    });

    it('lists personal and shared ledgers for caller via GET /api/finance/ledgers', async () => {
      const req = new Request('http://localhost:3000/api/finance/ledgers', {
        headers: inviteeHeaders
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.ledgers.length).toBe(2); // Own personal budget + Alice's shared budget
      const shared = body.ledgers.find(l => l.id === ownerId);
      expect(shared).toBeDefined();
      expect(shared.role).toBe('viewer');
      expect(shared.isOwner).toBe(false);
    });

    it('allows owner to update collaborator role to editor via PUT /api/finance/ledgers/:id/shares/:userId', async () => {
      const req = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/shares/${inviteeId}`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({ role: 'editor' })
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const shareRow = await db.prepare(
        'SELECT role FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
      ).bind(ownerId, inviteeId).first();
      expect(shareRow.role).toBe('editor');
    });

    it('allows owner to remove collaborator via DELETE /api/finance/ledgers/:id/shares/:userId', async () => {
      const req = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/shares/${inviteeId}`, {
        method: 'DELETE',
        headers: ownerHeaders
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const shareRow = await db.prepare(
        'SELECT * FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
      ).bind(ownerId, inviteeId).first();
      expect(shareRow).toBeNull();
    });
  });

  describe('5. Registration Pre-Verification with Invite Token', () => {
    it('registers user with email_verified = 1 when inviteToken matches invited email', async () => {
      const newEmail = 'brandnew@example.com';
      const invReq = new Request(`http://localhost:3000/api/finance/ledgers/${ownerId}/invites`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ email: newEmail, role: 'viewer' })
      });
      const invRes = await worker.fetch(invReq, env, {});
      const invData = await invRes.json();
      const inviteToken = invData.token;

      const regReq = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
        body: JSON.stringify({
          name: 'Brand New User',
          email: newEmail,
          password: 'SuperSecretPassword123!',
          securityQuestion: 'Favorite Color?',
          securityAnswer: 'Blue',
          inviteToken
        })
      });

      const regRes = await worker.fetch(regReq, env, {});
      expect(regRes.status).toBe(201);
      const regData = await regRes.json();
      expect(regData.success).toBe(true);
      expect(regData.user.emailVerified).toBe(true);

      const userRow = await db.prepare(
        'SELECT email_verified FROM users WHERE email = ?'
      ).bind(newEmail).first();
      expect(userRow.email_verified).toBe(1);
    });
  });

  describe('6. Subpath URL Normalization & Frontend Modal Route Compatibility', () => {
    it('successfully resolves /finance/api/finance/ledgers/:id/invites from modal', async () => {
      const req = new Request(`http://localhost:3000/finance/api/finance/ledgers/${ownerId}/invites`, {
        headers: ownerHeaders
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.invites)).toBe(true);
      expect(Array.isArray(data.shares)).toBe(true);
      expect(data.myRole).toBe('owner');
    });

    it('resolves default alias in /finance/api/finance/ledgers/default/invites to caller ledger', async () => {
      const req = new Request('http://localhost:3000/finance/api/finance/ledgers/default/invites', {
        headers: ownerHeaders
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.myRole).toBe('owner');
    });

    it('successfully resolves /finance/api/finance/ledgers list', async () => {
      const req = new Request('http://localhost:3000/finance/api/finance/ledgers', {
        headers: ownerHeaders
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.ledgers)).toBe(true);
    });
  });
});
