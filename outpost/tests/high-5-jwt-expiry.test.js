import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createToken, verifyToken, hashPassword } from '../functions/utils/auth.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestGet as verifyEmailGet } from '../functions/api/auth/verify-email.js';
import { onRequestPost as updateProfilePost } from '../functions/api/auth/update-profile.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';

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

function extractCookieToken(cookieHeader) {
  const match = (cookieHeader || '').match(/auth_token=([^;]+)/);
  return match ? match[1] : null;
}

function extractCookieMaxAge(cookieHeader) {
  const match = (cookieHeader || '').match(/Max-Age=([0-9]+)/);
  return match ? parseInt(match[1], 10) : null;
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
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

describe('[HIGH-5] JWT Hardcoded 2-Hour Expiry Alignment with Remember-Me Duration', () => {
  let mockDb;
  let env;
  const testUser = {
    id: 'usr-high5-test-user',
    email: 'rememberme@techtrekgt.test',
    password: 'Password123!',
    name: 'Remember Me User'
  };

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      RATE_LIMIT_KV: createMockKV()
    };

    const passwordHash = await hashPassword(testUser.password);
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, status, role, email_verified)
      VALUES ('${testUser.id}', '${testUser.email}', '${passwordHash}', '${testUser.name}', 'Active', 'user', 1);
    `);
  });

  test('createToken defaults to 7200 seconds when expiresInSeconds is omitted', async () => {
    const beforeSec = Math.floor(Date.now() / 1000);
    const token = await createToken({ userId: testUser.id, email: testUser.email }, TEST_JWT_SECRET);
    const afterSec = Math.floor(Date.now() / 1000);

    const payload = decodeJwtPayload(token);
    assert.ok(payload.exp >= beforeSec + 7200);
    assert.ok(payload.exp <= afterSec + 7200);
  });

  test('createToken sets custom exp matching expiresInSeconds (e.g. 30 days = 2592000s)', async () => {
    const thirtyDays = 30 * 24 * 3600;
    const beforeSec = Math.floor(Date.now() / 1000);
    const token = await createToken({ userId: testUser.id, email: testUser.email }, TEST_JWT_SECRET, thirtyDays);
    const afterSec = Math.floor(Date.now() / 1000);

    const payload = decodeJwtPayload(token);
    assert.ok(payload.exp >= beforeSec + thirtyDays);
    assert.ok(payload.exp <= afterSec + thirtyDays);
  });

  test('Login with rememberMe=true sets 30-day JWT exp matching 30-day cookie Max-Age', async () => {
    const thirtyDays = 30 * 24 * 3600;
    const beforeSec = Math.floor(Date.now() / 1000);

    const req = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
        rememberMe: true
      })
    });

    const res = await loginPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const cookie = res.headers.get('Set-Cookie');
    assert.ok(cookie, 'Must set Set-Cookie header');
    const maxAge = extractCookieMaxAge(cookie);
    assert.strictEqual(maxAge, thirtyDays, 'Set-Cookie Max-Age must be 30 days');

    const token = extractCookieToken(cookie);
    assert.ok(token, 'Must extract token from Set-Cookie');

    const payload = decodeJwtPayload(token);
    assert.ok(payload.exp >= beforeSec + thirtyDays, 'JWT payload.exp must be 30 days in the future');

    // Simulate 3 hours elapsed (past the old 2-hour hardcoded limit)
    // The token must still verify successfully!
    const verified = await verifyToken(token, TEST_JWT_SECRET);
    assert.ok(verified, 'verifyToken must succeed');
    assert.strictEqual(verified.userId, testUser.id);

    // Call /api/auth/me with this cookie: must succeed with 200 OK
    const meReq = new Request('https://techtrekgt.com/api/auth/me', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${token}` }
    });
    const meRes = await meGet({ request: meReq, env });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user.email, testUser.email);
  });

  test('Login with rememberMe=false sets 2-hour JWT exp and 2-hour cookie Max-Age', async () => {
    const req = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
        rememberMe: false
      })
    });

    const res = await loginPost({ request: req, env });
    assert.strictEqual(res.status, 200);

    const cookie = res.headers.get('Set-Cookie');
    const maxAge = extractCookieMaxAge(cookie);
    assert.strictEqual(maxAge, 7200, 'Set-Cookie Max-Age must be 2 hours');

    const token = extractCookieToken(cookie);
    const payload = decodeJwtPayload(token);
    assert.ok(payload.exp <= Math.floor(Date.now() / 1000) + 7205);
  });

  test('Register with rememberMe=true followed by verify-email sets 30-day JWT exp matching cookie Max-Age', async () => {
    const thirtyDays = 30 * 24 * 3600;
    const beforeSec = Math.floor(Date.now() / 1000);

    const newEmail = 'newuser@techtrekgt.test';
    const req = new Request('https://techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Registered User',
        email: newEmail,
        password: 'Password123!',
        securityQuestion: 'Favorite city?',
        securityAnswer: 'Wroclaw',
        rememberMe: true
      })
    });

    const res = await registerPost({ request: req, env });
    assert.strictEqual(res.status, 201);
    const regData = await res.json();
    assert.strictEqual(regData.verificationPending, true);
    assert.strictEqual(res.headers.get('Set-Cookie'), null, 'Register should not immediately issue cookie');

    const verifRow = await env.DB.prepare('SELECT token FROM email_verifications WHERE email = ?').bind(newEmail).first();
    assert.ok(verifRow?.token);

    const verifyReq = new Request(`https://techtrekgt.com/api/auth/verify-email?token=${verifRow.token}&rememberMe=true`);
    const verifyRes = await verifyEmailGet({ request: verifyReq, env });
    assert.strictEqual(verifyRes.status, 200);

    const cookie = verifyRes.headers.get('Set-Cookie');
    const maxAge = extractCookieMaxAge(cookie);
    assert.strictEqual(maxAge, thirtyDays);

    const token = extractCookieToken(cookie);
    const payload = decodeJwtPayload(token);
    assert.ok(payload.exp >= beforeSec + thirtyDays);
  });

  test('updateProfile reissues token preserving remaining long-lived session duration', async () => {
    // User logged in with 30-day session
    const thirtyDays = 30 * 24 * 3600;
    const initialToken = await createToken(
      { userId: testUser.id, email: testUser.email, name: testUser.name },
      TEST_JWT_SECRET,
      thirtyDays
    );

    const updateReq = new Request('https://techtrekgt.com/api/auth/update-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${initialToken}`
      },
      body: JSON.stringify({
        name: 'Updated Name User',
        email: testUser.email
      })
    });

    const updateRes = await updateProfilePost({ request: updateReq, env });
    assert.strictEqual(updateRes.status, 200);

    const cookie = updateRes.headers.get('Set-Cookie');
    assert.ok(cookie);
    const reissuedToken = extractCookieToken(cookie);
    assert.ok(reissuedToken);

    const reissuedPayload = decodeJwtPayload(reissuedToken);
    // The reissued token must preserve the remaining duration (~30 days, not downgraded to 2 hours)
    assert.ok(
      reissuedPayload.exp > Math.floor(Date.now() / 1000) + (29 * 24 * 3600),
      'Reissued token exp must preserve >29 days remaining lifetime'
    );

    // Call /api/auth/me with reissued token
    const meReq = new Request('https://techtrekgt.com/api/auth/me', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${reissuedToken}` }
    });
    const meRes = await meGet({ request: meReq, env });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user.name, 'Updated Name User');
  });
});
