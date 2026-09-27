import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPut, CLIENT_SETTABLE_ATTR_KEYS } from '../functions/api/items/[id].js';
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
    }
  };
}

describe('MED-6: Unrestricted Attribute Mass-Assignment Defense', () => {
  let mockDb;
  let authToken;
  const testUserId = 'usr-med6-tester';
  const testItemId = 'item-med6-test-1';

  beforeEach(async () => {
    mockDb = createMockD1();

    // Insert user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testUserId, 'med6@techtrek.test', 'dummyhash', 'Tester', 'Active', 1);

    // Insert invoice
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES (?, ?, ?)
    `).run('inv-med6-test', testUserId, 'INV-TEST-001');

    // Insert test item
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
      'inv-med6-test',
      'Signed Football Card',
      'Sports Cards',
      'Listed',
      25.00,
      25.00,
      49.99,
      JSON.stringify({
        asin: 'B001ORIGINAL',
        is_vinescout: true,
        source: 'amazon_vinescout'
      })
    );

    authToken = await createToken({ userId: testUserId, email: 'med6@techtrek.test' }, TEST_JWT_SECRET);
  });

  test('CLIENT_SETTABLE_ATTR_KEYS contains expected safe keys and excludes system-managed keys', () => {
    assert.ok(Array.isArray(CLIENT_SETTABLE_ATTR_KEYS), 'CLIENT_SETTABLE_ATTR_KEYS must be an array');
    
    // Allowed keys
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('asin'));
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('order_id'));
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('etv'));
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('tax_cost'));
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('cert_verified'));
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('is_vinescout'));
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('cert_verified_at'));

    // Strictly forbidden system keys
    assert.strictEqual(CLIENT_SETTABLE_ATTR_KEYS.includes('outpost_liquidated'), false, 'outpost_liquidated must never be client-settable');
    assert.strictEqual(CLIENT_SETTABLE_ATTR_KEYS.includes('ebay_order_id'), false, 'ebay_order_id must never be client-settable');
    assert.strictEqual(CLIENT_SETTABLE_ATTR_KEYS.includes('sale_price'), false, 'sale_price must never be client-settable');
    assert.strictEqual(CLIENT_SETTABLE_ATTR_KEYS.includes('sold_at'), false, 'sold_at must never be client-settable');
    assert.strictEqual(CLIENT_SETTABLE_ATTR_KEYS.includes('source'), false, 'source must never be client-settable');
  });

  test('PUT /api/items/:id rejects request with 400 when body.attributes contains system-managed keys', async () => {
    const maliciousBody = {
      attributes: {
        outpost_liquidated: 1,
        ebay_order_id: 'fake-order-9999'
      }
    };

    const request = new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify(maliciousBody)
    });

    const res = await onRequestPut({
      request,
      env: {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET
      }
    });

    assert.strictEqual(res.status, 400, 'Must reject with HTTP 400 status');
    const json = await res.json();
    assert.ok(json.error.includes('Disallowed attribute key(s)'), 'Must identify disallowed attributes');
    assert.ok(json.error.includes('outpost_liquidated'), 'Must list outpost_liquidated as disallowed');
    assert.ok(json.error.includes('ebay_order_id'), 'Must list ebay_order_id as disallowed');

    // Confirm DB record was not mutated
    const row = mockDb._raw.prepare('SELECT attributes FROM auction_items WHERE id = ?').get(testItemId);
    const parsed = JSON.parse(row.attributes);
    assert.strictEqual(parsed.outpost_liquidated, undefined, 'outpost_liquidated must NOT be persisted in DB');
    assert.strictEqual(parsed.ebay_order_id, undefined, 'ebay_order_id must NOT be persisted in DB');
    assert.strictEqual(parsed.asin, 'B001ORIGINAL', 'Original attributes must remain untouched');
  });

  test('PUT /api/items/:id rejects other system-managed attributes like sale_price and sold_at', async () => {
    const request = new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify({
        attributes: {
          sale_price: 199.99,
          sold_at: '2026-09-27T12:00:00Z'
        }
      })
    });

    const res = await onRequestPut({
      request,
      env: {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET
      }
    });

    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes('sale_price'));
    assert.ok(json.error.includes('sold_at'));

    const row = mockDb._raw.prepare('SELECT attributes FROM auction_items WHERE id = ?').get(testItemId);
    const parsed = JSON.parse(row.attributes);
    assert.strictEqual(parsed.sale_price, undefined);
    assert.strictEqual(parsed.sold_at, undefined);
  });

  test('PUT /api/items/:id rejects non-object or array attributes', async () => {
    const testCases = [
      'string-attributes',
      12345,
      ['item1', 'item2'],
      null
    ];

    for (const invalidAttr of testCases) {
      const request = new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${authToken}`
        },
        body: JSON.stringify({ attributes: invalidAttr })
      });

      const res = await onRequestPut({
        request,
        env: {
          DB: mockDb,
          JWT_SECRET: TEST_JWT_SECRET
        }
      });

      assert.strictEqual(res.status, 400, `Must reject ${typeof invalidAttr} with 400`);
      const json = await res.json();
      assert.strictEqual(json.error, 'Invalid attributes object');
    }
  });

  test('PUT /api/items/:id successfully merges and sanitizes allowed attribute keys while preserving existing system keys', async () => {
    // Seed item with pre-existing system-managed keys from legitimate server process
    mockDb._raw.prepare(`
      UPDATE auction_items
      SET attributes = ?
      WHERE id = ?
    `).run(
      JSON.stringify({
        asin: 'B001ORIGINAL',
        outpost_liquidated: 1,
        ebay_order_id: 'real-ebay-order-12345',
        sale_price: 49.99,
        sold_at: '2026-09-25T14:30:00Z'
      }),
      testItemId
    );

    const validUpdateBody = {
      attributes: {
        asin: '  b0newasin999  ',
        etv: 18.50,
        tax_cost: 3.25,
        cert_verified: true
      }
    };

    const request = new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify(validUpdateBody)
    });

    const res = await onRequestPut({
      request,
      env: {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET
      }
    });

    assert.strictEqual(res.status, 200, 'Must return 200 on valid allowed attributes update');

    // Verify DB state
    const row = mockDb._raw.prepare('SELECT attributes FROM auction_items WHERE id = ?').get(testItemId);
    const parsed = JSON.parse(row.attributes);

    // Allowed keys should be merged & formatted
    assert.strictEqual(parsed.asin, 'B0NEWASIN999', 'ASIN must be trimmed and uppercased');
    assert.strictEqual(parsed.etv, 18.50, 'ETV must be parsed as float');
    assert.strictEqual(parsed.tax_cost, 3.25, 'tax_cost must be parsed as float');
    assert.strictEqual(parsed.cert_verified, true, 'cert_verified must be boolean true');
    assert.ok(parsed.cert_verified_at, 'cert_verified_at should be automatically populated');

    // Existing system-managed keys must remain intact
    assert.strictEqual(parsed.outpost_liquidated, 1, 'Existing outpost_liquidated must be preserved');
    assert.strictEqual(parsed.ebay_order_id, 'real-ebay-order-12345', 'Existing ebay_order_id must be preserved');
    assert.strictEqual(parsed.sale_price, 49.99, 'Existing sale_price must be preserved');
    assert.strictEqual(parsed.sold_at, '2026-09-25T14:30:00Z', 'Existing sold_at must be preserved');
  });

  test('PUT /api/items/:id handles top-level attribute shortcuts and leaves system attributes intact', async () => {
    const request = new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify({
        asin: 'b0toplevel99',
        cert_verified: false
      })
    });

    const res = await onRequestPut({
      request,
      env: {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET
      }
    });

    assert.strictEqual(res.status, 200);

    const row = mockDb._raw.prepare('SELECT attributes FROM auction_items WHERE id = ?').get(testItemId);
    const parsed = JSON.parse(row.attributes);
    assert.strictEqual(parsed.asin, 'B0TOPLEVEL99');
    assert.strictEqual(parsed.cert_verified, false);
    assert.strictEqual(parsed.cert_verified_at, null);
  });
});
