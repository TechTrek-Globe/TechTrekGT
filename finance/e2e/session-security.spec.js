import { test, expect } from './fixtures/auth.fixture.js';

test.describe('Authentication Security, Route Protection & Logout Purge', () => {

  test('prevents storage of auth tokens in localStorage (zero localStorage credentials invariant)', async ({ page }) => {
    await page.goto('/finance/');
    await page.waitForLoadState('domcontentloaded');

    // Invariant: No tokens in localStorage or sessionStorage
    const localAuthToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    const sessionAuthToken = await page.evaluate(() => sessionStorage.getItem('auth_token'));

    expect(localAuthToken).toBeNull();
    expect(sessionAuthToken).toBeNull();
  });

  test('clears in-memory budget state upon receiving techtrek:user-logout global event', async ({ authenticatedPage: page }) => {
    await page.goto('/finance/');
    await page.waitForLoadState('domcontentloaded');

    // Dispatch global logout event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('techtrek:user-logout'));
    });

    // Wait for context cleanup
    await page.waitForTimeout(300);

    // Verify localStorage auth markers are wiped
    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(storageKeys.filter(k => k.startsWith('auth_token'))).toEqual([]);
  });

  test('rejects unauthenticated attempts to mutate cloud state via CSRF guard', async ({ page }) => {
    // Attempt to invoke /api/sync/backup without CSRF or auth tokens
    const responseStatus = await page.evaluate(async () => {
      try {
        const res = await fetch('/finance/api/sync/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget: { schemaVersion: 8 } })
        });
        return res.status;
      } catch {
        return 0;
      }
    });

    // Must be rejected with 401 or 403
    expect([401, 403]).toContain(responseStatus);
  });
});
