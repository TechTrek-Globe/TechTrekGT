import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';
import { onRequestGet as activeListingsGet } from '../functions/api/ebay/active-listings.js';
import { onRequestGet as findListingsGet } from '../functions/api/ebay/find-listings.js';
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

describe('[MED-15] eBay Active Listings Caching & Invalidation Engine', () => {
  let mockDb;
  let env;
  const testUserId = 'usr_listings_cache_01';
  let authCookie;
  let originalFetch;
  let ebayTradingCallCount = 0;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY,
      EBAY_CLIENT_ID: 'test-ebay-client-id',
      EBAY_CLIENT_SECRET: 'test-ebay-client-secret'
    };

    ebayTradingCallCount = 0;

    // Seed test user
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, token_version)
      VALUES ('${testUserId}', 'cache_tester@techtrekgt.test', 'salt:310000:hash', 'Cache Tester', 'user', 0);
    `);

    // Seed valid eBay OAuth token
    const encryptedAccess = await encryptToken('valid_ebay_access_token_med15', TEST_TOKEN_ENCRYPTION_KEY);
    const encryptedRefresh = await encryptToken('valid_ebay_refresh_token_med15', TEST_TOKEN_ENCRYPTION_KEY);
    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (
        id, user_id, access_token, refresh_token,
        access_token_exp, refresh_token_exp, scopes, connected_at, last_refreshed_at
      ) VALUES (
        'tok_med15', '${testUserId}', '${encryptedAccess}', '${encryptedRefresh}',
        datetime('now', '+1 hour'), datetime('now', '+1 year'), 'sell.inventory sell.fulfillment', datetime('now'), datetime('now')
      );
    `);

    // Create session JWT cookie
    const token = await createToken({ userId: testUserId, email: 'cache_tester@techtrekgt.test' }, TEST_JWT_SECRET);
    authCookie = `auth_token=${token}`;

    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      // Trading API GetMyeBaySelling
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
        ebayTradingCallCount++;
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <ActiveList>
              <ItemArray>
                <Item>
                  <ItemID>300000000001</ItemID>
                  <SKU>SKU-CACHE-01</SKU>
                  <Title>Cached Item 1 Title</Title>
                  <BuyItNowPrice currencyID="USD">39.99</BuyItNowPrice>
                  <SellingStatus>
                    <ListingStatus>Active</ListingStatus>
                    <QuantitySold>0</QuantitySold>
                  </SellingStatus>
                  <PictureDetails>
                    <PictureURL>https://pics.ebay.com/cache1.jpg</PictureURL>
                  </PictureDetails>
                  <Quantity>1</Quantity>
                </Item>
              </ItemArray>
            </ActiveList>
          </GetMyeBaySellingResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      // Single item detail
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetItem') {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Ack>Success</Ack>
            <Item>
              <ItemID>300000000001</ItemID>
              <SKU>SKU-CACHE-01</SKU>
              <Title>Cached Item 1 Title</Title>
              <BuyItNowPrice currencyID="USD">44.99</BuyItNowPrice>
              <SellingStatus><ListingStatus>Active</ListingStatus></SellingStatus>
              <Quantity>1</Quantity>
            </Item>
          </GetItemResponse>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }

      // Fulfillment recent orders
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({ orders: [], total: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Inventory API
      if (urlStr.includes('/sell/inventory/v1/inventory_item')) {
        return new Response(JSON.stringify({ inventoryItems: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('GET /api/ebay/active-listings: caches results and second call serves from cache without hitting eBay', async () => {
    // 1. First call: cache miss -> triggers upstream eBay fetch
    const req1 = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
      headers: { Cookie: authCookie }
    });
    const res1 = await activeListingsGet({ request: req1, env });
    assert.strictEqual(res1.status, 200);
    const body1 = await res1.json();

    assert.strictEqual(body1.cached, false);
    assert.strictEqual(body1.total, 1);
    assert.strictEqual(body1.listings[0].listing_id, '300000000001');
    assert.strictEqual(ebayTradingCallCount, 1);

    // Verify row was stored in ebay_listings_cache table
    const cacheRow = mockDb._raw.prepare("SELECT * FROM ebay_listings_cache WHERE user_id = ?").get(testUserId);
    assert.ok(cacheRow, 'ebay_listings_cache row should exist');
    const cachedListings = JSON.parse(cacheRow.listings_json);
    assert.strictEqual(cachedListings.length, 1);
    assert.strictEqual(cachedListings[0].sku, 'SKU-CACHE-01');

    // 2. Second call within TTL window: cache hit -> served from D1 without eBay API call
    const req2 = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
      headers: { Cookie: authCookie }
    });
    const res2 = await activeListingsGet({ request: req2, env });
    assert.strictEqual(res2.status, 200);
    const body2 = await res2.json();

    assert.strictEqual(body2.cached, true);
    assert.strictEqual(body2.total, 1);
    assert.strictEqual(body2.listings[0].listing_id, '300000000001');
    assert.strictEqual(ebayTradingCallCount, 1, 'Upstream eBay API should NOT be called on cache hit');
  });

  test('GET /api/ebay/active-listings: force=true bypasses fresh cache', async () => {
    // Populate cache
    const req1 = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
      headers: { Cookie: authCookie }
    });
    await activeListingsGet({ request: req1, env });
    assert.strictEqual(ebayTradingCallCount, 1);

    // Call with force=true
    const reqForce = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings?force=true', {
      headers: { Cookie: authCookie }
    });
    const resForce = await activeListingsGet({ request: reqForce, env });
    assert.strictEqual(resForce.status, 200);
    const bodyForce = await resForce.json();

    assert.strictEqual(bodyForce.cached, false);
    assert.strictEqual(ebayTradingCallCount, 2, 'force=true must re-fetch upstream');
  });

  test('GET /api/ebay/active-listings: re-fetches when cache TTL expires (>15 minutes)', async () => {
    // Populate cache
    const req1 = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
      headers: { Cookie: authCookie }
    });
    await activeListingsGet({ request: req1, env });
    assert.strictEqual(ebayTradingCallCount, 1);

    // Artificially age the cache row to 16 minutes ago
    mockDb._raw.exec(`
      UPDATE ebay_listings_cache
      SET fetched_at = datetime('now', '-16 minutes')
      WHERE user_id = '${testUserId}'
    `);

    // Call again -> expired -> triggers re-fetch
    const reqExpired = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
      headers: { Cookie: authCookie }
    });
    const resExpired = await activeListingsGet({ request: reqExpired, env });
    assert.strictEqual(resExpired.status, 200);
    const bodyExpired = await resExpired.json();

    assert.strictEqual(bodyExpired.cached, false);
    assert.strictEqual(ebayTradingCallCount, 2, 'Expired cache must re-fetch upstream');
  });

  test('GET /api/ebay/find-listings: utilizes listings cache and performs fuzzy match without redundant API calls', async () => {
    // Seed an internal item ready to match
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_med15_1', '${testUserId}', 'INV-MED15-01', 50.0);
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, status, platform
      ) VALUES (
        'item_med15_find', '${testUserId}', 'inv_med15_1', 'Cached Item 1 Title', 20.0, 'Listed', 'eBay'
      );
    `);

    // 1. First call: cache miss -> calls eBay API
    const req1 = new Request('https://outpost.techtrekgt.test/api/ebay/find-listings', {
      headers: { Cookie: authCookie }
    });
    const res1 = await findListingsGet({ request: req1, env });
    assert.strictEqual(res1.status, 200);
    const body1 = await res1.json();
    assert.strictEqual(body1.cached, false);
    assert.strictEqual(body1.match_count, 1);
    assert.strictEqual(ebayTradingCallCount, 1);

    // 2. Second call: cache hit -> uses cached listings without calling eBay
    const req2 = new Request('https://outpost.techtrekgt.test/api/ebay/find-listings', {
      headers: { Cookie: authCookie }
    });
    const res2 = await findListingsGet({ request: req2, env });
    assert.strictEqual(res2.status, 200);
    const body2 = await res2.json();
    assert.strictEqual(body2.cached, true);
    assert.strictEqual(body2.match_count, 1);
    assert.strictEqual(ebayTradingCallCount, 1, 'find-listings should reuse cached listings');
  });

  test('POST /api/ebay/sync-item: invalidates listings cache', async () => {
    // Populate cache first
    const reqListings = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
      headers: { Cookie: authCookie }
    });
    await activeListingsGet({ request: reqListings, env });
    assert.strictEqual(ebayTradingCallCount, 1);

    let cacheRow = mockDb._raw.prepare("SELECT * FROM ebay_listings_cache WHERE user_id = ?").get(testUserId);
    assert.ok(cacheRow, 'Cache should exist prior to sync-item');

    // Seed item to sync
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_med15_2', '${testUserId}', 'INV-MED15-02', 50.0);
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, status, platform, ebay_listing_id
      ) VALUES (
        'item_med15_sync', '${testUserId}', 'inv_med15_2', 'Item to Sync', 20.0, 'Listed', 'eBay', '300000000001'
      );
    `);

    // Call POST /api/ebay/sync-item
    const reqSyncItem = new Request('https://outpost.techtrekgt.test/api/ebay/sync-item', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie
      },
      body: JSON.stringify({ item_id: 'item_med15_sync' })
    });
    const resSyncItem = await syncItemPost({ request: reqSyncItem, env });
    assert.strictEqual(resSyncItem.status, 200);

    // Verify cache was invalidated
    cacheRow = mockDb._raw.prepare("SELECT * FROM ebay_listings_cache WHERE user_id = ?").get(testUserId);
    assert.strictEqual(cacheRow, undefined, 'sync-item must invalidate ebay_listings_cache');

    // Next call to active-listings triggers fresh eBay fetch
    const reqNext = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
      headers: { Cookie: authCookie }
    });
    const resNext = await activeListingsGet({ request: reqNext, env });
    assert.strictEqual(resNext.status, 200);
    const bodyNext = await resNext.json();
    assert.strictEqual(bodyNext.cached, false);
    assert.strictEqual(ebayTradingCallCount, 2, 'Must re-fetch after sync-item cache invalidation');
  });

  test('POST /api/ebay/sync-all: overwrites listings cache with fresh data', async () => {
    // Populate cache with stale data
    const staleListings = [{ listing_id: '999999999999', title: 'Stale Pre-Sync Listing', price: 9.99 }];
    mockDb._raw.exec(`
      INSERT INTO ebay_listings_cache (user_id, listings_json, fetched_at)
      VALUES ('${testUserId}', '${JSON.stringify(staleListings)}', datetime('now', '-5 minutes'));
    `);

    // Seed item mapped to eBay
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_med15_3', '${testUserId}', 'INV-MED15-03', 50.0);
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, unit_price, status, platform, ebay_listing_id, sku
      ) VALUES (
        'item_med15_syncall', '${testUserId}', 'inv_med15_3', 'Sync All Item', 20.0, 'Listed', 'eBay', '300000000001', 'SKU-CACHE-01'
      );
    `);

    // Call POST /api/ebay/sync-all
    const reqSyncAll = new Request('https://outpost.techtrekgt.test/api/ebay/sync-all', {
      method: 'POST',
      headers: { Cookie: authCookie }
    });
    const resSyncAll = await syncAllPost({ request: reqSyncAll, env });
    assert.strictEqual(resSyncAll.status, 200);

    // Verify cache was overwritten with live data (item 300000000001, not 999999999999)
    const cacheRow = mockDb._raw.prepare("SELECT * FROM ebay_listings_cache WHERE user_id = ?").get(testUserId);
    assert.ok(cacheRow, 'Cache row must exist');
    const updatedListings = JSON.parse(cacheRow.listings_json);
    assert.strictEqual(updatedListings[0].listing_id, '300000000001');

    // Next call to active-listings immediately serves the fresh overwritten data from cache
    const initialCallCount = ebayTradingCallCount;
    const reqActive = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
      headers: { Cookie: authCookie }
    });
    const resActive = await activeListingsGet({ request: reqActive, env });
    assert.strictEqual(resActive.status, 200);
    const bodyActive = await resActive.json();

    assert.strictEqual(bodyActive.cached, true);
    assert.strictEqual(bodyActive.listings[0].listing_id, '300000000001');
    assert.strictEqual(ebayTradingCallCount, initialCallCount, 'active-listings should serve cache populated by sync-all');
  });
});
