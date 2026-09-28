import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { daysBetween } from '../functions/utils/auction.js';
import { daysBetween as clientDaysBetween } from '../src/utils/formulaPreview.js';
import { onRequestPost as salesCreatePost } from '../functions/api/sales/index.js';
import { onRequestPut as salesUpdatePut } from '../functions/api/sales/[id].js';
import { onRequestPut as itemUpdatePut } from '../functions/api/items/[id].js';
import { reconcileAndSaveEbaySale } from '../functions/api/ebay/tokenHelper.js';
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

test('MED-11: Inconsistent negative day-count guarding across daysBetween() call sites', async (t) => {

  await t.test('daysBetween unit: clamps negative difference to 0 and warns', () => {
    // Normal positive day counts
    assert.equal(daysBetween('2026-05-01', '2026-05-10'), 9);
    assert.equal(daysBetween('2026-05-01', '2026-05-01'), 0);

    // Negative day counts (toDate precedes fromDate): must return 0 (not negative)
    assert.equal(daysBetween('2026-05-10', '2026-05-01'), 0);
    assert.equal(daysBetween('2026-12-31', '2026-01-01'), 0);

    // Missing, null, or invalid dates: returns null
    assert.equal(daysBetween(null, '2026-05-01'), null);
    assert.equal(daysBetween('2026-05-01', null), null);
    assert.equal(daysBetween('', '2026-05-01'), null);
    assert.equal(daysBetween('invalid-date', '2026-05-01'), null);

    // Client formulaPreview.js mirror produces identical clamped results
    assert.equal(clientDaysBetween('2026-05-10', '2026-05-01'), 0);
    assert.equal(clientDaysBetween('2026-05-01', '2026-05-10'), 9);
  });

  await t.test('POST /api/sales clamps days_to_sell to 0 when sale_date precedes date_acquired', async () => {
    const mockDb = createMockD1();
    mockDb._raw.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('user-1', 'Test User', 'test@example.com', 'hash')").run();
    mockDb._raw.prepare("INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES ('inv-1', 'user-1', 'INV-001')").run();
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, date_acquired)
      VALUES ('item-1', 'user-1', 'inv-1', 'Test Item', 10.00, 10.00, 'Available', '2026-05-15')
    `).run();
    mockDb._raw.prepare(`
      INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee)
      VALUES ('plat-1', 'user-1', 'eBay', 0.13, 0.40)
    `).run();

    const token = await createToken({ userId: 'user-1', email: 'test@example.com' }, TEST_JWT_SECRET);
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    // Sale date ('2026-05-01') is 14 days BEFORE date_acquired ('2026-05-15')
    const context = {
      request: new Request('http://localhost/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${token}`
        },
        body: JSON.stringify({
          item_id: 'item-1',
          sale_date: '2026-05-01',
          platform: 'eBay',
          gross_sale_price: 30.00
        })
      }),
      env
    };

    const res = await salesCreatePost(context);
    assert.equal(res.status, 201);

    const saleRow = mockDb._raw.prepare('SELECT days_to_sell FROM auction_sales WHERE item_id = ?').get('item-1');
    assert.ok(saleRow);
    assert.equal(saleRow.days_to_sell, 0); // Must be clamped to 0, not -14
  });

  await t.test('PUT /api/sales/:id clamps days_to_sell to 0 when sale_date updated to precede acquisition', async () => {
    const mockDb = createMockD1();
    mockDb._raw.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('user-1', 'Test User', 'test@example.com', 'hash')").run();
    mockDb._raw.prepare("INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES ('inv-1', 'user-1', 'INV-001')").run();
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, date_acquired)
      VALUES ('item-2', 'user-1', 'inv-1', 'Test Item 2', 10.00, 10.00, 'Sold', '2026-05-15')
    `).run();
    mockDb._raw.prepare(`
      INSERT INTO auction_sales (id, user_id, item_id, sale_date, platform, gross_sale_price, net_proceeds, net_profit, roi_pct, days_to_sell)
      VALUES ('sale-2', 'user-1', 'item-2', '2026-05-20', 'eBay', 30.00, 25.00, 15.00, 1.5, 5)
    `).run();

    const token = await createToken({ userId: 'user-1', email: 'test@example.com' }, TEST_JWT_SECRET);
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    // Update sale_date to '2026-05-05' (10 days BEFORE date_acquired '2026-05-15')
    const context = {
      request: new Request('http://localhost/api/sales/sale-2', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${token}`
        },
        body: JSON.stringify({
          sale_date: '2026-05-05',
          gross_sale_price: 35.00
        })
      }),
      params: { id: 'sale-2' },
      env
    };

    const res = await salesUpdatePut(context);
    assert.equal(res.status, 200);

    const updatedSale = mockDb._raw.prepare('SELECT days_to_sell FROM auction_sales WHERE id = ?').get('sale-2');
    assert.equal(updatedSale.days_to_sell, 0); // Must be clamped to 0, not -10
  });

  await t.test('PUT /api/items/:id (marking Sold) clamps days_on_market to 0 when date_sold precedes date_acquired', async () => {
    const mockDb = createMockD1();
    mockDb._raw.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('user-1', 'Test User', 'test@example.com', 'hash')").run();
    mockDb._raw.prepare("INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES ('inv-1', 'user-1', 'INV-001')").run();
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, date_acquired)
      VALUES ('item-3', 'user-1', 'inv-1', 'Test Item 3', 10.00, 10.00, 'Listed', '2026-05-15')
    `).run();

    const token = await createToken({ userId: 'user-1', email: 'test@example.com' }, TEST_JWT_SECRET);
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    // Mark as Sold with date_sold: '2026-05-01' (before date_acquired: '2026-05-15')
    const context = {
      request: new Request('http://localhost/api/items/item-3', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${token}`
        },
        body: JSON.stringify({
          status: 'Sold',
          date_sold: '2026-05-01',
          actual_sell_price: 25.00
        })
      }),
      params: { id: 'item-3' },
      env
    };

    const res = await itemUpdatePut(context);
    assert.equal(res.status, 200);

    const updatedItem = mockDb._raw.prepare('SELECT days_on_market FROM auction_items WHERE id = ?').get('item-3');
    assert.equal(updatedItem.days_on_market, 0);

    const autoSyncedSale = mockDb._raw.prepare('SELECT days_to_sell FROM auction_sales WHERE item_id = ?').get('item-3');
    assert.ok(autoSyncedSale);
    assert.equal(autoSyncedSale.days_to_sell, 0);
  });

  await t.test('reconcileAndSaveEbaySale clamps days_to_sell to 0 when eBay saleDate precedes date_acquired', async () => {
    const mockDb = createMockD1();
    mockDb._raw.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('user-1', 'Test User', 'test@example.com', 'hash')").run();
    mockDb._raw.prepare("INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES ('inv-1', 'user-1', 'INV-001')").run();
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, date_acquired)
      VALUES ('item-4', 'user-1', 'inv-1', 'Test Item 4', 15.00, 15.00, 'Listed', '2026-05-20')
    `).run();

    const env = { DB: mockDb };
    const item = mockDb._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get('item-4');

    const result = await reconcileAndSaveEbaySale(
      env,
      'user-1',
      item,
      {
        orderId: 'EBAY-ORDER-999',
        saleDate: '2026-05-01', // 19 days BEFORE date_acquired ('2026-05-20')
        lineItemCost: 45.00,
        buyerHandle: 'testbuyer'
      },
      null
    );

    assert.ok(result);
    const sale = mockDb._raw.prepare('SELECT days_to_sell FROM auction_sales WHERE item_id = ?').get('item-4');
    assert.ok(sale);
    assert.equal(sale.days_to_sell, 0); // Must be clamped to 0, not -19
  });
});
