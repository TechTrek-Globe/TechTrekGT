import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';
import { onRequestPost } from '../functions/api/ebay/sync-all.js';

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

describe('[MED-14] sync-all Consolidated attributes JSON parse & stringify', () => {
  let mockDb;
  let env;
  const testUserId = 'usr_sync_all_med14_01';
  let authCookie;
  let originalFetch;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY,
      EBAY_CLIENT_ID: 'test-ebay-client-id',
      EBAY_CLIENT_SECRET: 'test-ebay-client-secret'
    };

    // Seed test user
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, token_version)
      VALUES ('${testUserId}', 'med14_tester@techtrekgt.test', 'salt:310000:hash', 'MED14 Tester', 'user', 0);
    `);

    // Seed valid eBay OAuth token
    const encryptedAccess = await encryptToken('valid_ebay_access_token_med14', TEST_TOKEN_ENCRYPTION_KEY);
    const encryptedRefresh = await encryptToken('valid_ebay_refresh_token_med14', TEST_TOKEN_ENCRYPTION_KEY);
    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (
        id, user_id, access_token, refresh_token,
        access_token_exp, refresh_token_exp, scopes, connected_at, last_refreshed_at
      ) VALUES (
        'tok_med14', '${testUserId}', '${encryptedAccess}', '${encryptedRefresh}',
        datetime('now', '+1 hour'), datetime('now', '+1 year'), 'sell.inventory sell.fulfillment', datetime('now'), datetime('now')
      );
    `);

    // Create session JWT cookie
    const token = await createToken({ userId: testUserId, email: 'med14_tester@techtrekgt.test' }, TEST_JWT_SECRET);
    authCookie = `auth_token=${token}`;

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('Active listing (not sold) preserves existing attributes and enriches ebay_image_url without duplication', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_med14_1', '${testUserId}', 'INV-MED14-01', 100.0);
    `);

    const initialAttrs = {
      asin: 'B0TESTASIN1',
      order_id: '111-222-333',
      tax_cost: 5.25,
      notes: 'Vine item initial'
    };

    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price, attributes
      ) VALUES (
        'item_med14_active', '${testUserId}', 'inv_med14_1', 'Active Vine Item', 15.0, 15.0,
        'Listed', 'eBay', '200000000001', 'SKU-VINE-ACTIVE', 29.99, '${JSON.stringify(initialAttrs)}'
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      // 1. eBay Active Listings
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <ActiveList>
              <ItemArray>
                <Item>
                  <ItemID>200000000001</ItemID>
                  <SKU>SKU-VINE-ACTIVE</SKU>
                  <Title>Active Vine Item</Title>
                  <BuyItNowPrice currencyID="USD">34.99</BuyItNowPrice>
                  <SellingStatus>
                    <ListingStatus>Active</ListingStatus>
                    <QuantitySold>0</QuantitySold>
                  </SellingStatus>
                  <PictureDetails>
                    <PictureURL>http://pics.ebay.com/test-active-image.jpg</PictureURL>
                  </PictureDetails>
                  <Quantity>1</Quantity>
                </Item>
              </ItemArray>
            </ActiveList>
          </GetMyeBaySellingResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      // 2. Recent orders (Fulfillment API)
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({ orders: [], total: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request('https://outpost.techtrekgt.test/api/ebay/sync-all', {
      method: 'POST',
      headers: { Cookie: authCookie }
    });

    const res = await onRequestPost({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.updated_count, 1);

    // Verify database attributes
    const row = mockDb._raw.prepare("SELECT * FROM auction_items WHERE id = 'item_med14_active'").get();
    assert.strictEqual(row.status, 'Listed');
    assert.strictEqual(row.current_list_price, 34.99);

    const parsedAttrs = JSON.parse(row.attributes);
    assert.strictEqual(parsedAttrs.asin, 'B0TESTASIN1');
    assert.strictEqual(parsedAttrs.order_id, '111-222-333');
    assert.strictEqual(parsedAttrs.tax_cost, 5.25);
    assert.strictEqual(parsedAttrs.notes, 'Vine item initial');
    assert.strictEqual(parsedAttrs.ebay_image_url, 'https://pics.ebay.com/test-active-image.jpg');
    assert.strictEqual(parsedAttrs.outpost_liquidated, undefined);
  });

  test('Active listing (sold) writes both ebay_image_url and VineScout write-back in single consolidation', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_med14_2', '${testUserId}', 'INV-MED14-02', 100.0);
    `);

    const initialAttrs = {
      asin: 'B0TESTASIN2',
      order_id: '444-555-666',
      etv: 49.99
    };

    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price, attributes
      ) VALUES (
        'item_med14_sold', '${testUserId}', 'inv_med14_2', 'Sold Vine Item', 20.0, 20.0,
        'Listed', 'eBay', '200000000002', 'SKU-VINE-SOLD', 59.99, '${JSON.stringify(initialAttrs)}'
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      // 1. eBay Active Listings returns item as Completed/Sold
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <ActiveList>
              <ItemArray>
                <Item>
                  <ItemID>200000000002</ItemID>
                  <SKU>SKU-VINE-SOLD</SKU>
                  <Title>Sold Vine Item</Title>
                  <BuyItNowPrice currencyID="USD">59.99</BuyItNowPrice>
                  <SellingStatus>
                    <ListingStatus>Completed</ListingStatus>
                    <QuantitySold>1</QuantitySold>
                  </SellingStatus>
                  <PictureDetails>
                    <PictureURL>http://pics.ebay.com/test-sold-image.jpg</PictureURL>
                  </PictureDetails>
                  <Quantity>1</Quantity>
                </Item>
              </ItemArray>
            </ActiveList>
          </GetMyeBaySellingResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      // 2. Orders search via GetOrders or Fulfillment API for listing
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetOrders') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetOrdersResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <OrderArray>
              <Order>
                <OrderID>EBAY-ORDER-MED14-01</OrderID>
                <OrderStatus>Completed</OrderStatus>
                <CreatedTime>2026-09-22T14:30:00.000Z</CreatedTime>
                <Total currencyID="USD">59.99</Total>
                <TransactionArray>
                  <Transaction>
                    <Item>
                      <ItemID>200000000002</ItemID>
                      <SKU>SKU-VINE-SOLD</SKU>
                    </Item>
                    <TransactionPrice currencyID="USD">59.99</TransactionPrice>
                    <QuantityPurchased>1</QuantityPurchased>
                  </Transaction>
                </TransactionArray>
              </Order>
            </OrderArray>
          </GetOrdersResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({ orders: [], total: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request('https://outpost.techtrekgt.test/api/ebay/sync-all', {
      method: 'POST',
      headers: { Cookie: authCookie }
    });

    const res = await onRequestPost({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.sold_recorded_count, 1);

    // Verify row
    const row = mockDb._raw.prepare("SELECT * FROM auction_items WHERE id = 'item_med14_sold'").get();
    assert.strictEqual(row.status, 'Sold');

    const parsedAttrs = JSON.parse(row.attributes);
    // Preserved initial attributes
    assert.strictEqual(parsedAttrs.asin, 'B0TESTASIN2');
    assert.strictEqual(parsedAttrs.order_id, '444-555-666');
    assert.strictEqual(parsedAttrs.etv, 49.99);

    // Consolidated enriched image AND VineScout write-back fields
    assert.strictEqual(parsedAttrs.ebay_image_url, 'https://pics.ebay.com/test-sold-image.jpg');
    assert.strictEqual(parsedAttrs.outpost_liquidated, 1);
    assert.strictEqual(parsedAttrs.sale_price, 59.99);
    assert.strictEqual(parsedAttrs.ebay_order_id, 'EBAY-ORDER-MED14-01');
    assert.strictEqual(parsedAttrs.sold_at, '2026-09-22T14:30:00.000Z');

    // Also verify auction_sales record was created
    const saleRow = mockDb._raw.prepare("SELECT * FROM auction_sales WHERE item_id = 'item_med14_sold'").get();
    assert.ok(saleRow, 'auction_sales record should exist');
    assert.strictEqual(saleRow.gross_sale_price, 59.99);
  });

  test('Recent orders match (Branch 1) performs single parse and write-back', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_med14_3', '${testUserId}', 'INV-MED14-03', 100.0);
    `);

    const initialAttrs = {
      asin: 'B0TESTASIN3',
      order_id: '777-888-999',
      cert_verified: true
    };

    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price, attributes
      ) VALUES (
        'item_med14_recent_order', '${testUserId}', 'inv_med14_3', 'Recent Order Vine Item', 25.0, 25.0,
        'Listed', 'eBay', '200000000003', 'SKU-VINE-RECENT', 45.00, '${JSON.stringify(initialAttrs)}'
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      // Active listings empty
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <ActiveList><ItemArray></ItemArray></ActiveList>
          </GetMyeBaySellingResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      // Fulfillment recent orders returns matching order
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({
          orders: [
            {
              orderId: 'EBAY-ORDER-RECENT-100',
              orderPaymentStatus: 'PAID',
              creationDate: '2026-09-25T11:00:00.000Z',
              pricingSummary: { deliveryCost: { value: '5.00' } },
              lineItems: [
                {
                  lineItemId: 'LI-100',
                  legacyItemId: '200000000003',
                  sku: 'SKU-VINE-RECENT',
                  lineItemCost: { value: '45.00' }
                }
              ]
            }
          ],
          total: 1
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request('https://outpost.techtrekgt.test/api/ebay/sync-all', {
      method: 'POST',
      headers: { Cookie: authCookie }
    });

    const res = await onRequestPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const row = mockDb._raw.prepare("SELECT * FROM auction_items WHERE id = 'item_med14_recent_order'").get();
    const parsedAttrs = JSON.parse(row.attributes);

    assert.strictEqual(parsedAttrs.asin, 'B0TESTASIN3');
    assert.strictEqual(parsedAttrs.order_id, '777-888-999');
    assert.strictEqual(parsedAttrs.cert_verified, true);
    assert.strictEqual(parsedAttrs.outpost_liquidated, 1);
    assert.strictEqual(parsedAttrs.sale_price, 45.00);
    assert.strictEqual(parsedAttrs.ebay_order_id, 'EBAY-ORDER-RECENT-100');
    assert.strictEqual(parsedAttrs.sold_at, '2026-09-25T11:00:00.000Z');
  });

  test('Fallback single listing (Branch 3) correctly combines image and sold write-back in attrs', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_med14_4', '${testUserId}', 'INV-MED14-04', 100.0);
    `);

    const initialAttrs = {
      asin: 'B0TESTASIN4',
      order_id: '123-456-789'
    };

    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price, attributes
      ) VALUES (
        'item_med14_fallback', '${testUserId}', 'inv_med14_4', 'Fallback Vine Item', 30.0, 30.0,
        'Listed', 'eBay', '200000000004', 'SKU-VINE-FALLBACK', 65.00, '${JSON.stringify(initialAttrs)}'
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      // Active listings empty
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <ActiveList><ItemArray></ItemArray></ActiveList>
          </GetMyeBaySellingResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      // Recent orders empty
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({ orders: [], total: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fallback single item via GetItem
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetItem') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <Item>
              <ItemID>200000000004</ItemID>
              <SKU>SKU-VINE-FALLBACK</SKU>
              <Title>Fallback Vine Item</Title>
              <SellingStatus>
                <ListingStatus>Completed</ListingStatus>
                <QuantitySold>1</QuantitySold>
              </SellingStatus>
              <PictureDetails>
                <PictureURL>http://pics.ebay.com/fallback-image.jpg</PictureURL>
              </PictureDetails>
            </Item>
          </GetItemResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      // Orders lookup for fallback
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetOrders') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetOrdersResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <OrderArray>
              <Order>
                <OrderID>EBAY-ORDER-FALLBACK-01</OrderID>
                <OrderStatus>Completed</OrderStatus>
                <CreatedTime>2026-09-24T18:00:00.000Z</CreatedTime>
                <Total currencyID="USD">65.00</Total>
                <TransactionArray>
                  <Transaction>
                    <Item>
                      <ItemID>200000000004</ItemID>
                      <SKU>SKU-VINE-FALLBACK</SKU>
                    </Item>
                    <TransactionPrice currencyID="USD">65.00</TransactionPrice>
                    <QuantityPurchased>1</QuantityPurchased>
                  </Transaction>
                </TransactionArray>
              </Order>
            </OrderArray>
          </GetOrdersResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request('https://outpost.techtrekgt.test/api/ebay/sync-all', {
      method: 'POST',
      headers: { Cookie: authCookie }
    });

    const res = await onRequestPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const row = mockDb._raw.prepare("SELECT * FROM auction_items WHERE id = 'item_med14_fallback'").get();
    const parsedAttrs = JSON.parse(row.attributes);

    assert.strictEqual(parsedAttrs.asin, 'B0TESTASIN4');
    assert.strictEqual(parsedAttrs.order_id, '123-456-789');
    assert.strictEqual(parsedAttrs.ebay_image_url, 'https://pics.ebay.com/fallback-image.jpg');
    assert.strictEqual(parsedAttrs.outpost_liquidated, 1);
    assert.strictEqual(parsedAttrs.sale_price, 65.00);
    assert.strictEqual(parsedAttrs.ebay_order_id, 'EBAY-ORDER-FALLBACK-01');
    assert.strictEqual(parsedAttrs.sold_at, '2026-09-24T18:00:00.000Z');
  });

  test('Handles null, invalid JSON, or empty attributes gracefully without crash', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_med14_5', '${testUserId}', 'INV-MED14-05', 100.0);
    `);

    // Item with invalid JSON attributes string
    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price, attributes
      ) VALUES (
        'item_med14_bad_json', '${testUserId}', 'inv_med14_5', 'Bad JSON Vine Item', 10.0, 10.0,
        'Listed', 'eBay', '200000000005', 'SKU-VINE-BADJSON', 20.00, 'NOT_VALID_JSON{['
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <ActiveList>
              <ItemArray>
                <Item>
                  <ItemID>200000000005</ItemID>
                  <SKU>SKU-VINE-BADJSON</SKU>
                  <Title>Bad JSON Vine Item</Title>
                  <BuyItNowPrice currencyID="USD">25.00</BuyItNowPrice>
                  <SellingStatus><ListingStatus>Active</ListingStatus></SellingStatus>
                  <PictureDetails><PictureURL>http://pics.ebay.com/bad-json-img.jpg</PictureURL></PictureDetails>
                </Item>
              </ItemArray>
            </ActiveList>
          </GetMyeBaySellingResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }
      return new Response('{"orders":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request('https://outpost.techtrekgt.test/api/ebay/sync-all', {
      method: 'POST',
      headers: { Cookie: authCookie }
    });

    const res = await onRequestPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const row = mockDb._raw.prepare("SELECT * FROM auction_items WHERE id = 'item_med14_bad_json'").get();
    const parsedAttrs = JSON.parse(row.attributes);
    assert.strictEqual(parsedAttrs.ebay_image_url, 'https://pics.ebay.com/bad-json-img.jpg');
  });
});
