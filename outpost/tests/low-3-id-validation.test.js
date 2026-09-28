import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isValidPrefixedId } from '../functions/utils/guard.js';
import { onRequestGet as invoiceGet, onRequestPut as invoicePut, onRequestDelete as invoiceDelete } from '../functions/api/invoices/[id].js';
import { onRequestGet as itemGet, onRequestPut as itemPut, onRequestDelete as itemDelete } from '../functions/api/items/[id].js';
import { onRequestGet as saleGet, onRequestPut as salePut, onRequestDelete as saleDelete } from '../functions/api/sales/[id].js';
import { onRequestGet as compGet, onRequestPut as compPut, onRequestDelete as compDelete } from '../functions/api/comps/[id].js';
import { onRequestPut as platformPut, onRequestDelete as platformDelete } from '../functions/api/platforms/[id].js';
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

describe('LOW-3: ID Format Validation & Malformed Path Segment Guarding', () => {
  describe('isValidPrefixedId unit tests', () => {
    test('validates standard resource prefixes', () => {
      assert.strictEqual(isValidPrefixedId('inv-12345', 'inv'), true);
      assert.strictEqual(isValidPrefixedId('inv-4f899e31-8f2e-4e4b-952f-c57be6a17b01', 'inv-'), true);
      assert.strictEqual(isValidPrefixedId('item-med6-test-1', 'item'), true);
      assert.strictEqual(isValidPrefixedId('sale-med9-1', 'sale'), true);
      assert.strictEqual(isValidPrefixedId('comp-1', 'comp'), true);
      assert.strictEqual(isValidPrefixedId('plat-med7-test-1', 'plat'), true);
    });

    test('validates multiple prefixes when array provided', () => {
      assert.strictEqual(isValidPrefixedId('inv-123', ['inv', 'AMAZON']), true);
      assert.strictEqual(isValidPrefixedId('AMAZON-B09TEST999-2026-09-27', ['inv', 'AMAZON']), true);
      assert.strictEqual(isValidPrefixedId('EBAY-12345', ['inv', 'AMAZON']), false);
    });

    test('validates pure UUIDs only when allowPureUuid is enabled', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      assert.strictEqual(isValidPrefixedId(uuid, 'plat', { allowPureUuid: true }), true);
      assert.strictEqual(isValidPrefixedId(uuid, 'plat', { allowPureUuid: false }), false);
      assert.strictEqual(isValidPrefixedId(uuid, 'plat'), false);
    });

    test('rejects malformed, empty, non-string, or non-prefixed values', () => {
      assert.strictEqual(isValidPrefixedId('12345', 'item'), false);
      assert.strictEqual(isValidPrefixedId('malformed-slug', 'item'), false);
      assert.strictEqual(isValidPrefixedId('non-uuid-string', 'inv'), false);
      assert.strictEqual(isValidPrefixedId('item-', 'item'), false);
      assert.strictEqual(isValidPrefixedId('', 'item'), false);
      assert.strictEqual(isValidPrefixedId('   ', 'item'), false);
      assert.strictEqual(isValidPrefixedId(null, 'item'), false);
      assert.strictEqual(isValidPrefixedId(undefined, 'item'), false);
      assert.strictEqual(isValidPrefixedId(12345, 'item'), false);
      assert.strictEqual(isValidPrefixedId({}, 'item'), false);
    });

    test('rejects cross-resource prefix mismatch', () => {
      assert.strictEqual(isValidPrefixedId('inv-12345', 'item'), false);
      assert.strictEqual(isValidPrefixedId('item-12345', 'sale'), false);
      assert.strictEqual(isValidPrefixedId('sale-12345', 'inv'), false);
    });
  });

  describe('Endpoint integration: Malformed IDs return 400 instead of 404', () => {
    let mockDb;
    let authToken;
    const testUserId = 'usr-low3-tester';
    const validInvoiceId = 'inv-low3-test-1';
    const validItemId = 'item-low3-test-1';
    const validSaleId = 'sale-low3-test-1';
    const validCompId = 'comp-low3-test-1';
    const validPlatformId = 'plat-low3-test-1';

    beforeEach(async () => {
      mockDb = createMockD1();

      mockDb._raw.prepare(`
        INSERT INTO users (id, email, password_hash, name, status, email_verified)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(testUserId, 'low3@techtrek.test', 'dummyhash', 'Tester', 'Active', 1);

      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total, discount, shipping, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(validInvoiceId, testUserId, 'INV-LOW3-001', 50.00, 0, 0, 0);

      mockDb._raw.prepare(`
        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, category, status, unit_price, true_total_cost, attributes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(validItemId, testUserId, validInvoiceId, 'Sample Item', 'Cards', 'Available', 25.00, 25.00, '{}');

      mockDb._raw.prepare(`
        INSERT INTO auction_sales (
          id, user_id, item_id, sale_date, platform, gross_sale_price
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(validSaleId, testUserId, validItemId, '2026-09-28', 'eBay', 50.00);

      mockDb._raw.prepare(`
        INSERT INTO auction_comps (
          id, item_id, user_id, comp_1, comp_2, comp_3
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(validCompId, validItemId, testUserId, 40.0, 45.0, 50.0);

      mockDb._raw.prepare(`
        INSERT INTO auction_platforms (
          id, user_id, name, fee_pct, flat_fee, is_default
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(validPlatformId, testUserId, 'Test Platform', 0.12, 0.30, 0);

      authToken = await createToken({ userId: testUserId, email: 'low3@techtrek.test', name: 'Tester' }, TEST_JWT_SECRET);
    });

    const createReq = (url, method = 'GET', body = null) => {
      const headers = {
        'Cookie': `auth_token=${authToken}`,
        'Content-Type': 'application/json'
      };
      const init = { method, headers };
      if (body) init.body = JSON.stringify(body);
      return new Request(url, init);
    };

    // --- Invoices ---
    test('Invoices: Malformed trailing path segment returns HTTP 400', async () => {
      const getRes = await invoiceGet({
        request: createReq('https://techtrekgt.com/outpost/api/invoices/12345'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(getRes.status, 400);
      const getJson = await getRes.json();
      assert.strictEqual(getJson.error, 'Invoice ID required');

      const putRes = await invoicePut({
        request: createReq('https://techtrekgt.com/outpost/api/invoices/non-uuid-string', 'PUT', { description: 'Updated' }),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(putRes.status, 400);
      const putJson = await putRes.json();
      assert.strictEqual(putJson.error, 'Invoice ID required');

      const delRes = await invoiceDelete({
        request: createReq('https://techtrekgt.com/outpost/api/invoices/invalid-id-slug', 'DELETE'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(delRes.status, 400);
    });

    test('Invoices: Non-existent well-formed ID returns HTTP 404 (not 400)', async () => {
      const res = await invoiceGet({
        request: createReq('https://techtrekgt.com/outpost/api/invoices/inv-nonexistent-999'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error, 'Invoice not found');
    });

    test('Invoices: Existing valid ID returns HTTP 200', async () => {
      const res = await invoiceGet({
        request: createReq(`https://techtrekgt.com/outpost/api/invoices/${validInvoiceId}`),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.invoice.id, validInvoiceId);
    });

    // --- Items ---
    test('Items: Malformed trailing path segment returns HTTP 400', async () => {
      const getRes = await itemGet({
        request: createReq('https://techtrekgt.com/outpost/api/items/12345'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(getRes.status, 400);
      const getJson = await getRes.json();
      assert.strictEqual(getJson.error, 'Item ID required');

      const putRes = await itemPut({
        request: createReq('https://techtrekgt.com/outpost/api/items/non-uuid-string', 'PUT', { item_name: 'Renamed' }),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(putRes.status, 400);
      const putJson = await putRes.json();
      assert.strictEqual(putJson.error, 'Item ID required');

      const delRes = await itemDelete({
        request: createReq('https://techtrekgt.com/outpost/api/items/not-an-item', 'DELETE'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(delRes.status, 400);
    });

    test('Items: Non-existent well-formed ID returns HTTP 404', async () => {
      const res = await itemGet({
        request: createReq('https://techtrekgt.com/outpost/api/items/item-nonexistent-999'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error, 'Item not found');
    });

    // --- Sales ---
    test('Sales: Malformed trailing path segment returns HTTP 400', async () => {
      const getRes = await saleGet({
        request: createReq('https://techtrekgt.com/outpost/api/sales/12345'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(getRes.status, 400);
      const getJson = await getRes.json();
      assert.strictEqual(getJson.error, 'Sale ID required');

      const putRes = await salePut({
        request: createReq('https://techtrekgt.com/outpost/api/sales/non-uuid-string', 'PUT', { platform: 'Mercari' }),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(putRes.status, 400);
      const putJson = await putRes.json();
      assert.strictEqual(putJson.error, 'Sale ID required');

      const delRes = await saleDelete({
        request: createReq('https://techtrekgt.com/outpost/api/sales/bad-sale-slug', 'DELETE'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(delRes.status, 400);
    });

    test('Sales: Non-existent well-formed ID returns HTTP 404', async () => {
      const res = await saleGet({
        request: createReq('https://techtrekgt.com/outpost/api/sales/sale-nonexistent-999'),
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error, 'Sale not found');
    });

    // --- Comps ---
    test('Comps: Malformed trailing path segment returns HTTP 400', async () => {
      const getRes = await compGet({
        request: createReq('https://techtrekgt.com/outpost/api/comps/12345'),
        params: { id: '12345' },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(getRes.status, 400);
      const getJson = await getRes.json();
      assert.strictEqual(getJson.error, 'Comp ID required');

      const putRes = await compPut({
        request: createReq('https://techtrekgt.com/outpost/api/comps/non-uuid-string', 'PUT', { comp_1: 15.0 }),
        params: { id: 'non-uuid-string' },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(putRes.status, 400);
      const putJson = await putRes.json();
      assert.strictEqual(putJson.error, 'Comp ID required');

      const delRes = await compDelete({
        request: createReq('https://techtrekgt.com/outpost/api/comps/malformed-comp', 'DELETE'),
        params: { id: 'malformed-comp' },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(delRes.status, 400);
    });

    test('Comps: Non-existent well-formed ID returns HTTP 404', async () => {
      const res = await compGet({
        request: createReq('https://techtrekgt.com/outpost/api/comps/comp-nonexistent-999'),
        params: { id: 'comp-nonexistent-999' },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error, 'Comp not found');
    });

    test('Comps: Standard UUID is accepted when allowPureUuid is enabled', async () => {
      const validItemId2 = 'item-low3-test-2';
      mockDb._raw.prepare(`
        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, category, status, unit_price, true_total_cost, attributes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(validItemId2, testUserId, validInvoiceId, 'Sample Item 2', 'Cards', 'Available', 30.00, 30.00, '{}');

      const pureUuid = 'a0000000-0000-4000-8000-000000000001';
      mockDb._raw.prepare(`
        INSERT INTO auction_comps (id, item_id, user_id, comp_1)
        VALUES (?, ?, ?, ?)
      `).run(pureUuid, validItemId2, testUserId, 30.0);

      const res = await compGet({
        request: createReq(`https://techtrekgt.com/outpost/api/comps/${pureUuid}`),
        params: { id: pureUuid },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(res.status, 200);
    });

    // --- Platforms ---
    test('Platforms: Malformed trailing path segment returns HTTP 400', async () => {
      const putRes = await platformPut({
        request: createReq('https://techtrekgt.com/outpost/api/platforms/12345', 'PUT', { fee_pct: 0.15 }),
        params: { id: '12345' },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(putRes.status, 400);
      const putJson = await putRes.json();
      assert.strictEqual(putJson.error, 'Platform ID required');

      const delRes = await platformDelete({
        request: createReq('https://techtrekgt.com/outpost/api/platforms/non-uuid-string', 'DELETE'),
        params: { id: 'non-uuid-string' },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(delRes.status, 400);
    });

    test('Platforms: Non-existent well-formed ID returns HTTP 404', async () => {
      const res = await platformPut({
        request: createReq('https://techtrekgt.com/outpost/api/platforms/plat-nonexistent-999', 'PUT', { name: 'Nonexistent' }),
        params: { id: 'plat-nonexistent-999' },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error, 'Platform not found');
    });

    test('Platforms: Standard UUID is accepted when allowPureUuid is enabled', async () => {
      const pureUuid = 'b0000000-0000-4000-8000-000000000002';
      mockDb._raw.prepare(`
        INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, is_default)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(pureUuid, testUserId, 'Pure UUID Platform', 0.1, 0.5, 0);

      const res = await platformPut({
        request: createReq(`https://techtrekgt.com/outpost/api/platforms/${pureUuid}`, 'PUT', { name: 'Updated Pure UUID Platform' }),
        params: { id: pureUuid },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });
      assert.strictEqual(res.status, 200);
    });
  });
});
