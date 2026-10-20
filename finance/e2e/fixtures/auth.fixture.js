import { test as base } from '@playwright/test';

/**
 * Custom Playwright test fixture pre-configured with authenticated session cookies.
 */
export const test = base.extend({
  authenticatedPage: async ({ page, context }, use) => {
    // Inject mock auth and CSRF cookies for local dev testing
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'mock-playwright-auth-jwt-token',
        domain: 'localhost',
        path: '/finance'
      },
      {
        name: 'csrf_token',
        value: 'mock-playwright-csrf-token',
        domain: 'localhost',
        path: '/finance'
      },
      {
        name: 'tt_user_id',
        value: 'usr_playwright_e2e',
        domain: 'localhost',
        path: '/finance'
      }
    ]);

    // Mock /api/auth/me response
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: 'usr_playwright_e2e',
            email: 'e2e@example.com',
            name: 'E2E Tester',
            role: 'user',
            token_version: 1,
            status: 'Active'
          }
        })
      });
    });

    await use(page);
  }
});

export { expect } from '@playwright/test';
