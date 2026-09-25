import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as registerPost } from '../functions/api/auth/register.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { onRequestPost as updateProfilePost } from '../functions/api/auth/update-profile.js';
import { onRequestPost as verifyEmailPost } from '../functions/api/auth/verify-email.js';
import { onRequestPost as resendVerificationPost } from '../functions/api/auth/resend-verification.js';
import { onRequestPost as confirmEmailChangePost } from '../functions/api/auth/confirm-email-change.js';
import { hashPassword, issueSession, hmacHex } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
const migration0006Sql = fs.readFileSync(path.join(__dirname, '../migrations/0006_email_verification.sql'), 'utf8');

const TEST_JWT_SECRET = 'super-secret-jwt-key-32-bytes-long-for-testing';

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

describe('Phase 2 Stage 5: Email Verification and Security', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };
  });

  // S5T1: Migration 0006 adds email_verified and pending_email, backfilling existing users with 1
  test('S5T1: migration 0006 adds email_verified, pending_email and backfills existing users', async () => {
    const legacyDb = new DatabaseSync(':memory:');
    legacyDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        role TEXT NOT NULL DEFAULT 'user',
        token_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users (id, email, password_hash, name) VALUES ('usr-legacy-1', 'existing@example.com', 'hash', 'Existing User');
    `);

    legacyDb.exec(migration0006Sql);

    const user = legacyDb.prepare('SELECT email_verified, pending_email FROM users WHERE id = ?').get('usr-legacy-1');
    assert.strictEqual(user.email_verified, 1);
    assert.strictEqual(user.pending_email, null);

    const verifTable = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_verifications'").get();
    assert.ok(verifTable);
  });

  // S5T2: Registration creates unverified user and pending email_verifications record
  test('S5T2: registration creates user with email_verified = 0 and issues email verification code', async () => {
    const req = new Request('https://techtrekgt.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Registered User',
        email: 'newuser@example.com',
        password: 'Password123!',
        securityQuestion: 'What city were you born in?',
        securityAnswer: 'Boston'
      })
    });

    const res = await registerPost({ request: req, env });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.user.emailVerified, false);

    // Verify DB state
    const userRow = await mockDb.prepare('SELECT email_verified, pending_email FROM users WHERE email = ?').bind('newuser@example.com').first();
    assert.strictEqual(userRow.email_verified, 0);
    assert.strictEqual(userRow.pending_email, null);

    const verifRow = await mockDb.prepare('SELECT id, email, token, used, attempts FROM email_verifications WHERE email = ?').bind('newuser@example.com').first();
    assert.ok(verifRow);
    assert.strictEqual(verifRow.used, 0);
    assert.strictEqual(verifRow.attempts, 0);
    assert.strictEqual(typeof verifRow.token, 'string');
    assert.strictEqual(verifRow.token.length, 64); // SHA-256 HMAC in hex
  });

  // S5T3: Verify email with valid code succeeds and updates email_verified to 1
  test('S5T3: verify email with valid 8-digit code marks email_verified = 1 and token used = 1', async () => {
    const pwHash = await hashPassword('Password123!');
    const userId = 'usr-to-verify';
    const email = 'verify-me@example.com';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, email, pwHash, 'Verify User', 'user', 0, 'Active', 0, new Date().toISOString()).run();

    const code = '12345678';
    const codeHash = await hmacHex(TEST_JWT_SECRET, `verify:${email}:${code}`);
    await mockDb.prepare(
      'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('vfy-1', userId, email, codeHash, Date.now() + 86400000, Date.now()).run();

    const userObj = { id: userId, email, name: 'Verify User', token_version: 0 };
    const { token, csrf } = await issueSession(env, userObj, false);

    const req = new Request('https://techtrekgt.com/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ code })
    });

    const res = await verifyEmailPost({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const updatedUser = await mockDb.prepare('SELECT email_verified FROM users WHERE id = ?').bind(userId).first();
    assert.strictEqual(updatedUser.email_verified, 1);

    const updatedVerif = await mockDb.prepare('SELECT used FROM email_verifications WHERE id = ?').bind('vfy-1').first();
    assert.strictEqual(updatedVerif.used, 1);
  });

  // S5T4: Verify email with invalid code increments attempts; 5 attempts locks token
  test('S5T4: verify email with invalid code tracks attempts and invalidates after 5 failures', async () => {
    const pwHash = await hashPassword('Password123!');
    const userId = 'usr-fail-verify';
    const email = 'fail-verify@example.com';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, email, pwHash, 'Fail User', 'user', 0, 'Active', 0, new Date().toISOString()).run();

    const correctCode = '88888888';
    const codeHash = await hmacHex(TEST_JWT_SECRET, `verify:${email}:${correctCode}`);
    await mockDb.prepare(
      'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('vfy-fail', userId, email, codeHash, Date.now() + 86400000, Date.now()).run();

    const userObj = { id: userId, email, name: 'Fail User', token_version: 0 };
    const { token, csrf } = await issueSession(env, userObj, false);

    // Make 4 bad attempts
    for (let i = 1; i <= 4; i++) {
      const badReq = new Request('https://techtrekgt.com/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
          'X-CSRF-Token': csrf
        },
        body: JSON.stringify({ code: '00000000' })
      });
      const badRes = await verifyEmailPost({ request: badReq, env });
      assert.strictEqual(badRes.status, 400);
      const row = await mockDb.prepare('SELECT attempts, used FROM email_verifications WHERE id = ?').bind('vfy-fail').first();
      assert.strictEqual(row.attempts, i);
      assert.strictEqual(row.used, 0);
    }

    // 5th bad attempt
    const fifthReq = new Request('https://techtrekgt.com/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ code: '00000000' })
    });
    const fifthRes = await verifyEmailPost({ request: fifthReq, env });
    assert.strictEqual(fifthRes.status, 400);

    const fifthRow = await mockDb.prepare('SELECT attempts, used FROM email_verifications WHERE id = ?').bind('vfy-fail').first();
    assert.strictEqual(fifthRow.attempts, 5);

    // Now even correct code is locked out
    const lockedReq = new Request('https://techtrekgt.com/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ code: correctCode })
    });
    const lockedRes = await verifyEmailPost({ request: lockedReq, env });
    assert.strictEqual(lockedRes.status, 400);
  });

  // S5T5: Resend verification creates new active token and invalidates prior unused tokens
  test('S5T5: resend verification invalidates previous tokens and generates a new one', async () => {
    const pwHash = await hashPassword('Password123!');
    const userId = 'usr-resend';
    const email = 'resend-test@example.com';
    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, email, pwHash, 'Resend User', 'user', 0, 'Active', 0, new Date().toISOString()).run();

    const oldHash = await hmacHex(TEST_JWT_SECRET, `verify:${email}:11111111`);
    await mockDb.prepare(
      'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('vfy-old', userId, email, oldHash, Date.now() + 86400000, Date.now() - 1000).run();

    const userObj = { id: userId, email, name: 'Resend User', token_version: 0 };
    const { token, csrf } = await issueSession(env, userObj, false);

    const resendReq = new Request('https://techtrekgt.com/api/auth/resend-verification', {
      method: 'POST',
      headers: {
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      }
    });

    const res = await resendVerificationPost({ request: resendReq, env });
    assert.strictEqual(res.status, 200);

    const oldRow = await mockDb.prepare('SELECT used FROM email_verifications WHERE id = ?').bind('vfy-old').first();
    assert.strictEqual(oldRow.used, 1);

    const activeRows = await mockDb.prepare('SELECT id, used FROM email_verifications WHERE user_id = ? AND used = 0').bind(userId).all();
    assert.strictEqual(activeRows.results.length, 1);
    assert.notStrictEqual(activeRows.results[0].id, 'vfy-old');
  });

  // S5T6: Profile update requesting email change sets pending_email without touching email
  test('S5T6: update-profile email change writes pending_email and creates verification record', async () => {
    const pwHash = await hashPassword('OldPassword123!');
    const userId = 'usr-email-change';
    const currentEmail = 'original@example.com';
    const newRequestedEmail = 'brand-new@example.com';

    await mockDb.prepare(
      'INSERT INTO users (id, email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, currentEmail, pwHash, 'Email Changer', 'user', 0, 'Active', 1, new Date().toISOString()).run();

    const userObj = { id: userId, email: currentEmail, name: 'Email Changer', token_version: 0 };
    const { token, csrf } = await issueSession(env, userObj, false);

    const req = new Request('https://techtrekgt.com/api/auth/update-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${token}; csrf_token=${csrf}`,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({
        email: newRequestedEmail,
        currentPassword: 'OldPassword123!'
      })
    });

    const res = await updateProfilePost({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // Response user keeps current email, but reports pendingEmail
    assert.strictEqual(data.user.email, currentEmail);
    assert.strictEqual(data.user.pendingEmail, newRequestedEmail);

    // Database check: email is still original, pending_email is set
    const userRow = await mockDb.prepare('SELECT email, pending_email, email_verified FROM users WHERE id = ?').bind(userId).first();
    assert.strictEqual(userRow.email, currentEmail);
    assert.strictEqual(userRow.pending_email, newRequestedEmail);

    // Verification record created for the new email
    const verifRow = await mockDb.prepare('SELECT id, email, used FROM email_verifications WHERE user_id = ? AND email = ?').bind(userId, newRequestedEmail).first();
    assert.ok(verifRow);
    assert.strictEqual(verifRow.used, 0);
  });

  // S5T7: Confirm email change moves pending_email to email, increments token_version, clears pending_email
  test('S5T7: confirm-email-change updates email, clears pending_email, increments token_version and re-issues session', async () => {
    const pwHash = await hashPassword('Pass123!');
    const userId = 'usr-confirm-change';
    const oldEmail = 'old-addr@example.com';
    const newEmail = 'confirmed-new@example.com';
    const initialTokenVersion = 2;

    await mockDb.prepare(
      'INSERT INTO users (id, email, pending_email, password_hash, name, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, oldEmail, newEmail, pwHash, 'Confirmer', 'user', initialTokenVersion, 'Active', 1, new Date().toISOString()).run();

    const changeCode = '77777777';
    const codeHash = await hmacHex(TEST_JWT_SECRET, `verify:${newEmail}:${changeCode}`);
    await mockDb.prepare(
      'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind('vfy-change-1', userId, newEmail, codeHash, Date.now() + 86400000, Date.now()).run();

    const userObj = { id: userId, email: oldEmail, name: 'Confirmer', token_version: initialTokenVersion };
    const { token: oldSessionToken, csrf: oldCsrf } = await issueSession(env, userObj, false);

    const req = new Request('https://techtrekgt.com/api/auth/confirm-email-change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_token=${oldSessionToken}; csrf_token=${oldCsrf}`,
        'X-CSRF-Token': oldCsrf
      },
      body: JSON.stringify({ code: changeCode })
    });

    const res = await confirmEmailChangePost({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, newEmail);
    assert.strictEqual(data.user.pendingEmail, null);
    assert.strictEqual(data.user.emailVerified, true);

    // DB inspection: email is newEmail, pending_email is null, token_version incremented
    const userRow = await mockDb.prepare('SELECT email, pending_email, email_verified, token_version FROM users WHERE id = ?').bind(userId).first();
    assert.strictEqual(userRow.email, newEmail);
    assert.strictEqual(userRow.pending_email, null);
    assert.strictEqual(userRow.email_verified, 1);
    assert.strictEqual(userRow.token_version, initialTokenVersion + 1);

    // Verification token marked used
    const verifRow = await mockDb.prepare('SELECT used FROM email_verifications WHERE id = ?').bind('vfy-change-1').first();
    assert.strictEqual(verifRow.used, 1);

    // Old token should now be rejected by authenticate because token_version was incremented
    const meReqOld = new Request('https://techtrekgt.com/api/auth/me', {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${oldSessionToken}` }
    });
    const meResOld = await meGet({ request: meReqOld, env });
    assert.strictEqual(meResOld.status, 401);
  });
});
