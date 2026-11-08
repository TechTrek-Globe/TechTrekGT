import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as verifyEmailPost } from '../functions/api/auth/verify-email.js';
import { onRequestPost as resendVerificationPost } from '../functions/api/auth/resend-verification.js';
import { clearMemoryUserCache, hashPassword } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-session-tokens-32bytes';
const TEST_CODE_HMAC_SECRET = 'test-code-hmac-secret-key-for-otps-32bytes';

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

describe('Email Verification on Subsequent Sign-In Protocol', () => {
  let mockDb;
  let testEnv;

  beforeEach(() => {
    mockDb = createMockD1();
    clearMemoryUserCache();
    testEnv = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET,
      CODE_HMAC_SECRET: TEST_CODE_HMAC_SECRET,
      ENVIRONMENT: 'test'
    };
  });

  it('user registers and gets first-time access without confirming email', async () => {
    const regReq = new Request('https://techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'First Time User',
        email: 'firsttime@example.com',
        password: 'Password123!',
        securityQuestion: 'First pet?',
        securityAnswer: 'Rover'
      })
    });

    const regRes = await registerPost({ request: regReq, env: testEnv });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    expect(regData.success).toBe(true);
    expect(regData.user.email).toBe('firsttime@example.com');
    expect(regData.user.emailVerified).toBe(false);

    // Verify cookies were issued
    const cookieHeader = regRes.headers.get('Set-Cookie');
    expect(cookieHeader).toBeTruthy();
    expect(cookieHeader.includes('auth_token=')).toBe(true);

    // Check sign_in_count in database
    const userRow = mockDb._raw.prepare('SELECT sign_in_count, email_verified FROM users WHERE email = ?').get('firsttime@example.com');
    expect(Number(userRow.sign_in_count)).toBe(1);
    expect(Number(userRow.email_verified)).toBe(0);
  });

  it('subsequent login by unverified registered user is rejected with EMAIL_VERIFICATION_REQUIRED', async () => {
    // 1. Register first
    const regReq = new Request('https://techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Second Login User',
        email: 'secondlogin@example.com',
        password: 'Password123!',
        securityQuestion: 'First car?',
        securityAnswer: 'Civic'
      })
    });
    const regRes = await registerPost({ request: regReq, env: testEnv });
    expect(regRes.status).toBe(201);

    // 2. Try to log in again with same credentials
    const loginReq = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'secondlogin@example.com',
        password: 'Password123!'
      })
    });
    const loginRes = await loginPost({ request: loginReq, env: testEnv });
    expect(loginRes.status).toBe(403);
    const loginData = await loginRes.json();
    expect(loginData.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    expect(loginData.requiresVerification).toBe(true);
    expect(loginData.email).toBe('secondlogin@example.com');
  });

  it('user created with sign_in_count = 0 can sign in the first time, then blocked on second time', async () => {
    const pwHash = await hashPassword('Password123!');
    const secHash = await hashPassword('rover');
    mockDb._raw.prepare(
      `INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, role, token_version, status, email_verified, sign_in_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Active', 0, 0)`
    ).run('usr-test-seed', 'seeduser@example.com', pwHash, 'Seed User', 'Pet?', secHash, 'user');

    // First login attempt (sign_in_count = 0)
    const loginReq1 = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'seeduser@example.com',
        password: 'Password123!'
      })
    });
    const loginRes1 = await loginPost({ request: loginReq1, env: testEnv });
    expect(loginRes1.status).toBe(200);
    const loginData1 = await loginRes1.json();
    expect(loginData1.success).toBe(true);

    // Check sign_in_count was incremented to 1
    const userRow = mockDb._raw.prepare('SELECT sign_in_count FROM users WHERE email = ?').get('seeduser@example.com');
    expect(Number(userRow.sign_in_count)).toBe(1);

    // Second login attempt (sign_in_count = 1) -> must be blocked
    const loginReq2 = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'seeduser@example.com',
        password: 'Password123!'
      })
    });
    const loginRes2 = await loginPost({ request: loginReq2, env: testEnv });
    expect(loginRes2.status).toBe(403);
    const loginData2 = await loginRes2.json();
    expect(loginData2.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    expect(loginData2.requiresVerification).toBe(true);
  });

  it('unauthenticated verify-email with valid 8-digit code verifies user and returns session', async () => {
    // 1. Register user
    const regReq = new Request('https://techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Verify Test',
        email: 'verifytest@example.com',
        password: 'Password123!',
        securityQuestion: 'Pet?',
        securityAnswer: 'Spot'
      })
    });
    await registerPost({ request: regReq, env: testEnv });

    // Look up the verification record and verify we can issue a fresh code via resend-verification
    const resendReq = new Request('https://techtrekgt.com/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'verifytest@example.com' })
    });
    const resendRes = await resendVerificationPost({ request: resendReq, env: testEnv });
    expect(resendRes.status).toBe(200);

    // Check email_verifications table for active record
    const vfyRow = mockDb._raw.prepare(
      'SELECT id, token FROM email_verifications WHERE email = ? AND used = 0'
    ).get('verifytest@example.com');
    expect(vfyRow).toBeTruthy();

    // Create an OTP with known code 87654321
    const { hmacHex } = await import('../functions/utils/auth.js');
    const testCode = '87654321';
    const testHash = await hmacHex(TEST_CODE_HMAC_SECRET, `verify:verifytest@example.com:${testCode}`);
    mockDb._raw.prepare('UPDATE email_verifications SET token = ? WHERE id = ?').run(testHash, vfyRow.id);

    // Call verify-email unauthenticated
    const verifyReq = new Request('https://techtrekgt.com/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'verifytest@example.com',
        code: testCode,
        rememberMe: true
      })
    });
    const verifyRes = await verifyEmailPost({ request: verifyReq, env: testEnv });
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.user.emailVerified).toBe(true);
    expect(verifyData.csrfToken).toBeTruthy();

    // Verify Set-Cookie header issued
    const cookieHeader = verifyRes.headers.get('Set-Cookie');
    expect(cookieHeader).toBeTruthy();
    expect(cookieHeader.includes('auth_token=')).toBe(true);

    // Check DB state
    const userRow = mockDb._raw.prepare('SELECT email_verified, email_verified_at FROM users WHERE email = ?').get('verifytest@example.com');
    expect(Number(userRow.email_verified)).toBe(1);
    expect(userRow.email_verified_at).toBeTruthy();

    // Now login again -> should succeed with 200 without email verification prompt
    const loginReq = new Request('https://techtrekgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'verifytest@example.com',
        password: 'Password123!'
      })
    });
    const loginRes = await loginPost({ request: loginReq, env: testEnv });
    expect(loginRes.status).toBe(200);
  });
});
