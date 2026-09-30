/**
 * T-09: roi_pct is a FRACTION everywhere, and the migration that repairs
 * historical rows is provably safe and idempotent.
 *
 * THE DIVERGENCE
 * --------------
 * POST /api/ebay/match-sold-vinescout stored roi_pct as
 * netProfit / landedCost * 100, while every other writer stored
 * net_profit / true_total_cost. Identical economics, two different numbers in
 * one column, so any AVG/SUM over roi_pct was meaningless and the UI rendered
 * "3500%" beside a correct portfolio figure.
 *
 * WHY THE FIX IS A RECOMPUTE AND NOT A THRESHOLD
 * ----------------------------------------------
 * The obvious repair, "divide anything above 1.5 by 100", corrupts real data: a
 * $10 flip sold for $45 is a legitimate roi_pct of 3.5, and VineScout items with
 * near-zero ETV return multiples of cost routinely. This file pins that case in
 * both directions - the fraction is preserved, and the percentage-convention
 * twin is corrected - so a threshold-based "fix" cannot pass.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeSaleMetrics } from '../functions/utils/auction.js';
import { fmtPct } from '../src/utils/formulaPreview.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');
const migrationSql = fs.readFileSync(
  path.join(__dirname, '../migrations/0009_roi_pct_fraction.sql'), 'utf8'
);

/**
 * Splits the migration into individual statements so `changes` can be read per
 * statement. Comment lines are dropped first; the migration contains no string
 * literals, so a plain ';' split is unambiguous.
 */
function migrationStatements(sql) {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Applies the migration and returns total rows touched by the UPDATEs. */
function applyMigration(db) {
  let changed = 0;
  for (const stmt of migrationStatements(migrationSql)) {
    const info = db.prepare(stmt).run();
    // Only UPDATEs are counted. sqlite3_changes() is updated by INSERT/UPDATE/
    // DELETE and nothing else, so the DDL statement reports the PREVIOUS
    // statement's count rather than 0. Counting it made a no-op second run look
    // like it had "touched 2 rows".
    if (/^update\b/i.test(stmt)) changed += info.changes;
  }
  return changed;
}

/**
 * A pre-T-09 auction_sales table. Intentionally built WITHOUT the T-09 CHECK
 * constraint, because a legacy database that predates this batch has no such
 * constraint - which is precisely why drifted rows could exist for the
 * migration to find. Running the migration against the current schema instead
 * would fail at seed time, before the migration is ever reached.
 */
function legacyDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE auction_sales (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL DEFAULT 'legacy-user',
      item_id        TEXT,
      sale_date      TEXT,
      platform       TEXT,
      gross_sale_price REAL NOT NULL DEFAULT 0.0,
      net_proceeds   REAL NOT NULL DEFAULT 0.0,
      true_total_cost REAL,
      net_profit     REAL NOT NULL DEFAULT 0.0,
      roi_pct        REAL NOT NULL DEFAULT 0.0,
      days_to_sell   INTEGER
    )
  `);
  return db;
}

describe('T-09: roi_pct unit is a fraction', () => {
  test('computeSaleMetrics returns net_profit / cost, never the percentage', () => {
    // $100 sale, no fees, $40 cost => $60 profit => 1.5, i.e. 150%.
    const metrics = computeSaleMetrics({ gross_sale_price: 100, true_total_cost: 40 });
    assert.strictEqual(metrics.net_profit, 60);
    assert.strictEqual(metrics.roi_pct, 1.5);
    assert.notStrictEqual(metrics.roi_pct, 150, 'roi_pct must not be pre-multiplied by 100');
  });

  test('a fraction above 1 is a legitimate multi-bagger, not a unit error', () => {
    // The exact case a "> 1.5 means percent" heuristic would destroy: a $10
    // Vine / low-ETV item sold for $45 returns 3.5x its cost basis.
    const metrics = computeSaleMetrics({ gross_sale_price: 45, true_total_cost: 10 });
    assert.strictEqual(metrics.net_profit, 35);
    assert.strictEqual(metrics.roi_pct, 3.5);
    assert.ok(metrics.roi_pct > 1, 'a >100% return must remain > 1');
  });

  test('roi_pct below -1 is legitimate for a loss sale with negative net proceeds', () => {
    // T-06's pinned case: $6.00 sale, $6.50 shipping, 13.6% + $0.40 fees, $5.00 cost.
    //   fees = round2(6.00 * 0.136 + 0.40) = 1.22
    //   net_proceeds = 6.00 - 6.50 - 1.22 = -1.72
    //   net_profit = -1.72 - 5.00 = -6.72 ; roi_pct = -6.72 / 5.00 = -1.344
    const metrics = computeSaleMetrics({
      gross_sale_price: 6.00,
      buyer_shipping_paid: 0,
      actual_shipping_cost: 6.50,
      platform_fee_pct: 0.136,
      platform_flat_fee: 0.40,
      true_total_cost: 5.00
    });
    assert.strictEqual(metrics.net_proceeds, -1.72);
    assert.strictEqual(metrics.net_profit, -6.72);
    // -6.72 / 5.00 is binary -1.3439999999999999, hence the tolerance.
    assert.ok(Math.abs(metrics.roi_pct - (-1.344)) < 1e-9, `roi_pct = ${metrics.roi_pct}`);
    assert.ok(
      metrics.roi_pct < -1,
      `expected a fractional ROI below -1, got ${metrics.roi_pct}`
    );

    // And a severe loss goes far below -1: no lower bound is safe to enforce.
    const severe = computeSaleMetrics({
      gross_sale_price: 5, actual_shipping_cost: 120, true_total_cost: 10
    });
    assert.strictEqual(severe.roi_pct, -12.5);
  });

  test('zero cost basis yields roi_pct 0, never Infinity or NaN', () => {
    for (const cost of [0, null, undefined]) {
      const metrics = computeSaleMetrics({ gross_sale_price: 45, true_total_cost: cost });
      assert.strictEqual(metrics.roi_pct, 0, `cost=${cost} should give roi_pct 0`);
      assert.ok(Number.isFinite(metrics.roi_pct));
    }
  });

  test('fmtPct is the single place the x100 happens', () => {
    assert.strictEqual(fmtPct(0.35), '35%');
    assert.strictEqual(fmtPct(1.5), '150%');
    assert.strictEqual(fmtPct(3.5), '350%');
    assert.strictEqual(fmtPct(-1.344), '-134.4%');
    // The historical bug in one line: storing 35 rendered as 3500%.
    assert.strictEqual(fmtPct(35), '3500%');
  });
});

describe('T-09: the auction_sales.roi_pct constraint guards units, not range', () => {
  function schemaDb() {
    const db = new DatabaseSync(':memory:');
    db.exec(financeSchema);
    db.exec(auctionSchema);
    db.prepare('INSERT INTO users (id, email, password_hash, name, status, email_verified) VALUES (?, ?, ?, ?, ?, ?)')
      .run('u1', 'u1@techtrek.test', 'h', 'T', 'Active', 1);
    db.prepare('INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)')
      .run('inv1', 'u1', 'INV-T09');
    db.prepare('INSERT INTO auction_items (id, user_id, invoice_id, item_name, status) VALUES (?, ?, ?, ?, ?)')
      .run('i1', 'u1', 'inv1', 'Item', 'Sold');
    return db;
  }

  function insertSale(db, id, netProfit, cost, roi) {
    // auction_sales has a UNIQUE index on item_id, so each row gets its own item.
    db.prepare('INSERT INTO auction_items (id, user_id, invoice_id, item_name, status) VALUES (?, ?, ?, ?, ?)')
      .run(`item-${id}`, 'u1', 'inv1', 'Item', 'Sold');
    return db.prepare(`
      INSERT INTO auction_sales
        (id, user_id, item_id, sale_date, platform, gross_sale_price,
         net_proceeds, true_total_cost, net_profit, roi_pct)
      VALUES (?, 'u1', ?, '2026-09-25', 'eBay', 0, ?, ?, ?, ?)
    `).run(id, `item-${id}`, netProfit, cost, netProfit, roi);
  }

  test('a correctly derived fraction is accepted', () => {
    const db = schemaDb();
    insertSale(db, 'ok-1', 113.4, 60, 1.89);
    insertSale(db, 'ok-2', 35, 10, 3.5);
  });

  test('a loss sale with roi_pct below -1 is accepted, not rejected', () => {
    // Regression guard. An earlier draft of this constraint read
    // CHECK (roi_pct >= -1.0), which would have made a legitimate loss sale
    // (T-06 pins roi_pct = -1.344) fail at INSERT in production.
    const db = schemaDb();
    insertSale(db, 'loss-mild', -6.72, 5, -1.344);
    insertSale(db, 'loss-severe', -125, 10, -12.5);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM auction_sales').get().c, 2);
  });

  test('a zero or negative cost basis is exempt and stores roi_pct 0', () => {
    const db = schemaDb();
    insertSale(db, 'zero-cost', 45, 0, 0);
    const row = db.prepare('SELECT roi_pct FROM auction_sales WHERE id = ?').get('zero-cost');
    assert.strictEqual(row.roi_pct, 0);
  });

  test('a percentage-convention row cannot satisfy the constraint', () => {
    const db = schemaDb();
    // 189 is what the old match-sold-vinescout path wrote for roi_pct = 1.89.
    assert.throws(
      () => insertSale(db, 'drifted', 113.4, 60, 189),
      /CHECK constraint failed/
    );
  });
});

describe('T-09: migration 0009_roi_pct_fraction', () => {
  // Legacy fixture rows: [id, net_profit, true_total_cost, roi_pct_as_stored]
  const LEGACY_ROWS = [
    // Already a correct fraction: must be left byte-identical.
    ['fraction-ok',   113.4,  60,    1.89],
    // The percentage leak: 1.89 stored as 189.
    ['percent-leak',  113.4,  60,    189],
    // The multi-bagger a threshold heuristic would corrupt: correct fraction...
    ['moonshot-ok',   35,     10,    3.5],
    // ...and its percentage-convention twin, which a heuristic would leave at 350.
    ['moonshot-leak', 35,     10,    350],
    // Loss sale below -1: must not be clamped to -1 or 0.
    ['loss-keep',     -6.72,  5,     -1.344],
    // Zero cost basis: undefined ROI, normalised to 0.
    ['zero-cost',     45,     0,     0],
    // NULL cost basis: undefined ROI, normalised to 0.
    ['null-cost',     45,     null,  42],
    // Negative cost basis (data-entry error): normalised to 0.
    ['neg-cost',      45,     -10,   42]
  ];

  function seededLegacyDb() {
    const db = legacyDb();
    const insert = db.prepare(
      'INSERT INTO auction_sales (id, net_profit, true_total_cost, roi_pct) VALUES (?, ?, ?, ?)'
    );
    for (const row of LEGACY_ROWS) insert.run(...row);
    return db;
  }

  function roiMap(db) {
    const out = {};
    for (const r of db.prepare('SELECT id, roi_pct FROM auction_sales ORDER BY id').all()) {
      out[r.id] = r.roi_pct;
    }
    return out;
  }

  test('repairs percentage-convention rows and recomputes from net_profit / cost', () => {
    const db = seededLegacyDb();
    applyMigration(db);

    const roi = roiMap(db);
    assert.strictEqual(roi['percent-leak'], 1.89);
    assert.strictEqual(roi['moonshot-leak'], 3.5);
    assert.strictEqual(roi['null-cost'], 0);
    assert.strictEqual(roi['neg-cost'], 0);
  });

  test('leaves already-correct rows untouched, including a fraction above 1 and below -1', () => {
    const db = seededLegacyDb();
    applyMigration(db);

    const roi = roiMap(db);
    // Same value as stored: the WHERE guard compares against the value being
    // written, so these rows are not in the update set at all.
    assert.strictEqual(roi['fraction-ok'], 1.89);
    assert.strictEqual(roi['moonshot-ok'], 3.5);
    assert.strictEqual(roi['loss-keep'], -1.344);
    assert.strictEqual(roi['zero-cost'], 0);

    // No heuristic halving: 3.5 did NOT become 0.035, and -1.344 was not clamped.
    assert.notStrictEqual(roi['moonshot-ok'], 0.035);
    assert.notStrictEqual(roi['loss-keep'], -1);
    assert.notStrictEqual(roi['loss-keep'], 0);
  });

  test('is idempotent: a second run changes zero rows and leaves values identical', () => {
    const db = seededLegacyDb();

    const firstRun = applyMigration(db);
    assert.ok(firstRun > 0, 'the first run must repair the seeded drift');

    const before = roiMap(db);
    const secondRun = applyMigration(db);
    const after = roiMap(db);

    assert.strictEqual(secondRun, 0, `second run touched ${secondRun} rows`);
    assert.deepStrictEqual(after, before);
  });

  test('snapshots the pre-migration values before mutating anything', () => {
    const db = seededLegacyDb();
    applyMigration(db);

    const backup = db.prepare(
      'SELECT roi_pct FROM auction_sales_roi_pct_backup WHERE id = ?'
    ).get('percent-leak');
    // The backup holds the ORIGINAL 189, so the operation is reversible even
    // though a drifted row is indistinguishable from a legitimate one after the
    // fact. That irreversibility is why the snapshot is created unconditionally.
    assert.strictEqual(backup.roi_pct, 189);
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) c FROM auction_sales_roi_pct_backup').get().c,
      LEGACY_ROWS.length
    );

    // Re-running must not overwrite the snapshot with post-migration values.
    applyMigration(db);
    assert.strictEqual(
      db.prepare('SELECT roi_pct FROM auction_sales_roi_pct_backup WHERE id = ?').get('percent-leak').roi_pct,
      189
    );
  });
});
