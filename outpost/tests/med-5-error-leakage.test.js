import { test, describe } from 'node:test';
import assert from 'node:assert';
import { withAuth, err, ok } from '../functions/utils/guard.js';
import { onRequestGet as analyticsGet } from '../functions/api/ebay/analytics.js';
import { onRequestPost as pushSkuPost } from '../functions/api/ebay/push-sku.js';
import { onRequestPost as syncItemPost } from '../functions/api/ebay/sync-item.js';
import { onRequestPost as syncAllPost } from '../functions/api/ebay/sync-all.js';
import { onRequestPost as reconcilePost } from '../functions/api/ebay/reconcile.js';
import { createToken } from '../functions/utils/auth.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

describe('MED-5: Internal Error Sanitization & Upstream Body Leakage Prevention', () => {
  test('withAuth returns generic error message and suppresses internal exception details', async () => {
    let loggedError = null;
    const originalConsoleError = console.error;
    console.error = (...args) => {
      loggedError = args;
    };

    try {
      const res = await withAuth(async () => {
        throw new Error('Sensitive SQLite driver exception: SELECT * FROM secret_credentials WHERE user_id = root');
      });

      assert.strictEqual(res.status, 500);
      const body = await res.json();

      // Must be generic client message
      assert.strictEqual(body.error, 'An internal error occurred. Please try again.');
      assert.strictEqual(body.error.includes('SQLite'), false, 'Response must not leak database driver details');
      assert.strictEqual(body.error.includes('secret_credentials'), false, 'Response must not leak SQL queries');

      // Server console must capture full error and stack
      assert.ok(loggedError, 'Server console.error must have been called');
      const logString = loggedError.join(' ');
      assert.ok(logString.includes('Sensitive SQLite driver exception'), 'Server logs must capture real error');
    } finally {
      console.error = originalConsoleError;
    }
  });

  test('withAuth preserves deliberate thrown HTTP Responses unchanged', async () => {
    const deliberateResponse = new Response(JSON.stringify({ error: 'Unauthorized: missing token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });

    const res = await withAuth(async () => {
      throw deliberateResponse;
    });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized: missing token');
  });

  test('eBay Analytics API error does not leak raw upstream response body to client', async () => {
    const userId = 'usr-test-med5';
    const testToken = await createToken({ userId, email: 'seller@techtrekgt.test', name: 'Seller' }, TEST_JWT_SECRET, 7200);

    const rawUpstreamError = JSON.stringify({
      errors: [
        {
          errorId: 50018,
          domain: 'API_ANALYTICS',
          category: 'APPLICATION',
          message: 'Internal server error in eBay Analytics Gateway service: backend node failed connection'
        }
      ]
    });

    let loggedWarnOrError = null;
    const originalConsoleError = console.error;
    console.error = (...args) => {
      loggedWarnOrError = args;
    };

    // Mock fetch that simulates upstream eBay API failure returning raw upstream payload
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('analytics')) {
        return new Response(rawUpstreamError, {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(url);
    };

    try {
      const encryptedAccess = await encryptToken('mock-access-token-12345', 'enc-secret-key-32-bytes-minimum!');
      const mockDb = {
        prepare(sql) {
          return {
            bind() { return this; },
            async first() {
              if (sql.includes('ebay_oauth_tokens')) {
                return {
                  access_token: encryptedAccess,
                  access_token_exp: new Date(Date.now() + 3600000).toISOString(),
                  scopes: 'sell.analytics.readonly'
                };
              }
              if (sql.includes('auction_items')) {
                return { id: 'item-123', ebay_listing_id: '1122334455' };
              }
              return null;
            }
          };
        }
      };

      const env = {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET,
        TOKEN_ENCRYPTION_KEY: 'enc-secret-key-32-bytes-minimum!'
      };

      const req = new Request('https://techtrekgt.com/outpost/api/ebay/analytics?item_id=item-123', {
        headers: { Cookie: `auth_token=${testToken}` }
      });

      const res = await analyticsGet({ request: req, env });
      assert.strictEqual(res.status, 502, 'HTTP status code must be preserved');

      const body = await res.json();
      assert.strictEqual(body.error, 'eBay Analytics request failed. Please try reconnecting your account.');
      assert.strictEqual(body.error.includes('backend node failed connection'), false, 'Must not leak upstream details');
      assert.strictEqual(body.error.includes('API_ANALYTICS'), false, 'Must not leak upstream error domains');

      // Server console captured the upstream error
      assert.ok(loggedWarnOrError);
      assert.ok(loggedWarnOrError.join(' ').includes(rawUpstreamError));
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });

  test('eBay token refresh failure returns generic client message and does not leak upstream OAuth body', async () => {
    const userId = 'usr-test-oauth';
    const testToken = await createToken({ userId, email: 'seller2@techtrekgt.test', name: 'Seller 2' }, TEST_JWT_SECRET, 7200);

    const rawOAuthError = JSON.stringify({
      error: 'invalid_grant',
      error_description: 'The provided authorization grant is invalid, expired, revoked, or does not match the redirection URI.'
    });

    const loggedErrors = [];
    const originalConsoleError = console.error;
    console.error = (...args) => {
      loggedErrors.push(args.map(a => String(a?.stack || a)).join(' '));
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('oauth')) {
        return new Response(rawOAuthError, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(url);
    };

    try {
      const encryptedRefresh = await encryptToken('mock-refresh-token-12345', 'enc-secret-key-32-bytes-minimum!');
      const mockDb = {
        prepare(sql) {
          return {
            bind() { return this; },
            async first() {
              if (sql.includes('ebay_oauth_tokens')) {
                return {
                  access_token: 'expired-token',
                  access_token_exp: new Date(Date.now() - 3600000).toISOString(), // expired
                  refresh_token: encryptedRefresh,
                  refresh_token_exp: new Date(Date.now() + 36000000).toISOString(),
                  scopes: 'sell.analytics.readonly'
                };
              }
              if (sql.includes('auction_items')) {
                return { id: 'item-999', ebay_listing_id: '9988776655' };
              }
              return null;
            }
          };
        }
      };

      const env = {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET,
        TOKEN_ENCRYPTION_KEY: 'enc-secret-key-32-bytes-minimum!',
        EBAY_CLIENT_ID: 'ebay-client-id',
        EBAY_CLIENT_SECRET: 'ebay-client-secret'
      };

      const req = new Request('https://techtrekgt.com/outpost/api/ebay/analytics?item_id=item-999', {
        headers: { Cookie: `auth_token=${testToken}` }
      });

      const res = await analyticsGet({ request: req, env });
      assert.strictEqual(res.status, 401);

      const body = await res.json();
      assert.strictEqual(body.error, 'eBay authentication failed. Please reconnect your eBay account.');
      assert.strictEqual(body.error.includes('invalid_grant'), false, 'Must not leak upstream OAuth body');
      assert.strictEqual(body.error.includes('redirection URI'), false, 'Must not leak OAuth grant details');

      // Server console logged the real upstream failure
      assert.ok(loggedErrors.length > 0);
      assert.ok(loggedErrors.some(log => log.includes(rawOAuthError)));
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });

  test('push-sku returns generic error message when upstream eBay call throws', async () => {
    const userId = 'usr-test-push';
    const testToken = await createToken({ userId, email: 'seller3@techtrekgt.test', name: 'Seller 3' }, TEST_JWT_SECRET, 7200);

    let loggedError = null;
    const originalConsoleError = console.error;
    console.error = (...args) => {
      loggedError = args;
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && (url.includes('ebay') || url.includes('trading'))) {
        throw new Error('TCP connection reset by peer 198.51.100.25:443 during ReviseFixedPriceItem SOAP call');
      }
      return originalFetch(url);
    };

    try {
      const encryptedAccess = await encryptToken('mock-access-token-12345', 'enc-secret-key-32-bytes-minimum!');
      const mockDb = {
        prepare(sql) {
          return {
            bind() { return this; },
            async first() {
              if (sql.includes('ebay_oauth_tokens')) {
                return {
                  access_token: encryptedAccess,
                  access_token_exp: new Date(Date.now() + 3600000).toISOString()
                };
              }
              if (sql.includes('auction_items')) {
                return { id: 'item-push-1', ebay_listing_id: '123456789012', sku: 'OP-260927-0001' };
              }
              return null;
            },
            async run() { return { success: true }; }
          };
        }
      };

      const env = {
        DB: mockDb,
        JWT_SECRET: TEST_JWT_SECRET,
        TOKEN_ENCRYPTION_KEY: 'enc-secret-key-32-bytes-minimum!'
      };

      const req = new Request('https://techtrekgt.com/outpost/api/ebay/push-sku', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${testToken}`
        },
        body: JSON.stringify({ item_id: 'item-push-1' })
      });

      const res = await pushSkuPost({ request: req, env });
      assert.strictEqual(res.status, 502);

      const body = await res.json();
      assert.strictEqual(body.error, 'Failed to push SKU to eBay. Please verify your listing and try again.');
      assert.strictEqual(body.error.includes('TCP connection reset'), false, 'Must not leak socket error');
      assert.strictEqual(body.error.includes('198.51.100.25'), false, 'Must not leak remote IP addresses');

      // Server console logged the real error
      assert.ok(loggedError);
      assert.ok(loggedError.join(' ').includes('TCP connection reset'));
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });
});
