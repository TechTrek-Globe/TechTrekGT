import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as vinescoutCatalogPostHandler } from '../functions/api/sync/vinescout-catalog.js';
import { onRequestGet as itemsGetHandler } from '../functions/api/items/index.js';
import { reconcileAndSaveEbaySale } from '../functions/api/ebay/tokenHelper.js';
import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';

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

describe('CRIT-1: POST /api/sync/vinescout-catalog Marks Items Sold & Upserts auction_sales', () => {
  let mockDb;
  let authToken;
  const testUserId = 'usr-crit1-tester';
  const testItemId = 'item-crit1-vscout-1';
  let env;

  beforeEach(async () => {
    mockDb = createMockD1();

    // Insert user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testUserId, 'crit1@techtrek.test', 'dummyhash', 'Crit Tester', 'Active', 1);

    // Insert invoice
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES (?, ?, ?)
    `).run('inv-crit1-test', testUserId, 'INV-CRIT1-001');

    // Insert VScout inventory item currently in 'Listed' status
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, current_list_price,
        unit_price, true_total_cost, status, date_acquired, date_listed,
        attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testItemId,
      testUserId,
      'inv-crit1-test',
      'Sony Noise-Canceling Wireless Headphones',
      199.99,
      50.00,
      55.00,
      'Listed',
      '2026-08-01',
      '2026-08-10',
      JSON.stringify({
        asin: 'B0863TXGM3',
        order_id: '112-9876543-1234567',
        etv: 199.99
      })
    );

    // Seed eBay token for concurrent reconciliation test
    const encAccess = await encryptToken('mock_ebay_token_crit1', TEST_JWT_SECRET);
    mockDb._raw.prepare(`
      INSERT INTO ebay_oauth_tokens (
        id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, connected_at
      ) VALUES (?, ?, ?, ?, datetime('now', '+1 hour'), datetime('now', '+30 days'), 'sell.inventory sell.fulfillment', datetime('now'))
    `).run('tok-crit1', testUserId, encAccess, encAccess);

    authToken = await createToken({ userId: testUserId, email: 'crit1@techtrek.test' }, TEST_JWT_SECRET);
    env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, EBAY_SANDBOX: 'false' };
  });

  test('VineScout mark as sold transitions status to Sold, populates sold fields, creates auction_sales row, and removes item from Listed filter', async () => {
    // Step 1: Confirm item appears under status=Listed in GET /api/items
    const listReqBefore = new Request('http://localhost/api/items?status=Listed', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${authToken}` }
    });
    const listResBefore = await itemsGetHandler({ request: listReqBefore, env });
    assert.strictEqual(listResBefore.status, 200);
    const listDataBefore = await listResBefore.json();
    assert.strictEqual(listDataBefore.items.length, 1);
    assert.strictEqual(listDataBefore.items[0].id, testItemId);
    assert.strictEqual(listDataBefore.items[0].status, 'Listed');

    // Step 2: Trigger POST /api/sync/vinescout-catalog
    const syncReq = new Request('http://localhost/api/sync/vinescout-catalog', {
      method: 'POST',
      headers: {
        'Cookie': `auth_token=${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: testItemId,
        sale_price: 185.00,
        sale_date: '2026-08-25',
        ebay_order_id: 'EBAY-ORD-CRIT1-888'
      })
    });
    const syncRes = await vinescoutCatalogPostHandler({ request: syncReq, env });
    assert.strictEqual(syncRes.status, 200);
    const syncData = await syncRes.json();
    assert.strictEqual(syncData.success, true);
    assert.strictEqual(syncData.item_id, testItemId);

    // Verification (a): Item status is now 'Sold'
    const updatedItem = mockDb._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get(testItemId);
    assert.strictEqual(updatedItem.status, 'Sold', "Expected item status to be 'Sold'");

    // Verification (b): date_sold and actual_sell_price are populated on the item row
    assert.strictEqual(updatedItem.date_sold, '2026-08-25', 'Expected date_sold to be 2026-08-25');
    assert.strictEqual(updatedItem.actual_sell_price, 185.00, 'Expected actual_sell_price to be 185.00');
    assert.strictEqual(updatedItem.days_on_market, 15, 'Expected days_on_market to be 15 (2026-08-10 to 2026-08-25)');

    // Verify attributes JSON has write-back fields
    const parsedAttrs = JSON.parse(updatedItem.attributes);
    assert.strictEqual(parsedAttrs.outpost_liquidated, 1);
    assert.strictEqual(parsedAttrs.sale_price, 185.00);
    assert.strictEqual(parsedAttrs.sold_at, '2026-08-25');
    assert.strictEqual(parsedAttrs.ebay_order_id, 'EBAY-ORD-CRIT1-888');

    // Verification (c): Corresponding row now exists in auction_sales for that item
    const salesRows = mockDb._raw.prepare('SELECT * FROM auction_sales WHERE item_id = ?').all(testItemId);
    assert.strictEqual(salesRows.length, 1, 'Expected exactly 1 auction_sales row');
    const sale = salesRows[0];
    assert.strictEqual(sale.item_id, testItemId);
    assert.strictEqual(sale.user_id, testUserId);
    assert.strictEqual(sale.gross_sale_price, 185.00);
    assert.strictEqual(sale.sale_date, '2026-08-25');
    assert.strictEqual(sale.ebay_order_id, 'EBAY-ORD-CRIT1-888');
    assert.strictEqual(sale.days_to_sell, 15);
    assert.ok(sale.net_proceeds > 0, 'Expected positive net_proceeds');
    assert.ok(sale.net_profit > 0, 'Expected positive net_profit');

    // Verification (d): Item no longer appears under active/listed filter in GET /api/items
    const listReqAfter = new Request('http://localhost/api/items?status=Listed', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${authToken}` }
    });
    const listResAfter = await itemsGetHandler({ request: listReqAfter, env });
    assert.strictEqual(listResAfter.status, 200);
    const listDataAfter = await listResAfter.json();
    assert.strictEqual(listDataAfter.items.length, 0, 'Expected 0 items under status=Listed filter');

    // Confirm it DOES appear under status=Sold filter
    const soldReq = new Request('http://localhost/api/items?status=Sold', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${authToken}` }
    });
    const soldRes = await itemsGetHandler({ request: soldReq, env });
    assert.strictEqual(soldRes.status, 200);
    const soldData = await soldRes.json();
    assert.strictEqual(soldData.items.length, 1);
    assert.strictEqual(soldData.items[0].id, testItemId);
  });

  test('Concurrent VineScout catalog POST and reconcileAndSaveEbaySale creates exactly ONE auction_sales row', async () => {
    const itemRow = mockDb._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get(testItemId);

    const syncReq = new Request('http://localhost/api/sync/vinescout-catalog', {
      method: 'POST',
      headers: {
        'Cookie': `auth_token=${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: testItemId,
        sale_price: 180.00,
        sale_date: '2026-08-26',
        ebay_order_id: 'EBAY-CONCURRENT-ORD-1'
      })
    });

    const orderData = {
      orderId: 'EBAY-CONCURRENT-ORD-1',
      saleDate: '2026-08-26',
      buyerHandle: 'concurrent_buyer',
      lineItemCost: 180.00,
      deliveryCost: 0
    };

    // Execute both concurrently
    const [syncRes, reconResult] = await Promise.all([
      vinescoutCatalogPostHandler({ request: syncReq, env }),
      reconcileAndSaveEbaySale(env, testUserId, itemRow, orderData, null)
    ]);

    assert.strictEqual(syncRes.status, 200);
    assert.ok(reconResult?.sale?.id);

    // Verify exactly 1 auction_sales row exists
    const salesCount = mockDb._raw.prepare('SELECT COUNT(*) as count FROM auction_sales WHERE item_id = ?').get(testItemId);
    assert.strictEqual(salesCount.count, 1, 'Expected exactly 1 auction_sales row after concurrent execution');

    const finalItem = mockDb._raw.prepare('SELECT status, actual_sell_price FROM auction_items WHERE id = ?').get(testItemId);
    assert.strictEqual(finalItem.status, 'Sold');
    assert.strictEqual(finalItem.actual_sell_price, 180.00);
  });

  test('POST /api/sync/vinescout-catalog rejects negative sale_price with HTTP 400', async () => {
    const invalidReq = new Request('http://localhost/api/sync/vinescout-catalog', {
      method: 'POST',
      headers: {
        'Cookie': `auth_token=${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: testItemId,
        sale_price: -25.00
      })
    });
    const res = await vinescoutCatalogPostHandler({ request: invalidReq, env });
    assert.strictEqual(res.status, 400);
  });

  test('[MED-3] POST /api/sync/vinescout-catalog rejects sale_price: -50 with HTTP 400', async () => {
    const invalidReq = new Request('http://localhost/api/sync/vinescout-catalog', {
      method: 'POST',
      headers: {
        'Cookie': `auth_token=${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: testItemId,
        sale_price: -50
      })
    });
    const res = await vinescoutCatalogPostHandler({ request: invalidReq, env });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error && body.error.includes('non-negative'), 'Error message must specify non-negative requirement');
  });

  test('POST /api/sync/vinescout-catalog rejects non-VScout item without ASIN or order_id', async () => {
    // Insert non-VScout item
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('item-non-vscout', testUserId, 'inv-crit1-test', 'Regular Item', 10.00, 'Listed');

    const nonVscoutReq = new Request('http://localhost/api/sync/vinescout-catalog', {
      method: 'POST',
      headers: {
        'Cookie': `auth_token=${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: 'item-non-vscout',
        sale_price: 20.00
      })
    });
    const res = await vinescoutCatalogPostHandler({ request: nonVscoutReq, env });
    assert.strictEqual(res.status, 400);
  });
});
