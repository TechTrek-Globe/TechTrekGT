import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet as getIntegrationsHandler, onRequestPost as createIntegrationHandler } from '../functions/api/integrations/index.js';
import { onRequestPost as revokeIntegrationHandler } from '../functions/api/integrations/[id].js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

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

describe('MED-4: Per-Account Limit on Active API Integrations Creation', () => {
  let mockDb;
  let env;
  const userAId = 'usr-account-limit-a';
  const userBId = 'usr-account-limit-b';
  let userAJwt;
  let userBJwt;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    // Seed test users
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, is_admin)
      VALUES (?, ?, 'dummyhash', 'User A', 'Active', 1, 0)
    `).run(userAId, 'usera@techtrekgt.test');

    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, is_admin)
      VALUES (?, ?, 'dummyhash', 'User B', 'Active', 1, 0)
    `).run(userBId, 'userb@techtrekgt.test');

    userAJwt = await createToken({ userId: userAId, email: 'usera@techtrekgt.test' }, TEST_JWT_SECRET, 3600);
    userBJwt = await createToken({ userId: userBId, email: 'userb@techtrekgt.test' }, TEST_JWT_SECRET, 3600);
  });

  test('User can create up to 10 active integrations sequentially', async () => {
    const createdIds = [];

    for (let i = 1; i <= 10; i++) {
      const req = new Request('https://outpost.techtrekgt.com/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${userAJwt}`
        },
        body: JSON.stringify({ label: `VineScout Device ${i}` })
      });

      const res = await createIntegrationHandler({ request: req, env });
      assert.strictEqual(res.status, 201, `Integration ${i} should return 201 Created`);

      const data = await res.json();
      assert.ok(data.integration, 'Response should contain integration object');
      assert.ok(data.integration.id, 'Integration should have an id');
      assert.strictEqual(data.integration.user_id, userAId);
      assert.strictEqual(data.integration.label, `VineScout Device ${i}`);
      assert.ok(data.integration.secret, 'Response should contain the one-time raw secret');
      assert.ok(data.integration.secret.startsWith('op_sec_'), 'Secret should have op_sec_ prefix');

      createdIds.push(data.integration.id);
    }

    assert.strictEqual(createdIds.length, 10);

    // Verify 10 rows exist in the DB for User A
    const count = mockDb._raw.prepare(
      'SELECT COUNT(*) as cnt FROM api_integrations WHERE user_id = ? AND revoked_at IS NULL'
    ).get(userAId);
    assert.strictEqual(count.cnt, 10);
  });

  test('11th integration creation attempt is rejected with HTTP 429 and clear error message', async () => {
    // 1. Pre-create 10 active integrations for User A
    for (let i = 1; i <= 10; i++) {
      const req = new Request('https://outpost.techtrekgt.com/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${userAJwt}`
        },
        body: JSON.stringify({ label: `Device ${i}` })
      });
      const res = await createIntegrationHandler({ request: req, env });
      assert.strictEqual(res.status, 201);
    }

    // 2. Attempt 11th creation
    const req11 = new Request('https://outpost.techtrekgt.com/api/integrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${userAJwt}`
      },
      body: JSON.stringify({ label: '11th Device (Should Fail)' })
    });

    const res11 = await createIntegrationHandler({ request: req11, env });
    assert.strictEqual(res11.status, 429, '11th attempt must be rejected with HTTP 429');

    const data11 = await res11.json();
    assert.strictEqual(
      data11.error,
      'Maximum number of active API integrations (10) reached. Revoke an existing integration before creating a new one.'
    );

    // Verify exactly 10 integrations remain in the database for User A
    const count = mockDb._raw.prepare(
      'SELECT COUNT(*) as cnt FROM api_integrations WHERE user_id = ?'
    ).get(userAId);
    assert.strictEqual(count.cnt, 10, 'No 11th row should have been inserted');
  });

  test('Revoking an integration frees a slot allowing a new integration to be created', async () => {
    let firstIntegrationId = null;

    // 1. Create 10 integrations
    for (let i = 1; i <= 10; i++) {
      const req = new Request('https://outpost.techtrekgt.com/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${userAJwt}`
        },
        body: JSON.stringify({ label: `Device ${i}` })
      });
      const res = await createIntegrationHandler({ request: req, env });
      const data = await res.json();
      if (i === 1) firstIntegrationId = data.integration.id;
    }

    // Confirm at limit
    const reqFail = new Request('https://outpost.techtrekgt.com/api/integrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${userAJwt}`
      },
      body: JSON.stringify({ label: 'Attempt at 10' })
    });
    const resFail = await createIntegrationHandler({ request: reqFail, env });
    assert.strictEqual(resFail.status, 429);

    // 2. Revoke the first integration
    const revokeReq = new Request(`https://outpost.techtrekgt.com/api/integrations/${firstIntegrationId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${userAJwt}`
      }
    });
    const revokeRes = await revokeIntegrationHandler({
      request: revokeReq,
      env,
      params: { id: firstIntegrationId }
    });
    assert.strictEqual(revokeRes.status, 200, 'Revoke should return 200 OK');

    // Confirm active count is now 9
    const activeCount = mockDb._raw.prepare(
      'SELECT COUNT(*) as cnt FROM api_integrations WHERE user_id = ? AND revoked_at IS NULL'
    ).get(userAId);
    assert.strictEqual(activeCount.cnt, 9);

    // 3. Create a replacement integration
    const reqReplacement = new Request('https://outpost.techtrekgt.com/api/integrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${userAJwt}`
      },
      body: JSON.stringify({ label: 'Replacement Device' })
    });
    const resReplacement = await createIntegrationHandler({ request: reqReplacement, env });
    assert.strictEqual(resReplacement.status, 201, 'Creation should succeed after revoking an active key');

    const repData = await resReplacement.json();
    assert.strictEqual(repData.integration.label, 'Replacement Device');

    // Active count is back to 10
    const finalActiveCount = mockDb._raw.prepare(
      'SELECT COUNT(*) as cnt FROM api_integrations WHERE user_id = ? AND revoked_at IS NULL'
    ).get(userAId);
    assert.strictEqual(finalActiveCount.cnt, 10);

    // Total rows is 11 (1 revoked + 10 active)
    const totalCount = mockDb._raw.prepare(
      'SELECT COUNT(*) as cnt FROM api_integrations WHERE user_id = ?'
    ).get(userAId);
    assert.strictEqual(totalCount.cnt, 11);
  });

  test('Limit is strictly per-account and does not block another user', async () => {
    // Fill User A to 10 integrations
    for (let i = 1; i <= 10; i++) {
      const req = new Request('https://outpost.techtrekgt.com/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${userAJwt}`
        },
        body: JSON.stringify({ label: `User A Device ${i}` })
      });
      await createIntegrationHandler({ request: req, env });
    }

    // User B should be able to create an integration without being blocked by User A
    const reqB = new Request('https://outpost.techtrekgt.com/api/integrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${userBJwt}`
      },
      body: JSON.stringify({ label: 'User B First Device' })
    });
    const resB = await createIntegrationHandler({ request: reqB, env });
    assert.strictEqual(resB.status, 201, 'User B must not be throttled by User A reaching quota');

    const dataB = await resB.json();
    assert.strictEqual(dataB.integration.user_id, userBId);
  });

  test('GET /api/integrations allows users to inspect all integrations for pruning', async () => {
    // Create 2 integrations for User A, revoke 1
    const req1 = new Request('https://outpost.techtrekgt.com/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${userAJwt}` },
      body: JSON.stringify({ label: 'Integration To Keep' })
    });
    await createIntegrationHandler({ request: req1, env });

    const req2 = new Request('https://outpost.techtrekgt.com/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${userAJwt}` },
      body: JSON.stringify({ label: 'Integration To Revoke' })
    });
    const res2 = await createIntegrationHandler({ request: req2, env });
    const data2 = await res2.json();

    await revokeIntegrationHandler({
      request: new Request(`https://outpost.techtrekgt.com/api/integrations/${data2.integration.id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${userAJwt}` }
      }),
      env,
      params: { id: data2.integration.id }
    });

    // Call GET /api/integrations
    const getReq = new Request('https://outpost.techtrekgt.com/api/integrations', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${userAJwt}` }
    });
    const getRes = await getIntegrationsHandler({ request: getReq, env });
    assert.strictEqual(getRes.status, 200);

    const getData = await getRes.json();
    assert.ok(Array.isArray(getData.integrations));
    assert.strictEqual(getData.integrations.length, 2);

    const activeItem = getData.integrations.find(i => i.label === 'Integration To Keep');
    const revokedItem = getData.integrations.find(i => i.label === 'Integration To Revoke');

    assert.ok(activeItem);
    assert.strictEqual(activeItem.revoked_at, null);

    assert.ok(revokedItem);
    assert.ok(revokedItem.revoked_at !== null);
  });
});
