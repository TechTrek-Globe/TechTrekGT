/**
 * T-12 acceptance tests: a reconciliation flag must describe a reconciliation
 * that actually happened, and the schema must enforce one sale row per item.
 *
 * ORIGIN: production row sale-5894c87c (item-8b57dd04) carried
 * fee_reconciled_at = 2026-09-28 12:13:09 with a NULL ebay_order_id and NO
 * matching ebay_fee_reconciliations row, while the other 8 stamped rows each
 * paired 1:1 with a reconciliation record and a real order id. The write came
 * from tokenHelper.js, whose fee fallback branch computes fees from
 * platform_fee_pct and never contacts the Finances API, yet passed
 * `fee_reconciled: true` unconditionally. That boolean is converted into a
 * timestamp by normalizeSaleInput, so the row claimed a verification that never
 * occurred. The same guard now covers the ebay_fee_reconciliations insert, which
 * previously required only an order id and would therefore have stored
 * estimate-derived fees in a table that otherwise holds eBay-verified amounts.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeSaleInput } from '../functions/utils/sales.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPOST = path.join(__dirname, '..');
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(OUTPOST, 'auction-schema.sql'), 'utf8');

function source(relPath) {
  return fs.readFileSync(path.join(OUTPOST, relPath), 'utf8');
}

function walkSourceFiles(root) {
  return fs.readdirSync(path.join(OUTPOST, root), { recursive: true })
    .filter((rel) => /\.(js|jsx)$/.test(rel))
    .map((rel) => path.join(root, rel));
}

describe('T-12 item 1: an unmet reconciliation gate must not stamp a timestamp', () => {
  const item = {
    id: 'item-t12',
    date_listed: '2026-08-01',
    platform_fee_pct: 0.135,
    platform_flat_fee: 0.4,
    true_total_cost: 42.99
  };

  test('fee_reconciled: false persists NULL, because false means not reconciled', () => {
    const record = normalizeSaleInput({
      sale_date: '2026-09-28',
      gross_sale_price: 52.99,
      fee_reconciled: false
    }, item);

    // Number(false) === 0 and Boolean('false') is truthy, so a sloppy gate writes
    // a string here. The gate must produce a genuine NULL.
    assert.strictEqual(record.fee_reconciled_at, null);
  });

  test('fee_reconciled: true still stamps, so the true path is unchanged', () => {
    const record = normalizeSaleInput({
      sale_date: '2026-09-28',
      gross_sale_price: 52.99,
      fee_reconciled: true
    }, item);

    assert.match(record.fee_reconciled_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test('an explicit timestamp from the real reconcile path is preserved', () => {
    const record = normalizeSaleInput({
      sale_date: '2026-09-28',
      gross_sale_price: 52.99,
      fee_reconciled_at: '2026-09-28 12:13:09'
    }, item);

    assert.strictEqual(record.fee_reconciled_at, '2026-09-28 12:13:09');
  });
});

describe('T-12 item 2: no writer may advertise a reconciliation it did not perform', () => {
  test('the unconditional fee_reconciled: true is gone from the whole repo', () => {
    const offenders = [];

    for (const root of ['functions', 'src']) {
      for (const rel of walkSourceFiles(root)) {
        const text = fs.readFileSync(path.join(OUTPOST, rel), 'utf8');
        text.split(/\r?\n/).forEach((line, i) => {
          if (/fee_reconciled:\s*true/.test(line)) {
            offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }

    assert.deepStrictEqual(offenders, [], `unconditional reconciled flags: ${offenders.join(' | ')}`);
  });

  test('the tokenHelper flag is gated on Finances API availability', () => {
    const text = source('functions/api/ebay/tokenHelper.js');

    assert.match(text, /fee_reconciled:\s*Boolean\(financeData\?\.finances_available\)/);
  });

  test('the ebay_fee_reconciliations insert needs Finances API data, not just an order id', () => {
    const text = source('functions/api/ebay/tokenHelper.js');

    assert.match(text, /if \(ebayOrderId && financeData\?\.finances_available\) \{/);

    // Both fee branches must remain present: the guard is only meaningful because
    // the else branch derives fees locally instead of fetching them.
    assert.match(text, /if \(financeData\?\.finances_available\) \{/);
  });

  test('the estimate branch cannot reach the insert, and both writers share one predicate', () => {
    const tokenHelper = source('functions/api/ebay/tokenHelper.js');
    const reconcile = source('functions/api/ebay/reconcile.js');

    // reconcile.js is the definition of a real reconciliation and it refuses to
    // proceed without the same flag. Drift here is what let the two writers
    // disagree about what "reconciled" means.
    assert.match(reconcile, /if \(!finData \|\| !finData\.finances_available\) \{/);

    const first = tokenHelper.indexOf('financeData?.finances_available');
    const last = tokenHelper.lastIndexOf('financeData?.finances_available');
    assert.ok(
      first !== last,
      'tokenHelper must consult finances_available in both the fee branch and the flag'
    );
  });
});

describe('T-12 item 3: exactly one sale row per item_id', () => {
  function freshDb() {
    const db = new DatabaseSync(':memory:');
    db.exec(financeSchema);
    db.exec(auctionSchema);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('usr-t12', 't12@techtrek.test', 'h', 'T', 'Active', 1);
    db.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)
    `).run('inv-t12', 'usr-t12', 'INV-T12');
    db.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, status, unit_price,
                                 floor_price, buy_it_now_price, buyer_shipping_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('item-t12', 'usr-t12', 'inv-t12', 'Card', 'Sold', 42.99, null, null, null);
    return db;
  }

  const insertSale = (db, id) => db.prepare(`
    INSERT INTO auction_sales (id, item_id, user_id, sale_date, platform,
                               gross_sale_price, net_profit, true_total_cost, roi_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'item-t12', 'usr-t12', '2026-09-28', 'eBay', 52.99, 2.45, 0, 0);

  test('a second sale row for the same item is rejected by the unique index', () => {
    const db = freshDb();
    insertSale(db, 'sale-t12-a');

    assert.throws(
      () => insertSale(db, 'sale-t12-b'),
      /UNIQUE constraint failed: auction_sales\.item_id/
    );

    assert.strictEqual(
      db.prepare('SELECT COUNT(*) AS n FROM auction_sales WHERE item_id = ?').get('item-t12').n,
      1
    );
  });

  test('the schema declares the unique index under the NEW name', () => {
    // Regression guard for the production defect: the remote table already held a
    // NON-unique index called idx_auction_sales_item. CREATE UNIQUE INDEX IF NOT
    // EXISTS reusing that name is a silent no-op, so the constraint has to be
    // declared under idx_auction_sales_item_unique.
    assert.match(
      auctionSchema,
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_sales_item_unique ON auction_sales\(item_id\)/
    );
  });

  test('ON CONFLICT(item_id) resolves against the unique index', () => {
    const db = freshDb();

    // The T-08 upsert in sales.js relies on this conflict target resolving. While
    // the remote index was non-unique it could not, which kept the catch-branch
    // UPDATE fallback load-bearing in production.
    const sql = `
      INSERT INTO auction_sales (id, item_id, user_id, sale_date, platform,
                                 gross_sale_price, net_profit, true_total_cost, roi_pct)
      VALUES ('sale-t12-c', 'item-t12', 'usr-t12', '2026-09-28', 'eBay', 52.99, 2.45, 0, 0)
      ON CONFLICT(item_id) DO UPDATE SET gross_sale_price = excluded.gross_sale_price
    `;

    db.prepare(sql).run();
    db.prepare(sql).run();
    db.prepare(sql).run();

    const rows = db.prepare('SELECT id, gross_sale_price FROM auction_sales').all();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].gross_sale_price, 52.99);
  });
});
