import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { onRequestPost as batchPostHandler } from '../functions/api/import/batch.js';
import { onRequestGet as batchesListHandler } from '../functions/api/import/batches.js';
import { onRequestGet as batchDetailHandler } from '../functions/api/import/batches/[id].js';
import { onRequestGet as batchFileHandler } from '../functions/api/import/batches/[id]/file.js';
import { onRequestGet as nonVinePnlHandler } from '../functions/api/reports/non-vine-pnl.js';
import { onRequestGet as dashboardGetHandler } from '../functions/api/dashboard.js';
import { onRequestGet as invoiceDetailHandler } from '../functions/api/invoices/[id].js';
import { onRequestPut as itemPutHandler } from '../functions/api/items/[id].js';
import { BASE64_CHUNK_CHARS } from '../functions/utils/importBatches.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

function createMockD1({ includeAuctionSchema = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec('ALTER TABLE users ADD COLUMN amazon_api_token TEXT;');
  if (includeAuctionSchema) {
    db.exec(auctionSchema);
  }

  const mockDb = {
    _raw: db,
    prepare(sql) {
      let boundParams = [];
      const isSelectSql = /^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(sql);
      return {
        _sql: sql,
        _isSelect: () => isSelectSql,
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
          return { success: true, results: stmt.all(...boundParams) };
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
        if (stmt._isSelect && stmt._isSelect()) {
          results.push(await stmt.all());
        } else {
          results.push(await stmt.run());
        }
      }
      return results;
    }
  };

  return mockDb;
}

function makeAuthRequest(url, token, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Cookie', `auth_token=${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return new Request(url, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });
}

describe('Import History Archive & Non-Vine Cost vs Sold Standing', () => {
  let mockDb;
  let env;
  let userToken;
  let otherUserToken;
  const userId = 'usr-history-pnl-1';
  const otherUserId = 'usr-history-pnl-2';

  beforeEach(async () => {
    mockDb = createMockD1();
    env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };

    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, 'owner@techtrek.test', 'hash1', 'Owner User', 'Active', 1);

    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(otherUserId, 'other@techtrek.test', 'hash2', 'Other User', 'Active', 1);

    userToken = await createToken({ userId, email: 'owner@techtrek.test' }, TEST_JWT_SECRET);
    otherUserToken = await createToken({ userId: otherUserId, email: 'other@techtrek.test' }, TEST_JWT_SECRET);
  });

  test('Archives uploaded PDF across chunked D1 storage, serves exact bytes, links invoice, and isolates tenants', async () => {
    // Craft a realistic binary PDF header + payload large enough to verify exact byte round-trip
    const pdfText = '%PDF-1.4\n1 0 obj\n<< /Title (Auction Invoice 9901) >>\nendobj\n%%EOF\n';
    const pdfBytes = new TextEncoder().encode(pdfText);
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

    const postReq = makeAuthRequest('https://techtrekgt.com/outpost/api/import/batch', userToken, {
      method: 'POST',
      body: JSON.stringify({
        strategy: 'append',
        file: {
          name: 'Auction-Lot-9901.pdf',
          source_type: 'pdf',
          mime_type: 'application/pdf',
          size: pdfBytes.byteLength,
          content_base64: pdfBase64,
          sha256: 'a'.repeat(64)
        },
        invoices: [
          {
            id: 'inv-hist-pdf-9901',
            invoice_ref: 'INV-PDF-9901',
            description: 'Weekly Auction Lot 9901',
            base_total: 120.00,
            discount: 0,
            shipping: 12.50,
            tax: 9.50,
            date_acquired: '2026-10-15'
          }
        ],
        items: [
          {
            id: 'item-hist-pdf-1',
            invoice_id: 'inv-hist-pdf-9901',
            invoice_ref: 'INV-PDF-9901',
            item_name: 'Vintage Signed Baseball',
            unit_price: 120.00,
            item_base_total: 120.00,
            true_total_cost: 142.00,
            status: 'Available',
            date_acquired: '2026-10-15'
          }
        ]
      })
    });

    const postRes = await batchPostHandler({ request: postReq, env });
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
    assert.ok(postData.import_batch_id, 'Expected import_batch_id in batch response');
    assert.strictEqual(postData.has_file_blob, 1);

    const batchId = postData.import_batch_id;

    // 1. Verify paginated batch list endpoint
    const listReq = makeAuthRequest('https://techtrekgt.com/outpost/api/import/batches?page=1&limit=10', userToken);
    const listRes = await batchesListHandler({ request: listReq, env });
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    assert.strictEqual(listData.pagination.total, 1);
    assert.strictEqual(listData.batches.length, 1);
    assert.strictEqual(listData.batches[0].id, batchId);
    assert.strictEqual(listData.batches[0].file_name, 'Auction-Lot-9901.pdf');
    assert.strictEqual(listData.batches[0].source_type, 'pdf');
    assert.strictEqual(listData.batches[0].invoice_refs, 'INV-PDF-9901');
    assert.strictEqual(listData.batches[0].total_cost_basis, 142);

    // 2. Verify batch detail endpoint returns batch + linked invoices + items
    const detailReq = makeAuthRequest(`https://techtrekgt.com/outpost/api/import/batches/${batchId}`, userToken);
    const detailRes = await batchDetailHandler({ request: detailReq, env, params: { id: batchId } });
    assert.strictEqual(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.strictEqual(detailData.batch.id, batchId);
    assert.strictEqual(detailData.invoices.length, 1);
    assert.strictEqual(detailData.items.length, 1);
    assert.strictEqual(detailData.items[0].is_vinescout, false);

    // 3. Verify GET /api/invoices/:id exposes attached import_batch metadata
    const invReq = makeAuthRequest('https://techtrekgt.com/outpost/api/invoices/inv-hist-pdf-9901', userToken);
    const invRes = await invoiceDetailHandler({ request: invReq, env });
    assert.strictEqual(invRes.status, 200);
    const invData = await invRes.json();
    assert.ok(invData.invoice.import_batch, 'Expected invoice.import_batch to be populated');
    assert.strictEqual(invData.invoice.import_batch.id, batchId);
    assert.strictEqual(invData.invoice.import_batch.has_file_blob, 1);

    // 4. Verify inline file stream & forced attachment download return exact bytes
    const fileInlineReq = makeAuthRequest(`https://techtrekgt.com/outpost/api/import/batches/${batchId}/file`, userToken);
    const fileInlineRes = await batchFileHandler({ request: fileInlineReq, env, params: { id: batchId } });
    assert.strictEqual(fileInlineRes.status, 200);
    assert.strictEqual(fileInlineRes.headers.get('Content-Type'), 'application/pdf');
    assert.strictEqual(fileInlineRes.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.strictEqual(fileInlineRes.headers.get('Content-Disposition'), 'inline; filename="Auction-Lot-9901.pdf"');
    const returnedBytes = new Uint8Array(await fileInlineRes.arrayBuffer());
    assert.deepStrictEqual(returnedBytes, pdfBytes);

    const fileDlReq = makeAuthRequest(`https://techtrekgt.com/outpost/api/import/batches/${batchId}/file?download=1`, userToken);
    const fileDlRes = await batchFileHandler({ request: fileDlReq, env, params: { id: batchId } });
    assert.strictEqual(fileDlRes.status, 200);
    assert.strictEqual(fileDlRes.headers.get('Content-Disposition'), 'attachment; filename="Auction-Lot-9901.pdf"');

    // 5. Cross-tenant isolation: second user must see empty list & 404 on detail/file
    const otherListRes = await batchesListHandler({
      request: makeAuthRequest('https://techtrekgt.com/outpost/api/import/batches', otherUserToken),
      env
    });
    const otherListData = await otherListRes.json();
    assert.strictEqual(otherListData.batches.length, 0);

    const otherDetailRes = await batchDetailHandler({
      request: makeAuthRequest(`https://techtrekgt.com/outpost/api/import/batches/${batchId}`, otherUserToken),
      env,
      params: { id: batchId }
    });
    assert.strictEqual(otherDetailRes.status, 404);

    const otherFileRes = await batchFileHandler({
      request: makeAuthRequest(`https://techtrekgt.com/outpost/api/import/batches/${batchId}/file`, otherUserToken),
      env,
      params: { id: batchId }
    });
    assert.strictEqual(otherFileRes.status, 404);
  });

  test('Reassembles multi-chunk binary payload (> 512KB base64) accurately', async () => {
    // 450,000 raw bytes -> 600,000 base64 chars -> 2 chunks in import_batch_file_chunks
    const largeBytes = new Uint8Array(450000);
    for (let i = 0; i < largeBytes.length; i++) {
      largeBytes[i] = (i * 31) % 256;
    }
    const largeBase64 = Buffer.from(largeBytes).toString('base64');
    assert.ok(largeBase64.length > BASE64_CHUNK_CHARS, 'Test payload must span multiple chunks');

    const postRes = await batchPostHandler({
      request: makeAuthRequest('https://techtrekgt.com/outpost/api/import/batch', userToken, {
        method: 'POST',
        body: JSON.stringify({
          strategy: 'append',
          file: {
            name: 'large-sheet.csv',
            source_type: 'csv',
            mime_type: 'text/csv',
            size: largeBytes.byteLength,
            content_base64: largeBase64
          },
          items: [
            {
              id: 'item-multi-chunk-1',
              invoice_ref: 'INV-CSV-01',
              item_name: 'Bulk Export Lot',
              unit_price: 25.00,
              true_total_cost: 25.00,
              status: 'Available'
            }
          ]
        })
      }),
      env
    });
    assert.strictEqual(postRes.status, 200);
    const { import_batch_id: batchId } = await postRes.json();

    const chunkCountRow = mockDb._raw.prepare(
      'SELECT COUNT(*) AS cnt FROM import_batch_file_chunks WHERE batch_id = ?'
    ).get(batchId);
    assert.strictEqual(Number(chunkCountRow.cnt), 2);

    const fileRes = await batchFileHandler({
      request: makeAuthRequest(`https://techtrekgt.com/outpost/api/import/batches/${batchId}/file`, userToken),
      env,
      params: { id: batchId }
    });
    assert.strictEqual(fileRes.status, 200);
    assert.strictEqual(fileRes.headers.get('Content-Type'), 'text/csv');
    assert.strictEqual(fileRes.headers.get('Content-Disposition'), 'attachment; filename="large-sheet.csv"');
    const restored = new Uint8Array(await fileRes.arrayBuffer());
    assert.strictEqual(restored.byteLength, largeBytes.byteLength);
    assert.deepStrictEqual(restored, largeBytes);
  });

  test('cleanupBatch rolls back import_batches, chunks, invoices, and items when a chunked batch insert fails', async () => {
    const origBatch = mockDb.batch.bind(mockDb);
    let batchCalls = 0;
    const failingEnv = {
      ...env,
      DB: {
        ...mockDb,
        prepare: mockDb.prepare.bind(mockDb),
        async batch(stmts) {
          batchCalls += 1;
          // Allow chunk 1 to run, fail on chunk 2 (> 50 statements), then allow cleanupBatch
          if (batchCalls === 2) {
            throw new Error('Simulated D1 failure on second batch chunk');
          }
          return origBatch(stmts);
        }
      }
    };

    const manyItems = Array.from({ length: 55 }, (_, i) => ({
      id: `item-rollback-${i}`,
      invoice_ref: 'INV-ROLLBACK',
      item_name: `Rollback Item ${i}`,
      unit_price: 10,
      true_total_cost: 10,
      status: 'Available'
    }));

    const res = await batchPostHandler({
      request: makeAuthRequest('https://techtrekgt.com/outpost/api/import/batch', userToken, {
        method: 'POST',
        body: JSON.stringify({
          strategy: 'append',
          file: {
            name: 'rollback-sheet.xlsx',
            source_type: 'xlsx',
            content_base64: Buffer.from('PK\x03\x04rollback').toString('base64')
          },
          invoices: [{ id: 'inv-rollback-1', invoice_ref: 'INV-ROLLBACK', base_total: 550 }],
          items: manyItems
        })
      }),
      env: failingEnv
    });

    assert.strictEqual(res.status, 500);
    assert.strictEqual(mockDb._raw.prepare('SELECT COUNT(*) AS c FROM import_batches').get().c, 0);
    assert.strictEqual(mockDb._raw.prepare('SELECT COUNT(*) AS c FROM import_batch_file_chunks').get().c, 0);
    assert.strictEqual(mockDb._raw.prepare('SELECT COUNT(*) AS c FROM auction_invoices WHERE id = ?').get('inv-rollback-1').c, 0);
    assert.strictEqual(mockDb._raw.prepare('SELECT COUNT(*) AS c FROM auction_items WHERE user_id = ?').get(userId).c, 0);
  });

  test('Aggregates Non-Vine invoice spend vs sold payouts excluding explicit/legacy VineScout and Returned items', async () => {
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Non-Vine paid invoice + Sold item ($100 cost, $160 gross, $135 net proceeds, $35 profit)
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total, date_acquired)
      VALUES (?, ?, ?, ?, ?)
    `).run('inv-paid-1', userId, 'INV-PAID-01', 100.00, todayStr);

    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, current_list_price, actual_sell_price, date_acquired, date_sold, is_vinescout
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('item-paid-sold', userId, 'inv-paid-1', 'Paid Sold Jersey', 90.00, 100.00, 'Sold', 'eBay', 175.00, 160.00, todayStr, todayStr, 0);

    mockDb._raw.prepare(`
      INSERT INTO auction_sales (
        id, user_id, item_id, sale_date, gross_sale_price, buyer_shipping_paid,
        platform_fees_amt, payment_processing_amt, promoted_listing_fee, actual_shipping_cost,
        net_proceeds, true_total_cost, net_profit, roi_pct, platform
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sale-paid-1', userId, 'item-paid-sold', todayStr, 160.00, 10.00, 18.00, 0, 2.00, 5.00, 135.00, 100.00, 35.00, 0.35, 'eBay');

    // 2. Non-Vine active/listed item ($60 cost)
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, current_list_price, date_acquired, is_vinescout
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('item-paid-listed', userId, 'inv-paid-1', 'Paid Listed Helmet', 55.00, 60.00, 'Listed', 'eBay', 120.00, todayStr, 0);

    // 3. Non-Vine Kept for Self item ($40 cost -> still cash out of pocket, included in total_non_vine_spend)
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, date_acquired, is_vinescout
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('item-paid-kept', userId, 'inv-paid-1', 'Paid Kept Item', 40.00, 40.00, 'Kept for Self', todayStr, 0);

    // 4. Non-Vine Returned item ($50 cost -> excluded from total_non_vine_spend, tracked in returned_non_vine_cost)
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, date_acquired, is_vinescout
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('item-paid-returned', userId, 'inv-paid-1', 'Paid Returned Item', 50.00, 50.00, 'Returned', todayStr, 0);

    // 5. Explicit VineScout item (is_vinescout = 1) even with non-zero cost and a recorded sale
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total, date_acquired)
      VALUES (?, ?, ?, ?, ?)
    `).run('AMAZON-111-222', userId, 'AMAZON-111-222', 0.00, todayStr);

    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, date_acquired, date_sold, is_vinescout, attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('item-vine-explicit', userId, 'AMAZON-111-222', 'Vine Espresso Machine', 0.00, 12.00, 'Sold', 'eBay', todayStr, todayStr, 1, JSON.stringify({ source: 'amazon_vinescout', asin: 'B0VINE0001' }));

    mockDb._raw.prepare(`
      INSERT INTO auction_sales (
        id, user_id, item_id, sale_date, gross_sale_price, buyer_shipping_paid,
        platform_fees_amt, actual_shipping_cost, net_proceeds, true_total_cost, net_profit, roi_pct, platform
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sale-vine-1', userId, 'item-vine-explicit', todayStr, 200.00, 0, 25.00, 10.00, 165.00, 12.00, 153.00, 12.75, 'eBay');

    // 6. Legacy VineScout item with is_vinescout = 0 in column, identified only via attributes JSON
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, date_acquired, is_vinescout, attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('item-vine-legacy', userId, 'AMAZON-111-222', 'Legacy Vine Toaster', 29.00, 29.00, 'Available', todayStr, 0, JSON.stringify({ source: 'amazon_vinescout', asin: 'B0VINE0002' }));

    // 7. Old paid item outside 30d window to verify range filter (e.g., 2020-01-15)
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, date_acquired, is_vinescout
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('item-paid-old', userId, 'inv-paid-1', 'Old Archive Card', 25.00, 25.00, 'Available', '2020-01-15', 0);

    // Fetch All-Time P&L report
    const reportRes = await nonVinePnlHandler({
      request: makeAuthRequest('https://techtrekgt.com/outpost/api/reports/non-vine-pnl?range=all', userToken),
      env
    });
    assert.strictEqual(reportRes.status, 200);
    const { summary } = await reportRes.json();

    // Paid non-returned spend = 100 (Sold) + 60 (Listed) + 40 (Kept) + 25 (Old) = 225.00
    assert.strictEqual(summary.non_vine_item_count, 4);
    assert.strictEqual(summary.total_non_vine_spend, 225.00);
    assert.strictEqual(summary.sold_non_vine_cogs, 100.00);
    assert.strictEqual(summary.active_non_vine_capital, 85.00);
    assert.strictEqual(summary.kept_non_vine_cost, 40.00);
    assert.strictEqual(summary.returned_non_vine_cost, 50.00);
    assert.strictEqual(summary.sold_count, 1);
    assert.strictEqual(summary.gross_sales, 160.00);
    assert.strictEqual(summary.total_fees_and_shipping, 25.00);
    assert.strictEqual(summary.net_payouts, 135.00);
    assert.strictEqual(summary.realized_sold_profit, 35.00);
    // Net standing = 135 - 225 = -90.00
    assert.strictEqual(summary.net_cash_standing, -90.00);
    // Recovery = (135 / 225) * 100 = 60.00%
    assert.strictEqual(summary.cost_recovery_pct, 60.00);
    // Excluded VineScout context
    assert.strictEqual(summary.excluded_vine_items, 2);
    assert.strictEqual(summary.excluded_vine_sold_net_payouts, 165.00);

    // Verify 30d date filter excludes the 2020-01-15 item
    const recentRes = await nonVinePnlHandler({
      request: makeAuthRequest('https://techtrekgt.com/outpost/api/reports/non-vine-pnl?range=30d', userToken),
      env
    });
    assert.strictEqual(recentRes.status, 200);
    const recentJson = await recentRes.json();
    assert.strictEqual(recentJson.summary.range, '30d');
    assert.ok(recentJson.summary.start_date);
    assert.strictEqual(recentJson.summary.total_non_vine_spend, 200.00);

    // Verify dashboard embeds identical all-time non_vine_pnl summary
    const dashRes = await dashboardGetHandler({
      request: makeAuthRequest('https://techtrekgt.com/outpost/api/dashboard', userToken),
      env
    });
    assert.strictEqual(dashRes.status, 200);
    const dashData = await dashRes.json();
    assert.deepStrictEqual(dashData.non_vine_pnl, summary);
  });

  test('PUT /api/items/:id preserves is_vinescout = 0 on paid items that have an ASIN', async () => {
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES (?, ?, ?, ?)
    `).run('inv-asin-test', userId, 'INV-ASIN-01', 49.99);

    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, asin, is_vinescout, attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'item-paid-asin-1',
      userId,
      'inv-asin-test',
      'Paid Retail Amazon Purchase',
      49.99,
      49.99,
      'Available',
      'B0PAID1234',
      0,
      JSON.stringify({ source: 'amazon_url', asin: 'B0PAID1234' })
    );

    const putReq = makeAuthRequest('https://techtrekgt.com/outpost/api/items/item-paid-asin-1', userToken, {
      method: 'PUT',
      body: JSON.stringify({
        item_name: 'Paid Retail Amazon Purchase - Updated',
        asin: 'B0PAID1234'
      })
    });
    const putRes = await itemPutHandler({ request: putReq, env });
    assert.strictEqual(putRes.status, 200);

    const updatedPaidRow = mockDb._raw.prepare('SELECT is_vinescout, asin FROM auction_items WHERE id = ?').get('item-paid-asin-1');
    assert.strictEqual(updatedPaidRow.asin, 'B0PAID1234');
    assert.strictEqual(Number(updatedPaidRow.is_vinescout), 0);

    // Contrast: an explicit VineScout item remains flagged as is_vinescout = 1
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, asin, is_vinescout, attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'item-vine-asin-1',
      userId,
      'inv-asin-test',
      'VineScout Item',
      0,
      0,
      'Available',
      'B0VINE9999',
      1,
      JSON.stringify({ source: 'amazon_vinescout', asin: 'B0VINE9999', is_vinescout: true })
    );

    const putVineRes = await itemPutHandler({
      request: makeAuthRequest('https://techtrekgt.com/outpost/api/items/item-vine-asin-1', userToken, {
        method: 'PUT',
        body: JSON.stringify({ item_name: 'VineScout Item Updated', asin: 'B0VINE9999' })
      }),
      env
    });
    assert.strictEqual(putVineRes.status, 200);
    const updatedVineRow = mockDb._raw.prepare('SELECT is_vinescout FROM auction_items WHERE id = ?').get('item-vine-asin-1');
    assert.strictEqual(Number(updatedVineRow.is_vinescout), 1);
  });

  test('GET /api/import/batches lazily initializes missing batch tables when D1 hits no such table', async () => {
    const bareDb = createMockD1({ includeAuctionSchema: false });
    bareDb._raw.exec(`
      CREATE TABLE IF NOT EXISTS auction_invoices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        invoice_ref TEXT NOT NULL,
        import_batch_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    bareDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, 'owner@techtrek.test', 'hash1', 'Owner User', 'Active', 1);

    const bareEnv = { DB: bareDb, JWT_SECRET: TEST_JWT_SECRET };
    const res = await batchesListHandler({
      request: makeAuthRequest('https://techtrekgt.com/outpost/api/import/batches', userToken),
      env: bareEnv
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.deepStrictEqual(data.batches, []);
    assert.strictEqual(data.pagination.total, 0);
  });
});
