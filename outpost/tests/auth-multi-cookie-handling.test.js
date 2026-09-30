import { describe, test } from 'node:test';
import assert from 'node:assert';
import { getAllTokensFromRequest, getTokenFromRequest, createToken } from '../functions/utils/auth.js';
import { requireAuth } from '../functions/utils/guard.js';
import { requireGatewayAuth } from '../../landing/src/gateway/guard.js';
import { getAllTokensFromRequest as landingGetAllTokens } from '../../landing/src/gateway/auth.js';

const TEST_SECRET = 'b9ae84ee4822d8f780c105009e4ed715';
const TEST_ENV = { JWT_SECRET: TEST_SECRET };

describe('Multi-Cookie Authentication & Token Resilience', () => {
  test('getAllTokensFromRequest extracts multiple auth_token cookies in header order', () => {
    const req = new Request('https://techtrekgt.com/outpost/api/items', {
      headers: {
        'Cookie': 'auth_token=token_first; other_cookie=xyz; auth_token=token_second'
      }
    });

    const tokens = getAllTokensFromRequest(req);
    assert.strictEqual(tokens.length, 2);
    assert.strictEqual(tokens[0], 'token_first');
    assert.strictEqual(tokens[1], 'token_second');

    // Backward compatibility: getTokenFromRequest returns the primary token
    assert.strictEqual(getTokenFromRequest(req), 'token_first');
  });

  test('landing getAllTokensFromRequest extracts multiple auth_token cookies and Bearer header', () => {
    const req = new Request('https://techtrekgt.com/api/ebay/comps', {
      headers: {
        'Cookie': 'auth_token=cookie_one; auth_token=cookie_two',
        'Authorization': 'Bearer bearer_token'
      }
    });

    const tokens = landingGetAllTokens(req);
    assert.strictEqual(tokens.length, 3);
    assert.strictEqual(tokens[0], 'cookie_one');
    assert.strictEqual(tokens[1], 'cookie_two');
    assert.strictEqual(tokens[2], 'bearer_token');
  });

  test('requireAuth succeeds when an expired cookie precedes a valid cookie (Finance / Outpost cookie collision)', async () => {
    const validToken = await createToken(
      { userId: 'user-active-123', email: 'active@example.com', name: 'Active User' },
      TEST_SECRET,
      3600
    );
    const expiredToken = await createToken(
      { userId: 'user-expired-999', email: 'expired@example.com', name: 'Expired User' },
      TEST_SECRET,
      -3600 // expired 1 hour ago
    );

    // Browser orders Path=/api before Path=/ so expired token is first
    const req = new Request('https://techtrekgt.com/outpost/api/items', {
      headers: {
        'Cookie': `auth_token=${expiredToken}; auth_token=${validToken}`
      }
    });

    const payload = await requireAuth(req, TEST_ENV);
    assert.ok(payload);
    assert.strictEqual(payload.userId, 'user-active-123');
    assert.strictEqual(payload.email, undefined); // PRIV-003: no email in JWT payload
  });

  test('requireGatewayAuth succeeds when an expired cookie precedes a valid cookie', async () => {
    const validToken = await createToken(
      { userId: 'user-gateway-456', email: 'gateway@example.com', name: 'Gateway User' },
      TEST_SECRET,
      3600
    );
    const expiredToken = await createToken(
      { userId: 'user-expired-888', email: 'expired@example.com', name: 'Expired User' },
      TEST_SECRET,
      -3600
    );

    const req = new Request('https://techtrekgt.com/api/ebay/comps', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${expiredToken}; auth_token=${validToken}`
      },
      body: JSON.stringify({ query: 'baseball card' })
    });

    const payload = await requireGatewayAuth(req, TEST_ENV);
    assert.ok(payload);
    assert.strictEqual(payload.userId, 'user-gateway-456');
  });

  test('requireAuth throws 401 Unauthorized: missing token when no tokens are present', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/items', {
      headers: {
        'Cookie': 'other_cookie=value'
      }
    });

    try {
      await requireAuth(req, TEST_ENV);
      assert.fail('Expected requireAuth to throw Response');
    } catch (response) {
      assert.ok(response instanceof Response);
      assert.strictEqual(response.status, 401);
      const data = await response.json();
      assert.strictEqual(data.error, 'Unauthorized: missing token');
    }
  });

  test('requireAuth throws 401 Unauthorized: invalid or expired token when all tokens are invalid/expired', async () => {
    const expired1 = await createToken(
      { userId: 'u1', email: 'u1@example.com', name: 'U1' },
      TEST_SECRET,
      -100
    );
    const expired2 = await createToken(
      { userId: 'u2', email: 'u2@example.com', name: 'U2' },
      TEST_SECRET,
      -200
    );

    const req = new Request('https://techtrekgt.com/outpost/api/items', {
      headers: {
        'Cookie': `auth_token=${expired1}; auth_token=${expired2}`
      }
    });

    try {
      await requireAuth(req, TEST_ENV);
      assert.fail('Expected requireAuth to throw Response');
    } catch (response) {
      assert.ok(response instanceof Response);
      assert.strictEqual(response.status, 401);
      const data = await response.json();
      assert.strictEqual(data.error, 'Unauthorized: invalid or expired token');
    }
  });
});
