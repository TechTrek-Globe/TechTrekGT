import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEbayListing, reviseEbayListing, xmlEscape } from '../functions/api/ebay/tokenHelper.js';
import { onRequestPost as ebayCreateListingHandler } from '../functions/api/ebay/create-listing.js';
import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const TEST_ENC_KEY = 'test-encryption-key-32-bytes-minimum-length!';
const USER_ID = 'usr-ebay-list-test';
const ITEM_ID = 'item-ebay-list-1';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
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
        first() {
          const stmt = db.prepare(sql);
          return stmt.get(...boundParams) || null;
        },
        all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...boundParams) };
        },
        run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...boundParams);
          return {
            success: true,
            meta: { changes: info.changes, last_row_id: info.lastInsertRowid }
          };
        }
      };
    },
    async batch(statements) {
      return statements.map(s => s.run());
    }
  };
}

describe('1-Click eBay Listing Creation Engine', () => {
  let mockEnv;
  let authToken;

  beforeEach(async () => {
    const mockDb = createMockD1();

    // Insert test user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, token_version)
      VALUES (?, ?, 'hash', 'Seller', 1)
    `).run(USER_ID, 'seller@techtrek.test');

    // Insert test eBay OAuth tokens (active, encrypted)
    const encryptedAccess = await encryptToken('ebay-access-token-12345', TEST_ENC_KEY);
    const encryptedRefresh = await encryptToken('ebay-refresh-token-67890', TEST_ENC_KEY);
    const futureExp = new Date(Date.now() + 7200 * 1000).toISOString();

    mockDb._raw.prepare(`
      INSERT INTO ebay_oauth_tokens (
        id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes
      ) VALUES ('tok-1', ?, ?, ?, ?, ?, 'sell.inventory')
    `).run(USER_ID, encryptedAccess, encryptedRefresh, futureExp, futureExp);

    // Insert test invoice for foreign key constraint
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES ('inv-1', ?, 'INV-TEST-001')
    `).run(USER_ID);

    // Insert test inventory item
    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, sku, category, unit_price,
        current_list_price, min_sell_price, buyer_shipping_cost, status,
        sport_genre, athlete_person, authenticator, cert_number,
        notes, image_url, attributes
      ) VALUES (
        ?, ?, 'inv-1', ?, ?, ?, ?,
        ?, ?, ?, 'Available',
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      ITEM_ID,
      USER_ID,
      '2023 Panini Prizm CJ Stroud Rookie Card Silver Prizm #339 Houston Texans',
      'TT-NFL-001',
      'Sports Cards',
      25.00,
      149.99,
      40.00,
      4.95,
      'Football',
      'C.J. Stroud',
      'PSA',
      '91827364',
      'Clean corners and edges. Stored in magnetic one-touch case.',
      'https://i.ebayimg.com/images/g/stroud-prizm/s-l1600.jpg',
      JSON.stringify({ condition: 'Brand New / Mint', card_grade: 'PSA 10', parallel: 'Silver Prizm', brand: 'Panini' })
    );

    mockEnv = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      TOKEN_ENCRYPTION_KEY: TEST_ENC_KEY,
      EBAY_ENV: 'sandbox'
    };

    authToken = await createToken({ userId: USER_ID, tv: 1 }, TEST_JWT_SECRET);
  });

  describe('createEbayListing XML & Payload Construction', () => {
    it('generates valid AddFixedPriceItem SOAP request and extracts ItemID on success', async () => {
      let interceptedXml = '';

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        interceptedXml = opts.body;
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Timestamp>2026-11-14T16:00:00.000Z</Timestamp>
  <Ack>Success</Ack>
  <Version>967</Version>
  <ItemID>110543827491</ItemID>
  <StartTime>2026-11-14T16:00:00.000Z</StartTime>
  <EndTime>2026-12-14T16:00:00.000Z</EndTime>
  <Fees>
    <Fee>
      <Name>InsertionFee</Name>
      <Fee currencyID="USD">0.0</Fee>
    </Fee>
  </Fees>
</AddFixedPriceItemResponse>`, {
          status: 200,
          headers: { 'Content-Type': 'text/xml' }
        });
      };

      try {
        const result = await createEbayListing(mockEnv, 'ebay-test-token', {
          title: '2023 Panini Prizm CJ Stroud Rookie Card Silver Prizm #339',
          descriptionHtml: '<div><p>Authentic Rookie Card</p></div>',
          price: 149.99,
          sku: 'TT-NFL-001',
          condition: 'Brand New',
          category: 'Sports Cards',
          imageUrl: 'https://i.ebayimg.com/images/g/test/s-l1600.jpg',
          brand: 'Panini',
          athlete: 'C.J. Stroud',
          sport: 'Football',
          authenticator: 'PSA',
          certNumber: '91827364',
          buyerShippingCost: 4.95,
          isFreeShipping: false
        });

        assert.equal(result.success, true);
        assert.equal(result.listing_id, '110543827491');
        assert.equal(result.ebay_url, 'https://www.ebay.com/itm/110543827491');
        assert.equal(result.price, '149.99');

        // Verify XML structure
        assert.ok(interceptedXml.includes('<AddFixedPriceItemRequest'), 'Must use AddFixedPriceItemRequest');
        assert.ok(!interceptedXml.includes('<ItemID>'), 'XML must not contain ItemID in request (only response)');
        assert.ok(interceptedXml.includes('<Title>2023 Panini Prizm CJ Stroud Rookie Card Silver Prizm #339</Title>'));
        assert.ok(interceptedXml.includes('<![CDATA[<div><p>Authentic Rookie Card</p></div>]]>'), 'Description must be wrapped in CDATA');
        assert.ok(interceptedXml.includes('<StartPrice currencyID="USD">149.99</StartPrice>'));
        assert.ok(interceptedXml.includes('<ConditionID>1000</ConditionID>'), 'Brand New maps to 1000');
        assert.ok(interceptedXml.includes('<CategoryID>213</CategoryID>'), 'Sports Cards map to 213');
        assert.ok(interceptedXml.includes('<SKU>TT-NFL-001</SKU>'));
        assert.ok(interceptedXml.includes('<PictureURL>https://i.ebayimg.com/images/g/test/s-l1600.jpg</PictureURL>'));
        assert.ok(interceptedXml.includes('<ShippingServiceCost currencyID="USD">4.95</ShippingServiceCost>'));
        assert.ok(interceptedXml.includes('<Name>Brand</Name><Value>Panini</Value>'));
        assert.ok(interceptedXml.includes('<Name>Player/Athlete</Name><Value>C.J. Stroud</Value>'));
        assert.ok(interceptedXml.includes('<Name>Professional Grader</Name><Value>PSA</Value>'));
        assert.ok(interceptedXml.includes('<Name>Certification Number</Name><Value>91827364</Value>'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('enforces title length <= 80 characters with word boundary cut', async () => {
      let interceptedXml = '';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        interceptedXml = opts.body;
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ItemID>990011223344</ItemID>
</AddFixedPriceItemResponse>`, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      };

      try {
        const longTitle = '2023 Panini Prizm Football Blaster Box Factory Sealed Unopened Rookie Variation Auto Relic Card Pack';
        assert.ok(longTitle.length > 80);

        await createEbayListing(mockEnv, 'ebay-test-token', {
          title: longTitle,
          price: 49.95,
          condition: 'New'
        });

        const titleMatch = interceptedXml.match(/<Title>(.*?)<\/Title>/);
        assert.ok(titleMatch);
        assert.ok(titleMatch[1].length <= 80, `Title must be <= 80 chars (got ${titleMatch[1].length})`);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('uses dependable EPS photo placeholder when no picture is provided', async () => {
      let interceptedXml = '';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        interceptedXml = opts.body;
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ItemID>990011223355</ItemID>
</AddFixedPriceItemResponse>`, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      };

      try {
        await createEbayListing(mockEnv, 'ebay-test-token', {
          title: 'Unphotographed Collectible Plate',
          price: 29.99
        });

        assert.ok(interceptedXml.includes('<PictureURL>https://i.ebayimg.com/images/g/fe4AAeSwSO1q8G1~/s-l1600.webp</PictureURL>'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('throws structured error when eBay returns Ack=Failure', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Timestamp>2026-11-14T16:00:00.000Z</Timestamp>
  <Ack>Failure</Ack>
  <Errors>
    <ShortMessage>Invalid Category ID</ShortMessage>
    <LongMessage>The category selected is not valid for listing fixed price items.</LongMessage>
    <ErrorCode>21919067</ErrorCode>
    <SeverityCode>Error</SeverityCode>
  </Errors>
</AddFixedPriceItemResponse>`, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      };

      try {
        await assert.rejects(
          async () => {
            await createEbayListing(mockEnv, 'ebay-test-token', {
              title: 'Test Item',
              price: 19.99
            });
          },
          /The category selected is not valid for listing fixed price items/
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('POST /api/ebay/create-listing Endpoint Integration', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new Request('http://localhost:3001/api/ebay/create-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: ITEM_ID })
      });

      const res = await ebayCreateListingHandler({ request: req, env: mockEnv });
      assert.equal(res.status, 401);
    });

    it('rejects requests missing item_id with 400', async () => {
      const req = new Request('http://localhost:3001/api/ebay/create-listing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${authToken}`
        },
        body: JSON.stringify({})
      });

      const res = await ebayCreateListingHandler({ request: req, env: mockEnv });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'item_id is required');
    });

    it('returns 404 if item does not exist in inventory', async () => {
      const req = new Request('http://localhost:3001/api/ebay/create-listing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${authToken}`
        },
        body: JSON.stringify({ item_id: 'non-existent-id' })
      });

      const res = await ebayCreateListingHandler({ request: req, env: mockEnv });
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error, 'Item not found in inventory');
    });

    it('successfully publishes listing to eBay and updates D1 inventory atomically', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        // Mock Trading API AddFixedPriceItem
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Timestamp>2026-11-14T16:05:00.000Z</Timestamp>
  <Ack>Success</Ack>
  <Version>967</Version>
  <ItemID>160987654321</ItemID>
</AddFixedPriceItemResponse>`, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      };

      try {
        const req = new Request('http://localhost:3001/api/ebay/create-listing', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `auth_token=${authToken}`
          },
          body: JSON.stringify({
            item_id: ITEM_ID,
            price: 149.99,
            use_ai: false
          })
        });

        const res = await ebayCreateListingHandler({ request: req, env: mockEnv });
        assert.equal(res.status, 200);
        const data = await res.json();

        assert.equal(data.success, true);
        assert.equal(data.listing_id, '160987654321');
        assert.equal(data.ebay_url, 'https://www.ebay.com/itm/160987654321');
        assert.equal(data.price, '149.99');

        // Check D1 auction_items table
        const updatedItem = mockEnv.DB._raw.prepare(
          'SELECT * FROM auction_items WHERE id = ?'
        ).get(ITEM_ID);

        assert.equal(updatedItem.ebay_listing_id, '160987654321');
        assert.equal(updatedItem.status, 'Listed');
        assert.equal(updatedItem.platform, 'eBay');
        assert.equal(updatedItem.current_list_price, 149.99);

        // Check D1 ebay_active_listings cache
        const activeListing = mockEnv.DB._raw.prepare(
          'SELECT * FROM ebay_active_listings WHERE ebay_listing_id = ?'
        ).get('160987654321');

        assert.ok(activeListing, 'Must insert ebay_active_listings record');
        assert.equal(activeListing.user_id, USER_ID);
        assert.equal(activeListing.sku, 'TT-NFL-001');
        assert.equal(activeListing.status, 'Active');

        // Check D1 auction_item_platform_listings
        const platformListing = mockEnv.DB._raw.prepare(
          'SELECT * FROM auction_item_platform_listings WHERE item_id = ? AND platform_name = ?'
        ).get(ITEM_ID, 'eBay');

        assert.ok(platformListing, 'Must insert auction_item_platform_listings record');
        assert.equal(platformListing.external_listing_id, '160987654321');
        assert.equal(platformListing.listing_url, 'https://www.ebay.com/itm/160987654321');
        assert.equal(platformListing.status, 'Listed');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('uses SellerProfiles and omits inline ShippingDetails when Business Policies are active', async () => {
      let interceptedXml = '';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        const u = String(url);
        if (u.includes('/sell/account/v1/fulfillment_policy')) {
          return new Response(JSON.stringify({
            fulfillmentPolicies: [
              {
                fulfillmentPolicyId: 'FP_FREE',
                name: 'Free Shipping',
                categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }],
                shippingOptions: [{ optionType: 'DOMESTIC', costType: 'FLAT_RATE', shippingServices: [{ freeShipping: true, shippingCost: { value: '0.00' } }] }]
              },
              {
                fulfillmentPolicyId: 'FP_FLAT_995',
                name: 'Flat Rate $9.95',
                categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: false }],
                shippingOptions: [{ optionType: 'DOMESTIC', costType: 'FLAT_RATE', shippingServices: [{ freeShipping: false, shippingCost: { value: '9.95' } }] }]
              }
            ]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/sell/account/v1/return_policy')) {
          return new Response(JSON.stringify({
            returnPolicies: [
              { returnPolicyId: 'RP_30', name: '30 Day Returns', categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }] }
            ]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/sell/account/v1/payment_policy')) {
          return new Response(JSON.stringify({
            paymentPolicies: [
              { paymentPolicyId: 'PP_MP', name: 'eBay Managed Payments', categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }] }
            ]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        interceptedXml = opts.body;
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ItemID>160987659999</ItemID>
</AddFixedPriceItemResponse>`, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      };

      try {
        const result = await createEbayListing(mockEnv, 'ebay-test-token', {
          title: 'Ronald Acuna Jr. Signed Braves Custom Jersey XL JSA COA',
          price: 199.99,
          buyerShippingCost: 9.95,
          isFreeShipping: false
        });
        assert.equal(result.success, true);
        assert.equal(result.listing_id, '160987659999');
        assert.ok(interceptedXml.includes('<SellerProfiles>'), 'Must include SellerProfiles when Business Policies exist');
        assert.ok(interceptedXml.includes('<ShippingProfileID>FP_FLAT_995</ShippingProfileID>'), 'Must select matching $9.95 policy');
        assert.ok(interceptedXml.includes('<ReturnProfileID>RP_30</ReturnProfileID>'));
        assert.ok(interceptedXml.includes('<PaymentProfileID>PP_MP</PaymentProfileID>'));
        assert.equal(interceptedXml.includes('<ShippingDetails>'), false, 'Must omit inline ShippingDetails when SellerProfiles is used');
        assert.equal(interceptedXml.includes('<ReturnPolicy>'), false, 'Must omit inline ReturnPolicy when SellerProfiles is used');
        assert.equal(interceptedXml.includes('<DispatchTimeMax>'), false, 'Must omit DispatchTimeMax when SellerProfiles is used');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('never sends invalid USPSGroundAdvantage token and retries via GeteBayDetails on Error 37', async () => {
      const tradingCalls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        const u = String(url);
        if (u.includes('/sell/account/v1/')) {
          return new Response(JSON.stringify({ errors: [{ errorId: 20403, message: 'Not opted in' }] }), { status: 400 });
        }
        const callName = opts?.headers?.['X-EBAY-API-CALL-NAME'];
        tradingCalls.push({ callName, body: opts.body });
        if (callName === 'AddFixedPriceItem' && opts.body.includes('<ShippingService>ShippingMethodStandard</ShippingService>')) {
          return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Failure</Ack>
  <Errors>
    <LongMessage>Input data for tag &lt;Item.ShippingDetails&gt; is invalid or missing. Please check API documentation.</LongMessage>
    <ErrorCode>37</ErrorCode>
    <SeverityCode>Error</SeverityCode>
  </Errors>
</AddFixedPriceItemResponse>`, { status: 200 });
        }
        if (callName === 'GeteBayDetails') {
          return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<GeteBayDetailsResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ShippingServiceDetails>
    <ShippingService>USPSPriority</ShippingService>
    <Description>USPS Priority Mail</Description>
    <ServiceType>Flat</ServiceType>
    <ValidForSellingFlow>true</ValidForSellingFlow>
  </ShippingServiceDetails>
</GeteBayDetailsResponse>`, { status: 200 });
        }
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ItemID>160987658888</ItemID>
</AddFixedPriceItemResponse>`, { status: 200 });
      };

      try {
        const result = await createEbayListing(mockEnv, 'ebay-test-token', {
          title: 'Fallback Shipping Test Item',
          price: 49.99,
          isFreeShipping: true
        });
        assert.equal(result.success, true);
        assert.equal(result.listing_id, '160987658888');
        assert.equal(tradingCalls.some(c => c.body.includes('USPSGroundAdvantage')), false, 'Must never send invalid USPSGroundAdvantage');
        assert.equal(tradingCalls.map(c => c.callName).join(','), 'AddFixedPriceItem,GeteBayDetails,AddFixedPriceItem');
        assert.ok(tradingCalls[2].body.includes('<ShippingService>USPSPriority</ShippingService>'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('revises existing active listing via ReviseFixedPriceItem and falls back to AddFixedPriceItem when ended', async () => {
      mockEnv.DB._raw.prepare('UPDATE auction_items SET ebay_listing_id = ? WHERE id = ?').run('110999888777', ITEM_ID);

      // 1. Active listing revision test
      const calls1 = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        const callName = opts?.headers?.['X-EBAY-API-CALL-NAME'];
        calls1.push({ callName, body: opts.body });
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<ReviseFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ItemID>110999888777</ItemID>
</ReviseFixedPriceItemResponse>`, { status: 200 });
      };

      try {
        const req1 = new Request('http://localhost:3001/api/ebay/create-listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${authToken}` },
          body: JSON.stringify({ item_id: ITEM_ID, price: 159.99, use_ai: false })
        });
        const res1 = await ebayCreateListingHandler({ request: req1, env: mockEnv });
        assert.equal(res1.status, 200);
        const data1 = await res1.json();
        assert.equal(data1.action, 'revised');
        assert.equal(data1.listing_id, '110999888777');
        assert.equal(calls1[0].callName, 'ReviseFixedPriceItem');
        assert.equal(calls1[0].body.includes('<ShippingDetails>'), false, 'ReviseFixedPriceItem must not inject ShippingDetails');
        assert.equal(calls1[0].body.includes('<PictureDetails>'), false, 'ReviseFixedPriceItem must not overwrite photos');
      } finally {
        globalThis.fetch = originalFetch;
      }

      // 2. Ended listing automatic republish fallback test
      const calls2 = [];
      globalThis.fetch = async (url, opts) => {
        const u = String(url);
        if (u.includes('/sell/account/v1/')) {
          return new Response(JSON.stringify({ errors: [{ errorId: 20403 }] }), { status: 400 });
        }
        const callName = opts?.headers?.['X-EBAY-API-CALL-NAME'];
        calls2.push({ callName, body: opts.body });
        if (callName === 'ReviseFixedPriceItem') {
          return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<ReviseFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Failure</Ack>
  <Errors>
    <LongMessage>This listing has ended and cannot be revised.</LongMessage>
    <ErrorCode>291</ErrorCode>
    <SeverityCode>Error</SeverityCode>
  </Errors>
</ReviseFixedPriceItemResponse>`, { status: 200 });
        }
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<AddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ItemID>110999888999</ItemID>
</AddFixedPriceItemResponse>`, { status: 200 });
      };

      try {
        const req2 = new Request('http://localhost:3001/api/ebay/create-listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${authToken}` },
          body: JSON.stringify({ item_id: ITEM_ID, price: 159.99, use_ai: false })
        });
        const res2 = await ebayCreateListingHandler({ request: req2, env: mockEnv });
        assert.equal(res2.status, 200);
        const data2 = await res2.json();
        assert.equal(data2.action, 'republished');
        assert.equal(data2.listing_id, '110999888999');
        assert.deepEqual(calls2.map(c => c.callName), ['ReviseFixedPriceItem', 'AddFixedPriceItem']);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
