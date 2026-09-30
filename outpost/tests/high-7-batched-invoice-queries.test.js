import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { onRequestPost as createInvoicePost, onRequestGet as listInvoicesGet } from '../functions/api/invoices/index.js';
import { onRequestPut as updateInvoicePut, onRequestGet as getInvoiceGet } from '../functions/api/invoices/[id].js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

function createMockD1WithTracking() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec("ALTER TABLE users ADD COLUMN amazon_api_token TEXT;");
  db.exec(auctionSchema);

  const queryLog = [];
  const batchLog = [];
  let isBatching = false;

  const mockDb = {
    _raw: db,
    queryLog,
    batchLog,
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          queryLog.push({ type: 'first', sql, params: boundParams, isBatch: isBatching });
          const stmt = db.prepare(sql);
          return stmt.get(...boundParams) || null;
        },
        async all() {
          queryLog.push({ type: 'all', sql, params: boundParams, isBatch: isBatching });
          const stmt = db.prepare(sql);
          return { results: stmt.all(...boundParams) };
        },
        async run() {
          queryLog.push({ type: 'run', sql, params: boundParams, isBatch: isBatching });
          const stmt = db.prepare(sql);
          const info = stmt.run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(statements) {
      batchLog.push({ count: statements.length });
      const results = [];
      isBatching = true;
      try {
        for (const stmt of statements) {
          results.push(await stmt.run());
        }
      } finally {
        isBatching = false;
      }
      return results;
    }
  };

  return mockDb;
}

describe('[HIGH-7] N+1 Query Elimination in Invoice Item Creation and Update', () => {
  let mockDb;
  let env;
  let testUserId = 'usr_invoice_tester_001';
  let authCookie;

  beforeEach(async () => {
    mockDb = createMockD1WithTracking();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    // Seed test user
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, token_version)
      VALUES ('${testUserId}', 'tester@techtrekgt.test', 'salt:310000:hash', 'Invoice Tester', 'user', 0);
    `);

    // Seed auction platforms with fractional fees
    mockDb._raw.exec(`
      INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, notes, is_default)
      VALUES 
        ('plat_1', '${testUserId}', 'eBay', 0.1325, 0.30, 'eBay standard fee', 1),
        ('plat_2', '${testUserId}', 'Mercari', 0.10, 0.0, 'Mercari standard fee', 0),
        ('plat_3', '${testUserId}', 'Poshmark', 0.20, 0.0, 'Poshmark standard fee', 0);
    `);

    const token = await createToken({ userId: testUserId, email: 'tester@techtrekgt.test', name: 'Invoice Tester' }, TEST_JWT_SECRET);
    authCookie = `auth_token=${token}`;
  });

  test('POST /api/invoices creates an invoice with 12 items using batched queries (no N+1 platform lookups or inserts)', async () => {
    // 12 items: 4 on eBay, 4 on Mercari, 2 on Poshmark, 1 with custom fee, 1 without platform
    const items = [];
    for (let i = 1; i <= 12; i++) {
      let platform = null;
      let platform_fee_pct = undefined;

      if (i <= 4) platform = 'eBay';
      else if (i <= 8) platform = 'Mercari';
      else if (i <= 10) platform = 'Poshmark';
      else if (i === 11) {
        platform = 'eBay';
        platform_fee_pct = 0.05; // explicit override - should NOT require platform lookup
      }

      items.push({
        item_name: `Collectible Card #${i}`,
        unit_price: 25.0,
        platform,
        platform_fee_pct,
        est_shipping_cost: 4.5,
        target_margin_pct: 0.30
      });
    }

    const reqBody = {
      invoice_ref: 'INV-2026-HIGH7-001',
      description: 'Lot of 12 trading cards',
      discount: 20.0,
      shipping: 15.0,
      tax: 25.0,
      date_acquired: '2026-09-27',
      items
    };

    const req = new Request('https://techtrekgt.com/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify(reqBody)
    });

    const res = await createInvoicePost({ request: req, env });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.items.length, 12);
    assert.strictEqual(body.invoice.base_total, 300.0);

    // Verify all 12 items exist in database with correct proration
    const dbItems = mockDb._raw.prepare(
      'SELECT * FROM auction_items WHERE invoice_id = ? ORDER BY item_name ASC'
    ).all(body.invoice.id);
    assert.strictEqual(dbItems.length, 12);

    for (const item of dbItems) {
      // 300 total base price, each item is 25 => weight = 25/300 = 1/12
      // prorated discount = 20 / 12 = 1.6666...
      // prorated shipping = 15 / 12 = 1.25
      // prorated tax = 25 / 12 = 2.0833...
      // true_total_cost = 25 - 1.6666... + 1.25 + 2.0833... = 26.6666...
      assert.ok(Math.abs(item.true_total_cost - 26.6666) < 0.01, `Item ${item.item_name} true_total_cost should be ~26.67`);
      assert.ok(item.min_sell_price > item.true_total_cost, 'min_sell_price must exceed cost');
      assert.ok(item.suggested_list_price >= item.min_sell_price, 'suggested_list_price must meet or exceed min_sell_price');

      // Check looked up platform fee
      if (item.item_name === 'Collectible Card #1') {
        assert.strictEqual(item.platform, 'eBay');
        assert.strictEqual(item.platform_fee_pct, 0.1325);
        assert.strictEqual(item.platform_flat_fee, 0.30);
      } else if (item.item_name === 'Collectible Card #5') {
        assert.strictEqual(item.platform, 'Mercari');
        assert.strictEqual(item.platform_fee_pct, 0.10);
      } else if (item.item_name === 'Collectible Card #9') {
        assert.strictEqual(item.platform, 'Poshmark');
        assert.strictEqual(item.platform_fee_pct, 0.20);
      } else if (item.item_name === 'Collectible Card #11') {
        assert.strictEqual(item.platform, 'eBay');
        assert.strictEqual(item.platform_fee_pct, 0.05, 'Override fee must be preserved');
      } else if (item.item_name === 'Collectible Card #12') {
        assert.strictEqual(item.platform, null);
        assert.strictEqual(item.platform_fee_pct, 0);
      }
    }

    // Verify Query Efficiency:
    // 1. Platform lookups: exactly 1 SELECT query for auction_platforms with IN (?, ?, ?)
    const platformQueries = mockDb.queryLog.filter(q => q.sql.includes('auction_platforms'));
    assert.strictEqual(platformQueries.length, 1, 'There must be exactly 1 platform query across all 12 items');
    assert.ok(platformQueries[0].sql.includes('IN (?, ?, ?)'), 'Platform query must use IN (...) clause');
    assert.deepStrictEqual(
      platformQueries[0].params.slice(1).sort(),
      ['Mercari', 'Poshmark', 'eBay'],
      'Must query the distinct platforms needing fee lookup'
    );

    // 2. Batch Execution: exactly 1 batch execution containing 12 insert statements
    assert.strictEqual(mockDb.batchLog.length, 1, 'Item inserts must be executed in a single batch');
    assert.strictEqual(mockDb.batchLog[0].count, 12, 'Batch must contain all 12 item insert statements');

    // Confirm that per-item individual .run() was NOT called for inserts
    const itemInsertRuns = mockDb.queryLog.filter(q => q.type === 'run' && !q.isBatch && q.sql.includes('INSERT INTO auction_items'));
    assert.strictEqual(itemInsertRuns.length, 0, 'No individual INSERT INTO auction_items .run() calls should occur');
  });

  test('PUT /api/invoices/:id re-prorates all items using batched update statements (no N+1 update calls)', async () => {
    // First, create an invoice with 10 items
    const items = [];
    for (let i = 1; i <= 10; i++) {
      items.push({
        item_name: `Batch Item ${i}`,
        unit_price: 50.0,
        platform: 'eBay',
        est_shipping_cost: 5.0,
        target_margin_pct: 0.25
      });
    }

    const createReq = new Request('https://techtrekgt.com/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        invoice_ref: 'INV-2026-UPDATE-001',
        discount: 0,
        shipping: 0,
        tax: 0,
        items
      })
    });

    const createRes = await createInvoicePost({ request: createReq, env });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    const invoiceId = createData.invoice.id;

    // Clear logs to measure PUT operation specifically
    mockDb.queryLog.length = 0;
    mockDb.batchLog.length = 0;

    // Update the invoice: add large discount, shipping, tax
    const updateReq = new Request(`https://techtrekgt.com/api/invoices/${invoiceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        discount: 100.0, // $10 off each item
        shipping: 50.0,  // +$5 shipping each item
        tax: 50.0        // +$5 tax each item
      })
    });

    const updateRes = await updateInvoicePut({ request: updateReq, env });
    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.success, true);
    assert.ok(updateData.message.includes('10 items re-prorated'));

    // Verify all 10 items in DB have updated proration
    const updatedDbItems = mockDb._raw.prepare(
      'SELECT * FROM auction_items WHERE invoice_id = ?'
    ).all(invoiceId);
    assert.strictEqual(updatedDbItems.length, 10);

    for (const item of updatedDbItems) {
      // 500 total base price, each item is 50 => weight = 0.1
      // prorated discount = 100 * 0.1 = 10.0
      // prorated shipping = 50 * 0.1 = 5.0
      // prorated tax = 50 * 0.1 = 5.0
      // true_total_cost = 50 - 10 + 5 + 5 = 50.0
      assert.strictEqual(item.prorated_discount, 10.0);
      assert.strictEqual(item.prorated_shipping, 5.0);
      assert.strictEqual(item.prorated_tax, 5.0);
      assert.strictEqual(item.true_total_cost, 50.0);
    }

    // Verify batch execution was used for the 10 updates
    assert.strictEqual(mockDb.batchLog.length, 1, 'Item updates must be executed via env.DB.batch');
    assert.strictEqual(mockDb.batchLog[0].count, 10, 'Batch must contain exactly 10 update statements');

    // Confirm that per-item individual .run() was NOT called for updates
    const itemUpdateRuns = mockDb.queryLog.filter(q => q.type === 'run' && !q.isBatch && q.sql.includes('UPDATE auction_items'));
    assert.strictEqual(itemUpdateRuns.length, 0, 'No individual UPDATE auction_items .run() calls should occur');
  });

  test('POST /api/invoices skips platform fee query entirely when no platform lookup is required', async () => {
    mockDb.queryLog.length = 0;
    mockDb.batchLog.length = 0;

    // T-10 item 7: the fixture previously used 12.0, which is 1200% as a fraction.
    // That is out of range for a fee and is now rejected at the API boundary.
    // The intent of the test (an explicit fee skips the platform lookup) is
    // unchanged; only the invalid value is corrected.
    const items = [
      { item_name: 'No Platform Item 1', unit_price: 15.0 },
      { item_name: 'Explicit Fee Item 2', unit_price: 25.0, platform: 'CustomPlat', platform_fee_pct: 0.12 }
    ];

    const req = new Request('https://techtrekgt.com/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        invoice_ref: 'INV-NO-PLAT-LOOKUP',
        items
      })
    });

    const res = await createInvoicePost({ request: req, env });
    assert.strictEqual(res.status, 201);

    // Platform table query should have been skipped
    const platformQueries = mockDb.queryLog.filter(q => q.sql.includes('auction_platforms'));
    assert.strictEqual(platformQueries.length, 0, 'Platform query must be skipped when no items need lookup');

    // Inserts were still batched
    assert.strictEqual(mockDb.batchLog.length, 1);
    assert.strictEqual(mockDb.batchLog[0].count, 2);
  });

  test('POST /api/invoices validates required fields and fails before running DB writes', async () => {
    mockDb.queryLog.length = 0;
    mockDb.batchLog.length = 0;

    const req1 = new Request('https://techtrekgt.com/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': authCookie },
      body: JSON.stringify({ items: [{ item_name: 'Test', unit_price: 10 }] }) // missing invoice_ref
    });
    const res1 = await createInvoicePost({ request: req1, env });
    assert.strictEqual(res1.status, 400);

    const req2 = new Request('https://techtrekgt.com/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': authCookie },
      body: JSON.stringify({ invoice_ref: 'INV-1', items: [{ item_name: 'Test', unit_price: -5 }] }) // negative unit_price
    });
    const res2 = await createInvoicePost({ request: req2, env });
    assert.strictEqual(res2.status, 400);

    // No DB inserts or batches should have occurred
    assert.strictEqual(mockDb.batchLog.length, 0);
  });
});
