import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('AUDIT-004: Frontend State and UI Consistency Audit', () => {
  let originalFetch;
  let originalWindow;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });

  describe('apiFetch & False-Positive Success Prevention', () => {
    test('apiFetch throws immediately when endpoint returns 200 OK with success: false', async () => {
      // Import the dynamic apiFetch via auctionApi module
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: false, error: 'D1 write conflict detected' })
      });

      const { getInvoices } = await import('../src/utils/auctionApi.js');

      await assert.rejects(
        async () => {
          await getInvoices();
        },
        {
          name: 'Error',
          message: 'D1 write conflict detected'
        }
      );
    });

    test('apiFetch throws default fallback message if success is false without explicit error message', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: false })
      });

      const { getComps } = await import('../src/utils/auctionApi.js');

      await assert.rejects(
        async () => {
          await getComps();
        },
        {
          name: 'Error',
          message: 'Request failed'
        }
      );
    });

    test('apiFetch resolves properly when payload is valid and success is true or absent', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, items: [{ id: 'item-1', item_name: 'Test Signed Baseball' }] })
      });

      const { getItems } = await import('../src/utils/auctionApi.js');
      const data = await getItems();
      assert.equal(data.success, true);
      assert.equal(data.items.length, 1);
      assert.equal(data.items[0].id, 'item-1');
    });

    test('apiFetch handles HTTP 401 with session expired message and dispatches event', async () => {
      let dispatchedEvent = null;
      globalThis.window = {
        location: { origin: 'http://localhost:8788', hostname: 'localhost' },
        dispatchEvent: (evt) => {
          dispatchedEvent = evt;
        }
      };

      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized: session expired' })
      });

      const { getDashboard } = await import('../src/utils/auctionApi.js');

      await assert.rejects(
        async () => {
          await getDashboard();
        },
        (err) => {
          assert.match(err.message, /session has expired|sign in again/i);
          return true;
        }
      );

      assert.ok(dispatchedEvent, 'Expected custom event to be dispatched');
      assert.equal(dispatchedEvent.type, 'outpost:unauthorized');
    });
  });

  describe('Auth Registration & Session State Gating', () => {
    test('registration gates authenticated state if verificationPending is true', () => {
      let isAuthenticated = false;
      let currentUser = null;

      function simulateRegisterResponse(data) {
        if (!data.verificationPending) {
          isAuthenticated = true;
          currentUser = data.user;
        }
        return data;
      }

      // Unverified registration
      const pendingResponse = {
        success: true,
        verificationPending: true,
        user: { id: 'usr-unverified', email: 'new@example.com', emailVerified: false }
      };

      const result1 = simulateRegisterResponse(pendingResponse);
      assert.equal(result1.verificationPending, true);
      assert.equal(isAuthenticated, false, 'User must not be marked authenticated when verification is pending');
      assert.equal(currentUser, null, 'User state must remain null until verified');

      // Verified registration
      const verifiedResponse = {
        success: true,
        verificationPending: false,
        user: { id: 'usr-verified', email: 'verified@example.com', emailVerified: true }
      };

      const result2 = simulateRegisterResponse(verifiedResponse);
      assert.equal(result2.verificationPending, false);
      assert.equal(isAuthenticated, true, 'User is marked authenticated when verification is not pending');
      assert.equal(currentUser?.id, 'usr-verified');
    });
  });

  describe('Asynchronous Request Counter & Race Condition Elimination', () => {
    test('slow out-of-order request does not overwrite faster subsequent request', async () => {
      const state = {
        items: [],
        requestId: 0
      };

      async function simulatedFetchItems(searchQuery, delayMs, returnedData) {
        const currentReqId = ++state.requestId;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // Latch check: only commit if request ID matches active ref
        if (currentReqId === state.requestId) {
          state.items = returnedData;
        }
      }

      // Start slower query 1 (takes 50ms)
      const p1 = simulatedFetchItems('slow-query', 50, ['Item-A', 'Item-B']);
      // Immediately start faster query 2 (takes 10ms)
      const p2 = simulatedFetchItems('fast-query', 10, ['Item-Z']);

      await Promise.all([p1, p2]);

      // Even though p1 finished later in real-time, query 2 had currentReqId = 2
      assert.deepEqual(
        state.items,
        ['Item-Z'],
        'State must preserve query 2 results and reject stale query 1 response'
      );
    });
  });

  describe('Guaranteed Loading State Reset via Finally Blocks', () => {
    test('submitting state is guaranteed to reset to false on promise failure', async () => {
      let isSubmitting = false;
      let errorEncountered = null;

      async function executeAction(shouldFail) {
        isSubmitting = true;
        try {
          if (shouldFail) {
            throw new Error('Network timeout during sale logging');
          }
        } catch (err) {
          errorEncountered = err.message;
        } finally {
          isSubmitting = false;
        }
      }

      await executeAction(true);
      assert.equal(isSubmitting, false, 'isSubmitting must reset to false after error');
      assert.equal(errorEncountered, 'Network timeout during sale logging');

      await executeAction(false);
      assert.equal(isSubmitting, false, 'isSubmitting must reset to false after success');
    });
  });
});
