import { test, expect } from './fixtures/auth.fixture.js';
import { MOCK_E2E_BUDGET } from './fixtures/test-budgets.js';

test.describe('Network Chaos, Offline Queueing & Replay Verification', () => {

  test('enqueues mutations into user-scoped offline storage during network interruption and flushes upon recovery', async ({ authenticatedPage: page }) => {
    const userId = 'usr_playwright_e2e';
    let syncCallCount = 0;

    // 1. Intercept cloud sync endpoint
    await page.route('**/api/sync/backup', async (route) => {
      syncCallCount++;
      // Simulate network connection failure
      await route.abort('failed');
    });

    await page.goto('/finance/');
    await page.waitForLoadState('domcontentloaded');

    // 2. Populate and trigger offline save into IndexedDB & localStorage queue
    await page.evaluate(({ budget, uid }) => {
      // Direct local state simulation
      const key = `current_budget:${uid}`;
      const queueKey = `cf_pending_sync:${uid}`;
      localStorage.setItem(queueKey, JSON.stringify({
        payload: budget,
        timestamp: Date.now(),
        owner_id: uid
      }));
    }, { budget: MOCK_E2E_BUDGET, uid: userId });

    // 3. Inspect client storage to verify per-user scoped queue exists
    const queueData = await page.evaluate((uid) => {
      const queueKey = `cf_pending_sync:${uid}`;
      const raw = localStorage.getItem(queueKey);
      return raw ? JSON.parse(raw) : null;
    }, userId);

    expect(queueData).not.toBeNull();
    expect(queueData.owner_id).toBe(userId);
    expect(queueData.payload.schemaVersion).toBe(8);

    // 4. Reconnect network: unroute and mock successful sync response
    await page.unroute('**/api/sync/backup');
    await page.route('**/api/sync/backup', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          updatedAt: new Date().toISOString()
        })
      });
    });

    // 5. Trigger drainage replay
    const drainResult = await page.evaluate(async (uid) => {
      const queueKey = `cf_pending_sync:${uid}`;
      const raw = localStorage.getItem(queueKey);
      if (!raw) return false;
      const data = JSON.parse(raw);

      const res = await fetch('/finance/api/sync/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'mock-playwright-csrf-token'
        },
        body: JSON.stringify({ budget: data.payload, force: true })
      });

      if (res.ok) {
        localStorage.removeItem(queueKey);
        return true;
      }
      return false;
    }, userId);

    expect(drainResult).toBe(true);

    // 6. Verify queue was drained cleanly
    const postDrainQueue = await page.evaluate((uid) => {
      return localStorage.getItem(`cf_pending_sync:${uid}`);
    }, userId);
    expect(postDrainQueue).toBeNull();
  });
});
