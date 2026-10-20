import { test, expect } from './fixtures/auth.fixture.js';

test.describe('Functional Reachability & SPA View States', () => {

  test('loads public landing page when unauthenticated', async ({ page }) => {
    // Navigate without auth cookies
    await page.goto('/finance/');
    await expect(page).toHaveTitle(/Finance|Budget|TechTrek/i);
    // Verify landing view content or login button
    const bodyText = await page.textContent('body');
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('navigates seamlessly across primary views in authenticated state', async ({ authenticatedPage: page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/finance/');
    await page.waitForLoadState('domcontentloaded');

    // Test Navigation to Main Budget
    await page.goto('/finance/main-budget');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/finance/main-budget');

    // Test Navigation to Ledger
    await page.goto('/finance/ledger');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/finance/ledger');

    // Test Navigation to Amortization
    await page.goto('/finance/amortization');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/finance/amortization');

    // Test Navigation to Settings
    await page.goto('/finance/settings');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/finance/settings');

    // Assert zero uncaught console errors
    const fatalErrors = consoleErrors.filter(err => !err.includes('favicon') && !err.includes('404'));
    expect(fatalErrors).toEqual([]);
  });
});
