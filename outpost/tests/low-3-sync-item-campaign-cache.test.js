import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as syncItemHandler } from '../functions/api/ebay/sync-item.js';
import { fetchSingleEbayListing } from '../functions/api/ebay/tokenHelper.js';
import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const TEST_TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-for-unit-tests-32-bytes';

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

describe('LOW-3: Campaign-Rate Cache Scoped to sync-item Execution', () => {
  let mockDb;
  let env;
  const testUserId = 'usr-sync-item-cache';
  let userJwt;
  let originalFetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      EBAY_CLIENT_ID: 'mock-client-id',
      EBAY_CLIENT_SECRET: 'mock-client-secret',
      EBAY_RUNAME: 'mock-runame',
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY
    };

    // Seed test user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, is_admin)
      VALUES (?, 'syncitem@techtrekgt.test', 'dummyhash', 'Sync User', 'Active', 1, 0)
    `).run(testUserId);

    // Seed mock active eBay OAuth tokens (properly encrypted)
    const encAccess = await encryptToken('valid_ebay_access_token', TEST_TOKEN_ENCRYPTION_KEY);
    const encRefresh = await encryptToken('valid_refresh_token', TEST_TOKEN_ENCRYPTION_KEY);

    mockDb._raw.prepare(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok-01', ?, ?, ?, datetime('now', '+1 hour'), datetime('now', '+1 day'), 'sell.inventory')
    `).run(testUserId, encAccess, encRefresh);

    userJwt = await createToken({ userId: testUserId, email: 'syncitem@techtrekgt.test' }, TEST_JWT_SECRET, 3600);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('fetchSingleEbayListing reuses cached campaign and ad lookups across multiple calls when passed campaignCache', async () => {
    const campaignCache = new Map();
    let campaignListCalls = 0;
    let campaignAdCalls = 0;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetItem') {
        const idMatch = urlStr.includes('111000') || (options.body && options.body.includes('111000'));
        const targetId = idMatch ? '111000' : '222000';
        const xml = `<?xml version="1.0" encoding="utf-8"?>
        <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
          <Item>
            <ItemID>${targetId}</ItemID>
            <Title>Test Listing ${targetId}</Title>
            <CurrentPrice currencyID="USD">50.00</CurrentPrice>
          </Item>
        </GetItemResponse>`;
        return new Response(xml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      }

      if (urlStr.includes('/sell/marketing/v1/ad_campaign?limit=')) {
        campaignListCalls++;
        return new Response(JSON.stringify({
          campaigns: [
            {
              campaignId: 'camp_sync_item_01',
              fundingStrategy: { bidPercentage: '7.5' }
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('/sell/marketing/v1/ad_campaign/camp_sync_item_01/ad')) {
        campaignAdCalls++;
        return new Response(JSON.stringify({
          ads: [
            { listingId: '111000', bidPercentage: '7.5' },
            { listingId: '222000', bidPercentage: '8.0' }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    // First fetch: fetches campaigns and ads for listing 111000
    const detail1 = await fetchSingleEbayListing(env, 'mock_token', '111000', campaignCache);
    assert.strictEqual(detail1.promoted_rate, 7.5);
    assert.strictEqual(campaignListCalls, 1);
    assert.strictEqual(campaignAdCalls, 1);

    // Second fetch with same campaignCache: reuses cached campaign & ad data
    const detail2 = await fetchSingleEbayListing(env, 'mock_token', '222000', campaignCache);
    assert.strictEqual(detail2.promoted_rate, 8.0);
    assert.strictEqual(campaignListCalls, 1, 'Subsequent call must NOT re-fetch campaign list');
    assert.strictEqual(campaignAdCalls, 1, 'Subsequent call must NOT re-fetch campaign ads');
  });

  test('POST /api/ebay/sync-item successfully executes and enriches item using campaignCache', async () => {
    // Seed invoice and item
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, base_total)
      VALUES ('inv-01', ?, 'INV-01', 100.0)
    `).run(testUserId);

    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost, status, platform, ebay_listing_id, current_list_price)
      VALUES ('item-sync-01', ?, 'inv-01', 'Test Collectible Card', 20.0, 25.0, 'Listed', 'eBay', '123456789099', 45.0)
    `).run(testUserId);

    let marketingCalls = 0;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      if (urlStr.includes('ws/api.dll')) {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
        <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
          <Item>
            <ItemID>123456789099</ItemID>
            <Title>Test Collectible Card PSA 10</Title>
            <CurrentPrice currencyID="USD">55.00</CurrentPrice>
            <ListingStatus>Active</ListingStatus>
          </Item>
        </GetItemResponse>`;
        return new Response(xml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      }

      if (urlStr.includes('/sell/fulfillment/v1/order')) {
        return new Response(JSON.stringify({ orders: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('/sell/marketing/v1/ad_campaign')) {
        marketingCalls++;
        return new Response(JSON.stringify({
          campaigns: [
            {
              campaignId: 'camp_001',
              fundingStrategy: { bidPercentage: '6.5' }
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = new Request('https://outpost.techtrekgt.com/api/ebay/sync-item', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${userJwt}`
      },
      body: JSON.stringify({ item_id: 'item-sync-01' })
    });

    const res = await syncItemHandler({ request: req, env });
    assert.strictEqual(res.status, 200, 'sync-item must return 200 OK');

    const data = await res.json();
    assert.ok(data.item, 'Response should contain updated item');
    assert.strictEqual(data.item.id, 'item-sync-01');
    assert.strictEqual(data.item.current_list_price, 55);

    // Verify item updated in D1
    const dbItem = mockDb._raw.prepare('SELECT current_list_price FROM auction_items WHERE id = ?').get('item-sync-01');
    assert.strictEqual(dbItem.current_list_price, 55);
  });
});
