import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken, buildAuthCookie } from '../functions/utils/auth.js';
import { requireAuth } from '../functions/utils/guard.js';
import { resolveIntegrationUserId, hashSecret, generateIntegrationSecret } from '../functions/utils/apiIntegrations.js';
import { getEbayUserToken } from '../functions/utils/ebayAuth.js';
import { onRequestGet as getOauthStatus } from '../functions/api/ebay/oauth-status.js';
import { encryptToken } from '../functions/utils/tokenCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-audit-002-minimum-32-bytes-length';
const TEST_ENC_KEY = 'test-enc-key-audit-002-32-bytes-length-ok!';

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
    },
    async batch(statements) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    }
  };
}

describe('AUDIT-002: Authentication and Security State Lifecycle Audit', () => {
  let mockDb;
  let env;
  const user1 = { id: 'usr-audit2-1', email: 'audit2@techtrekgt.test', name: 'Audit User' };

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      TOKEN_ENCRYPTION_KEY: TEST_ENC_KEY
    };

    // Seed test user with initial token_version = 1
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, is_admin, token_version, created_at)
      VALUES (?, ?, 'dummyhash', ?, 'Active', 1, 0, 1, datetime('now'))
    `).run(user1.id, user1.email, user1.name);
  });

  test('requireAuth: Outdated token_version throws 401 Response and clears auth_token cookie', async () => {
    // 1. Create token with tv = 1
    const token = await createToken({ userId: user1.id, tv: 1 }, TEST_JWT_SECRET);
    const req = new Request('https://techtrekgt.com/outpost/api/items', {
      headers: { Cookie: `auth_token=${token}` }
    });

    // Valid initially
    const payload = await requireAuth(req, env);
    assert.strictEqual(payload.userId, user1.id);

    // 2. Increment token_version in database (simulating password reset or logout-all)
    mockDb._raw.prepare('UPDATE users SET token_version = 2 WHERE id = ?').run(user1.id);

    // 3. Request with old token must throw 401 and set clearing cookie
    try {
      await requireAuth(req, env);
      assert.fail('Expected requireAuth to throw 401 Response');
    } catch (err) {
      assert.ok(err instanceof Response, 'Error must be a Response object');
      assert.strictEqual(err.status, 401);
      const setCookie = err.headers.get('Set-Cookie');
      assert.ok(setCookie, 'Must emit Set-Cookie header');
      assert.ok(setCookie.includes('auth_token=;'));
      assert.ok(setCookie.includes('Max-Age=0'));
    }
  });

  test('requireAuth: Expired JWT throws 401 and clears auth_token cookie', async () => {
    const expiredToken = await createToken({ userId: user1.id, tv: 1 }, TEST_JWT_SECRET, -100);
    const req = new Request('https://techtrekgt.com/outpost/api/items', {
      headers: { Cookie: `auth_token=${expiredToken}` }
    });

    try {
      await requireAuth(req, env);
      assert.fail('Expected requireAuth to throw 401');
    } catch (err) {
      assert.ok(err instanceof Response);
      assert.strictEqual(err.status, 401);
      const setCookie = err.headers.get('Set-Cookie');
      assert.ok(setCookie);
      assert.ok(setCookie.includes('Max-Age=0'));
    }
  });

  test('resolveIntegrationUserId: Outdated token_version in presented JWT rejects with null', async () => {
    const token = await createToken({ userId: user1.id, tv: 1 }, TEST_JWT_SECRET);
    
    // Valid initially
    const resolvedBefore = await resolveIntegrationUserId(token, env);
    assert.strictEqual(resolvedBefore, user1.id);

    // Increment token_version
    mockDb._raw.prepare('UPDATE users SET token_version = 2 WHERE id = ?').run(user1.id);

    // Old JWT must now resolve to null
    const resolvedAfter = await resolveIntegrationUserId(token, env);
    assert.strictEqual(resolvedAfter, null);
  });

  test('resolveIntegrationUserId: Manually revoking an integration key in D1 immediately returns null (401)', async () => {
    const secret = generateIntegrationSecret();
    const secretHash = await hashSecret(secret);
    const intId = 'int-audit2-test';

    mockDb._raw.prepare(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES (?, ?, ?, 'Test Integration', datetime('now'))
    `).run(intId, user1.id, secretHash);

    // Active key resolves cleanly
    const resolvedActive = await resolveIntegrationUserId(secret, env);
    assert.strictEqual(resolvedActive, user1.id);

    // Manually revoke key in D1
    mockDb._raw.prepare(`
      UPDATE api_integrations SET revoked_at = datetime('now') WHERE id = ?
    `).run(intId);

    // Revoked key returns null immediately
    const resolvedRevoked = await resolveIntegrationUserId(secret, env);
    assert.strictEqual(resolvedRevoked, null);
  });

  test('ebayAuth: Expired refresh token purges dead record from ebay_oauth_tokens in D1', async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const encAccess = await encryptToken('fake-access', TEST_ENC_KEY);
    const encRefresh = await encryptToken('fake-refresh', TEST_ENC_KEY);

    mockDb._raw.prepare(`
      INSERT INTO ebay_oauth_tokens (user_id, ebay_user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, connected_at)
      VALUES (?, 'ebay-user-1', ?, ?, ?, ?, 'sell.inventory', datetime('now'))
    `).run(user1.id, encAccess, encRefresh, pastDate, pastDate);

    // Confirm row exists in D1
    const rowBefore = mockDb._raw.prepare('SELECT user_id FROM ebay_oauth_tokens WHERE user_id = ?').get(user1.id);
    assert.ok(rowBefore);

    // Calling getEbayUserToken must throw expired error and purge the dead row
    await assert.rejects(
      async () => getEbayUserToken(env, user1.id),
      /eBay refresh token has expired/
    );

    // Confirm dead row was scrubbed from D1
    const rowAfter = mockDb._raw.prepare('SELECT user_id FROM ebay_oauth_tokens WHERE user_id = ?').get(user1.id);
    assert.strictEqual(rowAfter, undefined);
  });

  test('oauth-status: Expired refresh token scrubs dead record and returns connected: false', async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const encAccess = await encryptToken('fake-access', TEST_ENC_KEY);
    const encRefresh = await encryptToken('fake-refresh', TEST_ENC_KEY);

    mockDb._raw.prepare(`
      INSERT INTO ebay_oauth_tokens (user_id, ebay_user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, connected_at)
      VALUES (?, 'ebay-user-1', ?, ?, ?, ?, 'sell.inventory', datetime('now'))
    `).run(user1.id, encAccess, encRefresh, pastDate, pastDate);

    const token = await createToken({ userId: user1.id, tv: 1 }, TEST_JWT_SECRET);
    const req = new Request('https://techtrekgt.com/outpost/api/ebay/oauth-status', {
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await getOauthStatus({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.connected, false);

    // Verify row was scrubbed from D1
    const row = mockDb._raw.prepare('SELECT user_id FROM ebay_oauth_tokens WHERE user_id = ?').get(user1.id);
    assert.strictEqual(row, undefined);
  });
});
