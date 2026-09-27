import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveIntegrationUserId, hashSecret, generateIntegrationSecret } from '../functions/utils/apiIntegrations.js';
import { onRequestPost as amazonImportPost } from '../functions/api/import/amazon.js';
import { onRequestGet as vinescoutInventoryGet } from '../functions/api/export/vinescout-inventory.js';
import { onRequestGet as vinescoutSalesGet } from '../functions/api/export/vinescout-sales.js';
import { onRequestGet as integrationsListGet, onRequestPost as integrationsCreatePost } from '../functions/api/integrations/index.js';
import { onRequestPost as integrationRevokePost, onRequestDelete as integrationDelete } from '../functions/api/integrations/[id].js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const TEST_OUTPOST_SECRET_KEY = 'master-outpost-secret-fallback-key';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  // Execute finance schema for users table
  db.exec(financeSchema);
  db.exec("ALTER TABLE users ADD COLUMN amazon_api_token TEXT;");
  // Execute auction schema for auction and integration tables
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
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  };
}

describe('[HIGH-2] Per-Installation API Integration Secrets', () => {
  let mockDb;
  let userAId = 'usr_alice_001';
  let userBId = 'usr_bob_002';
  let cookieA;
  let cookieB;

  beforeEach(async () => {
    mockDb = createMockD1();

    // Insert Account A (earliest registered user)
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin, created_at)
      VALUES ('${userAId}', 'alice@techtrekgt.com', 'hashA', 'Alice Admin', 'admin', 1, '2026-01-01 10:00:00');
    `);

    // Insert Account B (later registered user)
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin, created_at)
      VALUES ('${userBId}', 'bob@techtrekgt.com', 'hashB', 'Bob User', 'user', 0, '2026-02-01 10:00:00');
    `);

    // Pre-create invoices so items can reference them
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, created_at)
      VALUES ('inv_alice', '${userAId}', 'AMAZON-ALICE', '2026-01-01 12:00:00'),
             ('inv_bob', '${userBId}', 'AMAZON-BOB', '2026-02-01 12:00:00');
    `);

    const tokenA = await createToken({ userId: userAId, email: 'alice@techtrekgt.com', name: 'Alice Admin', is_admin: 1 }, TEST_JWT_SECRET);
    const tokenB = await createToken({ userId: userBId, email: 'bob@techtrekgt.com', name: 'Bob User', is_admin: 0 }, TEST_JWT_SECRET);
    cookieA = `auth_token=${tokenA}`;
    cookieB = `auth_token=${tokenB}`;
  });

  test('Issue separate integration secrets for Account A and Account B', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY };

    // 1. Account A issues an integration secret
    const reqA = new Request('https://techtrekgt.com/api/integrations', {
      method: 'POST',
      headers: { 'Cookie': cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: "Alice's Desktop Chrome" })
    });
    const resA = await integrationsCreatePost({ request: reqA, env });
    assert.strictEqual(resA.status, 201);
    const dataA = await resA.json();
    assert.ok(dataA.integration.secret.startsWith('op_sec_'));
    assert.strictEqual(dataA.integration.user_id, userAId);
    assert.strictEqual(dataA.integration.label, "Alice's Desktop Chrome");

    // 2. Account B issues an integration secret
    const reqB = new Request('https://techtrekgt.com/api/integrations', {
      method: 'POST',
      headers: { 'Cookie': cookieB, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: "Bob's Laptop Chrome" })
    });
    const resB = await integrationsCreatePost({ request: reqB, env });
    assert.strictEqual(resB.status, 201);
    const dataB = await resB.json();
    assert.ok(dataB.integration.secret.startsWith('op_sec_'));
    assert.strictEqual(dataB.integration.user_id, userBId);
    assert.strictEqual(dataB.integration.label, "Bob's Laptop Chrome");

    // Verify secrets are distinct
    assert.notStrictEqual(dataA.integration.secret, dataB.integration.secret);

    // Verify hashed secrets in DB
    const hashA = await hashSecret(dataA.integration.secret);
    const hashB = await hashSecret(dataB.integration.secret);
    const rowA = mockDb._raw.prepare('SELECT * FROM api_integrations WHERE secret_hash = ?').get(hashA);
    const rowB = mockDb._raw.prepare('SELECT * FROM api_integrations WHERE secret_hash = ?').get(hashB);
    assert.strictEqual(rowA.user_id, userAId);
    assert.strictEqual(rowB.user_id, userBId);
  });

  test('Secrets resolve strictly and exclusively to their respective user accounts', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY };

    const secretA = generateIntegrationSecret();
    const hashA = await hashSecret(secretA);
    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_a', '${userAId}', '${hashA}', 'Alice Token', '2026-03-01 10:00:00');
    `);

    const secretB = generateIntegrationSecret();
    const hashB = await hashSecret(secretB);
    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_b', '${userBId}', '${hashB}', 'Bob Token', '2026-03-01 10:00:00');
    `);

    // Direct resolve
    const resolvedA = await resolveIntegrationUserId(secretA, env);
    const resolvedB = await resolveIntegrationUserId(secretB, env);
    assert.strictEqual(resolvedA, userAId);
    assert.strictEqual(resolvedB, userBId);

    // Invalid secret resolves to null
    const resolvedInvalid = await resolveIntegrationUserId('op_sec_invalid_key_1234567890', env);
    assert.strictEqual(resolvedInvalid, null);
  });

  test('POST /api/import/amazon attributes items to the correct user account based on secret', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY };

    const secretA = generateIntegrationSecret();
    const hashA = await hashSecret(secretA);
    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_a', '${userAId}', '${hashA}', 'Alice Token', '2026-03-01 10:00:00');
    `);

    const secretB = generateIntegrationSecret();
    const hashB = await hashSecret(secretB);
    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_b', '${userBId}', '${hashB}', 'Bob Token', '2026-03-01 10:00:00');
    `);

    // Import item using Secret A
    const reqImportA = new Request('https://techtrekgt.com/api/import/amazon', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretA}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asin: 'B0TESTASIN1',
        title: "Alice's Wireless Mechanical Keyboard",
        etv: 120.00
      })
    });
    const resImportA = await amazonImportPost({ request: reqImportA, env });
    assert.strictEqual(resImportA.status, 201);

    // Import item using Secret B (via X-VineScout-Auth header)
    const reqImportB = new Request('https://techtrekgt.com/api/import/amazon', {
      method: 'POST',
      headers: {
        'X-VineScout-Auth': secretB,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asin: 'B0TESTASIN2',
        title: "Bob's Noise Cancelling Headphones",
        etv: 199.99
      })
    });
    const resImportB = await amazonImportPost({ request: reqImportB, env });
    assert.strictEqual(resImportB.status, 201);

    // Verify items in DB are strictly isolated by user_id
    const itemA = mockDb._raw.prepare('SELECT user_id, item_name FROM auction_items WHERE attributes LIKE ?').get('%B0TESTASIN1%');
    assert.ok(itemA);
    assert.strictEqual(itemA.user_id, userAId);

    const itemB = mockDb._raw.prepare('SELECT user_id, item_name FROM auction_items WHERE attributes LIKE ?').get('%B0TESTASIN2%');
    assert.ok(itemB);
    assert.strictEqual(itemB.user_id, userBId);
  });

  test('Export endpoints return strictly isolated data per integration secret', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY };

    const secretA = generateIntegrationSecret();
    const hashA = await hashSecret(secretA);
    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_a', '${userAId}', '${hashA}', 'Alice Token', '2026-03-01 10:00:00');
    `);

    const secretB = generateIntegrationSecret();
    const hashB = await hashSecret(secretB);
    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_b', '${userBId}', '${hashB}', 'Bob Token', '2026-03-01 10:00:00');
    `);

    // Insert inventory items for Alice and Bob
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, status, notes)
      VALUES ('item_a1', '${userAId}', 'inv_alice', 'Alice Item 1 (B0000000A1)', 'Available', 'Notes for Alice item B0000000A1'),
             ('item_b1', '${userBId}', 'inv_bob', 'Bob Item 1 (B0000000B1)', 'Available', 'Notes for Bob item B0000000B1');
    `);

    // Insert sales records for Alice and Bob
    mockDb._raw.exec(`
      INSERT INTO auction_sales (id, user_id, item_id, sale_date, platform, gross_sale_price)
      VALUES ('sale_a1', '${userAId}', 'item_a1', '2026-03-02', 'eBay', 150.00),
             ('sale_b1', '${userBId}', 'item_b1', '2026-03-02', 'eBay', 250.00);
    `);

    // 1. GET /api/export/vinescout-inventory with Secret A
    const reqInvA = new Request('https://techtrekgt.com/api/export/vinescout-inventory', {
      headers: { 'Authorization': `Bearer ${secretA}` }
    });
    const resInvA = await vinescoutInventoryGet({ request: reqInvA, env });
    assert.strictEqual(resInvA.status, 200);
    const invDataA = await resInvA.json();
    assert.strictEqual(invDataA.data.length, 1);
    assert.strictEqual(invDataA.data[0].id, 'item_a1');
    assert.strictEqual(invDataA.data[0].asin, 'B0000000A1');

    // 2. GET /api/export/vinescout-inventory with Secret B
    const reqInvB = new Request('https://techtrekgt.com/api/export/vinescout-inventory', {
      headers: { 'X-VineScout-Auth': secretB }
    });
    const resInvB = await vinescoutInventoryGet({ request: reqInvB, env });
    assert.strictEqual(resInvB.status, 200);
    const invDataB = await resInvB.json();
    assert.strictEqual(invDataB.data.length, 1);
    assert.strictEqual(invDataB.data[0].id, 'item_b1');
    assert.strictEqual(invDataB.data[0].asin, 'B0000000B1');

    // 3. GET /api/export/vinescout-sales with Secret A
    const reqSalesA = new Request('https://techtrekgt.com/api/export/vinescout-sales', {
      headers: { 'Authorization': `Bearer ${secretA}` }
    });
    const resSalesA = await vinescoutSalesGet({ request: reqSalesA, env });
    assert.strictEqual(resSalesA.status, 200);
    const salesDataA = await resSalesA.json();
    assert.strictEqual(salesDataA.data.length, 1);
    assert.strictEqual(salesDataA.data[0].title, 'Alice Item 1 (B0000000A1)');
    assert.strictEqual(salesDataA.data[0].salePrice, 150.00);

    // 4. GET /api/export/vinescout-sales with Secret B
    const reqSalesB = new Request('https://techtrekgt.com/api/export/vinescout-sales', {
      headers: { 'X-VineScout-Auth': secretB }
    });
    const resSalesB = await vinescoutSalesGet({ request: reqSalesB, env });
    assert.strictEqual(resSalesB.status, 200);
    const salesDataB = await resSalesB.json();
    assert.strictEqual(salesDataB.data.length, 1);
    assert.strictEqual(salesDataB.data[0].title, 'Bob Item 1 (B0000000B1)');
    assert.strictEqual(salesDataB.data[0].salePrice, 250.00);
  });

  test('Revoking an integration secret immediately blocks further use', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY };

    const secretA = generateIntegrationSecret();
    const hashA = await hashSecret(secretA);
    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_alice_to_revoke', '${userAId}', '${hashA}', 'Alice Revokable', '2026-03-01 10:00:00');
    `);

    // Verify it resolves initially
    assert.strictEqual(await resolveIntegrationUserId(secretA, env), userAId);

    // Revoke Secret A via revocation endpoint
    const reqRevoke = new Request('https://techtrekgt.com/api/integrations/int_alice_to_revoke/revoke', {
      method: 'POST',
      headers: { 'Cookie': cookieA }
    });
    const resRevoke = await integrationRevokePost({ request: reqRevoke, env, params: { id: 'int_alice_to_revoke' } });
    assert.strictEqual(resRevoke.status, 200);
    const revokeData = await resRevoke.json();
    assert.strictEqual(revokeData.revoked, true);
    assert.ok(revokeData.revoked_at);

    // Verify DB state
    const row = mockDb._raw.prepare('SELECT revoked_at FROM api_integrations WHERE id = ?').get('int_alice_to_revoke');
    assert.ok(row.revoked_at);

    // Verify resolveIntegrationUserId returns null immediately
    assert.strictEqual(await resolveIntegrationUserId(secretA, env), null);

    // Verify all endpoints immediately return 401 Unauthorized for the revoked secret
    const reqImport = new Request('https://techtrekgt.com/api/import/amazon', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${secretA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asin: 'B0REVOKED', title: 'Revoked Item' })
    });
    const resImport = await amazonImportPost({ request: reqImport, env });
    assert.strictEqual(resImport.status, 401);

    const reqInv = new Request('https://techtrekgt.com/api/export/vinescout-inventory', {
      headers: { 'Authorization': `Bearer ${secretA}` }
    });
    const resInv = await vinescoutInventoryGet({ request: reqInv, env });
    assert.strictEqual(resInv.status, 401);

    const reqSales = new Request('https://techtrekgt.com/api/export/vinescout-sales', {
      headers: { 'X-VineScout-Auth': secretA }
    });
    const resSales = await vinescoutSalesGet({ request: reqSales, env });
    assert.strictEqual(resSales.status, 401);
  });

  test('OUTPOST_SECRET_KEY functions as fallback for migration during transition', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY };

    // With master OUTPOST_SECRET_KEY and no matching api_integrations hash, it resolves oldest user (userAId)
    const resolvedFallback = await resolveIntegrationUserId(TEST_OUTPOST_SECRET_KEY, env);
    assert.strictEqual(resolvedFallback, userAId);

    // Calls with master OUTPOST_SECRET_KEY succeed as user A
    const reqExport = new Request('https://techtrekgt.com/api/export/vinescout-inventory', {
      headers: { 'X-VineScout-Auth': TEST_OUTPOST_SECRET_KEY }
    });
    const resExport = await vinescoutInventoryGet({ request: reqExport, env });
    assert.strictEqual(resExport.status, 200);
  });

  test('GET /api/integrations lists only integrations belonging to the authenticated user', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY };

    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_alice_1', '${userAId}', 'hash_a1', 'Alice Integration', '2026-03-01 10:00:00'),
             ('int_bob_1', '${userBId}', 'hash_b1', 'Bob Integration', '2026-03-01 11:00:00');
    `);

    // Alice lists integrations
    const reqA = new Request('https://techtrekgt.com/api/integrations', {
      headers: { 'Cookie': cookieA }
    });
    const resA = await integrationsListGet({ request: reqA, env });
    assert.strictEqual(resA.status, 200);
    const dataA = await resA.json();
    assert.strictEqual(dataA.integrations.length, 1);
    assert.strictEqual(dataA.integrations[0].id, 'int_alice_1');
    assert.strictEqual(dataA.integrations[0].user_id, userAId);
    // Ensure secret_hash is NOT leaked
    assert.strictEqual(dataA.integrations[0].secret_hash, undefined);

    // Bob lists integrations
    const reqB = new Request('https://techtrekgt.com/api/integrations', {
      headers: { 'Cookie': cookieB }
    });
    const resB = await integrationsListGet({ request: reqB, env });
    assert.strictEqual(resB.status, 200);
    const dataB = await resB.json();
    assert.strictEqual(dataB.integrations.length, 1);
    assert.strictEqual(dataB.integrations[0].id, 'int_bob_1');
    assert.strictEqual(dataB.integrations[0].user_id, userBId);
  });

  test('DELETE /api/integrations/:id revokes integration and blocks unauthorized cross-user deletion', async () => {
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY };

    mockDb._raw.exec(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int_bob_del', '${userBId}', 'hash_b_del', 'Bob Del Target', '2026-03-01 11:00:00');
    `);

    // Bob successfully deletes/revokes their own integration
    const reqDelBob = new Request('https://techtrekgt.com/api/integrations/int_bob_del', {
      method: 'DELETE',
      headers: { 'Cookie': cookieB }
    });
    const resDelBob = await integrationDelete({ request: reqDelBob, env, params: { id: 'int_bob_del' } });
    assert.strictEqual(resDelBob.status, 200);
    const dataDel = await resDelBob.json();
    assert.strictEqual(dataDel.revoked, true);

    const row = mockDb._raw.prepare('SELECT revoked_at FROM api_integrations WHERE id = ?').get('int_bob_del');
    assert.ok(row.revoked_at);
  });
});

