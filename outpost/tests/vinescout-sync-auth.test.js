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
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  try { db.exec("ALTER TABLE users ADD COLUMN amazon_api_token TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN amazon_api_token_hash TEXT;"); } catch (_) {}
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

describe('VineScout Sync Authentication and Token Resolution', () => {
  let mockDb;
  let env;
  const user1 = { id: 'usr-vinescout-1', email: 'vinescout@techtrekgt.com', name: 'Vine Scout' };
  let integrationKey;
  let jwtToken;
  const legacyPlaintextToken = 'legacy-amazon-token-abc123xyz';

  beforeEach(async () => {
    mockDb = createMockD1();
    env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    // Insert user with plaintext legacy token and hashed token
    const tokenHash = await hashSecret(legacyPlaintextToken);
    mockDb._raw.prepare(
      "INSERT INTO users (id, name, email, password_hash, amazon_api_token, amazon_api_token_hash) VALUES (?, ?, ?, 'hash', ?, ?)"
    ).run(user1.id, user1.name, user1.email, legacyPlaintextToken, tokenHash);

    // Issue integration key
    integrationKey = generateIntegrationSecret();
    const integrationHash = await hashSecret(integrationKey);
    mockDb._raw.prepare(
      "INSERT INTO api_integrations (id, user_id, secret_hash, label) VALUES ('int-1', ?, ?, 'VineScout')"
    ).run(user1.id, integrationHash);

    // Create valid JWT
    jwtToken = await createToken({ userId: user1.id, email: user1.email }, TEST_JWT_SECRET);
  });

  test('resolveIntegrationUserId authenticates via valid api_integrations key', async () => {
    const resolved = await resolveIntegrationUserId(integrationKey, env);
    assert.strictEqual(resolved, user1.id);
  });

  test('resolveIntegrationUserId authenticates via valid JWT token', async () => {
    const resolved = await resolveIntegrationUserId(jwtToken, env);
    assert.strictEqual(resolved, user1.id);
  });

  test('resolveIntegrationUserId authenticates via legacy plaintext amazon_api_token', async () => {
    const resolved = await resolveIntegrationUserId(legacyPlaintextToken, env);
    assert.strictEqual(resolved, user1.id);
  });

  test('resolveIntegrationUserId rejects unknown/random token with null', async () => {
    const resolved = await resolveIntegrationUserId('invalid-random-secret-key-12345', env);
    assert.strictEqual(resolved, null);
  });

  test('GET /api/export/vinescout-sales accepts X-VineScout-Auth header with integration key', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/export/vinescout-sales', {
      headers: { 'X-VineScout-Auth': integrationKey }
    });
    const res = await vinescoutSalesGet({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  test('GET /api/export/vinescout-sales accepts cookie auth when header is absent', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/export/vinescout-sales', {
      headers: { 'Cookie': `auth_token=${jwtToken}` }
    });
    const res = await vinescoutSalesGet({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
  });

  test('GET /api/export/vinescout-inventory accepts X-VineScout-Auth and cookie fallback', async () => {
    const reqHeader = new Request('https://techtrekgt.com/outpost/api/export/vinescout-inventory', {
      headers: { 'X-VineScout-Auth': integrationKey }
    });
    const resHeader = await vinescoutInventoryGet({ request: reqHeader, env });
    assert.strictEqual(resHeader.status, 200);

    const reqCookie = new Request('https://techtrekgt.com/outpost/api/export/vinescout-inventory', {
      headers: { 'Cookie': `auth_token=${jwtToken}` }
    });
    const resCookie = await vinescoutInventoryGet({ request: reqCookie, env });
    assert.strictEqual(resCookie.status, 200);
  });

  test('POST /api/import/amazon accepts X-VineScout-Auth and cookie fallback', async () => {
    const payload = {
      asin: 'B0TESTASIN1',
      title: 'Test Vine Product',
      category: 'Electronics'
    };

    const reqHeader = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VineScout-Auth': integrationKey
      },
      body: JSON.stringify(payload)
    });
    const resHeader = await amazonImportPost({ request: reqHeader, env });
    assert.strictEqual(resHeader.status, 201);

    const reqCookie = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${jwtToken}`
      },
      body: JSON.stringify({ ...payload, asin: 'B0TESTASIN2' })
    });
    const resCookie = await amazonImportPost({ request: reqCookie, env });
    assert.strictEqual(resCookie.status, 201);
  });

  test('Endpoints reject unauthenticated request with 401', async () => {
    const reqSales = new Request('https://techtrekgt.com/outpost/api/export/vinescout-sales');
    const resSales = await vinescoutSalesGet({ request: reqSales, env });
    assert.strictEqual(resSales.status, 401);

    const reqInv = new Request('https://techtrekgt.com/outpost/api/export/vinescout-inventory', {
      headers: { 'X-VineScout-Auth': 'bad-token' }
    });
    const resInv = await vinescoutInventoryGet({ request: reqInv, env });
    assert.strictEqual(resInv.status, 401);
  });
});
