import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encryptToken } from '../functions/utils/tokenCrypto.js';
import { getEbayUserToken } from '../functions/utils/ebayAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

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

describe('[AUTH-001] Purge Revoked eBay OAuth Tokens on Refresh Failure', () => {
  let mockDb;
  let originalFetch;
  let originalConsoleError;
  const userA = 'usr_auth001_seller_a';
  const userB = 'usr_auth001_seller_b';

  beforeEach(async () => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    console.error = () => {}; // suppress intentional error logs during tests

    mockDb = createMockD1();

    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin, created_at)
      VALUES
        ('${userA}', 'sellerA@techtrekgt.test', 'hash', 'Seller A', 'user', 0, datetime('now')),
        ('${userB}', 'sellerB@techtrekgt.test', 'hash', 'Seller B', 'user', 0, datetime('now'));
    `);

    const pastExp = new Date(Date.now() - 3600 * 1000).toISOString();
    const farFutureExp = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

    const encAccessA = await encryptToken('access_token_a', TEST_TOKEN_ENCRYPTION_KEY);
    const encRefreshA = await encryptToken('refresh_token_a', TEST_TOKEN_ENCRYPTION_KEY);
    const encAccessB = await encryptToken('access_token_b', TEST_TOKEN_ENCRYPTION_KEY);
    const encRefreshB = await encryptToken('refresh_token_b', TEST_TOKEN_ENCRYPTION_KEY);

    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES
        ('tok_auth001_a', '${userA}', '${encAccessA}', '${encRefreshA}', '${pastExp}', '${farFutureExp}', 'sell.inventory'),
        ('tok_auth001_b', '${userB}', '${encAccessB}', '${encRefreshB}', '${pastExp}', '${farFutureExp}', 'sell.inventory');
    `);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  test('deletes user token record and throws when eBay refresh returns HTTP 400 (revoked / suspended account)', async () => {
    global.fetch = async () => {
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'token has been revoked' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const env = {
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY,
      EBAY_CLIENT_ID: 'test_client_id',
      EBAY_CLIENT_SECRET: 'test_client_secret'
    };

    await assert.rejects(
      async () => getEbayUserToken(env, userA),
      /eBay token refresh failed\. Please reconnect your eBay account\./
    );

    // Verify token row was purged from D1 for userA
    const rowA = mockDb._raw.prepare('SELECT * FROM ebay_oauth_tokens WHERE user_id = ?').get(userA);
    assert.strictEqual(rowA, undefined, 'userA token row should be deleted after HTTP 400 refresh failure');

    // Verify userB token row remains untouched
    const rowB = mockDb._raw.prepare('SELECT * FROM ebay_oauth_tokens WHERE user_id = ?').get(userB);
    assert.ok(rowB, 'userB token row should remain untouched');
  });

  test('deletes user token record and throws when eBay refresh returns HTTP 401 (unauthorized / invalid client)', async () => {
    global.fetch = async () => {
      return new Response(JSON.stringify({ error: 'unauthorized_client' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const env = {
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY,
      EBAY_CLIENT_ID: 'test_client_id',
      EBAY_CLIENT_SECRET: 'test_client_secret'
    };

    await assert.rejects(
      async () => getEbayUserToken(env, userA),
      /eBay token refresh failed\. Please reconnect your eBay account\./
    );

    const rowA = mockDb._raw.prepare('SELECT * FROM ebay_oauth_tokens WHERE user_id = ?').get(userA);
    assert.strictEqual(rowA, undefined, 'userA token row should be deleted after HTTP 401 refresh failure');
  });

  test('preserves token record when eBay refresh fails with transient 500 error', async () => {
    global.fetch = async () => {
      return new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    };

    const env = {
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY,
      EBAY_CLIENT_ID: 'test_client_id',
      EBAY_CLIENT_SECRET: 'test_client_secret'
    };

    await assert.rejects(
      async () => getEbayUserToken(env, userA),
      /eBay token refresh failed\. Please reconnect your eBay account\./
    );

    const rowA = mockDb._raw.prepare('SELECT * FROM ebay_oauth_tokens WHERE user_id = ?').get(userA);
    assert.ok(rowA, 'userA token row should NOT be deleted on transient 500 error');
  });
});
