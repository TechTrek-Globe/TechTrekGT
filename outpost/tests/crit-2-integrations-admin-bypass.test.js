import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as revokeIntegrationPost, onRequestDelete as deleteIntegrationDelete } from '../functions/api/integrations/[id].js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const ADMIN_EMAIL = 'admin@techtrekgt.test';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec(auctionSchema);

  return {
    _raw: db,
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          const stmt = db.prepare(sql);
          return stmt.get(...boundParams) || null;
        },
        async all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...boundParams) };
        },
        async run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    }
  };
}

describe('CRIT-2: Removal of Email-String Admin Bypass on /api/integrations Revoke and Delete', () => {
  let mockDb;
  let env;
  const victimUserId = 'usr-victim-100';
  const attackerUserId = 'usr-attacker-200';
  const targetIntegrationId = 'target-int-crit2';
  let attackerJwt;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      ADMIN_EMAIL: ADMIN_EMAIL
    };

    // 1. Seed victim user (owner of target integration)
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, is_admin)
      VALUES (?, ?, 'dummyhash', 'Victim User', 'Active', 1, 0)
    `).run(victimUserId, 'victim@techtrek.test');

    // 2. Seed victim integration
    mockDb._raw.prepare(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES (?, ?, 'hash_secret_victim', 'Victim VScout Key', datetime('now'))
    `).run(targetIntegrationId, victimUserId);

    // 3. Seed attacker user with email matching env.ADMIN_EMAIL, email_verified = 1, but is_admin = 0
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, email_verified_at, is_admin)
      VALUES (?, ?, 'dummyhash', 'Attacker Impersonator', 'Active', 1, datetime('now'), 0)
    `).run(attackerUserId, ADMIN_EMAIL);

    attackerJwt = await createToken({ userId: attackerUserId, email: ADMIN_EMAIL }, TEST_JWT_SECRET, 3600);
  });

  test('POST /api/integrations/:id/revoke rejects non-admin attacker matching ADMIN_EMAIL (HTTP 404)', async () => {
    const req = new Request(`https://outpost.techtrekgt.com/api/integrations/${targetIntegrationId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${attackerJwt}`
      }
    });

    const res = await revokeIntegrationPost({
      request: req,
      env,
      params: { id: targetIntegrationId }
    });

    assert.strictEqual(res.status, 404, 'Must return 404 because attacker is not is_admin=1 and does not own the resource');

    // Verify integration remains unrevoked
    const intRow = mockDb._raw.prepare('SELECT revoked_at FROM api_integrations WHERE id = ?').get(targetIntegrationId);
    assert.strictEqual(intRow.revoked_at, null);
  });

  test('POST /api/integrations/revoke (body-based ID) rejects non-admin attacker matching ADMIN_EMAIL (HTTP 404)', async () => {
    const req = new Request('https://outpost.techtrekgt.com/api/integrations/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${attackerJwt}`
      },
      body: JSON.stringify({ id: targetIntegrationId })
    });

    const res = await revokeIntegrationPost({
      request: req,
      env,
      params: { id: 'revoke' }
    });

    assert.strictEqual(res.status, 404, 'Must return 404 for body-based revoke without is_admin=1');

    const intRow = mockDb._raw.prepare('SELECT revoked_at FROM api_integrations WHERE id = ?').get(targetIntegrationId);
    assert.strictEqual(intRow.revoked_at, null);
  });

  test('DELETE /api/integrations/:id rejects non-admin attacker matching ADMIN_EMAIL (HTTP 404)', async () => {
    const req = new Request(`https://outpost.techtrekgt.com/api/integrations/${targetIntegrationId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': `auth_token=${attackerJwt}`
      }
    });

    const res = await deleteIntegrationDelete({
      request: req,
      env,
      params: { id: targetIntegrationId }
    });

    assert.strictEqual(res.status, 404, 'Must return 404 for delete without is_admin=1');

    const intRow = mockDb._raw.prepare('SELECT revoked_at FROM api_integrations WHERE id = ?').get(targetIntegrationId);
    assert.strictEqual(intRow.revoked_at, null);
  });

  test('Legitimate admin with is_admin = 1 CAN revoke and delete another user integration', async () => {
    // Elevate attacker to true database admin: is_admin = 1
    mockDb._raw.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(attackerUserId);

    const revokeReq = new Request(`https://outpost.techtrekgt.com/api/integrations/${targetIntegrationId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${attackerJwt}`
      }
    });

    const res = await revokeIntegrationPost({
      request: revokeReq,
      env,
      params: { id: targetIntegrationId }
    });

    assert.strictEqual(res.status, 200, 'True admin with is_admin=1 must be authorized');
    const body = await res.json();
    assert.strictEqual(body.revoked, true);

    const intRow = mockDb._raw.prepare('SELECT revoked_at FROM api_integrations WHERE id = ?').get(targetIntegrationId);
    assert.ok(intRow.revoked_at, 'Integration must be revoked');
  });

  test('Users can still revoke and delete their OWN integrations without admin privileges', async () => {
    const victimJwt = await createToken({ userId: victimUserId, email: 'victim@techtrek.test' }, TEST_JWT_SECRET, 3600);

    const deleteReq = new Request(`https://outpost.techtrekgt.com/api/integrations/${targetIntegrationId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': `auth_token=${victimJwt}`
      }
    });

    const res = await deleteIntegrationDelete({
      request: deleteReq,
      env,
      params: { id: targetIntegrationId }
    });

    assert.strictEqual(res.status, 200, 'Owner can delete their own integration');
    const body = await res.json();
    assert.strictEqual(body.revoked, true);
  });
});
