import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  extractXmlTag,
  fetchEbayActiveSellerListings,
  fetchSingleEbayListing,
  updateEbayListingSku,
  fetchEbayOrderForListing
} from '../functions/api/ebay/tokenHelper.js';

describe('[MED-12] Consolidated XML Tag Extraction for eBay Trading API', () => {
  describe('extractXmlTag helper unit behavior', () => {
    test('extracts basic tag text content with trimming', () => {
      const xml = '<ItemID> 123456789012 </ItemID>';
      assert.strictEqual(extractXmlTag(xml, 'ItemID'), '123456789012');
    });

    test('extracts and trims CDATA enclosed values', () => {
      const xml = '<Title><![CDATA[ 1989 Upper Deck Ken Griffey Jr. #1 PSA 10 ]]></Title>';
      assert.strictEqual(extractXmlTag(xml, 'Title'), '1989 Upper Deck Ken Griffey Jr. #1 PSA 10');
    });

    test('extracts tags with XML attributes', () => {
      const xml = '<CurrentPrice currencyID="USD">149.95</CurrentPrice>';
      assert.strictEqual(extractXmlTag(xml, 'CurrentPrice'), '149.95');
    });

    test('returns empty string for empty tags', () => {
      const xml = '<SKU></SKU>';
      assert.strictEqual(extractXmlTag(xml, 'SKU'), '');
    });

    test('returns null for missing tags', () => {
      const xml = '<Item><ItemID>12345</ItemID></Item>';
      assert.strictEqual(extractXmlTag(xml, 'MissingTag'), null);
    });

    test('gracefully handles null, undefined, empty, or non-string inputs', () => {
      assert.strictEqual(extractXmlTag(null, 'ItemID'), null);
      assert.strictEqual(extractXmlTag(undefined, 'ItemID'), null);
      assert.strictEqual(extractXmlTag('', 'ItemID'), null);
      assert.strictEqual(extractXmlTag(12345, 'ItemID'), null);
      assert.strictEqual(extractXmlTag({}, 'ItemID'), null);
      assert.strictEqual(extractXmlTag('<Item></Item>', null), null);
      assert.strictEqual(extractXmlTag('<Item></Item>', ''), null);
    });

    test('handles multiline content and multiline CDATA', () => {
      const xml = `<Description>
        <![CDATA[
          Line 1 of description
          Line 2 of description
        ]]>
      </Description>`;
      const res = extractXmlTag(xml, 'Description');
      assert.ok(res.includes('Line 1 of description'));
      assert.ok(res.includes('Line 2 of description'));
    });
  });

  describe('fetchEbayActiveSellerListings block scoping and tag extraction', () => {
    test('extracts multiple items from GetMyeBaySelling response with isolated block scoping', async () => {
      const sampleSellingXml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <ItemArray>
      <Item>
        <ItemID>110000000001</ItemID>
        <Title><![CDATA[Item One With CDATA & Special Chars]]></Title>
        <BuyItNowPrice currencyID="USD">25.50</BuyItNowPrice>
        <QuantityAvailable>3</QuantityAvailable>
        <SKU>SKU-ITEM-01</SKU>
        <FreeShipping>true</FreeShipping>
        <GalleryURL>http://thumbs.ebay.com/pict/110000000001.jpg</GalleryURL>
      </Item>
      <Item>
        <ItemID>110000000002</ItemID>
        <Title>Item Two Plain Text</Title>
        <CurrentPrice currencyID="USD">45.00</CurrentPrice>
        <Quantity>1</Quantity>
        <SKU>SKU-ITEM-02</SKU>
        <ShippingServiceCost currencyID="USD">4.99</ShippingServiceCost>
        <PictureURL>https://i.ebayimg.com/images/g/pict2/s-l1600.jpg</PictureURL>
      </Item>
    </ItemArray>
  </ActiveList>
</GetMyeBaySellingResponse>`;

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, options = {}) => {
          const urlStr = String(url);
          if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetMyeBaySelling') {
            return new Response(sampleSellingXml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
          }
          if (urlStr.includes('/sell/inventory/v1/inventory_item')) {
            return new Response(JSON.stringify({ inventoryItems: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        };

        const listings = await fetchEbayActiveSellerListings({ EBAY_CLIENT_ID: 'test-client' }, 'mock-token');

        assert.strictEqual(listings.length, 2);

        const item1 = listings.find(i => i.listing_id === '110000000001');
        assert.ok(item1);
        assert.strictEqual(item1.title, 'Item One With CDATA & Special Chars');
        assert.strictEqual(item1.price, 25.50);
        assert.strictEqual(item1.quantity, 3);
        assert.strictEqual(item1.sku, 'SKU-ITEM-01');
        assert.strictEqual(item1.is_free_shipping, true);
        assert.strictEqual(item1.image_url, 'https://thumbs.ebay.com/pict/110000000001.jpg');

        const item2 = listings.find(i => i.listing_id === '110000000002');
        assert.ok(item2);
        assert.strictEqual(item2.title, 'Item Two Plain Text');
        assert.strictEqual(item2.price, 45.00);
        assert.strictEqual(item2.quantity, 1);
        assert.strictEqual(item2.sku, 'SKU-ITEM-02');
        assert.strictEqual(item2.buyer_shipping_cost, 4.99);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('fetchSingleEbayListing tag extraction and NameValueList', () => {
    test('extracts item details and specifics using consolidated extractXmlTag', async () => {
      const sampleItemXml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>220000000001</ItemID>
    <Title><![CDATA[2020 Panini Prizm Justin Herbert RC PSA 10]]></Title>
    <BuyItNowPrice currencyID="USD">325.00</BuyItNowPrice>
    <StartTime>2026-09-01T12:00:00.000Z</StartTime>
    <ListingStatus>Active</ListingStatus>
    <QuantityAvailable>1</QuantityAvailable>
    <QuantitySold>0</QuantitySold>
    <SKU>JH-PRIZM-PSA10</SKU>
    <ListingType>FixedPriceItem</ListingType>
    <GalleryURL>http://i.ebayimg.com/gallery/jh.jpg</GalleryURL>
    <PictureDetails>
      <PictureURL>https://i.ebayimg.com/images/jh-hq.jpg</PictureURL>
    </PictureDetails>
    <PrimaryCategory>
      <CategoryID>213</CategoryID>
      <CategoryName>Sports Mem, Cards &amp; Fan Shop:Cards:Football</CategoryName>
    </PrimaryCategory>
    <ItemSpecifics>
      <NameValueList>
        <Name>Athlete</Name>
        <Value><![CDATA[Justin Herbert]]></Value>
      </NameValueList>
      <NameValueList>
        <Name>Professional Grader</Name>
        <Value>Professional Sports Authenticator (PSA)</Value>
      </NameValueList>
      <NameValueList>
        <Name>Certification Number</Name>
        <Value>64528190</Value>
      </NameValueList>
      <NameValueList>
        <Name>Sport</Name>
        <Value>Football</Value>
      </NameValueList>
    </ItemSpecifics>
  </Item>
</GetItemResponse>`;

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, options = {}) => {
          const urlStr = String(url);
          if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetItem') {
            return new Response(sampleItemXml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
          }
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        };

        const details = await fetchSingleEbayListing({ EBAY_CLIENT_ID: 'test-client' }, 'mock-token', '220000000001');

        assert.strictEqual(details.listing_id, '220000000001');
        assert.strictEqual(details.title, '2020 Panini Prizm Justin Herbert RC PSA 10');
        assert.strictEqual(details.price, 325.00);
        assert.strictEqual(details.sku, 'JH-PRIZM-PSA10');
        assert.strictEqual(details.specifics.athlete, 'Justin Herbert');
        assert.strictEqual(details.specifics.authenticator, 'Professional Sports Authenticator (PSA)');
        assert.strictEqual(details.specifics.cert_number, '64528190');
        assert.strictEqual(details.specifics.sport, 'Football');
        assert.strictEqual(details.image_url, 'https://i.ebayimg.com/images/jh-hq.jpg');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('updateEbayListingSku Ack and Message extraction', () => {
    test('extracts Ack=Success correctly using extractXmlTag', async () => {
      const successXml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ItemID>330000000001</ItemID>
</ReviseFixedPriceItemResponse>`;

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => new Response(successXml, { status: 200, headers: { 'Content-Type': 'text/xml' } });

        const result = await updateEbayListingSku({ EBAY_CLIENT_ID: 'test' }, 'mock-token', '330000000001', 'NEW-SKU-99');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.ack, 'Success');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('extracts CDATA LongMessage on failure using extractXmlTag', async () => {
      const errorXml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Failure</Ack>
  <Errors>
    <ShortMessage>Invalid SKU</ShortMessage>
    <LongMessage><![CDATA[The custom label provided contains invalid characters or exceeds limit.]]></LongMessage>
  </Errors>
</ReviseFixedPriceItemResponse>`;

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => new Response(errorXml, { status: 200, headers: { 'Content-Type': 'text/xml' } });

        await assert.rejects(
          async () => updateEbayListingSku({ EBAY_CLIENT_ID: 'test' }, 'mock-token', '330000000001', 'INVALID-SKU'),
          /The custom label provided contains invalid characters/
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('fetchEbayOrderForListing transaction and order extraction', () => {
    test('extracts order fields correctly from GetItemTransactions XML fallback', async () => {
      const txnXml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemTransactionsResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <TransactionArray>
    <Transaction>
      <CreatedDate>2026-09-20T14:22:00.000Z</CreatedDate>
      <AmountPaid currencyID="USD">85.00</AmountPaid>
      <FinalValueFee currencyID="USD">11.48</FinalValueFee>
      <OrderID><![CDATA[TXN-ORDER-777]]></OrderID>
      <Buyer>
        <UserID><![CDATA[super_card_collector]]></UserID>
      </Buyer>
    </Transaction>
  </TransactionArray>
</GetItemTransactionsResponse>`;

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, options = {}) => {
          const urlStr = String(url);
          // Return 404 for Fulfillment REST API so it falls back to Trading API
          if (urlStr.includes('/sell/fulfillment/v1/order')) {
            return new Response('{"errors": []}', { status: 404 });
          }
          if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetItemTransactions') {
            return new Response(txnXml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
          }
          return new Response('{}', { status: 200 });
        };

        const order = await fetchEbayOrderForListing(
          { EBAY_CLIENT_ID: 'test' },
          'mock-token',
          '440000000001',
          'SKU-TEST-44',
          'Sample Card Title'
        );

        assert.ok(order);
        assert.strictEqual(order.orderId, 'TXN-ORDER-777');
        assert.strictEqual(order.buyerHandle, 'super_card_collector');
        assert.strictEqual(order.lineItemCost, 85.00);
        assert.strictEqual(order.finalValueFee, 11.48);
        assert.strictEqual(order.saleDate, '2026-09-20');
        assert.strictEqual(order.source, 'trading_transactions');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('extracts order fields correctly from GetOrders XML fallback', async () => {
      const ordersXml = `<?xml version="1.0" encoding="utf-8"?>
<GetOrdersResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <OrderArray>
    <Order>
      <OrderID>ORDER-GETORDERS-999</OrderID>
      <BuyerUserID>order_buyer_999</BuyerUserID>
      <CreatedTime>2026-09-22T08:15:00.000Z</CreatedTime>
      <AmountPaid currencyID="USD">120.00</AmountPaid>
      <Subtotal currencyID="USD">110.00</Subtotal>
      <ShippingServiceCost currencyID="USD">10.00</ShippingServiceCost>
      <FinalValueFee currencyID="USD">15.25</FinalValueFee>
      <TransactionArray>
        <Transaction>
          <Item>
            <ItemID>550000000001</ItemID>
            <SKU>SKU-ORDERS-99</SKU>
            <Title>Matched Item In GetOrders</Title>
          </Item>
        </Transaction>
      </TransactionArray>
    </Order>
  </OrderArray>
</GetOrdersResponse>`;

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, options = {}) => {
          const urlStr = String(url);
          // Return 404 for Fulfillment REST API and empty for GetItemTransactions
          if (urlStr.includes('/sell/fulfillment/v1/order')) {
            return new Response('{"errors": []}', { status: 404 });
          }
          if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetItemTransactions') {
            return new Response('<GetItemTransactionsResponse></GetItemTransactionsResponse>', { status: 200, headers: { 'Content-Type': 'text/xml' } });
          }
          if (urlStr.includes('ws/api.dll') && options.headers?.['X-EBAY-API-CALL-NAME'] === 'GetOrders') {
            return new Response(ordersXml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
          }
          return new Response('{}', { status: 200 });
        };

        const order = await fetchEbayOrderForListing(
          { EBAY_CLIENT_ID: 'test' },
          'mock-token',
          '550000000001',
          'SKU-ORDERS-99',
          'Matched Item In GetOrders'
        );

        assert.ok(order);
        assert.strictEqual(order.orderId, 'ORDER-GETORDERS-999');
        assert.strictEqual(order.buyerHandle, 'order_buyer_999');
        assert.strictEqual(order.lineItemCost, 110.00);
        assert.strictEqual(order.deliveryCost, 10.00);
        assert.strictEqual(order.finalValueFee, 15.25);
        assert.strictEqual(order.saleDate, '2026-09-22');
        assert.strictEqual(order.source, 'trading_orders');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
