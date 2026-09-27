import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as forgotPasswordPost } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordPost } from '../functions/api/auth/reset-password.js';
import { onRequestPost as securityQuestionPost } from '../functions/api/auth/security-question.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { hashPassword } from '../functions/utils/auth.js';

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

function createWorkingKV() {
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

describe('[MED-2] IP and Per-Account Rate Limiting & Lockout Defense', () => {
  let mockDb;
  let kv;
  let env;

  const victimUser = {
    id: 'usr-victim-target',
    email: 'victim@techtrekgt.test',
    password: 'VictimPassword123!',
    name: 'Victim Account',
    securityQuestion: 'Favorite color?',
    securityAnswer: 'Blue'
  };

  const innocentUser = {
    id: 'usr-innocent-target',
    email: 'innocent@techtrekgt.test',
    password: 'InnocentPassword123!',
    name: 'Innocent Account',
    securityQuestion: 'Favorite pet?',
    securityAnswer: 'Cat'
  };

  beforeEach(async () => {
    mockDb = createMockD1();
    kv = createWorkingKV();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      RATE_LIMIT_KV: kv
    };

    const victimPassHash = await hashPassword(victimUser.password);
    const victimAnsHash = await hashPassword(victimUser.securityAnswer.toLowerCase().trim());
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, status, role, email_verified, security_question, security_answer_hash)
      VALUES ('${victimUser.id}', '${victimUser.email}', '${victimPassHash}', '${victimUser.name}', 'Active', 'user', 1, '${victimUser.securityQuestion}', '${victimAnsHash}');
    `);

    const innocentPassHash = await hashPassword(innocentUser.password);
    const innocentAnsHash = await hashPassword(innocentUser.securityAnswer.toLowerCase().trim());
    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, status, role, email_verified, security_question, security_answer_hash)
      VALUES ('${innocentUser.id}', '${innocentUser.email}', '${innocentPassHash}', '${innocentUser.name}', 'Active', 'user', 1, '${innocentUser.securityQuestion}', '${innocentAnsHash}');
    `);
  });

  describe('Login Per-Account Lockout', () => {
    test('Distributed attack: 10 failed login attempts across 10 distinct IPs triggers 429 on 11th attempt', async () => {
      // Send 10 failed attempts from 10 distinct source IPs
      for (let i = 1; i <= 10; i++) {
        const ip = `198.51.100.${i}`;
        const req = new Request('https://techtrekgt.com/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ email: victimUser.email, password: 'WrongPassword999!' })
        });
        const res = await loginPost({ request: req, env });
        assert.strictEqual(res.status, 401, `Attempt ${i} from IP ${ip} should return 401 for wrong credentials`);
      }

      // 11th attempt from a brand-new IP (which has 0 attempts for that IP)
      const freshIp = '198.51.100.99';
      const blockedReq = new Request('https://techtrekgt.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp },
        body: JSON.stringify({ email: victimUser.email, password: victimUser.password })
      });
      const blockedRes = await loginPost({ request: blockedReq, env });

      assert.strictEqual(blockedRes.status, 429, '11th attempt targeting locked account must return 429');
      const retryAfter = parseInt(blockedRes.headers.get('Retry-After'), 10);
      assert.ok(retryAfter > 0, 'Retry-After header must be positive');
      const body = await blockedRes.json();
      assert.strictEqual(body.error, 'Too many login attempts. Please wait.');

      // Another user from that same fresh IP must still be allowed to log in
      const innocentReq = new Request('https://techtrekgt.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp },
        body: JSON.stringify({ email: innocentUser.email, password: innocentUser.password })
      });
      const innocentRes = await loginPost({ request: innocentReq, env });
      assert.strictEqual(innocentRes.status, 200, 'Different account on same IP should not be blocked');
    });

    test('Stricter retryAfter is used when account limit provides a longer duration', async () => {
      // Saturate account limit
      for (let i = 1; i <= 10; i++) {
        const req = new Request('https://techtrekgt.com/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `192.0.2.${i}` },
          body: JSON.stringify({ email: victimUser.email, password: 'WrongPassword!' })
        });
        await loginPost({ request: req, env });
      }

      const blockedReq = new Request('https://techtrekgt.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
        body: JSON.stringify({ email: victimUser.email, password: victimUser.password })
      });
      const res = await loginPost({ request: blockedReq, env });
      assert.strictEqual(res.status, 429);
      const retryAfter = parseInt(res.headers.get('Retry-After'), 10);
      // Account window is 900s, so retryAfter should be greater than 60s
      assert.ok(retryAfter > 60, `Stricter Retry-After (${retryAfter}) should exceed IP window (60s)`);
    });
  });

  describe('Forgot-Password Per-Account Rate Limiting', () => {
    test('Distributed forgot-password requests across distinct IPs trigger 429 on 6th attempt', async () => {
      for (let i = 1; i <= 5; i++) {
        const ip = `203.0.113.${i}`;
        const req = new Request('https://techtrekgt.com/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ email: victimUser.email })
        });
        const res = await forgotPasswordPost({ request: req, env });
        assert.strictEqual(res.status, 200, `Attempt ${i} from IP ${ip} should succeed`);
      }

      // 6th attempt from a fresh IP
      const freshIp = '203.0.113.88';
      const blockedReq = new Request('https://techtrekgt.com/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp },
        body: JSON.stringify({ email: victimUser.email })
      });
      const blockedRes = await forgotPasswordPost({ request: blockedReq, env });

      assert.strictEqual(blockedRes.status, 429, '6th forgot-password attempt targeting victim account must return 429');
      const body = await blockedRes.json();
      assert.strictEqual(body.error, 'Too many reset attempts. Please wait.');

      // Another user from that same fresh IP is not blocked
      const innocentReq = new Request('https://techtrekgt.com/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp },
        body: JSON.stringify({ email: innocentUser.email })
      });
      const innocentRes = await forgotPasswordPost({ request: innocentReq, env });
      assert.strictEqual(innocentRes.status, 200);
    });
  });

  describe('Reset-Password Per-Account Rate Limiting', () => {
    test('Distributed reset-password requests across distinct IPs trigger 429 on 6th attempt', async () => {
      for (let i = 1; i <= 5; i++) {
        const ip = `198.51.100.${i + 30}`;
        const req = new Request('https://techtrekgt.com/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ email: victimUser.email, newPassword: 'NewPassword123!' })
        });
        const res = await resetPasswordPost({ request: req, env });
        // Fails with 400 (token required), but rate limit counter increments
        assert.strictEqual(res.status, 400);
      }

      // 6th attempt from a fresh IP
      const freshIp = '198.51.100.99';
      const blockedReq = new Request('https://techtrekgt.com/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp },
        body: JSON.stringify({ email: victimUser.email, newPassword: 'NewPassword123!' })
      });
      const blockedRes = await resetPasswordPost({ request: blockedReq, env });

      assert.strictEqual(blockedRes.status, 429, '6th reset-password attempt targeting victim account must return 429');
      const body = await blockedRes.json();
      assert.strictEqual(body.error, 'Too many password reset attempts. Please wait.');

      // Another user from that same fresh IP is not blocked
      const innocentReq = new Request('https://techtrekgt.com/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp },
        body: JSON.stringify({ email: innocentUser.email, newPassword: 'NewPassword123!' })
      });
      const innocentRes = await resetPasswordPost({ request: innocentReq, env });
      assert.strictEqual(innocentRes.status, 400); // 400 missing token, not 429 rate limit
    });
  });

  describe('Security-Question Per-Account Rate Limiting', () => {
    test('Distributed security-question requests across distinct IPs trigger 429 on 11th attempt', async () => {
      for (let i = 1; i <= 10; i++) {
        const ip = `203.0.113.${i + 50}`;
        const req = new Request('https://techtrekgt.com/api/auth/security-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ email: victimUser.email })
        });
        const res = await securityQuestionPost({ request: req, env });
        assert.strictEqual(res.status, 200);
      }

      const freshIp = '203.0.113.199';
      const blockedReq = new Request('https://techtrekgt.com/api/auth/security-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp },
        body: JSON.stringify({ email: victimUser.email })
      });
      const blockedRes = await securityQuestionPost({ request: blockedReq, env });

      assert.strictEqual(blockedRes.status, 429);
      const body = await blockedRes.json();
      assert.strictEqual(body.error, 'Too many requests. Please wait.');
    });
  });

  describe('Register Per-Account Rate Limiting', () => {
    test('Distributed registration attempts for same email across distinct IPs trigger 429 on 6th attempt', async () => {
      const targetEmail = 'spammed-reg@techtrekgt.test';
      for (let i = 1; i <= 5; i++) {
        const ip = `192.0.2.${i + 70}`;
        const req = new Request('https://techtrekgt.com/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({
            name: `User ${i}`,
            email: targetEmail,
            password: 'ValidPassword123!',
            securityQuestion: 'Question?',
            securityAnswer: 'Answer'
          })
        });
        const res = await registerPost({ request: req, env });
        // First succeeds (201), next 4 fail with 409 (already exists), but all increment target email counter
        assert.ok(res.status === 201 || res.status === 409, `Expected 201 or 409, got ${res.status}`);
      }

      const freshIp = '192.0.2.222';
      const blockedReq = new Request('https://techtrekgt.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp },
        body: JSON.stringify({
          name: 'Blocked Reg',
          email: targetEmail,
          password: 'ValidPassword123!',
          securityQuestion: 'Question?',
          securityAnswer: 'Answer'
        })
      });
      const blockedRes = await registerPost({ request: blockedReq, env });

      assert.strictEqual(blockedRes.status, 429);
      const body = await blockedRes.json();
      assert.strictEqual(body.error, 'Too many registration attempts. Please wait.');
    });
  });
});
