import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  toPublicUser, hashPassword, createToken, issueSession,
  ACCESS_TOKEN_TTL, SESSION_TTL_DEFAULT, hmacHex
} from '../functions/utils/auth.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { onRequestPost as updateProfilePost } from '../functions/api/auth/update-profile.js';
import { onRequestPost as confirmEmailChangePost } from '../functions/api/auth/confirm-email-change.js';
import { onRequestGet as securityQuestionGet } from '../functions/api/auth/security-question.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';
const TEST_CODE_HMAC_SECRET = 'test-code-hmac-secret-32-bytes-long';

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

describe('Phase 2: Public User Serialization & Credential Leak Prevention', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET,
      TURNSTILE_SECRET_KEY: undefined, // skip Turnstile in unit tests
      ENVIRONMENT: 'test'
    };
  });

  describe('toPublicUser Helper Unit Tests', () => {
    test('returns only client-safe fields and omits sensitive credentials', () => {
      const internalUser = {
        id: 'usr-123',
        email: 'alice@example.com',
        name: 'Alice Smith',
        role: 'user',
        password_hash: 'pbkdf2:sha256:600000:salt:hash',
        security_question: 'Favorite food?',
        security_answer_hash: 'pbkdf2:sha256:600000:salt:answer',
        token_version: 5,
        status: 'Active',
        email_verified: 1,
        pending_email: null
      };

      const publicUser = toPublicUser(internalUser);

      assert.deepStrictEqual(publicUser, {
        id: 'usr-123',
        email: 'alice@example.com',
        name: 'Alice Smith',
        isAdmin: false,
        emailVerified: true,
        pendingEmail: null,
        securityQuestion: 'Favorite food?',
        hasSecurityQuestion: true
      });

      // Explicit assertions that sensitive fields are never present
      assert.strictEqual(publicUser.password_hash, undefined);
      assert.strictEqual(publicUser.security_answer_hash, undefined);
      assert.strictEqual(publicUser.token_version, undefined);
      assert.strictEqual(publicUser.status, undefined);
      assert.strictEqual(publicUser.role, undefined);
    });

    test('derives isAdmin correctly for admin role and overrides', () => {
      const adminUser = {
        id: 'usr-admin',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        email_verified: 1
      };
      assert.strictEqual(toPublicUser(adminUser).isAdmin, true);

      const standardUser = {
        id: 'usr-std',
        email: 'std@example.com',
        name: 'Standard',
        role: 'user',
        email_verified: 0
      };
      assert.strictEqual(toPublicUser(standardUser).isAdmin, false);

      // Explicit isAdmin override takes precedence
      assert.strictEqual(toPublicUser(standardUser, { isAdmin: true }).isAdmin, true);
      assert.strictEqual(toPublicUser(adminUser, { isAdmin: false }).isAdmin, false);
    });

    test('ignores sensitive keys if maliciously passed inside overrides', () => {
      const user = {
        id: 'usr-999',
        email: 'user@example.com',
        name: 'User',
        role: 'user'
      };

      const maliciousOverrides = {
        password_hash: 'leaked_pass_hash',
        security_answer_hash: 'leaked_answer_hash',
        token_version: 42,
        name: 'Updated Name'
      };

      const serialized = toPublicUser(user, maliciousOverrides);
      assert.strictEqual(serialized.name, 'Updated Name');
      assert.strictEqual(serialized.password_hash, undefined);
      assert.strictEqual(serialized.security_answer_hash, undefined);
      assert.strictEqual(serialized.token_version, undefined);
    });

    test('handles nullish inputs safely', () => {
      assert.strictEqual(toPublicUser(null), null);
      assert.strictEqual(toPublicUser(undefined), null);
      assert.strictEqual(toPublicUser('string'), null);
    });
  });

  describe('Auth Endpoint Response Body Regression Tests', () => {
    test('POST /api/auth/register returns serialized public user without credential hashes', async () => {
      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bob Register',
          email: 'bob.reg@example.com',
          password: 'Password123!',
          securityQuestion: 'First car?',
          securityAnswer: 'Civic'
        })
      });

      const res = await registerPost({ request: req, env });
      assert.strictEqual(res.status, 201);
      const rawText = await res.text();
      assert.strictEqual(rawText.includes('password_hash'), false, 'Response must never contain password_hash');
      assert.strictEqual(rawText.includes('security_answer_hash'), false, 'Response must never contain security_answer_hash');
      assert.strictEqual(rawText.includes('token_version'), false, 'Response must never contain token_version');

      const body = JSON.parse(rawText);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.user.email, 'bob.reg@example.com');
      assert.strictEqual(body.user.name, 'Bob Register');
      assert.strictEqual(body.user.isAdmin, false);
      assert.strictEqual(body.user.emailVerified, false);
      assert.strictEqual(body.user.hasSecurityQuestion, true);
      assert.strictEqual(body.user.securityQuestion, 'First car?');
    });

    test('POST /api/auth/login returns serialized public user without credential hashes', async () => {
      const pwHash = await hashPassword('ValidPass123!');
      const ansHash = await hashPassword('fluffy');
      await mockDb.prepare(
        'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, security_question, security_answer_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind('usr-login-test', 'alice.login@example.com', pwHash, 'Alice Login', 'user', 1, 'Active', 1, 'Pet?', ansHash, new Date().toISOString()).run();

      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'alice.login@example.com',
          password: 'ValidPass123!'
        })
      });

      const res = await loginPost({ request: req, env });
      assert.strictEqual(res.status, 200);
      const rawText = await res.text();
      assert.strictEqual(rawText.includes('password_hash'), false, 'Response must never contain password_hash');
      assert.strictEqual(rawText.includes('security_answer_hash'), false, 'Response must never contain security_answer_hash');
      assert.strictEqual(rawText.includes('token_version'), false, 'Response must never contain token_version');

      const body = JSON.parse(rawText);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.user.id, 'usr-login-test');
      assert.strictEqual(body.user.email, 'alice.login@example.com');
      assert.strictEqual(body.user.hasSecurityQuestion, true);
      assert.strictEqual(body.user.securityQuestion, 'Pet?');
    });

    test('GET /api/auth/me returns serialized public user without credential hashes', async () => {
      const pwHash = await hashPassword('ValidPass123!');
      const ansHash = await hashPassword('rover');
      await mockDb.prepare(
        'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, security_question, security_answer_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind('usr-me-test', 'me.user@example.com', pwHash, 'Me User', 'admin', 0, 'Active', 1, 'Dog?', ansHash, new Date().toISOString()).run();

      const now = Math.floor(Date.now() / 1000);
      const { token } = await createToken(
        { userId: 'usr-me-test', email: 'me.user@example.com', name: 'Me User', role: 'admin', tv: 0, sid: 'sid-1' },
        TEST_JWT_SECRET,
        ACCESS_TOKEN_TTL,
        now + ACCESS_TOKEN_TTL
      );

      const req = new Request('http://localhost/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const res = await meGet({ request: req, env });
      assert.strictEqual(res.status, 200);
      const rawText = await res.text();
      assert.strictEqual(rawText.includes('password_hash'), false, 'Response must never contain password_hash');
      assert.strictEqual(rawText.includes('security_answer_hash'), false, 'Response must never contain security_answer_hash');
      assert.strictEqual(rawText.includes('token_version'), false, 'Response must never contain token_version');

      const body = JSON.parse(rawText);
      assert.strictEqual(body.user.id, 'usr-me-test');
      assert.strictEqual(body.user.isAdmin, true);
      assert.strictEqual(body.user.emailVerified, true);
      assert.strictEqual(body.user.hasSecurityQuestion, true);
    });

    test('POST /api/auth/update-profile returns serialized public user without credential hashes', async () => {
      const pwHash = await hashPassword('CurrentPass123!');
      const ansHash = await hashPassword('paris');
      await mockDb.prepare(
        'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, security_question, security_answer_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind('usr-prof-test', 'prof.user@example.com', pwHash, 'Old Name', 'user', 0, 'Active', 1, 'City?', ansHash, new Date().toISOString()).run();

      const now = Math.floor(Date.now() / 1000);
      const csrfToken = 'test-csrf-token-12345';
      const { token } = await createToken(
        { userId: 'usr-prof-test', email: 'prof.user@example.com', name: 'Old Name', role: 'user', tv: 0, sid: 'sid-prof' },
        TEST_JWT_SECRET,
        ACCESS_TOKEN_TTL,
        now + ACCESS_TOKEN_TTL
      );

      const req = new Request('http://localhost/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cookie': `csrf_token=${csrfToken}`,
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          name: 'Brand New Name'
        })
      });

      const res = await updateProfilePost({ request: req, env });
      assert.strictEqual(res.status, 200);
      const rawText = await res.text();
      assert.strictEqual(rawText.includes('password_hash'), false, 'Response must never contain password_hash');
      assert.strictEqual(rawText.includes('security_answer_hash'), false, 'Response must never contain security_answer_hash');
      assert.strictEqual(rawText.includes('token_version'), false, 'Response must never contain token_version');

      const body = JSON.parse(rawText);
      assert.strictEqual(body.user.name, 'Brand New Name');
      assert.strictEqual(body.user.id, 'usr-prof-test');
      assert.strictEqual(body.user.hasSecurityQuestion, true);
    });

    test('POST /api/auth/confirm-email-change returns serialized public user without credential hashes', async () => {
      const pwHash = await hashPassword('ValidPass123!');
      const ansHash = await hashPassword('test');
      await mockDb.prepare(
        'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, security_question, security_answer_hash, pending_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind('usr-chg-test', 'old.email@example.com', pwHash, 'User Change', 'user', 0, 'Active', 1, 'Q?', ansHash, 'new.email@example.com', new Date().toISOString()).run();

      const code = '12345678';
      const codeHash = await hmacHex(TEST_CODE_HMAC_SECRET, `verify:new.email@example.com:${code}`);
      const now = Date.now();
      await mockDb.prepare(
        'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
      ).bind('vfy-chg-1', 'usr-chg-test', 'new.email@example.com', codeHash, now + 3600000, now).run();

      const nowSec = Math.floor(Date.now() / 1000);
      const csrfToken = 'test-csrf-token-chg';
      const { token } = await createToken(
        { userId: 'usr-chg-test', email: 'old.email@example.com', name: 'User Change', role: 'user', tv: 0, sid: 'sid-chg' },
        TEST_JWT_SECRET,
        ACCESS_TOKEN_TTL,
        nowSec + ACCESS_TOKEN_TTL
      );

      const req = new Request('http://localhost/api/auth/confirm-email-change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cookie': `csrf_token=${csrfToken}`,
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          code: '12345678'
        })
      });

      const res = await confirmEmailChangePost({ request: req, env });
      assert.strictEqual(res.status, 200);
      const rawText = await res.text();
      assert.strictEqual(rawText.includes('password_hash'), false, 'Response must never contain password_hash');
      assert.strictEqual(rawText.includes('security_answer_hash'), false, 'Response must never contain security_answer_hash');
      assert.strictEqual(rawText.includes('token_version'), false, 'Response must never contain token_version');

      const body = JSON.parse(rawText);
      assert.strictEqual(body.user.email, 'new.email@example.com');
      assert.strictEqual(body.user.emailVerified, true);
      assert.strictEqual(body.user.pendingEmail, null);
    });

    test('GET /api/auth/security-question returns question without security_answer_hash', async () => {
      const pwHash = await hashPassword('ValidPass123!');
      const ansHash = await hashPassword('secretanswer');
      await mockDb.prepare(
        'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, security_question, security_answer_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind('usr-sq-test', 'sq.user@example.com', pwHash, 'SQ User', 'user', 0, 'Active', 1, 'Mothers Maiden Name?', ansHash, new Date().toISOString()).run();

      const nowSec = Math.floor(Date.now() / 1000);
      const { token } = await createToken(
        { userId: 'usr-sq-test', email: 'sq.user@example.com', name: 'SQ User', role: 'user', tv: 0, sid: 'sid-sq' },
        TEST_JWT_SECRET,
        ACCESS_TOKEN_TTL,
        nowSec + ACCESS_TOKEN_TTL
      );

      const req = new Request('http://localhost/api/auth/security-question', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const res = await securityQuestionGet({ request: req, env });
      assert.strictEqual(res.status, 200);
      const rawText = await res.text();
      assert.strictEqual(rawText.includes('security_answer_hash'), false);
      assert.strictEqual(rawText.includes('password_hash'), false);

      const body = JSON.parse(rawText);
      assert.strictEqual(body.securityQuestion, 'Mothers Maiden Name?');
      assert.strictEqual(body.hasSecurityQuestion, true);
    });
  });

  describe('Static Code Analysis & Lint CI Checks', () => {
    test('no auth endpoint or worker response contains password_hash or security_answer_hash', () => {
      const functionsDir = path.join(__dirname, '../functions');
      const srcDir = path.join(__dirname, '../src');

      function scanDir(dir) {
        const results = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.wrangler') {
              results.push(...scanDir(fullPath));
            }
          } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const files = [...scanDir(functionsDir), ...scanDir(srcDir)];
      const violations = [];

      for (const file of files) {
        const relPath = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
        const content = fs.readFileSync(file, 'utf8');

        // Check json(...) blocks
        const jsonMatches = content.matchAll(/json\s*\(([\s\S]*?)\)(?:;|\s*,|\s*\))/g);
        for (const match of jsonMatches) {
          const block = match[1];
          if (block.includes('password_hash')) {
            violations.push(`${relPath}: json(...) includes password_hash`);
          }
          if (block.includes('security_answer_hash')) {
            violations.push(`${relPath}: json(...) includes security_answer_hash`);
          }
        }

        // Check new Response(...) blocks
        const responseMatches = content.matchAll(/new\s+Response\s*\(([\s\S]*?)\)/g);
        for (const match of responseMatches) {
          const block = match[1];
          if (block.includes('password_hash')) {
            violations.push(`${relPath}: new Response(...) includes password_hash`);
          }
          if (block.includes('security_answer_hash')) {
            violations.push(`${relPath}: new Response(...) includes security_answer_hash`);
          }
        }

        // Check for hand-crafted user objects in route handlers
        if (relPath.startsWith('functions/api/')) {
          const userMatches = content.matchAll(/user\s*:\s*\{([^}]+)\}/g);
          for (const match of userMatches) {
            const inner = match[1];
            if (inner.includes('email') || inner.includes('name')) {
              violations.push(`${relPath}: Hand-crafted user object literal in response. Must use toPublicUser(user).`);
            }
          }
        }
      }

      assert.strictEqual(violations.length, 0, `Violations found: ${violations.join(', ')}`);
    });
  });
});
