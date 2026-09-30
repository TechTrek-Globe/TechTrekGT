import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fuzzyScore } from '../functions/api/ebay/find-listings.js';
import { calculateSimilarity, onRequestGet, onRequestPost } from '../functions/api/ebay/match-sold-vinescout.js';
import { fetchEbayOrderForListing } from '../functions/api/ebay/tokenHelper.js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

import { encryptToken } from '../functions/utils/tokenCrypto.js';

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const TEST_TOKEN_KEY = 'test-token-encryption-key-med8';

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

describe('MED-8: Fuzzy Title-Matching Heuristics and Safe Sales Attribution', () => {
  let mockDb;
  let authToken;
  const testUserId = 'usr-med8-tester';

  beforeEach(async () => {
    mockDb = createMockD1();

    // Insert user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testUserId, 'med8@techtrek.test', 'dummyhash', 'Tester', 'Active', 1);

    // Insert invoice
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES (?, ?, ?)
    `).run('inv-med8-test', testUserId, 'AMAZON-2026-MED8');

    // Seed eBay OAuth token
    const encAccess = await encryptToken('mock_ebay_access_token', TEST_TOKEN_KEY);
    mockDb._raw.prepare(`
      INSERT INTO ebay_oauth_tokens (
        id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, connected_at
      ) VALUES (?, ?, ?, ?, datetime('now', '+1 hour'), datetime('now', '+30 days'), 'sell.inventory sell.fulfillment', datetime('now'))
    `).run('tok-med8', testUserId, encAccess, encAccess);

    authToken = await createToken({ userId: testUserId, email: 'med8@techtrek.test' }, TEST_JWT_SECRET);
  });

  describe('fuzzyScore Heuristic Thresholds', () => {
    test('Overlapping generic tokens without product match produce score < 0.80', () => {
      const ebayTitle = '2023 rookie card PSA 10 Victor Wembanyama Hoops';
      const itemName = '2023 rookie card PSA 10 CJ Stroud Prizm';
      const score = fuzzyScore(ebayTitle, itemName, '');

      // Overlap tokens: 2023, rookie, card, psa (4 of 7 tokens) -> ~0.57
      assert.ok(score < 0.80, `Expected score < 0.80 for generic token overlap, got ${score}`);
      assert.ok(score >= 0.35, `Expected score >= 0.35 candidate threshold, got ${score}`);
    });

    test('Exact or near-exact titles yield high-confidence score >= 0.80', () => {
      const ebayTitle = '2023 Victor Wembanyama Panini Hoops Rookie Card PSA 10';
      const itemName = '2023 Victor Wembanyama Panini Hoops Rookie Card PSA 10 Gem Mint';
      const score = fuzzyScore(ebayTitle, itemName, 'Victor Wembanyama');

      assert.ok(score >= 0.80, `Expected score >= 0.80 for matching item, got ${score}`);
    });
  });

  describe('calculateSimilarity & high_confidence Flag', () => {
    test('Overlapping generic tokens calculate similarity < 0.80 (low confidence)', () => {
      const titleA = '2023 rookie card PSA 10 Victor Wembanyama Hoops';
      const titleB = '2023 rookie card PSA 10 CJ Stroud Prizm';

      const forward = calculateSimilarity(titleA, titleB);
      const reverse = calculateSimilarity(titleB, titleA);
      const combined = (forward * 0.6) + (reverse * 0.4);

      assert.ok(combined < 0.80, `Expected combined similarity < 0.80, got ${combined}`);
      assert.ok(combined >= 0.35, `Expected combined similarity >= 0.35, got ${combined}`);
      const isHighConfidence = combined >= 0.80;
      assert.strictEqual(isHighConfidence, false, 'Generic token overlap must NOT be marked high confidence');
    });

    test('Nearly identical titles calculate similarity >= 0.80 (high confidence)', () => {
      const titleA = '2023 Panini Prizm CJ Stroud Rookie Card #339 PSA 10';
      const titleB = '2023 Panini Prizm CJ Stroud Rookie Card #339 PSA 10 Gem Mint';

      const forward = calculateSimilarity(titleA, titleB);
      const reverse = calculateSimilarity(titleB, titleA);
      const combined = (forward * 0.6) + (reverse * 0.4);

      assert.ok(combined >= 0.80, `Expected combined similarity >= 0.80, got ${combined}`);
      const isHighConfidence = combined >= 0.80;
      assert.strictEqual(isHighConfidence, true, 'Matching titles must be marked high confidence');
    });
  });

  describe('fetchEbayOrderForListing Prefix Matching Removal', () => {
    test('Unrelated products sharing first 25 characters are NOT matched by prefix alone', async () => {
      // Mock global fetch returning order with different product sharing 25-char prefix
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url) => {
          const urlStr = String(url);
          if (urlStr.includes('/sell/fulfillment/v1/order')) {
            return {
              ok: true,
              json: async () => ({
                orders: [{
                  orderId: 'EBAY-ORDER-MED8-999',
                  creationDate: '2026-09-27T12:00:00.000Z',
                  buyer: { username: 'collector_buyer' },
                  orderPaymentStatus: 'PAID',
                  lineItems: [{
                    lineItemId: 'line-123',
                    legacyItemId: '998877665544',
                    title: '2023 rookie card PSA 10 Victor Wembanyama Hoops',
                    sku: 'SKU-WEMBY-001',
                    lineItemCost: { value: '150.00' }
                  }]
                }]
              })
            };
          }
          return { ok: false, status: 404 };
        };

        const mockEnv = {
          EBAY_SANDBOX: 'false'
        };

        // Query with title sharing the first 25 characters ("2023 rookie card psa 10 "), but different player/set
        const queryTitle = '2023 rookie card PSA 10 CJ Stroud Prizm';
        const matched = await fetchEbayOrderForListing(mockEnv, 'dummy-token', null, null, queryTitle);

        assert.strictEqual(matched, null, 'Unrelated item sharing 25-char prefix must NOT be matched automatically');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('Listing ID or SKU match continues to correctly match', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url) => {
          const urlStr = String(url);
          if (urlStr.includes('/sell/fulfillment/v1/order')) {
            return {
              ok: true,
              json: async () => ({
                orders: [{
                  orderId: 'EBAY-ORDER-MED8-100',
                  creationDate: '2026-09-27T12:00:00.000Z',
                  buyer: { username: 'card_investor' },
                  orderPaymentStatus: 'PAID',
                  lineItems: [{
                    lineItemId: 'line-100',
                    legacyItemId: '112233445566',
                    title: '2023 rookie card PSA 10 CJ Stroud Prizm',
                    sku: 'SKU-STROUD-001',
                    lineItemCost: { value: '250.00' }
                  }]
                }]
              })
            };
          }
          return { ok: false, status: 404 };
        };

        const mockEnv = { EBAY_SANDBOX: 'false' };
        const matched = await fetchEbayOrderForListing(mockEnv, 'dummy-token', '112233445566', 'SKU-STROUD-001', '2023 rookie card PSA 10 CJ Stroud Prizm');

        assert.ok(matched !== null, 'Item with matching listing ID and SKU must match');
        assert.strictEqual(matched.orderId, 'EBAY-ORDER-MED8-100');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('onRequestPost match-sold-vinescout explicit confirmation guard', () => {
    const testVScoutItemId = 'item-vscout-med8-1';

    beforeEach(() => {
      mockDb._raw.prepare(`
        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, current_list_price, true_total_cost, status, attributes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        testVScoutItemId,
        testUserId,
        'inv-med8-test',
        '2023 rookie card PSA 10 CJ Stroud Prizm',
        199.99,
        50.00,
        'Available',
        JSON.stringify({ asin: 'B0TESTASIN1', order_id: '111-9999999-0000001' })
      );
    });

    test('Rejects match reconciliation with HTTP 400 when confirm is omitted', async () => {
      const req = new Request('http://localhost/api/ebay/match-sold-vinescout', {
        method: 'POST',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_id: testVScoutItemId,
          ebay_order_id: 'EBAY-ORD-12345',
          sale_price: 180.00
          // confirm is omitted
        })
      });

      const res = await onRequestPost({ request: req, env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET } });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('confirm: true'), `Expected error to mention confirm: true, got: ${data.error}`);
    });

    test('Rejects match reconciliation with HTTP 400 when confirm is false', async () => {
      const req = new Request('http://localhost/api/ebay/match-sold-vinescout', {
        method: 'POST',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_id: testVScoutItemId,
          ebay_order_id: 'EBAY-ORD-12345',
          sale_price: 180.00,
          confirm: false
        })
      });

      const res = await onRequestPost({ request: req, env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET } });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('confirm: true'));
    });

    test('Reconciles match successfully when confirm: true is explicitly provided', async () => {
      const req = new Request('http://localhost/api/ebay/match-sold-vinescout', {
        method: 'POST',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirm: true,
          item_id: testVScoutItemId,
          ebay_order_id: 'EBAY-ORD-12345',
          sale_price: 180.00,
          buyer_shipping_paid: 5.00,
          actual_shipping_cost: 4.50
        })
      });

      const res = await onRequestPost({ request: req, env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET } });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify item status updated to Sold in database
      const updatedItem = mockDb._raw.prepare('SELECT status, attributes FROM auction_items WHERE id = ?').get(testVScoutItemId);
      assert.strictEqual(updatedItem.status, 'Sold');
      const attrs = JSON.parse(updatedItem.attributes);
      assert.strictEqual(attrs.outpost_liquidated, 1);
      assert.strictEqual(attrs.ebay_order_id, 'EBAY-ORD-12345');
    });

    test('Rejects negative actual_shipping_cost under MED-7 financial validation', async () => {
      const req = new Request('http://localhost/api/ebay/match-sold-vinescout', {
        method: 'POST',
        headers: {
          'Cookie': `auth_token=${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirm: true,
          item_id: testVScoutItemId,
          ebay_order_id: 'EBAY-ORD-12345',
          sale_price: 180.00,
          actual_shipping_cost: -5.00
        })
      });

      const res = await onRequestPost({ request: req, env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET } });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('actual_shipping_cost must be a non-negative number'));
    });
  });

  describe('Verification: Overlapping generic titles surface as low-confidence suggestions', () => {
    test('Two items sharing "2023 rookie card PSA 10" are marked high_confidence: false and require explicit confirmation', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url) => {
          const urlStr = String(url);
          if (urlStr.includes('/sell/fulfillment/v1/order')) {
            return {
              ok: true,
              json: async () => ({
                orders: [{
                  orderId: 'EBAY-ORDER-VERIFY-888',
                  creationDate: '2026-09-27T14:30:00.000Z',
                  buyer: { username: 'hoops_collector' },
                  orderPaymentStatus: 'PAID',
                  lineItems: [{
                    lineItemId: 'line-wemby-888',
                    legacyItemId: '556677889900',
                    title: '2023 rookie card PSA 10 Victor Wembanyama Hoops',
                    sku: 'SKU-WEMBY-888',
                    lineItemCost: { value: '185.00' }
                  }]
                }]
              })
            };
          }
          return { ok: false, status: 404 };
        };

        const vscoutItemId = 'item-vscout-stroud-888';
        mockDb._raw.prepare(`
          INSERT INTO auction_items (
            id, user_id, invoice_id, item_name, current_list_price, true_total_cost, status, attributes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          vscoutItemId,
          testUserId,
          'inv-med8-test',
          '2023 rookie card PSA 10 CJ Stroud Prizm',
          195.00,
          45.00,
          'Available',
          JSON.stringify({ asin: 'B0TESTSTROUD1', order_id: '111-8888888-0000002' })
        );

        const req = new Request('http://localhost/api/ebay/match-sold-vinescout', {
          method: 'GET',
          headers: {
            'Cookie': `auth_token=${authToken}`
          }
        });

        const res = await onRequestGet({ request: req, env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, TOKEN_ENCRYPTION_KEY: TEST_TOKEN_KEY, EBAY_SANDBOX: 'false' } });
        assert.strictEqual(res.status, 200);
        const data = await res.json();

        assert.strictEqual(data.suggested_matches.length, 1);
        const match = data.suggested_matches[0];

        // Numeric confidence score is present
        assert.strictEqual(typeof match.confidence, 'number');
        assert.ok(match.confidence < 0.80, `Expected confidence < 0.80, got ${match.confidence}`);

        // high_confidence boolean flag is explicitly false
        assert.strictEqual(match.high_confidence, false, 'Must be flagged as high_confidence: false to prevent auto-application');

        // Cannot be auto-applied without confirm: true
        const postReq = new Request('http://localhost/api/ebay/match-sold-vinescout', {
          method: 'POST',
          headers: {
            'Cookie': `auth_token=${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            item_id: match.vinescout_item.id,
            ebay_order_id: match.ebay_order.order_id,
            sale_price: match.ebay_order.price
            // confirm is omitted
          })
        });

        const postRes = await onRequestPost({ request: postReq, env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET } });
        assert.strictEqual(postRes.status, 400);
        const postData = await postRes.json();
        assert.ok(postData.error.includes('confirm: true'));

        // Item remains Available in the database (not auto-sold)
        const unappliedItem = mockDb._raw.prepare('SELECT status FROM auction_items WHERE id = ?').get(vscoutItemId);
        assert.strictEqual(unappliedItem.status, 'Available');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
