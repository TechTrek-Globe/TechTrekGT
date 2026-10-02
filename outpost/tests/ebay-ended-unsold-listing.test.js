import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';
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

describe('eBay Ended/Unsold Listing Safeguards', () => {
  let mockDb;
  let env;
  const userId = 'usr_ended_seller_01';
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

    const rawToken = await createToken({ userId, email: 'seller@techtrekgt.test' }, TEST_JWT_SECRET, 3600);
    authCookie = `auth_token=${rawToken}`;

    const encAccess = await encryptToken('mock_ebay_access_token', TEST_TOKEN_ENCRYPTION_KEY);
    const encRefresh = await encryptToken('mock_ebay_refresh_token', TEST_TOKEN_ENCRYPTION_KEY);
    const futureExp = new Date(Date.now() + 7200000).toISOString();

    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, connected_at)
      VALUES ('tok_01', '${userId}', '${encAccess}', '${encRefresh}', '${futureExp}', '${futureExp}', 'sell.inventory', datetime('now'));
    `);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('sync-item does NOT mark item Sold when listing is Completed with QuantitySold=0', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_ended_1', '${userId}', 'INV-ENDED-01', 50.0);
    `);

    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price
      ) VALUES (
        'item_ended_01', '${userId}', 'inv_ended_1', '2020 Topps Heritage Baseball Hanger Box', 24.49, 24.49,
        'Listed', 'eBay', '336816301114', 'OP-260727-6NN3', 50.00
      );
    `);

    // Mock eBay API: GetItem returns Completed with QuantitySold=0, GetOrders returns 0 orders
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      if (urlStr.includes('ws/api.dll')) {
        const callName = options.headers?.['X-EBAY-API-CALL-NAME'];
        if (callName === 'GetItem') {
          return new Response(`
            <?xml version="1.0" encoding="UTF-8"?>
            <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <Item>
                <ItemID>336816301114</ItemID>
                <Title>2020 Topps Heritage High Number Baseball Hanger Box Sealed</Title>
                <SKU>OP-260727-6NN3</SKU>
                <CurrentPrice currencyID="USD">50.00</CurrentPrice>
                <ListingStatus>Completed</ListingStatus>
                <Quantity>1</Quantity>
                <QuantitySold>0</QuantitySold>
              </Item>
            </GetItemResponse>
          `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
        }
        if (callName === 'GetOrders' || callName === 'GetItemTransactions') {
          return new Response(`
            <?xml version="1.0" encoding="UTF-8"?>
            <GetOrdersResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <OrderArray></OrderArray>
            </GetOrdersResponse>
          `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
        }
      }

      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({ orders: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    };

    const req = new Request('http://localhost/api/ebay/sync-item', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie
      },
      body: JSON.stringify({ item_id: 'item_ended_01' })
    });

    const res = await syncItemPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.is_sold, false);
    assert.strictEqual(body.auto_saved, false);
    assert.strictEqual(body.item.status, 'Unsold');

    // Confirm no sale record was created
    const salesCount = mockDb._raw.prepare(
      "SELECT COUNT(*) AS count FROM auction_sales WHERE item_id = 'item_ended_01'"
    ).get().count;
    assert.strictEqual(salesCount, 0);
  });

  test('sync-item preserves Kept for Self status when listing is Completed with QuantitySold=0', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_ended_2', '${userId}', 'INV-ENDED-02', 50.0);
    `);

    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price
      ) VALUES (
        'item_ended_02', '${userId}', 'inv_ended_2', 'Kept Memorabilia Box', 25.00, 25.00,
        'Kept for Self', 'eBay', '336816301115', 'OP-KEPT-01', 50.00
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('ws/api.dll')) {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <Item>
              <ItemID>336816301115</ItemID>
              <Title>Kept Memorabilia Box</Title>
              <CurrentPrice currencyID="USD">50.00</CurrentPrice>
              <ListingStatus>Completed</ListingStatus>
              <QuantitySold>0</QuantitySold>
            </Item>
          </GetItemResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }
      return new Response(JSON.stringify({ orders: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request('http://localhost/api/ebay/sync-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': authCookie },
      body: JSON.stringify({ item_id: 'item_ended_02' })
    });

    const res = await syncItemPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.is_sold, false);
    assert.strictEqual(body.item.status, 'Kept for Self');
  });

  test('sync-item clears phantom sale and restores status when syncing an item previously marked Sold in error', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_ended_3', '${userId}', 'INV-ENDED-03', 50.0);
    `);

    // Item was mistakenly marked Sold with actual_sell_price and a phantom auction_sales row
    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price, actual_sell_price, date_sold
      ) VALUES (
        'item_ended_03', '${userId}', 'inv_ended_3', 'Mistakenly Sold Box', 24.49, 24.49,
        'Sold', 'eBay', '336816301116', 'OP-MISTAKE-01', 50.00, 50.00, '2026-10-02'
      );
    `);

    mockDb._raw.exec(`
      INSERT INTO auction_sales (
        id, user_id, item_id, sale_date, platform, gross_sale_price, actual_shipping_cost,
        platform_fee_pct, platform_flat_fee, net_proceeds, true_total_cost, net_profit, roi_pct
      ) VALUES (
        'sale_phantom_01', '${userId}', 'item_ended_03', '2026-10-02', 'eBay', 50.00, 0,
        0.136, 0.40, 42.80, 24.49, 18.31, 0.747
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('ws/api.dll')) {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <Item>
              <ItemID>336816301116</ItemID>
              <Title>Mistakenly Sold Box</Title>
              <CurrentPrice currencyID="USD">50.00</CurrentPrice>
              <ListingStatus>Completed</ListingStatus>
              <QuantitySold>0</QuantitySold>
            </Item>
          </GetItemResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }
      return new Response(JSON.stringify({ orders: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request('http://localhost/api/ebay/sync-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': authCookie },
      body: JSON.stringify({ item_id: 'item_ended_03' })
    });

    const res = await syncItemPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.is_sold, false);
    assert.strictEqual(body.item.status, 'Unsold');
    assert.strictEqual(body.item.actual_sell_price, null);
    assert.strictEqual(body.item.date_sold, null);

    // Phantom sale must be deleted
    const saleRow = mockDb._raw.prepare(
      "SELECT * FROM auction_sales WHERE item_id = 'item_ended_03'"
    ).get();
    assert.strictEqual(saleRow, undefined);
  });

  test('sync-all marks ended listing with QuantitySold=0 as Unsold without recording a sale', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_ended_4', '${userId}', 'INV-ENDED-04', 50.0);
    `);

    mockDb._raw.exec(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, true_total_cost,
        status, platform, ebay_listing_id, sku, current_list_price
      ) VALUES (
        'item_ended_04', '${userId}', 'inv_ended_4', 'Batch Ended Item', 20.00, 20.00,
        'Listed', 'eBay', '336816301117', 'OP-BATCH-01', 50.00
      );
    `);

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      if (urlStr.includes('ws/api.dll')) {
        const callName = options.headers?.['X-EBAY-API-CALL-NAME'];
        if (callName === 'GetMyeBaySelling') {
          return new Response(`
            <?xml version="1.0" encoding="UTF-8"?>
            <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <ActiveList>
                <ItemArray>
                  <Item>
                    <ItemID>336816301117</ItemID>
                    <SKU>OP-BATCH-01</SKU>
                    <Title>Batch Ended Item</Title>
                    <BuyItNowPrice currencyID="USD">50.00</BuyItNowPrice>
                    <ListingStatus>Completed</ListingStatus>
                    <QuantitySold>0</QuantitySold>
                  </Item>
                </ItemArray>
              </ActiveList>
            </GetMyeBaySellingResponse>
          `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
        }
      }

      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({ orders: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    };

    const req = new Request('http://localhost/api/ebay/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': authCookie }
    });

    const res = await syncAllPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.sold_recorded_count, 0);

    const itemRow = mockDb._raw.prepare(
      "SELECT status FROM auction_items WHERE id = 'item_ended_04'"
    ).get();
    assert.strictEqual(itemRow.status, 'Unsold');

    const salesCount = mockDb._raw.prepare(
      "SELECT COUNT(*) AS count FROM auction_sales WHERE item_id = 'item_ended_04'"
    ).get().count;
    assert.strictEqual(salesCount, 0);
  });
});
