import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hashPassword,
  verifyPassword,
  createToken,
  getAllTokensFromRequest,
  maskEmail,
  sendResetEmail
} from '../functions/utils/auth.js';
import { requireAuth } from '../functions/utils/guard.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as logoutPost } from '../functions/api/auth/logout.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { onRequestPost as forgotPasswordPost } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordPost } from '../functions/api/auth/reset-password.js';
import { onRequestPost as updateProfilePost } from '../functions/api/auth/update-profile.js';
import { onRequestPost as verifyEmailPost, onRequestGet as verifyEmailGet } from '../functions/api/auth/verify-email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

let testIpCounter = 1;
function getFreshIp() {
  testIpCounter += 1;
  return `10.200.1.${testIpCounter}`;
}

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec("ALTER TABLE users ADD COLUMN amazon_api_token TEXT;");
  db.exec(auctionSchema);
  try {
    db.exec("ALTER TABLE email_verifications ADD COLUMN change_type TEXT DEFAULT 'register';");
  } catch (_) {}

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

describe('Batch 4 - Authentication and Account Safety Integration Tests', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      RATE_LIMIT_KV: createMockKV()
    };
  });

  // ============================================================================
  // TASK T-12: Password Reset Flow End-to-End
  // ============================================================================
  describe('T-12: Password Reset Flow', () => {
    test('End-to-End: user with force_password_reset=1 completes recovery and logs in', async () => {
      const userId = 'usr-forced-1';
      const email = 'forced@techtrekgt.test';
      const initialPassword = 'OldTemporaryPassword123!';
      const initialHash = await hashPassword(initialPassword);
      const securityQuestion = 'What city were you born in?';
      const securityAnswer = 'Atlanta';
      const answerHash = await hashPassword(securityAnswer.toLowerCase());

      // Create user with force_password_reset = 1
      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, force_password_reset, token_version, email_verified)
        VALUES ('${userId}', '${email}', '${initialHash}', 'Forced User', '${securityQuestion}', '${answerHash}', 1, 1, 1);
      `);

      const ip1 = getFreshIp();
      // 1. Attempt login -> returns 403 Forbidden with reset redirection details
      const loginReq1 = new Request('https://techtrekgt.com/outpost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip1 },
        body: JSON.stringify({ email, password: initialPassword })
      });
      const loginRes1 = await loginPost({ request: loginReq1, env });
      assert.strictEqual(loginRes1.status, 403);
      const loginData1 = await loginRes1.json();
      assert.strictEqual(loginData1.forcePasswordReset, true);
      assert.strictEqual(loginData1.requiresReset, true);
      assert.strictEqual(loginData1.redirectTo, '/reset-password');

      // 2. Step 1: Request password reset token (forgotPassword step 1)
      const forgotReq1 = new Request('https://techtrekgt.com/outpost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ email })
      });
      const forgotRes1 = await forgotPasswordPost({ request: forgotReq1, env });
      assert.strictEqual(forgotRes1.status, 200);

      // Verify token in database
      const resetRow = mockDb._raw.prepare('SELECT token FROM password_resets WHERE email = ? AND used = 0').get(email);
      assert.ok(resetRow && resetRow.token);
      const emailedToken = resetRow.token;

      // 3. Step 2: Verify security answer and active emailed token
      const forgotReq2 = new Request('https://techtrekgt.com/outpost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ email, token: emailedToken, securityAnswer: 'atlanta' })
      });
      const forgotRes2 = await forgotPasswordPost({ request: forgotReq2, env });
      assert.strictEqual(forgotRes2.status, 200);
      const setCookie = forgotRes2.headers.get('Set-Cookie') || '';
      assert.ok(setCookie.includes('reset_session='), 'Sets HttpOnly reset_session cookie');
      assert.ok(setCookie.includes('Path=/'), 'Cookie path is Path=/');

      const cookieVal = setCookie.match(/reset_session=([^;]+)/)[1];

      // 4. Step 3: Complete password reset using reset_session cookie
      const newPassword = 'BrandNewSecurePassword456!';
      const resetReq = new Request('https://techtrekgt.com/outpost/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': getFreshIp(),
          'Cookie': `reset_session=${cookieVal}`
        },
        body: JSON.stringify({ email, newPassword })
      });
      const resetRes = await resetPasswordPost({ request: resetReq, env });
      assert.strictEqual(resetRes.status, 200);
      const resetData = await resetRes.json();
      assert.strictEqual(resetData.success, true);

      // Verify user DB record has force_password_reset = 0
      const updatedUser = mockDb._raw.prepare('SELECT force_password_reset, token_version FROM users WHERE id = ?').get(userId);
      assert.strictEqual(updatedUser.force_password_reset, 0);
      assert.strictEqual(updatedUser.token_version, 2, 'token_version incremented on password change');

      // 5. Login with new password now succeeds
      const loginReq2 = new Request('https://techtrekgt.com/outpost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ email, password: newPassword })
      });
      const loginRes2 = await loginPost({ request: loginReq2, env });
      assert.strictEqual(loginRes2.status, 200);
      const loginData2 = await loginRes2.json();
      assert.strictEqual(loginData2.success, true);
    });

    test('Integration: wrong security answer is rejected and does not permit password change', async () => {
      const userId = 'usr-wrong-ans';
      const email = 'wrongans@techtrekgt.test';
      const answerHash = await hashPassword('correct');

      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, token_version, email_verified)
        VALUES ('${userId}', '${email}', 'pwdhash', 'Test User', 'Secret?', '${answerHash}', 1, 1);
      `);

      const now = Date.now();
      mockDb._raw.exec(`
        INSERT INTO password_resets (id, user_id, email, token, expires_at, used, created_at)
        VALUES ('rst-101', '${userId}', '${email}', 'valid-token-101', ${now + 900000}, 0, ${now});
      `);

      // Provide wrong security answer
      const req = new Request('https://techtrekgt.com/outpost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ email, token: 'valid-token-101', securityAnswer: 'incorrect' })
      });
      const res = await forgotPasswordPost({ request: req, env });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.headers.get('Set-Cookie'), null, 'Must NOT set reset_session cookie');
      const data = await res.json();
      assert.ok(data.error.includes('Invalid reset token or security answer'));
    });

    test('Integration: expired token is rejected and marked used', async () => {
      const userId = 'usr-expired';
      const email = 'expired@techtrekgt.test';
      const answerHash = await hashPassword('correct');

      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, token_version, email_verified)
        VALUES ('${userId}', '${email}', 'pwdhash', 'Expired User', 'Secret?', '${answerHash}', 1, 1);
      `);

      const now = Date.now();
      mockDb._raw.exec(`
        INSERT INTO password_resets (id, user_id, email, token, expires_at, used, created_at)
        VALUES ('rst-102', '${userId}', '${email}', 'expired-token-102', ${now - 1000}, 0, ${now - 10000});
      `);

      const req = new Request('https://techtrekgt.com/outpost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ email, token: 'expired-token-102', securityAnswer: 'correct' })
      });
      const res = await forgotPasswordPost({ request: req, env });
      assert.strictEqual(res.status, 400);

      // Verify token record is marked used
      const row = mockDb._raw.prepare('SELECT used FROM password_resets WHERE token = ?').get('expired-token-102');
      assert.strictEqual(row.used, 1);
    });

    test('Non-existent account returns generic success to prevent account enumeration', async () => {
      const req = new Request('https://techtrekgt.com/outpost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ email: 'nonexistent@example.com' })
      });
      const res = await forgotPasswordPost({ request: req, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    });

    test('sendResetEmail does not contain the security question', async () => {
      let logged = '';
      const originalError = console.error;
      console.error = (...args) => { logged += args.join(' '); };
      try {
        await sendResetEmail({}, 'user@example.com', 'test-token-xyz');
        assert.ok(logged.includes('test-token-xyz'));
        assert.strictEqual(logged.includes('Security question'), false);
      } finally {
        console.error = originalError;
      }
    });
  });

  // ============================================================================
  // TASK T-13: Email Change Confirmation & Verification Policy
  // ============================================================================
  describe('T-13: Email Change Confirmation and Verification Policy', () => {
    test('End-to-End: change email, confirm via token, and log in with new address', async () => {
      const userId = 'usr-email-change-1';
      const oldEmail = 'alice.old@techtrekgt.test';
      const newEmail = 'alice.new@techtrekgt.test';
      const password = 'PasswordAlice123!';
      const passwordHash = await hashPassword(password);

      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, token_version, email_verified)
        VALUES ('${userId}', '${oldEmail}', '${passwordHash}', 'Alice Smith', 1, 1);
      `);

      // Active JWT session for user
      const initialExpSec = Math.floor(Date.now() / 1000) + 7200;
      const sessionToken = await createToken({ userId, tv: 1, exp: initialExpSec }, TEST_JWT_SECRET, 7200);

      // 1. POST /api/auth/update-profile requesting new email
      const updateReq = new Request('https://techtrekgt.com/outpost/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': getFreshIp(),
          'Cookie': `auth_token=${sessionToken}`
        },
        body: JSON.stringify({ email: newEmail, name: 'Alice Smith' })
      });
      const updateRes = await updateProfilePost({ request: updateReq, env });
      assert.strictEqual(updateRes.status, 200);
      const updateData = await updateRes.json();
      assert.strictEqual(updateData.emailChangePending, true);
      assert.strictEqual(updateData.pendingEmail, newEmail);

      // Verify users table STILL HAS oldEmail (not modified immediately)
      const userBeforeConfirm = mockDb._raw.prepare('SELECT email FROM users WHERE id = ?').get(userId);
      assert.strictEqual(userBeforeConfirm.email, oldEmail, 'users.email must not be changed before confirmation');

      // Verify email_verifications has a pending row with change_type = 'email_change'
      const verifRow = mockDb._raw.prepare(
        "SELECT token, used, change_type FROM email_verifications WHERE user_id = ? AND email = ? AND used = 0"
      ).get(userId, newEmail);
      assert.ok(verifRow && verifRow.token);
      assert.strictEqual(verifRow.change_type, 'email_change');
      const changeToken = verifRow.token;

      // Verify GET /api/auth/me returns pendingEmail
      const meReq = new Request('https://techtrekgt.com/outpost/api/auth/me', {
        method: 'GET',
        headers: { 'Cookie': `auth_token=${sessionToken}`, 'CF-Connecting-IP': getFreshIp() }
      });
      const meRes = await meGet({ request: meReq, env });
      assert.strictEqual(meRes.status, 200);
      const meData = await meRes.json();
      assert.strictEqual(meData.user.pendingEmail, newEmail);
      assert.strictEqual(meData.user.email, oldEmail);

      // 2. Confirm email change via POST /api/auth/verify-email
      const verifyReq = new Request('https://techtrekgt.com/outpost/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ token: changeToken })
      });
      const verifyRes = await verifyEmailPost({ request: verifyReq, env });
      assert.strictEqual(verifyRes.status, 200);
      const verifyData = await verifyRes.json();
      assert.strictEqual(verifyData.success, true);
      assert.strictEqual(verifyData.user.email, newEmail);
      assert.strictEqual(verifyData.user.emailVerified, true);

      // Verify users table now has newEmail and email_verified = 1
      const userAfterConfirm = mockDb._raw.prepare('SELECT email, email_verified FROM users WHERE id = ?').get(userId);
      assert.strictEqual(userAfterConfirm.email, newEmail);
      assert.strictEqual(userAfterConfirm.email_verified, 1);

      // 3. Login with new email address succeeds
      const loginReq = new Request('https://techtrekgt.com/outpost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ email: newEmail, password })
      });
      const loginRes = await loginPost({ request: loginReq, env });
      assert.strictEqual(loginRes.status, 200);
    });

    test('Integration: requesting change to an email already in use returns 409', async () => {
      const user1 = 'usr-dup-1';
      const user2 = 'usr-dup-2';
      const existingEmail = 'taken@techtrekgt.test';

      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, token_version, email_verified)
        VALUES ('${user1}', 'user1@techtrekgt.test', 'pwd', 'User One', 1, 1),
               ('${user2}', '${existingEmail}', 'pwd', 'User Two', 1, 1);
      `);

      const token1 = await createToken({ userId: user1, tv: 1 }, TEST_JWT_SECRET, 3600);

      const req = new Request('https://techtrekgt.com/outpost/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': getFreshIp(),
          'Cookie': `auth_token=${token1}`
        },
        body: JSON.stringify({ email: existingEmail })
      });
      const res = await updateProfilePost({ request: req, env });
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.ok(data.error.includes('already in use'));
    });

    test('Integration: a change token for user A cannot alter user B', async () => {
      const userA = 'usr-user-a';
      const userB = 'usr-user-b';

      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, token_version, email_verified)
        VALUES ('${userA}', 'usera@techtrekgt.test', 'pwd', 'User A', 1, 1),
               ('${userB}', 'userb@techtrekgt.test', 'pwd', 'User B', 1, 1);
      `);

      // Token generated for user A to change to usera.new@test
      const now = Date.now();
      mockDb._raw.exec(`
        INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, created_at, change_type)
        VALUES ('vfy-a', '${userA}', 'usera.new@techtrekgt.test', 'token-user-a', ${now + 86400000}, 0, ${now}, 'email_change');
      `);

      // Verify token executes against user A
      const verifyReq = new Request('https://techtrekgt.com/outpost/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': getFreshIp() },
        body: JSON.stringify({ token: 'token-user-a' })
      });
      const verifyRes = await verifyEmailPost({ request: verifyReq, env });
      assert.strictEqual(verifyRes.status, 200);

      // Confirm user B's email remains unaltered
      const userBRecord = mockDb._raw.prepare('SELECT email FROM users WHERE id = ?').get(userB);
      assert.strictEqual(userBRecord.email, 'userb@techtrekgt.test');

      const userARecord = mockDb._raw.prepare('SELECT email FROM users WHERE id = ?').get(userA);
      assert.strictEqual(userARecord.email, 'usera.new@techtrekgt.test');
    });

    test('Profile update reissues JWT with only remaining lifetime (never extends)', async () => {
      const userId = 'usr-no-extend';
      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, token_version, email_verified)
        VALUES ('${userId}', 'noextend@techtrekgt.test', 'pwd', 'Original Name', 1, 1);
      `);

      // Create token with only 300 seconds (5 min) remaining
      const nowSec = Math.floor(Date.now() / 1000);
      const remainingSeconds = 300;
      const expSec = nowSec + remainingSeconds;
      const initialToken = await createToken({ userId, tv: 1, exp: expSec }, TEST_JWT_SECRET, remainingSeconds);

      const req = new Request('https://techtrekgt.com/outpost/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': getFreshIp(),
          'Cookie': `auth_token=${initialToken}`
        },
        body: JSON.stringify({ name: 'Updated Name' })
      });
      const res = await updateProfilePost({ request: req, env });
      assert.strictEqual(res.status, 200);

      // Verify Set-Cookie Max-Age or decoded token exp does not exceed remainingSeconds
      const cookie = res.headers.get('Set-Cookie') || '';
      const maxAgeMatch = cookie.match(/Max-Age=(\d+)/);
      assert.ok(maxAgeMatch);
      const maxAge = parseInt(maxAgeMatch[1], 10);
      assert.ok(maxAge <= 300, `Max-Age (${maxAge}) must not exceed remaining lifetime (300)`);
    });

    test('maskEmail helper correctly masks addresses to protect privacy', () => {
      assert.strictEqual(maskEmail('jonathan@example.com'), 'j***@e***.com');
      assert.strictEqual(maskEmail('test.user@techtrekgt.com'), 't***@t***.com');
      assert.strictEqual(maskEmail('a@b.org'), 'a***@b***.org');
    });

    test('GET verify-email does not set auth cookie (no session establishment on GET)', async () => {
      const userId = 'usr-get-verif';
      const email = 'getverif@techtrekgt.test';
      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, token_version, email_verified)
        VALUES ('${userId}', '${email}', 'pwd', 'Get Verif', 1, 0);
      `);

      const now = Date.now();
      mockDb._raw.exec(`
        INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, created_at, change_type)
        VALUES ('vfy-get', '${userId}', '${email}', 'get-token-123', ${now + 86400000}, 0, ${now}, 'register');
      `);

      const req = new Request('https://techtrekgt.com/outpost/api/auth/verify-email?token=get-token-123', {
        method: 'GET',
        headers: { 'Accept': 'text/html', 'CF-Connecting-IP': getFreshIp() }
      });
      const res = await verifyEmailGet({ request: req, env });
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('Set-Cookie'), null, 'GET redirect must NOT set session cookie');
      assert.strictEqual(res.headers.get('Location'), '/outpost?verified=true');
    });
  });

  // ============================================================================
  // TASK T-14: Session Policy, Single Credential, and Token Invalidation
  // ============================================================================
  describe('T-14: Session Policy, Single Credential, and Token Invalidation', () => {
    test('Integration: multi-credential request carrying both cookie and Bearer returns 400', async () => {
      const req = new Request('https://techtrekgt.com/outpost/api/auth/me', {
        method: 'GET',
        headers: {
          'Cookie': 'auth_token=jwt-in-cookie',
          'Authorization': 'Bearer jwt-in-bearer',
          'CF-Connecting-IP': getFreshIp()
        }
      });

      // getAllTokensFromRequest throws HTTP 400 Response on multi-credential request
      assert.throws(() => {
        getAllTokensFromRequest(req);
      }, (err) => {
        assert.ok(err instanceof Response);
        assert.strictEqual(err.status, 400);
        return true;
      });

      // meGet handler returns HTTP 400
      const res = await meGet({ request: req, env });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Multiple credentials provided'));
    });

    test('Single credential resolves successfully (cookie alone or Bearer alone)', () => {
      const cookieReq = new Request('https://techtrekgt.com/outpost/api/auth/me', {
        method: 'GET',
        headers: { 'Cookie': 'auth_token=cookie-val-only' }
      });
      const cookieTokens = getAllTokensFromRequest(cookieReq);
      assert.deepStrictEqual(cookieTokens, ['cookie-val-only']);

      const bearerReq = new Request('https://techtrekgt.com/outpost/api/auth/me', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer bearer-val-only' }
      });
      const bearerTokens = getAllTokensFromRequest(bearerReq);
      assert.deepStrictEqual(bearerTokens, ['bearer-val-only']);
    });

    test('Integration: token version increment invalidates prior tokens in requireAuth and meGet', async () => {
      const userId = 'usr-token-version-test';
      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, token_version, email_verified)
        VALUES ('${userId}', 'tvtest@techtrekgt.test', 'pwd', 'TV User', 1, 1);
      `);

      // Issue token with tv: 1
      const tokenV1 = await createToken({ userId, tv: 1 }, TEST_JWT_SECRET, 3600);

      // 1. Initial token validates
      const req1 = new Request('https://techtrekgt.com/outpost/api/auth/me', {
        headers: { 'Cookie': `auth_token=${tokenV1}`, 'CF-Connecting-IP': getFreshIp() }
      });
      const auth1 = await requireAuth(req1, env);
      assert.strictEqual(auth1.userId, userId);

      const meRes1 = await meGet({ request: req1, env });
      assert.strictEqual(meRes1.status, 200);

      // 2. Increment token_version in database (simulating logout-all or password change)
      mockDb._raw.exec(`UPDATE users SET token_version = 2 WHERE id = '${userId}'`);

      // 3. Prior token with tv: 1 is now rejected (requireAuth throws 401 Response, meGet returns 401)
      await assert.rejects(async () => {
        await requireAuth(req1, env);
      }, (err) => {
        assert.ok(err instanceof Response);
        assert.strictEqual(err.status, 401);
        return true;
      });

      const meRes2 = await meGet({ request: req1, env });
      assert.strictEqual(meRes2.status, 401, 'meGet must reject token with outdated token_version');

      // 4. Token issued with tv: 2 validates
      const tokenV2 = await createToken({ userId, tv: 2 }, TEST_JWT_SECRET, 3600);
      const req2 = new Request('https://techtrekgt.com/outpost/api/auth/me', {
        headers: { 'Cookie': `auth_token=${tokenV2}`, 'CF-Connecting-IP': getFreshIp() }
      });
      const auth3 = await requireAuth(req2, env);
      assert.strictEqual(auth3.userId, userId);

      const meRes3 = await meGet({ request: req2, env });
      assert.strictEqual(meRes3.status, 200);
    });

    test('POST /api/auth/logout with all: true increments token_version', async () => {
      const userId = 'usr-logout-all';
      mockDb._raw.exec(`
        INSERT INTO users (id, email, password_hash, name, token_version, email_verified)
        VALUES ('${userId}', 'logoutall@techtrekgt.test', 'pwd', 'Logout User', 1, 1);
      `);

      const token = await createToken({ userId, tv: 1 }, TEST_JWT_SECRET, 3600);
      const logoutReq = new Request('https://techtrekgt.com/outpost/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': getFreshIp(),
          'Cookie': `auth_token=${token}`
        },
        body: JSON.stringify({ all: true })
      });

      const logoutRes = await logoutPost({ request: logoutReq, env });
      assert.strictEqual(logoutRes.status, 200);

      const user = mockDb._raw.prepare('SELECT token_version FROM users WHERE id = ?').get(userId);
      assert.strictEqual(user.token_version, 2, 'token_version must be incremented on logout-all');
    });
  });
});
