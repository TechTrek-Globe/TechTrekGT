import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hashPassword,
  verifyPassword,
  isThreePartHash
} from '../functions/utils/auth.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as resetPasswordPost } from '../functions/api/auth/reset-password.js';

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

function createMockKV() {
  const store = new Map();
  return {
    async get(key) {
      return store.get(key) || null;
    },
    async put(key, val) {
      store.set(key, String(val));
    }
  };
}

describe('[HIGH-6] Legacy PBKDF2 Iteration Fallback Removal & Forced Password Reset', () => {
  let mockDb;
  let env;

  const normalUser = {
    id: 'usr-normal-3part',
    email: 'normal@techtrekgt.test',
    password: 'Password123!',
    name: 'Normal User'
  };

  const flaggedUser = {
    id: 'usr-flagged-user',
    email: 'flagged@techtrekgt.test',
    password: 'Password123!',
    name: 'Flagged User'
  };

  const legacyUser = {
    id: 'usr-legacy-2part',
    email: 'legacy@techtrekgt.test',
    password: 'Password123!',
    name: 'Legacy 2-Part User'
  };

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      RATE_LIMIT_KV: createMockKV()
    };

    const normalHash = await hashPassword(normalUser.password);
    const flaggedHash = await hashPassword(flaggedUser.password);
    // Construct simulated legacy 2-part hash (salt:hash without iterations field)
    const saltHex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const legacy2PartHash = `${saltHex}:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210`;

    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, status, role, email_verified, force_password_reset)
      VALUES
        ('${normalUser.id}', '${normalUser.email}', '${normalHash}', '${normalUser.name}', 'Active', 'user', 1, 0),
        ('${flaggedUser.id}', '${flaggedUser.email}', '${flaggedHash}', '${flaggedUser.name}', 'Active', 'user', 1, 1),
        ('${legacyUser.id}', '${legacyUser.email}', '${legacy2PartHash}', '${legacyUser.name}', 'Active', 'user', 1, 0);
    `);
  });

  test('isThreePartHash correctly differentiates 3-part vs 2-part and malformed hashes', () => {
    const valid3Part = '0123456789abcdef0123456789abcdef:310000:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const valid100k = '0123456789abcdef0123456789abcdef:100000:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const legacy2Part = '0123456789abcdef0123456789abcdef:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const singlePart = 'plain_password_or_single_string';

    assert.strictEqual(isThreePartHash(valid3Part), true);
    assert.strictEqual(isThreePartHash(valid100k), true);
    assert.strictEqual(isThreePartHash(legacy2Part), false, '2-part hash must be false');
    assert.strictEqual(isThreePartHash(singlePart), false);
    assert.strictEqual(isThreePartHash(null), false);
    assert.strictEqual(isThreePartHash(''), false);
  });

  test('verifyPassword verifies 3-part hashes and strictly rejects 2-part hashes without fallback', async () => {
    const pwd = 'CorrectPassword123!';
    const threePartHash = await hashPassword(pwd);

    // 1. Valid password against 3-part hash succeeds
    assert.strictEqual(await verifyPassword(pwd, threePartHash), true);

    // 2. Wrong password against 3-part hash fails
    assert.strictEqual(await verifyPassword('WrongPassword!', threePartHash), false);

    // 3. 2-part hash is rejected immediately (no fallback guessing)
    const salt = '0123456789abcdef0123456789abcdef';
    const fakeLegacy = `${salt}:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;
    assert.strictEqual(await verifyPassword(pwd, fakeLegacy), false);
  });

  test('POST /api/auth/login allows normal user with valid 3-part hash', async () => {
    const req = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalUser.email, password: normalUser.password })
    });

    const res = await loginPost({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, normalUser.email);
  });

  test('POST /api/auth/login redirects user with non-3-part legacy hash to password reset', async () => {
    const req = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: legacyUser.email, password: legacyUser.password })
    });

    const res = await loginPost({ request: req, env });
    // Must return 403 Forbidden with reset redirection details rather than 401 "Invalid email or password"
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.forcePasswordReset, true);
    assert.strictEqual(data.requiresReset, true);
    assert.strictEqual(data.redirectTo, '/reset-password');
    assert.ok(data.error.includes('Password reset required'));
  });

  test('POST /api/auth/login redirects user with force_password_reset=1 to password reset', async () => {
    const req = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: flaggedUser.email, password: flaggedUser.password })
    });

    const res = await loginPost({ request: req, env });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.forcePasswordReset, true);
    assert.strictEqual(data.requiresReset, true);
    assert.strictEqual(data.redirectTo, '/reset-password');
  });

  test('Resetting password clears force_password_reset flag and allows login', async () => {
    // Stage reset record
    const now = Date.now();
    mockDb._raw.exec(`
      INSERT INTO password_resets (id, user_id, email, token, expires_at, used, created_at)
      VALUES ('rst-1', '${flaggedUser.id}', '${flaggedUser.email}', 'token-123', ${now + 3600000}, 0, ${now});
    `);

    // Reset password
    const newPassword = 'BrandNewPassword999!';
    const resetReq = new Request('https://techtrekgt.com/api/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: flaggedUser.email,
        token: 'token-123',
        newPassword
      })
    });

    const resetRes = await resetPasswordPost({ request: resetReq, env });
    assert.strictEqual(resetRes.status, 200);

    // Verify DB flag was cleared
    const updatedUser = mockDb._raw.prepare('SELECT force_password_reset, password_hash FROM users WHERE email = ?').get(flaggedUser.email);
    assert.strictEqual(updatedUser.force_password_reset, 0, 'force_password_reset must be cleared to 0');
    assert.strictEqual(isThreePartHash(updatedUser.password_hash), true, 'New hash must be 3-part format');

    // Login with new password must now succeed
    const loginReq = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: flaggedUser.email, password: newPassword })
    });

    const loginRes = await loginPost({ request: loginReq, env });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.success, true);
  });
});
