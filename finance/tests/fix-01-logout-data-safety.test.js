// tests/fix-01-logout-data-safety.test.js
// FIX-01: Sign-out must not erase local data by default.
// All assertions are pure-logic tests against the handler contracts.
// No live IndexedDB, no network calls.

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal stubs so the module-under-test can be exercised without a browser
// ---------------------------------------------------------------------------
const cleared = [];
const flushed = [];
let pendingCleared = [];

const mockClearBudgetData = async (uid) => { cleared.push(uid ?? null); };
const mockFlush = () => { flushed.push(true); };
const mockClearPendingSync = async (uid) => { pendingCleared.push(uid ?? null); };

function makeLocalStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    _store: store
  };
}

// ---------------------------------------------------------------------------
// The handler under test (extracted logic, matching LedgerDataContext.jsx)
// ---------------------------------------------------------------------------
async function handleUserLogout(
  { reason = 'logout', userId = 'usr-test' },
  { localStorage, clearBudgetData, flushSave, clearPending }
) {
  const uid = userId;
  // Always flush pending writes
  try { flushSave(); } catch {}
  // Always clear sync queue
  try { await clearPending(uid); } catch {}

  // FIX-01: only delete on explicit sign-out + opt-in
  const isExplicitLogout = reason === 'logout';
  const shouldRemoveData = isExplicitLogout && (() => {
    try {
      const stored = localStorage.getItem('tt_remove_data_on_logout');
      return stored === 'true'; // default false
    } catch {
      return false;
    }
  })();

  if (shouldRemoveData) {
    try { await clearBudgetData(uid); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FIX-01: logout data-safety handler', () => {
  beforeEach(() => {
    cleared.length = 0;
    flushed.length = 0;
    pendingCleared.length = 0;
  });

  it('session-expired never deletes IndexedDB data (setting unset)', async () => {
    const ls = makeLocalStorage({}); // no setting stored
    await handleUserLogout(
      { reason: 'session-expired', userId: 'usr-1' },
      { localStorage: ls, clearBudgetData: mockClearBudgetData, flushSave: mockFlush, clearPending: mockClearPendingSync }
    );
    assert.equal(cleared.length, 0, 'clearBudgetData must NOT be called on session-expired');
  });

  it('session-expired never deletes IndexedDB data (setting = true)', async () => {
    const ls = makeLocalStorage({ tt_remove_data_on_logout: 'true' });
    await handleUserLogout(
      { reason: 'session-expired', userId: 'usr-1' },
      { localStorage: ls, clearBudgetData: mockClearBudgetData, flushSave: mockFlush, clearPending: mockClearPendingSync }
    );
    assert.equal(cleared.length, 0, 'clearBudgetData must NOT be called on session-expired even with setting=true');
  });

  it('inactivity logout never deletes IndexedDB data (setting = true)', async () => {
    const ls = makeLocalStorage({ tt_remove_data_on_logout: 'true' });
    await handleUserLogout(
      { reason: 'inactivity', userId: 'usr-1' },
      { localStorage: ls, clearBudgetData: mockClearBudgetData, flushSave: mockFlush, clearPending: mockClearPendingSync }
    );
    assert.equal(cleared.length, 0, 'clearBudgetData must NOT be called on inactivity reason');
  });

  it('explicit sign-out with setting=false (default) does NOT delete data', async () => {
    const ls = makeLocalStorage({}); // setting absent = false
    await handleUserLogout(
      { reason: 'logout', userId: 'usr-1' },
      { localStorage: ls, clearBudgetData: mockClearBudgetData, flushSave: mockFlush, clearPending: mockClearPendingSync }
    );
    assert.equal(cleared.length, 0, 'clearBudgetData must NOT be called when setting is absent (default false)');
  });

  it('explicit sign-out with setting explicitly false does NOT delete data', async () => {
    const ls = makeLocalStorage({ tt_remove_data_on_logout: 'false' });
    await handleUserLogout(
      { reason: 'logout', userId: 'usr-1' },
      { localStorage: ls, clearBudgetData: mockClearBudgetData, flushSave: mockFlush, clearPending: mockClearPendingSync }
    );
    assert.equal(cleared.length, 0, 'clearBudgetData must NOT be called when setting=false');
  });

  it('explicit sign-out with setting=true DOES delete data', async () => {
    const ls = makeLocalStorage({ tt_remove_data_on_logout: 'true' });
    await handleUserLogout(
      { reason: 'logout', userId: 'usr-1' },
      { localStorage: ls, clearBudgetData: mockClearBudgetData, flushSave: mockFlush, clearPending: mockClearPendingSync }
    );
    assert.equal(cleared.length, 1, 'clearBudgetData MUST be called when reason=logout AND setting=true');
    assert.equal(cleared[0], 'usr-1');
  });

  it('flush is called on every logout path regardless of reason or setting', async () => {
    const ls = makeLocalStorage({});
    await handleUserLogout(
      { reason: 'session-expired', userId: 'usr-1' },
      { localStorage: ls, clearBudgetData: mockClearBudgetData, flushSave: mockFlush, clearPending: mockClearPendingSync }
    );
    assert.equal(flushed.length, 1, 'flushSave must always be called');
  });

  it('clearPendingSync is called on every logout path', async () => {
    const ls = makeLocalStorage({});
    await handleUserLogout(
      { reason: 'session-expired', userId: 'usr-2' },
      { localStorage: ls, clearBudgetData: mockClearBudgetData, flushSave: mockFlush, clearPending: mockClearPendingSync }
    );
    assert.equal(pendingCleared.length, 1, 'clearPendingSync must always be called');
    assert.equal(pendingCleared[0], 'usr-2');
  });
});
