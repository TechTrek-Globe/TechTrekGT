import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reconcileAndSaveEbaySale } from '../functions/api/ebay/tokenHelper.js';
import { onRequestPut as itemPutHandler } from '../functions/api/items/[id].js';
import { onRequestPost as salesCreateHandler } from '../functions/api/sales/index.js';
import { onRequestPost as matchSoldVinescoutHandler } from '../functions/api/ebay/match-sold-vinescout.js';
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

describe('MED-9: Multiple Independent Sale-Reconciliation Code Paths Race & De-duplication', () => {
  let mockDb;
  let authToken;
  const testUserId = 'usr-med9-tester';
  const testItemId = 'item-med9-race-1';
  let env;

  beforeEach(async () => {
    mockDb = createMockD1();

    // Insert user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testUserId, 'med9@techtrek.test', 'dummyhash', 'Tester', 'Active', 1);

    // Insert invoice
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES (?, ?, ?)
    `).run('inv-med9-test', testUserId, 'INV-MED9-001');

    // Insert inventory item
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, current_list_price, actual_sell_price,
        unit_price, true_total_cost, status, date_acquired, date_listed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testItemId,
      testUserId,
      'inv-med9-test',
      '2023 Panini Prizm CJ Stroud Rookie PSA 10',
      150.00,
      140.00,
      40.00,
      45.00,
      'Listed',
      '2026-08-01',
      '2026-08-10'
    );

    // Seed eBay token
    const encAccess = await encryptToken('mock_ebay_token_med9', TEST_JWT_SECRET);
    mockDb._raw.prepare(`
      INSERT INTO ebay_oauth_tokens (
        id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, connected_at
      ) VALUES (?, ?, ?, ?, datetime('now', '+1 hour'), datetime('now', '+30 days'), 'sell.inventory sell.fulfillment', datetime('now'))
    `).run('tok-med9', testUserId, encAccess, encAccess);

    authToken = await createToken({ userId: testUserId, email: 'med9@techtrek.test' }, TEST_JWT_SECRET);
    env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, EBAY_SANDBOX: 'false' };
  });

  describe('Schema Unique Constraint Enforcement', () => {
    test('Direct duplicate INSERT into auction_sales with identical item_id fails with UNIQUE constraint violation', () => {
      // First sale insert
      mockDb._raw.prepare(`
        INSERT INTO auction_sales (
          id, user_id, item_id, sale_date, platform, gross_sale_price
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run('sale-med9-1', testUserId, testItemId, '2026-09-27', 'eBay', 100.00);

      // Attempt second insert with different sale ID but SAME item_id
      assert.throws(() => {
        mockDb._raw.prepare(`
          INSERT INTO auction_sales (
            id, user_id, item_id, sale_date, platform, gross_sale_price
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run('sale-med9-2', testUserId, testItemId, '2026-09-27', 'eBay', 105.00);
      }, /UNIQUE constraint failed/);
    });
  });

  describe('Concurrent Race Simulation & De-duplication', () => {
    test('Simultaneous reconcileAndSaveEbaySale and manual sale POST creates exactly ONE auction_sales row', async () => {
      const itemRow = mockDb._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get(testItemId);

      const manualSaleReq = new Request('http://localhost/api/sales', {
        method: 'POST',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_id: testItemId,
          sale_date: '2026-09-27',
          platform: 'eBay',
          gross_sale_price: 145.00,
          buyer_shipping_paid: 5.00,
          actual_shipping_cost: 4.50
        })
      });

      const orderData = {
        orderId: 'EBAY-RACE-ORD-001',
        saleDate: '2026-09-27',
        buyerHandle: 'race_buyer',
        lineItemCost: 145.00,
        deliveryCost: 5.00
      };

      // Launch both operations simultaneously
      const [reconResult, manualRes] = await Promise.all([
        reconcileAndSaveEbaySale(env, testUserId, itemRow, orderData, null),
        salesCreateHandler({ request: manualSaleReq, env })
      ]);

      assert.ok([200, 201].includes(manualRes.status), `Expected 200/201, got ${manualRes.status}`);
      assert.ok(reconResult?.sale?.id);

      // Confirm only ONE auction_sales row exists in database for this item_id
      const countRow = mockDb._raw.prepare('SELECT COUNT(*) as cnt FROM auction_sales WHERE item_id = ?').get(testItemId);
      assert.strictEqual(countRow.cnt, 1, `Expected exactly 1 auction_sales row for item_id, found: ${countRow.cnt}`);

      // Confirm item is marked Sold
      const itemAfter = mockDb._raw.prepare('SELECT status FROM auction_items WHERE id = ?').get(testItemId);
      assert.strictEqual(itemAfter.status, 'Sold');
    });

    test('Simultaneous items PUT (marking Sold) and manual sale POST creates exactly ONE auction_sales row', async () => {
      const itemPutReq = new Request(`http://localhost/api/items/${testItemId}`, {
        method: 'PUT',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'Sold',
          actual_sell_price: 135.00,
          date_sold: '2026-09-27'
        })
      });

      const manualSaleReq = new Request('http://localhost/api/sales', {
        method: 'POST',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_id: testItemId,
          sale_date: '2026-09-27',
          platform: 'eBay',
          gross_sale_price: 135.00
        })
      });

      const [putRes, saleRes] = await Promise.all([
        itemPutHandler({ request: itemPutReq, env, params: { id: testItemId } }),
        salesCreateHandler({ request: manualSaleReq, env })
      ]);

      assert.strictEqual(putRes.status, 200);
      assert.ok([200, 201].includes(saleRes.status), `Expected 200/201, got ${saleRes.status}`);

      const countRow = mockDb._raw.prepare('SELECT COUNT(*) as cnt FROM auction_sales WHERE item_id = ?').get(testItemId);
      assert.strictEqual(countRow.cnt, 1, `Expected exactly 1 auction_sales row for item_id, found: ${countRow.cnt}`);
    });

    test('Simultaneous reconcileAndSaveEbaySale and match-sold-vinescout POST creates exactly ONE auction_sales row', async () => {
      const itemRow = mockDb._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get(testItemId);

      const matchReq = new Request('http://localhost/api/ebay/match-sold-vinescout', {
        method: 'POST',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirm: true,
          item_id: testItemId,
          ebay_order_id: 'EBAY-MATCH-ORD-777',
          sale_price: 150.00,
          buyer_shipping_paid: 6.00,
          actual_shipping_cost: 5.00
        })
      });

      const orderData = {
        orderId: 'EBAY-MATCH-ORD-777',
        saleDate: '2026-09-27',
        buyerHandle: 'vscout_buyer',
        lineItemCost: 150.00,
        deliveryCost: 6.00
      };

      const [reconResult, matchRes] = await Promise.all([
        reconcileAndSaveEbaySale(env, testUserId, itemRow, orderData, null),
        matchSoldVinescoutHandler({ request: matchReq, env })
      ]);

      assert.strictEqual(matchRes.status, 200);
      assert.ok(reconResult?.sale?.id);

      const countRow = mockDb._raw.prepare('SELECT COUNT(*) as cnt FROM auction_sales WHERE item_id = ?').get(testItemId);
      assert.strictEqual(countRow.cnt, 1, `Expected exactly 1 auction_sales row for item_id, found: ${countRow.cnt}`);
    });
  });

  describe('Consistent Lookup by item_id', () => {
    test('match-sold-vinescout updates existing sale keyed by item_id even if ebay_order_id was previously different', async () => {
      // Seed existing sale with dummy ebay_order_id
      mockDb._raw.prepare(`
        INSERT INTO auction_sales (
          id, user_id, item_id, sale_date, platform, gross_sale_price, ebay_order_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('sale-existing-id', testUserId, testItemId, '2026-09-20', 'eBay', 120.00, 'OLD-ORDER-111');

      const matchReq = new Request('http://localhost/api/ebay/match-sold-vinescout', {
        method: 'POST',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirm: true,
          item_id: testItemId,
          ebay_order_id: 'NEW-ORDER-222',
          sale_price: 140.00
        })
      });

      const res = await matchSoldVinescoutHandler({ request: matchReq, env });
      assert.strictEqual(res.status, 200);

      // Confirm only 1 sale exists, with updated ebay_order_id
      const sales = mockDb._raw.prepare('SELECT * FROM auction_sales WHERE item_id = ?').all(testItemId);
      assert.strictEqual(sales.length, 1);
      assert.strictEqual(sales[0].id, 'sale-existing-id');
      assert.strictEqual(sales[0].ebay_order_id, 'NEW-ORDER-222');
      assert.strictEqual(sales[0].gross_sale_price, 140.00);
    });
  });
});
