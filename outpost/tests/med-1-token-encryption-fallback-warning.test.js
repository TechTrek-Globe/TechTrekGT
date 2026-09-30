import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';
import { getEbayUserToken as getEbayUserTokenHelper } from '../functions/api/ebay/tokenHelper.js';
import { getEbayUserToken as getEbayUserTokenAuth } from '../functions/utils/ebayAuth.js';
import { onRequestGet as activeListingsGet } from '../functions/api/ebay/active-listings.js';

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

describe('[MED-1] eBay OAuth Token Decryption Fallback Logging', () => {
  let mockDb;
  const userId = 'usr_med1_seller_01';
  let loggedErrors = [];
  const originalConsoleError = console.error;

  beforeEach(async () => {
    loggedErrors = [];
    console.error = (...args) => {
      loggedErrors.push(args.join(' '));
      originalConsoleError(...args);
    };

    mockDb = createMockD1();
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin, created_at)
      VALUES ('${userId}', 'seller@techtrekgt.test', 'hash', 'Seller', 'user', 0, datetime('now'));
    `);

    // Encrypted with legacy JWT_SECRET
    const encAccess = await encryptToken('ebay_access_test_token_abc', TEST_JWT_SECRET);
    const encRefresh = await encryptToken('ebay_refresh_test_token_xyz', TEST_JWT_SECRET);
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    const farFutureExp = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok_med1_1', '${userId}', '${encAccess}', '${encRefresh}', '${futureExp}', '${farFutureExp}', 'sell.inventory');
    `);
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  test('tokenHelper.getEbayUserToken throws 503 when TOKEN_ENCRYPTION_KEY is unset and does NOT fall back to JWT_SECRET', async () => {
    const envNoTokenKey = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
      // TOKEN_ENCRYPTION_KEY intentionally omitted
    };

    await assert.rejects(
      async () => getEbayUserTokenHelper(envNoTokenKey, userId),
      (err) => {
        assert.strictEqual(err.statusCode, 503);
        assert.ok(err.message.includes('server configuration issue'));
        return true;
      }
    );
  });

  test('tokenHelper.getEbayUserToken does NOT log warning when TOKEN_ENCRYPTION_KEY is present', async () => {
    // Encrypt with dedicated TOKEN_ENCRYPTION_KEY
    const encAccess = await encryptToken('ebay_access_dedicated_abc', TEST_TOKEN_ENCRYPTION_KEY);
    const encRefresh = await encryptToken('ebay_refresh_dedicated_xyz', TEST_TOKEN_ENCRYPTION_KEY);
    mockDb._raw.prepare(`
      UPDATE ebay_oauth_tokens
      SET access_token = ?, refresh_token = ?
      WHERE user_id = ?
    `).run(encAccess, encRefresh, userId);

    const envWithTokenKey = {
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY,
      JWT_SECRET: TEST_JWT_SECRET
    };

    const token = await getEbayUserTokenHelper(envWithTokenKey, userId);
    assert.strictEqual(token, 'ebay_access_dedicated_abc');

    const warningFound = loggedErrors.some(msg =>
      msg.includes('[getEbayUserToken] TOKEN_ENCRYPTION_KEY not configured')
    );
    assert.strictEqual(warningFound, false, 'No fallback warning should be logged when TOKEN_ENCRYPTION_KEY is configured');
  });

  test('ebayAuth.getEbayUserToken throws 503 when TOKEN_ENCRYPTION_KEY is unset', async () => {
    const envNoTokenKey = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    await assert.rejects(
      async () => getEbayUserTokenAuth(envNoTokenKey, userId),
      (err) => {
        assert.strictEqual(err.statusCode, 503);
        assert.ok(err.message.includes('server configuration issue'));
        return true;
      }
    );
  });

  test('/api/ebay/active-listings endpoint returns 503 when TOKEN_ENCRYPTION_KEY is unset, and succeeds 200 when configured', async () => {
    const authToken = await createToken({ userId, email: 'seller@techtrekgt.test' }, TEST_JWT_SECRET, 3600);

    // Mock fetch for eBay Trading API
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ActiveList>
    <ItemArray />
    <PaginationResult>
      <TotalNumberOfPages>0</TotalNumberOfPages>
      <TotalNumberOfEntries>0</TotalNumberOfEntries>
    </PaginationResult>
  </ActiveList>
</GetMyeBaySellingResponse>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' }
      });
    };

    try {
      // 1. Request with TOKEN_ENCRYPTION_KEY unset fails closed with 503
      const envUnset = {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET
      };

      const reqUnset = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings', {
        headers: {
          Cookie: `auth_token=${authToken}`
        }
      });

      const resUnset = await activeListingsGet({ request: reqUnset, env: envUnset });
      assert.strictEqual(resUnset.status, 503);
      const errBody = await resUnset.json();
      assert.ok(errBody.error.includes('server configuration issue'));

      // Clear logged errors
      loggedErrors = [];

      // 2. Update token in DB to use dedicated key
      const dedicatedAccess = await encryptToken('ebay_access_dedicated_val', TEST_TOKEN_ENCRYPTION_KEY);
      const dedicatedRefresh = await encryptToken('ebay_refresh_dedicated_val', TEST_TOKEN_ENCRYPTION_KEY);
      mockDb._raw.prepare(`
        UPDATE ebay_oauth_tokens
        SET access_token = ?, refresh_token = ?
        WHERE user_id = ?
      `).run(dedicatedAccess, dedicatedRefresh, userId);

      // Request with TOKEN_ENCRYPTION_KEY set
      const envConfigured = {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET,
        TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY
      };

      const reqConfigured = new Request('https://outpost.techtrekgt.test/api/ebay/active-listings?force=true', {
        headers: {
          Cookie: `auth_token=${authToken}`
        }
      });

      const resConfigured = await activeListingsGet({ request: reqConfigured, env: envConfigured });
      assert.strictEqual(resConfigured.status, 200);

      const warningFoundWhenConfigured = loggedErrors.some(msg =>
        msg.includes('[getEbayUserToken] TOKEN_ENCRYPTION_KEY not configured')
      );
      assert.strictEqual(warningFoundWhenConfigured, false, 'Warning must NOT appear when TOKEN_ENCRYPTION_KEY is configured');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
