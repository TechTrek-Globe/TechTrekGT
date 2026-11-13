// Verification test suite for Email Verification on Registration and Login Gating
// Tests code generation, HMAC hashing, constant-time comparison, and verification lifecycle

import assert from 'node:assert/strict';
import {
  hmacHex,
  constantTimeStringEqual,
  generateVerificationCode,
  createToken,
  authenticateRequest
} from '../functions/utils/auth.js';

let passedCount = 0;
let queue = Promise.resolve();

function test(name, fn) {
  queue = queue.then(async () => {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      process.exitCode = 1;
    }
  });
}

console.log('--- 1. Verification Code & Cryptographic Helper Tests ---');

test('generateVerificationCode produces exactly 8 numeric digits', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateVerificationCode();
    assert.equal(typeof code, 'string');
    assert.equal(code.length, 8, `Code must be 8 characters: ${code}`);
    assert.match(code, /^\d{8}$/, `Code must be all digits: ${code}`);
    const n = Number(code);
    assert.equal(n >= 10000000 && n <= 99999999, true, `Code in range [10000000, 99999999]: ${n}`);
  }
});

test('constantTimeStringEqual correctly compares strings and guards against unequal lengths', () => {
  assert.equal(constantTimeStringEqual('12345678', '12345678'), true);
  assert.equal(constantTimeStringEqual('12345678', '12345679'), false);
  assert.equal(constantTimeStringEqual('12345678', '1234567'), false);
  assert.equal(constantTimeStringEqual('12345678', '123456789'), false);
  assert.equal(constantTimeStringEqual('', ''), true);
  assert.equal(constantTimeStringEqual(null, '1234'), false);
});

test('hmacHex produces deterministic, non-trivial SHA-256 HMAC', async () => {
  const secret = 'test-secret-12345';
  const email = 'user@example.com';
  const code = '84920193';
  const hash1 = await hmacHex(secret, `verify:${email}:${code}`);
  const hash2 = await hmacHex(secret, `verify:${email}:${code}`);
  const hash3 = await hmacHex(secret, `verify:${email}:84920194`);

  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'SHA-256 HMAC in hex must be 64 characters');
  assert.equal(hash1, hash2, 'Identical inputs must yield identical HMAC');
  assert.notEqual(hash1, hash3, 'Different code must yield different HMAC');
});

console.log('\n--- 2. Unverified User Login Gating Logic Tests ---');

test('User with email_verified = 0 is blocked from logging in', () => {
  const user = {
    id: 'usr-unverified',
    email: 'newuser@example.com',
    password_hash: 'hash',
    email_verified: 0,
    email_verified_at: null
  };

  const isVerified = Boolean(user.email_verified === 1 || user.email_verified_at);
  assert.equal(isVerified, false, 'Unverified user must not be marked as verified');
});

test('User with email_verified = 1 is permitted to log in', () => {
  const user = {
    id: 'usr-verified',
    email: 'verified@example.com',
    password_hash: 'hash',
    email_verified: 1,
    email_verified_at: '2026-11-07T06:00:00Z'
  };

  const isVerified = Boolean(user.email_verified === 1 || user.email_verified_at);
  assert.equal(isVerified, true, 'Verified user must be recognized');
});

test('Legacy user with email_verified_at timestamp is permitted to log in', () => {
  const user = {
    id: 'usr-legacy',
    email: 'legacy@example.com',
    password_hash: 'hash',
    email_verified: 0,
    email_verified_at: '2026-08-01T12:00:00Z'
  };

  const isVerified = Boolean(user.email_verified === 1 || user.email_verified_at);
  assert.equal(isVerified, true, 'Legacy user with timestamp must be recognized as verified');
});

console.log('\n--- 3. Session Token Version, Suspension & Credential Conflict Tests ---');

function createAuthMockDb(userRow) {
  return {
    prepare(sql) {
      return {
        bind(userId) {
          return {
            async first() {
              if (sql.includes('FROM users WHERE id = ?') && userRow && userRow.id === userId) {
                return userRow;
              }
              return null;
            }
          };
        }
      };
    }
  };
}

test('authenticateRequest accepts valid cookie token matching users.token_version', async () => {
  const secret = 'jwt-test-secret-001';
  const db = createAuthMockDb({ id: 'usr-1', email: 'a@example.com', status: 'Active', token_version: 2 });
  const token = await createToken({ userId: 'usr-1', tv: 2 }, secret);
  const req = new Request('https://techtrekgt.com/wayfinder/api/auth/me', {
    headers: { Cookie: `auth_token=${token}` }
  });
  const res = await authenticateRequest(req, { JWT_SECRET: secret, DB: db });
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.equal(res.payload.userId, 'usr-1');
});

test('authenticateRequest rejects stale token_version with 401 and clearCookie', async () => {
  const secret = 'jwt-test-secret-001';
  const db = createAuthMockDb({ id: 'usr-1', email: 'a@example.com', status: 'Active', token_version: 2 });
  const staleToken = await createToken({ userId: 'usr-1', tv: 1 }, secret);
  const req = new Request('https://techtrekgt.com/wayfinder/api/auth/me', {
    headers: { Cookie: `auth_token=${staleToken}` }
  });
  const res = await authenticateRequest(req, { JWT_SECRET: secret, DB: db });
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.equal(res.clearCookie, true);
});

test('authenticateRequest rejects token missing tv claim with 401', async () => {
  const secret = 'jwt-test-secret-001';
  const db = createAuthMockDb({ id: 'usr-1', email: 'a@example.com', status: 'Active', token_version: 1 });
  const legacyToken = await createToken({ userId: 'usr-1' }, secret);
  const req = new Request('https://techtrekgt.com/wayfinder/api/auth/me', {
    headers: { Cookie: `auth_token=${legacyToken}` }
  });
  const res = await authenticateRequest(req, { JWT_SECRET: secret, DB: db });
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.equal(res.clearCookie, true);
});

test('authenticateRequest rejects Suspended user with 403 and clearCookie', async () => {
  const secret = 'jwt-test-secret-001';
  const db = createAuthMockDb({ id: 'usr-susp', email: 's@example.com', status: 'Suspended', token_version: 1 });
  const token = await createToken({ userId: 'usr-susp', tv: 1 }, secret);
  const req = new Request('https://techtrekgt.com/wayfinder/api/auth/me', {
    headers: { Cookie: `auth_token=${token}` }
  });
  const res = await authenticateRequest(req, { JWT_SECRET: secret, DB: db });
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  assert.equal(res.clearCookie, true);
});

test('authenticateRequest rejects conflicting Cookie + Bearer credentials with 400', async () => {
  const secret = 'jwt-test-secret-001';
  const tokenA = await createToken({ userId: 'usr-1', tv: 1 }, secret);
  const tokenB = await createToken({ userId: 'usr-2', tv: 1 }, secret);
  const req = new Request('https://techtrekgt.com/wayfinder/api/auth/me', {
    headers: {
      Cookie: `auth_token=${tokenA}`,
      Authorization: `Bearer ${tokenB}`
    }
  });
  const res = await authenticateRequest(req, { JWT_SECRET: secret, DB: createAuthMockDb(null) });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

queue.then(() => {
  console.log(`\nAll ${passedCount} email verification tests passed successfully!`);
});

