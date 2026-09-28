import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';
import { fetchEbayOrderForListing } from '../functions/api/ebay/tokenHelper.js';
import { onRequestPost as syncItemPost } from '../functions/api/ebay/sync-item.js';
import { onRequestPost as syncAllPost } from '../functions/api/ebay/sync-all.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const TEST_TOKEN_ENCRYPTION_KEY = 'test-dedicated-token-encryption-key-32b';

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
    }
  };
}

describe('[MED-2] Safe eBay Order/Listing Matching & Pending Confirmation Alerts', () => {
  let mockDb;
  let env;
  const userId = 'usr_med2_seller_01';
  let authCookie;
  let originalFetch;

  beforeEach(async () => {
    mockDb = createMockD1();
    originalFetch = globalThis.fetch;

    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY,
      EBAY_SANDBOX: 'false'
    };

    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin, created_at)
      VALUES ('${userId}', 'seller@techtrekgt.test', 'hash', 'Seller', 'user', 0, datetime('now'));
    `);

    const encAccess = await encryptToken('ebay_test_access_token', TEST_TOKEN_ENCRYPTION_KEY);
    const encRefresh = await encryptToken('ebay_test_refresh_token', TEST_TOKEN_ENCRYPTION_KEY);
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();

    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok_med2_1', '${userId}', '${encAccess}', '${encRefresh}', '${futureExp}', '${futureExp}', 'sell.inventory sell.fulfillment');
    `);

    const token = await createToken({ userId, email: 'seller@techtrekgt.test' }, TEST_JWT_SECRET, 3600);
    authCookie = `auth_token=${token}`;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('fetchEbayOrderForListing sets isExactMatch: true on ID/SKU match and false on title similarity match', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({
          orders: [{
            orderId: 'ORDER-101',
            creationDate: '2026-09-28T12:00:00.000Z',
            buyer: { username: 'buyer_test' },
            orderPaymentStatus: 'PAID',
            lineItems: [{
              lineItemId: 'line-exact-1',
              legacyItemId: '123456789012',
              title: '2023 Panini Prizm CJ Stroud Silver Rookie PSA 10',
              sku: 'SKU-EXACT-001',
              lineItemCost: { value: '250.00' }
            }]
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not found', { status: 404 });
    };

    // 1. Exact match by listing ID
    const exactMatchId = await fetchEbayOrderForListing(env, 'tok', '123456789012', 'SKU-OTHER', 'Different Title');
    assert.ok(exactMatchId);
    assert.strictEqual(exactMatchId.isExactMatch, true, 'Matching by legacyItemId must return isExactMatch: true');

    // 2. Exact match by SKU
    const exactMatchSku = await fetchEbayOrderForListing(env, 'tok', null, 'SKU-EXACT-001', 'Different Title');
    assert.ok(exactMatchSku);
    assert.strictEqual(exactMatchSku.isExactMatch, true, 'Matching by SKU must return isExactMatch: true');

    // 3. Title similarity match only (different ID and SKU)
    const titleOnlyMatch = await fetchEbayOrderForListing(env, 'tok', '999999999999', 'SKU-UNRELATED-999', '2023 Panini Prizm CJ Stroud Silver Rookie PSA 10');
    assert.ok(titleOnlyMatch);
    assert.strictEqual(titleOnlyMatch.isExactMatch, false, 'Matching by title similarity alone must return isExactMatch: false');
  });

  test('POST /api/ebay/sync-item creates PENDING_SALE_MATCH alert and does NOT auto-record sale on title match', async () => {
    const itemId = 'item-med2-stroud';
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv-med2-1', '${userId}', 'INV-MED2-01', 100.0);
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, sku, current_list_price, unit_price, status, platform, created_at
      ) VALUES (
        '${itemId}', '${userId}', 'inv-med2-1', '2023 Panini Prizm CJ Stroud Silver Rookie PSA 10', 'SKU-LOCAL-111', 250.00, 50.00, 'Listed', 'eBay', datetime('now')
      );
    `);

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({
          orders: [{
            orderId: 'ORDER-TITLE-999',
            creationDate: '2026-09-28T14:00:00.000Z',
            buyer: { username: 'lucky_buyer' },
            orderPaymentStatus: 'PAID',
            lineItems: [{
              lineItemId: 'line-unmatched-id',
              legacyItemId: '888777666555',
              title: '2023 Panini Prizm CJ Stroud Silver Rookie PSA 10',
              sku: 'SKU-ORDER-DIFFERENT',
              lineItemCost: { value: '275.00' }
            }]
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not found', { status: 404 });
    };

    const req = new Request(`https://outpost.techtrekgt.test/api/ebay/sync-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie
      },
      body: JSON.stringify({ item_id: itemId })
    });

    const res = await syncItemPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.is_sold, false, 'Item must NOT be marked is_sold automatically');
    assert.strictEqual(data.pending_review, true, 'Response must indicate pending_review: true');
    assert.ok(data.alert_id, 'Response must return created alert_id');

    // Verify auction_sales row was NOT created
    const saleRow = mockDb._raw.prepare('SELECT * FROM auction_sales WHERE item_id = ?').get(itemId);
    assert.strictEqual(saleRow, undefined, 'No auction_sales row should be inserted for title-similarity match');

    // Verify item remains 'Listed'
    const itemRow = mockDb._raw.prepare('SELECT status FROM auction_items WHERE id = ?').get(itemId);
    assert.strictEqual(itemRow.status, 'Listed', 'Item status must remain Listed pending review');

    // Verify auction_market_alerts row was created with PENDING_SALE_MATCH
    const alertRow = mockDb._raw.prepare('SELECT * FROM auction_market_alerts WHERE item_id = ? AND alert_type = ?').get(itemId, 'PENDING_SALE_MATCH');
    assert.ok(alertRow, 'auction_market_alerts must contain a PENDING_SALE_MATCH record');
    assert.strictEqual(alertRow.user_id, userId);
    assert.strictEqual(alertRow.new_value, 275.00);
  });

  test('POST /api/ebay/sync-item automatically records sale on exact SKU match', async () => {
    const itemId = 'item-med2-exact';
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv-med2-2', '${userId}', 'INV-MED2-02', 100.0);
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, sku, current_list_price, unit_price, status, platform, created_at
      ) VALUES (
        '${itemId}', '${userId}', 'inv-med2-2', '2023 Panini Prizm CJ Stroud Silver Rookie PSA 10', 'SKU-EXACT-MATCH', 250.00, 50.00, 'Listed', 'eBay', datetime('now')
      );
    `);

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({
          orders: [{
            orderId: 'ORDER-EXACT-200',
            creationDate: '2026-09-28T14:00:00.000Z',
            buyer: { username: 'verified_buyer' },
            orderPaymentStatus: 'PAID',
            lineItems: [{
              lineItemId: 'line-exact-id',
              legacyItemId: '111222333444',
              title: '2023 Panini Prizm CJ Stroud Silver Rookie PSA 10',
              sku: 'SKU-EXACT-MATCH',
              lineItemCost: { value: '260.00' }
            }]
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not found', { status: 404 });
    };

    const req = new Request(`https://outpost.techtrekgt.test/api/ebay/sync-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie
      },
      body: JSON.stringify({ item_id: itemId })
    });

    const res = await syncItemPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.is_sold, true, 'Item should be marked is_sold on exact match');
    assert.strictEqual(data.auto_saved, true);

    // Verify auction_sales row WAS created
    const saleRow = mockDb._raw.prepare('SELECT * FROM auction_sales WHERE item_id = ?').get(itemId);
    assert.ok(saleRow, 'auction_sales row must be created for exact SKU match');
    assert.strictEqual(saleRow.gross_sale_price, 260.00);

    // Verify item status is 'Sold'
    const itemRow = mockDb._raw.prepare('SELECT status FROM auction_items WHERE id = ?').get(itemId);
    assert.strictEqual(itemRow.status, 'Sold');

    // Verify NO pending review alert was created
    const alertRow = mockDb._raw.prepare('SELECT * FROM auction_market_alerts WHERE item_id = ? AND alert_type = ?').get(itemId, 'PENDING_SALE_MATCH');
    assert.strictEqual(alertRow, undefined);
  });

  test('POST /api/ebay/sync-all creates PENDING_SALE_MATCH alert and does NOT auto-record sale on title-only match', async () => {
    const itemId = 'item-med2-syncall-stroud';
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv-med2-3', '${userId}', 'INV-MED2-03', 100.0);
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, sku, ebay_listing_id, current_list_price, unit_price, status, platform, created_at
      ) VALUES (
        '${itemId}', '${userId}', 'inv-med2-3', '2023 Panini Prizm CJ Stroud Silver Rookie PSA 10', 'SKU-SYNCALL-111', '500000000001', 250.00, 50.00, 'Listed', 'eBay', datetime('now')
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      // Trading API GetMyeBaySelling (active & completed)
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <ActiveList>
              <ItemArray>
                <Item>
                  <ItemID>500000000001</ItemID>
                  <SKU>SKU-SYNCALL-111</SKU>
                  <Title>2023 Panini Prizm CJ Stroud Silver Rookie PSA 10</Title>
                  <BuyItNowPrice currencyID="USD">250.00</BuyItNowPrice>
                  <SellingStatus>
                    <ListingStatus>Completed</ListingStatus>
                    <QuantitySold>1</QuantitySold>
                  </SellingStatus>
                  <Quantity>1</Quantity>
                </Item>
              </ItemArray>
            </ActiveList>
          </GetMyeBaySellingResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      // Fulfillment recent orders: matches by title, but has different listing ID and SKU
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({
          orders: [{
            orderId: 'ORDER-SYNCALL-TITLE-888',
            creationDate: '2026-09-28T15:00:00.000Z',
            buyer: { username: 'syncall_buyer' },
            orderPaymentStatus: 'PAID',
            lineItems: [{
              lineItemId: 'line-syncall-other',
              legacyItemId: '999888777111',
              title: '2023 Panini Prizm CJ Stroud Silver Rookie PSA 10',
              sku: 'SKU-ORDER-UNMATCHED',
              lineItemCost: { value: '250.00' }
            }]
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request(`https://outpost.techtrekgt.test/api/ebay/sync-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie
      }
    });

    const res = await syncAllPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.sold_recorded_count, 0, 'No sales should be recorded automatically for title-similarity match');

    // Verify auction_sales row was NOT created
    const saleRow = mockDb._raw.prepare('SELECT * FROM auction_sales WHERE item_id = ?').get(itemId);
    assert.strictEqual(saleRow, undefined, 'auction_sales must NOT contain a row for title-similarity match');

    // Verify auction_market_alerts row was created with PENDING_SALE_MATCH
    const alertRow = mockDb._raw.prepare('SELECT * FROM auction_market_alerts WHERE item_id = ? AND alert_type = ?').get(itemId, 'PENDING_SALE_MATCH');
    assert.ok(alertRow, 'auction_market_alerts must contain a PENDING_SALE_MATCH alert for human confirmation');
    assert.strictEqual(alertRow.user_id, userId);
    assert.strictEqual(alertRow.new_value, 250.00);
  });
});
