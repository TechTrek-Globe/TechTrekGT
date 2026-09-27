import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestGet as verifyEmailGet, onRequestPost as verifyEmailPost } from '../functions/api/auth/verify-email.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { onRequestPost as revokeIntegrationPost } from '../functions/api/integrations/[id].js';
import { createToken, hashPassword } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const ADMIN_EMAIL = 'admin@techtrekgt.test';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec("ALTER TABLE users ADD COLUMN amazon_api_token TEXT;");
  db.exec(auctionSchema);

  return {
    _raw: db,
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
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

function createWorkingKV() {
  const store = new Map();
  return {
    async get(key) {
      return store.get(key) || null;
    },
    async put(key, val) {
      store.set(key, val);
    },
    async delete(key) {
      store.delete(key);
    }
  };
}

function extractCookieToken(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/auth_token=([^;]+)/);
  return match ? match[1] : null;
}

function extractCookieMaxAge(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/Max-Age=([^;]+)/i);
  return match ? parseInt(match[1], 10) : null;
}

describe('MED-3: Registration Email Verification & Token Lifecycle', () => {
  let env;

  beforeEach(() => {
    env = {
      DB: createMockD1(),
      RATE_LIMIT_KV: createWorkingKV(),
      JWT_SECRET: TEST_JWT_SECRET,
      ADMIN_EMAIL: ADMIN_EMAIL,
      APP_URL: 'https://outpost.techtrekgt.com'
    };
  });

  test('Registration creates unverified user and single-use token without issuing session cookie', async () => {
    const email = 'newuser@techtrekgt.test';
    const req = new Request('https://outpost.techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.1'
      },
      body: JSON.stringify({
        name: 'Unverified Alice',
        email,
        password: 'SecurePassword123!',
        securityQuestion: 'Favorite city?',
        securityAnswer: 'Krakow'
      })
    });

    const res = await registerPost({ request: req, env });
    assert.strictEqual(res.status, 201);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.verificationPending, true);
    assert.ok(body.message.includes('verification email'));

    // Check Set-Cookie is NOT issued at registration
    assert.strictEqual(res.headers.get('Set-Cookie'), null, 'Session cookie must not be issued before email verification');

    // Confirm database record has email_verified = 0 and email_verified_at = null
    const user = await env.DB.prepare('SELECT id, email, email_verified, email_verified_at FROM users WHERE email = ?').bind(email).first();
    assert.ok(user);
    assert.strictEqual(user.email_verified, 0);
    assert.strictEqual(user.email_verified_at, null);

    // Confirm email_verifications table record
    const verif = await env.DB.prepare('SELECT * FROM email_verifications WHERE user_id = ?').bind(user.id).first();
    assert.ok(verif);
    assert.strictEqual(verif.email, email);
    assert.strictEqual(verif.used, 0);
    assert.ok(verif.token && verif.token.length >= 32);
    assert.ok(new Date(verif.expires_at).getTime() > Date.now());
  });

  test('GET /api/auth/verify-email with valid token sets email_verified_at and issues session cookie', async () => {
    const email = 'verify-get@techtrekgt.test';
    const req = new Request('https://outpost.techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Verify Get User',
        email,
        password: 'Password123!',
        securityQuestion: 'City?',
        securityAnswer: 'Warsaw'
      })
    });

    await registerPost({ request: req, env });

    const verif = await env.DB.prepare('SELECT token FROM email_verifications WHERE email = ?').bind(email).first();
    assert.ok(verif?.token);

    // Call GET /api/auth/verify-email
    const verifyReq = new Request(`https://outpost.techtrekgt.com/api/auth/verify-email?token=${verif.token}`);
    const verifyRes = await verifyEmailGet({ request: verifyReq, env });
    assert.strictEqual(verifyRes.status, 200);

    const verifyBody = await verifyRes.json();
    assert.strictEqual(verifyBody.success, true);
    assert.strictEqual(verifyBody.verified, true);
    assert.strictEqual(verifyBody.user.email, email);

    // Cookie must be issued
    const cookieHeader = verifyRes.headers.get('Set-Cookie');
    assert.ok(cookieHeader);
    const token = extractCookieToken(cookieHeader);
    assert.ok(token);
    assert.strictEqual(extractCookieMaxAge(cookieHeader), 7200, 'Default session should be 2 hours');

    // Confirm DB is updated atomically
    const updatedUser = await env.DB.prepare('SELECT email_verified, email_verified_at FROM users WHERE email = ?').bind(email).first();
    assert.strictEqual(updatedUser.email_verified, 1);
    assert.ok(updatedUser.email_verified_at);

    // Token record must be marked used
    const updatedVerif = await env.DB.prepare('SELECT used FROM email_verifications WHERE token = ?').bind(verif.token).first();
    assert.strictEqual(updatedVerif.used, 1);
  });

  test('POST /api/auth/verify-email with rememberMe=true issues 30-day session cookie', async () => {
    const email = 'verify-post@techtrekgt.test';
    const req = new Request('https://outpost.techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Verify Post User',
        email,
        password: 'Password123!',
        securityQuestion: 'City?',
        securityAnswer: 'Poznan'
      })
    });

    await registerPost({ request: req, env });
    const verif = await env.DB.prepare('SELECT token FROM email_verifications WHERE email = ?').bind(email).first();

    const verifyReq = new Request('https://outpost.techtrekgt.com/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: verif.token,
        rememberMe: true
      })
    });

    const verifyRes = await verifyEmailPost({ request: verifyReq, env });
    assert.strictEqual(verifyRes.status, 200);

    const cookieHeader = verifyRes.headers.get('Set-Cookie');
    const maxAge = extractCookieMaxAge(cookieHeader);
    assert.strictEqual(maxAge, 30 * 24 * 3600, 'Remember me should issue 30-day session');
  });

  test('Single-use token enforcement: reusing verification token fails with 400', async () => {
    const email = 'single-use@techtrekgt.test';
    await registerPost({
      request: new Request('https://outpost.techtrekgt.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Single Use User',
          email,
          password: 'Password123!',
          securityQuestion: 'City?',
          securityAnswer: 'Gdansk'
        })
      }),
      env
    });

    const verif = await env.DB.prepare('SELECT token FROM email_verifications WHERE email = ?').bind(email).first();

    // First use: success
    const res1 = await verifyEmailGet({
      request: new Request(`https://outpost.techtrekgt.com/api/auth/verify-email?token=${verif.token}`),
      env
    });
    assert.strictEqual(res1.status, 200);

    // Second use: must fail
    const res2 = await verifyEmailGet({
      request: new Request(`https://outpost.techtrekgt.com/api/auth/verify-email?token=${verif.token}`),
      env
    });
    assert.strictEqual(res2.status, 400);
    const body2 = await res2.json();
    assert.ok(body2.error.includes('used') || body2.error.includes('expired') || body2.error.includes('invalid'));
  });

  test('Expired verification token is rejected', async () => {
    const email = 'expired@techtrekgt.test';
    await registerPost({
      request: new Request('https://outpost.techtrekgt.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Expired Token User',
          email,
          password: 'Password123!',
          securityQuestion: 'City?',
          securityAnswer: 'Torun'
        })
      }),
      env
    });

    const verif = await env.DB.prepare('SELECT token FROM email_verifications WHERE email = ?').bind(email).first();

    // Manually expire token in database
    await env.DB.prepare("UPDATE email_verifications SET expires_at = ? WHERE token = ?").bind(Date.now() - 3600000, verif.token).run();

    const res = await verifyEmailGet({
      request: new Request(`https://outpost.techtrekgt.com/api/auth/verify-email?token=${verif.token}`),
      env
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('expired'));
  });

  test('Missing or non-existent verification token returns 400', async () => {
    const missingRes = await verifyEmailGet({
      request: new Request('https://outpost.techtrekgt.com/api/auth/verify-email'),
      env
    });
    assert.strictEqual(missingRes.status, 400);

    const nonExistentRes = await verifyEmailGet({
      request: new Request('https://outpost.techtrekgt.com/api/auth/verify-email?token=non-existent-token-1234567890'),
      env
    });
    assert.strictEqual(nonExistentRes.status, 400);
  });

  test('me.js reflects emailVerified and emailVerifiedAt status', async () => {
    const email = 'me-check@techtrekgt.test';
    await registerPost({
      request: new Request('https://outpost.techtrekgt.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Me User',
          email,
          password: 'Password123!',
          securityQuestion: 'City?',
          securityAnswer: 'Lublin'
        })
      }),
      env
    });

    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    const tempJwt = await createToken({ userId: user.id, email }, TEST_JWT_SECRET, 3600);

    // Check me before verification
    const meResBefore = await meGet({
      request: new Request('https://outpost.techtrekgt.com/api/auth/me', {
        headers: { Cookie: `auth_token=${tempJwt}` }
      }),
      env
    });
    assert.strictEqual(meResBefore.status, 200);
    const meBodyBefore = await meResBefore.json();
    assert.strictEqual(meBodyBefore.user.emailVerified, false);
    assert.strictEqual(meBodyBefore.user.emailVerifiedAt, null);

    // Verify email
    const verif = await env.DB.prepare('SELECT token FROM email_verifications WHERE email = ?').bind(email).first();
    await verifyEmailGet({
      request: new Request(`https://outpost.techtrekgt.com/api/auth/verify-email?token=${verif.token}`),
      env
    });

    // Check me after verification
    const meResAfter = await meGet({
      request: new Request('https://outpost.techtrekgt.com/api/auth/me', {
        headers: { Cookie: `auth_token=${tempJwt}` }
      }),
      env
    });
    assert.strictEqual(meResAfter.status, 200);
    const meBodyAfter = await meResAfter.json();
    assert.strictEqual(meBodyAfter.user.emailVerified, true);
    assert.ok(meBodyAfter.user.emailVerifiedAt);
  });

  test('Sensitive action gating: unverified user matching ADMIN_EMAIL cannot perform admin action', async () => {
    // Register account with ADMIN_EMAIL
    await registerPost({
      request: new Request('https://outpost.techtrekgt.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unverified Admin Impersonator',
          email: ADMIN_EMAIL,
          password: 'Password123!',
          securityQuestion: 'City?',
          securityAnswer: 'Szczecin'
        })
      }),
      env
    });

    const adminUser = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(ADMIN_EMAIL).first();

    // Create another user with an integration secret
    const otherUser = { id: 'other-user-999', email: 'other@techtrekgt.test', name: 'Other User' };
    const hashedPwd = await hashPassword('Pass123!');
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, name, email_verified) VALUES (?, ?, ?, ?, 1)"
    ).bind(otherUser.id, otherUser.email, hashedPwd, otherUser.name).run();

    await env.DB.prepare(
      "INSERT INTO api_integrations (id, user_id, label, secret_hash) VALUES ('target-int-1', ?, 'Other Integration', 'hash123')"
    ).bind(otherUser.id).run();

    // Create JWT for unverified user matching ADMIN_EMAIL
    const unverifiedAdminJwt = await createToken({ userId: adminUser.id, email: ADMIN_EMAIL }, TEST_JWT_SECRET, 3600);

    // Attempt to revoke other user's integration as unverified ADMIN_EMAIL
    const revokeResUnverified = await revokeIntegrationPost({
      request: new Request('https://outpost.techtrekgt.com/api/integrations/target-int-1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${unverifiedAdminJwt}`
        },
        body: JSON.stringify({ id: 'target-int-1' })
      }),
      env,
      params: { id: 'target-int-1' }
    });

    // Since user is unverified, ADMIN_EMAIL match fails and scoping falls back to user_id = adminUser.id, resulting in 404
    assert.strictEqual(revokeResUnverified.status, 404, 'Unverified user matching ADMIN_EMAIL must NOT be granted admin privileges');

    // Now verify the admin user's email
    const verif = await env.DB.prepare('SELECT token FROM email_verifications WHERE email = ?').bind(ADMIN_EMAIL).first();
    await verifyEmailGet({
      request: new Request(`https://outpost.techtrekgt.com/api/auth/verify-email?token=${verif.token}`),
      env
    });

    // Attempt again after email verification
    const revokeResVerified = await revokeIntegrationPost({
      request: new Request('https://outpost.techtrekgt.com/api/integrations/target-int-1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${unverifiedAdminJwt}`
        },
        body: JSON.stringify({ id: 'target-int-1' })
      }),
      env,
      params: { id: 'target-int-1' }
    });

    // Now admin access is granted and integration is revoked
    assert.strictEqual(revokeResVerified.status, 200, 'Verified user matching ADMIN_EMAIL is granted admin privileges');
    const revokeBody = await revokeResVerified.json();
    assert.strictEqual(revokeBody.revoked, true);
  });
});
