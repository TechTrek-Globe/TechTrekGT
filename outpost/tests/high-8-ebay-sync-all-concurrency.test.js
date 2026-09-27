import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';
import { onRequestPost } from '../functions/api/ebay/sync-all.js';
import { fetchSingleEbayListing } from '../functions/api/ebay/tokenHelper.js';

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

describe('[HIGH-8] eBay sync-all Bounded Concurrency & Campaign Cache Reuse', () => {
  let mockDb;
  let env;
  const testUserId = 'usr_sync_all_concurrency_01';
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
      VALUES ('${testUserId}', 'sync_tester@techtrekgt.test', 'salt:310000:hash', 'Sync Tester', 'user', 0);
    `);

    // Seed valid eBay OAuth token
    const encryptedAccess = await encryptToken('valid_ebay_access_token_high8', TEST_TOKEN_ENCRYPTION_KEY);
    const encryptedRefresh = await encryptToken('valid_ebay_refresh_token_high8', TEST_TOKEN_ENCRYPTION_KEY);
    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (
        id, user_id, access_token, refresh_token,
        access_token_exp, refresh_token_exp, scopes, connected_at, last_refreshed_at
      ) VALUES (
        'tok_high8', '${testUserId}', '${encryptedAccess}', '${encryptedRefresh}',
        datetime('now', '+1 hour'), datetime('now', '+1 year'), 'sell.inventory sell.fulfillment', datetime('now'), datetime('now')
      );
    `);

    // Create session JWT cookie
    const token = await createToken({ userId: testUserId, email: 'sync_tester@techtrekgt.test' }, TEST_JWT_SECRET);
    authCookie = `auth_token=${token}`;

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('20 linked items batch sync executes with bounded concurrency (<=3) and campaign cache reuse', async () => {
    // Seed an invoice and 20 linked items in auction_items
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_high8', '${testUserId}', 'INV-H8-01', 500.0);
    `);

    const TOTAL_ITEMS = 20;
    for (let i = 1; i <= TOTAL_ITEMS; i++) {
      const pad = String(i).padStart(2, '0');
      const listingId = `1000000000${pad}`;
      const sku = `SKU-H8-${pad}`;
      mockDb._raw.exec(`
        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, unit_price, true_total_cost,
          status, platform, ebay_listing_id, sku, ebay_promoted_rate, target_margin_pct
        ) VALUES (
          'item_h8_${pad}', '${testUserId}', 'inv_high8', 'Test Sports Card #${pad}', 10.0, 12.50,
          'Listed', 'eBay', '${listingId}', '${sku}', NULL, 0.20
        );
      `);
    }

    // Instrumentation for fetch monitoring
    let currentInFlight = 0;
    let peakInFlight = 0;
    let marketingCampaignListCalls = 0;
    let marketingAdCalls = 0;
    let getItemCalls = 0;
    let recentOrderCalls = 0;
    let activeSellerListCalls = 0;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      currentInFlight++;
      if (currentInFlight > peakInFlight) {
        peakInFlight = currentInFlight;
      }

      // Small async yield to allow concurrency overlap detection
      await new Promise(r => setTimeout(r, 10));

      try {
        // 1. eBay Active Listings (GetMyeBaySelling)
        if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
          activeSellerListCalls++;
          let itemsXml = '';
          for (let i = 1; i <= TOTAL_ITEMS; i++) {
            const pad = String(i).padStart(2, '0');
            itemsXml += `
              <Item>
                <ItemID>1000000000${pad}</ItemID>
                <SKU>SKU-H8-${pad}</SKU>
                <Title>Test Sports Trading Card #${pad}</Title>
                <BuyItNowPrice currencyID="USD">49.99</BuyItNowPrice>
                <SellingStatus>
                  <ListingStatus>Active</ListingStatus>
                  <QuantitySold>0</QuantitySold>
                </SellingStatus>
                <Quantity>1</Quantity>
              </Item>`;
          }
          const xml = `<?xml version="1.0" encoding="utf-8"?>
          <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <ActiveList>
              <ItemArray>${itemsXml}</ItemArray>
            </ActiveList>
          </GetMyeBaySellingResponse>`;
          return new Response(xml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
        }

        // 2. eBay Recent Orders (Fulfillment API)
        if (urlStr.includes('/sell/fulfillment/v1/order')) {
          recentOrderCalls++;
          return new Response(JSON.stringify({ orders: [], total: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 3. eBay GetItem (Trading API ReturnAll)
        if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetItem') {
          getItemCalls++;
          const bodyXml = String(options.body || '');
          const idMatch = bodyXml.match(/<ItemID>(\d+)<\/ItemID>/);
          const itemId = idMatch ? idMatch[1] : '100000000001';
          const xml = `<?xml version="1.0" encoding="utf-8"?>
          <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
            <Item>
              <ItemID>${itemId}</ItemID>
              <Title>Test Sports Card Item</Title>
              <CurrentPrice currencyID="USD">49.99</CurrentPrice>
              <ListingStatus>Active</ListingStatus>
              <Quantity>1</Quantity>
              <QuantitySold>0</QuantitySold>
              <CategoryID>213</CategoryID>
              <CategoryName>Sports Trading Cards</CategoryName>
              <FreeShipping>true</FreeShipping>
              <GalleryURL>https://i.ebayimg.com/images/g/test/s-l500.jpg</GalleryURL>
            </Item>
          </GetItemResponse>`;
          return new Response(xml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
        }

        // 4. eBay Marketing API - Campaigns list
        if (urlStr.includes('/sell/marketing/v1/ad_campaign?limit=')) {
          marketingCampaignListCalls++;
          return new Response(JSON.stringify({
            campaigns: [
              {
                campaignId: 'camp_sports_cards_001',
                campaignName: 'Sports Cards Standard Campaign',
                fundingStrategy: { bidPercentage: '7.5' }
              }
            ]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 5. eBay Marketing API - Campaign ads
        if (urlStr.includes('/sell/marketing/v1/ad_campaign/camp_sports_cards_001/ad')) {
          marketingAdCalls++;
          return new Response(JSON.stringify({
            ads: [
              {
                adId: 'ad_01',
                listingId: '100000000001',
                bidPercentage: '7.5'
              }
            ]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'Not found', url: urlStr }), { status: 404 });
      } finally {
        currentInFlight--;
      }
    };

    // Execute sync-all request
    const request = new Request('https://outpost.techtrekgt.com/api/ebay/sync-all', {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'Content-Type': 'application/json'
      }
    });

    const response = await onRequestPost({ request, env });
    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.total_linked, 20);
    assert.strictEqual(data.updated_count, 20);
    assert.strictEqual(data.sold_recorded_count, 0);

    // Verify Concurrency is bounded to <= 3
    assert.ok(
      peakInFlight <= 3,
      `Expected peak concurrent fetch requests to be bounded by CONCURRENCY_LIMIT (<= 3), but was ${peakInFlight}`
    );

    // Verify Marketing API call counts:
    // Without cache, each of the 20 items would fetch /ad_campaign AND /ad (40+ requests).
    // With campaignCache, the campaigns list is fetched EXACTLY ONCE.
    assert.strictEqual(
      marketingCampaignListCalls,
      1,
      `Expected marketing campaigns list to be fetched exactly once and cached, but was called ${marketingCampaignListCalls} times`
    );

    // With campaignCache, once camp_sports_cards_001 rate is cached (7.5%),
    // subsequent items reuse it without repeating campaign ad subrequests.
    assert.ok(
      marketingAdCalls <= 1,
      `Expected marketing ad subrequests to be bounded (<=1) due to campaignCache reuse, but was called ${marketingAdCalls} times`
    );

    // Verify all 20 items were properly updated in DB with live prices & promoted rate
    const updatedRows = mockDb._raw.prepare(
      `SELECT * FROM auction_items WHERE user_id = ? ORDER BY id ASC`
    ).all(testUserId);

    assert.strictEqual(updatedRows.length, 20);
    for (const item of updatedRows) {
      assert.strictEqual(item.status, 'Listed');
      assert.strictEqual(item.current_list_price, 49.99);
      assert.strictEqual(item.ebay_promoted_rate, 7.5);
      assert.strictEqual(item.boost_pct, 0.075);
      assert.strictEqual(item.platform_fee_pct, 0.1325); // Sports Cards fee tier
      assert.strictEqual(item.platform_flat_fee, 0.40);
      assert.ok(item.min_sell_price > 0, 'min_sell_price should be calculated');
      assert.ok(item.suggested_list_price > item.min_sell_price, 'suggested_list_price should exceed min_sell_price');

      const attrs = JSON.parse(item.attributes);
      assert.strictEqual(attrs.ebay_image_url, 'https://i.ebayimg.com/images/g/test/s-l500.jpg');
    }
  });

  test('Direct fetchSingleEbayListing caches ad-level and campaign rates across items', async () => {
    const campaignCache = new Map();
    let campaignListCalls = 0;
    let campaignAdCalls = 0;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetItem') {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
        <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
          <Item>
            <ItemID>999000000001</ItemID>
            <Title>Trading Card Listing</Title>
            <CurrentPrice currencyID="USD">25.00</CurrentPrice>
          </Item>
        </GetItemResponse>`;
        return new Response(xml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      }

      if (urlStr.includes('/sell/marketing/v1/ad_campaign?limit=')) {
        campaignListCalls++;
        return new Response(JSON.stringify({
          campaigns: [
            {
              campaignId: 'camp_multi_01',
              fundingStrategy: { bidPercentage: '8.2' }
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('/sell/marketing/v1/ad_campaign/camp_multi_01/ad')) {
        campaignAdCalls++;
        return new Response(JSON.stringify({
          ads: [
            { listingId: '999000000001', bidPercentage: '8.2' },
            { listingId: '999000000002', bidPercentage: '9.0' }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('{}', { status: 200 });
    };

    // Item 1: Fetches campaign & ads, populating campaignCache
    const detail1 = await fetchSingleEbayListing(env, 'mock_token', '999000000001', campaignCache);
    assert.strictEqual(detail1.promoted_rate, 8.2);
    assert.strictEqual(campaignListCalls, 1);
    assert.strictEqual(campaignAdCalls, 1);

    // Item 2: Same campaign, passed the same campaignCache
    const detail2 = await fetchSingleEbayListing(env, 'mock_token', '999000000002', campaignCache);
    // Uses cached ad rate (9.0%) without any new Marketing API fetch calls!
    assert.strictEqual(detail2.promoted_rate, 9.0);
    assert.strictEqual(campaignListCalls, 1, 'Should NOT re-fetch campaign list');
    assert.strictEqual(campaignAdCalls, 1, 'Should NOT re-fetch campaign ads');
  });

  test('Reconciles sold orders concurrently alongside active listings', async () => {
    // Seed 10 items, 2 of which have sold orders in recentOrders
    mockDb._raw.exec(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv_sold_test', '${testUserId}', 'INV-SOLD-01', 200.0);
    `);

    for (let i = 1; i <= 10; i++) {
      const pad = String(i).padStart(2, '0');
      mockDb._raw.exec(`
        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, unit_price, true_total_cost,
          status, platform, ebay_listing_id, sku, current_list_price
        ) VALUES (
          'item_sold_${pad}', '${testUserId}', 'inv_sold_test', 'Sold Card #${pad}', 10.0, 12.0,
          'Listed', 'eBay', '2000000000${pad}', 'SKU-SOLD-${pad}', 30.0
        );
      `);
    }

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      // Orders endpoint returns orders for item 01 and item 02
      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({
          orders: [
            {
              orderId: 'EBAY-ORD-01',
              creationDate: '2026-09-25T14:30:00.000Z',
              buyer: { username: 'collector_alpha' },
              orderPaymentStatus: 'PAID',
              lineItems: [
                {
                  legacyItemId: '200000000001',
                  lineItemCost: { value: '35.00', currency: 'USD' }
                }
              ]
            },
            {
              orderId: 'EBAY-ORD-02',
              creationDate: '2026-09-26T10:15:00.000Z',
              buyer: { username: 'collector_beta' },
              orderPaymentStatus: 'PAID',
              lineItems: [
                {
                  legacyItemId: '200000000002',
                  lineItemCost: { value: '42.00', currency: 'USD' }
                }
              ]
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Active listings
      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
        let itemsXml = '';
        for (let i = 3; i <= 10; i++) {
          const pad = String(i).padStart(2, '0');
          itemsXml += `
            <Item>
              <ItemID>2000000000${pad}</ItemID>
              <Title>Sold Card #${pad}</Title>
              <BuyItNowPrice currencyID="USD">30.00</BuyItNowPrice>
              <SellingStatus><ListingStatus>Active</ListingStatus></SellingStatus>
              <Quantity>1</Quantity>
            </Item>`;
        }
        return new Response(`<?xml version="1.0" encoding="utf-8"?>
        <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
          <ActiveList><ItemArray>${itemsXml}</ItemArray></ActiveList>
        </GetMyeBaySellingResponse>`, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const request = new Request('https://outpost.techtrekgt.com/api/ebay/sync-all', {
      method: 'POST',
      headers: { Cookie: authCookie }
    });

    const response = await onRequestPost({ request, env });
    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.total_linked, 10);
    assert.strictEqual(data.sold_recorded_count, 2);
    assert.strictEqual(data.updated_count, 10);

    // Verify item 01 and 02 are marked Sold
    const item1 = mockDb._raw.prepare('SELECT status, actual_sell_price FROM auction_items WHERE id = ?').get('item_sold_01');
    const item2 = mockDb._raw.prepare('SELECT status, actual_sell_price FROM auction_items WHERE id = ?').get('item_sold_02');
    const item3 = mockDb._raw.prepare('SELECT status, actual_sell_price FROM auction_items WHERE id = ?').get('item_sold_03');

    assert.strictEqual(item1.status, 'Sold');
    assert.strictEqual(item1.actual_sell_price, 35.00);
    assert.strictEqual(item2.status, 'Sold');
    assert.strictEqual(item2.actual_sell_price, 42.00);
    assert.strictEqual(item3.status, 'Listed');
  });

  test('User with zero linked items returns success with zero counts immediately', async () => {
    const emptyUserId = 'usr_empty_inventory_01';
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, token_version)
      VALUES ('${emptyUserId}', 'empty@techtrekgt.test', 'salt:310000:hash', 'Empty User', 'user', 0);
    `);

    const emptyToken = await createToken({ userId: emptyUserId, email: 'empty@techtrekgt.test' }, TEST_JWT_SECRET);
    const request = new Request('https://outpost.techtrekgt.com/api/ebay/sync-all', {
      method: 'POST',
      headers: { Cookie: `auth_token=${emptyToken}` }
    });

    const response = await onRequestPost({ request, env });
    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.total_linked, 0);
    assert.strictEqual(data.updated_count, 0);
    assert.strictEqual(data.sold_recorded_count, 0);
  });
});
