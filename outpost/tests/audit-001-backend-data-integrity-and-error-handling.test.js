import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';
import { onRequestPost as batchImportPost } from '../functions/api/import/batch.js';
import { onRequestPost as reconcilePost } from '../functions/api/ebay/reconcile.js';
import { onRequestPost as createSalePost } from '../functions/api/sales/index.js';
import { onRequestDelete as deleteSaleReq } from '../functions/api/sales/[id].js';
import { onRequestPost as createInvoicePost } from '../functions/api/invoices/index.js';
import { onRequestPost as vinescoutCatalogPost } from '../functions/api/sync/vinescout-catalog.js';
import { onRequestPost as importAmazonPost } from '../functions/api/import/amazon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const TEST_TOKEN_KEY = 'test-dedicated-token-encryption-key-32b';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec("ALTER TABLE users ADD COLUMN amazon_api_token TEXT;");
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

describe('[AUDIT-001] Backend Data Integrity and Compensating Rollback Audit', () => {
  let mockDb;
  let env;
  let authCookie;
  const testUserId = 'usr_audit001_tester';

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_KEY
    };

    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin, created_at)
      VALUES ('${testUserId}', 'audit@techtrekgt.test', 'hash', 'Audit Tester', 'user', 0, datetime('now'));

      INSERT INTO auction_invoices (id, user_id, invoice_ref, description, base_total, discount, shipping, tax, created_at)
      VALUES ('inv-audit-default', '${testUserId}', 'INV-AUDIT-DEF', 'Audit Default Invoice', 100, 0, 0, 0, datetime('now'));
    `);

    const farFutureExp = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const encAccess = await encryptToken('access_token_audit', TEST_TOKEN_KEY);
    const encRefresh = await encryptToken('refresh_token_audit', TEST_TOKEN_KEY);

    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok_audit', '${testUserId}', '${encAccess}', '${encRefresh}', '${farFutureExp}', '${farFutureExp}', 'sell.finances');
    `);

    const token = await createToken({
      userId: testUserId,
      email: 'audit@techtrekgt.test',
      role: 'user',
      is_admin: 0
    }, TEST_JWT_SECRET);
    authCookie = `auth_token=${token}`;
  });

  test('POST /api/import/batch: replace strategy rollback on delete failure', async () => {
    // Insert an existing item
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, created_at, updated_at)
      VALUES ('item-original-1', '${testUserId}', 'inv-audit-default', 'Original Item', 10, 10, 'Available', datetime('now'), datetime('now'));
    `);

    // Override env.DB.batch to fail during the replace delete phase
    const originalBatch = mockDb.batch;
    let callCount = 0;
    mockDb.batch = async (statements) => {
      callCount++;
      // The 1st batch is the item insert, the 2nd is the post-insert delete for replace
      if (callCount === 2) {
        throw new Error('Simulated D1 delete failure during replace');
      }
      return originalBatch.call(mockDb, statements);
    };

    const req = new Request('https://techtrekgt.com/api/import/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        strategy: 'replace',
        confirmReplace: true,
        items: [{ item_name: 'New Replacement Item', unit_price: 25 }]
      })
    });

    const res = await batchImportPost({ request: req, env });
    assert.strictEqual(res.status, 500, 'Must return HTTP 500 on replace delete failure');

    const data = await res.json();
    assert.ok(data.error.includes('rolled back'), 'Error message must confirm rollback');

    // Verify original item remains intact and replacement item was cleaned up
    const originalItem = mockDb._raw.prepare("SELECT * FROM auction_items WHERE id = 'item-original-1'").get();
    assert.ok(originalItem, 'Original item must still exist');

    const newItem = mockDb._raw.prepare("SELECT * FROM auction_items WHERE item_name = 'New Replacement Item'").get();
    assert.strictEqual(newItem, undefined, 'Replacement item must be rolled back');
  });

  test('POST /api/sales: rolls back created sale if auction_items update fails', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, created_at, updated_at)
      VALUES ('item-sale-test-1', '${testUserId}', 'inv-audit-default', 'Collectible Card', 50, 50, 'Available', datetime('now'), datetime('now'));
    `);

    // Intercept prepare to force error when updating auction_items
    const originalPrepare = mockDb.prepare;
    mockDb.prepare = (sql) => {
      if (sql.includes('UPDATE auction_items SET') && sql.includes("status = 'Sold'")) {
        return {
          bind() {
            return {
              async run() {
                throw new Error('Simulated D1 failure updating item status to Sold');
              }
            };
          }
        };
      }
      return originalPrepare.call(mockDb, sql);
    };

    const req = new Request('https://techtrekgt.com/api/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        item_id: 'item-sale-test-1',
        sale_date: '2026-10-02',
        platform: 'eBay',
        gross_sale_price: 100
      })
    });

    const res = await createSalePost({ request: req, env });
    assert.strictEqual(res.status, 500, 'Must return HTTP 500 on item update failure');

    // Confirm that no orphaned sale was left in auction_sales
    const saleRow = mockDb._raw.prepare("SELECT * FROM auction_sales WHERE item_id = 'item-sale-test-1'").get();
    assert.strictEqual(saleRow, undefined, 'Created sale row must be rolled back');

    // Item must remain Available
    const itemRow = mockDb._raw.prepare("SELECT status FROM auction_items WHERE id = 'item-sale-test-1'").get();
    assert.strictEqual(itemRow.status, 'Available', 'Item status must remain Available');
  });

  test('DELETE /api/sales/:id: purges linked ebay_fee_reconciliations and reverts item status', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, date_listed, actual_sell_price, date_sold, created_at, updated_at)
      VALUES ('item-del-test', '${testUserId}', 'inv-audit-default', 'Graded Puck', 100, 100, 'Sold', '2026-09-01', 200, '2026-10-01', datetime('now'), datetime('now'));

      INSERT INTO auction_sales (id, user_id, item_id, sale_date, platform, gross_sale_price, net_proceeds, true_total_cost, net_profit, roi_pct, created_at)
      VALUES ('sale-del-test', '${testUserId}', 'item-del-test', '2026-10-01', 'eBay', 200, 170, 100, 70, 0.70, datetime('now'));

      INSERT INTO ebay_fee_reconciliations (id, sale_id, user_id, ebay_order_id, final_value_fee, total_ebay_fees, estimated_fees, fee_delta, reconciled_net_profit, reconciled_at)
      VALUES ('recon-del-test', 'sale-del-test', '${testUserId}', '12-34567-89012', 26.50, 30.00, 27.00, 3.00, 70.00, datetime('now'));
    `);

    const req = new Request('https://techtrekgt.com/api/sales/sale-del-test', {
      method: 'DELETE',
      headers: {
        'Cookie': authCookie
      }
    });

    const res = await deleteSaleReq({ request: req, env });
    assert.strictEqual(res.status, 200, 'Must return HTTP 200 on successful delete');

    // Verify sale is deleted
    const sale = mockDb._raw.prepare("SELECT * FROM auction_sales WHERE id = 'sale-del-test'").get();
    assert.strictEqual(sale, undefined, 'Sale row must be deleted');

    // Verify linked ebay_fee_reconciliations is deleted (no orphan)
    const recon = mockDb._raw.prepare("SELECT * FROM ebay_fee_reconciliations WHERE sale_id = 'sale-del-test'").get();
    assert.strictEqual(recon, undefined, 'Linked ebay_fee_reconciliations must be purged');

    // Verify item is reverted back to Listed
    const item = mockDb._raw.prepare("SELECT status, actual_sell_price, date_sold FROM auction_items WHERE id = 'item-del-test'").get();
    assert.strictEqual(item.status, 'Listed', 'Item status must revert to Listed');
    assert.strictEqual(item.actual_sell_price, null, 'actual_sell_price must be reset to NULL');
    assert.strictEqual(item.date_sold, null, 'date_sold must be reset to NULL');
  });

  test('POST /api/invoices: rolls back invoice when item batch insertion fails', async () => {
    // Force batch insertion of items to fail
    const originalBatch = mockDb.batch;
    mockDb.batch = async () => {
      throw new Error('Simulated D1 batch failure inserting invoice items');
    };

    const req = new Request('https://techtrekgt.com/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        invoice_ref: 'INV-AUDIT-FAIL-01',
        description: 'Failed batch invoice',
        items: [
          { item_name: 'Test Item 1', unit_price: 20 },
          { item_name: 'Test Item 2', unit_price: 30 }
        ]
      })
    });

    const res = await createInvoicePost({ request: req, env });
    assert.strictEqual(res.status, 500, 'Must return HTTP 500 on batch item insert failure');

    // Confirm the created invoice row was deleted
    const inv = mockDb._raw.prepare("SELECT * FROM auction_invoices WHERE invoice_ref = 'INV-AUDIT-FAIL-01'").get();
    assert.strictEqual(inv, undefined, 'Orphaned invoice record must be rolled back');

    mockDb.batch = originalBatch;
  });

  test('POST /api/sync/vinescout-catalog: reverts item status if markItemSold fails', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, attributes, created_at, updated_at)
      VALUES ('item-vscout-fail', '${testUserId}', 'inv-audit-default', 'Vine Gadget', 0, 0, 'Available', '{"asin":"B00AUDIT01"}', datetime('now'), datetime('now'));
    `);

    // Override prepare to fail on auction_sales upsert and fallback UPDATE
    const originalPrepare = mockDb.prepare;
    mockDb.prepare = (sql) => {
      if (sql.includes('auction_sales') && (sql.includes('INSERT') || sql.includes('UPDATE'))) {
        return {
          bind() {
            return {
              async run() {
                throw new Error('Simulated D1 sales upsert failure');
              }
            };
          }
        };
      }
      return originalPrepare.call(mockDb, sql);
    };

    const req = new Request('https://techtrekgt.com/api/sync/vinescout-catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        item_id: 'item-vscout-fail',
        sale_price: 49.99
      })
    });

    const res = await vinescoutCatalogPost({ request: req, env });
    assert.strictEqual(res.status, 500, 'Must return HTTP 500 when markItemSold fails');

    // Verify item was restored to Available, not left in limbo as Sold
    const item = mockDb._raw.prepare("SELECT status, actual_sell_price FROM auction_items WHERE id = 'item-vscout-fail'").get();
    assert.strictEqual(item.status, 'Available', 'Item status must be restored to Available');
    assert.strictEqual(item.actual_sell_price, null, 'Item actual_sell_price must be restored to NULL');
  });

  test('POST /api/import/amazon: rolls back invoice when item creation fails', async () => {
    // Intercept prepare to fail when inserting auction_items
    const originalPrepare = mockDb.prepare;
    mockDb.prepare = (sql) => {
      if (sql.includes('INSERT INTO auction_items')) {
        return {
          bind() {
            return {
              async run() {
                throw new Error('Simulated D1 item insert failure in Amazon import');
              }
            };
          }
        };
      }
      return originalPrepare.call(mockDb, sql);
    };

    const req = new Request('https://techtrekgt.com/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        asin: 'B00TESTASIN1',
        title: 'Amazon Product Failure Test',
        etv: 15.00
      })
    });

    const res = await importAmazonPost({ request: req, env });
    assert.strictEqual(res.status, 500, 'Must return HTTP 500 when item insertion fails');

    // Confirm that no orphaned invoice was left
    const invoice = mockDb._raw.prepare("SELECT * FROM auction_invoices WHERE invoice_ref LIKE 'AMAZON-B00TESTASIN1-%'").get();
    assert.strictEqual(invoice, undefined, 'Orphaned Amazon invoice must be rolled back');
  });

  test('POST /api/ebay/reconcile: rolls back reconciliation and sale state if transaction fails', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, created_at, updated_at)
      VALUES ('item-recon-test', '${testUserId}', 'inv-audit-default', 'Signed Helmet', 150, 150, 'Sold', datetime('now'), datetime('now'));

      INSERT INTO auction_sales (id, user_id, item_id, sale_date, platform, gross_sale_price, net_proceeds, true_total_cost, net_profit, roi_pct, created_at)
      VALUES ('sale-recon-test', '${testUserId}', 'item-recon-test', '2026-10-01', 'eBay', 300, 260, 150, 110, 0.73, datetime('now'));
    `);

    // Override fetch to return mock Finances API response
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      return new Response(JSON.stringify({
        transactions: [
          {
            transactionType: 'SALE',
            totalFeeBasisAmount: { value: '300.00', currency: 'USD' },
            feeType: 'FINAL_VALUE_FEE',
            amount: { value: '38.00', currency: 'USD' }
          }
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    // Override env.DB.batch to fail during fee reconciliation persist
    mockDb.batch = async () => {
      throw new Error('Simulated D1 batch failure in reconcile');
    };

    const req = new Request('https://techtrekgt.com/api/ebay/reconcile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({
        sale_id: 'sale-recon-test',
        ebay_order_id: '09-12345-67890'
      })
    });

    const res = await reconcilePost({ request: req, env });
    assert.strictEqual(res.status, 500, 'Must return HTTP 500 on reconciliation write failure');

    // Confirm that no orphaned ebay_fee_reconciliations record was persisted
    const reconRow = mockDb._raw.prepare("SELECT * FROM ebay_fee_reconciliations WHERE sale_id = 'sale-recon-test'").get();
    assert.strictEqual(reconRow, undefined, 'Orphaned reconciliation record must be rolled back');

    // Confirm auction_sales remains in original state
    const saleRow = mockDb._raw.prepare("SELECT fee_reconciled_at, net_proceeds FROM auction_sales WHERE id = 'sale-recon-test'").get();
    assert.strictEqual(saleRow.fee_reconciled_at, null, 'fee_reconciled_at must remain NULL');
    assert.strictEqual(saleRow.net_proceeds, 260, 'net_proceeds must remain at original value');

    global.fetch = originalFetch;
  });
});
