/**
 * T-11 acceptance tests: null-preserving persistence, a single status enum, the
 * Sold transition seam, even proration on a zero-base invoice, and date guards
 * that refuse to invent a measurement.
 *
 * COVERAGE NOTE: T-11 items are numbered 1-9 in the code, but only items 1, 3, 4,
 * 5, 6, 7, 8 and 9 carry a "T-11 item N" marker anywhere in the repository. Item
 * 2 is not referenced by any source file, comment or test, so there is nothing
 * to assert against and no guess is made here.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  round2,
  round2Nullable,
  daysBetween,
  computeItemProration,
  reprorateBatch
} from '../functions/utils/auction.js';
import {
  ITEM_STATUSES,
  normalizeItemStatus,
  invalidStatusError
} from '../functions/utils/constants.js';
import { onRequestPut as itemsUpdatePut } from '../functions/api/items/[id].js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPOST = path.join(__dirname, '..');
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const USER_ID = 'usr-t11';
const ITEM_ID = 'item-t11';
const INVOICE_ID = 'inv-t11';

function source(relPath) {
  return fs.readFileSync(path.join(OUTPOST, relPath), 'utf8');
}

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
          return db.prepare(sql).get(...boundParams) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...boundParams) };
        },
        async run() {
          const info = db.prepare(sql).run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    }
  };
}

async function putItem(mockDb, body) {
  const token = await createToken({ userId: USER_ID, email: 't11@techtrek.test' }, TEST_JWT_SECRET);
  const request = new Request(`https://techtrekgt.com/outpost/api/items/${ITEM_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${token}` },
    body: JSON.stringify(body)
  });
  const res = await itemsUpdatePut({ request, env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET } });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

function itemRow(mockDb) {
  return mockDb._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get(ITEM_ID);
}

describe('T-11 items 1 and 3: null is a value, not a zero', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockD1();
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(USER_ID, 't11@techtrek.test', 'h', 'T', 'Active', 1);
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)
    `).run(INVOICE_ID, USER_ID, 'INV-T11');
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, status, unit_price,
                                 floor_price, buy_it_now_price, buyer_shipping_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ITEM_ID, USER_ID, INVOICE_ID, 'Unsold card', 'Available', 20, null, null, null);
  });

  test('round2 collapses NULL to 0; round2Nullable does not', () => {
    // The distinction the whole item rests on: Number(null) === 0, so a display
    // rounder applied to NULL silently writes a real zero into the column.
    assert.strictEqual(round2(null), 0);
    assert.strictEqual(round2(undefined), 0);
    assert.strictEqual(round2(''), 0);
    assert.strictEqual(round2Nullable(null), null);
    assert.strictEqual(round2Nullable(undefined), null);
    assert.strictEqual(round2Nullable(''), null);
    assert.strictEqual(round2Nullable('12.346'), 12.35);
    assert.strictEqual(round2Nullable('nonsense'), null);
    assert.strictEqual(round2Nullable(0), 0);
  });

  test('a PUT that omits the nullable money fields leaves them NULL', async () => {
    const before = itemRow(mockDb);
    assert.strictEqual(before.floor_price, null);

    const res = await putItem(mockDb, { notes: 'no price fields in this body' });
    assert.strictEqual(res.status, 200);

    const after = itemRow(mockDb);
    assert.strictEqual(after.floor_price, null, 'floor_price must stay NULL, not become 0');
    assert.strictEqual(after.buy_it_now_price, null);
    assert.strictEqual(after.buyer_shipping_cost, null);
  });

  test('an explicit empty string clears to NULL rather than 0', async () => {
    const res = await putItem(mockDb, { floor_price: '', buy_it_now_price: '' });
    assert.strictEqual(res.status, 200);

    const after = itemRow(mockDb);
    assert.strictEqual(after.floor_price, null);
    assert.strictEqual(after.buy_it_now_price, null);
  });

  test('a supplied value is rounded to cents and stored', async () => {
    const res = await putItem(mockDb, {
      floor_price: '12.346', buy_it_now_price: 30, buyer_shipping_cost: '5.005'
    });
    assert.strictEqual(res.status, 200);

    const after = itemRow(mockDb);
    assert.strictEqual(after.floor_price, 12.35);
    assert.strictEqual(after.buy_it_now_price, 30);
    assert.strictEqual(after.buyer_shipping_cost, 5.01);
  });

  test('a deliberate zero is preserved as zero, distinct from NULL', async () => {
    const res = await putItem(mockDb, { floor_price: 0 });
    assert.strictEqual(res.status, 200);

    const after = itemRow(mockDb);
    assert.strictEqual(after.floor_price, 0);
    assert.notStrictEqual(after.floor_price, null);
    // The other two were not touched, so they remain NULL.
    assert.strictEqual(after.buy_it_now_price, null);
  });
});

describe('T-11 items 4 and 5: one status enum, validated at the boundary', () => {
  test('the enum is frozen and includes delist_pending', () => {
    assert.ok(Array.isArray(ITEM_STATUSES));
    assert.ok(Object.isFrozen(ITEM_STATUSES));
    assert.ok(ITEM_STATUSES.includes('delist_pending'));
    // The gateway webhook writes this literal, so it must remain spellable.
    assert.strictEqual(normalizeItemStatus('delist_pending'), 'delist_pending');
  });

  test('normalizeItemStatus canonicalises casing and whitespace', () => {
    assert.strictEqual(normalizeItemStatus('sold'), 'Sold');
    assert.strictEqual(normalizeItemStatus('SOLD'), 'Sold');
    assert.strictEqual(normalizeItemStatus('  Kept for  Self '), 'Kept for Self');
    assert.strictEqual(normalizeItemStatus('DELIST_PENDING'), 'delist_pending');
    assert.strictEqual(normalizeItemStatus(''), null);
    assert.strictEqual(normalizeItemStatus(null), null);
    assert.strictEqual(normalizeItemStatus('banana'), null);
  });

  test('the rejection body names the permitted set', () => {
    const body = invalidStatusError('banana');
    assert.match(body.error, /Invalid status "banana"/);
    assert.match(body.error, /Permitted values:/);
    for (const status of ITEM_STATUSES) {
      assert.ok(body.error.includes(status), `${status} missing from the error text`);
    }
    assert.deepStrictEqual(body.permitted_statuses, [...ITEM_STATUSES]);
  });

  test('PUT /api/items/:id rejects an unknown status and does not persist it', async () => {
    const mockDb = createMockD1();
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(USER_ID, 't11@techtrek.test', 'h', 'T', 'Active', 1);
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)
    `).run(INVOICE_ID, USER_ID, 'INV-T11');
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(ITEM_ID, USER_ID, INVOICE_ID, 'Status item', 'Available');

    const res = await putItem(mockDb, { status: 'banana' });
    assert.strictEqual(res.status, 400);
    assert.match(res.payload.error, /Invalid status "banana"/);
    assert.match(res.payload.error, /Permitted values:/);
    assert.strictEqual(itemRow(mockDb).status, 'Available', 'the bad status must not persist');
  });
});

describe('T-11 item 6: the Sold transition seam', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockD1();
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(USER_ID, 't11@techtrek.test', 'h', 'T', 'Active', 1);
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)
    `).run(INVOICE_ID, USER_ID, 'INV-T11');
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, status, unit_price,
                                 true_total_cost, est_shipping_cost, date_listed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ITEM_ID, USER_ID, INVOICE_ID, 'Sold item', 'Available', 40, 60, 5, '2026-09-01');
  });

  function saleRows() {
    return mockDb._raw.prepare('SELECT * FROM auction_sales WHERE item_id = ?').all(ITEM_ID);
  }

  test('entering Sold writes exactly one sale row', async () => {
    const res = await putItem(mockDb, { status: 'Sold', actual_sell_price: 200 });
    assert.strictEqual(res.status, 200);

    const rows = saleRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].gross_sale_price, 200);
    assert.strictEqual(rows[0].true_total_cost, 60);

    const item = itemRow(mockDb);
    assert.strictEqual(item.status, 'Sold');
    assert.ok(item.date_sold, 'date_sold must be stamped on the way into Sold');
  });

  test('a repeat PUT while already Sold does not duplicate the sale', async () => {
    await putItem(mockDb, { status: 'Sold', actual_sell_price: 200 });
    const first = saleRows()[0];

    const res = await putItem(mockDb, { notes: 'still sold' });
    assert.strictEqual(res.status, 200);

    const rows = saleRows();
    assert.strictEqual(rows.length, 1, 'the Sold seam must be idempotent');
    assert.strictEqual(rows[0].id, first.id);
  });

  test('leaving Sold deletes the sale and records no sale date', async () => {
    await putItem(mockDb, { status: 'Sold', actual_sell_price: 200 });
    assert.strictEqual(saleRows().length, 1);

    const res = await putItem(mockDb, { status: 'Available' });
    assert.strictEqual(res.status, 200);

    assert.strictEqual(saleRows().length, 0, 'the sale must not survive the revert');
    const item = itemRow(mockDb);
    assert.strictEqual(item.status, 'Available');
    assert.strictEqual(item.date_sold, null, 'a reverted item must not keep a stale sold date');
    assert.strictEqual(item.days_on_market, null);
  });

  test('Sold to Returned takes the same delete branch', async () => {
    await putItem(mockDb, { status: 'Sold', actual_sell_price: 200 });
    const res = await putItem(mockDb, { status: 'Returned' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(saleRows().length, 0);
    assert.strictEqual(itemRow(mockDb).status, 'Returned');
  });

  test('a stale date_sold cannot leak into the next sale', async () => {
    // Regression guard for the revert fix above: because the Sold branch only
    // auto-stamps an EMPTY date_sold, a surviving date would be inherited by the
    // next sale and skew days_to_sell.
    await putItem(mockDb, { status: 'Sold', actual_sell_price: 200, date_sold: '2026-09-02' });
    await putItem(mockDb, { status: 'Available' });

    const res = await putItem(mockDb, { status: 'Sold', actual_sell_price: 210 });
    assert.strictEqual(res.status, 200);

    const item = itemRow(mockDb);
    assert.notStrictEqual(item.date_sold, '2026-09-02');

    const rows = saleRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].sale_date, item.date_sold);
  });
});

describe('T-11 item 7: a zero-base invoice splits evenly', () => {
  const INVOICE = { base_total: 0, discount: 30, shipping: 12, tax: 6 };

  test('1/N distribution replaces the discarded weight of 0', () => {
    const item = { unit_price: 0, item_base_total: 0 };
    const share = computeItemProration(item, INVOICE, 3);

    assert.strictEqual(share.proration_weight, 1 / 3);
    // $30 + $12 + $6 = $48 spread across 3 items, so $16 of adjustments each.
    assert.strictEqual(share.prorated_discount, 10);
    assert.strictEqual(share.prorated_shipping, 4);
    assert.strictEqual(share.prorated_tax, 2);
    // true_total_cost = unit_price - discount + shipping + tax = 0 - 10 + 4 + 2.
    // It is negative here because a $0-ETV item absorbing an invoice-level
    // discount has no cost to offset. The pre-T-11 weight-0 path silently gave 0
    // instead, so the item's shipping and tax vanished from landed cost entirely.
    assert.strictEqual(share.true_total_cost, -4);
  });

  test('a $0-ETV Vine item carries its real shipping and tax', () => {
    const alone = computeItemProration({ unit_price: 0 }, INVOICE, 1);
    assert.strictEqual(alone.true_total_cost, -12); // 0 - 30 + 12 + 6
    assert.notStrictEqual(
      alone.true_total_cost, 0,
      'the old weight-0 path discarded every invoice-level adjustment'
    );
  });

  test('without a roster size the legacy weight is retained, not guessed', () => {
    const unknown = computeItemProration({ unit_price: 0 }, INVOICE);
    assert.strictEqual(unknown.proration_weight, 0);
    assert.strictEqual(unknown.true_total_cost, 0);
  });

  test('a non-zero base total still prorates by value', () => {
    const share = computeItemProration(
      { unit_price: 25 }, { base_total: 100, discount: 20, shipping: 10, tax: 5 }, 4
    );
    assert.strictEqual(share.proration_weight, 0.25);
    assert.strictEqual(share.prorated_discount, 5);
    assert.strictEqual(share.true_total_cost, 23.75);
  });

  test('reprorateBatch passes the roster size so every item is covered', () => {
    const items = [
      { id: 'a', unit_price: 0 },
      { id: 'b', unit_price: 0 },
      { id: 'c', unit_price: 0 }
    ];
    const updated = reprorateBatch(items, INVOICE);
    assert.strictEqual(updated.length, 3);
    for (const row of updated) {
      assert.strictEqual(row.proration_weight, 1 / 3);
      assert.strictEqual(row.prorated_discount, 10);
      assert.strictEqual(row.true_total_cost, -4);
    }
    // The batch total equals what a single-item invoice would carry, so no
    // adjustment is dropped or double-counted by the even split.
    const total = updated.reduce((sum, r) => sum + r.true_total_cost, 0);
    assert.strictEqual(total, -12);
  });
});

describe('T-11 item 8: an impossible date range is null, not zero', () => {
  test('daysBetween returns null instead of clamping to 0', () => {
    assert.strictEqual(daysBetween('2026-09-01', '2026-09-11'), 10);
    assert.strictEqual(daysBetween('2026-05-01', '2026-05-01'), 0);

    // Sale before listing is a data-entry error, not a zero-day flip.
    assert.strictEqual(daysBetween('2026-09-20', '2026-09-01'), null);
    assert.strictEqual(daysBetween(null, '2026-09-01'), null);
    assert.strictEqual(daysBetween('2026-09-01', null), null);
    assert.strictEqual(daysBetween('not-a-date', '2026-09-01'), null);
  });

  test('a backwards date pair persists as NULL and is excluded from averages', async () => {
    const mockDb = createMockD1();
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(USER_ID, 't11@techtrek.test', 'h', 'T', 'Active', 1);
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)
    `).run(INVOICE_ID, USER_ID, 'INV-T11');
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, status, unit_price,
                                 true_total_cost, est_shipping_cost, date_listed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ITEM_ID, USER_ID, INVOICE_ID, 'Backwards', 'Available', 40, 50, 5, '2026-09-20');

    const res = await putItem(mockDb, {
      status: 'Sold', actual_sell_price: 200, date_sold: '2026-09-01'
    });
    assert.strictEqual(res.status, 200);

    const item = itemRow(mockDb);
    assert.strictEqual(item.date_sold, '2026-09-01');
    assert.strictEqual(item.days_on_market, null, 'a negative span must not be clamped to 0');

    const sale = mockDb._raw.prepare('SELECT * FROM auction_sales WHERE item_id = ?').get(ITEM_ID);
    assert.strictEqual(sale.days_to_sell, null);

    // AVG ignores NULL, so the bad row cannot drag the average down as a zero.
    const avg = mockDb._raw.prepare('SELECT AVG(days_to_sell) a FROM auction_sales').get().a;
    assert.strictEqual(avg, null);
  });
});

describe('T-11 item 9: a failed auto-save is visible', () => {
  test('the modal tracks the failure and the header renders it', () => {
    const modal = source('src/components/EditItemModal.jsx');

    // Scope the check to the auto-save function itself: other handlers in this
    // modal legitimately log to console only.
    const start = modal.indexOf('const autoSaveField = useCallback');
    assert.notStrictEqual(start, -1, 'autoSaveField must exist');
    const end = modal.indexOf('}, [item, onUpdated])', start);
    assert.notStrictEqual(end, -1, 'autoSaveField must have a stable dependency list');
    const fnBody = modal.slice(start, end);

    assert.match(fnBody, /setAutoSaveError\(''\)/, 'a new attempt clears the old error');
    const catchIdx = fnBody.indexOf('catch (');
    assert.notStrictEqual(catchIdx, -1, 'the auto-save must handle failure');
    assert.match(
      fnBody.slice(catchIdx),
      /setAutoSaveError\(/,
      'the auto-save catch must surface the failure, not only console.warn it'
    );

    const header = source('src/components/edit/EditModalHeader.jsx');
    assert.match(header, /autoSaveError/, 'the header must receive it');
    // And the modal must actually pass it down.
    assert.match(modal, /autoSaveError=\{autoSaveError\}/);
  });

  test('the error badge is styled with classes, not inline styles', () => {
    const header = source('src/components/edit/EditModalHeader.jsx');
    assert.doesNotMatch(header, /style=\{\{/, 'JSX inline styles are prohibited');
    assert.match(header, /className=/);
  });
});
