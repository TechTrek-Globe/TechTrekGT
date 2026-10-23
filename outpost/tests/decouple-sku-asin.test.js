import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as amazonImportPost } from '../functions/api/import/amazon.js';
import { onRequestGet as vinescoutSalesExportGet } from '../functions/api/export/vinescout-sales.js';
import { onRequestGet as vinescoutInventoryExportGet } from '../functions/api/export/vinescout-inventory.js';
import { onRequestPost as salesPost } from '../functions/api/sales/index.js';
import { createToken } from '../functions/utils/auth.js';
import { hashSecret } from '../functions/utils/apiIntegrations.js';

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

describe('Decouple SKU Generation from Amazon ASIN', () => {
  let mockDb;
  let authToken;
  const testUserId = 'usr-decouple-tester';
  const testEmail = 'decouple@test.com';
  const apiSecret = 'op_sec_test_decouple_token_xyz';
  let env;

  beforeEach(async () => {
    mockDb = createMockD1();

    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, 'hash', 'Decouple User', 'active', 1)
    `).run(testUserId, testEmail);

    const secretHash = await hashSecret(apiSecret);
    mockDb._raw.prepare(`
      INSERT INTO api_integrations (id, user_id, label, secret_hash, created_at)
      VALUES ('int-decouple-1', ?, 'VineScout Chrome Extension', ?, datetime('now'))
    `).run(testUserId, secretHash);

    mockDb._raw.prepare(`
      INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, is_default)
      VALUES ('plat-dec-1', ?, 'eBay', 0.1325, 0.40, 1)
    `).run(testUserId);

    authToken = await createToken({ userId: testUserId, email: testEmail }, TEST_JWT_SECRET);

    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };
  });

  test('1. Multiple orders sharing the same ASIN receive distinct Outpost SKUs and distinct inventory items', async () => {
    const sharedAsin = 'B0SHARED999';

    // First import for order 1
    const req1 = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VineScout-Auth': apiSecret
      },
      body: JSON.stringify({
        asin: sharedAsin,
        title: 'Noise Cancelling Earbuds - Unit 1',
        order_id: '111-1000001-1000001',
        vine_value: 39.99,
        tax_value: 2.80,
        images: ['https://example.com/img1.jpg']
      })
    });

    const res1 = await amazonImportPost({ request: req1, env });
    assert.strictEqual(res1.status, 201);
    const body1 = await res1.json();
    assert.strictEqual(body1.success, true);
    assert.ok(body1.item_id);
    assert.ok(body1.sku.startsWith('OP-'));

    // Second import for order 2 (same ASIN, distinct order_id)
    const req2 = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VineScout-Auth': apiSecret
      },
      body: JSON.stringify({
        asin: sharedAsin,
        title: 'Noise Cancelling Earbuds - Unit 2',
        order_id: '111-2000002-2000002',
        vine_value: 39.99,
        tax_value: 2.80,
        images: ['https://example.com/img2.jpg']
      })
    });

    const res2 = await amazonImportPost({ request: req2, env });
    assert.strictEqual(res2.status, 201);
    const body2 = await res2.json();
    assert.strictEqual(body2.success, true);
    assert.ok(body2.item_id);
    assert.ok(body2.sku.startsWith('OP-'));

    // Verify both items exist distinctly in DB with distinct SKUs
    assert.notStrictEqual(body1.item_id, body2.item_id, 'Item IDs must be distinct');
    assert.notStrictEqual(body1.sku, body2.sku, 'SKUs must be distinct and not reused across orders');

    const dbItems = mockDb._raw.prepare(
      'SELECT id, sku, item_name, attributes FROM auction_items WHERE user_id = ?'
    ).all(testUserId);
    assert.strictEqual(dbItems.length, 2, 'Must have 2 separate inventory items');
  });

  test('2. Re-importing an item with the same order_id updates mutable fields idempotently and preserves SKU', async () => {
    const asin = 'B0RESYNC123';
    const orderId = '111-3000003-3000003';

    // Initial import
    const reqInit = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VineScout-Auth': apiSecret
      },
      body: JSON.stringify({
        asin,
        title: 'Initial Title',
        order_id: orderId,
        vine_value: 50.00,
        tax_value: 3.50,
        specs: { color: 'Black' }
      })
    });

    const resInit = await amazonImportPost({ request: reqInit, env });
    assert.strictEqual(resInit.status, 201);
    const bodyInit = await resInit.json();
    const initialSku = bodyInit.sku;
    const initialItemId = bodyInit.item_id;

    // Re-sync with updated title, etv, taxCost, images, and specs
    const reqUpdate = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VineScout-Auth': apiSecret
      },
      body: JSON.stringify({
        asin,
        title: 'Updated Premium Title',
        order_id: orderId,
        vine_value: 60.00,
        tax_cost: 4.20,
        images: ['https://example.com/updated.jpg'],
        specs: { color: 'Silver', weight: '200g' }
      })
    });

    const resUpdate = await amazonImportPost({ request: reqUpdate, env });
    assert.strictEqual(resUpdate.status, 200);
    const bodyUpdate = await resUpdate.json();
    assert.strictEqual(bodyUpdate.success, true);
    assert.strictEqual(bodyUpdate.is_existing, true);
    assert.strictEqual(bodyUpdate.item_id, initialItemId, 'Item ID must match existing item');
    assert.strictEqual(bodyUpdate.sku, initialSku, 'Existing SKU must be returned unchanged');

    // Confirm mutable fields updated in DB
    const itemInDb = mockDb._raw.prepare('SELECT item_name, unit_price, attributes FROM auction_items WHERE id = ?').get(initialItemId);
    assert.strictEqual(itemInDb.item_name, 'Updated Premium Title');
    assert.strictEqual(itemInDb.unit_price, 4.20);
    const attrs = JSON.parse(itemInDb.attributes);
    assert.strictEqual(attrs.etv, 60.00);
    assert.strictEqual(attrs.tax_cost, 4.20);
    assert.deepStrictEqual(attrs.image_urls, ['https://example.com/updated.jpg']);
    assert.strictEqual(attrs.specs.color, 'Silver');
    assert.strictEqual(attrs.specs.weight, '200g');
    assert.strictEqual(attrs.order_id, orderId);
  });

  test('3. Importing items with same ASIN and absent order_id assigns each a distinct unique SKU', async () => {
    const sharedAsin = 'B0NOORDER88';

    const req1 = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VineScout-Auth': apiSecret
      },
      body: JSON.stringify({
        asin: sharedAsin,
        title: 'Physical Unit 1'
      })
    });

    const res1 = await amazonImportPost({ request: req1, env });
    assert.strictEqual(res1.status, 201);
    const body1 = await res1.json();

    const req2 = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VineScout-Auth': apiSecret
      },
      body: JSON.stringify({
        asin: sharedAsin,
        title: 'Physical Unit 2'
      })
    });

    const res2 = await amazonImportPost({ request: req2, env });
    assert.strictEqual(res2.status, 201);
    const body2 = await res2.json();

    assert.notStrictEqual(body1.item_id, body2.item_id);
    assert.notStrictEqual(body1.sku, body2.sku);
  });

  test('4. Selling one unit of a shared ASIN marks ONLY that item sold without collapsing other units', async () => {
    const sharedAsin = 'B0COLLAPSE99';

    // Ingest two units with same ASIN
    const resA = await amazonImportPost({
      request: new Request('https://techtrekgt.com/outpost/api/import/amazon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VineScout-Auth': apiSecret },
        body: JSON.stringify({ asin: sharedAsin, title: 'Unit A', order_id: 'ord-A-1' })
      }),
      env
    });
    const { item_id: itemIdA, sku: skuA } = await resA.json();

    const resB = await amazonImportPost({
      request: new Request('https://techtrekgt.com/outpost/api/import/amazon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VineScout-Auth': apiSecret },
        body: JSON.stringify({ asin: sharedAsin, title: 'Unit B', order_id: 'ord-B-2' })
      }),
      env
    });
    const { item_id: itemIdB, sku: skuB } = await resB.json();

    // Sell unit A via POST /api/sales
    const saleReq = new Request('https://techtrekgt.com/outpost/api/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        item_id: itemIdA,
        sale_date: '2026-10-23',
        platform: 'eBay',
        gross_sale_price: 45.00,
        actual_shipping_cost: 5.00,
        platform_fee_pct: 0.1325,
        platform_flat_fee: 0.40
      })
    });

    const saleRes = await salesPost({ request: saleReq, env });
    assert.strictEqual(saleRes.status, 201);

    // Verify Unit A is Sold and Unit B remains Available
    const itemA = mockDb._raw.prepare('SELECT status, sku FROM auction_items WHERE id = ?').get(itemIdA);
    const itemB = mockDb._raw.prepare('SELECT status, sku FROM auction_items WHERE id = ?').get(itemIdB);

    assert.strictEqual(itemA.status, 'Sold');
    assert.strictEqual(itemA.sku, skuA);
    assert.strictEqual(itemB.status, 'Available');
    assert.strictEqual(itemB.sku, skuB);
  });

  test('5. Export endpoints export orderId alongside sku and asin', async () => {
    // Ingest item with order_id
    const asin = 'B0EXPORTO77';
    const orderId = '111-7777777-7777777';

    const impRes = await amazonImportPost({
      request: new Request('https://techtrekgt.com/outpost/api/import/amazon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VineScout-Auth': apiSecret },
        body: JSON.stringify({
          asin,
          title: 'Export Test Product',
          order_id: orderId,
          vine_value: 25.00,
          tax_value: 1.75
        })
      }),
      env
    });
    const { item_id: itemId, sku } = await impRes.json();

    // Check GET /api/export/vinescout-inventory
    const invReq = new Request('https://techtrekgt.com/outpost/api/export/vinescout-inventory', {
      headers: { 'X-VineScout-Auth': apiSecret }
    });
    const invRes = await vinescoutInventoryExportGet({ request: invReq, env });
    assert.strictEqual(invRes.status, 200);
    const invBody = await invRes.json();
    assert.strictEqual(invBody.success, true);

    const invItem = invBody.data.find(d => d.id === itemId);
    assert.ok(invItem, 'Item must be in inventory export');
    assert.strictEqual(invItem.sku, sku);
    assert.strictEqual(invItem.asin, asin);
    assert.strictEqual(invItem.orderId, orderId);

    // Sell the item and check GET /api/export/vinescout-sales
    await salesPost({
      request: new Request('https://techtrekgt.com/outpost/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          item_id: itemId,
          sale_date: '2026-10-23',
          platform: 'eBay',
          gross_sale_price: 35.00,
          actual_shipping_cost: 4.50,
          platform_fee_pct: 0.1325,
          platform_flat_fee: 0.40
        })
      }),
      env
    });

    const salesReq = new Request('https://techtrekgt.com/outpost/api/export/vinescout-sales', {
      headers: { 'X-VineScout-Auth': apiSecret }
    });
    const salesRes = await vinescoutSalesExportGet({ request: salesReq, env });
    assert.strictEqual(salesRes.status, 200);
    const salesBody = await salesRes.json();
    assert.strictEqual(salesBody.success, true);

    const saleItem = salesBody.data.find(d => d.sku === sku);
    assert.ok(saleItem, 'Sold item must be in sales export');
    assert.strictEqual(saleItem.sku, sku);
    assert.strictEqual(saleItem.asin, asin);
    assert.strictEqual(saleItem.orderId, orderId);
    assert.strictEqual(saleItem.title, 'Export Test Product');
    assert.strictEqual(saleItem.salePrice, 35.00);
    assert.strictEqual(saleItem.platform, 'eBay');
    assert.ok(saleItem.netProceeds !== null);
    assert.ok(saleItem.netProfit !== null);
  });
});
