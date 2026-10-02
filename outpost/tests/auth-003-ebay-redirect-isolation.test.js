import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { createToken } from '../functions/utils/auth.js';

const TEST_SECRET = 'test-jwt-secret-key-12345678901234567890';

describe('AUTH-003: eBay OAuth Redirect & Password Reset Isolation', () => {

  test('Non-password reset reason parameters (e.g. ebay errors) do not switch auth mode to forgot', () => {
    // Simulates the AuthPage useState initializers
    function computeInitialMode(pathname, search, initialMode = 'signin') {
      const path = (pathname || '').toLowerCase();
      if (path.includes('reset-password')) return 'forgot';
      const params = new URLSearchParams(search || '');
      const isPasswordResetReason = params.get('reason') === 'legacy_hash';
      if (params.get('mode') === 'forgot' || isPasswordResetReason) return 'forgot';
      if (params.get('mode') === 'register') return 'register';
      return initialMode;
    }

    function computeResetReason(pathname, search) {
      const path = (pathname || '').toLowerCase();
      const params = new URLSearchParams(search || '');
      if (path.includes('reset-password') || params.get('mode') === 'forgot' || params.get('reason') === 'legacy_hash') {
        return params.get('reason') || '';
      }
      return '';
    }

    // Case 1: eBay error callback landing on settings
    const ebayErrorSearch = '?tab=integrations&ebay=error&reason=token_exchange';
    assert.strictEqual(
      computeInitialMode('/outpost/settings', ebayErrorSearch),
      'signin',
      'eBay error callback must NOT switch mode to forgot password'
    );
    assert.strictEqual(
      computeResetReason('/outpost/settings', ebayErrorSearch),
      '',
      'eBay error callback must NOT populate resetReason'
    );

    // Case 2: eBay missing_params landing on settings
    const ebayMissingSearch = '?tab=integrations&ebay=error&reason=missing_params';
    assert.strictEqual(
      computeInitialMode('/outpost/settings', ebayMissingSearch),
      'signin',
      'eBay missing_params must NOT switch mode to forgot password'
    );
    assert.strictEqual(
      computeResetReason('/outpost/settings', ebayMissingSearch),
      '',
      'eBay missing_params must NOT populate resetReason'
    );

    // Case 3: Legacy hash required reset
    const legacySearch = '?email=user%40example.com&reason=legacy_hash';
    assert.strictEqual(
      computeInitialMode('/outpost/reset-password', legacySearch),
      'forgot',
      'legacy_hash reason must switch mode to forgot'
    );
    assert.strictEqual(
      computeResetReason('/outpost/reset-password', legacySearch),
      'legacy_hash',
      'legacy_hash reason must populate resetReason'
    );

    // Case 4: Explicit mode=forgot
    assert.strictEqual(
      computeInitialMode('/outpost', '?mode=forgot'),
      'forgot',
      'mode=forgot must switch mode to forgot'
    );

    // Case 5: Path contains reset-password
    assert.strictEqual(
      computeInitialMode('/outpost/reset-password', ''),
      'forgot',
      'reset-password path must switch mode to forgot'
    );
  });

  test('GET /api/auth/me handles missing email_verified_at column without 500 failure', async () => {
    const user = {
      id: 'usr-test-123',
      email: 'test@example.com',
      name: 'Test User',
      security_question: 'Favorite color?',
      security_answer_hash: 'hash',
      email_verified: 1,
      token_version: 1
    };

    const token = await createToken({ userId: user.id, tv: 1 }, TEST_SECRET);

    // Mock DB without email_verified_at column (throws column error)
    const mockEnv = {
      JWT_SECRET: TEST_SECRET,
      DB: {
        prepare: (query) => ({
          bind: (...args) => ({
            first: async () => {
              if (query.includes('email_verified_at')) {
                throw new Error('D1_ERROR: no such column: email_verified_at at offset 81: SQLITE_ERROR');
              }
              if (query.includes('FROM users WHERE id = ?')) {
                return user;
              }
              if (query.includes('FROM email_verifications')) {
                return null;
              }
              return null;
            }
          })
        })
      }
    };

    const req = new Request('https://techtrekgt.com/outpost/api/auth/me', {
      headers: { Cookie: `auth_token=${token}` }
    });

    const res = await meGet({ request: req, env: mockEnv });
    assert.strictEqual(res.status, 200, 'Must return 200 despite missing column in schema');
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.user.email, 'test@example.com');
    assert.strictEqual(body.user.emailVerified, true);
  });

});
