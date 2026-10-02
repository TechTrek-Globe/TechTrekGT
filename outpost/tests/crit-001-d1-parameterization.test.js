import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet as getItems } from '../functions/api/items/index.js';
import { onRequestPut as putMarketComp } from '../functions/api/comps/market.js';
import { onRequestGet as getAdminStats } from '../functions/api/admin/stats.js';
import { onRequestGet as getSales } from '../functions/api/sales/index.js';
import { onRequestGet as getVineScoutCatalog, onRequestPost as postVineScoutCatalog } from '../functions/api/sync/vinescout-catalog.js';
import { onRequestPost as postAmazonImport } from '../functions/api/import/amazon.js';
import { onRequestPost as postMatchSoldVineScout } from '../functions/api/ebay/match-sold-vinescout.js';
import { onRequestPost as postInvoice } from '../functions/api/invoices/index.js';
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
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        if (typeof stmt.run === 'function') {
          results.push(await stmt.run());
        }
      }
      return results;
    },
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

describe('CRIT-001 / SEC-001: Secure D1 Database Parameterization Protocol', () => {
  let mockDb;
  let env;
  const testUserId = 'usr-test-crit001';
  const otherUserId = 'usr-other-crit001';
  const testInvoiceId = 'inv-test-crit001';
  let userJwt;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    mockDb._raw.exec(`
      INSERT INTO users (id, email, name, password_hash, is_admin, status, created_at)
      VALUES 
        ('${testUserId}', 'crit001@example.com', 'Tester', 'hash', 1, 'Active', datetime('now')),
        ('${otherUserId}', 'other@example.com', 'Other', 'hash', 0, 'Active', datetime('now'));

      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES 
        ('${testInvoiceId}', '${testUserId}', 'INV-CRIT001'),
        ('inv-other-001', '${otherUserId}', 'INV-OTHER');
    `);

    userJwt = await createToken({ userId: testUserId }, TEST_JWT_SECRET);
  });

  test('Static Audit: Zero template literal variable interpolations exist inside db.prepare()', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const ignoreDirs = new Set(['node_modules', '.wrangler', 'dist', '.git', 'coverage', 'build']);

    function scanDir(dir) {
      let findings = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name) && !entry.name.includes('test')) {
            findings = findings.concat(scanDir(path.join(dir, entry.name)));
          }
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          const fullPath = path.join(dir, entry.name);
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('.prepare(')) {
              const chunk = lines.slice(i, i + 35).join('\n');
              const match = chunk.match(/\.prepare\s*\(\s*`([^`]*)`/);
              if (match && match[1].includes('${')) {
                findings.push({
                  file: fullPath,
                  line: i + 1,
                  snippet: match[1].trim().slice(0, 100)
                });
              }
            }
          }
        }
      }
      return findings;
    }

    const templateLiteralCalls = scanDir(rootDir);
    assert.deepStrictEqual(
      templateLiteralCalls,
      [],
      `Found ${templateLiteralCalls.length} template literal interpolation(s) in db.prepare(): ` +
      JSON.stringify(templateLiteralCalls, null, 2)
    );
  });

  test('SQL Injection Defense: Items search safely handles SQL injection payloads via parameters', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, category, status, created_at)
      VALUES 
        ('item-1', '${testUserId}', '${testInvoiceId}', 'Real Vintage Watch', 'Watches', 'Available', datetime('now')),
        ('item-2', '${otherUserId}', 'inv-other-001', 'Other User Secret Item', 'Watches', 'Available', datetime('now'));
    `);

    // Attempt injection in search query q
    const injectionPayload = "' OR 1=1 --";
    const req = new Request(`https://techtrekgt.com/outpost/api/items?q=${encodeURIComponent(injectionPayload)}`, {
      headers: { Cookie: `auth_token=${userJwt}` }
    });

    const res = await getItems({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    // The injection string should NOT return all items; it should only match if the literal substring is found
    assert.strictEqual(body.items.length, 0);
  });

  test('SQL Injection Defense: Market comp update safely handles SQL injection in notes and parameters', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, category, status, created_at)
      VALUES ('item-comp-1', '${testUserId}', '${testInvoiceId}', 'Card', 'Cards', 'Available', datetime('now'));

      INSERT INTO market_comps (id, user_id, item_id, source, comp_title, list_price, created_at)
      VALUES ('comp-target-1', '${testUserId}', 'item-comp-1', 'ebay_sold', 'Comp Title', 45.0, datetime('now'));
    `);

    const maliciousNotes = "Normal note', is_valid = 1 WHERE '1' = '1";
    const req = new Request('https://techtrekgt.com/outpost/api/comps/market/comp-target-1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${userJwt}`
      },
      body: JSON.stringify({
        notes: maliciousNotes,
        is_valid: 0
      })
    });

    const res = await putMarketComp({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.comp.notes, maliciousNotes);
    assert.strictEqual(body.comp.is_valid, 0);
  });

  test('SQL Injection Defense: Sales listing query safely parameterizes platform and search filters', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, category, status, created_at)
      VALUES 
        ('item-sale-1', '${testUserId}', '${testInvoiceId}', 'Signed Baseball', 'Sports', 'Sold', datetime('now')),
        ('item-sale-2', '${otherUserId}', 'inv-other-001', 'Private Sale Item', 'Sports', 'Sold', datetime('now'));

      INSERT INTO auction_sales (id, user_id, item_id, sale_date, platform, gross_sale_price)
      VALUES 
        ('sale-1', '${testUserId}', 'item-sale-1', '2026-10-01', 'eBay', 100.0),
        ('sale-2', '${otherUserId}', 'item-sale-2', '2026-10-01', 'eBay', 200.0);
    `);

    const injectionPlatform = "eBay' OR '1'='1";
    const req = new Request(`https://techtrekgt.com/outpost/api/sales?platform=${encodeURIComponent(injectionPlatform)}`, {
      headers: { Cookie: `auth_token=${userJwt}` }
    });

    const res = await getSales({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.sales.length, 0);
    assert.strictEqual(body.summary.total_count, 0);
  });

  test('Admin Stats: Verifies safe parameterization of admin pagination inputs', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/admin/stats?page=1&limit=25', {
      headers: { Cookie: `auth_token=${userJwt}` }
    });

    const res = await getAdminStats({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(typeof body.total_users, 'number');
    assert.strictEqual(body.pagination.limit, 25);
    assert.strictEqual(body.pagination.page, 1);
  });

  test('SQL Injection Defense (Sync): VineScout catalog write-back safely parameterizes item_id and order_id', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, category, status, attributes, created_at)
      VALUES ('item-vscout-sync-1', '${testUserId}', '${testInvoiceId}', 'Vine Item', 'Home', 'Available', '{"asin":"B00EXAMPLE","order_id":"111-222-333"}', datetime('now'));
    `);

    // Malicious item_id injection payload
    const injectionItemId = "item-vscout-sync-1' OR 1=1 --";
    const reqFail = new Request('https://techtrekgt.com/outpost/api/sync/vinescout-catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${userJwt}`
      },
      body: JSON.stringify({
        item_id: injectionItemId,
        sale_price: 25.0,
        ebay_order_id: 'ord-123'
      })
    });

    const resFail = await postVineScoutCatalog({ request: reqFail, env });
    // Should safely fail with 404 because parameterized query looks for the literal string
    assert.strictEqual(resFail.status, 404);

    // Malicious order_id injection payload on valid item
    const injectionOrderId = "ord-123', status = 'Delisted' WHERE '1' = '1";
    const reqOk = new Request('https://techtrekgt.com/outpost/api/sync/vinescout-catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${userJwt}`
      },
      body: JSON.stringify({
        item_id: 'item-vscout-sync-1',
        sale_price: 25.0,
        ebay_order_id: injectionOrderId
      })
    });

    const resOk = await postVineScoutCatalog({ request: reqOk, env });
    assert.strictEqual(resOk.status, 200);

    // Verify item was safely updated with literal order_id and status is Sold, not delisted
    const updated = mockDb._raw.prepare('SELECT status, attributes FROM auction_items WHERE id = ?').get('item-vscout-sync-1');
    assert.strictEqual(updated.status, 'Sold');
    const attrs = JSON.parse(updated.attributes);
    assert.strictEqual(attrs.ebay_order_id, injectionOrderId);
  });

  test('SQL Injection Defense (Import): Amazon product import safely parameterizes ASIN, order ID, and notes', async () => {
    const maliciousAsin = "B00TEST' OR '1'='1";
    const maliciousOrderId = "999-0000000-1111111', status='Available' WHERE '1'='1";
    const maliciousNotes = "Note', unit_price = 0 WHERE '1'='1";

    const req = new Request('https://techtrekgt.com/outpost/api/import/amazon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userJwt}`
      },
      body: JSON.stringify({
        asin: maliciousAsin,
        title: 'Safe Parameterized Headset',
        order_id: maliciousOrderId,
        vine_value: 49.99,
        tax_value: 3.50,
        notes: maliciousNotes
      })
    });

    const res = await postAmazonImport({ request: req, env });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.item_id);

    // Verify database record has literal values stored safely
    const stored = mockDb._raw.prepare('SELECT item_name, unit_price, notes, attributes FROM auction_items WHERE id = ?').get(body.item_id);
    assert.strictEqual(stored.item_name, 'Safe Parameterized Headset');
    assert.strictEqual(stored.unit_price, 3.50);
    assert.ok(stored.notes.includes(maliciousNotes));
    const attrs = JSON.parse(stored.attributes);
    assert.strictEqual(attrs.asin, maliciousAsin.toUpperCase());
    assert.strictEqual(attrs.order_id, maliciousOrderId);
  });

  test('SQL Injection Defense (eBay): match-sold-vinescout safely parameterizes item and order inputs', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, category, status, current_list_price, attributes, created_at)
      VALUES ('item-vscout-match-1', '${testUserId}', '${testInvoiceId}', 'Bluetooth Speaker', 'Electronics', 'Available', 39.99, '{"asin":"B00SPEAKER","order_id":"222-333"}', datetime('now'));
    `);

    const injectionBuyer = "malicious_buyer', gross_sale_price = 0 WHERE '1' = '1";
    const injectionOrderId = "ebay-ord-999'; DROP TABLE users; --";

    const req = new Request('https://techtrekgt.com/outpost/api/ebay/match-sold-vinescout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${userJwt}`
      },
      body: JSON.stringify({
        confirm: true,
        item_id: 'item-vscout-match-1',
        ebay_order_id: injectionOrderId,
        buyer_handle: injectionBuyer,
        sale_price: 35.0,
        buyer_shipping_paid: 0,
        actual_shipping_cost: 4.5
      })
    });

    const res = await postMatchSoldVineScout({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);

    // Verify user table still exists and sale is recorded with literal values
    const userCheck = mockDb._raw.prepare('SELECT COUNT(*) AS total FROM users').get();
    assert.ok(userCheck.total >= 2);

    const sale = mockDb._raw.prepare('SELECT buyer_handle, ebay_order_id, gross_sale_price FROM auction_sales WHERE item_id = ?').get('item-vscout-match-1');
    assert.strictEqual(sale.buyer_handle, injectionBuyer);
    assert.strictEqual(sale.ebay_order_id, injectionOrderId);
    assert.strictEqual(sale.gross_sale_price, 35.0);
  });

  test('SQL Injection Defense (Invoices): Dynamic platform IN (...) query generates precise placeholders and parameter bindings', async () => {
    const maliciousPlatform1 = "CustomPlat') OR '1'='1";
    const maliciousPlatform2 = "OtherPlat'; DROP TABLE users; --";

    const req = new Request('https://techtrekgt.com/outpost/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${userJwt}`
      },
      body: JSON.stringify({
        invoice_ref: 'INV-PARAM-TEST',
        date_acquired: '2026-10-01',
        base_total: 100,
        items: [
          {
            item_name: 'Item With Injected Platform 1',
            unit_price: 50,
            platform: maliciousPlatform1
          },
          {
            item_name: 'Item With Injected Platform 2',
            unit_price: 50,
            platform: maliciousPlatform2
          }
        ]
      })
    });

    const res = await postInvoice({ request: req, env });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.items.length, 2);

    // Verify users table was not dropped and queries executed with complete parameter isolation
    const userCheck = mockDb._raw.prepare('SELECT COUNT(*) AS total FROM users').get();
    assert.ok(userCheck.total >= 2);
  });
});

