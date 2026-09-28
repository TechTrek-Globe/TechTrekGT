import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateNonNegativeMoney } from '../functions/utils/auction.js';
import { onRequestPost as salesCreatePost } from '../functions/api/sales/index.js';
import { onRequestPut as salesUpdatePut } from '../functions/api/sales/[id].js';
import { onRequestPost as invoicesCreatePost } from '../functions/api/invoices/index.js';
import { onRequestPut as invoicesUpdatePut } from '../functions/api/invoices/[id].js';
import { onRequestPut as itemsUpdatePut } from '../functions/api/items/[id].js';
import { onRequestPost as platformsCreatePost } from '../functions/api/platforms/index.js';
import { onRequestPut as platformsUpdatePut } from '../functions/api/platforms/[id].js';
import { onRequestPost as marketCompsPost } from '../functions/api/comps/market.js';
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

describe('MED-7: Financial Numeric Input Validation', () => {
  let mockDb;
  let authToken;
  const testUserId = 'usr-med7-tester';
  const testInvoiceId = 'inv-med7-test-1';
  const testItemId = 'item-med7-test-1';
  const testSaleId = 'sale-med7-test-1';
  const testPlatformId = 'plat-med7-test-1';

  beforeEach(async () => {
    mockDb = createMockD1();

    // Insert user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testUserId, 'med7@techtrek.test', 'dummyhash', 'Tester', 'Active', 1);

    // Insert invoice
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total, discount, shipping, tax)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(testInvoiceId, testUserId, 'INV-MED7-001', 50.00, 5.00, 10.00, 2.50);

    // Insert item
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, category, status, unit_price, true_total_cost,
        current_list_price, attributes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      testItemId,
      testUserId,
      testInvoiceId,
      'Signed Baseball',
      'Memorabilia',
      'Available',
      50.00,
      57.50,
      120.00,
      '{}'
    );

    // Insert platform
    mockDb._raw.prepare(`
      INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, is_default)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testPlatformId, testUserId, 'Custom Platform', 0.10, 0.50, 0);

    // Insert sale
    mockDb._raw.prepare(`
      INSERT INTO auction_sales (
        id, user_id, item_id, sale_date, platform, gross_sale_price,
        buyer_shipping_paid, actual_shipping_cost, platform_fee_pct, platform_flat_fee,
        net_proceeds, true_total_cost, net_profit, roi_pct, days_to_sell
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `).run(
      testSaleId,
      testUserId,
      testItemId,
      '2026-09-27',
      'eBay',
      120.00,
      15.00,
      12.00,
      0.136,
      0.40,
      106.28,
      57.50,
      48.78,
      0.848,
      10
    );

    authToken = await createToken({ userId: testUserId, email: 'med7@techtrek.test' }, TEST_JWT_SECRET);
  });

  describe('validateNonNegativeMoney helper', () => {
    test('returns parsed number for valid positive numbers and zero', () => {
      assert.strictEqual(validateNonNegativeMoney(0, 'price'), 0);
      assert.strictEqual(validateNonNegativeMoney(123.45, 'price'), 123.45);
      assert.strictEqual(validateNonNegativeMoney('0', 'price'), 0);
      assert.strictEqual(validateNonNegativeMoney('99.99', 'price'), 99.99);
    });

    test('returns null for empty, null, or undefined values', () => {
      assert.strictEqual(validateNonNegativeMoney(undefined, 'price'), null);
      assert.strictEqual(validateNonNegativeMoney(null, 'price'), null);
      assert.strictEqual(validateNonNegativeMoney('', 'price'), null);
    });

    test('throws Error for negative numbers', () => {
      assert.throws(
        () => validateNonNegativeMoney(-0.01, 'actual_shipping_cost'),
        /actual_shipping_cost must be a non-negative number/
      );
      assert.throws(
        () => validateNonNegativeMoney('-50', 'discount'),
        /discount must be a non-negative number/
      );
    });

    test('throws Error for NaN, non-numeric strings, and booleans', () => {
      assert.throws(
        () => validateNonNegativeMoney('not-a-number', 'tax'),
        /tax must be a non-negative number/
      );
      assert.throws(
        () => validateNonNegativeMoney(true, 'unit_price'),
        /unit_price must be a non-negative number/
      );
      assert.throws(
        () => validateNonNegativeMoney(false, 'unit_price'),
        /unit_price must be a non-negative number/
      );
    });
  });

  describe('Verification: Sale creation with negative actual_shipping_cost', () => {
    test('POST /api/sales returns 400 when actual_shipping_cost is negative', async () => {
      const request = new Request('https://techtrekgt.com/outpost/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          item_id: testItemId,
          sale_date: '2026-09-27',
          platform: 'eBay',
          gross_sale_price: 100.00,
          buyer_shipping_paid: 15.00,
          actual_shipping_cost: -8.50 // Negative shipping cost
        })
      });

      const res = await salesCreatePost({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400, 'Must return HTTP 400 status');
      const body = await res.json();
      assert.strictEqual(
        body.error,
        'actual_shipping_cost must be a non-negative number',
        'Must return descriptive validation error message'
      );
    });

    test('POST /api/sales returns 400 when buyer_shipping_paid or fee percentages are negative', async () => {
      const request = new Request('https://techtrekgt.com/outpost/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          item_id: testItemId,
          sale_date: '2026-09-27',
          platform: 'eBay',
          gross_sale_price: 100.00,
          buyer_shipping_paid: -5.00
        })
      });

      const res = await salesCreatePost({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'buyer_shipping_paid must be a non-negative number');
    });
  });

  describe('Sale update validation (PUT /api/sales/:id)', () => {
    test('PUT /api/sales/:id returns 400 on negative actual_shipping_cost', async () => {
      const request = new Request(`https://techtrekgt.com/outpost/api/sales/${testSaleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          actual_shipping_cost: -15.00
        })
      });

      const res = await salesUpdatePut({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'actual_shipping_cost must be a non-negative number');
    });
  });

  describe('Invoice validation (POST & PUT /api/invoices)', () => {
    test('POST /api/invoices returns 400 on negative invoice discount or item unit_price', async () => {
      const request = new Request('https://techtrekgt.com/outpost/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          invoice_ref: 'INV-INVALID-01',
          discount: -10.00,
          items: [
            { item_name: 'Test Item', unit_price: 25.00 }
          ]
        })
      });

      const res = await invoicesCreatePost({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'discount must be a non-negative number');
    });

    test('PUT /api/invoices/:id returns 400 on negative shipping or tax', async () => {
      const request = new Request(`https://techtrekgt.com/outpost/api/invoices/${testInvoiceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          shipping: -12.50
        })
      });

      const res = await invoicesUpdatePut({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'shipping must be a non-negative number');
    });
  });

  describe('Item update validation (PUT /api/items/:id)', () => {
    test('PUT /api/items/:id returns 400 on negative unit_price or actual_sell_price', async () => {
      const request = new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          actual_sell_price: -45.00
        })
      });

      const res = await itemsUpdatePut({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'actual_sell_price must be a non-negative number');
    });
  });

  describe('Platform fee validation (POST & PUT /api/platforms)', () => {
    test('POST /api/platforms returns 400 on negative fee_pct', async () => {
      const request = new Request('https://techtrekgt.com/outpost/api/platforms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          name: 'Negative Platform',
          fee_pct: -0.05,
          flat_fee: 0.30
        })
      });

      const res = await platformsCreatePost({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'fee_pct must be a non-negative number');
    });

    test('PUT /api/platforms/:id returns 400 on negative flat_fee', async () => {
      const request = new Request(`https://techtrekgt.com/outpost/api/platforms/${testPlatformId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          flat_fee: -0.50
        })
      });

      const res = await platformsUpdatePut({
        request,
        params: { id: testPlatformId },
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'flat_fee must be a non-negative number');
    });
  });

  describe('Market comps validation (POST /api/comps/market)', () => {
    test('POST /api/comps/market returns 400 on negative shipping_fee', async () => {
      const request = new Request('https://techtrekgt.com/outpost/api/comps/market', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({
          item_id: testItemId,
          source: 'manual',
          list_price: 50.00,
          shipping_fee: -4.99
        })
      });

      const res = await marketCompsPost({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'shipping_fee must be a non-negative number');
    });
  });
});
