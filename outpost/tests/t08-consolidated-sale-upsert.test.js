/**
 * T-08: All four sale entry points write through ONE implementation.
 *
 * Each endpoint used to carry its own copy of the 18-column upsert (markItemSold,
 * POST /api/sales, PUT /api/sales/:id, POST /api/ebay/match-sold-vinescout),
 * each with its own conflict fallback. That duplication is what let the roi_pct
 * units diverge (T-09) and let one copy bind an unvalidated value.
 *
 * These tests record the SAME sale through all four entry points, in four
 * separate databases, and assert the resulting rows are identical. They also pin
 * the two behaviours consolidation must not break: COALESCE preservation, and
 * the post-insert re-read that resolves the persisted sale id after a conflict.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeSaleInput, upsertSale } from '../functions/utils/sales.js';
import { markItemSold } from '../functions/utils/auction.js';
import { onRequestPost as salesCreate } from '../functions/api/sales/index.js';
import { onRequestPut as salesUpdate } from '../functions/api/sales/[id].js';
import { onRequestPut as itemsUpdate } from '../functions/api/items/[id].js';
import { onRequestPost as matchSoldVinescout } from '../functions/api/ebay/match-sold-vinescout.js';
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
        bind(...params) { boundParams = params; return this; },
        async first() { return db.prepare(sql).get(...boundParams) || null; },
        async all() { return { results: db.prepare(sql).all(...boundParams) }; },
        async run() {
          const info = db.prepare(sql).run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(stmts) { return Promise.all(stmts.map(s => s.run())); }
  };
}

// Every financial field the four entry points must agree on.
const CANONICAL_FIELDS = [
  'sale_date', 'platform', 'gross_sale_price', 'buyer_shipping_paid',
  'actual_shipping_cost', 'platform_fee_pct', 'platform_flat_fee',
  'platform_fees_amt', 'payment_processing_amt', 'promoted_listing_fee',
  'net_proceeds', 'true_total_cost', 'net_profit', 'roi_pct', 'days_to_sell'
];

function saleRowOf(db, itemId, owner) {
  return db.prepare(
    'SELECT * FROM auction_sales WHERE item_id = ? AND user_id = ?'
  ).get(itemId, owner);
}
describe('T-08: One auction_sales write implementation across all four entry points', () => {
  const userId = 'usr-t08';
  const invoiceId = 'inv-t08';
  let authToken;

  beforeEach(async () => {
    authToken = await createToken({ userId, email: 't08@techtrek.test' }, TEST_JWT_SECRET);
  });

  // Identical starting economics for every entry point.
  function freshDb() {
    const mockDb = createMockD1();
    mockDb._raw.prepare("INSERT INTO users (id, email, password_hash, name, status, email_verified) VALUES (?, ?, ?, ?, ?, ?)")
      .run(userId, 't08@techtrek.test', 'hash', 'Tester', 'Active', 1);
    mockDb._raw.prepare('INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)')
      .run(invoiceId, userId, 'INV-T08');

    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, platform,
        platform_fee_pct, platform_flat_fee, est_shipping_cost,
        current_list_price, unit_price, true_total_cost,
        status, date_acquired, date_listed, floor_price, buy_it_now_price, buyer_shipping_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'item-t08', userId, invoiceId, 'Prizm Rookie',
      'eBay', 0.136, 0.40, 5.00, 200.00, 60.00, 60.00,
      'Listed', '2026-09-01', '2026-09-10',
      // null, null, 6.00 : floor/buy_it_now unset, buyer charged $6 shipping.
      null, null, 6.00
    );

    return { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, EBAY_SANDBOX: 'false' };
  }

  const MONEY = {
    gross_sale_price: 200,
    buyer_shipping_paid: 6,
    actual_shipping_cost: 5,
    platform_fee_pct: 0.136,
    platform_flat_fee: 0.40,
    sale_date: '2026-09-25'
  };

  // gross 200 + buyer ship 6 - actual ship 5 - fees(200*0.136 + 0.40 = 27.60)
  //   = net_proceeds 173.40 ; net_profit = 173.40 - 60 = 113.40 ; roi = 1.89
  const EXPECTED = {
    sale_date: '2026-09-25',
    platform: 'eBay',
    gross_sale_price: 200,
    buyer_shipping_paid: 6,
    actual_shipping_cost: 5,
    platform_fee_pct: 0.136,
    platform_flat_fee: 0.4,
    payment_processing_amt: 0,
    promoted_listing_fee: 0,
    platform_fees_amt: 27.6,
    net_proceeds: 173.4,
    true_total_cost: 60,
    net_profit: 113.4,
    roi_pct: 1.89,
    days_to_sell: 15
  };

  test('normalizeSaleInput accepts every documented alias', () => {
    const item = {
      id: 'item-alias', true_total_cost: 40, est_shipping_cost: 5,
      platform: 'eBay', date_listed: '2026-09-01'
    };

    // One assertion per alias family listed in the normalizeSaleInput docblock.
    // T-08 item 3 requires that none of these be silently dropped.
    const cases = [
      [{ saleDate: '2026-09-20' }, r => r.sale_date === '2026-09-20'],
      [{ date_sold: '2026-09-21' }, r => r.sale_date === '2026-09-21'],
      [{ buyerHandle: 'bh' }, r => r.buyer_handle === 'bh'],
      [{ buyer: 'bh2' }, r => r.buyer_handle === 'bh2'],
      [{ ebayOrderId: 'E-1' }, r => r.ebay_order_id === 'E-1'],
      [{ order_id: 'E-2' }, r => r.ebay_order_id === 'E-2'],
      [{ orderId: 'E-3' }, r => r.ebay_order_id === 'E-3'],
      [{ grossSalePrice: 1 }, r => r.gross_sale_price === 1],
      [{ sale_price: 2 }, r => r.gross_sale_price === 2],
      [{ salePrice: 3 }, r => r.gross_sale_price === 3],
      [{ actualSellPrice: 4 }, r => r.gross_sale_price === 4],
      [{ buyerShippingPaid: 5 }, r => r.buyer_shipping_paid === 5],
      [{ deliveryCost: 6 }, r => r.buyer_shipping_paid === 6],
      [{ actualShippingCost: 7 }, r => r.actual_shipping_cost === 7],
      [{ shippingLabelCost: 8 }, r => r.actual_shipping_cost === 8],
      [{ paymentProcessingFee: 9 }, r => r.payment_processing_amt === 9],
      [{ promotedListingFee: 10 }, r => r.promoted_listing_fee === 10],
      [{ trueTotalCost: 11 }, r => r.true_total_cost === 11],
      [{ days_on_market: 12 }, r => r.days_to_sell === 12],
      [{ days_to_sell: 13 }, r => r.days_to_sell === 13],
      [{ net_earnings: 14 }, r => r.net_proceeds === 14],
      [{ netProceeds: 15 }, r => r.net_proceeds === 15],
      [{ platformFeesAmt: 16 }, r => r.platform_fees_amt === 16]
    ];

    for (const [input, assertion] of cases) {
      const record = normalizeSaleInput(input, item);
      assert.ok(
        assertion(record),
        `alias ${JSON.stringify(input)} did not map: ${JSON.stringify(record)}`
      );
    }

    // fee_reconciled_at alias: boolean true stamps, absent leaves null.
    assert.ok(normalizeSaleInput({ fee_reconciled: true }, item).fee_reconciled_at);
    assert.equal(normalizeSaleInput({}, item).fee_reconciled_at, null);
  });

  test('normalizeSaleInput refuses to accept roi_pct or net_profit from the caller', () => {
    const item = { id: 'item-roi', true_total_cost: 40 };
    const record = normalizeSaleInput({
      gross_sale_price: 100, roi_pct: 999, net_profit: 999
    }, item);
    // 100 - fees(14.00) - cost(40) = 46.00 over 40 => 1.15
    assert.equal(record.net_profit, 46);
    assert.equal(record.roi_pct, 46 / 40);
    assert.notEqual(record.roi_pct, 999);
  });

  test('upsertSale requires an explicit userId and writes nothing without one', async () => {
    const localEnv = freshDb();
    const item = localEnv.DB._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get('item-t08');
    const record = normalizeSaleInput({ gross_sale_price: 100 }, item);

    await assert.rejects(() => upsertSale(localEnv, undefined, record), /explicit userId/);
    await assert.rejects(() => upsertSale(localEnv, '', record), /explicit userId/);

    assert.equal(localEnv.DB._raw.prepare('SELECT COUNT(*) c FROM auction_sales').get().c, 0);
  });

  test('upsertSale never crosses tenants: a second user cannot overwrite a sale', async () => {
    const localEnv = freshDb();
    const item = localEnv.DB._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get('item-t08');

    await upsertSale(localEnv, userId, normalizeSaleInput({ gross_sale_price: 200 }, item));

    // Same item_id, different owner. The pre-read finds nothing (scoped by
    // userId), the INSERT loses to the unique index, and the catch-branch
    // UPDATE is ALSO scoped by userId - so the original row survives untouched.
    await upsertSale(localEnv, 'usr-intruder', normalizeSaleInput({ gross_sale_price: 999 }, item));

    const owned = localEnv.DB._raw.prepare(
      'SELECT user_id, gross_sale_price FROM auction_sales WHERE user_id = ?'
    ).get(userId);
    assert.ok(owned, 'the original sale must survive');
    assert.strictEqual(owned.gross_sale_price, 200, 'a different user must not rewrite the row');
  });
  test('The same sale through all four entry points produces four identical rows', async () => {
    // --- Entry point 1: PUT /api/items/:id marking Sold (via markItemSold) ---
    const env1 = freshDb();
    const res1 = await itemsUpdate({
      request: new Request('http://localhost/api/items/item-t08', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${authToken}` },
        body: JSON.stringify({
          status: 'Sold',
          date_sold: MONEY.sale_date,
          actual_sell_price: MONEY.gross_sale_price
        })
      }),
      params: { id: 'item-t08' },
      env: env1
    });
    assert.strictEqual(res1.status, 200);
    const row1 = saleRowOf(env1.DB._raw, 'item-t08', userId);

    // --- Entry point 2: POST /api/sales ---
    const env2 = freshDb();
    const res2 = await salesCreate({
      request: new Request('http://localhost/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${authToken}` },
        body: JSON.stringify({ item_id: 'item-t08', platform: 'eBay', ...MONEY })
      }),
      env: env2
    });
    assert.ok([200, 201].includes(res2.status));
    const row2 = saleRowOf(env2.DB._raw, 'item-t08', userId);

    // --- Entry point 3: POST /api/ebay/match-sold-vinescout ---
    const env3 = freshDb();
    const res3 = await matchSoldVinescout({
      request: new Request('http://localhost/api/ebay/match-sold-vinescout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${authToken}` },
        body: JSON.stringify({
          confirm: true, item_id: 'item-t08', ebay_order_id: 'T08-ORDER-1',
          sale_date: MONEY.sale_date, sale_price: MONEY.gross_sale_price,
          buyer_shipping_paid: MONEY.buyer_shipping_paid,
          actual_shipping_cost: MONEY.actual_shipping_cost
        })
      }),
      env: env3
    });
    assert.strictEqual(res3.status, 200);
    const row3 = saleRowOf(env3.DB._raw, 'item-t08', userId);

    // --- Entry point 4: reconcileAndSaveEbaySale (eBay order ingestion) ---
    const env4 = freshDb();
    const item4 = env4.DB._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get('item-t08');
    const result4 = await reconcileAndSaveEbaySale(env4, userId, item4, {
      orderId: 'T08-ORDER-1',
      saleDate: MONEY.sale_date,
      lineItemCost: MONEY.gross_sale_price,
      deliveryCost: MONEY.buyer_shipping_paid,
      actualShippingCost: MONEY.actual_shipping_cost
    }, null);
    assert.ok(result4?.sale?.id);
    const row4 = saleRowOf(env4.DB._raw, 'item-t08', userId);

    const rows = [['items PUT', row1], ['sales POST', row2], ['match-sold', row3], ['reconcile', row4]];
    for (const [label, row] of rows) {
      assert.ok(row, `${label} produced no auction_sales row`);
      for (const field of CANONICAL_FIELDS) {
        // sale_date and platform are TEXT; the rest are numerics.
        const ok = typeof EXPECTED[field] === 'string'
          ? row[field] === EXPECTED[field]
          : Math.abs(Number(row[field]) - EXPECTED[field]) < 0.005;
        assert.ok(ok, `${label}.${field} = ${row[field]}, expected ${EXPECTED[field]}`);
      }
    }

    // And each produced exactly ONE row, never two.
    const envs = [['items PUT', env1], ['sales POST', env2], ['match-sold', env3], ['reconcile', env4]];
    for (const [label, localEnv] of envs) {
      assert.strictEqual(
        localEnv.DB._raw.prepare('SELECT COUNT(*) c FROM auction_sales WHERE item_id = ?').get('item-t08').c,
        1,
        `${label} produced more than one sale row`
      );
    }
  });
  test('PUT /api/sales/:id routes through the shared upsert and keeps the sale id', async () => {
    const localEnv = freshDb();
    await salesCreate({
      request: new Request('http://localhost/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${authToken}` },
        body: JSON.stringify({
          item_id: 'item-t08', platform: 'eBay',
          sale_date: MONEY.sale_date, gross_sale_price: 200,
          buyer_shipping_paid: 6, actual_shipping_cost: 5,
          platform_fee_pct: 0.136, platform_flat_fee: 0.40
        })
      }),
      env: localEnv
    });

    const created = saleRowOf(localEnv.DB._raw, 'item-t08', userId);
    assert.ok(created.id);

    const res = await salesUpdate({
      request: new Request(`http://localhost/api/sales/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${authToken}` },
        body: JSON.stringify({ gross_sale_price: 250 })
      }),
      params: { id: created.id },
      env: localEnv
    });
    assert.strictEqual(res.status, 200);

    const updated = saleRowOf(localEnv.DB._raw, 'item-t08', userId);
    assert.strictEqual(updated.id, created.id, 'PUT must update in place, not re-key the sale');
    assert.strictEqual(updated.gross_sale_price, 250);
    // roi recomputed from the new gross, still a fraction.
    const expectedRoi = ((250 + 6 - 5 - (250 * 0.136 + 0.40) - 60) / 60);
    assert.ok(Math.abs(updated.roi_pct - expectedRoi) < 0.005);
  });

  test('COALESCE semantics retain buyer_handle, ebay_order_id and fee_reconciled_at on null', async () => {
    const localEnv = freshDb();
    const db = localEnv.DB._raw;
    const item = db.prepare('SELECT * FROM auction_items WHERE id = ?').get('item-t08');

    await markItemSold(localEnv, userId, item, {
      sale_date: '2026-09-25', gross_sale_price: 200,
      buyer_handle: 'original-buyer', ebay_order_id: 'ORIGINAL-ORDER',
      fee_reconciled_at: '2026-09-25 10:00:00'
    });

    // Second write supplies null for all three.
    await markItemSold(localEnv, userId, item, {
      sale_date: '2026-09-26', gross_sale_price: 210,
      buyer_handle: null, ebay_order_id: null, fee_reconciled_at: null
    });

    const row = saleRowOf(db, 'item-t08', userId);
    assert.strictEqual(row.buyer_handle, 'original-buyer');
    assert.strictEqual(row.ebay_order_id, 'ORIGINAL-ORDER');
    assert.strictEqual(row.fee_reconciled_at, '2026-09-25 10:00:00');
    // Non-COALESCE fields still update.
    assert.strictEqual(row.sale_date, '2026-09-26');
    assert.strictEqual(row.gross_sale_price, 210);
  });

  test('Post-insert re-read resolves the persisted sale id after a conflict', async () => {
    const localEnv = freshDb();
    const db = localEnv.DB._raw;
    const item = db.prepare('SELECT * FROM auction_items WHERE id = ?').get('item-t08');

    // A sale already exists under a DIFFERENT id than upsertSale would mint.
    db.prepare(`
      INSERT INTO auction_sales (id, user_id, item_id, sale_date, platform, gross_sale_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sale-preexisting', userId, 'item-t08', '2026-09-20', 'eBay', 100);

    const saved = await markItemSold(localEnv, userId, item, {
      sale_date: '2026-09-25', gross_sale_price: 200
    });
    assert.strictEqual(saved.id, 'sale-preexisting');
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) c FROM auction_sales WHERE item_id = ?').get('item-t08').c, 1
    );
  });
  test('The catch-branch fallback is load-bearing with NO unique index on item_id', async () => {
    // T-08 item 8: the live D1 database inspected for this batch carries only a
    // NON-unique index on auction_sales.item_id. There the ON CONFLICT target
    // cannot resolve at prepare time, so the pre-read plus the catch-branch
    // UPDATE are the only thing preventing a duplicate sale row.
    const localEnv = freshDb();
    const db = localEnv.DB._raw;
    const item = db.prepare('SELECT * FROM auction_items WHERE id = ?').get('item-t08');

    db.exec('DROP INDEX IF EXISTS idx_auction_sales_item');
    db.exec('DROP INDEX IF EXISTS idx_auction_sales_item_unique');
    const remaining = db.prepare("PRAGMA index_list('auction_sales')").all()
      .filter(i => i.name.includes('item') && i.unique === 1);
    assert.strictEqual(remaining.length, 0, 'setup: unique index on item_id should be gone');

    await markItemSold(localEnv, userId, item, { sale_date: '2026-09-25', gross_sale_price: 200 });
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) c FROM auction_sales WHERE item_id = ?').get('item-t08').c, 1,
      'first write must land exactly one row without a unique index'
    );

    await markItemSold(localEnv, userId, item, { sale_date: '2026-09-26', gross_sale_price: 220 });
    const rows = db.prepare('SELECT * FROM auction_sales WHERE item_id = ?').all('item-t08');
    assert.strictEqual(rows.length, 1, 'second write must not create a duplicate');
    assert.strictEqual(rows[0].sale_date, '2026-09-26');
  });

  test('Reverting an item from Sold still deletes the sale and restores status', async () => {
    const localEnv = freshDb();
    const db = localEnv.DB._raw;
    db.prepare("UPDATE auction_items SET status = 'Listed', date_listed = '2026-09-10' WHERE id = ?")
      .run('item-t08');

    await itemsUpdate({
      request: new Request('http://localhost/api/items/item-t08', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${authToken}` },
        body: JSON.stringify({ status: 'Sold', date_sold: '2026-09-25', actual_sell_price: 200 })
      }),
      params: { id: 'item-t08' },
      env: localEnv
    });
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) c FROM auction_sales WHERE item_id = ?').get('item-t08').c, 1
    );

    const res = await itemsUpdate({
      request: new Request('http://localhost/api/items/item-t08', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${authToken}` },
        body: JSON.stringify({ status: 'Available' })
      }),
      params: { id: 'item-t08' },
      env: localEnv
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) c FROM auction_sales WHERE item_id = ?').get('item-t08').c, 0
    );

    const restored = db.prepare('SELECT status, date_sold FROM auction_items WHERE id = ?').get('item-t08');
    assert.strictEqual(restored.status, 'Available');
    assert.strictEqual(restored.date_sold, null);
  });

  test('ebay_fee_reconciliations still resolves against sale_id after consolidation', async () => {
    const localEnv = freshDb();
    const db = localEnv.DB._raw;
    const item = db.prepare('SELECT * FROM auction_items WHERE id = ?').get('item-t08');

    const saved = await markItemSold(localEnv, userId, item, {
      sale_date: '2026-09-25', gross_sale_price: 200, ebay_order_id: 'T08-FK-ORDER'
    });

    db.prepare(`
      INSERT INTO ebay_fee_reconciliations (
        id, sale_id, user_id, ebay_order_id, total_ebay_fees, estimated_fees, fee_delta, reconciled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run('recon-t08', saved.id, userId, 'T08-FK-ORDER', 27.6, 28.0, -0.4);

    const joined = db.prepare(`
      SELECT r.id, r.sale_id, r.total_ebay_fees, s.ebay_order_id
      FROM ebay_fee_reconciliations r
      JOIN auction_sales s ON s.id = r.sale_id
      WHERE r.sale_id = ?
    `).get(saved.id);

    assert.ok(joined, 'reconciliation row must join back to its sale');
    assert.strictEqual(joined.sale_id, saved.id);
    assert.strictEqual(joined.ebay_order_id, 'T08-FK-ORDER');
  });
});