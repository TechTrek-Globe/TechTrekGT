import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateSku, generateUniqueSku } from '../functions/api/utils/sku.js';
import { onRequestPost as invoicesPostHandler } from '../functions/api/invoices/index.js';
import { onRequestPost as autoSkuPostHandler } from '../functions/api/items/auto-sku.js';
import { onRequestPost as amazonImportPostHandler } from '../functions/api/import/amazon.js';
import { onRequestPost as batchImportPostHandler } from '../functions/api/import/batch.js';
import { onRequestPost as pushSkuPostHandler } from '../functions/api/ebay/push-sku.js';
import { onRequestGet as enrichedGetHandler } from '../functions/api/items/enriched.js';
import { createToken } from '../functions/utils/auth.js';
import { hashSecret } from '../functions/utils/apiIntegrations.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';

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

describe('LOW-2: SKU Collision Detection & Uniqueness Regeneration', () => {
  let mockDb;
  let authToken;
  const testUserId = 'usr-low2-tester';
  const testEmail = 'low2@test.com';
  let env;

  beforeEach(async () => {
    mockDb = createMockD1();

    // Seed test user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, 'hash', 'LOW2 User', 'active', 1)
    `).run(testUserId, testEmail);

    authToken = await createToken({ userId: testUserId, email: testEmail }, TEST_JWT_SECRET);

    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      EBAY_SANDBOX: 'false'
    };
  });

  describe('generateSku Baseline & Character Set Integrity', () => {
    test('generateSku formats as OP-YYMMDD-XXXX with alphanumeric suffix', () => {
      const fixedDate = new Date(2026, 8, 27, 12, 0, 0); // Local noon Sept 27 2026
      const sku = generateSku(fixedDate);

      assert.match(sku, /^OP-260927-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    });

    test('generateSku accepts string dates and default Date instances', () => {
      const skuFromDate = generateSku(new Date(2026, 0, 15, 12));
      assert.match(skuFromDate, /^OP-260115-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);

      const skuDefault = generateSku();
      assert.match(skuDefault, /^OP-\d{6}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    });
  });

  describe('generateUniqueSku Unit Verification with Forced Collisions', () => {
    test('returns candidate directly when no collision exists in DB', async () => {
      const fixedDate = new Date(2026, 8, 27, 12);
      const sku = await generateUniqueSku(mockDb, testUserId, fixedDate);

      assert.ok(sku.startsWith('OP-260927-'));
      // Verify not yet in DB
      const existing = mockDb._raw.prepare(
        'SELECT id FROM auction_items WHERE user_id = ? AND sku = ?'
      ).get(testUserId, sku);
      assert.strictEqual(existing, undefined);
    });

    test('detects collision with pre-existing row and regenerates unique SKU', async () => {
      const fixedDate = new Date(2026, 8, 27, 12);
      const collidingSku = 'OP-260927-COLL';
      const nonCollidingSku = 'OP-260927-UNQ1';

      // Pre-insert an item with the colliding SKU for this user
      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
        VALUES ('inv-pre-1', ?, 'INV-PRE-1', 100.0)
      `).run(testUserId);

      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-pre-1', ?, 'inv-pre-1', 'Pre-existing Item', 100.0, 100.0, ?)
      `).run(testUserId, collidingSku);

      // Controlled generator returning collidingSku on attempt 1, then nonCollidingSku on attempt 2
      let attemptCount = 0;
      const customGenerator = () => {
        attemptCount++;
        return attemptCount === 1 ? collidingSku : nonCollidingSku;
      };

      const resultSku = await generateUniqueSku(
        mockDb,
        testUserId,
        fixedDate,
        5,
        null,
        customGenerator
      );

      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(resultSku, nonCollidingSku);
      assert.notStrictEqual(resultSku, collidingSku);
    });

    test('respects seenSkus to prevent intra-batch duplicate collisions', async () => {
      const seenSkus = new Set();
      const duplicateCandidate = 'OP-260927-SAME';
      const uniqueCandidate = 'OP-260927-NEXT';

      let calls = 0;
      const customGenerator = () => {
        calls++;
        return calls === 1 ? duplicateCandidate : uniqueCandidate;
      };

      // Add duplicateCandidate to seenSkus
      seenSkus.add(duplicateCandidate);

      const result = await generateUniqueSku(
        mockDb,
        testUserId,
        new Date(2026, 8, 27, 12),
        5,
        seenSkus,
        customGenerator
      );

      assert.strictEqual(result, uniqueCandidate);
      assert.strictEqual(calls, 2);
      assert.ok(seenSkus.has(uniqueCandidate));
    });

    test('falls back to entropy suffix if max attempts are exhausted on continuous collisions', async () => {
      const collidingSku = 'OP-260927-STUK';

      // Pre-insert colliding SKU
      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
        VALUES ('inv-pre-max', ?, 'INV-PRE-MAX', 50.0)
      `).run(testUserId);

      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-pre-max', ?, 'inv-pre-max', 'Stuck Item', 50.0, 50.0, ?)
      `).run(testUserId, collidingSku);

      let attempts = 0;
      const stuckGenerator = () => {
        attempts++;
        return collidingSku;
      };

      const fallbackSku = await generateUniqueSku(
        mockDb,
        testUserId,
        new Date(2026, 8, 27, 12),
        5,
        null,
        stuckGenerator
      );

      assert.strictEqual(attempts, 6); // 5 attempts in loop + 1 for fallback prefix
      assert.ok(fallbackSku.startsWith(`${collidingSku}-`));
      assert.notStrictEqual(fallbackSku, collidingSku);
    });
  });

  describe('Calling Code Call-Site Integrations with Forced Collisions', () => {
    test('POST /api/invoices detects collision with pre-existing SKU and saves a unique SKU', async () => {
      // Pre-insert a known SKU for this user
      const knownSku = 'OP-260927-AABB';
      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
        VALUES ('inv-existing', ?, 'INV-EXIST', 50.0)
      `).run(testUserId);

      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-existing', ?, 'inv-existing', 'Existing Item', 50.0, 50.0, ?)
      `).run(testUserId, knownSku);

      // Create a new invoice without specifying a SKU
      const req = new Request('http://localhost/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          invoice_ref: 'INV-NEW-1',
          date_acquired: '2026-09-27',
          items: [
            { item_name: 'New Memorabilia 1', unit_price: 120.0 },
            { item_name: 'New Memorabilia 2', unit_price: 140.0 }
          ]
        })
      });

      const res = await invoicesPostHandler({ request: req, env });
      assert.strictEqual(res.status, 201);

      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.items.length, 2);

      // Assert neither new item reused the pre-existing SKU
      assert.notStrictEqual(json.items[0].sku, knownSku);
      assert.notStrictEqual(json.items[1].sku, knownSku);

      // Assert both newly generated SKUs are distinct from each other
      assert.notStrictEqual(json.items[0].sku, json.items[1].sku);

      // Verify records in DB
      const dbItem1 = mockDb._raw.prepare('SELECT sku FROM auction_items WHERE id = ?').get(json.items[0].id);
      const dbItem2 = mockDb._raw.prepare('SELECT sku FROM auction_items WHERE id = ?').get(json.items[1].id);
      assert.strictEqual(dbItem1.sku, json.items[0].sku);
      assert.strictEqual(dbItem2.sku, json.items[1].sku);
    });

    test('POST /api/items/auto-sku assigns unique SKUs and avoids colliding with pre-existing SKUs', async () => {
      const knownSku = 'OP-260927-CCDD';
      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
        VALUES ('inv-autosku', ?, 'INV-AUTO', 100.0)
      `).run(testUserId);

      // Insert item 1 with known SKU
      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-known', ?, 'inv-autosku', 'Known Item', 50.0, 50.0, ?)
      `).run(testUserId, knownSku);

      // Insert item 2 and item 3 with blank SKU
      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-blank-1', ?, 'inv-autosku', 'Blank Item 1', 25.0, 25.0, NULL)
      `).run(testUserId);

      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-blank-2', ?, 'inv-autosku', 'Blank Item 2', 25.0, 25.0, '')
      `).run(testUserId);

      const req = new Request('http://localhost/api/items/auto-sku', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const res = await autoSkuPostHandler({ request: req, env });
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.count, 2);

      const updated1 = mockDb._raw.prepare("SELECT sku FROM auction_items WHERE id = 'item-blank-1'").get();
      const updated2 = mockDb._raw.prepare("SELECT sku FROM auction_items WHERE id = 'item-blank-2'").get();

      assert.ok(updated1.sku.startsWith('OP-'));
      assert.ok(updated2.sku.startsWith('OP-'));
      assert.notStrictEqual(updated1.sku, knownSku);
      assert.notStrictEqual(updated2.sku, knownSku);
      assert.notStrictEqual(updated1.sku, updated2.sku);
    });

    test('POST /api/import/amazon creates item with unique non-colliding SKU', async () => {
      // Setup integration secret for user
      const amazonToken = 'op_sec_test_low2_amazon_token';
      const tokenHash = await hashSecret(amazonToken);
      mockDb._raw.prepare(`
        INSERT INTO api_integrations (id, user_id, label, secret_hash, created_at)
        VALUES ('int-low2-1', ?, 'VineScout Chrome Extension', ?, datetime('now'))
      `).run(testUserId, tokenHash);

      const preExistingSku = 'OP-260927-AMZ1';
      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
        VALUES ('inv-amz-prev', ?, 'INV-AMZ-PREV', 40.0)
      `).run(testUserId);

      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-amz-prev', ?, 'inv-amz-prev', 'Prev Amazon Item', 40.0, 40.0, ?)
      `).run(testUserId, preExistingSku);

      const req = new Request('http://localhost/api/import/amazon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${amazonToken}`
        },
        body: JSON.stringify({
          asin: 'B0LOW2TEST1',
          title: 'Imported Bluetooth Headset',
          vine_value: 45.0,
          tax_value: 0
        })
      });

      const res = await amazonImportPostHandler({ request: req, env });
      assert.strictEqual(res.status, 201);

      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.sku.startsWith('OP-'));
      assert.notStrictEqual(json.sku, preExistingSku);

      const saved = mockDb._raw.prepare('SELECT sku FROM auction_items WHERE id = ?').get(json.item_id);
      assert.strictEqual(saved.sku, json.sku);
    });

    test('POST /api/import/batch imports multiple items without SKUs and assigns mutually unique non-colliding SKUs', async () => {
      const knownSku = 'OP-260927-BATCH1';
      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
        VALUES ('inv-batch-prior', ?, 'INV-BATCH-PRIOR', 80.0)
      `).run(testUserId);

      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-batch-prior', ?, 'inv-batch-prior', 'Prior Batch Item', 80.0, 80.0, ?)
      `).run(testUserId, knownSku);

      const req = new Request('http://localhost/api/import/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          strategy: 'append',
          items: [
            { item_name: 'Batch Item Alpha', unit_price: 30.0, date_acquired: '2026-09-27' },
            { item_name: 'Batch Item Beta', unit_price: 50.0, date_acquired: '2026-09-27' }
          ]
        })
      });

      const res = await batchImportPostHandler({ request: req, env });
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.strictEqual(json.success, true);

      const itemsInDb = mockDb._raw.prepare(`
        SELECT item_name, sku FROM auction_items WHERE user_id = ? AND item_name LIKE 'Batch Item %'
      `).all(testUserId);

      assert.strictEqual(itemsInDb.length, 2);
      assert.notStrictEqual(itemsInDb[0].sku, knownSku);
      assert.notStrictEqual(itemsInDb[1].sku, knownSku);
      assert.notStrictEqual(itemsInDb[0].sku, itemsInDb[1].sku);
    });

    test('POST /api/ebay/push-sku generates and persists unique SKU when target item lacks one', async () => {
      // Seed eBay OAuth token so handler reaches SKU assignment
      const encAccess = await encryptToken('mock_ebay_access_low2', TEST_JWT_SECRET);
      mockDb._raw.prepare(`
        INSERT INTO ebay_oauth_tokens (
          id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, connected_at
        ) VALUES ('tok-low2', ?, ?, ?, datetime('now', '+1 hour'), datetime('now', '+30 days'), 'sell.inventory', datetime('now'))
      `).run(testUserId, encAccess, encAccess);

      const preExistingSku = 'OP-260927-EBAY1';
      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
        VALUES ('inv-push', ?, 'INV-PUSH', 90.0)
      `).run(testUserId);

      // Pre-existing item with SKU
      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku)
        VALUES ('item-ebay-prev', ?, 'inv-push', 'Existing Ebay Item', 90.0, 90.0, ?)
      `).run(testUserId, preExistingSku);

      // Target item lacking SKU, linked to an eBay listing
      mockDb._raw.prepare(`
        INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, sku, ebay_listing_id)
        VALUES ('item-push-target', ?, 'inv-push', 'Target Ebay Item', 45.0, 45.0, NULL, '1122334455')
      `).run(testUserId);

      // Call push-sku handler - upstream Trading API call will fail gracefully, but DB sku update runs first!
      const req = new Request('http://localhost/api/ebay/push-sku', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          item_id: 'item-push-target'
        })
      });

      await pushSkuPostHandler({ request: req, env });

      const updated = mockDb._raw.prepare("SELECT sku FROM auction_items WHERE id = 'item-push-target'").get();
      assert.ok(updated.sku, 'Target item should now have a generated SKU');
      assert.ok(updated.sku.startsWith('OP-'));
      assert.notStrictEqual(updated.sku, preExistingSku);
    });

    test('GET /api/items/enriched loads items with image normalization and pricing without throwing internal error', async () => {
      // Seed invoice and item with notes image and attributes
      mockDb._raw.prepare(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
        VALUES ('inv-enrich-test', ?, 'AMAZON-B09TEST999-2026-09-27', 85.0)
      `).run(testUserId);

      mockDb._raw.prepare(`
        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, unit_price, true_total_cost, min_sell_price, suggested_list_price,
          status, sku, notes, attributes
        ) VALUES (
          'item-enrich-1', ?, 'inv-enrich-test', 'Signed Basketball', 85.0, 85.0, 110.0, 135.0,
          'Available', 'OP-260927-ENR1', 'ASIN: B09TEST999 | Image: http://example.com/item.jpg',
          ?
        )
      `).run(testUserId, JSON.stringify({ asin: 'B09TEST999', etv: 85.0, image_url: 'http://example.com/fallback.jpg' }));

      const req = new Request('http://localhost/api/items/enriched?page=1&limit=50', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const res = await enrichedGetHandler({ request: req, env });
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.ok(Array.isArray(json.items));
      assert.strictEqual(json.items.length, 1);
      assert.strictEqual(json.items[0].id, 'item-enrich-1');
      assert.strictEqual(json.items[0].image_url, 'https://example.com/item.jpg'); // normalized to https
      assert.strictEqual(json.items[0].suggested_list_price, 135.0);
    });
  });
});
