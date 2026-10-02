import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  onRequestGet,
  onRequestPost,
  verifyWebhookSignature,
  computeWebhookSignature,
  timingSafeEqualString,
  bufferToHex,
  bufferToBase64,
  getSignatureHeader,
  buildChallengeResponse
} from '../functions/api/ebay/webhook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_SECRET = 'super-secret-ebay-webhook-key-32-bytes-long';
const TEST_USER_ID = 'usr-crit002-test';

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

describe('CRIT-002: Cryptographic Signature Validation for eBay Webhooks', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      EBAY_WEBHOOK_SECRET: TEST_SECRET
    };

    // Seed a test user
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES ('${TEST_USER_ID}', 'webhook-test@techtrekgt.test', 'salt:hash', 'Webhook Tester', 'user');
    `);
  });

  describe('Unit: Cryptographic Helper Functions', () => {
    test('timingSafeEqualString correctly identifies equality and prevents timing leaks', () => {
      assert.equal(timingSafeEqualString('abc123xyz', 'abc123xyz'), true);
      assert.equal(timingSafeEqualString('abc123xyz', 'abc123xyw'), false);
      assert.equal(timingSafeEqualString('abc', 'abcd'), false);
      assert.equal(timingSafeEqualString(null, 'abc'), false);
      assert.equal(timingSafeEqualString('abc', 123), false);
    });

    test('computeWebhookSignature produces valid HMAC-SHA256 buffer', async () => {
      const payload = '{"hello":"world"}';
      const sigBuf = await computeWebhookSignature(payload, TEST_SECRET);
      assert.ok(sigBuf instanceof ArrayBuffer);
      assert.equal(sigBuf.byteLength, 32);

      const hex = bufferToHex(sigBuf);
      assert.equal(hex.length, 64);
      assert.match(hex, /^[0-9a-f]{64}$/);

      const b64 = bufferToBase64(sigBuf);
      assert.ok(b64.length > 0);
    });

    test('verifyWebhookSignature handles Base64, Hex, and sha256= prefix', async () => {
      const payload = JSON.stringify({ event: 'test', timestamp: 123456789 });
      const rawBytes = new TextEncoder().encode(payload);
      const sigBuf = await computeWebhookSignature(rawBytes, TEST_SECRET);
      const hex = bufferToHex(sigBuf);
      const b64 = bufferToBase64(sigBuf);

      assert.equal(await verifyWebhookSignature(rawBytes, hex, TEST_SECRET), true);
      assert.equal(await verifyWebhookSignature(rawBytes, hex.toUpperCase(), TEST_SECRET), true);
      assert.equal(await verifyWebhookSignature(rawBytes, `sha256=${hex}`, TEST_SECRET), true);
      assert.equal(await verifyWebhookSignature(rawBytes, `sha256=${hex.toUpperCase()}`, TEST_SECRET), true);
      assert.equal(await verifyWebhookSignature(rawBytes, b64, TEST_SECRET), true);

      // Rejections
      assert.equal(await verifyWebhookSignature(rawBytes, 'invalid-signature', TEST_SECRET), false);
      assert.equal(await verifyWebhookSignature(rawBytes, '', TEST_SECRET), false);
      assert.equal(await verifyWebhookSignature(rawBytes, hex, 'wrong-secret'), false);
      assert.equal(await verifyWebhookSignature('tampered-payload', hex, TEST_SECRET), false);
    });

    test('getSignatureHeader extracts across header variations', () => {
      const req1 = new Request('https://techtrekgt.com/api/ebay/webhook', {
        headers: { 'X-EBAY-SIGNATURE': 'sig-ebay-header' }
      });
      assert.equal(getSignatureHeader(req1), 'sig-ebay-header');

      const req2 = new Request('https://techtrekgt.com/api/ebay/webhook', {
        headers: { 'x-ebay-signature': 'sig-lowercase' }
      });
      assert.equal(getSignatureHeader(req2), 'sig-lowercase');

      const req3 = new Request('https://techtrekgt.com/api/ebay/webhook', {
        headers: { 'X-Signature': 'sig-custom' }
      });
      assert.equal(getSignatureHeader(req3), 'sig-custom');

      const req4 = new Request('https://techtrekgt.com/api/ebay/webhook', {
        headers: { 'X-Hub-Signature-256': 'sha256=abc' }
      });
      assert.equal(getSignatureHeader(req4), 'sha256=abc');

      const req5 = new Request('https://techtrekgt.com/api/ebay/webhook');
      assert.equal(getSignatureHeader(req5), '');
    });
  });

  describe('GET /api/ebay/webhook Handshake', () => {
    test('returns 200 status active when no challenge_code provided', async () => {
      const request = new Request('https://techtrekgt.com/api/ebay/webhook');
      const res = await onRequestGet({ request, env });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'webhook endpoint active');
    });

    test('returns 200 with challengeResponse when challenge_code is provided', async () => {
      const challenge = 'challenge-12345';
      const request = new Request(`https://techtrekgt.com/api/ebay/webhook?challenge_code=${challenge}`);
      const res = await onRequestGet({ request, env });
      assert.equal(res.status, 200);
      const data = await res.json();

      const expected = await buildChallengeResponse(challenge, TEST_SECRET, 'https://techtrekgt.com/api/ebay/webhook');
      assert.equal(data.challengeResponse, expected);
    });

    test('returns 500 when webhook secret is missing from environment during challenge', async () => {
      const request = new Request('https://techtrekgt.com/api/ebay/webhook?challenge_code=xyz');
      const res = await onRequestGet({ request, env: { DB: mockDb } });
      assert.equal(res.status, 500);
    });
  });

  describe('POST /api/ebay/webhook Signature Enforcement (Acceptance Criteria)', () => {
    test('REJECTS request with 401 Unauthorized when signature header is missing', async () => {
      const body = JSON.stringify({ eventType: 'ITEM_SOLD' });
      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      const res = await onRequestPost({ request, env });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /missing webhook signature header/i);
    });

    test('REJECTS request with 401 Unauthorized when signature is invalid', async () => {
      const body = JSON.stringify({ eventType: 'ITEM_SOLD' });
      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': 'dGhpcy1pcy1hLWZha2Utc2lnbmF0dXJlLXBheWxvYWQ='
        },
        body
      });

      const res = await onRequestPost({ request, env });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /invalid webhook signature/i);
    });

    test('REJECTS request with 401 Unauthorized when payload is tampered', async () => {
      const originalBody = JSON.stringify({ itemId: '112233', price: 50.00 });
      const sigBuf = await computeWebhookSignature(originalBody, TEST_SECRET);
      const validSig = bufferToBase64(sigBuf);

      const tamperedBody = JSON.stringify({ itemId: '112233', price: 1.00 });
      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': validSig
        },
        body: tamperedBody
      });

      const res = await onRequestPost({ request, env });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /invalid webhook signature/i);
    });

    test('REJECTS request with 500 when webhook secret is missing from environment', async () => {
      const body = JSON.stringify({ eventType: 'ITEM_SOLD' });
      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': 'some-sig'
        },
        body
      });

      const res = await onRequestPost({ request, env: { DB: mockDb } });
      assert.equal(res.status, 500);
      const data = await res.json();
      assert.match(data.error, /missing webhook secret/i);
    });

    test('ACCEPTS request with 200 OK when valid Base64 signature matches EBAY_WEBHOOK_SECRET', async () => {
      const body = JSON.stringify({
        metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' },
        userId: 'ebay-user-to-delete'
      });
      const sigBuf = await computeWebhookSignature(body, TEST_SECRET);
      const validSig = bufferToBase64(sigBuf);

      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': validSig
        },
        body
      });

      const res = await onRequestPost({ request, env });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.eventType, 'MARKETPLACE_ACCOUNT_DELETION');
    });

    test('ACCEPTS request with 200 OK when valid Hex signature with sha256= matches EBAY_NOTIFICATION_SECRET fallback', async () => {
      const fallbackEnv = {
        DB: mockDb,
        EBAY_NOTIFICATION_SECRET: 'fallback-secret-key-32-chars-long'
      };
      const body = JSON.stringify({
        topic: 'ITEM_SOLD',
        ItemID: 'ebay-item-9999'
      });
      const sigBuf = await computeWebhookSignature(body, fallbackEnv.EBAY_NOTIFICATION_SECRET);
      const validHexSig = `sha256=${bufferToHex(sigBuf)}`;

      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ebay-signature': validHexSig
        },
        body
      });

      const res = await onRequestPost({ request, env: fallbackEnv });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });

    test('returns 400 Bad Request when body is malformed JSON despite valid signature', async () => {
      const malformedBody = '{ "unclosed": ';
      const sigBuf = await computeWebhookSignature(malformedBody, TEST_SECRET);
      const validSig = bufferToBase64(sigBuf);

      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': validSig
        },
        body: malformedBody
      });

      const res = await onRequestPost({ request, env });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /invalid JSON payload/i);
    });
  });

  describe('Event Dispatching & D1 State Mutations', () => {
    test('ITEM_SOLD updates auction_items to delist_pending and logs event', async () => {
      // Seed item
      mockDb._raw.exec(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref)
        VALUES ('inv-001', '${TEST_USER_ID}', 'INV-TEST-001');

        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, ebay_listing_id, status, current_list_price
        ) VALUES (
          'itm-delist-01', '${TEST_USER_ID}', 'inv-001', 'Test Signed Jersey', 'listing-123456', 'Listed', 150.00
        );
      `);

      const payload = {
        metadata: { topic: 'ITEM_SOLD' },
        notification: {
          data: {
            itemId: 'listing-123456'
          }
        }
      };
      const body = JSON.stringify(payload);
      const sigBuf = await computeWebhookSignature(body, TEST_SECRET);
      const validSig = bufferToBase64(sigBuf);

      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': validSig
        },
        body
      });

      const res = await onRequestPost({ request, env });
      assert.equal(res.status, 200);

      // Verify item updated to delist_pending
      const item = mockDb._raw.prepare('SELECT status FROM auction_items WHERE id = ?').get('itm-delist-01');
      assert.equal(item.status, 'delist_pending');

      // Verify event logged in ebay_webhook_events
      const event = mockDb._raw.prepare('SELECT * FROM ebay_webhook_events WHERE ebay_item_id = ?').get('listing-123456');
      assert.ok(event);
      assert.equal(event.event_type, 'ITEM_SOLD');
      assert.equal(event.processed, 1);
    });

    test('ORDER_PAYMENT_STATUS (PAID) transitions item to Sold and creates sale record', async () => {
      mockDb._raw.exec(`
        INSERT INTO auction_invoices (id, user_id, invoice_ref)
        VALUES ('inv-002', '${TEST_USER_ID}', 'INV-TEST-002');

        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, ebay_listing_id, status,
          current_list_price, unit_price, true_total_cost, platform_fee_pct, platform_flat_fee
        ) VALUES (
          'itm-paid-02', '${TEST_USER_ID}', 'inv-002', 'Signed Baseball', 'listing-789012', 'delist_pending',
          100.00, 40.00, 40.00, 0.135, 0.30
        );
      `);

      const payload = {
        eventType: 'ORDER_PAYMENT_STATUS',
        PaymentStatus: 'PAID',
        ItemID: 'listing-789012',
        OrderID: 'ebay-order-554433',
        Price: 120.00
      };
      const body = JSON.stringify(payload);
      const sigBuf = await computeWebhookSignature(body, TEST_SECRET);
      const validSig = bufferToBase64(sigBuf);

      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': validSig
        },
        body
      });

      const res = await onRequestPost({ request, env });
      assert.equal(res.status, 200);

      // Verify item transitioned to Sold
      const item = mockDb._raw.prepare('SELECT status, actual_sell_price FROM auction_items WHERE id = ?').get('itm-paid-02');
      assert.equal(item.status, 'Sold');
      assert.equal(item.actual_sell_price, 120.00);

      // Verify sale record created
      const sale = mockDb._raw.prepare('SELECT * FROM auction_sales WHERE item_id = ?').get('itm-paid-02');
      assert.ok(sale);
      assert.equal(sale.gross_sale_price, 120.00);
      assert.equal(sale.ebay_order_id, 'ebay-order-554433');
    });

    test('MARKETPLACE_ACCOUNT_DELETION deletes tokens for matching ebay_user_id (GDPR)', async () => {
      mockDb._raw.exec(`
        INSERT INTO ebay_oauth_tokens (
          id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, ebay_user_id
        ) VALUES (
          'tok-gdpr-1', '${TEST_USER_ID}', 'acc-tok', 'ref-tok', '2026-12-31', '2027-12-31', 'sell.inventory', 'ebay-user-gdpr'
        );
      `);

      const payload = {
        metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' },
        userId: 'ebay-user-gdpr'
      };
      const body = JSON.stringify(payload);
      const sigBuf = await computeWebhookSignature(body, TEST_SECRET);
      const validSig = bufferToBase64(sigBuf);

      const request = new Request('https://techtrekgt.com/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': validSig
        },
        body
      });

      const res = await onRequestPost({ request, env });
      assert.equal(res.status, 200);

      // Verify token deleted
      const token = mockDb._raw.prepare('SELECT * FROM ebay_oauth_tokens WHERE ebay_user_id = ?').get('ebay-user-gdpr');
      assert.ok(!token);
    });
  });
});
