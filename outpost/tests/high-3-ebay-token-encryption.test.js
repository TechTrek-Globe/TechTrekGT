import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveKey,
  encryptToken,
  decryptToken,
  OLD_SALT,
  NEW_SALT,
  PBKDF2_ITERATIONS_V1
} from '../functions/utils/tokenCrypto.js';
import { getEbayUserToken } from '../functions/utils/ebayAuth.js';
import { getEbayUserToken as getEbayUserTokenHelper } from '../functions/api/ebay/tokenHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'old-jwt-secret-key-for-sessions-32b';
const TEST_TOKEN_ENCRYPTION_KEY = 'new-dedicated-token-encryption-key-32b';

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

describe('[HIGH-3] eBay OAuth Token Encryption Key Isolation', () => {
  let mockDb;
  const userId = 'usr_ebay_seller_123';

  beforeEach(() => {
    mockDb = createMockD1();

    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, role, is_admin, created_at)
      VALUES ('${userId}', 'seller@techtrekgt.com', 'hash', 'Seller One', 'user', 0, '2026-01-01 10:00:00');
    `);
  });

  test('deriveKey uses separate key material and dedicated salt', async () => {
    const rawPlaintext = 'v^1.1#i^1#r^0#p^3#I^3#f^0#TestEbayOAuthTokenString12345';

    // Encrypt with NEW derivation (TOKEN_ENCRYPTION_KEY + NEW_SALT)
    const encrypted = await encryptToken(rawPlaintext, TEST_TOKEN_ENCRYPTION_KEY);
    assert.ok(encrypted.includes('.'));

    // Decrypting with NEW key succeeds
    const { plaintext: decrypted } = await decryptToken(encrypted, TEST_TOKEN_ENCRYPTION_KEY);
    assert.strictEqual(decrypted, rawPlaintext);

    // Decrypting with wrong key fails to decrypt
    await assert.rejects(
      async () => {
        await decryptToken(encrypted, TEST_JWT_SECRET);
      },
      /Failed to decrypt/
    );
  });

  test('decryptToken supports transition window for legacy tokens', async () => {
    const legacyPlaintext = 'legacy_refresh_token_value_abc_xyz';

    // Legacy encryption: OLD_SALT + TOKEN_ENCRYPTION_KEY (100k iterations)
    const oldKey = await deriveKey(TEST_TOKEN_ENCRYPTION_KEY, OLD_SALT, PBKDF2_ITERATIONS_V1);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(legacyPlaintext);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, oldKey, encoded);
    const legacyEncrypted = `${btoa(String.fromCharCode(...new Uint8Array(iv)))}.${btoa(String.fromCharCode(...new Uint8Array(cipherBuf)))}`;

    // Transition decrypt: primary key is TOKEN_ENCRYPTION_KEY
    const { plaintext: decrypted, wasLegacy } = await decryptToken(legacyEncrypted, TEST_TOKEN_ENCRYPTION_KEY);
    assert.strictEqual(decrypted, legacyPlaintext);
    assert.strictEqual(wasLegacy, true);
  });

  test('getEbayUserToken decrypts and returns tokens using ONLY TOKEN_ENCRYPTION_KEY', async () => {
    const rawAccessToken = 'ebay_access_token_production_quality_abc_123';
    const rawRefreshToken = 'ebay_refresh_token_production_quality_xyz_789';

    const encAccess = await encryptToken(rawAccessToken, TEST_TOKEN_ENCRYPTION_KEY);
    const encRefresh = await encryptToken(rawRefreshToken, TEST_TOKEN_ENCRYPTION_KEY);

    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    const farFutureExp = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok_test_1', '${userId}', '${encAccess}', '${encRefresh}', '${futureExp}', '${farFutureExp}', 'sell.inventory sell.fulfillment');
    `);

    // Environment has ONLY TOKEN_ENCRYPTION_KEY, no JWT_SECRET provided
    const envIsolated = {
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY
    };

    // 1. Test functions/utils/ebayAuth.js
    const tokenFromAuth = await getEbayUserToken(envIsolated, userId);
    assert.strictEqual(tokenFromAuth, rawAccessToken);

    // 2. Test functions/api/ebay/tokenHelper.js
    const tokenFromHelper = await getEbayUserTokenHelper(envIsolated, userId);
    assert.strictEqual(tokenFromHelper, rawAccessToken);
  });

  test('Simulate full migration: legacy row re-encrypted with TOKEN_ENCRYPTION_KEY', async () => {
    const legacyAccess = 'v^1.1#legacy_access_token_prior_to_migration';
    const legacyRefresh = 'v^1.1#legacy_refresh_token_prior_to_migration';

    // Simulate pre-existing row in D1 encrypted with TOKEN_ENCRYPTION_KEY and OLD_SALT
    const oldKey = await deriveKey(TEST_TOKEN_ENCRYPTION_KEY, OLD_SALT, PBKDF2_ITERATIONS_V1);
    const ivA = crypto.getRandomValues(new Uint8Array(12));
    const cipherA = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivA }, oldKey, new TextEncoder().encode(legacyAccess));
    const legacyEncAccess = `${btoa(String.fromCharCode(...new Uint8Array(ivA)))}.${btoa(String.fromCharCode(...new Uint8Array(cipherA)))}`;

    const ivR = crypto.getRandomValues(new Uint8Array(12));
    const cipherR = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivR }, oldKey, new TextEncoder().encode(legacyRefresh));
    const legacyEncRefresh = `${btoa(String.fromCharCode(...new Uint8Array(ivR)))}.${btoa(String.fromCharCode(...new Uint8Array(cipherR)))}`;

    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    const farFutureExp = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

    mockDb._raw.exec(`
      INSERT INTO ebay_oauth_tokens (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes)
      VALUES ('tok_legacy_1', '${userId}', '${legacyEncAccess}', '${legacyEncRefresh}', '${futureExp}', '${farFutureExp}', 'sell.inventory sell.fulfillment');
    `);

    // Perform migration logic:
    // 1. Decrypt with OLD key derivation
    const { plaintext: decryptedAccess } = await decryptToken(legacyEncAccess, TEST_TOKEN_ENCRYPTION_KEY);
    const { plaintext: decryptedRefresh } = await decryptToken(legacyEncRefresh, TEST_TOKEN_ENCRYPTION_KEY);
    assert.strictEqual(decryptedAccess, legacyAccess);
    assert.strictEqual(decryptedRefresh, legacyRefresh);

    // 2. Re-encrypt with NEW key derivation
    const migratedEncAccess = await encryptToken(decryptedAccess, TEST_TOKEN_ENCRYPTION_KEY);
    const migratedEncRefresh = await encryptToken(decryptedRefresh, TEST_TOKEN_ENCRYPTION_KEY);

    // 3. Update row in D1
    mockDb._raw.prepare(`
      UPDATE ebay_oauth_tokens
      SET access_token = ?, refresh_token = ?
      WHERE user_id = ?
    `).run(migratedEncAccess, migratedEncRefresh, userId);

    // 4. Verification: only TOKEN_ENCRYPTION_KEY is present
    const envOnlyNewKey = {
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_ENCRYPTION_KEY
    };

    const tokenRetrieved = await getEbayUserToken(envOnlyNewKey, userId);
    assert.strictEqual(tokenRetrieved, legacyAccess);
  });
});
