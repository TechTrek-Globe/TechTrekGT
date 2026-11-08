import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import {
  PBKDF2_ITERATIONS,
  PBKDF2_MAX_SUPPORTED,
  deriveBits,
  parseStoredHash,
  needsRehash,
  verifyPassword
} from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';
const TEST_CODE_HMAC_SECRET = 'test-code-hmac-secret-32-bytes-long';

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
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
    async batch(statements) {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    }
  };
}

describe('PBKDF2 Decoupling & Transparent Migration Tests', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET
    };
  });

  test('PBKDF2 constants are capped at Cloudflare Workers edge limit of 100,000', () => {
    assert.strictEqual(PBKDF2_ITERATIONS, 100000, 'PBKDF2_ITERATIONS must be 100,000 (Cloudflare Workers maximum)');
    assert.strictEqual(PBKDF2_MAX_SUPPORTED, 100000, 'PBKDF2_MAX_SUPPORTED must match 100,000 edge limit');
  });

  test('deriveBits fails closed when iteration count exceeds PBKDF2_MAX_SUPPORTED', async () => {
    const salt = new Uint8Array(16);
    await assert.rejects(
      async () => {
        await deriveBits('TestPass123!', salt, 100001);
      },
      (err) => {
        assert.strictEqual(err.code, 'UNSUPPORTED_ITERATIONS');
        return true;
      },
      'Must reject iterations exceeding PBKDF2_MAX_SUPPORTED'
    );
  });

  test('needsRehash correctly flags older 3-part iteration counts for upgrade', () => {
    const old50kHash = '0123456789abcdef0123456789abcdef:50000:fedcba9876543210fedcba9876543210';
    const old310kHash = '0123456789abcdef0123456789abcdef:310000:fedcba9876543210fedcba9876543210';
    const current100kHash = '0123456789abcdef0123456789abcdef:100000:fedcba9876543210fedcba9876543210';

    assert.strictEqual(needsRehash(old50kHash), true, '50k iteration hash must require rehash');
    assert.strictEqual(needsRehash(old310kHash), true, '310k iteration hash must require rehash');
    assert.strictEqual(needsRehash(current100kHash), false, '100k iteration hash must NOT require rehash');
  });

  test('fresh login by existing user with 50,000-iteration hash transparently rehashes to 100,000', async () => {
    const password = 'ExistingUserPass123!';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const oldBits = await deriveBits(password, salt, 50000);
    const initialOldHash = `${toHex(salt)}:50000:${toHex(oldBits)}`;

    assert.strictEqual(needsRehash(initialOldHash), true, 'Initial 50k hash must require rehash');

    // Pre-seed user with old 50,000 iteration hash
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-migration-1', 'existing-50k@techtrekgt.com', initialOldHash, 'Existing 50k User', 'user', 0).run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'existing-50k@techtrekgt.com', password })
    });

    const res = await loginPost({ request: req, env, requestId: 'test-migration-req-1' });
    assert.strictEqual(res.status, 200, 'Login must succeed for valid password');

    // Verify stored hash in D1 changed
    const updatedUser = await mockDb.prepare('SELECT password_hash FROM users WHERE id = ?').bind('usr-migration-1').first();
    assert.notStrictEqual(updatedUser.password_hash, initialOldHash, 'Stored password hash must have been updated in database');

    const parsedUpdated = parseStoredHash(updatedUser.password_hash);
    assert.ok(parsedUpdated, 'Updated hash must be valid 3-part format');
    assert.strictEqual(parsedUpdated.iterations, 100000, 'Updated hash must use 100,000 iterations');
    assert.strictEqual(needsRehash(updatedUser.password_hash), false, 'Rehashed record must no longer need rehash');

    // Verify password check works against the new hash
    const recheck = await verifyPassword(password, updatedUser.password_hash);
    assert.strictEqual(recheck, true, 'verifyPassword must validate against the updated 100k hash');
  });

  test('login by existing user with legacy 2-part hash is intercepted and redirected to reset-password (HIGH-6)', async () => {
    const password = 'LegacyUserPass123!';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const oldBits = await deriveBits(password, salt, 100000);
    const legacyHash = `${toHex(salt)}:${toHex(oldBits)}`;

    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-migration-legacy', 'legacy@techtrekgt.com', legacyHash, 'Legacy User', 'user', 0).run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'legacy@techtrekgt.com', password })
    });

    const res = await loginPost({ request: req, env, requestId: 'test-migration-req-2' });
    assert.strictEqual(res.status, 403, 'Login must be rejected with 403 Forbidden for legacy 2-part hash');
    const data = await res.json();
    assert.strictEqual(data.forcePasswordReset, true);
    assert.strictEqual(data.requiresReset, true);
    assert.strictEqual(data.redirectTo, '/reset-password');
  });

  test('stored hash with iterations exceeding ceiling fails closed safely on login attempt', async () => {
    const password = 'AttackerPass123!';
    const saltHex = '0123456789abcdef0123456789abcdef';
    const fakeHashHex = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const excessiveHash = `${saltHex}:5000000:${fakeHashHex}`;

    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('usr-malicious-cost', 'malicious@techtrekgt.com', excessiveHash, 'Malicious User', 'user', 0).run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'malicious@techtrekgt.com', password })
    });

    const res = await loginPost({ request: req, env, requestId: 'test-malicious-cost' });
    assert.strictEqual(res.status, 401, 'Must reject with 401 on unsupported iterations');
    const body = await res.json();
    assert.strictEqual(body.error, 'Invalid email or password.');
  });
});
