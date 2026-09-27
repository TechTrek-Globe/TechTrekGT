import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  onRequestGet as amazonTokenGet,
  onRequestPost as amazonTokenPost,
  hashToken,
  generateToken
} from '../functions/api/import/amazon-token.js';
import { resolveIntegrationUserId } from '../functions/utils/apiIntegrations.js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

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

function createAuthRequest(url, method, token, body = null) {
  const headers = {
    'Cookie': `auth_token=${token}`,
    'Content-Type': 'application/json'
  };
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

describe('[HIGH-4] Plaintext Storage of amazon_api_token Bearer Credential', () => {
  let mockDb;
  let env;
  const user1 = { id: 'usr-high4-user-1', email: 'user1@techtrekgt.test', name: 'User One' };

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, status, role, email_verified)
      VALUES ('${user1.id}', '${user1.email}', 'dummy_hash', '${user1.name}', 'Active', 'user', 1);
    `);
  });

  test('GET /api/import/amazon-token generates new token, hashes it, and returns plaintext ONLY ONCE', async () => {
    const sessionToken = await createToken({ userId: user1.id, sub: user1.id, email: user1.email, role: 'user', token_version: 0 }, TEST_JWT_SECRET);
    const req = createAuthRequest('https://techtrekgt.com/api/import/amazon-token', 'GET', sessionToken);

    const res = await amazonTokenGet({ request: req, env });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.ok(data.token, 'Must return freshly generated token on initial GET');
    assert.strictEqual(data.isNew, true);
    assert.strictEqual(data.hasToken, true);

    const rawToken = data.token;
    assert.strictEqual(typeof rawToken, 'string');
    assert.strictEqual(rawToken.length, 40, 'Token must be 40 hex chars');

    // Inspect database row directly: verify raw token is NEVER stored in plaintext
    const row = mockDb._raw.prepare('SELECT amazon_api_token, amazon_api_token_hash FROM users WHERE id = ?').get(user1.id);
    assert.strictEqual(row.amazon_api_token, null, 'Plaintext column must be NULL');
    assert.ok(row.amazon_api_token_hash, 'amazon_api_token_hash must be populated');
    assert.strictEqual(row.amazon_api_token_hash.length, 64, 'Stored hash must be 64-character SHA-256 hex digest');

    // Confirm that the stored hash matches SHA-256(rawToken)
    const expectedHash = await hashToken(rawToken);
    assert.strictEqual(row.amazon_api_token_hash, expectedHash);
  });

  test('Subsequent GET /api/import/amazon-token NEVER returns raw token again', async () => {
    const sessionToken = await createToken({ userId: user1.id, sub: user1.id, email: user1.email, role: 'user', token_version: 0 }, TEST_JWT_SECRET);

    // Initial creation call
    const req1 = createAuthRequest('https://techtrekgt.com/api/import/amazon-token', 'GET', sessionToken);
    const res1 = await amazonTokenGet({ request: req1, env });
    const data1 = await res1.json();
    assert.ok(data1.token, 'First call returns generated token');

    // Second GET call: should NOT expose the token
    const req2 = createAuthRequest('https://techtrekgt.com/api/import/amazon-token', 'GET', sessionToken);
    const res2 = await amazonTokenGet({ request: req2, env });
    const data2 = await res2.json();

    assert.strictEqual(res2.status, 200);
    assert.strictEqual(data2.token, null, 'Subsequent GET must return token: null');
    assert.strictEqual(data2.hasToken, true, 'Subsequent GET must signal hasToken: true');
    assert.ok(data2.message.includes('cannot be retrieved'), 'Must inform user that raw key is unretrievable');
  });

  test('POST /api/import/amazon-token rotates token, stores new SHA-256 hash, and returns new plaintext ONCE', async () => {
    const sessionToken = await createToken({ userId: user1.id, sub: user1.id, email: user1.email, role: 'user', token_version: 0 }, TEST_JWT_SECRET);

    // Initial token
    const getRes = await amazonTokenGet({
      request: createAuthRequest('https://techtrekgt.com/api/import/amazon-token', 'GET', sessionToken),
      env
    });
    const { token: token1 } = await getRes.json();
    const hash1 = await hashToken(token1);

    // Rotate token
    const rotateRes = await amazonTokenPost({
      request: createAuthRequest('https://techtrekgt.com/api/import/amazon-token', 'POST', sessionToken),
      env
    });
    const rotateData = await rotateRes.json();

    assert.strictEqual(rotateRes.status, 200);
    assert.ok(rotateData.token);
    assert.notStrictEqual(rotateData.token, token1, 'Rotated token must differ from old token');
    assert.strictEqual(rotateData.rotated, true);
    assert.strictEqual(rotateData.hasToken, true);

    const token2 = rotateData.token;
    const hash2 = await hashToken(token2);

    // Check DB
    const row = mockDb._raw.prepare('SELECT amazon_api_token, amazon_api_token_hash FROM users WHERE id = ?').get(user1.id);
    assert.strictEqual(row.amazon_api_token, null, 'Plaintext column must remain NULL');
    assert.strictEqual(row.amazon_api_token_hash, hash2, 'Database must now contain the new token hash');
    assert.notStrictEqual(row.amazon_api_token_hash, hash1, 'Old hash must be overwritten');

    // Confirm that following GET does not return rotated token
    const getRes2 = await amazonTokenGet({
      request: createAuthRequest('https://techtrekgt.com/api/import/amazon-token', 'GET', sessionToken),
      env
    });
    const getData2 = await getRes2.json();
    assert.strictEqual(getData2.token, null);
    assert.strictEqual(getData2.hasToken, true);
  });

  test('resolveIntegrationUserId authenticates using SHA-256 hash lookup and rejects old/invalid tokens', async () => {
    const sessionToken = await createToken({ userId: user1.id, sub: user1.id, email: user1.email, role: 'user', token_version: 0 }, TEST_JWT_SECRET);

    // Generate token
    const res = await amazonTokenGet({
      request: createAuthRequest('https://techtrekgt.com/api/import/amazon-token', 'GET', sessionToken),
      env
    });
    const { token: activeToken } = await res.json();

    // 1. Authenticate with active token
    const resolvedUser = await resolveIntegrationUserId(activeToken, env);
    assert.strictEqual(resolvedUser, user1.id, 'Freshly generated token must resolve to correct user ID');

    // 2. Authenticate with invalid token
    const invalidResolved = await resolveIntegrationUserId('invalid_token_1234567890abcdef', env);
    assert.strictEqual(invalidResolved, null, 'Invalid token must resolve to null');

    // 3. Rotate token
    const rotateRes = await amazonTokenPost({
      request: createAuthRequest('https://techtrekgt.com/api/import/amazon-token', 'POST', sessionToken),
      env
    });
    const { token: newActiveToken } = await rotateRes.json();

    // 4. Old token must now be rejected
    const oldResolved = await resolveIntegrationUserId(activeToken, env);
    assert.strictEqual(oldResolved, null, 'Pre-rotation token must be rejected');

    // 5. New token must be accepted
    const newResolved = await resolveIntegrationUserId(newActiveToken, env);
    assert.strictEqual(newResolved, user1.id, 'New rotated token must authenticate user');
  });

  test('Simulation: Force-rotation migration of legacy plaintext tokens', async () => {
    const legacyPlaintextToken = 'legacy_plaintext_token_stored_in_db_1234';
    // Manually simulate a legacy database state with plaintext amazon_api_token
    mockDb._raw.exec(`
      UPDATE users SET amazon_api_token = '${legacyPlaintextToken}', amazon_api_token_hash = NULL WHERE id = '${user1.id}';
    `);

    // Force-rotation migration logic:
    // Generate new token, hash it, store in amazon_api_token_hash, nullify amazon_api_token
    const newToken = generateToken();
    const newHash = await hashToken(newToken);
    mockDb._raw.exec(`
      UPDATE users SET amazon_api_token_hash = '${newHash}', amazon_api_token = NULL WHERE id = '${user1.id}';
    `);

    // Verify DB state
    const row = mockDb._raw.prepare('SELECT amazon_api_token, amazon_api_token_hash FROM users WHERE id = ?').get(user1.id);
    assert.strictEqual(row.amazon_api_token, null, 'Plaintext token must be purged');
    assert.strictEqual(row.amazon_api_token_hash, newHash, 'New hash must be saved');

    // Old token fails
    const oldRes = await resolveIntegrationUserId(legacyPlaintextToken, env);
    assert.strictEqual(oldRes, null, 'Legacy plaintext token must no longer work');

    // New token succeeds
    const newRes = await resolveIntegrationUserId(newToken, env);
    assert.strictEqual(newRes, user1.id, 'New migrated token must authenticate successfully');
  });
});
