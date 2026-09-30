/**
 * sec-003-007-token-encryption-fail-closed.test.js
 *
 * Tests for T-03:
 *   SEC-003: TOKEN_ENCRYPTION_KEY absent => 503, no fallback to JWT_SECRET
 *   SEC-004: v2 versioned ciphertext envelope
 *   SEC-005: PBKDF2 iterations raised to 310k for v2
 *   SEC-007: Legacy v1 tokens re-encrypted in-place on successful decryption
 *   PERF-007: Rate limiting fail-closed on all four auth-adjacent endpoints
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  encryptToken,
  decryptToken,
  deriveKey,
  OLD_SALT,
  NEW_SALT,
  PBKDF2_ITERATIONS_V1,
  PBKDF2_ITERATIONS_V2
} from '../functions/utils/tokenCrypto.js';

import { checkRateLimit } from '../functions/utils/rateLimit.js';
import { onRequestPost as forgotPasswordPost } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordPost } from '../functions/api/auth/reset-password.js';
import { onRequestPost as securityQuestionPost } from '../functions/api/auth/security-question.js';
import { onRequestGet as verifyEmailGet, onRequestPost as verifyEmailPost } from '../functions/api/auth/verify-email.js';
import { hashPassword } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_ENCRYPTION_KEY = 'test-dedicated-token-encryption-key-32b';
const TEST_JWT_SECRET = 'test-jwt-secret-completely-different-key';

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
        bind(...params) { boundParams = params; return this; },
        async first() { return db.prepare(sql).get(...boundParams) || null; },
        async all() { return { results: db.prepare(sql).all(...boundParams) }; },
        async run() {
          const info = db.prepare(sql).run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(stmts) {
      for (const stmt of stmts) await stmt.run();
      return stmts.map(() => ({ success: true }));
    }
  };
}

function createWorkingKV() {
  const store = new Map();
  return {
    async get(key) { return store.get(key) || null; },
    async put(key, val) { store.set(key, String(val)); }
  };
}

// ============================================================================
// SECTION A: Token Encryption Unit Tests
// ============================================================================

describe('[SEC-003/004/005] Token Encryption - Versioned Envelope and Key Hardening', () => {

  test('encryptToken produces a v2-prefixed envelope', async () => {
    const cipher = await encryptToken('my-ebay-access-token', TEST_ENCRYPTION_KEY);
    assert.ok(cipher.startsWith('v2.'), `Expected v2 prefix, got: ${cipher.slice(0, 10)}`);
    // v2.<iv_b64>.<ciphertext_b64> - must have exactly two dots after prefix
    const parts = cipher.split('.');
    assert.strictEqual(parts.length, 3, 'v2 envelope should have exactly 3 dot-separated parts');
  });

  test('decryptToken correctly round-trips a v2 encrypted token', async () => {
    const plaintext = 'v^1.1#i^1#r^0#p^3#EbayProdToken123';
    const cipher = await encryptToken(plaintext, TEST_ENCRYPTION_KEY);
    const { plaintext: decrypted, wasLegacy } = await decryptToken(cipher, TEST_ENCRYPTION_KEY);
    assert.strictEqual(decrypted, plaintext);
    assert.strictEqual(wasLegacy, false);
  });

  test('decryptToken throws a clear error on corrupted v2 ciphertext', async () => {
    const cipher = await encryptToken('good-token', TEST_ENCRYPTION_KEY);
    // Corrupt the ciphertext portion
    const parts = cipher.split('.');
    parts[2] = parts[2].slice(0, -4) + 'XXXX';
    const corrupted = parts.join('.');

    await assert.rejects(
      async () => decryptToken(corrupted, TEST_ENCRYPTION_KEY),
      /Failed to decrypt v2 token/
    );
  });

  test('decryptToken throws a clear error on corrupted v1 legacy ciphertext', async () => {
    // Simulate a v1 (no-prefix) token with corrupted ciphertext
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ivB64 = btoa(String.fromCharCode(...iv));
    const fakeCorrupted = `${ivB64}.AAAA`;

    await assert.rejects(
      async () => decryptToken(fakeCorrupted, TEST_ENCRYPTION_KEY),
      /Failed to decrypt token/
    );
  });

  test('decryptToken never returns null silently on corrupted input', async () => {
    // atob on invalid base64 throws InvalidCharacterError; decrypt of wrong-length data throws OperationError.
    // Either way, the function throws rather than returning null silently.
    await assert.rejects(
      async () => decryptToken('not.valid.ciphertext', TEST_ENCRYPTION_KEY),
      (err) => {
        // Must throw something - the specific error type depends on where parsing fails
        assert.ok(err instanceof Error, 'Must throw an Error instance, not return null');
        return true;
      }
    );
  });

  test('v2 encryption uses 310k PBKDF2 iterations (not the v1 100k)', async () => {
    const plaintext = 'token-to-verify-iterations';

    // Derive a key with v1 iterations - should NOT decrypt a v2-encrypted token
    const v1Key = await deriveKey(TEST_ENCRYPTION_KEY, NEW_SALT, PBKDF2_ITERATIONS_V1);
    const cipher = await encryptToken(plaintext, TEST_ENCRYPTION_KEY);

    // Extract IV and ciphertext from the v2 envelope
    const parts = cipher.split('.');
    const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
    const cipherBuf = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));

    await assert.rejects(
      async () => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, v1Key, cipherBuf),
      undefined,
      'v1-iteration key should not decrypt a v2 token'
    );

    // v2 key should decrypt successfully
    const { plaintext: decrypted } = await decryptToken(cipher, TEST_ENCRYPTION_KEY);
    assert.strictEqual(decrypted, plaintext);
  });

  test('v2 encryption uses a different key than v1 derivation', async () => {
    assert.notStrictEqual(PBKDF2_ITERATIONS_V1, PBKDF2_ITERATIONS_V2);
    assert.strictEqual(PBKDF2_ITERATIONS_V2, 310_000);
    assert.strictEqual(PBKDF2_ITERATIONS_V1, 100_000);
  });

  test('decryptToken refuses to decrypt when TOKEN_ENCRYPTION_KEY is null', async () => {
    const cipher = await encryptToken('token', TEST_ENCRYPTION_KEY);
    await assert.rejects(
      async () => decryptToken(cipher, null),
      /TOKEN_ENCRYPTION_KEY binding is required/
    );
  });

  test('v2 token is NOT decryptable with JWT_SECRET (key isolation)', async () => {
    const plaintext = 'isolated-ebay-token';
    const cipher = await encryptToken(plaintext, TEST_ENCRYPTION_KEY);

    await assert.rejects(
      async () => decryptToken(cipher, TEST_JWT_SECRET),
      /Failed to decrypt v2 token/
    );
  });
});

// ============================================================================
// SECTION B: Legacy v1 token decryption and in-place migration
// ============================================================================

describe('[SEC-007] Legacy v1 Token Decryption and wasLegacy Migration Signal', () => {

  async function makeV1Token(plaintext, key, salt) {
    const encKey = await deriveKey(key, salt, PBKDF2_ITERATIONS_V1);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      encKey,
      new TextEncoder().encode(plaintext)
    );
    const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
    return `${b64(iv)}.${b64(buf)}`;
  }

  test('decryptToken succeeds on v1 NEW_SALT token and sets wasLegacy=true', async () => {
    const plaintext = 'legacy-access-token-new-salt';
    const v1Token = await makeV1Token(plaintext, TEST_ENCRYPTION_KEY, NEW_SALT);

    // Must NOT start with v2.
    assert.ok(!v1Token.startsWith('v2.'));

    const result = await decryptToken(v1Token, TEST_ENCRYPTION_KEY);
    assert.strictEqual(result.plaintext, plaintext);
    assert.strictEqual(result.wasLegacy, true);
  });

  test('decryptToken succeeds on v1 OLD_SALT token and sets wasLegacy=true', async () => {
    const plaintext = 'oldest-legacy-token-old-salt';
    const v1Token = await makeV1Token(plaintext, TEST_ENCRYPTION_KEY, OLD_SALT);

    const result = await decryptToken(v1Token, TEST_ENCRYPTION_KEY);
    assert.strictEqual(result.plaintext, plaintext);
    assert.strictEqual(result.wasLegacy, true);
  });

  test('legacy-decrypted token is re-encrypted under v2 and persisted in D1', async () => {
    const db = createMockD1();
    const userId = 'usr-legacy-migration-test';
    const plaintext = 'ebay-refresh-token-legacy-value';

    // Create a v1 OLD_SALT token (as if stored before migration)
    const v1Token = await makeV1Token(plaintext, TEST_ENCRYPTION_KEY, OLD_SALT);
    const futureAccessExp = new Date(Date.now() + 7200 * 1000).toISOString();
    const futureRefreshExp = new Date(Date.now() + 90 * 86400 * 1000).toISOString();

    db._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin)
      VALUES ('${userId}', 'legacy@test.com', 'hash', 'Legacy', 'user', 0);
    `);
    db._raw.exec(`
      INSERT INTO ebay_oauth_tokens
        (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok-legacy', '${userId}', '${v1Token}', '${v1Token}',
              '${futureAccessExp}', '${futureRefreshExp}', 'sell.inventory');
    `);

    // Decrypt the v1 token
    const { plaintext: decrypted, wasLegacy } = await decryptToken(v1Token, TEST_ENCRYPTION_KEY);
    assert.strictEqual(decrypted, plaintext);
    assert.strictEqual(wasLegacy, true);

    // Simulate the in-place migration: re-encrypt and UPDATE
    const v2Token = await encryptToken(decrypted, TEST_ENCRYPTION_KEY);
    assert.ok(v2Token.startsWith('v2.'));
    db._raw.prepare(`UPDATE ebay_oauth_tokens SET access_token = ? WHERE user_id = ?`)
      .run(v2Token, userId);

    // Verify: reading back the row now gives a v2 token
    const row = db._raw.prepare(`SELECT access_token FROM ebay_oauth_tokens WHERE user_id = ?`).get(userId);
    assert.ok(row.access_token.startsWith('v2.'));

    // And v2 decryption works without wasLegacy
    const { plaintext: roundTrip, wasLegacy: wasLegacy2 } = await decryptToken(row.access_token, TEST_ENCRYPTION_KEY);
    assert.strictEqual(roundTrip, plaintext);
    assert.strictEqual(wasLegacy2, false);
  });
});

// ============================================================================
// SECTION C: Rate Limiting fail-closed on the four auth-adjacent endpoints
// ============================================================================

describe('[PERF-007] Auth-Adjacent Endpoints: Fail-Closed Rate Limiting', () => {
  let mockDb;

  beforeEach(async () => {
    mockDb = createMockD1();
    const passwordHash = await hashPassword('Password123!');
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, status, role, email_verified,
                         security_question, security_answer_hash)
      VALUES ('usr-rate-test', 'ratetest@test.com', '${passwordHash}', 'Rate Test',
              'Active', 'user', 1, 'Favorite color?', '${passwordHash}');
    `);
  });

  // --- forgot-password ---
  test('POST /api/auth/forgot-password returns 429 when RATE_LIMIT_KV is null (failClosed)', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.1' },
      body: JSON.stringify({ email: 'ratetest@test.com' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
    const res = await forgotPasswordPost({ request: req, env });
    assert.strictEqual(res.status, 429, 'forgot-password must fail-closed with 429 when KV is null');
    const body = await res.json();
    assert.ok(body.error, 'Response must include an error message');
  });

  test('POST /api/auth/forgot-password returns 429 when RATE_LIMIT_KV throws', async () => {
    const throwingKV = { async get() { throw new Error('KV error'); }, async put() { throw new Error('KV error'); } };
    const req = new Request('https://techtrekgt.com/outpost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.2' },
      body: JSON.stringify({ email: 'ratetest@test.com' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: throwingKV };
    const res = await forgotPasswordPost({ request: req, env });
    assert.strictEqual(res.status, 429);
  });

  // --- reset-password ---
  test('POST /api/auth/reset-password returns 429 when RATE_LIMIT_KV is null (failClosed)', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.3' },
      body: JSON.stringify({ email: 'ratetest@test.com', newPassword: 'Password123!' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
    const res = await resetPasswordPost({ request: req, env });
    assert.strictEqual(res.status, 429, 'reset-password must fail-closed with 429 when KV is null');
  });

  test('POST /api/auth/reset-password returns 429 when RATE_LIMIT_KV throws', async () => {
    const throwingKV = { async get() { throw new Error('KV error'); }, async put() { throw new Error('KV error'); } };
    const req = new Request('https://techtrekgt.com/outpost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.4' },
      body: JSON.stringify({ email: 'ratetest@test.com', newPassword: 'Password123!' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: throwingKV };
    const res = await resetPasswordPost({ request: req, env });
    assert.strictEqual(res.status, 429);
  });

  // --- security-question ---
  test('POST /api/auth/security-question returns 429 when RATE_LIMIT_KV is null (failClosed)', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/auth/security-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.5' },
      body: JSON.stringify({ email: 'ratetest@test.com' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
    const res = await securityQuestionPost({ request: req, env });
    assert.strictEqual(res.status, 429,
      'security-question must fail-closed with 429 when KV is null (was previously fail-open, disclosing account info)');
    const body = await res.json();
    // Must NOT disclose account info when rate limited
    assert.ok(!body.securityQuestion, 'Must not leak security question when rate-limited');
  });

  test('POST /api/auth/security-question returns 429 when RATE_LIMIT_KV throws', async () => {
    const throwingKV = { async get() { throw new Error('KV error'); }, async put() { throw new Error('KV error'); } };
    const req = new Request('https://techtrekgt.com/outpost/api/auth/security-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.6' },
      body: JSON.stringify({ email: 'ratetest@test.com' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: throwingKV };
    const res = await securityQuestionPost({ request: req, env });
    assert.strictEqual(res.status, 429);
  });

  // --- verify-email ---
  test('GET /api/auth/verify-email returns 429 when RATE_LIMIT_KV is null (failClosed)', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/auth/verify-email?token=test-token', {
      method: 'GET',
      headers: { 'CF-Connecting-IP': '10.0.0.7' }
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
    const res = await verifyEmailGet({ request: req, env });
    assert.strictEqual(res.status, 429, 'verify-email GET must fail-closed with 429 when KV is null');
  });

  test('POST /api/auth/verify-email returns 429 when RATE_LIMIT_KV is null (failClosed)', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.8' },
      body: JSON.stringify({ token: 'test-verification-token' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
    const res = await verifyEmailPost({ request: req, env });
    assert.strictEqual(res.status, 429, 'verify-email POST must fail-closed with 429 when KV is null');
  });

  // --- Regression: login/register still fail-closed (unchanged) ---
  test('checkRateLimit failClosed=true still blocks when RATE_LIMIT_KV is null', async () => {
    const result = await checkRateLimit(null, 'test:1.2.3.4', 5, 60, true);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.retryAfter, 60);
  });

  test('checkRateLimit failClosed=false still allows when RATE_LIMIT_KV is null', async () => {
    const result = await checkRateLimit(null, 'test:1.2.3.4', 5, 60, false);
    assert.strictEqual(result.allowed, true);
  });

  // --- Retry-After header accuracy ---
  test('Endpoints return Retry-After header when 429 is issued', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/auth/security-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.99' },
      body: JSON.stringify({ email: 'ratetest@test.com' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: null };
    const res = await securityQuestionPost({ request: req, env });
    assert.strictEqual(res.status, 429);
    const retryAfter = res.headers.get('Retry-After');
    assert.ok(retryAfter, 'Retry-After header must be present on 429');
    assert.ok(Number(retryAfter) > 0, `Retry-After must be positive, got: ${retryAfter}`);
  });

  // --- Endpoints work normally when KV is available ---
  test('POST /api/auth/security-question succeeds (200) when RATE_LIMIT_KV is bound', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/auth/security-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.1' },
      body: JSON.stringify({ email: 'ratetest@test.com' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: createWorkingKV() };
    const res = await securityQuestionPost({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.hasSecurityQuestion, true);
  });

  test('POST /api/auth/forgot-password returns generic 200 (non-enumerable) when KV is bound', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.2' },
      body: JSON.stringify({ email: 'ratetest@test.com' })
    });
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, RATE_LIMIT_KV: createWorkingKV() };
    const res = await forgotPasswordPost({ request: req, env });
    // Returns 200 regardless of whether account exists (enumeration prevention)
    assert.strictEqual(res.status, 200);
  });
});

// ============================================================================
// SECTION D: SEC-003 fail-closed - TOKEN_ENCRYPTION_KEY absent => 503
// ============================================================================

describe('[SEC-003] getEbayUserToken: TOKEN_ENCRYPTION_KEY absent throws 503-tagged error', () => {
  let mockDb;
  const userId = 'usr-sec003-test';

  beforeEach(async () => {
    mockDb = createMockD1();
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin)
      VALUES ('${userId}', 'sec003@test.com', 'hash', 'SEC003', 'user', 0);
    `);

    const cipher = await encryptToken('ebay-access-token-value', TEST_ENCRYPTION_KEY);
    const cipherR = await encryptToken('ebay-refresh-token-value', TEST_ENCRYPTION_KEY);
    const futureExp = new Date(Date.now() + 7200 * 1000).toISOString();
    const farFuture = new Date(Date.now() + 90 * 86400 * 1000).toISOString();
    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens
        (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok-sec003', '${userId}', '${cipher}', '${cipherR}',
              '${futureExp}', '${farFuture}', 'sell.inventory');
    `);
  });

  test('getEbayUserToken from ebayAuth.js throws statusCode=503 when TOKEN_ENCRYPTION_KEY absent', async () => {
    const { getEbayUserToken } = await import('../functions/utils/ebayAuth.js');
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    // Must not fall back to JWT_SECRET
    await assert.rejects(
      async () => getEbayUserToken(env, userId),
      (err) => {
        assert.ok(err.statusCode === 503 || err.message.includes('temporarily unavailable'),
          `Expected 503 statusCode or 'temporarily unavailable' message, got: ${err.message}`);
        // Critical: error must NOT mention the binding name to end user
        assert.ok(!err.message.toLowerCase().includes('jwt_secret'),
          'Error must not expose JWT_SECRET binding name to user');
        assert.ok(!err.message.toLowerCase().includes('token_encryption_key'),
          'Error must not expose TOKEN_ENCRYPTION_KEY binding name to user');
        return true;
      }
    );
  });

  test('getEbayUserToken from tokenHelper.js throws statusCode=503 when TOKEN_ENCRYPTION_KEY absent', async () => {
    const { getEbayUserToken } = await import('../functions/api/ebay/tokenHelper.js');
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    await assert.rejects(
      async () => getEbayUserToken(env, userId),
      (err) => {
        assert.ok(err.statusCode === 503 || err.message.includes('temporarily unavailable'),
          `Expected 503 statusCode or 'temporarily unavailable' message, got: ${err.message}`);
        return true;
      }
    );
  });

  test('getEbayUserToken still throws "not connected" (not 503) when no eBay row exists', async () => {
    const { getEbayUserToken } = await import('../functions/utils/ebayAuth.js');
    // User without an ebay token row - should get "not connected" not a 503
    const env = { DB: mockDb, TOKEN_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY };
    await assert.rejects(
      async () => getEbayUserToken(env, 'nonexistent-user-id'),
      (err) => {
        assert.ok(!err.statusCode || err.statusCode !== 503,
          'Missing eBay account should not produce a 503 - it should produce a "not connected" error');
        assert.ok(err.message.toLowerCase().includes('not connected') || err.message.toLowerCase().includes('connect'),
          `Expected 'not connected' message, got: ${err.message}`);
        return true;
      }
    );
  });

  test('getEbayUserToken succeeds normally when TOKEN_ENCRYPTION_KEY is properly bound', async () => {
    const { getEbayUserToken } = await import('../functions/utils/ebayAuth.js');
    const env = {
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      JWT_SECRET: TEST_JWT_SECRET
    };
    const token = await getEbayUserToken(env, userId);
    assert.strictEqual(token, 'ebay-access-token-value');
  });
});
