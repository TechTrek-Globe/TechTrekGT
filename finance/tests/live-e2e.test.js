import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

const BASE_URL = 'http://127.0.0.1:8787';

describe('Live Wrangler Dev End-to-End Flow Verification', () => {
  let cookieJar = '';
  let csrfToken = '';
  let resetCode = '';

  const testUser = {
    name: 'José Ñuñez',
    email: `jose.nunez.${Date.now()}@testflow.com`,
    password: 'InitialPassword123!',
    securityQuestion: 'Favorite author?',
    securityAnswer: 'Gabriel García Márquez',
    newPassword: 'BrandNewSecurePassword456!'
  };

  test('Step 1: Register with non-Latin1 name "José Ñuñez"', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        name: testUser.name,
        email: testUser.email,
        password: testUser.password,
        securityQuestion: testUser.securityQuestion,
        securityAnswer: testUser.securityAnswer
      })
    });

    assert.strictEqual(res.status, 201, 'Registration should return 201 Created');
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.name, 'José Ñuñez');
    assert.strictEqual(data.user.email, testUser.email);
    assert.ok(data.csrfToken, 'Should receive CSRF token');

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    cookieJar = setCookies.map(c => c.split(';')[0]).join('; ');
    csrfToken = data.csrfToken;
    assert.ok(cookieJar.includes('auth_token='), 'auth_token cookie present');
    assert.ok(cookieJar.includes('csrf_token='), 'csrf_token cookie present');
  });

  test('Step 2: Log in with credentials and verify session & CSRF issuance', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });

    assert.strictEqual(res.status, 200, 'Login should return 200 OK');
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.name, 'José Ñuñez');
    assert.ok(data.csrfToken, 'CSRF token returned');

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    cookieJar = setCookies.map(c => c.split(';')[0]).join('; ');
    csrfToken = data.csrfToken;
  });

  test('Step 3: Make authenticated POST with X-CSRF-Token and cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/update-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173',
        'Cookie': cookieJar,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        name: 'José Ñuñez Updated'
      })
    });

    assert.strictEqual(res.status, 200, 'Update profile POST should return 200 OK');
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.name, 'José Ñuñez Updated');

    // Verify GET /api/auth/me also reflects the authenticated session
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Cookie': cookieJar
      }
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user.name, 'José Ñuñez Updated');
  });

  test('Step 4: Log out and verify session revocation', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:5173',
        'Cookie': cookieJar,
        'X-CSRF-Token': csrfToken
      }
    });

    assert.strictEqual(res.status, 200, 'Logout should return 200 OK');
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // Old token should now be rejected by /api/auth/me because token_version was incremented
    const meAfterLogout = await fetch(`${BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: { 'Cookie': cookieJar }
    });
    assert.strictEqual(meAfterLogout.status, 401, 'Old session token must be rejected with 401 after logout');
    const errBody = await meAfterLogout.json();
    assert.strictEqual(errBody.error, 'Session expired. Please sign in again.');
  });

  test('Step 5: Request password reset and confirm NO token in HTTP response', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        email: testUser.email
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.message, 'If an account exists for that address, a reset code has been sent to it.');

    // Strictly ensure no token or code in response body
    assert.strictEqual(data.resetToken, undefined, 'resetToken must NEVER be in HTTP response body');
    assert.strictEqual(data.token, undefined, 'token must NEVER be in HTTP response body');
    assert.strictEqual(data.code, undefined, 'code must NEVER be in HTTP response body');
  });

  test('Step 6: Retrieve 8-digit reset code from server log and complete reset with security answer', async () => {
    // Read the reset code from the wrangler dev task log
    const taskLogPath = 'C:\\Users\\jonke\\.gemini\\antigravity-ide\\brain\\dd5a5e02-ec47-4958-94f4-0ee85d7ff36f\\.system_generated\\tasks\\task-914.log';
    const regex = new RegExp(`dev reset code for ${testUser.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([0-9]{8})`);
    let match = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 100));
      const logContent = fs.readFileSync(taskLogPath, 'utf8');
      match = logContent.match(regex);
      if (match) break;
    }
    assert.ok(match, `Must find 8-digit reset code logged for ${testUser.email}`);
    resetCode = match[1];
    assert.strictEqual(resetCode.length, 8, 'Reset code must be exactly 8 digits');

    // Complete password reset
    const resetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        email: testUser.email,
        token: resetCode,
        newPassword: testUser.newPassword,
        securityAnswer: testUser.securityAnswer
      })
    });

    assert.strictEqual(resetRes.status, 200, 'Password reset should return 200 OK');
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.success, true);
    assert.strictEqual(resetData.message, 'Password reset successfully. Please sign in with your new password.');
  });

  test('Step 7: Verify login with new password succeeds and old password is rejected', async () => {
    // Old password should fail
    const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });
    assert.strictEqual(oldLoginRes.status, 401, 'Old password must fail with 401');

    // New password should succeed
    const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.newPassword
      })
    });
    assert.strictEqual(newLoginRes.status, 200, 'New password must succeed with 200');
    const data = await newLoginRes.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, testUser.email);
  });
});
