import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encryptToken } from '../functions/utils/tokenCrypto.js';
import { getEbayUserToken } from '../functions/api/ebay/tokenHelper.js';
import { findEbayListings, getEbayOAuthStatus } from '../src/utils/auctionApi.js';

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

describe('[AUTH-002] eBay Auth Isolation and Error Preservation', () => {
  let originalFetch;
  let originalWindow;
  let originalCustomEvent;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
    originalCustomEvent = globalThis.CustomEvent;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.CustomEvent = originalCustomEvent;
  });

  test('eBay 401 returns original eBay error and does not dispatch outpost:unauthorized', async () => {
    let unauthorizedDispatched = false;

    globalThis.window = {
      dispatchEvent: (evt) => {
        if (evt.type === 'outpost:unauthorized') unauthorizedDispatched = true;
      }
    };
    globalThis.CustomEvent = class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    };

    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'eBay account not connected or session expired. Please connect your eBay account.'
      })
    });

    await assert.rejects(
      async () => {
        await findEbayListings();
      },
      (err) => {
        assert.ok(
          err.message.includes('eBay account not connected or session expired'),
          `Error message should preserve eBay text instead of rewriting to session expiration. Got: ${err.message}`
        );
        return true;
      }
    );

    assert.strictEqual(
      unauthorizedDispatched,
      false,
      'outpost:unauthorized must NOT be dispatched for eBay integration auth errors'
    );
  });

  test('tokenHelper: preserves still-valid access token if refresh request fails', async () => {
    const mockDb = createMockD1();
    const userId = 'usr_valid_access_refresh_fail';

    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin, created_at)
      VALUES ('${userId}', 'valid@techtrekgt.test', 'hash', 'Valid', 'user', 0, datetime('now'));
    `);

    const rawAccess = 'valid_access_token_still_working';
    const encAccess = await encryptToken(rawAccess, TEST_TOKEN_ENCRYPTION_KEY);
    const encRefresh = await encryptToken('some_refresh_token', TEST_TOKEN_ENCRYPTION_KEY);

    // Access token valid for another 2 minutes (inside the 5-min pre-emptive refresh buffer, but > now)
    const validExp = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const farFutureExp = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok_still_valid', '${userId}', '${encAccess}', '${encRefresh}', '${validExp}', '${farFutureExp}', 'sell.inventory');
    `);

    // Mock fetch to simulate eBay rejecting refresh with 401
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_grant"}'
    });

    const env = {
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY,
      EBAY_CLIENT_ID: 'test_client_id',
      EBAY_CLIENT_SECRET: 'test_client_secret'
    };

    const token = await getEbayUserToken(env, userId);
    assert.strictEqual(token, rawAccess, 'Should fallback to still-valid access token if refresh fails');

    const row = mockDb._raw.prepare('SELECT user_id FROM ebay_oauth_tokens WHERE user_id = ?').get(userId);
    assert.ok(row, 'Database row should NOT be deleted while access token remains valid');
  });
});
